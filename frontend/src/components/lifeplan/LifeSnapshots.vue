<template>
  <div class="space-y-3">
    <!-- 顶部指标 -->
    <div class="rounded-xl border border-slate-100 bg-white px-4 py-3">
      <div class="flex items-end justify-between gap-4 flex-wrap">
        <div class="flex items-end gap-3">
          <span class="text-3xl font-bold text-indigo-600 tabular-nums">{{ progress }}<span class="text-base font-semibold text-indigo-400">%</span></span>
          <span class="pb-1 text-xs text-slate-400">当前完成率</span>
        </div>
        <button
          class="px-3 h-8 rounded-lg bg-indigo-500 text-white text-xs font-medium hover:bg-indigo-600 transition-colors disabled:opacity-50 flex items-center gap-1.5"
          :disabled="busy"
          @click="createSnapshot"
        >
          <Loader2 v-if="busy" class="w-3.5 h-3.5 animate-spin" />
          <Camera v-else class="w-3.5 h-3.5" /> 生成今日快照
        </button>
      </div>

      <div class="mt-3 grid grid-cols-2 sm:grid-cols-4 gap-2">
        <div class="rounded-lg border border-slate-100 bg-slate-50/60 px-3 py-2">
          <p class="text-[11px] text-slate-400">总数</p>
          <p class="text-lg font-semibold text-slate-700 tabular-nums">{{ stats.total || 0 }}</p>
        </div>
        <div class="rounded-lg border border-slate-100 bg-slate-50/60 px-3 py-2">
          <p class="text-[11px] text-slate-400">活跃</p>
          <p class="text-lg font-semibold text-sky-600 tabular-nums">{{ stats.active || 0 }}</p>
        </div>
        <div class="rounded-lg border px-3 py-2" :class="delayCount ? 'border-amber-200 bg-amber-50/60' : 'border-slate-100 bg-slate-50/60'">
          <p class="text-[11px] text-slate-400">延期</p>
          <p class="text-lg font-semibold tabular-nums" :class="delayCount ? 'text-amber-600' : 'text-slate-700'">{{ delayCount }}</p>
        </div>
        <div class="rounded-lg border border-slate-100 bg-slate-50/60 px-3 py-2">
          <p class="text-[11px] text-slate-400">已完成</p>
          <p class="text-lg font-semibold text-emerald-600 tabular-nums">{{ doneCount }}</p>
        </div>
      </div>

      <!-- 完成率趋势（最近若干次快照） -->
      <div v-if="trend.length" class="mt-3 space-y-1.5">
        <p class="text-[11px] text-slate-400">完成率趋势</p>
        <div v-for="item in trend" :key="item.id" class="flex items-center gap-2">
          <span class="w-16 flex-shrink-0 text-[11px] text-slate-400 tabular-nums">{{ item.date }}</span>
          <div class="h-2 flex-1 rounded-full bg-slate-100 overflow-hidden">
            <div class="h-full rounded-full bg-indigo-400" :style="{ width: Math.max(2, item.progress) + '%' }"></div>
          </div>
          <span class="w-10 flex-shrink-0 text-right text-[11px] text-slate-500 tabular-nums">{{ item.progress }}%</span>
        </div>
      </div>
    </div>

    <!-- 列表 -->
    <p v-if="loading" class="rounded-xl border border-slate-100 bg-white px-3 py-6 flex items-center justify-center gap-2 text-xs text-slate-400">
      <Loader2 class="w-3.5 h-3.5 animate-spin" /> 加载中…
    </p>
    <p v-else-if="!snapshots.length" class="rounded-xl border border-slate-100 bg-white px-3 py-8 text-center text-xs text-slate-400">
      还没有快照，点右上角生成一份今天的进度快照
    </p>

    <div v-else class="space-y-2">
      <div
        v-for="snapshot in snapshots"
        :key="snapshot.id"
        class="rounded-xl border border-slate-100 bg-white px-3 py-2.5 hover:bg-slate-50/70 transition-colors cursor-pointer"
        @click="toggleExpand(snapshot)"
      >
        <div class="flex items-center justify-between gap-3 flex-wrap">
          <div class="flex items-center gap-2 flex-wrap">
            <span class="text-sm font-semibold text-slate-700 tabular-nums">{{ snapshot.date }}</span>
            <span class="text-[10px] px-1.5 py-0.5 rounded bg-indigo-50 text-indigo-600">完成率 {{ snapshot.progress }}%</span>
          </div>
          <div class="flex items-center gap-2 flex-wrap text-[11px]">
            <span class="text-slate-400">待办 {{ counts(snapshot).todo }}</span>
            <span class="text-sky-500">进行 {{ counts(snapshot).doing }}</span>
            <span class="text-emerald-600">完成 {{ counts(snapshot).done }}</span>
            <span class="text-amber-500">延期 {{ counts(snapshot).delay }}</span>
            <span class="text-slate-400">放弃 {{ counts(snapshot).drop }}</span>
          </div>
        </div>
        <p v-if="snapshot.diffNote" class="mt-1.5 text-[11px] text-slate-500">{{ snapshot.diffNote }}</p>

        <!-- 展开详情 -->
        <div v-if="expandedId === snapshot.id" class="mt-2 border-t border-slate-100 pt-2">
          <p v-if="detailLoading" class="flex items-center gap-1.5 text-[11px] text-slate-400">
            <Loader2 class="w-3.5 h-3.5 animate-spin" /> 加载详情…
          </p>
          <div v-else-if="detail && detail.id === snapshot.id" class="flex items-center gap-4 flex-wrap text-[11px] text-slate-500">
            <span>总数 <b class="text-slate-700">{{ detail.payload?.total ?? 0 }}</b></span>
            <span>活跃 <b class="text-slate-700">{{ detail.payload?.active ?? 0 }}</b></span>
            <span>完成率 <b class="text-slate-700">{{ detail.payload?.progress ?? 0 }}%</b></span>
            <span>存档节点 <b class="text-slate-700">{{ detail.payload?.nodes?.length ?? 0 }}</b></span>
            <button
              v-if="detail.payload?.nodes?.length"
              class="ml-auto h-7 px-2.5 rounded-lg border border-amber-200 text-amber-600 text-[11px] hover:bg-amber-50 transition-colors disabled:opacity-50 flex items-center gap-1"
              :disabled="busy"
              @click.stop="restore(detail)"
            >
              <RotateCcw class="w-3.5 h-3.5" /> 回退到此版本
            </button>
          </div>
          <p v-else class="text-[11px] text-slate-400">暂无更多明细</p>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed, onMounted, ref, watch } from 'vue'
