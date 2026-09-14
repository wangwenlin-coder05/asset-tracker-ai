import { ref } from 'vue'

const stockPrices = ref({})
const stockPriceMeta = ref({ source: '', fetchedAt: '' })
const PRICE_INTERVAL = 2 * 60 * 1000
const WINDOW_START_HOUR = 9
const WINDOW_START_MIN = 15
const WINDOW_END_HOUR = 15
let priceTimer = null
let priceFetchPromise = null

function isInWindow() {
  const now = new Date()
  const h = now.getHours()
  const m = now.getMinutes()
  if (h < WINDOW_START_HOUR || h >= WINDOW_END_HOUR) return false
  if (h === WINDOW_START_HOUR && m < WINDOW_START_MIN) return false
  return true
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
        return
      }
      const data = await res.json()
      if (data?.data) {
        stockPrices.value = { ...stockPrices.value, ...data.data }
        stockPriceMeta.value = { source: data.source || 'tencent', fetchedAt: data.fetchedAt || new Date().toISOString() }
        console.log('[StockPrice] Updated', Object.keys(data.data).length, 'stocks')
      }
    } catch (err) {
      console.error('[StockPrice] Fetch failed:', err)
    } finally {
      priceFetchPromise = null
    }
  })()
  return priceFetchPromise
}

function startStockPriceTimer(getCodes) {
  if (priceTimer) clearInterval(priceTimer)
  priceTimer = setInterval(() => {
    if (!isInWindow()) return // 窗口外跳过定时刷新
    const codes = typeof getCodes === 'function' ? getCodes() : getCodes
    fetchStockPrices(codes)
  }, PRICE_INTERVAL)
}

function stopStockPriceTimer() {
  if (priceTimer) {
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
