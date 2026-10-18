<template>
  <div>
    <MarketTicker v-if="!analysisOnly" ref="marketTickerRef" />
    <div v-if="!analysisOnly && priceMetaText" class="flex items-center justify-end gap-1.5 mb-1.5 text-[11px] text-slate-400">
      <span>{{ priceMetaText }}</span>
      <span v-if="stockPriceMeta.stale" class="text-amber-500">· 获取失败，可能已过期</span>
    </div>
    <div v-if="!analysisOnly" id="stockList" class="space-y-3 overflow-x-auto">
      <!-- 仅「首次尚无任何数据」时显示加载框；已有数据后的刷新一律静默，避免列表在骨架与内容间反复跳动 -->
      <template v-if="loading && stocks.length === 0">
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
          v-for="stock in displayStockList"
          :key="stock.id"
          :stock="stock"
          :realtime-price="stockPrices[stock.code] || null"
          @buy="openBuyDialog"
          @sell="openSellDialog"
          @clear="openClearDialog"
          @delete="handleDeleteStock"
          @delete-transaction="handleDeleteTransaction"
          @update="handleUpdateStock"
          @update-transaction="handleUpdateTransaction"
          @quick-record="handleQuickRecord"
          @change-tx-type="handleChangeTxType"
        />
      </template>
    </div>
    <div v-if="!analysisOnly && clearedList.length > 0" id="clearedSection" class="mt-6">
      <div class="mb-3 flex items-center justify-between gap-3 flex-wrap">
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
          @clear="openClearDialog"
          @delete="handleDeleteStock"
          @delete-transaction="handleDeleteTransaction"
          @update="handleUpdateStock"
          @update-transaction="handleUpdateTransaction"
          @quick-record="handleQuickRecord"
          @change-tx-type="handleChangeTxType"
        />
      </div>
    </div>
    <button v-if="!analysisOnly" @click="openNewStockDialog" class="fixed bottom-6 right-6 z-30 flex items-center gap-1.5 rounded-full bg-blue-600 px-4 py-2.5 text-sm font-medium text-white shadow-lg shadow-blue-600/25 transition hover:-translate-y-0.5 hover:bg-blue-700" title="新增买入">
      <Plus class="h-4 w-4" />
      新增买入
    </button>
    <StockWatchPanel
      ref="watchPanelRef"
      :page-mode="analysisOnly"
      :stock-prices="stockPrices"
      :holding-stocks="stockList"
      :cleared-stocks="clearedList"
      @refresh-price="refreshStockPrices"
      @buy="handleWatchBuy"
      @sell="handleWatchSell"
    />
    <NewStockDialog
      v-if="showNewStockDialog"
      :prefill="newStockPrefill"
      @close="closeNewStockDialog"
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
    <ClearStockDialog
      v-if="showClearDialog"
      :stock-id="currentStockId"
      :stock="currentStock"
      @close="showClearDialog = false"
      @confirm="handleClearStock"
    />
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onBeforeUnmount, watch } from 'vue'
import { Database, Archive, Plus, ArrowDownAZ, ArrowUpAZ, Undo2 } from 'lucide-vue-next'
import StockCard from './StockCard.vue'
import MarketTicker from './MarketTicker.vue'
import StockWatchPanel from './StockWatchPanel.vue'
import NewStockDialog from './dialogs/NewStockDialog.vue'
import BuyRecordDialog from './dialogs/BuyRecordDialog.vue'
import SellRecordDialog from './dialogs/SellRecordDialog.vue'
import ClearStockDialog from './dialogs/ClearStockDialog.vue'
import { useStock } from '../composables/useStock'
import { useStockPrice } from '../composables/useStockPrice'
import { calcStock } from '../utils/calculator'
import { buyFeeParts, sellFeeParts } from '../utils/feeConfig'
import { toast } from '../utils/toast'

// 仅渲染每日分析页面（用于独立页面模式，隐藏股票列表等其它内容）
defineProps({
  analysisOnly: { type: Boolean, default: false }
})

const marketTickerRef = ref(null)
function restartMarketPolling() { return marketTickerRef.value?.restartMarketPolling?.() }

function genTGroupId() {
  return 'tg_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8)
}