import { Camera, Loader2, RotateCcw } from 'lucide-vue-next'
import { lifeApi } from '../../utils/api'
import { toast } from '../../utils/toast'

const props = defineProps({ refreshToken: { type: Number, default: 0 } })
const emit = defineEmits(['changed'])

const EMPTY_STATS = { total: 0, active: 0, progress: 0, counts: { todo: 0, doing: 0, done: 0, delay: 0, drop: 0 } }

const snapshots = ref([])
const stats = ref({ ...EMPTY_STATS })
const loading = ref(true)
const busy = ref(false)
const expandedId = ref('')
const detail = ref(null)
const detailLoading = ref(false)

const progress = computed(() => stats.value?.progress || 0)
const doneCount = computed(() => stats.value?.counts?.done || 0)
const delayCount = computed(() => stats.value?.counts?.delay || 0)
const trend = computed(() =>
  [...snapshots.value]
    .sort((a, b) => (Number(a.createdAt) || 0) - (Number(b.createdAt) || 0))
    .slice(-10)
)

function counts(snapshot) {
  return snapshot?.payload?.counts || { todo: 0, doing: 0, done: 0, delay: 0, drop: 0 }
}
function failText(err) {
  return err?.response?.data?.error || err?.message || '操作失败'
}

function sortDesc(list) {
  return [...list].sort((a, b) => {
    if (a.date !== b.date) return a.date < b.date ? 1 : -1
    return (Number(b.createdAt) || 0) - (Number(a.createdAt) || 0)
  })
}

async function load() {
  loading.value = true
  try {
    const result = await lifeApi.getSnapshots()
    snapshots.value = sortDesc(result.snapshots || [])
    stats.value = result.stats || { ...EMPTY_STATS }
  } catch (err) {
    toast.error(failText(err))
  } finally {
    loading.value = false
  }
}

async function createSnapshot() {
  if (busy.value) return
  busy.value = true
  try {
    const result = await lifeApi.createSnapshot('面板手动生成')
    snapshots.value = sortDesc(result.snapshots || [])
    if (result.snapshot?.payload) stats.value = result.snapshot.payload
    emit('changed')
    toast.success('已生成今日快照')
  } catch (err) {
    toast.error(failText(err))
  } finally {
    busy.value = false
  }
}

async function toggleExpand(snapshot) {
  if (expandedId.value === snapshot.id) {
    expandedId.value = ''
    return
  }
  expandedId.value = snapshot.id
  detail.value = null
  detailLoading.value = true
  try {
    const result = await lifeApi.getSnapshot(snapshot.id)
    detail.value = result.snapshot || null
  } catch (err) {
    toast.error(failText(err))
  } finally {
    detailLoading.value = false
  }
}

// 回退到历史版本：用快照存档的规划节点覆盖当前规划网络
async function restore(snapshot) {
  if (busy.value) return
  const nodeCount = Number(snapshot?.payload?.nodes?.length) || 0
  if (!nodeCount) {
    toast.error('该快照没有存档规划节点，无法回退')
    return
  }
  if (!window.confirm(`确定回退到 ${snapshot.date} 的规划版本？当前规划网络会被这份快照的 ${nodeCount} 个节点覆盖，操作不可撤销。`)) return
  busy.value = true
  try {
    await lifeApi.restoreSnapshot(snapshot.id)
    emit('changed')
    toast.success(`已回退到 ${snapshot.date} 的规划版本`)
  } catch (err) {
    toast.error(failText(err))
  } finally {
    busy.value = false
  }
}

watch(() => props.refreshToken, load)
onMounted(load)
</script>
