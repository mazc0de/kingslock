import { Smartphone } from 'lucide-react'
import { AuthLayout } from './AuthLayout'
import { EnrollDevice } from './EnrollDevice'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { useSession } from '@/session/SessionProvider'

/** Setup steps 2 and 3: two 2FA devices are mandatory (ADR-0003). */
export function EnrollTwoFactorScreen({ step }: { step: 1 | 2 }) {
  const { lock } = useSession()
  return (
    <AuthLayout
      title={step === 1 ? 'Set up your first 2FA device' : 'Set up a second 2FA device'}
      description={`Step ${step + 1} of 3 · Two-factor authentication`}
    >
      <div className="grid gap-4">
        {step === 2 && (
          <Alert>
            <Smartphone />
            <AlertDescription>
              A second device (another phone, a tablet, or a password manager with TOTP) is your only
              way back in if you lose the first. There are no recovery codes.
            </AlertDescription>
          </Alert>
        )}
        {/* key forces a fresh enrollment for each step */}
        <EnrollDevice key={step} onCancel={() => void lock()} />
      </div>
    </AuthLayout>
  )
}
