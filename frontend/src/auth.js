import { reactive } from 'vue'
import axios from 'axios'

export const auth = reactive({ user: null, csrfToken: '', ready: false })
const originalFetch = window.fetch.bind(window)

export async function authRequest(path, body) {
  const response = await originalFetch(`/api/auth/${path}`, {
    method: body ? 'POST' : 'GET', credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json', ...(auth.csrfToken ? { 'X-CSRF-Token': auth.csrfToken } : {}) },
    ...(body ? { body: JSON.stringify(body) } : {}),
  })
  const data = await response.json()
  if (!response.ok) throw new Error(data.error || '请求失败')
  return data
}

export function setSession(data) {
  auth.user = data.user
  auth.csrfToken = data.csrfToken
  if (auth.user.role === 'owner') {
    const marker = `stock:legacy-adopted:${auth.user.id}`
    if (!window.localStorage.getItem(marker)) {
      for (const key of Object.keys(window.localStorage)) {
        if (key.startsWith('stock:')) continue
        const destination = storageKey(key)
        if (window.localStorage.getItem(destination) === null) window.localStorage.setItem(destination, window.localStorage.getItem(key))
      }
      window.localStorage.setItem(marker, '1')
    }
  }
}

export async function logout() {
  await authRequest('logout', {})
  window.location.reload()
}

function isBusinessUrl(value) {
  const url = new URL(value, window.location.href)
  return url.origin === window.location.origin && /^\/(api|quant)(\/|$)/.test(url.pathname)
}

export function installAuthTransport() {
  axios.interceptors.request.use(config => {
    if (isBusinessUrl(`${config.baseURL || ''}${config.url || ''}`)) {
      config.headers['X-CSRF-Token'] = auth.csrfToken
      config.withCredentials = true
    }
    return config
  })
  axios.interceptors.response.use(response => response, error => {
    if (error.response?.status === 401 && auth.user) window.location.reload()
    return Promise.reject(error)
  })
  window.fetch = async (input, options = {}) => {
    const url = typeof input === 'string' || input instanceof URL ? String(input) : input.url
    if (!isBusinessUrl(url)) return originalFetch(input, options)
    const headers = new Headers(options.headers || (input instanceof Request ? input.headers : undefined))
    if (auth.csrfToken) headers.set('X-CSRF-Token', auth.csrfToken)
    const response = await originalFetch(input, { ...options, headers, credentials: 'same-origin' })
    if (response.status === 401 && auth.user) window.location.reload()
    return response
  }
}

function storageKey(key) {
  if (!auth.user) throw new Error('请先登录再访问本地数据')
  return `stock:user:${auth.user.id}:${key}`
}

export const userStorage = {
  getItem(key) {
    const value = window.localStorage.getItem(storageKey(key))
    return value?.replace(/uploads\/(?!users\/)([a-z]+\/)/g, `uploads/users/${auth.user.id}/$1`) ?? null
  },
  setItem(key, value) { window.localStorage.setItem(storageKey(key), value) },
  removeItem(key) { window.localStorage.removeItem(storageKey(key)) },
  clear() {
    const prefix = storageKey('')
    for (const key of Object.keys(window.localStorage)) if (key.startsWith(prefix)) window.localStorage.removeItem(key)
  },
}
