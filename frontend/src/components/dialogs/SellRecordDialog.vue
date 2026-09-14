<template>
  <div class="fixed inset-0 bg-black/50 flex items-center justify-center z-50" :class="{ 'hidden': !visible }">
    <div class="bg-white rounded-xl p-6 w-[420px] card-shadow dialog-enter">
      <div class="flex justify-between items-center mb-4">
        <h3 class="text-lg font-bold text-slate-800 flex items-center gap-2">
          <TrendingDown class="w-5 h-5 text-red-500" />
          记录卖出
        </h3>
        <button @click="$emit('close')" class="text-neutral hover:text-slate-800">
          <X class="w-5 h-5" />
        </button>
      </div>
      <div class="space-y-3">
        <div>
          <label class="block text-sm font-medium text-neutral mb-1">卖出类型</label>
          <div class="flex gap-2">
            <button
              v-for="opt in sellTypeOptions"
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
          <label class="block text-sm font-medium text-neutral mb-1">卖出日期</label>
          <div class="flex gap-1 items-center">
            <input
              type="date"
              v-model="form.sellDate"
              class="flex-1 min-w-0 border border-slate-200 rounded px-3 py-2 text-sm focus:input-focus"
            />
            <button
              @click="setDate(-1)"
              class="px-2 py-1.5 text-xs rounded border border-slate-200 text-slate-500 hover:border-red-300 hover:text-red-600 transition-all flex-shrink-0"
            >昨天</button>
            <button
              @click="setDate(-2)"
              class="px-2 py-1.5 text-xs rounded border border-slate-200 text-slate-500 hover:border-red-300 hover:text-red-600 transition-all flex-shrink-0"
            >前天</button>
          </div>
        </div>
        <div class="grid grid-cols-2 gap-3">
          <div>
            <label class="block text-sm font-medium text-neutral mb-1">卖出价 (元)</label>
            <input
              type="number"
              step="0.001"
              v-model.number="form.sellPrice"
              placeholder="0.000"
              @input="calculateFee"
              class="w-full border border-slate-200 rounded px-3 py-2 text-sm focus:input-focus"
            />
          </div>
          <div>
            <label class="block text-sm font-medium text-neutral mb-1">卖出股数</label>
            <div class="flex gap-1 items-center">
              <input
              type="number"
              step="1"
              v-model.number="form.sellCount"
              @focus="form.sellCount = null"
              @input="calculateFee"
              class="flex-1 min-w-0 border border-slate-200 rounded px-2 py-2 text-sm focus:input-focus"
            />
              <button
                v-for="n in [100, 200, 400]"
                :key="n"
                @click="form.sellCount = n"
                :class="[
                  'w-8 h-7 flex items-center justify-center text-xs rounded border transition-all flex-shrink-0',
                  form.sellCount === n
                    ? 'bg-red-500 text-white border-red-500'
                    : 'border-slate-200 text-slate-500 hover:border-red-300 hover:text-red-600'
                ]"
              >{{ n }}</button>
            </div>
          </div>
        </div>
        <div class="bg-red-50 p-3 rounded-lg text-xs text-neutral">
          <div class="mb-1">佣金: ¥{{ formatNumber(fee.commission) }}</div>
          <div class="mb-1">过户费: ¥{{ formatNumber(fee.transferFee) }}</div>
          <div class="mb-1">印花税: ¥{{ formatNumber(fee.stampTax) }}</div>
          <div class="font-medium">合计手续费: ¥{{ formatNumber(fee.total) }}</div>
        </div>
        <div v-if="stock" class="bg-blue-50 p-3 rounded-lg text-xs text-slate-700">
          <div class="mb-1">当前均价: ¥{{ formatNumber(calcStock(stock).avgCost, 3) }}</div>
          <div v-if="previewAvgCost !== null" class="font-medium text-blue-700">卖出后均价: ¥{{ formatNumber(previewAvgCost, 3) }}</div>
        </div>
        <button
          @click="handleConfirm"
          :disabled="!form.tType"
          :class="[
            'w-full py-2.5 text-white rounded-lg transition-all font-medium',
            form.tType ? 'bg-red-500 hover:bg-red-600' : 'bg-slate-300 cursor-not-allowed'
          ]"
        >确认卖出</button>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, reactive, computed } from 'vue'
import { TrendingDown, X } from 'lucide-vue-next'
import { calcSellFee, calcStock } from '../../utils/calculator'
import { fmtNum } from '../../utils/formatter'

const props = defineProps({
  stockId: {
    type: String,
    required: true
  },
  stock: {
    type: Object,
    default: null
  }
})

const emit = defineEmits(['close', 'confirm'])

const visible = ref(true)

const sellTypeOptions = [
  { value: '反T', label: '反T', activeClass: 'text-amber-600 bg-amber-50' },
  { value: '正T卖出', label: '正T卖出', activeClass: 'text-green-600 bg-green-50' },
  { value: '止盈', label: '止盈', activeClass: 'text-emerald-600 bg-emerald-50' },
  { value: '止损', label: '止损', activeClass: 'text-red-600 bg-red-50' }
]

const form = reactive({
  sellDate: new Date().toISOString().split('T')[0],
  sellPrice: null,
  sellCount: 100,
  tType: ''
})

const fee = computed(() => calcSellFee(form.sellPrice, form.sellCount))

const previewAvgCost = computed(() => {
  if (!props.stock || !props.stock.buyRecords) return null
  const stockInfo = calcStock(props.stock)
  const currentCount = stockInfo.tradeCount || 0
  const currentTotal = stockInfo.holdTotal || 0
  const sellPrice = form.sellPrice || 0
  const sellCount = form.sellCount || 0
  const sellFee = fee.value.total || 0
  if (sellPrice <= 0 || sellCount <= 0) return null
  const newTotal = currentTotal - sellPrice * sellCount + sellFee
  const newCount = currentCount - sellCount
  return newCount > 0 ? newTotal / newCount : null
})

function calculateFee() {}

function setDate(daysAgo) {
  const d = new Date()
  d.setDate(d.getDate() + daysAgo)
  form.sellDate = d.toISOString().split('T')[0]
}

function formatNumber(val, decimals = 2) {
  return fmtNum(val, decimals)
}

async function handleConfirm() {
  if (!form.tType) {
    alert('请选择卖出类型')
    return
  }
  if (!form.sellPrice || !form.sellCount) {
    alert('请填写完整信息')
    return
  }
  emit('confirm', {
    sellDate: form.sellDate,
    sellPrice: form.sellPrice,
    sellCount: form.sellCount,
    sellCommission: fee.value.commission,
    sellTransferFee: fee.value.transferFee,
    stampTax: fee.value.stampTax,
    tType: form.tType
  })
}
</script>