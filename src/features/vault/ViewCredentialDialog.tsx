import { SecretField } from '@/components/SecretField'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import { formatDateTime } from '@/lib/format'
import type { Credential, CredentialSecret } from '@/vault/types'

interface Props {
  credential: Credential
  secret: CredentialSecret
  platformName: string
  onClose(): void
}

export function ViewCredentialDialog({ credential, secret, platformName, onClose }: Props) {
  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{platformName}</DialogTitle>
          <DialogDescription>
            Created {formatDateTime(credential.createdAt)} · Updated {formatDateTime(credential.updatedAt)}
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4">
          <div className="grid gap-2">
            <Label>Email / Username</Label>
            <code className="truncate rounded-md border bg-muted px-3 py-2 font-mono text-sm">
              {credential.login}
            </code>
          </div>
          <div className="grid gap-2">
            <Label>Password</Label>
            <SecretField value={secret.password} label="password" />
          </div>
          {secret.notes && (
            <div className="grid gap-2">
              <Label>Notes</Label>
              <p className="whitespace-pre-wrap rounded-md border bg-muted px-3 py-2 text-sm">{secret.notes}</p>
            </div>
          )}
          {secret.previousPassword && (
            <div className="grid gap-2">
              <Label className="text-muted-foreground">Previous password</Label>
              <SecretField value={secret.previousPassword} label="previous password" />
            </div>
          )}
        </div>
        <DialogFooter>
          <Button onClick={onClose}>Close</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
