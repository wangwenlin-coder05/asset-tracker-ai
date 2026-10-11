<template>
  <div class="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
    <div class="bg-white rounded-xl p-6 w-[480px] max-w-[92vw] max-h-[90vh] overflow-y-auto card-shadow dialog-enter" @keydown.esc="$emit('close')">
      <div class="flex justify-between items-center mb-4">
        <h3 class="text-lg font-bold text-slate-800 flex items-center gap-2">
          <LogOut class="w-5 h-5 text-purple-500" />
          清仓
        </h3>
        <button @click="$emit('close')" class="text-neutral hover:text-slate-800">
          <X class="w-5 h-5" />
        </button>
      </div>
      <div v-if="stock" class="space-y-3">
        <div class="text-sm text-slate-600">
          <span class="font-semibold text-slate-800">{{ stock.name || '未命名' }}</span>
          <span class="text-slate-400 ml-2">{{ stock.code }}</span>
        </div>
        <div class="bg-slate-50 p-3 rounded-lg text-xs text-slate-600 space-y-1">
          <div class="flex justify-between"><span>当前持仓</span><span>{{ tradeCount }} 股</span></div>
          <div class="flex justify-between"><span>清仓股数</span><span class="font-medium text-slate-800">{{ tradeCount }} 股</span></div>
          <div class="flex justify-between"><span>持仓均价</span><span>¥{{ formatNumber(avgCost, 3) }}</span></div>
        </div>
        <div>
          <label class="block text-sm font-medium text-neutral mb-1">清仓价格 (元)</label>
          <input
            type="number"
            step="0.001"
            v-model.number="form.sellPrice"
            autofocus
            @keydown.enter.prevent="handleConfirm"
            class="w-full border border-slate-200 rounded px-3 py-2 text-sm focus:input-focus"
          />
        </div>
        <div class="bg-red-50 p-3 rounded-lg text-xs text-neutral flex items-center justify-between gap-4">
          <div class="space-y-1">
            <div>佣金: ¥{{ formatNumber(fee.commission) }}</div>
            <div>过户费: ¥{{ formatNumber(fee.transferFee) }}</div>
            <div>印花税: ¥{{ formatNumber(fee.stampTax) }}</div>
            <div class="font-medium">合计手续费: ¥{{ formatNumber(fee.total) }}</div>
          </div>
          <div class="text-right flex-shrink-0">
            <div class="text-xs text-slate-400 mb-1">净盈亏</div>
            <div v-if="netProfit >= 0" class="text-lg font-bold text-red-700">
              净赚: ¥{{ formatNumber(netProfit) }}
            </div>
            <div v-else class="text-lg font-bold text-emerald-700">
              亏损: ¥{{ formatNumber(-netProfit) }}
            </div>
          </div>
        </div>
        <button
          @click="handleConfirm"
          :disabled="!form.sellPrice || form.sellPrice <= 0 || submitting"
          :class="[
            'w-full py-2.5 text-white rounded-lg transition-all font-medium',
            form.sellPrice > 0 && !submitting ? 'bg-purple-500 hover:bg-purple-600' : 'bg-slate-300 cursor-not-allowed'
          ]"
        >{{ submitting ? '提交中...' : '确认清仓' }}</button>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, reactive, computed } from 'vue'
import { LogOut, X } from 'lucide-vue-next'
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

const submitting = ref(false)

const stockInfo = computed(() => (props.stock ? calcStock(props.stock) : { tradeCount: 0, avgCost: 0 }))
const tradeCount = computed(() => stockInfo.value.tradeCount || 0)
const avgCost = computed(() => stockInfo.value.avgCost || 0)

const defaultPrice = computed(() => {
  if (props.stock?.sellPrice > 0) return props.stock.sellPrice
  return avgCost.value > 0 ? avgCost.value : null
})

const form = reactive({
  sellPrice: defaultPrice.value
})

const fee = computed(() => calcSellFee(form.sellPrice, tradeCount.value))

const netProfit = computed(() => {
  const price = form.sellPrice || 0
  if (price <= 0 || tradeCount.value <= 0) return 0
  return parseFloat(((price - avgCost.value) * tradeCount.value - fee.value.total).toFixed(2))
})

function formatNumber(val, decimals = 2) {
  return fmtNum(val, decimals)
}

function handleConfirm() {
  if (submitting.value) return
  if (!form.sellPrice || form.sellPrice <= 0) return
  submitting.value = true
  emit('confirm', {
    sellDate: new Date().toISOString().split('T')[0],
    sellPrice: form.sellPrice,
    sellCount: tradeCount.value,
    sellCommission: fee.value.commission,
    sellTransferFee: fee.value.transferFee,
    stampTax: fee.value.stampTax,
    netProfit: netProfit.value
  })
}
</script>