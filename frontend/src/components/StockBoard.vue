<template>
  <div>
    <MarketTicker ref="marketTickerRef" />
    <div id="stockList" class="space-y-3 overflow-x-auto px-2">
      <template v-if="loading">
        <div class="text-center py-8 text-slate-400">加载中...</div>
      </template>
      <template v-else-if="stockList.length === 0">
        <div class="board-empty">
          <Database class="w-12 h-12 opacity-40 mx-auto mb-3" />
          <p>暂无股票持仓记录</p>
          <p class="text-xs mt-2">点击右下角按钮新增买入</p>
        </div>
      </template>
      <template v-else>
        <StockCard
          v-for="stock in stockList"
          :key="stock.id"
          :stock="stock"
          :realtime-price="stockPrices[stock.code] || null"
          @buy="openBuyDialog"
          @sell="openSellDialog"
          @clear="handleClearStock"
          @delete="handleDeleteStock"
          @delete-transaction="handleDeleteTransaction"
          @update="handleUpdateStock"
          @update-transaction="handleUpdateTransaction"
          @quick-record="handleQuickRecord"
          @change-tx-type="handleChangeTxType"
        />
      </template>
    </div>
    <div v-if="clearedList.length > 0" id="clearedSection" class="mt-6">
      <div class="px-2 mb-3 flex items-center justify-between gap-3 flex-wrap">
        <h3 class="text-sm font-semibold text-slate-600 flex items-center gap-2">
          <Archive class="w-4 h-4" />
          清仓记录（{{ clearedList.length }}）
        </h3>
        <div class="flex items-center gap-2 text-xs">
          <span class="text-slate-400">排序:</span>
          <select
            :value="clearedSortField"
            @change="changeSortField($event.target.value)"
            class="border border-slate-200 rounded px-2 py-1 text-xs bg-white focus:ring-1 focus:ring-blue-300 focus:border-blue-400 outline-none"
          >
            <option v-for="opt in sortOptions" :key="opt.field" :value="opt.field">{{ opt.label }}</option>
          </select>
          <button
            v-if="clearedSortField !== 'default'"
            @click="toggleSortOrder"
            class="border border-slate-200 rounded px-2 py-1 text-xs bg-white hover:bg-slate-50 hover:border-slate-300 transition-all flex items-center gap-1"
            :title="clearedSortOrder === 'desc' ? '降序，点击切换为升序' : '升序，点击切换为降序'"
          >
            <component :is="clearedSortOrder === 'desc' ? ArrowDownAZ : ArrowUpAZ" class="w-3.5 h-3.5" />
            <span>{{ clearedSortOrder === 'desc' ? '降序' : '升序' }}</span>
          </button>
          <button
            v-if="canUndoClearedSort"
            @click="handleUndoSort"
            class="border border-slate-200 rounded px-2 py-1 text-xs bg-white hover:bg-slate-50 hover:border-slate-300 transition-all flex items-center gap-1"
            title="撤销上一步排序"
          >
            <Undo2 class="w-3.5 h-3.5" />
            <span>撤销</span>
          </button>
        </div>
      </div>
      <div id="clearedList" class="space-y-3 px-2">
        <StockCard
          v-for="stock in clearedList"
          :key="stock.id"
          :stock="stock"
          @buy="openBuyDialog"
          @sell="openSellDialog"
          @clear="handleClearStock"
          @delete="handleDeleteStock"
          @delete-transaction="handleDeleteTransaction"
          @update="handleUpdateStock"
          @update-transaction="handleUpdateTransaction"
          @quick-record="handleQuickRecord"
          @change-tx-type="handleChangeTxType"
        />
      </div>
    </div>
    <button @click="showNewStockDialog = true" class="fixed bottom-6 right-6 z-30 flex items-center gap-1.5 rounded-full bg-blue-600 px-4 py-2.5 text-sm font-medium text-white shadow-lg shadow-blue-600/25 transition hover:-translate-y-0.5 hover:bg-blue-700" title="新增买入">
      <Plus class="h-4 w-4" />
      新增买入
    </button>
    <NewStockDialog
      v-if="showNewStockDialog"
      @close="showNewStockDialog = false"
      @confirm="handleAddStock"
    />
    <BuyRecordDialog
      v-if="showBuyDialog"
      :stock-id="currentStockId"
      :is-first-buy="currentStockBuyCount === 0"
      :stock="currentStock"
      @close="showBuyDialog = false"
      @confirm="handleAddBuyRecord"
    />
    <SellRecordDialog
      v-if="showSellDialog"
      :stock-id="currentStockId"
      :stock="currentStock"
      @close="showSellDialog = false"
      @confirm="handleAddSellRecord"
    />
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onBeforeUnmount, watch } from 'vue'
import { Database, Archive, Plus, ArrowDownAZ, ArrowUpAZ, Undo2 } from 'lucide-vue-next'
import StockCard from './StockCard.vue'
import MarketTicker from './MarketTicker.vue'
import NewStockDialog from './dialogs/NewStockDialog.vue'
import BuyRecordDialog from './dialogs/BuyRecordDialog.vue'
import SellRecordDialog from './dialogs/SellRecordDialog.vue'
import { useStock } from '../composables/useStock'
import { useStockPrice } from '../composables/useStockPrice'
import { calcStock, calcSellFee } from '../utils/calculator'

