import { useState } from 'react'
import { Lock, Settings, Vault } from 'lucide-react'
import { Dashboard } from '@/features/vault/Dashboard'
import { PlatformView } from '@/features/vault/PlatformView'
import { SettingsPage } from '@/features/settings/SettingsPage'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { useSession } from '@/session/SessionProvider'

type View = { name: 'dashboard' } | { name: 'platform'; id: string } | { name: 'settings' }

export function AppShell() {
  const { lock, email, profile } = useSession()
  const [view, setView] = useState<View>({ name: 'dashboard' })

  const navButton = (target: View['name'], label: string, Icon: typeof Vault) => (
    <Button
      variant="ghost"
      size="sm"
      className={cn(
        view.name === target || (target === 'dashboard' && view.name === 'platform') ? 'bg-accent' : '',
      )}
      onClick={() => setView(target === 'settings' ? { name: 'settings' } : { name: 'dashboard' })}
    >
      <Icon /> <span className="hidden sm:inline">{label}</span>
    </Button>
  )

  return (
    <div className="min-h-svh bg-muted/40">
      <header className="sticky top-0 z-10 border-b bg-background/95 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-5xl items-center gap-2 px-4">
          <div className="mr-2 flex items-center gap-2 font-semibold">
            <img src="/favicon.svg" alt="" width={28} height={28} className="size-7" />
            <span className="hidden sm:inline">Kingslock</span>
          </div>
          <nav className="flex gap-1">
            {navButton('dashboard', 'Vault', Vault)}
            {navButton('settings', 'Settings', Settings)}
          </nav>
          <div className="ml-auto flex items-center gap-3">
            <span className="hidden text-xs text-muted-foreground md:inline">
              {email} · auto-lock {profile?.autoLockMinutes ?? 5}m
            </span>
            <Button size="sm" variant="outline" onClick={() => void lock('Vault locked.')}>
              <Lock /> Lock
            </Button>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-5xl px-4 py-6">
        {view.name === 'dashboard' && <Dashboard onOpenPlatform={(id) => setView({ name: 'platform', id })} />}
        {view.name === 'platform' && <PlatformView platformId={view.id} onBack={() => setView({ name: 'dashboard' })} />}
        {view.name === 'settings' && <SettingsPage />}
      </main>
    </div>
  )
}
