<template>
  <div class="space-y-3">
    <!-- 顶部：待审批概览 + 手动归集 -->
    <div class="rounded-xl border border-slate-100 bg-white px-3 py-2.5">
      <div class="flex items-center justify-between gap-3 flex-wrap">
        <div class="flex items-center gap-2 flex-wrap">
          <span class="text-xs font-medium text-slate-600">检索审批</span>
          <span class="text-[10px] px-1.5 py-0.5 rounded bg-indigo-50 text-indigo-600">单次提问最多 3 次联网检索</span>
          <span class="text-[11px] text-slate-400">超出的需求会进这里的队列，由你决定是否付费检索</span>
        </div>
        <div class="flex items-center gap-2">
          <span class="text-[11px] text-slate-400">待归集 {{ pendingCount }} 条 · 待审批 {{ pendingBatchCount }} 批 · 累计花费 {{ totalCost.toFixed(2) }} 元</span>
          <button
            type="button"
            class="h-8 px-2.5 rounded-lg border border-slate-200 text-xs font-medium transition-colors flex items-center gap-1 disabled:opacity-50"
            :class="pendingCount ? 'text-indigo-600 hover:border-indigo-200 hover:bg-indigo-50' : 'text-slate-400'"
            :disabled="busy || !pendingCount"
            @click="collect"
          >
            <Loader2 v-if="busy" class="w-3.5 h-3.5 animate-spin" />
            <Inbox v-else class="w-3.5 h-3.5" />
            立即归集成批
          </button>
        </div>
      </div>
    </div>

    <!-- 待审批批次 -->
    <p v-if="loading" class="rounded-xl border border-slate-100 bg-white px-3 py-6 flex items-center justify-center gap-2 text-xs text-slate-400">
      <Loader2 class="w-3.5 h-3.5 animate-spin" /> 加载中…
    </p>
    <p v-else-if="!batches.length" class="rounded-xl border border-slate-100 bg-white px-3 py-8 text-center text-xs text-slate-400">
      还没有检索批次。超出 3 次上限的检索需求会自动进入待归集队列，点「立即归集成批」后在这里审批
    </p>

    <div v-else class="space-y-2">
      <div v-for="batch in batches" :key="batch.id" class="rounded-xl border bg-white px-3 py-2.5" :class="batch.status === 'pending' ? 'border-amber-200' : 'border-slate-100'">
        <div class="flex items-center justify-between gap-3 flex-wrap">
          <div class="flex items-center gap-2 flex-wrap">
            <span class="text-xs font-medium text-slate-700">批次 {{ batch.batchNo }}</span>
            <span class="text-[10px] px-1.5 py-0.5 rounded" :class="statusCls(batch.status)">{{ statusText(batch.status) }}</span>
            <span class="text-[11px] text-slate-400">{{ batch.taskCount }} 条 · 预估 {{ batch.estCost.toFixed(2) }} 元</span>
            <span v-if="batch.actualCost > 0" class="text-[11px] text-slate-400">实付 {{ batch.actualCost.toFixed(2) }} 元</span>
            <span class="text-[11px] text-slate-400 tabular-nums">{{ formatTime(batch.createdAt) }}</span>
          </div>
          <div v-if="batch.status === 'pending'" class="flex items-center gap-1.5">
            <button type="button" class="h-7 px-2 rounded-lg border border-rose-200 text-[11px] font-medium text-rose-600 hover:bg-rose-50 disabled:opacity-50" :disabled="busy" @click="decide(batch, 'reject')">全部驳回</button>
            <button type="button" class="h-7 px-2 rounded-lg border border-indigo-200 text-[11px] font-medium text-indigo-600 hover:bg-indigo-50 disabled:opacity-50" :disabled="busy || !pickedIds(batch).length" @click="decide(batch, 'partial')">同意勾选 {{ pickedIds(batch).length }} 条</button>
            <button type="button" class="h-7 px-2 rounded-lg bg-indigo-600 text-[11px] font-medium text-white hover:bg-indigo-500 disabled:opacity-50" :disabled="busy" @click="decide(batch, 'all')">全部同意</button>
          </div>
        </div>

        <div v-if="batch.status === 'pending'" class="mt-2 space-y-1">
          <label
            v-for="item in batchItems(batch)"
            :key="item.id"
            class="flex items-start gap-2 rounded-lg border border-slate-100 px-2 py-1.5 hover:bg-slate-50/70 cursor-pointer"
          >
            <input type="checkbox" class="mt-0.5 accent-indigo-500" :checked="isPicked(batch.id, item.id)" @change="togglePick(batch.id, item.id)" />
            <span class="min-w-0 flex-1">
              <span class="block text-xs text-slate-700 break-words">{{ item.query }}</span>
              <span class="mt-0.5 flex items-center gap-1.5 flex-wrap text-[10px] text-slate-400">
                <span v-if="item.series">{{ item.series }}</span>
                <span v-if="item.priority" class="px-1 rounded bg-slate-100">{{ item.priority }}</span>
                <span>预估 {{ item.estCost.toFixed(3) }} 元</span>
                <span v-if="item.fromCache" class="text-emerald-600">命中缓存不计费</span>
              </span>
            </span>
          </label>
          <p v-if="!batchItems(batch).length" class="text-[11px] text-slate-400">该批次的检索条目已不在队列前 120 条内，只能整批同意或驳回</p>
        </div>
      </div>
    </div>

    <!-- 待归集队列 -->
    <div v-if="queue.length" class="rounded-xl border border-slate-100 bg-white px-3 py-2.5">
      <p class="text-[11px] font-medium text-slate-500">最近检索需求（{{ queue.length }} 条，前 120 条）</p>
      <div class="mt-1.5 space-y-1">
        <div v-for="item in queue" :key="item.id" class="flex items-center justify-between gap-2 rounded-lg border border-slate-100 px-2 py-1.5">
          <span class="min-w-0 flex-1 text-xs text-slate-600 break-words">{{ item.query }}</span>
          <span class="flex items-center gap-1.5 flex-shrink-0 text-[10px] text-slate-400">
            <span v-if="item.series">{{ item.series }}</span>
            <span class="px-1.5 py-0.5 rounded" :class="queueStatusCls(item.status)">{{ queueStatusText(item.status) }}</span>
          </span>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed, onMounted, ref, watch } from 'vue'
