// Password generator using crypto.getRandomValues with rejection sampling
// (no modulo bias).

export interface GeneratorOptions {
  length: number
  lowercase: boolean
  uppercase: boolean
  digits: boolean
  symbols: boolean
}

export const DEFAULT_GENERATOR_OPTIONS: GeneratorOptions = {
  length: 20,
  lowercase: true,
  uppercase: true,
  digits: true,
  symbols: true,
}

const SETS = {
  lowercase: 'abcdefghijkmnopqrstuvwxyz',
  uppercase: 'ABCDEFGHJKLMNPQRSTUVWXYZ',
  digits: '23456789',
  symbols: '!@#$%^&*()-_=+[]{};:,.?',
} as const

function randomIndex(max: number): number {
  // Largest multiple of max that fits in a uint32; reject values above it.
  const limit = Math.floor(0x1_0000_0000 / max) * max
  const buf = new Uint32Array(1)
  for (;;) {
    crypto.getRandomValues(buf)
    if (buf[0] < limit) return buf[0] % max
  }
}

export function generatePassword(options: GeneratorOptions = DEFAULT_GENERATOR_OPTIONS): string {
  const enabled = (Object.keys(SETS) as (keyof typeof SETS)[]).filter((k) => options[k])
  if (enabled.length === 0) throw new Error('Select at least one character type.')
  const length = Math.max(options.length, enabled.length)

  // Guarantee one character from each enabled set, then fill from the union.
  const chars = enabled.map((k) => SETS[k][randomIndex(SETS[k].length)])
  const all = enabled.map((k) => SETS[k]).join('')
  while (chars.length < length) chars.push(all[randomIndex(all.length)])

  // Fisher–Yates shuffle so the guaranteed characters are not at the front.
  for (let i = chars.length - 1; i > 0; i--) {
    const j = randomIndex(i + 1)
    ;[chars[i], chars[j]] = [chars[j], chars[i]]
  }
  return chars.join('')
}
