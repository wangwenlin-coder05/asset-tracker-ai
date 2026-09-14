<template>
  <div class="gold-position-card bg-white rounded-lg card-shadow p-4">
    <div class="flex items-center justify-between mb-3">
      <div>
        <h3 class="font-bold text-slate-800">{{ goldItem.name }}</h3>
        <p class="text-xs text-slate-400">买入日期: {{ goldItem.buyDate || '-' }}</p>
      </div>
      <div class="flex gap-1">
        <button @click="$emit('buy', goldItem.id)" class="text-neutral hover:text-primary transition-all" title="买入">
          <PlusCircle class="w-4 h-4" />
        </button>
        <button @click="$emit('sell', goldItem.id)" class="text-neutral hover:text-primary transition-all" title="卖出">
          <TrendingDown class="w-4 h-4" />
        </button>
        <button @click="$emit('delete', goldItem.id)" class="text-neutral hover:text-loss transition-all" title="删除">
          <Trash2 class="w-4 h-4" />
        </button>
      </div>
    </div>
    <div class="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs bg-slate-50 rounded p-2">
      <div class="flex items-center gap-1 whitespace-nowrap">
        <span class="text-slate-400">持仓克数</span>
        <span class="font-bold text-amber-600">{{ formatNumber(calcRes.totalGrams, 4) }}g</span>
      </div>
      <div class="flex items-center gap-1 whitespace-nowrap">
        <span class="text-slate-400">持仓成本</span>
        <span class="font-bold text-amber-600">¥{{ formatNumber(calcRes.totalAmount) }}</span>
      </div>
      <div class="flex items-center gap-1 whitespace-nowrap gold-avg-cell" tabindex="0">
        <span class="text-slate-400">持仓均价</span>
        <span class="font-bold text-amber-600">¥{{ formatNumber(calcRes.avgPrice, 2) }}/g</span>
        <div class="gold-avg-tooltip">
          <div class="tip-title">持仓均价 = 净成本 ÷ 剩余克数</div>
          <div class="tip-row"><span>买入总额（含手续费）</span><b>+¥{{ formatNumber(buyTotal) }}</b></div>
          <div class="tip-row"><span>卖出收入（扣手续费）</span><b>-¥{{ formatNumber(sellTotal) }}</b></div>
          <div class="tip-row"><span>净成本（买入 - 卖出）</span><b>=¥{{ formatNumber(calcRes.totalAmount) }}</b></div>
          <div class="tip-row"><span>剩余克数（买 - 卖 + 赠送）</span><b>{{ formatNumber(calcRes.totalGrams, 4) }}g</b></div>
          <div class="tip-row result"><span>持仓均价</span><b>=¥{{ formatNumber(calcRes.avgPrice, 4) }}/g</b></div>
          <div v-if="hasSell" class="tip-note">注：卖出盈亏已摊入剩余持仓成本<br/>赚钱卖出 → 均价下降；亏钱卖出 → 均价上升</div>
        </div>
      </div>
      <div class="flex items-center gap-1 whitespace-nowrap">
        <span class="text-slate-400">总手续费</span>
        <span class="font-bold text-slate-600">¥{{ formatNumber(calcRes.totalFee) }}</span>
      </div>
    </div>
    <div v-if="enrichedTxs.length > 0" class="mt-3">
      <button @click="expanded = !expanded" class="text-xs text-neutral hover:text-primary flex items-center gap-1">
        <component :is="expanded ? ChevronDown : ChevronRight" class="w-3 h-3" />
        交易记录 ({{ enrichedTxs.length }})
      </button>
      <div v-if="expanded" class="gold-tx-shell mt-2 rounded-lg overflow-hidden">
        <div class="gold-tx-inner px-1 py-0.5 overflow-hidden">
          <table class="gold-tx-table table-fixed w-full">
            <colgroup>
              <col class="tx-col-date" /><col class="tx-col-type" /><col class="tx-col-price" />
              <col class="tx-col-grams" /><col class="tx-col-amount" /><col class="tx-col-fee" />
              <col class="tx-col-profit" /><col class="tx-col-cost" /><col class="tx-col-action" />
            </colgroup>
            <thead>
              <tr class="text-stone-400 bg-stone-100/40">
                <th class="py-1 px-1 text-left whitespace-nowrap">日期</th>
                <th class="py-1 px-1 text-left whitespace-nowrap">类型</th>
                <th class="py-1 px-1 text-right whitespace-nowrap">价格</th>
                <th class="py-1 px-1 text-right whitespace-nowrap">克数</th>
                <th class="py-1 px-1 text-right whitespace-nowrap">金额</th>
                <th class="py-1 px-1 text-right whitespace-nowrap">手续费</th>
                <th class="py-1 px-1 text-right whitespace-nowrap">盈利</th>
                <th class="py-1 px-1 text-right whitespace-nowrap">成本</th>
                <th class="py-1 px-1"></th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="tx in enrichedTxs" :key="tx.id" class="border-t border-stone-100 group">
                <td class="py-1 px-1 text-[10px] whitespace-nowrap">{{ tx.buyDate || tx.sellDate }}</td>
                <td class="py-1 px-1">
                  <span v-if="tx.type === 'buy'" class="text-green-600 text-[10px]">买入</span>
                  <span v-else class="text-red-600 text-[10px]">卖出</span>
                </td>
                <td class="py-1 px-1 text-right text-[10px]">{{ tx.type === 'buy' ? tx.buyPrice : tx.sellPrice }}</td>
                <td class="py-1 px-1 text-right text-[10px]">{{ tx.type === 'buy' ? tx.buyCount : tx.sellCount }}g</td>
                <td class="py-1 px-1 text-right text-[10px]">¥{{ formatNumber((tx.type === 'buy' ? tx.buyPrice : tx.sellPrice) * (tx.type === 'buy' ? tx.buyCount : tx.sellCount)) }}</td>
                <td class="py-1 px-1 text-right text-[10px]">¥{{ formatNumber(tx.commission || tx.sellCommission || 0) }}</td>
                <td class="py-1 px-1 text-right font-medium whitespace-nowrap text-[10px]">
                  <template v-if="tx.type === 'sell'">
                    <span :class="tx.netProfit >= 0 ? 'text-profit' : 'text-loss'">¥{{ formatNumber(tx.netProfit) }}</span>
                  </template>
                  <template v-else>-</template>
                </td>
                <td class="py-1 px-1 text-right whitespace-nowrap overflow-hidden text-ellipsis text-[10px]" :title="costDetail(tx)">
                  <template v-if="tx.costImpact !== null">
                    <span :class="tx.costImpact >= 0 ? 'text-profit' : 'text-loss'">{{ formatNumber(tx.oldAvg, 0) }}{{ tx.costImpact >= 0 ? '+' : '' }}{{ formatNumber(tx.costImpact, 1) }}&rarr;{{ formatNumber(tx.newAvg, 0) }}</span>
                  </template>
                  <template v-else>-</template>
                </td>
                <td class="py-1 px-1 text-center">
                  <button @click.stop="handleDeleteTx(tx)" class="text-neutral hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity" title="删除记录">
                    <X class="w-3 h-3" />
                  </button>
                </td>
              </tr>
            </tbody>
            <tfoot>
              <tr class="bg-stone-100/50 font-medium border-t border-stone-200 text-[10px]">
                <td class="py-1 px-1" colspan="6">总计</td>
                <td class="py-1 px-1 text-right whitespace-nowrap" :class="totalProfit >= 0 ? 'text-profit' : 'text-loss'">¥{{ formatNumber(totalProfit) }}</td>
                <td class="py-1 px-1 text-right whitespace-nowrap">手续费 ¥{{ formatNumber(calcRes.totalFee) }}</td>
                <td class="py-1 px-1"></td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed } from 'vue'
