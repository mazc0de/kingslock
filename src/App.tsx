import { useState } from 'react'
import { MailCheck } from 'lucide-react'
import { StepUpProvider } from '@/components/StepUpProvider'
import { Button } from '@/components/ui/button'
import { AppShell } from '@/features/AppShell'
import { AuthLayout } from '@/features/auth/AuthLayout'
import { EnrollTwoFactorScreen } from '@/features/auth/EnrollTwoFactorScreen'
import { SetupScreen } from '@/features/auth/SetupScreen'
import { SignInScreen } from '@/features/auth/SignInScreen'
import { VerifyTwoFactorScreen } from '@/features/auth/VerifyTwoFactorScreen'
import { useSession } from '@/session/SessionProvider'

export default function App() {
  const { phase } = useSession()
  const [awaitingEmail, setAwaitingEmail] = useState(false)

  switch (phase.kind) {
    case 'boot':
      return <div className="min-h-svh bg-muted/40" />

    case 'signed-out':
      if (awaitingEmail) {
        return (
          <AuthLayout title="Confirm your email" description="We sent you a confirmation link.">
            <div className="grid gap-4 text-sm">
              <p className="flex gap-2">
                <MailCheck className="size-5 shrink-0" />
                Click the link in the email, then come back here and sign in with your email and Master
                Password to finish setting up 2FA.
              </p>
              <Button onClick={() => setAwaitingEmail(false)}>Go to sign in</Button>
            </div>
          </AuthLayout>
        )
      }
      // Setup stays reachable until a Vault exists (an account without a Vault
      // finishes setup by signing in).
      return phase.initialized ? (
        <SignInScreen notice={phase.notice} />
      ) : (
        <SetupOrSignIn notice={phase.notice} onConfirmEmail={() => setAwaitingEmail(true)} />
      )

    case 'verify-2fa':
      return <VerifyTwoFactorScreen devices={phase.devices} />

    case 'enroll-2fa':
      return <EnrollTwoFactorScreen step={phase.step} />

    case 'unlocked':
      return (
        <StepUpProvider>
          <AppShell />
        </StepUpProvider>
      )
  }
}

function SetupOrSignIn({ notice, onConfirmEmail }: { notice?: string; onConfirmEmail(): void }) {
  const [mode, setMode] = useState<'setup' | 'signin'>('setup')
  const toggle = (
    <button
      type="button"
      className="text-muted-foreground underline"
      onClick={() => setMode(mode === 'setup' ? 'signin' : 'setup')}
    >
      {mode === 'setup' ? 'Already created an account? Sign in to finish setup' : 'Back to setup'}
    </button>
  )
  return mode === 'setup' ? (
    <SetupScreen onConfirmEmail={onConfirmEmail} footer={toggle} />
  ) : (
    <SignInScreen notice={notice} footer={toggle} />
  )
}
