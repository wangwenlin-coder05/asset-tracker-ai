<template>
  <div class="w-full rounded-lg border border-slate-100 bg-white">
    <svg :viewBox="`0 0 ${W} ${H}`" :width="'100%'" :height="height" preserveAspectRatio="none" class="block">
      <!-- 渐变区域 -->
      <defs>
        <linearGradient :id="gradId" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" :stop-color="fillColor" stop-opacity="0.25" />
          <stop offset="100%" :stop-color="fillColor" stop-opacity="0.02" />
        </linearGradient>
      </defs>
      <!-- 网格 -->
      <g v-for="gy in gridY" :key="'g'+gy" class="grid-line">
        <line :x1="padL" :x2="W-padR" :y1="gy" :y2="gy" stroke="#f1f5f9" stroke-width="1" />
      </g>
      <!-- 折叠填充区 -->
      <path v-if="negativeFill" :d="areaPath" :fill="`url(#${gradId})`" />
      <!-- 折线 -->
      <polyline v-if="points.length" :points="pointsStr" fill="none" :stroke="lineColor" stroke-width="1.5"
        stroke-linejoin="round" stroke-linecap="round" vector-effect="non-scaling-stroke" />
    </svg>
    <!-- 悬停提示 -->
    <div v-if="hover && tooltip" class="px-2 py-1 text-[11px] font-medium text-slate-500">
      {{ tooltip }}
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'

const props = defineProps({
  data: { type: Array, required: true },   // [{date, value}]
  height: { type: Number, default: 160 },
  color: { type: String, default: '#6366f1' },
  formatValue: { type: String, default: '' }, // 'money' | '%' | ''
  invert: { type: Boolean, default: false }, // 回撤：向下为风险
  fill: { type: Boolean, default: true },
  negativeFill: { type: Boolean, default: false },
})

const W = 600
const padL = 8
const padR = 8
const padT = 6
const gradId = `grad-${Math.random().toString(36).slice(2, 8)}`
const lineColor = props.color

const hover = ref(false)
const tooltip = ref('')

const values = computed(() => props.data.map(d => d.value))
const min = computed(() => values.value.length ? Math.min(...values.value) : 0)
const max = computed(() => values.value.length ? Math.max(...values.value) : 1)

const range = computed(() => {
  const pad = (max.value - min.value) * 0.1 || 1
  let lo = min.value - pad
  let hi = max.value + pad
  if (props.invert) {
    // 回撤图：范围放 [-max% , 0]，0 在顶部
    lo = Math.min(min.value, 0)
    hi = 0
  }
  return { lo, hi }
})

function yFor(v) {
  const { lo, hi } = range.value
  return padT + (1 - (v - lo) / (hi - lo)) * (props.height - padT * 2)
}
function xFor(i) {
  return padL + (i / Math.max(props.data.length - 1, 1)) * (W - padL - padR)
}

const points = computed(() => props.data.map((d, i) => ({ x: xFor(i), y: yFor(d.value), value: d.value, date: d.date })))
const pointsStr = computed(() => points.value.map(p => `${p.x},${p.y}`).join(' '))
const areaPath = computed(() => {
  if (!points.value.length) return ''
  const first = points.value[0]
  const last = points.value[points.value.length - 1]
  const baselineY = props.invert ? yFor(0) : props.height - padT * 0.5
  return `M${first.x},${baselineY} L` + points.value.map(p => `${p.x},${p.y}`).join(' L') + ` L${last.x},${baselineY} Z`
})
const gridY = computed(() => {
  const n = 4
  const arr = []
  for (let i = 0; i < n; i++) {
    const gy = padT + (i / (n - 1)) * (props.height - padT * 2)
    arr.push(gy)
  }
  return arr
})

function fmt(v) {
  if (props.formatValue === 'money') return '¥' + new Intl.NumberFormat('zh-CN', { maximumFractionDigits: 0 }).format(v)
  if (props.formatValue === '%') return v.toFixed(2) + '%'
  return typeof v === 'number' ? v.toFixed(2) : v
}
</script>