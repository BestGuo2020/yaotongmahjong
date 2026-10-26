import { afterEach, expect, it, vi } from 'vitest'

afterEach(() => {
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
  vi.resetModules()
})

it.each([
  [true, '', 'https://www.bestguo.top:58000'],
  [false, '', 'http://localhost:5173'],
  [true, 'https://custom-api.example', 'https://custom-api.example'],
])('selects the shared production API while retaining dev and deployment overrides',
  async (production, override, expected) => {
    vi.resetModules()
    vi.stubGlobal('location', { origin: 'http://localhost:5173' })
    vi.stubEnv('PROD', production)
    vi.stubEnv('VITE_API_BASE', override)
    const { API_BASE, request } = await import('./httpClient')
    expect(API_BASE).toBe(expected)

    const fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ authenticated: true }) })
    vi.stubGlobal('fetch', fetch)
    await request('/api/login/session')
    expect(fetch).toHaveBeenCalledWith(`${expected}/api/login/session`, expect.objectContaining({
      credentials: 'include',
    }))
  })

it('authenticates API requests without cookies and clears an expired explicit session', async () => {
  vi.resetModules()
  const removeItem = vi.fn()
  vi.stubGlobal('sessionStorage', { getItem: () => 'browser-session', removeItem })
  vi.stubGlobal('window', { dispatchEvent: vi.fn() })
  const fetch = vi.fn().mockResolvedValueOnce({ ok: true, json: async () => ({ ok: true }) })
    .mockResolvedValueOnce({ ok: false, status: 401, json: async () => ({ detail: { code: 'AUTH_REQUIRED' } }) })
  vi.stubGlobal('fetch', fetch)
  const { request } = await import('./httpClient')
  await request('/api/me/stats')
  expect(fetch.mock.calls[0]![1].headers.get('Authorization')).toBe('Bearer browser-session')
  await expect(request('/api/me/stats')).rejects.toThrow('AUTH_REQUIRED')
  expect(removeItem).toHaveBeenCalledWith('yaotong.auth.session')
})
