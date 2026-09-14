<template>
  <div class="space-y-4">
    <!-- 统计卡片 -->
    <section class="grid grid-cols-2 md:grid-cols-4 gap-3">
      <div v-for="c in statCards" :key="c.key"
           class="group relative overflow-hidden bg-white rounded-xl card-shadow p-4 transition-all duration-200 hover:-translate-y-0.5 hover:shadow-lg">
        <div class="flex items-start justify-between">
          <div class="flex-1 min-w-0">
            <div class="text-[12px] text-slate-400">{{ c.label }}</div>
            <div class="mt-1 text-2xl font-bold text-slate-800 tracking-tight">
              {{ c.value }}<span class="text-sm font-medium text-slate-400 ml-1">{{ c.unit }}</span>
            </div>
            <div class="mt-1.5 text-[11px]" :class="c.delta >= 0 ? 'text-emerald-600' : 'text-rose-500'">
              <component :is="c.delta >= 0 ? TrendingUp : TrendingDown" class="w-3 h-3 inline -mt-0.5 mr-0.5" />
              {{ Math.abs(c.delta) }}{{ c.deltaUnit }} vs 昨日
            </div>
          </div>
          <div class="w-11 h-11 rounded-xl flex items-center justify-center shrink-0 transition-all group-hover:scale-110"
               :class="c.iconBg">
            <component :is="iconMap[c.icon]" class="w-5 h-5" :class="c.iconColor" />
          </div>
        </div>
        <div class="absolute -right-6 -bottom-6 w-24 h-24 rounded-full blur-2xl opacity-40 pointer-events-none"
             :class="c.spotBg" />
      </div>
    </section>

    <!-- 快捷入口 + 最近生成 -->
    <section class="grid grid-cols-1 xl:grid-cols-[1fr_1.1fr] gap-3">
      <!-- 快捷入口 -->
      <div class="bg-white rounded-xl card-shadow p-5">
        <div class="flex items-center justify-between mb-4">
          <h3 class="text-sm font-bold text-slate-700 flex items-center gap-2">
            <Zap class="w-4 h-4 text-amber-500" /> 快捷入口
          </h3>
          <span class="text-[11px] text-slate-400">常用功能一键直达</span>
        </div>
        <div class="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
          <button v-for="q in quickEntries" :key="q.key"
                  @click="onGo(q.key)"
                  class="ai-dash-qk relative group p-3 rounded-xl border border-slate-100 hover:border-indigo-200 hover:bg-indigo-50/40 transition-all duration-150 text-left">
            <div class="w-9 h-9 rounded-lg flex items-center justify-center mb-2 transition-all group-hover:scale-110"
                 :class="q.iconBg">
              <component :is="iconMap[q.icon]" class="w-[18px] h-[18px]" :class="q.iconColor" />
            </div>
            <div class="text-sm font-semibold text-slate-800 leading-tight">{{ q.name }}</div>
            <div class="text-[11px] text-slate-400 mt-0.5 leading-tight">{{ q.tip }}</div>
            <ArrowRight class="absolute top-3 right-3 w-3.5 h-3.5 text-slate-300 opacity-0 group-hover:opacity-100 group-hover:text-indigo-500 transition-all duration-150 -translate-x-1 group-hover:translate-x-0" />
          </button>
        </div>

        <!-- 平台热点抓取 -->
        <div class="mt-5 pt-4 border-t border-slate-100">
          <div class="flex items-center justify-between mb-3">
            <div class="text-sm font-semibold text-slate-700 flex items-center gap-2">
              <Globe class="w-4 h-4 text-indigo-500" /> 全网热点 · 实时抓取
            </div>
            <button @click="onGo('hot')" class="text-[11px] text-indigo-500 hover:text-indigo-600 font-medium flex items-center gap-1">
              查看全部 <ArrowRight class="w-3 h-3" />
            </button>
          </div>
          <div v-if="hotLoading" class="space-y-2">
            <div v-for="i in 4" :key="i" class="h-8 bg-slate-50 rounded-lg animate-pulse"></div>
          </div>
          <div v-else-if="hotPreview.length === 0" class="text-center py-4 text-[12px] text-slate-400">
            暂无数据，点击 <span class="text-indigo-500 cursor-pointer" @click="loadHot">刷新热点</span>
          </div>
          <div v-else class="space-y-1.5">
            <div v-for="(it, idx) in hotPreview" :key="idx"
                 class="flex items-center gap-2 px-2.5 py-1.5 rounded-lg hover:bg-slate-50 transition-colors cursor-pointer group"
                 @click="openArticle(it.url)">
              <span class="w-5 text-center text-[11px] font-bold shrink-0"
                    :class="idx < 3 ? 'text-rose-500' : 'text-slate-400'">{{ idx + 1 }}</span>
              <span class="truncate flex-1 min-w-0 text-[12.5px] text-slate-700 group-hover:text-indigo-600 transition-colors">
                {{ it.title }}
              </span>
              <span class="shrink-0 text-[10px] px-2 py-0.5 rounded-full border"
                    :class="getCategoryStyle(it.category)">
                {{ it.category }}
              </span>
              <span class="shrink-0 text-[10px] text-slate-400">{{ it.source }}</span>
            </div>
          </div>
        </div>
      </div>

      <!-- 最近生成 -->
      <div class="bg-white rounded-xl card-shadow p-5 flex flex-col">
        <div class="flex items-center justify-between mb-4">
          <h3 class="text-sm font-bold text-slate-700 flex items-center gap-2">
            <Clock class="w-4 h-4 text-blue-500" /> 最近生成
          </h3>
          <button @click="onGo('library')" class="text-[11px] text-indigo-500 hover:text-indigo-600 font-medium flex items-center gap-1">
            文章库 <ArrowRight class="w-3 h-3" />
          </button>
        </div>

        <div v-if="articlesLoading" class="space-y-2">
          <div v-for="i in 5" :key="i" class="h-16 bg-slate-50 rounded-xl animate-pulse"></div>
        </div>
        <div v-else-if="articles.length === 0" class="flex-1 min-h-[260px] flex flex-col items-center justify-center text-center">
          <div class="w-16 h-16 rounded-2xl bg-slate-50 flex items-center justify-center mb-3">
            <FileText class="w-8 h-8 text-slate-300" />
          </div>
          <div class="text-sm text-slate-500 font-medium">还没有生成过文章</div>
          <div class="text-[12px] text-slate-400 mt-1">从「文章生成」或「热点选题」开始你的第一篇</div>
          <button @click="onGo('article')"
                  class="mt-4 px-4 py-2 rounded-lg bg-gradient-to-r from-indigo-500 to-blue-500 text-white text-xs font-medium shadow-md shadow-indigo-200/40 hover:shadow-lg hover:-translate-y-0.5 transition-all flex items-center gap-1.5">
            <Sparkles class="w-3.5 h-3.5" /> 立即生成文章
          </button>
        </div>
        <div v-else class="space-y-2 flex-1 overflow-y-auto pr-1 max-h-[460px]">
          <div v-for="a in articles" :key="a.id"
               @click="openArticleDetail(a.id)"
               class="group p-3 rounded-xl border border-slate-100 hover:border-indigo-200 hover:bg-indigo-50/30 transition-all duration-150 cursor-pointer">
            <div class="flex items-start gap-2.5">
              <span class="shrink-0 text-[10px] px-2 py-0.5 rounded-full border mt-0.5"
                    :class="getCategoryStyle(a.category)">
                {{ a.category }}
              </span>
              <div class="flex-1 min-w-0">
                <div class="text-[13.5px] font-semibold text-slate-800 leading-snug truncate group-hover:text-indigo-600 transition-colors">
                  {{ a.title || '(无标题)' }}
                </div>
                <div class="mt-1.5 flex items-center gap-2 text-[11px] text-slate-400 flex-wrap">
                  <span class="inline-flex items-center gap-0.5">
                    <FileText class="w-3 h-3" /> {{ a.word_count ?? 0 }} 字
                  </span>
                  <span class="inline-flex items-center gap-0.5">
                    <Clock class="w-3 h-3" /> {{ formatTs(a.created_at) }}
                  </span>
                  <span v-if="a.status === 'published'" class="px-1.5 py-0.5 rounded bg-emerald-50 text-emerald-600 border border-emerald-100">已发布</span>
                  <span v-else class="px-1.5 py-0.5 rounded bg-slate-50 text-slate-500 border border-slate-100">草稿</span>
                  <span v-if="a.tags" class="truncate max-w-[120px] text-slate-500">#{{ String(a.tags).split(',')[0] }}</span>
                </div>
              </div>
              <ChevronRight class="w-4 h-4 text-slate-300 group-hover:text-indigo-500 shrink-0 mt-1 transition-all group-hover:translate-x-0.5" />
            </div>
          </div>
        </div>
      </div>
    </section>
  </div>