// ===== 做T：T入 / T出 自动配对 =====
// 一个 T 组 = 一条买入腿（T入）+ 一条卖出腿（T出）。先录入的那条腿开组，
// 另一条腿录入时自动找到「只缺这一腿」的组配上去；不区分先买后卖还是先卖后买，跨日也能配。
function tRecordTime(rec) {
  return rec?.createdAt || String(rec?.buyDate || rec?.sellDate || '')
}
// needLeg：需要补上的那条腿，'buy' 找只缺买入腿的组，'sell' 找只缺卖出腿的组
function findPendingTGroup(stock, needLeg) {
  const other = needLeg === 'buy' ? 'sell' : 'buy'
  const groups = new Map()
  const put = (tGroupId, key, rec) => {
    if (!tGroupId) return
    const group = groups.get(tGroupId) || { buy: null, sell: null }
    group[key] = rec
    groups.set(tGroupId, group)
  }
  for (const b of stock?.buyRecords || []) put(b.tGroupId, 'buy', b)
  for (const s of stock?.sellRecords || []) put(s.tGroupId, 'sell', s)
  const candidates = []
  for (const [tGroupId, group] of groups) {
    if (!group[needLeg] && group[other]) candidates.push({ tGroupId, leg: group[other] })
  }
  // 同时有多组待配对时，先挂先配（按录入时间取最早的一条腿）
  candidates.sort((a, b) => String(tRecordTime(a.leg)).localeCompare(String(tRecordTime(b.leg))))
  return candidates[0] || null
}
// T 组净盈利 = 卖出净收入 - 买入总成本（买卖双边手续费都扣掉，与先后顺序无关）
function tGroupProfit(buy, sell) {
  const buyFees = (Number(buy?.commission) || 0) + (Number(buy?.transferFee) || 0) + (Number(buy?.handlingFee) || 0) + (Number(buy?.regulatoryFee) || 0)
  const sellFees = (Number(sell?.sellCommission) || 0) + (Number(sell?.sellTransferFee) || 0) + (Number(sell?.stampTax) || 0) + (Number(sell?.handlingFee) || 0) + (Number(sell?.regulatoryFee) || 0) + (Number(sell?.otherFee) || 0)
  const sellNet = (Number(sell?.sellPrice) || 0) * (Number(sell?.sellCount) || 0) - sellFees
  const buyCost = (Number(buy?.buyPrice) || 0) * (Number(buy?.buyCount) || 0) + buyFees
  return parseFloat((sellNet - buyCost).toFixed(2))
}

