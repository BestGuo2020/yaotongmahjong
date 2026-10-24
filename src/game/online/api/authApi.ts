import { API_BASE, request } from './httpClient'

export interface WakuDemoAccount {
  id: string | null
  displayName: string | null
  avatarUrl: string | null
}

export type WakuDemoLoginSession =
  | { authenticated: false }
  | { authenticated: true; account: WakuDemoAccount }

export function beginWakuDemoLogin(): void {
  // 返回当前站点/部署目录；地址必须在后端白名单中，不携带页面上的临时查询参数。
  const returnTo = `${window.location.origin}${window.location.pathname}`
  window.location.assign(`${API_BASE}/api/login/wakudemo?return_to=${encodeURIComponent(returnTo)}`)
}

export function getWakuDemoLoginSession(): Promise<WakuDemoLoginSession> {
  return request<WakuDemoLoginSession>('/api/login/session')
}

export function logoutWakuDemo(): Promise<{ authenticated: false }> {
  return request('/api/login/logout', { method: 'POST' })
}

