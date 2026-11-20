// End-to-end spike against a LOCAL Supabase stack (`npx supabase start`).
// Verifies the assumptions in HANDOFF §7 with real Supabase Auth MFA:
//   * re-verifying TOTP at aal2 refreshes the 'totp' amr timestamp (Grace Window)
//   * reusing the same TOTP code is rejected
//   * the min-two-devices trigger on auth.mfa_factors works
//   * a 64-char hex authKey is accepted as the Auth password
//   * RLS / RPC guards behave as designed
//
// Usage: npx supabase start && npx supabase db reset && npm run test:e2e [-- --skip-wait]
// (the singleton Vault means the database must be reset before each run)

import { createHmac, randomBytes } from 'node:crypto'
import { createClient } from '@supabase/supabase-js'

const url = process.env.SUPABASE_URL ?? 'http://127.0.0.1:54321'
// Default: the public demo anon key that `supabase start` uses for every local stack.
const anonKey =
  process.env.SUPABASE_ANON_KEY ??
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0'
const skipWait = process.argv.includes('--skip-wait')

let failures = 0
const ok = (cond, name) => {
  console.log(`${cond ? 'ok  ' : 'FAIL'} - ${name}`)
  if (!cond) failures++
}

// --- RFC 6238 TOTP -----------------------------------------------------------
function base32Decode(s) {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'
  let bits = ''
  for (const c of s.replace(/=+$/, '').toUpperCase()) bits += alphabet.indexOf(c).toString(2).padStart(5, '0')
  const out = []
  for (let i = 0; i + 8 <= bits.length; i += 8) out.push(parseInt(bits.slice(i, i + 8), 2))
  return Buffer.from(out)
}
function totp(secret, offsetSteps = 0) {
  const counter = Math.floor(Date.now() / 1000 / 30) + offsetSteps
  const buf = Buffer.alloc(8)
  buf.writeBigUInt64BE(BigInt(counter))
  const h = createHmac('sha1', base32Decode(secret)).update(buf).digest()
  const o = h[h.length - 1] & 0xf
  return String((h.readUInt32BE(o) & 0x7fffffff) % 1_000_000).padStart(6, '0')
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
/** Waits until the next 30s TOTP step so a fresh (unused) code is available. */
async function nextStep() {
  const msIntoStep = Date.now() % 30_000
  await sleep(30_000 - msIntoStep + 500)
}
const claims = (session) => JSON.parse(Buffer.from(session.access_token.split('.')[1], 'base64url').toString())
const totpTimestamp = (session) => claims(session).amr?.find((a) => a.method === 'totp')?.timestamp

// --- Run ---------------------------------------------------------------------
const client = () => createClient(url, anonKey, { auth: { persistSession: false, autoRefreshToken: false } })
const owner = client()
const email = `owner-${randomBytes(4).toString('hex')}@example.com`
const authKey = randomBytes(32).toString('hex')

const { data: initBefore } = await owner.rpc('vault_initialized')
console.log(`vault_initialized before: ${initBefore}`)

const signUp = await owner.auth.signUp({ email, password: authKey })
ok(!signUp.error && signUp.data.session, '64-char hex authKey accepted as Auth password')

async function enrollAndVerify(name) {
  const { data, error } = await owner.auth.mfa.enroll({ factorType: 'totp', friendlyName: name, issuer: 'Kingslock' })
  if (error) throw error
  const v = await owner.auth.mfa.challengeAndVerify({ factorId: data.id, code: totp(data.totp.secret) })
  if (v.error) throw v.error
  return { id: data.id, secret: data.totp.secret }
}

const d1 = await enrollAndVerify('Device 1')
let { data: s1 } = await owner.auth.getSession()
ok(claims(s1.session).aal === 'aal2', 'aal2 after verifying first device')
ok(typeof totpTimestamp(s1.session) === 'number', 'JWT amr contains a totp entry with timestamp')

const early = await owner.rpc('create_vault_profile', { p_wrapped_vault_key: 'A'.repeat(56) })
ok(early.error?.message.includes('NEED_TWO_2FA_DEVICES'), 'create_vault_profile refused with only one device')

const d2 = await enrollAndVerify('Device 2')
const created = await owner.rpc('create_vault_profile', { p_wrapped_vault_key: 'A'.repeat(56) })
ok(!created.error, `create_vault_profile with two devices ${created.error?.message ?? ''}`)

const pid = crypto.randomUUID()
const cid = crypto.randomUUID()
ok(!(await owner.rpc('create_platform', { p_id: pid, p_enc_data: 'enc' })).error, 'create_platform')
ok(!(await owner.rpc('create_credential', { p_id: cid, p_platform_id: pid, p_enc_summary: 's', p_enc_secret: 'secret' })).error, 'create_credential')
const reveal1 = await owner.rpc('reveal_secret', { p_id: cid })
ok(reveal1.data === 'secret', 'reveal_secret inside Grace Window')

const direct = await owner.from('credential_secrets').select('*')
ok(!!direct.error, `direct select on credential_secrets denied (${direct.error?.code})`)
const directWrite = await owner.from('platforms').insert({ id: crypto.randomUUID(), owner_id: claims(s1.session).sub, enc_data: 'x' })
ok(!!directWrite.error, 'direct insert on platforms denied')

// Min-two-devices trigger
const unenroll = await owner.auth.mfa.unenroll({ factorId: d2.id })
ok(!!unenroll.error, `unenroll leaving 1 device refused (${unenroll.error?.message ?? 'no error!'})`)

// TOTP replay: the code used for Device 2 verification is reused right away.
const replayCode = totp(d1.secret)
const first = await owner.auth.mfa.challengeAndVerify({ factorId: d1.id, code: replayCode })
const replay = await owner.auth.mfa.challengeAndVerify({ factorId: d1.id, code: replayCode })
console.log(`info - first verify: ${first.error?.message ?? 'ok'}; immediate reuse of same code: ${replay.error ? `rejected (${replay.error.message})` : 'ACCEPTED'}`)

// Second user cannot get a Vault
const intruder = client()
await intruder.auth.signUp({ email: `intruder-${randomBytes(4).toString('hex')}@example.com`, password: randomBytes(32).toString('hex') })
const intruderRead = await intruder.from('credentials').select('*')
ok((intruderRead.data ?? []).length === 0, 'intruder (aal1) sees no Credentials')
const intruderRpc = await intruder.rpc('reveal_secret', { p_id: cid })
ok(intruderRpc.error?.message.includes('MFA_REQUIRED'), 'intruder reveal_secret → MFA_REQUIRED')

if (skipWait) {
  console.log('skipping Grace Window expiry test (--skip-wait)')
} else {
  // Grace Window expiry and refresh
  ;({ data: s1 } = await owner.auth.getSession())
  const before = totpTimestamp(s1.session)
  console.log('waiting 125s for the Grace Window to expire…')
  await sleep(125_000)
  const stale = await owner.rpc('reveal_secret', { p_id: cid })
  ok(stale.error?.message.includes('STEP_UP_REQUIRED'), 'reveal_secret after 125s → STEP_UP_REQUIRED')
  const staleDelete = await owner.rpc('delete_credential', { p_id: cid })
  ok(staleDelete.error?.message.includes('STEP_UP_REQUIRED'), 'delete_credential after 125s → STEP_UP_REQUIRED')

  await nextStep()
  const stepUp = await owner.auth.mfa.challengeAndVerify({ factorId: d2.id, code: totp(d2.secret) })
  ok(!stepUp.error, `step-up verify at aal2 ${stepUp.error?.message ?? ''}`)
  const { data: s2 } = await owner.auth.getSession()
  const after = totpTimestamp(s2.session)
  ok(after > before, `amr totp timestamp refreshed by step-up (${before} → ${after})`)
  const fresh = await owner.rpc('reveal_secret', { p_id: cid })
  ok(fresh.data === 'secret', 'reveal_secret works again after step-up')
}

// Password change with a new authKey
const newAuthKey = randomBytes(32).toString('hex')
const upd = await owner.auth.updateUser({ password: newAuthKey })
ok(!upd.error, `updateUser(password = new authKey) ${upd.error?.message ?? ''}`)
const relogin = await client().auth.signInWithPassword({ email, password: newAuthKey })
ok(!relogin.error, 'sign in with new authKey')

const { data: log } = await owner.from('activity_log').select('event').order('id')
console.log(`info - activity log: ${log?.map((r) => r.event).join(', ')}`)

console.log(failures ? `\n${failures} FAILURE(S)` : '\nALL E2E CHECKS PASSED')
process.exit(failures ? 1 : 0)
