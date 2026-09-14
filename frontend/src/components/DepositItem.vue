<template>
  <div class="deposit-item-wrapper group/debt">
    <div
      ref="itemRef"
      class="deposit-item flex items-center justify-between p-2 bg-slate-50 rounded-lg hover:bg-white hover:shadow-sm transition-all cursor-pointer relative"
      :class="{ 'ring-1 ring-amber-300/50 bg-amber-50/30': depositItem.bindType || depositItem.paymentAccountId }"
      @pointerdown="handlePointerDown"
      @pointerup="handlePointerUp"
    >
      <div class="flex items-center gap-2 flex-1 min-w-0">
        <img
          v-if="depositItem.icon"
          :src="depositItem.icon"
          class="w-9 h-9 rounded-lg object-cover border-2 border-emerald-100 shadow-sm bg-emerald-50"
          draggable="false"
          loading="lazy"
          decoding="async"
        />
        <div v-if="!depositItem.icon" class="deposit-item-icon flex items-center justify-center w-9 h-9 rounded-lg bg-emerald-50 text-emerald-600 text-lg font-bold">$</div>
        <div class="flex-1 min-w-0">
          <div class="text-sm font-medium text-slate-700 truncate flex items-center gap-1">
            {{ depositItem.name }}
            <span v-if="depositItem.bindType" class="inline-flex items-center gap-0.5 text-[9px] px-1 py-0.5 rounded bg-amber-100 text-amber-600 font-normal">
              <Link2 class="w-2 h-2" />{{ bindLabel }}
            </span>
            <span v-if="depositItem.itemType === 'debt' && depositItem.paymentAccountId" class="inline-flex items-center gap-0.5 text-[9px] px-1 py-0.5 rounded font-normal" :class="depositItem.repaymentMode === 'manual' ? 'bg-rose-100 text-rose-600' : 'bg-sky-100 text-sky-600'">
              <CreditCard class="w-2 h-2" />{{ depositItem.repaymentMode === 'manual' ? '手动' : '自动' }}
            </span>
          </div>
          <div class="text-xs" :class="amountClass">{{ displayAmount > 0 ? '¥' : '' }}{{ formatNumber(displayAmount) }}</div>
        </div>
      </div>
      <div class="flex items-center gap-1">
        <button
          v-if="depositItem.itemType === 'normal' && !depositItem.bindType"
          @pointerdown.stop
          @pointerup.stop
          @click.stop="showQuickAdd = true"
          class="text-neutral hover:text-emerald-600 transition-all opacity-0 group-hover/debt:opacity-100"
          title="加款"
        >
          <Plus class="w-3 h-3" />
        </button>
        <button
          v-if="depositItem.itemType === 'debt' && depositItem.paymentAccountId && depositItem.amount < 0 && depositItem.repaymentMode === 'manual'"
          @pointerdown.stop
          @pointerup.stop
          @click.stop="showRepayDialog = true"
          class="text-neutral hover:text-emerald-600 transition-all opacity-0 group-hover/debt:opacity-100"
          title="手动还款"
        >
          <ArrowDownToLine class="w-3 h-3" />
        </button>
        <button
          v-if="depositItem.itemType === 'installment'"
          @pointerdown.stop
          @pointerup.stop
          @click.stop="toggleFloatPanel"
          class="text-neutral hover:text-slate-600 transition-all"
          title="分期还款"
        >
          <Calendar class="w-3 h-3" />
        </button>
        <button
          v-if="depositItem.itemType !== 'installment'"
          @pointerdown.stop
          @pointerup.stop
          @click.stop="toggleFloatPanel"
          class="text-neutral hover:text-slate-600 transition-all"
          title="交易记录"
        >
          <History class="w-3 h-3" />
        </button>
        <button
          @pointerdown.stop
          @pointerup.stop
          @click.stop="$emit('edit', depositItem.id)"
          class="text-neutral hover:text-primary transition-all"
          title="编辑"
        >
          <Pencil class="w-3 h-3" />
        </button>
        <button
          @pointerdown.stop
          @pointerup.stop
          @click.stop="$emit('delete', depositItem.id)"
          class="text-neutral hover:text-loss transition-all"
          title="删除"
        >
          <Trash2 class="w-3 h-3" />
        </button>
      </div>
      <!-- 快速加款弹层 -->
      <Teleport to="body">
        <div v-if="showQuickAdd" class="fixed inset-0 bg-black/30 backdrop-blur-sm flex items-center justify-center z-50" @click.self="closeQuickAdd">
          <div class="bg-white rounded-xl p-4 w-[300px] shadow-xl">
            <div class="flex items-center justify-between mb-3">
              <h4 class="text-sm font-bold text-slate-800 flex items-center gap-1.5">
                <Plus class="w-4 h-4 text-emerald-500" />
                加款 - {{ depositItem.name }}
              </h4>
              <button @click="closeQuickAdd" class="text-neutral hover:text-slate-700">
                <X class="w-4 h-4" />
              </button>
            </div>
            <div class="space-y-3">
              <div class="bg-slate-50 rounded-lg p-3">
                <div class="flex justify-between text-xs text-slate-500 mb-1">
                  <span>当前余额</span>
                  <span class="font-medium text-slate-700">¥{{ formatNumber(depositItem.amount) }}</span>
                </div>
              </div>
              <div>
                <label class="block text-xs font-medium text-slate-600 mb-1">加款金额 (元)</label>
                <input
                  ref="quickAddInput"
                  type="number"
                  step="0.01"
                  v-model.number="quickAddAmount"
                  @keydown.enter="submitQuickAdd"
                  class="w-full border border-slate-200 rounded px-3 py-2 text-sm text-slate-800 focus:input-focus"
                  placeholder="输入正数为加款，负数为扣款"
                />
                <div class="flex gap-1 mt-1.5">
                  <button
                    v-for="n in [100, 500, 1000]"
                    :key="n"
                    @click="quickAddAmount = n"
                    class="flex-1 py-1 text-xs border border-slate-200 rounded hover:bg-emerald-50 hover:border-emerald-300 hover:text-emerald-600 transition-all"
                  >+¥{{ n }}</button>
                </div>
              </div>
              <div>
                <label class="block text-xs font-medium text-slate-600 mb-1">备注</label>
                <input
                  type="text"
                  v-model="quickAddNote"
                  class="w-full border border-slate-200 rounded px-3 py-2 text-sm text-slate-800 focus:input-focus"
                  placeholder="可选，如：转入、利息等"
                />
              </div>
              <button
                @click="submitQuickAdd"
                :disabled="!quickAddAmount || quickAdding"
                class="w-full py-2 bg-emerald-500 text-white rounded-lg hover:bg-emerald-600 transition-all font-medium text-sm disabled:opacity-50 disabled:cursor-not-allowed"
              >{{ quickAdding ? '处理中...' : '确认加款' }}</button>
            </div>
          </div>
        </div>
      </Teleport>
    </div>
    <Teleport to="body">
      <div v-if="showRepayDialog" class="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50" @click.self="showRepayDialog = false">
        <div class="bg-white rounded-xl p-4 w-[320px] shadow-xl">
          <div class="flex items-center justify-between mb-3">
            <h4 class="text-sm font-bold text-slate-800 flex items-center gap-1.5">
              <ArrowDownToLine class="w-4 h-4 text-emerald-500" />
              手动还款
            </h4>
            <button @click="showRepayDialog = false" class="text-neutral hover:text-slate-700">
              <X class="w-4 h-4" />
            </button>
          </div>
          <div class="space-y-3">
            <div class="bg-slate-50 rounded-lg p-3">
              <div class="flex justify-between text-xs text-slate-500 mb-1">
                <span>欠款项</span>
                <span class="font-medium text-slate-700">{{ depositItem.name }}</span>
              </div>
              <div class="flex justify-between text-xs text-slate-500 mb-1">
                <span>待还金额</span>
                <span class="font-medium text-red-500">¥{{ formatNumber(Math.abs(depositItem.amount)) }}</span>
              </div>
              <div class="flex justify-between text-xs text-slate-500">
                <span>扣款账户</span>
                <span class="font-medium text-slate-700">{{ paymentAccountName }}</span>
              </div>
            </div>
            <div>
              <label class="block text-xs font-medium text-slate-600 mb-1">还款金额 (元)</label>
              <input
                type="number"
                step="0.01"
                v-model.number="repayAmount"
                :max="Math.abs(depositItem.amount)"
                class="w-full border border-slate-200 rounded px-3 py-2 text-sm text-slate-800 focus:input-focus"
                placeholder="输入还款金额"
                @keydown.enter="handleRepay"
              />
              <div class="flex gap-1 mt-1.5">
                <button
                  v-for="ratio in [0.25, 0.5, 1]"
                  :key="ratio"
                  @click="repayAmount = Math.round(Math.abs(depositItem.amount) * ratio * 100) / 100"
                  class="flex-1 py-1 text-xs border border-slate-200 rounded hover:bg-emerald-50 hover:border-emerald-300 hover:text-emerald-600 transition-all"
                >{{ ratio === 1 ? '全部' : ratio * 100 + '%' }}</button>
              </div>
            </div>
            <button
              @click="handleRepay"
              :disabled="!repayAmount || repayAmount <= 0 || repaying"
              class="w-full py-2 bg-emerald-500 text-white rounded-lg hover:bg-emerald-600 transition-all font-medium text-sm disabled:opacity-50 disabled:cursor-not-allowed"
            >{{ repaying ? '还款中...' : '确认还款' }}</button>
          </div>
        </div>
      </div>
    </Teleport>
  </div>
