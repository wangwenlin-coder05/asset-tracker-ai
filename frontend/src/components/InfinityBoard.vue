<template>
  <div class="ib-root" :class="{ 'ib-dark': darkMode, 'ib-focus-mode': focusMode }" @contextmenu.prevent="onContextMenu">
    <!-- 左侧工具栏 -->
    <aside class="ib-toolbar">
      <button v-for="tool in tools" :key="tool.id" :title="tool.label + ' (' + tool.shortcut + ')'" class="ib-tool-btn"
        :class="{ active: activeTool === tool.id }" :data-shortcut="tool.shortcut" @mousedown.stop="useTool(tool.id)">
        <component :is="tool.icon" class="w-4 h-4" />
      </button>
      <div class="ib-tool-sep"></div>
      <button title="撤销" class="ib-tool-btn" :disabled="!canUndo" @click="undo"><Undo2 class="w-4 h-4" /></button>
      <button title="重做" class="ib-tool-btn" :disabled="!canRedo" @click="redo"><Redo2 class="w-4 h-4" /></button>
      <div class="ib-tool-sep"></div>
      <button title="自动布局-右" class="ib-tool-btn" @click="applyLayout('right')">→</button>
      <button title="自动布局-下" class="ib-tool-btn" @click="applyLayout('down')">↓</button>
      <button title="自动布局-放射" class="ib-tool-btn" @click="applyLayout('radial')">⊙</button>
      <div class="ib-tool-sep"></div>
      <button title="直线" class="ib-tool-btn" :class="{ active: styleMemory.lineStyle === 'straight' }" @click="setLineStyle('straight')">╱</button>
      <button title="曲线" class="ib-tool-btn" :class="{ active: styleMemory.lineStyle === 'curve' }" @click="setLineStyle('curve')">⌒</button>
      <button title="折线" class="ib-tool-btn" :class="{ active: styleMemory.lineStyle === 'polyline' }" @click="setLineStyle('polyline')">└</button>
      <div class="ib-tool-sep"></div>
      <button title="缩放: 鼠标滚轮 / Ctrl+滚轮 · 平移: 触控板滑动" class="ib-tool-btn" @click="zoom = 1; viewportX = 0; viewportY = 0">🏠</button>
    </aside>

    <!-- 顶部状态栏 -->
    <div class="ib-topbar">
      <span class="ib-title">{{ boardTitle }}</span>
      <span class="ib-meta">{{ zoomPercent }}% · {{ elements.length }} 元素{{ selectedIds.length > 1 ? ' · 已选' + selectedIds.length : '' }} · {{ saved ? '已保存' : '保存中…' }}</span>
      <div class="ib-topbar-actions">
        <button title="保存视图" class="ib-topbar-btn" @click="saveViewSnapshot">📷</button>
        <button title="恢复视图" class="ib-topbar-btn" :disabled="viewSnapshots.length === 0" @click="restoreViewSnapshot">📂</button>
        <button :title="focusMode ? '退出聚焦模式' : '聚焦模式'" class="ib-topbar-btn" :class="{ active: focusMode }" @click="toggleFocusMode">{{ focusMode ? '👁️' : '👁️‍🗨️' }}</button>
        <button title="切换深色模式" class="ib-topbar-btn" @click="darkMode = !darkMode">
          <Sun v-if="darkMode" class="w-3.5 h-3.5" /><Moon v-else class="w-3.5 h-3.5" />
        </button>
        <button title="导出 PNG" class="ib-topbar-btn" @click="exportPNG">PNG</button>
        <button title="导出 Markdown" class="ib-topbar-btn" @click="exportMarkdown">MD</button>
      </div>
    </div>

    <!-- 画布容器 -->
    <div ref="viewportRef" class="ib-viewport" :class="viewportCursorClass"
      @wheel.prevent="onWheel"
      @mousedown="onViewportMouseDown"
      @mousemove="onViewportMouseMove"
      @mouseup="onViewportMouseUp"
      @dblclick="onViewportDblClick"
      @click.self="onViewportClick"
    >
      <!-- 框选矩形 -->
      <div v-if="isSelecting && selectionRect" class="ib-selection-rect"
        :style="{ left: selectionRect.x + 'px', top: selectionRect.y + 'px', width: selectionRect.w + 'px', height: selectionRect.h + 'px' }">
      </div>

      <!-- 拖拽绘制预览 -->
      <div v-if="drawingShape" class="ib-drawing-preview" :style="drawingPreviewStyle"></div>

      <!-- 视口变换的画布 -->
      <div class="ib-canvas" :class="{ 'no-transition': isPanning || isWheelPanning }"
        :style="{ transform: `translate(${viewportX}px, ${viewportY}px) scale(${zoom})`, transformOrigin: '0 0' }">
        <!-- SVG 连线层 -->
        <svg class="ib-svg-layer">
          <defs>
            <marker id="ib-arrow" markerWidth="10" markerHeight="10" refX="0" refY="3" orient="auto">
              <path d="M0,0 L0,6 L9,3 z" fill="#475569" />
            </marker>
          </defs>
          <g v-for="c in visibleConnectors" :key="c.id" class="ib-connector-group"
            :class="{ hovered: hoveredConnectorId === c.id, selected: selectedIds.includes(c.id), 'search-dim': searchDimmed && !searchResultIds.has(c.from) && !searchResultIds.has(c.to), 'ib-focus-dimmed': focusMode && !focusDimmedConnectors.has(c.id) }"
            @mouseenter="hoveredConnectorId = c.id"
            @mouseleave="hoveredConnectorId = null; if (midpointConnectorId === c.id) midpointConnectorId = null"
            @mousedown.stop="onElementMouseDown(c, $event)"
            @dblclick.stop="deleteConnector(c)">
            <line v-if="styleMemory.lineStyle === 'straight'"
              :x1="anchorById(c.from, 'x', c.fromSide)" :y1="anchorById(c.from, 'y', c.fromSide)"
              :x2="shortenedEndpoint(c).x" :y2="shortenedEndpoint(c).y"
              :stroke="c.color || '#475569'" stroke-width="2" marker-end="url(#ib-arrow)"
              class="ib-line" />
            <path v-else
              :d="getConnectorPath(c)"
              :stroke="c.color || '#475569'" stroke-width="2" fill="none" marker-end="url(#ib-arrow)"
              class="ib-line" />
          </g>
        </svg>

        <!-- 元素 -->
        <template v-for="el in visibleElements" :key="el.id">
          <!-- 便签 -->
          <div v-if="el.type === 'note'" class="ib-element ib-note"
            :class="{
              selected: selectedIds.includes(el.id),
              'multi-selected': selectedIds.length > 1 && selectedIds.includes(el.id),
              creating: creatingId === el.id,
              locked: el.locked,
              dragging: isDragging && dragHasMoved && selectedIds.includes(el.id),
              'search-dim': searchDimmed && !searchResultIds.has(el.id),
              'search-hit': searchResultIds.has(el.id) && searchIndexEl?.id === el.id,
              'ib-focus-dimmed': focusMode && focusDimmedIds.has(el.id)
            }"
            :style="{
              left: el.x + 'px', top: el.y + 'px',
              width: el.width + 'px', height: el.height + 'px',
              background: noteColors[el.color || 'yellow'],
              transform: el._hoverScale ? 'scale(1.08)' : 'scale(1)',
              zIndex: el._hoverScale ? 3 : 1,
              transition: isDragging ? 'none' : undefined,
            }"
            @mousedown.stop="onElementMouseDown(el, $event)"
            @dblclick.stop="startEditText(el)"
            @mouseenter="onElementMouseEnter(el)"
            @mouseleave="onElementMouseLeave(el)">
            <div v-if="el.locked" class="ib-lock-badge">🔒</div>
            <div v-if="el.collapsed && getDescendantCount(el.id) > 0" class="ib-collapse-badge" @mousedown.stop @click.stop="toggleCollapse(el)">{{ getDescendantCount(el.id) }}</div>
            <textarea v-if="editingId === el.id" v-model="el.text" class="ib-note-textarea"
              :ref="e => { if (editingId === el.id) editingNoteArea = e }"
              placeholder="输入内容..."
              autofocus @blur="finishEdit" @keydown.enter.exact.stop="finishEdit" />
            <div v-else class="ib-note-text">{{ el.text }}</div>
          </div>

          <!-- 文本框 -->
          <div v-else-if="el.type === 'text' && editingId !== el.id" class="ib-element ib-text"
            :data-el-id="el.id"
            :class="{ selected: selectedIds.includes(el.id), 'multi-selected': selectedIds.length > 1 && selectedIds.includes(el.id), locked: el.locked, dragging: isDragging && dragHasMoved && selectedIds.includes(el.id), 'search-dim': searchDimmed && !searchResultIds.has(el.id), 'search-hit': searchResultIds.has(el.id) && searchIndexEl?.id === el.id, 'ib-focus-dimmed': focusMode && focusDimmedIds.has(el.id) }"
            :style="{ left: el.x + 'px', top: el.y + 'px', width: el.width + 'px', height: el.height + 'px', fontSize: el.size + 'px', color: el.color || '#1e293b' }"
            @mousedown.stop="onElementMouseDown(el, $event)" @dblclick.stop="startEditText(el)">
            <span v-if="el.locked" class="ib-lock-badge-inline">🔒</span>{{ el.text }}
          </div>

          <!-- 矩形占位 -->
          <div v-else-if="el.type === 'rect'" class="ib-element ib-rect"
            :class="{ selected: selectedIds.includes(el.id), 'multi-selected': selectedIds.length > 1 && selectedIds.includes(el.id), creating: creatingId === el.id, locked: el.locked, dragging: isDragging && dragHasMoved && selectedIds.includes(el.id), 'search-dim': searchDimmed && !searchResultIds.has(el.id), 'search-hit': searchResultIds.has(el.id) && searchIndexEl?.id === el.id, 'ib-focus-dimmed': focusMode && focusDimmedIds.has(el.id) }"
            :style="{ left: el.x + 'px', top: el.y + 'px', width: el.width + 'px', height: el.height + 'px', borderColor: el.color || '#3b82f6' }"
            @mousedown.stop="onElementMouseDown(el, $event)">
            <div v-if="el.locked" class="ib-lock-badge">🔒</div>
            <div v-if="el.text" class="ib-rect-text" @dblclick.stop="startEditText(el)">{{ el.text }}</div>
          </div>

          <!-- 图片占位 -->
          <div v-else-if="el.type === 'image'" class="ib-element ib-image"
            :class="{ selected: selectedIds.includes(el.id), 'multi-selected': selectedIds.length > 1 && selectedIds.includes(el.id), creating: creatingId === el.id, locked: el.locked, dragging: isDragging && dragHasMoved && selectedIds.includes(el.id), 'search-dim': searchDimmed && !searchResultIds.has(el.id), 'search-hit': searchResultIds.has(el.id) && searchIndexEl?.id === el.id, 'ib-focus-dimmed': focusMode && focusDimmedIds.has(el.id) }"
            :style="{ left: el.x + 'px', top: el.y + 'px', width: el.width + 'px', height: el.height + 'px' }"
            @mousedown.stop="onElementMouseDown(el, $event)" @dblclick.stop="startEditText(el)">
            <div v-if="el.locked" class="ib-lock-badge">🔒</div>
            <div v-if="!el.src" class="ib-image-placeholder">🖼️ {{ el.text || '双击添加图片' }}</div>
            <img v-else :src="el.src" :alt="el.text" class="ib-image-img" />
          </div>
        </template>
      </div>

      <!-- 文本编辑输入框（viewport 层，避免缩放变形） -->
      <template v-for="el in visibleElements" :key="'edit-'+el.id">
        <input v-if="el.type === 'text' && editingId === el.id"
          :ref="e => { if (editingId === el.id) editingInput = e }"
          class="ib-text-input"
          :style="textInputScreenStyle(el)"
          v-model="el.text" placeholder="输入文本..."
          @mousedown.stop @dblclick.stop @blur="finishEdit" @keydown.enter.stop="finishEdit" />
      </template>

      <!-- 连线追踪线 -->
      <svg v-if="connectingFrom" class="ib-svg-layer ib-svg-over">
        <line :x1="canvasToScreen(anchorPos(connectingFrom, 'x', connectingFromSide), anchorPos(connectingFrom, 'y', connectingFromSide)).x - (viewportRef?.getBoundingClientRect()?.left || 0)" 
          :y1="canvasToScreen(anchorPos(connectingFrom, 'x', connectingFromSide), anchorPos(connectingFrom, 'y', connectingFromSide)).y - (viewportRef?.getBoundingClientRect()?.top || 0)"
          :x2="connectingToScreenX" :y2="connectingToScreenY"
          stroke="#475569" stroke-width="2" stroke-dasharray="4 3" marker-end="url(#ib-arrow)" />
      </svg>

      <!-- 连线模式下：显示所有元素（除源元素外）的锚点作为连接目标 -->
      <template v-if="connectingFrom">
        <template v-for="el in elements" :key="'anchor-'+el.id">
          <div v-if="el.id !== connectingFrom.id && !el.locked"
            v-for="ah in anchorHandles" :key="ah.side"
            class="ib-anchor ib-anchor-target"
            :class="'ib-anchor-' + ah.side"
            :style="anchorScreenStyleFor(el, ah.side)"
            :title="'连接到 ' + ah.title"
            @mousedown.stop.prevent="connectToTarget(el, ah.side)" />
        </template>
      </template>

      <!-- 选中元素锚点浮层（仅单选时显示，连线模式外） -->
      <template v-if="selectedIds.length === 1 && selectedElement && !connectingFrom && !selectedElement.locked">
        <div v-for="ah in anchorHandles" :key="ah.side" class="ib-anchor" :class="'ib-anchor-' + ah.side"
          :style="anchorScreenStyle(ah.side)" :title="ah.title" @mousedown.stop.prevent="startConnection(ah.side, $event)"></div>
        <div class="ib-plus-btn"
          :style="plusBtnScreenStyle()"
          title="新建子节点" @mousedown.stop.prevent="quickAddChild()">+</div>
      </template>

      <!-- 连接线中点 + 按钮 -->
      <div v-if="midpointConnectorId" class="ib-midpoint-btn"
        :style="{ left: midpointScreenX + 'px', top: midpointScreenY + 'px' }"
        title="添加节点"
        @mousedown.stop.prevent="splitConnectorAtMidpoint(connectors.find(c => c.id === midpointConnectorId))">+</div>
    </div>

    <!-- 缩放控件 -->
    <div class="ib-zoom-controls">
      <button @click="zoom -= 0.1" :disabled="zoom <= 0.3" title="缩小"><Minus class="w-3 h-3" /></button>
      <span>{{ zoomPercent }}%</span>
      <button @click="zoom += 0.1" :disabled="zoom >= 2" title="放大"><Plus class="w-3 h-3" /></button>
      <button @click="fitView" title="适应窗口"><Maximize2 class="w-3 h-3" /></button>
    </div>

    <!-- 小地图 -->
    <div v-if="showMinimap" class="ib-minimap" @mousedown="onMinimapMouseDown">
      <div class="ib-minimap-canvas" ref="minimapCanvasRef">
        <template v-for="el in elements" :key="'mme-'+el.id">
          <div class="ib-minimap-el" :class="{ selected: selectedIds.includes(el.id) }"
            :style="minimapStyle(el)"></div>
        </template>
        <div class="ib-minimap-viewport"
          :style="minimapViewportStyle()"></div>
      </div>
    </div>

    <!-- 底部操作面板 -->
    <div v-if="selectedIds.length > 0" class="ib-panel">
      <!-- 多选对齐 -->
      <template v-if="selectedIds.length > 1">
        <span class="ib-panel-label">对齐：</span>
        <button class="ib-panel-btn-sm" title="左对齐" @click="alignElements('left')">⬅</button>
        <button class="ib-panel-btn-sm" title="水平居中" @click="alignElements('centerH')">↔</button>
        <button class="ib-panel-btn-sm" title="右对齐" @click="alignElements('right')">➡</button>
        <span class="ib-panel-sep"></span>
        <button class="ib-panel-btn-sm" title="顶对齐" @click="alignElements('top')">⬆</button>
        <button class="ib-panel-btn-sm" title="垂直居中" @click="alignElements('centerV')">↕</button>
        <button class="ib-panel-btn-sm" title="底对齐" @click="alignElements('bottom')">⬇</button>
        <span class="ib-panel-sep"></span>
        <button class="ib-panel-btn-sm" title="水平均分" @click="alignElements('distH')">⇥</button>
        <button class="ib-panel-btn-sm" title="垂直均分" @click="alignElements('distV')">⇳</button>
      </template>
      <!-- 单选 -->
      <template v-if="selectedIds.length === 1 && selectedElement">
        <span v-if="selectedElement.type === 'note'">背景：</span>
        <div v-if="selectedElement.type === 'note'" class="ib-color-picker">
          <button v-for="(bg, name) in noteColors" :key="name" class="ib-color-dot"
            :class="{ active: selectedElement.color === name }" :style="{ background: bg }"
            @click="selectedElement.color = name; scheduleSave()"></button>
        </div>
        <button class="ib-panel-btn-sm" :title="selectedElement.locked ? '解锁' : '锁定'"
          @click="toggleLock(selectedElement)">
          {{ selectedElement.locked ? '🔓' : '🔒' }}
        </button>
      </template>
      <span class="ib-panel-count">{{ selectedIds.length }} 个已选</span>
      <button class="ib-panel-btn-del" @click="deleteSelected"><Trash2 class="w-3 h-3" /> 删除</button>
    </div>

    <!-- 搜索栏 -->
    <div v-if="searchOpen" class="ib-search-bar">
      <input ref="searchInput" v-model="searchQuery" class="ib-search-input" placeholder="搜索节点..."
        @keydown.enter="searchNext" @keydown.esc="closeSearch" @input="doSearch" />
      <span class="ib-search-info">{{ searchResults.length > 0 ? `${searchIndex + 1}/${searchResults.length}` : '无结果' }}</span>
      <button class="ib-search-btn" @click="searchNext" title="下一个">↓</button>
      <button class="ib-search-btn" @click="searchPrev" title="上一个">↑</button>
      <button class="ib-search-btn" @click="closeSearch" title="关闭">✕</button>
    </div>

    <!-- 右键菜单 -->
    <div v-if="contextMenu.show" class="ib-context-menu"
      :style="{ left: contextMenu.x + 'px', top: contextMenu.y + 'px' }"
      ref="contextMenuRef">
      <template v-for="item in contextMenu.items" :key="item.label">
        <div v-if="item.type === 'sep'" class="ib-cm-sep"></div>
        <button v-else class="ib-cm-item" :class="{ danger: item.danger }" @click="item.action(); contextMenu.show = false">
          <component :is="item.icon" v-if="item.icon" class="w-3.5 h-3.5" />
          <span>{{ item.label }}</span>
          <kbd v-if="item.shortcut" class="ib-cm-kbd">{{ item.shortcut }}</kbd>
        </button>
      </template>
    </div>

    <!-- 格式刷指示器 -->
    <div v-if="formatBrush" class="ib-format-brush-indicator">
      🖌️ 格式刷模式 — 点击目标节点应用样式 (Esc 取消)
    </div>

    <!-- 聚焦模式指示器 -->
    <div v-if="focusMode" class="ib-focus-indicator">
      🎯 聚焦模式 — 仅显示选中节点及其分支 (Esc 退出)
    </div>

    <!-- Toast 通知 -->
    <div v-if="toast.show" class="ib-toast" :class="toast.type">{{ toast.message }}</div>

    <!-- 快捷键帮助面板 -->
    <Teleport to="body">
      <div v-if="shortcutHelpOpen" class="ib-shortcut-overlay" @click.self="shortcutHelpOpen = false">
        <div class="ib-shortcut-panel">
          <div class="ib-shortcut-header">
            <h3>快捷键</h3>
            <button class="ib-shortcut-close" @click="shortcutHelpOpen = false">✕</button>
          </div>
          <div class="ib-shortcut-body">
            <div v-for="item in shortcutHelp" :key="item.key" class="ib-shortcut-row">
              <kbd class="ib-shortcut-key">{{ item.key }}</kbd>
              <span class="ib-shortcut-desc">{{ item.desc }}</span>
            </div>
          </div>
        </div>
      </div>
    </Teleport>

    <!-- 退出 -->
    <div v-if="onClose" class="ib-exit-bar">
      <button class="ib-exit-btn" @click="handleExit">✕ 退出画布</button>
    </div>
  </div>
