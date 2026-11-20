// Decrypted, in-memory shapes. These never leave the browser memory.

export interface PlatformData {
  name: string
  url?: string
}

export interface CredentialSummary {
  login: string
}

export interface CredentialSecret {
  password: string
  notes?: string
  previousPassword?: string
}

export interface Platform extends PlatformData {
  id: string
  createdAt: string
}

export interface Credential extends CredentialSummary {
  id: string
  platformId: string
  createdAt: string
  updatedAt: string
}

export interface VaultProfile {
  kdfVersion: number
  wrappedVaultKey: string
  autoLockMinutes: 1 | 5 | 15
}

export interface VaultData {
  platforms: Platform[]
  credentials: Credential[]
}

export interface ActivityEntry {
  id: number
  event: string
  targetId: string | null
  userAgent: string | null
  createdAt: string
}
