import { useEffect, useRef, useState } from 'react'
import { CodeInput } from '@/components/CodeInput'
import { Button } from '@/components/ui/button'
import { errorMessage } from '@/lib/errors'
import { useSession, type Enrollment } from '@/session/SessionProvider'

/**
 * Shows a QR code for a new Perangkat 2FA and verifies the first code.
 * Used during setup and from Settings.
 */
export function EnrollDevice({ onDone, onCancel }: { onDone?(): void; onCancel?(): void }) {
  const { beginEnrollment, completeEnrollment, cancelEnrollment } = useSession()
  const [enrollment, setEnrollment] = useState<Enrollment | null>(null)
  const [code, setCode] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [showSecret, setShowSecret] = useState(false)
  // Shared across React StrictMode's double effect run so only one enrollment is created.
  const startedRef = useRef<Promise<Enrollment> | null>(null)

  useEffect(() => {
    let active = true
    startedRef.current ??= beginEnrollment()
    startedRef.current.then(
      (e) => active && setEnrollment(e),
      (e) => active && setError(errorMessage(e)),
    )
    return () => {
      active = false
    }
  }, [beginEnrollment])

  const submit = async (value = code) => {
    if (!enrollment || value.length !== 6 || busy) return
    setBusy(true)
    setError(null)
    try {
      await completeEnrollment(enrollment.factorId, value)
      onDone?.()
    } catch (err) {
      setError(errorMessage(err))
      setCode('')
    } finally {
      setBusy(false)
    }
  }

  return (
    <form
      className="grid gap-4"
      onSubmit={(e) => {
        e.preventDefault()
        void submit()
      }}
    >
      <ol className="list-decimal space-y-1 pl-5 text-sm text-muted-foreground">
        <li>Open an authenticator app (Google Authenticator, Authy, 1Password, …).</li>
        <li>Scan the QR code, or enter the secret manually.</li>
        <li>Type the 6-digit code it shows.</li>
      </ol>
      <div className="flex justify-center">
        {enrollment ? (
          <img
            src={enrollment.qrCode}
            alt="2FA QR code"
            className="size-48 rounded-md border bg-white p-2"
          />
        ) : (
          <div className="size-48 animate-pulse rounded-md bg-muted" />
        )}
      </div>
      {enrollment && (
        <div className="text-center text-xs">
          {showSecret ? (
            <code className="break-all rounded bg-muted px-2 py-1 font-mono">{enrollment.secret}</code>
          ) : (
            <button type="button" className="underline" onClick={() => setShowSecret(true)}>
              Can't scan? Show secret
            </button>
          )}
        </div>
      )}
      <div className="flex justify-center">
        <CodeInput value={code} onChange={setCode} onComplete={(v) => void submit(v)} disabled={busy || !enrollment} />
      </div>
      {error && <p className="text-center text-sm text-destructive">{error}</p>}
      <Button type="submit" disabled={busy || code.length !== 6 || !enrollment}>
        {busy ? 'Verifying…' : 'Verify device'}
      </Button>
      {onCancel && (
        <Button
          type="button"
          variant="ghost"
          onClick={() => {
            if (enrollment) void cancelEnrollment(enrollment.factorId)
            onCancel()
          }}
        >
          Cancel
        </Button>
      )}
    </form>
  )
}
