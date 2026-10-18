import { ref } from 'vue'
import { isClosedDay } from '../utils/tradingDay'
import { toast } from '../utils/toast'

const stockPrices = ref({})
const stockPriceMeta = ref({ source: '', fetchedAt: '', stale: false })
const PRICE_INTERVAL = 30 * 1000
const WINDOW_START_HOUR = 9
const WINDOW_START_MIN = 15
const WINDOW_END_HOUR = 15
let priceTimer = null
let priceFetchPromise = null
// 定时器持有者：owner -> getCodes。多个看板同时挂载时按引用计数共享同一个定时器
const timerOwners = new Map()

function todayStr() {
  const d = new Date()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${d.getFullYear()}-${m}-${day}`
}

// 时间窗（只看时分）：9:15–15:00
function isInWindow() {
  const now = new Date()
  const h = now.getHours()
  const m = now.getMinutes()
  if (h < WINDOW_START_HOUR || h >= WINDOW_END_HOUR) return false
  if (h === WINDOW_START_HOUR && m < WINDOW_START_MIN) return false
  return true
}

// 轮询窗：时间窗内且当天是交易日（周末/法定节假日不轮询）
function isPollingWindow() {
  return isInWindow() && !isClosedDay(todayStr())
}

// 行情拉取失败时标记为陈旧，并在“由新变旧”的第一次提示一次
function markStale(message) {
  const wasFresh = !!stockPriceMeta.value.fetchedAt && !stockPriceMeta.value.stale
  stockPriceMeta.value = { ...stockPriceMeta.value, stale: true }
  if (wasFresh) toast(message, 'error')
}

async function fetchStockPrices(codes, force = false) {
  if (!codes || !codes.length) return
  if (!force && !isInWindow()) {
    console.log('[StockPrice] Outside 9:15-15:00 window, skip fetch')
    return
  }
  if (priceFetchPromise) return priceFetchPromise
  priceFetchPromise = (async () => {
    try {
      const codesParam = codes.join(',')
      const res = await fetch(`/api/stock-price?codes=${encodeURIComponent(codesParam)}`, { cache: 'no-store' })
      if (!res.ok) {
        console.warn('[StockPrice] API non-OK', res.status)
        markStale('实时行情获取失败，价格可能已过期')
        return
      }
      const data = await res.json()
      if (data?.data) {
        stockPrices.value = { ...stockPrices.value, ...data.data }
        stockPriceMeta.value = {
          source: data.source || 'tencent',
          fetchedAt: data.fetchedAt || new Date().toISOString(),
          stale: false
        }
        console.log('[StockPrice] Updated', Object.keys(data.data).length, 'stocks')
      }
    } catch (err) {
      console.error('[StockPrice] Fetch failed:', err)
      markStale('实时行情获取失败，价格可能已过期')
    } finally {
      priceFetchPromise = null
    }
  })()
  return priceFetchPromise
}

// 单次轮询：把所有看板的代码合并后一次性请求，避免多个看板互相覆盖
function tickPriceTimer() {
  if (!isPollingWindow()) return
  const codes = new Set()
  for (const getCodes of timerOwners.values()) {
    const list = typeof getCodes === 'function' ? getCodes() : getCodes
    if (Array.isArray(list)) list.forEach(c => { if (c) codes.add(String(c).trim()) })
  }
  if (codes.size) fetchStockPrices([...codes])
}

// 注册定时器持有者；只在第一个持有者注册时真正启动，最后一个注销时停止
function startStockPriceTimer(owner, getCodes) {
  timerOwners.set(owner, getCodes)
  if (!priceTimer) priceTimer = setInterval(tickPriceTimer, PRICE_INTERVAL)
}

function stopStockPriceTimer(owner) {
  timerOwners.delete(owner)
  if (timerOwners.size === 0 && priceTimer) {
    clearInterval(priceTimer)
    priceTimer = null
  }
}

export function useStockPrice() {
  return {
    stockPrices,
    stockPriceMeta,
    fetchStockPrices,
    startStockPriceTimer,
    stopStockPriceTimer
  }
}
