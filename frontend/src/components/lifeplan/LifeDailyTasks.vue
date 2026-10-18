<template>
  <div class="space-y-3">
    <!-- 汇总 + 新增 -->
    <div class="flex items-center justify-between gap-3 flex-wrap">
      <div class="flex items-center gap-4 text-xs text-slate-500">
        <span>共 <b class="text-slate-700">{{ tasks.length }}</b> 项</span>
        <span>已完成 <b class="text-emerald-600">{{ doneCount }}</b> 项</span>
        <span>今日待办 <b class="text-indigo-600">{{ todayMinutes }}</b> 分钟</span>
      </div>
      <button
        class="px-3 h-8 rounded-lg bg-indigo-500 text-white text-xs font-medium hover:bg-indigo-600 transition-colors flex items-center gap-1.5"
        @click="openCreate"
      >
        <Plus class="w-3.5 h-3.5" /> 新增任务
      </button>
    </div>

    <!-- 筛选 -->
    <div class="flex items-center gap-2 flex-wrap">
      <div class="flex items-center rounded-lg border border-slate-200 bg-white p-0.5">
        <button
          v-for="range in RANGES"
          :key="range.value"
          class="px-2.5 h-7 rounded-md text-[11px] font-medium transition-colors"
          :class="rangeFilter === range.value ? 'bg-indigo-50 text-indigo-600' : 'text-slate-500 hover:text-slate-700'"
          @click="rangeFilter = range.value"
        >{{ range.label }}</button>
      </div>
      <select v-model="statusFilter" class="h-8 rounded-lg border border-slate-200 bg-white px-2 text-[11px] text-slate-600 outline-none focus:border-indigo-300">
        <option value="">全部状态</option>
        <option v-for="(text, key) in STATUS_TEXT" :key="key" :value="key">{{ text }}</option>
      </select>
      <span class="text-[11px] text-slate-400">点行展开完整详情（方法 / 验收 / 资源 / 风险），核心要点已平铺在表格里；前置未完成的显示「待解锁」</span>
    </div>

    <!-- 新增表单 -->
    <div v-if="creating" class="rounded-xl border border-indigo-100 bg-white px-3 py-3 space-y-2.5">
      <div class="grid grid-cols-1 sm:grid-cols-5 gap-2">
        <input v-model.trim="createForm.title" class="h-9 sm:col-span-2" :class="INPUT" placeholder="任务名称" @keydown.enter="submitCreate" />
        <input v-model="createForm.date" type="date" class="h-9" :class="INPUT" />
        <select v-model="createForm.priority" class="h-9" :class="INPUT">
          <option v-for="p in PRIORITY_KEYS" :key="p" :value="p">{{ p }}</option>
        </select>
        <select v-model="createForm.repeat" class="h-9" :class="INPUT">
          <option v-for="r in REPEAT_KEYS" :key="r" :value="r">{{ REPEAT_TEXT[r] }}</option>
        </select>
      </div>
      <div class="grid grid-cols-1 sm:grid-cols-4 gap-2">
        <input v-model.number="createForm.estMinutes" type="number" min="0" class="h-9" :class="INPUT" placeholder="预估分钟" />
        <input v-model.trim="createForm.preTask" class="h-9" :class="INPUT" placeholder="前置任务" />
        <input v-model.trim="createForm.blocker" class="h-9" :class="INPUT" placeholder="风险提示" />
        <input v-model.trim="createForm.support" class="h-9" :class="INPUT" placeholder="资料入口 / 资源链接" />
      </div>
      <div class="flex items-center justify-end gap-2">
        <button class="h-8 px-3 rounded-lg bg-white border border-slate-200 text-slate-500 text-xs hover:border-slate-300 transition-colors" @click="creating = false">取消</button>
        <button
          class="h-8 px-3 rounded-lg bg-indigo-500 text-white text-xs font-medium hover:bg-indigo-600 transition-colors disabled:opacity-50 flex items-center gap-1.5"
          :disabled="busy || !createForm.title.trim()"
          @click="submitCreate"
        >
          <Loader2 v-if="busy" class="w-3.5 h-3.5 animate-spin" /> 保存
        </button>
      </div>
    </div>

    <!-- 加载 / 空 -->
    <p v-if="loading" class="rounded-xl border border-slate-100 bg-white px-3 py-6 flex items-center justify-center gap-2 text-xs text-slate-400">
      <Loader2 class="w-3.5 h-3.5 animate-spin" /> 加载中…
    </p>
    <p v-else-if="!visibleTasks.length" class="rounded-xl border border-slate-100 bg-white px-3 py-8 text-center text-xs text-slate-400">
      还没有每日任务，先让 AI 生成一份
    </p>

    <!-- 主列表：固定表格，一眼扫完，不依赖悬浮 -->
    <div v-else class="rounded-xl border border-slate-100 bg-white overflow-hidden">
      <div class="overflow-x-auto overscroll-contain">
        <table class="w-full min-w-[1080px] border-collapse text-[11.5px]">
          <thead>
            <tr class="bg-slate-50/80 text-left text-[11px] text-slate-500">
              <th class="w-[92px] px-2.5 py-2 font-medium whitespace-nowrap">日期</th>
              <th class="w-[74px] px-2 py-2 font-medium whitespace-nowrap">时间窗</th>
              <th class="px-2 py-2 font-medium">任务名称</th>
              <th class="w-[68px] px-2 py-2 font-medium whitespace-nowrap">预估时长</th>
              <th class="w-[56px] px-2 py-2 font-medium whitespace-nowrap">优先级</th>
              <th class="w-[120px] px-2 py-2 font-medium whitespace-nowrap">前置任务</th>
              <th class="w-[210px] px-2 py-2 font-medium">核心要点</th>
              <th class="w-[150px] px-2 py-2 font-medium whitespace-nowrap">资料入口</th>
              <th class="w-[70px] px-2 py-2 font-medium whitespace-nowrap">状态</th>
              <th class="w-[96px] px-2 py-2 font-medium whitespace-nowrap">操作</th>
            </tr>
          </thead>
          <tbody>
            <template v-for="task in visibleTasks" :key="task.id">
              <!-- 编辑行 -->
              <tr v-if="editingId === task.id" class="border-t border-slate-100 bg-indigo-50/30">
                <td colspan="10" class="px-2.5 py-2.5">
                  <div class="space-y-2">
                    <div class="grid grid-cols-1 sm:grid-cols-5 gap-2">
                      <input v-model.trim="editForm.title" class="h-9 sm:col-span-2" :class="INPUT" placeholder="任务名称" @keydown.enter="saveEdit" />
                      <input v-model="editForm.date" type="date" class="h-9" :class="INPUT" />
                      <select v-model="editForm.priority" class="h-9" :class="INPUT">
                        <option v-for="p in PRIORITY_KEYS" :key="p" :value="p">{{ p }}</option>
                      </select>
                      <select v-model="editForm.repeat" class="h-9" :class="INPUT">
                        <option v-for="r in REPEAT_KEYS" :key="r" :value="r">{{ REPEAT_TEXT[r] }}</option>
                      </select>
                    </div>
                    <div class="grid grid-cols-1 sm:grid-cols-4 gap-2">
                      <input v-model.number="editForm.estMinutes" type="number" min="0" class="h-9" :class="INPUT" placeholder="预估分钟" />
                      <input v-model.trim="editForm.preTask" class="h-9" :class="INPUT" placeholder="前置任务" @keydown.enter="saveEdit" />
                      <input v-model.trim="editForm.blocker" class="h-9" :class="INPUT" placeholder="风险提示" @keydown.enter="saveEdit" />
                      <input v-model.trim="editForm.support" class="h-9" :class="INPUT" placeholder="资料入口 / 资源链接" @keydown.enter="saveEdit" />
                    </div>
                    <div class="flex items-center justify-end gap-2">
                      <button class="h-8 px-3 rounded-lg bg-white border border-slate-200 text-slate-500 text-xs hover:border-slate-300 transition-colors" @click="editingId = ''">取消</button>
                      <button
                        class="h-8 px-3 rounded-lg bg-indigo-500 text-white text-xs font-medium hover:bg-indigo-600 transition-colors disabled:opacity-50 flex items-center gap-1.5"
                        :disabled="busy"
                        @click="saveEdit"
                      >
                        <Loader2 v-if="busy" class="w-3.5 h-3.5 animate-spin" /> 保存
                      </button>
                    </div>
                  </div>
                </td>
              </tr>

              <!-- 展示行 -->
              <tr
                v-else
                class="border-t border-slate-100 align-top transition-colors cursor-pointer"
                :class="[expandedId === task.id ? 'bg-indigo-50/25' : 'hover:bg-slate-50/70', isLocked(task) ? 'opacity-70' : '']"
                @click="toggleExpand(task)"
              >
                <td class="px-2.5 py-2 text-slate-400 tabular-nums whitespace-nowrap">{{ task.date }}</td>
                <td class="px-2 py-2 text-slate-400 whitespace-nowrap">{{ timeGroupText(task) || '—' }}</td>
                <td class="px-2 py-2">
                  <div class="flex items-start gap-1.5">
                    <button
                      type="button"
                      class="mt-[1px] w-5 h-5 flex-shrink-0 rounded border flex items-center justify-center transition-colors"
                      :class="isLocked(task)
                        ? 'border-slate-200 bg-slate-100 text-transparent cursor-not-allowed'
                        : (task.status === 'done' ? 'bg-indigo-500 border-indigo-500 text-white' : 'border-slate-300 text-transparent hover:border-indigo-400')"
                      :disabled="isLocked(task)"
                      :title="isLocked(task) ? lockReason(task) : (task.status === 'done' ? '取消完成' : '标记完成')"
                      @click.stop="toggleDone(task)"
                    >
                      <Check class="w-3 h-3" />
                    </button>
                    <span
                      v-if="isLocked(task)"
                      class="mt-[2px] flex-shrink-0 text-[10px] px-1 py-0.5 rounded border border-slate-300 bg-slate-100 text-slate-500 whitespace-nowrap"
                      title="前置任务未完成，先完成前置再启动"
                    >待解锁</span>
                    <span class="text-slate-700 leading-snug" :class="{ 'line-through text-slate-400': task.status === 'done' || task.status === 'drop' }">{{ task.title }}</span>
                    <span
                      v-if="task.repeat"
                      class="mt-[2px] flex-shrink-0 text-[10px] px-1 py-0.5 rounded border whitespace-nowrap"
                      :class="REPEAT_META[task.repeat] || REPEAT_META.once"
                      :title="`重复类型：${REPEAT_TEXT[task.repeat] || task.repeat}`"
                    >{{ REPEAT_TEXT[task.repeat] || task.repeat }}</span>
                  </div>
                </td>
                <td class="px-2 py-2 text-slate-400 whitespace-nowrap">{{ task.estMinutes ? `${task.estMinutes} 分钟` : '—' }}</td>
                <td class="px-2 py-2 whitespace-nowrap">
                  <span class="text-[10px] font-semibold px-1.5 py-0.5 rounded border" :class="PRIORITY_META[task.priority]?.cls || 'bg-slate-100 text-slate-500 border-slate-200'">{{ task.priority }}</span>
                </td>
                <td class="px-2 py-2 text-slate-400">
                  <span v-if="task.preTask" class="text-slate-500">#{{ task.preTask }}</span>
                  <span v-else>—</span>
                </td>
                <td class="px-2 py-2 text-slate-600 leading-snug">{{ corePoint(task) }}</td>
                <td class="px-2 py-2 leading-snug">
                  <template v-if="entryLinks(task).length">
                    <a
                      v-for="(link, i) in entryLinks(task)"
                      :key="i"
                      :href="link.href"
                      target="_blank"
                      rel="noopener"
                      :title="link.note || link.href"
                      class="inline-flex items-center gap-0.5 text-indigo-600 hover:text-indigo-700 hover:underline mr-1.5 whitespace-nowrap"
                      @click.stop
                    >
                      <ExternalLink class="w-3 h-3 flex-shrink-0" />{{ link.text }}
                    </a>
                  </template>
                  <span v-else-if="task.support" class="text-slate-500">{{ task.support }}</span>
                  <span v-else class="text-slate-300">—</span>
                </td>
                <td class="px-2 py-2 whitespace-nowrap">
                  <span class="text-[11px]" :class="STATUS_META[task.status]?.cls || 'text-slate-500'">{{ STATUS_TEXT[task.status] || task.status }}</span>
                </td>
                <td class="px-2 py-2 whitespace-nowrap">
                  <div class="flex items-center gap-0.5">
                    <button type="button" class="w-6 h-6 rounded text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 transition-colors flex items-center justify-center" :title="expandedId === task.id ? '折叠详情' : '展开详情'" @click.stop="toggleExpand(task)">
                      <ChevronDown class="w-3.5 h-3.5 transition-transform" :class="{ 'rotate-180': expandedId === task.id }" />
                    </button>
                    <button type="button" class="w-6 h-6 rounded text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors flex items-center justify-center" title="编辑" @click.stop="startEdit(task)">
                      <Pencil class="w-3.5 h-3.5" />
                    </button>
                    <select
                      class="h-6 rounded border border-slate-200 bg-white px-1 text-[10.5px] text-slate-600 outline-none focus:border-indigo-300 disabled:bg-slate-100 disabled:text-slate-400"
                      :value="task.status"
                      :disabled="isLocked(task)"
                      :title="isLocked(task) ? lockReason(task) : ''"
                      @click.stop
                      @change="changeState(task, $event.target.value)"
                    >
                      <option v-for="(text, key) in STATUS_TEXT" :key="key" :value="key">{{ text }}</option>
                    </select>
                    <button type="button" class="w-6 h-6 rounded text-slate-400 hover:text-rose-500 hover:bg-rose-50 transition-colors flex items-center justify-center" title="删除" @click.stop="remove(task)">
                      <Trash2 class="w-3.5 h-3.5" />
                    </button>
                  </div>
                </td>
              </tr>

              <!-- 展开：完整详情（展开才渲染） -->
              <tr v-if="editingId !== task.id && expandedId === task.id" class="border-t border-indigo-100/70 bg-indigo-50/20">
                <td colspan="10" class="px-3 py-3">
                  <div class="grid grid-cols-1 lg:grid-cols-2 gap-3">
                    <div class="rounded-lg border border-slate-100 bg-white px-3 py-2.5">
                      <p class="text-[11px] font-semibold text-slate-500 mb-1">详细执行步骤</p>
                      <p class="text-[11.5px] text-slate-600 leading-relaxed whitespace-pre-wrap">{{ detailOf(task).method || '—' }}</p>
                    </div>
                    <div class="rounded-lg border border-slate-100 bg-white px-3 py-2.5">
                      <p class="text-[11px] font-semibold text-slate-500 mb-1">完整交付标准</p>
                      <p class="text-[11.5px] text-slate-600 leading-relaxed whitespace-pre-wrap">{{ detailOf(task).accept || '—' }}</p>
                    </div>
                    <div class="rounded-lg border border-slate-100 bg-white px-3 py-2.5">
                      <p class="text-[11px] font-semibold text-slate-500 mb-1.5">参考资源链接</p>
                      <div class="space-y-1">
                        <a
                          v-for="(link, i) in entryLinks(task)"
                          :key="i"
                          :href="link.href"
                          target="_blank"
                          rel="noopener"
                          :title="link.note || link.href"
                          class="flex items-center gap-1 text-[11.5px] text-indigo-600 hover:underline break-all"
                        >
                          <ExternalLink class="w-3 h-3 flex-shrink-0" />{{ link.text }}
                        </a>
                        <p v-if="resourceNote(task)" class="text-[11px] text-slate-400 leading-relaxed">{{ resourceNote(task) }}</p>
                      </div>
                    </div>
                    <div class="rounded-lg border border-amber-100 bg-amber-50/40 px-3 py-2.5">
                      <p class="text-[11px] font-semibold text-amber-600 mb-1">风险提示</p>
                      <p class="text-[11.5px] text-amber-700 leading-relaxed whitespace-pre-wrap">{{ riskOf(task) || '—' }}</p>
                    </div>
                  </div>
                  <p v-if="!linkedNode(task)" class="mt-2 text-[11px] text-slate-400">该任务暂未关联规划节点，方法 / 验收 / 资源由 AI 生成后自动补齐。</p>
                </td>
              </tr>
            </template>
          </tbody>
        </table>
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed, onMounted, reactive, ref, watch } from 'vue'
import { Check, ChevronDown, ExternalLink, Loader2, Pencil, Plus, Trash2 } from 'lucide-vue-next'
import { lifeApi } from '../../utils/api'
import { toast } from '../../utils/toast'