</template>

<script setup>
import { inject, onMounted, ref } from 'vue'
import {
  TrendingUp, TrendingDown, Zap, ArrowRight, Globe, Clock, FileText, Sparkles, ChevronRight,
  LayoutDashboard, Flame, Hash, Link, Layers, LibraryBig, BookOpenCheck, MessageSquare,
} from 'lucide-vue-next'
import { useAiWork } from '../../composables/useAiWork'
import { aiWorkApi } from '../../utils/api'

const emit = inject('aiSwitchMenu')
const onGo = (k) => emit && emit(k)

const { getCategoryStyle } = useAiWork()

const iconMap = {
  FileText, Clock, Sparkles, LibraryBig,
  LayoutDashboard, Flame, Hash, Link, Layers, BookOpenCheck, MessageSquare,
}

const statCards = ref([
  { key: 'articles',  label: '已生成文章',  value: 0, unit: '篇', delta: 0,  deltaUnit: '篇',
    icon: 'FileText',  iconBg: 'bg-indigo-50',  iconColor: 'text-indigo-500',  spotBg: 'bg-indigo-300' },
  { key: 'words',     label: '累计字数',    value: 0, unit: '字', delta: 0,  deltaUnit: '字',
    icon: 'LibraryBig',iconBg: 'bg-emerald-50', iconColor: 'text-emerald-500', spotBg: 'bg-emerald-300' },
  { key: 'titles',    label: '标题方案',    value: 0, unit: '条', delta: 0,  deltaUnit: '条',
    icon: 'Hash',      iconBg: 'bg-amber-50',  iconColor: 'text-amber-500',  spotBg: 'bg-amber-300' },
  { key: 'hotItems',  label: '今日热点',    value: 0, unit: '条', delta: 0,  deltaUnit: '条',
    icon: 'Flame',     iconBg: 'bg-rose-50',   iconColor: 'text-rose-500',   spotBg: 'bg-rose-300' },
])

