import { ActivitySection } from './ActivitySection'
import { AutoLockSection } from './AutoLockSection'
import { BackupSection } from './BackupSection'
import { ChangeMasterPasswordSection } from './ChangeMasterPasswordSection'
import { DevicesSection } from './DevicesSection'

export function SettingsPage() {
  return (
    <div className="grid gap-6">
      <h1 className="text-2xl font-semibold tracking-tight">Settings</h1>
      <DevicesSection />
      <ChangeMasterPasswordSection />
      <BackupSection />
      <AutoLockSection />
      <ActivitySection />
    </div>
  )
}