const props = defineProps({ refreshToken: { type: Number, default: 0 } })
const emit = defineEmits(['changed'])

const INPUT = 'rounded-lg border border-slate-200 bg-white px-2.5 text-xs text-slate-700 outline-none transition-colors focus:border-indigo-300'
const RANGES = [
  { value: 'all', label: '全部' },
  { value: 'today', label: '今天' },
  { value: 'week', label: '本周' }
]
const PRIORITY_KEYS = ['P0', 'P1', 'P2', 'P3']
const PRIORITY_ORDER = { P0: 0, P1: 1, P2: 2, P3: 3 }
const PRIORITY_META = {
  P0: { cls: 'bg-rose-50 text-rose-600 border-rose-200' },
  P1: { cls: 'bg-amber-50 text-amber-600 border-amber-200' },
  P2: { cls: 'bg-sky-50 text-sky-600 border-sky-200' },
  P3: { cls: 'bg-slate-100 text-slate-500 border-slate-200' }
}
const STATUS_TEXT = { todo: '未开始', doing: '进行中', done: '已完成', delay: '延期', drop: '放弃' }
const STATUS_META = {
  todo: { cls: 'text-slate-500' },
  doing: { cls: 'text-sky-600' },
  done: { cls: 'text-emerald-600' },
  delay: { cls: 'text-amber-600' },
  drop: { cls: 'text-slate-400 line-through' }
}
// 时间窗：复用规划节点的时间分组，无需额外字段
const TIME_GROUP_TEXT = { urgent: '30 天内', mid: '30~90 天', future: '90 天+' }
// 重复类型：由后端 lifeRepeatType 判定（标题关键词兜底），这里只做展示与手动修正
const REPEAT_KEYS = ['daily', 'weekday', 'weekly', 'once']
const REPEAT_TEXT = { daily: '每日重复', weekday: '工作日重复', weekly: '每周重复', once: '单次' }
const REPEAT_META = {
  daily: 'bg-violet-50 text-violet-600 border-violet-200',
  weekday: 'bg-sky-50 text-sky-600 border-sky-200',
  weekly: 'bg-emerald-50 text-emerald-600 border-emerald-200',
  once: 'bg-slate-100 text-slate-500 border-slate-200'
}