const marketTickerRef = ref(null)
function restartMarketPolling() { return marketTickerRef.value?.restartMarketPolling?.() }

function genTGroupId() {
  return 'tg_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8)
}

const {
  stockList,
  clearedList,
  loading,
  clearedSortField,
  clearedSortOrder,
  canUndoClearedSort,
  setClearedSort,
  undoClearedSort,
  loadStocks,
  addStock,
  updateStock,
  deleteStock,
  clearStock,
  addBuyRecord,
  updateBuyRecord,
  deleteBuyRecord,
  addSellRecord,
  updateSellRecord,
  deleteSellRecord,
  getStock,
  refreshStock
} = useStock()

const sortOptions = [
  { field: 'default', label: '默认排序' },
  { field: 'sellDate', label: '卖出日期' },
  { field: 'buyDate', label: '买入日期' },
  { field: 'holdingDays', label: '持仓天数' },
  { field: 'profit', label: '盈利金额' },
  { field: 'profitRate', label: '收益率' }
]

function toggleSortOrder() {
  const newOrder = clearedSortOrder.value === 'desc' ? 'asc' : 'desc'
  setClearedSort(clearedSortField.value, newOrder)
}

function changeSortField(field) {
  // 默认排序固定降序
  const order = field === 'default' ? 'desc' : clearedSortOrder.value
  setClearedSort(field, order)
}

function handleUndoSort() {
  undoClearedSort()
}

const { stockPrices, fetchStockPrices, startStockPriceTimer, stopStockPriceTimer } = useStockPrice()

const allStockCodes = computed(() => {
  const codes = new Set()
  stockList.value.forEach(s => { if (s.code) codes.add(String(s.code).trim()) })
  return [...codes]
})

function refreshStockPrices(force = false) {
  if (allStockCodes.value.length) fetchStockPrices(allStockCodes.value, force)
}

onMounted(async () => {
  await loadStocks()
  refreshStockPrices(true) // 启动时无条件请求一次（即使收盘）
  startStockPriceTimer(() => allStockCodes.value)
})

onBeforeUnmount(() => {
  stopStockPriceTimer()
})

watch(allStockCodes, () => {
  refreshStockPrices() // 代码变化时请求（窗口外跳过）
}, { deep: true })

const showNewStockDialog = ref(false)
const showBuyDialog = ref(false)
const showSellDialog = ref(false)
const currentStockId = ref(null)

