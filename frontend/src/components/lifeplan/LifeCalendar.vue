<template>
  <div class="space-y-3">
    <!-- 30 天内倒计时提示条 -->
    <div v-if="countdown.length" class="rounded-xl border border-slate-100 bg-white px-3 py-3 space-y-1.5">
      <p class="text-[11px] text-slate-400">30 天内即将发生</p>
      <div v-for="event in countdown" :key="'cd-' + event.id" class="flex items-center gap-2 flex-wrap text-[11px]">
        <span class="px-1.5 py-0.5 rounded border" :class="LEVEL_META[event.level]?.cls || LEVEL_META.low.cls">{{ LEVEL_META[event.level]?.text || '低' }}</span>
        <span class="text-slate-700">{{ event.title }}</span>
        <span class="text-slate-400 tabular-nums">{{ event.date }}</span>
        <span :class="isBoldDay(daysLeftOf(event)) ? 'font-bold text-slate-700' : 'text-slate-500'">距今 {{ daysLeftOf(event) }} 天</span>
      </div>
    </div>

    <div class="flex items-center justify-between gap-3 flex-wrap">
      <p class="text-xs text-slate-400">共 {{ events.length }} 个事件 · 点卡片底部可编辑或标记完成</p>
      <button
        class="px-3 h-8 rounded-lg bg-indigo-500 text-white text-xs font-medium hover:bg-indigo-600 transition-colors flex items-center gap-1.5"
        @click="openCreate"
      >
        <Plus class="w-3.5 h-3.5" /> 新增事件
      </button>
    </div>

    <!-- 新增 / 编辑表单 -->
    <div v-if="showForm" class="rounded-xl border border-indigo-100 bg-white px-3 py-3 space-y-2.5">
      <div class="grid grid-cols-1 sm:grid-cols-4 gap-2">
        <input v-model.trim="form.title" class="h-9 sm:col-span-2" :class="INPUT" placeholder="事件标题" @keydown.enter="save" />
        <input v-model="form.date" type="date" class="h-9" :class="INPUT" />
        <select v-model="form.category" class="h-9" :class="INPUT">
          <option v-for="item in CATEGORY_OPTIONS" :key="item" :value="item">{{ item }}</option>
        </select>
      </div>
      <div class="grid grid-cols-1 sm:grid-cols-4 gap-2">
        <select v-model="form.level" class="h-9" :class="INPUT">
          <option v-for="item in LEVEL_OPTIONS" :key="item.value" :value="item.value">{{ item.label }}</option>
        </select>
        <input v-model.trim="form.remindDays" class="h-9" :class="INPUT" placeholder="提醒提前量（如 30,7,1）" />
        <select v-model="form.status" class="h-9" :class="INPUT">
          <option v-for="(text, key) in STATUS_TEXT" :key="key" :value="key">{{ text }}</option>
        </select>
        <input v-model.trim="form.note" class="h-9" :class="INPUT" placeholder="备注" @keydown.enter="save" />
      </div>
      <div class="flex items-center justify-end gap-2">
        <button class="h-8 px-3 rounded-lg bg-white border border-slate-200 text-slate-500 text-xs hover:border-slate-300 transition-colors" @click="showForm = false">取消</button>
        <button
          class="h-8 px-3 rounded-lg bg-indigo-500 text-white text-xs font-medium hover:bg-indigo-600 transition-colors disabled:opacity-50 flex items-center gap-1.5"
          :disabled="busy || !form.title.trim()"
          @click="save"
        >
          <Loader2 v-if="busy" class="w-3.5 h-3.5 animate-spin" /> 保存
        </button>
      </div>
    </div>

    <!-- 列表 -->
    <p v-if="loading" class="rounded-xl border border-slate-100 bg-white px-3 py-6 flex items-center justify-center gap-2 text-xs text-slate-400">
      <Loader2 class="w-3.5 h-3.5 animate-spin" /> 加载中…
    </p>
    <p v-else-if="!events.length" class="rounded-xl border border-slate-100 bg-white px-3 py-8 text-center text-xs text-slate-400">
      还没有外部事件，添加考试 / 报名 / 审核等关键日期
    </p>

    <div v-else class="space-y-2">
      <div
        v-for="event in sortedEvents"
        :key="event.id"
        class="rounded-xl border px-3 py-2.5 transition-colors"
        :class="event.status === 'done' ? 'border-slate-100 bg-slate-50/60' : 'border-slate-100 bg-white hover:bg-slate-50/70'"
      >
        <div class="flex items-center gap-2 flex-wrap">
          <span class="text-sm font-semibold text-slate-700" :class="{ 'line-through text-slate-400': event.status === 'done' }">{{ event.title }}</span>
          <span class="text-[11px] text-slate-400 tabular-nums">{{ event.date }}</span>
          <span class="text-[10px] px-1.5 py-0.5 rounded bg-slate-100 text-slate-500">{{ event.category }}</span>
          <span class="text-[10px] px-1.5 py-0.5 rounded border" :class="LEVEL_META[event.level]?.cls || LEVEL_META.low.cls">{{ LEVEL_META[event.level]?.text || '低' }}</span>
          <span class="text-[11px]" :class="daysLeftOf(event) < 0 ? 'text-slate-400' : 'text-sky-600'">{{ distanceText(event) }}</span>
          <span class="text-[11px] text-slate-400">提醒提前 {{ event.remindDays }} 天</span>
          <span class="text-[11px]" :class="event.status === 'done' ? 'text-emerald-600' : 'text-slate-500'">{{ STATUS_TEXT[event.status] || event.status }}</span>
        </div>
        <p v-if="event.note" class="mt-1 text-[11px] text-slate-500">{{ event.note }}</p>
        <div class="mt-1.5 flex items-center gap-2">
          <button
            v-if="event.status !== 'done'"
            class="h-7 px-2.5 rounded-lg border border-emerald-200 text-emerald-600 text-[11px] hover:bg-emerald-50 transition-colors flex items-center gap-1"
            @click="markDone(event)"
          >
            <Check class="w-3.5 h-3.5" /> 标记完成
          </button>
          <button class="h-7 px-2.5 rounded-lg border border-slate-200 text-slate-500 text-[11px] hover:border-slate-300 transition-colors flex items-center gap-1" @click="openEdit(event)">
            <Pencil class="w-3.5 h-3.5" /> 编辑
          </button>
          <button class="h-7 px-2.5 rounded-lg border border-rose-200 text-rose-500 text-[11px] hover:bg-rose-50 transition-colors flex items-center gap-1" @click="remove(event)">
            <Trash2 class="w-3.5 h-3.5" /> 删除
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed, onMounted, reactive, ref, watch } from 'vue'
import { Check, Loader2, Pencil, Plus, Trash2 } from 'lucide-vue-next'
import { lifeApi } from '../../utils/api'
import { toast } from '../../utils/toast'

