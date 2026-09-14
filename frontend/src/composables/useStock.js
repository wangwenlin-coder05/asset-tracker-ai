import { ref, computed } from 'vue'
import { calcStock } from '../utils/calculator'
import { stockApi } from '../utils/api'
import { calculateHoldingDays, calculateHoldingDaysByRange, num, sumByFilter } from '../utils/formatter'
import { useStockPrice } from './useStockPrice'

// 交易记录日志：写入后端 tx_logs 表，便于在设置面板查看
// 同时输出 console 便于开发期调试；写入失败不影响主流程
function logTx(action, stock, beforeCount, detail = {}) {
  const after = calcStock(stock)
  const beforeCalc = beforeCount != null ? beforeCount : '-'
  // eslint-disable-next-line no-console
  console.log(
    `[StockLog] ${action} stock=${stock?.code || stock?.id}  count ${beforeCalc} -> ${after.count}  (tradeCount=${after.tradeCount}, totalBuy=${after.totalBuyCount}, totalSell=${after.totalSellCount})`,
    detail
  )
  // fire-and-forget 写入后端，不 await、不抛错
  stockApi.createTxLog({
    stockId: stock?.id || '',
    stockCode: stock?.code || '',
    action,
    beforeCount: beforeCount != null ? beforeCount : 0,
    afterCount: after.count,
    totalBuy: after.totalBuyCount,
    totalSell: after.totalSellCount,
    tradeCount: after.tradeCount,
    detail
  }).catch(() => {})
}

const stocks = ref([])
const loading = ref(false)
const { stockPrices, fetchStockPrices } = useStockPrice()
const stockPrincipal = ref(parseFloat(localStorage.getItem('stockPrincipal')) || 0)

// 清仓记录排序：sortField 取值 default|sellDate|buyDate|holdingDays|profit|profitRate，sortOrder 取值 desc|asc
const clearedSortField = ref(localStorage.getItem('clearedSortField') || 'default')
const clearedSortOrder = ref(localStorage.getItem('clearedSortOrder') || 'desc')

// 排序历史栈，用于撤销
const clearedSortHistory = ref([])

function setClearedSort(field, order) {
  // 记录上一步状态
  clearedSortHistory.value.push({
    field: clearedSortField.value,
    order: clearedSortOrder.value
  })
  clearedSortField.value = field
  clearedSortOrder.value = order
  localStorage.setItem('clearedSortField', field)
  localStorage.setItem('clearedSortOrder', order)
}

function undoClearedSort() {
  if (clearedSortHistory.value.length === 0) return false
  const prev = clearedSortHistory.value.pop()
  clearedSortField.value = prev.field
  clearedSortOrder.value = prev.order
  localStorage.setItem('clearedSortField', prev.field)
  localStorage.setItem('clearedSortOrder', prev.order)
  return true
}

const canUndoClearedSort = computed(() => clearedSortHistory.value.length > 0)

// 安全数值转换
function safeNumber(v) {
  const n = Number(v)
  return Number.isFinite(n) ? n : 0
}

// 计算清仓股票的净盈利（现金流法，与 displayProfit 一致）
function getClearedStockProfit(stock) {
  const res = calcStock(stock)
  return safeNumber(res.totalSellNet) - safeNumber(res.totalBuyGross)
}

// 计算清仓股票的持仓天数
function getClearedHoldingDays(stock) {
  const base = safeNumber(stock.frozenHoldingDays)
  if (base) return base
  return safeNumber(calculateHoldingDaysByRange(stock.buyDate, stock.sellDate))
}

// 计算清仓股票的收益率
function getClearedProfitRate(stock) {
  const res = calcStock(stock)
  const totalBuyGross = safeNumber(res.totalBuyGross)
  if (totalBuyGross <= 0) return 0
  const profit = getClearedStockProfit(stock)
  return parseFloat(((profit / totalBuyGross) * 100).toFixed(2))
}