const quickEntries = ref([
  { key: 'hot',      name: '热点选题',   tip: '10+ 平台实时热榜', icon: 'Flame',  iconBg: 'bg-rose-50',   iconColor: 'text-rose-500' },
  { key: 'article',  name: '文章生成',   tip: '风格 · 模型 · 出稿', icon: 'FileText', iconBg: 'bg-indigo-50',  iconColor: 'text-indigo-500' },
  { key: 'title',    name: '标题生成',   tip: '关键词 → 爆款方案', icon: 'Hash',     iconBg: 'bg-amber-50',  iconColor: 'text-amber-500' },
  { key: 'link',     name: '链接生成',   tip: '推广链接 / UTM',   icon: 'Link',     iconBg: 'bg-emerald-50', iconColor: 'text-emerald-500' },
  { key: 'material', name: '素材合成',   tip: '图文拼版 · 导出',  icon: 'Layers',   iconBg: 'bg-purple-50', iconColor: 'text-purple-500' },
  { key: 'library',  name: '文章库',     tip: '历史 · 检索 · 重编', icon: 'LibraryBig', iconBg: 'bg-blue-50', iconColor: 'text-blue-500' },
])

// 最近生成
const articles = ref([])
const articlesLoading = ref(false)

// 热点预览
const hotPreview = ref([])
const hotLoading = ref(false)

async function loadArticles() {
  articlesLoading.value = true
  try {
    const r = await aiWorkApi.listArticles({ page: 1, pageSize: 10 })
    articles.value = r?.data || []
    const total = r?.total ?? 0
    // 总字数
    const words = (r?.data || []).reduce((s, a) => s + (a.word_count || 0), 0)
    statCards.value[0].value = total
    statCards.value[1].value = formatNum(words)
  } catch (e) {
    console.warn('[dash] loadArticles', e.message)
  } finally {
    articlesLoading.value = false
  }
}

async function loadHot() {
  hotLoading.value = true
  try {
    const r = await aiWorkApi.getHotBatch('weibo,toutiao,zhihu')
    const byPlat = r?.data || {}
    const merged = []
    for (const p of ['weibo', 'toutiao', 'zhihu']) {
      const list = byPlat[p]?.list || []
      merged.push(...list.slice(0, 3))
    }
    // 按 category + 热度 粗排（这里演示取前 8 条）
    const combined = merged
      .sort((a, b) => (b.hot || 0) - (a.hot || 0))
      .slice(0, 8)
    hotPreview.value = combined
    statCards.value[3].value = combined.length
  } catch (e) {
    console.warn('[dash] loadHot', e.message)
  } finally {
    hotLoading.value = false
  }
}

// 标题方案数：本地 localStorage 记录
function loadMiscStats() {
  try {
    const n = parseInt(localStorage.getItem('ai_title_count') || '0', 10) || 0
    statCards.value[2].value = n
  } catch {}
}

function formatNum(n) {
  if (!n && n !== 0) return 0
  if (n >= 10000) return (n / 10000).toFixed(1) + 'w'
  return n
}

function formatTs(ts) {
  if (!ts) return ''
  const d = new Date(Number(ts))
  const now = Date.now()
  const diff = now - Number(ts)
  if (diff < 60 * 1000) return '刚刚'
  if (diff < 3600 * 1000) return Math.floor(diff / 60000) + ' 分钟前'
  if (diff < 86400 * 1000) return Math.floor(diff / 3600000) + ' 小时前'
  return `${d.getMonth() + 1}/${d.getDate()}`
}

function openArticle(url) {
  if (!url) return
  window.open(url, '_blank', 'noopener')
}

function openArticleDetail(id) {
  // 跳到文章库（也可后续改成打开弹窗）
  onGo('library')
}

onMounted(() => {
  loadArticles()
  loadHot()
  loadMiscStats()
})
</script>

<style scoped>
.ai-dash-qk { will-change: transform; }
</style>
