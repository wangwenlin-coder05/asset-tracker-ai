<template>
  <div class="space-y-3">
    <!-- 负荷总览 -->
    <div class="rounded-xl border border-slate-100 bg-white px-4 py-3 space-y-2">
      <div class="flex items-center gap-4 flex-wrap">
        <div>
          <p class="text-[11px] text-slate-400">今日计划总时长</p>
          <p class="text-xl font-bold text-slate-700 tabular-nums">{{ planned }} <span class="text-xs font-medium text-slate-400">分钟</span></p>
        </div>
        <div>
          <p class="text-[11px] text-slate-400">可承受上限</p>
          <p class="text-xl font-bold tabular-nums" :class="capacity ? 'text-slate-700' : 'text-slate-300'">{{ capacity || '—' }} <span v-if="capacity" class="text-xs font-medium text-slate-400">分钟</span></p>
        </div>
        <button
          class="ml-auto px-3 h-8 rounded-lg bg-indigo-500 text-white text-xs font-medium hover:bg-indigo-600 transition-colors flex items-center gap-1.5"
          @click="openForm"
        >
          <Plus class="w-3.5 h-3.5" /> 记录负荷
        </button>
      </div>
      <div v-if="overloaded" class="flex items-start gap-2 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-[11px] text-rose-600">
        <AlertTriangle class="mt-0.5 w-3.5 h-3.5 flex-shrink-0" />
        <span>今日任务已超出可承受上限，建议按 P2/P3 删减</span>
      </div>
    </div>

    <!-- 录入表单 -->
    <div v-if="creating" class="rounded-xl border border-indigo-100 bg-white px-3 py-3 space-y-2.5">
      <div class="grid grid-cols-1 sm:grid-cols-4 gap-2">
        <input v-model="form.date" type="date" class="h-9" :class="INPUT" />
        <input v-model.number="form.capacityMinutes" type="number" min="0" class="h-9" :class="INPUT" placeholder="可承受上限（分钟）" />
        <input v-model.number="form.plannedMinutes" type="number" min="0" class="h-9" :class="INPUT" placeholder="计划总分钟" />
        <input v-model.number="form.sleepHours" type="number" min="0" step="0.5" class="h-9" :class="INPUT" placeholder="睡眠小时" />
      </div>
      <div class="flex items-center gap-2 flex-wrap">
        <span class="text-[11px] text-slate-400">干扰因素</span>
        <button
          v-for="item in DISTRACTIONS"
          :key="item"
          type="button"
          class="px-2 h-7 rounded-lg border text-[11px] transition-colors"
          :class="form.distractions.includes(item) ? 'border-indigo-300 bg-indigo-50 text-indigo-600' : 'border-slate-200 bg-white text-slate-500 hover:border-slate-300'"
          @click="toggleDistraction(item)"
        >{{ item }}</button>
      </div>
      <div class="grid grid-cols-1 sm:grid-cols-4 gap-2">
        <input v-model.trim="form.health" class="h-9 sm:col-span-1" :class="INPUT" placeholder="身体状态（良好 / 一般 / 不适）" />
        <input v-model.trim="form.note" class="h-9 sm:col-span-3" :class="INPUT" placeholder="备注" />
      </div>
      <div class="flex items-center justify-end gap-2">
        <button class="h-8 px-3 rounded-lg bg-white border border-slate-200 text-slate-500 text-xs hover:border-slate-300 transition-colors" @click="creating = false">取消</button>
        <button
          class="h-8 px-3 rounded-lg bg-indigo-500 text-white text-xs font-medium hover:bg-indigo-600 transition-colors disabled:opacity-50 flex items-center gap-1.5"
          :disabled="busy"
          @click="submit"
        >
          <Loader2 v-if="busy" class="w-3.5 h-3.5 animate-spin" /> 保存
        </button>
      </div>
    </div>

    <!-- 列表 -->
    <p v-if="loading" class="rounded-xl border border-slate-100 bg-white px-3 py-6 flex items-center justify-center gap-2 text-xs text-slate-400">
      <Loader2 class="w-3.5 h-3.5 animate-spin" /> 加载中…
    </p>
    <p v-else-if="!logs.length" class="rounded-xl border border-slate-100 bg-white px-3 py-8 text-center text-xs text-slate-400">
      还没有精力负荷记录，先记录一天看负荷是否合理
    </p>

    <div v-else class="space-y-2">
      <div v-for="log in logs" :key="log.id" class="rounded-xl border border-slate-100 bg-white px-3 py-2.5 hover:bg-slate-50/70 transition-colors">
        <div class="flex items-center gap-2 flex-wrap">
          <span class="text-sm font-semibold text-slate-700 tabular-nums">{{ log.date }}</span>
          <span class="text-[11px] text-slate-500">计划 {{ log.plannedMinutes }} / 上限 {{ log.capacityMinutes }} 分钟</span>
          <span
            class="text-[10px] px-1.5 py-0.5 rounded border"
            :class="logOverload(log) ? 'bg-rose-50 text-rose-600 border-rose-200' : 'bg-emerald-50 text-emerald-600 border-emerald-200'"
          >{{ logOverload(log) ? '超负荷' : '负荷正常' }}</span>
        </div>
        <div class="mt-1 flex items-center gap-3 flex-wrap text-[11px] text-slate-400">
          <span v-if="log.sleepHours || log.sleepHours === 0">睡眠 {{ log.sleepHours }} 小时</span>
          <span v-if="log.distractions" class="text-amber-500">干扰：{{ log.distractions }}</span>
          <span v-if="log.health">身体：{{ log.health }}</span>
        </div>
        <p v-if="log.note" class="mt-1 text-[11px] text-slate-500">{{ log.note }}</p>
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed, onMounted, reactive, ref, watch } from 'vue'
import { AlertTriangle, Loader2, Plus } from 'lucide-vue-next'
import { lifeApi } from '../../utils/api'
import { toast } from '../../utils/toast'

