<template>
  <section class="h-full flex flex-col gap-4">
    <!-- 头部 -->
    <div class="flex items-center justify-between flex-shrink-0">
      <div class="flex items-center gap-2">
        <h2 class="text-lg font-bold text-slate-700">AI 题目问答</h2>
        <span class="text-xs text-slate-400">早盘集合竞价题库 · AI 对比评卷</span>
      </div>
      <button
        @click="openCreate"
        class="px-4 h-9 rounded-lg bg-gradient-to-r from-indigo-500 to-blue-500 text-white text-sm font-medium shadow-sm hover:opacity-90 transition-opacity"
      >+ 新增题目</button>
    </div>

    <!-- 空状态 -->
    <div v-if="!loading && !questions.length" class="flex-1 flex flex-col items-center justify-center text-slate-400 gap-2">
      <p class="text-sm">题库为空，点击右上角「新增题目」开始录入集合竞价截图</p>
    </div>

    <!-- 题目列表 -->
    <div v-else class="flex-1 overflow-y-auto grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3 content-start pb-4">
      <div
        v-for="q in questions"
        :key="q.id"
        class="rounded-xl bg-white border border-slate-100 shadow-sm flex flex-col overflow-hidden hover:shadow-md transition-shadow cursor-pointer"
        @click="openPractice(q)"
        @dblclick="openEdit(q)"
      >
        <div class="flex items-stretch border-b border-slate-100">
          <button
            class="w-24 h-24 flex-shrink-0 bg-slate-50 flex items-center justify-center overflow-hidden"
            title="点击查看大图"
            @click.stop="previewImage(q)"
          >
            <img v-if="q.image" :src="'/' + q.image" alt="竞价图" class="w-full h-full object-cover" />
            <span v-else class="text-xs text-slate-300">无图</span>
          </button>
          <div class="flex-1 min-w-0 px-3 py-2 flex flex-col justify-center gap-1">
            <div class="flex items-center gap-2 min-w-0">
              <span class="font-semibold text-slate-700 truncate">{{ q.stockName || '未命名' }}</span>
              <span v-if="q.stockCode" class="text-xs text-slate-400 flex-shrink-0">{{ q.stockCode }}</span>
            </div>
            <div v-if="q.quizDate" class="text-xs text-slate-400">{{ q.quizDate }} · 集合竞价</div>
            <div v-if="q.note" class="text-xs text-slate-400 truncate">备注：{{ q.note }}</div>
            <div class="mt-1 flex items-center gap-1.5">
              <button
                class="px-2 py-0.5 rounded-md text-xs bg-indigo-50 text-indigo-600 font-medium hover:bg-indigo-100 transition-colors"
                @click.stop="openPractice(q)"
              >答题</button>
              <button
                class="px-2 py-0.5 rounded-md text-xs bg-slate-100 text-slate-500 hover:bg-slate-200 transition-colors"
                @click.stop="openEdit(q)"
              >编辑</button>
              <button
                class="px-2 py-0.5 rounded-md text-xs bg-rose-50 text-rose-500 hover:bg-rose-100 transition-colors"
                @click.stop="del(q)"
              >删除</button>
            </div>
          </div>
        </div>
        <div class="px-3 py-2 min-h-[52px]">
          <p class="text-[13px] text-slate-500 leading-relaxed line-clamp-2">
            <span class="text-slate-400">标准答案：</span>{{ q.correctAnswer || '（未填写标准答案）' }}
          </p>
        </div>
      </div>
    </div>

    <!-- 新增/编辑弹窗 -->
    <div
      v-if="editVisible"
      class="fixed inset-0 z-[100] flex items-center justify-center"
      @mousedown.prevent
    >
      <div class="absolute inset-0 bg-slate-900/40 backdrop-blur-sm" @mousedown.stop></div>
      <div class="relative w-[640px] max-w-[92vw] max-h-[92vh] bg-white rounded-2xl shadow-2xl flex flex-col overflow-hidden">
        <div class="flex items-center justify-between px-6 py-4 border-b border-slate-100 flex-shrink-0">
          <h3 class="text-base font-bold text-slate-700">{{ editing.id ? '编辑题目' : '新增题目' }}</h3>
          <button class="w-8 h-8 rounded-lg text-slate-400 hover:bg-slate-100 flex items-center justify-center" @click="editVisible = false"><X class="w-4 h-4" /></button>
        </div>
        <div class="px-6 py-4 overflow-y-auto flex-1 flex flex-col gap-4">
          <div class="flex items-start gap-6">
            <!-- 图片上传/预览 -->
            <div class="flex-shrink-0 flex flex-col items-center gap-2">
              <button
                class="w-36 h-36 rounded-xl border-2 border-dashed border-slate-200 hover:border-indigo-300 flex items-center justify-center overflow-hidden bg-slate-50"
                @click="triggerUpload"
              >
                <img v-if="form.image" :src="'/' + form.image" alt="预览" class="w-full h-full object-cover" />
                <span v-else class="text-xs text-slate-400 text-center px-2">点击上传集合竞价截图</span>
              </button>
              <input ref="fileInput" type="file" accept="image/*" class="hidden" @change="onFile">
              <div class="flex gap-2">
                <button class="px-3 py-1 rounded-md text-xs bg-slate-100 text-slate-600 hover:bg-slate-200" @click="triggerUpload">上传</button>
                <button v-if="form.image" class="px-3 py-1 rounded-md text-xs bg-amber-50 text-amber-600 hover:bg-amber-100" @click="previewImage(form)">预览</button>
              </div>
            </div>
            <!-- 字段 -->
            <div class="flex-1 grid grid-cols-1 gap-3">
              <label class="block">
                <span class="text-xs text-slate-500 mb-1 inline-block">股票名称</span>
                <input v-model="form.stockName" class="w-full h-9 px-3 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300" placeholder="如：贵州茅台" />
              </label>
              <div class="grid grid-cols-2 gap-3">
                <label class="block">
                  <span class="text-xs text-slate-500 mb-1 inline-block">股票代码</span>
                  <input v-model="form.stockCode" class="w-full h-9 px-3 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300" placeholder="如：600519" />
                </label>
                <label class="block">
                  <span class="text-xs text-slate-500 mb-1 inline-block">竞价日期</span>
                  <input v-model="form.quizDate" type="date" class="w-full h-9 px-3 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300" />
                </label>
              </div>
              <label class="block">
                <span class="text-xs text-slate-500 mb-1 inline-block">备注</span>
                <input v-model="form.note" class="w-full h-9 px-3 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300" placeholder="可写盘面背景、技术形态等" />
              </label>
            </div>
          </div>
          <label class="block">
            <span class="text-xs text-slate-500 mb-1 inline-block">标准答案（AI 将以它为准评卷）</span>
            <textarea v-model="form.correctAnswer" rows="8" class="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm leading-relaxed focus:outline-none focus:ring-2 focus:ring-indigo-300 resize-y" placeholder="填写该图的正确解读：趋势方向、关键点位、资金动向、买卖信号等" />
          </label>
        </div>
        <div class="flex items-center justify-end gap-3 px-6 py-4 border-t border-slate-100 flex-shrink-0">
          <button class="px-4 h-9 rounded-lg text-sm text-slate-500 hover:bg-slate-100" @click="editVisible = false">取消</button>
          <button :disabled="saving" class="px-5 h-9 rounded-lg bg-gradient-to-r from-indigo-500 to-blue-500 text-white text-sm font-medium shadow-sm hover:opacity-90 disabled:opacity-50" @click="save">
            {{ saving ? '保存中…' : '保存' }}
          </button>
        </div>
      </div>
    </div>

    <!-- 答题弹窗 -->
    <div
      v-if="practiceVisible"
      class="fixed inset-0 z-[100] flex items-center justify-center"
      @mousedown.prevent
    >
      <div class="absolute inset-0 bg-slate-900/40 backdrop-blur-sm" @mousedown.stop></div>
      <div class="relative w-[960px] max-w-[94vw] max-h-[92vh] bg-white rounded-2xl shadow-2xl flex flex-col overflow-hidden">
        <div class="flex items-center justify-between px-6 py-4 border-b border-slate-100 flex-shrink-0">
          <h3 class="text-base font-bold text-slate-700">
            答题练习
            <span class="ml-2 text-sm font-normal text-slate-400">{{ current ? current.stockName : '' }}（{{ current ? current.stockCode : '' }}）{{ current && current.quizDate ? ' · ' + current.quizDate : '' }}</span>
          </h3>
          <button class="w-8 h-8 rounded-lg text-slate-400 hover:bg-slate-100 flex items-center justify-center" @click="practiceVisible = false"><X class="w-4 h-4" /></button>
        </div>
        <div class="px-6 py-4 overflow-y-auto flex-1 flex gap-6">
          <!-- 左：题目图 -->
          <div class="flex-shrink-0 w-[400px]">
            <button class="w-full aspect-video rounded-xl border border-slate-200 overflow-hidden bg-slate-50 block" @click="previewImage(current)">
              <img v-if="current && current.image" :src="'/' + current.image" alt="竞价图" class="w-full h-full object-cover" />
              <span v-else class="flex items-center justify-center h-full text-xs text-slate-300">无图</span>
            </button>
            <p class="text-xs text-slate-400 mt-2">提示：点击图片可放大，先自己分析再作答</p>
            <div v-if="current && current.note" class="mt-3 rounded-lg bg-amber-50 border border-amber-100 px-3 py-2 text-xs text-amber-700 leading-relaxed">备注：{{ current.note }}</div>
          </div>
          <!-- 右：作答 + 评价 -->
          <div class="flex-1 min-w-0 flex flex-col gap-3">
            <label class="block">
              <span class="text-xs text-slate-500 mb-1 inline-block">我的理解 / 答案</span>
              <textarea v-model="userAnswer" rows="6" class="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm leading-relaxed focus:outline-none focus:ring-2 focus:ring-indigo-300 resize-y" placeholder="写下你对这张竞价图的解读：趋势方向、关键信号、买卖判断…" />
            </label>
            <div class="flex items-center gap-2">
              <button :disabled="evaluating || !userAnswer.trim()" class="px-4 h-9 rounded-lg bg-violet-600 text-white text-sm font-medium shadow-sm hover:opacity-90 disabled:opacity-50 flex items-center gap-2" @click="doEvaluate">
                {{ evaluating ? 'AI 评卷中…' : '提交 AI 评卷' }}
              </button>
              <button v-if="evaluation && !savingAnswer" class="px-4 h-9 rounded-lg bg-slate-100 text-slate-600 text-sm hover:bg-slate-200" @click="saveAnswerRecord">
                保存本次作答
              </button>
              <span v-if="savingAnswer" class="text-xs text-slate-400">已保存✓</span>
            </div>
            <!-- AI 评价 -->
            <div v-if="evaluation" class="quiz-eval-content rounded-xl border border-violet-100 bg-gradient-to-br from-violet-50 to-fuchsia-50 px-4 py-3">
              <h3 class="text-sm font-bold text-violet-700 mb-2">AI 评卷结果</h3>
              <div class="text-[13px] leading-relaxed text-slate-600 whitespace-pre-wrap">{{ evaluation }}</div>
            </div>
            <!-- 历史作答 -->
            <div v-if="answers.length" class="mt-2">
              <h4 class="text-xs font-semibold text-slate-500 mb-2">历史作答（{{ answers.length }}）</h4>
              <div v-for="a in answers" :key="a.id" class="rounded-lg border border-slate-100 px-3 py-2 mb-2">
                <div class="text-xs text-slate-400 mb-1">{{ fmtTime(a.createdAt) }} · 本次作答 <span class="text-indigo-500">{{ a.userAnswer.length }}字</span></div>
                <div class="text-[13px] text-slate-600 whitespace-pre-wrap">{{ a.aiEvaluation || '（无评价）' }}</div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- 图片大图预览 -->
    <div v-if="previewUrl" class="fixed inset-0 z-[120] flex items-center justify-center bg-slate-900/70" @mousedown.prevent @click.self="previewUrl = ''">
      <button class="absolute top-4 right-4 w-10 h-10 rounded-full bg-white/10 text-white hover:bg-white/20 flex items-center justify-center" @click="previewUrl = ''"><X class="w-5 h-5" /></button>
      <img :src="previewUrl" alt="大图" class="max-w-[90vw] max-h-[90vh] object-contain rounded-lg shadow-2xl" />
    </div>
  </section>
