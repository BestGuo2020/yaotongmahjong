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