</template>

<script setup>
import { ref, reactive, computed, onMounted, onBeforeUnmount, watch, nextTick } from 'vue'
import { FileText, StickyNote, Type, Square, Image, ArrowRight, Minus, Plus, Maximize2, Trash2, Undo2, Redo2, Moon, Sun, Copy, Scissors, Lock, Unlock, Eye, EyeOff, Brush, Search, ChevronDown, ChevronUp } from 'lucide-vue-next'

const props = defineProps({
  boardData: { type: Object, default: () => ({}) },
  boardTitle: { type: String, default: '画布' },
  autoSave: { type: Boolean, default: false },
  onClose: { type: Function, default: null }
})

const emit = defineEmits(['save', 'close'])

// ==================== 核心状态 ====================
const elements = ref([])
const connectors = ref([])
const viewportRef = ref(null)
const viewportX = ref(0)
const viewportY = ref(0)
const zoom = ref(1)
const saved = ref(true)
const darkMode = ref(false)
const activeTool = ref('pan')
const history = ref([])
const historyIndex = ref(-1)
const maxHistory = 100

// ==================== 工具定义 ====================
const tools = [
  { id: 'pan', label: '平移 (V)', icon: ArrowRight, shortcut: 'V' },
  { id: 'note', label: '便签 (N)', icon: StickyNote, shortcut: 'N' },
  { id: 'text', label: '文本 (T)', icon: Type, shortcut: 'T' },
  { id: 'rect', label: '矩形 (R)', icon: Square, shortcut: 'R' },
  { id: 'image', label: '图片 (I)', icon: Image, shortcut: 'I' },
  { id: 'connect', label: '连线 (C)', icon: ArrowRight, shortcut: 'C' },
]

// 快捷键盘提示
const shortcutHelp = computed(() => [
  { key: 'N / T / R / I', desc: '新建便签/文本/矩形/图片' },
  { key: 'C', desc: '连线模式' },
  { key: 'V', desc: '平移/选择模式' },
  { key: 'Enter', desc: '编辑选中节点' },
  { key: 'Tab', desc: '添加子节点' },
  { key: 'Delete', desc: '删除选中' },
  { key: 'Ctrl+Z / Ctrl+Y', desc: '撤销 / 重做' },
  { key: 'Ctrl+C / Ctrl+V', desc: '复制 / 粘贴' },
  { key: 'Ctrl+F', desc: '搜索节点' },
  { key: 'Ctrl+A', desc: '全选' },
  { key: 'Ctrl+/', desc: '快捷键帮助' },
  { key: 'ESC', desc: '取消操作 / 清除选择' },
  { key: '鼠标滚轮', desc: '缩放画布' },
  { key: '空格+拖拽', desc: '平移画布' },
])

const noteColors = {
  yellow: '#FEF3C7', pink: '#FCE7F3', blue: '#DBEAFE',
  green: '#DCFCE7', purple: '#F3E8FF', white: '#FFFFFF'
}

// ==================== 选中状态 ====================
const selectedIds = ref([])
const editingId = ref(null)
const editingInput = ref(null)
const editingNoteArea = ref(null)
const creatingId = ref(null)
const connectingFrom = ref(null)
const connectingFromSide = ref('right')
const connectingToX = ref(0)
const connectingToY = ref(0)
const connectingToScreenX = ref(0)
const connectingToScreenY = ref(0)

const selectedElement = computed(() => {
  if (selectedIds.value.length !== 1) return null
  return elements.value.find(e => e.id === selectedIds.value[0]) || null
})

// ==================== 样式记忆 ====================
const styleMemory = reactive({
  lineStyle: 'straight',
  lastColor: 'yellow',
  lastSize: 16,
  lastRectColor: '#3b82f6',
  lastConnectorColor: '#475569'
})

// ==================== 搜索 ====================
const searchOpen = ref(false)
const searchQuery = ref('')
const searchResults = ref([])
const searchIndex = ref(0)
const searchInput = ref(null)
const searchDimmed = computed(() => searchResults.value.length > 0)
const searchResultIds = computed(() => new Set(searchResults.value.map(e => e.id)))
const searchIndexEl = computed(() => searchResults.value[searchIndex.value] || null)

// ==================== 拖拽状态 ====================
const isPanning = ref(false)
const isDragging = ref(false)
const isSelecting = ref(false)
const selectionRect = ref(null)
const dragStart = ref({ x: 0, y: 0 })
const dragStartScreenX = ref(0)
const dragStartScreenY = ref(0)
const dragOffsets = ref([])
const dragHasMoved = ref(false)
const drawingShape = ref(null) // 拖拽绘制: { type, startX, startY, currentX, currentY }
const justDrew = ref(false) // 刚完成拖拽绘制，阻止后续 click
const justSelected = ref(false) // 刚完成框选，阻止后续 click 清除选择
const contextMenu = reactive({ show: false, x: 0, y: 0, items: [] })
const contextMenuRef = ref(null)
const formatBrush = ref(null)
const toast = reactive({ show: false, message: '', type: 'info' })
const shortcutHelpOpen = ref(false)

// 光标样式
const viewportCursorClass = computed(() => {
  if (editingId.value) return 'ib-cursor-text'
  if (isPanning.value) return 'ib-cursor-grabbing'
  if (isDragging.value) return 'ib-cursor-grabbing'
  if (isSelecting.value) return 'ib-cursor-crosshair'
  if (activeTool.value === 'pan') return 'ib-cursor-grab'
  if (activeTool.value === 'connect') return 'ib-cursor-crosshair'
  if (['rect', 'note', 'text', 'image'].includes(activeTool.value)) return 'ib-cursor-crosshair'
  return 'ib-cursor-grab'
})

// 拖拽绘制预览样式
const drawingPreviewStyle = computed(() => {
  if (!drawingShape.value) return {}
  const ds = drawingShape.value
  const x = Math.min(ds.startX, ds.currentX)
  const y = Math.min(ds.startY, ds.currentY)
  const w = Math.abs(ds.currentX - ds.startX)
  const h = Math.abs(ds.currentY - ds.startY)
  const isNote = ds.type === 'note'
  return {
    left: x + 'px', top: y + 'px',
    width: w + 'px', height: h + 'px',
    background: isNote ? noteColors[styleMemory.lastColor] : 'transparent',
    border: isNote ? '1px dashed #94a3b8' : `2px dashed ${styleMemory.lastRectColor}`,
    borderRadius: isNote ? '4px' : '6px',
    opacity: 0.7,
  }
})

// ==================== 连线锚点 ====================
const anchorHandles = [
  { side: 'top', title: '上', get style() { return anchorStyle('top') } },
  { side: 'bottom', title: '下', get style() { return anchorStyle('bottom') } },
  { side: 'left', title: '左', get style() { return anchorStyle('left') } },
  { side: 'right', title: '右', get style() { return anchorStyle('right') } },
]

function anchorStyle(side) {
  const el = selectedElement.value
  if (!el) return {}
  const w = elW(el), h = elH(el)
  const s = { position: 'absolute', width: '10px', height: '10px' }
  if (side === 'top') { s.left = (el.x + w / 2 - 5) + 'px'; s.top = (el.y - 5) + 'px' }
  if (side === 'bottom') { s.left = (el.x + w / 2 - 5) + 'px'; s.top = (el.y + h - 5) + 'px' }
  if (side === 'left') { s.left = (el.x - 5) + 'px'; s.top = (el.y + h / 2 - 5) + 'px' }
  if (side === 'right') { s.left = (el.x + w - 5) + 'px'; s.top = (el.y + h / 2 - 5) + 'px' }
  return s
}

// 锚点屏幕坐标版本（用于 viewport 层的绝对定位）
function anchorScreenStyle(side) {
  const el = selectedElement.value
  if (!el) return {}
  return anchorScreenStyleFor(el, side)
}

// 通用版本：给定任意元素计算锚点屏幕坐标
function anchorScreenStyleFor(el, side) {
  if (!el) return {}
  const w = elW(el), h = elH(el)
  const rect = viewportRef.value?.getBoundingClientRect()
  if (!rect) return {}
  let cx, cy
  if (side === 'top') { cx = el.x + w / 2; cy = el.y }
  if (side === 'bottom') { cx = el.x + w / 2; cy = el.y + h }
  if (side === 'left') { cx = el.x; cy = el.y + h / 2 }
  if (side === 'right') { cx = el.x + w; cy = el.y + h / 2 }
  const sx = cx * zoom.value + viewportX.value
  const sy = cy * zoom.value + viewportY.value
  return { position: 'absolute', width: '10px', height: '10px', left: (sx - 5) + 'px', top: (sy - 5) + 'px' }
}

function plusBtnScreenStyle() {
  const el = selectedElement.value
  if (!el) return {}
  const rect = viewportRef.value?.getBoundingClientRect()
  if (!rect) return {}
  const cx = el.x + elW(el) / 2
  const cy = el.y - 14
  const sx = cx * zoom.value + viewportX.value
  const sy = cy * zoom.value + viewportY.value
  return { left: (sx - 12) + 'px', top: sy + 'px' }
}

// 文本输入框屏幕坐标（viewport 层，不受 canvas 缩放影响）
function textInputScreenStyle(el) {
  const rect = viewportRef.value?.getBoundingClientRect()
  if (!rect) return {}
  const sx = el.x * zoom.value + viewportX.value
  const sy = el.y * zoom.value + viewportY.value
  const fontSize = el.size * zoom.value
  return {
    left: sx + 'px',
    top: sy + 'px',
    fontSize: fontSize + 'px',
    position: 'absolute',
    zIndex: 6
  }
}

// ==================== 新增功能状态 ====================
// 1. Drag threshold
const DRAG_THRESHOLD = 4

// 6. Tree layout
const treeLayout = ref('right')

// 8. Connector hover
const hoveredConnectorId = ref(null)
const mouseCanvasX = ref(0)
const mouseCanvasY = ref(0)
const midpointConnectorId = ref(null) // 悬停在中点附近的连接线ID
const midpointScreenX = ref(0)
const midpointScreenY = ref(0)

// 9. Minimap
const showMinimap = ref(true)
const minimapCanvasRef = ref(null)

// 10. View snapshots
const viewSnapshots = ref([])

// 11. Focus mode
const focusMode = ref(false)

// 12. Pan inertia
let inertiaRAF = null
let inertiaVX = 0
let inertiaVY = 0

// 空闲自动保存
let idleSaveTimer = null
const IDLE_SAVE_DELAY = 30000 // 30秒无操作后自动保存

function resetIdleTimer() {
  clearTimeout(idleSaveTimer)
  if (props.autoSave) {
    idleSaveTimer = setTimeout(() => {
      if (!saved.value) {
        emit('save', exportData())
        saved.value = true
      }
    }, IDLE_SAVE_DELAY)
  }
}

// 测量所有已渲染文本元素的实际尺寸（画布坐标）
function measureAllTextElements() {
  const canvasEl = viewportRef.value?.querySelector('.ib-canvas')
  if (!canvasEl) return
  const textEls = canvasEl.querySelectorAll('[data-el-id]')
  textEls.forEach(domEl => {
    const id = domEl.getAttribute('data-el-id')
    const el = elements.value.find(e => e.id === id)
    if (!el || el.type !== 'text') return
    const rect = domEl.getBoundingClientRect()
    if (rect.width > 0 && rect.height > 0) {
      el.width = Math.max(rect.width / zoom.value, 20)
      el.height = Math.max(rect.height / zoom.value, 16)
    }
  })
}

// ==================== 计算属性 ====================
const zoomPercent = computed(() => Math.round(zoom.value * 100))
const dynStrokeWidth = computed(() => Math.max(1, 2 / zoom.value))
const canUndo = computed(() => historyIndex.value > 0)
const canRedo = computed(() => historyIndex.value < history.value.length - 1)

// 5. Visible elements (collapse/expand)
const visibleElements = computed(() => {
  if (!elements.value.some(e => e.collapsed)) return elements.value
  const hiddenIds = new Set()
  for (const el of elements.value) {
    if (el.collapsed) {
      const desc = getDescendantIds(el.id)
      desc.forEach(id => hiddenIds.add(id))
    }
  }
  return elements.value.filter(e => !hiddenIds.has(e.id))
})

const visibleConnectors = computed(() => {
  const visibleIdSet = new Set(visibleElements.value.map(e => e.id))
  return connectors.value.filter(c => visibleIdSet.has(c.from) && visibleIdSet.has(c.to))
})

// 11. Focus dimmed IDs
const focusDimmedIds = computed(() => {
  if (!focusMode.value) return new Set()
  if (selectedIds.value.length === 0) return new Set()
  const branchIds = getBranchIds(selectedElement.value)
  const allIds = new Set(elements.value.map(e => e.id))
  const dimmed = new Set()
  allIds.forEach(id => { if (!branchIds.has(id)) dimmed.add(id) })
  return dimmed
})

// 聚焦模式下不在分支内的连线也应隐藏
const focusDimmedConnectors = computed(() => {
  if (!focusMode.value) return new Set()
  if (selectedIds.value.length === 0) return new Set()
  const branchIds = getBranchIds(selectedElement.value)
  const result = new Set()
  connectors.value.forEach(c => {
    if (branchIds.has(c.from) && branchIds.has(c.to)) result.add(c.id)
  })
  return result
})

