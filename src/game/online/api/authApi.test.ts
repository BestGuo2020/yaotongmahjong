import { afterEach, expect, it, vi } from 'vitest'
import { beginWakuDemoLogin } from './authApi'

vi.mock('./httpClient', () => ({
  API_BASE: 'https://www.bestguo.top:58000', request: vi.fn(),
}))

afterEach(() => vi.unstubAllGlobals())

it.each([
  ['https://lianhuaguangdongmahjong.guoguo-labs.online', '/'],
  ['https://yaotongmahjong.guoguo-labs.online', '/'],
  ['https://yaotongmahjong.guoguo-labs.online', '/game/'],
])('returns to the initiating page at %s%s using the shared backend', (origin, pathname) => {
  const assign = vi.fn()
  vi.stubGlobal('window', { location: {
    origin, pathname, search: '?wakudemo_login=error&code=do-not-forward', hash: '#temporary', assign,
  } })

  beginWakuDemoLogin()

  const target = new URL(assign.mock.calls[0]![0])
  expect(target.origin).toBe('https://www.bestguo.top:58000')
  expect(target.pathname).toBe('/api/login/wakudemo')
  expect([...target.searchParams]).toEqual([['return_to', `${origin}${pathname}`]])
})
