<template>
  <div class="space-y-3">
    <!-- 顶部：定位说明 + 汇总 -->
    <div class="rounded-xl border border-slate-100 bg-white px-3 py-2.5">
      <div class="flex items-center justify-between gap-2 flex-wrap">
        <div class="min-w-0">
          <p class="text-sm font-semibold text-slate-700">系统内个人人物画像（用户模型）</p>
          <p class="mt-0.5 text-[11px] leading-relaxed text-slate-400">
            全局统一画像，跨所有根目标共用；随任务打卡、学习行为持续学习更新，是右侧规划网络链式推演的基础数据源。
          </p>
        </div>
        <span v-if="loading || busy" class="flex flex-shrink-0 items-center gap-1.5 text-[11px] text-slate-400">
          <Loader2 class="w-3.5 h-3.5 animate-spin" /> 处理中…
        </span>
      </div>
      <div class="mt-2 flex items-center gap-3 flex-wrap text-[11px] text-slate-500">
        <span>已填充维度 <b class="text-slate-700">{{ filledDims }}/6</b></span>
        <span>可选路径 <b class="text-slate-700">{{ paths.length }}</b> 条</span>
        <span v-if="persona.source === 'ai'" class="rounded bg-indigo-50 px-1.5 py-0.5 text-indigo-600">AI 自动维护</span>
      </div>
    </div>

    <!-- 动态画像：由右侧规划网络 + 每日任务的完成度实时推导，随规划改动一直变 -->
    <div class="rounded-xl border border-teal-100 bg-teal-50/40 p-3">
      <div class="flex items-start justify-between gap-2">
        <div class="min-w-0">
          <p class="text-sm font-semibold text-teal-700">动态画像 · 按完成度实时推导</p>
          <p class="mt-0.5 text-[11px] leading-snug text-teal-700/80">
            不是手填的：系统按你右侧规划节点与每日任务的完成情况反推当前状态、能力基线、行为习惯、性格特质、资源盘点、未来可做的事与相对优势。规划一改，它跟着变。
          </p>
        </div>
        <button
          class="flex-shrink-0 rounded-lg border border-teal-200 bg-white px-2 h-7 text-[11px] text-teal-600 transition-colors hover:border-teal-400 disabled:opacity-50"
          :disabled="deriving"
          @click="refreshDerived"
        >{{ deriving ? '推导中…' : '重新推导' }}</button>
      </div>
      <p v-if="derivedAtText" class="mt-1 text-[10px] text-teal-600/70">更新于 {{ derivedAtText }}</p>

      <div v-if="derivedDims.length" class="mt-2 space-y-2">
        <div v-for="dim in derivedDims" :key="dim.key" class="rounded-lg border border-teal-100 bg-white px-2.5 py-2">
          <p class="text-[12px] font-semibold text-slate-700">{{ dim.label }}</p>
          <ul v-if="derivedLines(dim.key).length" class="mt-1 space-y-0.5">
            <li v-for="(line, i) in derivedLines(dim.key)" :key="i" class="flex gap-1.5 text-[11px] leading-snug text-slate-600">
              <span class="text-teal-400">·</span><span class="min-w-0">{{ line }}</span>
            </li>
          </ul>
          <p v-else class="mt-1 text-[11px] text-slate-400">数据太少，暂不足以推断</p>
        </div>
      </div>
      <p v-else class="mt-2 text-[11px] text-slate-400">还没有推导结果，先让 AI 更新一次规划，或点「重新推导」。</p>
    </div>

    <!-- 6 大维度：固定，逐条渲染 -->
    <div v-for="dim in dims" :key="dim.key" class="rounded-xl border border-slate-100 bg-white p-3">
      <div class="flex items-start justify-between gap-2">
        <div class="min-w-0">
          <p class="text-sm font-semibold text-slate-700">{{ dim.label }}</p>
          <p class="mt-0.5 text-[11px] leading-snug text-slate-400">{{ dim.hint }}</p>
        </div>
        <button
          v-if="editingDim !== dim.key"
          class="flex-shrink-0 rounded-lg border border-slate-200 px-2 h-7 text-[11px] text-slate-500 transition-colors hover:border-indigo-300 hover:text-indigo-600"
          @click="startDimEdit(dim.key)"
        >{{ persona[dim.key] ? '编辑' : '填写' }}</button>
      </div>

      <!-- 时间与行为习惯：系统自动统计的证据（不需要手填） -->
      <div v-if="dim.key === 'timeHabits' && stats" class="mt-2 flex flex-wrap gap-1.5">
        <span class="rounded bg-slate-50 px-1.5 py-0.5 text-[10px] text-slate-500">任务 {{ stats.total }} 条</span>
        <span class="rounded bg-emerald-50 px-1.5 py-0.5 text-[10px] text-emerald-600">完成率 {{ stats.doneRate }}%</span>
        <span class="rounded bg-slate-50 px-1.5 py-0.5 text-[10px] text-slate-500">近 7 天完成率 {{ stats.weekRate }}%</span>
        <span v-if="stats.overdue" class="rounded bg-amber-50 px-1.5 py-0.5 text-[10px] text-amber-600">逾期未完成 {{ stats.overdue }} 条</span>
        <span v-if="stats.dropRate" class="rounded bg-rose-50 px-1.5 py-0.5 text-[10px] text-rose-500">放弃率 {{ stats.dropRate }}%</span>
      </div>

      <!-- 展示态：按行渲染「标签｜内容」 -->
      <div v-if="editingDim !== dim.key" class="mt-2">
        <ul v-if="lines(persona[dim.key]).length" class="space-y-1">
          <li v-for="(line, index) in lines(persona[dim.key])" :key="index" class="flex items-start gap-1.5 text-[11.5px] leading-relaxed text-slate-600">
            <span class="mt-[6px] h-1 w-1 flex-shrink-0 rounded-full bg-indigo-300"></span>
            <span class="min-w-0 whitespace-pre-wrap break-words">{{ line }}</span>
          </li>
        </ul>
        <p v-else class="mt-1 text-[11px] text-slate-400">还没有内容，可自行填写，或直接和 AI 对话让它自动补全</p>
      </div>

      <!-- 编辑态 -->
      <div v-else class="mt-2 space-y-2">
        <textarea
          v-model="dimDraft"
          rows="6"
          class="w-full resize-none rounded-lg border border-slate-200 px-2.5 py-2 text-[12px] leading-relaxed text-slate-700 outline-none transition-colors focus:border-indigo-300 focus:ring-2 focus:ring-indigo-50"
          :placeholder="dimEditPlaceholder"
        ></textarea>
        <div class="flex items-center justify-end gap-2">
          <button class="h-7 rounded-lg border border-slate-200 bg-white px-2.5 text-[11px] text-slate-500 transition-colors hover:border-slate-300" @click="editingDim = ''">取消</button>
          <button
            class="h-7 rounded-lg bg-indigo-500 px-2.5 text-[11px] font-medium text-white transition-colors hover:bg-indigo-600 disabled:opacity-50"
            :disabled="busy"
            @click="saveDim(dim.key)"
          >保存</button>
        </div>
      </div>
    </div>

    <!-- 衍生模块：未来可选发展路径库 -->
    <div class="rounded-xl border border-slate-100 bg-white p-3">
      <div class="flex items-start justify-between gap-2">
        <div class="min-w-0">
          <p class="text-sm font-semibold text-slate-700">未来可选发展路径库</p>
          <p class="mt-0.5 text-[11px] leading-snug text-slate-400">
            由 6 大维度画像推理生成：每条路径带适配得分、个人优势、代价、前置条件与长期推演；画像更新后适配分自动重算。
          </p>
        </div>
        <button
          class="flex h-7 flex-shrink-0 items-center gap-1 rounded-lg border border-dashed border-slate-200 px-2 text-[11px] text-slate-500 transition-colors hover:border-indigo-300 hover:text-indigo-600"
          @click="startPathCreate"
        >
          <Plus class="w-3.5 h-3.5" /> 新增
        </button>
      </div>

      <!-- 新增草稿 -->
      <div v-if="pathDraft.open && !pathDraft.id" class="mt-2.5 rounded-lg border border-indigo-200 bg-indigo-50/30 p-2.5">
        <LifePathForm :model-value="pathDraft" :busy="busy" @cancel="pathDraft.open = false" @save="savePath" />
      </div>

      <p v-if="loading" class="mt-2 px-1 py-4 text-center text-[11px] text-slate-400">加载中…</p>
      <p v-else-if="!paths.length" class="mt-2 px-1 py-4 text-center text-[11px] text-slate-400">
        还没有路径，可以让 AI 依据画像生成，或自己点「新增」加一条
      </p>

      <!-- 路径卡片列表 -->
      <div v-else class="mt-2.5 space-y-2.5">
        <div
          v-for="path in paths"
          :key="path.id"
          class="rounded-xl border transition-colors"
          :class="pathDraft.id === path.id ? 'border-indigo-200 bg-indigo-50/30' : 'border-slate-100 bg-white hover:border-slate-200 hover:bg-slate-50/60'"
          @dblclick="startPathEdit(path)"
        >
          <!-- 编辑态 -->
          <div v-if="pathDraft.open && pathDraft.id === path.id" class="p-2.5" @click.stop>
            <LifePathForm :model-value="pathDraft" :busy="busy" @cancel="pathDraft.open = false" @save="savePath" />
          </div>

          <!-- 展示态 -->
          <div v-else class="p-2.5">
            <div class="flex items-start justify-between gap-2">
              <span class="min-w-0 text-[13px] font-semibold leading-snug text-slate-700">{{ path.name }}</span>
              <span class="flex-shrink-0 rounded-full border px-2 py-0.5 text-[11px] font-semibold tabular-nums" :class="scoreClass(path.score)">
                适配 {{ path.score }} 分
              </span>
            </div>

            <div v-if="lines(path.advantages).length" class="mt-2">
              <p class="text-[11px] font-medium text-emerald-600">✅ 你的优势</p>
              <ul class="mt-0.5 space-y-0.5">
                <li v-for="(line, index) in lines(path.advantages)" :key="index" class="text-[11.5px] leading-relaxed text-slate-600">· {{ line }}</li>
              </ul>
            </div>
            <div v-if="lines(path.risks).length" class="mt-2">
              <p class="text-[11px] font-medium text-amber-600">⚠️ 短板与代价</p>
              <ul class="mt-0.5 space-y-0.5">
                <li v-for="(line, index) in lines(path.risks)" :key="index" class="text-[11.5px] leading-relaxed text-slate-600">· {{ line }}</li>
              </ul>
            </div>
            <div v-if="lines(path.prerequisites).length" class="mt-2">
              <p class="text-[11px] font-medium text-slate-500">📋 前置必备条件</p>
              <ul class="mt-0.5 space-y-0.5">
                <li v-for="(line, index) in lines(path.prerequisites)" :key="index" class="text-[11.5px] leading-relaxed text-slate-600">· {{ line }}</li>
              </ul>
            </div>
            <div v-if="lines(path.evolution).length" class="mt-2">
              <p class="text-[11px] font-medium text-indigo-500">📈 长期推演（能力 / 资产 / 生活变化）</p>
              <ul class="mt-0.5 space-y-0.5">
                <li v-for="(line, index) in lines(path.evolution)" :key="index" class="text-[11.5px] leading-relaxed text-slate-600">· {{ line }}</li>
              </ul>
            </div>

            <div class="mt-2.5 flex items-center justify-between gap-2 border-t border-slate-100 pt-2">
              <button
                class="flex items-center gap-1 text-[11px] font-medium transition-colors"
                :class="path.nodeId ? 'text-indigo-500 hover:text-indigo-600' : 'text-slate-300 cursor-not-allowed'"
                :title="path.nodeId ? '在右侧规划网络里定位这条路径的推演子图' : '这条路径还没有对应的推演子图，先在对话里让 AI 展开'"
                @click.stop="focusPath(path)"
              >
                <Crosshair class="w-3.5 h-3.5" /> 看推演子图
              </button>
              <div class="flex items-center gap-1.5">
                <button class="rounded px-1.5 py-0.5 text-[11px] text-slate-400 transition-colors hover:text-indigo-500" @click.stop="startPathEdit(path)">编辑</button>
                <button class="flex items-center gap-0.5 rounded px-1.5 py-0.5 text-[11px] text-rose-400 transition-colors hover:text-rose-500" @click.stop="removePath(path)">
                  <Trash2 class="w-3 h-3" /> 删除
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
      <p class="mt-2 text-[10px] text-slate-300">双击卡片可直接编辑；手动新增的路径同样参与推演</p>
    </div>
  </div>
