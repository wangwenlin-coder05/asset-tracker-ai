<template>
  <div class="bg-white rounded-xl card-shadow p-4 sm:p-5 space-y-4">
    <!-- 顶部操作 -->
    <header class="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
      <div>
        <h3 class="text-base font-bold text-slate-800 flex items-center gap-2">
          <Flame class="w-5 h-5 text-rose-500" /> 全网热点选题
        </h3>
        <p class="text-[12px] text-slate-400 mt-1">
          数据源：DailyHotApi 开源聚合 · <span class="text-amber-600">免费接口只提供标题+链接，正文需逐篇解析</span>
        </p>
      </div>
      <div class="flex items-center gap-2">
        <select v-model.number="refreshMin" @change="restartTimer"
                class="border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs bg-white focus:ring-1 focus:ring-indigo-200 focus:border-indigo-400 outline-none">
          <option :value="0">手动刷新</option>
          <option :value="5">每 5 分钟</option>
          <option :value="15">每 15 分钟</option>
          <option :value="30">每 30 分钟</option>
        </select>
        <button @click="fetchAll"
                :disabled="allLoading"
                class="px-3 py-1.5 rounded-lg text-xs font-medium flex items-center gap-1.5 transition-all
                       bg-gradient-to-r from-indigo-500 to-blue-500 text-white shadow-sm hover:shadow-md hover:-translate-y-0.5 disabled:opacity-60 disabled:cursor-not-allowed">
          <RefreshCw class="w-3.5 h-3.5" :class="{ 'animate-spin': allLoading }" />
          {{ allLoading ? '抓取中...' : '刷新热点' }}
        </button>
      </div>
    </header>

    <!-- 平台 tab -->
    <div class="flex items-center gap-1.5 p-1 bg-slate-50 rounded-xl overflow-x-auto flex-wrap">
      <button v-for="(p, i) in platformList" :key="p.key"
              @click="togglePlatform(p.key)"
              class="shrink-0 px-3 py-1.5 rounded-lg text-xs font-medium transition-all duration-150 flex items-center gap-1"
              :class="selectedPlats.includes(p.key)
                ? 'bg-white text-indigo-600 shadow-sm border border-indigo-100'
                : 'text-slate-500 hover:text-slate-700 hover:bg-white/70'">
        <span v-if="errMap[p.key]" class="w-1.5 h-1.5 rounded-full bg-rose-400"></span>
        <span v-else-if="platStatus[p.key] === 'ok'" class="w-1.5 h-1.5 rounded-full bg-emerald-400"></span>
        <span v-else-if="platStatus[p.key] === 'loading'" class="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse"></span>
        <span v-else class="w-1.5 h-1.5 rounded-full bg-slate-300"></span>
        {{ p.name }}
        <span v-if="mergedByPlat[p.key]" class="text-[10px] text-slate-400">({{ mergedByPlat[p.key].length }})</span>
      </button>
      <div class="ml-auto flex items-center gap-2 shrink-0">
        <span class="text-[11px] text-slate-400">显示：</span>
        <button @click="viewMode = 'mixed'"
                class="px-2 py-1 rounded-md text-[11px] font-medium transition-all"
                :class="viewMode === 'mixed' ? 'bg-white text-slate-700 shadow-sm border border-slate-200' : 'text-slate-400 hover:text-slate-600'">
          合并视图
        </button>
        <button @click="viewMode = 'platform'"
                class="px-2 py-1 rounded-md text-[11px] font-medium transition-all"
                :class="viewMode === 'platform' ? 'bg-white text-slate-700 shadow-sm border border-slate-200' : 'text-slate-400 hover:text-slate-600'">
          分平台
        </button>
      </div>
    </div>

    <!-- 筛选栏 -->
    <div class="flex flex-col sm:flex-row sm:items-center gap-2">
      <div class="relative flex-1 max-w-md">
        <Search class="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
        <input v-model="keyword" type="text" placeholder="搜索标题关键词..."
               class="w-full pl-9 pr-3 py-2 border border-slate-200 rounded-lg text-xs focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 outline-none transition-all" />
      </div>
      <div class="flex flex-wrap items-center gap-1.5">
        <span class="text-[11px] text-slate-400 shrink-0">分类：</span>
        <button
          v-for="c in allCategories" :key="c.key"
          @click="toggleCategory(c.key)"
          class="text-[11px] px-2 py-1 rounded-full border transition-all"
          :class="selectedCats.includes(c.key)
            ? c.color + ' font-medium shadow-sm border-current'
            : 'bg-white border-slate-200 text-slate-500 hover:border-slate-300'">
          {{ c.key }}
        </button>
      </div>
    </div>

    <!-- 正文解析抽屉（右侧） -->
    <div v-if="parseDrawer" class="ai-parse-drawer fixed inset-0 z-40 flex justify-end" @click.self="parseDrawer = null">
      <div class="absolute inset-0 bg-slate-900/30 backdrop-blur-sm"></div>
      <div class="relative w-full max-w-xl h-full bg-white shadow-2xl overflow-hidden flex flex-col animate-slidein">
        <div class="flex items-center justify-between px-5 py-3 border-b border-slate-100 shrink-0">
          <div>
            <div class="text-sm font-bold text-slate-800">正文结构参考</div>
            <div class="text-[11px] text-amber-600 mt-0.5 flex items-center gap-1">
              <AlertCircle class="w-3 h-3" />
              仅用于分析结构 / 选题参考，直接搬运有侵权风险
            </div>
          </div>
          <button @click="parseDrawer = null" class="w-8 h-8 rounded-lg hover:bg-slate-100 flex items-center justify-center text-slate-500">
            <X class="w-4 h-4" />
          </button>
        </div>

        <div v-if="parseLoading" class="flex-1 overflow-y-auto p-5 space-y-3">
          <div class="h-6 bg-slate-50 rounded animate-pulse w-3/4"></div>
          <div class="h-4 bg-slate-50 rounded animate-pulse w-full"></div>
          <div class="h-4 bg-slate-50 rounded animate-pulse w-11/12"></div>
          <div class="h-4 bg-slate-50 rounded animate-pulse w-10/12"></div>
          <div class="h-4 bg-slate-50 rounded animate-pulse w-full"></div>
          <div class="h-4 bg-slate-50 rounded animate-pulse w-9/12"></div>
        </div>
        <div v-else-if="parseError" class="flex-1 overflow-y-auto p-5">
          <div class="rounded-xl bg-rose-50 border border-rose-100 p-4">
            <div class="text-sm font-semibold text-rose-600 flex items-center gap-2">
              <AlertCircle class="w-4 h-4" /> 解析失败
            </div>
            <div class="text-[12px] text-rose-500/80 mt-1">{{ parseError }}</div>
          </div>
        </div>
        <div v-else class="flex-1 overflow-y-auto p-5 space-y-4">
          <div>
            <div class="text-xs text-slate-400 mb-1">来源标题</div>
            <div class="text-lg font-bold text-slate-800 leading-snug">{{ parseResult.title || '(未提取到标题)' }}</div>
          </div>
          <div class="flex flex-wrap gap-1.5">
            <span class="text-[11px] px-2 py-0.5 rounded-full bg-indigo-50 text-indigo-600 border border-indigo-100">
              {{ parseResult.paragraphCount }} 段
            </span>
            <span class="text-[11px] px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-600 border border-emerald-100">
              {{ parseResult.wordCount }} 字
            </span>
          </div>
          <div class="space-y-3">
            <div v-for="(p, i) in parseResult.paragraphs || []" :key="i">
              <h5 v-if="p.type.startsWith('h')" class="text-[13px] font-bold text-slate-700 mt-3">
                {{ p.text }}
              </h5>
              <p v-else class="text-[13px] leading-7 text-slate-600 indent-8 text-justify">
                {{ p.text }}
              </p>
            </div>
          </div>
          <div v-if="parseResult.riskNotice" class="mt-4 rounded-xl bg-amber-50 border border-amber-100 p-3 text-[11.5px] text-amber-700 leading-relaxed">
            {{ parseResult.riskNotice }}
          </div>
        </div>

        <div class="border-t border-slate-100 px-5 py-3 flex items-center justify-between gap-3 shrink-0">
          <a :href="parseDrawer?.url" target="_blank" rel="noopener"
             class="text-xs text-indigo-500 hover:text-indigo-600 font-medium flex items-center gap-1 truncate max-w-[60%]">
            <ExternalLink class="w-3.5 h-3.5 shrink-0" />
            <span class="truncate">查看原文</span>
          </a>
          <div class="flex gap-2">
            <button @click="doCopyParse"
                    class="px-3 py-1.5 rounded-lg text-xs font-medium border border-slate-200 hover:bg-slate-50 text-slate-600 flex items-center gap-1 transition-all">
              <Copy class="w-3.5 h-3.5" /> 复制全文
            </button>
            <button @click="sendToArticle"
                    class="px-3 py-1.5 rounded-lg text-xs font-medium bg-gradient-to-r from-indigo-500 to-blue-500 text-white shadow-sm flex items-center gap-1 transition-all hover:shadow-md">
              <Send class="w-3.5 h-3.5" /> 发至文章生成
            </button>
          </div>
        </div>
      </div>
    </div>

    <!-- 空状态 -->
    <div v-if="!allLoading && allItems.length === 0" class="py-12 text-center">
      <div class="w-16 h-16 rounded-2xl bg-slate-50 flex items-center justify-center mx-auto mb-3">
        <Flame class="w-8 h-8 text-slate-300" />
      </div>
      <div class="text-sm text-slate-500 font-medium">暂无热点数据</div>
      <div class="text-[12px] text-slate-400 mt-1">可能因为：未选平台 / 分类过滤太严 / 网络抓取失败</div>
      <button @click="fetchAll" class="mt-4 px-4 py-2 rounded-lg bg-gradient-to-r from-indigo-500 to-blue-500 text-white text-xs font-medium shadow-sm hover:shadow-md transition-all">
        <RefreshCw class="w-3.5 h-3.5 inline mr-1 -mt-0.5" /> 重新抓取
      </button>
    </div>

    <!-- 合并视图 -->
    <div v-else-if="viewMode === 'mixed'" class="ai-hot-list space-y-1.5">
      <div v-for="it in allItems" :key="it.uniqueKey"
           class="ai-hot-row group flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-slate-50 border border-transparent hover:border-slate-100 transition-all">
        <span class="shrink-0 w-7 text-center text-[11px] font-bold"
              :class="it.rank <= 3 ? 'text-rose-500' : 'text-slate-400'">
          {{ it.rank }}
        </span>
        <div class="flex-1 min-w-0">
          <div class="flex items-center gap-2 flex-wrap">
            <a class="text-[13.5px] font-medium text-slate-800 leading-snug hover:text-indigo-600 transition-colors truncate min-w-0 flex-1"
               :href="it.url" target="_blank" rel="noopener">
              {{ it.title }}
            </a>
            <span v-if="it.hot" class="text-[10px] text-amber-600 shrink-0 font-semibold flex items-center gap-0.5">
              <Flame class="w-3 h-3" /> {{ formatHot(it.hot) }}
            </span>
          </div>
          <div class="mt-1 flex items-center gap-1.5 flex-wrap">
            <span class="text-[10px] px-1.5 py-0.5 rounded border" :class="getCategoryStyle(it.category)">
              {{ it.category }}
            </span>
            <span class="text-[10px] text-slate-400 flex items-center gap-0.5">
              <Globe class="w-2.5 h-2.5" /> {{ it.source }}
            </span>
          </div>
        </div>
        <div class="shrink-0 flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-all">
          <button @click="openParse(it)"
                  :title="'解析正文结构：' + (it.url?.slice(0, 30) || '')"
                  class="w-8 h-8 rounded-lg hover:bg-indigo-50 text-slate-500 hover:text-indigo-500 flex items-center justify-center transition-all">
            <FileText class="w-4 h-4" />
          </button>
          <button @click="useForArticle(it)"
                  title="用这个选题生成文章"
                  class="w-8 h-8 rounded-lg hover:bg-emerald-50 text-slate-500 hover:text-emerald-500 flex items-center justify-center transition-all">
            <Sparkles class="w-4 h-4" />
          </button>
          <button @click="useForTitle(it)"
                  title="基于标题生成更多标题方案"
                  class="w-8 h-8 rounded-lg hover:bg-amber-50 text-slate-500 hover:text-amber-500 flex items-center justify-center transition-all">
            <Hash class="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>

    <!-- 分平台视图 -->
    <div v-else class="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-3">
      <div v-for="p in selectedPlats.filter(k => mergedByPlat[k])" :key="p"
           class="ai-hot-plat bg-slate-50/60 rounded-xl border border-slate-100 p-3">
        <div class="flex items-center justify-between mb-2 px-1">
          <div class="text-sm font-bold text-slate-700">
            {{ platFullName(p) }}
          </div>
          <span class="text-[10px] text-slate-400">{{ mergedByPlat[p].length }} 条</span>
        </div>
        <div class="space-y-1 max-h-[480px] overflow-y-auto pr-1">
          <div v-for="it in mergedByPlat[p]" :key="it.uniqueKey"
               class="group flex items-start gap-2 px-2 py-1.5 rounded-lg hover:bg-white transition-all cursor-pointer"
               @click="openParse(it)">
            <span class="shrink-0 w-5 text-center text-[10px] font-bold mt-0.5"
                  :class="it.rank <= 3 ? 'text-rose-500' : 'text-slate-400'">
              {{ it.rank }}
            </span>
            <div class="flex-1 min-w-0">
              <div class="text-[12px] text-slate-700 leading-snug line-clamp-2 group-hover:text-indigo-600 transition-colors">
                {{ it.title }}
              </div>
              <div class="mt-1 flex items-center gap-1.5">
                <span class="text-[9px] px-1.5 py-0.5 rounded border" :class="getCategoryStyle(it.category)">
                  {{ it.category }}
                </span>
                <span v-if="it.hot" class="text-[9px] text-amber-600 flex items-center gap-0.5">
                  <Flame class="w-2 h-2" /> {{ formatHot(it.hot) }}
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { inject, computed, onBeforeUnmount, onMounted, ref } from 'vue'
import {
  Flame, RefreshCw, Search, AlertCircle, X, ExternalLink, Copy, Send, FileText, Sparkles, Hash, Globe,
} from 'lucide-vue-next'
import { useAiWork } from '../../composables/useAiWork'
import { aiWorkApi } from '../../utils/api'