export function useStock() {
  const stockList = computed(() => stocks.value.filter(s => !s.isCleared))
  const clearedList = computed(() => {
    const list = stocks.value.filter(s => s.isCleared)
    const field = clearedSortField.value
    const order = clearedSortOrder.value
    const dir = order === 'desc' ? -1 : 1

    // 获取清仓时间（优先用 sellDate，其次用 clearedAt）
    const getClearTime = (s) => {
      const sd = s.sellDate || s.sell_date_str
      if (sd) return new Date(sd).getTime() || 0
      return safeNumber(s.clearedAt)
    }

    // 默认排序：按卖出日期（清仓时间）倒序
    if (field === 'default') {
      return [...list].sort((a, b) => getClearTime(b) - getClearTime(a))
    }

    return [...list].sort((a, b) => {
      let va, vb, cmp = 0

      switch (field) {
        case 'buyDate':
          va = a.buyDate || ''
          vb = b.buyDate || ''
          cmp = va.localeCompare(vb)
          break
        case 'holdingDays':
          va = getClearedHoldingDays(a)
          vb = getClearedHoldingDays(b)
          cmp = (va || 0) - (vb || 0)
          break
        case 'profit':
          va = getClearedStockProfit(a)
          vb = getClearedStockProfit(b)
          cmp = (va || 0) - (vb || 0)
          break
        case 'profitRate':
          va = getClearedProfitRate(a)
          vb = getClearedProfitRate(b)
          cmp = (va || 0) - (vb || 0)
          break
        case 'sellDate':
        default:
          va = a.sellDate || a.sell_date_str || ''
          vb = b.sellDate || b.sell_date_str || ''
          cmp = va.localeCompare(vb)
          break
      }

      if (cmp !== 0 && Number.isFinite(cmp)) return cmp * dir

      // 次级排序：同值时按清仓时间倒序
      return getClearTime(b) - getClearTime(a)
    })
  })

  const totalCost = computed(() => sumByFilter(stockList.value, () => true, stock => calcStock(stock).holdTotal))

  const totalPrincipal = computed(() => totalCost.value)

  const holdingAmount = computed(() => totalCost.value)

  const stockHoldingMarketValue = computed(() => {
    return stockList.value.reduce((sum, stock) => {
      const priceInfo = stockPrices.value[stock.code]
      const price = priceInfo?.price
      if (!Number.isFinite(price) || price <= 0) return sum
      return sum + price * num(stock.count)
    }, 0)
  })

  const stockTotalAssets = computed(() => stockPrincipal.value + totalProfit.value - holdingAmount.value + stockHoldingMarketValue.value)

  const trappedRatio = computed(() => {
    const totalAsset = stockPrincipal.value + totalProfit.value
    if (totalAsset <= 0) return 0
    return (holdingAmount.value / totalAsset) * 100
  })

  const totalProfit = computed(() => {
    // clearedList 当前周期的盈亏
    const clearedCycleProfit = sumByFilter(clearedList.value, () => true, stock => {
      const res = calcStock(stock)
      return safeNumber(res.totalSellNet) - safeNumber(res.totalBuyGross)
    })
    // 所有股票的累计盈亏（含已结算的历史周期）
    const accumulatedProfit = stocks.value.reduce((sum, s) => {
      return sum + (safeNumber(s.accumulatedProfit) || 0)
    }, 0)
    return clearedCycleProfit + accumulatedProfit
  })

  async function loadStocks(board = 'stock') {
    loading.value = true
    try {
      const data = await stockApi.getStocks(board)
      stocks.value = data
      const codes = data.filter(s => !s.isCleared && s.code).map(s => s.code)
      if (codes.length) await fetchStockPrices(codes, true)
    } catch (error) {
      console.error('Failed to load stocks:', error)
    } finally {
      loading.value = false
    }
  }

  function getStock(id) {
    return stocks.value.find(s => s.id === id)
  }

  async function refreshStock(id) {
    try {
      const data = await stockApi.getStock(id)
      const idx = stocks.value.findIndex(s => s.id === id)
      if (idx !== -1) {
        stocks.value.splice(idx, 1, data)
      }
    } catch (error) {
      console.error('Failed to refresh stock:', error)
    }
  }

  async function addStock(data) {
    try {
      const item = await stockApi.createStock(data)
      const stockItem = {
        id: item.id,
        name: data.name || '',
        code: data.code || '',
        cost: data.cost || 0,
        count: 0,
        sellPrice: data.sellPrice || null,
        position: data.position || 'full',
        buyDate: data.buyDate || '',
        buyPrice: data.buyPrice || null,
        board: data.board || 'stock',
        targetProfit: data.targetProfit || null,
        buyRecords: [],
        sellRecords: [],
        isCleared: false,
        notes: '',
        accumulatedProfit: 0
      }
      stocks.value.push(stockItem)
      return stockItem
    } catch (error) {
      console.error('Failed to add stock:', error)
      throw error
    }
  }

  async function updateStock(id, data) {
    try {
      await stockApi.updateStock(id, data)
      const index = stocks.value.findIndex(s => s.id === id)
      if (index !== -1) {
        stocks.value.splice(index, 1, { ...stocks.value[index], ...data })
      }
    } catch (error) {
      console.error('Failed to update stock:', error)
      throw error
    }
  }

  async function deleteStock(id) {
    try {
      await stockApi.deleteStock(id)
      stocks.value = stocks.value.filter(s => s.id !== id)
    } catch (error) {
      console.error('Failed to delete stock:', error)
      throw error
    }
  }

  async function clearStock(id) {
    try {
      await stockApi.clearStock(id)
      const index = stocks.value.findIndex(s => s.id === id)
      if (index !== -1) {
        const stock = stocks.value[index]
        // 冻结当前持仓天数
        const base = stock.frozenHoldingDays || 0
        stock.frozenHoldingDays = base + calculateHoldingDays(stock.buyDate)
        stock.isCleared = true
        stock.sellDate = new Date().toISOString().split('T')[0]
        stock.clearedAt = Date.now()
        // 持久化冻结天数
        stockApi.updateStock(id, { frozenHoldingDays: stock.frozenHoldingDays }).catch(() => {})
      }
    } catch (error) {
      console.error('Failed to clear stock:', error)
      throw error
    }
  }

  async function addBuyRecord(stockId, data) {
    try {
      const res = await stockApi.createBuyRecord(stockId, data)
      const stock = stocks.value.find(s => s.id === stockId)
      if (stock) {
        const beforeCount = stock.count != null ? stock.count : null
        // 已清仓股票加仓时，自动移回持仓列表
        if (stock.isCleared) {
          // 结算旧周期：将旧记录的已实现盈利累加到 accumulatedProfit
          const calcRes = calcStock(stock)
          const cycleProfit = parseFloat((calcRes.totalSellNet - calcRes.totalBuyGross).toFixed(2))
          stock.accumulatedProfit = parseFloat((Number(stock.accumulatedProfit) || 0 + cycleProfit).toFixed(2))
          // 持久化 accumulatedProfit 到后端
          stockApi.updateStock(stockId, { accumulatedProfit: stock.accumulatedProfit }).catch(() => {})
          // 重置交易记录，开始新周期
          stock.buyRecords = []
          stock.sellRecords = []
          stock.count = 0
          stock.isCleared = false
          stock.sellDate = ''
          stock.frozenHoldingDays = 0
          stock.buyDate = data.buyDate || stock.buyDate
        }
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
        if (!stock.buyRecords) stock.buyRecords = []
        stock.buyRecords.push(newRecord)
        // 不再手动累加 stock.count，统一由 calcStock 推导；此处同步刷新以保持输入框显示一致
        const calcRes = calcStock(stock)
        stock.count = calcRes.count
        logTx('addBuy', stock, beforeCount, {
          recordId: newRecord.id,
          buyDate: newRecord.buyDate,
          buyPrice: newRecord.buyPrice,
          buyCount: newRecord.buyCount,
          tType: newRecord.tType
        })
      }
    } catch (error) {
      console.error('Failed to add buy record:', error)
      throw error
    }
  }

  async function updateBuyRecord(stockId, recordId, data) {
    try {
      await stockApi.updateBuyRecord(stockId, recordId, data)
      const stock = stocks.value.find(s => s.id === stockId)
      if (stock && stock.buyRecords) {
        const record = stock.buyRecords.find(r => r.id === recordId)
        if (record) {
          if ('buyDate' in data) record.buyDate = data.buyDate
          if ('buyPrice' in data) record.buyPrice = data.buyPrice
          if ('buyCount' in data) record.buyCount = data.buyCount
          if ('commission' in data) record.commission = data.commission
          if ('transferFee' in data) record.transferFee = data.transferFee
          if ('tType' in data) record.tType = data.tType
          if ('tProfit' in data) record.tProfit = data.tProfit
          if ('costChange' in data) record.costChange = data.costChange
          if ('tGroupId' in data) record.tGroupId = data.tGroupId
        }
      }
    } catch (error) {
      console.error('Failed to update buy record:', error)
      throw error
    }
  }

  async function deleteBuyRecord(stockId, recordId) {
    try {
      await stockApi.deleteBuyRecord(stockId, recordId)
      const stock = stocks.value.find(s => s.id === stockId)
      if (stock && stock.buyRecords) {
        const idx = stock.buyRecords.findIndex(r => r.id === recordId)
        if (idx !== -1) {
          const beforeCount = stock.count != null ? stock.count : null
          const removed = stock.buyRecords[idx]
          stock.buyRecords.splice(idx, 1)
          // 统一由 calcStock 推导 count，避免手动累减与后端不一致
          const calcRes = calcStock(stock)
          stock.count = calcRes.count
          logTx('deleteBuy', stock, beforeCount, {
            recordId,
            removedBuyCount: removed?.buyCount,
            removedBuyPrice: removed?.buyPrice
          })
        }
      }
    } catch (error) {
      console.error('Failed to delete buy record:', error)
      throw error
    }
  }

  async function addSellRecord(stockId, data) {
    try {
      const res = await stockApi.createSellRecord(stockId, data)
      const stock = stocks.value.find(s => s.id === stockId)
      if (stock) {
        const beforeCount = stock.count != null ? stock.count : null
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
          netProfit: data.netProfit || 0,
          tType: data.tType || '',
          tProfit: data.tProfit != null ? data.tProfit : null,
          tPending: data.tPending || false,
          tGroupId: data.tGroupId || null,
          createdAt: Date.now()
        }
        if (!stock.sellRecords) stock.sellRecords = []
        stock.sellRecords.push(newRecord)
        // 不再手动累减，统一由 calcStock 推导，避免前后端不对称导致的「多录」
        const calcRes = calcStock(stock)
        stock.count = calcRes.count
        logTx('addSell', stock, beforeCount, {
          recordId: newRecord.id,
          sellDate: newRecord.sellDate,
          sellPrice: newRecord.sellPrice,
          sellCount: newRecord.sellCount,
          tType: newRecord.tType
        })
      }
    } catch (error) {
      console.error('Failed to add sell record:', error)
      throw error
    }
  }

  async function updateSellRecord(stockId, recordId, data) {
    try {
      await stockApi.updateSellRecord(stockId, recordId, data)
      const stock = stocks.value.find(s => s.id === stockId)
      if (stock && stock.sellRecords) {
        const record = stock.sellRecords.find(r => r.id === recordId)
        if (record) {
          if ('sellDate' in data) record.sellDate = data.sellDate
          if ('sellPrice' in data) record.sellPrice = data.sellPrice
          if ('sellCount' in data) record.sellCount = data.sellCount
          if ('sellCommission' in data) record.sellCommission = data.sellCommission
          if ('sellTransferFee' in data) record.sellTransferFee = data.sellTransferFee
          if ('stampTax' in data) record.stampTax = data.stampTax
          if ('netProfit' in data) record.netProfit = data.netProfit
          if ('tType' in data) record.tType = data.tType
          if ('tProfit' in data) record.tProfit = data.tProfit
          if ('tPending' in data) record.tPending = data.tPending
          if ('tGroupId' in data) record.tGroupId = data.tGroupId
        }
      }
    } catch (error) {
      console.error('Failed to update sell record:', error)
      throw error
    }
  }

  async function deleteSellRecord(stockId, recordId) {
    try {
      await stockApi.deleteSellRecord(stockId, recordId)
      const stock = stocks.value.find(s => s.id === stockId)
      if (stock && stock.sellRecords) {
        const idx = stock.sellRecords.findIndex(r => r.id === recordId)
        if (idx !== -1) {
          const beforeCount = stock.count != null ? stock.count : null
          const removed = stock.sellRecords[idx]
          stock.sellRecords.splice(idx, 1)
          // 统一由 calcStock 推导，避免回补方向反了
          const calcRes = calcStock(stock)
          stock.count = calcRes.count
          logTx('deleteSell', stock, beforeCount, {
            recordId,
            removedSellCount: removed?.sellCount,
            removedSellPrice: removed?.sellPrice
          })
        }
      }
    } catch (error) {
      console.error('Failed to delete sell record:', error)
      throw error
    }
  }

  return {
    stocks,
    loading,
    stockList,
    clearedList,
    totalCost,
    totalPrincipal,
    holdingAmount,
    stockHoldingMarketValue,
    stockTotalAssets,
    stockPrincipal,
    trappedRatio,
    totalProfit,
    clearedSortField,
    clearedSortOrder,
    canUndoClearedSort,
    setClearedSort,
    undoClearedSort,
    loadStocks,
    fetchStockPrices,
    getStock,
    refreshStock,
    addStock,
    updateStock,
    deleteStock,
    clearStock,
    addBuyRecord,
    updateBuyRecord,
    deleteBuyRecord,
    addSellRecord,
    updateSellRecord,
    deleteSellRecord
  }
}
