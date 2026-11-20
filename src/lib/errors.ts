// Maps database / auth errors to stable codes and safe, user-facing messages.
// Never include plaintext Vault content in an error.

import { DecryptionError, WrongMasterPasswordError } from '@/crypto'

export type VaultErrorCode =
  | 'NOT_AUTHENTICATED'
  | 'MFA_REQUIRED'
  | 'NO_VAULT'
  | 'STEP_UP_REQUIRED'
  | 'NEED_TWO_2FA_DEVICES'
  | 'VAULT_EXISTS'
  | 'PLATFORM_NOT_EMPTY'
  | 'NOT_FOUND'
  | 'MIN_TWO_2FA_DEVICES'
  | 'INVALID_EVENT'

const MESSAGES: Record<VaultErrorCode, string> = {
  NOT_AUTHENTICATED: 'Your session has ended. Please sign in again.',
  MFA_REQUIRED: '2FA verification is required.',
  NO_VAULT: 'No Vault exists for this account.',
  STEP_UP_REQUIRED: 'Please confirm with a 2FA code.',
  NEED_TWO_2FA_DEVICES: 'Register two 2FA devices before creating the Vault.',
  VAULT_EXISTS: 'A Vault already exists. This app supports a single Owner.',
  PLATFORM_NOT_EMPTY: 'This Platform still has Credentials. Delete or move them first.',
  NOT_FOUND: 'Item not found.',
  MIN_TWO_2FA_DEVICES: 'You must keep at least two 2FA devices.',
  INVALID_EVENT: 'Invalid event.',
}

export class VaultError extends Error {
  readonly code: VaultErrorCode
  constructor(code: VaultErrorCode) {
    super(MESSAGES[code])
    this.code = code
    this.name = 'VaultError'
  }
}

/** Converts a Supabase error object (PostgREST or Auth) into a VaultError when recognised. */
export function toVaultError(error: { message?: string } | null | undefined): Error {
  const message = error?.message ?? 'Unknown error'
  const code = (Object.keys(MESSAGES) as VaultErrorCode[]).find((c) => message.includes(c))
  return code ? new VaultError(code) : new Error(message)
}

export function isStepUpRequired(error: unknown): boolean {
  return error instanceof VaultError && error.code === 'STEP_UP_REQUIRED'
}

export function errorMessage(error: unknown): string {
  if (error instanceof VaultError) return error.message
  if (error instanceof WrongMasterPasswordError) return error.message
  if (error instanceof DecryptionError) return error.message
  if (error instanceof Error) return error.message
  return 'Something went wrong.'
}
