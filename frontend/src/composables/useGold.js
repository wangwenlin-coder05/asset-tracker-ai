import { ref, computed } from 'vue'
import { calcGold } from '../utils/calculator'
import { stockApi, aiSettingsApi } from '../utils/api'
import { sumByFilter, findByKeyword, num } from '../utils/formatter'

const goldItems = ref([])
const loading = ref(false)
const todayPrice = ref(0)
const priceSource = ref('')
const priceMeta = ref({ source: '', updatedAt: '', fetchedAt: '', internationalPriceUsd: 0, market: '' })
const GOLD_WINDOW_START_HOUR = 9
const GOLD_WINDOW_END_HOUR = 23
const GOLD_WINDOW_MS = (GOLD_WINDOW_END_HOUR - GOLD_WINDOW_START_HOUR) * 60 * 60 * 1000
let priceTimer = null
let dailyCount = 50
let priceFetchPromise = null
let lastPriceFetchAt = 0
let configLoaded = false

function isInGoldWindow() {
  const h = new Date().getHours()
  return h >= GOLD_WINDOW_START_HOUR && h < GOLD_WINDOW_END_HOUR
}

function computeInterval() {
  const n = Math.max(1, Math.min(500, dailyCount))
  return Math.max(60 * 1000, Math.floor(GOLD_WINDOW_MS / n))
}

function startGoldTimer() {
  if (priceTimer) {
    clearInterval(priceTimer)
    priceTimer = null
  }
  const interval = computeInterval()
  console.log('[GoldPrice] Timer started, interval =', Math.round(interval / 1000 / 60), 'min, dailyCount =', dailyCount)
  priceTimer = setInterval(() => {
    if (!isInGoldWindow()) {
      console.log('[GoldPrice] Outside 8-23 window, skip fetch')
      return
    }
    fetchGoldPrice(true)
  }, interval)
}

async function loadGoldConfig() {
  if (configLoaded) return
  try {
    const settings = await aiSettingsApi.getSettings()
    if (settings?.gold_daily_count) {
      dailyCount = Math.max(1, Math.min(500, Number(settings.gold_daily_count) || 50))
    }
    configLoaded = true
    startGoldTimer()
  } catch (err) {
    console.warn('[GoldPrice] loadGoldConfig failed, use default 50:', err.message)
    configLoaded = true
    startGoldTimer()
  }
}

