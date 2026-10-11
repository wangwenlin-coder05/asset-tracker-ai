<template>
  <div ref="rootRef" class="relative">
    <!-- 触发框 -->
    <button type="button" @click="toggle"
      class="w-full px-2 py-2 rounded-lg border text-sm flex items-center gap-1.5 transition-colors"
      :class="open ? 'border-indigo-300 bg-white' : 'border-slate-200 bg-white hover:border-indigo-300'">
      <Calendar class="w-3.5 h-3.5 flex-shrink-0" :class="modelValue ? 'text-indigo-500' : 'text-slate-300'" />
      <span class="flex-1 text-left truncate" :class="modelValue ? 'text-slate-700' : 'text-slate-300'">
        {{ modelValue || placeholder }}
      </span>
    </button>

    <!-- 弹层 -->
    <div v-if="open"
      class="absolute z-50 mt-1 left-0 w-[272px] bg-white rounded-xl border border-slate-200 shadow-xl p-3 select-none">
      <!-- 头部：跨年/跨月跳转 -->
      <div class="flex items-center justify-between mb-2">
        <div class="flex items-center">
          <button type="button" @click="shiftYear(-1)" title="上一年"
            class="w-6 h-6 rounded-md flex items-center justify-center text-slate-400 hover:text-indigo-600 hover:bg-indigo-50">
            <ChevronsLeft class="w-4 h-4" />
          </button>
          <button type="button" @click="shiftMonth(-1)" title="上个月"
            class="w-6 h-6 rounded-md flex items-center justify-center text-slate-400 hover:text-indigo-600 hover:bg-indigo-50">
            <ChevronLeft class="w-4 h-4" />
          </button>
        </div>
        <button type="button" @click="cycleView" title="切换年/月/日视图"
          class="text-sm font-semibold text-slate-700 hover:text-indigo-600 px-2 py-0.5 rounded-md hover:bg-indigo-50">
          {{ headerText }}
        </button>
        <div class="flex items-center">
          <button type="button" @click="shiftMonth(1)" title="下个月"
            class="w-6 h-6 rounded-md flex items-center justify-center text-slate-400 hover:text-indigo-600 hover:bg-indigo-50">
            <ChevronRight class="w-4 h-4" />
          </button>
          <button type="button" @click="shiftYear(1)" title="下一年"
            class="w-6 h-6 rounded-md flex items-center justify-center text-slate-400 hover:text-indigo-600 hover:bg-indigo-50">
            <ChevronsRight class="w-4 h-4" />
          </button>
        </div>
      </div>

      <!-- 日视图 -->
      <template v-if="mode === 'day'">
        <div class="grid grid-cols-7 gap-0.5 mb-1">
          <span v-for="w in WEEK" :key="w" class="text-[10px] text-slate-400 text-center py-1">{{ w }}</span>
        </div>
        <div class="grid grid-cols-7 gap-0.5">
          <button v-for="(d, i) in days" :key="i" type="button" @click="pickDay(d)"
            class="h-7 rounded-md text-xs flex items-center justify-center transition-colors"
            :class="dayClass(d)">
            {{ d.getDate() }}
          </button>
        </div>
      </template>

      <!-- 月视图 -->
      <div v-else-if="mode === 'month'" class="grid grid-cols-3 gap-1">
        <button v-for="(m, i) in 12" :key="i" type="button" @click="pickMonth(i)"
          class="h-9 rounded-lg text-xs transition-colors"
          :class="monthClass(i)">{{ i + 1 }}月</button>
      </div>

      <!-- 年视图 -->
      <div v-else class="grid grid-cols-3 gap-1">
        <button v-for="y in years" :key="y" type="button" @click="pickYear(y)"
          class="h-9 rounded-lg text-xs transition-colors"
          :class="yearClass(y)">{{ y }}</button>
      </div>

      <!-- 底部快捷 -->
      <div class="flex items-center justify-between mt-2 pt-2 border-t border-slate-100">
        <button type="button" @click="pickToday" class="text-[11px] text-indigo-500 hover:text-indigo-700 font-medium">今天</button>
        <button type="button" @click="clear" class="text-[11px] text-slate-400 hover:text-slate-600">清除</button>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onBeforeUnmount } from 'vue'
import { Calendar, ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight } from 'lucide-vue-next'

const props = defineProps({
  modelValue: { type: String, default: '' },
  placeholder: { type: String, default: '选择日期' },
})
const emit = defineEmits(['update:modelValue'])