const currentStock = computed(() => getStock(currentStockId.value))
const currentStockBuyCount = computed(() => {
  const stock = getStock(currentStockId.value)
  return stock?.buyRecords?.length || 0
})

async function init() {
  await loadStocks()
}

init()

function openBuyDialog(stockId) {
  currentStockId.value = stockId
  showBuyDialog.value = true
}

function openSellDialog(stockId) {
  currentStockId.value = stockId
  showSellDialog.value = true
}

async function handleAddStock(data) {
  const stock = await addStock(data)
  showNewStockDialog.value = false

  const commission = Math.max(data.buyPrice * data.count * 0.00023, 5.00)
  const transferFee = data.buyPrice * data.count * 0.00001

  await addBuyRecord(stock.id, {
    buyDate: data.buyDate,
    buyPrice: data.buyPrice,
    buyCount: data.count,
    commission,
    transferFee,
    tType: ''
  })
  // 新建股票+首条买入记录后，统一从后端拉取校准，避免 stocks.count 与 buy_records 不一致
  await refreshStock(stock.id)

  refreshStockPrices(true)
}

async function handleUpdateStock(stockId, data) {
  await updateStock(stockId, data)
}

async function handleDeleteStock(stockId) {
  if (confirm('确定删除该股票？')) {
    await deleteStock(stockId)
  }
}

async function handleClearStock(stockId, sellPrice, tradeCount, avgCost) {
  if (!confirm(`确定以 ${sellPrice} 元价格清仓 ${tradeCount} 股吗？`)) return

  if (sellPrice > 0 && tradeCount > 0) {
    const fees = calcSellFee(sellPrice, tradeCount)
    const netProfit = parseFloat(((sellPrice - avgCost) * tradeCount - fees.total).toFixed(2))
    const today = new Date().toISOString().split('T')[0]
    await addSellRecord(stockId, {
      sellDate: today,
      sellPrice,
      sellCount: tradeCount,
      sellCommission: fees.commission,
      sellTransferFee: fees.transferFee,
      stampTax: fees.stampTax,
      netProfit
    })
  }
  await clearStock(stockId)
}

async function handleAddBuyRecord(data) {
  const stock = getStock(currentStockId.value)
  let tGroupId = null
  let costChange = 0

  if (data.tType === '正T') {
    // 正T买入：创建新T组，等待正T卖出
    tGroupId = genTGroupId()
  } else if (data.tType === '反T承接') {
    // 反T承接：找待承接的反T卖出
    const pendingSell = stock?.sellRecords?.find(s => s.tType === '反T' && s.tPending)
    if (pendingSell) {
      tGroupId = pendingSell.tGroupId
      // 计算T组净盈利
      const buyAmount = data.buyPrice * data.buyCount
      const sellAmount = pendingSell.sellPrice * pendingSell.sellCount
      const buyFees = (data.commission || 0) + (data.transferFee || 0)
      const sellFees = (pendingSell.sellCommission || 0) + (pendingSell.sellTransferFee || 0) + (pendingSell.stampTax || 0)
      costChange = sellAmount - buyAmount - buyFees - sellFees
      // 标记卖出不再pending
      await updateSellRecord(currentStockId.value, pendingSell.id, { tPending: false })
    }
  }
  // 补仓 / 首次建仓：无tGroupId

  await addBuyRecord(currentStockId.value, {
    ...data,
    tGroupId,
    costChange
  })
  // 加仓后强制从后端拉取，校准前端 stock.count 与 buyRecords/sellRecords
  await refreshStock(currentStockId.value)
  showBuyDialog.value = false
}

async function handleUpdateTransaction(stockId, type, recordId, data) {
  if (type === 'buy') {
    await updateBuyRecord(stockId, recordId, data)
  } else {
    await updateSellRecord(stockId, recordId, data)
  }
  await refreshStock(stockId)
}