const emit = inject('aiSwitchMenu')
const { platforms, getCategoryStyle, loadPlatforms, copyToClipboard } = useAiWork()

// 分类（含「全部」用于展示）
const ALL_CATEGORIES = [
  { key: '科技', color: 'bg-blue-50  text-blue-600  border-blue-200' },
  { key: '财经', color: 'bg-rose-50  text-rose-600  border-rose-200' },
  { key: '社会', color: 'bg-amber-50 text-amber-700 border-amber-200' },
  { key: '娱乐', color: 'bg-pink-50  text-pink-600  border-pink-200' },
  { key: '体育', color: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
  { key: '时政', color: 'bg-indigo-50 text-indigo-600 border-indigo-200' },
  { key: '综合', color: 'bg-slate-50 text-slate-600 border-slate-200' },
]
const allCategories = ALL_CATEGORIES
const selectedCats = ref(ALL_CATEGORIES.map(c => c.key))
function toggleCategory(k) {
  const i = selectedCats.value.indexOf(k)
  if (i >= 0) {
    if (selectedCats.value.length === 1) { selectedCats.value = ALL_CATEGORIES.map(c => c.key); return }
    selectedCats.value.splice(i, 1)
  } else {
    selectedCats.value.push(k)
  }
}

const viewMode = ref('mixed')
const keyword = ref('')
const refreshMin = ref(15)
let timer = null

function restartTimer() {
  if (timer) clearInterval(timer)
  if (refreshMin.value > 0) {
    timer = setInterval(() => fetchAll(), refreshMin.value * 60 * 1000)
  }
}

const allLoading = ref(false)
const platStatus = ref({})      // key -> 'loading' | 'ok' | 'err'
const errMap = ref({})
const mergedByPlat = ref({})    // key -> items[]
const platformList = computed(() => platforms.value.length ? platforms.value : [
  { key: 'weibo',    name: '微博热搜' },
  { key: 'zhihu',    name: '知乎热榜' },
  { key: 'toutiao',  name: '今日头条' },
  { key: 'bilibili', name: 'B站热搜' },
  { key: 'baidu',    name: '百度热搜' },
  { key: 'douyin',   name: '抖音热点' },
  { key: '36kr',     name: '36氪' },
  { key: 'ithome',   name: 'IT之家' },
  { key: 'thepaper', name: '澎湃新闻' },
  { key: 'newsqq',   name: '腾讯新闻' },
])

const selectedPlats = ref(['weibo', 'zhihu', 'toutiao', '36kr'])

function togglePlatform(k) {
  const i = selectedPlats.value.indexOf(k)
  if (i >= 0) {
    if (selectedPlats.value.length === 1) return // 至少保留一个
    selectedPlats.value.splice(i, 1)
  } else {
    selectedPlats.value.push(k)
  }
}

function platFullName(k) {
  return platformList.value.find(p => p.key === k)?.name || k
}

async function fetchAll() {
  allLoading.value = true
  const keys = selectedPlats.value
  for (const k of keys) platStatus.value[k] = 'loading'
  try {
    const r = await aiWorkApi.getHotBatch(keys.join(','))
    const data = r?.data || {}
    for (const k of keys) {
      const chunk = data[k] || {}
      if (chunk.error) {
        platStatus.value[k] = 'err'
        errMap.value[k] = chunk.error
      } else {
        platStatus.value[k] = 'ok'
        errMap.value[k] = null
      }
      const list = chunk.list || []
      mergedByPlat.value[k] = list.map((it, idx) => ({
        ...it,
        uniqueKey: `${k}-${idx}-${it.rank || 0}-${it.title?.slice(0, 8) || ''}`,
      }))
    }
  } catch (e) {
    console.warn('[hot] batch fetch', e.message)
    for (const k of keys) { platStatus.value[k] = 'err'; errMap.value[k] = e.message }
  } finally {
    allLoading.value = false
  }
}

// 合并 + 筛选 + 排序（合并视图）
const allItems = computed(() => {
  const merged = []
  for (const k of selectedPlats.value) {
    const list = mergedByPlat.value[k] || []
    merged.push(...list)
  }
  // 搜索
  const kw = keyword.value.trim().toLowerCase()
  const filtered = merged.filter(it => {
    if (!selectedCats.value.includes(it.category)) return false
    if (kw && !(it.title || '').toLowerCase().includes(kw)) return false
    return true
  })
  // 排序：排名升序 + 热度降序
  filtered.sort((a, b) => {
    if ((a.rank || 99) !== (b.rank || 99)) return (a.rank || 99) - (b.rank || 99)
    return (b.hot || 0) - (a.hot || 0)
  })
  return filtered
})

function formatHot(h) {
  const n = Number(h) || 0
  if (n >= 100000000) return (n / 100000000).toFixed(1) + '亿'
  if (n >= 10000) return (n / 10000).toFixed(1) + '万'
  return String(n)
}

// ==== 正文解析抽屉 ====
const parseDrawer = ref(null)   // { item, url }
const parseLoading = ref(false)
const parseError = ref('')
const parseResult = ref({ paragraphs: [], title: '', wordCount: 0, paragraphCount: 0 })

async function openParse(item) {
  parseDrawer.value = { item, url: item.url }
  parseLoading.value = true
  parseError.value = ''
  parseResult.value = { paragraphs: [], title: '', wordCount: 0, paragraphCount: 0 }
  try {
    const r = await aiWorkApi.parseArticle(item.url)
    if (!r?.success) throw new Error(r?.error || '解析失败')
    parseResult.value = r
  } catch (e) {
    parseError.value = e.message || '请求失败'
  } finally {
    parseLoading.value = false
  }
}

async function doCopyParse() {
  const ok = await copyToClipboard(parseResult.value.plainText || '')
  if (ok) flashToast('正文结构已复制')
}

function sendToArticle() {
  const t = parseResult.value.title || parseDrawer.value?.item?.title || ''
  const c = parseResult.value.plainText || ''
  // 存 localStorage，由 AiArticle 读取
  try {
    localStorage.setItem('ai_seed_article', JSON.stringify({ title: t, content: c, url: parseDrawer.value?.url || '' }))
  } catch {}
  emit && emit('article')
  parseDrawer.value = null
}

function useForArticle(it) {
  try {
    localStorage.setItem('ai_seed_hot', JSON.stringify({ title: it.title, url: it.url, category: it.category, source: it.source }))
  } catch {}
  emit && emit('article')
}

function useForTitle(it) {
  try {
    localStorage.setItem('ai_seed_title', it.title || '')
  } catch {}
  emit && emit('title')
}

function flashToast(msg) {
  // 简单全局 toast（避免额外依赖）
  const el = document.createElement('div')
  el.textContent = msg
  el.className = 'fixed z-[999] left-1/2 bottom-10 -translate-x-1/2 px-4 py-2 rounded-lg bg-slate-900/90 text-white text-xs shadow-lg'
  document.body.appendChild(el)
  setTimeout(() => { el.style.opacity = '0'; el.style.transition = 'all .3s' }, 1200)
  setTimeout(() => document.body.removeChild(el), 1700)
}

onMounted(async () => {
  await loadPlatforms(true)
  await fetchAll()
  restartTimer()
})
onBeforeUnmount(() => { if (timer) clearInterval(timer) })
</script>

<style scoped>
@keyframes slidein {
  from { transform: translateX(100%); opacity: 0; }
  to   { transform: translateX(0);    opacity: 1; }
}
.animate-slidein { animation: slidein .25s ease-out; }
.ai-hot-plat > div:last-child::-webkit-scrollbar { width: 4px; }
.ai-hot-plat > div:last-child::-webkit-scrollbar-thumb { background: #e2e8f0; border-radius: 4px; }
.line-clamp-2 {
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}
</style>
