<template>
  <div class="w-full rounded-lg border border-slate-100 bg-white relative">
    <svg :viewBox="`0 0 ${W} ${H}`" :width="'100%'" :height="height" preserveAspectRatio="none" class="block">
      <defs>
        <linearGradient :id="gradId" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" :stop-color="color" stop-opacity="0.18" />
          <stop offset="100%" :stop-color="color" stop-opacity="0.01" />
        </linearGradient>
      </defs>
      <!-- 网格 -->
      <g v-for="gy in gridY" :key="'g'+gy" class="grid-line">
        <line :x1="padL" :x2="W - padR" :y1="gy" :y2="gy" stroke="#f1f5f9" stroke-width="1" />
      </g>
      <!-- 持仓区间横条 -->
      <g v-if="holding.bars && holding.bars.length">
        <rect v-for="(b, i) in holding.bars" :key="'hb'+i"
          :x="b.x0" :y="H - 6" :width="Math.max(b.x1 - b.x0, 1)" height="3" rx="1" fill="#c7d2fe" />
      </g>
      <!-- 主填充 -->
      <path v-if="fill && mainPoints.length" :d="areaPath" :fill="`url(#${gradId})`" />
      <!-- 基准叠加线 -->
      <polyline v-if="ovPoints.length" :points="ovPointsStr" fill="none" :stroke="overlayColor"
        stroke-width="1.2" stroke-dasharray="4 3" stroke-linejoin="round"
        vector-effect="non-scaling-stroke" />
      <!-- 主净值线 -->
      <polyline v-if="mainPoints.length" :points="mainPointsStr" fill="none" :stroke="color" stroke-width="1.6"
        stroke-linejoin="round" stroke-linecap="round" vector-effect="non-scaling-stroke" />
      <!-- 买卖点标记 -->
      <g v-if="markers.length">
        <g v-for="(m, i) in markers" :key="'mk'+i">
          <path :d="m.d" :fill="m.fill" stroke="#fff" stroke-width="1" />
        </g>
      </g>
    </svg>
    <!-- 图例 -->
    <div v-if="overlay && overlay.length || markers.length" class="absolute top-1 right-2 flex items-center gap-3 text-[10px] text-slate-400">
      <span class="flex items-center gap-1"><i class="inline-block w-3 border-t-2" :style="{ borderColor: color }" />净值</span>
      <span v-if="overlay && overlay.length" class="flex items-center gap-1"><i class="inline-block w-3 border-t-2 border-dashed" :style="{ borderColor: overlayColor }" />基准</span>
      <span class="flex items-center gap-1"><i class="inline-block w-0 h-0 border-x-4 border-b-4 border-x-transparent" :style="{ borderBottomColor: buyColor }" />买</span>
      <span class="flex items-center gap-1"><i class="inline-block w-0 h-0 border-x-4 border-t-4 border-x-transparent" :style="{ borderTopColor: sellColor }" />卖</span>
    </div>
  </div>
</template>

<script setup>
import { ref, computed } from 'vue'

const props = defineProps({
  data: { type: Array, required: true },          // 主净值 [{date, value}]
  overlay: { type: Array, default: () => [] },    // 基准叠加 [{date, value}]
  trades: { type: Array, default: () => [] },     // [{entry_date, exit_date}]
  height: { type: Number, default: 200 },
  color: { type: String, default: '#6366f1' },
  overlayColor: { type: String, default: '#94a3b8' },
  formatValue: { type: String, default: 'money' },
})

const W = 600
const padL = 8
const padR = 8
const padT = 8
const padB = 8
const buyColor = '#10b981'
const sellColor = '#ef4444'
const gradId = `egrad-${Math.random().toString(36).slice(2, 8)}`

// 全部数值用于一致刻度（含基准）
const allValues = computed(() => {
  const arr = props.data.map(d => d.value)
  props.overlay.forEach(d => arr.push(d.value))
  return arr
})
const min = computed(() => allValues.value.length ? Math.min(...allValues.value) : 0)
const max = computed(() => allValues.value.length ? Math.max(...allValues.value) : 1)
const range = computed(() => {
  const pad = (max.value - min.value) * 0.12 || 1
  return { lo: min.value - pad, hi: max.value + pad }
})
const H = props.height
const CH = H - padT - padB
function yFor(v) {
  const { lo, hi } = range.value
  return padT + (1 - (v - lo) / (hi - lo)) * CH
}
function xFor(n) {
  const N = Math.max(props.data.length - 1, 1)
  return padL + (n / N) * (W - padL - padR)
}

const pts = computed(() => props.data.map((d, i) => ({ x: xFor(i), y: yFor(d.value), date: d.date, value: d.value })))
const mainPoints = pts
const mainPointsStr = computed(() => pts.value.map(p => `${p.x},${p.y}`).join(' '))
const areaPath = computed(() => {
  if (!pts.value.length) return ''
  const base = H - padB
  const s = pts.value[0]
  const e = pts.value[pts.value.length - 1]
  return `M${s.x},${base} L` + pts.value.map(p => `${p.x},${p.y}`).join(' L') + ` L${e.x},${base} Z`
})

// 基准叠加：按主序列 index 对齐（两序列日期应一致，取最小长度）
const ovPoints = computed(() => {
  const n = Math.min(pts.value.length, props.overlay.length)
  const out = []
  for (let i = 0; i < n; i++) out.push({ x: xFor(i), y: yFor(props.overlay[i].value) })
  return out
})
const ovPointsStr = computed(() => ovPoints.value.map(p => `${p.x},${p.y}`).join(' '))

// 买卖点标记：在对应日期的净值 y 处画三角
const markers = computed(() => {
  if (!props.trades.length) return []
  const byDate = new Map()
  pts.value.forEach(p => byDate.set(p.date, p))
  const mk = []
  for (const t of props.trades) {
    const ep = byDate.get(t.entry_date)
    const xp = byDate.get(t.exit_date)
    if (ep) mk.push({
      d: `M${ep.x},${ep.y - 5} L${ep.x - 4},${ep.y} L${ep.x + 4},${ep.y} Z`,
      fill: buyColor,
    })
    if (xp && t.entry_date !== t.exit_date) mk.push({
      d: `M${xp.x},${xp.y + 5} L${xp.x - 4},${xp.y} L${xp.x + 4},${xp.y} Z`,
      fill: sellColor,
    })
  }
  return mk
})

// 持仓横条：基于买卖点把日期分成“持仓/不持仓”区间
const holding = computed(() => {
  const bars = []
  if (!props.trades.length) return { bars }
  const dateIdx = new Map()
  pts.value.forEach((p, i) => dateIdx.set(p.date, p.x))
  const segments = []
  for (const t of props.trades) {
    segments.push({ x0: dateIdx.get(t.entry_date), x1: dateIdx.get(t.exit_date) })
  }
  segments.sort((a, b) => a.x0 - b.x0)
  let cur = null
  for (const s of segments) {
    if (!s.x0 || !s.x1) continue
    if (!cur) cur = { x0: s.x0, x1: s.x1 }
    else if (s.x0 <= cur.x1) cur.x1 = Math.max(cur.x1, s.x1)
    else { bars.push(cur); cur = { x0: s.x0, x1: s.x1 } }
  }
  if (cur) bars.push(cur)
  return { bars }
})

const gridY = computed(() => {
  const n = 4
  const arr = []
  for (let i = 0; i < n; i++) arr.push(padT + (i / (n - 1)) * CH)
  return arr
})
</script>