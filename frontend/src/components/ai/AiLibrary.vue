<template>
  <div class="space-y-3">
    <!-- 顶部筛选 -->
    <div class="bg-white rounded-xl card-shadow p-4 space-y-3">
      <div class="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
        <div class="flex items-center gap-2">
          <LibraryBig class="w-5 h-5 text-blue-500" />
          <h3 class="text-base font-bold text-slate-800">文章库</h3>
          <span class="text-[11px] px-2 py-0.5 rounded-full bg-slate-100 text-slate-500 border border-slate-200">
            共 {{ total }} 篇
          </span>
        </div>
        <div class="flex flex-wrap items-center gap-2">
          <div class="relative min-w-[220px]">
            <Search class="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input v-model="q" @keyup.enter="doSearch" type="text" placeholder="搜索标题 / 正文 / 标签..."
                   class="w-full pl-9 pr-10 py-2 border border-slate-200 rounded-lg text-xs focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 outline-none" />
            <button v-if="q" @click="q='';doSearch()" class="absolute right-2 top-1/2 -translate-y-1/2 w-5 h-5 rounded-full bg-slate-100 text-slate-400 hover:text-slate-600 flex items-center justify-center text-[10px]">✕</button>
          </div>
          <select v-model="f.category" @change="doSearch"
                  class="px-2.5 py-2 border border-slate-200 rounded-lg text-xs bg-white focus:ring-1 focus:ring-indigo-200 focus:border-indigo-400 outline-none">
            <option value="">全部分类</option>
            <option v-for="c in categories" :key="c" :value="c">{{ c }}</option>
          </select>
          <select v-model="f.status" @change="doSearch"
                  class="px-2.5 py-2 border border-slate-200 rounded-lg text-xs bg-white focus:ring-1 focus:ring-indigo-200 focus:border-indigo-400 outline-none">
            <option value="">全部状态</option>
            <option value="draft">草稿</option>
            <option value="published">已发布</option>
            <option value="archived">已归档</option>
          </select>
          <select v-model="f.sort" @change="doSearch"
                  class="px-2.5 py-2 border border-slate-200 rounded-lg text-xs bg-white focus:ring-1 focus:ring-indigo-200 focus:border-indigo-400 outline-none">
            <option value="-created_at">按创建时间 ↓</option>
            <option value="created_at">按创建时间 ↑</option>
            <option value="-word_count">按字数 ↓</option>
            <option value="-updated_at">按更新时间 ↓</option>
          </select>
          <button @click="newArticle"
                  class="px-3 py-2 rounded-lg text-xs font-medium bg-gradient-to-r from-indigo-500 to-blue-500 text-white shadow-sm hover:shadow-md transition-all flex items-center gap-1">
            <Plus class="w-3.5 h-3.5" /> 新建
          </button>
        </div>
      </div>
    </div>

    <!-- 列表 + 详情 -->
    <div class="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)] gap-3">
      <!-- 列表 -->
      <div class="bg-white rounded-xl card-shadow p-3 space-y-2 min-h-[600px] flex flex-col">
        <div v-if="loading" class="space-y-2 p-2">
          <div v-for="i in 6" :key="i" class="h-16 bg-slate-50 rounded-xl animate-pulse"></div>
        </div>
        <div v-else-if="!list.length" class="flex-1 min-h-[400px] flex flex-col items-center justify-center text-center p-6">
          <div class="w-16 h-16 rounded-2xl bg-slate-50 flex items-center justify-center mb-3">
            <FileText class="w-8 h-8 text-slate-300" />
          </div>
          <div class="text-sm text-slate-600 font-semibold">暂无文章</div>
          <div class="text-[12px] text-slate-400 mt-1">切换筛选条件，或去「文章生成」新建一篇</div>
        </div>
        <div v-else class="space-y-1.5 flex-1 overflow-y-auto pr-1 max-h-[calc(100vh-340px)]">
          <article v-for="a in list" :key="a.id"
                   @click="selectArticle(a.id)"
                   class="group cursor-pointer p-3 rounded-xl border transition-all"
                   :class="selectedId === a.id
                     ? 'border-indigo-300 bg-indigo-50/40 shadow-sm'
                     : 'border-slate-100 hover:border-indigo-200 hover:bg-indigo-50/20'">
            <div class="flex items-start gap-2.5">
              <div class="w-9 h-9 rounded-lg shrink-0 flex items-center justify-center text-[13px] font-bold text-white shadow-sm"
                   :style="{ background: colorSeed(a.id) }">
                {{ (a.title || '无标题').slice(0, 1).toUpperCase() }}
              </div>
              <div class="flex-1 min-w-0">
                <div class="flex items-center justify-between gap-2">
                  <div class="text-[13.5px] font-semibold text-slate-800 truncate leading-snug group-hover:text-indigo-600 transition-colors">
                    {{ a.title || '(无标题)' }}
                  </div>
                  <span v-if="a.status === 'published'"
                        class="shrink-0 text-[10px] px-1.5 py-0.5 rounded bg-emerald-50 text-emerald-600 border border-emerald-100 font-medium">已发布</span>
                  <span v-else-if="a.status === 'archived'"
                        class="shrink-0 text-[10px] px-1.5 py-0.5 rounded bg-slate-50 text-slate-500 border border-slate-200 font-medium">已归档</span>
                  <span v-else
                        class="shrink-0 text-[10px] px-1.5 py-0.5 rounded bg-amber-50 text-amber-600 border border-amber-100 font-medium">草稿</span>
                </div>
                <div class="mt-1 text-[11.5px] text-slate-500 leading-snug line-clamp-2">
                  {{ a.summary || a.plain_text?.slice(0, 80) || '（无摘要）' }}
                </div>
                <div class="mt-1.5 flex flex-wrap items-center gap-1.5">
                  <span class="text-[10px] px-1.5 py-0.5 rounded-full border"
                        :class="getCategoryStyle(a.category)">
                    {{ a.category || '未分类' }}
                  </span>
                  <span v-if="a.word_count != null" class="text-[10px] text-slate-400 flex items-center gap-0.5">
                    <FileText class="w-2.5 h-2.5" /> {{ a.word_count }} 字
                  </span>
                  <span class="text-[10px] text-slate-400 flex items-center gap-0.5">
                    <Clock class="w-2.5 h-2.5" /> {{ formatTs(a.created_at) }}
                  </span>
                </div>
              </div>
            </div>
          </article>
        </div>

        <!-- 分页 -->
        <div class="pt-2 mt-2 border-t border-slate-100 flex items-center justify-between">
          <div class="text-[11px] text-slate-500">
            第 {{ page }} / {{ totalPages }} 页 · 共 {{ total }} 篇
          </div>
          <div class="flex items-center gap-1">
            <button @click="page=Math.max(1,page-1);doSearch()" :disabled="page<=1"
                    class="w-7 h-7 rounded-lg border border-slate-200 text-slate-500 text-xs disabled:opacity-40 hover:bg-slate-50 transition-all flex items-center justify-center">
              <ChevronLeft class="w-3.5 h-3.5" />
            </button>
            <select v-model.number="pageSize" @change="page=1;doSearch()"
                    class="h-7 px-2 border border-slate-200 rounded-lg text-[10.5px] bg-white outline-none">
              <option :value="10">10 / 页</option>
              <option :value="20">20 / 页</option>
              <option :value="50">50 / 页</option>
            </select>
            <button @click="page=Math.min(totalPages,page+1);doSearch()" :disabled="page>=totalPages"
                    class="w-7 h-7 rounded-lg border border-slate-200 text-slate-500 text-xs disabled:opacity-40 hover:bg-slate-50 transition-all flex items-center justify-center">
              <ChevronRight class="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </div>

      <!-- 详情 / 编辑 -->
      <div class="bg-white rounded-xl card-shadow p-4 sm:p-5 min-h-[600px]">
        <div v-if="!currentArticle && loadingOne" class="space-y-3 p-2 animate-pulse">
          <div class="h-7 bg-slate-50 rounded w-2/3"></div>
          <div class="h-4 bg-slate-50 rounded w-1/2"></div>
          <div class="h-4 bg-slate-50 rounded w-full"></div>
          <div class="h-4 bg-slate-50 rounded w-11/12"></div>
        </div>
        <div v-else-if="!currentArticle" class="min-h-[540px] flex flex-col items-center justify-center text-center p-6">
          <div class="w-16 h-16 rounded-2xl bg-gradient-to-br from-blue-50 to-indigo-50 flex items-center justify-center mb-4">
            <BookOpenCheck class="w-8 h-8 text-indigo-400" />
          </div>
          <div class="text-sm font-semibold text-slate-700">选择左侧文章查看详情</div>
          <div class="text-[12px] text-slate-400 mt-1.5">或点击右上角「新建」开始创作</div>
        </div>

        <div v-else class="flex flex-col min-h-[540px]">
          <header class="flex flex-wrap items-start justify-between gap-3 pb-3 mb-3 border-b border-slate-100">
            <div class="flex-1 min-w-0">
              <input v-model="draft.title" @blur="autoSave"
                     type="text" placeholder="(无标题) 可直接编辑"
                     class="w-full bg-transparent outline-none text-lg font-bold text-slate-800 leading-snug border-b border-transparent focus:border-indigo-300 pb-1 transition-all" />
              <div class="mt-2 flex flex-wrap items-center gap-1.5 text-[11px] text-slate-500">
                <span class="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded bg-slate-50 border border-slate-100">
                  <FileText class="w-3 h-3" /> {{ countWords(draft.plain_text || '') }} 字
                </span>
                <span class="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded bg-slate-50 border border-slate-100">
                  <Clock class="w-3 h-3" /> 创建 {{ formatTs(currentArticle.created_at) }}
                </span>
                <span v-if="currentArticle.updated_at !== currentArticle.created_at"
                      class="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded bg-slate-50 border border-slate-100">
                  <RefreshCw class="w-3 h-3" /> 更新 {{ formatTs(currentArticle.updated_at) }}
                </span>
                <select v-model="draft.category" @change="autoSave"
                        class="h-6 px-2 border border-slate-200 rounded text-[10.5px] bg-white outline-none">
                  <option v-for="c in categories" :key="c" :value="c">{{ c }}</option>
                </select>
                <select v-model="draft.status" @change="autoSave"
                        class="h-6 px-2 border border-slate-200 rounded text-[10.5px] bg-white outline-none">
                  <option value="draft">草稿</option>
                  <option value="published">已发布</option>
                  <option value="archived">已归档</option>
                </select>
              </div>
              <input v-if="draft.tags != null" v-model="draft.tags" @blur="autoSave"
                     type="text" placeholder="标签（逗号分隔）"
                     class="mt-2 w-full px-2 py-1 border border-slate-200 rounded text-[11px] focus:border-indigo-400 focus:ring-1 focus:ring-indigo-100 outline-none" />
            </div>
            <div class="flex flex-wrap items-center gap-1.5 shrink-0">
              <button @click="copyAll"
                      class="px-2.5 py-1.5 rounded-lg text-[11px] font-medium border border-slate-200 hover:bg-slate-50 text-slate-600 transition-all flex items-center gap-1">
                <Copy class="w-3.5 h-3.5" /> 复制
              </button>
              <button @click="sendToGen"
                      class="px-2.5 py-1.5 rounded-lg text-[11px] font-medium border border-indigo-200 hover:bg-indigo-50 text-indigo-600 transition-all flex items-center gap-1">
                <Wand2 class="w-3.5 h-3.5" /> 去再编辑
              </button>
              <button @click="doSave" :disabled="saving"
                      class="px-2.5 py-1.5 rounded-lg text-[11px] font-medium bg-gradient-to-r from-blue-500 to-indigo-500 text-white shadow-sm hover:shadow-md transition-all flex items-center gap-1 disabled:opacity-50">
                <Save class="w-3.5 h-3.5" /> {{ saving ? '保存中' : '保存' }}
              </button>
              <button @click="confirmDelete(currentArticle.id)"
                      class="px-2.5 py-1.5 rounded-lg text-[11px] font-medium border border-rose-200 hover:bg-rose-50 text-rose-600 transition-all flex items-center gap-1">
                <Trash2 class="w-3.5 h-3.5" /> 删除
              </button>
            </div>
          </header>

          <!-- Tab: 预览 / 源码 -->
          <div class="shrink-0 flex items-center gap-1 p-0.5 bg-slate-50 rounded-lg border border-slate-100 w-fit mb-2">
            <button @click="tabView = 'preview'"
                    class="px-3 py-1 rounded-md text-[11px] font-medium transition-all"
                    :class="tabView === 'preview' ? 'bg-white text-slate-700 shadow-sm' : 'text-slate-400 hover:text-slate-600'">
              <Eye class="w-3 h-3 inline -mt-0.5 mr-1" /> 预览
            </button>
            <button @click="tabView = 'md'"
                    class="px-3 py-1 rounded-md text-[11px] font-medium transition-all"
                    :class="tabView === 'md' ? 'bg-white text-slate-700 shadow-sm' : 'text-slate-400 hover:text-slate-600'">
              <Code class="w-3 h-3 inline -mt-0.5 mr-1" /> Markdown 源码
            </button>
            <button @click="tabView = 'json'"
                    class="px-3 py-1 rounded-md text-[11px] font-medium transition-all"
                    :class="tabView === 'json' ? 'bg-white text-slate-700 shadow-sm' : 'text-slate-400 hover:text-slate-600'">
              <Brackets class="w-3 h-3 inline -mt-0.5 mr-1" /> 结构数据
            </button>
          </div>

          <!-- 内容区 -->
          <div class="flex-1 min-h-[380px] relative border border-slate-100 rounded-xl overflow-hidden">
            <div v-if="tabView === 'preview'" class="absolute inset-0 p-4 sm:p-6 overflow-y-auto">
              <article v-html="renderedHtml"
                       class="ai-lib-prose prose prose-sm prose-slate max-w-none
                              [&_h2]:text-base [&_h2]:font-bold [&_h2]:text-slate-800 [&_h2]:my-4
                              [&_h3]:text-[13px] [&_h3]:font-semibold [&_h3]:text-slate-700 [&_h3]:mt-3 [&_h3]:mb-2
                              [&_p]:text-[13px] [&_p]:leading-7 [&_p]:text-slate-700 [&_p]:my-2.5 [&_p]:text-justify [&_p]:indent-8
                              [&_blockquote]:border-l-4 [&_blockquote]:border-indigo-200 [&_blockquote]:bg-indigo-50/40 [&_blockquote]:py-2 [&_blockquote]:px-3 [&_blockquote]:rounded-r-lg [&_blockquote]:text-[12.5px]
                              [&_ul]:text-[12.5px] [&_ul]:text-slate-700 [&_ul]:space-y-1 [&_ul]:pl-6 [&_ul_li]:list-disc"></article>
            </div>
            <textarea v-else-if="tabView === 'md'" v-model="draft.plain_text" @blur="autoSave"
                      class="absolute inset-0 w-full h-full p-4 text-[12.5px] font-mono leading-7 text-slate-700 resize-none outline-none"></textarea>
            <textarea v-else-if="tabView === 'json'" v-model="draft.content" @blur="autoSave"
                      class="absolute inset-0 w-full h-full p-4 text-[12px] font-mono leading-6 text-slate-700 resize-none outline-none"></textarea>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { inject, reactive, ref, computed, watch, onMounted, markRaw } from 'vue'