</template>

<script setup>
import { onMounted, reactive, ref, watch, computed } from 'vue'
import { Loader2, Plus, Trash2, Crosshair } from 'lucide-vue-next'
import { lifeApi } from '../../utils/api'
import { toast } from '../../utils/toast'
import LifePathForm from './LifePathForm.vue'

const props = defineProps({ refreshToken: { type: Number, default: 0 } })
const emit = defineEmits(['changed', 'focus-path'])

const DIM_KEYS = ['hardSkills', 'timeHabits', 'traits', 'resources', 'valuesPref', 'risks']

const persona = ref({})
const dims = ref([
  { key: 'hardSkills', label: '硬能力', hint: '语言能力、专业技术、其他技能、证明材料、能力成长曲线（有客观依据、可量化）' },
  { key: 'timeHabits', label: '时间与行为习惯', hint: '可用时段、任务履约特征、耐力指标、拖延模式、偏好（由打卡数据自动统计）' },
  { key: 'traits', label: '性格与心智特质', hint: '风险偏好、目标倾向性、抗压能力、决策特点、执行力（由对话 + 行为客观推断）' },
  { key: 'resources', label: '资源', hint: '资金状况、硬件资源、人脉资源、地域约束' },
  { key: 'valuesPref', label: '目标价值偏好', hint: '优先级排序、取舍倾向、生活诉求' },
  { key: 'risks', label: '风险与短板', hint: '薄弱能力项、行为短板、外部风险（预警用）' }
])
const paths = ref([])
const stats = ref(null)
const loading = ref(true)
const busy = ref(false)
const editingDim = ref('')
const dimDraft = ref('')
// 动态画像：7 维由后端按右侧规划的完成度实时反推，只读展示
const derived = ref({})
const derivedDims = ref([])
const derivedAt = ref(0)
const deriving = ref(false)
const pathDraft = reactive({ open: false, id: '', name: '', score: 0, advantages: '', risks: '', prerequisites: '', evolution: '', nodeId: '' })