const tasks = ref([])
const nodes = ref([])
const loading = ref(true)
const busy = ref(false)
const creating = ref(false)
const editingId = ref('')
const expandedId = ref('')
const rangeFilter = ref('all')
const statusFilter = ref('')

const createForm = reactive({ title: '', date: '', estMinutes: '', priority: 'P1', preTask: '', blocker: '', support: '', repeat: 'once' })
const editForm = reactive({ title: '', date: '', estMinutes: '', priority: 'P1', preTask: '', blocker: '', support: '', repeat: 'once' })

function fmt(date) {
  const pad = n => String(n).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
}
function todayStr() {
  return fmt(new Date())
}
function weekRange() {
  const now = new Date()
  const offset = (now.getDay() + 6) % 7
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate() - offset)
  const end = new Date(start.getFullYear(), start.getMonth(), start.getDate() + 6)
  return [fmt(start), fmt(end)]
}
function failText(err) {
  return err?.response?.data?.error || err?.message || '操作失败'
}

// 节点索引：优先按 nodeId 命中，回退按标题匹配（AI 提取时同一件事标题一致）
const nodeById = computed(() => {
  const map = new Map()
  for (const node of nodes.value) map.set(node.id, node)
  return map
})
const nodeByTitle = computed(() => {
  const map = new Map()
  for (const node of nodes.value) {
    const key = String(node.title || '').trim()
    if (key && !map.has(key)) map.set(key, node)
  }
  return map
})
function linkedNode(task) {
  return nodeById.value.get(task.nodeId) || nodeByTitle.value.get(String(task.title || '').trim()) || null
}
// 里程碑准入：直接前置节点还没全部完成时，这条任务标为「待解锁」，先完成前置再启动
function lockedDeps(task) {
  const node = linkedNode(task)
  const deps = Array.isArray(node?.deps) ? node.deps : []
  if (!deps.length) return []
  return deps
    .map(id => nodeById.value.get(String(id)))
    .filter(dep => dep && dep.status !== 'done')
}
// 节点 deps 为空时，退回用「前置任务」文字匹配同名任务，避免前置锁形同虚设
function lockedNames(task) {
  const raw = String(task.preTask || '').trim().replace(/^前置[：:]?\s*/, '')
  if (!raw) return []
  const names = raw.split(/[；;，,、/|｜]/)
    .map(v => v.trim().replace(/^#\s*\d+\s*/, '').replace(/^[①②③④⑤⑥⑦⑧⑨⑩\d.、）)]+\s*/, '').trim())
    .filter(Boolean)
  return names.filter(name => {
    const target = tasks.value.find(item => {
      if (item.id === task.id) return false
      const title = String(item.title || '').trim()
      return title === name || (title.length >= 4 && (title.includes(name) || name.includes(title)))
    })
    return Boolean(target && target.status !== 'done')
  })
}
function isLocked(task) {
  return lockedDeps(task).length > 0 || lockedNames(task).length > 0
}
// 锁定原因：用于勾选失败时的提示，让用户知道还差哪一步
function lockReason(task) {
  const deps = lockedDeps(task).map(dep => dep.title)
  const names = lockedNames(task)
  const pending = deps.concat(names).filter(Boolean)
  return pending.length ? `前置未完成：${pending.join('、')}` : '前置任务未完成，先完成前置再启动'
}

// 节点 detail 固定三行格式「方法：…；验收：…；资源：…」，拆成可平铺的三段
function parseDetail(text) {
  const raw = String(text || '')
  const pick = label => {
    const re = new RegExp(`${label}[：:]\\s*([\\s\\S]*?)(?=；\\s*(?:方法|验收|资源|风险)[：:]|$)`)
    const match = re.exec(raw)
    return match ? match[1].trim() : ''
  }
  const method = pick('方法')
  const accept = pick('验收')
  const resource = pick('资源')
  // 兼容早期没有「方法/验收/资源」标签的纯文本 detail
  const hasLabel = /方法[：:]|验收[：:]|资源[：:]/.test(raw)
  return { method: method || (hasLabel ? '' : raw.trim()), accept, resource }
}
function detailOf(task) {
  return parseDetail(linkedNode(task)?.detail)
}
function riskOf(task) {
  const node = linkedNode(task)
  return [node?.risk, task.blocker].map(v => String(v || '').trim()).filter(Boolean).filter((v, i, arr) => arr.indexOf(v) === i).join('；')
}
// 核心要点：一句话压缩交付标准 / 操作重点，直接平铺在表格列，无需悬浮
function corePoint(task) {
  const d = detailOf(task)
  const raw = d.accept || d.method || task.blocker || ''
  const text = String(raw).replace(/\s+/g, ' ').trim()
  if (!text) return '—'
  return text.length > 46 ? `${text.slice(0, 46)}…` : text
}
function timeGroupText(task) {
  const node = linkedNode(task)
  return TIME_GROUP_TEXT[node?.timeGroup] || ''
}
// 资料入口：从节点资源段与任务 support 里提取可点开链接，文字只做链接备注
// AI 只给了资料名时按关键词补一个可直接点开的入口，避免这一列变成纯文字
const FALLBACK_SITES = [
  { re: /国考|国家公务员/, site: 'https://bm.scs.gov.cn', text: '国考报名官网' },
  { re: /四六级|四级|六级|CET/i, site: 'https://cet.neea.edu.cn', text: '四六级报名官网' },
  { re: /软考|计算机技术与软件/, site: 'https://www.ruankao.org.cn', text: '软考官网' },
  { re: /计算机二级|NCRE/i, site: 'https://ncre.neea.edu.cn', text: 'NCRE 官网' },
  { re: /教师资格|教资/, site: 'https://ntce.neea.edu.cn', text: '教师资格报名官网' },
  { re: /考研|研招/, site: 'https://yz.chsi.com.cn', text: '研招网' },
  { re: /学信网|学历认证/, site: 'https://www.chsi.com.cn', text: '学信网' },
  { re: /抖音/, search: 'https://www.douyin.com/search/', text: '抖音搜索' },
  { re: /B站|哔哩|bilibili/i, search: 'https://search.bilibili.com/all?keyword=', text: 'B站搜索' }
]
function keywordOf(raw) {
  return String(raw || '')
    .replace(/https?:\/\/\S+/g, '')
    .replace(/[｜|；;，,、（）()【】\[\]]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 40)
}
function entryLinks(task) {
  const d = detailOf(task)
  const raw = [d.resource, task.support].map(v => String(v || '').trim()).filter(Boolean).join('；')
  if (!raw) return []
  const found = []
  const push = (href, text) => {
    if (!href || found.some(item => item.href === href)) return
    found.push({ href, text, note: raw })
  }
  const urls = raw.match(/https?:\/\/[^\s；;，,、）)】\]]+/g) || []
  for (const url of urls) {
    let text = url
    try { text = new URL(url).hostname.replace(/^www\./, '') } catch (_) { /* 非法 URL 时直接显示原文 */ }
    push(url, text)
  }
  const keyword = keywordOf(raw)
  for (const rule of FALLBACK_SITES) {
    if (!rule.re.test(raw)) continue
    if (rule.search) push(rule.search + encodeURIComponent(keyword || '教程'), rule.text)
    else push(rule.site, rule.text)
  }
  if (!found.length) push(`https://www.baidu.com/s?wd=${encodeURIComponent(keyword || raw)}`, '搜索该资料')
  return found
}
// 资料文字备注：链接后面跟的说明文字
function resourceNote(task) {
  const d = detailOf(task)
  return [d.resource, task.support].map(v => String(v || '').trim()).filter(Boolean).join('；')
}

