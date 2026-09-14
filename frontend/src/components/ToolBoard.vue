<template>
  <div class="px-5 mt-6">
    <div class="bg-white rounded-xl p-4 card-shadow">
      <div class="flex items-center justify-between mb-3">
        <h3 class="text-sm font-bold text-slate-700 flex items-center gap-2">
          <Wrench class="w-4 h-4 text-amber-500" />
          小工具
        </h3>
        <button @click="openAddDialog" class="px-3 py-1.5 text-xs bg-amber-500 text-white rounded-lg hover:bg-amber-600 transition-all flex items-center gap-1">
          <Plus class="w-3 h-3" />
          新增工具
        </button>
      </div>

      <div v-if="loadError" class="mb-3 p-2 bg-red-50 text-red-600 text-xs rounded flex items-center gap-2">
        <TriangleAlert class="w-3.5 h-3.5" />{{ loadError }}
        <button @click="reload" class="ml-auto underline font-semibold">重试</button>
      </div>

      <div v-for="group in groupedTools" :key="group.key" 
           class="mb-3 transition-all duration-200"
           :class="{ 'bg-amber-50 rounded-lg p-1': dragOverGroup === group.key }">
        <div class="flex items-center justify-between mb-1.5 pb-1.5 border-b border-slate-100">
          <button @click="toggleCollapse(group.key)" class="flex items-center gap-1.5 text-xs font-semibold text-slate-500 hover:text-slate-700 transition-colors">
            <ChevronRight class="w-3 h-3 transition-transform" :style="{ transform: collapsed[group.key] ? '' : 'rotate(90deg)' }" />
            {{ group.key || '未分类' }}
            <span class="text-slate-400 font-normal">({{ group.tools.length }})</span>
          </button>
          <button v-if="!collapsed[group.key]" @click.prevent.stop="openAddDialog(group.key)" class="text-[10px] text-slate-400 hover:text-amber-500 transition-colors flex items-center gap-0.5">
            <Plus class="w-2.5 h-2.5" />添加到此分类
          </button>
        </div>
        <div v-show="!collapsed[group.key]" 
             class="grid grid-cols-4 gap-3 min-h-[60px]"
             @dragover.prevent="onGroupDragOver(group.key)"
             @dragleave="onGroupDragLeave(group.key)"
             @drop="onGroupDrop(group.key)">
          <a
            v-for="tool in group.tools"
            :key="tool.id"
            :href="tool.url"
            target="_blank"
            rel="noopener noreferrer"
            draggable="true"
            @dragstart="onDragStart(tool, group.key)"
            @dragend="onDragEnd"
            @dragover.prevent="onCardDragOver(tool, group.key, $event)"
            class="p-3 bg-slate-50 rounded-lg hover:bg-slate-100 transition-all group relative cursor-grab active:cursor-grabbing"
            :class="{
              'opacity-50 scale-95': draggingTool?.id === tool.id,
              'border-t-2 border-amber-400': dropTarget?.id === tool.id && dropPosition === 'before',
              'border-b-2 border-amber-400': dropTarget?.id === tool.id && dropPosition === 'after'
            }"
          >
            <div class="flex items-start gap-2.5">
              <div class="w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0" :style="{ background: iconBg(tool.icon) }">
                <component :is="iconComp(tool.icon)" class="w-5 h-5" />
              </div>
              <div class="min-w-0 flex-1">
                <div class="flex items-center gap-1.5">
                  <span class="text-sm font-medium text-slate-700 truncate block">{{ tool.name }}</span>
                  <ExternalLink class="w-3 h-3 text-slate-300 group-hover:text-slate-500 transition-colors flex-shrink-0" />
                </div>
                <p v-if="tool.note" class="text-xs text-slate-400 mt-0.5 line-clamp-2">{{ tool.note }}</p>
                <span class="text-[10px] text-slate-300 mt-0.5 block truncate">{{ domainOf(tool.url) }}</span>
              </div>
            </div>
            <div class="absolute top-1.5 right-1.5 flex gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
              <button @click.prevent.stop="editTool(tool)" class="w-6 h-6 rounded bg-white border border-slate-200 flex items-center justify-center hover:bg-blue-50 transition-colors" title="编辑"><Pencil class="w-3 h-3 text-slate-400" /></button>
              <button @click.prevent.stop="removeTool(tool)" class="w-6 h-6 rounded bg-white border border-slate-200 flex items-center justify-center hover:bg-red-50 transition-colors" title="删除"><Trash2 class="w-3 h-3 text-slate-400" /></button>
            </div>
          </a>

          <button @click="openAddDialog(group.key)" class="p-3 bg-slate-50 rounded-lg hover:bg-slate-100 transition-all border border-dashed border-slate-200 flex flex-col items-center justify-center gap-2 min-h-[80px] text-slate-400 hover:text-slate-600">
            <Plus class="w-5 h-5" />
            <span class="text-xs">添加到{{ group.key || '此分类' }}</span>
          </button>
        </div>
      </div>

      <div v-if="!loading && !tools.length" class="text-center py-8 text-slate-400 text-xs">
        暂无小工具，点击"新增工具"添加
      </div>
    </div>

    <NewToolDialog v-if="showDialog" :item="editingItem" :categories="categories" @close="closeDialog" @confirm="saveTool" />
  </div>
</template>

<script setup>
import { computed, markRaw, onMounted, reactive, ref } from 'vue'
import { Plus, Pencil, Trash2, TriangleAlert, ExternalLink, Wrench, Globe, Phone, Smartphone, CreditCard, ShoppingBag, Wallet, Calculator, BookOpen, Settings, Zap, Star, Link, ChevronRight } from 'lucide-vue-next'
import NewToolDialog from './dialogs/NewToolDialog.vue'
import { useTool } from '../composables/useTool'

