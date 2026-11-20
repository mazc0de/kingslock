const CLEAR_AFTER_MS = 30_000
let clearTimer: number | undefined

/**
 * Copies text and clears the clipboard after 30 seconds (best effort: the
 * browser may refuse when the page is not focused, and OS clipboard managers
 * may keep their own history).
 */
export async function copySecret(text: string): Promise<void> {
  await navigator.clipboard.writeText(text)
  window.clearTimeout(clearTimer)
  clearTimer = window.setTimeout(() => {
    navigator.clipboard.writeText('').catch(() => undefined)
  }, CLEAR_AFTER_MS)
}