async function handleChangeTxType(stockId, tx, newType) {
  const stock = getStock(stockId)
  if (!stock) return

  const isTType = ['正T', '反T承接', '正T卖出', '反T'].includes(newType)
  const wasInGroup = !!tx.tGroupId

  if (wasInGroup) {
    if (tx.type === 'buy') {
      await updateBuyRecord(stockId, tx.id, { tType: '', tGroupId: null })
    } else {
      await updateSellRecord(stockId, tx.id, { tType: '', tGroupId: null, tPending: false })
    }
    await refreshStock(stockId)
  }

  const refreshedStock = getStock(stockId)
  if (!refreshedStock) return

  if (!isTType) {
    if (tx.type === 'buy') {
      await updateBuyRecord(stockId, tx.id, { tType: newType })
    } else {
      await updateSellRecord(stockId, tx.id, { tType: newType })
    }
  } else if (tx.type === 'buy') {
    if (newType === '正T') {
      const tGroupId = genTGroupId()
      await updateBuyRecord(stockId, tx.id, { tType: '正T', tGroupId })
    } else if (newType === '反T承接') {
      const pendingSell = refreshedStock.sellRecords?.find(s =>
        s.tType === '反T' && s.tPending && s.tGroupId
      )
      if (pendingSell) {
        const buyAmount = tx.buyPrice * tx.buyCount
        const sellAmount = pendingSell.sellPrice * pendingSell.sellCount
        const buyFees = (tx.commission || 0) + (tx.transferFee || 0)
        const sellFees = (pendingSell.sellCommission || 0) + (pendingSell.sellTransferFee || 0) + (pendingSell.stampTax || 0)
        const costChange = sellAmount - buyAmount - buyFees - sellFees
        await updateBuyRecord(stockId, tx.id, { tType: '反T承接', tGroupId: pendingSell.tGroupId, costChange })
        await updateSellRecord(stockId, pendingSell.id, { tPending: false })
      } else {
        await updateBuyRecord(stockId, tx.id, { tType: '反T承接' })
      }
    }
  } else {
    if (newType === '正T卖出') {
      const pendingBuy = refreshedStock.buyRecords?.find(b =>
        b.tType === '正T' && b.tGroupId &&
        !refreshedStock.sellRecords?.some(s => s.tGroupId === b.tGroupId)
      )
      if (pendingBuy) {
        const sellAmount = tx.sellPrice * tx.sellCount
        const buyAmount = pendingBuy.buyPrice * pendingBuy.buyCount
        const buyFees = (pendingBuy.commission || 0) + (pendingBuy.transferFee || 0)
        const sellFees = (tx.sellCommission || 0) + (tx.sellTransferFee || 0) + (tx.stampTax || 0)
        const costChange = sellAmount - buyAmount - buyFees - sellFees
        await updateSellRecord(stockId, tx.id, { tType: '正T卖出', tGroupId: pendingBuy.tGroupId })
        await updateBuyRecord(stockId, pendingBuy.id, { costChange })
      } else {
        await updateSellRecord(stockId, tx.id, { tType: '正T卖出' })
      }
    } else if (newType === '反T') {
      const tGroupId = genTGroupId()
      await updateSellRecord(stockId, tx.id, { tType: '反T', tGroupId, tPending: true })
    }
  }

  await refreshStock(stockId)
}

async function handleDeleteTransaction(stockId, type, recordId) {
  if (confirm('确定删除该交易记录？')) {
    if (type === 'buy') {
      await deleteBuyRecord(stockId, recordId)
    } else {
      await deleteSellRecord(stockId, recordId)
    }
    await refreshStock(stockId)
  }
}

