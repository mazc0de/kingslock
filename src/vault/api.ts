// Data access for the Vault. Every function takes the in-memory Vault Key and
// only ever sends ciphertext to Supabase. Writes go through RPCs (see the SQL
// migration); tables are read-only for the client.

import {
  decryptJson,
  encryptJson,
  saltForEmail,
  toBase64,
} from '@/crypto'
import { toVaultError } from '@/lib/errors'
import { supabase } from '@/lib/supabase'
import type {
  ActivityEntry,
  Credential,
  CredentialSecret,
  CredentialSummary,
  Platform,
  PlatformData,
  VaultData,
  VaultProfile,
} from './types'

async function rpc<T = void>(fn: string, args?: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.rpc(fn, args)
  if (error) throw toVaultError(error)
  return data as T
}

// ---------------------------------------------------------------------------
// Profile & setup
// ---------------------------------------------------------------------------

export async function isVaultInitialized(): Promise<boolean> {
  return rpc<boolean>('vault_initialized')
}

export async function fetchProfile(): Promise<VaultProfile | null> {
  const { data, error } = await supabase
    .from('vault_profile')
    .select('kdf_version, wrapped_vault_key, auto_lock_minutes')
    .maybeSingle()
  if (error) throw toVaultError(error)
  if (!data) return null
  return {
    kdfVersion: data.kdf_version,
    wrappedVaultKey: data.wrapped_vault_key,
    autoLockMinutes: data.auto_lock_minutes,
  }
}

export async function createProfile(wrappedVaultKey: string, kdfVersion: number): Promise<void> {
  await rpc('create_vault_profile', { p_wrapped_vault_key: wrappedVaultKey, p_kdf_version: kdfVersion })
}

export async function updateAutoLock(minutes: 1 | 5 | 15): Promise<void> {
  await rpc('update_vault_settings', { p_auto_lock_minutes: minutes })
}

export async function changeWrappedVaultKey(wrappedVaultKey: string): Promise<void> {
  await rpc('change_wrapped_vault_key', { p_wrapped_vault_key: wrappedVaultKey })
}

export async function logClientEvent(event: 'auth.login' | 'vault.import' | '2fa.add' | '2fa.remove') {
  await rpc('log_client_event', { p_event: event })
}

// ---------------------------------------------------------------------------
// Read
// ---------------------------------------------------------------------------

export async function loadVault(vaultKey: CryptoKey): Promise<VaultData> {
  const [platformsRes, credentialsRes] = await Promise.all([
    supabase.from('platforms').select('id, enc_data, created_at'),
    supabase.from('credentials').select('id, platform_id, enc_summary, created_at, updated_at'),
  ])
  if (platformsRes.error) throw toVaultError(platformsRes.error)
  if (credentialsRes.error) throw toVaultError(credentialsRes.error)

  const platforms = await Promise.all(
    platformsRes.data.map(async (row): Promise<Platform> => ({
      id: row.id,
      createdAt: row.created_at,
      ...(await decryptJson<PlatformData>(vaultKey, 'platforms', row.id, row.enc_data)),
    })),
  )
  const credentials = await Promise.all(
    credentialsRes.data.map(async (row): Promise<Credential> => ({
      id: row.id,
      platformId: row.platform_id,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      ...(await decryptJson<CredentialSummary>(vaultKey, 'credentials', row.id, row.enc_summary)),
    })),
  )

  platforms.sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }))
  credentials.sort((a, b) => a.createdAt.localeCompare(b.createdAt))
  return { platforms, credentials }
}

/** Requires a fresh 2FA verification (Grace Window). Always logged server-side. */
export async function revealSecret(vaultKey: CryptoKey, credentialId: string): Promise<CredentialSecret> {
  const blob = await rpc<string>('reveal_secret', { p_id: credentialId })
  return decryptJson<CredentialSecret>(vaultKey, 'credential_secrets', credentialId, blob)
}

export async function fetchActivity(limit = 200): Promise<ActivityEntry[]> {
  const { data, error } = await supabase
    .from('activity_log')
    .select('id, event, target_id, user_agent, created_at')
    .order('created_at', { ascending: false })
    .limit(limit)
  if (error) throw toVaultError(error)
  return data.map((r) => ({
    id: r.id,
    event: r.event,
    targetId: r.target_id,
    userAgent: r.user_agent,
    createdAt: r.created_at,
  }))
}

// ---------------------------------------------------------------------------
// Write
// ---------------------------------------------------------------------------

export function findPlatformByName(platforms: Platform[], name: string): Platform | undefined {
  const needle = name.trim().toLocaleLowerCase()
  return platforms.find((p) => p.name.trim().toLocaleLowerCase() === needle)
}

/** Returns the id of an existing Platform with this name (case-insensitive) or creates one. */
export async function resolvePlatform(
  vaultKey: CryptoKey,
  platforms: Platform[],
  name: string,
): Promise<string> {
  const existing = findPlatformByName(platforms, name)
  if (existing) return existing.id
  const id = crypto.randomUUID()
  const data: PlatformData = { name: name.trim() }
  await rpc('create_platform', { p_id: id, p_enc_data: await encryptJson(vaultKey, 'platforms', id, data) })
  return id
}

