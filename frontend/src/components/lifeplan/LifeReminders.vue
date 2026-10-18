<template>
  <div class="space-y-3">
    <!-- 总览条 -->
    <div class="flex items-center justify-between gap-3 flex-wrap">
      <div class="flex items-center gap-4 text-xs text-slate-500">
        <span>共 <b class="text-slate-700">{{ rows.length }}</b> 条关键节点</span>
        <span>7 天内 <b class="text-rose-600">{{ urgentCount }}</b> 条</span>
        <span>里程碑 <b class="text-violet-600">{{ milestoneCount }}</b> 条</span>
        <span>高风险 <b class="text-amber-600">{{ riskCount }}</b> 条</span>
      </div>
      <div class="flex items-center rounded-lg border border-slate-200 bg-white p-0.5">
        <button
          v-for="option in RANGES"
          :key="option.value"
          class="px-2.5 h-7 rounded-md text-[11px] font-medium transition-colors"
          :class="range === option.value ? 'bg-indigo-50 text-indigo-600' : 'text-slate-500 hover:text-slate-700'"
          @click="range = option.value"
        >{{ option.label }}</button>
      </div>
    </div>

    <p class="text-[11px] text-slate-400">系统后台自动扫描规划与任务状态，集中罗列任务截止节点、里程碑进度、外部事件、任务过载与高风险事项，临近节点自动预警，防止遗漏。</p>

    <p v-if="loading" class="rounded-xl border border-slate-100 bg-white px-3 py-6 flex items-center justify-center gap-2 text-xs text-slate-400">
      <Loader2 class="w-3.5 h-3.5 animate-spin" /> 加载中…
    </p>
    <p v-else-if="!visibleRows.length" class="rounded-xl border border-slate-100 bg-white px-3 py-8 text-center text-xs text-slate-400">
      暂无需要提醒的关键节点
    </p>

    <!-- 提醒汇总表 -->
    <div v-else class="rounded-xl border border-slate-100 bg-white overflow-hidden">
      <div class="overflow-x-auto overscroll-contain">
        <table class="w-full min-w-[760px] border-collapse text-[11.5px]">
          <thead>
            <tr class="bg-slate-50/80 text-left text-[11px] text-slate-500">
              <th class="w-[92px] px-3 py-2 font-medium whitespace-nowrap">类型</th>
              <th class="px-3 py-2 font-medium">名称</th>
              <th class="w-[140px] px-3 py-2 font-medium whitespace-nowrap">截止时间</th>
              <th class="w-[168px] px-3 py-2 font-medium whitespace-nowrap">剩余时间（精确到分）</th>
              <th class="w-[120px] px-3 py-2 font-medium whitespace-nowrap">级别 / 优先级</th>
              <th class="w-[200px] px-3 py-2 font-medium whitespace-nowrap">备注</th>
            </tr>
          </thead>
          <tbody>
            <tr
              v-for="row in visibleRows"
              :key="row.key"
              class="border-t border-slate-100 align-top"
              :class="row.days != null && row.days <= 7 ? 'bg-rose-50/40' : 'hover:bg-slate-50/70'"
            >
              <td class="px-3 py-2 whitespace-nowrap">
                <span class="px-1.5 py-0.5 rounded border text-[10px] font-medium" :class="TYPE_META[row.type].cls">{{ TYPE_META[row.type].text }}</span>
              </td>
              <td class="px-3 py-2 text-slate-700 leading-snug">{{ row.name }}</td>
              <td class="px-3 py-2 text-slate-500 tabular-nums whitespace-nowrap">
                <span v-if="supportsPrecise(row)">{{ dueText(row.date) }}</span>
                <span v-else class="text-slate-300">未设定截止</span>
              </td>
              <td class="px-3 py-2 whitespace-nowrap">
                <span
                  v-if="supportsPrecise(row)"
                  class="tabular-nums"
                  :class="row.days < 0 ? 'text-rose-600 font-semibold' : (row.days <= 7 ? 'text-rose-500 font-semibold' : 'text-slate-600')"
                >{{ countdownText(row.date) }}</span>
                <span v-else class="text-slate-300">—</span>
              </td>
              <td class="px-3 py-2 whitespace-nowrap">
                <span v-if="row.level" class="px-1.5 py-0.5 rounded border text-[10px]" :class="LEVEL_META[row.level]?.cls || LEVEL_META.mid.cls">{{ LEVEL_META[row.level]?.text || row.level }}</span>
                <span v-else-if="row.priority" class="text-[10px] font-semibold px-1.5 py-0.5 rounded border" :class="PRIORITY_META[row.priority]?.cls || 'bg-slate-100 text-slate-500 border-slate-200'">{{ row.priority }}</span>
                <span v-else class="text-slate-300">—</span>
              </td>
              <td class="px-3 py-2 text-slate-500 leading-snug">{{ row.note || '—' }}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import { Loader2 } from 'lucide-vue-next'
