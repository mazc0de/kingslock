import { useState } from 'react'
import { AuthLayout } from './AuthLayout'
import { CodeInput } from '@/components/CodeInput'
import { DevicePicker } from '@/components/DevicePicker'
import { Button } from '@/components/ui/button'
import { errorMessage } from '@/lib/errors'
import { useSession, type TotpDevice } from '@/session/SessionProvider'

export function VerifyTwoFactorScreen({ devices }: { devices: TotpDevice[] }) {
  const { verifyLogin, lock } = useSession()
  const [deviceId, setDeviceId] = useState(devices[0]?.id ?? '')
  const [code, setCode] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const submit = async (value = code) => {
    if (value.length !== 6 || busy) return
    setBusy(true)
    setError(null)
    try {
      await verifyLogin(deviceId, value)
    } catch (err) {
      setError(errorMessage(err))
      setCode('')
    } finally {
      setBusy(false)
    }
  }

  return (
    <AuthLayout title="Two-factor authentication" description="Enter the 6-digit code from your authenticator app.">
      <form
        className="grid gap-4"
        onSubmit={(e) => {
          e.preventDefault()
          void submit()
        }}
      >
        <DevicePicker devices={devices} value={deviceId} onChange={setDeviceId} />
        <div className="flex justify-center">
          <CodeInput value={code} onChange={setCode} onComplete={(v) => void submit(v)} disabled={busy} />
        </div>
        {error && <p className="text-center text-sm text-destructive">{error}</p>}
        <Button type="submit" disabled={busy || code.length !== 6}>
          {busy ? 'Unlocking…' : 'Unlock Vault'}
        </Button>
        <Button type="button" variant="ghost" onClick={() => void lock()}>
          Cancel
        </Button>
      </form>
    </AuthLayout>
  )
}
