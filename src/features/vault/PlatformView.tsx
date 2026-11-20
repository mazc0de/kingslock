import { useState } from 'react'
import { ArrowLeft, Eye, Pencil, Plus, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { ConfirmDialog } from './ConfirmDialog'
import { CredentialFormDialog, type CredentialFormMode } from './CredentialFormDialog'
import { PlatformAvatar } from './PlatformAvatar'
import { ViewCredentialDialog } from './ViewCredentialDialog'
import { useStepUp } from '@/components/StepUpProvider'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { formatDate } from '@/lib/format'
import { useAction } from '@/lib/useAction'
import { useSession } from '@/session/SessionProvider'
import * as api from '@/vault/api'
import type { Credential, CredentialSecret } from '@/vault/types'

export function PlatformView({ platformId, onBack }: { platformId: string; onBack(): void }) {
  const session = useSession()
  const withStepUp = useStepUp()
  const { busy, run } = useAction()

  const [form, setForm] = useState<CredentialFormMode | null>(null)
  const [viewing, setViewing] = useState<{ credential: Credential; secret: CredentialSecret } | null>(null)
  const [deleting, setDeleting] = useState<Credential | null>(null)
  const [deletingPlatform, setDeletingPlatform] = useState(false)

  const platform = session.vault.platforms.find((p) => p.id === platformId)
  if (!platform) {
    return (
      <div className="grid gap-4">
        <p className="text-sm text-muted-foreground">This Platform no longer exists.</p>
        <Button variant="outline" className="w-fit" onClick={onBack}>
          <ArrowLeft /> Back
        </Button>
      </div>
    )
  }
  const credentials = session.vault.credentials.filter((c) => c.platformId === platformId)

  // View and Edit both need the decrypted secret → Verifikasi Ulang + reveal (logged).
  const reveal = (credential: Credential) =>
    withStepUp(() => api.revealSecret(session.getVaultKey(), credential.id), {
      reason: 'Enter a 2FA code to reveal this password.',
    })

  const onView = (credential: Credential) =>
    run(async () => setViewing({ credential, secret: await reveal(credential) }))

  const onEdit = (credential: Credential) =>
    run(async () =>
      setForm({ kind: 'edit', credential, secret: await reveal(credential), platformName: platform.name }),
    )

  const onDelete = (credential: Credential) =>
    run(async () => {
      await withStepUp(() => api.deleteCredential(credential.id), {
        reason: 'Enter a 2FA code to permanently delete this Credential.',
      })
      await session.reloadVault()
      toast.success('Credential deleted.')
    })

  const onDeletePlatform = () =>
    run(async () => {
      await withStepUp(() => api.deletePlatform(platform.id))
      await session.reloadVault()
      toast.success('Platform deleted.')
      onBack()
    })

  return (
    <div className="grid gap-6">
      <Button variant="ghost" size="sm" className="w-fit" onClick={onBack}>
        <ArrowLeft /> All platforms
      </Button>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <PlatformAvatar name={platform.name} className="size-12 text-lg" />
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">{platform.name}</h1>
            <p className="text-sm text-muted-foreground">
              {credentials.length} credential{credentials.length === 1 ? '' : 's'}
            </p>
          </div>
        </div>
        <div className="flex gap-2">
          {credentials.length === 0 && (
            <Button variant="outline" onClick={() => setDeletingPlatform(true)} disabled={busy}>
              <Trash2 /> Delete Platform
            </Button>
          )}
          <Button onClick={() => setForm({ kind: 'add', platformName: platform.name })}>
            <Plus /> Add Credential
          </Button>
        </div>
      </div>

      <Card className="py-0">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="pl-4">Email / Username</TableHead>
              <TableHead>Password</TableHead>
              <TableHead className="hidden sm:table-cell">Created at</TableHead>
              <TableHead className="pr-4 text-right">Action</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {credentials.length === 0 ? (
              <TableRow>
                <TableCell colSpan={4} className="py-10 text-center text-muted-foreground">
                  No credentials yet.
                </TableCell>
              </TableRow>
            ) : (
              credentials.map((c) => (
                <TableRow key={c.id}>
                  <TableCell className="max-w-48 truncate pl-4 font-medium">{c.login}</TableCell>
                  <TableCell className="font-mono text-muted-foreground">••••••••</TableCell>
                  <TableCell className="hidden text-muted-foreground sm:table-cell">{formatDate(c.createdAt)}</TableCell>
                  <TableCell className="pr-4">
                    <div className="flex justify-end gap-1">
                      <Button size="sm" variant="ghost" disabled={busy} onClick={() => void onView(c)}>
                        <Eye /> <span className="hidden md:inline">View</span>
                      </Button>
                      <Button size="sm" variant="ghost" disabled={busy} onClick={() => void onEdit(c)}>
                        <Pencil /> <span className="hidden md:inline">Edit</span>
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="text-destructive hover:text-destructive"
                        disabled={busy}
                        onClick={() => setDeleting(c)}
                      >
                        <Trash2 /> <span className="hidden md:inline">Delete</span>
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </Card>

      {form && <CredentialFormDialog mode={form} onClose={() => setForm(null)} />}
      {viewing && (
        <ViewCredentialDialog
          credential={viewing.credential}
          secret={viewing.secret}
          platformName={platform.name}
          onClose={() => setViewing(null)}
        />
      )}
      {deleting && (
        <ConfirmDialog
          title="Delete this Credential?"
          description={`"${deleting.login}" on ${platform.name} will be permanently deleted, including its previous password. This cannot be undone.`}
          confirmLabel="Delete permanently"
          onCancel={() => setDeleting(null)}
          onConfirm={() => {
            const target = deleting
            setDeleting(null)
            void onDelete(target)
          }}
        />
      )}
      {deletingPlatform && (
        <ConfirmDialog
          title={`Delete ${platform.name}?`}
          description="This empty Platform will be removed."
          confirmLabel="Delete Platform"
          onCancel={() => setDeletingPlatform(false)}
          onConfirm={() => {
            setDeletingPlatform(false)
            void onDeletePlatform()
          }}
        />
      )}
    </div>
  )
}