export async function createCredential(
  vaultKey: CryptoKey,
  platformId: string,
  summary: CredentialSummary,
  secret: CredentialSecret,
): Promise<string> {
  const id = crypto.randomUUID()
  await rpc('create_credential', {
    p_id: id,
    p_platform_id: platformId,
    p_enc_summary: await encryptJson(vaultKey, 'credentials', id, summary),
    p_enc_secret: await encryptJson(vaultKey, 'credential_secrets', id, secret),
  })
  return id
}

/** Requires a fresh 2FA verification. */
export async function updateCredential(
  vaultKey: CryptoKey,
  credentialId: string,
  platformId: string,
  summary: CredentialSummary,
  secret: CredentialSecret,
): Promise<void> {
  await rpc('update_credential', {
    p_id: credentialId,
    p_platform_id: platformId,
    p_enc_summary: await encryptJson(vaultKey, 'credentials', credentialId, summary),
    p_enc_secret: await encryptJson(vaultKey, 'credential_secrets', credentialId, secret),
  })
}

/** Requires a fresh 2FA verification. */
export async function deleteCredential(credentialId: string): Promise<void> {
  await rpc('delete_credential', { p_id: credentialId })
}

/** Requires a fresh 2FA verification. Fails with PLATFORM_NOT_EMPTY if it still has Credentials. */
export async function deletePlatform(platformId: string): Promise<void> {
  await rpc('delete_platform', { p_id: platformId })
}

// ---------------------------------------------------------------------------
// Export / import (Export Vault)
// ---------------------------------------------------------------------------

// Pre-rename identifier kept on purpose: changing it rejects existing export files.
export const EXPORT_FORMAT = 'password-vault-export'

export interface VaultExportFile {
  format: typeof EXPORT_FORMAT
  format_version: 1
  exported_at: string
  salt: string
  kdf_version: number
  wrapped_vault_key: string
  platforms: { id: string; enc_data: string; created_at: string }[]
  credentials: {
    id: string
    platform_id: string
    enc_summary: string
    enc_secret: string
    created_at: string
  }[]
}

/** Requires a fresh 2FA verification. The file stays fully encrypted. */
export async function exportVault(email: string): Promise<VaultExportFile> {
  const data = await rpc<Omit<VaultExportFile, 'format' | 'format_version' | 'exported_at' | 'salt'>>(
    'export_vault',
  )
  return {
    format: EXPORT_FORMAT,
    format_version: 1,
    exported_at: new Date().toISOString(),
    salt: toBase64(await saltForEmail(email)),
    ...data,
  }
}

export function parseExportFile(text: string): VaultExportFile {
  const parsed = JSON.parse(text) as Partial<VaultExportFile>
  if (
    parsed.format !== EXPORT_FORMAT ||
    parsed.format_version !== 1 ||
    typeof parsed.salt !== 'string' ||
    typeof parsed.wrapped_vault_key !== 'string' ||
    !Array.isArray(parsed.platforms) ||
    !Array.isArray(parsed.credentials)
  ) {
    throw new Error('This is not a valid Kingslock export file.')
  }
  return parsed as VaultExportFile
}

/**
 * Imports an export file that has already been unlocked (fileVaultKey).
 * Everything is decrypted with the file's key and re-encrypted with the
 * current Vault Key under new ids. Platforms are merged by name.
 */
export async function importVault(
  vaultKey: CryptoKey,
  fileVaultKey: CryptoKey,
  file: VaultExportFile,
  current: VaultData,
): Promise<{ platforms: number; credentials: number }> {
  const platforms = [...current.platforms]
  const platformIdMap = new Map<string, string>()
  let createdPlatforms = 0

  for (const p of file.platforms) {
    const data = await decryptJson<PlatformData>(fileVaultKey, 'platforms', p.id, p.enc_data)
    const before = platforms.length
    const id = await resolvePlatform(vaultKey, platforms, data.name)
    if (!platforms.some((x) => x.id === id)) {
      platforms.push({ id, createdAt: new Date().toISOString(), ...data })
    }
    if (platforms.length > before) createdPlatforms++
    platformIdMap.set(p.id, id)
  }

  let createdCredentials = 0
  for (const c of file.credentials) {
    const platformId = platformIdMap.get(c.platform_id)
    if (!platformId) continue
    const summary = await decryptJson<CredentialSummary>(fileVaultKey, 'credentials', c.id, c.enc_summary)
    const secret = await decryptJson<CredentialSecret>(fileVaultKey, 'credential_secrets', c.id, c.enc_secret)
    await createCredential(vaultKey, platformId, summary, secret)
    createdCredentials++
  }

  await logClientEvent('vault.import')
  return { platforms: createdPlatforms, credentials: createdCredentials }
}
