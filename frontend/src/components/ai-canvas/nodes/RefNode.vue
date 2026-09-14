<template>
  <div
    class="canvas-node ref-node"
    :class="{ 'node-selected': selected }"
    :style="{ width: data.width + 'px' }"
  >
    <Handle type="target" :position="Position.Left" class="node-handle node-handle-input" />
    <div class="node-header">
      <span class="node-icon">📎</span>
      <span class="node-title">{{ data.label || '参考节点' }}</span>
    </div>

    <div class="node-body ref-body">
      <div v-if="data.imageUrl" class="node-image-wrap">
        <img :src="data.imageUrl" :alt="data.label" class="node-image" draggable="false" />
        <div v-if="data.strength !== undefined" class="strength-badge">权重 {{ data.strength }}%</div>
      </div>
      <div v-else class="node-placeholder">
        <span>拖入参考图</span>
      </div>
      <input ref="fileInputRef" type="file" accept="image/*" class="hidden" @change="onFilePick" />
      <button v-if="!data.imageUrl" class="upload-btn" @click="triggerUpload">上传</button>
    </div>

    <div v-if="data.imageUrl" class="ref-controls">
      <label class="ctrl-label">权重</label>
      <input
        type="range" min="0" max="100" :value="data.strength ?? 70"
        class="strength-slider"
        @input="onStrength"
      />
      <span class="strength-val">{{ data.strength ?? 70 }}%</span>
    </div>

    <div class="node-footer">
      <button class="mini-btn" @click="data.callbacks?.onCopy?.()" title="复制">📋</button>
      <button class="mini-btn" @click="data.callbacks?.onDelete?.()" title="删除">🗑️</button>
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

function triggerUpload() { fileInputRef.value?.click() }

function onFilePick(e) {
  const file = e.target.files?.[0]
  if (!file) return
  const reader = new FileReader()
  reader.onload = (ev) => {
    props.data.callbacks?.onUpdateData?.({ imageUrl: ev.target.result, strength: 70 })
  }
  reader.readAsDataURL(file)
  e.target.value = ''
}

function onStrength(e) {
  props.data.callbacks?.onUpdateData?.({ strength: Number(e.target.value) })
}
</script>

<style scoped>
.canvas-node.ref-node { border-color: #06b6d4; }
.canvas-node.ref-node:hover { border-color: #22d3ee; }
.canvas-node.ref-node.node-selected { border-color: #67e8f9; box-shadow: 0 0 0 2px rgba(103,232,249,0.3); }

.ref-body { aspect-ratio: 1 / 1; min-height: 80px; }
.strength-badge {
  position: absolute; top: 4px; right: 4px;
  background: rgba(6,182,212,0.9); color: #fff;
  font-size: 10px; padding: 1px 6px; border-radius: 4px;
}
.ref-controls {
  display: flex; align-items: center; gap: 6px;
  padding: 6px 8px; background: #272b3a;
  border-top: 1px solid #33384a;
}
.ctrl-label { font-size: 11px; color: #94a3b8; }
.strength-slider { flex: 1; height: 3px; accent-color: #06b6d4; }
.strength-val { font-size: 11px; color: #e5e7eb; min-width: 32px; text-align: right; }

.node-handle { width: 10px; height: 10px; background: #a855f7; border: 2px solid #1f2330; border-radius: 50%; }
.node-handle-input { background: #60a5fa; }
.node-handle-output { background: #a855f7; }

.node-header { display: flex; align-items: center; gap: 6px; padding: 6px 10px; background: #272b3a; border-bottom: 1px solid #33384a; }
.node-icon { font-size: 14px; }
.node-title { font-weight: 600; flex: 1; font-size: 12px; color: #e5e7eb; }

.node-image-wrap { width: 100%; height: 100%; }
.node-image { width: 100%; height: 100%; object-fit: cover; display: block; }
.node-placeholder { width: 100%; height: 100%; display: flex; align-items: center; justify-content: center; color: #64748b; font-size: 11px; }
.upload-btn { position: absolute; bottom: 8px; left: 50%; transform: translateX(-50%); padding: 4px 10px; background: #06b6d4; color: #fff; border: none; border-radius: 6px; cursor: pointer; font-size: 11px; }
.upload-btn:hover { background: #0891b2; }

.node-footer { display: flex; justify-content: flex-end; gap: 4px; padding: 4px 8px; background: #272b3a; border-top: 1px solid #33384a; }
.mini-btn { background: transparent; border: none; color: #94a3b8; cursor: pointer; font-size: 12px; padding: 2px 4px; border-radius: 4px; }
.mini-btn:hover { background: #33384a; color: #e5e7eb; }

.hidden { display: none; }
.canvas-node { background: #1f2330; border-radius: 12px; border: 1.5px solid #33384a; color: #e5e7eb; overflow: hidden; box-shadow: 0 8px 32px rgba(0,0,0,0.4); font-size: 12px; transition: border-color 0.15s, box-shadow 0.15s; }
.node-body { position: relative; background: #0f1219; }
</style>