const filledDims = computed(() => DIM_KEYS.filter(key => String(persona.value[key] || '').trim()).length)

// 动态画像某一维的条目：后端按行拼接，这里按行拆开展示
function derivedLines(key) {
  return String(derived.value?.[key] || '').split(/\r?\n/).map(line => line.trim()).filter(Boolean)
}
const derivedAtText = computed(() => {
  const at = Number(derivedAt.value) || 0
  if (!at) return ''
  const d = new Date(at)
  const pad = value => String(value).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`
})

function failText(err) {
  return err?.response?.data?.error || err?.message || '操作失败'
}

// 画像内容按行 / 分号切开，一条一条展示，避免一大段文字糊在一起看不清
function lines(value) {
  return String(value || '')
    .split(/[\n；;]+/)
    .map(v => v.trim().replace(/^[·•\-\s]+/, ''))
    .filter(Boolean)
}

function scoreClass(score) {
  const value = Number(score) || 0
  if (value >= 80) return 'border-emerald-200 bg-emerald-50 text-emerald-600'
  if (value >= 70) return 'border-indigo-200 bg-indigo-50 text-indigo-600'
  if (value >= 60) return 'border-amber-200 bg-amber-50 text-amber-600'
  return 'border-slate-200 bg-slate-50 text-slate-500'
}

// 时间与行为习惯维度：系统自动从每日任务数据统计，不需要用户手填
async function loadStats() {
  try {
    const result = await lifeApi.getTasks()
    const tasks = result.tasks || result.items || []
    if (!tasks.length) { stats.value = null; return }
    const today = new Date()
    const pad = value => String(value).padStart(2, '0')
    const todayKey = `${today.getFullYear()}-${pad(today.getMonth() + 1)}-${pad(today.getDate())}`
    const weekAgo = new Date(today.getTime() - 6 * 24 * 3600 * 1000)
    const weekKey = `${weekAgo.getFullYear()}-${pad(weekAgo.getMonth() + 1)}-${pad(weekAgo.getDate())}`
    const done = tasks.filter(t => t.status === 'done').length
    const week = tasks.filter(t => String(t.date || '') >= weekKey)
    const weekDone = week.filter(t => t.status === 'done').length
    const overdue = tasks.filter(t => t.status !== 'done' && String(t.date || '') < todayKey).length
    const drop = tasks.filter(t => t.status === 'drop').length
    stats.value = {
      total: tasks.length,
      doneRate: Math.round((done / tasks.length) * 100),
      weekRate: week.length ? Math.round((weekDone / week.length) * 100) : 0,
      overdue,
      dropRate: Math.round((drop / tasks.length) * 100)
    }
  } catch (err) {
    stats.value = null
  }
}

async function load() {
  loading.value = true
  try {
    const [personaResult, pathResult] = await Promise.all([
      lifeApi.getPersona().catch(() => ({})),
      lifeApi.getPaths().catch(() => ({}))
    ])
    persona.value = personaResult.persona || {}
    if (Array.isArray(personaResult.dims) && personaResult.dims.length) dims.value = personaResult.dims
    paths.value = pathResult.items || []
    derived.value = personaResult.derived || {}
    derivedAt.value = Number(personaResult.derived?.updatedAt) || 0
    if (Array.isArray(personaResult.derivedDims) && personaResult.derivedDims.length) derivedDims.value = personaResult.derivedDims
    await loadStats()
  } finally {
    loading.value = false
  }
}

// 手动触发一次动态画像重算（按当前完成度），算完即刷新展示
async function refreshDerived() {
  if (deriving.value) return
  deriving.value = true
  try {
    const result = await lifeApi.refreshPersonaDerived('画像面板')
    derived.value = result.derived || derived.value
    derivedAt.value = Number(result.derived?.updatedAt) || derivedAt.value
    if (Array.isArray(result.derivedDims) && result.derivedDims.length) derivedDims.value = result.derivedDims
    emit('changed')
    toast.success('动态画像已按最新完成度重算')
  } catch (err) {
    toast.error(failText(err))
  } finally {
    deriving.value = false
  }
}

function startDimEdit(key) {
  editingDim.value = key
  dimDraft.value = String(persona.value[key] || '')
}

const dimEditPlaceholder = computed(() => {
  const dim = dims.value.find(item => item.key === editingDim.value)
  return dim ? `一行一条，写清具体事实。例如：${dim.hint}` : '一行一条'
})

async function saveDim(key) {
  if (busy.value) return
  busy.value = true
  try {
    const result = await lifeApi.savePersona({ [key]: dimDraft.value.trim() })
    persona.value = result.persona || persona.value
    editingDim.value = ''
    emit('changed')
    toast.success('画像已更新')
  } catch (err) {
    toast.error(failText(err))
  } finally {
    busy.value = false
  }
}

function startPathCreate() {
  Object.assign(pathDraft, { open: true, id: '', name: '', score: 60, advantages: '', risks: '', prerequisites: '', evolution: '', nodeId: '' })
}

function startPathEdit(path) {
  Object.assign(pathDraft, {
    open: true,
    id: path.id,
    name: path.name || '',
    score: Number(path.score) || 0,
    advantages: path.advantages || '',
    risks: path.risks || '',
    prerequisites: path.prerequisites || '',
    evolution: path.evolution || '',
    nodeId: path.nodeId || ''
  })
}

async function savePath() {
  if (busy.value || !String(pathDraft.name || '').trim()) return
  busy.value = true
  try {
    const payload = {
      name: pathDraft.name.trim(),
      score: Math.max(0, Math.min(100, Math.round(Number(pathDraft.score) || 0))),
      advantages: pathDraft.advantages,
      risks: pathDraft.risks,
      prerequisites: pathDraft.prerequisites,
      evolution: pathDraft.evolution,
      nodeId: pathDraft.nodeId
    }
    const result = pathDraft.id
      ? await lifeApi.updatePath(pathDraft.id, payload)
      : await lifeApi.createPath(payload)
    paths.value = result.items || []
    pathDraft.open = false
    emit('changed')
    toast.success(pathDraft.id ? '路径已更新' : '路径已新增')
  } catch (err) {
    toast.error(failText(err))
  } finally {
    busy.value = false
  }
}

async function removePath(path) {
  if (busy.value) return
  if (!window.confirm(`删除路径「${path.name}」？`)) return
  busy.value = true
  try {
    const result = await lifeApi.deletePath(path.id)
    paths.value = result.items || []
    if (pathDraft.id === path.id) pathDraft.open = false
    emit('changed')
    toast.success('路径已删除')
  } catch (err) {
    toast.error(failText(err))
  } finally {
    busy.value = false
  }
}

// 点「看推演子图」：把右侧规划网络定位到这条路径对应的子图根节点
function focusPath(path) {
  if (!path.nodeId) {
    toast.info('这条路径还没有对应的推演子图，先在对话里让 AI 展开')
    return
  }
  emit('focus-path', path.nodeId)
}

watch(() => props.refreshToken, load)
onMounted(load)
</script>