const doneCount = computed(() => tasks.value.filter(t => t.status === 'done').length)
const todayMinutes = computed(() =>
  tasks.value
    .filter(t => t.date === todayStr() && (t.status === 'todo' || t.status === 'doing'))
    .reduce((sum, t) => sum + (Number(t.estMinutes) || 0), 0)
)

const visibleTasks = computed(() => {
  const [weekFrom, weekTo] = weekRange()
  const list = tasks.value.filter(t => {
    if (statusFilter.value && t.status !== statusFilter.value) return false
    if (rangeFilter.value === 'today') return t.date === todayStr()
    if (rangeFilter.value === 'week') return t.date >= weekFrom && t.date <= weekTo
    return true
  })
  return list.sort((a, b) => {
    if (a.date !== b.date) return a.date < b.date ? -1 : 1
    const pa = PRIORITY_ORDER[a.priority] ?? 9
    const pb = PRIORITY_ORDER[b.priority] ?? 9
    if (pa !== pb) return pa - pb
    return (Number(a.sortOrder) || 0) - (Number(b.sortOrder) || 0)
  })
})

async function load() {
  loading.value = true
  try {
    const [taskResult, planResult] = await Promise.all([
      lifeApi.getTasks(),
      lifeApi.getPlan().catch(() => ({ nodes: [] }))
    ])
    tasks.value = taskResult.tasks || []
    nodes.value = planResult.nodes || []
  } catch (err) {
    toast.error(failText(err))
  } finally {
    loading.value = false
  }
}