import {
  LibraryBig, Search, Plus, FileText, Clock, ChevronLeft, ChevronRight, BookOpenCheck,
  Copy, Wand2, Save, Trash2, Eye, Code, Brackets, RefreshCw, AlertTriangle,
} from 'lucide-vue-next'
import { useAiWork } from '../../composables/useAiWork'
import { aiWorkApi } from '../../utils/api'

const emit = inject('aiSwitchMenu')
const { categories, getCategoryStyle, countWords } = useAiWork()

const q = ref('')
const f = reactive({ category: '', status: '', sort: '-created_at' })
const page = ref(1)
const pageSize = ref(20)
const total = ref(0)
const loading = ref(false)
const loadingOne = ref(false)
const saving = ref(false)

const list = ref([])
const selectedId = ref(null)
const currentArticle = ref(null)
const draft = reactive({
  id: null, title: '', category: '科技', status: 'draft',
  word_count: 0, tags: '', content: '', plain_text: '',
})
const tabView = ref('preview')

const totalPages = computed(() => Math.max(1, Math.ceil(total.value / pageSize.value)))

function formatTs(ts) {
  if (!ts) return ''
  const n = Number(ts)
  if (!n) return ''
  const d = new Date(n)
  const diff = Date.now() - n
  if (diff < 60 * 1000) return '刚刚'
  if (diff < 3600 * 1000) return Math.floor(diff / 60000) + ' 分钟前'
  if (diff < 86400 * 1000) return Math.floor(diff / 3600000) + ' 小时前'
  if (diff < 30 * 86400 * 1000) return Math.floor(diff / 86400000) + ' 天前'
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}
function pad(n) { return String(n).padStart(2, '0') }

