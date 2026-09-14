export function fmtFee(val) {
  const n = parseFloat(val) || 0
  return Number.isInteger(n) ? n.toFixed(0) : n.toFixed(2)
}

export function fmtNum(val, decimals = 2) {
  const n = parseFloat(val) || 0
  const fixed = n.toFixed(decimals)
  return parseFloat(fixed).toString()
}

export function formatCurrency(val) {
  const n = parseFloat(val) || 0
  return `¥${n.toLocaleString('zh-CN', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`
}

export function formatPercent(val) {
  const n = parseFloat(val) || 0
  return `${n.toFixed(2)}%`
}

export function formatDate(dateStr) {
  if (!dateStr) return ''
  if (dateStr instanceof Date) {
    const y = dateStr.getFullYear()
    const m = String(dateStr.getMonth() + 1).padStart(2, '0')
    const d = String(dateStr.getDate()).padStart(2, '0')
    return `${y}-${m}-${d}`
  }
  return dateStr.substring(0, 10)
}

export function calculateHoldingDays(buyDate) {
  if (!buyDate) return 0
  const buy = new Date(buyDate)
  const today = new Date()
  buy.setHours(0, 0, 0, 0)
  today.setHours(0, 0, 0, 0)
  const diffTime = today - buy
  return Math.floor(diffTime / (1000 * 60 * 60 * 24)) + 1
}

export function calculateHoldingDaysByRange(buyDate, sellDate) {
  if (!buyDate || !sellDate) return 0
  const buy = new Date(buyDate)
  const sell = new Date(sellDate)
  buy.setHours(0, 0, 0, 0)
  sell.setHours(0, 0, 0, 0)
  const diffTime = sell - buy
  return Math.floor(diffTime / (1000 * 60 * 60 * 24)) + 1
}

export function debounce(fn, delay = 400) {
  let timer = null
  return function (...args) {
    if (timer) clearTimeout(timer)
    timer = setTimeout(() => fn.apply(this, args), delay)
  }
}

export function num(val) {
  return Number.isFinite(Number(val)) ? Number(val) : 0
}

export function sumBy(items, getValue) {
  if (!items || !Array.isArray(items)) return 0
  return items.reduce((sum, item) => sum + num(typeof getValue === 'function' ? getValue(item) : item[getValue]), 0)
}

export function sumByFilter(items, filterFn, getValue) {
  if (!items || !Array.isArray(items)) return 0
  return items.reduce((sum, item) => {
    if (filterFn(item)) return sum + num(typeof getValue === 'function' ? getValue(item) : item[getValue])
    return sum
  }, 0)
}

export function findByKeyword(items, keyword, key = 'name') {
  if (!items || !Array.isArray(items)) return null
  return items.find(item => {
    const value = item[key] || ''
    return value.includes(keyword)
  })
}
