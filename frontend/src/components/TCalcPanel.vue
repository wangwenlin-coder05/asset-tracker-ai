﻿<template>
  <div class="rounded-3xl p-3.5 mb-2.5 text-slate-100 tech-bg relative overflow-hidden">
    <!-- 装饰光斑 -->
    <div class="pointer-events-none absolute -top-16 -right-16 w-56 h-56 rounded-full opacity-30 blur-3xl tech-glow-a"></div>
    <div class="pointer-events-none absolute -bottom-16 -left-16 w-56 h-56 rounded-full opacity-25 blur-3xl tech-glow-b"></div>
    <div class="pointer-events-none absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[500px] h-[500px] rounded-full opacity-[0.07] blur-3xl bg-sky-400"></div>

    <!-- 标题栏：标题 | 费用说明 | 档位·佣金率 -->
    <div class="flex items-center gap-2 mb-1.5 relative z-10">
      <h3 class="text-sm sm:text-base font-bold flex items-center gap-2 tracking-wide flex-shrink-0">
        <span class="flex items-center gap-1.5 px-2.5 py-1 rounded-xl tech-chip">
          <RefreshCcw class="w-4 h-4" />
        </span>
        T计算 · 做T摊薄成本
      </h3>
      <!-- 费用来源说明：中间自适应并居中 -->
      <div class="flex items-center justify-center gap-1.5 text-[12px] flex-1 min-w-0"
        :class="followPreset ? 'text-slate-400' : 'text-amber-300/80'">
        <Info class="w-3.5 h-3.5 shrink-0" />
        <span class="truncate" v-if="followPreset">
          「{{ feeConfig.activePresetName }}」佣金万{{ toWan(feeConfig.commissionRate) }}·最低{{ feeConfig.minCommission }}元
        </span>
        <span class="truncate" v-else>
          临时试算：佣金万{{ toWan(commRate) }}·最低{{ feeConfig.minCommission }}元
        </span>
      </div>
      <div class="flex items-center gap-2 flex-shrink-0">
        <!-- 历史记录标题（从历史卡片移入标题栏） -->
        <span class="flex items-center gap-1.5 text-[12px] text-slate-400 shrink-0">
          <Clock class="w-3.5 h-3.5" />历史记录<template v-if="history.length"> · {{ history.length }}</template>
        </span>
        <button v-if="history.length" type="button" @click="clearHistory" class="flex items-center gap-1 text-[11px] text-rose-300 hover:text-rose-200 shrink-0"><Trash2 class="w-3 h-3" />清空</button>
        <span class="w-px h-4 bg-white/15 shrink-0"></span>
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

    <!-- 三栏：正T | 历史记录 | 反T -->
    <div class="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_20rem_minmax(0,1fr)] gap-3 relative z-10">
      <!-- ===== 正T ===== -->
      <section class="rounded-2xl mod-sky p-3.5">
        <h4 class="text-sm font-bold text-sky-300 tracking-widest mb-2 flex items-center gap-2">
          <span class="h-2 w-2 rounded-full bg-sky-400 shadow-[0_0_8px_rgba(56,189,248,0.8)]"></span>正T · 低买高卖
        </h4>
        <!-- 快捷键 -->
        <div class="quick-presets flex flex-wrap items-center gap-1 mb-1.5">
          <span class="text-[11px] text-slate-400 font-medium">数量</span>
          <button v-for="n in quickCounts" :key="n" type="button" @click="onQuickSet(() => tCount = n)"
            class="px-2 py-0.5 text-[11px] leading-4 rounded-md border transition-all"
            :class="tCount === n ? 'border-sky-400 bg-sky-400/20 text-sky-100 font-semibold' : 'border-white/15 text-slate-300 hover:bg-white/10'">
            {{ n }}
          </button>
          <span class="text-[11px] text-slate-400 font-medium ml-0.5">利润</span>
          <button v-for="n in quickProfits" :key="n" type="button" @click="onQuickSet(() => tProfit = n)"
            class="shrink-0 px-1.5 py-0.5 text-[11px] leading-4 rounded-md border transition-all"
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
                <input v-model.number="tPrice" type="number" step="0.001" placeholder="8.76" @blur="onFieldBlur"
                  class="mt-1 w-full bg-white/10 border border-white/15 rounded-lg px-2 py-2 text-base font-medium text-slate-100 placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-sky-400/60" />
              </label>
              <label class="block text-xs text-slate-400">股数
                <input v-model.number="tCount" type="number" step="100" placeholder="400" @blur="onFieldBlur"
                  class="mt-1 w-full bg-white/10 border border-white/15 rounded-lg px-2 py-2 text-base font-medium text-slate-100 placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-sky-400/60" />
              </label>
              <label class="block text-xs text-slate-400">
                <span class="flex items-baseline justify-between"><span>目标利润</span><span class="text-emerald-300 text-[11px] font-semibold">{{ fmt(tRoi) }}%</span></span>
                <input v-model.number="tProfit" type="number" step="1" placeholder="50" @blur="onFieldBlur"
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
              <input v-model.number="tVerify" type="number" step="0.001" placeholder="19.03" @blur="onFieldBlur"
                class="mt-1 w-full bg-white/10 border border-white/15 rounded-lg px-2 py-2 text-base font-medium text-slate-100 placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-emerald-400/60" />
            </label>
            <div class="mt-auto pt-3">
              <div class="text-xs text-slate-400">润卖</div>
              <div class="flex items-baseline gap-2">
                <span class="text-2xl font-bold text-emerald-300 leading-tight drop-shadow-[0_0_8px_rgba(52,211,153,0.4)]">¥{{ fmt(tActualProfit) }}</span>
                <span class="text-emerald-300/80 text-sm font-medium">{{ fmt(tActualRoi) }}%</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      <!-- ===== 历史记录：两栏 正T / 反T ===== -->
      <aside class="tcalc-history relative rounded-2xl border border-white/10 bg-white/[0.035] p-2.5">
        <div class="grid grid-cols-2 grid-rows-1 gap-1.5 lg:absolute lg:inset-2.5">
          <!-- 左：正T -->
          <div class="rounded-lg border border-sky-400/20 bg-sky-400/[0.04] overflow-hidden flex flex-col">
            <div class="px-2 py-1 text-[11px] text-sky-300/70 border-b border-sky-400/15 font-semibold shrink-0">正T</div>
            <div class="max-h-[12rem] lg:max-h-none flex-1 min-h-0 overflow-y-auto tcalc-scroll">
              <div v-if="!historyT.length" class="px-2 py-3 text-center text-[11px] text-slate-500">暂无</div>
              <div v-for="rec in historyT" :key="rec.id" class="tcalc-rec group px-2 py-1 border-b border-white/[0.04] last:border-0 cursor-pointer hover:bg-white/[0.06] transition-colors" @click="applyRecord(rec)">
                <div v-for="(line, idx) in historyParts(rec)" :key="idx" class="text-[11px] leading-[15px]">
                  <span v-for="(seg, sIdx) in line" :key="sIdx" :class="seg.cls">{{ seg.text }}</span>
                </div>
                <button type="button" @click.stop="removeRecord(rec.id)" title="删除" class="shrink-0 p-0.5 rounded text-slate-500 hover:text-rose-300 opacity-0 group-hover:opacity-100 transition-all absolute right-1 top-1"><X class="w-3 h-3" /></button>
              </div>
            </div>
          </div>
          <!-- 右：反T -->
          <div class="rounded-lg border border-fuchsia-400/20 bg-fuchsia-400/[0.04] overflow-hidden flex flex-col">
            <div class="px-2 py-1 text-[11px] text-fuchsia-300/70 border-b border-fuchsia-400/15 font-semibold shrink-0">反T</div>
            <div class="max-h-[12rem] lg:max-h-none flex-1 min-h-0 overflow-y-auto tcalc-scroll">
              <div v-if="!historyRT.length" class="px-2 py-3 text-center text-[11px] text-slate-500">暂无</div>
              <div v-for="rec in historyRT" :key="rec.id" class="tcalc-rec group px-2 py-1 border-b border-white/[0.04] last:border-0 cursor-pointer hover:bg-white/[0.06] transition-colors" @click="applyRecord(rec)">
                <div v-for="(line, idx) in historyParts(rec)" :key="idx" class="text-[11px] leading-[15px]">
                  <span v-for="(seg, sIdx) in line" :key="sIdx" :class="seg.cls">{{ seg.text }}</span>
                </div>
                <button type="button" @click.stop="removeRecord(rec.id)" title="删除" class="shrink-0 p-0.5 rounded text-slate-500 hover:text-rose-300 opacity-0 group-hover:opacity-100 transition-all absolute right-1 top-1"><X class="w-3 h-3" /></button>
              </div>
            </div>
          </div>
        </div>
      </aside>

      <!-- ===== 反T ===== -->
      <section class="rounded-2xl mod-fuchsia p-3.5">
        <h4 class="text-sm font-bold text-fuchsia-300 tracking-widest mb-2 flex items-center gap-2">
          <span class="h-2 w-2 rounded-full bg-fuchsia-400 shadow-[0_0_8px_rgba(232,121,249,0.8)]"></span>反T · 高卖低买回
        </h4>
        <!-- 快捷键 -->
        <div class="quick-presets flex flex-wrap items-center gap-1 mb-1.5">
          <span class="text-[11px] text-slate-400 font-medium">数量</span>
          <button v-for="n in quickCounts" :key="n" type="button" @click="onQuickSet(() => rtCount = n)"
            class="px-2 py-0.5 text-[11px] leading-4 rounded-md border transition-all"
            :class="rtCount === n ? 'border-fuchsia-400 bg-fuchsia-400/20 text-fuchsia-100 font-semibold' : 'border-white/15 text-slate-300 hover:bg-white/10'">
            {{ n }}
          </button>
          <span class="text-[11px] text-slate-400 font-medium ml-0.5">利润</span>
          <button v-for="n in quickProfits" :key="n" type="button" @click="onQuickSet(() => rtProfit = n)"
            class="shrink-0 px-1.5 py-0.5 text-[11px] leading-4 rounded-md border transition-all"
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
                <input v-model.number="rtPrice" type="number" step="0.001" placeholder="19.03" @blur="onFieldBlur"
                  class="mt-1 w-full bg-white/10 border border-white/15 rounded-lg px-2 py-2 text-base font-medium text-slate-100 placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-fuchsia-400/60" />
              </label>
              <label class="block text-xs text-slate-400">股数
                <input v-model.number="rtCount" type="number" step="100" placeholder="300" @blur="onFieldBlur"
                  class="mt-1 w-full bg-white/10 border border-white/15 rounded-lg px-2 py-2 text-base font-medium text-slate-100 placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-fuchsia-400/60" />
              </label>
              <label class="block text-xs text-slate-400">
                <span class="flex items-baseline justify-between"><span>目标利润</span><span class="text-emerald-300 text-[11px] font-semibold">{{ fmt(rtRoi) }}%</span></span>
                <input v-model.number="rtProfit" type="number" step="1" placeholder="50" @blur="onFieldBlur"
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
              <input v-model.number="rtVerify" type="number" step="0.001" placeholder="8.76" @blur="onFieldBlur"
                class="mt-1 w-full bg-white/10 border border-white/15 rounded-lg px-2 py-2 text-base font-medium text-slate-100 placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-emerald-400/60" />
            </label>
            <div class="mt-auto pt-3">
              <div class="text-xs text-slate-400">润买</div>
              <div class="flex items-baseline gap-2">
                <span class="text-2xl font-bold text-emerald-300 leading-tight drop-shadow-[0_0_8px_rgba(52,211,153,0.4)]">¥{{ fmt(rtActualProfit) }}</span>
                <span class="text-emerald-300/80 text-sm font-medium">{{ fmt(rtActualRoi) }}%</span>
              </div>
            </div>
          </div>
        </div>
      </section>
    </div>
  </div>
