// Key derivation (ADR-0004, ADR-0006).
//
//   salt    = SHA-256("password-vault/salt/v1:" + normalizedEmail)[0..16]
//   master  = Argon2id(masterPassword, salt)
//   authKey = HKDF(master, "password-vault/auth/v1")  -> hex string sent to Supabase Auth
//   encKey  = HKDF(master, "password-vault/enc/v1")   -> AES-KW key, never leaves memory
//
// The raw Master Password is never sent anywhere.
//
// NOTE: the "password-vault/..." strings predate the rename to Kingslock. They
// are part of the key derivation and MUST NOT change, or existing Vaults can no
// longer be unlocked.

import { argon2id } from 'hash-wasm'
import { toHex, utf8 } from './encoding'

export interface KdfParams {
  version: number
  memoryKiB: number
  iterations: number
  parallelism: number
}

export const KDF_PARAMS: Record<number, KdfParams> = {
  1: { version: 1, memoryKiB: 64 * 1024, iterations: 3, parallelism: 1 },
}

export const CURRENT_KDF_VERSION = 1

export interface DerivedKeys {
  /** Hex string used as the Supabase Auth password. */
  authKey: string
  /** AES-KW key used only to wrap/unwrap the Vault Key. Non-extractable. */
  encKey: CryptoKey
}

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase()
}

export async function saltForEmail(email: string): Promise<Uint8Array<ArrayBuffer>> {
  const digest = await crypto.subtle.digest(
    'SHA-256',
    utf8(`password-vault/salt/v1:${normalizeEmail(email)}`),
  )
  return new Uint8Array(digest.slice(0, 16))
}

export async function deriveKeys(
  masterPassword: string,
  salt: Uint8Array<ArrayBuffer>,
  kdfVersion: number = CURRENT_KDF_VERSION,
  paramsOverride?: Partial<KdfParams>,
): Promise<DerivedKeys> {
  const base = KDF_PARAMS[kdfVersion]
  if (!base) throw new Error(`Unsupported KDF version ${kdfVersion}`)
  const params = { ...base, ...paramsOverride }

  const master = (await argon2id({
    password: masterPassword.normalize('NFKC'),
    salt,
    memorySize: params.memoryKiB,
    iterations: params.iterations,
    parallelism: params.parallelism,
    hashLength: 32,
    outputType: 'binary',
  })) as Uint8Array<ArrayBuffer>

  const hkdfKey = await crypto.subtle.importKey('raw', master, 'HKDF', false, [
    'deriveBits',
    'deriveKey',
  ])
  master.fill(0)

  const hkdf = (info: string): HkdfParams => ({
    name: 'HKDF',
    hash: 'SHA-256',
    salt: new Uint8Array(0),
    info: utf8(info),
  })

  const authBits = await crypto.subtle.deriveBits(hkdf('password-vault/auth/v1'), hkdfKey, 256)
  const encKey = await crypto.subtle.deriveKey(
    hkdf('password-vault/enc/v1'),
    hkdfKey,
    { name: 'AES-KW', length: 256 },
    false,
    ['wrapKey', 'unwrapKey'],
  )

  return { authKey: toHex(authBits), encKey }
}

export async function deriveKeysForEmail(
  email: string,
  masterPassword: string,
  kdfVersion: number = CURRENT_KDF_VERSION,
  paramsOverride?: Partial<KdfParams>,
): Promise<DerivedKeys> {
  return deriveKeys(masterPassword, await saltForEmail(email), kdfVersion, paramsOverride)
}
