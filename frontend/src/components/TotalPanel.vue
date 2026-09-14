<template>
  <div id="totalPanel" class="bg-white rounded-xl px-5 py-1.5 card-shadow blank-space mt-3">
    <div class="flex items-center gap-4 h-full">
      <div class="flex-shrink-0 space-y-1 min-w-0">
        <div class="flex items-center gap-4">
          <span class="text-[15px] font-semibold text-emerald-500/80 w-8 flex-shrink-0">存款</span>
          <div class="flex items-center gap-1.5">
            <span class="text-neutral/60 text-[15px]">总额</span>
            <p class="text-lg font-bold text-emerald-600">¥{{ formatNumber(depositTotal) }}</p>
          </div>
        </div>
        <div class="flex items-center gap-4">
          <span class="text-[15px] font-semibold text-primary/80 w-8 flex-shrink-0">股票</span>
          <div class="flex items-center gap-1.5">
            <span class="text-neutral/60 text-[15px]">总资产</span>
            <p class="text-lg font-bold">¥{{ formatNumber(stockTotalAsset) }}</p>
          </div>
          <div class="flex items-center gap-1">
            <span class="text-neutral/60 text-[15px]">本金</span>
            <input
              type="number"
              step="0.01"
              :value="stockPrincipal"
              @input="onPrincipalInput"
              class="text-lg font-bold focus:outline-none bg-transparent py-0 w-[80px]"
            />
          </div>
          <div class="flex items-center gap-1.5">
            <span class="text-neutral/60 text-[15px]">被套资金</span>
            <p class="text-lg font-bold">¥{{ formatNumber(stockHoldingAmount) }}</p>
          </div>
          <div class="flex items-center gap-1.5">
            <span class="text-neutral/60 text-[15px]">持仓市值</span>
            <p class="text-lg font-bold" :class="stockHoldingMarketValue >= stockHoldingAmount ? 'text-profit' : 'text-loss'">
              ¥{{ formatNumber(stockHoldingMarketValue) }}
            </p>
          </div>
          <div class="flex items-center gap-1.5">
            <span class="text-neutral/60 text-[15px]">被套比例</span>
            <p
              class="text-lg font-bold cursor-help"
              :class="crisisConfig.ratioColor"
              :title="`被套比例: ${stockTrappedRatio.toFixed(1)}%`"
            >{{ stockTrappedRatio.toFixed(1) }}%</p>
          </div>
          <div class="flex items-center gap-1.5">
            <span class="text-neutral/60 text-[15px]">总盈利</span>
            <p class="text-lg font-bold" :class="stockTotalProfit >= 0 ? 'text-profit' : 'text-loss'">
              ¥{{ formatNumber(stockTotalProfit) }}
            </p>
          </div>
          <div class="flex items-center gap-1.5">
            <span class="text-neutral/60 text-[15px]">浮亏</span>
            <p class="text-lg font-bold text-loss">
              ¥{{ formatNumber(stockUnrealizedLoss) }}
            </p>
          </div>
        </div>
        <div class="flex items-center gap-4">
          <span class="text-[15px] font-semibold text-amber-500/80 w-8 flex-shrink-0">黄金</span>
          <div class="flex items-center gap-1.5">
            <span class="text-neutral/60 text-[15px]">总成本</span>
            <p class="text-lg font-bold text-amber-600">¥{{ formatNumber(goldTotalCost) }}</p>
          </div>
          <div class="flex items-center gap-1.5">
            <span class="text-neutral/60 text-[15px]">总市值</span>
            <p class="text-lg font-bold text-amber-600">¥{{ formatNumber(goldTotalMarketValue) }}</p>
          </div>
          <div class="flex items-center gap-1.5 gold-avg-cell" tabindex="0">
            <span class="text-neutral/60 text-[15px]">总均价</span>
            <p class="text-lg font-bold text-amber-600">¥{{ formatNumber(goldAvgPrice) }}</p>
            <div class="gold-avg-tooltip">
              <div class="tip-title">总均价 = 净成本 ÷ 总克数</div>
              <div class="tip-row"><span>累计买入总额（含手续费）</span><b>+¥{{ formatNumber(goldTotalBuyAmount) }}</b></div>
              <div class="tip-row"><span>累计卖出收入（扣手续费）</span><b>-¥{{ formatNumber(goldTotalSellAmount) }}</b></div>
              <div class="tip-row"><span>净成本（买入 - 卖出）</span><b>=¥{{ formatNumber(goldTotalCost) }}</b></div>
              <div class="tip-row"><span>总克数</span><b>{{ formatNumber(goldTotalGrams, 4) }}g</b></div>
              <div class="tip-row result"><span>总均价</span><b>=¥{{ formatNumber(goldAvgPrice, 4) }}/g</b></div>
              <div v-if="goldHasSell" class="tip-note">注：卖出盈亏已摊入剩余持仓成本<br/>赚钱卖出 → 均价下降；亏钱卖出 → 均价上升</div>
            </div>
          </div>
          <div class="flex items-center gap-1.5">
            <span class="text-neutral/60 text-[15px]">总克数</span>
            <p class="text-lg font-bold text-amber-600">{{ formatNumber(goldTotalGrams, 2) }}g</p>
          </div>
        </div>
      </div>
      <div class="flex-1 flex items-center justify-center min-w-0 h-full">
        <div v-if="showCrisisReminder"
          class="w-full max-w-xs flex items-center justify-center gap-3 px-4 py-2 rounded-2xl transition-all duration-500"
          :class="[crisisConfig.boxBg, crisisConfig.boxBorder]"
        >
          <div class="flex-shrink-0 w-12 h-12 flex items-center justify-center">
            <component :is="crisisIcon" class="text-xl" :class="crisisConfig.iconColor" />
          </div>
          <div class="flex flex-col items-center gap-0.5">
            <span class="text-base font-bold" :class="crisisConfig.titleColor">{{ crisisConfig.title }}</span>
            <div class="flex items-baseline gap-1">
              <span class="text-2xl font-black" :class="crisisConfig.ratioColor">
                {{ stockTrappedRatio.toFixed(1) }}%
              </span>
              <span class="text-xs" :class="crisisConfig.labelColor">{{ crisisConfig.label }}</span>
            </div>
          </div>
        </div>
      </div>
      <div class="flex-shrink-0 text-center flex flex-col items-center justify-center gap-1.5">
        <h2 class="text-[20px] text-neutral/40 font-medium">股票止盈计算器</h2>
        <p class="text-[13px] text-neutral/50 leading-relaxed">万2.3佣金（买入最低5元）｜卖出印花税0.1%</p>
        <div class="flex items-center gap-2">
          <div class="inline-flex rounded-md bg-slate-100 p-0.5">
            <button
              @click="$emit('switch-board', 'stock')"
              class="px-5 py-1.5 rounded text-sm font-medium transition-all duration-200"
              :class="currentBoard === 'stock' ? 'bg-primary text-white shadow-sm' : 'text-slate-500 hover:text-slate-700'"
            >股票</button>
            <button
              @click="$emit('switch-board', 'gold')"
              class="px-5 py-1.5 rounded text-sm font-medium transition-all duration-200"
              :class="currentBoard === 'gold' ? 'bg-primary text-white shadow-sm' : 'text-slate-500 hover:text-slate-700'"
            >黄金</button>
            <button
              @click="$emit('switch-board', 'deposit')"
              class="px-5 py-1.5 rounded text-sm font-medium transition-all duration-200"
              :class="currentBoard === 'deposit' ? 'bg-primary text-white shadow-sm' : 'text-slate-500 hover:text-slate-700'"
            >存款</button>
            <button
              @click="$emit('switch-board', 'wool')"
              class="px-5 py-1.5 rounded text-sm font-medium transition-all duration-200"
              :class="currentBoard === 'wool' ? 'bg-primary text-white shadow-sm' : 'text-slate-500 hover:text-slate-700'"
            >薅羊毛</button>
            <button
              @click="$emit('switch-board', 'note')"
              class="px-5 py-1.5 rounded text-sm font-medium transition-all duration-200"
              :class="currentBoard === 'note' ? 'bg-primary text-white shadow-sm' : 'text-slate-500 hover:text-slate-700'"
            >笔记</button>
            <button
              @click="$emit('switch-board', 'tool')"
              class="px-5 py-1.5 rounded text-sm font-medium transition-all duration-200"
              :class="currentBoard === 'tool' ? 'bg-primary text-white shadow-sm' : 'text-slate-500 hover:text-slate-700'"
            >小工具</button>
            <button
              @click="$emit('switch-board', 'wechat')"
              class="px-5 py-1.5 rounded text-sm font-medium transition-all duration-200"
              :class="currentBoard === 'wechat' ? 'bg-emerald-500 text-white shadow-sm' : 'text-slate-500 hover:text-slate-700'"
            >微信选股提取</button>
            <button
              @click="$emit('switch-board', 'ai')"
              class="px-5 py-1.5 rounded text-sm font-medium transition-all duration-200"
              :class="currentBoard === 'ai' ? 'bg-gradient-to-r from-indigo-500 to-blue-500 text-white shadow-sm' : 'text-slate-500 hover:text-slate-700'"
            >AI 创作工作台</button>
            <button
              @click="$emit('switch-board', 'ai-canvas')"
              class="px-5 py-1.5 rounded text-sm font-medium transition-all duration-200"
              :class="currentBoard === 'ai-canvas' ? 'bg-gradient-to-r from-fuchsia-500 to-pink-500 text-white shadow-sm' : 'text-slate-500 hover:text-slate-700'"
            >🎨 AI 画布</button>
          </div>
          <button
            @click="$emit('open-settings')"
            class="w-8 h-8 rounded-lg bg-slate-100 text-slate-500 hover:bg-slate-200 hover:text-slate-700 transition-all flex items-center justify-center"
            title="AI 设置"
          >
            <Cog class="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed, markRaw, onBeforeUnmount, onMounted, ref } from 'vue'
