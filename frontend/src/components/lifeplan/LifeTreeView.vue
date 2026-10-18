<template>
  <div class="space-y-3">
    <div class="flex items-center justify-between gap-3 flex-wrap">
      <div class="flex items-center gap-4 text-xs text-slate-500">
        <span>推演节点 <b class="text-slate-700">{{ total }}</b> 个</span>
        <span>推演分支 <b class="text-indigo-600">{{ branches.length }}</b> 条</span>
      </div>
      <div class="flex items-center gap-1 flex-wrap">
        <button
          type="button"
          class="px-2.5 h-7 rounded-md border text-[11px] font-medium transition-colors"
          :class="filter === '' ? 'border-indigo-200 bg-indigo-50 text-indigo-600' : 'border-slate-200 text-slate-500 hover:border-slate-300'"
          @click="filter = ''"
        >全部分支</button>
        <button
          v-for="branch in branches"
          :key="branch.key"
          type="button"
          class="px-2.5 h-7 rounded-md border text-[11px] font-medium transition-colors"
          :class="filter === branch.key ? 'border-indigo-200 bg-indigo-50 text-indigo-600' : 'border-slate-200 text-slate-500 hover:border-slate-300'"
          @click="filter = branch.key"
        >{{ branch.name }}</button>
      </div>
    </div>

    <p class="text-[11px] leading-relaxed text-slate-400">
      这里是「多结局分支推演」：任何目标（考公、毕设、找实习、发帖、理财）都会自动推演出若干条结局分支，
      每条分支再往下递归推演连锁影响与衍生任务。卡片上的「已具备 / 待承接」取自它的前置任务是否完成，和「每日任务」面板共用同一份数据。
    </p>

    <div v-if="loading" class="flex items-center gap-2 rounded-xl border border-slate-100 bg-white px-3 py-4 text-xs text-slate-400">
      <Loader2 class="w-4 h-4 animate-spin" /> 正在整理推演链…
    </div>

    <div v-else-if="!total" class="rounded-xl border border-slate-100 bg-white px-4 py-8 text-center">
      <GitBranch class="mx-auto mb-2 w-6 h-6 text-slate-300" />
      <p class="text-sm text-slate-500">还没有推演分支</p>
      <p class="mt-1 text-[11px] leading-relaxed text-slate-400">
        在左侧对话里说出任意目标（例如「我要做完毕设」「每天在得物发帖」），AI 会自动推演多条结局分支并落到这里。
      </p>
    </div>

    <div v-else class="overflow-x-auto rounded-xl border border-slate-100 bg-white p-2">
      <svg :viewBox="`0 0 ${canvasW} ${canvasH}`" :style="{ minWidth: `${Math.round(canvasW * 0.62)}px` }" class="w-full" preserveAspectRatio="xMidYMid meet">
        <defs>
          <marker id="lifeTreeArrow" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="5" markerHeight="5" orient="auto">
            <path d="M 0 0 L 10 5 L 0 10 z" fill="#94a3b8" />
          </marker>
        </defs>

        <g v-for="lane in lanes" :key="lane.key">
          <!-- 分支泳道底 -->
          <rect :x="lane.x" y="8" :width="LANE_W" :height="canvasH - 16" rx="16" :fill="lane.tint" fill-opacity="0.6" :stroke="lane.stroke" />

          <!-- 分支标题：分支名 + 该分支的起点说明（起点节点不再重复渲染成卡片） -->
          <text :x="lane.x + 16" y="30" class="tree-lane-title">{{ lane.name }}</text>
          <text :x="lane.x + 16" y="48" class="tree-lane-sub">{{ lane.summary }}</text>

          <!-- 连线：同一条分支内自上而下的推演步骤 -->
          <path
            v-for="link in lane.links"
            :key="link.id"
            :d="link.d"
            fill="none"
            :stroke="lane.stroke"
            stroke-width="1.4"
            stroke-opacity="0.65"
            marker-end="url(#lifeTreeArrow)"
          />

          <!-- 若有分支没有衍生步骤，给一行提示 -->
          <text v-if="!lane.cards.length" :x="lane.x + 16" y="82" class="tree-card-sub">该分支暂无衍生步骤，继续对话可自动补充</text>

          <!-- 节点卡片：只渲染衍生步骤，避免和分支标题重复 -->
          <g v-for="card in lane.cards" :key="card.id">
            <rect :x="card.x" :y="card.y" :width="CARD_W" :height="CARD_H" rx="12" :fill="card.fill" :stroke="lane.stroke" stroke-width="1" />
            <text :x="card.x + 12" :y="card.y + 20" class="tree-card-title">{{ card.title }}</text>
            <text :x="card.x + 12" :y="card.y + 37" class="tree-card-sub">{{ card.sub }}</text>
            <text :x="card.x + 12" :y="card.y + 54" class="tree-card-tag" :fill="card.ready ? '#059669' : '#94a3b8'">
              {{ card.ready ? '已具备' : '待承接' }}{{ card.horizon ? ` · ${card.horizon}` : '' }}
            </text>
          </g>
        </g>
      </svg>
    </div>

    <p v-if="total" class="text-[11px] text-slate-400">
      勾选「每日任务」里的上游任务后，这里的「待承接」会自动变成「已具备」；随着对话增多，新的结局分支会自动补进这张图。
    </p>
  </div>
