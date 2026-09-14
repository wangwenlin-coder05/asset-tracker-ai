<template>
  <div
    class="canvas-node image-node"
    :class="{ 'node-selected': selected, 'node-generating': data.status === 'generating' }"
    :style="{ width: data.width + 'px' }"
  >
    <!-- 顶部标题栏 -->
    <Handle type="target" :position="Position.Left" class="node-handle node-handle-input" />
    <div class="node-header">
      <span class="node-icon">🖼️</span>
      <span class="node-title">{{ data.label || '图片节点' }}</span>
      <span class="node-meta">{{ data.width || 1024 }}×{{ data.height || 1024 }}</span>
      <span v-if="data.status === 'generating'" class="node-badge generating">生成中</span>
      <span v-else-if="data.status === 'done'" class="node-badge done">✓</span>
    </div>

    <!-- 图片预览区 -->
    <div class="node-body">
      <div v-if="data.imageUrl" class="node-image-wrap">
        <img :src="data.imageUrl" :alt="data.label" class="node-image" draggable="false" />
      </div>
      <div v-else class="node-placeholder">
        <div v-if="data.status === 'generating'" class="spinner"></div>
        <span v-else>点击上传 或 由 AI 生成</span>
      </div>
      <!-- 上传按钮 -->
      <input
        ref="fileInputRef"
        type="file"
        accept="image/*"
        class="hidden"
        @change="onFilePick"
      />
      <button v-if="!data.imageUrl" class="upload-btn" @click="triggerUpload">
        上传图片
      </button>
    </div>

    <!-- 底部操作条 -->
    <div class="node-footer">
      <button class="mini-btn" @click="data.callbacks?.onCopy?.()" title="复制">📋</button>
      <button class="mini-btn" @click="data.callbacks?.onDelete?.()" title="删除">🗑️</button>
      <button class="mini-btn" @click="data.callbacks?.onExpand?.()" title="编辑">✏️</button>
    </div>

    <Handle type="source" :position="Position.Right" class="node-handle node-handle-output" />
  </div>
</template>

<script setup>
import { ref } from 'vue'
import { Handle, Position } from '@vue-flow/core'

const props = defineProps({
  id: String,
  type: String,
  selected: Boolean,
  data: { type: Object, default: () => ({}) },
  dragging: Boolean,
  zIndex: Number
})

const fileInputRef = ref(null)

function triggerUpload() {
  fileInputRef.value?.click()
}

function onFilePick(e) {
  const file = e.target.files?.[0]
  if (!file) return
  const reader = new FileReader()
  reader.onload = (ev) => {
    props.data.callbacks?.onUpdateData?.({ imageUrl: ev.target.result, status: 'done' })
  }
  reader.readAsDataURL(file)
  e.target.value = ''
}
</script>

<style scoped>
.canvas-node {
  background: #1f2330;
  border-radius: 12px;
  border: 1.5px solid #33384a;
  color: #e5e7eb;
  overflow: hidden;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.4);
  font-size: 12px;
  transition: border-color 0.15s, box-shadow 0.15s;
}
.canvas-node:hover { border-color: #4b5563; }
.canvas-node.node-selected { border-color: #a855f7; box-shadow: 0 0 0 2px rgba(168, 85, 247, 0.3), 0 8px 32px rgba(0,0,0,0.4); }
.canvas-node.node-generating { border-color: #f59e0b; }

.node-handle {
  width: 10px; height: 10px;
  background: #a855f7;
  border: 2px solid #1f2330;
  border-radius: 50%;
}
.node-handle-input { background: #60a5fa; }
.node-handle-output { background: #a855f7; }

.node-header {
  display: flex; align-items: center; gap: 6px;
  padding: 6px 10px;
  background: #272b3a;
  border-bottom: 1px solid #33384a;
}
.node-icon { font-size: 14px; }
.node-title { font-weight: 600; flex: 1; }
.node-meta { color: #94a3b8; font-size: 10px; }
.node-badge { font-size: 10px; padding: 1px 6px; border-radius: 4px; }
.node-badge.generating { background: #b45309; color: #fef3c7; }
.node-badge.done { background: #065f46; color: #a7f3d0; }

.node-body {
  position: relative;
  aspect-ratio: 1 / 1;
  background: #0f1219;
  min-height: 120px;
}
.node-image-wrap { width: 100%; height: 100%; }
.node-image { width: 100%; height: 100%; object-fit: cover; display: block; }
.node-placeholder {
  width: 100%; height: 100%;
  display: flex; flex-direction: column; align-items: center; justify-content: center;
  gap: 10px; color: #64748b; font-size: 11px;
}
.upload-btn {
  position: absolute; bottom: 8px; left: 50%; transform: translateX(-50%);
  padding: 4px 10px;
  background: #3b82f6; color: #fff; border: none; border-radius: 6px;
  cursor: pointer; font-size: 11px;
}
.upload-btn:hover { background: #2563eb; }

.spinner {
  width: 24px; height: 24px;
  border: 3px solid #33384a;
  border-top-color: #f59e0b;
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
}
@keyframes spin { to { transform: rotate(360deg); } }

.node-footer {
  display: flex; justify-content: flex-end; gap: 4px;
  padding: 4px 8px; background: #272b3a;
  border-top: 1px solid #33384a;
}
.mini-btn {
  background: transparent; border: none; color: #94a3b8;
  cursor: pointer; font-size: 12px; padding: 2px 4px;
  border-radius: 4px;
}
.mini-btn:hover { background: #33384a; color: #e5e7eb; }
</style>
