<template>
  <div class="gold-board-shell" :style="focusStyle" @pointermove="updateGoldFocus" @pointerleave="resetGoldFocus">
    <div class="gold-tech-grid" aria-hidden="true"></div>
    <div class="gold-particles" aria-hidden="true"><span v-for="particle in 40" :key="particle" :style="particleStyle(particle)"></span></div>
    <div class="gold-cursor-field" aria-hidden="true"></div>
    <div class="gold-circuit-layer" aria-hidden="true"><span v-for="line in 8" :key="line" :style="circuitStyle(line)"></span></div>
    <GoldPreviewPanel
      v-if="showPreviewPanel"
      :gold-items="goldItems"
      :today-price="todayPrice"
      :price-meta="priceMeta"
      :refresh-price="fetchGoldPrice"
      @fill-price="fillPreviewPrice"
    />
    <div id="goldList" class="space-y-3 px-5">
      <template v-if="loading">
        <div class="text-center py-8 text-slate-400">加载中...</div>
      </template>
      <template v-else-if="goldItems.length === 0">
        <div class="board-empty">
          <Gem class="w-12 h-12 opacity-40 mx-auto mb-3" />
          <p>暂无黄金持仓记录</p>
          <p class="text-xs mt-2">点击右下角按钮新增黄金买入</p>
        </div>
      </template>
      <template v-else>
        <div class="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <template v-for="(items, groupName) in groupedGold" :key="groupName">
            <GoldCard
              v-for="item in items"
              :key="item.id"
              :gold-item="item"
              @buy="openBuyDialog"
              @sell="openSellDialog"
              @delete="handleDeleteGold"
              @delete-tx="handleDeleteTx"
            />
          </template>
        </div>
      </template>
    </div>
    <button @click="showNewGoldDialog = true" class="gold-fab fixed bottom-6 right-6 z-30 flex items-center gap-1.5 rounded-full bg-amber-500 px-4 py-2.5 text-sm font-medium text-white shadow-lg shadow-amber-500/25 transition hover:-translate-y-0.5 hover:bg-amber-600" title="新增黄金">
      <Plus class="h-4 w-4" />
      新增黄金
    </button>
    <NewGoldDialog
      v-if="showNewGoldDialog"
      @close="showNewGoldDialog = false"
      @confirm="handleAddGold"
    />
    <GoldBuyDialog
      v-if="showBuyDialog"
      :gold-id="currentGoldId"
      :gold-item="currentGold"
      @close="showBuyDialog = false"
      @confirm="handleAddBuyRecord"
    />
    <GoldSellDialog
      v-if="showSellDialog"
      :gold-id="currentGoldId"
      :gold-item="currentGold"
      @close="showSellDialog = false"
      @confirm="handleAddSellRecord"
    />
  </div>
</template>

<script setup>
import { ref, computed } from 'vue'
import { Gem, Plus } from 'lucide-vue-next'
import GoldCard from './GoldCard.vue'
import GoldPreviewPanel from './GoldPreviewPanel.vue'
import NewGoldDialog from './dialogs/NewGoldDialog.vue'
import GoldBuyDialog from './dialogs/GoldBuyDialog.vue'
import GoldSellDialog from './dialogs/GoldSellDialog.vue'
import { useGold } from '../composables/useGold'

const {
  goldItems,
  loading,
  todayPrice,
  priceMeta,
  groupedGold,
  loadGoldItems,
  getGold,
  addGoldItem,
  deleteGoldItem,
  addBuyRecord,
  addSellRecord,
  deleteTransaction,
  fetchGoldPrice
} = useGold()

const showPreviewPanel = ref(true)
const showNewGoldDialog = ref(false)
const showBuyDialog = ref(false)
const showSellDialog = ref(false)
const currentGoldId = ref(null)
const focusStyle = ref({ '--focus-x': '50vw', '--focus-y': '42vh', '--focus-alpha': 0 })

const currentGold = computed(() => getGold(currentGoldId.value))

async function init() {
  await loadGoldItems()
}

init()

function openBuyDialog(goldId) {
  currentGoldId.value = goldId
  showBuyDialog.value = true
}

function openSellDialog(goldId) {
  currentGoldId.value = goldId
  showSellDialog.value = true
}

async function handleAddGold(data) {
  const { initialBuyRecord, ...goldData } = data
  const item = await addGoldItem(goldData)
  if (item?.id && initialBuyRecord) await addBuyRecord(item.id, initialBuyRecord)
  showNewGoldDialog.value = false
}

async function handleDeleteGold(goldId) {
  if (confirm('确定删除该黄金记录？')) {
    await deleteGoldItem(goldId)
  }
}

async function handleDeleteTx({ goldId, txId, txType }) {
  await deleteTransaction(goldId, txId, txType)
}

async function handleAddBuyRecord(data) {
  try {
    await addBuyRecord(currentGoldId.value, data)
    showBuyDialog.value = false
  } catch (error) {
    const message = error?.response?.data?.error || error?.message || '\u4fdd\u5b58\u4e70\u5165\u8bb0\u5f55\u5931\u8d25'
    alert(message)
  }
}

async function handleAddSellRecord(data) {
  try {
    await addSellRecord(currentGoldId.value, data)
    showSellDialog.value = false
  } catch (error) {
    const message = error?.response?.data?.error || error?.message || '\u4fdd\u5b58\u5356\u51fa\u8bb0\u5f55\u5931\u8d25'
    alert(message)
  }
}

function updateGoldFocus(event) {
  focusStyle.value = { '--focus-x': event.clientX + 'px', '--focus-y': event.clientY + 'px', '--focus-alpha': 1 }
}

function resetGoldFocus() {
  focusStyle.value = { ...focusStyle.value, '--focus-alpha': 0 }
}

function circuitStyle(index) {
  return {
    '--circuit-y': (8 + ((index * 13) % 82)) + '%',
    '--circuit-width': (18 + (index % 4) * 9) + '%',
    '--circuit-delay': (-((index * 1.3) % 8)) + 's',
    '--circuit-duration': (5 + (index % 5) * 1.4) + 's'
  }
}

function particleStyle(index) {
  const hue = index % 5 === 0 ? 195 : index % 7 === 0 ? 30 : 42
  return {
    '--x': `${(index * 17 + index % 7 * 11) % 100}%`,
    '--delay': `${-((index * 1.3) % 18)}s`,
    '--duration': `${8 + (index % 9) * 1.8}s`,
    '--size': `${1 + (index % 4) * 0.8}px`,
    '--drift': `${(index % 3 === 0 ? '' : '-')}${4 + (index % 7) * 2}px`,
    '--hue': hue
  }
}

function fillPreviewPrice() {
  if (todayPrice.value > 0) {
  }
}

defineExpose({ loadGoldItems })
</script>
