import { useEffect, useState } from 'react'
import { RefreshCw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { errorMessage } from '@/lib/errors'
import { formatDateTime } from '@/lib/format'
import { useSession } from '@/session/SessionProvider'
import * as api from '@/vault/api'
import type { ActivityEntry } from '@/vault/types'

const LABELS: Record<string, string> = {
  'auth.login': 'Signed in',
  'vault.create': 'Vault created',
  'vault.export': 'Vault exported',
  'vault.import': 'Vault imported',
  'settings.update': 'Settings changed',
  'master_password.change': 'Master Password changed',
  'platform.create': 'Platform created',
  'platform.delete': 'Platform deleted',
  'credential.create': 'Credential added',
  'credential.update': 'Credential edited',
  'credential.delete': 'Credential deleted',
  'credential.reveal': 'Password viewed',
  '2fa.add': '2FA device added',
  '2fa.remove': '2FA device removed',
}

function shortAgent(ua: string | null): string {
  if (!ua) return '—'
  const browser = /Edg\//.test(ua) ? 'Edge' : /Chrome\//.test(ua) ? 'Chrome' : /Firefox\//.test(ua) ? 'Firefox' : /Safari\//.test(ua) ? 'Safari' : 'Browser'
  const os = /iPhone|iPad/.test(ua) ? 'iOS' : /Android/.test(ua) ? 'Android' : /Mac OS X/.test(ua) ? 'macOS' : /Windows/.test(ua) ? 'Windows' : /Linux/.test(ua) ? 'Linux' : ''
  return os ? `${browser} · ${os}` : browser
}

export function ActivitySection() {
  const { vault } = useSession()
  const [entries, setEntries] = useState<ActivityEntry[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  const load = () => {
    setError(null)
    api.fetchActivity().then(setEntries, (e) => setError(errorMessage(e)))
  }
  useEffect(load, [])

  // Names are encrypted server-side; resolve target ids locally.
  const describeTarget = (id: string | null) => {
    if (!id) return ''
    const platform = vault.platforms.find((p) => p.id === id)
    if (platform) return platform.name
    const cred = vault.credentials.find((c) => c.id === id)
    if (cred) {
      const p = vault.platforms.find((x) => x.id === cred.platformId)
      return `${cred.login}${p ? ` · ${p.name}` : ''}`
    }
    return '(deleted)'
  }

  return (
    <Card>
      <CardHeader className="flex-row items-start justify-between">
        <div className="grid gap-1.5">
          <CardTitle>Activity log</CardTitle>
          <CardDescription>Append-only. Entries cannot be edited or deleted, even by you.</CardDescription>
        </div>
        <Button size="icon" variant="ghost" aria-label="Refresh" onClick={load}>
          <RefreshCw />
        </Button>
      </CardHeader>
      <CardContent>
        {error && <p className="text-sm text-destructive">{error}</p>}
        {!entries ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : (
          <div className="max-h-[28rem] overflow-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>When</TableHead>
                  <TableHead>Event</TableHead>
                  <TableHead className="hidden sm:table-cell">Item</TableHead>
                  <TableHead className="hidden md:table-cell">Device</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {entries.map((e) => (
                  <TableRow key={e.id}>
                    <TableCell className="whitespace-nowrap text-muted-foreground">{formatDateTime(e.createdAt)}</TableCell>
                    <TableCell>{LABELS[e.event] ?? e.event}</TableCell>
                    <TableCell className="hidden max-w-56 truncate sm:table-cell">{describeTarget(e.targetId)}</TableCell>
                    <TableCell className="hidden text-muted-foreground md:table-cell">{shortAgent(e.userAgent)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
