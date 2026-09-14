<template>
  <div class="px-5 mt-6">
    <div class="bg-white rounded-xl p-4 card-shadow">
      <div class="flex items-center justify-between mb-3">
        <h3 class="text-sm font-bold text-slate-700 flex items-center gap-2">
          <FileText class="w-4 h-4 text-purple-500" />
          我的画布笔记
        </h3>
        <button @click="openAddNoteDialog" class="px-3 py-1.5 text-xs bg-purple-500 text-white rounded-lg hover:bg-purple-600 transition-all flex items-center gap-1">
          <Plus class="w-3 h-3" />
          新增笔记
        </button>
      </div>

      <div v-if="notes.length > 0" class="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
        <div
          v-for="note in notes"
          :key="note.id"
          class="note-card group cursor-pointer"
          @click="openBoard(note)"
        >
          <!-- 画布缩略预览 -->
          <div class="note-thumb" :style="{ background: thumbBackground(note.content) }">
            <div v-if="thumbElements(note.content) > 0" class="thumb-count">{{ thumbElements(note.content) }} 元素</div>
            <div v-else class="thumb-empty">空白画布</div>
          </div>
          <div class="note-meta">
            <span class="note-title">{{ note.title }}</span>
            <span class="note-date">{{ formatDate(note.createdAt) }}</span>
            <div class="note-actions">
              <button @click.stop="openEditTitleDialog(note)" title="改标题"><Pencil class="w-3 h-3" /></button>
              <button @click.stop="handleDeleteNote(note.id)" title="删除"><Trash2 class="w-3 h-3" /></button>
            </div>
          </div>
        </div>
      </div>
      <div v-else class="text-center py-10 text-slate-400 text-xs">
        <div class="text-4xl mb-2">🎨</div>
        暂无画布笔记，点击右上角「新增笔记」开始
      </div>
    </div>

    <!-- 标题编辑弹窗 -->
    <NewNoteDialog
      v-if="showNoteDialog"
      :note="currentNote"
      @close="showNoteDialog = false"
      @confirm="handleSaveNote"
    />

    <!-- 全屏无限画布 -->
    <div v-if="boardOpen" class="fixed inset-0 z-50">
      <InfinityBoard
        ref="boardRef"
        :boardData="boardData"
        :boardTitle="currentNote?.title || '画布'"
        :autoSave="true"
        :onClose="closeBoard"
        @save="handleBoardSave"
      />
    </div>
  </div>
</template>

<script setup>
import { ref, computed } from 'vue'
import { FileText, Plus, Pencil, Trash2 } from 'lucide-vue-next'
import NewNoteDialog from './dialogs/NewNoteDialog.vue'
import InfinityBoard from './InfinityBoard.vue'
import { useNote } from '../composables/useNote'

const { notes, loading, loadNotes, addNote, updateNote, deleteNote } = useNote()

const showNoteDialog = ref(false)
const currentNote = ref(null)

const boardOpen = ref(false)
const boardData = ref({})
const boardRef = ref(null)

async function init() { await loadNotes() }
init()

function openAddNoteDialog() {
  currentNote.value = null
  showNoteDialog.value = true
}

function openEditTitleDialog(note) {
  currentNote.value = note
  showNoteDialog.value = true
}

async function handleSaveNote(data) {
  if (currentNote.value) {
    await updateNote(currentNote.value.id, data)
  } else {
    const result = await addNote(data)
    // 新增后直接打开画布
    await loadNotes()
    const newNote = notes.value.find(n => n.title === data.title)
    if (newNote) openBoard(newNote)
  }
  showNoteDialog.value = false
  await loadNotes()
}

async function handleDeleteNote(id) {
  if (!confirm('确定删除该画布笔记？')) return
  await deleteNote(id)
  if (currentNote.value?.id === id) boardOpen.value = false
}

function openBoard(note) {
  currentNote.value = note
  boardData.value = safeParseContent(note.content)
  boardOpen.value = true
}

function closeBoard() {
  // 退出前再保存一次
  if (boardRef.value) {
    const data = boardRef.value.exportData()
    handleBoardSave(data, true)
  }
  boardOpen.value = false
  boardData.value = {}
}

let saveTimer = null
async function handleBoardSave(data, immediate = false) {
  if (!currentNote.value) return
  const content = JSON.stringify(data)
  const doSave = async () => {
    await updateNote(currentNote.value.id, { content })
  }
  if (immediate) { await doSave(); return }
  clearTimeout(saveTimer)
  saveTimer = setTimeout(doSave, 800)
}

// --- 缩略图辅助 ---
function safeParseContent(raw) {
  if (!raw) return {}
  try { return JSON.parse(raw) } catch { return {} }
}
function thumbElements(content) {
  const d = safeParseContent(content)
  return (d.elements || []).length
}
function thumbBackground(content) {
  const d = safeParseContent(content)
  const noteColors = (d.elements || []).filter(e => e.type === 'note')
  if (noteColors.length) {
    const colorMap = { yellow: '#FEF3C7', pink: '#FCE7F3', blue: '#DBEAFE', green: '#DCFCE7', purple: '#F3E8FF', white: '#FFFFFF' }
    return colorMap[noteColors[0].color || 'yellow'] || '#FEF3C7'
  }
  return '#f8fafc'
}
function formatDate(ts) {
  if (!ts) return ''
  const d = new Date(Number(ts))
  return `${d.getMonth() + 1}/${d.getDate()}`
}

defineExpose({ loadNotes })
</script>

<style scoped>
.note-card {
  position: relative; overflow: hidden; border-radius: 10px;
  border: 1px solid #e2e8f0; background: #fff; transition: all 0.15s;
}
.note-card:hover { border-color: #a78bfa; box-shadow: 0 4px 16px rgba(167,139,250,0.15); transform: translateY(-2px); }

.note-thumb {
  height: 120px; position: relative;
  background-image: radial-gradient(circle, #cbd5e1 1px, transparent 1px);
  background-size: 18px 18px;
}
.thumb-count, .thumb-empty {
  position: absolute; bottom: 6px; right: 8px;
  font-size: 10px; color: #64748b; background: rgba(255,255,255,0.8);
  padding: 1px 6px; border-radius: 8px;
}
.thumb-empty { right: auto; left: 50%; transform: translateX(-50%); color: #94a3b8; background: transparent; }

.note-meta {
  padding: 8px 10px; border-top: 1px solid #f1f5f9; display: flex; flex-direction: column; gap: 2px;
}
.note-title { font-size: 13px; font-weight: 500; color: #1e293b; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.note-date { font-size: 11px; color: #94a3b8; }
.note-actions {
  position: absolute; top: 4px; right: 4px; display: none; gap: 2px;
  background: rgba(255,255,255,0.9); border-radius: 6px; padding: 2px;
}
.note-card:hover .note-actions { display: flex; }
.note-actions button {
  width: 22px; height: 22px; border: none; background: transparent; border-radius: 4px;
  color: #94a3b8; cursor: pointer; display: flex; align-items: center; justify-content: center;
}
.note-actions button:hover { background: #f1f5f9; color: #475569; }
</style>