function colorSeed(id) {
  const palette = [
    'linear-gradient(135deg,#6366f1,#3b82f6)',
    'linear-gradient(135deg,#f43f5e,#ec4899)',
    'linear-gradient(135deg,#f59e0b,#ef4444)',
    'linear-gradient(135deg,#10b981,#0ea5e9)',
    'linear-gradient(135deg,#a855f7,#6366f1)',
    'linear-gradient(135deg,#0f172a,#334155)',
  ]
  let h = 0; const s = String(id || 'x')
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0
  return palette[h % palette.length]
}

let deb = null
function doSearch() {
  if (deb) clearTimeout(deb)
  deb = setTimeout(loadList, 120)
}

async function loadList() {
  loading.value = true
  try {
    const params = { page: page.value, pageSize: pageSize.value, sort: f.sort }
    if (q.value) params.q = q.value
    if (f.category) params.category = f.category
    if (f.status) params.status = f.status
    const r = await aiWorkApi.listArticles(params)
    list.value = r?.data || []
    total.value = Number(r?.total || 0)
    if (list.value.length && (!selectedId.value || !list.value.find(x => x.id === selectedId.value))) {
      selectArticle(list.value[0].id)
    }
  } catch (e) {
    console.warn('[lib] loadList', e.message)
  } finally { loading.value = false }
}

