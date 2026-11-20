import { useState } from 'react'
import { Plus, Smartphone, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { EnrollDevice } from '@/features/auth/EnrollDevice'
import { ConfirmDialog } from '@/features/vault/ConfirmDialog'
import { useStepUp } from '@/components/StepUpProvider'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { toVaultError } from '@/lib/errors'
import { formatDateTime } from '@/lib/format'
import { supabase } from '@/lib/supabase'
import { useAction } from '@/lib/useAction'
import { useSession, type TotpDevice } from '@/session/SessionProvider'
import * as api from '@/vault/api'

export function DevicesSection() {
  const session = useSession()
  const withStepUp = useStepUp()
  const { busy, run } = useAction()
  const [enrolling, setEnrolling] = useState(false)
  const [removing, setRemoving] = useState<TotpDevice | null>(null)
  const canRemove = session.devices.length > 2

  const add = () =>
    run(async () => {
      // Adding a device requires a code from an already registered device.
      await withStepUp(async () => undefined, { force: true, reason: 'Enter a code from a device you already registered.' })
      setEnrolling(true)
    })

  const remove = (device: TotpDevice) =>
    run(async () => {
      // Removing requires a code from a DIFFERENT device, and at least two must remain.
      await withStepUp(
        async () => {
          const { error } = await supabase.auth.mfa.unenroll({ factorId: device.id })
          if (error) throw toVaultError(error)
        },
        { force: true, excludeDeviceId: device.id, reason: `Enter a code from a device other than "${device.friendlyName}".` },
      )
      await api.logClientEvent('2fa.remove').catch(() => undefined)
      const { data } = await supabase.auth.refreshSession()
      if (!data.session) {
        await session.lock('2FA device removed. Please sign in again.')
        return
      }
      await session.refreshDevices()
      toast.success('2FA device removed.')
    })

  return (
    <Card>
      <CardHeader>
        <CardTitle>2FA devices</CardTitle>
        <CardDescription>
          You must keep at least two. If you lose one, add a new device first, then remove the lost one.
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-3">
        {session.devices.map((d) => (
          <div key={d.id} className="flex items-center gap-3 rounded-md border p-3">
            <Smartphone className="size-5 text-muted-foreground" />
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium">{d.friendlyName}</p>
              <p className="text-xs text-muted-foreground">Added {formatDateTime(d.createdAt)}</p>
            </div>
            <Button
              size="sm"
              variant="ghost"
              className="text-destructive hover:text-destructive"
              disabled={!canRemove || busy}
              title={canRemove ? 'Remove device' : 'At least two devices are required'}
              onClick={() => setRemoving(d)}
            >
              <Trash2 />
            </Button>
          </div>
        ))}
        <Button variant="outline" className="w-fit" disabled={busy} onClick={() => void add()}>
          <Plus /> Add device
        </Button>
      </CardContent>

      <Dialog open={enrolling} onOpenChange={setEnrolling}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Add a 2FA device</DialogTitle>
            <DialogDescription>Scan the QR code with the new device.</DialogDescription>
          </DialogHeader>
          {enrolling && (
            <EnrollDevice
              onDone={() => {
                setEnrolling(false)
                toast.success('2FA device added.')
              }}
              onCancel={() => setEnrolling(false)}
            />
          )}
        </DialogContent>
      </Dialog>

      {removing && (
        <ConfirmDialog
          title="Remove this 2FA device?"
          description={`"${removing.friendlyName}" will no longer be able to sign in to your Vault.`}
          confirmLabel="Remove device"
          onCancel={() => setRemoving(null)}
          onConfirm={() => {
            const target = removing
            setRemoving(null)
            void remove(target)
          }}
        />
      )}
    </Card>
  )
}