</template>

<script setup>
import { ref, onBeforeUnmount, onMounted } from 'vue'
import { X } from 'lucide-vue-next'
import { quizApi } from '../utils/api'

const questions = ref([])
const loading = ref(true)
const fileInput = ref(null)

const editing = ref({})
const form = ref({ stockName: '', stockCode: '', quizDate: '', image: '', correctAnswer: '', note: '' })
const editVisible = ref(false)
const saving = ref(false)

const current = ref(null)
const practiceVisible = ref(false)
const userAnswer = ref('')
const evaluation = ref('')
const evaluating = ref(false)
const savingAnswer = ref(false)
const answers = ref([])

const previewUrl = ref('')

async function load() {
  loading.value = true
  try {
    const list = await quizApi.getQuestions()
    questions.value = Array.isArray(list) ? list : []
  } catch (e) {
    console.error('加载题库失败:', e)
    questions.value = []
  } finally {
    loading.value = false
  }
}

function openCreate() {
  editing.value = {}
  form.value = { stockName: '', stockCode: '', quizDate: '', image: '', correctAnswer: '', note: '' }
  editVisible.value = true
}

function openEdit(q) {
  editing.value = q
  form.value = { stockName: q.stockName || '', stockCode: q.stockCode || '', quizDate: q.quizDate || '', image: q.image || '', correctAnswer: q.correctAnswer || '', note: q.note || '' }
  editVisible.value = true
}