async function selectArticle(id) {
  selectedId.value = id
  loadingOne.value = true
  try {
    const r = await aiWorkApi.getArticle(id)
    currentArticle.value = r
    Object.assign(draft, {
      id: r.id,
      title: r.title || '',
      category: r.category || '科技',
      status: r.status || 'draft',
      word_count: r.word_count || 0,
      tags: r.tags || '',
      content: typeof r.content === 'string' ? r.content : JSON.stringify(r.content || []),
      plain_text: r.plain_text || '',
    })
  } catch (e) {
    flashToast('读取失败：' + e.message)
  } finally {
    loadingOne.value = false
  }
}

function newArticle() {
  currentArticle.value = { id: null, created_at: Date.now(), updated_at: Date.now() }
  selectedId.value = null
  Object.assign(draft, {
    id: null, title: '', category: '科技', status: 'draft',
    word_count: 0, tags: '', content: '[]', plain_text: '',
  })
}

// ======= 预览渲染 =======
const renderedHtml = computed(() => {
  let parsed = []
  try {
    parsed = JSON.parse(draft.content || '[]')
    if (!Array.isArray(parsed)) parsed = []
  } catch {}
  if (!parsed.length && draft.plain_text) {
    // fallback：用纯文本切段落
    parsed = draft.plain_text.split(/\n{2,}/).map(s => s.trim()).filter(Boolean).map(s => ({ type: 'p', text: s }))
  }
  return parsed.map(p => {
    const t = (p.type || 'p').toLowerCase()
    const esc = (s) => String(s || '').replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]))
    if (t === 'h2' || t === 'h3') return `<${t}>${esc(p.text)}</${t}>`
    if (t === 'blockquote') return `<blockquote>${esc(p.text)}</blockquote>`
    if (t === 'ul') return `<ul>${(p.items || []).map(x => `<li>${esc(x)}</li>`).join('')}</ul>`
    return `<p>${esc(p.text)}</p>`
  }).join('\n')
})

