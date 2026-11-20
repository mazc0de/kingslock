import { useState, type ReactNode } from 'react'
import { AuthLayout } from './AuthLayout'
import { PasswordInput } from '@/components/PasswordInput'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { errorMessage } from '@/lib/errors'
import { useSession } from '@/session/SessionProvider'

export function SignInScreen({ notice, footer }: { notice?: string; footer?: ReactNode }) {
  const { signIn } = useSession()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  return (
    <AuthLayout title="Sign in" description="Email, Master Password, then your 2FA code." footer={footer}>
      <form
        className="grid gap-4"
        onSubmit={async (e) => {
          e.preventDefault()
          setBusy(true)
          setError(null)
          try {
            await signIn(email, password)
          } catch (err) {
            setError(errorMessage(err))
          } finally {
            setPassword('')
            setBusy(false)
          }
        }}
      >
        {notice && (
          <Alert>
            <AlertDescription>{notice}</AlertDescription>
          </Alert>
        )}
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
            autoComplete="current-password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </div>
        {error && <p className="text-sm text-destructive">{error}</p>}
        <Button type="submit" disabled={busy}>
          {busy ? 'Deriving keys…' : 'Continue'}
        </Button>
      </form>
    </AuthLayout>
  )
}
