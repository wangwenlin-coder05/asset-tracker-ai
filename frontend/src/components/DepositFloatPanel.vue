<template>
  <Teleport to="body">
    <Transition name="deposit-float">
      <section
        v-if="visible"
        ref="panelRef"
        class="deposit-float-panel fixed z-[120] overflow-hidden rounded-lg border border-slate-200 bg-white shadow-2xl"
        :class="{ 'select-none': isDragging }"
        :style="panelStyle"
        role="dialog"
        :aria-label="title"
        @pointerdown.stop
        @click.stop
      >
        <header
          class="flex h-9 touch-none items-center justify-between border-b border-slate-200 bg-slate-50 px-3 cursor-move"
          @pointerdown="startDrag"
        >
          <div class="flex min-w-0 items-center gap-2">
            <GripHorizontal class="h-3.5 w-3.5 flex-shrink-0 text-slate-400" />
            <h4 class="truncate text-xs font-semibold text-slate-700">{{ title }}</h4>
          </div>
          <button class="flex h-6 w-6 items-center justify-center rounded text-slate-400 hover:bg-slate-200 hover:text-slate-700" title="关闭" @pointerdown.stop @click.stop="$emit('close')">
            <X class="h-3.5 w-3.5" />
          </button>
        </header>

        <div v-if="type === 'installment'" class="max-h-[360px] overflow-y-auto">
          <div class="flex items-center px-3 py-1.5 bg-slate-50 border-b border-slate-200 text-[10px] text-slate-400 font-medium">
            <span class="w-[80px]">期数</span>
            <span class="flex-1 text-center">日期</span>
            <span class="w-[90px] text-right">金额</span>
          </div>
          <div
            v-for="bill in bills"
            :key="bill.id"
            class="flex items-center border-b border-slate-100 px-3 py-1.5 last:border-b-0"
            :class="{ 'line-through text-slate-400': bill.status === 'paid' }"
          >
            <span class="flex items-center gap-2 w-[80px]">
              <span :class="bill.status === 'paid' ? 'flex h-3.5 w-3.5 items-center justify-center rounded-full bg-emerald-100 text-emerald-600' : 'h-3.5 w-3.5 rounded-full border border-slate-300'">
                <Check v-if="bill.status === 'paid'" class="h-2 w-2" />
              </span>
              <span class="text-xs font-medium">第{{ bill.period }}期</span>
            </span>
            <span class="flex-1 text-center text-[11px] text-slate-500">{{ formatDate(bill.dueDate || bill.due_date) }}</span>
            <span class="w-[90px] text-right text-xs font-semibold">¥{{ formatNumber(bill.total) }}</span>
          </div>
          <div v-if="bills.length === 0" class="py-8 text-center text-xs text-slate-400">暂无账单</div>
        </div>

        <div v-else class="max-h-[360px] overflow-auto">
          <table class="w-full table-fixed border-collapse text-left">
            <thead class="sticky top-0 z-10 bg-slate-50 text-[10px] font-medium text-slate-400">
              <tr>
                <th class="w-[40%] border-b border-slate-200 px-3 py-2">时间</th>
                <th class="w-[34%] border-b border-slate-200 px-2 py-2">说明</th>
                <th class="w-[26%] border-b border-slate-200 px-3 py-2 text-right">金额</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="tx in transactions" :key="tx.id" class="border-b border-slate-100 last:border-b-0 hover:bg-slate-50">
                <td class="whitespace-nowrap px-3 py-2 text-[10px] text-slate-500">{{ formatDateTime(tx.created_at) }}</td>
                <td class="whitespace-nowrap px-2 py-2 text-[11px] text-slate-600" :title="tx.note || transactionLabel(tx)">{{ tx.note || transactionLabel(tx) }}</td>
                <td class="whitespace-nowrap px-3 py-2 text-right text-[11px] font-semibold" :class="tx.type === 'add' ? 'text-emerald-600' : 'text-red-500'">
                  {{ tx.type === 'add' ? '+' : '-' }}¥{{ formatNumber(tx.amount) }}
                </td>
              </tr>
            </tbody>
          </table>
          <div v-if="transactions.length === 0" class="py-8 text-center text-xs text-slate-400">暂无交易记录</div>
        </div>
      </section>
    </Transition>
  </Teleport>
</template>