import { lifeApi } from '../../utils/api'
import { toast } from '../../utils/toast'

const props = defineProps({ refreshToken: { type: Number, default: 0 } })

const RANGES = [
  { value: 'all', label: '全部' },
  { value: '7', label: '7 天内' },
  { value: '30', label: '30 天内' }
]
const TYPE_META = {
  event: { text: '外部事件', cls: 'bg-sky-50 text-sky-600 border-sky-200' },
  task: { text: '任务截止', cls: 'bg-indigo-50 text-indigo-600 border-indigo-200' },
  milestone: { text: '里程碑', cls: 'bg-violet-50 text-violet-600 border-violet-200' },
  overload: { text: '过载预警', cls: 'bg-rose-50 text-rose-600 border-rose-200' },
  risk: { text: '高风险', cls: 'bg-rose-50 text-rose-600 border-rose-200' }
}
const LEVEL_META = {
  high: { text: '高', cls: 'bg-rose-50 text-rose-600 border-rose-200' },
  mid: { text: '中', cls: 'bg-amber-50 text-amber-600 border-amber-200' },
  low: { text: '低', cls: 'bg-slate-100 text-slate-500 border-slate-200' }
}
const PRIORITY_META = {
  P0: { cls: 'bg-rose-50 text-rose-600 border-rose-200' },
  P1: { cls: 'bg-amber-50 text-amber-600 border-amber-200' },
  P2: { cls: 'bg-sky-50 text-sky-600 border-sky-200' },
  P3: { cls: 'bg-slate-100 text-slate-500 border-slate-200' }
}
const TASK_STATUS_TEXT = { todo: '未开始', doing: '进行中', delay: '延期' }

const rows = ref([])
const loading = ref(true)
const range = ref('all')
// 精确倒计时用的当前时刻，每 30 秒推进一次（页面隐藏时暂停）
const now = ref(Date.now())
let tickTimer = null

// 日期型数据只有到日，按当天 23:59 作为截止时刻，展示时精确到分钟
function deadlineTs(iso) {
  const m = /(\d{4})-(\d{2})-(\d{2})/.exec(String(iso || ''))
  if (!m) return null
  return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), 23, 59, 0).getTime()
}
function dueText(iso) {
  const m = /(\d{4})-(\d{2})-(\d{2})/.exec(String(iso || ''))
  if (!m) return ''
  return `${m[1]}-${m[2]}-${m[3]} 23:59`
}
// 剩余时间精确到分钟：X 天 Y 小时 Z 分，逾期则标注已逾期
function countdownText(iso) {
  const ts = deadlineTs(iso)
  if (ts == null) return '—'
  const diff = ts - now.value
  const abs = Math.abs(diff)
  const d = Math.floor(abs / 86400000)
  const h = Math.floor((abs % 86400000) / 3600000)
  const mi = Math.floor((abs % 3600000) / 60000)
  const body = `${d} 天 ${h} 小时 ${mi} 分`
  return diff < 0 ? `已逾期 ${body}` : body
}
function supportsPrecise(row) {
  return deadlineTs(row.date) != null
}

function failText(err) {
  return err?.response?.data?.error || err?.message || '操作失败'
}
function shift(iso, days) {
  const match = /(\d{4})-(\d{2})-(\d{2})/.exec(String(iso || ''))
  if (!match) return null
  const base = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]))
  base.setDate(base.getDate() + days)
  const pad = n => String(n).padStart(2, '0')
  return `${base.getFullYear()}-${pad(base.getMonth() + 1)}-${pad(base.getDate())}`
}
function todayISO() {
  const d = new Date()
  const pad = n => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}
function daysBetween(iso) {
  const match = /(\d{4})-(\d{2})-(\d{2})/.exec(String(iso || ''))
  if (!match) return null
  const now = new Date()
  const base = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime()
  const target = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3])).getTime()
  return Math.round((target - base) / 86400000)
}

