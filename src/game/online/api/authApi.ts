import { API_BASE, request } from './httpClient'
import { prepareSessionChallenge, saveBrowserSession, takeSessionVerifier } from '../session/browserAuthSession'

export interface WakuDemoAccount {
  id: string | null
  displayName: string | null
  avatarUrl: string | null
}

export type WakuDemoLoginSession =
  | { authenticated: false }
  | { authenticated: true; account: WakuDemoAccount }

export async function beginWakuDemoLogin(): Promise<void> {
  // 返回当前站点/部署目录；地址必须在后端白名单中，不携带页面上的临时查询参数。
  const returnTo = `${window.location.origin}${window.location.pathname}`
  const challenge = await prepareSessionChallenge()
  window.location.assign(`${API_BASE}/api/login/wakudemo?return_to=${encodeURIComponent(returnTo)}&session_challenge=${challenge}`)
}

export async function completeWakuDemoLogin(ticket: string): Promise<void> {
  const verifier = takeSessionVerifier()
  if (!verifier) throw new Error('登录校验已失效，请在当前页面重新登录')
  const result = await request<{ sessionToken: string }>('/api/login/exchange', {
    method: 'POST', body: JSON.stringify({ ticket, verifier }),
  })
  saveBrowserSession(result.sessionToken)
}

export function getWakuDemoLoginSession(): Promise<WakuDemoLoginSession> {
  return request<WakuDemoLoginSession>('/api/login/session')
}

export function logoutWakuDemo(): Promise<{ authenticated: false }> {
  return request('/api/login/logout', { method: 'POST' })
}

