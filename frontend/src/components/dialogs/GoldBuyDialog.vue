<template>
  <Teleport to="body">
  <div class="fixed inset-0 bg-black/50 flex items-center justify-center z-50" :class="{ 'hidden': !visible }">
    <div class="gold-dialog bg-white rounded-xl p-6 w-[420px] card-shadow dialog-enter">
      <div class="flex justify-between items-center mb-4">
        <h3 class="text-lg font-bold text-slate-800 flex items-center gap-2">
          <PlusCircle class="w-5 h-5 text-amber-500" />
          黄金买入
        </h3>
        <button @click="$emit('close')" class="text-neutral hover:text-slate-800">
          <X class="w-5 h-5" />
        </button>
      </div>
      <div class="space-y-3">
        <div>
          <label class="block text-sm font-medium text-slate-700 mb-1">买入日期</label>
          <div class="flex gap-2 items-center">
            <input
              type="date"
              v-model="form.buyDate"
              class="flex-1 border border-slate-200 rounded px-3 py-2 text-sm text-slate-800 focus:input-focus"
            />
            <button type="button" @click="setDate(1)" class="px-2.5 py-2 text-xs rounded border" :class="isDateActive(1) ? 'border-amber-400 bg-amber-50 text-amber-700' : 'border-slate-200 text-slate-600 hover:bg-slate-50'">昨天</button>
            <button type="button" @click="setDate(2)" class="px-2.5 py-2 text-xs rounded border" :class="isDateActive(2) ? 'border-amber-400 bg-amber-50 text-amber-700' : 'border-slate-200 text-slate-600 hover:bg-slate-50'">前天</button>
          </div>
        </div>
        <div class="grid grid-cols-2 gap-3">
          <div>
            <div class="flex items-center justify-between mb-1">
              <label class="text-sm font-medium text-slate-700">{{ inputMode === 'price' ? '买入价 (元/克)' : '买入金额 (元)' }}</label>
              <div class="flex text-xs border border-slate-200 rounded overflow-hidden">
                <button type="button" @click="switchMode('price')" class="px-2 py-0.5" :class="inputMode === 'price' ? 'bg-amber-500 text-white' : 'text-slate-500 hover:bg-slate-50'">单价</button>
                <button type="button" @click="switchMode('amount')" class="px-2 py-0.5" :class="inputMode === 'amount' ? 'bg-amber-500 text-white' : 'text-slate-500 hover:bg-slate-50'">总额</button>
              </div>
            </div>
            <input
              type="number"
              step="0.01"
              v-model.number="inputValue"
              class="w-full border border-slate-200 rounded px-3 py-2 text-sm text-slate-800 focus:input-focus"
            />
          </div>
          <div>
            <label class="block text-sm font-medium text-slate-700 mb-1">克数</label>
            <input
              type="number"
              step="0.01"
              v-model.number="form.buyCount"
              class="w-full border border-slate-200 rounded px-3 py-2 text-sm text-slate-800 focus:input-focus"
            />
          </div>
        </div>
        <div class="flex gap-2">
          <button type="button" v-for="g in [1, 2, 3]" :key="g" @click="setGrams(g)" class="px-3 py-1.5 text-xs rounded border flex-1" :class="isGramsActive(g) ? 'border-amber-400 bg-amber-50 text-amber-700 font-medium' : 'border-slate-200 text-slate-600 hover:bg-slate-50'">{{ g }}g</button>
        </div>
        <div>
          <label class="block text-sm font-medium text-slate-700 mb-1">手续费 (元)</label>
          <input
              type="number"
              step="0.01"
              v-model.number="form.fee"
              class="w-full border border-slate-200 rounded px-3 py-2 text-sm text-slate-800 focus:input-focus"
            />
          <p class="gold-fee-hint text-xs text-slate-400 mt-1">{{ feeHint }}</p>
        </div>
        <div class="bg-amber-50 p-3 rounded-lg text-xs text-slate-700">
          <div class="mb-1">买入价 (元/克): ¥{{ formatNumber(form.buyPrice) }}</div>
          <div class="mb-1">买入金额: ¥{{ formatNumber(buyAmount.value) }}</div>
          <div class="font-medium text-slate-800">合计(含手续费): ¥{{ formatNumber(totalAmount.value) }}</div>
        </div>
        <div v-if="goldItem" class="bg-blue-50 p-3 rounded-lg text-xs text-slate-700">
          <div class="mb-1">当前均价: ¥{{ formatNumber(calcGold(goldItem).avgPrice, 2) }}/g</div>
          <div v-if="previewAvg !== null" class="font-medium text-blue-700">买入后均价: ¥{{ formatNumber(previewAvg, 2) }}/g</div>
        </div>
        <button
          @click="handleConfirm"
          class="w-full py-2.5 bg-amber-500 text-white rounded-lg hover:bg-amber-600 transition-all font-medium"
        >确认买入</button>
      </div>
    </div>
  </div>
  </Teleport>
