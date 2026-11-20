// Vault Key + key wrapping (ADR-0004 "Key wrapping").
// The Vault Key encrypts all Vault content; encKey only wraps/unwraps it.

import { fromBase64, toBase64 } from './encoding'

const VAULT_KEY_ALG: AesKeyGenParams = { name: 'AES-GCM', length: 256 }

export class WrongMasterPasswordError extends Error {
  constructor() {
    super('Master Password is incorrect.')
    this.name = 'WrongMasterPasswordError'
  }
}

/** Creates a new random Vault Key and returns it already wrapped by encKey. */
export async function createWrappedVaultKey(encKey: CryptoKey): Promise<string> {
  const vaultKey = await crypto.subtle.generateKey(VAULT_KEY_ALG, true, ['encrypt', 'decrypt'])
  return wrapVaultKey(vaultKey, encKey)
}

export async function wrapVaultKey(vaultKey: CryptoKey, encKey: CryptoKey): Promise<string> {
  const wrapped = await crypto.subtle.wrapKey('raw', vaultKey, encKey, 'AES-KW')
  return toBase64(wrapped)
}

/**
 * Unwraps the Vault Key. Use extractable=false for normal sessions; only the
 * Master Password change flow needs an extractable key (to re-wrap it).
 * AES-KW has built-in integrity, so a wrong Master Password throws.
 */
export async function unwrapVaultKey(
  wrappedVaultKey: string,
  encKey: CryptoKey,
  extractable = false,
): Promise<CryptoKey> {
  try {
    return await crypto.subtle.unwrapKey(
      'raw',
      fromBase64(wrappedVaultKey),
      encKey,
      'AES-KW',
      VAULT_KEY_ALG,
      extractable,
      ['encrypt', 'decrypt'],
    )
  } catch {
    throw new WrongMasterPasswordError()
  }
}