<script setup>
import { computed, nextTick, onBeforeUnmount, reactive, ref, watch } from 'vue'
import { Check, GripHorizontal, X } from 'lucide-vue-next'
import { fmtNum } from '../utils/formatter'

const PANEL_WIDTH = 560
const VIEWPORT_GAP = 12
const TRIGGER_GAP = 18

const props = defineProps({
  visible: Boolean,
  title: String,
  type: String,
  bills: { type: Array, default: () => [] },
  transactions: { type: Array, default: () => [] },
  triggerRect: Object
})

defineEmits(['close'])

const panelRef = ref(null)
const position = reactive({ x: VIEWPORT_GAP, y: VIEWPORT_GAP })
const isDragging = ref(false)
const dragOffset = reactive({ x: 0, y: 0 })
let dragPointerId = null

const panelStyle = computed(() => ({
  left: `${position.x}px`,
  top: `${position.y}px`,
  width: `${PANEL_WIDTH}px`,
  maxWidth: `calc(100vw - ${VIEWPORT_GAP * 2}px)`
}))

watch([() => props.visible, () => props.triggerRect], async ([visible, rect]) => {
  if (!visible || !rect) return
  await nextTick()
  placeBesideTrigger(rect)
}, { immediate: true })

function placeBesideTrigger(rect) {
  const panelHeight = panelRef.value?.offsetHeight || 260
  const rightX = rect.right + TRIGGER_GAP
  const leftX = rect.left - PANEL_WIDTH - TRIGGER_GAP
  position.x = rightX + PANEL_WIDTH <= window.innerWidth - VIEWPORT_GAP ? rightX : leftX
  position.y = rect.top + (rect.height - panelHeight) / 2
  clampToViewport()
}

function startDrag(event) {
  if (event.button !== 0 || event.target.closest('button')) return
  isDragging.value = true
  dragPointerId = event.pointerId
  dragOffset.x = event.clientX - position.x
  dragOffset.y = event.clientY - position.y
  event.currentTarget.setPointerCapture?.(event.pointerId)
  window.addEventListener('pointermove', onDrag)
  window.addEventListener('pointerup', stopDrag)
  window.addEventListener('pointercancel', stopDrag)
  event.preventDefault()
}

function onDrag(event) {
  if (!isDragging.value || event.pointerId !== dragPointerId) return
  position.x = event.clientX - dragOffset.x
  position.y = event.clientY - dragOffset.y
  clampToViewport()
}

function stopDrag(event) {
  if (dragPointerId !== null && event?.pointerId !== undefined && event.pointerId !== dragPointerId) return
  isDragging.value = false
  dragPointerId = null
  window.removeEventListener('pointermove', onDrag)
  window.removeEventListener('pointerup', stopDrag)
  window.removeEventListener('pointercancel', stopDrag)
}

function clampToViewport() {
  const width = Math.min(PANEL_WIDTH, window.innerWidth - VIEWPORT_GAP * 2)
  const height = panelRef.value?.offsetHeight || 260
  position.x = Math.max(VIEWPORT_GAP, Math.min(window.innerWidth - width - VIEWPORT_GAP, position.x))
  position.y = Math.max(VIEWPORT_GAP, Math.min(window.innerHeight - Math.min(height, window.innerHeight - VIEWPORT_GAP * 2) - VIEWPORT_GAP, position.y))
}

function transactionLabel(tx) {
  if (props.type === 'installment') return tx.type === 'add' ? '还款' : '支付'
  return tx.type === 'add' ? '存入' : '支出'
}

function formatNumber(value, decimals = 2) { return fmtNum(value, decimals) }
function formatDate(value) {
  if (!value) return ''
  const date = new Date(value)
  return `${date.getMonth() + 1}/${date.getDate()}`
}
function formatDateTime(value) {
  if (!value) return ''
  const date = new Date(value)
  return `${date.getMonth() + 1}/${date.getDate()} ${date.getHours().toString().padStart(2, '0')}:${date.getMinutes().toString().padStart(2, '0')}`
}

onBeforeUnmount(stopDrag)
</script>

<style scoped>
.deposit-float-panel { max-height: calc(100vh - 24px); }
.deposit-float-enter-active, .deposit-float-leave-active { transition: opacity 140ms ease, transform 140ms ease; }
.deposit-float-enter-from, .deposit-float-leave-to { opacity: 0; transform: translateY(4px) scale(0.98); }
</style>