// ======= 保存 =======
let saveDeb = null
function autoSave() {
  if (saveDeb) clearTimeout(saveDeb)
  saveDeb = setTimeout(() => doSave(true), 800)
}

async function doSave(silent = false) {
  if (!draft.title && !draft.plain_text) return
  saving.value = true
  try {
    const payload = {
      title: draft.title,
      category: draft.category,
      status: draft.status,
      tags: draft.tags,
      word_count: countWords(draft.plain_text || ''),
      content: draft.content || '[]',
      plain_text: draft.plain_text || '',
    }
    let r
    if (draft.id) {
      r = await aiWorkApi.updateArticle(draft.id, payload)
    } else {
      r = await aiWorkApi.createArticle(payload)
      const id = r?.id || r?.data?.id
      if (id) { draft.id = id; selectedId.value = id }
    }
    if (!silent) flashToast(draft.id ? '已更新' : '已创建')
    loadList()
    if (draft.id && draft.id === selectedId.value) {
      // 重新拉一次，拿到 created_at / updated_at
      try {
        const fresh = await aiWorkApi.getArticle(draft.id)
        currentArticle.value = fresh
      } catch {}
    }
  } catch (e) {
    flashToast('保存失败：' + e.message)
  } finally {
    saving.value = false
  }
}

