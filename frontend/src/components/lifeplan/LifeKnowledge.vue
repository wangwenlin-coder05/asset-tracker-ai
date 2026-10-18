<template>
  <div class="space-y-3">
    <!-- 待复习提示 -->
    <div v-if="dueList.length" class="flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-[11px] text-amber-700">
      <Bell class="mt-0.5 w-3.5 h-3.5 flex-shrink-0" />
      <span>今天有 {{ dueList.length }} 个知识点需要复习：{{ dueTitles }}</span>
    </div>

    <div class="flex items-center justify-between gap-3 flex-wrap">
      <p class="text-xs text-slate-400">共 {{ items.length }} 个知识点 · 按录入时间倒序</p>
      <button
        class="px-3 h-8 rounded-lg bg-indigo-500 text-white text-xs font-medium hover:bg-indigo-600 transition-colors flex items-center gap-1.5"
        @click="openCreate"
      >
        <Plus class="w-3.5 h-3.5" /> 新增知识点
      </button>
    </div>

    <!-- 新增 / 编辑表单 -->
    <div v-if="showForm" class="rounded-xl border border-indigo-100 bg-white px-3 py-3 space-y-2.5">
      <div class="grid grid-cols-1 sm:grid-cols-4 gap-2">
        <select v-model="form.subject" class="h-9" :class="INPUT">
          <option v-for="item in SUBJECTS" :key="item" :value="item">{{ item }}</option>
        </select>
        <input v-model.trim="form.topic" class="h-9 sm:col-span-3" :class="INPUT" placeholder="知识点标题" @keydown.enter="save" />
      </div>
      <textarea v-model="form.content" rows="2" class="w-full resize-none px-2.5 py-2" :class="INPUT" placeholder="内容摘要"></textarea>
      <div class="grid grid-cols-1 sm:grid-cols-2 gap-2">
        <textarea v-model="form.wrongQuestions" rows="2" class="w-full resize-none px-2.5 py-2" :class="INPUT" placeholder="错题要点"></textarea>
        <input v-model.trim="form.tags" class="h-9" :class="INPUT" placeholder="标签（用逗号分隔）" @keydown.enter="save" />
      </div>
      <div class="flex items-center justify-end gap-2">
        <button class="h-8 px-3 rounded-lg bg-white border border-slate-200 text-slate-500 text-xs hover:border-slate-300 transition-colors" @click="showForm = false">取消</button>
        <button
          class="h-8 px-3 rounded-lg bg-indigo-500 text-white text-xs font-medium hover:bg-indigo-600 transition-colors disabled:opacity-50 flex items-center gap-1.5"
          :disabled="busy || !form.topic.trim()"
          @click="save"
        >
          <Loader2 v-if="busy" class="w-3.5 h-3.5 animate-spin" /> 保存
        </button>
      </div>
    </div>

    <!-- 列表 -->
    <p v-if="loading" class="rounded-xl border border-slate-100 bg-white px-3 py-6 flex items-center justify-center gap-2 text-xs text-slate-400">
      <Loader2 class="w-3.5 h-3.5 animate-spin" /> 加载中…
    </p>
    <p v-else-if="!items.length" class="rounded-xl border border-slate-100 bg-white px-3 py-8 text-center text-xs text-slate-400">
      知识库还是空的，录入第一道错题或知识点开始积累
    </p>

    <div v-else class="space-y-2">
      <div v-for="item in sortedItems" :key="item.id" class="rounded-xl border border-slate-100 bg-white px-3 py-2.5 hover:bg-slate-50/70 transition-colors">
        <div class="flex items-center gap-2 flex-wrap">
          <span class="text-[10px] px-1.5 py-0.5 rounded" :class="SUBJECT_CLS[item.subject] || 'bg-slate-100 text-slate-500'">{{ item.subject }}</span>
          <span class="text-sm font-semibold text-slate-700">{{ item.topic }}</span>
          <span class="text-[10px] px-1.5 py-0.5 rounded border" :class="item.reviewStage >= 5 ? 'bg-emerald-50 text-emerald-600 border-emerald-200' : 'bg-slate-100 text-slate-500 border-slate-200'">
            {{ item.reviewStage >= 5 ? '已掌握' : '阶段 ' + item.reviewStage + '/5' }}
          </span>
        </div>

        <p v-if="item.content" class="mt-1 text-[11px] text-slate-500">{{ truncate(item.content, 80) }}</p>
        <p v-if="item.wrongQuestions" class="mt-0.5 text-[11px] text-rose-500">错题：{{ truncate(item.wrongQuestions, 60) }}</p>

        <div class="mt-1.5 flex items-center gap-3 flex-wrap">
          <div class="flex items-center gap-1">
            <span
              v-for="step in 6"
              :key="step"
              class="h-1.5 w-4 rounded-full transition-colors"
              :class="step <= item.reviewStage ? 'bg-indigo-400' : 'bg-slate-200'"
            ></span>
          </div>
          <span class="text-[11px] text-slate-400">
            {{ item.nextReviewDate ? '下次复习 ' + item.nextReviewDate : '已掌握' }}
          </span>
          <span v-if="item.tags" class="text-[11px] text-slate-400">{{ item.tags }}</span>
        </div>

        <div class="mt-1.5 flex items-center gap-2">
          <button
            class="h-7 px-2.5 rounded-lg border border-indigo-200 text-indigo-600 text-[11px] hover:bg-indigo-50 transition-colors flex items-center gap-1"
            :disabled="busy"
            @click="review(item)"
          >
            <RefreshCw class="w-3.5 h-3.5" /> 推进复习
          </button>
          <button class="h-7 px-2.5 rounded-lg border border-slate-200 text-slate-500 text-[11px] hover:border-slate-300 transition-colors flex items-center gap-1" @click="openEdit(item)">
            <Pencil class="w-3.5 h-3.5" /> 编辑
          </button>
          <button class="h-7 px-2.5 rounded-lg border border-rose-200 text-rose-500 text-[11px] hover:bg-rose-50 transition-colors flex items-center gap-1" @click="remove(item)">
            <Trash2 class="w-3.5 h-3.5" /> 删除
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed, onMounted, reactive, ref, watch } from 'vue'
import { Bell, Loader2, Pencil, Plus, RefreshCw, Trash2 } from 'lucide-vue-next'
import { lifeApi } from '../../utils/api'
import { toast } from '../../utils/toast'

