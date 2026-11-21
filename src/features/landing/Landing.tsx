import { Fragment, useEffect, useRef, useState } from 'react'
import { Check, Copy } from 'lucide-react'
import '@fontsource/vt323'
import '@fontsource-variable/jetbrains-mono'
import './landing.css'
import { GlyphFrame } from './GlyphFrame'
import { Terminal } from './Terminal'

const REPO = 'https://github.com/mazc0de/kingslock'
const CLONE = `git clone ${REPO}.git`

const THREATS: [threat: string, answer: string][] = [
  ['Database or backup leaks', 'Ciphertext only. Every field is encrypted in the browser first.'],
  ['service_role key or dashboard leaks', 'The server holds only the wrapped Vault Key, never what unwraps it.'],
  ['Laptop left signed in', 'Step-up 2FA on every sensitive action, a 2-minute Grace Window, auto-lock.'],
  ['UI bypassed in DevTools', 'Rules live in RLS policies and RPCs, not in React.'],
  ['Weak password guessed offline', 'Argon2id, 14+ characters, zxcvbn score of 3 or more.'],
  ['XSS or a malicious dependency', 'Strict CSP, no third-party scripts, pinned dependencies.'],
  ['Ciphertext swapped between rows', 'AES-GCM with AAD bound to the table and row id.'],
  ['Authenticator phone lost', 'At least two 2FA Devices, required before the Vault exists.'],
  ['Supabase project paused or deleted', 'Export Vault: an encrypted backup file.'],
]

const DECISIONS: [id: string, slug: string, title: string][] = [
  ['0001', 'zero-knowledge-client-side-encryption', 'Encrypt everything on the client, zero-knowledge'],
  ['0002', 'step-up-2fa-enforced-in-database', 'Enforce step-up 2FA in the database, not the UI'],
  ['0003', 'multiple-totp-devices-instead-of-recovery-codes', 'Two 2FA Devices instead of recovery codes'],
  ['0004', 'single-password-split-key-derivation', 'Split one Master Password into two keys'],
  ['0005', 'secrets-readable-only-via-rpc', 'Make secrets readable only through an RPC'],
  ['0006', 'salt-derived-from-email', 'Derive the salt from the email'],
]

const LIMITS = [
  'Forget the Master Password and the Vault is gone. There is no reset, on purpose.',
  'Lose both 2FA Devices and you cannot sign in.',
  'One Owner only. No sharing, no second Vault.',
  'A 2FA code can be replayed while it is still valid.',
  'Changing the Master Password is not atomic. Export the Vault first.',
  'Failed sign-in attempts are not written to the Activity Log.',
  'Nothing here stops malware or a keylogger on your own device.',
]

type Seg = [text: string, tone?: 'key' | 'note' | 'out']

// Each row is one line of the diagram; kept under 50 columns for phones.
const DIAGRAM: Seg[][] = [
  [['master password', 'key']],
  [['│  ', 'out'], ['typed by the Owner, sent nowhere', 'note']],
  [['▼', 'out']],
  [['argon2id', 'key'], ['   m=64 MiB  t=3  p=1', 'note']],
  [['│  ', 'out'], ["salt = sha256('…/salt/v1:' + email)[0..16]", 'note']],
  [['▼', 'out']],
  [['hkdf-sha256', 'key'], [' ───────────────┐', 'out']],
  [['│                          │', 'out']],
  [['▼                          ▼', 'out']],
  [['authKey', 'key'], ['                    ', 'out'], ['encKey', 'key'], [' (AES-KW)', 'note']],
  [['sent to Supabase Auth      stays in memory', 'note']],
  [['as the "password"', 'note'], ['          │ ', 'out'], ['unwraps', 'note']],
  [['                           ▼', 'out']],
  [['                           ', 'out'], ['Vault Key', 'key'], [' (AES-GCM 256)', 'note']],
  [['                           │ ', 'out'], ['seals every field', 'note']],
  [['                           ▼', 'out']],
  [['                           ', 'out'], ['ciphertext', 'key'], [' + aad', 'note']],
  [['                           ', 'out'], ['table:row:v1', 'note']],
]

