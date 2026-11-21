import { describe, expect, it } from 'vitest'
import { COMMANDS } from './commands'

const byName = (name: string) => COMMANDS.find((c) => c.name === name)!

describe('landing terminal commands', () => {
  it('every command produces output', async () => {
    for (const command of COMMANDS) {
      expect((await command.run()).length).toBeGreaterThan(0)
    }
  })

  it('dump prints real ciphertext rows, never the sample plaintext', async () => {
    const lines = await byName('dump').run()
    const text = lines.map((l) => l.text).join('\n')
    expect(lines.filter((l) => l.pre && l.text.includes(' | A'))).toHaveLength(3) // base64 of 0x01 starts with "A"
    expect(text).not.toContain('correct-horse')
  })

  it('swap reports a real AES-GCM failure for the wrong row', async () => {
    const lines = await byName('swap').run()
    expect(lines.some((l) => l.tone === 'err' && l.text.startsWith('DecryptionError'))).toBe(true)
    expect(lines.some((l) => l.tone === 'warn')).toBe(false)
  })
})
