// Session state machine.
//
//   boot → signed-out → (password ok) → enroll-2fa | verify-2fa → unlocked
//                                                     ↑                │
//                                     lock / idle / refresh / sign-out ┘
//
// The Vault Key and the Master Password-derived encKey live only in refs in
// this component. Locking always means a full sign-out (GLOSSARY "Terkunci").

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import {
  CURRENT_KDF_VERSION,
  createWrappedVaultKey,
  deriveKeysForEmail,
  normalizeEmail,
  unwrapVaultKey,
} from '@/crypto'
import { supabase } from '@/lib/supabase'
import * as api from '@/vault/api'
import type { VaultData, VaultProfile } from '@/vault/types'

export interface TotpDevice {
  id: string
  friendlyName: string
  createdAt: string
}

export type Phase =
  | { kind: 'boot' }
  | { kind: 'signed-out'; initialized: boolean; notice?: string }
  | { kind: 'verify-2fa'; devices: TotpDevice[] }
  | { kind: 'enroll-2fa'; step: 1 | 2 }
  | { kind: 'unlocked' }

export interface Enrollment {
  factorId: string
  qrCode: string
  secret: string
}

/** Client-side estimate of the Grace Window; the database is the authority (120s). */
const GRACE_WINDOW_MS = 100_000

interface SessionContextValue {
  phase: Phase
  email: string | null
  profile: VaultProfile | null
  vault: VaultData
  devices: TotpDevice[]
  signIn(email: string, masterPassword: string): Promise<void>
  signUp(email: string, masterPassword: string): Promise<'confirm-email' | 'signed-in'>
  verifyLogin(factorId: string, code: string): Promise<void>
  beginEnrollment(): Promise<Enrollment>
  completeEnrollment(factorId: string, code: string): Promise<void>
  cancelEnrollment(factorId: string): Promise<void>
  stepUp(factorId: string, code: string): Promise<void>
  isStepUpFresh(): boolean
  lock(notice?: string): Promise<void>
  getVaultKey(): CryptoKey
  reloadVault(): Promise<void>
  refreshDevices(): Promise<TotpDevice[]>
  setProfile(profile: VaultProfile): void
}

const SessionContext = createContext<SessionContextValue | null>(null)

async function listVerifiedDevices(): Promise<TotpDevice[]> {
  const { data, error } = await supabase.auth.mfa.listFactors()
  if (error) throw error
  return data.all
    .filter((f) => f.factor_type === 'totp' && f.status === 'verified')
    .map((f) => ({ id: f.id, friendlyName: f.friendly_name ?? 'Authenticator', createdAt: f.created_at }))
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
}