async function load() {
  loading.value = true
  try {
    const today = todayISO()
    const [alertData, eventData, taskData, planData, energyData] = await Promise.all([
      lifeApi.getAlerts().catch(() => ({ alerts: [] })),
      lifeApi.getEvents().catch(() => ({ events: [] })),
      lifeApi.getTasks({ from: shift(today, -30), to: shift(today, 90) }).catch(() => ({ tasks: [] })),
      lifeApi.getPlan().catch(() => ({ nodes: [] })),
      lifeApi.getEnergy().catch(() => ({ logs: [], planned: 0 }))
    ])
    const list = []
    for (const event of eventData.events || []) {
      if (event.status === 'done') continue
      list.push({
        key: `event-${event.id}`,
        type: 'event',
        name: event.title,
        date: event.date || '',
        days: daysBetween(event.date),
        level: event.level,
        note: event.category ? `类别：${event.category}` : ''
      })
    }
    for (const task of taskData.tasks || []) {
      if (task.status === 'done' || task.status === 'drop') continue
      if (task.priority !== 'P0' && task.priority !== 'P1') continue
      list.push({
        key: `task-${task.id}`,
        type: 'task',
        name: task.title,
        date: task.date || '',
        days: daysBetween(task.date),
        priority: task.priority,
        note: TASK_STATUS_TEXT[task.status] || ''
      })
    }
    // 里程碑：里程碑进度推送（前置阶段通过才解锁后续分支）
    for (const node of planData.nodes || []) {
      if (node.kind !== 'milestone') continue
      if (node.status === 'done' || node.status === 'drop') continue
      const dated = /\d{4}-\d{2}-\d{2}/.test(String(node.horizon || ''))
      list.push({
        key: `milestone-${node.id}`,
        type: 'milestone',
        name: node.title,
        date: dated ? node.horizon : '',
        days: dated ? daysBetween(node.horizon) : null,
        priority: node.priority || '',
        note: [dated ? '' : `时间刻度：${node.horizon || '未定'}`, node.series ? `主线：${node.series}` : '', '前置阶段验收通过后解锁后续分支'].filter(Boolean).join('；')
      })
    }
    // 过载预警：当日计划总时长超过单日可承受上限
    const latestEnergy = (energyData.logs || [])[0] || null
    const planned = Number(energyData.planned) || Number(latestEnergy?.plannedMinutes) || 0
    const capacity = Number(latestEnergy?.capacityMinutes) || 0
    if (capacity > 0 && planned > capacity) {
      list.push({
        key: 'overload',
        type: 'overload',
        name: '任务过载预警',
        date: latestEnergy?.date || today,
        days: 0,
        level: 'high',
        note: `当日计划 ${planned} 分钟，超过单日上限 ${capacity} 分钟，建议删减 P2/P3 任务`
      })
    }
    for (const [index, alert] of (alertData.alerts || []).entries()) {
      if (alert.kind !== 'risk') continue
      list.push({
        key: `risk-${index}`,
        type: 'risk',
        name: alert.title,
        date: alert.date || '',
        days: alert.daysLeft,
        level: alert.level || 'high',
        note: alert.note || ''
      })
    }
    list.sort((a, b) => {
      const da = a.days == null ? 9999 : a.days
      const db = b.days == null ? 9999 : b.days
      if (da !== db) return da - db
      return String(a.name).localeCompare(String(b.name))
    })
    rows.value = list
  } catch (err) {
    toast.error(failText(err))
  } finally {
    loading.value = false
  }
}

const visibleRows = computed(() => {
  if (range.value === 'all') return rows.value
  const limit = Number(range.value)
  return rows.value.filter(row => row.days == null || row.days <= limit)
})
const urgentCount = computed(() => rows.value.filter(row => row.days != null && row.days >= 0 && row.days <= 7).length)
const milestoneCount = computed(() => rows.value.filter(row => row.type === 'milestone').length)
const riskCount = computed(() => rows.value.filter(row => row.type === 'risk' || row.type === 'overload').length)

function startTick() {
  if (tickTimer) return
  tickTimer = setInterval(() => { now.value = Date.now() }, 30000)
}
function stopTick() {
  if (tickTimer) { clearInterval(tickTimer); tickTimer = null }
}
function onVisibility() {
  if (document.hidden) stopTick()
  else { now.value = Date.now(); startTick() }
}

watch(() => props.refreshToken, load)
onMounted(() => {
  load()
  startTick()
  document.addEventListener('visibilitychange', onVisibility)
})
onUnmounted(() => {
  stopTick()
  document.removeEventListener('visibilitychange', onVisibility)
})
</script>