</template>

<script setup>
import { computed, onMounted, ref, watch } from 'vue'
import { GitBranch, Loader2 } from 'lucide-vue-next'

const props = defineProps({
  nodes: { type: Array, default: () => [] },
  dailyTasks: { type: Array, default: () => [] },
  refreshToken: { type: Number, default: 0 }
})

const LANE_PAD = 16
const MIN_LANE_W = 300
const CARD_GAP = 20
const CARD_H = 62
const TOP = 72
// 分支色调轮转：每条分支一个淡色，避免所有分支撞色
const TINTS = [
  { fill: '#ecfdf5', stroke: '#6ee7b7', tint: '#ecfdf5' },
  { fill: '#fffbeb', stroke: '#fcd34d', tint: '#fffbeb' },
  { fill: '#eff6ff', stroke: '#93c5fd', tint: '#eff6ff' },
  { fill: '#fdf4ff', stroke: '#f0abfc', tint: '#fdf4ff' }
]

const loading = ref(false)
const filter = ref('')

// 长期推演节点：里程碑类节点，或一年以后的节点
function isFuture(node) {
  if (node?.kind === 'milestone') return true
  const match = /(\d{4})-(\d{2})-(\d{2})/.exec(String(node?.horizon || ''))
  if (!match) return false
  const target = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3])).getTime()
  return (target - Date.now()) / 86400000 > 365
}

function stepOf(node) {
  const value = Number(node?.stepNo)
  return Number.isFinite(value) && value > 0 ? value : 999
}
function truncate(text, max) {
  const str = String(text || '')
  return str.length > max ? str.slice(0, max) + '…' : str
}

// 分支短名：剥掉「上岸成功-」「未来生活画像」这类重复前后缀，避免标题里出现两遍同样的字
function branchName(node) {
  const raw = String(node?.title || '').trim()
  const win = /达成|上岸|成功|offer/i.test(raw)
  const cleaned = raw
    .replace(/(目标达成|上岸成功|上岸|成功|目标失利|失利备选|失利|失败|兜底)/g, '')
    .replace(/(未来生活画像|生活画像|备选路线|兜底路线|兜底备选路线)/g, '')
    .replace(/[-—·:：\s（()]+/g, ' ')
    .trim()
  return cleaned || (win ? '目标达成' : '目标失利')
}

const futureNodes = computed(() => props.nodes.filter(isFuture))

// 分支根：没有被其他推演节点当成前置/父级的里程碑节点
const roots = computed(() => {
  const list = futureNodes.value
  const referenced = new Set()
  for (const node of list) {
    for (const ref of node.deps || []) referenced.add(String(ref))
    if (node.parentId) referenced.add(String(node.parentId))
  }
  const found = list.filter(node => !referenced.has(String(node.id)))
  return found.length ? found : list.slice(0, 1)
})