// ==================== 工具函数 ====================
function uid() { return 'el_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8) }

// 安全获取元素宽高（文本元素根据文字内容估算尺寸）
function elW(el) {
  if (el.width != null) return el.width
  if (el.type === 'text') return estimateTextWidth(el)
  return 100
}
function elH(el) {
  if (el.height != null) return el.height
  if (el.type === 'text') return estimateTextHeight(el)
  return 60
}

function estimateTextWidth(el) {
  const text = el.text || ''
  if (!text) return 60
  const fontSize = el.size || 16
  const maxWidth = 400
  // 粗略估算：中文字符约 1em，英文约 0.55em，取最长行
  let estWidth = 0
  let lineMax = 0
  for (const ch of text) {
    if (ch === '\n') { lineMax = Math.max(lineMax, estWidth); estWidth = 0; continue }
    estWidth += /[\u4e00-\u9fff\u3000-\u303f\uff00-\uffef]/.test(ch) ? fontSize : fontSize * 0.55
  }
  return Math.min(Math.max(lineMax, estWidth) + 8, maxWidth)
}

function estimateTextHeight(el) {
  const text = el.text || ''
  if (!text) return 20
  const fontSize = el.size || 16
  const lineHeight = fontSize * 1.5
  const maxWidth = 400
  const estWidth = estimateTextWidth(el)
  // 估算行数：如果文本宽度超出最大宽度，需要换行
  const lines = text.split('\n')
  let totalLines = 0
  for (const line of lines) {
    let lineWidth = 0
    for (const ch of line) {
      lineWidth += /[\u4e00-\u9fff\u3000-\u303f\uff00-\uffef]/.test(ch) ? fontSize : fontSize * 0.55
    }
    totalLines += Math.max(1, Math.ceil(lineWidth / maxWidth))
  }
  return totalLines * lineHeight + 4
}

function pushHistory() {
  const snapshot = {
    elements: JSON.parse(JSON.stringify(elements.value)),
    connectors: JSON.parse(JSON.stringify(connectors.value))
  }
  history.value = history.value.slice(0, historyIndex.value + 1)
  history.value.push(snapshot)
  if (history.value.length > maxHistory) history.value.shift()
  historyIndex.value = history.value.length - 1
}

function loadHistory(snapshot) {
  elements.value = snapshot.elements
  connectors.value = snapshot.connectors
  // 重置编辑状态，防止撤销/重做后状态不一致
  editingId.value = null
  creatingId.value = null
  if (connectingFrom.value) {
    document.removeEventListener('mousemove', onConnectionMove)
    document.removeEventListener('mouseup', onConnectionUp)
    connectingFrom.value = null
  }
}

function undo() {
  if (historyIndex.value <= 0) return
  historyIndex.value--
  loadHistory(history.value[historyIndex.value])
  showToast('已撤销', 'info')
  scheduleSave()
}

function redo() {
  if (historyIndex.value >= history.value.length - 1) return
  historyIndex.value++
  loadHistory(history.value[historyIndex.value])
  showToast('已重做', 'info')
  scheduleSave()
}

function scheduleSave() {
  saved.value = false
  resetIdleTimer()
  if (props.autoSave) {
    clearTimeout(scheduleSave._timer)
    scheduleSave._timer = setTimeout(() => {
      emit('save', exportData())
      saved.value = true
    }, 800)
  }
}

function exportData() {
  return {
    elements: JSON.parse(JSON.stringify(elements.value)),
    connectors: JSON.parse(JSON.stringify(connectors.value)),
    viewport: { x: viewportX.value, y: viewportY.value, zoom: zoom.value }
  }
}

function showToast(message, type = 'info') {
  toast.message = message
  toast.type = type
  toast.show = true
  clearTimeout(toast._timer)
  toast._timer = setTimeout(() => { toast.show = false }, 2000)
}

// ==================== 坐标转换 ====================
function screenToCanvas(sx, sy) {
  const rect = viewportRef.value?.getBoundingClientRect()
  if (!rect) return { x: 0, y: 0 }
  return {
    x: (sx - rect.left - viewportX.value) / zoom.value,
    y: (sy - rect.top - viewportY.value) / zoom.value
  }
}

function canvasToScreen(cx, cy) {
  const rect = viewportRef.value?.getBoundingClientRect()
  if (!rect) return { x: 0, y: 0 }
  return {
    x: cx * zoom.value + viewportX.value + rect.left,
    y: cy * zoom.value + viewportY.value + rect.top
  }
}

// ==================== 锚点计算 ====================
function anchorPos(el, axis, side) {
  if (!el) return 0
  const w = elW(el), h = elH(el)
  if (axis === 'x') {
    if (side === 'left') return el.x
    if (side === 'right') return el.x + w
    return el.x + w / 2
  }
  if (side === 'top') return el.y
  if (side === 'bottom') return el.y + h
  return el.y + h / 2
}

function anchorById(id, axis, side) {
  const el = elements.value.find(e => e.id === id)
  return anchorPos(el, axis, side)
}

// ==================== 7. 连线路径 ====================
// ==================== 连接线端点（含箭头缩短） ====================
const ARROW_LEN = 9
function shortenedEndpoint(c) {
  const elFrom = elements.value.find(e => e.id === c.from)
  const elTo = elements.value.find(e => e.id === c.to)
  if (!elFrom || !elTo) return { x: 0, y: 0 }
  const x1 = anchorPos(elFrom, 'x', c.fromSide || 'right')
  const y1 = anchorPos(elFrom, 'y', c.fromSide || 'right')
  const x2 = anchorPos(elTo, 'x', c.toSide || 'left')
  const y2 = anchorPos(elTo, 'y', c.toSide || 'left')
  const angle = Math.atan2(y2 - y1, x2 - x1)
  const totalLen = Math.hypot(x2 - x1, y2 - y1)
  const shorten = Math.min(ARROW_LEN, totalLen * 0.33)
  return {
    x: x2 - shorten * Math.cos(angle),
    y: y2 - shorten * Math.sin(angle)
  }
}

function getConnectorPath(c) {
  const elFrom = elements.value.find(e => e.id === c.from)
  const elTo = elements.value.find(e => e.id === c.to)
  if (!elFrom || !elTo) return ''
  const x1 = anchorPos(elFrom, 'x', c.fromSide || 'right')
  const y1 = anchorPos(elFrom, 'y', c.fromSide || 'right')
  const x2 = anchorPos(elTo, 'x', c.toSide || 'left')
  const y2 = anchorPos(elTo, 'y', c.toSide || 'left')

  if (styleMemory.lineStyle === 'curve') {
    const dx = Math.abs(x2 - x1) * 0.5
    const dy = Math.abs(y2 - y1) * 0.5
    const cp1x = c.fromSide === 'left' ? x1 - dx : c.fromSide === 'right' ? x1 + dx : x1
    const cp1y = c.fromSide === 'top' ? y1 - dy : c.fromSide === 'bottom' ? y1 + dy : y1
    const cp2x = c.toSide === 'left' ? x2 - dx : c.toSide === 'right' ? x2 + dx : x2
    const cp2y = c.toSide === 'top' ? y2 - dy : c.toSide === 'bottom' ? y2 + dy : y2
    // 端点切线方向 = cp2→endpoint 的方向
    const tangentAngle = Math.atan2(y2 - cp2y, x2 - cp2x)
    // 防过短：缩短量不超过总长度的 1/3
    const totalLen = Math.hypot(x2 - x1, y2 - y1)
    const shorten = Math.min(ARROW_LEN, totalLen * 0.33)
    const sx = x2 - shorten * Math.cos(tangentAngle)
    const sy = y2 - shorten * Math.sin(tangentAngle)
    // 控制点也沿切线方向微调
    const scp2x = cp2x + (shorten * 0.3) * Math.cos(tangentAngle)
    const scp2y = cp2y + (shorten * 0.3) * Math.sin(tangentAngle)
    return `M${x1},${y1} C${cp1x},${cp1y} ${scp2x},${scp2y} ${sx},${sy}`
  }

  if (styleMemory.lineStyle === 'polyline') {
    const mx = (x1 + x2) / 2
    // 折线最后一段方向：从 (mx,y2) 到 (x2,y2)
    const lastDx = x2 - mx
    const lastDy = y2 - y2 // 0 for horizontal, but let's handle both cases
    // 判断最后一段是水平还是垂直
    let lastAngle
    if (Math.abs(lastDx) > 1) {
      lastAngle = Math.atan2(0, lastDx) // ±0 or ±PI
    } else {
      // x2 ≈ mx，最后一段是垂直的（当 toSide 是 top/bottom 时）
      lastAngle = Math.atan2(y2 - y1, 0) // ±PI/2
    }
    const totalLen = Math.abs(lastDx) + Math.abs(y2 - y1) + Math.abs(mx - x1)
    const shorten = Math.min(ARROW_LEN, totalLen * 0.2)
    const sx = x2 - shorten * Math.cos(lastAngle)
    const sy = y2 - shorten * Math.sin(lastAngle)
    return `M${x1},${y1} L${mx},${y1} L${mx},${y2} L${sx},${sy}`
  }

  // straight
  const angle = Math.atan2(y2 - y1, x2 - x1)
  const totalLen = Math.hypot(x2 - x1, y2 - y1)
  const shorten = Math.min(ARROW_LEN, totalLen * 0.33)
  const sx = x2 - shorten * Math.cos(angle)
  const sy = y2 - shorten * Math.sin(angle)
  return `M${x1},${y1} L${sx},${sy}`
}

function setLineStyle(style) {
  styleMemory.lineStyle = style
  scheduleSave()
}

// ==================== 连接线中点计算 ====================
function getConnectorMidpoint(c) {
  const elFrom = elements.value.find(e => e.id === c.from)
  const elTo = elements.value.find(e => e.id === c.to)
  if (!elFrom || !elTo) return null
  const x1 = anchorPos(elFrom, 'x', c.fromSide || 'right')
  const y1 = anchorPos(elFrom, 'y', c.fromSide || 'right')
  const x2 = anchorPos(elTo, 'x', c.toSide || 'left')
  const y2 = anchorPos(elTo, 'y', c.toSide || 'left')

  if (styleMemory.lineStyle === 'curve') {
    const dx = Math.abs(x2 - x1) * 0.5
    const dy = Math.abs(y2 - y1) * 0.5
    const cp1x = c.fromSide === 'left' ? x1 - dx : c.fromSide === 'right' ? x1 + dx : x1
    const cp1y = c.fromSide === 'top' ? y1 - dy : c.fromSide === 'bottom' ? y1 + dy : y1
    const cp2x = c.toSide === 'left' ? x2 - dx : c.toSide === 'right' ? x2 + dx : x2
    const cp2y = c.toSide === 'top' ? y2 - dy : c.toSide === 'bottom' ? y2 + dy : y2
    // 贝塞尔曲线 t=0.5 的中点
    const t = 0.5
    const mt = 1 - t
    return {
      x: mt * mt * mt * x1 + 3 * mt * mt * t * cp1x + 3 * mt * t * t * cp2x + t * t * t * x2,
      y: mt * mt * mt * y1 + 3 * mt * mt * t * cp1y + 3 * mt * t * t * cp2y + t * t * t * y2
    }
  }

  if (styleMemory.lineStyle === 'polyline') {
    const mx = (x1 + x2) / 2
    // 折线路径: (x1,y1) → (mx,y1) → (mx,y2) → (x2,y2)
    // 计算路径总长度，取中点
    const seg1 = Math.abs(mx - x1)
    const seg2 = Math.abs(y2 - y1)
    const seg3 = Math.abs(x2 - mx)
    const totalLen = seg1 + seg2 + seg3
    const halfLen = totalLen / 2
    if (halfLen <= seg1) {
      return { x: x1 + (mx > x1 ? halfLen : -halfLen), y: y1 }
    } else if (halfLen <= seg1 + seg2) {
      const dy = halfLen - seg1
      return { x: mx, y: y1 + (y2 > y1 ? dy : -dy) }
    } else {
      const dx = halfLen - seg1 - seg2
      return { x: mx + (x2 > mx ? dx : -dx), y: y2 }
    }
  }

  // straight
  return { x: (x1 + x2) / 2, y: (y1 + y2) / 2 }
}

function deleteConnector(c) {
  pushHistory()
  connectors.value = connectors.value.filter(conn => conn.id !== c.id)
  selectedIds.value = selectedIds.value.filter(id => id !== c.id)
  midpointConnectorId.value = null
  scheduleSave()
  showToast('连线已删除', 'info')
}

function splitConnectorAtMidpoint(c) {
  const mid = getConnectorMidpoint(c)
  if (!mid) return
  const elFrom = elements.value.find(e => e.id === c.from)
  const elTo = elements.value.find(e => e.id === c.to)
  if (!elFrom || !elTo) return

  pushHistory()

  // 检测中点附近是否已有节点，避免重叠
  const NODE_MIN_DIST = 80
  let nodeX = mid.x - 80
  let nodeY = mid.y - 50
  const overlapping = elements.value.find(el => {
    const cx = el.x + elW(el) / 2
    const cy = el.y + elH(el) / 2
    return Math.abs(cx - mid.x) < NODE_MIN_DIST && Math.abs(cy - mid.y) < NODE_MIN_DIST
  })
  if (overlapping) {
    // 偏移到右下角避免重叠
    nodeX = overlapping.x + elW(overlapping) + 20
    nodeY = overlapping.y + 20
  }

  // 创建新节点
  const newNodeId = uid()
  const newNode = {
    id: newNodeId, type: 'note', x: nodeX, y: nodeY,
    width: 160, height: 100, text: '',
    color: styleMemory.lastColor, size: 16,
    locked: false, collapsed: false, _hoverScale: false
  }
  elements.value.push(newNode)

  // 删除旧连线
  connectors.value = connectors.value.filter(conn => conn.id !== c.id)

  // 创建两条新连线: from → newNode, newNode → to
  const fromSide = c.fromSide || 'right'
  const toSide = c.toSide || 'left'
  const newFromSide = getClosestSide(elFrom, newNode)
  const newToSide = getClosestSide(newNode, elTo)

  connectors.value.push({
    id: uid(),
    from: c.from, to: newNodeId,
    fromSide: newFromSide, toSide: getClosestSideForTarget(newNode, elFrom),
    color: c.color || styleMemory.lastConnectorColor
  })
  connectors.value.push({
    id: uid(),
    from: newNodeId, to: c.to,
    fromSide: getClosestSideForTarget(newNode, elTo), toSide: newToSide,
    color: c.color || styleMemory.lastConnectorColor
  })

  midpointConnectorId.value = null
  selectedIds.value = [newNodeId]
  scheduleSave()
  showToast('节点已添加', 'info')
}

// 辅助：计算从源元素到目标元素的最佳连接面
function getClosestSideForTarget(fromEl, toEl) {
  return getClosestSide(fromEl, toEl)
}

// 检测鼠标是否靠近连接线中点
const MIDPOINT_HIT_RADIUS = 14 // 命中半径（屏幕像素）
function updateMidpointProximity(screenX, screenY) {
  if (editingId.value || isDragging.value || connectingFrom.value) {
    midpointConnectorId.value = null
    return
  }
  const rect = viewportRef.value?.getBoundingClientRect()
  if (!rect) return

  let closestDist = Infinity
  let closestId = null
  let closestScreenX = 0
  let closestScreenY = 0

  for (const c of visibleConnectors.value) {
    const mid = getConnectorMidpoint(c)
    if (!mid) continue
    // 转换为屏幕坐标
    const sx = mid.x * zoom.value + viewportX.value
    const sy = mid.y * zoom.value + viewportY.value
    const dx = screenX - sx
    const dy = screenY - sy
    const dist = Math.sqrt(dx * dx + dy * dy)
    if (dist < MIDPOINT_HIT_RADIUS && dist < closestDist) {
      closestDist = dist
      closestId = c.id
      closestScreenX = sx
      closestScreenY = sy
    }
  }

  if (closestId) {
    midpointConnectorId.value = closestId
    midpointScreenX.value = closestScreenX - 12
    midpointScreenY.value = closestScreenY - 12
  } else {
    midpointConnectorId.value = null
  }
}

// ==================== 5. 折叠/展开 ====================
function getParentChildMap() {
  const map = {}
  for (const c of connectors.value) {
    if (!map[c.from]) map[c.from] = []
    map[c.from].push(c.to)
  }
  return map
}

function getDescendantIds(elId, visited = new Set()) {
  if (visited.has(elId)) return []
  visited.add(elId)
  const map = getParentChildMap()
  const children = map[elId] || []
  const result = []
  for (const childId of children) {
    result.push(childId)
    result.push(...getDescendantIds(childId, visited))
  }
  return result
}

function getDescendantCount(elId) {
  return getDescendantIds(elId).length
}

function getAncestorIds(elId, visited = new Set()) {
  if (visited.has(elId)) return []
  visited.add(elId)
  const result = []
  for (const c of connectors.value) {
    if (c.to === elId && !visited.has(c.from)) {
      result.push(c.from)
      result.push(...getAncestorIds(c.from, visited))
    }
  }
  return result
}

function toggleCollapse(el) {
  pushHistory()
  el.collapsed = !el.collapsed
  scheduleSave()
}

function expandAll() {
  pushHistory()
  elements.value.forEach(e => { e.collapsed = false })
  scheduleSave()
}

function collapseAll() {
  pushHistory()
  const map = getParentChildMap()
  const allChildIds = new Set()
  for (const children of Object.values(map)) {
    children.forEach(id => allChildIds.add(id))
  }
  elements.value.forEach(e => {
    e.collapsed = !allChildIds.has(e.id)
  })
  scheduleSave()
}

// ==================== 6. 自动布局 ====================
function applyLayout(direction) {
  treeLayout.value = direction
  const map = getParentChildMap()
  const allChildIds = new Set()
  for (const children of Object.values(map)) {
    children.forEach(id => allChildIds.add(id))
  }
  const rootIds = elements.value.filter(e => !allChildIds.has(e.id)).map(e => e.id)

  if (rootIds.length === 0 && elements.value.length > 0) {
    rootIds.push(elements.value[0].id)
  }

  const H_GAP = 60
  const V_GAP = 40
  const NODE_W = 160
  const NODE_H = 100

  function layoutSubtree(parentId, startX, startY) {
    const parent = elements.value.find(e => e.id === parentId)
    if (!parent) return startY

    const children = (map[parentId] || []).filter(id => {
      const ch = elements.value.find(e => e.id === id)
      return ch && !ch.locked
    })

    if (children.length === 0) {
      if (direction === 'right') {
        parent.x = startX
        parent.y = startY
      } else if (direction === 'down') {
        parent.x = startX
        parent.y = startY
      }
      return direction === 'right' ? startY + NODE_H + V_GAP : startX + NODE_W + H_GAP
    }

    let totalSpan = 0
    const childPositions = []

    if (direction === 'radial') {
      const radius = 120 + children.length * 20
      const angleStep = (2 * Math.PI) / children.length
      parent.x = startX
      parent.y = startY
      children.forEach((childId, i) => {
        const angle = -Math.PI / 2 + i * angleStep
        const ch = elements.value.find(e => e.id === childId)
        if (ch) {
          ch.x = parent.x + elW(parent) / 2 + Math.cos(angle) * radius - elW(ch) / 2
          ch.y = parent.y + elH(parent) / 2 + Math.sin(angle) * radius - elH(ch) / 2
        }
      })
      return startY
    }

    if (direction === 'right') {
      parent.x = startX
      let cy = startY
      children.forEach((childId) => {
        const ch = elements.value.find(e => e.id === childId)
        if (ch) {
          ch.x = startX + NODE_W + H_GAP
          ch.y = cy
          childPositions.push({ id: childId, y: cy })
          const span = layoutSubtree(childId, ch.x, ch.y)
          cy = span
        }
      })
      totalSpan = Math.max(cy, startY + NODE_H + V_GAP)
      const midY = (startY + totalSpan - NODE_H) / 2
      parent.y = midY
    } else if (direction === 'down') {
      parent.y = startY
      let cx = startX
      children.forEach((childId) => {
        const ch = elements.value.find(e => e.id === childId)
        if (ch) {
          ch.x = cx
          ch.y = startY + NODE_H + V_GAP
          childPositions.push({ id: childId, x: cx })
          const span = layoutSubtree(childId, ch.x, ch.y)
          cx = span
        }
      })
      totalSpan = Math.max(cx, startX + NODE_W + H_GAP)
      const midX = (startX + totalSpan - NODE_W) / 2
      parent.x = midX
    }

    return totalSpan
  }

  let baseY = 100
  rootIds.forEach((rootId) => {
    baseY = layoutSubtree(rootId, 200, baseY)
  })

  pushHistory()
  scheduleSave()
}

// ==================== 11. 聚焦模式 ====================
function toggleFocusMode() {
  focusMode.value = !focusMode.value
  if (!focusMode.value) {
    // cleared
  }
}

function getBranchIds(el) {
  if (!el) return new Set()
  const result = new Set()
  result.add(el.id)
  getAncestorIds(el.id).forEach(id => result.add(id))
  getDescendantIds(el.id).forEach(id => result.add(id))
  // Also include connectors
  for (const c of connectors.value) {
    if (result.has(c.from) || result.has(c.to)) {
      result.add(c.from)
      result.add(c.to)
    }
  }
  return result
}

// ==================== 10. 视图快照 ====================
function saveViewSnapshot() {
  viewSnapshots.value.push({
    x: viewportX.value,
    y: viewportY.value,
    zoom: zoom.value
  })
  showToast('视图已保存', 'info')
}

function restoreViewSnapshot() {
  if (viewSnapshots.value.length === 0) return
  const snap = viewSnapshots.value.pop()
  viewportX.value = snap.x
  viewportY.value = snap.y
  zoom.value = snap.zoom
  showToast('视图已恢复', 'info')
}

// ==================== 9. 小地图 ====================
function minimapStyle(el) {
  const bounds = getElementsBounds()
  if (!bounds) return { display: 'none' }
  const scale = 160 / Math.max(bounds.w, bounds.h, 1)
  return {
    left: ((el.x - bounds.minX) * scale) + 'px',
    top: ((el.y - bounds.minY) * scale) + 'px',
    width: Math.max(elW(el) * scale, 2) + 'px',
    height: Math.max(elH(el) * scale, 2) + 'px'
  }
}

function minimapViewportStyle() {
  const bounds = getElementsBounds()
  if (!bounds) return { display: 'none' }
  const scale = 160 / Math.max(bounds.w, bounds.h, 1)
  const rect = viewportRef.value?.getBoundingClientRect()
  if (!rect) return { display: 'none' }
  return {
    left: ((-viewportX.value / zoom.value - bounds.minX) * scale) + 'px',
    top: ((-viewportY.value / zoom.value - bounds.minY) * scale) + 'px',
    width: (rect.width / zoom.value * scale) + 'px',
    height: (rect.height / zoom.value * scale) + 'px'
  }
}

function getElementsBounds() {
  if (elements.value.length === 0) return null
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
  elements.value.forEach(el => {
    if (el.x < minX) minX = el.x
    if (el.y < minY) minY = el.y
    const r = el.x + elW(el)
    const b = el.y + elH(el)
    if (r > maxX) maxX = r
    if (b > maxY) maxY = b
  })
  return { minX, minY, maxX, maxY, w: maxX - minX + 200, h: maxY - minY + 200 }
}

function onMinimapMouseDown(e) {
  if (editingId.value) return
  const bounds = getElementsBounds()
  if (!bounds) return
  const scale = 160 / Math.max(bounds.w, bounds.h, 1)
  const rect = viewportRef.value?.getBoundingClientRect()
  if (!rect) return
  const targetX = -(e.offsetX / scale + bounds.minX) * zoom.value + rect.width / 2
  const targetY = -(e.offsetY / scale + bounds.minY) * zoom.value + rect.height / 2
  viewportX.value = targetX
  viewportY.value = targetY

  const onMove = (me) => {
    const t = minimapCanvasRef.value?.getBoundingClientRect()
    if (!t) return
    const ox = me.clientX - t.left
    const oy = me.clientY - t.top
    viewportX.value = -(ox / scale + bounds.minX) * zoom.value + rect.width / 2
    viewportY.value = -(oy / scale + bounds.minY) * zoom.value + rect.height / 2
  }
  const onUp = () => {
    document.removeEventListener('mousemove', onMove)
    document.removeEventListener('mouseup', onUp)
  }
  document.addEventListener('mousemove', onMove)
  document.addEventListener('mouseup', onUp)
}

// ==================== 工具切换 ====================
function useTool(toolId) {
  activeTool.value = toolId
  if (connectingFrom.value) {
    document.removeEventListener('mousemove', onConnectionMove)
    document.removeEventListener('mouseup', onConnectionUp)
    connectingFrom.value = null
  }
}

// ==================== 元素操作 ====================
function addElement(type, x, y, extra = {}) {
  pushHistory()
  const id = uid()
  const base = {
    id, type, x, y, text: '',
    width: type === 'text' ? 80 : (extra.width || 160),
    height: type === 'text' ? 22 : (extra.height || 100),
    size: extra.size || styleMemory.lastSize,
    color: extra.color || (type === 'note' ? styleMemory.lastColor : (type === 'rect' ? styleMemory.lastRectColor : '#1e293b')),
    locked: false,
    collapsed: false,
    _hoverScale: false
  }
  elements.value.push(base)
  selectedIds.value = [id]
  creatingId.value = id
  scheduleSave()
  return base
}

function startEditText(el) {
  if (el.locked) return
  // 图片元素：打开文件选择器上传图片
  if (el.type === 'image') {
    uploadImage(el)
    return
  }
  editingId.value = el.id
  // 保存编辑前的文本，用于 finishEdit 时判断是否需要记录历史
  startEditText._savedText = el.text
  nextTick(() => {
    if (el.type === 'text' && editingInput.value) {
      editingInput.value.focus()
      editingInput.value.select()
    } else if (el.type === 'note' && editingNoteArea.value) {
      editingNoteArea.value.focus()
    }
  })
}

async function uploadImage(el) {
  const input = document.createElement('input')
  input.type = 'file'
  input.accept = 'image/*'
  input.onchange = async () => {
    const file = input.files?.[0]
    if (!file) return
    const formData = new FormData()
    formData.append('image', file)
    try {
      const res = await fetch('/api/board/upload-image', { method: 'POST', body: formData })
      const data = await res.json()
      if (data.imagePath) {
        pushHistory()
        el.src = '/' + data.imagePath
        el.text = file.name
        scheduleSave()
        showToast('图片上传成功', 'success')
      } else {
        showToast('上传失败: ' + (data.error || '未知错误'), 'error')
      }
    } catch (err) {
      showToast('上传失败: ' + err.message, 'error')
    }
  }
  input.click()
}

function finishEdit() {
  if (!editingId.value) return
  // 防止 blur 和 onViewportMouseDown 重复调用
  if (finishEdit._running) return
  finishEdit._running = true

  const el = elements.value.find(e => e.id === editingId.value)
  // 仅当文本确实有变化时才记录历史（空文本不再删除元素，保留用户可能继续编辑的意图）
  if (el && el.text !== startEditText._savedText) {
    pushHistory()
    scheduleSave()
  }
  // 测量文本元素实际渲染尺寸，存入画布坐标（用于锚点精准定位）
  if (el && el.type === 'text' && editingInput.value) {
    const inputRect = editingInput.value.getBoundingClientRect()
    el.width = Math.max(inputRect.width / zoom.value, 20)
    el.height = Math.max(inputRect.height / zoom.value, 16)
  }

  editingId.value = null
  creatingId.value = null
  // 切回 pan 模式，恢复 grab 光标，保证编辑完成后可以正常拖拽/选择
  activeTool.value = 'pan'

  finishEdit._running = false
}

function deleteSelected() {
  if (editingId.value) return
  const ids = new Set(selectedIds.value)
  if (ids.size === 0) return
  // 锁定元素不可删除
  const hasLocked = elements.value.some(e => ids.has(e.id) && e.locked)
  if (hasLocked) {
    showToast('选中包含锁定元素，已跳过', 'error')
    ids.forEach(id => {
      const el = elements.value.find(e => e.id === id)
      if (el && el.locked) ids.delete(id)
    })
    if (ids.size === 0) return
  }
  // 二次确认：首次按 Delete 显示提示，2秒内再次按 Delete 确认删除
  const idsKey = [...ids].sort().join(',')
  if (!deleteSelected._pendingKey || deleteSelected._pendingKey !== idsKey) {
    deleteSelected._pendingKey = idsKey
    showToast('再按一次 Delete 确认删除 ' + ids.size + ' 个元素（Ctrl+Z 可撤销）', 'error')
    setTimeout(() => { deleteSelected._pendingKey = null }, 2000)
    return
  }
  deleteSelected._pendingKey = null
  pushHistory()
  elements.value = elements.value.filter(e => !ids.has(e.id))
  connectors.value = connectors.value.filter(c => !ids.has(c.from) && !ids.has(c.to))
  selectedIds.value = []
  scheduleSave()
  showToast('已删除 ' + ids.size + ' 个元素', 'info')
}

function toggleLock(el) {
  pushHistory()
  el.locked = !el.locked
  if (el.locked) {
    selectedIds.value = selectedIds.value.filter(id => id !== el.id)
  }
  scheduleSave()
}

// ==================== 对齐 ====================
function alignElements(type) {
  const els = elements.value.filter(e => selectedIds.value.includes(e.id) && !e.locked)
  if (els.length < 2) return
  pushHistory()
  if (type === 'left') {
    const minX = Math.min(...els.map(e => e.x))
    els.forEach(e => { e.x = minX })
  } else if (type === 'centerH') {
    const centers = els.map(e => e.x + elW(e) / 2)
    const avg = centers.reduce((a, b) => a + b, 0) / centers.length
    els.forEach(e => { e.x = avg - elW(e) / 2 })
  } else if (type === 'right') {
    const maxR = Math.max(...els.map(e => e.x + elW(e)))
    els.forEach(e => { e.x = maxR - elW(e) })
  } else if (type === 'top') {
    const minY = Math.min(...els.map(e => e.y))
    els.forEach(e => { e.y = minY })
  } else if (type === 'centerV') {
    const centers = els.map(e => e.y + elH(e) / 2)
    const avg = centers.reduce((a, b) => a + b, 0) / centers.length
    els.forEach(e => { e.y = avg - elH(e) / 2 })
  } else if (type === 'bottom') {
    const maxB = Math.max(...els.map(e => e.y + elH(e)))
    els.forEach(e => { e.y = maxB - elH(e) })
  } else if (type === 'distH') {
    const sorted = els.sort((a, b) => a.x - b.x)
    const first = sorted[0]
    const last = sorted[sorted.length - 1]
    if (sorted.length <= 2) return
    const totalSpace = last.x - first.x
    const step = totalSpace / (sorted.length - 1)
    sorted.forEach((e, i) => { if (i > 0 && i < sorted.length - 1) e.x = first.x + step * i })
  } else if (type === 'distV') {
    const sorted = els.sort((a, b) => a.y - b.y)
    const first = sorted[0]
    const last = sorted[sorted.length - 1]
    if (sorted.length <= 2) return
    const totalSpace = last.y - first.y
    const step = totalSpace / (sorted.length - 1)
    sorted.forEach((e, i) => { if (i > 0 && i < sorted.length - 1) e.y = first.y + step * i })
  }
  scheduleSave()
}

// ==================== 连线操作 ====================
function startConnection(side, e) {
  // 先清理已有连线事件监听器
  document.removeEventListener('mousemove', onConnectionMove)
  document.removeEventListener('mouseup', onConnectionUp)
  connectingFrom.value = selectedElement.value
  connectingFromSide.value = side
  connectingToX.value = e.clientX
  connectingToY.value = e.clientY
  const rect = viewportRef.value?.getBoundingClientRect()
  if (rect) {
    connectingToScreenX.value = e.clientX - rect.left
    connectingToScreenY.value = e.clientY - rect.top
  }
  activeTool.value = 'connect'
  document.addEventListener('mousemove', onConnectionMove)
  document.addEventListener('mouseup', onConnectionUp)
}

// 连线模式下点击目标元素锚点，直接完成连线
function connectToTarget(targetEl, side) {
  if (!connectingFrom.value || targetEl.id === connectingFrom.value.id) return
  pushHistory()
  connectors.value.push({
    id: uid(),
    from: connectingFrom.value.id,
    to: targetEl.id,
    fromSide: connectingFromSide.value,
    toSide: side,
    color: styleMemory.lastConnectorColor
  })
  scheduleSave()
  document.removeEventListener('mousemove', onConnectionMove)
  document.removeEventListener('mouseup', onConnectionUp)
  connectingFrom.value = null
  activeTool.value = 'pan'
}

function onConnectionMove(e) {
  connectingToX.value = e.clientX
  connectingToY.value = e.clientY
  const rect = viewportRef.value?.getBoundingClientRect()
  if (rect) {
    connectingToScreenX.value = e.clientX - rect.left
    connectingToScreenY.value = e.clientY - rect.top
  }
}

function onConnectionUp(e) {
  document.removeEventListener('mousemove', onConnectionMove)
  document.removeEventListener('mouseup', onConnectionUp)
  const pos = screenToCanvas(e.clientX, e.clientY)
  const target = elements.value.find(el => {
    return el.id !== connectingFrom.value?.id &&
      !el.locked &&
      pos.x >= el.x && pos.x <= el.x + elW(el) &&
      pos.y >= el.y && pos.y <= el.y + elH(el)
  })
  if (target) {
    pushHistory()
    const side = getClosestSide(connectingFrom.value, target)
    connectors.value.push({
      id: uid(),
      from: connectingFrom.value.id,
      to: target.id,
      fromSide: connectingFromSide.value,
      toSide: side,
      color: styleMemory.lastConnectorColor
    })
    scheduleSave()
  }
  connectingFrom.value = null
  activeTool.value = 'pan'
}

function getClosestSide(fromEl, toEl) {
  const fromCX = fromEl.x + elW(fromEl) / 2
  const fromCY = fromEl.y + elH(fromEl) / 2
  const toCX = toEl.x + elW(toEl) / 2
  const toCY = toEl.y + elH(toEl) / 2
  const dx = toCX - fromCX
  const dy = toCY - fromCY
  if (Math.abs(dx) > Math.abs(dy)) return dx > 0 ? 'left' : 'right'
  return dy > 0 ? 'top' : 'bottom'
}

function quickAddChild() {
  const parent = selectedElement.value
  if (!parent) return
  // 统计已有子节点数量，自动偏移避免重叠
  const existingChildren = connectors.value.filter(c => c.from === parent.id).length
  const id = uid()
  pushHistory()
  const childX = parent.x + elW(parent) + 60
  const childY = parent.y + existingChildren * (elH(parent) + 20)
  const isText = parent.type === 'text'
  const child = {
    id, type: parent.type, x: childX, y: childY,
    width: isText ? undefined : (parent.width || 160),
    height: isText ? undefined : (parent.height || 100),
    text: '', color: parent.color || (isText ? '#1e293b' : 'yellow'),
    size: parent.size || 16, locked: false, collapsed: false, _hoverScale: false
  }
  elements.value.push(child)
  connectors.value.push({
    id: uid(),
    from: parent.id, to: child.id,
    fromSide: 'right', toSide: 'left',
    color: styleMemory.lastConnectorColor
  })
  selectedIds.value = [id]
  editingId.value = id
  creatingId.value = id
  startEditText._savedText = ''
  scheduleSave()
  nextTick(() => {
    if (child.type === 'text' && editingInput.value) {
      editingInput.value.focus()
    } else if (child.type === 'note' && editingNoteArea.value) {
      editingNoteArea.value.focus()
    }
  })
}

// ==================== 鼠标事件 ====================
function onViewportMouseDown(e) {
  // 安全清理残留标志（防止因 click 未触发而残留）
  justDrew.value = false
  justSelected.value = false
  // 编辑中点击空白区域：先完成编辑
  if (editingId.value) {
    finishEdit()
    return
  }
  // 中键：始终平移
  if (e.button === 1) {
    isPanning.value = true
    dragStart.value = { x: e.clientX - viewportX.value, y: e.clientY - viewportY.value }
    return
  }
  if (e.button === 0 && activeTool.value === 'connect') {
    // 连线模式下点击空白区域取消连线，并切回 pan 模式
    if (connectingFrom.value) {
      document.removeEventListener('mousemove', onConnectionMove)
      document.removeEventListener('mouseup', onConnectionUp)
      connectingFrom.value = null
    }
    activeTool.value = 'pan'
    return
  }
  // 拖拽绘制：rect / note
  if (e.button === 0 && (activeTool.value === 'rect' || activeTool.value === 'note')) {
    const rect = viewportRef.value?.getBoundingClientRect()
    if (!rect) return
    drawingShape.value = {
      type: activeTool.value,
      startX: e.clientX - rect.left,
      startY: e.clientY - rect.top,
      currentX: e.clientX - rect.left,
      currentY: e.clientY - rect.top
    }
    window._lastClickX = e.clientX
    window._lastClickY = e.clientY
    document.addEventListener('mousemove', onDrawMove)
    document.addEventListener('mouseup', onDrawUp)
    return
  }
  // 左键空白区域：框选（pan 模式或默认模式）
  if (e.button === 0) {
    isSelecting.value = true
    const rect = viewportRef.value?.getBoundingClientRect()
    if (rect) {
      selectionRect.value = { x: e.clientX - rect.left, y: e.clientY - rect.top, w: 0, h: 0 }
      dragStart.value = { x: e.clientX - rect.left, y: e.clientY - rect.top }
    }
    document.addEventListener('mousemove', onSelectMove)
    document.addEventListener('mouseup', onSelectUp)
  }
}

function onViewportMouseMove(e) {
  if (editingId.value) return
  resetIdleTimer()
  if (isPanning.value) {
    viewportX.value = e.clientX - dragStart.value.x
    viewportY.value = e.clientY - dragStart.value.y
    return
  }
  // 跟踪鼠标画布坐标，用于连接线中点检测
  const rect = viewportRef.value?.getBoundingClientRect()
  if (rect) {
    const canvasPos = screenToCanvas(e.clientX, e.clientY)
    mouseCanvasX.value = canvasPos.x
    mouseCanvasY.value = canvasPos.y
    updateMidpointProximity(e.clientX - rect.left, e.clientY - rect.top)
  }
}

// 拖拽绘制专用 mousemove（document 级别）
function onDrawMove(e) {
  if (!drawingShape.value) return
  const rect = viewportRef.value?.getBoundingClientRect()
  if (!rect) return
  drawingShape.value.currentX = e.clientX - rect.left
  drawingShape.value.currentY = e.clientY - rect.top
}

// 框选专用 mousemove（document 级别）
function onSelectMove(e) {
  if (!isSelecting.value || !selectionRect.value) return
  const rect = viewportRef.value?.getBoundingClientRect()
  if (!rect) return
  const cx = e.clientX - rect.left
  const cy = e.clientY - rect.top
  selectionRect.value.w = cx - dragStart.value.x
  selectionRect.value.h = cy - dragStart.value.y
  if (selectionRect.value.w < 0) {
    selectionRect.value.x = cx
    selectionRect.value.w = Math.abs(selectionRect.value.w)
  }
  if (selectionRect.value.h < 0) {
    selectionRect.value.y = cy
    selectionRect.value.h = Math.abs(selectionRect.value.h)
  }
}

function onViewportMouseUp(e) {
  if (isPanning.value) {
    isPanning.value = false
    startPanInertia()
    return
  }
}

// 拖拽绘制专用 mouseup（document 级别）
function onDrawUp(e) {
  document.removeEventListener('mousemove', onDrawMove)
  document.removeEventListener('mouseup', onDrawUp)
  if (!drawingShape.value) return
  const ds = drawingShape.value
  const p1 = screenToCanvas(ds.startX, ds.startY)
  const p2 = screenToCanvas(ds.currentX, ds.currentY)
  const x = Math.min(p1.x, p2.x)
  const y = Math.min(p1.y, p2.y)
  const w = Math.abs(p2.x - p1.x)
  const h = Math.abs(p2.y - p1.y)
  if (w > 5 && h > 5) {
    addElement(ds.type, x, y, {
      width: ds.type === 'note' ? Math.max(w, 120) : w,
      height: ds.type === 'note' ? Math.max(h, 100) : h
    })
    justDrew.value = true
  } else {
    const pos = screenToCanvas(ds.startX, ds.startY)
    addElement(ds.type, pos.x - 80, pos.y - 50)
    justDrew.value = true
  }
  drawingShape.value = null
  activeTool.value = 'pan'
}

// 框选专用 mouseup（document 级别）
function onSelectUp(e) {
  document.removeEventListener('mousemove', onSelectMove)
  document.removeEventListener('mouseup', onSelectUp)
  if (!isSelecting.value || !selectionRect.value) return
  isSelecting.value = false
  const rect = selectionRect.value
  if (rect.w > 5 || rect.h > 5) {
    const sel = elements.value.filter(el => {
      const elR = el.x + elW(el)
      const elB = el.y + elH(el)
      const sr = screenToCanvas(rect.x, rect.y)
      const er = screenToCanvas(rect.x + rect.w, rect.y + rect.h)
      return el.x < er.x && elR > sr.x && el.y < er.y && elB > sr.y && !el.locked
    })
    if (e.ctrlKey || e.metaKey) {
      sel.forEach(el => {
        if (!selectedIds.value.includes(el.id)) selectedIds.value.push(el.id)
      })
    } else {
      selectedIds.value = sel.map(el => el.id)
    }
    justSelected.value = true
  }
  selectionRect.value = null
}

function onViewportClick() {
  if (justDrew.value) {
    justDrew.value = false
    return
  }
  if (justSelected.value) {
    justSelected.value = false
    return
  }
  // 格式刷模式下点击空白区域清除格式刷
  if (formatBrush.value) {
    formatBrush.value = null
    showToast('格式刷已取消', 'info')
    return
  }
  // 点击空白区域取消选择（所有模式）
  if (selectedIds.value.length > 0) {
    selectedIds.value = []
    scheduleSave()
  }
  // 仅双击新建元素，单击不创建
}

function onViewportDblClick(e) {
  // 连线模式下双击不创建元素
  if (connectingFrom.value) return
  // 防抖：300ms 内重复双击忽略
  const now = Date.now()
  if (onViewportDblClick._last && now - onViewportDblClick._last < 300) return
  onViewportDblClick._last = now
  const rect = viewportRef.value?.getBoundingClientRect()
  if (!rect) return
  const pos = screenToCanvas(e.clientX, e.clientY)
  if (activeTool.value === 'note') {
    addElement('note', pos.x - 80, pos.y - 50)
    const newEl = elements.value[elements.value.length - 1]
    editingId.value = newEl.id
    startEditText._savedText = ''
    nextTick(() => {
      if (editingNoteArea.value) editingNoteArea.value.focus()
    })
  } else if (activeTool.value === 'text') {
    addElement('text', pos.x, pos.y)
    const newEl = elements.value[elements.value.length - 1]
    editingId.value = newEl.id
    startEditText._savedText = ''
    nextTick(() => {
      if (editingInput.value) editingInput.value.focus()
    })
  } else if (activeTool.value === 'rect') {
    addElement('rect', pos.x - 80, pos.y - 50)
  } else if (activeTool.value === 'image') {
    addElement('image', pos.x - 80, pos.y - 50)
  } else {
    // pan 或 connect 模式下双击空白处：默认创建便签
    addElement('note', pos.x - 80, pos.y - 50)
    const newEl = elements.value[elements.value.length - 1]
    editingId.value = newEl.id
    startEditText._savedText = ''
    nextTick(() => {
      if (editingNoteArea.value) editingNoteArea.value.focus()
    })
  }
  // 创建元素后切回 pan 模式，避免光标保持 crosshair
  activeTool.value = 'pan'
}

// ==================== 元素鼠标事件 ====================
function onElementMouseDown(el, e) {
  // 编辑中点击其他元素：先完成编辑
  if (editingId.value && editingId.value !== el.id) {
    finishEdit()
  }
  // 锁定元素：允许选中，禁止拖拽和编辑
  if (el.locked) {
    if (e.button === 0) {
      const isSelected = selectedIds.value.includes(el.id)
      if (e.ctrlKey || e.metaKey) {
        if (isSelected) {
          selectedIds.value = selectedIds.value.filter(id => id !== el.id)
        } else {
          selectedIds.value.push(el.id)
        }
      } else {
        if (!isSelected) selectedIds.value = [el.id]
      }
    }
    return
  }
  // 点击元素内的 textarea/input 时不启动拖拽（让用户正常编辑文字）
  if (e.target.tagName === 'TEXTAREA' || e.target.tagName === 'INPUT') return
  // 连线元素不支持拖拽，仅支持选中（通过 from/to 属性识别）
  if (el.from && el.to) {
    if (e.button === 0) {
      const isSelected = selectedIds.value.includes(el.id)
      if (e.ctrlKey || e.metaKey) {
        if (isSelected) {
          selectedIds.value = selectedIds.value.filter(id => id !== el.id)
        } else {
          selectedIds.value.push(el.id)
        }
      } else {
        if (!isSelected) selectedIds.value = [el.id]
      }
    }
    return
  }
  if (activeTool.value === 'connect') {
    if (!connectingFrom.value) {
      connectingFrom.value = el
      connectingFromSide.value = 'right'
      connectingToX.value = e.clientX
      connectingToY.value = e.clientY
      const rect = viewportRef.value?.getBoundingClientRect()
      if (rect) {
        connectingToScreenX.value = e.clientX - rect.left
        connectingToScreenY.value = e.clientY - rect.top
      }
      document.addEventListener('mousemove', onConnectionMove)
      document.addEventListener('mouseup', onConnectionUp)
    } else {
      const target = el
      if (target.id !== connectingFrom.value.id) {
        pushHistory()
        const side = getClosestSide(connectingFrom.value, target)
        connectors.value.push({
          id: uid(),
          from: connectingFrom.value.id,
          to: target.id,
          fromSide: connectingFromSide.value,
          toSide: side,
          color: styleMemory.lastConnectorColor
        })
        scheduleSave()
      }
      // 点击自身或完成连线后都清理并切回 pan
      document.removeEventListener('mousemove', onConnectionMove)
      document.removeEventListener('mouseup', onConnectionUp)
      connectingFrom.value = null
      activeTool.value = 'pan'
    }
    return
  }

  if (e.button === 0) {
    // 格式刷
    if (formatBrush.value) {
      applyFormatBrush(el)
      return
    }

    const isSelected = selectedIds.value.includes(el.id)
    if (e.ctrlKey || e.metaKey) {
      if (isSelected) {
        selectedIds.value = selectedIds.value.filter(id => id !== el.id)
      } else {
        selectedIds.value.push(el.id)
      }
    } else {
      if (!isSelected) {
        selectedIds.value = [el.id]
      }
    }

    // 1. Drag threshold - 清除所有 hover 状态，防止便签 scale(1.08) 导致拖拽跳动
    elements.value.forEach(el => { el._hoverScale = false })
    isDragging.value = true
    dragStart.value = { x: e.clientX, y: e.clientY }
    dragStartScreenX.value = e.clientX
    dragStartScreenY.value = e.clientY
    // 存储元素原始坐标（不是偏移量），拖拽时用 原始坐标 + 鼠标总位移
    dragOffsets.value = elements.value
      .filter(el => selectedIds.value.includes(el.id) && !el.locked)
      .map(el => ({ id: el.id, ox: el.x, oy: el.y }))
    dragHasMoved.value = false
    document.addEventListener('mousemove', onMouseMoveGlobal)
    document.addEventListener('mouseup', onMouseUpGlobal)
  }
}

function onElementMouseEnter(el) {
  if (el.type === 'note' && el.text && el.text.length > 50) {
    el._hoverScale = true
  }
}

function onElementMouseLeave(el) {
  el._hoverScale = false
}

function onMouseMoveGlobal(e) {
  if (!isDragging.value) return
  if (!dragHasMoved.value) {
    const dx = Math.abs(e.clientX - dragStartScreenX.value)
    const dy = Math.abs(e.clientY - dragStartScreenY.value)
    if (dx < DRAG_THRESHOLD && dy < DRAG_THRESHOLD) return
    dragHasMoved.value = true
  }

  // 计算鼠标从拖拽起点到当前的总位移（屏幕坐标 → 画布坐标）
  let deltaX = (e.clientX - dragStartScreenX.value) / zoom.value
  let deltaY = (e.clientY - dragStartScreenY.value) / zoom.value

  // 边界阻尼：检查第一个元素是否会超出视口
  if (dragOffsets.value.length > 0) {
    const firstOff = dragOffsets.value[0]
    const newX = firstOff.ox + deltaX
    const newY = firstOff.oy + deltaY
    const rect = viewportRef.value?.getBoundingClientRect()
    if (rect) {
      const screenX = newX * zoom.value + viewportX.value
      const screenY = newY * zoom.value + viewportY.value
      const margin = 30
      const firstEl = elements.value.find(e => e.id === firstOff.id)
      const screenW = elW(firstEl) * zoom.value
      const screenH = elH(firstEl) * zoom.value
      if (screenX < margin || screenX + screenW > rect.width - margin) deltaX *= 0.3
      if (screenY < margin || screenY + screenH > rect.height - margin) deltaY *= 0.3
    }
  }

  // 使用原始偏移量更新位置（不重新计算 offset，避免累积漂移）
  dragOffsets.value.forEach(off => {
    const el = elements.value.find(el => el.id === off.id)
    if (el && !el.locked) {
      el.x = off.ox + deltaX
      el.y = off.oy + deltaY
    }
  })
}

function onMouseUpGlobal() {
  document.removeEventListener('mousemove', onMouseMoveGlobal)
  document.removeEventListener('mouseup', onMouseUpGlobal)
  if (isDragging.value && dragHasMoved.value) {
    pushHistory()
    scheduleSave()
  }
  isDragging.value = false
  dragHasMoved.value = false
}

// ==================== 15. Pan inertia ====================
let lastPanTime = 0
let lastPanX = 0
let lastPanY = 0

function startPanInertia() {
  const now = performance.now()
  const dt = now - lastPanTime
  if (dt < 100 && dt > 0) {
    inertiaVX = (viewportX.value - lastPanX) / dt * 16
    inertiaVY = (viewportY.value - lastPanY) / dt * 16
    if (Math.abs(inertiaVX) > 0.5 || Math.abs(inertiaVY) > 0.5) {
      cancelAnimationFrame(inertiaRAF)
      runInertia()
    }
  }
  lastPanTime = now
  lastPanX = viewportX.value
  lastPanY = viewportY.value
}

function runInertia() {
  inertiaVX *= 0.92
  inertiaVY *= 0.92
  viewportX.value += inertiaVX
  viewportY.value += inertiaVY
  if (Math.abs(inertiaVX) > 0.5 || Math.abs(inertiaVY) > 0.5) {
    inertiaRAF = requestAnimationFrame(runInertia)
  }
}

// ==================== 滚轮 ====================
// Ctrl+滚轮/捏合 → 缩放（deltaY 比例 + 上限防跳）
// 鼠标滚轮（无 Ctrl）→ 缩放（deltaY 大，每次 10%）
// 触控板两指滑动（无 Ctrl, deltaX/deltaY 小）→ 平移画布
let wheelPanTimer = null
const isWheelPanning = ref(false)

function onWheel(e) {
  if (editingId.value) return
  if (isDragging.value) return
  resetIdleTimer()

  // Ctrl+滚轮 / 捏合手势：始终缩放
  if (e.ctrlKey || e.metaKey) {
    const rect = viewportRef.value?.getBoundingClientRect()
    if (!rect) return
    const mx = e.clientX - rect.left
    const my = e.clientY - rect.top
    // 捏合时 deltaY 小（~5），用较大系数 0.005；鼠标 Ctrl+滚轮 deltaY 大（~100），用上限 15% 防止跳
    const rawDelta = -e.deltaY * 0.005
    const zoomDelta = Math.max(-0.15, Math.min(0.15, rawDelta))
    const newZoom = Math.min(2, Math.max(0.3, zoom.value * (1 + zoomDelta)))
    viewportX.value = mx - (mx - viewportX.value) * (newZoom / zoom.value)
    viewportY.value = my - (my - viewportY.value) * (newZoom / zoom.value)
    zoom.value = newZoom
    return
  }

  // 无 Ctrl：判断是鼠标滚轮（大 deltaY）还是触控板（小 deltaY 或有 deltaX）
  // 鼠标滚轮：|deltaY| > 30 且 deltaX ≈ 0 → 缩放
  // 触控板：|deltaY| ≤ 30 或 deltaX ≠ 0 → 平移
  const isMouseWheel = Math.abs(e.deltaY) > 30 && Math.abs(e.deltaX) < 5

  if (isMouseWheel) {
    const rect = viewportRef.value?.getBoundingClientRect()
    if (!rect) return
    const mx = e.clientX - rect.left
    const my = e.clientY - rect.top
    // 鼠标滚轮：每次 10% 变化（系数 0.001，deltaY≈100 → 10%）
    const zoomDelta = -e.deltaY * 0.001
    const newZoom = Math.min(2, Math.max(0.3, zoom.value * (1 + zoomDelta)))
    viewportX.value = mx - (mx - viewportX.value) * (newZoom / zoom.value)
    viewportY.value = my - (my - viewportY.value) * (newZoom / zoom.value)
    zoom.value = newZoom
    return
  }

  // 触控板两指滑动：平移画布（禁用 CSS transition 避免延迟）
  isWheelPanning.value = true
  clearTimeout(wheelPanTimer)
  wheelPanTimer = setTimeout(() => { isWheelPanning.value = false }, 100)
  viewportX.value -= e.deltaX
  viewportY.value -= e.deltaY
}

// ==================== 适应视图 ====================
function fitView() {
  if (elements.value.length === 0) return
  const bounds = getElementsBounds()
  if (!bounds) return
  const rect = viewportRef.value?.getBoundingClientRect()
  if (!rect) return
  const pad = 100
  const zx = rect.width / (bounds.w + pad * 2)
  const zy = rect.height / (bounds.h + pad * 2)
  zoom.value = Math.min(zx, zy, 1.5)
  viewportX.value = -(bounds.minX - pad) * zoom.value
  viewportY.value = -(bounds.minY - pad) * zoom.value
}

// ==================== 右键菜单 ====================
function onContextMenu(e) {
  const rect = viewportRef.value?.getBoundingClientRect()
  if (!rect) return
  const pos = screenToCanvas(e.clientX, e.clientY)
  const targetEl = elements.value.find(el => {
    return pos.x >= el.x && pos.x <= el.x + elW(el) &&
      pos.y >= el.y && pos.y <= el.y + elH(el)
  })
  // 通过命中检测找到右键位置的连接线，不再依赖选中状态
  const HIT_RADIUS = 20 / zoom.value
  const targetConnector = visibleConnectors.value.find(c => {
    const elFrom = elements.value.find(e => e.id === c.from)
    const elTo = elements.value.find(e => e.id === c.to)
    if (!elFrom || !elTo) return false
    const x1 = anchorPos(elFrom, 'x', c.fromSide || 'right')
    const y1 = anchorPos(elFrom, 'y', c.fromSide || 'right')
    const x2 = anchorPos(elTo, 'x', c.toSide || 'left')
    const y2 = anchorPos(elTo, 'y', c.toSide || 'left')
    // 点到线段的距离检测
    const dx = x2 - x1; const dy = y2 - y1
    const lenSq = dx * dx + dy * dy
    if (lenSq === 0) return Math.hypot(pos.x - x1, pos.y - y1) < HIT_RADIUS
    let t = ((pos.x - x1) * dx + (pos.y - y1) * dy) / lenSq
    t = Math.max(0, Math.min(1, t))
    const projX = x1 + t * dx
    const projY = y1 + t * dy
    return Math.hypot(pos.x - projX, pos.y - projY) < HIT_RADIUS
  }) || null

  const items = []
  if (targetEl) {
    if (!selectedIds.value.includes(targetEl.id)) {
      selectedIds.value = [targetEl.id]
    }
    items.push(
      { label: '复制', icon: Copy, shortcut: 'Ctrl+C', action: () => copyElements() },
      { label: '剪切', icon: Scissors, shortcut: 'Ctrl+X', action: () => cutElements() },
      { type: 'sep' },
      { label: targetEl.locked ? '解锁' : '锁定', icon: targetEl.locked ? Unlock : Lock, shortcut: 'L', action: () => toggleLock(targetEl) },
      { label: '删除', icon: Trash2, shortcut: 'Del', danger: true, action: () => deleteSelected() },
      { type: 'sep' },
      { label: '格式刷-取', icon: Brush, action: () => { formatBrush.value = { type: 'pick', source: targetEl }; showToast('格式刷：已取样式', 'info') } },
    )
    if (targetEl.type === 'note') {
      items.push({ label: targetEl.collapsed ? '展开子节点' : '折叠子节点', icon: targetEl.collapsed ? Eye : EyeOff, action: () => toggleCollapse(targetEl) })
    }
  } else if (targetConnector) {
    selectedIds.value = [targetConnector.id]
    items.push(
      { label: '删除连线', icon: Trash2, danger: true, action: () => { deleteConnector(targetConnector) } }
    )
  } else {
    items.push(
      { label: '粘贴', icon: Copy, shortcut: 'Ctrl+V', action: () => pasteElements(e.clientX, e.clientY) },
      { type: 'sep' },
      { label: '展开全部', icon: Eye, action: () => expandAll() },
      { label: '折叠全部', icon: EyeOff, action: () => collapseAll() },
      { type: 'sep' },
      { label: '适应视图', icon: Maximize2, action: () => fitView() },
      { label: '保存视图', icon: Copy, action: () => saveViewSnapshot() },
    )
  }

  // Edge avoidance
  let mx = e.clientX
  let my = e.clientY
  if (rect) {
    if (mx + 180 > rect.right) mx = rect.right - 180
    if (my + items.length * 32 > rect.bottom) my = rect.bottom - items.length * 32 - 10
  }

  contextMenu.items = items
  contextMenu.x = mx
  contextMenu.y = my
  contextMenu.show = true
  nextTick(() => {
    document.addEventListener('click', closeContextMenu, { once: true })
  })
}

function closeContextMenu() {
  contextMenu.show = false
}

// ==================== 复制/粘贴 ====================
let clipboard = []
let clipboardConnectors = []

function copyElements() {
  const selIds = new Set(selectedIds.value)
  clipboard = elements.value
    .filter(e => selIds.has(e.id))
    .map(e => JSON.parse(JSON.stringify(e)))
  // 同时复制选中元素之间的连线
  clipboardConnectors = connectors.value
    .filter(c => selIds.has(c.from) && selIds.has(c.to))
    .map(c => JSON.parse(JSON.stringify(c)))
  showToast(`已复制 ${clipboard.length} 个元素`, 'info')
}

function cutElements() {
  copyElements()
  deleteSelected()
}

function pasteElements(clientX, clientY) {
  if (clipboard.length === 0) return
  pushHistory()
  const pos = screenToCanvas(clientX, clientY)
  const firstEl = clipboard[0]
  const offsetX = pos.x - firstEl.x
  const offsetY = pos.y - firstEl.y
  const idMap = {} // 旧ID -> 新ID 映射
  const newIds = []
  clipboard.forEach(el => {
    const oldId = el.id
    const newId = uid()
    idMap[oldId] = newId
    const newEl = { ...el, id: newId, x: el.x + offsetX, y: el.y + offsetY, _hoverScale: false, collapsed: false, locked: false }
    elements.value.push(newEl)
    newIds.push(newId)
  })
  // 重建连线关系
  clipboardConnectors.forEach(c => {
    const newFrom = idMap[c.from]
    const newTo = idMap[c.to]
    if (newFrom && newTo) {
      connectors.value.push({
        id: uid(),
        from: newFrom,
        to: newTo,
        fromSide: c.fromSide || 'right',
        toSide: c.toSide || 'left',
        color: c.color || styleMemory.lastConnectorColor
      })
    }
  })
  selectedIds.value = newIds
  scheduleSave()
}

// ==================== 格式刷 ====================
function applyFormatBrush(target) {
  if (!formatBrush.value || !formatBrush.value.source) return
  if (target.locked) {
    showToast('目标元素已锁定，无法应用格式', 'error')
    formatBrush.value = null
    return
  }
  const src = formatBrush.value.source
  if (src.type === target.type) {
    if (target.type === 'note') {
      target.color = src.color
      target.width = src.width
      target.height = src.height
    } else if (target.type === 'text') {
      target.size = src.size
      target.color = src.color
    } else if (target.type === 'rect') {
      target.color = src.color
      target.width = src.width
      target.height = src.height
    }
    pushHistory()
    scheduleSave()
    showToast('格式刷已应用', 'info')
  } else {
    showToast('格式刷仅适用于同类型元素', 'error')
  }
  formatBrush.value = null
}

// ==================== 搜索 ====================
function doSearch() {
  if (!searchQuery.value.trim()) {
    searchResults.value = []
    searchIndex.value = 0
    return
  }
  const q = searchQuery.value.toLowerCase()
  searchResults.value = elements.value.filter(e => (e.text || '').toLowerCase().includes(q))
  searchIndex.value = 0
  if (searchResults.value.length > 0) {
    const el = searchResults.value[0]
    selectedIds.value = [el.id]
    centerOn(el)
  }
}

function searchNext() {
  if (searchResults.value.length === 0) return
  searchIndex.value = (searchIndex.value + 1) % searchResults.value.length
  const el = searchResults.value[searchIndex.value]
  selectedIds.value = [el.id]
  centerOn(el)
}

function searchPrev() {
  if (searchResults.value.length === 0) return
  searchIndex.value = (searchIndex.value - 1 + searchResults.value.length) % searchResults.value.length
  const el = searchResults.value[searchIndex.value]
  selectedIds.value = [el.id]
  centerOn(el)
}

function closeSearch() {
  searchOpen.value = false
  searchQuery.value = ''
  searchResults.value = []
  searchIndex.value = 0
}

function centerOn(el) {
  if (!viewportRef.value) return
  const rect = viewportRef.value.getBoundingClientRect()
  viewportX.value = -(el.x + elW(el) / 2) * zoom.value + rect.width / 2
  viewportY.value = -(el.y + elH(el) / 2) * zoom.value + rect.height / 2
}

// ==================== 导出 ====================
async function exportPNG() {
  if (elements.value.length === 0) {
    showToast('画布为空，无法导出', 'error')
    return
  }
  showToast('正在导出 PNG...', 'info')
  try {
    const bounds = getElementsBounds()
    if (!bounds) return
    const padding = 40
    const totalW = bounds.w + padding * 2
    const totalH = bounds.h + padding * 2
    const scale = Math.min(2, 4000 / Math.max(totalW, totalH))

    const canvas = document.createElement('canvas')
    canvas.width = Math.round(totalW * scale)
    canvas.height = Math.round(totalH * scale)
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    // 背景
    const isDark = darkMode.value
    ctx.fillStyle = isDark ? '#0f172a' : '#f8fafc'
    ctx.fillRect(0, 0, canvas.width, canvas.height)

    ctx.save()
    ctx.scale(scale, scale)
    ctx.translate(-bounds.minX + padding, -bounds.minY + padding)

    // 绘制连线
    const visibleConnIds = new Set(visibleConnectors.value.map(c => c.id))
    connectors.value.forEach(c => {
      if (!visibleConnIds.has(c.id)) return
      const from = elements.value.find(e => e.id === c.from)
      const to = elements.value.find(e => e.id === c.to)
      if (!from || !to) return
      const x1 = anchorPos(from, 'x', c.fromSide || 'right')
      const y1 = anchorPos(from, 'y', c.fromSide || 'right')
      const x2 = anchorPos(to, 'x', c.toSide || 'left')
      const y2 = anchorPos(to, 'y', c.toSide || 'left')

      ctx.strokeStyle = c.color || '#475569'
      ctx.lineWidth = 2
      ctx.beginPath()
      let sx = x2, sy = y2
      if (styleMemory.lineStyle === 'curve') {
        const dx = Math.abs(x2 - x1) * 0.5
        const dy = Math.abs(y2 - y1) * 0.5
        const cp1x = c.fromSide === 'left' ? x1 - dx : c.fromSide === 'right' ? x1 + dx : x1
        const cp1y = c.fromSide === 'top' ? y1 - dy : c.fromSide === 'bottom' ? y1 + dy : y1
        const cp2x = c.toSide === 'left' ? x2 - dx : c.toSide === 'right' ? x2 + dx : x2
        const cp2y = c.toSide === 'top' ? y2 - dy : c.toSide === 'bottom' ? y2 + dy : y2
        const tangentAngle = Math.atan2(y2 - cp2y, x2 - cp2x)
        const totalLen = Math.hypot(x2 - x1, y2 - y1)
        const shorten = Math.min(ARROW_LEN, totalLen * 0.33)
        sx = x2 - shorten * Math.cos(tangentAngle)
        sy = y2 - shorten * Math.sin(tangentAngle)
        const scp2x = cp2x + (shorten * 0.3) * Math.cos(tangentAngle)
        const scp2y = cp2y + (shorten * 0.3) * Math.sin(tangentAngle)
        ctx.moveTo(x1, y1)
        ctx.bezierCurveTo(cp1x, cp1y, scp2x, scp2y, sx, sy)
      } else if (styleMemory.lineStyle === 'polyline') {
        const mx = (x1 + x2) / 2
        const lastDx = x2 - mx
        let lastAngle
        if (Math.abs(lastDx) > 1) {
          lastAngle = Math.atan2(0, lastDx)
        } else {
          lastAngle = Math.atan2(y2 - y1, 0)
        }
        const totalLen = Math.abs(lastDx) + Math.abs(y2 - y1) + Math.abs(mx - x1)
        const shorten = Math.min(ARROW_LEN, totalLen * 0.2)
        sx = x2 - shorten * Math.cos(lastAngle)
        sy = y2 - shorten * Math.sin(lastAngle)
        ctx.moveTo(x1, y1)
        ctx.lineTo(mx, y1)
        ctx.lineTo(mx, y2)
        ctx.lineTo(sx, sy)
      } else {
        const angle = Math.atan2(y2 - y1, x2 - x1)
        const totalLen = Math.hypot(x2 - x1, y2 - y1)
        const shorten = Math.min(ARROW_LEN, totalLen * 0.33)
        sx = x2 - shorten * Math.cos(angle)
        sy = y2 - shorten * Math.sin(angle)
        ctx.moveTo(x1, y1)
        ctx.lineTo(sx, sy)
      }
      ctx.stroke()

      // 箭头（尖端在元素边缘 x2,y2，底边在缩短端点 sx,sy）
      const arrowHalfW = 3
      ctx.fillStyle = c.color || '#475569'
      ctx.beginPath()
      ctx.moveTo(x2, y2)
      ctx.lineTo(sx - arrowHalfW * Math.sin(Math.atan2(y2 - sy, x2 - sx)), sy + arrowHalfW * Math.cos(Math.atan2(y2 - sy, x2 - sx)))
      ctx.lineTo(sx + arrowHalfW * Math.sin(Math.atan2(y2 - sy, x2 - sx)), sy - arrowHalfW * Math.cos(Math.atan2(y2 - sy, x2 - sx)))
      ctx.closePath()
      ctx.fill()
    })

    // 绘制元素
    visibleElements.value.forEach(el => {
      ctx.save()
      if (el.locked) ctx.globalAlpha = 0.6

      if (el.type === 'note') {
        const bg = noteColors[el.color || 'yellow'] || '#FEF3C7'
        ctx.fillStyle = bg
        roundRect(ctx, el.x, el.y, elW(el), elH(el), 8)
        ctx.fill()
        ctx.strokeStyle = '#e2e8f0'
        ctx.lineWidth = 1
        ctx.stroke()
        // 文字
        if (el.text) {
          ctx.fillStyle = '#475569'
          ctx.font = '13px -apple-system, sans-serif'
          wrapText(ctx, el.text, el.x + 10, el.y + 14, elW(el) - 20, 18)
        }
      } else if (el.type === 'text') {
        ctx.fillStyle = el.color || '#1e293b'
        ctx.font = `${el.size || 16}px -apple-system, sans-serif`
        ctx.fillText(el.text || '', el.x, el.y + (el.size || 16))
      } else if (el.type === 'rect') {
        ctx.fillStyle = 'rgba(255,255,255,0.5)'
        roundRect(ctx, el.x, el.y, elW(el), elH(el), 8)
        ctx.fill()
        ctx.strokeStyle = el.color || '#3b82f6'
        ctx.lineWidth = 2
        ctx.stroke()
        if (el.text) {
          ctx.fillStyle = '#475569'
          ctx.font = '13px -apple-system, sans-serif'
          ctx.textAlign = 'center'
          ctx.fillText(el.text, el.x + elW(el) / 2, el.y + elH(el) / 2 + 5)
          ctx.textAlign = 'start'
        }
      } else if (el.type === 'image') {
        ctx.fillStyle = '#f8fafc'
        roundRect(ctx, el.x, el.y, elW(el), elH(el), 8)
        ctx.fill()
        ctx.strokeStyle = '#cbd5e1'
        ctx.lineWidth = 2
        ctx.setLineDash([4, 4])
        ctx.stroke()
        ctx.setLineDash([])
        if (el.text) {
          ctx.fillStyle = '#94a3b8'
          ctx.font = '13px -apple-system, sans-serif'
          ctx.textAlign = 'center'
          ctx.fillText('🖼 ' + el.text, el.x + elW(el) / 2, el.y + elH(el) / 2 + 5)
          ctx.textAlign = 'start'
        }
      }
      ctx.restore()
    })

    ctx.restore()

    const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/png'))
    if (!blob) return
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${props.boardTitle || '画布'}.png`
    a.click()
    URL.revokeObjectURL(url)
    showToast('PNG 已导出', 'success')
  } catch (err) {
    console.error('PNG export failed:', err)
    showToast('PNG 导出失败', 'error')
  }
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath()
  ctx.moveTo(x + r, y)
  ctx.lineTo(x + w - r, y)
  ctx.quadraticCurveTo(x + w, y, x + w, y + r)
  ctx.lineTo(x + w, y + h - r)
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h)
  ctx.lineTo(x + r, y + h)
  ctx.quadraticCurveTo(x, y + h, x, y + h - r)
  ctx.lineTo(x, y + r)
  ctx.quadraticCurveTo(x, y, x + r, y)
  ctx.closePath()
}

function wrapText(ctx, text, x, y, maxWidth, lineHeight) {
  if (!text) return
  const lines = text.split('\n')
  let currentY = y
  for (const line of lines) {
    const words = line.split('')
    let currentLine = ''
    for (const char of words) {
      const testLine = currentLine + char
      if (ctx.measureText(testLine).width > maxWidth && currentLine.length > 0) {
        ctx.fillText(currentLine, x, currentY)
        currentY += lineHeight
        currentLine = char
      } else {
        currentLine = testLine
      }
    }
    ctx.fillText(currentLine, x, currentY)
    currentY += lineHeight
  }
}

function exportMarkdown() {
  let md = `# ${props.boardTitle}\n\n`
  elements.value.forEach(el => {
    if (el.text) {
      md += `- ${el.text}\n`
    }
  })
  md += `\n---\n共 ${elements.value.length} 个元素`
  const blob = new Blob([md], { type: 'text/markdown' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `${props.boardTitle}.md`
  a.click()
  URL.revokeObjectURL(url)
  showToast('Markdown 已导出', 'info')
}

function handleExit() {
  if (props.onClose) props.onClose()
  emit('close')
}

// ==================== 键盘快捷键 ====================
function onKeyDown(e) {
  resetIdleTimer()
  // 14. ESC key improvement
  if (e.key === 'Escape') {
    if (focusMode.value) {
      focusMode.value = false
      return
    }
    if (connectingFrom.value) {
      document.removeEventListener('mousemove', onConnectionMove)
      document.removeEventListener('mouseup', onConnectionUp)
      connectingFrom.value = null
      activeTool.value = 'pan'
      return
    }
    if (formatBrush.value) {
      formatBrush.value = null
      return
    }
    if (searchOpen.value) {
      closeSearch()
      return
    }
    if (shortcutHelpOpen.value) {
      shortcutHelpOpen.value = false
      return
    }
    if (editingId.value) {
      finishEdit()
      return
    }
    selectedIds.value = []
    return
  }

  if (editingId.value) return

  // 搜索框打开时，只允许搜索相关快捷键和 Esc
  if (searchOpen.value) {
    if ((e.ctrlKey || e.metaKey) && e.key === 'g') { e.preventDefault(); searchNext(); return }
    return
  }

  // 快捷键帮助面板打开时，只允许关闭
  if (shortcutHelpOpen.value) {
    return
  }

  if (e.key === 'Delete' || e.key === 'Backspace') {
    deleteSelected()
    return
  }

  if ((e.ctrlKey || e.metaKey) && e.key === 'z') {
    e.preventDefault()
    undo()
    return
  }
  if ((e.ctrlKey || e.metaKey) && e.key === 'y') {
    e.preventDefault()
    redo()
    return
  }
  if ((e.ctrlKey || e.metaKey) && e.key === 'a') {
    e.preventDefault()
    selectedIds.value = elements.value.filter(el => !el.locked).map(el => el.id)
    return
  }
  if ((e.ctrlKey || e.metaKey) && e.key === 'c') {
    e.preventDefault()
    copyElements()
    return
  }
  if ((e.ctrlKey || e.metaKey) && e.key === 'v') {
    e.preventDefault()
    const rect = viewportRef.value?.getBoundingClientRect()
    if (rect) {
      pasteElements(rect.left + rect.width / 2, rect.top + rect.height / 2)
    }
    return
  }
  if ((e.ctrlKey || e.metaKey) && e.key === 'x') {
    e.preventDefault()
    cutElements()
    return
  }
  if ((e.ctrlKey || e.metaKey) && e.key === 'f') {
    e.preventDefault()
    searchOpen.value = true
    nextTick(() => { searchInput.value?.focus() })
    return
  }
  if ((e.ctrlKey || e.metaKey) && e.key === 'g') {
    e.preventDefault()
    searchNext()
    return
  }
  if ((e.ctrlKey || e.metaKey) && e.key === '/') {
    e.preventDefault()
    shortcutHelpOpen.value = !shortcutHelpOpen.value
    return
  }

  // 工具快捷键：仅在无输入焦点时生效
  const tag = document.activeElement?.tagName
  const isInput = tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || document.activeElement?.isContentEditable
  if (!isInput) {
    if (e.key === 'n') { useTool('note'); return }
    if (e.key === 't') { useTool('text'); return }
    if (e.key === 'r') { useTool('rect'); return }
    if (e.key === 'i') { useTool('image'); return }
    if (e.key === 'c') { useTool('connect'); return }
    if (e.key === 'v') { useTool('pan'); return }
  }
  if (e.key === 'l' && selectedElement.value) {
    toggleLock(selectedElement.value)
    return
  }
  // Enter: 编辑选中元素（但不要在刚从input/textarea退出编辑时重新进入）
  if (e.key === 'Enter' && selectedElement.value && !isInput) {
    startEditText(selectedElement.value)
    return
  }
  if (e.key === 'Tab' && selectedElement.value) {
    e.preventDefault()
    quickAddChild()
    return
  }
}

// ==================== 生命周期 ====================
onMounted(() => {
  document.addEventListener('keydown', onKeyDown)
  document.addEventListener('click', (e) => {
    if (searchOpen.value && !e.target.closest('.ib-search-bar')) {
      // don't close
    }
    if (contextMenu.show && !e.target.closest('.ib-context-menu')) {
      closeContextMenu()
    }
  })

  // 初始化数据
  if (props.boardData && props.boardData.elements) {
    elements.value = props.boardData.elements.map(e => ({
      ...e, _hoverScale: false, collapsed: e.collapsed || false
    }))
    connectors.value = props.boardData.connectors || []
    if (props.boardData.viewport) {
      viewportX.value = props.boardData.viewport.x || 0
      viewportY.value = props.boardData.viewport.y || 0
      zoom.value = props.boardData.viewport.zoom || 1
    }
    if (elements.value.length > 0) {
      pushHistory()
    }
  }
  saved.value = true

  // 测量已加载文本元素的实际渲染尺寸（锚点精准定位）
  nextTick(() => {
    measureAllTextElements()
  })

  // Track last click for tool placement
  document.addEventListener('mousedown', (e) => {
    window._lastClickX = e.clientX
    window._lastClickY = e.clientY
  })
})

onBeforeUnmount(() => {
  clearTimeout(idleSaveTimer)
  document.removeEventListener('keydown', onKeyDown)
  document.removeEventListener('mousemove', onMouseMoveGlobal)
  document.removeEventListener('mouseup', onMouseUpGlobal)
  document.removeEventListener('mousemove', onConnectionMove)
  document.removeEventListener('mouseup', onConnectionUp)
  document.removeEventListener('mousemove', onSelectMove)
  document.removeEventListener('mouseup', onSelectUp)
  document.removeEventListener('mousemove', onDrawMove)
  document.removeEventListener('mouseup', onDrawUp)
  cancelAnimationFrame(inertiaRAF)
})

defineExpose({ exportData, elements, connectors })
</script>

<style>
/* ==================== 根容器 ==================== */
.ib-root {
  --bg: #f8fafc;
  --text: #1e293b;
  --text-secondary: #64748b;
  --border: #e2e8f0;
  --panel-bg: rgba(255, 255, 255, 0.95);
  --toolbar-bg: #ffffff;
  --tool-hover: #f1f5f9;
  --tool-active: #e2e8f0;
  --viewport-bg: #f1f5f9;
  --canvas-bg: transparent;
  position: fixed;
  inset: 0;
  z-index: 50;
  background: var(--bg);
  color: var(--text);
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
  overflow: hidden;
  user-select: none;
}

.ib-root.ib-dark {
  --bg: #0f172a;
  --text: #e2e8f0;
  --text-secondary: #94a3b8;
  --border: #334155;
  --panel-bg: rgba(30, 41, 59, 0.95);
  --toolbar-bg: #1e293b;
  --tool-hover: #334155;
  --tool-active: #475569;
  --viewport-bg: #1e293b;
}

/* ==================== 工具栏 ==================== */
.ib-toolbar {
  position: absolute;
  left: 12px;
  top: 50%;
  transform: translateY(-50%);
  z-index: 20;
  display: flex;
  flex-direction: column;
  gap: 4px;
  background: var(--toolbar-bg);
  border: 1px solid var(--border);
  border-radius: 10px;
  padding: 6px;
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.08);
}

.ib-tool-btn {
  width: 34px;
  height: 34px;
  display: flex;
  align-items: center;
  justify-content: center;
  border: none;
  background: transparent;
  border-radius: 7px;
  cursor: pointer;
  color: var(--text-secondary);
  transition: all 0.15s cubic-bezier(0.4, 0, 0.2, 1);
  font-size: 11px;
  position: relative;
}

.ib-tool-btn:hover {
  background: var(--tool-hover);
  color: var(--text);
  transform: scale(1.08);
}

.ib-tool-btn:active {
  transform: scale(0.92);
  transition: transform 0.08s cubic-bezier(0.4, 0, 0.2, 1);
}

.ib-tool-btn.active {
  background: var(--tool-active);
  color: #3b82f6;
}

.ib-tool-btn.active:hover {
  transform: scale(1.05);
}

/* 工具栏按钮快捷键提示 */
.ib-tool-btn::after {
  content: attr(data-shortcut);
  position: absolute;
  bottom: 1px;
  right: 2px;
  font-size: 8px;
  color: var(--text-secondary);
  opacity: 0.5;
  line-height: 1;
}

.ib-tool-sep {
  width: 100%;
  height: 1px;
  background: var(--border);
  margin: 2px 0;
}

/* ==================== 顶部栏 ==================== */
.ib-topbar {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  z-index: 20;
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 8px 16px;
  background: var(--panel-bg);
  border-bottom: 1px solid var(--border);
  backdrop-filter: blur(8px);
}

.ib-title {
  font-size: 14px;
  font-weight: 600;
  color: var(--text);
}

.ib-meta {
  font-size: 11px;
  color: var(--text-secondary);
  flex: 1;
}

.ib-topbar-actions {
  display: flex;
  gap: 6px;
  align-items: center;
}

.ib-topbar-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  border: 1px solid var(--border);
  background: transparent;
  border-radius: 6px;
  padding: 4px 8px;
  font-size: 11px;
  color: var(--text-secondary);
  cursor: pointer;
  transition: all 0.15s cubic-bezier(0.4, 0, 0.2, 1);
}

.ib-topbar-btn:hover {
  background: var(--tool-hover);
  color: var(--text);
  transform: scale(1.05);
}

.ib-topbar-btn:active {
  transform: scale(0.94);
  transition: transform 0.08s cubic-bezier(0.4, 0, 0.2, 1);
}

.ib-topbar-btn.active {
  background: #3b82f6;
  color: #fff;
  border-color: #3b82f6;
}

.ib-topbar-btn:disabled {
  opacity: 0.4;
  cursor: not-allowed;
  transform: none;
}

/* ==================== 视口 ==================== */
.ib-viewport {
  position: absolute;
  inset: 44px 0 0 0;
  background: var(--viewport-bg);
  overflow: hidden;
  cursor: default;
}

/* 光标样式 */
.ib-cursor-grab { cursor: grab !important; }
.ib-cursor-grabbing { cursor: grabbing !important; }
.ib-cursor-crosshair { cursor: crosshair !important; }
.ib-cursor-text { cursor: text !important; }

.ib-canvas {
  position: absolute;
  width: 0;
  height: 0;
  transition: transform 0.25s cubic-bezier(0.25, 0.1, 0.25, 1);
}

.ib-canvas.no-transition {
  transition: none;
}

.ib-svg-layer {
  position: absolute;
  top: 0;
  left: 0;
  width: 10000px;
  height: 10000px;
  pointer-events: none;
  overflow: visible;
}

.ib-svg-layer.ib-svg-over {
  pointer-events: none;
  z-index: 10;
}

.ib-svg-layer line,
.ib-svg-layer path {
  pointer-events: stroke;
}

.ib-line {
  cursor: pointer;
  transition: stroke-width 0.15s, opacity 0.15s, filter 0.15s;
}

.ib-line.selected {
  stroke: #3b82f6 !important;
  stroke-width: 3 !important;
  filter: drop-shadow(0 0 4px rgba(59, 130, 246, 0.6));
}

/* 8. Connector hover highlight */
.ib-connector-group {
  transition: opacity 0.2s;
}

.ib-connector-group.hovered .ib-line {
  stroke-width: 3;
  filter: drop-shadow(0 0 3px rgba(71, 85, 105, 0.4));
}

.ib-connector-group.hovered .ib-line.selected {
  stroke-width: 3.5;
  filter: drop-shadow(0 0 5px rgba(59, 130, 246, 0.7));
}

.ib-connector-group.search-dim {
  opacity: 0.2;
}

.ib-connector-group.ib-focus-dimmed {
  opacity: 0.1;
  pointer-events: none;
}

/* ==================== 框选 ==================== */
.ib-selection-rect {
  position: absolute;
  border: 2px dashed #3b82f6;
  background: rgba(59, 130, 246, 0.08);
  z-index: 5;
  pointer-events: none;
}

/* ==================== 元素通用 ==================== */
.ib-element {
  position: absolute;
  cursor: move;
  transition: transform 0.12s ease, box-shadow 0.15s;
  box-sizing: border-box;
}

.ib-element.selected {
  outline: 2px solid #3b82f6;
  outline-offset: 2px;
  z-index: 2;
}

.ib-element.dragging {
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.15), 0 2px 8px rgba(0, 0, 0, 0.1);
  z-index: 5;
  transition: none;
  filter: brightness(1.02);
  cursor: grabbing !important;
}

.ib-element.multi-selected {
  outline: 2px solid #93c5fd;
  outline-offset: 2px;
}

.ib-element.creating {
  outline: 2px dashed #3b82f6;
  outline-offset: 2px;
}

.ib-element.locked {
  cursor: not-allowed;
  outline-color: #ef4444;
}

/* ==================== 便签 ==================== */
.ib-note {
  border-radius: 8px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.08);
  padding: 10px 12px;
  overflow: hidden;
  display: flex;
  flex-direction: column;
  box-sizing: border-box;
}

