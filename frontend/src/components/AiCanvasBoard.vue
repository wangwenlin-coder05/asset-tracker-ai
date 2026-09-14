<template>
  <div class="ai-canvas-board">
    <!-- 顶部工具栏 -->
    <div class="canvas-toolbar">
      <div class="toolbar-left">
        <button class="tb-btn primary" @click="addNode('prompt')">
          <span class="tb-ic">💬</span> 提示词
        </button>
        <button class="tb-btn" @click="addNode('image')">
          <span class="tb-ic">🖼️</span> 图片
        </button>
        <button class="tb-btn" @click="addNode('ref')">
          <span class="tb-ic">📎</span> 参考
        </button>
        <button class="tb-btn" @click="addNode('video')">
          <span class="tb-ic">🎬</span> 视频
        </button>
        <div class="tb-divider"></div>
        <button class="tb-btn" @click="undo" :disabled="!canUndo" title="撤销 (Ctrl+Z)">↶</button>
        <button class="tb-btn" @click="redo" :disabled="!canRedo" title="重做 (Ctrl+Shift+Z / Ctrl+Y)">↷</button>
        <button class="tb-btn danger-ghost" @click="clearAll" title="清空画布">🗑️</button>
      </div>

      <div class="toolbar-center">
        <span class="workspace-name">{{ workspaceName }}</span>
        <span class="workspace-stat" v-if="nodes.length || edges.length">
          {{ nodes.length }} 节点 · {{ edges.length }} 连线
        </span>
      </div>

      <div class="toolbar-right">
        <button class="tb-btn" @click="fitView" title="适配视图 (0)">⊡</button>
        <button class="tb-btn" @click="zoomIn" title="放大">+</button>
        <span class="tb-zoom-label">{{ Math.round(viewport.zoom * 100) }}%</span>
        <button class="tb-btn" @click="zoomOut" title="缩小">−</button>
        <div class="tb-divider"></div>
        <button class="tb-btn" @click="exportJson" title="导出 JSON">⬇️</button>
        <button class="tb-btn" @click="triggerImport" title="导入 JSON">⬆️</button>
        <input ref="importInputRef" type="file" accept=".json" class="hidden" @change="onImport" />
      </div>
    </div>

    <!-- 画布主区域 -->
    <div class="canvas-main">
      <VueFlow
        v-model:nodes="nodes"
        v-model:edges="edges"
        v-model:viewport="viewport"
        :node-types="nodeTypes"
        :default-edge-options="defaultEdgeOptions"
        :connect-on-click="false"
        :snap-to-grid="true"
        :snap-grid="[15, 15]"
        :fit-view-on-init="true"
        :fit-view-options="{ padding: 0.3 }"
        :edges-updatable="['source','target']"
        :edges-focusable="true"
        class="vue-flow-root"
        @node-click="onNodeClick"
        @pane-click="onPaneClick"
        @connect="onConnect"
        @connect-start="onConnectStart"
        @edges-change="onEdgesChange"
        @nodes-change="onNodesChange"
        @node-dblclick="onNodeDblClick"
        @node-drag-start="onNodeDragStart"
        @node-drag-stop="onNodeDragStop"
        @edge-click="onEdgeClick"
        @edge-dblclick="onEdgeDblClick"
        @edge-contextmenu="onEdgeContextMenu"
      >
        <!-- 背景网格 -->
        <Background :gap="20" :size="1" color="#2a2f42" pattern-color="#2a2f42" />

        <!-- 自定义 edge 渲染：让选中/hover 时加动画 -->
        <template #edge-default="props">
          <Edge
            :id="props.id"
            :source="props.source"
            :target="props.target"
            :source-handle="props.sourceHandle"
            :target-handle="props.targetHandle"
            :type="props.type"
            :animated="isEdgeHighlighted(props)"
            :marker-end="props.markerEnd"
            :class="{ 'edge-selected': selectedEdgeId === props.id }"
          />
        </template>

        <!-- 控制点 & 小地图 -->
        <Controls :show-interactive="false" position="bottom-right" class="canvas-controls" />
        <MiniMap :pannable="true" :zoomable="true" node-color="#6366f1" mask-color="rgba(15,18,25,0.7)" class="canvas-minimap" />
      </VueFlow>

      <!-- 空画布引导态 -->
      <div v-if="nodes.length === 0" class="empty-hint">
        <div class="empty-grid">
          <button class="empty-card" @click="addNode('prompt')"><span class="empty-emoji">💬</span><span>提示词</span></button>
          <button class="empty-card" @click="addNode('image')"><span class="empty-emoji">🖼️</span><span>图片</span></button>
          <button class="empty-card" @click="addNode('ref')"><span class="empty-emoji">📎</span><span>参考</span></button>
          <button class="empty-card" @click="addNode('video')"><span class="empty-emoji">🎬</span><span>视频</span></button>
        </div>
        <p class="empty-tip">点击上方节点 / 右键画布 / 直接连线 · Del 删选中 · Ctrl+Z 撤销</p>
      </div>

      <!-- 右键菜单（画布） -->
      <Teleport to="body">
        <div
          v-if="contextMenu.show"
          class="context-menu"
          :style="{ left: contextMenu.x + 'px', top: contextMenu.y + 'px' }"
        >
          <button class="cm-item" @click="addAt('prompt')">💬 提示词节点</button>
          <button class="cm-item" @click="addAt('image')">🖼️ 图片节点</button>
          <button class="cm-item" @click="addAt('ref')">📎 参考节点</button>
          <button class="cm-item" @click="addAt('video')">🎬 视频节点</button>
          <div class="cm-divider"></div>
          <button class="cm-item" @click="zoomIn">🔍 放大</button>
          <button class="cm-item" @click="zoomOut">🔎 缩小</button>
          <button class="cm-item" @click="fitView">⊡ 适配</button>
          <div class="cm-divider"></div>
          <button class="cm-item danger" @click="clearAll">🗑️ 清空画布</button>
        </div>
      </Teleport>

      <!-- 选中节点 → 右侧属性面板（带过渡） -->
      <Transition name="slide-right">
        <div v-if="selectedNode" class="property-panel">
          <div class="pp-header">
            <span class="pp-title">节点属性</span>
            <button class="pp-close" @click="deselectNode" title="关闭 (Esc)">×</button>
          </div>
          <div class="pp-body">
            <div class="pp-row">
              <label>节点名称</label>
              <input v-model="selectedNode.data.label" class="pp-input" @input="saveNodeData" />
            </div>
            <template v-if="selectedNode.type === 'image'">
              <div class="pp-row-2">
                <div class="pp-cell">
                  <label>宽度</label>
                  <input type="number" v-model.number="selectedNode.data.width" class="pp-input" @input="saveNodeData" />
                </div>
                <div class="pp-cell">
                  <label>高度</label>
                  <input type="number" v-model.number="selectedNode.data.height" class="pp-input" @input="saveNodeData" />
                </div>
              </div>
            </template>
            <template v-if="selectedNode.type === 'ref'">
              <div class="pp-row">
                <label>参考强度 {{ selectedNode.data.strength ?? 70 }}%</label>
                <input type="range" min="0" max="100" :value="selectedNode.data.strength ?? 70" class="pp-range"
                  @input="(e) => { selectedNode.data.strength = Number(e.target.value); saveNodeData() }" />
              </div>
            </template>
            <template v-if="selectedNode.type === 'prompt'">
              <div class="pp-row">
                <label>提示词内容</label>
                <textarea
                  v-model="selectedNode.data.content"
                  class="pp-textarea"
                  rows="6"
                  placeholder="输入提示词…"
                  @input="saveNodeData"
                ></textarea>
              </div>
            </template>
            <template v-if="selectedNode.type === 'video'">
              <div class="pp-row-2">
                <div class="pp-cell">
                  <label>时长 (秒)</label>
                  <input type="number" min="1" v-model.number="selectedNode.data.durationSec" class="pp-input" @input="saveNodeData" />
                </div>
                <div class="pp-cell">
                  <label>分辨率</label>
                  <input v-model="selectedNode.data.resolution" class="pp-input" @input="saveNodeData" />
                </div>
              </div>
            </template>

            <div v-if="connectedSources.length" class="pp-related">
              <div class="pp-related-title">🔗 上游素材（{{ connectedSources.length }}）</div>
              <div class="pp-related-list">
                <span v-for="s in connectedSources" :key="s.id" class="pp-related-chip">{{ s.data.label || s.type }}</span>
              </div>
              <div v-if="upstreamPromptText" class="pp-prompt-peek">
                {{ upstreamPromptText.slice(0, 120) }}{{ upstreamPromptText.length > 120 ? '…' : '' }}
              </div>
            </div>

            <div class="pp-actions">
              <button class="btn-danger" @click="deleteSelected">删除节点 (Del)</button>
            </div>
          </div>
        </div>
      </Transition>
    </div>

    <!-- 底部生成面板 -->
    <div class="gen-panel">
      <div class="gen-left">
        <select v-model="genModel" class="gen-model">
          <option value="seedream">Seedream（文生图）</option>
          <option value="seedance">Seedance（图生视频）</option>
          <option value="flux">Flux</option>
          <option value="sdxl">SDXL</option>
          <option value="kling">可灵（视频）</option>
          <option value="runway">Runway（视频）</option>
        </select>
        <select v-if="isImageModel" v-model="genRatio" class="gen-select">
          <option value="1:1">1:1 方图</option>
          <option value="16:9">16:9 横屏</option>
          <option value="9:16">9:16 竖屏</option>
          <option value="4:3">4:3</option>
        </select>
        <select v-if="isVideoModel" v-model="genDuration" class="gen-select">
          <option value="5">5秒</option>
          <option value="10">10秒</option>
        </select>
        <button class="tb-btn ghost" :title="connectedSources.length ? `已连 ${connectedSources.length} 个上游节点` : '点击选中一个图片/视频节点作为生成目标'">
          📥 素材 <span class="chip">{{ connectedSources.length }}</span>
        </button>
      </div>
      <div class="gen-prompt">
        <input
          v-model="genPrompt"
          type="text"
          class="gen-input"
          :placeholder="genPlaceholder"
          @keydown.enter.prevent="doGenerate"
        />
        <div v-if="upstreamPromptText" class="gen-prompt-tip">
          已合并 <span class="upstream-badge">{{ connectedSources.filter(n => n.type === 'prompt').length }}</span> 个上游提示词
        </div>
      </div>
      <div class="gen-right">
        <button class="gen-btn" :disabled="generating" @click="doGenerate">
          <span v-if="generating" class="gen-spinner"></span>
          {{ generating ? '生成中…' : '✨ 生成' }}
        </button>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, reactive, computed, onMounted, onBeforeUnmount, shallowRef, nextTick } from 'vue'