const props = defineProps({ refreshToken: { type: Number, default: 0 } })
const emit = defineEmits(['changed'])

const INPUT = 'rounded-lg border border-slate-200 bg-white px-2.5 text-xs text-slate-700 outline-none transition-colors focus:border-indigo-300'
const DISTRACTIONS = ['熬夜', '身体不适', '情绪', '琐事']

const logs = ref([])
const planned = ref(0)
const loading = ref(true)
const busy = ref(false)
const creating = ref(false)
const form = reactive({ date: '', capacityMinutes: '', plannedMinutes: '', sleepHours: '', health: '', distractions: [], note: '' })

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

const capacity = computed(() => Number(logs.value[0]?.capacityMinutes) || 0)
const overloaded = computed(() => capacity.value > 0 && planned.value > capacity.value)

function logOverload(log) {
  return log.overload === true || (Number(log.capacityMinutes) > 0 && Number(log.plannedMinutes) > Number(log.capacityMinutes))
}

async function load() {
  loading.value = true
  try {
    const result = await lifeApi.getEnergy()
    logs.value = [...(result.logs || [])].sort((a, b) => {
      if (a.date !== b.date) return a.date < b.date ? 1 : -1
      return (Number(b.createdAt) || 0) - (Number(a.createdAt) || 0)
    })
    planned.value = Number(result.planned) || 0
  } catch (err) {
    toast.error(failText(err))
  } finally {
    loading.value = false
  }
}

function openForm() {
  Object.assign(form, {
    date: todayStr(),
    capacityMinutes: capacity.value || '',
    plannedMinutes: planned.value || '',
    sleepHours: '',
    health: '',
    distractions: [],
    note: ''
  })
  creating.value = true
}

function toggleDistraction(item) {
  const index = form.distractions.indexOf(item)
  if (index >= 0) form.distractions.splice(index, 1)
  else form.distractions.push(item)
}

async function submit() {
  if (busy.value) return
  busy.value = true
  try {
    const result = await lifeApi.createEnergy({
      date: form.date || todayStr(),
      capacityMinutes: Number(form.capacityMinutes) || 0,
      plannedMinutes: Number(form.plannedMinutes) || 0,
      sleepHours: Number(form.sleepHours) || 0,
      health: form.health.trim(),
      distractions: form.distractions.join('、'),
      note: form.note.trim()
    })
    logs.value = [...(result.logs || [])].sort((a, b) => {
      if (a.date !== b.date) return a.date < b.date ? 1 : -1
      return (Number(b.createdAt) || 0) - (Number(a.createdAt) || 0)
    })
    planned.value = Number(result.planned) || 0
    creating.value = false
    emit('changed')
    toast.success('负荷已记录')
  } catch (err) {
    toast.error(failText(err))
  } finally {
    busy.value = false
  }
}

watch(() => props.refreshToken, load)
onMounted(load)
</script>