function triggerUpload() {
  fileInput.value?.click()
}

async function onFile(e) {
  const file = e.target.files?.[0]
  e.target.value = ''
  if (!file) return
  const fd = new FormData()
  fd.append('image', file)
  try {
    const res = await quizApi.uploadImage(fd)
    form.value.image = res.imagePath
  } catch (err) {
    alert('上传失败: ' + (err?.message || ''))
  }
}

async function save() {
  if ((!form.value.stockName || !form.value.quizDate) && !form.value.image) {
    alert('请至少填写股票信息或上传图片')
    return
  }
  saving.value = true
  try {
    if (editing.value.id) {
      await quizApi.updateQuestion(editing.value.id, { ...form.value })
    } else {
      await quizApi.createQuestion({ ...form.value })
    }
    editVisible.value = false
    await load()
  } catch (err) {
    alert('保存失败: ' + (err?.message || ''))
  } finally {
    saving.value = false
  }
}

async function del(q) {
  if (!confirm(`确定删除「${q.stockName || q.id}」这道题吗？`)) return
  try {
    await quizApi.deleteQuestion(q.id)
    await load()
  } catch (err) {
    alert('删除失败: ' + (err?.message || ''))
  }
}

function openPractice(q) {
  current.value = q
  userAnswer.value = ''
  evaluation.value = ''
  answers.value = []
  savingAnswer.value = false
  practiceVisible.value = true
  loadAnswers(q.id)
}