import { VueFlow, useVueFlow } from '@vue-flow/core'
import { Background } from '@vue-flow/background'
import { Controls } from '@vue-flow/controls'
import { MiniMap } from '@vue-flow/minimap'
import '@vue-flow/core/dist/style.css'
import '@vue-flow/core/dist/theme-default.css'
import '@vue-flow/controls/dist/style.css'
import '@vue-flow/minimap/dist/style.css'

import ImageNode from './ai-canvas/nodes/ImageNode.vue'
import VideoNode from './ai-canvas/nodes/VideoNode.vue'
import PromptNode from './ai-canvas/nodes/PromptNode.vue'
import RefNode from './ai-canvas/nodes/RefNode.vue'

// ====== VueFlow ======
const {
  addNodes,
  addEdges,
  fitView: _fitView,
  getViewport,
  setViewport,
  findNode,
  applyNodeChanges,
  applyEdgeChanges,
  deleteElements,
  getIncomingEdges
} = useVueFlow({})

const nodeTypes = {
  image: shallowRef(ImageNode),
  video: shallowRef(VideoNode),
  prompt: shallowRef(PromptNode),
  ref: shallowRef(RefNode)
}

const nodes = ref([])
const edges = ref([])
const viewport = ref({ x: 0, y: 0, zoom: 1 })

