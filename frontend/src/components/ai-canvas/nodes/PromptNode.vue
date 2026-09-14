<template>
  <div
    class="canvas-node prompt-node"
    :class="{ 'node-selected': selected }"
    :style="{ width: data.width + 'px' }"
  >
    <Handle type="source" :position="Position.Right" class="node-handle node-handle-output" />

    <div class="node-header">
      <span class="node-icon">💬</span>
      <span class="node-title">{{ data.label || '提示词' }}</span>
      <span class="node-meta">{{ currentLength }}/{{ maxLength }}</span>
    </div>

    <div class="node-body prompt-body">
      <textarea
        v-if="editing"
        ref="textareaRef"
        v-model="localContent"
        class="prompt-textarea"
        rows="5"
        :maxlength="maxLength"
        autofocus
        @blur="onBlur"
        @keydown.enter.exact.prevent="onBlur"
        placeholder="输入 AI 提示词…"
      ></textarea>
      <div v-else class="prompt-content" @dblclick="startEdit" @click="startEdit">
        {{ data.content || '双击输入提示词…' }}
      </div>
      <div v-if="editing" class="edit-hint">Enter / 点击空白 确认 · Esc 取消</div>
    </div>

    <div class="node-footer">
      <button class="mini-btn" @click="data.callbacks?.onCopy?.()" title="复制">📋</button>
      <button class="mini-btn" @click="data.callbacks?.onDelete?.()" title="删除">🗑️</button>
      <button class="mini-btn" @click="startEdit" title="编辑">✏️</button>
    </div>

    <Handle type="target" :position="Position.Left" class="node-handle node-handle-input" />
  </div>
</template>

<script setup>
import { ref, computed, watch, nextTick } from 'vue'
import { Handle, Position } from '@vue-flow/core'

const props = defineProps({
  id: String,
  type: String,
  selected: Boolean,
  data: { type: Object, default: () => ({}) },
  dragging: Boolean,
  zIndex: Number
})

const maxLength = 500
const textareaRef = ref(null)
const editing = ref(false)
const localContent = ref('')

const currentLength = computed(() => (props.data.content || '').length)

function startEdit() {
  localContent.value = props.data.content || ''
  editing.value = true
  nextTick(() => {
    textareaRef.value?.focus()
    textareaRef.value?.select()
  })
}
function onBlur() {
  // 空内容不保存
  const trimmed = localContent.value.trim()
  if (trimmed !== (props.data.content || '')) {
    props.data.callbacks?.onUpdateData?.({ content: localContent.value })
  }
  editing.value = false
}

// 父组件双击节点会改 _editTrigger，这里监听它来唤起编辑
watch(
  () => props.data._editTrigger,
  () => {
    if (props.data._editTrigger) {
      startEdit()
    }
  }
)

// Esc 取消编辑 —— 由全局快捷键处理
</script>

<style scoped>
.canvas-node.prompt-node { border-color: #6366f1; }
.canvas-node.prompt-node:hover { border-color: #818cf8; }
.canvas-node.prompt-node.node-selected { border-color: #a5b4fc; box-shadow: 0 0 0 2px rgba(165,180,252,0.3); }

.prompt-body { position: relative; padding: 8px; background: #0f1219; min-height: 80px; }
.prompt-content {
  color: #cbd5e1; font-size: 12px; line-height: 1.6;
  white-space: pre-wrap; word-break: break-word;
  min-height: 60px; cursor: text;
}
.prompt-content:empty::before {
  content: attr(data-placeholder);
  color: #4b5563;
}
.prompt-textarea {
  width: 100%; min-height: 80px;
  background: #0b0e16; color: #e5e7eb;
  border: 1px solid #818cf8; border-radius: 6px;
  padding: 6px 8px; font-size: 12px; line-height: 1.6;
  resize: vertical; outline: none; font-family: inherit;
}
.edit-hint { color: #64748b; font-size: 10px; margin-top: 4px; text-align: right; }

.node-handle { width: 10px; height: 10px; background: #a855f7; border: 2px solid #1f2330; border-radius: 50%; }
.node-handle-input { background: #60a5fa; }
.node-handle-output { background: #a855f7; }

.node-header { display: flex; align-items: center; gap: 6px; padding: 6px 10px; background: #272b3a; border-bottom: 1px solid #33384a; }
.node-icon { font-size: 14px; }
.node-title { font-weight: 600; flex: 1; font-size: 12px; color: #e5e7eb; }
.node-meta { color: #64748b; font-size: 10px; }

.node-footer { display: flex; justify-content: flex-end; gap: 4px; padding: 4px 8px; background: #272b3a; border-top: 1px solid #33384a; }
.mini-btn { background: transparent; border: none; color: #94a3b8; cursor: pointer; font-size: 12px; padding: 2px 4px; border-radius: 4px; }
.mini-btn:hover { background: #33384a; color: #e5e7eb; }

.hidden { display: none; }
.canvas-node { background: #1f2330; border-radius: 12px; border: 1.5px solid #33384a; color: #e5e7eb; overflow: hidden; box-shadow: 0 8px 32px rgba(0,0,0,0.4); font-size: 12px; transition: border-color 0.15s, box-shadow 0.15s; }
.canvas-node:hover { border-color: #4b5563; }
</style>
