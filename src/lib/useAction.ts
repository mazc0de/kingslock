import { useCallback, useState } from 'react'
import { toast } from 'sonner'
import { StepUpCancelled } from '@/components/StepUpProvider'
import { errorMessage } from '@/lib/errors'

/**
 * Runs an async action with a busy flag and toast on error.
 * A cancelled Verifikasi Ulang is silent.
 */
export function useAction() {
  const [busy, setBusy] = useState(false)
  const run = useCallback(async <T,>(fn: () => Promise<T>): Promise<T | undefined> => {
    setBusy(true)
    try {
      return await fn()
    } catch (e) {
      if (!(e instanceof StepUpCancelled)) toast.error(errorMessage(e))
      return undefined
    } finally {
      setBusy(false)
    }
  }, [])
  return { busy, run }
}