async function loadAnswers(questionId) {
  try {
    const res = await quizApi.getAnswers(questionId)
    answers.value = Array.isArray(res) ? res : []
  } catch (e) {
    answers.value = []
  }
}

async function doEvaluate() {
  if (!current.value) return
  evaluating.value = true
  evaluation.value = ''
  try {
    const res = await quizApi.evaluate({ questionId: current.value.id, userAnswer: userAnswer.value.trim() })
    evaluation.value = res.evaluation || '（AI 未返回评价）'
  } catch (err) {
    evaluation.value = '评卷失败: ' + (err?.message || '')
  } finally {
    evaluating.value = false
  }
}

async function saveAnswerRecord() {
  if (!current.value || !userAnswer.value.trim()) return
  try {
    await quizApi.saveAnswer({ questionId: current.value.id, userAnswer: userAnswer.value.trim(), aiEvaluation: evaluation.value })
    savingAnswer.value = true
    await loadAnswers(current.value.id)
    setTimeout(() => { savingAnswer.value = false }, 2000)
  } catch (err) {
    alert('保存失败: ' + (err?.message || ''))
  }
}

function previewImage(q) {
  if (q && q.image) previewUrl.value = '/' + q.image
}

function fmtTime(t) {
  if (!t) return ''
  const d = new Date(t)
  if (isNaN(d.getTime())) return ''
  const pad = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`
}

function onKeydown(e) {
  if (e.key === 'Escape') {
    editVisible.value = false
    practiceVisible.value = false
    previewUrl.value = ''
  }
}

onMounted(() => {
  load()
  window.addEventListener('keydown', onKeydown)
})
onBeforeUnmount(() => window.removeEventListener('keydown', onKeydown))
</script>