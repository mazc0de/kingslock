import { useEffect, useState } from 'react'
import { Copy, Eye, EyeOff } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { copySecret } from '@/lib/clipboard'

const AUTO_HIDE_MS = 30_000

/** Masked secret with Reveal (auto-hides after 30s) and Copy (clipboard cleared after 30s). */
export function SecretField({ value, label }: { value: string; label: string }) {
  const [revealed, setRevealed] = useState(false)

  useEffect(() => {
    if (!revealed) return
    const t = window.setTimeout(() => setRevealed(false), AUTO_HIDE_MS)
    return () => window.clearTimeout(t)
  }, [revealed])

  return (
    <div className="flex items-center gap-2">
      <code className="min-w-0 flex-1 truncate rounded-md border bg-muted px-3 py-2 font-mono text-sm">
        {revealed ? value : '•'.repeat(Math.min(Math.max(value.length, 8), 24))}
      </code>
      <Button
        type="button"
        variant="outline"
        size="icon"
        aria-label={revealed ? `Hide ${label}` : `Reveal ${label}`}
        onClick={() => setRevealed((r) => !r)}
      >
        {revealed ? <EyeOff /> : <Eye />}
      </Button>
      <Button
        type="button"
        variant="outline"
        size="icon"
        aria-label={`Copy ${label}`}
        onClick={() =>
          copySecret(value).then(
            () => toast.success('Copied. Clipboard will be cleared in 30 seconds.'),
            () => toast.error('Could not copy to clipboard.'),
          )
        }
      >
        <Copy />
      </Button>
    </div>
  )
}