const WEEK = ['日', '一', '二', '三', '四', '五', '六']

const rootRef = ref(null)
const open = ref(false)
const mode = ref('day')          // day | month | year
const view = ref(new Date())     // 当前展示的月份

function parse(s) {
  const m = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec((s || '').trim())
  if (!m) return null
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]))
  return isNaN(d.getTime()) ? null : d
}
function fmt(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
function sameDay(a, b) {
  return !!a && !!b && a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate()
}

const selected = computed(() => parse(props.modelValue))
const today = new Date()

const headerText = computed(() => {
  const y = view.value.getFullYear()
  const m = view.value.getMonth() + 1
  if (mode.value === 'day') return `${y}年${m}月`
  if (mode.value === 'month') return `${y}年`
  const startY = Math.floor(y / 10) * 10
  return `${startY} - ${startY + 9}`
})

const days = computed(() => {
  const y = view.value.getFullYear()
  const m = view.value.getMonth()
  const start = new Date(y, m, 1 - new Date(y, m, 1).getDay())
  return Array.from({ length: 42 }, (_, i) => new Date(start.getFullYear(), start.getMonth(), start.getDate() + i))
})

const years = computed(() => {
  const startY = Math.floor(view.value.getFullYear() / 10) * 10
  return Array.from({ length: 12 }, (_, i) => startY - 1 + i)
})

function dayClass(d) {
  if (sameDay(d, selected.value)) return 'bg-indigo-500 text-white font-semibold'
  if (sameDay(d, today)) return 'text-indigo-600 font-semibold hover:bg-indigo-50'
  if (d.getMonth() !== view.value.getMonth()) return 'text-slate-300 hover:bg-slate-50'
  return 'text-slate-700 hover:bg-indigo-50'
}
function monthClass(i) {
  const cur = view.value.getFullYear() === today.getFullYear() && i === today.getMonth()
  const sel = selected.value && selected.value.getFullYear() === view.value.getFullYear() && selected.value.getMonth() === i
  if (sel) return 'bg-indigo-500 text-white font-semibold'
  if (cur) return 'text-indigo-600 font-semibold hover:bg-indigo-50'
  return 'text-slate-700 hover:bg-indigo-50'
}
function yearClass(y) {
  const sel = selected.value && selected.value.getFullYear() === y
  if (sel) return 'bg-indigo-500 text-white font-semibold'
  if (y === today.getFullYear()) return 'text-indigo-600 font-semibold hover:bg-indigo-50'
  return 'text-slate-700 hover:bg-indigo-50'
}

function toggle() {
  open.value = !open.value
  if (!open.value) return
  mode.value = 'day'
  const s = selected.value
  view.value = s
    ? new Date(s.getFullYear(), s.getMonth(), 1)
    : new Date(today.getFullYear(), today.getMonth(), 1)
}

function cycleView() {
  mode.value = mode.value === 'day' ? 'month' : (mode.value === 'month' ? 'year' : 'day')
}
function shiftMonth(n) {
  const y = view.value.getFullYear()
  const m = view.value.getMonth()
  view.value = mode.value === 'year'
    ? new Date(y + n * 10, m, 1)
    : new Date(y, m + n, 1)
}
function shiftYear(n) {
  view.value = new Date(view.value.getFullYear() + n * (mode.value === 'year' ? 10 : 1), view.value.getMonth(), 1)
}

function pickDay(d) {
  emit('update:modelValue', fmt(d))
  open.value = false
}
function pickMonth(i) {
  view.value = new Date(view.value.getFullYear(), i, 1)
  mode.value = 'day'
}
function pickYear(y) {
  view.value = new Date(y, view.value.getMonth(), 1)
  mode.value = 'month'
}
function pickToday() {
  emit('update:modelValue', fmt(new Date()))
  open.value = false
}
function clear() {
  emit('update:modelValue', '')
  open.value = false
}

function onDocDown(e) {
  if (open.value && rootRef.value && !rootRef.value.contains(e.target)) open.value = false
}
function onKey(e) {
  if (e.key === 'Escape') open.value = false
}
onMounted(() => {
  document.addEventListener('mousedown', onDocDown)
  document.addEventListener('keydown', onKey)
})
onBeforeUnmount(() => {
  document.removeEventListener('mousedown', onDocDown)
  document.removeEventListener('keydown', onKey)
})
</script>