import { Inbox, Loader2 } from 'lucide-vue-next'
import { lifeApi } from '../../utils/api'
import { toast } from '../../utils/toast'

const props = defineProps({ refreshToken: { type: Number, default: 0 } })

const BATCH_STATUS = {
  pending: ['待审批', 'bg-amber-50 text-amber-600 border border-amber-200'],
  approved: ['已同意', 'bg-indigo-50 text-indigo-600'],
  done: ['已执行', 'bg-emerald-50 text-emerald-600'],
  partial: ['部分执行', 'bg-sky-50 text-sky-600'],
  rejected: ['已驳回', 'bg-slate-100 text-slate-500']
}
const QUEUE_STATUS = {
  pending: ['待归集', 'bg-amber-50 text-amber-600'],
  batched: ['已进批次', 'bg-indigo-50 text-indigo-600'],
  done: ['已检索', 'bg-emerald-50 text-emerald-600'],
  rejected: ['已驳回', 'bg-slate-100 text-slate-500']
}

const batches = ref([])
const queue = ref([])
const bill = ref({ totalCost: 0 })
const picked = ref({})
const loading = ref(true)
const busy = ref(false)

const pendingCount = computed(() => queue.value.filter(item => item.status === 'pending').length)
const pendingBatchCount = computed(() => batches.value.filter(item => item.status === 'pending').length)
const totalCost = computed(() => Number(bill.value.totalCost || 0))
const queueById = computed(() => new Map(queue.value.map(item => [String(item.id), item])))

function statusText(status) { return (BATCH_STATUS[status] || [status || '未知'])[0] }
function statusCls(status) { return (BATCH_STATUS[status] || ['', 'bg-slate-100 text-slate-500'])[1] }
function queueStatusText(status) { return (QUEUE_STATUS[status] || [status || '未知'])[0] }
function queueStatusCls(status) { return (QUEUE_STATUS[status] || ['', 'bg-slate-100 text-slate-500'])[1] }
function formatTime(value) {
  const time = Number(value)
  if (!Number.isFinite(time) || time <= 0) return '—'
  return new Date(time).toLocaleString('zh-CN')
}
function failText(err) {
  return err?.response?.data?.error || err?.message || '操作失败'
}

// 批次里的条目正文来自待检索队列；队列只返回前 120 条，查不到时退化为整批操作
function batchItems(batch) {
  return (batch.taskIds || []).map(id => queueById.value.get(String(id))).filter(Boolean)
}
function pickedIds(batch) {
  return picked.value[batch.id] || []
}
function isPicked(batchId, id) {
  return pickedIds({ id: batchId }).includes(String(id))
}
function togglePick(batchId, id) {
  const current = [...(picked.value[batchId] || [])]
  const key = String(id)
  const next = current.includes(key) ? current.filter(item => item !== key) : [...current, key]
  picked.value = { ...picked.value, [batchId]: next }
}

async function load() {
  loading.value = true
  try {
    const [batchResult, queueResult, billResult] = await Promise.all([
      lifeApi.getRetrievalBatches().catch(() => ({ batches: [] })),
      lifeApi.getRetrievalQueue().catch(() => ({ tasks: [] })),
      lifeApi.getRetrievalBill().catch(() => ({ totalCost: 0 }))
    ])
    batches.value = batchResult.batches || []
    queue.value = queueResult.tasks || []
    bill.value = billResult || { totalCost: 0 }
  } catch (err) {
    toast.error(failText(err))
  } finally {
    loading.value = false
  }
}

async function collect() {
  busy.value = true
  try {
    const result = await lifeApi.collectRetrieval()
    toast.success(result.message || '已归集成批')
    await load()
  } catch (err) {
    toast.error(failText(err))
  } finally {
    busy.value = false
  }
}

async function decide(batch, mode) {
  busy.value = true
  try {
    const ids = mode === 'partial' ? pickedIds(batch) : []
    const result = await lifeApi.decideRetrievalBatch(batch.id, mode, ids)
    toast.success(result.message || '已处理')
    await load()
  } catch (err) {
    toast.error(failText(err))
  } finally {
    busy.value = false
  }
}

watch(() => props.refreshToken, load)
onMounted(load)
</script>
