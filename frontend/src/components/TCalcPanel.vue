<template>
  <div class="rounded-3xl p-5 mb-3 text-slate-100 tech-bg relative overflow-hidden">
    <!-- 装饰光斑 -->
    <div class="pointer-events-none absolute -top-16 -right-16 w-56 h-56 rounded-full opacity-30 blur-3xl tech-glow-a"></div>
    <div class="pointer-events-none absolute -bottom-16 -left-16 w-56 h-56 rounded-full opacity-25 blur-3xl tech-glow-b"></div>
    <div class="pointer-events-none absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[500px] h-[500px] rounded-full opacity-[0.07] blur-3xl bg-sky-400"></div>

    <!-- 标题栏 -->
    <div class="flex items-center justify-between mb-3 flex-wrap gap-2 relative z-10">
      <h3 class="text-base sm:text-lg font-bold flex items-center gap-2.5 tracking-wide">
        <span class="flex items-center gap-1.5 px-3 py-1.5 rounded-xl tech-chip">
          <RefreshCcw class="w-4.5 h-4.5" />
        </span>
        T计算 · 做T摊薄成本
      </h3>
      <div class="flex items-center gap-2">
        <div class="flex rounded-lg overflow-hidden border border-white/20 text-xs">
          <button type="button"
            class="px-2.5 py-1.5 transition-colors"
            :class="followPreset ? 'bg-sky-400/25 text-sky-100 font-semibold' : 'text-slate-300 hover:bg-white/10'"
            @click="followPreset = true">跟随档位</button>
          <button type="button"
            class="px-2.5 py-1.5 transition-colors"
            :class="!followPreset ? 'bg-amber-400/25 text-amber-100 font-semibold' : 'text-slate-300 hover:bg-white/10'"
            @click="followPreset = false">临时试算</button>
        </div>
        <label class="flex items-center gap-1.5 text-xs text-slate-300">
          佣金率
          <input v-model.number="commRatePct" type="number" step="0.001" min="0" :disabled="followPreset"
            class="w-18 border rounded-lg px-2 py-1.5 text-sm text-right focus:outline-none focus:ring-2 focus:ring-sky-400/60 disabled:cursor-not-allowed"
            :class="followPreset ? 'bg-white/5 border-white/15 text-slate-400' : 'bg-white/10 border-white/20 text-slate-100'" />
          ‰
        </label>
      </div>
    </div>

    <!-- 费用来源说明 -->
    <div class="flex items-center gap-1.5 mb-4 text-[11px] relative z-10"
      :class="followPreset ? 'text-slate-400' : 'text-amber-300/80'">
      <Info class="w-3.5 h-3.5 shrink-0" />
      <span v-if="followPreset">
        跟随档位「{{ feeConfig.activePresetName }}」：佣金万分之 {{ toWan(feeConfig.commissionRate) }} · 最低 {{ feeConfig.minCommission }} 元，可在「设置 → 交易手续费」修改
      </span>
      <span v-else>
        临时试算：佣金万分之 {{ toWan(commRate) }} · 最低 {{ feeConfig.minCommission }} 元，仅本面板有效，不回写设置
      </span>
    </div>

    <!-- 双栏：正T | 反T -->
    <div class="grid grid-cols-1 lg:grid-cols-2 gap-4 relative z-10">
      <!-- ===== 正T ===== -->
      <section class="rounded-2xl mod-sky p-4">
        <h4 class="text-sm font-bold text-sky-300 tracking-widest mb-2 flex items-center gap-2">
          <span class="h-2 w-2 rounded-full bg-sky-400 shadow-[0_0_8px_rgba(56,189,248,0.8)]"></span>正T · 低买高卖
        </h4>
        <!-- 快捷键 -->
        <div class="flex items-center gap-1.5 flex-wrap mb-3">
          <span class="text-xs text-slate-400 font-medium">数量</span>
          <button v-for="n in quickCounts" :key="n" type="button" @click="tCount = n"
            class="px-2.5 py-1 text-xs rounded-lg border transition-all"
            :class="tCount === n ? 'border-sky-400 bg-sky-400/20 text-sky-100 font-semibold' : 'border-white/15 text-slate-300 hover:bg-white/10'">
            {{ n }}
          </button>
          <span class="text-xs text-slate-400 font-medium ml-1.5">利润</span>
          <button v-for="n in quickProfits" :key="n" type="button" @click="tProfit = n"
            class="px-2.5 py-1 text-xs rounded-lg border transition-all"
            :class="tProfit === n ? 'border-emerald-400 bg-emerald-400/20 text-emerald-100 font-semibold' : 'border-white/15 text-slate-300 hover:bg-white/10'">
            {{ n }}
          </button>
        </div>
        <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <!-- 左：按目标利润 -->
          <div class="rounded-xl bg-white/5 border border-white/10 p-3">
            <div class="text-xs text-sky-300/80 font-medium mb-2 flex items-center gap-1"><span class="w-4 h-4 rounded-full bg-sky-400/20 text-sky-300 text-[10px] flex items-center justify-center font-bold">1</span>按目标利润</div>
            <div class="grid grid-cols-3 gap-1.5">
              <label class="block text-xs text-slate-400">买入价
                <input v-model.number="tPrice" type="number" step="0.001" placeholder="8.76"
                  class="mt-1 w-full bg-white/10 border border-white/15 rounded-lg px-2 py-2 text-base font-medium text-slate-100 placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-sky-400/60" />
              </label>
              <label class="block text-xs text-slate-400">股数
                <input v-model.number="tCount" type="number" step="100" placeholder="400"
                  class="mt-1 w-full bg-white/10 border border-white/15 rounded-lg px-2 py-2 text-base font-medium text-slate-100 placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-sky-400/60" />
              </label>
              <label class="block text-xs text-slate-400">目标利润<span class="text-emerald-300 text-xs font-semibold ml-1">{{ fmt(tRoi) }}%</span>
                <input v-model.number="tProfit" type="number" step="1" placeholder="50"
                  class="mt-1 w-full bg-white/10 border border-white/15 rounded-lg px-2 py-2 text-base font-medium text-slate-100 placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-sky-400/60" />
              </label>
            </div>
            <div class="mt-3 rounded-lg bg-white/[0.04] border border-white/10 p-2.5 space-y-1.5">
              <div class="flex justify-between items-center text-sm"><span class="text-slate-400">手续费</span>
                <span class="text-slate-300">买 ¥{{ fmt(tBuyFee) }} + 卖 ¥{{ fmt(tSellFee) }}</span><b class="text-slate-100">= ¥{{ fmt(tFeeTotal) }}</b></div>
              <div class="flex justify-between text-sm"><span class="text-slate-400">保本价</span><b class="text-amber-300 text-base">¥{{ fmt(tBreakEven) }}</b></div>
              <div class="flex justify-between items-center pt-1.5 border-t border-white/10"><span class="text-slate-400">需卖出价</span><b class="text-sky-300 text-xl font-bold">¥{{ fmt(tNeedSell) }}</b></div>
            </div>
          </div>
          <!-- 右：按卖出价 -->
          <div class="rounded-xl bg-sky-400/10 border border-sky-400/25 p-3 flex flex-col">
            <div class="text-xs text-sky-300/80 font-medium mb-2 flex items-center gap-1"><span class="w-4 h-4 rounded-full bg-sky-400/25 text-sky-200 text-[10px] flex items-center justify-center font-bold">2</span>按卖出价</div>
            <label class="block text-xs text-slate-400">卖出价
              <input v-model.number="tVerify" type="number" step="0.001" placeholder="19.03"
                class="mt-1 w-full bg-white/10 border border-white/15 rounded-lg px-2 py-2 text-base font-medium text-slate-100 placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-emerald-400/60" />
            </label>
            <div class="mt-auto pt-3">
              <div class="text-xs text-slate-400">实际利润</div>
              <div class="text-2xl font-bold text-emerald-300 leading-tight drop-shadow-[0_0_8px_rgba(52,211,153,0.4)]">¥{{ fmt(tActualProfit) }}</div>
              <div class="text-emerald-300/80 text-sm font-medium">{{ fmt(tActualRoi) }}%</div>
            </div>
          </div>
        </div>
      </section>

      <!-- ===== 反T ===== -->
      <section class="rounded-2xl mod-fuchsia p-4">
        <h4 class="text-sm font-bold text-fuchsia-300 tracking-widest mb-2 flex items-center gap-2">
          <span class="h-2 w-2 rounded-full bg-fuchsia-400 shadow-[0_0_8px_rgba(232,121,249,0.8)]"></span>反T · 高卖低买回
        </h4>
        <!-- 快捷键 -->
        <div class="flex items-center gap-1.5 flex-wrap mb-3">
          <span class="text-xs text-slate-400 font-medium">数量</span>
          <button v-for="n in quickCounts" :key="n" type="button" @click="rtCount = n"
            class="px-2.5 py-1 text-xs rounded-lg border transition-all"
            :class="rtCount === n ? 'border-fuchsia-400 bg-fuchsia-400/20 text-fuchsia-100 font-semibold' : 'border-white/15 text-slate-300 hover:bg-white/10'">
            {{ n }}
          </button>
          <span class="text-xs text-slate-400 font-medium ml-1.5">利润</span>
          <button v-for="n in quickProfits" :key="n" type="button" @click="rtProfit = n"
            class="px-2.5 py-1 text-xs rounded-lg border transition-all"
            :class="rtProfit === n ? 'border-emerald-400 bg-emerald-400/20 text-emerald-100 font-semibold' : 'border-white/15 text-slate-300 hover:bg-white/10'">
            {{ n }}
          </button>
        </div>
        <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <!-- 左：按目标利润 -->
          <div class="rounded-xl bg-white/5 border border-white/10 p-3">
            <div class="text-xs text-fuchsia-300/80 font-medium mb-2 flex items-center gap-1"><span class="w-4 h-4 rounded-full bg-fuchsia-400/20 text-fuchsia-300 text-[10px] flex items-center justify-center font-bold">1</span>按目标利润</div>
            <div class="grid grid-cols-3 gap-1.5">
              <label class="block text-xs text-slate-400">卖出价
                <input v-model.number="rtPrice" type="number" step="0.001" placeholder="19.03"
                  class="mt-1 w-full bg-white/10 border border-white/15 rounded-lg px-2 py-2 text-base font-medium text-slate-100 placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-fuchsia-400/60" />
              </label>
              <label class="block text-xs text-slate-400">股数
                <input v-model.number="rtCount" type="number" step="100" placeholder="300"
                  class="mt-1 w-full bg-white/10 border border-white/15 rounded-lg px-2 py-2 text-base font-medium text-slate-100 placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-fuchsia-400/60" />
              </label>
              <label class="block text-xs text-slate-400">目标利润<span class="text-emerald-300 text-xs font-semibold ml-1">{{ fmt(rtRoi) }}%</span>
                <input v-model.number="rtProfit" type="number" step="1" placeholder="50"
                  class="mt-1 w-full bg-white/10 border border-white/15 rounded-lg px-2 py-2 text-base font-medium text-slate-100 placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-fuchsia-400/60" />
              </label>
            </div>
            <div class="mt-3 rounded-lg bg-white/[0.04] border border-white/10 p-2.5 space-y-1.5">
              <div class="flex justify-between items-center text-sm"><span class="text-slate-400">手续费</span>
                <span class="text-slate-300">卖 ¥{{ fmt(rtSellFeeA) }} + 买 ¥{{ fmt(rtBuyFee) }}</span><b class="text-slate-100">= ¥{{ fmt(rtFeeTotal) }}</b></div>
              <div class="flex justify-between text-sm"><span class="text-slate-400">保本价</span><b class="text-amber-300 text-base">¥{{ fmt(rtBreakEven) }}</b></div>
              <div class="flex justify-between items-center pt-1.5 border-t border-white/10"><span class="text-slate-400">需买入价</span><b class="text-fuchsia-300 text-xl font-bold">¥{{ fmt(rtNeedBuy) }}</b></div>
            </div>
          </div>
          <!-- 右：按买入价 -->
          <div class="rounded-xl bg-fuchsia-400/10 border border-fuchsia-400/25 p-3 flex flex-col">
            <div class="text-xs text-fuchsia-300/80 font-medium mb-2 flex items-center gap-1"><span class="w-4 h-4 rounded-full bg-fuchsia-400/25 text-fuchsia-200 text-[10px] flex items-center justify-center font-bold">2</span>按买入价</div>
            <label class="block text-xs text-slate-400">买入价
              <input v-model.number="rtVerify" type="number" step="0.001" placeholder="8.76"
                class="mt-1 w-full bg-white/10 border border-white/15 rounded-lg px-2 py-2 text-base font-medium text-slate-100 placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-emerald-400/60" />
            </label>
            <div class="mt-auto pt-3">
              <div class="text-xs text-slate-400">实际利润</div>
              <div class="text-2xl font-bold text-emerald-300 leading-tight drop-shadow-[0_0_8px_rgba(52,211,153,0.4)]">¥{{ fmt(rtActualProfit) }}</div>
              <div class="text-emerald-300/80 text-sm font-medium">{{ fmt(rtActualRoi) }}%</div>
            </div>
          </div>
        </div>
      </section>
    </div>
  </div>