.ib-note.selected {
  box-shadow: 0 0 0 2px #3b82f6, 0 4px 16px rgba(0, 0, 0, 0.12);
}

.ib-note-text {
  font-size: 13px;
  line-height: 1.5;
  color: #475569;
  white-space: pre-wrap;
  word-break: break-word;
  overflow: hidden;
  flex: 1;
}

.ib-note-textarea {
  width: 100%;
  height: 100%;
  border: none;
  background: transparent;
  font-size: 13px;
  line-height: 1.5;
  color: #475569;
  resize: none;
  outline: none;
  font-family: inherit;
  padding: 0;
}

.ib-lock-badge {
  position: absolute;
  top: 4px;
  right: 4px;
  font-size: 10px;
  opacity: 0.7;
}

.ib-lock-badge-inline {
  margin-right: 2px;
  font-size: 10px;
}

/* 5. Collapse badge */
.ib-collapse-badge {
  position: absolute;
  bottom: -10px;
  left: 50%;
  transform: translateX(-50%);
  width: 20px;
  height: 20px;
  border-radius: 50%;
  background: #3b82f6;
  color: #fff;
  font-size: 10px;
  font-weight: 700;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  z-index: 5;
  box-shadow: 0 1px 4px rgba(0, 0, 0, 0.2);
  transition: transform 0.15s;
}

