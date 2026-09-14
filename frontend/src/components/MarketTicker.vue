<template>
  <div class="mb-3">
    <div v-if="!marketOverview" class="h-11 flex items-center justify-center bg-white rounded-lg border border-slate-200 text-slate-400 text-xs">
      <RefreshCw class="w-3.5 h-3.5 animate-spin mr-2" />正在获取实时行情...
    </div>

    <div v-else class="market-ticker-shell" :class="{ 'opacity-90': marketOverview.marketClosed }">
      <div class="market-ticker-accent"></div>

      <div class="market-ticker-surface relative flex items-stretch min-h-12 h-auto max-w-full overflow-hidden text-[12px]">
        <!-- logo + 时间 -->
        <div class="market-ticker-segment market-ticker-brand flex items-center px-3.5 gap-2.5 min-w-0">
          <div class="flex items-center gap-2">
            <div class="w-1.5 h-1.5 rounded-full"
                 :class="marketOverview.marketClosed ? 'bg-amber-400' : 'bg-cyan-300 shadow-[0_0_8px_rgba(103,232,249,0.65)]'"></div>
            <span class="text-white/90 font-semibold">沪深京</span>
          </div>
          <span class="market-ticker-time text-[10px]">{{ new Date(marketOverview.updatedAt).toLocaleTimeString('zh-CN', { hour12: false }) }}</span>
          <span v-if="marketOverview.marketClosed" class="market-status-chip">已闭市</span>
        </div>

        <!-- 成交额 -->
        <div class="market-ticker-segment flex items-center px-3.5 gap-2 min-w-0">
          <span class="market-ticker-label">成交额</span>
          <span class="market-ticker-value tabular-nums">{{ marketOverview.totalAmountYi.toLocaleString() }}</span>
          <span class="market-ticker-unit">亿</span>
          <span v-if="marketOverview.amountDiffYi != null && !marketOverview.marketClosed" class="market-diff-chip tabular-nums"
                :class="marketOverview.amountDiffSign > 0 ? 'market-diff-up' : 'market-diff-down'">
            较上日{{ marketOverview.amountDiffSign > 0 ? '+' : '' }}{{ marketOverview.amountDiffYi }}
          </span>
        </div>

        <!-- 涨跌停 + 进度条 -->
        <div class="market-ticker-segment flex-1 flex items-center px-3.5 gap-3 min-w-0">
          <div class="flex items-baseline gap-1.5">
            <span class="market-ticker-label">涨停</span>
            <span class="text-red-400 font-semibold tabular-nums text-[14px]">{{ marketOverview.upLimit }}</span>
            <span class="market-ticker-divider">/</span>
            <span class="market-ticker-label">上涨</span>
            <span class="text-red-300 tabular-nums font-medium">{{ marketOverview.riseCount }}</span>
          </div>
          <div class="market-breadth-track flex-1 h-1.5 rounded-full overflow-hidden flex min-w-0">
            <div class="bg-gradient-to-r from-red-500/80 to-red-400 h-full" :style="{ width: marketOverview.riseCount / Math.max(marketOverview.riseCount + marketOverview.fallCount + marketOverview.flatCount, 1) * 100 + '%' }"></div>
            <div class="bg-white/10 h-full" :style="{ width: marketOverview.flatCount / Math.max(marketOverview.riseCount + marketOverview.fallCount + marketOverview.flatCount, 1) * 100 + '%' }"></div>
            <div class="bg-gradient-to-r from-emerald-400 to-emerald-500/80 h-full" :style="{ width: marketOverview.fallCount / Math.max(marketOverview.riseCount + marketOverview.fallCount + marketOverview.flatCount, 1) * 100 + '%' }"></div>
          </div>
          <div class="flex items-baseline gap-1.5">
            <span class="market-ticker-label">跌停</span>
            <span class="text-emerald-400 font-semibold tabular-nums text-[14px]">{{ marketOverview.downLimit }}</span>
            <span class="market-ticker-divider">/</span>
            <span class="market-ticker-label">下跌</span>
            <span class="text-emerald-300 tabular-nums font-medium">{{ marketOverview.fallCount }}</span>
          </div>
        </div>

        <!-- 四大指数 -->
        <div class="market-ticker-segment flex items-center px-3.5 gap-3 min-w-0">
          <template v-for="idx in (marketOverview.indices || []).slice(0, 4)" :key="idx.code">
            <div class="market-index-cell flex flex-col items-end leading-tight">
              <span class="market-index-name">{{ idx.name }}</span>
              <div class="flex items-baseline gap-1">
                <span class="tabular-nums text-[12px] font-semibold" :class="idx.chgRate >= 0 ? 'text-red-400' : 'text-emerald-400'">
                  {{ idx.price }}
                </span>
                <span class="tabular-nums text-[10px]" :class="idx.chgRate >= 0 ? 'text-red-300/80' : 'text-emerald-300/80'">
                  {{ idx.chgRate >= 0 ? '+' : '' }}{{ idx.chgRate }}%
                </span>
              </div>
            </div>
          </template>
        </div>

        <!-- 刷新 -->
        <button @click="loadMarketOverview" class="market-ticker-refresh flex items-center px-3.5 text-white/40 hover:text-cyan-200 transition-colors">
          <RefreshCw class="w-3.5 h-3.5" :class="{ 'animate-spin': marketLoading }" />
        </button>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted, onBeforeUnmount } from 'vue'
