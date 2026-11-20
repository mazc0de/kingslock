import { useMemo, useState } from 'react'
import { Plus, Search } from 'lucide-react'
import { CredentialFormDialog } from './CredentialFormDialog'
import { PlatformAvatar } from './PlatformAvatar'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { useSession } from '@/session/SessionProvider'

export function Dashboard({ onOpenPlatform }: { onOpenPlatform(id: string): void }) {
  const { vault } = useSession()
  const [query, setQuery] = useState('')
  const [adding, setAdding] = useState(false)

  const counts = useMemo(() => {
    const map = new Map<string, number>()
    for (const c of vault.credentials) map.set(c.platformId, (map.get(c.platformId) ?? 0) + 1)
    return map
  }, [vault.credentials])

  // Search runs entirely in the browser on decrypted data.
  const visible = useMemo(() => {
    const q = query.trim().toLocaleLowerCase()
    if (!q) return vault.platforms
    const viaLogin = new Set(
      vault.credentials.filter((c) => c.login.toLocaleLowerCase().includes(q)).map((c) => c.platformId),
    )
    return vault.platforms.filter((p) => p.name.toLocaleLowerCase().includes(q) || viaLogin.has(p.id))
  }, [query, vault])

  return (
    <div className="grid gap-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Vault</h1>
          <p className="text-sm text-muted-foreground">
            {vault.platforms.length} platforms · {vault.credentials.length} credentials
          </p>
        </div>
        <Button onClick={() => setAdding(true)}>
          <Plus /> Add Credential
        </Button>
      </div>

      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          className="pl-9"
          placeholder="Search platforms or emails…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </div>

      {vault.platforms.length === 0 ? (
        <Card className="items-center gap-3 p-10 text-center">
          <p className="font-medium">Your Vault is empty</p>
          <p className="text-sm text-muted-foreground">Add your first Credential, e.g. your Instagram account.</p>
          <Button onClick={() => setAdding(true)}>
            <Plus /> Add Credential
          </Button>
        </Card>
      ) : visible.length === 0 ? (
        <p className="py-10 text-center text-sm text-muted-foreground">No matches for "{query}".</p>
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {visible.map((p) => (
            <button
              key={p.id}
              type="button"
              onClick={() => onOpenPlatform(p.id)}
              className="text-left transition-transform focus-visible:outline-none hover:-translate-y-0.5"
            >
              <Card className="flex-row items-center gap-3 p-4 hover:bg-accent/50">
                <PlatformAvatar name={p.name} />
                <div className="min-w-0">
                  <p className="truncate font-medium">{p.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {counts.get(p.id) ?? 0} credential{(counts.get(p.id) ?? 0) === 1 ? '' : 's'}
                  </p>
                </div>
              </Card>
            </button>
          ))}
        </div>
      )}

      {adding && <CredentialFormDialog mode={{ kind: 'add' }} onClose={() => setAdding(false)} />}
    </div>
  )
}