export function SessionProvider({ children }: { children: ReactNode }) {
  const [phase, setPhase] = useState<Phase>({ kind: 'boot' })
  const [email, setEmail] = useState<string | null>(null)
  const [profile, setProfile] = useState<VaultProfile | null>(null)
  const [vault, setVault] = useState<VaultData>({ platforms: [], credentials: [] })
  const [devices, setDevices] = useState<TotpDevice[]>([])

  const encKeyRef = useRef<CryptoKey | null>(null)
  const vaultKeyRef = useRef<CryptoKey | null>(null)
  const lastStepUpRef = useRef<number>(0)

  const clearSecrets = useCallback(() => {
    encKeyRef.current = null
    vaultKeyRef.current = null
    lastStepUpRef.current = 0
    setEmail(null)
    setProfile(null)
    setVault({ platforms: [], credentials: [] })
    setDevices([])
  }, [])

  const goSignedOut = useCallback(async (notice?: string) => {
    let initialized = true
    try {
      initialized = await api.isVaultInitialized()
    } catch {
      // Network problem: show the login form; setup is still reachable after a retry.
    }
    setPhase({ kind: 'signed-out', initialized, notice })
  }, [])

  const lock = useCallback(
    async (notice?: string) => {
      clearSecrets()
      await supabase.auth.signOut().catch(() => undefined)
      await goSignedOut(notice)
    },
    [clearSecrets, goSignedOut],
  )

  // Initial state: never a session at boot (memory-only persistence).
  useEffect(() => {
    void goSignedOut()
  }, [goSignedOut])

  // If Supabase drops the session (expired refresh token, etc.), lock.
  useEffect(() => {
    const { data } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'SIGNED_OUT' && vaultKeyRef.current) {
        clearSecrets()
        void goSignedOut('Your session ended. Please sign in again.')
      }
    })
    return () => data.subscription.unsubscribe()
  }, [clearSecrets, goSignedOut])

  // Best effort: revoke the session when the tab is closed or reloaded.
  useEffect(() => {
    const onPageHide = () => void supabase.auth.signOut()
    window.addEventListener('pagehide', onPageHide)
    return () => window.removeEventListener('pagehide', onPageHide)
  }, [])

  const reloadVault = useCallback(async () => {
    const key = vaultKeyRef.current
    if (!key) throw new Error('Vault is locked.')
    setVault(await api.loadVault(key))
  }, [])

  const refreshDevices = useCallback(async () => {
    const list = await listVerifiedDevices()
    setDevices(list)
    return list
  }, [])

  /** Decides the next phase after any successful auth step. */
  const advance = useCallback(async () => {
    const encKey = encKeyRef.current
    if (!encKey) throw new Error('Missing key material. Please sign in again.')

    const verified = await refreshDevices()
    const { data: aal, error: aalError } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel()
    if (aalError) throw aalError

    if (aal.currentLevel !== 'aal2') {
      setPhase(verified.length === 0 ? { kind: 'enroll-2fa', step: 1 } : { kind: 'verify-2fa', devices: verified })
      return
    }
    if (verified.length < 2) {
      setPhase({ kind: 'enroll-2fa', step: 2 })
      return
    }

    let current = await api.fetchProfile()
    if (!current) {
      // First-time setup: create the Vault Key now that two 2FA devices exist.
      await api.createProfile(await createWrappedVaultKey(encKey), CURRENT_KDF_VERSION)
      current = await api.fetchProfile()
      if (!current) throw new Error('Vault could not be created.')
    }
    if (current.kdfVersion !== CURRENT_KDF_VERSION) {
      throw new Error('This Vault uses an unsupported key format.')
    }

    vaultKeyRef.current = await unwrapVaultKey(current.wrappedVaultKey, encKey)
    encKeyRef.current = null // no longer needed; the Vault Key is unwrapped
    setProfile(current)
    setVault(await api.loadVault(vaultKeyRef.current))
    await api.logClientEvent('auth.login').catch(() => undefined)
    setPhase({ kind: 'unlocked' })
  }, [refreshDevices])

  const withAuthFailureCleanup = useCallback(
    async <T,>(fn: () => Promise<T>): Promise<T> => {
      try {
        return await fn()
      } catch (error) {
        // Keep the user on the current screen for wrong codes; otherwise reset.
        if (error instanceof Error && /invalid.*(code|totp)|expired/i.test(error.message)) throw error
        clearSecrets()
        await supabase.auth.signOut().catch(() => undefined)
        await goSignedOut()
        throw error
      }
    },
    [clearSecrets, goSignedOut],
  )

  const signIn = useCallback(
    async (rawEmail: string, masterPassword: string) => {
      const normalized = normalizeEmail(rawEmail)
      const keys = await deriveKeysForEmail(normalized, masterPassword)
      const { error } = await supabase.auth.signInWithPassword({ email: normalized, password: keys.authKey })
      if (error) {
        throw new Error(
          /confirm/i.test(error.message)
            ? 'Please confirm your email address first (check your inbox).'
            : 'Invalid email or Master Password.',
        )
      }
      encKeyRef.current = keys.encKey
      setEmail(normalized)
      await withAuthFailureCleanup(advance)
    },
    [advance, withAuthFailureCleanup],
  )

  const signUp = useCallback(
    async (rawEmail: string, masterPassword: string) => {
      const normalized = normalizeEmail(rawEmail)
      if (await api.isVaultInitialized()) throw new Error('A Vault already exists.')
      const keys = await deriveKeysForEmail(normalized, masterPassword)
      const { data, error } = await supabase.auth.signUp({
        email: normalized,
        password: keys.authKey,
        options: { emailRedirectTo: window.location.origin },
      })
      if (error) throw new Error(error.message)
      if (!data.session) return 'confirm-email' as const
      encKeyRef.current = keys.encKey
      setEmail(normalized)
      await withAuthFailureCleanup(advance)
      return 'signed-in' as const
    },
    [advance, withAuthFailureCleanup],
  )

  const verifyCode = useCallback(async (factorId: string, code: string) => {
    const { error } = await supabase.auth.mfa.challengeAndVerify({ factorId, code })
    if (error) throw new Error('Invalid or expired 2FA code.')
    lastStepUpRef.current = Date.now()
  }, [])

  const verifyLogin = useCallback(
    async (factorId: string, code: string) => {
      await verifyCode(factorId, code)
      await withAuthFailureCleanup(advance)
    },
    [advance, verifyCode, withAuthFailureCleanup],
  )

  const beginEnrollment = useCallback(async (): Promise<Enrollment> => {
    // Remove abandoned, unverified enrollments first (friendly names must be unique).
    const { data: list } = await supabase.auth.mfa.listFactors()
    for (const f of list?.all ?? []) {
      if (f.status === 'unverified') await supabase.auth.mfa.unenroll({ factorId: f.id })
    }
    // Local time with seconds keeps names unique without a counter that could collide after removals.
    const added = new Date().toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'medium' })
    const { data, error } = await supabase.auth.mfa.enroll({
      factorType: 'totp',
      friendlyName: `Authenticator · ${added}`,
      issuer: 'Kingslock',
    })
    if (error) throw new Error(error.message)
    return { factorId: data.id, qrCode: data.totp.qr_code, secret: data.totp.secret }
  }, [])

  const completeEnrollment = useCallback(
    async (factorId: string, code: string) => {
      await verifyCode(factorId, code)
      if (vaultKeyRef.current) {
        // Adding a device from Settings: stay unlocked.
        await refreshDevices()
        await api.logClientEvent('2fa.add').catch(() => undefined)
      } else {
        await withAuthFailureCleanup(advance)
      }
    },
    [advance, refreshDevices, verifyCode, withAuthFailureCleanup],
  )

  const cancelEnrollment = useCallback(async (factorId: string) => {
    await supabase.auth.mfa.unenroll({ factorId }).catch(() => undefined)
  }, [])

  const stepUp = useCallback(async (factorId: string, code: string) => verifyCode(factorId, code), [verifyCode])

  const isStepUpFresh = useCallback(() => Date.now() - lastStepUpRef.current < GRACE_WINDOW_MS, [])

  const getVaultKey = useCallback(() => {
    if (!vaultKeyRef.current) throw new Error('Vault is locked.')
    return vaultKeyRef.current
  }, [])

  // Idle auto-lock while unlocked.
  const autoLockMinutes = profile?.autoLockMinutes ?? 5
  useEffect(() => {
    if (phase.kind !== 'unlocked') return
    let timer: number | undefined
    const reset = () => {
      window.clearTimeout(timer)
      timer = window.setTimeout(
        () => void lock(`Locked after ${autoLockMinutes} minute${autoLockMinutes > 1 ? 's' : ''} of inactivity.`),
        autoLockMinutes * 60_000,
      )
    }
    const events = ['pointerdown', 'pointermove', 'keydown', 'wheel', 'touchstart', 'scroll'] as const
    events.forEach((e) => window.addEventListener(e, reset, { passive: true }))
    reset()
    return () => {
      window.clearTimeout(timer)
      events.forEach((e) => window.removeEventListener(e, reset))
    }
  }, [phase.kind, autoLockMinutes, lock])

  const value = useMemo<SessionContextValue>(
    () => ({
      phase,
      email,
      profile,
      vault,
      devices,
      signIn,
      signUp,
      verifyLogin,
      beginEnrollment,
      completeEnrollment,
      cancelEnrollment,
      stepUp,
      isStepUpFresh,
      lock,
      getVaultKey,
      reloadVault,
      refreshDevices,
      setProfile,
    }),
    [
      phase, email, profile, vault, devices, signIn, signUp, verifyLogin, beginEnrollment,
      completeEnrollment, cancelEnrollment, stepUp, isStepUpFresh, lock, getVaultKey, reloadVault,
      refreshDevices,
    ],
  )

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>
}

export function useSession(): SessionContextValue {
  const ctx = useContext(SessionContext)
  if (!ctx) throw new Error('useSession must be used inside <SessionProvider>')
  return ctx
}
