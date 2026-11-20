import { useState } from 'react'
import { toast } from 'sonner'
import { PasswordInput } from '@/components/PasswordInput'
import { StrengthMeter, useMasterPasswordStrength } from '@/components/PasswordStrength'
import { useStepUp } from '@/components/StepUpProvider'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Label } from '@/components/ui/label'
import { deriveKeysForEmail, unwrapVaultKey, wrapVaultKey } from '@/crypto'
import { supabase } from '@/lib/supabase'
import { useAction } from '@/lib/useAction'
import { useSession } from '@/session/SessionProvider'
import * as api from '@/vault/api'

/**
 * Re-wraps the same Vault Key under a new Master Password (ADR-0004). No
 * Credential is re-encrypted. Order matters: update the Auth password, then
 * the wrapped key; if the second step fails, roll the Auth password back.
 */
export function ChangeMasterPasswordSection() {
  const session = useSession()
  const withStepUp = useStepUp()
  const { busy, run } = useAction()
  const [current, setCurrent] = useState('')
  const [next, setNext] = useState('')
  const [confirm, setConfirm] = useState('')
  const strength = useMasterPasswordStrength(next, session.email ? [session.email] : [])
  const canSubmit = current && strength.ok && next === confirm && next !== current && !busy

  const submit = () =>
    run(async () => {
      const email = session.email
      const profile = session.profile
      if (!email || !profile) throw new Error('Vault is locked.')

      // Verify the current Master Password locally before asking for 2FA.
      const oldKeys = await deriveKeysForEmail(email, current)
      const vaultKey = await unwrapVaultKey(profile.wrappedVaultKey, oldKeys.encKey, true)
      const newKeys = await deriveKeysForEmail(email, next)
      const newWrapped = await wrapVaultKey(vaultKey, newKeys.encKey)

      await withStepUp(
        async () => {
          const { error } = await supabase.auth.updateUser({ password: newKeys.authKey })
          if (error) throw new Error(error.message)
          try {
            await api.changeWrappedVaultKey(newWrapped)
          } catch (e) {
            await supabase.auth.updateUser({ password: oldKeys.authKey })
            throw e
          }
        },
        { force: true, reason: 'Enter a 2FA code to change your Master Password.' },
      )

      await supabase.auth.signOut({ scope: 'others' }).catch(() => undefined)
      session.setProfile({ ...profile, wrappedVaultKey: newWrapped })
      setCurrent('')
      setNext('')
      setConfirm('')
      toast.success('Master Password changed. Other sessions were signed out.')
    })

  return (
    <Card>
      <CardHeader>
        <CardTitle>Change Master Password</CardTitle>
        <CardDescription>Your stored passwords are not re-encrypted; only the key that protects them changes.</CardDescription>
      </CardHeader>
      <CardContent>
        <form
          className="grid max-w-md gap-4"
          onSubmit={(e) => {
            e.preventDefault()
            if (canSubmit) void submit()
          }}
        >
          <div className="grid gap-2">
            <Label htmlFor="cur-mp">Current Master Password</Label>
            <PasswordInput id="cur-mp" autoComplete="current-password" value={current} onChange={(e) => setCurrent(e.target.value)} />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="new-mp">New Master Password</Label>
            <PasswordInput id="new-mp" autoComplete="new-password" value={next} onChange={(e) => setNext(e.target.value)} />
            <StrengthMeter result={strength} />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="confirm-mp">Confirm new Master Password</Label>
            <PasswordInput id="confirm-mp" autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} />
            {confirm && confirm !== next && <p className="text-xs text-destructive">Passwords do not match.</p>}
          </div>
          <Button type="submit" className="w-fit" disabled={!canSubmit}>
            {busy ? 'Changing…' : 'Change Master Password'}
          </Button>
        </form>
      </CardContent>
    </Card>
  )
}
