<template>
  <Teleport to="body">
  <div class="fixed inset-0 bg-black/50 flex items-center justify-center z-50" :class="{ 'hidden': !visible }">
    <div class="gold-dialog bg-white rounded-xl p-6 w-[420px] card-shadow dialog-enter">
      <div class="flex justify-between items-center mb-4">
        <h3 class="text-lg font-bold text-slate-800 flex items-center gap-2">
          <TrendingDown class="w-5 h-5 text-rose-500" />
          黄金卖出
        </h3>
        <button @click="$emit('close')" class="text-neutral hover:text-slate-800">
          <X class="w-5 h-5" />
        </button>
      </div>
      <div class="space-y-3">
        <div>
          <label class="block text-sm font-medium text-slate-700 mb-1">卖出日期</label>
          <div class="flex gap-2 items-center">
            <input
              type="date"
              v-model="form.sellDate"
              class="flex-1 border border-slate-200 rounded px-3 py-2 text-sm text-slate-800 focus:input-focus"
            />
            <button type="button" @click="setDate(1)" class="px-2.5 py-2 text-xs rounded border" :class="isDateActive(1) ? 'border-amber-400 bg-amber-50 text-amber-700' : 'border-slate-200 text-slate-600 hover:bg-slate-50'">昨天</button>
            <button type="button" @click="setDate(2)" class="px-2.5 py-2 text-xs rounded border" :class="isDateActive(2) ? 'border-amber-400 bg-amber-50 text-amber-700' : 'border-slate-200 text-slate-600 hover:bg-slate-50'">前天</button>
          </div>
        </div>
        <div class="grid grid-cols-2 gap-3">
          <div>
            <label class="block text-sm font-medium text-slate-700 mb-1">卖出价格 (元/克)</label>
            <input
              type="number"
              step="0.01"
              v-model.number="form.sellPrice"
              @input="calculateFee"
              class="w-full border border-slate-200 rounded px-3 py-2 text-sm text-slate-800 focus:input-focus"
              placeholder="如 1186.35"
            />
          </div>
          <div>
            <label class="block text-sm font-medium text-slate-700 mb-1">卖出克数</label>
            <input
              type="number"
              step="0.0001"
              v-model.number="form.sellCount"
              @input="calculateFee"
              class="w-full border border-slate-200 rounded px-3 py-2 text-sm text-slate-800 focus:input-focus"
              placeholder="如 0.008"
            />
          </div>
        </div>
        <div class="flex gap-2">
          <button type="button" v-for="g in [1, 2, 3]" :key="g" @click="setGrams(g)" class="px-3 py-1.5 text-xs rounded border flex-1" :class="isGramsActive(g) ? 'border-amber-400 bg-amber-50 text-amber-700 font-medium' : 'border-slate-200 text-slate-600 hover:bg-slate-50'">{{ g }}g</button>
        </div>
        <div>
          <label class="block text-sm font-medium text-slate-700 mb-1">卖出手续费 (元)</label>
          <input
              type="number"
              step="0.01"
              v-model.number="form.fee"
              class="w-full border border-slate-200 rounded px-3 py-2 text-sm text-slate-800 focus:input-focus"
            />
          <p class="text-xs text-slate-400 mt-1">{{ feeHint }}</p>
        </div>
        <div class="bg-rose-50 p-3 rounded-lg text-xs text-slate-700">
          <div class="mb-1">卖出金额: ¥{{ formatNumber(sellAmount) }}</div>
          <div class="font-medium text-slate-800">实际到账: ¥{{ formatNumber(netAmount) }}</div>
        </div>
        <div v-if="goldItem" class="bg-blue-50 p-3 rounded-lg text-xs text-slate-700">
          <div class="mb-1">当前均价: ¥{{ formatNumber(calcGold(goldItem).avgPrice, 2) }}/g</div>
          <div v-if="previewAvg !== null" class="font-medium text-blue-700">卖出后均价: ¥{{ formatNumber(previewAvg, 2) }}/g</div>
        </div>
        <button
          @click="handleConfirm"
          class="w-full py-2.5 bg-rose-500 text-white rounded-lg hover:bg-rose-600 transition-all font-medium"
        >确认卖出</button>
      </div>
    </div>
  </div>
  </Teleport>
</template>

<script setup>
import { ref, reactive, computed, watch, onMounted } from 'vue'
import { TrendingDown, X } from 'lucide-vue-next'
import { fmtNum } from '../../utils/formatter'
import { calcGold } from '../../utils/calculator'

const props = defineProps({
  goldId: {
    type: String,
    required: true
  },
  goldItem: {
    type: Object,
    default: null
  }
})

const emit = defineEmits(['close', 'confirm'])

const visible = ref(true)

const form = reactive({
  sellDate: '',
  sellPrice: 0,
  sellCount: 1,
  fee: 0
})

const sellAmount = computed(() => form.sellPrice * form.sellCount)

const netAmount = computed(() => sellAmount.value - (form.fee || 0))

const previewAvg = computed(() => {
  if (!props.goldItem) return null
  const goldInfo = calcGold(props.goldItem)
  const currentGrams = goldInfo.totalGrams || 0
  const currentTotal = goldInfo.totalAmount || 0
  const sellPrice = form.sellPrice || 0
  const sellCount = form.sellCount || 0
  const sellFee = form.fee || 0
  if (sellPrice <= 0 || sellCount <= 0) return null
  const newTotal = currentTotal - sellPrice * sellCount + sellFee
  const newGrams = currentGrams - sellCount
  return newGrams > 0 ? newTotal / newGrams : null
})

const feeHint = computed(() => {
  const name = props.goldItem?.name || ''
  if (name.includes('建行')) return '建行积存金：卖出手续费固定 4 元'
  if (name.includes('浙商')) return '浙商积存金：卖出手续费为成交金额的 0.4%'
  return '未匹配固定规则，可手动填写手续费'
})

function formatDate(d) {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

function setDate(daysAgo) {
  const d = new Date()
  d.setDate(d.getDate() - daysAgo)
  form.sellDate = formatDate(d)
}

function setGrams(g) {
  form.sellCount = g
  calculateFee()
}

function isDateActive(daysAgo) {
  const d = new Date()
  d.setDate(d.getDate() - daysAgo)
  return form.sellDate === formatDate(d)
}

function isGramsActive(g) {
  return form.sellCount === g
}

watch([() => props.goldItem?.name, sellAmount], calculateFee, { immediate: true })
function calculateFee() {
  const name = props.goldItem?.name || ''
  if (name.includes('建行')) form.fee = 4
  else if (name.includes('浙商')) form.fee = Number((sellAmount.value * 0.004).toFixed(2))
}

function formatNumber(val, decimals = 2) {
  return fmtNum(val, decimals)
}

onMounted(() => {
  setDate(0)
})

async function handleConfirm() {
  if (!form.sellPrice || !form.sellCount) {
    alert('请填写完整信息')
    return
  }
  emit('confirm', {
    sellDate: form.sellDate,
    sellPrice: form.sellPrice,
    sellCount: form.sellCount,
    sellCommission: form.fee
  })
}
</script>
