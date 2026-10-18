/**
 * 轻量全局提示：无依赖、无组件，直接挂到 body 上。
 * 用于替代散落各处的 window.alert，避免阻塞式弹窗打断操作。
 */

let hostEl = null

function ensureHost() {
  if (hostEl && document.body.contains(hostEl)) return hostEl
  hostEl = document.createElement('div')
  hostEl.className = 'app-toast-host'
  document.body.appendChild(hostEl)
  return hostEl
}

/**
 * @param {string} message 提示文案
 * @param {'info'|'success'|'error'} type 类型
 * @param {number} duration 展示时长（毫秒）
 */
export function toast(message, type = 'info', duration = 2600) {
  if (!message) return
  const host = ensureHost()
  const el = document.createElement('div')
  el.className = `app-toast app-toast--${type}`
  el.textContent = String(message)
  host.appendChild(el)
  requestAnimationFrame(() => el.classList.add('is-in'))
  setTimeout(() => {
    el.classList.remove('is-in')
    setTimeout(() => el.remove(), 260)
  }, duration)
}

// 便捷别名：toast.success / toast.error / toast.info（不影响 toast(message, type) 用法）
toast.success = (message, duration) => toast(message, 'success', duration)
toast.error = (message, duration) => toast(message, 'error', duration)
toast.info = (message, duration) => toast(message, 'info', duration)