function toggleExpand(task) {
  expandedId.value = expandedId.value === task.id ? '' : task.id
  if (expandedId.value === task.id) editingId.value = ''
}

function openCreate() {
  Object.assign(createForm, { title: '', date: todayStr(), estMinutes: '', priority: 'P1', preTask: '', blocker: '', support: '', repeat: 'once' })
  creating.value = true
  editingId.value = ''
}

async function submitCreate() {
  if (busy.value || !createForm.title.trim()) return
  busy.value = true
  try {
    const result = await lifeApi.createTask({
      title: createForm.title.trim(),
      date: createForm.date || todayStr(),
      priority: createForm.priority,
      estMinutes: Number(createForm.estMinutes) || 0,
      preTask: createForm.preTask.trim(),
      blocker: createForm.blocker.trim(),
      support: createForm.support.trim(),
      repeat: createForm.repeat
    })
    tasks.value = result.tasks || []
    creating.value = false
    emit('changed')
    toast.success('任务已创建')
  } catch (err) {
    toast.error(failText(err))
  } finally {
    busy.value = false
  }
}

function startEdit(task) {
  editingId.value = task.id
  expandedId.value = ''
  creating.value = false
  Object.assign(editForm, {
    title: task.title || '',
    date: task.date || todayStr(),
    estMinutes: task.estMinutes ?? '',
    priority: task.priority || 'P1',
    preTask: task.preTask || '',
    blocker: task.blocker || '',
    support: task.support || '',
    repeat: task.repeat || 'once'
  })
}