.ib-collapse-badge:hover {
  transform: translateX(-50%) scale(1.15);
}

/* ==================== 文本 ==================== */
.ib-text {
  white-space: pre-wrap;
  overflow-wrap: break-word;
  max-width: 400px;
  cursor: move;
  padding: 2px 4px;
  border-radius: 4px;
  display: inline-block;
  box-sizing: border-box;
  transition: background 0.15s;
}

/* 文本 hover 仅改变背景色，不缩放（避免拖拽时变形） */
.ib-text:hover {
  background: rgba(0, 0, 0, 0.04);
}

.ib-text.selected {
  background: rgba(59, 130, 246, 0.08);
}

/* 拖拽时禁用所有 transition，防止动画干扰 */
.ib-text.dragging {
  transition: none !important;
  transform: none !important;
}

.ib-text-input {
  position: absolute;
  border: 1px solid #3b82f6;
  border-radius: 4px;
  background: #fff;
  padding: 3px 6px;
  color: #1e293b;
  outline: none;
  font-family: inherit;
  z-index: 5;
  min-width: 120px;
  line-height: 1.4;
  box-shadow: 0 0 0 1px rgba(59, 130, 246, 0.2);
}

/* ==================== 矩形 ==================== */
.ib-rect {
  border: 2px solid #3b82f6;
  border-radius: 8px;
  background: rgba(255, 255, 255, 0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  box-sizing: border-box;
}

.ib-rect-text {
  font-size: 13px;
  color: #475569;
  padding: 8px;
  text-align: center;
  overflow: hidden;
}

/* ==================== 图片 ==================== */
.ib-image {
  border: 2px dashed #cbd5e1;
  border-radius: 8px;
  background: #f8fafc;
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
}

.ib-image-placeholder {
  font-size: 13px;
  color: #94a3b8;
  text-align: center;
  padding: 8px;
}

.ib-image-img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

/* ==================== 锚点 ==================== */
.ib-anchor {
  width: 10px;
  height: 10px;
  background: #3b82f6;
  border: 2px solid #fff;
  border-radius: 50%;
  cursor: crosshair;
  z-index: 8;
  transition: transform 0.15s;
}

.ib-anchor:hover {
  transform: scale(1.4);
}

/* 连线模式下目标锚点：绿色脉冲 */
.ib-anchor-target {
  background: #22c55e !important;
  border-color: #fff !important;
  animation: ib-anchor-pulse 0.8s ease-in-out infinite alternate;
}

@keyframes ib-anchor-pulse {
  from { transform: scale(1); opacity: 0.8; }
  to { transform: scale(1.3); opacity: 1; }
}

.ib-anchor-target:hover {
  transform: scale(1.6) !important;
  animation: none;
}

.ib-plus-btn {
  position: absolute;
  width: 24px;
  height: 24px;
  background: #3b82f6;
  color: #fff;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 14px;
  font-weight: 700;
  cursor: pointer;
  z-index: 8;
  box-shadow: 0 2px 8px rgba(59, 130, 246, 0.4);
  transition: transform 0.15s;
}

.ib-plus-btn:hover {
  transform: scale(1.2);
}

/* 连接线中点添加按钮 */
.ib-midpoint-btn {
  position: absolute;
  width: 24px;
  height: 24px;
  background: #10b981;
  color: #fff;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 16px;
  font-weight: 700;
  cursor: pointer;
  z-index: 8;
  box-shadow: 0 2px 8px rgba(16, 185, 129, 0.5);
  transition: transform 0.15s;
  animation: midpoint-pop 0.2s ease-out;
}

@keyframes midpoint-pop {
  from { transform: scale(0); opacity: 0; }
  to { transform: scale(1); opacity: 1; }
}

.ib-midpoint-btn:hover {
  transform: scale(1.25);
  box-shadow: 0 3px 12px rgba(16, 185, 129, 0.6);
}

/* ==================== 缩放控件 ==================== */
.ib-zoom-controls {
  position: absolute;
  bottom: 16px;
  left: 50%;
  transform: translateX(-50%);
  z-index: 20;
  display: flex;
  align-items: center;
  gap: 8px;
  background: var(--panel-bg);
  border: 1px solid var(--border);
  border-radius: 10px;
  padding: 4px 10px;
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.08);
}