const props = defineProps({ refreshToken: { type: Number, default: 0 } })
const emit = defineEmits(['changed'])

const INPUT = 'rounded-lg border border-slate-200 bg-white px-2.5 text-xs text-slate-700 outline-none transition-colors focus:border-indigo-300'
const CATEGORY_OPTIONS = ['考试', '报名', '审核', '证件', '其他']
const LEVEL_OPTIONS = [
  { value: 'high', label: '高' },
  { value: 'mid', label: '中' },
  { value: 'low', label: '低' }
]
const LEVEL_META = {
  high: { text: '高', cls: 'bg-rose-50 text-rose-600 border-rose-200' },
  mid: { text: '中', cls: 'bg-amber-50 text-amber-600 border-amber-200' },
  low: { text: '低', cls: 'bg-slate-100 text-slate-500 border-slate-200' }
}
const STATUS_TEXT = { todo: '未开始', doing: '进行中', done: '已完成' }

const events = ref([])
const loading = ref(true)
const busy = ref(false)
const showForm = ref(false)
const form = reactive({ id: '', title: '', date: '', category: '考试', level: 'high', remindDays: '30,7,1', status: 'todo', note: '' })

function fmt(date) {
  const pad = n => String(n).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
}
function todayStr() {
  return fmt(new Date())
}
function failText(err) {
  return err?.response?.data?.error || err?.message || '操作失败'
}
function daysLeftOf(event) {
  if (Number.isFinite(event?.daysLeft)) return event.daysLeft
  const target = Date.parse(`${event?.date}T00:00:00`)
  if (!Number.isFinite(target)) return 0
  const parts = todayStr().split('-').map(Number)
  const base = new Date(parts[0], parts[1] - 1, parts[2]).getTime()
  return Math.round((target - base) / 86400000)
}
function isBoldDay(days) {
  return days === 30 || days === 7 || days === 1
}
function distanceText(event) {
  const days = daysLeftOf(event)
  if (days < 0) return '已过期'
  if (days === 0) return '就是今天'
  return `距今 ${days} 天`
}

const sortedEvents = computed(() =>
  [...events.value].sort((a, b) => {
    if (a.date !== b.date) return a.date < b.date ? -1 : 1
    return (Number(a.id) || 0) - (Number(b.id) || 0)
  })
)
const countdown = computed(() =>
  sortedEvents.value.filter(event => daysLeftOf(event) >= 0 && daysLeftOf(event) <= 30)
)

async function load() {
  loading.value = true
  try {
    const result = await lifeApi.getEvents()
    events.value = result.events || []
  } catch (err) {
    toast.error(failText(err))
  } finally {
    loading.value = false
  }
}

function openCreate() {
  Object.assign(form, { id: '', title: '', date: todayStr(), category: '考试', level: 'high', remindDays: '30,7,1', status: 'todo', note: '' })
  showForm.value = true
}

function openEdit(event) {
  Object.assign(form, {
    id: event.id,
    title: event.title || '',
    date: event.date || todayStr(),
    category: event.category || '其他',
    level: event.level || 'mid',
    remindDays: event.remindDays || '30,7,1',
    status: event.status || 'todo',
    note: event.note || ''
  })
  showForm.value = true
}

async function save() {
  if (busy.value || !form.title.trim()) return
  busy.value = true
  try {
    const payload = {
      title: form.title.trim(),
      date: form.date || todayStr(),
      category: form.category,
      level: form.level,
      remindDays: form.remindDays,
      status: form.status,
      note: form.note.trim()
    }
    const result = form.id ? await lifeApi.updateEvent(form.id, payload) : await lifeApi.createEvent(payload)
    events.value = result.events || []
    showForm.value = false
    emit('changed')
    toast.success(form.id ? '事件已更新' : '事件已新增')
  } catch (err) {
    toast.error(failText(err))
  } finally {
    busy.value = false
  }
}

async function markDone(event) {
  if (busy.value) return
  busy.value = true
  try {
    const result = await lifeApi.updateEvent(event.id, { status: 'done' })
    events.value = result.events || []
    emit('changed')
    toast.success('事件已标记完成')
  } catch (err) {
    toast.error(failText(err))
  } finally {
    busy.value = false
  }
}

async function remove(event) {
  if (busy.value) return
  busy.value = true
  try {
    const result = await lifeApi.deleteEvent(event.id)
    events.value = result.events || []
    emit('changed')
    toast.success('事件已删除')
  } catch (err) {
    toast.error(failText(err))
  } finally {
    busy.value = false
  }
}

watch(() => props.refreshToken, load)
onMounted(load)
</script>