const {
  stocks,
  stockList,
  clearedList,
  loadingByBoard,
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

// 本看板（board = 'stock'）的加载态；加载态按看板隔离后互不干扰
const loading = computed(() => !!loadingByBoard.value.stock)

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

const { stockPrices, stockPriceMeta, fetchStockPrices, startStockPriceTimer, stopStockPriceTimer } = useStockPrice()

// 行情更新时间提示：数据源为盘中每 30s 拉取的现价
const priceMetaText = computed(() => {
  const at = stockPriceMeta.value?.fetchedAt
  if (!at) return ''
  const t = new Date(at)
  if (Number.isNaN(t.getTime())) return ''
  return `行情更新 ${t.toLocaleTimeString('zh-CN', { hour12: false, hour: '2-digit', minute: '2-digit' })}`
})

const allStockCodes = computed(() => {
  const codes = new Set()
  stockList.value.forEach(s => { if (s.code) codes.add(String(s.code).trim()) })
  return [...codes]
})

function refreshStockPrices(force = false) {
  if (allStockCodes.value.length) fetchStockPrices(allStockCodes.value, force)
}

// 持仓展示顺序：持仓 0 股但未清仓的排到持仓尾部。
// 顺序只在进入股票板块（数据加载完成）时拍一次快照，编辑过程中不重排；
// 切换到其他板块再切回后组件重新挂载，会自动按最新持仓重排。
const zeroTailIds = ref(new Set())
function snapshotHoldingOrder() {
  zeroTailIds.value = new Set(stockList.value.filter(s => (Number(s.count) || 0) <= 0).map(s => s.id))
}
const displayStockList = computed(() => {
  const tail = zeroTailIds.value
  const main = []
  const zero = []
  for (const s of stockList.value) {
    if (tail.has(s.id)) zero.push(s)
    else main.push(s)
  }
  return [...main, ...zero]
})

onMounted(async () => {
  await loadStocks()
  snapshotHoldingOrder()
  refreshStockPrices(true) // 启动时无条件请求一次（即使收盘）
  startStockPriceTimer('stock', () => allStockCodes.value)
})

onBeforeUnmount(() => {
  stopStockPriceTimer('stock')
})

watch(allStockCodes, () => {
  refreshStockPrices() // 代码变化时请求（窗口外跳过）
}, { deep: true })

const showNewStockDialog = ref(false)
const showBuyDialog = ref(false)
const showSellDialog = ref(false)
const showClearDialog = ref(false)
const currentStockId = ref(null)
const newStockPrefill = ref({ code: '', name: '' })

function openNewStockDialog(prefill = { code: '', name: '' }) {
  newStockPrefill.value = prefill
  showNewStockDialog.value = true
}

function closeNewStockDialog() {
  showNewStockDialog.value = false
  newStockPrefill.value = { code: '', name: '' }
}

function findStockByCode(code) {
  const c = String(code || '').trim()
  if (!c) return null
  return stockList.value.find(s => String(s.code || '').trim() === c) || null
}

// 观察面板 → 登记买入：已建仓直接加仓，未建仓则打开建仓弹窗并预填
function handleWatchBuy(payload) {
  const stock = findStockByCode(payload?.code)
  if (stock) { openBuyDialog(stock.id); return }
  openNewStockDialog({ code: payload?.code || '', name: payload?.name || '' })
}

// 观察面板 → 登记卖出：仅已建仓股票可卖
async function handleWatchSell(payload) {
  const stock = findStockByCode(payload?.code)
  if (!stock) { toast('该股票尚未建仓，无法登记卖出', 'error'); return }
  // 操作行内联的快速做T：直接落库新增记录，不弹窗
  if (payload?.quickSell) { await handleQuickSell(stock, payload.quickSell); return }
  openSellDialog(stock.id)
}

// 行内快速做T录入：新增一条 T出（卖出）记录，并自动与该笔买入配成同一 T 组
async function handleQuickSell(stock, qs) {
  const price = Number(qs?.price)
  const count = Number(qs?.count)
  if (!price || !count) return
  const buy = (stock.buyRecords || []).find(b => String(b.id) === String(qs.buyRecordId))
  const buyPrice = Number(buy?.buyPrice ?? qs.buyPrice ?? price)
  const buyCount = Number(buy?.buyCount ?? count)
  const amount = price * count
  const sellFee = sellFeeParts(amount)
  const buyFee = buyFeeParts(buyPrice * buyCount)
  // 价差收益全额摊到配对买入记录的成本上
  const costChange = parseFloat((amount - buyPrice * buyCount - buyFee.total - sellFee.total).toFixed(2))
  // 这笔卖出就是给该笔买入配的 T出：沿用该买入已开的组，没有则新开一个组
  const tGroupId = buy?.tGroupId || qs.tGroupId || genTGroupId()

  await addSellRecord(stock.id, {
    sellDate: new Date().toISOString().slice(0, 10),
    sellPrice: price,
    sellCount: count,
    sellCommission: sellFee.commission,
    sellTransferFee: sellFee.transferFee,
    stampTax: sellFee.stampTax,
    netProfit: costChange,
    tType: 'T出',
    tGroupId,
    tProfit: costChange
  })
  // 配对的买入腿标记为 T入 并绑定同一 T 组
  if (buy) {
    await updateBuyRecord(stock.id, buy.id, { tType: 'T入', tGroupId, costChange })
  }
  await refreshStock(stock.id)
}

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

function openClearDialog(stockId) {
  currentStockId.value = stockId
  showClearDialog.value = true
}

async function handleAddStock(data) {
  if (data.batchCompleted) {
    closeNewStockDialog()
    refreshStockPrices(true)
    return
  }
  const stock = await addStock(data)
  closeNewStockDialog()

  const { commission, transferFee } = buyFeeParts(data.buyPrice * data.count)

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

async function handleClearStock(data) {
  if (data.sellPrice > 0 && data.sellCount > 0) {
    await addSellRecord(currentStockId.value, {
      sellDate: data.sellDate,
      sellPrice: data.sellPrice,
      sellCount: data.sellCount,
      sellCommission: data.sellCommission,
      sellTransferFee: data.sellTransferFee,
      stampTax: data.stampTax,
      netProfit: data.netProfit
    })
  }
  await clearStock(currentStockId.value)
  showClearDialog.value = false
}

async function handleAddBuyRecord(data) {
  const stock = getStock(currentStockId.value)
  let tGroupId = null
  let costChange = 0

  if (data.tType === 'T入') {
    // 有挂着待配对的 T出（只缺买入腿）就直接配上，否则先开一个 T 组等 T出 来配
    const pending = findPendingTGroup(stock, 'buy')
    tGroupId = pending ? pending.tGroupId : genTGroupId()
    if (pending) costChange = tGroupProfit(data, pending.leg)
  }
  // 建仓 / 补仓：不参与 T 组

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

  // 先解绑：这一腿原来挂在某个 T 组里，改类型即退出该组（另一腿会重新显示为待配对）
  if (tx.tGroupId) {
    if (tx.type === 'buy') {
      await updateBuyRecord(stockId, tx.id, { tType: '', tGroupId: null })
    } else {
      await updateSellRecord(stockId, tx.id, { tType: '', tGroupId: null, tPending: false })
    }
    await refreshStock(stockId)
  }

  const refreshedStock = getStock(stockId)
  if (!refreshedStock) return

  // 非 T 类型：只改标签，不参与 T 组（与 T 组解绑已在上面完成）
  if (newType !== 'T入' && newType !== 'T出') {
    if (tx.type === 'buy') {
      await updateBuyRecord(stockId, tx.id, { tType: newType })
    } else {
      await updateSellRecord(stockId, tx.id, { tType: newType })
    }
    await refreshStock(stockId)
    return
  }

  if (tx.type === 'buy') {
    // T入：有挂着待配对的 T出 就直接配上（反向后配），否则新开一组
    const pending = findPendingTGroup(refreshedStock, 'buy')
    if (pending) {
      const costChange = tGroupProfit(tx, pending.leg)
      await updateBuyRecord(stockId, tx.id, { tType: 'T入', tGroupId: pending.tGroupId, costChange })
    } else {
      await updateBuyRecord(stockId, tx.id, { tType: 'T入', tGroupId: genTGroupId() })
    }
  } else {
    // T出：有挂着待配对的 T入 就直接配上，否则新开一组
    const pending = findPendingTGroup(refreshedStock, 'sell')
    if (pending) {
      const costChange = tGroupProfit(pending.leg, tx)
      await updateSellRecord(stockId, tx.id, { tType: 'T出', tGroupId: pending.tGroupId, tProfit: costChange })
      await updateBuyRecord(stockId, pending.leg.id, { costChange })
    } else {
      await updateSellRecord(stockId, tx.id, { tType: 'T出', tGroupId: genTGroupId() })
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
  // 组内已录的那一腿决定方向：有买入腿 → 补 T出；有卖出腿 → 补 T入
  const firstTx = groupItem.rows[0].tx
  const today = new Date().toISOString().slice(0, 10)

  if (firstTx.type === 'buy') {
    // 已有 T入（买入），录入 T出（卖出）
    const sellAmt = price * firstTx.buyCount
    const { commission: sellCommission, transferFee: sellTransferFee, stampTax } = sellFeeParts(sellAmt)
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
      tType: 'T出',
      tGroupId: firstTx.tGroupId,
      tProfit: costChange
    })
    await updateBuyRecord(stockId, firstTx.id, { costChange })
  } else {
    // 已有 T出（卖出），录入 T入（买入）
    const buyAmt = price * firstTx.sellCount
    const { commission, transferFee } = buyFeeParts(buyAmt)

    const sellAmount = firstTx.sellPrice * firstTx.sellCount
    const sellFees = (firstTx.sellCommission || 0) + (firstTx.sellTransferFee || 0) + (firstTx.stampTax || 0)
    const costChange = sellAmount - buyAmt - commission - transferFee - sellFees

    await addBuyRecord(stockId, {
      buyDate: today,
      buyPrice: price,
      buyCount: firstTx.sellCount,
      commission,
      transferFee,
      tType: 'T入',
      tGroupId: firstTx.tGroupId,
      costChange
    })
  }
  await refreshStock(stockId)
}

async function handleAddSellRecord(data) {
  const stock = getStock(currentStockId.value)
  const calcRes = calcStock(stock)
  let tGroupId = null
  let costChange = 0
  let netProfit = 0

  const sellFees = (data.sellCommission || 0) + (data.sellTransferFee || 0) + (data.stampTax || 0)

  if (data.tType === 'T出') {
    // 有挂着待配对的 T入（只缺卖出腿）就直接配上，否则先开一个 T 组等 T入 来配
    const pending = findPendingTGroup(stock, 'sell')
    if (pending) {
      tGroupId = pending.tGroupId
      costChange = tGroupProfit(pending.leg, data)
      // T 组净盈利基于配对买入价计算，并回写到买入腿的成本变化上
      netProfit = costChange
      await updateBuyRecord(currentStockId.value, pending.leg.id, { costChange })
    } else {
      tGroupId = genTGroupId()
      // 还没配上 T入，先按持仓平均成本估算这笔卖出的净盈利
      netProfit = parseFloat(((data.sellPrice - calcRes.avgCost) * data.sellCount - sellFees).toFixed(2))
    }
  } else {
    netProfit = parseFloat(((data.sellPrice - calcRes.avgCost) * data.sellCount - sellFees).toFixed(2))
  }

  const payload = { ...data, netProfit, tGroupId }
  if (data.tType === 'T出') payload.tProfit = costChange
  await addSellRecord(currentStockId.value, payload)
  // 卖出后强制从后端拉取，校准前端 stock.count
  await refreshStock(currentStockId.value)
  showSellDialog.value = false
}

defineExpose({ loadStocks, restartMarketPolling })
</script>
