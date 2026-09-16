<template>
  <div id="app" class="min-h-screen transition-colors duration-300" :class="currentBoard === 'gold' ? 'bg-transparent' : 'bg-[#f6f7f9]'">
    <div id="page-wrapper" class="mx-auto w-full max-w-none px-2 sm:px-3">
      <TotalPanel
        :current-board="currentBoard"
        @switch-board="switchBoard"
        @open-settings="openSettings"
      />
      <div id="boardContent" class="pb-60">
        <transition name="fade" mode="out-in">
          <div :key="currentBoard" class="board-transition-root">
            <StockBoard v-if="currentBoard === 'stock'" ref="stockBoardRef" />
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
          </div>
        </transition>
      </div>
    </div>
    <SettingsDialog v-if="showSettings" @close="onSettingsClose" />
  </div>
</template>

<script setup>
import { ref, provide, watch, onBeforeUnmount } from 'vue'
import TotalPanel from './components/TotalPanel.vue'
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
import SettingsDialog from './components/SettingsDialog.vue'
import { useGold } from './composables/useGold'
import { useDeposit } from './composables/useDeposit'

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

function switchBoard(board) {
  currentBoard.value = board
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
.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.2s ease, transform 0.2s ease;
}

.fade-enter-from {
  opacity: 0;
  transform: translateY(8px);
}

.fade-leave-to {
  opacity: 0;
  transform: translateY(-8px);
}
</style>
