<template>
  <div class="fixed inset-0 bg-black/50 flex items-center justify-center z-50" :class="{ 'hidden': !visible }">
    <div class="bg-white rounded-xl p-6 w-[420px] card-shadow dialog-enter">
      <div class="flex justify-between items-center mb-4">
        <h3 class="text-lg font-bold text-slate-800 flex items-center gap-2">
          <PlusCircle class="w-5 h-5 text-green-500" />
          {{ isFirstBuy ? '建仓买入' : '加仓买入' }}
        </h3>
        <button @click="$emit('close')" class="text-neutral hover:text-slate-800">
          <X class="w-5 h-5" />
        </button>
      </div>
      <div class="space-y-3">
        <div v-if="!isFirstBuy">
          <label class="block text-sm font-medium text-neutral mb-1">买入类型</label>
          <div class="flex gap-2">
            <button
              v-for="opt in buyTypeOptions"
              :key="opt.value"
              @click="form.tType = opt.value"
              :class="[
                'flex-1 py-2 rounded-lg text-sm font-medium transition-all border-2',
                form.tType === opt.value
                  ? opt.activeClass + ' border-current'
                  : 'border-slate-200 text-slate-500 hover:border-slate-300'
              ]"
            >{{ opt.label }}</button>
          </div>
        </div>
        <div>
          <label class="block text-sm font-medium text-neutral mb-1">买入日期</label>
          <div class="flex gap-1 items-center">
            <input
              type="date"
              v-model="form.buyDate"
              class="flex-1 min-w-0 border border-slate-200 rounded px-3 py-2 text-sm focus:input-focus"
            />
            <button
              @click="setDate(-1)"
              class="px-2 py-1.5 text-xs rounded border border-slate-200 text-slate-500 hover:border-blue-300 hover:text-blue-600 transition-all flex-shrink-0"
            >昨天</button>
            <button
              @click="setDate(-2)"
              class="px-2 py-1.5 text-xs rounded border border-slate-200 text-slate-500 hover:border-blue-300 hover:text-blue-600 transition-all flex-shrink-0"
            >前天</button>
          </div>
        </div>
        <div class="grid grid-cols-2 gap-3">
          <div>
            <label class="block text-sm font-medium text-neutral mb-1">买入价 (元)</label>
            <input
              type="number"
              step="0.001"
              v-model.number="form.buyPrice"
              placeholder="0.000"
              @input="calculateFee"
              class="w-full border border-slate-200 rounded px-3 py-2 text-sm focus:input-focus"
            />
          </div>
          <div>
            <label class="block text-sm font-medium text-neutral mb-1">买入股数</label>
            <div class="flex gap-1 items-center">
              <input
              type="number"
              step="1"
              v-model.number="form.buyCount"
              @focus="form.buyCount = null"
              @input="calculateFee"
              class="flex-1 min-w-0 border border-slate-200 rounded px-2 py-2 text-sm focus:input-focus"
            />
              <button
                v-for="n in [100, 200, 400]"
                :key="n"
                @click="form.buyCount = n"
                :class="[
                  'w-8 h-7 flex items-center justify-center text-xs rounded border transition-all flex-shrink-0',
                  form.buyCount === n
                    ? 'bg-green-500 text-white border-green-500'
                    : 'border-slate-200 text-slate-500 hover:border-green-300 hover:text-green-600'
                ]"
              >{{ n }}</button>
            </div>
          </div>
        </div>
        <div class="bg-green-50 p-3 rounded-lg text-xs text-neutral">
          <div class="mb-1">佣金: ¥{{ formatNumber(fee.commission) }}</div>
          <div class="mb-1">过户费: ¥{{ formatNumber(fee.transferFee) }}</div>
          <div class="font-medium">合计: ¥{{ formatNumber(fee.total) }}</div>
        </div>
        <div v-if="!isFirstBuy && stock" class="bg-blue-50 p-3 rounded-lg text-xs text-slate-700">
          <div class="mb-1">当前均价: ¥{{ formatNumber(calcStock(stock).avgCost, 3) }}</div>
          <div v-if="previewAvgCost !== null" class="font-medium text-blue-700">买入后均价: ¥{{ formatNumber(previewAvgCost, 3) }}</div>
        </div>
        <button
          @click="handleConfirm"
          :disabled="!isFirstBuy && !form.tType"
          :class="[
            'w-full py-2.5 text-white rounded-lg transition-all font-medium',
            (isFirstBuy || form.tType) ? 'bg-green-500 hover:bg-green-600' : 'bg-slate-300 cursor-not-allowed'
          ]"
        >确认买入</button>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, reactive, computed } from 'vue'
import { PlusCircle, X } from 'lucide-vue-next'
import { calcBuyFee, calcStock } from '../../utils/calculator'
import { fmtNum } from '../../utils/formatter'

const props = defineProps({
  stockId: {
    type: String,
    required: true
  },
  isFirstBuy: {
    type: Boolean,
    default: false
  },
  stock: {
    type: Object,
    default: null
  }
})

const emit = defineEmits(['close', 'confirm'])

const visible = ref(true)

const buyTypeOptions = [
  { value: '正T', label: '正T', activeClass: 'text-green-600 bg-green-50' },
  { value: '反T承接', label: '反T承接', activeClass: 'text-amber-600 bg-amber-50' },
  { value: '补仓', label: '补仓', activeClass: 'text-blue-600 bg-blue-50' }
]

const form = reactive({
  buyDate: new Date().toISOString().split('T')[0],
  buyPrice: null,
  buyCount: 100,
  tType: ''
})

const fee = computed(() => calcBuyFee(form.buyPrice, form.buyCount))

const previewAvgCost = computed(() => {
  if (!props.stock || !props.stock.buyRecords) return null
  const stockInfo = calcStock(props.stock)
  const currentCount = stockInfo.tradeCount || 0
  const currentTotal = stockInfo.holdTotal || 0
  const buyPrice = form.buyPrice || 0
  const buyCount = form.buyCount || 0
  const buyFee = fee.value.total || 0
  if (buyPrice <= 0 || buyCount <= 0) return null
  const newTotal = currentTotal + buyPrice * buyCount + buyFee
  const newCount = currentCount + buyCount
  return newCount > 0 ? newTotal / newCount : 0
})

function calculateFee() {}

function setDate(daysAgo) {
  const d = new Date()
  d.setDate(d.getDate() + daysAgo)
  form.buyDate = d.toISOString().split('T')[0]
}

function formatNumber(val, decimals = 2) {
  return fmtNum(val, decimals)
}

async function handleConfirm() {
  if (!props.isFirstBuy && !form.tType) {
    alert('请选择买入类型')
    return
  }
  if (!form.buyPrice || !form.buyCount) {
    alert('请填写完整信息')
    return
  }
  emit('confirm', {
    buyDate: form.buyDate,
    buyPrice: form.buyPrice,
    buyCount: form.buyCount,
    commission: fee.value.commission,
    transferFee: fee.value.transferFee,
    tType: props.isFirstBuy ? '' : form.tType
  })
}
</script>