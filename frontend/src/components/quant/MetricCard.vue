<template>
  <div class="px-2 py-1.5 rounded-xl border flex flex-col justify-center"
    :class="positive ? 'bg-profit/5 border-emerald-100' : warn ? 'bg-red-50 border-red-100' : 'bg-slate-50 border-slate-100'">
    <span class="text-[10px] text-slate-400">{{ label }}</span>
    <span class="text-lg font-bold leading-tight" :class="value === null ? 'text-slate-300' : (warn ? 'text-red-500' : (positive ? 'text-emerald-600' : 'text-slate-700'))">
      <template v-if="value !== null && value !== undefined">
        {{ prefix }}{{ formatNumber(value) }}{{ suffix }}
      </template>
      <template v-else>—</template>
    </span>
  </div>
</template>

<script setup>
import { computed } from 'vue'

const props = defineProps({
  label: String,
  value: [Number, String],
  suffix: { type: String, default: '' },
  prefix: { type: String, default: '' },
  positive: { type: Boolean, default: false },
  warn: { type: Boolean, default: false },
})

function formatNumber(v) {
  if (typeof v !== 'number') return v
  const abs = Math.abs(v)
  if (abs >= 10000) return new Intl.NumberFormat('zh-CN', { maximumFractionDigits: 0 }).format(v)
  if (abs >= 100) return v.toFixed(1)
  return v.toFixed(2)
}
</script>