import { PlusCircle, TrendingDown, Trash2, ChevronRight, ChevronDown, X } from 'lucide-vue-next'
import { calcGold } from '../utils/calculator'
import { fmtNum } from '../utils/formatter'

const props = defineProps({
  goldItem: {
    type: Object,
    required: true
  }
})

const emit = defineEmits(['buy', 'sell', 'delete', 'delete-tx'])

const expanded = ref(true)

const calcRes = computed(() => calcGold(props.goldItem))

// 均价计算过程的明细数据
const buyTotal = computed(() => {
  return props.goldItem.buyRecords.reduce((sum, r) => sum + (r.buyPrice || 0) * (r.buyCount || 0) + (r.commission || 0), 0)
})
const sellTotal = computed(() => {
  return props.goldItem.sellRecords.reduce((sum, r) => sum + (r.sellPrice || 0) * (r.sellCount || 0) - (r.sellCommission || 0), 0)
})
const hasSell = computed(() => props.goldItem.sellRecords.length > 0)

const enrichedTxs = computed(() => {
  const txs = [
    ...props.goldItem.buyRecords.map(r => ({
      type: 'buy', ...r,
      price: r.buyPrice || 0,
      count: r.buyCount || 0,
      fee: r.commission || 0,
      amount: (r.buyPrice || 0) * (r.buyCount || 0)
    })),
    ...props.goldItem.sellRecords.map(r => ({
      type: 'sell', ...r,
      price: r.sellPrice || 0,
      count: r.sellCount || 0,
      fee: r.sellCommission || 0,
      amount: (r.sellPrice || 0) * (r.sellCount || 0)
    }))
  ].sort((a, b) => {
    if (a.createdAt && b.createdAt) return a.createdAt - b.createdAt
    const dateA = a.buyDate || a.sellDate || ''
    const dateB = b.buyDate || b.sellDate || ''
    return dateA.localeCompare(dateB)
  })

  // 逐笔计算运行成本
  let runningAmount = 0   // 累计净成本（买入成本 - 卖出收入）
  let runningGrams = 0    // 累计克数

  return txs.map(tx => {
    const oldAvg = runningGrams > 0 ? runningAmount / runningGrams : 0
    let costImpact = null
    let netProfit = 0
    let newAvg = oldAvg

    if (tx.type === 'buy') {
      const buyCost = tx.amount + tx.fee  // 含手续费的买入成本
      runningAmount += buyCost
      runningGrams += tx.count
      newAvg = runningGrams > 0 ? runningAmount / runningGrams : 0
      costImpact = newAvg - oldAvg
    } else {
      netProfit = (tx.price - oldAvg) * tx.count - tx.fee
      const sellRevenue = tx.amount - tx.fee
      runningAmount -= sellRevenue
      runningGrams -= tx.count
      newAvg = runningGrams > 0 ? runningAmount / runningGrams : 0
      costImpact = newAvg - oldAvg
    }

    return {
      ...tx,
      oldAvg,
      newAvg,
      costImpact,
      netProfit,
      runningGrams
    }
  })
})

const totalProfit = computed(() => {
  return enrichedTxs.value
    .filter(tx => tx.type === 'sell')
    .reduce((sum, tx) => sum + tx.netProfit, 0)
})

function formatNumber(val, decimals = 2) {
  return fmtNum(val, decimals)
}

function costDetail(tx) {
  if (tx.costImpact === null) return '-'
  return `${formatNumber(tx.oldAvg, 2)} ${tx.costImpact >= 0 ? '+' : ''}${formatNumber(tx.costImpact, 2)} → ${formatNumber(tx.newAvg, 2)}`
}

function handleDeleteTx(tx) {
  if (confirm('确定删除该条交易记录？')) {
    emit('delete-tx', { goldId: props.goldItem.id, txId: tx.id, txType: tx.type })
  }
}
</script>