export function useGold() {
  const groupedGold = computed(() => {
    const groups = {}
    const orderedItems = [...goldItems.value].sort((a, b) => {
      const aPhysical = (a.name || '').includes('????') ? 1 : 0
      const bPhysical = (b.name || '').includes('????') ? 1 : 0
      return aPhysical - bPhysical
    })
    orderedItems.forEach(item => {
      const groupName = item.name || '???'
      if (!groups[groupName]) groups[groupName] = []
      groups[groupName].push(item)
    })
    return groups
  })

  const totalAmount = computed(() => sumByFilter(goldItems.value, () => true, item => calcGold(item).totalAmount))

  const totalGrams = computed(() => sumByFilter(goldItems.value, () => true, item => calcGold(item).totalGrams))

  const avgPrice = computed(() => totalGrams.value === 0 ? 0 : totalAmount.value / totalGrams.value)

  // 均价计算过程明细：所有黄金的累计买入总额、卖出总额
  const totalBuyAmount = computed(() => goldItems.value.reduce((sum, item) => {
    return sum + (item.buyRecords || []).reduce((s, r) => s + (r.buyPrice || 0) * (r.buyCount || 0) + (r.commission || 0), 0)
  }, 0))
  const totalSellAmount = computed(() => goldItems.value.reduce((sum, item) => {
    return sum + (item.sellRecords || []).reduce((s, r) => s + (r.sellPrice || 0) * (r.sellCount || 0) - (r.sellCommission || 0), 0)
  }, 0))

  const marketValue = computed(() => todayPrice.value === 0 ? 0 : todayPrice.value * totalGrams.value)

  const profitLoss = computed(() => marketValue.value - totalAmount.value)

  const profitLossRate = computed(() => {
    if (totalAmount.value === 0) return 0
    return (profitLoss.value / totalAmount.value) * 100
  })

  function getMarketValueByKeyword(keyword) {
    const item = findByKeyword(goldItems.value, keyword)
    if (!item) return 0
    const calcRes = calcGold(item)
    return todayPrice.value * calcRes.totalGrams
  }

  const zheshangMarketValue = computed(() => getMarketValueByKeyword('浙商'))
  const ccbMarketValue = computed(() => getMarketValueByKeyword('建行'))
  const physicalMarketValue = computed(() => getMarketValueByKeyword('实物'))

  async function loadGoldItems() {
    loading.value = true
    try {
      const data = await stockApi.getStocks('gold')
      goldItems.value = data
    } catch (error) {
      console.error('Failed to load gold items:', error)
    } finally {
      loading.value = false
    }
  }

  async function addGoldItem(data) {
    try {
      const item = await stockApi.createStock({ ...data, board: 'gold' })
      goldItems.value.push(item)
      return item
    } catch (error) {
      console.error('Failed to add gold item:', error)
      throw error
    }
  }

  async function updateGoldItem(id, data) {
    try {
      await stockApi.updateStock(id, data)
      const index = goldItems.value.findIndex(item => item.id === id)
      if (index !== -1) {
        goldItems.value[index] = { ...goldItems.value[index], ...data }
      }
    } catch (error) {
      console.error('Failed to update gold item:', error)
      throw error
    }
  }

  async function deleteGoldItem(id) {
    try {
      await stockApi.deleteStock(id)
      goldItems.value = goldItems.value.filter(item => item.id !== id)
    } catch (error) {
      console.error('Failed to delete gold item:', error)
      throw error
    }
  }

  async function addBuyRecord(goldId, data) {
    try {
      const res = await stockApi.createBuyRecord(goldId, data)
      const goldItem = getGold(goldId)
      if (goldItem) {
        const newRecord = {
          id: res.id,
          buyDate: data.buyDate || '',
          buyPrice: data.buyPrice,
          buyCount: data.buyCount,
          commission: data.commission || 0,
          transferFee: data.transferFee || 0,
          handlingFee: data.handlingFee || 0,
          regulatoryFee: data.regulatoryFee || 0,
          tType: data.tType || '',
          tProfit: data.tProfit != null ? data.tProfit : null,
          costChange: data.costChange || 0,
          tGroupId: data.tGroupId || null,
          createdAt: Date.now()
        }
        if (!goldItem.buyRecords) goldItem.buyRecords = []
        goldItem.buyRecords.push(newRecord)
      }
    } catch (error) {
      console.error('Failed to add gold buy record:', error)
      throw error
    }
  }

  async function addSellRecord(goldId, data) {
    try {
      const res = await stockApi.createSellRecord(goldId, data)
      const goldItem = getGold(goldId)
      if (goldItem) {
        const newRecord = {
          id: res.id,
          sellDate: data.sellDate || '',
          sellPrice: data.sellPrice,
          sellCount: data.sellCount,
          sellCommission: data.sellCommission || 0,
          sellTransferFee: data.sellTransferFee || 0,
          stampTax: data.stampTax || 0,
          handlingFee: data.handlingFee || 0,
          regulatoryFee: data.regulatoryFee || 0,
          otherFee: data.otherFee || 0,
          netProfit: data.netProfit != null ? data.netProfit : null,
          tType: data.tType || '',
          tProfit: data.tProfit != null ? data.tProfit : null,
          tPending: data.tPending || false,
          tGroupId: data.tGroupId || null,
          createdAt: Date.now()
        }
        if (!goldItem.sellRecords) goldItem.sellRecords = []
        goldItem.sellRecords.push(newRecord)
      }
    } catch (error) {
      console.error('Failed to add gold sell record:', error)
      throw error
    }
  }

  async function deleteTransaction(goldId, transactionId, txType) {
    try {
      if (txType === 'buy') {
        await stockApi.deleteBuyRecord(goldId, transactionId)
        const goldItem = getGold(goldId)
        if (goldItem && goldItem.buyRecords) {
          const idx = goldItem.buyRecords.findIndex(r => r.id === transactionId)
          if (idx !== -1) {
            goldItem.buyRecords.splice(idx, 1)
          }
        }
      } else {
        await stockApi.deleteSellRecord(goldId, transactionId)
        const goldItem = getGold(goldId)
        if (goldItem && goldItem.sellRecords) {
          const idx = goldItem.sellRecords.findIndex(r => r.id === transactionId)
          if (idx !== -1) {
            goldItem.sellRecords.splice(idx, 1)
          }
        }
      }
    } catch (error) {
      console.error('Failed to delete transaction:', error)
    }
  }

  function getGold(id) {
    return goldItems.value.find(item => item.id === id)
  }

  async function fetchGoldPrice(force = false) {
    console.log('[GoldPrice] fetchGoldPrice called, force =', force)
    if (!force && todayPrice.value && Date.now() - lastPriceFetchAt < 30000) {
      console.log('[GoldPrice] Skipped (throttled), last fetch', Date.now() - lastPriceFetchAt, 'ms ago')
      return priceMeta.value
    }
    if (priceFetchPromise) {
      console.log('[GoldPrice] Skipped (already fetching), returning existing promise')
      return priceFetchPromise
    }
    priceFetchPromise = (async () => {
      try {
        console.log('[GoldPrice] Fetching /api/gold-price ...')
        const url = force ? '/api/gold-price?force=1' : '/api/gold-price'
        const res = await fetch(url, { cache: 'no-store' })
        console.log('[GoldPrice] Response status:', res.status)
        if (!res.ok) {
          console.warn('[GoldPrice] API returned non-OK status', res.status)
          return priceMeta.value
        }
        const data = await res.json()
        console.log('[GoldPrice] API response data:', data)
        if (data && data.price) {
          const oldPrice = todayPrice.value
          todayPrice.value = Number(data.price)
          priceSource.value = data.source || 'free-gold-api'
          priceMeta.value = {
            source: data.source || '',
            updatedAt: data.updatedAt || '',
            fetchedAt: data.fetchedAt || new Date().toISOString(),
            internationalPriceUsd: Number(data.internationalPriceUsd) || 0,
            market: data.market || 'AU9999'
          }
          lastPriceFetchAt = Date.now()
          console.log('[GoldPrice] Updated: oldPrice =', oldPrice, '→ newPrice =', todayPrice.value, '| source =', priceSource.value)
        } else {
          console.warn('[GoldPrice] No price in response data', data)
        }
        return priceMeta.value
      } catch (error) {
        console.error('[GoldPrice] Fetch failed:', error)
        if (!todayPrice.value) todayPrice.value = 720
        priceSource.value = 'last-known-price'
        return priceMeta.value
      } finally {
        priceFetchPromise = null
      }
    })()
    return priceFetchPromise
  }

  async function reloadGoldConfig() {
    configLoaded = false
    await loadGoldConfig()
  }

  if (!priceTimer) {
    loadGoldConfig().then(() => {
      if (isInGoldWindow() && !todayPrice.value) fetchGoldPrice()
    })
  }

  return {
    goldItems,
    loading,
    todayPrice,
    priceSource,
    priceMeta,
    groupedGold,
    totalAmount,
    totalGrams,
    avgPrice,
    marketValue,
    profitLoss,
    profitLossRate,
    totalBuyAmount,
    totalSellAmount,
    zheshangMarketValue,
    ccbMarketValue,
    physicalMarketValue,
    loadGoldItems,
    addGoldItem,
    updateGoldItem,
    deleteGoldItem,
    addBuyRecord,
    addSellRecord,
    deleteTransaction,
    getGold,
    fetchGoldPrice,
    reloadGoldConfig
  }
}
