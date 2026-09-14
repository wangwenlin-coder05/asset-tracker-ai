<template>
  <div class="fixed inset-0 bg-black/50 flex items-center justify-center z-50" :class="{ 'hidden': !visible }">
    <div class="bg-white rounded-xl p-6 w-[460px] card-shadow dialog-enter">
      <div class="flex justify-between items-center mb-4">
        <h3 class="text-lg font-bold text-slate-800 flex items-center gap-2">
          <FileText class="w-5 h-5 text-purple-500" />
          {{ note ? '编辑笔记标题' : '新增画布笔记' }}
        </h3>
        <button @click="$emit('close')" class="text-neutral hover:text-slate-800">
          <X class="w-5 h-5" />
        </button>
      </div>
      <div class="space-y-3">
        <div>
          <label class="block text-sm font-medium text-neutral mb-1">笔记标题</label>
          <input
            type="text"
            v-model="form.title"
            class="w-full border border-slate-200 rounded px-3 py-2 text-sm focus:input-focus"
            placeholder="给你的画布起个名字"
            @keydown.enter="handleConfirm"
          />
        </div>
        <button
          @click="handleConfirm"
          class="w-full py-2.5 bg-purple-500 text-white rounded-lg hover:bg-purple-600 transition-all font-medium"
        >{{ note ? '保存标题' : '确认并进入画布' }}</button>
        <p class="text-xs text-slate-400 text-center">
          {{ note ? '点击标题旁的「打开画布」继续编辑内容' : '确认后将打开无限画布，支持便签、文本、连线等' }}
        </p>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, reactive, watch } from 'vue'
import { FileText, X } from 'lucide-vue-next'

const props = defineProps({ note: { type: Object, default: null } })
const emit = defineEmits(['close', 'confirm'])

const visible = ref(true)

const form = reactive({ title: '' })

watch(() => props.note, (note) => {
  if (note) form.title = note.title || ''
}, { immediate: true })

async function handleConfirm() {
  if (!form.title) { alert('请填写标题'); return }
  emit('confirm', { title: form.title })
}
</script>