</template>

<script setup>
import { ref, computed, watch, nextTick } from 'vue'
import { History, Pencil, Trash2, Calendar, Link2, CreditCard, ArrowDownToLine, X, Plus } from 'lucide-vue-next'
import { fmtNum } from '../utils/formatter'
import { depositApi } from '../utils/api'

const props = defineProps({
  depositItem: {
    type: Object,
    required: true
  },
  groupName: {
    type: String,
    default: ''
  },
  allDeposits: {
    type: Array,
    default: () => []
  }
})

const emit = defineEmits(['edit', 'delete', 'update', 'float-panel', 'repay'])

const itemRef = ref(null)
const showRepayDialog = ref(false)
const repayAmount = ref(0)
const repaying = ref(false)

const showQuickAdd = ref(false)
const quickAddAmount = ref(0)
const quickAddNote = ref('')
const quickAddInput = ref(null)
const quickAdding = ref(false)

watch(showQuickAdd, (v) => {
  if (v) {
    quickAddAmount.value = 0
    quickAddNote.value = ''
    nextTick(() => quickAddInput.value?.focus())
  }
})

function closeQuickAdd() {
  showQuickAdd.value = false
  quickAddAmount.value = 0
  quickAddNote.value = ''
}

async function submitQuickAdd() {
  if (!quickAddAmount.value || quickAdding.value) return
  quickAdding.value = true
  try {
    const change = parseFloat(quickAddAmount.value) || 0
    const finalMode = change >= 0 ? 'add' : 'deduct'
    const txAmount = change >= 0 ? change : -change
    await depositApi.addTransaction(props.depositItem.id, {
      mode: finalMode,
      amount: txAmount,
      note: quickAddNote.value || (change > 0 ? '加款' : '扣款')
    })
    emit('update', props.depositItem.id, { amount: (props.depositItem.amount || 0) + change })
    closeQuickAdd()
  } catch (err) {
    alert('加款失败：' + (err?.response?.data?.error || err.message || '未知错误'))
  } finally {
    quickAdding.value = false
  }
}

