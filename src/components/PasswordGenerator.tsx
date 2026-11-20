import { useState } from 'react'
import { RefreshCw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { DEFAULT_GENERATOR_OPTIONS, generatePassword, type GeneratorOptions } from '@/crypto'

const TOGGLES: { key: keyof Omit<GeneratorOptions, 'length'>; label: string }[] = [
  { key: 'uppercase', label: 'A–Z' },
  { key: 'lowercase', label: 'a–z' },
  { key: 'digits', label: '0–9' },
  { key: 'symbols', label: '!@#' },
]

/** Generates a password with crypto.getRandomValues and hands it to onGenerate. */
export function PasswordGenerator({ onGenerate }: { onGenerate(password: string): void }) {
  const [options, setOptions] = useState<GeneratorOptions>(DEFAULT_GENERATOR_OPTIONS)
  const noneSelected = TOGGLES.every((t) => !options[t.key])

  return (
    <div className="flex flex-wrap items-center gap-3 rounded-md border border-dashed p-3 text-sm">
      <div className="flex items-center gap-2">
        <Label htmlFor="gen-length" className="text-xs text-muted-foreground">
          Length
        </Label>
        <Input
          id="gen-length"
          type="number"
          min={8}
          max={64}
          className="h-8 w-16"
          value={options.length}
          onChange={(e) =>
            setOptions((o) => ({ ...o, length: Math.min(64, Math.max(8, Number(e.target.value) || 20)) }))
          }
        />
      </div>
      {TOGGLES.map((t) => (
        <label key={t.key} className="flex cursor-pointer items-center gap-1.5 text-xs">
          <input
            type="checkbox"
            className="accent-primary"
            checked={options[t.key]}
            onChange={(e) => setOptions((o) => ({ ...o, [t.key]: e.target.checked }))}
          />
          {t.label}
        </label>
      ))}
      <Button
        type="button"
        size="sm"
        variant="secondary"
        className="ml-auto"
        disabled={noneSelected}
        onClick={() => onGenerate(generatePassword(options))}
      >
        <RefreshCw /> Generate
      </Button>
    </div>
  )
}
