import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App'
import { Toaster } from '@/components/ui/sonner'
import { SessionProvider } from '@/session/SessionProvider'

// Follow the OS colour scheme (no inline script, so CSP stays strict).
const media = window.matchMedia('(prefers-color-scheme: dark)')
const applyTheme = () => document.documentElement.classList.toggle('dark', media.matches)
applyTheme()
media.addEventListener('change', applyTheme)

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <SessionProvider>
      <App />
      <Toaster position="top-center" richColors />
    </SessionProvider>
  </StrictMode>,
)
