import { useMemo, useState } from 'react'
import { TriangleAlert } from 'lucide-react'
import { toast } from 'sonner'
import { PasswordGenerator } from '@/components/PasswordGenerator'
import { PasswordInput } from '@/components/PasswordInput'
import { useStepUp } from '@/components/StepUpProvider'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { useAction } from '@/lib/useAction'
import { useSession } from '@/session/SessionProvider'
import * as api from '@/vault/api'
import type { Credential, CredentialSecret } from '@/vault/types'

export type CredentialFormMode =
  | { kind: 'add'; platformName?: string }
  | { kind: 'edit'; credential: Credential; secret: CredentialSecret; platformName: string }

interface Props {
  mode: CredentialFormMode
  onClose(): void
}

export function CredentialFormDialog({ mode, onClose }: Props) {
  const session = useSession()
  const withStepUp = useStepUp()
  const { busy, run } = useAction()
  const editing = mode.kind === 'edit' ? mode : null

  const [platformName, setPlatformName] = useState(mode.platformName ?? '')
  const [login, setLogin] = useState(editing?.credential.login ?? '')
  const [password, setPassword] = useState(editing?.secret.password ?? '')
  const [notes, setNotes] = useState(editing?.secret.notes ?? '')
  const [acceptDuplicate, setAcceptDuplicate] = useState(false)

  const { platforms, credentials } = session.vault
  const existingPlatform = api.findPlatformByName(platforms, platformName)
  const duplicate = useMemo(() => {
    if (!existingPlatform || !login.trim()) return false
    const needle = login.trim().toLocaleLowerCase()
    return credentials.some(
      (c) =>
        c.platformId === existingPlatform.id &&
        c.id !== editing?.credential.id &&
        c.login.trim().toLocaleLowerCase() === needle,
    )
  }, [existingPlatform, login, credentials, editing])

  const valid = platformName.trim() && login.trim() && password
  const needsDuplicateConfirm = duplicate && !acceptDuplicate

  const save = () =>
    run(async () => {
      const key = session.getVaultKey()
      const platformId = await api.resolvePlatform(key, platforms, platformName)
      const summary = { login: login.trim() }
      const trimmedNotes = notes.trim() || undefined

      if (!editing) {
        await api.createCredential(key, platformId, summary, { password, notes: trimmedNotes })
        toast.success('Credential saved.')
      } else {
        const old = editing.secret
        const secret: CredentialSecret = {
          password,
          notes: trimmedNotes,
          // Keep exactly one Password Sebelumnya: the one being replaced.
          previousPassword: password !== old.password ? old.password : old.previousPassword,
        }
        await withStepUp(() => api.updateCredential(key, editing.credential.id, platformId, summary, secret))
        toast.success('Credential updated.')
      }
      await session.reloadVault()
      onClose()
    })

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{editing ? 'Edit Credential' : 'Add Credential'}</DialogTitle>
          <DialogDescription>
            Everything is encrypted in your browser before it is saved.
          </DialogDescription>
        </DialogHeader>
        <form
          className="grid gap-4"
          autoComplete="off"
          onSubmit={(e) => {
            e.preventDefault()
            if (!valid) return
            if (needsDuplicateConfirm) {
              setAcceptDuplicate(true)
              return
            }
            void save()
          }}
        >
          <div className="grid gap-2">
            <Label htmlFor="platform">Platform</Label>
            <Input
              id="platform"
              list="platform-suggestions"
              placeholder="e.g. Instagram"
              required
              value={platformName}
              onChange={(e) => setPlatformName(e.target.value)}
            />
            <datalist id="platform-suggestions">
              {platforms.map((p) => (
                <option key={p.id} value={p.name} />
              ))}
            </datalist>
            {platformName.trim() && (
              <p className="text-xs text-muted-foreground">
                {existingPlatform
                  ? `Will be added to existing Platform "${existingPlatform.name}".`
                  : `A new Platform "${platformName.trim()}" will be created.`}
              </p>
            )}
          </div>
          <div className="grid gap-2">
            <Label htmlFor="login">Email / Username</Label>
            <Input
              id="login"
              required
              autoCapitalize="off"
              spellCheck={false}
              value={login}
              onChange={(e) => {
                setLogin(e.target.value)
                setAcceptDuplicate(false)
              }}
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="cred-password">Password</Label>
            <PasswordInput
              id="cred-password"
              autoComplete="new-password"
              required
              className="font-mono"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
            <PasswordGenerator onGenerate={setPassword} />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="notes">Notes (optional)</Label>
            <Textarea id="notes" rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} />
          </div>
          {duplicate && (
            <Alert>
              <TriangleAlert />
              <AlertDescription>
                This Platform already has a Credential for "{login.trim()}".
                {needsDuplicateConfirm ? ' Click Save again to keep both.' : ' Both will be kept.'}
              </AlertDescription>
            </Alert>
          )}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={!valid || busy}>
              {busy ? 'Saving…' : needsDuplicateConfirm ? 'Save anyway' : 'Save'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
