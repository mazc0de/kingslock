import { describe, expect, it } from 'vitest'
import {
  DecryptionError,
  WrongMasterPasswordError,
  createWrappedVaultKey,
  decryptJson,
  deriveKeysForEmail,
  encryptJson,
  fromBase64,
  generatePassword,
  normalizeEmail,
  saltForEmail,
  toBase64,
  unwrapVaultKey,
  wrapVaultKey,
} from './index'

// Cheap Argon2 params keep the suite fast; production params are covered by one test.
const FAST = { memoryKiB: 1024, iterations: 1 }

describe('kdf', () => {
  it('normalizes email before deriving the salt', async () => {
    expect(normalizeEmail('  Daffa@Example.COM ')).toBe('daffa@example.com')
    expect(await saltForEmail('Daffa@Example.com ')).toEqual(await saltForEmail('daffa@example.com'))
    expect((await saltForEmail('a@b.c')).length).toBe(16)
  })

  it('is deterministic and separates authKey from encKey', async () => {
    const a = await deriveKeysForEmail('o@x.io', 'correct horse battery', 1, FAST)
    const b = await deriveKeysForEmail('o@x.io', 'correct horse battery', 1, FAST)
    expect(a.authKey).toBe(b.authKey)
    expect(a.authKey).toMatch(/^[0-9a-f]{64}$/)
    expect(a.authKey).not.toContain('correct')
    expect(a.encKey.extractable).toBe(false)
  })

  it('produces different keys for different passwords and emails', async () => {
    const a = await deriveKeysForEmail('o@x.io', 'password-one-long', 1, FAST)
    const b = await deriveKeysForEmail('o@x.io', 'password-two-long', 1, FAST)
    const c = await deriveKeysForEmail('p@x.io', 'password-one-long', 1, FAST)
    expect(a.authKey).not.toBe(b.authKey)
    expect(a.authKey).not.toBe(c.authKey)
  })

  it('runs with production parameters', async () => {
    const keys = await deriveKeysForEmail('o@x.io', 'kopi-hujan-sepeda-merah-42')
    expect(keys.authKey).toHaveLength(64)
  }, 30_000)
})

describe('vault key wrapping', () => {
  it('round-trips and rejects a wrong Master Password', async () => {
    const right = await deriveKeysForEmail('o@x.io', 'right-password-123', 1, FAST)
    const wrong = await deriveKeysForEmail('o@x.io', 'wrong-password-123', 1, FAST)
    const wrapped = await createWrappedVaultKey(right.encKey)

    const vaultKey = await unwrapVaultKey(wrapped, right.encKey)
    expect(vaultKey.extractable).toBe(false)
    await expect(unwrapVaultKey(wrapped, wrong.encKey)).rejects.toBeInstanceOf(
      WrongMasterPasswordError,
    )
  })

  it('re-wraps the same Vault Key under a new Master Password', async () => {
    const oldKeys = await deriveKeysForEmail('o@x.io', 'old-password-123', 1, FAST)
    const newKeys = await deriveKeysForEmail('o@x.io', 'new-password-456', 1, FAST)
    const wrapped = await createWrappedVaultKey(oldKeys.encKey)
    const oldVault = await unwrapVaultKey(wrapped, oldKeys.encKey)
    const blob = await encryptJson(oldVault, 'credentials', 'row-1', { login: 'me' })

    const extractable = await unwrapVaultKey(wrapped, oldKeys.encKey, true)
    const rewrapped = await wrapVaultKey(extractable, newKeys.encKey)
    const newVault = await unwrapVaultKey(rewrapped, newKeys.encKey)

    expect(await decryptJson(newVault, 'credentials', 'row-1', blob)).toEqual({ login: 'me' })
    await expect(unwrapVaultKey(rewrapped, oldKeys.encKey)).rejects.toThrow()
  })
})

describe('cipher', () => {
  async function vaultKey() {
    const keys = await deriveKeysForEmail('o@x.io', 'some-password-123', 1, FAST)
    return unwrapVaultKey(await createWrappedVaultKey(keys.encKey), keys.encKey)
  }

  it('round-trips JSON and uses a fresh IV every time', async () => {
    const key = await vaultKey()
    const value = { password: 'p@ss', notes: 'ünïcödé 🔐' }
    const a = await encryptJson(key, 'credential_secrets', 'id-1', value)
    const b = await encryptJson(key, 'credential_secrets', 'id-1', value)
    expect(a).not.toBe(b)
    expect(await decryptJson(key, 'credential_secrets', 'id-1', a)).toEqual(value)
  })

  it('fails when the ciphertext is moved to another row or table', async () => {
    const key = await vaultKey()
    const blob = await encryptJson(key, 'credential_secrets', 'id-1', { password: 'x' })
    await expect(decryptJson(key, 'credential_secrets', 'id-2', blob)).rejects.toBeInstanceOf(
      DecryptionError,
    )
    await expect(decryptJson(key, 'credentials', 'id-1', blob)).rejects.toBeInstanceOf(
      DecryptionError,
    )
  })

  it('fails when a single byte is changed', async () => {
    const key = await vaultKey()
    const bytes = fromBase64(await encryptJson(key, 'platforms', 'p', { name: 'Instagram' }))
    bytes[bytes.length - 1] ^= 0x01
    await expect(decryptJson(key, 'platforms', 'p', toBase64(bytes))).rejects.toBeInstanceOf(
      DecryptionError,
    )
  })

  it('fails with a different Vault Key', async () => {
    const blob = await encryptJson(await vaultKey(), 'platforms', 'p', { name: 'x' })
    await expect(decryptJson(await vaultKey(), 'platforms', 'p', blob)).rejects.toBeInstanceOf(
      DecryptionError,
    )
  })
})

describe('generator', () => {
  it('honours length and character sets', () => {
    const pw = generatePassword({ length: 32, lowercase: true, uppercase: true, digits: true, symbols: true })
    expect(pw).toHaveLength(32)
    expect(pw).toMatch(/[a-z]/)
    expect(pw).toMatch(/[A-Z]/)
    expect(pw).toMatch(/[0-9]/)
    expect(pw).toMatch(/[^a-zA-Z0-9]/)
    expect(generatePassword({ length: 50, lowercase: false, uppercase: false, digits: true, symbols: false })).toMatch(/^[0-9]{50}$/)
  })

  it('rejects an empty character set and does not repeat', () => {
    expect(() => generatePassword({ length: 10, lowercase: false, uppercase: false, digits: false, symbols: false })).toThrow()
    const seen = new Set(Array.from({ length: 200 }, () => generatePassword()))
    expect(seen.size).toBe(200)
  })
})