import { Smile, Meh, Frown, AlertTriangle, Cog } from 'lucide-vue-next'
import { CRISIS_LEVELS, getCrisisLevel, calcStock } from '../utils/calculator'
import { fmtNum, num } from '../utils/formatter'
import { useStock } from '../composables/useStock'
import { useStockPrice } from '../composables/useStockPrice'
import { useGold } from '../composables/useGold'
import { useDeposit } from '../composables/useDeposit'

defineProps({
  currentBoard: {
    type: String,
    default: 'stock'
  }
})

defineEmits(['switch-board', 'open-settings'])

const {
  stocks,
  stockList,
  totalCost,
  holdingAmount,
  stockHoldingMarketValue,
  stockTotalAssets,
  stockPrincipal,
  trappedRatio,
  totalProfit,
  loadStocks,
  fetchStockPrices
} = useStock()

const { stockPrices } = useStockPrice()

const {
  goldItems,
  totalAmount,
  totalGrams,
  avgPrice,
  marketValue,
  totalBuyAmount: goldTotalBuyAmount,
  totalSellAmount: goldTotalSellAmount,
  loadGoldItems,
  fetchGoldPrice
} = useGold()

const {
  deposits,
  totalAmount: depositTotalAmount,
  loadDeposits
} = useDeposit()

