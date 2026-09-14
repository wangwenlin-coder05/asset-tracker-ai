<template>
  <div
    class="canvas-node video-node"
    :class="{ 'node-selected': selected, 'node-generating': data.status === 'generating' }"
    :style="{ width: data.width + 'px' }"
  >
    <Handle type="target" :position="Position.Left" class="node-handle node-handle-input" />
    <div class="node-header">
      <span class="node-icon">🎬</span>
      <span class="node-title">{{ data.label || '视频节点' }}</span>
      <span class="node-meta">{{ data.duration || '0:00' }} · {{ data.resolution || '1080p' }}</span>
      <span v-if="data.status === 'generating'" class="node-badge generating">生成中</span>
      <span v-else-if="data.status === 'done'" class="node-badge done">✓</span>
    </div>

    <div class="node-body video-body">
      <video
        v-if="data.videoUrl"
        :src="data.videoUrl"
        class="node-video"
        controls
        preload="metadata"
      />
      <div v-else class="node-placeholder">
        <div v-if="data.status === 'generating'" class="spinner"></div>
        <template v-else>
          <div class="video-icon-play">▶</div>
          <span>由图片序列生成视频</span>
        </template>
      </div>
      <input
        ref="fileInputRef"
        type="file"
        accept="video/*"
        class="hidden"
        @change="onFilePick"
      />
      <button v-if="!data.videoUrl" class="upload-btn video-upload" @click="triggerUpload">
        上传视频
      </button>
      <div v-if="data.videoUrl" class="video-progress">
        <div class="progress-track">
          <div class="progress-bar" :style="{ width: (data.progress || 0) + '%' }"></div>
        </div>
      </div>
    </div>

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

function triggerUpload() { fileInputRef.value?.click() }

function onFilePick(e) {
  const file = e.target.files?.[0]
  if (!file) return
  props.data.callbacks?.onUpdateData?.({
    videoUrl: URL.createObjectURL(file),
    status: 'done',
    duration: formatDuration(file.duration || props.data.durationSec || 5)
  })
  e.target.value = ''
}

function formatDuration(sec) {
  const s = Math.round(sec)
  const m = Math.floor(s / 60)
  const r = s % 60
  return `${m}:${String(r).padStart(2, '0')}`
}
</script>

<style scoped>
.canvas-node.video-node { border-color: #16a34a; }
.canvas-node.video-node:hover { border-color: #22c55e; }
.canvas-node.video-node.node-selected { border-color: #22c55e; box-shadow: 0 0 0 2px rgba(34,197,94,0.3); }
.canvas-node.video-node.node-generating { border-color: #f59e0b; }

.video-body { aspect-ratio: 16 / 9; min-height: 90px; background: #000; }
.node-video { width: 100%; height: 100%; object-fit: cover; display: block; }
.video-icon-play {
  width: 40px; height: 40px; border-radius: 50%;
  background: rgba(255,255,255,0.1); color: #fff;
  display: flex; align-items: center; justify-content: center;
  font-size: 16px;
}
.video-progress { position: absolute; bottom: 6px; left: 6px; right: 6px; }
.progress-track { height: 3px; background: rgba(255,255,255,0.2); border-radius: 2px; overflow: hidden; }
.progress-bar { height: 100%; background: #22c55e; transition: width 0.3s; }

.upload-btn.video-upload { background: #16a34a; }
.upload-btn.video-upload:hover { background: #15803d; }

.spinner {
  width: 24px; height: 24px;
  border: 3px solid #33384a;
  border-top-color: #f59e0b;
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
}
@keyframes spin { to { transform: rotate(360deg); } }

.node-handle { width: 10px; height: 10px; background: #a855f7; border: 2px solid #1f2330; border-radius: 50%; }
.node-handle-input { background: #60a5fa; }
.node-handle-output { background: #a855f7; }

.node-header { display: flex; align-items: center; gap: 6px; padding: 6px 10px; background: #272b3a; border-bottom: 1px solid #33384a; }
.node-icon { font-size: 14px; }
.node-title { font-weight: 600; flex: 1; font-size: 12px; color: #e5e7eb; }
.node-meta { color: #94a3b8; font-size: 10px; }
.node-badge { font-size: 10px; padding: 1px 6px; border-radius: 4px; }
.node-badge.generating { background: #b45309; color: #fef3c7; }
.node-badge.done { background: #065f46; color: #a7f3d0; }

.node-body { position: relative; background: #0f1219; overflow: hidden; }
.node-placeholder { width: 100%; height: 100%; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 10px; color: #64748b; font-size: 11px; }
.upload-btn { position: absolute; bottom: 8px; left: 50%; transform: translateX(-50%); padding: 4px 10px; background: #3b82f6; color: #fff; border: none; border-radius: 6px; cursor: pointer; font-size: 11px; }
.upload-btn:hover { filter: brightness(1.1); }

.node-footer { display: flex; justify-content: flex-end; gap: 4px; padding: 4px 8px; background: #272b3a; border-top: 1px solid #33384a; }
.mini-btn { background: transparent; border: none; color: #94a3b8; cursor: pointer; font-size: 12px; padding: 2px 4px; border-radius: 4px; }
.mini-btn:hover { background: #33384a; color: #e5e7eb; }

.hidden { display: none; }
.canvas-node { background: #1f2330; border-radius: 12px; border: 1.5px solid #33384a; color: #e5e7eb; overflow: hidden; box-shadow: 0 8px 32px rgba(0,0,0,0.4); font-size: 12px; transition: border-color 0.15s, box-shadow 0.15s; }
.canvas-node:hover { border-color: #4b5563; }
</style>