/** A section divider drawn the terminal way: a run of box-drawing glyphs. */
function Rule() {
  return (
    <div className="kl-rule" aria-hidden="true">
      {'─'.repeat(320)}
    </div>
  )
}

export function Landing() {
  const [copied, setCopied] = useState(false)
  const copyTimer = useRef<ReturnType<typeof setTimeout>>(undefined)

  useEffect(() => {
    const root = document.documentElement
    const previous = { bg: root.style.backgroundColor, scheme: root.style.colorScheme, title: document.title }
    root.style.backgroundColor = '#000'
    root.style.colorScheme = 'dark'
    document.title = 'Kingslock: a password vault the server cannot read'
    const themeColor = document.createElement('meta')
    themeColor.name = 'theme-color'
    themeColor.content = '#000000'
    document.head.append(themeColor)
    return () => {
      root.style.backgroundColor = previous.bg
      root.style.colorScheme = previous.scheme
      document.title = previous.title
      themeColor.remove()
      clearTimeout(copyTimer.current)
    }
  }, [])

  async function copyClone() {
    try {
      await navigator.clipboard.writeText(CLONE)
      setCopied(true)
      clearTimeout(copyTimer.current)
      copyTimer.current = setTimeout(() => setCopied(false), 2000)
    } catch {
      setCopied(false)
    }
  }

  return (
    <div className="kl">
      <a className="kl-skip" href="#kl-main">
        Skip to content
      </a>
      <header className="kl-nav">
        <a className="kl-mark" href="#top" aria-label="Kingslock, back to top">
          <img className="kl-logo" src="/favicon.svg" alt="" width={36} height={36} />
          <span>
            kingslock<span className="kl-mark-cursor" aria-hidden="true">_</span>
          </span>
        </a>
        <nav aria-label="Sections" className="kl-nav-links">
          <a href="#keys">Keys</a>
          <a href="#threats">Threats</a>
          <a href="#decisions">Decisions</a>
          <a href="#limits">Limits</a>
        </nav>
        <div className="kl-nav-end">
          <a href={REPO} target="_blank" rel="noreferrer">
            GitHub
          </a>
          <a href="#unlock" className="kl-quiet">
            Owner sign in
          </a>
        </div>
      </header>
      <Rule />

      <main id="kl-main">
        <section className="kl-hero" id="top">
          <div className="kl-hero-copy">
            <h1 className="kl-h1">Breach it. You get ciphertext.</h1>
            <p className="kl-lede">
              A self-hosted password vault for one person. Credentials are encrypted in the browser, and Postgres
              itself refuses to reveal a password without a fresh 2FA code.
            </p>
            <div className="kl-actions">
              <a className="kl-btn kl-btn-primary" href={REPO} target="_blank" rel="noreferrer">
                View source on GitHub
              </a>
              <a className="kl-btn kl-btn-ghost" href="#keys">
                How the keys work
              </a>
            </div>
            <p className="kl-hint">Run an attack in the terminal. The ciphertext was generated in your browser just now.</p>
          </div>
          <Terminal />
        </section>

        <Rule />
        <section className="kl-section" id="keys" aria-labelledby="keys-h">
          <div>
            <h2 className="kl-h2" id="keys-h">
              One password, two keys, zero for the server.
            </h2>
            <p>
              The Master Password is stretched with Argon2id, then split by HKDF. One half signs in to Supabase
              Auth as an opaque hex string. The other half never leaves memory and unwraps the random Vault Key
              that seals each field.
            </p>
          </div>
          <GlyphFrame
            className="kl-diagram-frame"
            sections={[
              <pre className="kl-diagram" key="diagram" aria-label="Key derivation: master password, argon2id, hkdf-sha256, then authKey sent to Supabase Auth and encKey kept in memory, which unwraps the Vault Key that seals every field.">
                {DIAGRAM.map((row, i) => (
                  <span key={i} className="kl-diagram-row">
                    {row.map(([text, tone = 'out'], j) => (
                      <span key={j} className={`kl-d-${tone}`}>
                        {text}
                      </span>
                    ))}
                    {'\n'}
                  </span>
                ))}
              </pre>,
            ]}
          />
        </section>

        <Rule />
        <section className="kl-section" id="threats" aria-labelledby="threats-h">
          <div>
            <h2 className="kl-h2" id="threats-h">
              Nine ways in, nine answers.
            </h2>
            <p>The threat model from the handoff doc, and the mechanism that answers each one.</p>
          </div>
          <table className="kl-table">
            <thead>
              <tr>
                <th scope="col">If this happens</th>
                <th scope="col">Kingslock does this</th>
              </tr>
            </thead>
            <tbody>
              <tr className="kl-row-rule" aria-hidden="true">
                <td colSpan={2}>{'─'.repeat(240)}</td>
              </tr>
              {THREATS.map(([threat, answer]) => (
                <Fragment key={threat}>
                  <tr>
                    <th scope="row">{threat}</th>
                    <td>{answer}</td>
                  </tr>
                  <tr className="kl-row-rule" aria-hidden="true">
                    <td colSpan={2}>{'─'.repeat(240)}</td>
                  </tr>
                </Fragment>
              ))}
            </tbody>
          </table>
        </section>

        <Rule />
        <section className="kl-section" id="decisions" aria-labelledby="decisions-h">
          <div>
            <h2 className="kl-h2" id="decisions-h">
              Six decisions that are hard to undo.
            </h2>
            <p>Each one is written up as an architecture decision record, with the alternatives that lost.</p>
          </div>
          <ol className="kl-adr">
            {DECISIONS.map(([id, slug, title]) => (
              <li key={id}>
                <span className="kl-adr-id">ADR-{id}</span>
                <a href={`${REPO}/blob/main/docs/adr/${id}-${slug}.md`} target="_blank" rel="noreferrer">
                  {title}
                </a>
              </li>
            ))}
          </ol>
        </section>

        <Rule />
        <section className="kl-section" id="limits" aria-labelledby="limits-h">
          <div>
            <h2 className="kl-h2" id="limits-h">
              What it will not do.
            </h2>
            <p>A vault that hides its trade-offs is not one to trust. These are the known ones.</p>
          </div>
          <ul className="kl-limits">
            {LIMITS.map((limit) => (
              <li key={limit}>
                <span className="kl-warn" aria-hidden="true">
                  warn
                </span>
                {limit}
              </li>
            ))}
          </ul>
        </section>

        <Rule />
        <section className="kl-close" aria-labelledby="close-h">
          <h2 className="kl-h2 kl-close-h" id="close-h">
            Read it. Run it. Try to break it.
          </h2>
          <GlyphFrame
            className="kl-clone-frame"
            sections={[
              <div className="kl-clone" key="clone">
                <code translate="no">
                  <span className="kl-ps">$ </span>
                  {CLONE}
                </code>
                <button type="button" onClick={copyClone}>
                  {copied ? <Check className="size-4" aria-hidden="true" /> : <Copy className="size-4" aria-hidden="true" />}
                  <span>{copied ? 'Copied' : 'Copy'}</span>
                </button>
                <span role="status" className="kl-visually-hidden">
                  {copied ? 'Clone command copied' : ''}
                </span>
              </div>,
            ]}
          />
          <dl className="kl-stack">
            <div>
              <dt>frontend</dt>
              <dd>React 19, Vite, TypeScript, Tailwind v4</dd>
            </div>
            <div>
              <dt>backend</dt>
              <dd>Supabase Auth with TOTP, Postgres, RLS, RPC</dd>
            </div>
            <div>
              <dt>crypto</dt>
              <dd>WebCrypto (HKDF, AES-KW, AES-GCM), Argon2id via hash-wasm</dd>
            </div>
            <div>
              <dt>tests</dt>
              <dd>Vitest, SQL tests for RLS and RPCs, oxlint</dd>
            </div>
          </dl>
          <a className="kl-btn kl-btn-primary" href={REPO} target="_blank" rel="noreferrer">
            View source on GitHub
          </a>
        </section>
      </main>

      <Rule />
      <footer className="kl-foot">
        <span>Kingslock, a portfolio project by mazc0de. This page loads no third-party scripts.</span>
        <a href="#unlock" className="kl-quiet">
          Owner sign in
        </a>
      </footer>
    </div>
  )
}