</template>

<script setup>
import { computed, ref, watch } from 'vue'
import { RefreshCcw, Info } from 'lucide-vue-next'
import { feeConfig, toWan } from '../utils/feeConfig'

// ---- 配置与费率 ----
// 跟随档位：直接用「设置 → 交易手续费」里当前生效的档位；临时试算：本面板内单独改佣金率，不回写设置
const followPreset = ref(true)
const commRatePct = ref(toWan(feeConfig.commissionRate) / 10) // ‰ 万2.3
watch(() => feeConfig.commissionRate, r => { if (followPreset.value) commRatePct.value = toWan(r) / 10 })
// 切回跟随档位时，把输入框同步成当前档位费率
watch(followPreset, v => { if (v) commRatePct.value = toWan(feeConfig.commissionRate) / 10 })
const quickCounts = [100, 200, 300, 400]
const quickProfits = [20, 30, 40, 50, 60, 70, 80, 90, 100]

const fmt = (v, d = 2) => (v == null || isNaN(v)) ? '—' : Number(v).toFixed(d)

const commRate = computed(() => followPreset.value ? feeConfig.commissionRate : (Number(commRatePct.value) || 0) / 1000)

function buyFeeOf(amt) { return Math.max(amt * commRate.value, feeConfig.minCommission) + amt * feeConfig.transferFeeRate }
function sellFeeOf(amt) { return Math.max(amt * commRate.value, feeConfig.minCommission) + amt * (feeConfig.transferFeeRate + feeConfig.stampTaxRate) }
function buyCost(price, count) { const a = price * count; return a + buyFeeOf(a) }
function sellNet(price, count) { const a = price * count; return a - sellFeeOf(a) }
// 二分反解：给定目标净额 target，找价格 p 使 net(p)=target
function solveSell(target, count) {
  if (!count || count <= 0 || target <= 0) return 0
  let lo = 0, hi = target / count + 200, g = 0
  while (sellNet(hi, count) < target && g < 60) { hi *= 2; g++ }
  if (g >= 60) return 0
  for (let i = 0; i < 100; i++) { const m = (lo + hi) / 2; if (sellNet(m, count) < target) lo = m; else hi = m }
  return (lo + hi) / 2
}
function solveBuy(target, count) {
  if (!count || count <= 0 || target <= 0) return 0
  let lo = 0, hi = target / count + 200, g = 0
  while (buyCost(hi, count) < target && g < 60) { hi *= 2; g++ }
  if (g >= 60) return 0
  for (let i = 0; i < 100; i++) { const m = (lo + hi) / 2; if (buyCost(m, count) < target) lo = m; else hi = m }
  return (lo + hi) / 2
}

