// Authenticated encryption of Vault content.
//
//   blob = base64( 0x01 || iv(12) || AES-GCM(ciphertext + tag) )
//   AAD  = "<table>:<row id>:v1"
//
// The AAD binds each ciphertext to its row, so swapping ciphertexts between
// rows (by someone with database write access) makes decryption fail.

import { fromBase64, fromUtf8, toBase64, utf8 } from './encoding'

const FORMAT_VERSION = 0x01
const IV_LENGTH = 12

export type CipherTable = 'platforms' | 'credentials' | 'credential_secrets'

export class DecryptionError extends Error {
  constructor() {
    super('Data could not be decrypted. It may be corrupted or tampered with.')
    this.name = 'DecryptionError'
  }
}

export function aadFor(table: CipherTable, rowId: string): Uint8Array<ArrayBuffer> {
  return utf8(`${table}:${rowId}:v1`)
}

export async function encryptJson(
  vaultKey: CryptoKey,
  table: CipherTable,
  rowId: string,
  value: unknown,
): Promise<string> {
  const iv = crypto.getRandomValues(new Uint8Array(IV_LENGTH))
  const ciphertext = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv, additionalData: aadFor(table, rowId) },
    vaultKey,
    utf8(JSON.stringify(value)),
  )
  const out = new Uint8Array(1 + IV_LENGTH + ciphertext.byteLength)
  out[0] = FORMAT_VERSION
  out.set(iv, 1)
  out.set(new Uint8Array(ciphertext), 1 + IV_LENGTH)
  return toBase64(out)
}

export async function decryptJson<T>(
  vaultKey: CryptoKey,
  table: CipherTable,
  rowId: string,
  blob: string,
): Promise<T> {
  try {
    const bytes = fromBase64(blob)
    if (bytes[0] !== FORMAT_VERSION || bytes.length < 1 + IV_LENGTH + 16) throw new Error()
    const iv = bytes.slice(1, 1 + IV_LENGTH)
    const plaintext = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv, additionalData: aadFor(table, rowId) },
      vaultKey,
      bytes.slice(1 + IV_LENGTH),
    )
    return JSON.parse(fromUtf8(plaintext)) as T
  } catch {
    throw new DecryptionError()
  }
}
