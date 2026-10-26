import { onMounted, ref } from 'vue'
import {
  beginWakuDemoLogin,
  completeWakuDemoLogin,
  getWakuDemoLoginSession,
  logoutWakuDemo,
  type WakuDemoAccount,
} from '../api/authApi'
import { saveBrowserSession } from './browserAuthSession'

const ERROR_MESSAGES: Record<string, string> = {
  authorization_cancelled: '已取消 WakuDemo 授权',
  state_mismatch: '登录校验失败，请重新登录',
  authorization_request_expired: '登录请求已过期，请重试',
  authorization_code_already_used: '登录凭据已使用，请重新登录',
  pkce_or_authorization_code_rejected: '登录凭据校验失败，请重试',
  token_endpoint_timeout: 'WakuDemo 登录服务响应超时',
  token_endpoint_unavailable: '暂时无法连接 WakuDemo 登录服务',
  account_endpoint_timeout: 'WakuDemo 账户服务响应超时',
  access_token_rejected: '登录已过期，请重新登录',
}

async function consumeCallbackResult(): Promise<{ error: string; success: boolean }> {
  const url = new URL(window.location.href)
  const result = url.searchParams.get('wakudemo_login')
  const code = url.searchParams.get('wakudemo_error')
  const fragment = new URLSearchParams(url.hash.slice(1))
  const ticket = fragment.get('wakudemo_ticket')
  if (!result && !ticket) return { error: '', success: false }
  url.searchParams.delete('wakudemo_login')
  url.searchParams.delete('wakudemo_error')
  if (ticket) {
    fragment.delete('wakudemo_ticket')
    url.hash = fragment.toString()
  }
  window.history.replaceState(null, '', `${url.pathname}${url.search}${url.hash}`)
  if (result === 'error') return { error: ERROR_MESSAGES[code ?? ''] ?? 'WakuDemo 登录失败，请稍后重试', success: false }
  if (ticket) await completeWakuDemoLogin(ticket)
  return { error: '', success: result === 'success' }
}

export function useWakuDemoAuth() {
  const authenticated = ref(false)
  const account = ref<WakuDemoAccount | null>(null)
  const loading = ref(true)
  const error = ref('')

  async function refresh() {
    loading.value = true
    try {
      const session = await getWakuDemoLoginSession()
      authenticated.value = session.authenticated
      account.value = session.authenticated ? session.account : null
      if (!session.authenticated) saveBrowserSession(null)
    } catch {
      // 主页挂载时的被动检查：失败静默降级为未登录，不打扰玩家。
      // 只有玩家主动操作（登录/退出/401 引导）失败时才显示错误提示。
      authenticated.value = false
      account.value = null
    } finally {
      loading.value = false
    }
  }

  async function login() {
    if (loading.value) return
    loading.value = true
    error.value = ''
    try { await beginWakuDemoLogin() }
    catch {
      loading.value = false
      error.value = '无法保存登录校验信息，请允许此站点使用浏览器存储后重试'
    }
  }

  async function logout() {
    loading.value = true
    try {
      await logoutWakuDemo()
      saveBrowserSession(null)
      authenticated.value = false
      account.value = null
      error.value = ''
    } catch {
      error.value = '退出登录失败，请稍后重试'
    } finally {
      loading.value = false
    }
  }

  onMounted(async () => {
    try {
      const callback = await consumeCallbackResult()
      error.value = callback.error
      await refresh()
      if (callback.success && !authenticated.value) error.value = '登录会话未能恢复，请重新登录'
    } catch {
      loading.value = false
      error.value = '登录会话交接失败，请在当前页面重新登录'
    }
  })

  return { authenticated, account, loading, error, login, logout, refresh }
}