.ib-zoom-controls button {
  width: 28px;
  height: 28px;
  border: none;
  background: transparent;
  border-radius: 6px;
  cursor: pointer;
  color: var(--text-secondary);
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.15s cubic-bezier(0.4, 0, 0.2, 1);
}

.ib-zoom-controls button:hover {
  background: var(--tool-hover);
  color: var(--text);
  transform: scale(1.1);
}

.ib-zoom-controls button:active {
  transform: scale(0.9);
  transition: transform 0.08s;
}

.ib-zoom-controls button:disabled {
  opacity: 0.3;
  cursor: not-allowed;
  transform: none;
}

.ib-zoom-controls span {
  font-size: 12px;
  font-weight: 500;
  color: var(--text-secondary);
  min-width: 40px;
  text-align: center;
}

/* ==================== 底部面板 ==================== */
.ib-panel {
  position: absolute;
  bottom: 16px;
  left: 50%;
  transform: translateX(-50%);
  z-index: 20;
  display: flex;
  align-items: center;
  gap: 6px;
  background: var(--panel-bg);
  border: 1px solid var(--border);
  border-radius: 10px;
  padding: 6px 12px;
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.08);
  margin-bottom: 48px;
}

.ib-panel-label {
  font-size: 11px;
  color: var(--text-secondary);
  margin-right: 4px;
}

