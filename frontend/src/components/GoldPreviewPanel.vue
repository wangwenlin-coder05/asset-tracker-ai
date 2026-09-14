<template>
  <div id="goldPreviewPanel" class="gold-tool-panel rounded-xl p-5 mb-4">
    <div class="relative z-10 grid grid-cols-1 xl:grid-cols-[1.15fr_0.85fr] gap-4">
      <div class="gold-tool-card rounded-lg p-4">
        <div class="flex items-center justify-between gap-3 mb-3">
          <div>
            <div class="text-xs text-amber-200/45 uppercase">Gold Preview</div>
            <h3 class="text-lg font-bold text-amber-100 mt-0.5">补仓均价预览</h3>
          </div>
          <Diamond class="w-6 h-6 text-amber-300" />
        </div>
        <div class="flex items-end gap-3">
          <div class="flex-1">
            <label class="block text-xs text-amber-200/55 mb-1">买入价格 (元/克)</label>
            <input
              type="number"
              step="0.01"
              v-model.number="previewPrice"
              @input="calculatePreview"
              class="gold-tool-input"
              placeholder="如 720"
            />
          </div>
          <div class="flex-1">
            <label class="block text-xs text-amber-200/55 mb-1">买入克数</label>
            <input
              type="number"
              step="0.01"
              v-model.number="previewGrams"
              @input="calculatePreview"
              class="gold-tool-input"
              placeholder="如 10"
            />
          </div>
          <button
            @click="previewPrice = editablePrice || props.todayPrice; $emit('fill-price')"
            class="flex-shrink-0 h-[38px] px-4 bg-gradient-to-r from-amber-500 to-amber-600 text-white text-xs font-medium rounded-lg hover:from-amber-400 hover:to-amber-500 active:scale-95 transition-all duration-150 shadow-[0_0_15px_rgba(245,158,11,0.3)]"
          >今日金价预览补仓</button>
        </div>
        <div class="grid grid-cols-2 lg:grid-cols-4 gap-3 mt-4">
          <div class="rounded-lg bg-black/25 border border-amber-500/15 p-3">
            <div class="text-xs text-amber-200/45">当前均价</div>
            <div class="text-lg font-semibold text-amber-200 mt-1">¥{{ formatNumber(oldAvg) }}</div>
          </div>
          <div class="rounded-lg bg-black/25 border border-amber-500/15 p-3">
            <div class="text-xs text-amber-200/45">预览均价</div>
            <div class="text-lg font-semibold text-amber-300 mt-1">¥{{ formatNumber(newAvg) }}</div>
          </div>
          <div class="rounded-lg bg-black/25 border border-amber-500/15 p-3">
            <div class="text-xs text-amber-200/45">均价变化</div>
            <div class="text-lg font-semibold text-teal-200 mt-1">¥{{ formatNumber(avgDiff) }}</div>
          </div>
          <div class="rounded-lg bg-black/25 border border-amber-500/15 p-3">
            <div class="text-xs text-amber-200/45">新增投入</div>
            <div class="text-lg font-semibold text-amber-100 mt-1">¥{{ formatNumber(addCost) }}</div>
          </div>
        </div>
      </div>
      <div class="gold-tool-card rounded-lg p-4 flex flex-col">
        <div class="flex items-center justify-between gap-3 mb-3">
          <h3 class="text-sm font-bold text-amber-200/60 uppercase tracking-wider">止盈参考</h3>
          <Target class="w-4 h-4 text-amber-300/40" />
        </div>
        <div class="flex items-center gap-2">
          <label class="text-xs text-amber-200/40 flex-shrink-0">今日金价</label>
          <input
            type="number"
            step="0.01"
            v-model.number="editablePrice"
            class="gold-tool-input flex-1 text-sm"
            placeholder="如 720"
          />
          <button
            @click="fetchPrice"
            class="flex-shrink-0 w-6 h-6 rounded-full bg-amber-500/20 hover:bg-amber-500/40 text-amber-300 hover:text-amber-100 transition-all flex items-center justify-center"
            title="获取国际金价"
          >
            <Check v-if="refreshDone" class="w-3.5 h-3.5 text-emerald-300" />
            <RefreshCw v-else class="w-3 h-3" :class="{ 'animate-spin': fetching }" />
          </button>
        </div>
        <div class="text-xs text-amber-200/30 mt-1 whitespace-nowrap overflow-hidden text-ellipsis" :title="priceSource">{{ priceSource }}</div>
        <div class="flex items-center justify-between mt-4 px-1">
          <div class="text-center flex-1">
            <div class="text-xs text-amber-200/40 uppercase tracking-widest">市值</div>
            <div class="text-lg font-bold text-amber-100/80">¥{{ formatNumber(marketValue) }}</div>
          </div>
          <div class="w-px h-10 bg-amber-500/15"></div>
          <div class="text-center flex-1">
            <div class="text-xs text-amber-200/40 uppercase tracking-widest">盈亏</div>
            <div class="text-lg font-bold" :class="profitLoss >= 0 ? 'text-transparent bg-clip-text bg-gradient-to-r from-red-500 to-red-300' : 'text-transparent bg-clip-text bg-gradient-to-r from-green-500 to-green-300'" :style="profitLoss >= 0 ? 'text-shadow: 0 0 8px rgba(239,68,68,.38)' : 'text-shadow: 0 0 8px rgba(16,185,129,.38)'">¥{{ formatNumber(profitLoss) }}</div>
          </div>
          <div class="w-px h-10 bg-amber-500/15"></div>
          <div class="text-center flex-1">
            <div class="text-xs text-amber-200/40 uppercase tracking-widest">盈亏率</div>
            <div class="text-lg font-bold text-amber-200/70">{{ formatPercent(profitLossRate) }}</div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, watch } from 'vue'