async function saveEdit() {
  if (busy.value || !editingId.value || !editForm.title.trim()) return
  busy.value = true
  try {
    const result = await lifeApi.updateTask(editingId.value, {
      title: editForm.title.trim(),
      date: editForm.date || todayStr(),
      priority: editForm.priority,
      estMinutes: Number(editForm.estMinutes) || 0,
      preTask: editForm.preTask.trim(),
      blocker: editForm.blocker.trim(),
      support: editForm.support.trim(),
      repeat: editForm.repeat
    })
    tasks.value = result.tasks || []
    editingId.value = ''
    emit('changed')
    toast.success('任务已更新')
  } catch (err) {
    toast.error(failText(err))
  } finally {
    busy.value = false
  }
}

async function toggleDone(task) {
  const next = task.status === 'done' ? 'todo' : 'done'
  // 前置任务未完成时不允许直接勾选完成：勾选框已置灰，这里再兜一层防止误操作
  if (next === 'done' && isLocked(task)) {
    toast.error(lockReason(task))
    return
  }
  await changeState(task, next)
}

async function changeState(task, status) {
  if (busy.value || status === task.status) return
  // 待解锁的任务只允许保持未开始或放弃，不能直接进入进行中 / 已完成
  if ((status === 'doing' || status === 'done') && isLocked(task)) {
    toast.error(lockReason(task))
    return
  }
  busy.value = true
  try {
    const result = await lifeApi.setTaskState(task.id, status)
    tasks.value = result.tasks || []
    emit('changed')
    toast.success(status === 'delay' ? '已标记延期，后续任务自动顺延' : '状态已更新')
  } catch (err) {
    toast.error(failText(err))
  } finally {
    busy.value = false
  }
}

async function remove(task) {
  if (busy.value) return
  busy.value = true
  try {
    const result = await lifeApi.deleteTask(task.id)
    tasks.value = result.tasks || []
    if (expandedId.value === task.id) expandedId.value = ''
    emit('changed')
    toast.success('任务已删除')
  } catch (err) {
    toast.error(failText(err))
  } finally {
    busy.value = false
  }
}

watch(() => props.refreshToken, load)
onMounted(load)
</script>