const props = defineProps({ refreshToken: { type: Number, default: 0 } })
const emit = defineEmits(['changed'])

const INPUT = 'rounded-lg border border-slate-200 bg-white text-xs text-slate-700 outline-none transition-colors focus:border-indigo-300'
const SUBJECTS = ['行测', '申论', '软考', '编程', '交易']
const SUBJECT_CLS = {
  行测: 'bg-indigo-50 text-indigo-600',
  申论: 'bg-amber-50 text-amber-600',
  软考: 'bg-sky-50 text-sky-600',
  编程: 'bg-emerald-50 text-emerald-600',
  交易: 'bg-rose-50 text-rose-600'
}

const items = ref([])
const loading = ref(true)
const busy = ref(false)
const showForm = ref(false)
const form = reactive({ id: '', subject: '行测', topic: '', content: '', wrongQuestions: '', tags: '' })

function fmt(date) {
  const pad = n => String(n).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
}
function todayStr() {
  return fmt(new Date())
}
function failText(err) {
  return err?.response?.data?.error || err?.message || '操作失败'
}
function truncate(text, max) {
  const str = String(text || '')
  return str.length > max ? str.slice(0, max) + '…' : str
}

const sortedItems = computed(() =>
  [...items.value].sort((a, b) => (Number(b.createdAt) || 0) - (Number(a.createdAt) || 0))
)
const dueList = computed(() => items.value.filter(item => item.reviewStage < 5 && item.nextReviewDate && item.nextReviewDate <= todayStr()))
const dueTitles = computed(() => dueList.value.slice(0, 3).map(item => item.topic).join('、'))

async function load() {
  loading.value = true
  try {
    const result = await lifeApi.getKnowledge()
    items.value = result.items || []
  } catch (err) {
    toast.error(failText(err))
  } finally {
    loading.value = false
  }
}

function openCreate() {
  Object.assign(form, { id: '', subject: '行测', topic: '', content: '', wrongQuestions: '', tags: '' })
  showForm.value = true
}

function openEdit(item) {
  Object.assign(form, {
    id: item.id,
    subject: item.subject || '行测',
    topic: item.topic || '',
    content: item.content || '',
    wrongQuestions: item.wrongQuestions || '',
    tags: item.tags || ''
  })
  showForm.value = true
}

async function save() {
  if (busy.value || !form.topic.trim()) return
  busy.value = true
  try {
    const payload = {
      subject: form.subject,
      topic: form.topic.trim(),
      content: form.content.trim(),
      wrongQuestions: form.wrongQuestions.trim(),
      tags: form.tags.trim()
    }
    const result = form.id ? await lifeApi.updateKnowledge(form.id, payload) : await lifeApi.createKnowledge(payload)
    items.value = result.items || []
    showForm.value = false
    emit('changed')
    toast.success(form.id ? '知识点已更新' : '知识点已录入')
  } catch (err) {
    toast.error(failText(err))
  } finally {
    busy.value = false
  }
}

async function review(item) {
  if (busy.value) return
  busy.value = true
  try {
    const result = await lifeApi.reviewKnowledge(item.id)
    items.value = result.items || []
    emit('changed')
    toast.success('复习进度已推进')
  } catch (err) {
    toast.error(failText(err))
  } finally {
    busy.value = false
  }
}

async function remove(item) {
  if (busy.value) return
  busy.value = true
  try {
    const result = await lifeApi.deleteKnowledge(item.id)
    items.value = result.items || []
    emit('changed')
    toast.success('知识点已删除')
  } catch (err) {
    toast.error(failText(err))
  } finally {
    busy.value = false
  }
}

watch(() => props.refreshToken, load)
onMounted(load)
</script>
