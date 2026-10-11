<template>
  <div class="relative" ref="wrap">
    <div
      class="flex-1 border border-slate-200 rounded px-3 py-2 text-sm text-slate-800 focus:input-focus cursor-pointer flex items-center justify-between"
      @click="toggle"
    >
      <span :class="modelValue ? 'text-slate-800' : 'text-slate-400'">{{ modelValue || '请选择日期' }}</span>
      <Calendar class="w-4 h-4 text-slate-400" />
    </div>

    <div
      v-if="open"
      class="absolute z-50 mt-1 bg-white rounded-lg shadow-lg border border-slate-200 p-3 w-64"
    >
      <div class="flex items-center justify-between mb-2">
        <button type="button" @click="prevMonth" class="p-1 rounded hover:bg-slate-100 text-slate-600 text-lg leading-none">&lt;</button>
        <div class="text-sm font-medium text-slate-800">{{ viewYear }}年{{ viewMonth }}月</div>
        <button type="button" @click="nextMonth" class="p-1 rounded hover:bg-slate-100 text-slate-600 text-lg leading-none">&gt;</button>
      </div>
      <div class="grid grid-cols-7 gap-1 text-center text-xs mb-1">
        <span v-for="w in ['日','一','二','三','四','五','六']" :key="w" class="text-slate-400">{{ w }}</span>
      </div>
      <div class="grid grid-cols-7 gap-1 text-center text-xs">
        <template v-for="(cell, i) in cells" :key="i">
          <span v-if="!cell" />
          <button
            v-else
            type="button"
            class="py-1 rounded hover:bg-amber-50 text-slate-700"
            :class="cell === modelValue ? 'bg-amber-500 text-white font-medium hover:bg-amber-500' : ''"
            @click="select(cell)"
          >{{ Number(cell.split('-')[2]) }}</button>
        </template>
      </div>
      <div class="flex justify-end mt-2">
        <button type="button" @click="today" class="text-xs text-amber-600 hover:text-amber-700">今天</button>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onBeforeUnmount } from 'vue'
import { Calendar } from 'lucide-vue-next'

const props = defineProps({
  modelValue: { type: String, default: '' }
})
const emit = defineEmits(['update:modelValue'])

const open = ref(false)
const wrap = ref(null)

const now = new Date()
const viewYear = ref(props.modelValue ? Number(props.modelValue.split('-')[0]) : now.getFullYear())
const viewMonth = ref(props.modelValue ? Number(props.modelValue.split('-')[1]) : now.getMonth() + 1)

function fmt(d) {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

const cells = computed(() => {
  const first = new Date(viewYear.value, viewMonth.value - 1, 1)
  const firstWeekday = first.getDay()
  const daysInMonth = new Date(viewYear.value, viewMonth.value, 0).getDate()
  const list = []
  for (let i = 0; i < firstWeekday; i++) list.push(null)
  for (let d = 1; d <= daysInMonth; d++) list.push(fmt(new Date(viewYear.value, viewMonth.value - 1, d)))
  return list
})

function prevMonth() {
  viewMonth.value -= 1
  if (viewMonth.value < 1) { viewMonth.value = 12; viewYear.value -= 1 }
}
function nextMonth() {
  viewMonth.value += 1
  if (viewMonth.value > 12) { viewMonth.value = 1; viewYear.value += 1 }
}
function select(date) {
  emit('update:modelValue', date)
  open.value = false
}
function today() {
  const d = new Date()
  select(fmt(d))
  viewYear.value = d.getFullYear()
  viewMonth.value = d.getMonth() + 1
}
function toggle() {
  open.value = !open.value
}

function onDocClick(e) {
  if (wrap.value && !wrap.value.contains(e.target)) open.value = false
}
onMounted(() => document.addEventListener('click', onDocClick))
onBeforeUnmount(() => document.removeEventListener('click', onDocClick))
</script>