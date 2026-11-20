import { useEffect, useState } from 'react'
import { cn } from '@/lib/utils'

export const MIN_MASTER_PASSWORD_LENGTH = 14
export const MIN_ZXCVBN_SCORE = 3

type Checker = (password: string, userInputs: string[]) => { score: number; warning: string | null }
let checkerPromise: Promise<Checker> | null = null

/** Loads zxcvbn lazily (bundled locally, no CDN). */
function loadChecker(): Promise<Checker> {
  checkerPromise ??= (async () => {
    const [{ ZxcvbnFactory }, common, en] = await Promise.all([
      import('@zxcvbn-ts/core'),
      import('@zxcvbn-ts/language-common'),
      import('@zxcvbn-ts/language-en'),
    ])
    const factory = new ZxcvbnFactory({
      translations: en.translations,
      graphs: common.adjacencyGraphs,
      dictionary: { ...common.dictionary, ...en.dictionary },
    })
    return (password, userInputs) => {
      const r = factory.check(password, userInputs)
      return { score: r.score, warning: r.feedback.warning }
    }
  })()
  return checkerPromise
}

export interface StrengthResult {
  score: number
  ok: boolean
  message: string
}

export function useMasterPasswordStrength(password: string, userInputs: string[] = []): StrengthResult {
  const [result, setResult] = useState<StrengthResult>({ score: 0, ok: false, message: '' })
  const inputsKey = userInputs.join('\u0000')

  useEffect(() => {
    let cancelled = false
    if (!password) return
    void loadChecker().then((check) => {
      if (cancelled) return
      const { score, warning } = check(password, inputsKey ? inputsKey.split('\u0000') : [])
      const longEnough = password.length >= MIN_MASTER_PASSWORD_LENGTH
      const ok = longEnough && score >= MIN_ZXCVBN_SCORE
      const message = !longEnough
        ? `Use at least ${MIN_MASTER_PASSWORD_LENGTH} characters (${password.length}/${MIN_MASTER_PASSWORD_LENGTH}).`
        : score < MIN_ZXCVBN_SCORE
          ? (warning ?? 'Too easy to guess. Try a passphrase of 4–5 random words.')
          : 'Strong Master Password.'
      setResult({ score, ok, message })
    })
    return () => {
      cancelled = true
    }
  }, [password, inputsKey])

  return password ? result : EMPTY_RESULT
}

const EMPTY_RESULT: StrengthResult = { score: 0, ok: false, message: '' }

export function StrengthMeter({ result }: { result: StrengthResult }) {
  if (!result.message) return null
  return (
    <div className="grid gap-1.5" aria-live="polite">
      <div className="flex gap-1">
        {[0, 1, 2, 3].map((i) => (
          <div
            key={i}
            className={cn(
              'h-1.5 flex-1 rounded-full bg-muted',
              i < result.score && (result.ok ? 'bg-emerald-500' : 'bg-amber-500'),
            )}
          />
        ))}
      </div>
      <p className={cn('text-xs', result.ok ? 'text-emerald-600 dark:text-emerald-400' : 'text-muted-foreground')}>
        {result.message}
      </p>
    </div>
  )
}
