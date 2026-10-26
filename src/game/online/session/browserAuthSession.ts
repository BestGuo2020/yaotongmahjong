// First-party, per-tab storage survives the OAuth round trip and page reloads.
// The upstream WakuDemo access token is never sent to the browser.
const TOKEN_KEY = 'yaotong.auth.session'
const VERIFIER_KEY = 'yaotong.auth.verifier'

export function browserSessionToken(): string | null {
  try { return sessionStorage.getItem(TOKEN_KEY) } catch { return null }
}

export function saveBrowserSession(token: string | null) {
  if (token) sessionStorage.setItem(TOKEN_KEY, token)
  else { try { sessionStorage.removeItem(TOKEN_KEY) } catch { /* Storage may be disabled. */ } }
}

export async function prepareSessionChallenge(): Promise<string> {
  const bytes = crypto.getRandomValues(new Uint8Array(32))
  const encode = (data: Uint8Array) => btoa(String.fromCharCode(...data))
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
  const verifier = encode(bytes)
  sessionStorage.setItem(VERIFIER_KEY, verifier)
  return encode(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier))))
}

export function takeSessionVerifier(): string | null {
  const verifier = sessionStorage.getItem(VERIFIER_KEY)
  sessionStorage.removeItem(VERIFIER_KEY)
  return verifier
}