// 默认关闭连线动画（减少视觉噪音）
const defaultEdgeOptions = { type: 'smoothstep', animated: false }

// ====== 画布状态 ======
const workspaceName = ref('未命名工作区')
const selectedNodeId = ref(null)
const selectedEdgeId = ref(null)
const selectedNode = computed(() => nodes.value.find(n => n.id === selectedNodeId.value))

// ====== 选中 ======
function onNodeClick(event, node) {
  selectedNodeId.value = node.id
  selectedEdgeId.value = null
  applyNodeChanges(nodes.value.filter(n => n.id !== node.id).map(n => ({ id: n.id, type: 'select', selected: false })))
  applyNodeChanges([{ id: node.id, type: 'select', selected: true }])
}
function onEdgeClick(event, edge) {
  selectedEdgeId.value = edge.id
  selectedNodeId.value = null
}
function onPaneClick() {
  selectedNodeId.value = null
  selectedEdgeId.value = null
  applyNodeChanges(nodes.value.map(n => ({ id: n.id, type: 'select', selected: false })))
}
function onNodeDblClick(event, node) {
  if (node.type === 'prompt') {
    const n = nodes.value.find(nn => nn.id === node.id)
    if (n) n.data = { ...n.data, _editTrigger: Date.now() }
  }
}

// ====== 变更管道 ======
function onNodesChange(changes) { applyNodeChanges(changes) }
function onEdgesChange(changes) {
  const removals = changes.filter(c => c.type === 'remove')
  if (removals.length > 0) {
    applyEdgeChanges(changes)
    pushHistory()
    if (selectedEdgeId.value && removals.some(r => r.id === selectedEdgeId.value)) selectedEdgeId.value = null
    return
  }
  applyEdgeChanges(changes)
}

// 当前选中边是否高亮（驱动连线动画）
function isEdgeHighlighted(props) {
  if (selectedEdgeId.value === props.id) return true
  // 鼠标 hover 时也可高亮 — 留个口，先简化
  return false
}

// ====== 连线（防自环 + 防重复 + pushHistory） ======
function onConnectStart() { /* 预留：后续做方向预览 */ }
function onConnect(params) {
  if (params.source === params.target) return
  const exists = edges.value.some(e => e.source === params.source && e.target === params.target)
  if (exists) return
  addEdges({
    id: `e_${params.source}_${params.target}_${Date.now()}`,
    source: params.source,
    target: params.target,
    sourceHandle: params.sourceHandle,
    targetHandle: params.targetHandle,
    type: 'smoothstep',
    animated: false
  })
  pushHistory()
}
function onEdgeDblClick(event, edge) {
  event.stopPropagation()
  deleteElements({ edges: [{ id: edge.id }] })
  selectedEdgeId.value = null
  pushHistory()
}
function onEdgeContextMenu(event, edge) {
  event.preventDefault()
  event.stopPropagation()
  deleteElements({ edges: [{ id: edge.id }] })
  selectedEdgeId.value = null
  pushHistory()
}

