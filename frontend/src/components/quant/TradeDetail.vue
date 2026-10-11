<template>
  <div>
    <p class="text-xs font-semibold text-slate-600 mb-2">交易明细（{{ trades.length }} 笔）</p>
    <div v-if="trades.length" class="max-h-[420px] overflow-y-auto space-y-2 pr-1">
      <div v-for="(t, i) in trades" :key="i"
        class="rounded-lg border overflow-hidden"
        :class="t.net_pnl >= 0 ? 'border-emerald-100' : 'border-red-100'">
        <!-- 顶部条 -->
        <div class="flex items-center justify-between px-2.5 py-1 text-[10px]"
          :class="t.net_pnl >= 0 ? 'bg-emerald-50/60 text-emerald-700' : 'bg-red-50/60 text-red-700'">
          <span class="font-semibold">第 {{ i + 1 }} 笔</span>
          <span class="flex items-center gap-3">
            <span v-if="t.add_count" class="flex items-center gap-1">
              <svg width="10" height="10" viewBox="0 0 20 20" fill="none"><path d="M10 3v14M3 10h14" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>
              补仓 {{ t.add_count }} 次
            </span>
            <span>持仓 {{ holdDays(t) }} 天</span>
          </span>
        </div>
        <!-- 买卖两栏 -->
        <div class="grid grid-cols-2 gap-px bg-slate-100 text-xs">
          <!-- 买入 -->
          <div class="bg-white px-2.5 py-2">
            <div class="flex items-center gap-1 mb-1.5">
              <span class="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
              <span class="text-[10px] font-medium text-emerald-700">买入</span>
            </div>
            <div class="space-y-0.5">
              <div class="flex justify-between">
                <span class="text-slate-400">日期</span>
                <span class="text-slate-700">{{ t.entry_date }}</span>
              </div>
              <div class="flex justify-between">
                <span class="text-slate-400">价格</span>
                <span class="text-slate-800 font-medium">{{ t.entry_price }}</span>
              </div>
              <div class="flex justify-between">
                <span class="text-slate-400">股数</span>
                <span class="text-slate-700">{{ t.shares }}</span>
              </div>
              <div class="mt-1 pt-1 border-t border-slate-50">
                <span class="inline-block px-1.5 py-0.5 rounded text-[10px] bg-emerald-50 text-emerald-600">
                  {{ reasonText(t.entry_reason) }}
                </span>
              </div>
            </div>
          </div>
          <!-- 卖出 -->
          <div class="bg-white px-2.5 py-2">
            <div class="flex items-center justify-end gap-1 mb-1.5">
              <span class="text-[10px] font-medium text-red-700">卖出</span>
              <span class="w-1.5 h-1.5 rounded-full bg-red-500"></span>
            </div>
            <div class="space-y-0.5">
              <div class="flex justify-between">
                <span class="text-slate-400">日期</span>
                <span class="text-slate-700">{{ t.exit_date }}</span>
              </div>
              <div class="flex justify-between">
                <span class="text-slate-400">价格</span>
                <span class="text-slate-800 font-medium">{{ t.exit_price }}</span>
              </div>
              <div class="flex justify-between">
                <span class="text-slate-400">收益率</span>
                <span class="font-semibold" :class="t.return_pct >= 0 ? 'text-emerald-600' : 'text-red-600'">
                  {{ t.return_pct >= 0 ? '+' : '' }}{{ t.return_pct }}%
                </span>
              </div>
              <div class="flex justify-between">
                <span class="text-slate-400">净盈亏</span>
                <span class="font-semibold" :class="t.net_pnl >= 0 ? 'text-emerald-600' : 'text-red-600'">
                  {{ t.net_pnl >= 0 ? '+' : '' }}{{ t.net_pnl }}
                </span>
              </div>
              <div class="mt-1 pt-1 border-t border-slate-50 text-right">
                <span class="inline-block px-1.5 py-0.5 rounded text-[10px]"
                  :class="reasonClass(t.reason)">
                  {{ reasonText(t.reason) }}
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
    <p v-else class="py-6 text-center text-xs text-slate-300">无成交记录</p>
  </div>
</template>

<script setup>
defineProps({
  trades: { type: Array, default: () => [] },
})

function holdDays(t) {
  if (!t.entry_date || !t.exit_date) return 0
  const d1 = new Date(t.entry_date)
  const d2 = new Date(t.exit_date)
  return Math.round((d2 - d1) / 86400000)
}

function reasonText(r) {
  const s = String(r || '')
  return { RULE: '规则触发', TARGET: '达标止盈', STOP_LOSS: '止损', END: '回测结束平仓' }[s] || s || '—'
}
function reasonClass(r) {
  const s = String(r || '')
  if (/止损|跌破|死叉/.test(s)) return 'bg-red-50 text-red-500'
  if (/结束|到期/.test(s)) return 'bg-slate-100 text-slate-400'
  if (/止盈|金叉|突破|站上|建仓|下轨/.test(s)) return 'bg-emerald-50 text-emerald-600'
  return 'bg-slate-100 text-slate-500'
}
</script>
