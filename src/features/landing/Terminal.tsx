import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react'
import { COMMANDS, HELP_LINES, type Line } from './commands'
import { GlyphFrame } from './GlyphFrame'

const reducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

const BANNER: Line[] = [
  { tone: 'dim', text: 'kingslock breach lab: a simulated deployment, with real crypto in this tab.' },
  { tone: 'dim', text: 'Pick an attack below, or type help.' },
]

export function Terminal() {
  const [lines, setLines] = useState<Line[]>(BANNER)
  const [typing, setTyping] = useState<{ prompt: string; text: string } | null>(null)
  const [busy, setBusy] = useState(false)
  const [input, setInput] = useState('')
  const screenRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const started = useRef(false)
  // Attacks run one after another; anything clicked or typed meanwhile waits its turn.
  const queue = useRef<Promise<void>>(Promise.resolve())
  const pending = useRef(0)

  const run = useCallback(async (name: string) => {
    const animate = !reducedMotion()
    if (name === 'clear') {
      setLines([])
      return
    }
    const command = COMMANDS.find((c) => c.name === name)
    const prompt = command?.prompt ?? '$'
    const shell = command?.shell ?? name
    if (animate && command) {
      for (let i = 1; i <= shell.length; i += 2) {
        setTyping({ prompt, text: shell.slice(0, i) })
        await sleep(16)
      }
      setTyping(null)
    }
    setLines((current) => [...current, { tone: 'cmd', prompt, text: shell }])
    const output: Line[] =
      name === 'help'
        ? HELP_LINES
        : command
          ? await command.run()
          : [{ tone: 'err', text: `command not found: ${name}. Type help to list the attacks.` }]
    for (const line of output) {
      if (animate) await sleep(90)
      setLines((current) => [...current, line])
    }
  }, [])

  const execute = useCallback(
    (raw: string) => {
      const name = raw.trim().toLowerCase()
      if (!name) return
      pending.current += 1
      setBusy(true)
      queue.current = queue.current
        .then(() => run(name))
        .catch(() => setLines((current) => [...current, { tone: 'err', text: 'The attack script crashed.' }]))
        .finally(() => {
          pending.current -= 1
          if (pending.current === 0) setBusy(false)
        })
    },
    [run],
  )

  // One orchestrated moment: the first attack runs itself on load.
  useEffect(() => {
    if (started.current) return
    started.current = true
    execute('dump')
  }, [execute])

  useEffect(() => {
    const screen = screenRef.current
    if (screen) screen.scrollTop = screen.scrollHeight
  }, [lines, typing])

  function submit(event: FormEvent) {
    event.preventDefault()
    const value = input
    setInput('')
    execute(value)
  }

  return (
    <GlyphFrame
      as="section"
      className="kl-term"
      aria-label="Attack the vault: simulated terminal"
      grow={1}
      sections={[
        <div className="kl-term-bar" key="bar">
          <span>attacker@leak: ~</span>
          <span>simulated session, real crypto</span>
        </div>,
        <div className="kl-term-main" key="main">
          <div
            ref={screenRef}
            className="kl-screen"
            role="log"
            aria-live="polite"
            translate="no"
            onClick={() => inputRef.current?.focus()}
          >
            {lines.map((line, i) => (
              <div key={i} className={`kl-l kl-l-${line.tone}${line.pre ? ' kl-l-pre' : ''}`}>
                {line.tone === 'cmd' && <span className="kl-ps">{line.prompt} </span>}
                {line.text}
              </div>
            ))}
            {typing && (
              <div className="kl-l kl-l-cmd" aria-hidden="true">
                <span className="kl-ps">{typing.prompt} </span>
                {typing.text}
                <span className="kl-cursor" />
              </div>
            )}
          </div>
          <form className="kl-prompt" onSubmit={submit}>
            <label htmlFor="kl-input" className="kl-ps">
              $
            </label>
            <input
              id="kl-input"
              name="command"
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder={busy ? 'running… your next attack will queue' : 'type an attack, or help'}
              autoComplete="off"
              autoCapitalize="off"
              spellCheck={false}
              translate="no"
              aria-describedby="kl-cmds-label"
            />
          </form>
        </div>,
        <div className="kl-cmds" key="cmds">
          <span id="kl-cmds-label" className="kl-visually-hidden">
            Or pick an attack:
          </span>
          {COMMANDS.map((c) => (
            <button key={c.name} type="button" className="kl-cmd" onClick={() => execute(c.name)}>
              {c.label}
            </button>
          ))}
        </div>,
      ]}
    />
  )
}