// ====== 拖拽 → history ======
let _dragStartSnapshot = null
function onNodeDragStart() { _dragStartSnapshot = snapshot() }
function onNodeDragStop() {
  if (!_dragStartSnapshot) return
  const startNodes = _dragStartSnapshot.nodes
  const endNodes = snapshot().nodes
  const moved = endNodes.some((en, i) => {
    const sn = startNodes[i]
    return sn && (sn.position.x !== en.position.x || sn.position.y !== en.position.y)
  })
  if (moved) pushHistory()
  _dragStartSnapshot = null
}

// ====== 节点创建 / 删除 ======
let _id = 0
function genId(prefix) { return `${prefix}_${Date.now()}_${++_id}` }

// 给子节点用的回调工厂 —— 所有动态创建的节点 data 都会带上 callbacks
function makeNodeCallbacks(nodeId) {
  return {
    onCopy: () => onNodeCopy(nodeId),
    onDelete: () => onNodeDelete(nodeId),
    onExpand: () => {
      // 唤起 PromptNode 编辑 / 选中该节点
      const n = nodes.value.find(nn => nn.id === nodeId)
      if (n) {
        selectedNodeId.value = nodeId
        applyNodeChanges([{ id: nodeId, type: 'select', selected: true }])
        if (n.type === 'prompt') n.data = { ...n.data, _editTrigger: Date.now() }
      }
    },
    onUpdateData: (patch) => {
      const n = nodes.value.find(nn => nn.id === nodeId)
      if (!n) return
      // merge patch（保留原有 callbacks / 不被覆盖）
      const merged = { ...n.data, ...patch }
      // 确保 callbacks 不丢
      merged.callbacks = n.data.callbacks
      n.data = merged
      // 上传图片 / 视频属于数据变更 —— 记入 history
      if (patch.imageUrl || patch.videoUrl || patch.content !== undefined) pushHistory()
    }
  }
}

const nodeTypeMeta = {
  prompt: { width: 260, data: (id) => ({ label: '提示词', content: '', width: 260, callbacks: makeNodeCallbacks(id) }) },
  image:  { width: 200, data: (id) => ({ label: '图片节点', imageUrl: '', width: 200, height: 200, status: 'pending', callbacks: makeNodeCallbacks(id) }) },
  ref:    { width: 180, data: (id) => ({ label: '参考图', imageUrl: '', width: 180, strength: 70, callbacks: makeNodeCallbacks(id) }) },
  video:  { width: 260, data: (id) => ({ label: '视频节点', videoUrl: '', width: 260, duration: '0:00', resolution: '1080p', progress: 0, status: 'pending', durationSec: 5, callbacks: makeNodeCallbacks(id) }) }
}

function addNode(type) {
  const meta = nodeTypeMeta[type]
  if (!meta) return
  const vp = getViewport()
  const container = document.querySelector('.canvas-main')
  const cw = container?.clientWidth || 800
  const ch = container?.clientHeight || 600
  const centerX = (-vp.x + cw / 2) / vp.zoom - meta.width / 2
  const centerY = (-vp.y + ch / 2) / vp.zoom - 100
  const id = genId(type)
  const newNode = {
    id,
    type,
    position: {
      x: centerX + ((nodes.value.length * 30) % 200) - 100,
      y: centerY + ((nodes.value.length * 20) % 150)
    },
    data: meta.data(id)
  }
  addNodes([newNode])
  pushHistory()
  nextTick(() => {
    selectedNodeId.value = newNode.id
    applyNodeChanges([{ id: newNode.id, type: 'select', selected: true }])
  })
}

function addAt(type) {
  const meta = nodeTypeMeta[type]
  const p = clientToFlow(contextMenu.x, contextMenu.y)
  const id = genId(type)
  addNodes([{
    id,
    type,
    position: { x: p.x - meta.width / 2, y: p.y - 60 },
    data: meta.data(id)
  }])
  contextMenu.show = false
  pushHistory()
}

function clientToFlow(cx, cy) {
  const vp = getViewport()
  const container = document.querySelector('.canvas-main')
  const rect = container?.getBoundingClientRect()
  const ox = rect ? cx - rect.left : cx
  const oy = rect ? cy - rect.top : cy
  return { x: (ox - vp.x) / vp.zoom, y: (oy - vp.y) / vp.zoom }
}

