import { useState, type ReactNode } from 'react'
import { TriangleAlert } from 'lucide-react'
import { AuthLayout } from './AuthLayout'
import { PasswordInput } from '@/components/PasswordInput'
import { StrengthMeter, useMasterPasswordStrength } from '@/components/PasswordStrength'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { errorMessage } from '@/lib/errors'
import { useSession } from '@/session/SessionProvider'

/** First-time setup. Only shown while no Vault exists. */
export function SetupScreen({ onConfirmEmail, footer }: { onConfirmEmail(): void; footer?: ReactNode }) {
  const { signUp } = useSession()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [understood, setUnderstood] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const strength = useMasterPasswordStrength(password, [email])
  const mismatch = confirm.length > 0 && confirm !== password
  const canSubmit = strength.ok && confirm === password && understood && !busy

  return (
    <AuthLayout title="Create your Vault" description="Step 1 of 3 · Email and Master Password" footer={footer}>
      <form
        className="grid gap-4"
        onSubmit={async (e) => {
          e.preventDefault()
          if (!canSubmit) return
          setBusy(true)
          setError(null)
          try {
            const result = await signUp(email, password)
            if (result === 'confirm-email') onConfirmEmail()
          } catch (err) {
            setError(errorMessage(err))
          } finally {
            setBusy(false)
          }
        }}
      >
        <Alert variant="destructive">
          <TriangleAlert />
          <AlertTitle>Your Master Password cannot be reset</AlertTitle>
          <AlertDescription>
            It is the only key to your Vault. Nobody, including the server, can recover it. If you
            forget it, every stored password is lost permanently.
          </AlertDescription>
        </Alert>
        <div className="grid gap-2">
          <Label htmlFor="email">Email</Label>
          <Input
            id="email"
            type="email"
            autoComplete="username"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </div>
        <div className="grid gap-2">
          <Label htmlFor="password">Master Password</Label>
          <PasswordInput
            id="password"
            autoComplete="new-password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
          <StrengthMeter result={strength} />
          <p className="text-xs text-muted-foreground">
            Tip: a passphrase of random words, e.g. <span className="font-mono">kopi-hujan-sepeda-merah-42</span>.
          </p>
        </div>
        <div className="grid gap-2">
          <Label htmlFor="confirm">Confirm Master Password</Label>
          <PasswordInput
            id="confirm"
            autoComplete="new-password"
            required
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            aria-invalid={mismatch}
          />
          {mismatch && <p className="text-xs text-destructive">Passwords do not match.</p>}
        </div>
        <label className="flex items-start gap-2 text-sm">
          <input
            type="checkbox"
            className="mt-0.5 accent-primary"
            checked={understood}
            onChange={(e) => setUnderstood(e.target.checked)}
          />
          I understand that a forgotten Master Password means my data is lost forever.
        </label>
        {error && <p className="text-sm text-destructive">{error}</p>}
        <Button type="submit" disabled={!canSubmit}>
          {busy ? 'Creating account…' : 'Continue'}
        </Button>
      </form>
    </AuthLayout>
  )
}
