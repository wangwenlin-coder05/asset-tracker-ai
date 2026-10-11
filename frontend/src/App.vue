<template>
  <div id="app" class="min-h-screen" :class="currentBoard === 'gold' ? 'bg-transparent' : 'bg-[#f6f7f9]'">
    <GoldGalaxy
      v-if="currentBoard === 'gold'"
      :density="1.8"
      :glow-intensity="0.2"
      :rotation-speed="0.05"
      :repulsion-strength="0.5"
      :speed="0.6"
      :star-speed="0.3"
    />
    <div id="page-wrapper" class="mx-auto w-full max-w-none px-2 sm:px-3">
      <TotalPanel
        :current-board="currentBoard"
        @switch-board="switchBoard"
        @open-settings="openSettings"
      />
      <div id="boardContent" class="pb-60">
        <div :key="currentBoard" class="board-transition-root">
          <AssetOverviewBoard v-if="currentBoard === 'overview'" />
          <StockBoard v-else-if="currentBoard === 'stock'" ref="stockBoardRef" />
          <GoldBoard v-else-if="currentBoard === 'gold'" ref="goldBoardRef" />
          <DepositBoard v-else-if="currentBoard === 'deposit'" ref="depositBoardRef" />
          <WoolBoard v-else-if="currentBoard === 'wool'" />
          <NoteBoard v-else-if="currentBoard === 'note'" />
          <ToolBoard v-else-if="currentBoard === 'tool'" />
          <WechatStockBoard v-else-if="currentBoard === 'wechat'" ref="wechatBoardRef" />
          <QuantBoard v-else-if="currentBoard === 'quant'" />
          <BatchGridPanel v-else-if="currentBoard === 'quant-grid'" />
          <AiWorkBoard v-else-if="currentBoard === 'ai'" ref="aiWorkBoardRef" />
          <AiCanvasBoard v-else-if="currentBoard === 'ai-canvas'" ref="aiCanvasBoardRef" />
          <QuizBoard v-else-if="currentBoard === 'quiz'" />
        </div>
      </div>
    </div>
    <SettingsDialog v-if="showSettings" @close="onSettingsClose" />
  </div>
</template>

<script setup>
import { ref, provide, watch, onBeforeUnmount, nextTick } from 'vue'
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
import SettingsDialog from './components/SettingsDialog.vue'
import { useGold } from './composables/useGold'
import { useDeposit } from './composables/useDeposit'
import { loadFeeSettings } from './utils/feeConfig'

const currentBoard = ref('stock')
const stockBoardRef = ref(null)
const goldBoardRef = ref(null)
const depositBoardRef = ref(null)
const wechatBoardRef = ref(null)
const aiWorkBoardRef = ref(null)
const showSettings = ref(false)
const { reloadGoldConfig } = useGold()
const { loadDeposits } = useDeposit()
loadDeposits()
loadFeeSettings()

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
  // 切换板块后滚动条回到顶部，避免沿用上一个板块的滚动位置
  scrollToTop()
  nextTick(scrollToTop)
}

function openSettings() {
  showSettings.value = true
}

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