</template>

<script setup>
import { ref, reactive, computed, watch, onMounted } from 'vue'
import { PlusCircle, X } from 'lucide-vue-next'
import { fmtNum } from '../../utils/formatter'
import { calcGold } from '../../utils/calculator'

const props = defineProps({
  goldId: { type: String, required: true },
  goldItem: { type: Object, default: null }
})

const emit = defineEmits(['close', 'confirm'])

const visible = ref(true)
const inputMode = ref('price')

const form = reactive({
  buyDate: '',
  buyPrice: 0,
  buyCount: 1,
  fee: 0
})

const inputValue = computed({
  get() {
    if (inputMode.value === 'price') {
      return form.buyPrice
    }
    return (form.buyPrice || 0) * (form.buyCount || 0)
  },
  set(val) {
    if (inputMode.value === 'price') {
      form.buyPrice = val || 0
    } else {
      const count = form.buyCount || 1
      form.buyPrice = (val || 0) / count
    }
  }
})

const buyAmount = computed(() => {
  return (form.buyPrice || 0) * (form.buyCount || 0)
})

const totalAmount = computed(() => buyAmount.value + (form.fee || 0))

const previewAvg = computed(() => {
  if (!props.goldItem) return null
  const goldInfo = calcGold(props.goldItem)
  const currentGrams = goldInfo.totalGrams || 0
  const currentTotal = goldInfo.totalAmount || 0
  const buyPrice = form.buyPrice || 0
  const buyCount = form.buyCount || 0
  const buyFee = form.fee || 0
  if (buyPrice <= 0 || buyCount <= 0) return null
  const newTotal = currentTotal + buyPrice * buyCount + buyFee
  const newGrams = currentGrams + buyCount
  return newGrams > 0 ? newTotal / newGrams : 0
})

const feeHint = computed(() => {
  const name = props.goldItem?.name || ''
  if (name.includes('\u5efa\u884c')) return '\u5efa\u884c\u79ef\u5b58\u91d1\uff1a\u4e70\u5165\u624b\u7eed\u8d39\u56fa\u5b9a 4 \u5143'
  if (name.includes('\u6d59\u5546')) return '\u6d59\u5546\u79ef\u5b58\u91d1\uff1a\u4e70\u5165\u624b\u7eed\u8d39 0 \u5143'
  return '\u672a\u5339\u914d\u56fa\u5b9a\u89c4\u5219\uff0c\u53ef\u624b\u52a8\u586b\u5199\u624b\u7eed\u8d39'
})
watch(() => props.goldItem?.name, applyFeeRule, { immediate: true })
function applyFeeRule(name = '') {
  if (name.includes('\u5efa\u884c')) form.fee = 4
  else if (name.includes('\u6d59\u5546')) form.fee = 0
}

function switchMode(mode) {
  inputMode.value = mode
}

function formatDate(d) {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

function setDate(daysAgo) {
  const d = new Date()
  d.setDate(d.getDate() - daysAgo)
  form.buyDate = formatDate(d)
}

function setGrams(g) {
  form.buyCount = g
}

function isDateActive(daysAgo) {
  const d = new Date()
  d.setDate(d.getDate() - daysAgo)
  return form.buyDate === formatDate(d)
}

function isGramsActive(g) {
  return form.buyCount === g
}

function formatNumber(val, decimals = 2) {
  return fmtNum(val, decimals)
}

onMounted(() => {
  setDate(0)
})

async function handleConfirm() {
  if (!form.buyPrice || !form.buyCount) {
    alert('请填写完整信息')
    return
  }
  emit('confirm', {
    buyDate: form.buyDate,
    buyPrice: form.buyPrice,
    buyCount: form.buyCount,
    commission: form.fee
  })
}
</script>
