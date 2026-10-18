<template>
  <div class="space-y-3">
    <div class="flex items-center justify-between gap-3 flex-wrap">
      <div class="flex items-center gap-2">
        <span class="text-xs text-slate-400">共 {{ changes.length }} 条变更记录</span>
        <select v-model="moduleFilter" class="h-8 rounded-lg border border-slate-200 bg-white px-2 text-[11px] text-slate-600 outline-none focus:border-indigo-300">
          <option value="">全部模块</option>
          <option v-for="module in modules" :key="module" :value="module">{{ moduleText(module) }}</option>
        </select>
      </div>
      <span v-if="loading" class="text-[11px] text-slate-400 flex items-center gap-1.5">
        <Loader2 class="w-3.5 h-3.5 animate-spin" /> 加载中…
      </span>
    </div>

    <p v-if="loading" class="rounded-xl border border-slate-100 bg-white px-3 py-6 flex items-center justify-center gap-2 text-xs text-slate-400">
      <Loader2 class="w-3.5 h-3.5 animate-spin" /> 加载中…
    </p>
    <p v-else-if="!visibleChanges.length" class="rounded-xl border border-slate-100 bg-white px-3 py-8 text-center text-xs text-slate-400">
      还没有变更记录，改动计划后会自动记录
    </p>

    <div v-else class="space-y-2">
      <div v-for="change in visibleChanges" :key="change.id" class="rounded-xl border border-slate-100 bg-white px-3 py-2.5 hover:bg-slate-50/70 transition-colors">
        <div class="flex items-center gap-2 flex-wrap">
          <span class="text-[10px] px-1.5 py-0.5 rounded" :class="moduleCls(change.module)">{{ moduleText(change.module) }}</span>
          <span class="text-[11px] text-slate-400 tabular-nums">{{ formatTime(change.createdAt) }}</span>
        </div>
        <p class="mt-1 text-xs text-slate-700">{{ change.content }}</p>
        <p v-if="change.reason" class="mt-0.5 text-[11px] text-slate-400">原因：{{ change.reason }}</p>
        <div v-if="(change.affected || []).length" class="mt-1.5 flex items-center gap-1 flex-wrap">
          <span class="text-[10px] text-slate-400">受影响模块</span>
          <span
            v-for="item in change.affected"
            :key="item"
            class="text-[10px] px-1.5 py-0.5 rounded border border-indigo-100 bg-indigo-50 text-indigo-600"
          >{{ item }}</span>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed, onMounted, ref, watch } from 'vue'
import { Loader2 } from 'lucide-vue-next'
import { lifeApi } from '../../utils/api'
import { toast } from '../../utils/toast'

const props = defineProps({ refreshToken: { type: Number, default: 0 } })
const emit = defineEmits(['changed'])

const MODULE_TEXT = {
  tasks: '每日任务',
  snapshots: '进度快照',
  energy: '精力负荷',
  skills: '技能档案',
  knowledge: '知识库',
  events: '事件日历',
  plan: '规划网络'
}
const MODULE_CLS = {
  tasks: 'bg-indigo-50 text-indigo-600',
  snapshots: 'bg-sky-50 text-sky-600',
  energy: 'bg-amber-50 text-amber-600',
  skills: 'bg-emerald-50 text-emerald-600',
  knowledge: 'bg-violet-50 text-violet-600',
  events: 'bg-rose-50 text-rose-600',
  plan: 'bg-slate-100 text-slate-500'
}

const changes = ref([])
const loading = ref(true)
const moduleFilter = ref('')

function failText(err) {
  return err?.response?.data?.error || err?.message || '操作失败'
}
function moduleText(module) {
  return MODULE_TEXT[module] || module || '其他'
}
function moduleCls(module) {
  return MODULE_CLS[module] || 'bg-slate-100 text-slate-500'
}
function formatTime(value) {
  const time = Number(value)
  if (!Number.isFinite(time) || time <= 0) return '—'
  return new Date(time).toLocaleString('zh-CN')
}

const modules = computed(() => [...new Set(changes.value.map(item => item.module).filter(Boolean))])
const visibleChanges = computed(() =>
  [...changes.value]
    .filter(change => !moduleFilter.value || change.module === moduleFilter.value)
    .sort((a, b) => (Number(b.createdAt) || 0) - (Number(a.createdAt) || 0))
)

async function load() {
  loading.value = true
  try {
    const result = await lifeApi.getChanges()
    changes.value = result.changes || []
  } catch (err) {
    toast.error(failText(err))
  } finally {
    loading.value = false
  }
}

watch(() => props.refreshToken, load)
onMounted(load)
</script>