const iconMap = {
  smile: markRaw(Smile),
  meh: markRaw(Meh),
  frown: markRaw(Frown),
  dizzy: markRaw(AlertTriangle)
}

const CRISIS_REMINDER_KEY = 'crisisReminderSeen'
const showCrisisReminder = ref(localStorage.getItem(CRISIS_REMINDER_KEY) !== '1')
let reminderTimer = null

function onPrincipalInput(e) {
  const val = parseFloat(e.target.value) || 0
  stockPrincipal.value = val
  localStorage.setItem('stockPrincipal', val)
}

const stockTotalProfit = computed(() => totalProfit.value)
const stockTotalAsset = computed(() => stockPrincipal.value + stockTotalProfit.value)
const stockHoldingAmount = computed(() => holdingAmount.value)

const stockUnrealizedLoss = computed(() => {
  return stockList.value.reduce((sum, stock) => {
    const priceInfo = stockPrices.value[stock.code]
    const price = priceInfo?.price
    if (!Number.isFinite(price) || price <= 0) return sum
    const avgCost = calcStock(stock).avgCost
    if (price < avgCost) {
      return sum + (avgCost - price) * num(stock.count)
    }
    return sum
  }, 0)
})

const stockTrappedRatio = computed(() => {
  if (stockTotalAsset.value <= 0) return 0
  return (stockHoldingAmount.value / stockTotalAsset.value) * 100
})

const goldTotalCost = computed(() => totalAmount.value)
const goldTotalGrams = computed(() => totalGrams.value)
const goldAvgPrice = computed(() => avgPrice.value)
const goldTotalMarketValue = computed(() => marketValue.value)
const goldHasSell = computed(() => goldItems.value.some(item => (item.sellRecords || []).length > 0))

const depositTotal = computed(() => depositTotalAmount.value)

const crisisLevel = computed(() => getCrisisLevel(stockTrappedRatio.value))

const crisisConfig = computed(() => CRISIS_LEVELS[crisisLevel.value] || CRISIS_LEVELS['安全'])

const crisisIcon = computed(() => iconMap[crisisConfig.value.icon] || Smile)

function formatNumber(val, decimals = 2) {
  return fmtNum(val, decimals)
}

onMounted(async () => {
  if (showCrisisReminder.value) {
    localStorage.setItem(CRISIS_REMINDER_KEY, '1')
    reminderTimer = window.setTimeout(() => {
      showCrisisReminder.value = false
    }, 4000)
  }
  await loadStocks()
  await loadGoldItems()
  await loadDeposits()
  await fetchGoldPrice()
  // 首次使用时用持仓总市值作为默认本金
  if (!stockPrincipal.value) {
    stockPrincipal.value = Math.round(totalCost.value)
  }
  // 拉取实时价格用于持仓市值计算
  const codes = stocks.value.filter(s => !s.isCleared && s.code).map(s => s.code)
  if (codes.length) await fetchStockPrices(codes, true)
})

onBeforeUnmount(() => {
  if (reminderTimer) window.clearTimeout(reminderTimer)
})
</script>