import { RefreshCw } from 'lucide-vue-next'

const marketOverview = ref(null)
const marketLoading = ref(false)
const marketFetchInterval = ref(30000)
let marketTimer = null

function stopMarketPolling() {
  if (marketTimer) {
    clearInterval(marketTimer)
    marketTimer = null
  }
}

function startMarketPolling() {
  stopMarketPolling()
  const interval = marketFetchInterval.value || 30000
  marketTimer = setInterval(() => {
    if (!document.hidden) loadMarketOverview()
  }, interval)
}

async function loadMarketOverview() {
  marketLoading.value = true
  try {
    const res = await fetch('/api/market/overview')
    const json = await res.json()
    marketOverview.value = json.data
  } catch (e) {
    console.error('加载实时解盘失败:', e)
  } finally {
    marketLoading.value = false
  }
}

async function loadMarketFetchInterval() {
  try {
    const res = await fetch('/api/ai/settings')
    const json = await res.json()
    if (json.market_fetch_interval) {
      marketFetchInterval.value = Number(json.market_fetch_interval) || 30000
    }
  } catch (e) { /* 静默失败，用默认值 */ }
}

async function restartMarketPolling() {
  await loadMarketFetchInterval()
  startMarketPolling()
}

onMounted(async () => {
  await loadMarketFetchInterval()
  loadMarketOverview()
  startMarketPolling()
})

onBeforeUnmount(() => {
  stopMarketPolling()
})

defineExpose({ restartMarketPolling })
</script>

<style scoped>
.market-ticker-shell {
  position: relative;
  isolation: isolate;
  overflow: hidden;
  border: 1px solid rgba(148, 163, 184, 0.17);
  border-radius: 10px;
  background: #0a1220;
  box-shadow:
    0 7px 22px rgba(2, 8, 23, 0.2),
    inset 0 1px 0 rgba(255, 255, 255, 0.055),
    inset 0 -1px 0 rgba(15, 23, 42, 0.75);
}

.market-ticker-shell::before {
  content: '';
  position: absolute;
  top: 0;
  left: 18px;
  right: 18px;
  height: 1px;
  z-index: 2;
  pointer-events: none;
  background: linear-gradient(90deg, transparent, rgba(103, 232, 249, 0.42) 26%, rgba(129, 140, 248, 0.34) 72%, transparent);
}

.market-ticker-shell::after {
  content: '';
  position: absolute;
  top: 0;
  bottom: 0;
  left: 0;
  width: 3px;
  pointer-events: none;
  background: linear-gradient(180deg, transparent, #22d3ee 28%, #6366f1 74%, transparent);
  opacity: 0.78;
}

.market-ticker-accent {
  position: absolute;
  inset: 0;
  pointer-events: none;
  background: linear-gradient(90deg, rgba(34, 211, 238, 0.035), transparent 22%, transparent 76%, rgba(99, 102, 241, 0.03));
}

.market-ticker-surface {
  z-index: 1;
  background: linear-gradient(180deg, rgba(255, 255, 255, 0.018), rgba(255, 255, 255, 0));
}

.market-ticker-segment {
  position: relative;
  border-right: 1px solid rgba(148, 163, 184, 0.095);
  transition: background-color 160ms ease;
}

.market-ticker-segment:hover {
  background-color: rgba(148, 163, 184, 0.028);
}

.market-ticker-brand {
  background: linear-gradient(90deg, rgba(34, 211, 238, 0.04), transparent);
}

.market-ticker-time {
  color: rgba(148, 163, 184, 0.52);
  font-variant-numeric: tabular-nums;
}

.market-status-chip {
  padding: 2px 6px;
  border: 1px solid rgba(251, 191, 36, 0.22);
  border-radius: 5px;
  color: rgba(253, 230, 138, 0.85);
  background: rgba(245, 158, 11, 0.08);
  font-size: 9px;
  line-height: 1.25;
}

.market-ticker-label {
  color: rgba(148, 163, 184, 0.68);
  font-size: 10px;
}

.market-ticker-value {
  color: #f8fafc;
  font-size: 16px;
  font-weight: 650;
  letter-spacing: 0;
}

.market-ticker-unit {
  color: rgba(148, 163, 184, 0.5);
  font-size: 9px;
}

.market-ticker-divider {
  margin: 0 2px;
  color: rgba(148, 163, 184, 0.22);
  font-size: 10px;
}

.market-diff-chip {
  padding: 2px 6px;
  border-radius: 5px;
  font-size: 9px;
  font-weight: 600;
}

.market-diff-up {
  color: #fca5a5;
  background: rgba(239, 68, 68, 0.08);
}

.market-diff-down {
  color: #6ee7b7;
  background: rgba(16, 185, 129, 0.08);
}

.market-breadth-track {
  background: rgba(2, 6, 23, 0.64);
  box-shadow: inset 0 0 0 1px rgba(148, 163, 184, 0.08);
}

.market-index-cell {
  min-width: 70px;
  padding-left: 10px;
  border-left: 1px solid rgba(148, 163, 184, 0.07);
}

.market-index-cell:first-child {
  padding-left: 0;
  border-left: 0;
}

.market-index-name {
  color: rgba(148, 163, 184, 0.68);
  font-size: 9px;
}

.market-ticker-refresh {
  border-left: 1px solid rgba(148, 163, 184, 0.095);
}

.market-ticker-refresh:hover {
  background: rgba(34, 211, 238, 0.045);
}
</style>