async function handleQuickRecord(stockId, groupItem, price) {
  const stock = getStock(stockId)
  const firstTx = groupItem.rows[0].tx
  const today = new Date().toISOString().slice(0, 10)

  if (groupItem.tType === '正T') {
    // 正T：已有买入，录入卖出
    const sellAmt = price * firstTx.buyCount
    const sellCommission = Math.max(sellAmt * 0.00023, 5)
    const sellTransferFee = sellAmt * 0.00001
    const stampTax = sellAmt * 0.001
    const sellFees = sellCommission + sellTransferFee + stampTax

    const buyAmount = firstTx.buyPrice * firstTx.buyCount
    const buyFees = (firstTx.commission || 0) + (firstTx.transferFee || 0)
    const costChange = sellAmt - buyAmount - buyFees - sellFees

    const calcRes = calcStock(stock)
    const netProfit = parseFloat(((price - calcRes.avgCost) * firstTx.buyCount - sellFees).toFixed(2))

    await addSellRecord(stockId, {
      sellDate: today,
      sellPrice: price,
      sellCount: firstTx.buyCount,
      sellCommission,
      sellTransferFee,
      stampTax,
      netProfit,
      tType: '正T卖出',
      tGroupId: firstTx.tGroupId,
      tPending: false
    })
    await updateBuyRecord(stockId, firstTx.id, { costChange })
  } else {
    // 反T：已有卖出，录入买入承接
    const buyAmt = price * firstTx.sellCount
    const commission = Math.max(buyAmt * 0.00023, 5)
    const transferFee = buyAmt * 0.00001

    const sellAmount = firstTx.sellPrice * firstTx.sellCount
    const sellFees = (firstTx.sellCommission || 0) + (firstTx.sellTransferFee || 0) + (firstTx.stampTax || 0)
    const costChange = sellAmount - buyAmt - commission - transferFee - sellFees

    await addBuyRecord(stockId, {
      buyDate: today,
      buyPrice: price,
      buyCount: firstTx.sellCount,
      commission,
      transferFee,
      tType: '反T承接',
      tGroupId: firstTx.tGroupId,
      costChange
    })
    await updateSellRecord(stockId, firstTx.id, { tPending: false })
  }
  await refreshStock(stockId)
}

async function handleAddSellRecord(data) {
  const stock = getStock(currentStockId.value)
  const calcRes = calcStock(stock)
  let tGroupId = null
  let tPending = false
  let costChange = 0
  let netProfit = 0

  const sellAmount = data.sellPrice * data.sellCount
  const sellFees = (data.sellCommission || 0) + (data.sellTransferFee || 0) + (data.stampTax || 0)

  if (data.tType === '反T') {
    tGroupId = genTGroupId()
    tPending = true
    netProfit = parseFloat(((data.sellPrice - calcRes.avgCost) * data.sellCount - sellFees).toFixed(2))
  } else if (data.tType === '正T卖出') {
    const pendingBuy = stock?.buyRecords?.find(b => {
      if (b.tType !== '正T' || !b.tGroupId) return false
      return !stock.sellRecords?.some(s => s.tGroupId === b.tGroupId)
    })
    if (pendingBuy) {
      tGroupId = pendingBuy.tGroupId
      const buyAmount = pendingBuy.buyPrice * pendingBuy.buyCount
      const buyFees = (pendingBuy.commission || 0) + (pendingBuy.transferFee || 0)
      costChange = sellAmount - buyAmount - buyFees - sellFees
      // T组净盈利基于配对买入价计算
      netProfit = parseFloat(((data.sellPrice - pendingBuy.buyPrice) * data.sellCount - buyFees - sellFees).toFixed(2))
      await updateBuyRecord(currentStockId.value, pendingBuy.id, { costChange })
    } else {
      netProfit = parseFloat(((data.sellPrice - calcRes.avgCost) * data.sellCount - sellFees).toFixed(2))
    }
  } else {
    netProfit = parseFloat(((data.sellPrice - calcRes.avgCost) * data.sellCount - sellFees).toFixed(2))
  }

  await addSellRecord(currentStockId.value, {
    ...data,
    netProfit,
    tGroupId,
    tPending
  })
  // 卖出后强制从后端拉取，校准前端 stock.count
  await refreshStock(currentStockId.value)
  showSellDialog.value = false
}

defineExpose({ loadStocks, restartMarketPolling })
</script>
