// Verifikasi Ulang (step-up). Wrap any sensitive action in withStepUp():
//
//   await withStepUp(() => api.deleteCredential(id))
//
// If the client believes the Grace Window is still open it runs the action
// directly; if the database answers STEP_UP_REQUIRED (the real authority) or
// the window is closed, it asks for a 2FA code first and then runs it.

import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from 'react'
import { ShieldCheck } from 'lucide-react'
import { CodeInput } from '@/components/CodeInput'
import { DevicePicker } from '@/components/DevicePicker'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { errorMessage, isStepUpRequired } from '@/lib/errors'
import { useSession } from '@/session/SessionProvider'

export class StepUpCancelled extends Error {
  constructor() {
    super('Cancelled')
    this.name = 'StepUpCancelled'
  }
}

export interface StepUpOptions {
  /** Always ask for a code, even inside the Grace Window. */
  force?: boolean
  /** Device that may NOT be used (e.g. the one being removed). */
  excludeDeviceId?: string
  reason?: string
}

type WithStepUp = <T>(action: () => Promise<T>, options?: StepUpOptions) => Promise<T>

const StepUpContext = createContext<WithStepUp | null>(null)

interface Pending {
  options: StepUpOptions
  resolve(): void
  reject(error: Error): void
}

export function StepUpProvider({ children }: { children: ReactNode }) {
  const session = useSession()
  const [pending, setPending] = useState<Pending | null>(null)
  const [code, setCode] = useState('')
  const [deviceId, setDeviceId] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const lastDeviceRef = useRef<string>('')

  const devices = session.devices.filter((d) => d.id !== pending?.options.excludeDeviceId)

  const prompt = useCallback(
    (options: StepUpOptions) =>
      new Promise<void>((resolve, reject) => {
        const allowed = session.devices.filter((d) => d.id !== options.excludeDeviceId)
        const preferred = allowed.find((d) => d.id === lastDeviceRef.current) ?? allowed[0]
        setDeviceId(preferred?.id ?? '')
        setCode('')
        setError(null)
        setPending({ options, resolve, reject })
      }),
    [session.devices],
  )

  const withStepUp = useCallback<WithStepUp>(
    async (action, options = {}) => {
      if (!options.force && session.isStepUpFresh()) {
        try {
          return await action()
        } catch (e) {
          if (!isStepUpRequired(e)) throw e
        }
      }
      await prompt(options)
      return action()
    },
    [prompt, session],
  )

  const submit = async (value = code) => {
    if (!pending || value.length !== 6 || !deviceId) return
    setBusy(true)
    setError(null)
    try {
      await session.stepUp(deviceId, value)
      lastDeviceRef.current = deviceId
      pending.resolve()
      setPending(null)
    } catch (e) {
      setError(errorMessage(e))
      setCode('')
    } finally {
      setBusy(false)
    }
  }

  const cancel = () => {
    pending?.reject(new StepUpCancelled())
    setPending(null)
  }

  return (
    <StepUpContext.Provider value={withStepUp}>
      {children}
      <Dialog open={pending !== null} onOpenChange={(open) => !open && cancel()}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ShieldCheck className="size-5" /> Confirm it's you
            </DialogTitle>
            <DialogDescription>
              {pending?.options.reason ?? 'Enter the 6-digit code from your authenticator app.'}
            </DialogDescription>
          </DialogHeader>
          <form
            className="grid gap-4"
            onSubmit={(e) => {
              e.preventDefault()
              void submit()
            }}
          >
            {devices.length === 0 ? (
              <p className="text-sm text-destructive">No other 2FA device is available.</p>
            ) : (
              <DevicePicker devices={devices} value={deviceId} onChange={setDeviceId} />
            )}
            <div className="flex justify-center">
              <CodeInput value={code} onChange={setCode} onComplete={(v) => void submit(v)} disabled={busy} />
            </div>
            {error && <p className="text-center text-sm text-destructive">{error}</p>}
            <DialogFooter>
              <Button type="button" variant="outline" onClick={cancel}>
                Cancel
              </Button>
              <Button type="submit" disabled={busy || code.length !== 6 || !deviceId}>
                {busy ? 'Verifying…' : 'Verify'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </StepUpContext.Provider>
  )
}

export function useStepUp(): WithStepUp {
  const ctx = useContext(StepUpContext)
  if (!ctx) throw new Error('useStepUp must be used inside <StepUpProvider>')
  return ctx
}
