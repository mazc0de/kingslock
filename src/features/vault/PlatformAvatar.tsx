import { cn } from '@/lib/utils'

const COLORS = [
  'bg-rose-500', 'bg-orange-500', 'bg-amber-500', 'bg-emerald-500',
  'bg-teal-500', 'bg-sky-500', 'bg-indigo-500', 'bg-fuchsia-500',
]

function hash(text: string): number {
  let h = 0
  for (const ch of text.toLowerCase()) h = (h * 31 + ch.charCodeAt(0)) >>> 0
  return h
}

/** Letter avatar; no external favicon fetches (they would leak Platform names). */
export function PlatformAvatar({ name, className }: { name: string; className?: string }) {
  return (
    <div
      aria-hidden
      className={cn(
        'flex size-10 shrink-0 items-center justify-center rounded-lg font-semibold text-white',
        COLORS[hash(name) % COLORS.length],
        className,
      )}
    >
      {name.trim().charAt(0).toUpperCase() || '?'}
    </div>
  )
}