function deleteSelected() {
  const targets = []
  if (selectedNode.value) targets.push({ id: selectedNode.value.id })
  if (selectedEdgeId.value) {
    const e = edges.value.find(ee => ee.id === selectedEdgeId.value)
    if (e) deleteElements({ edges: [{ id: e.id }] })
  }
  if (targets.length) deleteElements({ nodes: targets })
  selectedNodeId.value = null
  selectedEdgeId.value = null
  pushHistory()
}
function deselectNode() {
  selectedNodeId.value = null
  selectedEdgeId.value = null
  applyNodeChanges(nodes.value.map(n => ({ id: n.id, type: 'select', selected: false })))
}
function clearAll() {
  if (nodes.value.length === 0 && edges.value.length === 0) return
  if (!confirm('确定清空所有节点和连线？')) return
  nodes.value = []
  edges.value = []
  selectedNodeId.value = null
  selectedEdgeId.value = null
  pushHistory()
}

// ====== 属性面板 ======
function saveNodeData() {
  const n = nodes.value.find(nn => nn.id === selectedNodeId.value)
  if (n && selectedNode.value) n.data = { ...selectedNode.value.data }
}

// ====== 视图 ======
function fitView() { _fitView({ padding: 0.3, duration: 300 }) }
function zoomIn() {
  const vp = getViewport()
  setViewport({ x: vp.x, y: vp.y, zoom: Math.min(vp.zoom * 1.2, 3) })
}
function zoomOut() {
  const vp = getViewport()
  setViewport({ x: vp.x, y: vp.y, zoom: Math.max(vp.zoom / 1.2, 0.2) })
}

// ====== 右键菜单（画布 + 边界保护） ======
const contextMenu = reactive({ show: false, x: 0, y: 0 })

function onPaneContextMenu(e) {
  e.preventDefault()
  const menuW = 200, menuH = 240
  let x = e.clientX, y = e.clientY
  if (x + menuW > window.innerWidth) x = window.innerWidth - menuW - 8
  if (y + menuH > window.innerHeight) y = window.innerHeight - menuH - 8
  contextMenu.show = true
  contextMenu.x = Math.max(8, x)
  contextMenu.y = Math.max(8, y)
}
function closeContextMenu() { contextMenu.show = false }

// ====== 导入导出 ======
const importInputRef = ref(null)
function triggerImport() { importInputRef.value?.click() }
function exportJson() {
  const blob = new Blob([JSON.stringify({ version: 1, name: workspaceName.value, nodes: nodes.value, edges: edges.value }, null, 2)], { type: 'application/json' })
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = `${workspaceName.value || 'canvas'}-${Date.now()}.json`
  a.click()
}
function onImport(e) {
  const file = e.target.files?.[0]
  if (!file) return
  const reader = new FileReader()
  reader.onload = (ev) => {
    try {
      const json = JSON.parse(ev.target.result)
      nodes.value = json.nodes || []
      edges.value = json.edges || []
      workspaceName.value = json.name || '导入工作区'
      bindCallbacks()
      pushHistory()
      setTimeout(fitView, 80)
    } catch { alert('导入失败：JSON 格式错误') }
  }
  reader.readAsText(file)
  e.target.value = ''
}

// ====== 撤销重做 ======
const history = ref([])
const future = ref([])
const canUndo = computed(() => history.value.length > 1)
const canRedo = computed(() => future.value.length > 0)

// 给所有节点重新绑定 callbacks（import / undo / redo 后调用）
function bindCallbacks() {
  nodes.value = nodes.value.map(n => ({
    ...n,
    data: { ...n.data, callbacks: makeNodeCallbacks(n.id) }
  }))
}

// snapshot 时剥离 callbacks（函数不能 JSON 序列化）
function snapshot() {
  const cleanNodes = nodes.value.map(n => {
    const { callbacks, ...rest } = n.data
    return { ...n, data: rest }
  })
  return { nodes: JSON.parse(JSON.stringify(cleanNodes)), edges: JSON.parse(JSON.stringify(edges.value)) }
}
function pushHistory() {
  history.value.push(snapshot())
  future.value = []
  if (history.value.length > 50) history.value.shift()
}
function undo() {
  if (!canUndo.value) return
  future.value.push(history.value.pop())
  const prev = history.value[history.value.length - 1]
  nodes.value = prev.nodes
  edges.value = prev.edges
  bindCallbacks()
  selectedNodeId.value = null
  selectedEdgeId.value = null
}
function redo() {
  if (!canRedo.value) return
  const next = future.value.pop()
  history.value.push(next)
  nodes.value = next.nodes
  edges.value = next.edges
  bindCallbacks()
  selectedNodeId.value = null
  selectedEdgeId.value = null
}