import { Diamond, Target, RefreshCw, Check } from 'lucide-vue-next'
import { calcGold } from '../utils/calculator'
import { fmtNum } from '../utils/formatter'

const props = defineProps({
  goldItems: {
    type: Array,
    default: () => []
  },
  todayPrice: {
    type: Number,
    default: 0
  },
  priceMeta: {
    type: Object,
    default: () => ({})
  },
  refreshPrice: {
    type: Function,
    default: null
  }
})

const emit = defineEmits(['fill-price'])

const editablePrice = ref(props.todayPrice)
const fetching = ref(false)
const refreshDone = ref(false)

watch([() => props.todayPrice, () => props.priceMeta?.updatedAt, () => props.priceMeta?.fetchedAt], ([val]) => {
  editablePrice.value = val
})

async function fetchPrice() {
  if (fetching.value) return
  fetching.value = true
  refreshDone.value = false
  try {
    if (props.refreshPrice) await props.refreshPrice(true)
    refreshDone.value = true
    window.setTimeout(() => { refreshDone.value = false }, 1600)
  } finally {
    fetching.value = false
  }
}

const priceSource = computed(() => {
  if (!editablePrice.value) return '\u5c1a\u672a\u83b7\u53d6\u91d1\u4ef7\uff0c\u8bf7\u70b9\u51fb\u5237\u65b0'
  const meta = props.priceMeta || {}
  const parts = [`${meta.market || 'AU9999'} \u00a5${formatNumber(editablePrice.value)}/\u514b`]
  if (meta.internationalPriceUsd) parts.push(`\u4f26\u6566\u91d1 USD ${formatNumber(meta.internationalPriceUsd)}/\u76ce\u53f8`)
  if (meta.fetchedAt) parts.push(`\u672c\u6b21\u83b7\u53d6 ${formatUpdateTime(meta.fetchedAt, true)}`)
  if (meta.source) parts.push(`\u6765\u6e90 ${formatSource(meta.source)}`)
  return parts.join('  \u00b7  ')
})

function formatSource(source) {
  const names = { freejk: 'FreeJK', xaus: 'XAUS', metalmetric: 'MetalMetric', 'gold-api.com': 'Gold API' }
  return names[source] || source
}

function formatUpdateTime(value, includeSeconds = false) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return new Intl.DateTimeFormat('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: includeSeconds ? '2-digit' : undefined, hour12: false }).format(date)
}

const previewPrice = ref(0)
const previewGrams = ref(1)

const totalGrams = computed(() => {
  return props.goldItems.reduce((sum, item) => {
    const calcRes = calcGold(item)
    return sum + calcRes.totalGrams
  }, 0)
})

const totalAmount = computed(() => {
  return props.goldItems.reduce((sum, item) => {
    const calcRes = calcGold(item)
    return sum + calcRes.totalAmount
  }, 0)
})

const oldAvg = computed(() => totalGrams.value > 0 ? totalAmount.value / totalGrams.value : 0)

const validPreview = computed(() => {
  return Number(previewPrice.value) > 0 && Number(previewGrams.value) > 0
})

const newAvg = computed(() => {
  if (!validPreview.value) return oldAvg.value
  if (totalGrams.value === 0) return previewPrice.value
  const newTotalAmount = totalAmount.value + previewPrice.value * previewGrams.value
  const newTotalGrams = totalGrams.value + previewGrams.value
  return newTotalGrams > 0 ? newTotalAmount / newTotalGrams : oldAvg.value
})

const avgDiff = computed(() => validPreview.value ? newAvg.value - oldAvg.value : 0)

const addCost = computed(() => validPreview.value ? previewPrice.value * previewGrams.value : 0)

const marketValue = computed(() => {
  if (!editablePrice.value) return 0
  return editablePrice.value * totalGrams.value
})

const profitLoss = computed(() => marketValue.value - totalAmount.value)

const profitLossRate = computed(() => {
  if (totalAmount.value === 0) return 0
  return (profitLoss.value / totalAmount.value) * 100
})

function calculatePreview() {}

function formatNumber(val, decimals = 2) {
  return fmtNum(val, decimals)
}

function formatPercent(val) {
  return `${val.toFixed(2)}%`
}
</script>
