import { toast } from 'sonner'
import { useStepUp } from '@/components/StepUpProvider'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { useAction } from '@/lib/useAction'
import { useSession } from '@/session/SessionProvider'
import * as api from '@/vault/api'

const OPTIONS = [1, 5, 15] as const

export function AutoLockSection() {
  const session = useSession()
  const withStepUp = useStepUp()
  const { busy, run } = useAction()
  const profile = session.profile
  if (!profile) return null

  return (
    <Card>
      <CardHeader>
        <CardTitle>Auto-lock</CardTitle>
        <CardDescription>
          Lock and sign out after this much inactivity. The 2FA grace window is fixed at 2 minutes.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Select
          value={String(profile.autoLockMinutes)}
          disabled={busy}
          onValueChange={(v) =>
            void run(async () => {
              const minutes = Number(v) as (typeof OPTIONS)[number]
              await withStepUp(() => api.updateAutoLock(minutes))
              session.setProfile({ ...profile, autoLockMinutes: minutes })
              toast.success('Auto-lock updated.')
            })
          }
        >
          <SelectTrigger className="w-48">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {OPTIONS.map((m) => (
              <SelectItem key={m} value={String(m)}>
                {m} minute{m > 1 ? 's' : ''}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </CardContent>
    </Card>
  )
}
