// Attack commands for the landing page terminal.
//
// The sessions are simulated, but the cryptography is not: ciphertext is
// produced by the app's own encryptJson() with a throwaway key generated in
// the visitor's browser, and the row-swap check is a real AES-GCM failure.
// Error codes and parameters mirror supabase/migrations and src/crypto.

import { DecryptionError, decryptJson, encryptJson } from '@/crypto'

export type Tone = 'cmd' | 'out' | 'dim' | 'ok' | 'err' | 'warn'

export interface Line {
  tone: Tone
  text: string
  /** Keep spacing exactly (tables); otherwise the line wraps. */
  pre?: boolean
  prompt?: string
}

export interface Command {
  name: string
  label: string
  prompt: string
  shell: string
  run(): Promise<Line[]>
}

let keyPromise: Promise<CryptoKey> | undefined
const demoKey = () =>
  (keyPromise ??= crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, false, [
    'encrypt',
    'decrypt',
  ]))

const clip = (text: string, max: number) => (text.length > max ? `${text.slice(0, max - 1)}…` : text)
const shortId = (id: string) => `${id.slice(0, 8)}…`

// Demonstration plaintexts. They are encrypted immediately and never printed.
const SAMPLE_SECRETS = [
  { password: 'correct-horse-battery-staple' },
  { password: 'Tq9#vL2!mZ8@rW4$', notes: 'recovery email is the work one' },
  { password: 'sunrise-over-merapi-1987', previousPassword: 'sunrise-over-merapi' },
]

const dump: Command = {
  name: 'dump',
  label: 'Dump the leaked database',
  prompt: '$',
  shell: 'psql "$LEAKED_BACKUP" -c "select credential_id, enc_secret from credential_secrets"',
  async run() {
    const key = await demoKey()
    const rows = await Promise.all(
      SAMPLE_SECRETS.map(async (secret) => {
        const id = crypto.randomUUID()
        return { id, blob: await encryptJson(key, 'credential_secrets', id, secret) }
      }),
    )
    return [
      { tone: 'out', pre: true, text: ' credential_id | enc_secret' },
      { tone: 'out', pre: true, text: '---------------+----------------------------------------' },
      ...rows.map<Line>((r) => ({
        tone: 'out',
        pre: true,
        text: ` ${shortId(r.id).padEnd(13)} | ${clip(r.blob, 40)}`,
      })),
      { tone: 'dim', text: '(3 rows)' },
      { tone: 'ok', text: 'Every row is AES-GCM 256 ciphertext with its own random IV.' },
      {
        tone: 'dim',
        text: "The Vault Key that opens it exists only in the Owner's browser memory. The backup never held it.",
      },
    ]
  },
}

const api: Command = {
  name: 'api',
  label: 'Read secrets through the API',
  prompt: '$',
  shell: 'curl "$SUPABASE_URL/rest/v1/credential_secrets?select=*" -H "Authorization: Bearer $STOLEN_JWT"',
  async run() {
    return [
      {
        tone: 'err',
        text: '{"code":"42501","message":"permission denied for table credential_secrets"}',
      },
      { tone: 'ok', text: 'No SELECT grant and no RLS policy on that table, for anyone.' },
      {
        tone: 'dim',
        text: 'A password leaves the database only through reveal_secret(), and every call is written to the Activity Log.',
      },
    ]
  },
}

const reveal: Command = {
  name: 'reveal',
  label: 'Reveal with a hijacked session',
  prompt: '>',
  shell: "await supabase.rpc('reveal_secret', { p_id: '7c1e4a2b-…' })",
  async run() {
    return [
      { tone: 'err', text: 'error: STEP_UP_REQUIRED (P0001)' },
      {
        tone: 'dim',
        text: 'The session is aal2, but no 2FA code was verified in the last 120 seconds.',
      },
      {
        tone: 'ok',
        text: 'The check runs inside Postgres, so patching React in DevTools changes nothing.',
      },
    ]
  },
}

const swap: Command = {
  name: 'swap',
  label: 'Swap ciphertext between rows',
  prompt: '>',
  shell: "await decryptJson(vaultKey, 'credential_secrets', rowB, ciphertextFromRowA)",
  async run() {
    const key = await demoKey()
    const rowA = crypto.randomUUID()
    const rowB = crypto.randomUUID()
    const blob = await encryptJson(key, 'credential_secrets', rowA, SAMPLE_SECRETS[0])
    const lines: Line[] = [
      { tone: 'dim', pre: true, text: `ciphertext  ${clip(blob, 40)}` },
      { tone: 'dim', pre: true, text: `aad         credential_secrets:${shortId(rowB)}:v1` },
    ]
    try {
      await decryptJson(key, 'credential_secrets', rowB, blob)
      lines.push({ tone: 'warn', text: 'Unexpected: decryption succeeded.' })
    } catch (error) {
      const message = error instanceof DecryptionError ? error.message : 'Decryption failed.'
      lines.push({ tone: 'err', text: `DecryptionError: ${message}` })
    }
    await decryptJson(key, 'credential_secrets', rowA, blob)
    lines.push(
      { tone: 'ok', text: "The same ciphertext still opens under row A's id." },
      {
        tone: 'dim',
        text: 'AES-GCM binds each ciphertext to its table and row, so moved data fails to decrypt. That check just ran in your browser.',
      },
    )
    return lines
  },
}

const crack: Command = {
  name: 'crack',
  label: 'Guess the Master Password offline',
  prompt: '$',
  shell: './guess --email owner@example.com --wordlist rockyou.txt',
  async run() {
    return [
      { tone: 'dim', pre: true, text: "salt   sha256('…/salt/v1:' + email)[0..16]" },
      { tone: 'dim', pre: true, text: 'kdf    argon2id  m=65536 KiB  t=3  p=1' },
      { tone: 'dim', pre: true, text: 'then   hkdf-sha256 → authKey → Supabase Auth hash' },
      { tone: 'ok', text: 'Every single guess costs a 64 MiB Argon2id run.' },
      {
        tone: 'warn',
        text: 'Setup refuses Master Passwords under 14 characters or below a zxcvbn score of 3, so the wordlist runs dry first.',
      },
    ]
  },
}

export const COMMANDS: Command[] = [dump, api, reveal, swap, crack]

export const HELP_LINES: Line[] = [
  { tone: 'dim', text: 'Available attacks:' },
  ...COMMANDS.map<Line>((c) => ({ tone: 'out', pre: true, text: `  ${c.name.padEnd(8)}${c.label}` })),
  { tone: 'out', pre: true, text: `  ${'clear'.padEnd(8)}Clear the screen` },
]
