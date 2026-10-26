import { afterEach, expect, it, vi } from 'vitest'
import { beginWakuDemoLogin, completeWakuDemoLogin } from './authApi'
import { request } from './httpClient'
import { browserSessionToken } from '../session/browserAuthSession'

vi.mock('./httpClient', () => ({
  API_BASE: 'https://www.bestguo.top:58000', request: vi.fn(),
}))

afterEach(() => vi.unstubAllGlobals())

it.each([
  ['https://lianhuaguangdongmahjong.guoguo-labs.online', '/'],
  ['https://yaotongmahjong.guoguo-labs.online', '/'],
  ['https://yaotongmahjong.guoguo-labs.online', '/game/'],
])('returns to the initiating page at %s%s using the shared backend', async (origin, pathname) => {
  const stored = new Map<string, string>()
  vi.stubGlobal('sessionStorage', {
    getItem: (key: string) => stored.get(key) ?? null,
    setItem: (key: string, value: string) => stored.set(key, value),
    removeItem: (key: string) => stored.delete(key),
  })
  const assign = vi.fn()
  vi.stubGlobal('window', { location: {
    origin, pathname, search: '?wakudemo_login=error&code=do-not-forward', hash: '#temporary', assign,
  } })

  await beginWakuDemoLogin()

  const target = new URL(assign.mock.calls[0]![0])
  expect(target.origin).toBe('https://www.bestguo.top:58000')
  expect(target.pathname).toBe('/api/login/wakudemo')
  expect(target.searchParams.get('return_to')).toBe(`${origin}${pathname}`)
  expect(target.searchParams.get('session_challenge')).toMatch(/^[A-Za-z0-9_-]{43}$/)
  expect(target.searchParams.has('verifier')).toBe(false)
  vi.mocked(request).mockResolvedValueOnce({ sessionToken: 'application-session' })
  await completeWakuDemoLogin('one-use-ticket')
  const payload = JSON.parse(vi.mocked(request).mock.calls.at(-1)![1]!.body as string)
  expect(payload.ticket).toBe('one-use-ticket')
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(payload.verifier)))
  expect(btoa(String.fromCharCode(...digest)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''))
    .toBe(target.searchParams.get('session_challenge'))
  expect(browserSessionToken()).toBe('application-session')
  await expect(completeWakuDemoLogin('replay-ticket')).rejects.toThrow('校验已失效')
})
