<template>
  <div id="app" class="min-h-screen" :class="appBgClass">
    <!-- K 线看图分析：独立页面（新标签打开），不加载应用外壳 -->
    <KLineChartPage v-if="currentBoard === 'kline-analysis'" />
    <!-- 每日分析独立页面：新标签打开，不加载应用外壳 -->
    <StockBoard v-else-if="currentBoard === 'daily-analysis'" analysis-only />
    <div v-else id="page-wrapper" class="mx-auto w-full max-w-none px-2 sm:px-3">
      <GoldGalaxy
        v-if="currentBoard === 'gold'"
        :density="1.8"
        :glow-intensity="0.2"
        :rotation-speed="0.05"
        :repulsion-strength="0.5"
        :speed="0.6"
        :star-speed="0.3"
      />
      <TotalPanel
        :current-board="currentBoard"
        @switch-board="switchBoard"
        @open-settings="openSettings"
        @open-page="openPage"
        @open-ai="showAiAssistant = true"
      />
      <div id="boardContent" :class="currentBoard === 'life' ? 'pb-4' : 'pb-60'">
        <div :key="currentBoard" class="board-transition-root">
          <AssetOverviewBoard v-if="currentBoard === 'overview'" />
          <StockBoard v-else-if="currentBoard === 'stock'" ref="stockBoardRef" />
          <NewStockCalendar v-else-if="currentBoard === 'newstock-calendar'" />
          <GoldBoard v-else-if="currentBoard === 'gold'" ref="goldBoardRef" />
          <DepositBoard v-else-if="currentBoard === 'deposit'" ref="depositBoardRef" />
          <WoolBoard v-else-if="currentBoard === 'wool'" />
          <NoteBoard v-else-if="currentBoard === 'note'" />
          <ToolBoard v-else-if="currentBoard === 'tool'" />
          <WechatStockBoard v-else-if="currentBoard === 'wechat' && auth.user.capabilities.localFeatures" ref="wechatBoardRef" />
          <QuantBoard v-else-if="currentBoard === 'quant' && auth.user.capabilities.localFeatures" />
          <BatchGridPanel v-else-if="currentBoard === 'quant-grid' && auth.user.capabilities.localFeatures" />
          <div v-else-if="['wechat', 'quant', 'quant-grid'].includes(currentBoard)" class="p-8 text-slate-500">此能力仅允许本机所有者使用，云端暂未开放。</div>
          <AiWorkBoard v-else-if="currentBoard === 'ai'" ref="aiWorkBoardRef" />
          <AiCanvasBoard v-else-if="currentBoard === 'ai-canvas'" ref="aiCanvasBoardRef" />
          <QuizBoard v-else-if="currentBoard === 'quiz'" />
          <LifePlannerBoard v-else-if="currentBoard === 'life'" />
        </div>
      </div>
    </div>
    <SettingsDialog v-if="showSettings" @close="onSettingsClose" />
    <AiAssistantDialog v-if="showAiAssistant" @close="showAiAssistant = false" />
  </div>
</template>

<script setup>
import { ref, computed, provide, watch, onMounted, onBeforeUnmount, nextTick } from 'vue'
import TotalPanel from './components/TotalPanel.vue'
import GoldGalaxy from './components/GoldGalaxy.vue'
import AssetOverviewBoard from './components/AssetOverviewBoard.vue'
import StockBoard from './components/StockBoard.vue'
import GoldBoard from './components/GoldBoard.vue'
import DepositBoard from './components/DepositBoard.vue'
import WoolBoard from './components/WoolBoard.vue'
import NoteBoard from './components/NoteBoard.vue'
import ToolBoard from './components/ToolBoard.vue'
import WechatStockBoard from './components/WechatStockBoard.vue'
import QuantBoard from './components/QuantBoard.vue'
import BatchGridPanel from './components/quant/BatchGridPanel.vue'
import AiWorkBoard from './components/AiWorkBoard.vue'
import AiCanvasBoard from './components/AiCanvasBoard.vue'
import QuizBoard from './components/QuizBoard.vue'
import LifePlannerBoard from './components/LifePlannerBoard.vue'
import KLineChartPage from './components/KLineChartPage.vue'
import SettingsDialog from './components/SettingsDialog.vue'
import NewStockCalendar from './components/NewStockCalendar.vue'
import AiAssistantDialog from './components/AiAssistantDialog.vue'
import { useGold } from './composables/useGold'
import { useDeposit } from './composables/useDeposit'
import { useStock } from './composables/useStock'
import { loadFeeSettings } from './utils/feeConfig'
import { syncChannel } from './utils/api'
import { auth } from './auth'

const currentBoard = ref('stock')
const stockBoardRef = ref(null)
const goldBoardRef = ref(null)
const depositBoardRef = ref(null)
const wechatBoardRef = ref(null)
const aiWorkBoardRef = ref(null)
const showSettings = ref(false)
const showAiAssistant = ref(false)
const { reloadGoldConfig, loadGoldItems } = useGold()
const { loadDeposits } = useDeposit()
const { loadStocks } = useStock()
loadDeposits()
loadFeeSettings()