// ====== 键盘快捷键 ======
function onKeyDown(e) {
  const el = e.target
  const tag = el?.tagName?.toLowerCase()
  const isEditing = tag === 'input' || tag === 'textarea' || el?.isContentEditable

  // 全局快捷键（即使焦点在 input 里也触发 Ctrl+Z/Y）
  if (e.ctrlKey || e.metaKey) {
    if (e.key === 'z' || e.key === 'Z') { e.preventDefault(); e.shiftKey ? redo() : undo(); return }
    if ((e.key === 'y' || e.key === 'Y')) { e.preventDefault(); redo(); return }
  }
  if (isEditing) return

  if (e.key === 'Delete' || e.key === 'Backspace') {
    e.preventDefault()
    if (selectedNodeId.value || selectedEdgeId.value) deleteSelected()
    return
  }
  if (e.key === 'Escape') {
    deselectNode()
    closeContextMenu()
    return
  }
}

// ====== 生成面板 ======
const genModel = ref('seedream')
const genRatio = ref('1:1')
const genDuration = ref('5')
const genPrompt = ref('')
const generating = ref(false)

const isImageModel = computed(() => ['seedream', 'flux', 'sdxl'].includes(genModel.value))
const isVideoModel = computed(() => ['seedance', 'kling', 'runway'].includes(genModel.value))

const genPlaceholder = computed(() => {
  if (isVideoModel.value) return '输入视频描述（如：镜头推进，小猫在草地上奔跑）…'
  return '输入图片描述（如：水彩画风格的小猫在钓鱼）…'
})

const connectedSources = computed(() => {
  if (!selectedNode.value) return []
  const inE = getIncomingEdges(selectedNode.value.id)
  return inE.map(e => findNode(e.source)).filter(Boolean)
})

const upstreamPromptText = computed(() => {
  return connectedSources.value
    .filter(n => n.type === 'prompt' && n.data.content?.trim())
    .map(n => n.data.content.trim())
    .join('\n\n')
})

function doGenerate() {
  const userPrompt = genPrompt.value.trim()
  const upstream = upstreamPromptText.value.trim()
  const combined = [upstream, userPrompt].filter(Boolean).join('\n\n')

  if (!combined) {
    alert('请输入提示词，或连线一个提示词节点')
    return
  }
  generating.value = true
  const targetNode = selectedNode.value
  setTimeout(() => {
    if (targetNode) {
      const n = nodes.value.find(nn => nn.id === targetNode.id)
      if (n) n.data = { ...n.data, status: 'done', label: userPrompt.slice(0, 20) || upstream.slice(0, 20) || '生成结果' }
    }
    generating.value = false
    pushHistory()
  }, 1500)
}

// ====== 子节点回调（复制 / 删除） ======
function onNodeCopy(nodeId) {
  const src = nodes.value.find(nn => nn.id === nodeId)
  if (!src) return
  const newId = genId(src.type)
  const newNode = {
    id: newId,
    type: src.type,
    position: { x: src.position.x + 30, y: src.position.y + 30 },
    data: JSON.parse(JSON.stringify(src.data))
  }
  // callbacks 不能被 JSON clone —— 换成新的绑定
  newNode.data.callbacks = makeNodeCallbacks(newId)
  newNode.data.label = (newNode.data.label || '复制') + ' (副本)'
  addNodes([newNode])
  pushHistory()
}
function onNodeDelete(nodeId) {
  deleteElements({ nodes: [{ id: nodeId }] })
  if (selectedNodeId.value === nodeId) selectedNodeId.value = null
  pushHistory()
}

// ====== 生命周期 ======
onMounted(() => {
  pushHistory()
  window.addEventListener('keydown', onKeyDown)
  window.addEventListener('click', closeContextMenu)
  window.addEventListener('contextmenu', onPaneContextMenu)
})
onBeforeUnmount(() => {
  window.removeEventListener('keydown', onKeyDown)
  window.removeEventListener('click', closeContextMenu)
  window.removeEventListener('contextmenu', onPaneContextMenu)
})
</script>