// ---- 正T 状态 ----
const tPrice = ref(null)    // 买入价
const tCount = ref(300)
const tProfit = ref(50)
const tVerify = ref(null)   // 卖出价(可选)

const tBuyCost = computed(() => tPrice.value > 0 && tCount.value > 0 ? buyCost(tPrice.value, tCount.value) : 0)
const tBreakEven = computed(() => solveSell(tBuyCost.value, tCount.value))
const tNeedSell = computed(() => solveSell(tBuyCost.value + (tProfit.value || 0), tCount.value))
const tSellFee = computed(() => (tNeedSell.value && tCount.value) ? sellFeeOf(tNeedSell.value * tCount.value) : 0)
const tBuyFee = computed(() => (tPrice.value && tCount.value) ? buyFeeOf(tPrice.value * tCount.value) : 0)
const tFeeTotal = computed(() => parseFloat((tBuyFee.value + tSellFee.value).toFixed(2)))
const tRoi = computed(() => tBuyCost.value ? parseFloat(((tProfit.value || 0) / tBuyCost.value * 100).toFixed(2)) : 0)
const tActualProfit = computed(() => {
  if (!(tVerify.value > 0) || !(tPrice.value > 0) || !tCount.value) return null
  return sellNet(tVerify.value, tCount.value) - buyCost(tPrice.value, tCount.value)
})
const tActualRoi = computed(() => tActualProfit.value != null && tBuyCost.value ? parseFloat((tActualProfit.value / tBuyCost.value * 100).toFixed(2)) : 0)