const isBound = computed(() => !!props.depositItem.bindType)

const bindLabel = computed(() => {
  const map = {
    stock_total_assets: '股票',
    gold_zheshang: '浙商',
    gold_ccb: '建行',
    gold_physical: '实物'
  }
  return map[props.depositItem.bindType] || ''
})

const paymentAccountName = computed(() => {
  if (!props.depositItem.paymentAccountId) return ''
  const acc = props.allDeposits.find(d => d.id === props.depositItem.paymentAccountId)
  return acc ? acc.name : ''
})

const displayAmount = computed(() => props.depositItem.amount)

const amountClass = computed(() => {
  if (isBound.value) return 'text-amber-500 font-medium'
  if (displayAmount.value < 0) return 'text-red-500'
  if (props.groupName.includes('应收')) return 'text-green-600'
  return 'text-slate-400'
})

function formatNumber(val, decimals = 2) {
  return fmtNum(val, decimals)
}

let pointerDownPos = null
let lastClickTime = 0
let singleClickTimer = null

function handlePointerDown(e) {
  if (e.button !== 0) return
  pointerDownPos = { x: e.clientX, y: e.clientY, pointerId: e.pointerId }
}

function handlePointerUp(e) {
  if (!pointerDownPos || pointerDownPos.pointerId !== e.pointerId) return
  const dx = e.clientX - pointerDownPos.x
  const dy = e.clientY - pointerDownPos.y
  pointerDownPos = null
  if (Math.sqrt(dx * dx + dy * dy) > 5) return

  const now = Date.now()
  if (now - lastClickTime < 300) {
    if (singleClickTimer) { clearTimeout(singleClickTimer); singleClickTimer = null }
    lastClickTime = 0
    emit('edit', props.depositItem.id)
  } else {
    lastClickTime = now
    singleClickTimer = setTimeout(() => {
      toggleFloatPanel()
      singleClickTimer = null
      lastClickTime = 0
    }, 250)
  }
}

function toggleFloatPanel() {
  const rect = itemRef.value?.getBoundingClientRect()
  emit('float-panel', {
    visible: true,
    title: props.depositItem.itemType === 'installment' ? '分期还款清单' : '交易记录',
    type: props.depositItem.itemType,
    itemId: props.depositItem.id,
    triggerRect: rect
  })
}

async function handleRepay() {
  if (!repayAmount.value || repayAmount.value <= 0) return
  repaying.value = true
  try {
    await depositApi.repay(props.depositItem.id, { amount: repayAmount.value })
    emit('update', props.depositItem.id, { amount: props.depositItem.amount + repayAmount.value })
    showRepayDialog.value = false
    repayAmount.value = 0
  } catch (err) {
    alert('还款失败：' + (err.response?.data?.error || err.message))
  } finally {
    repaying.value = false
  }
}
</script>