// 每个看板所依赖的共享数据源；切页时统一刷新，保证「返回旧看板」时看到的是最新数据。
// 与看板自身 onMounted 的加载通过 composable 内的 in-flight 去重合并为同一次请求，不会重复拉取/闪烁。
const BOARD_DATA_SOURCES = {
  overview: [loadStocks, loadGoldItems, loadDeposits],
  stock: [loadStocks],
  gold: [loadGoldItems],
  deposit: [loadStocks, loadGoldItems, loadDeposits]
}

function refreshBoardData(board) {
  const sources = BOARD_DATA_SOURCES[board]
  if (!sources) return
  for (const load of sources) load()
}

// ===== 跨标签页 / 跨窗口数据同步 =====
// 场景：浏览器同时打开多个页面（或窗口），其中一个页面做了修改后，另一个「老旧」页面
// 在重新获得焦点/可见时需要拉取最新数据，避免停留在过期状态。
let lastSyncAt = 0
function syncCurrentBoard(force = false) {
  const now = Date.now()
  // 简单的节流：多个事件（focus + visibilitychange）短时间内连发时只刷新一次
  if (!force && now - lastSyncAt < 600) return
  lastSyncAt = now
  refreshBoardData(currentBoard.value)
}

function onTabVisible() {
  if (document.visibilityState === 'visible') syncCurrentBoard()
}

function onTabFocus() {
  syncCurrentBoard()
}

function onRemoteDataChanged(e) {
  if (e?.data?.type === 'data-changed') syncCurrentBoard(true)
}

onMounted(() => {
  document.addEventListener('visibilitychange', onTabVisible)
  window.addEventListener('focus', onTabFocus)
  // 兼容不支持 BroadcastChannel 的环境（如旧版浏览器）：退回 storage 事件
  if (syncChannel) syncChannel.onmessage = onRemoteDataChanged
  window.addEventListener('storage', onStorageSync)
})

function onStorageSync(e) {
  if (e.key === 'stock-sync-tick' && e.newValue) syncCurrentBoard(true)
}

function scrollToTop() {
  window.scrollTo({ top: 0, left: 0, behavior: 'auto' })
  document.documentElement.scrollTop = 0
  document.body.scrollTop = 0
  const boardContent = document.getElementById('boardContent')
  if (boardContent) boardContent.scrollTop = 0
}

function switchBoard(board) {
  if (board === currentBoard.value) return
  currentBoard.value = board
  // 切页时统一刷新目标看板依赖的数据（同一请求期间重复调用会被去重）
  refreshBoardData(board)
  // 切换板块后滚动条回到顶部，避免沿用上一个板块的滚动位置
  scrollToTop()
  nextTick(scrollToTop)
}

function openSettings() {
  showSettings.value = true
}

function openPage(page) {
  const url = new URL(window.location.href)
  url.searchParams.set('page', page)
  window.open(url.toString(), '_blank', 'noopener,noreferrer')
}

const appBgClass = computed(() =>
  currentBoard.value === 'gold' ? 'bg-transparent'
  : (currentBoard.value === 'daily-analysis' || currentBoard.value === 'kline-analysis') ? 'bg-[#0B0F17]'
  : 'bg-[#f6f7f9]')

const requestedPage = new URLSearchParams(window.location.search).get('page')
if (requestedPage === 'newstock-calendar') currentBoard.value = 'newstock-calendar'
// 每日分析 / K 线看图分析：以独立页面渲染（新标签打开）
if (requestedPage === 'daily-analysis') currentBoard.value = 'daily-analysis'
if (requestedPage === 'kline-analysis') currentBoard.value = 'kline-analysis'

function onSettingsClose() {
  showSettings.value = false
  reloadGoldConfig()
  wechatBoardRef.value?.restartMarketPolling?.()
  stockBoardRef.value?.restartMarketPolling?.()
}

watch(currentBoard, (board) => {
  document.body.classList.toggle('gold-mode', board === 'gold')
}, { immediate: true })

onBeforeUnmount(() => {
  document.body.classList.remove('gold-mode')
  document.removeEventListener('visibilitychange', onTabVisible)
  window.removeEventListener('focus', onTabFocus)
  window.removeEventListener('storage', onStorageSync)
  if (syncChannel) syncChannel.onmessage = null
})

provide('refreshStock', () => stockBoardRef.value?.loadStocks?.())
provide('refreshGold', () => goldBoardRef.value?.loadGoldItems?.())
provide('refreshDeposit', () => depositBoardRef.value?.loadDeposits?.())
</script>

<style>
/* 星空背景固定在最底层（z-index:0），内容整体抬到其上方 */
#page-wrapper {
  position: relative;
  z-index: 1;
  /* 为左侧竖向 Dock 导航留出空间（Dock 是 fixed 悬浮，不占文档流） */
  padding-left: 62px;
  padding-right: 4px;
  padding-top: 10px;
}

@media (max-width: 1100px) {
  #page-wrapper { padding-left: 58px; }
}

@media (max-width: 768px) {
  #page-wrapper { padding-left: 54px; padding-right: 4px; }
}
</style>