.ib-panel-btn-sm {
  width: 26px;
  height: 26px;
  border: none;
  background: transparent;
  border-radius: 5px;
  cursor: pointer;
  font-size: 12px;
  color: var(--text-secondary);
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.15s cubic-bezier(0.4, 0, 0.2, 1);
}

.ib-panel-btn-sm:hover {
  background: var(--tool-hover);
  color: var(--text);
  transform: scale(1.1);
}

.ib-panel-btn-sm:active {
  transform: scale(0.9);
  transition: transform 0.08s;
}

.ib-panel-sep {
  width: 1px;
  height: 16px;
  background: var(--border);
}

.ib-panel-count {
  font-size: 11px;
  color: var(--text-secondary);
  margin-left: 8px;
}

.ib-panel-btn-del {
  display: flex;
  align-items: center;
  gap: 3px;
  border: 1px solid #ef4444;
  background: transparent;
  border-radius: 6px;
  padding: 4px 8px;
  font-size: 11px;
  color: #ef4444;
  cursor: pointer;
  transition: all 0.15s;
}

.ib-panel-btn-del:hover {
  background: #ef4444;
  color: #fff;
}

.ib-color-picker {
  display: flex;
  gap: 4px;
}

.ib-color-dot {
  width: 20px;
  height: 20px;
  border: 2px solid transparent;
  border-radius: 50%;
  cursor: pointer;
  transition: all 0.15s;
}

