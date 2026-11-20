import { useRef, useState } from 'react'
import { Download, Upload } from 'lucide-react'
import { toast } from 'sonner'
import { PasswordInput } from '@/components/PasswordInput'
import { useStepUp } from '@/components/StepUpProvider'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Label } from '@/components/ui/label'
import { deriveKeys, fromBase64, unwrapVaultKey } from '@/crypto'
import { useAction } from '@/lib/useAction'
import { useSession } from '@/session/SessionProvider'
import * as api from '@/vault/api'

export function BackupSection() {
  const session = useSession()
  const withStepUp = useStepUp()
  const { busy, run } = useAction()
  const fileInput = useRef<HTMLInputElement>(null)
  const [pending, setPending] = useState<api.VaultExportFile | null>(null)
  const [filePassword, setFilePassword] = useState('')

  const exportVault = () =>
    run(async () => {
      const email = session.email
      if (!email) throw new Error('Vault is locked.')
      const file = await withStepUp(() => api.exportVault(email), {
        reason: 'Enter a 2FA code to export your Vault.',
      })
      const blob = new Blob([JSON.stringify(file, null, 2)], { type: 'application/json' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `kingslock-${new Date().toISOString().slice(0, 10)}.json`
      a.click()
      URL.revokeObjectURL(url)
      toast.success('Encrypted export downloaded.')
    })

  const importVault = () =>
    run(async () => {
      if (!pending) return
      const keys = await deriveKeys(filePassword, fromBase64(pending.salt), pending.kdf_version)
      const fileVaultKey = await unwrapVaultKey(pending.wrapped_vault_key, keys.encKey)
      const result = await api.importVault(session.getVaultKey(), fileVaultKey, pending, session.vault)
      await session.reloadVault()
      setPending(null)
      setFilePassword('')
      toast.success(`Imported ${result.credentials} credentials (${result.platforms} new platforms).`)
    })

  return (
    <Card>
      <CardHeader>
        <CardTitle>Export & import</CardTitle>
        <CardDescription>
          The export file stays encrypted and can only be opened with the Master Password that was
          active when it was exported. Keep it somewhere safe and offline.
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-4">
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" disabled={busy} onClick={() => void exportVault()}>
            <Download /> Export Vault
          </Button>
          <Button variant="outline" disabled={busy} onClick={() => fileInput.current?.click()}>
            <Upload /> Import file…
          </Button>
          <input
            ref={fileInput}
            type="file"
            accept="application/json,.json"
            className="hidden"
            onChange={async (e) => {
              const f = e.target.files?.[0]
              e.target.value = ''
              if (!f) return
              try {
                setPending(api.parseExportFile(await f.text()))
              } catch (err) {
                toast.error(err instanceof Error ? err.message : 'Invalid file.')
              }
            }}
          />
        </div>
        {pending && (
          <form
            className="grid max-w-md gap-3 rounded-md border p-4"
            onSubmit={(e) => {
              e.preventDefault()
              void importVault()
            }}
          >
            <p className="text-sm">
              File from {new Date(pending.exported_at).toLocaleString()} with {pending.credentials.length} credentials.
              Items are added to your Vault; Platforms with the same name are merged.
            </p>
            <div className="grid gap-2">
              <Label htmlFor="file-mp">Master Password used for this export</Label>
              <PasswordInput id="file-mp" value={filePassword} onChange={(e) => setFilePassword(e.target.value)} />
            </div>
            <div className="flex gap-2">
              <Button type="submit" disabled={busy || !filePassword}>
                {busy ? 'Importing…' : 'Import'}
              </Button>
              <Button type="button" variant="ghost" onClick={() => setPending(null)}>
                Cancel
              </Button>
            </div>
          </form>
        )}
      </CardContent>
    </Card>
  )
}