</template>

<script setup>
import { computed, nextTick, ref, watch } from 'vue'
import { RefreshCcw, Info, Clock, X, Trash2 } from 'lucide-vue-next'
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

// ---- 试算历史（本地缓存：试算自动记录 → 点击回填 → 单条删除/清空） ----
const HISTORY_KEY = 'tcalc-history-v2'
const LEGACY_KEY = 'tcalc-history-v1'
const history = ref(loadHistory())

const historyT = computed(() => history.value.filter(r => r.t))
const historyRT = computed(() => history.value.filter(r => r.rt))

function loadHistory() {
  try {
    // 首次从旧 key 迁移
    const oldRaw = localStorage.getItem(LEGACY_KEY)
    if (oldRaw && !localStorage.getItem(HISTORY_KEY)) {
      localStorage.setItem(HISTORY_KEY, oldRaw)
      localStorage.removeItem(LEGACY_KEY)
    }
    const raw = JSON.parse(localStorage.getItem(HISTORY_KEY))
    return Array.isArray(raw) ? dedupeHistory(raw) : []
  } catch { return [] }
}
function persist() {
  try { localStorage.setItem(HISTORY_KEY, JSON.stringify(history.value)) } catch {}
}
function compactNum(value, digits = 3) {
  if (value == null || value === '' || Number.isNaN(Number(value))) return '—'
  return Number(Number(value).toFixed(digits)).toString()
}