<style>
.vue-flow__pane { background: #0b0e16 !important; }
.vue-flow__background { background: #0b0e16; }
.vue-flow__edge-path { stroke: #6366f1; stroke-width: 2px; }
.vue-flow__edge.selected .vue-flow__edge-path,
.vue-flow__edge.edge-selected .vue-flow__edge-path { stroke: #a855f7; stroke-width: 2.5px; }
.vue-flow__edge.animated .vue-flow__edge-path { stroke: #a855f7; }
.vue-flow__handle { border: 2px solid #1f2330; transition: transform 0.15s, background 0.15s; }
.vue-flow__handle:hover { transform: scale(1.35); }
.vue-flow__handle-connecting { background: #22c55e !important; transform: scale(1.4); }

.vue-flow__controls { border-radius: 10px; overflow: hidden; background: #1f2330; box-shadow: 0 4px 20px rgba(0,0,0,0.4); }
.vue-flow__controls-button { background: #1f2330; border-bottom: 1px solid #33384a; color: #cbd5e1; }
.vue-flow__controls-button:hover { background: #33384a; }

.vue-flow__minimap { background: #0f1219; border: 1px solid #33384a; border-radius: 10px; }
.vue-flow__minimap-mask { fill: rgba(15, 18, 25, 0.75); }
.vue-flow__minimap-node { fill: #6366f1; stroke: #818cf8; }

.vue-flow__attribution { display: none !important; }
.vue-flow__node { transition: box-shadow 0.15s ease; }
.vue-flow__node:hover { filter: brightness(1.05); }
</style>

<style scoped>
.ai-canvas-board {
  position: fixed; inset: 0; top: 0; left: 0;
  background: #0b0e16;
  display: flex; flex-direction: column;
  z-index: 100;
}

/* 顶部工具栏 */
.canvas-toolbar {
  display: flex; align-items: center; justify-content: space-between;
  padding: 10px 16px;
  background: #151823;
  border-bottom: 1px solid #242838;
  flex-shrink: 0;
}
.toolbar-left, .toolbar-right { display: flex; align-items: center; gap: 6px; }
.toolbar-center { flex: 1; display: flex; align-items: center; justify-content: center; gap: 10px; }
.workspace-name { color: #e5e7eb; font-weight: 500; font-size: 14px; }
.workspace-stat { color: #64748b; font-size: 11px; }

.tb-btn {
  display: inline-flex; align-items: center; gap: 4px;
  padding: 6px 12px;
  background: #272b3a;
  border: 1px solid #33384a;
  color: #cbd5e1;
  border-radius: 8px;
  cursor: pointer;
  font-size: 12px;
  transition: background 0.15s, border-color 0.15s, transform 0.1s;
}
.tb-btn:hover:not(:disabled) { background: #33384a; border-color: #4b5563; }
.tb-btn:active:not(:disabled) { transform: scale(0.96); }
.tb-btn:disabled { opacity: 0.4; cursor: not-allowed; }
.tb-btn.primary { background: linear-gradient(135deg, #6366f1, #8b5cf6); border-color: transparent; color: #fff; }
.tb-btn.primary:hover:not(:disabled) { filter: brightness(1.1); }
.tb-btn.danger-ghost:hover:not(:disabled) { background: #450a0a; border-color: #7f1d1d; color: #fca5a5; }
.tb-btn.ghost { background: transparent; }
.tb-ic { font-size: 13px; }
.tb-divider { width: 1px; height: 18px; background: #33384a; margin: 0 4px; }
.tb-zoom-label { color: #94a3b8; font-size: 11px; min-width: 38px; text-align: center; font-variant-numeric: tabular-nums; }
.chip { background: #6366f1; color: #fff; font-size: 10px; padding: 1px 6px; border-radius: 8px; min-width: 18px; text-align: center; }

/* 画布 */
.canvas-main { flex: 1; position: relative; overflow: hidden; }
.vue-flow-root { width: 100%; height: 100%; }
.canvas-controls { position: absolute; }
.canvas-minimap { position: absolute; bottom: 16px; left: 16px; width: 180px; height: 120px; }

/* 空态引导 */
.empty-hint {
  position: absolute; inset: 0;
  display: flex; flex-direction: column; align-items: center; justify-content: center;
  pointer-events: none; z-index: 5;
}
.empty-hint .empty-grid {
  display: grid; grid-template-columns: repeat(4, auto);
  gap: 10px; pointer-events: auto;
}
.empty-card {
  display: flex; flex-direction: column; align-items: center; gap: 6px;
  padding: 18px 22px;
  background: rgba(39, 43, 58, 0.85);
  border: 1px solid #33384a;
  border-radius: 14px;
  color: #cbd5e1; font-size: 12px;
  cursor: pointer;
  transition: transform 0.15s, border-color 0.15s, background 0.15s;
  backdrop-filter: blur(6px);
}
.empty-card:hover {
  transform: translateY(-3px);
  border-color: #6366f1;
  background: #33384a;
}
.empty-emoji { font-size: 28px; }
.empty-tip { margin-top: 24px; color: #475569; font-size: 11px; pointer-events: auto; }

/* 右键菜单 */
.context-menu {
  position: fixed;
  background: #1f2330;
  border: 1px solid #33384a;
  border-radius: 10px;
  padding: 6px;
  min-width: 180px;
  z-index: 1000;
  box-shadow: 0 10px 40px rgba(0,0,0,0.5);
}
.cm-item {
  display: block; width: 100%; text-align: left;
  padding: 8px 12px; color: #cbd5e1; font-size: 12px;
  background: transparent; border: none; border-radius: 6px; cursor: pointer;
}
.cm-item:hover { background: #33384a; }
.cm-item.danger { color: #f87171; }
.cm-divider { height: 1px; background: #33384a; margin: 4px 0; }

/* 属性面板 */
.property-panel {
  position: absolute; top: 10px; right: 10px;
  width: 280px; max-height: calc(100% - 20px);
  background: #151823;
  border: 1px solid #242838;
  border-radius: 12px;
  box-shadow: 0 10px 40px rgba(0,0,0,0.5);
  display: flex; flex-direction: column;
  z-index: 20;
  overflow: hidden;
}
.slide-right-enter-active, .slide-right-leave-active { transition: transform 0.18s ease, opacity 0.18s ease; }
.slide-right-enter-from, .slide-right-leave-to { transform: translateX(20px); opacity: 0; }

.pp-header {
  display: flex; justify-content: space-between; align-items: center;
  padding: 10px 14px; background: #1f2330;
  border-bottom: 1px solid #242838;
}
.pp-title { font-weight: 600; color: #e5e7eb; font-size: 13px; }
.pp-close { background: transparent; border: none; color: #94a3b8; font-size: 18px; cursor: pointer; line-height: 1; }
.pp-close:hover { color: #e5e7eb; }
.pp-body { padding: 12px; overflow-y: auto; }
.pp-row { margin-bottom: 12px; }
.pp-row label { display: block; color: #94a3b8; font-size: 11px; margin-bottom: 4px; }
.pp-row-2 { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; margin-bottom: 12px; }
.pp-row-2 label { display: block; color: #94a3b8; font-size: 11px; margin-bottom: 4px; }
.pp-input, .pp-textarea {
  width: 100%;
  background: #0f1219;
  border: 1px solid #33384a;
  border-radius: 6px;
  padding: 7px 10px;
  color: #e5e7eb;
  font-size: 12px;
  outline: none;
  font-family: inherit;
  transition: border-color 0.15s;
}
.pp-input:focus, .pp-textarea:focus { border-color: #6366f1; }
.pp-textarea { resize: vertical; min-height: 80px; }
.pp-range { width: 100%; accent-color: #6366f1; }

.pp-related {
  margin-top: 4px; padding: 10px;
  background: #0f1219;
  border: 1px dashed #33384a;
  border-radius: 8px;
}
.pp-related-title { color: #64748b; font-size: 11px; margin-bottom: 6px; }
.pp-related-list { display: flex; flex-wrap: wrap; gap: 4px; margin-bottom: 6px; }
.pp-related-chip { background: #33384a; color: #cbd5e1; font-size: 10px; padding: 2px 7px; border-radius: 10px; }
.pp-prompt-peek { color: #94a3b8; font-size: 11px; line-height: 1.5; white-space: pre-wrap; }

.pp-actions { margin-top: 8px; }
.btn-danger {
  width: 100%; padding: 8px;
  background: #7f1d1d; color: #fca5a5;
  border: 1px solid #991b1b;
  border-radius: 8px; cursor: pointer; font-size: 12px;
  transition: background 0.15s;
}
.btn-danger:hover { background: #991b1b; }

/* 底部生成面板 */
.gen-panel {
  display: flex; align-items: center; gap: 10px;
  padding: 10px 16px;
  background: #151823;
  border-top: 1px solid #242838;
  flex-shrink: 0;
}
.gen-left { display: flex; align-items: center; gap: 8px; flex-shrink: 0; }
.gen-model, .gen-select {
  background: #272b3a; color: #cbd5e1;
  border: 1px solid #33384a; border-radius: 8px;
  padding: 6px 10px; font-size: 12px; outline: none;
  cursor: pointer;
}
.gen-model:hover, .gen-select:hover { border-color: #6366f1; }

.gen-prompt { flex: 1; position: relative; }
.gen-input {
  width: 100%;
  background: #0f1219;
  border: 1px solid #33384a;
  border-radius: 10px;
  padding: 9px 14px;
  color: #e5e7eb;
  font-size: 13px;
  outline: none;
  transition: border-color 0.15s, box-shadow 0.15s;
}
.gen-input:focus { border-color: #a855f7; box-shadow: 0 0 0 2px rgba(168,85,247,0.15); }
.gen-prompt-tip {
  margin-top: 3px; color: #475569; font-size: 10px; padding-left: 3px;
}
.upstream-badge {
  background: #6366f1; color: #fff;
  padding: 0 5px; border-radius: 8px; font-size: 10px;
}

.gen-right { flex-shrink: 0; }
.gen-btn {
  display: inline-flex; align-items: center; gap: 6px;
  padding: 9px 20px;
  background: linear-gradient(135deg, #a855f7, #ec4899);
  color: #fff;
  border: none;
  border-radius: 10px;
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  transition: filter 0.15s, transform 0.1s;
}
.gen-btn:hover:not(:disabled) { filter: brightness(1.1); }
.gen-btn:active:not(:disabled) { transform: scale(0.97); }
.gen-btn:disabled { opacity: 0.5; cursor: not-allowed; }

.gen-spinner {
  width: 14px; height: 14px;
  border: 2px solid rgba(255,255,255,0.3);
  border-top-color: #fff;
  border-radius: 50%;
  animation: spin 0.7s linear infinite;
}
@keyframes spin { to { transform: rotate(360deg); } }

.hidden { display: none; }
</style>
