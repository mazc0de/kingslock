import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import type { TotpDevice } from '@/session/SessionProvider'

interface Props {
  devices: TotpDevice[]
  value: string
  onChange(id: string): void
}

/** Lets the Owner choose which Perangkat 2FA the code comes from. */
export function DevicePicker({ devices, value, onChange }: Props) {
  if (devices.length <= 1) return null
  return (
    <div className="grid gap-2">
      <Label htmlFor="device-picker">2FA device</Label>
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger id="device-picker" className="w-full">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {devices.map((d) => (
            <SelectItem key={d.id} value={d.id}>
              {d.friendlyName}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  )
}