function buildHistoryParts() {
  const tActual = tActualProfit.value
  const t = (tPrice.value > 0 && tCount.value > 0 && tProfit.value != null)
    ? { buy: tPrice.value, breakEven: tBreakEven.value, sell: tNeedSell.value, count: tCount.value, profit: tProfit.value, actualProfit: tActual, verifySell: tVerify.value > 0 ? tVerify.value : null } : null
  const rtActual = rtActualProfit.value
  const rt = (rtPrice.value > 0 && rtCount.value > 0 && rtProfit.value != null)
    ? { sell: rtPrice.value, breakEven: rtBreakEven.value, buy: rtNeedBuy.value, count: rtCount.value, profit: rtProfit.value, actualProfit: rtActual, verifyBuy: rtVerify.value > 0 ? rtVerify.value : null } : null
  return { t, rt }
}
function historyParts(rec) {
  const item = rec.t || rec.rt
  if (!item) return [[{ text: '无有效参数', cls: '' }]]
  const breakEven = item.breakEven ?? '—'
  if (rec.t) {
    // 正T: 买价股数红, 利润橙, 卖价绿。合并前两行为一行，用·分隔
    const lines = [
      [
        { text: '买', cls: 'text-slate-300/70' },
        { text: compactNum(item.buy), cls: 'text-rose-400' },
        { text: '×', cls: 'text-slate-300/70' },
        { text: item.count, cls: 'text-rose-400' },
        { text: '股·保', cls: 'text-slate-300/70' },
        { text: compactNum(breakEven), cls: 'text-amber-400' }
      ],
      [
        { text: item.profit, cls: 'text-orange-400 font-semibold' },
        { text: '润卖', cls: 'text-slate-300/70' },
        { text: compactNum(item.sell), cls: 'text-emerald-400 font-semibold' }
      ]
    ]
    if (item.actualProfit != null && Number.isFinite(item.actualProfit) && item.verifySell != null) {
      lines.push([
        { text: compactNum(item.actualProfit), cls: Number(item.actualProfit) >= 0 ? 'text-orange-400 font-semibold' : 'text-rose-400 font-semibold' },
        { text: '润卖', cls: 'text-slate-300/70' },
        { text: compactNum(item.verifySell), cls: 'text-emerald-400 font-semibold' }
      ])
    }
    return lines
  }
  // 反T: 卖价绿, 利润橙, 买价股数红
  const lines = [
    [
      { text: '卖', cls: 'text-slate-300/70' },
      { text: compactNum(item.sell), cls: 'text-emerald-400' },
      { text: '×', cls: 'text-slate-300/70' },
      { text: item.count, cls: 'text-emerald-400' },
      { text: '股·保', cls: 'text-slate-300/70' },
      { text: compactNum(breakEven), cls: 'text-amber-400' }
    ],
    [
      { text: item.profit, cls: 'text-orange-400 font-semibold' },
      { text: '润买', cls: 'text-slate-300/70' },
      { text: compactNum(item.buy), cls: 'text-rose-400 font-semibold' }
    ]
  ]
  if (item.actualProfit != null && Number.isFinite(item.actualProfit) && item.verifyBuy != null) {
    lines.push([
      { text: compactNum(item.actualProfit), cls: Number(item.actualProfit) >= 0 ? 'text-orange-400 font-semibold' : 'text-rose-400 font-semibold' },
      { text: '润买', cls: 'text-slate-300/70' },
      { text: compactNum(item.verifyBuy), cls: 'text-rose-400 font-semibold' }
    ])
  }
  return lines
}