const { tools, categories, loading, loadTools, loadCategories, addTool, updateTool, deleteTool, reorderTools } = useTool()

const showDialog = ref(false)
const editingItem = ref(null)
const loadError = ref('')
const collapsed = reactive({})

const draggingTool = ref(null)
const draggingGroup = ref(null)
const dragOverGroup = ref(null)
const dropTarget = ref(null)
const dropPosition = ref(null)

const iconMap = {
  Globe: markRaw(Globe), Phone: markRaw(Phone), Smartphone: markRaw(Smartphone),
  CreditCard: markRaw(CreditCard), ShoppingBag: markRaw(ShoppingBag), Wallet: markRaw(Wallet),
  Calculator: markRaw(Calculator), BookOpen: markRaw(BookOpen), Settings: markRaw(Settings),
  Wrench: markRaw(Wrench), Zap: markRaw(Zap), Star: markRaw(Star), Link: markRaw(Link),
}

const bgColors = ['#bdf6df', '#fff07a', '#ff8d7c', '#80d7ff', '#ffb3d9', '#c9b8ff', '#ffd9a0', '#a8e6cf']

function iconComp(name) { return iconMap[name] || Globe }
function iconBg(name) {
  let hash = 0
  for (let i = 0; i < (name || '').length; i++) hash = (hash * 31 + name.charCodeAt(i)) | 0
  return bgColors[Math.abs(hash) % bgColors.length]
}
function domainOf(url) {
  try { return new URL(url).hostname } catch { return url }
}

const groupedTools = computed(() => {
  const groups = {}
  tools.value.forEach(t => {
    const key = t.category || ''
    if (!groups[key]) groups[key] = []
    groups[key].push(t)
  })
  const result = Object.entries(groups).map(([key, list]) => ({ key, tools: list.slice().sort((a, b) => (a.sortOrder || 0) - (b.sortOrder || 0)) }))
  result.sort((a, b) => {
    if (!a.key) return 1
    if (!b.key) return -1
    return a.key.localeCompare(b.key)
  })
  return result
})

function toggleCollapse(key) {
  collapsed[key] = !collapsed[key]
}

async function reload() {
  loadError.value = ''
  try { await Promise.all([loadTools(), loadCategories()]) } catch (e) { loadError.value = e.response?.data?.error || '加载失败' }
}

function openAddDialog(presetCategory) {
  editingItem.value = presetCategory != null && typeof presetCategory === 'string' ? { category: presetCategory } : null
  showDialog.value = true
}
function editTool(tool) { editingItem.value = tool; showDialog.value = true }
function closeDialog() { showDialog.value = false; editingItem.value = null }

async function saveTool(data, done) {
  try {
    if (editingItem.value?.id) await updateTool(editingItem.value.id, data)
    else await addTool(data)
    done?.(); closeDialog()
  } catch (e) { done?.(e.response?.data?.error || '保存失败') }
}

async function removeTool(tool) {
  if (!confirm(`确定删除"${tool.name}"？`)) return
  try { await deleteTool(tool.id) } catch (e) { alert(e.response?.data?.error || '删除失败') }
}

function onDragStart(tool, groupKey) {
  draggingTool.value = tool
  draggingGroup.value = groupKey
  dragOverGroup.value = null
}

function onDragEnd() {
  draggingTool.value = null
  draggingGroup.value = null
  dragOverGroup.value = null
  dropTarget.value = null
  dropPosition.value = null
}

function onGroupDragOver(groupKey) {
  dragOverGroup.value = groupKey
}

function onGroupDragLeave() {
  dragOverGroup.value = null
}

function onCardDragOver(targetTool, groupKey, event) {
  if (!draggingTool.value) return
  const rect = event.currentTarget.getBoundingClientRect()
  const midpoint = rect.top + rect.height / 2
  if (event.clientY < midpoint) {
    dropTarget.value = targetTool
    dropPosition.value = 'before'
  } else {
    dropTarget.value = targetTool
    dropPosition.value = 'after'
  }
}

async function onGroupDrop(groupKey) {
  if (!draggingTool.value) {
    onDragEnd()
    return
  }

  const tool = draggingTool.value
  const oldCategory = tool.category || ''
  const isSameGroup = oldCategory === groupKey

  // 同组内排序
  if (isSameGroup) {
    if (dropTarget.value && dropTarget.value.id !== tool.id) {
      const group = groupedTools.value.find(g => g.key === groupKey)
      if (group) {
        const list = group.tools.filter(t => t.id !== tool.id)
        const targetIndex = list.findIndex(t => t.id === dropTarget.value.id)
        if (targetIndex !== -1) {
          const insertIndex = dropPosition.value === 'before' ? targetIndex : targetIndex + 1
          list.splice(insertIndex, 0, tool)
          const order = list.map((t, i) => ({ id: t.id, sortOrder: i }))
          // 本地先更新
          list.forEach((t, i) => { t.sortOrder = i })
          try { await reorderTools(order) } catch (e) { console.error('组内排序失败:', e) }
        }
      }
    }
  } else {
    // 跨组移动
    try {
      await updateTool(tool.id, { category: groupKey || null })
    } catch (e) {
      console.error('拖动分组失败:', e)
    }
  }

  onDragEnd()
}

onMounted(() => reload())
defineExpose({ loadTools: reload })
</script>