const branches = computed(() => {
  const all = futureNodes.value
  const result = []
  const claimed = new Set()
  for (const root of roots.value) {
    // 顺着依赖把该分支的下游节点全部收集进来
    const owned = [root]
    claimed.add(String(root.id))
    let grew = true
    while (grew) {
      grew = false
      for (const node of all) {
        if (claimed.has(String(node.id))) continue
        const refs = [...(node.deps || []), node.parentId].filter(Boolean).map(String)
        if (refs.some(ref => claimed.has(ref))) {
          claimed.add(String(node.id))
          owned.push(node)
          grew = true
        }
      }
    }
    const children = owned.slice(1).sort((a, b) => stepOf(a) - stepOf(b) || (Number(a.createdAt) || 0) - (Number(b.createdAt) || 0))
    result.push({ key: String(root.id), root, children, name: branchName(root) })
  }
  // 没被任何分支收走的节点，单独成一条分支，避免丢数据
  const orphan = all.filter(node => !claimed.has(String(node.id)))
  if (orphan.length) result.push({ key: 'orphan', root: orphan[0], children: orphan.slice(1), name: '其他推演' })
  return result
})

const total = computed(() => futureNodes.value.length)

const visibleBranches = computed(() => (filter.value ? branches.value.filter(b => b.key === filter.value) : branches.value))

const laneCount = computed(() => Math.max(1, visibleBranches.value.length))
const LANE_W = computed(() => Math.max(MIN_LANE_W, Math.round((visibleBranches.value.reduce((sum, b) => sum + Math.max(b.children.length, 1), 0) / laneCount.value) * 96 + 60)))
const CARD_W = computed(() => LANE_W.value - 32)
const canvasW = computed(() => LANE_PAD + laneCount.value * (LANE_W.value + LANE_PAD))
const canvasH = computed(() => TOP + Math.max(1, ...visibleBranches.value.map(b => b.children.length)) * (CARD_H + CARD_GAP) + 20)

// 前置任务是否已具备：先看规划节点自身状态，再看同名每日任务是否已完成
function upstreamReady(node) {
  const refs = node.deps || []
  if (!refs.length) return true
  return refs.every(ref => {
    const upstream = props.nodes.find(item => item.id === ref)
    if (upstream?.status === 'done') return true
    const title = String(upstream?.title || '').trim()
    if (!title) return false
    const task = props.dailyTasks.find(item => String(item.title || '').trim() === title)
    return task?.status === 'done'
  })
}

const lanes = computed(() =>
  visibleBranches.value.map((branch, index) => {
    const tint = TINTS[index % TINTS.length]
    const x = LANE_PAD + index * (LANE_W.value + LANE_PAD)
    const cards = branch.children.map((node, i) => ({
      id: node.id,
      x: x + 16,
      y: TOP + i * (CARD_H + CARD_GAP),
      ready: upstreamReady(node),
      fill: tint.fill,
      horizon: node.horizon || '',
      title: `${Number(node.stepNo) > 0 ? `#${node.stepNo}｜` : ''}${truncate(node.title, 14)}`,
      sub: truncate(node.detail || '暂无细节描述', 26)
    }))
    const links = []
    for (let i = 0; i < cards.length - 1; i += 1) {
      const from = cards[i]
      const to = cards[i + 1]
      const cx = from.x + CARD_W.value / 2
      links.push({ id: `${from.id}>${to.id}`, d: `M ${cx} ${from.y + CARD_H} L ${cx} ${to.y}` })
    }
    return {
      key: branch.key,
      x,
      tint: tint.tint,
      stroke: tint.stroke,
      name: `路线${String.fromCharCode(65 + index)} · ${branch.name}`,
      summary: truncate(branch.root.detail || '该分支暂无说明', 18),
      cards,
      links
    }
  })
)

async function load() {
  loading.value = true
  // 数据由父组件下传，这里只做一次短暂的整理态展示，避免切换 Tab 时闪白
  await new Promise(resolve => setTimeout(resolve, 120))
  loading.value = false
}

onMounted(load)
watch(() => props.refreshToken, load)
</script>

<style scoped>
.tree-lane-title {
  font-size: 12px;
  font-weight: 600;
  fill: #334155;
}
.tree-lane-sub {
  font-size: 10.5px;
  fill: #64748b;
}
.tree-card-title {
  font-size: 12px;
  font-weight: 600;
  fill: #334155;
}
.tree-card-sub {
  font-size: 10.5px;
  fill: #64748b;
}
.tree-card-tag {
  font-size: 10px;
  font-weight: 600;
}
</style>