function coreKeyOf(rec) {
  if (rec.t) return 't|' + JSON.stringify({ buy: rec.t.buy, breakEven: rec.t.breakEven, sell: rec.t.sell, count: rec.t.count, profit: rec.t.profit })
  if (rec.rt) return 'rt|' + JSON.stringify({ sell: rec.rt.sell, breakEven: rec.rt.breakEven, buy: rec.rt.buy, count: rec.rt.count, profit: rec.rt.profit })
  return ''
}

// 相同核心参数的记录合并为一条（新输入只更新内容，该条挪到最前）
function dedupeHistory(list) {
  const map = new Map()
  for (const rec of list) {
    const key = coreKeyOf(rec)
    if (!key) continue
    const prev = map.get(key)
    if (!prev) { map.set(key, rec); continue }
    const keep = ((rec.updatedAt ?? rec.createdAt ?? 0) >= (prev.updatedAt ?? prev.createdAt ?? 0)) ? rec : prev
    const drop = keep === rec ? prev : rec
    const side = key.startsWith('t|') ? 't' : 'rt'
    const verifyKey = side === 't' ? 'verifySell' : 'verifyBuy'
    const merged = { ...keep, [side]: { ...keep[side] } }
    if (merged[side][verifyKey] == null && drop[side] && drop[side][verifyKey] != null) {
      merged[side][verifyKey] = drop[side][verifyKey]
      merged[side].actualProfit = drop[side].actualProfit
    }
    map.set(key, merged)
  }
  return [...map.values()].sort((a, b) => (b.updatedAt ?? b.createdAt ?? 0) - (a.updatedAt ?? a.createdAt ?? 0))
}