.ib-color-dot:hover {
  border-color: #3b82f6;
}

.ib-color-dot.active {
  border-color: #3b82f6;
  box-shadow: 0 0 0 2px rgba(59, 130, 246, 0.2);
}

/* ==================== 搜索栏 ==================== */
.ib-search-bar {
  position: absolute;
  top: 52px;
  right: 16px;
  z-index: 25;
  display: flex;
  align-items: center;
  gap: 6px;
  background: var(--panel-bg);
  border: 1px solid var(--border);
  border-radius: 10px;
  padding: 6px 10px;
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.12);
}

.ib-search-input {
  border: none;
  background: transparent;
  font-size: 12px;
  color: var(--text);
  outline: none;
  width: 160px;
  padding: 4px;
}

.ib-search-info {
  font-size: 11px;
  color: var(--text-secondary);
  white-space: nowrap;
}

.ib-search-btn {
  width: 24px;
  height: 24px;
  border: none;
  background: transparent;
  border-radius: 4px;
  cursor: pointer;
  color: var(--text-secondary);
  font-size: 12px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.ib-search-btn:hover {
  background: var(--tool-hover);
  color: var(--text);
}

/* 搜索效果 */
.ib-element.search-dim {
  opacity: 0.25;
  filter: grayscale(0.8);
}

.ib-element.search-hit {
  outline: 3px solid #f59e0b !important;
  outline-offset: 3px;
  animation: searchPulse 0.6s ease;
}

@keyframes searchPulse {
  0%, 100% { outline-color: #f59e0b; }
  50% { outline-color: #fbbf24; }
}

/* 11. 聚焦模式 */
.ib-element.ib-focus-dimmed {
  opacity: 0.15;
  filter: grayscale(0.5);
  pointer-events: none;
}

.ib-focus-indicator {
  position: absolute;
  top: 50px;
  left: 50%;
  transform: translateX(-50%);
  z-index: 25;
  background: rgba(59, 130, 246, 0.9);
  color: #fff;
  padding: 4px 12px;
  border-radius: 20px;
  font-size: 11px;
  font-weight: 500;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.15);
}

/* ==================== 右键菜单 ==================== */
.ib-context-menu {
  position: fixed;
  z-index: 30;
  background: var(--panel-bg);
  border: 1px solid var(--border);
  border-radius: 10px;
  padding: 4px;
  min-width: 180px;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.12);
}

.ib-cm-item {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  padding: 7px 10px;
  border: none;
  background: transparent;
  border-radius: 6px;
  font-size: 12px;
  color: var(--text);
  cursor: pointer;
  text-align: left;
}

.ib-cm-item:hover {
  background: var(--tool-hover);
}

.ib-cm-item.danger {
  color: #ef4444;
}

.ib-cm-item.danger:hover {
  background: #fef2f2;
}

.ib-cm-kbd {
  margin-left: auto;
  font-size: 10px;
  color: var(--text-secondary);
  background: var(--tool-hover);
  padding: 1px 5px;
  border-radius: 3px;
}

.ib-cm-sep {
  height: 1px;
  background: var(--border);
  margin: 3px 6px;
}

/* ==================== 格式刷 ==================== */
.ib-format-brush-indicator {
  position: absolute;
  top: 50px;
  left: 50%;
  transform: translateX(-50%);
  z-index: 25;
  background: rgba(245, 158, 11, 0.9);
  color: #fff;
  padding: 4px 12px;
  border-radius: 20px;
  font-size: 11px;
  font-weight: 500;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.15);
}

/* ==================== Toast ==================== */
.ib-toast {
  position: absolute;
  bottom: 80px;
  left: 50%;
  transform: translateX(-50%);
  z-index: 30;
  padding: 8px 20px;
  border-radius: 20px;
  font-size: 12px;
  font-weight: 500;
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.15);
  animation: toastIn 0.3s ease;
}

.ib-toast.info {
  background: #1e293b;
  color: #fff;
}

.ib-toast.success {
  background: #16a34a;
  color: #fff;
}

.ib-toast.error {
  background: #ef4444;
  color: #fff;
}

@keyframes toastIn {
  from { opacity: 0; transform: translateX(-50%) translateY(8px); }
  to { opacity: 1; transform: translateX(-50%) translateY(0); }
}

/* ==================== 快捷键帮助面板 ==================== */
.ib-shortcut-overlay {
  position: fixed;
  inset: 0;
  z-index: 100;
  background: rgba(0, 0, 0, 0.4);
  backdrop-filter: blur(4px);
  display: flex;
  align-items: center;
  justify-content: center;
  animation: fadeIn 0.15s ease;
}

@keyframes fadeIn {
  from { opacity: 0; }
  to { opacity: 1; }
}

.ib-shortcut-panel {
  background: var(--panel-bg);
  border: 1px solid var(--border);
  border-radius: 14px;
  width: 420px;
  max-height: 70vh;
  overflow: hidden;
  box-shadow: 0 16px 48px rgba(0, 0, 0, 0.2);
  animation: panelIn 0.2s cubic-bezier(0.4, 0, 0.2, 1);
}

@keyframes panelIn {
  from { opacity: 0; transform: scale(0.95) translateY(8px); }
  to { opacity: 1; transform: scale(1) translateY(0); }
}

.ib-shortcut-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 14px 20px;
  border-bottom: 1px solid var(--border);
}

.ib-shortcut-header h3 {
  font-size: 15px;
  font-weight: 600;
  color: var(--text);
  margin: 0;
}

.ib-shortcut-close {
  width: 28px;
  height: 28px;
  border: none;
  background: transparent;
  border-radius: 6px;
  cursor: pointer;
  color: var(--text-secondary);
  font-size: 14px;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.15s;
}

.ib-shortcut-close:hover {
  background: var(--tool-hover);
  color: var(--text);
}

.ib-shortcut-body {
  padding: 12px 20px;
  display: flex;
  flex-direction: column;
  gap: 6px;
  max-height: 50vh;
  overflow-y: auto;
}

.ib-shortcut-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 6px 8px;
  border-radius: 6px;
  transition: background 0.1s;
}

.ib-shortcut-row:hover {
  background: var(--tool-hover);
}

.ib-shortcut-key {
  font-size: 11px;
  font-weight: 600;
  color: var(--text);
  background: var(--tool-hover);
  border: 1px solid var(--border);
  padding: 3px 8px;
  border-radius: 4px;
  font-family: 'SF Mono', 'Fira Code', 'Consolas', monospace;
  min-width: 120px;
  text-align: center;
}

.ib-shortcut-desc {
  font-size: 12px;
  color: var(--text-secondary);
}

/* ==================== 退出栏 ==================== */
.ib-exit-bar {
  position: absolute;
  bottom: 16px;
  right: 16px;
  z-index: 20;
}

.ib-exit-btn {
  padding: 6px 14px;
  border: 1px solid var(--border);
  background: var(--panel-bg);
  border-radius: 8px;
  font-size: 12px;
  color: var(--text-secondary);
  cursor: pointer;
  transition: all 0.15s;
}

.ib-exit-btn:hover {
  background: #ef4444;
  color: #fff;
  border-color: #ef4444;
}

/* ==================== 9. 小地图 ==================== */
.ib-minimap {
  position: absolute;
  bottom: 80px;
  right: 16px;
  z-index: 20;
  width: 180px;
  height: 140px;
  background: var(--panel-bg);
  border: 1px solid var(--border);
  border-radius: 8px;
  overflow: hidden;
  box-shadow: 0 2px 12px rgba(0, 0, 0, 0.1);
  cursor: pointer;
}

.ib-minimap-canvas {
  position: relative;
  width: 160px;
  height: 120px;
  margin: 10px;
  background: var(--viewport-bg);
  border-radius: 4px;
  overflow: hidden;
}

.ib-minimap-el {
  position: absolute;
  background: rgba(59, 130, 246, 0.3);
  border: 1px solid rgba(59, 130, 246, 0.5);
  border-radius: 2px;
  pointer-events: none;
}

.ib-minimap-el.selected {
  background: rgba(59, 130, 246, 0.6);
  border-color: #3b82f6;
}

.ib-minimap-viewport {
  position: absolute;
  border: 2px solid #3b82f6;
  background: rgba(59, 130, 246, 0.08);
  border-radius: 2px;
  pointer-events: none;
}

/* ==================== 暗色模式覆盖 ==================== */
.ib-dark .ib-note-text {
  color: #1e293b;
}

.ib-dark .ib-note-textarea {
  color: #1e293b;
}

.ib-dark .ib-cm-item.danger:hover {
  background: rgba(239, 68, 68, 0.15);
}

.ib-dark .ib-text-input {
  background: #1e293b;
  color: #e2e8f0;
  border-color: #3b82f6;
}

.ib-dark .ib-text {
  color: #e2e8f0;
}

.ib-dark .ib-text:hover {
  background: rgba(255, 255, 255, 0.06);
}

.ib-dark .ib-text.selected {
  background: rgba(59, 130, 246, 0.2);
}

.ib-dark .ib-element.search-hit {
  outline-color: #f59e0b !important;
}

/* ==================== 光标样式 ==================== */
.ib-cursor-grab { cursor: grab; }
.ib-cursor-grabbing { cursor: grabbing; }
.ib-cursor-crosshair { cursor: crosshair; }
.ib-cursor-text { cursor: text; }
.ib-cursor-move { cursor: move; }
.ib-cursor-not-allowed { cursor: not-allowed; }

/* ==================== 拖拽绘制预览 ==================== */
.ib-drawing-preview {
  position: absolute;
  pointer-events: none;
  z-index: 4;
  transition: none;
}
</style>