async function confirmDelete(id) {
  if (!id) return
  if (!window.confirm('确认删除这篇文章？删除后无法恢复。')) return
  try {
    await aiWorkApi.deleteArticle(id)
    flashToast('已删除')
    if (selectedId.value === id) { currentArticle.value = null; selectedId.value = null }
    loadList()
  } catch (e) {
    flashToast('删除失败：' + e.message)
  }
}

async function copyAll() {
  const text = `${draft.title || '(无标题)'}\n\n${draft.plain_text || ''}`
  const ok = await navigator.clipboard?.writeText(text).then(() => true).catch(() => false)
  flashToast(ok ? '已复制全文' : '复制失败')
}

function sendToGen() {
  try {
    localStorage.setItem('ai_seed_article', JSON.stringify({
      title: draft.title, content: draft.plain_text, url: ''
    }))
  } catch {}
  emit && emit('article')
}

function flashToast(msg) {
  const el = document.createElement('div')
  el.textContent = msg
  el.className = 'fixed z-[999] left-1/2 bottom-10 -translate-x-1/2 px-4 py-2 rounded-lg bg-slate-900/90 text-white text-xs shadow-lg'
  document.body.appendChild(el)
  setTimeout(() => { el.style.opacity = '0'; el.style.transition = 'all .3s' }, 1200)
  setTimeout(() => document.body.removeChild(el), 1700)
}

// tab 切换不触发组件重渲染即可
watch([q], () => { page.value = 1; doSearch() })
onMounted(() => { doSearch() })
</script>

<style scoped>
.line-clamp-2 {
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}
.ai-lib-prose::-webkit-scrollbar, .overflow-y-auto::-webkit-scrollbar { width: 4px; height: 4px; }
.ai-lib-prose::-webkit-scrollbar-thumb, .overflow-y-auto::-webkit-scrollbar-thumb { background: #e2e8f0; border-radius: 4px; }
</style>