function recordHistory() {
  const { t, rt } = buildHistoryParts()
  if (!t && !rt) return

  const upsert = (side, item) => {
    if (!item) return
    const rec = side === 't'
      ? { id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`, key: JSON.stringify({ t: item }), t: item, rt: null }
      : { id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`, key: JSON.stringify({ rt: item }), t: null, rt: item }
    rec.updatedAt = Date.now()
    const existIdx = history.value.findIndex(r => coreKeyOf(r) === coreKeyOf(rec))
    if (existIdx >= 0) {
      const old = history.value[existIdx]
      const merged = [{ ...rec, id: old.id, createdAt: old.createdAt }, ...history.value.filter((_, i) => i !== existIdx)]
      history.value = merged
    } else {
      rec.createdAt = Date.now()
      history.value = [rec, ...history.value]
    }
  }
  upsert('t', t)
  upsert('rt', rt)

  // 去重后按 updatedAt 倒序（最新在前），只保留最近 100 条
  history.value = dedupeHistory(history.value).slice(0, 100)
  persist()
}

function onFieldBlur() {
  recordHistory()
}

function onQuickSet(setter) {
  setter()
  nextTick(() => recordHistory())
}

function applyRecord(rec) {
  if (rec.t) { tPrice.value = rec.t.buy; tCount.value = rec.t.count; tProfit.value = rec.t.profit; if (rec.t.verifySell) tVerify.value = rec.t.verifySell }
  if (rec.rt) { rtPrice.value = rec.rt.sell; rtCount.value = rec.rt.count; rtProfit.value = rec.rt.profit; if (rec.rt.verifyBuy) rtVerify.value = rec.rt.verifyBuy }
}
function removeRecord(id) {
  history.value = history.value.filter(r => r.id !== id)
  persist()
}
function clearHistory() {
  if (!history.value.length) return
  if (confirm('确认清空全部试算历史？')) { history.value = []; persist() }
}

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
.quick-presets > * { flex-shrink: 0; }
.mod-sky {
  background: linear-gradient(160deg, rgba(56, 189, 248, 0.10), rgba(56, 189, 248, 0.02) 60%);
  border: 1px solid rgba(56, 189, 248, 0.18);
}
.mod-fuchsia {
  background: linear-gradient(160deg, rgba(232, 121, 249, 0.10), rgba(232, 121, 249, 0.02) 60%);
  border: 1px solid rgba(232, 121, 249, 0.18);
}
.mod-sky,
.mod-fuchsia { padding: 0.65rem !important; }
.mod-sky h4,
.mod-fuchsia h4 { margin-bottom: 0.35rem !important; }
.mod-sky .mb-2,
.mod-fuchsia .mb-2 { margin-bottom: 0.3rem !important; }
.mod-sky .p-3,
.mod-fuchsia .p-3 { padding: 0.45rem !important; }
.mod-sky input,
.mod-fuchsia input { padding-top: 0.3rem !important; padding-bottom: 0.3rem !important; }
.mod-sky .py-1,
.mod-fuchsia .py-1 { padding-top: 0.18rem !important; padding-bottom: 0.18rem !important; }
.mod-sky .py-2,
.mod-fuchsia .py-2 { padding-top: 0.28rem !important; padding-bottom: 0.28rem !important; }
.mod-sky .gap-3,
.mod-fuchsia .gap-3 { gap: 0.45rem !important; }
.mod-sky .gap-1\.5,
.mod-fuchsia .gap-1\.5 { gap: 0.28rem !important; }
.mod-sky .gap-2,
.mod-fuchsia .gap-2 { gap: 0.35rem !important; }
/* 内距收紧后适当放大字号，避免显得小 */
.mod-sky .text-base,
.mod-fuchsia .text-base { font-size: 0.9rem !important; line-height: 1.2rem !important; }
.mod-sky .text-sm,
.mod-fuchsia .text-sm { font-size: 0.9rem !important; line-height: 1.25rem !important; }
.mod-sky .text-xs,
.mod-fuchsia .text-xs { font-size: 0.8rem !important; line-height: 1.1rem !important; }
.mod-sky .text-\[10px\],
.mod-fuchsia .text-\[10px\] { font-size: 0.7rem !important; }

/* 历史记录滚动条美化 */
.tcalc-scroll {
  scrollbar-width: thin;
  scrollbar-color: rgba(125, 211, 252, 0.4) rgba(255, 255, 255, 0.04);
}
.tcalc-scroll::-webkit-scrollbar {
  width: 5px;
}
.tcalc-scroll::-webkit-scrollbar-track {
  background: rgba(255, 255, 255, 0.03);
  border-radius: 4px;
}
.tcalc-scroll::-webkit-scrollbar-thumb {
  background: linear-gradient(180deg, rgba(125, 211, 252, 0.5), rgba(167, 139, 250, 0.5));
  border-radius: 4px;
  border: 1px solid rgba(255, 255, 255, 0.08);
}
.tcalc-scroll::-webkit-scrollbar-thumb:hover {
  background: linear-gradient(180deg, rgba(125, 211, 252, 0.75), rgba(167, 139, 250, 0.75));
}
</style>