// ---- 反T 状态 ----
const rtPrice = ref(null)   // 卖出价
const rtCount = ref(300)
const rtProfit = ref(50)
const rtVerify = ref(null)  // 买入价(可选)

const rtSellNet = computed(() => rtPrice.value > 0 && rtCount.value > 0 ? sellNet(rtPrice.value, rtCount.value) : 0)
const rtBreakEven = computed(() => solveBuy(rtSellNet.value, rtCount.value))
const rtNeedBuy = computed(() => solveBuy(rtSellNet.value - (rtProfit.value || 0), rtCount.value))
const rtBuyFee = computed(() => (rtNeedBuy.value && rtCount.value) ? buyFeeOf(rtNeedBuy.value * rtCount.value) : 0)
const rtSellFeeA = computed(() => (rtPrice.value && rtCount.value) ? sellFeeOf(rtPrice.value * rtCount.value) : 0)
const rtFeeTotal = computed(() => parseFloat((rtSellFeeA.value + rtBuyFee.value).toFixed(2)))
const rtRoi = computed(() => rtSellNet.value ? parseFloat(((rtProfit.value || 0) / rtSellNet.value * 100).toFixed(2)) : 0)
const rtActualProfit = computed(() => {
  if (!(rtPrice.value > 0) || !(rtVerify.value > 0) || !rtCount.value) return null
  return sellNet(rtPrice.value, rtCount.value) - buyCost(rtVerify.value, rtCount.value)
})
const rtActualRoi = computed(() => rtActualProfit.value != null && rtSellNet.value ? parseFloat((rtActualProfit.value / rtSellNet.value * 100).toFixed(2)) : 0)
</script>

<style scoped>
.tech-bg {
  background: linear-gradient(135deg, #0b1120 0%, #0f172a 50%, #141a33 100%);
  border: 1px solid rgba(255, 255, 255, 0.08);
  box-shadow: 0 12px 36px rgba(2, 6, 23, 0.5), inset 0 1px 0 rgba(255, 255, 255, 0.06);
}
.tech-glow-a { background: #38bdf8; }
.tech-glow-b { background: #e879f9; }
.tech-chip {
  background: linear-gradient(135deg, rgba(56, 189, 248, 0.28), rgba(232, 121, 249, 0.28));
  border: 1px solid rgba(255, 255, 255, 0.18);
  color: #7dd3fc;
  box-shadow: 0 0 14px rgba(56, 189, 248, 0.25);
}
.mod-sky {
  background: linear-gradient(160deg, rgba(56, 189, 248, 0.10), rgba(56, 189, 248, 0.02) 60%);
  border: 1px solid rgba(56, 189, 248, 0.18);
}
.mod-fuchsia {
  background: linear-gradient(160deg, rgba(232, 121, 249, 0.10), rgba(232, 121, 249, 0.02) 60%);
  border: 1px solid rgba(232, 121, 249, 0.18);
}
</style>