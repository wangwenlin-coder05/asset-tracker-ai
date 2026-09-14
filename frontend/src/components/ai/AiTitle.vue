<template>
  <div class="grid grid-cols-1 xl:grid-cols-[360px_1fr] gap-3">
    <!-- 左：参数 -->
    <aside class="bg-white rounded-xl card-shadow p-4 space-y-3 h-fit lg:sticky lg:top-3">
      <div class="text-sm font-bold text-slate-700 mb-1 flex items-center gap-2">
        <Hash class="w-4 h-4 text-amber-500" /> 标题生成
      </div>
      <p class="text-[11.5px] text-slate-400 leading-relaxed">
        输入关键词 / 主题，一次性产出 N 组风格化标题方案。
      </p>

      <label class="block text-[12px] text-slate-500 font-medium mb-1.5">关键词 / 核心主题 <span class="text-rose-400">*</span></label>
      <input v-model="form.keywords" type="text" placeholder="如：2026年A股科技主线、减脂餐、职场沟通"
             class="w-full px-3 py-2 border border-slate-200 rounded-lg text-xs focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 outline-none" />

      <label class="block text-[12px] text-slate-500 font-medium mb-1.5 mt-1.5">辅助说明（可选）</label>
      <textarea v-model="form.desc" rows="2"
        placeholder="一句话描述你的内容方向，帮助标题更贴合。"
        class="w-full px-3 py-2 border border-slate-200 rounded-lg text-xs resize-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 outline-none"></textarea>

      <div class="grid grid-cols-2 gap-2 mt-1.5">
        <div>
          <label class="block text-[12px] text-slate-500 font-medium mb-1.5">目标平台</label>
          <select v-model="form.platform"
                  class="w-full px-2.5 py-2 border border-slate-200 rounded-lg text-xs bg-white focus:ring-1 focus:ring-indigo-200 focus:border-indigo-400 outline-none">
            <option v-for="p in platforms" :key="p.key" :value="p.key">{{ p.label }}</option>
          </select>
        </div>
        <div>
          <label class="block text-[12px] text-slate-500 font-medium mb-1.5">内容类型</label>
          <select v-model="form.type"
                  class="w-full px-2.5 py-2 border border-slate-200 rounded-lg text-xs bg-white focus:ring-1 focus:ring-indigo-200 focus:border-indigo-400 outline-none">
            <option value="article">科普 / 深度文</option>
            <option value="review">测评 / 体验</option>
            <option value="tutorial">教程 / 干货</option>
            <option value="news">资讯 / 热点</option>
            <option value="story">故事 / 叙事</option>
            <option value="ad">种草 / 营销</option>
          </select>
        </div>
      </div>

      <div>
        <label class="flex items-center justify-between text-[12px] text-slate-500 font-medium mb-1.5 mt-1.5">
          <span>生成数量</span>
          <span class="text-indigo-600 font-semibold">{{ form.count }} 条</span>
        </label>
        <input v-model.number="form.count" type="range" min="6" max="24" step="2"
               class="w-full h-2 bg-slate-100 rounded-full appearance-none cursor-pointer accent-indigo-500" />
      </div>

      <div>
        <label class="block text-[12px] text-slate-500 font-medium mb-1.5 mt-1.5">偏好技巧（可多选）</label>
        <div class="grid grid-cols-2 gap-1.5">
          <label v-for="t in tricks" :key="t.key"
                 class="flex items-center gap-1.5 px-2 py-1.5 rounded-lg border cursor-pointer select-none text-[11px] transition-all"
                 :class="form.tricks.includes(t.key)
                   ? 'border-indigo-400 bg-indigo-50 text-indigo-600'
                   : 'border-slate-200 text-slate-600 hover:bg-slate-50'">
            <input v-model="form.tricks" :value="t.key" type="checkbox" class="w-3 h-3 rounded border-slate-300 text-indigo-500 focus:ring-indigo-400" />
            {{ t.label }}
          </label>
        </div>
      </div>

      <button @click="doGenerate"
              :disabled="!form.keywords.trim() || generating"
              class="w-full mt-2 py-2.5 rounded-xl text-sm font-bold flex items-center justify-center gap-2 transition-all
                     bg-gradient-to-r from-amber-500 to-orange-500 text-white shadow-md shadow-amber-200/40 hover:shadow-lg hover:-translate-y-0.5
                     disabled:opacity-50 disabled:cursor-not-allowed">
        <Wand2 class="w-4 h-4" :class="{ 'animate-spin': generating }" />
        {{ generating ? '组合生成中...' : '生成 ' + form.count + ' 组标题方案' }}
      </button>

      <div v-if="history.length" class="pt-3 border-t border-slate-100">
        <div class="flex items-center justify-between mb-2">
          <span class="text-[12px] font-semibold text-slate-600">历史关键词</span>
          <button @click="clearHistory" class="text-[10.5px] text-slate-400 hover:text-rose-500">清空</button>
        </div>
        <div class="flex flex-wrap gap-1.5">
          <button v-for="h in history" :key="h" @click="form.keywords = h"
                  class="text-[11px] px-2 py-1 rounded-full bg-slate-50 border border-slate-100 text-slate-600 hover:border-indigo-200 hover:text-indigo-600 transition-all">
            {{ h }}
          </button>
        </div>
      </div>
    </aside>

    <!-- 右：结果 -->
    <section class="bg-white rounded-xl card-shadow p-4 sm:p-5 min-h-[600px]">
      <header class="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-slate-100">
        <div>
          <h3 class="text-sm font-bold text-slate-800 flex items-center gap-2">
            <Sparkles class="w-4 h-4 text-amber-500" /> 标题方案
            <span v-if="results.length" class="text-[11px] font-normal text-slate-400">共 {{ results.length }} 条</span>
          </h3>
          <p v-if="stats.avg" class="text-[11px] text-slate-400 mt-0.5">
            平均长度 {{ stats.avg }} 字 · 最长 {{ stats.max }} 字 · 最短 {{ stats.min }} 字
          </p>
        </div>
        <div class="flex flex-wrap items-center gap-2">
          <div class="relative">
            <Search class="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
            <input v-model="keyword" type="text" placeholder="搜索标题..."
                   class="pl-8 pr-2.5 py-1.5 border border-slate-200 rounded-lg text-[11.5px] w-44 focus:border-indigo-400 focus:ring-1 focus:ring-indigo-100 outline-none" />
          </div>
          <div class="flex items-center gap-1 p-0.5 bg-slate-50 rounded-lg border border-slate-100">
            <button v-for="s in sortOpts" :key="s.key"
                    @click="sortBy = s.key"
                    class="px-2 py-1 rounded-md text-[10.5px] font-medium transition-all"
                    :class="sortBy === s.key ? 'bg-white text-slate-700 shadow-sm' : 'text-slate-400 hover:text-slate-600'">
              {{ s.label }}
            </button>
          </div>
          <button v-if="results.length" @click="copyAll"
                  class="px-3 py-1.5 rounded-lg text-[11.5px] font-medium border border-slate-200 hover:bg-slate-50 text-slate-600 flex items-center gap-1 transition-all">
            <Copy class="w-3.5 h-3.5" /> 复制全部
          </button>
        </div>
      </header>

      <div v-if="!generating && results.length === 0" class="min-h-[460px] flex flex-col items-center justify-center text-center p-6">
        <div class="w-16 h-16 rounded-2xl bg-gradient-to-br from-amber-50 to-orange-50 flex items-center justify-center mb-4">
          <Hash class="w-8 h-8 text-amber-400" />
        </div>
        <div class="text-sm font-semibold text-slate-700">输入关键词，一键生成 N 组爆款标题</div>
        <div class="text-[12px] text-slate-400 mt-1.5 max-w-sm leading-relaxed">
          内置数字、设问、悬念、对比、情绪、反常识、故事化等多种标题技巧
        </div>
        <div v-if="seedText" class="mt-4 max-w-md w-full p-3 rounded-xl bg-indigo-50/60 border border-indigo-100 text-left">
          <div class="text-[11px] text-indigo-700 font-semibold mb-1.5 flex items-center gap-1">
            <Lightbulb class="w-3.5 h-3.5" /> 待转化的种子标题
          </div>
          <div class="text-[13px] text-indigo-900/80 font-medium leading-snug">{{ seedText }}</div>
          <button @click="useSeed" class="mt-2 text-[11px] text-indigo-600 font-medium hover:underline">直接使用此文本作为关键词</button>
        </div>
      </div>

      <div v-else-if="generating" class="min-h-[460px] space-y-3 p-2 animate-pulse">
        <div v-for="i in 8" :key="i" class="h-11 bg-slate-50 rounded-xl"></div>
      </div>

      <div v-else class="mt-3 grid grid-cols-1 md:grid-cols-2 gap-2.5">
        <div v-for="(r, idx) in sortedResults" :key="r.key"
             class="group relative ai-title-card rounded-xl border border-slate-100 hover:border-indigo-200 hover:bg-indigo-50/20 p-3 transition-all">
          <div class="flex items-start gap-2">
            <span class="shrink-0 w-6 h-6 rounded-lg text-[10.5px] font-bold flex items-center justify-center transition-all"
                  :class="idx < 3
                    ? 'bg-gradient-to-br from-amber-400 to-orange-500 text-white shadow-sm'
                    : 'bg-slate-100 text-slate-500 group-hover:bg-indigo-100 group-hover:text-indigo-600'">
              {{ idx + 1 }}
            </span>
            <div class="flex-1 min-w-0">
              <div class="text-[13px] font-medium text-slate-800 leading-snug group-hover:text-indigo-700 transition-colors">
                {{ r.title }}
              </div>
              <div class="mt-1.5 flex flex-wrap items-center gap-1.5">
                <span v-for="t in r.tags" :key="t"
                      class="text-[9.5px] px-1.5 py-0.5 rounded-full border"
                      :class="tagColor(t)">
                  {{ t }}
                </span>
                <span class="text-[9.5px] text-slate-400 ml-auto shrink-0">{{ r.len }} 字</span>
              </div>
            </div>
            <div class="shrink-0 flex flex-col gap-1 opacity-0 group-hover:opacity-100 transition-all">
              <button @click="doCopy(r.title)" title="复制此标题"
                      class="w-7 h-7 rounded-lg hover:bg-white hover:shadow-sm text-slate-500 hover:text-indigo-500 flex items-center justify-center transition-all">
                <Copy class="w-3.5 h-3.5" />
              </button>
              <button @click="markFavorite(r)" :title="r.fav ? '取消收藏' : '收藏'"
                      class="w-7 h-7 rounded-lg hover:bg-white hover:shadow-sm flex items-center justify-center transition-all"
                      :class="r.fav ? 'text-amber-500' : 'text-slate-500 hover:text-amber-500'">
                <Star class="w-3.5 h-3.5" :fill="r.fav ? 'currentColor' : 'none'" />
              </button>
            </div>
          </div>
        </div>
      </div>
    </section>
  </div>
</template>

<script setup>
import { inject, reactive, ref, computed, watch, onMounted } from 'vue'
import {
  Hash, Wand2, Sparkles, Search, Copy, Lightbulb, Star,
} from 'lucide-vue-next'
import { useAiWork } from '../../composables/useAiWork'
import { aiWorkApi } from '../../utils/api'

const emit = inject('aiSwitchMenu')
const { copyToClipboard } = useAiWork()

const platforms = [
  { key: 'wx',    label: '微信公众号' },
  { key: 'zhihu', label: '知乎' },
  { key: 'xhs',   label: '小红书' },
  { key: 'dy',    label: '抖音' },
  { key: 'weibo', label: '微博' },
  { key: 'toutiao', label: '今日头条' },
  { key: 'bili',  label: 'B 站' },
  { key: 'general', label: '通用媒体' },
]

const tricks = [
  { key: 'number',  label: '数字标题' },
  { key: 'question',label: '疑问/设问' },
  { key: 'suspense',label: '悬念钩子' },
  { key: 'contrast',label: '强对比' },
  { key: 'emotion', label: '情绪共鸣' },
  { key: 'anti',    label: '反常识' },
  { key: 'story',   label: '故事化' },
  { key: 'scarcity',label: '稀缺/紧迫' },
  { key: 'authority',label: '权威背书' },
  { key: 'interactive',label: '互动提问' },
]

const form = reactive({
  keywords: '',
  desc: '',
  platform: 'wx',
  type: 'article',
  count: 12,
  tricks: ['number', 'suspense', 'emotion'],
})

const results = ref([])
const generating = ref(false)
const keyword = ref('')
const sortBy = ref('default')  // default, short, long, fav
const sortOpts = [
  { key: 'default', label: '推荐' },
  { key: 'short',   label: '短' },
  { key: 'long',    label: '长' },
  { key: 'fav',     label: '收藏' },
]
const history = ref([])
const seedText = ref('')

function useSeed() {
  if (seedText.value) form.keywords = seedText.value
}

const sortedResults = computed(() => {
  const kw = keyword.value.trim().toLowerCase()
  let list = results.value
  if (kw) list = list.filter(r => r.title.toLowerCase().includes(kw))
  const arr = [...list]
  switch (sortBy.value) {
    case 'short': arr.sort((a, b) => a.len - b.len); break
    case 'long':  arr.sort((a, b) => b.len - a.len); break
    case 'fav':   arr.sort((a, b) => (b.fav ? 1 : 0) - (a.fav ? 1 : 0)); break
    default: arr.sort((a, b) => b.score - a.score)
  }
  return arr
})

const stats = computed(() => {
  if (!results.value.length) return { avg: 0, max: 0, min: 0 }
  const lens = results.value.map(r => r.len)
  return {
    avg: Math.round(lens.reduce((s, n) => s + n, 0) / lens.length),
    max: Math.max(...lens),
    min: Math.min(...lens),
  }
})

function tagColor(t) {
  const map = {
    '数字':  'bg-blue-50 text-blue-600 border-blue-100',
    '疑问':  'bg-purple-50 text-purple-600 border-purple-100',
    '悬念':  'bg-indigo-50 text-indigo-600 border-indigo-100',
    '对比':  'bg-rose-50 text-rose-600 border-rose-100',
    '情绪':  'bg-pink-50 text-pink-600 border-pink-100',
    '反常识':'bg-amber-50 text-amber-700 border-amber-100',
    '故事化':'bg-emerald-50 text-emerald-700 border-emerald-100',
    '稀缺':  'bg-orange-50 text-orange-600 border-orange-100',
    '权威':  'bg-slate-50 text-slate-600 border-slate-200',
    '互动':  'bg-teal-50 text-teal-600 border-teal-100',
    '平台词':'bg-cyan-50 text-cyan-600 border-cyan-100',
    '类型词':'bg-violet-50 text-violet-600 border-violet-100',
  }
  return map[t] || 'bg-slate-50 text-slate-500 border-slate-100'
}

// ==== 核心：组合生成标题 ====
const PLATFORM_WORDS = {
  wx:    ['深度解读', '一文讲透', '建议收藏', '万字长文'],
  zhihu: ['如何评价', '为什么说', '有哪些', '是一种什么体验'],
  xhs:   ['保姆级教程', '姐妹们！', '亲测有效', '码住！', 'yyds', '必看'],
  dy:    ['3 秒看完', '1 分钟教会你', '千万别这样做', '看完你就明白了'],
  weibo: ['【重磅】', '网友热议：', '最新消息', '一句话说清楚'],
  toutiao: ['刚刚', '权威', '最新进展', '一图看懂'],
  bili:  ['【干货】', '硬核科普', '全站最细', '劝退指南'],
  general: ['深度', '实战', '最新', '一文看懂'],
}
const TYPE_WORDS = {
  article:  ['分析', '现状', '趋势', '底层逻辑', '机会窗口'],
  review:   ['真实测评', '体验一周后', '优缺点对比', '踩坑记录'],
  tutorial: ['保姆级教程', '手把手教你', '小白也能会', '10 分钟搞定'],
  news:     ['最新消息', '突发', '重磅发布', '第一时间解读'],
  story:    ['我用了 3 年', '一位朋友的故事', '真实经历', '从 0 到 1 的过程'],
  ad:       ['必入', '闭眼冲', '宝藏推荐', '亲测好用'],
}

async function doGenerate() {
  if (!form.keywords.trim()) return
  generating.value = true
  results.value = []
  // 记录历史
  const kw = form.keywords.trim()
  const arr = history.value.filter(x => x !== kw)
  arr.unshift(kw)
  history.value = arr.slice(0, 12)
  try { localStorage.setItem('ai_title_history', JSON.stringify(history.value)) } catch {}
  try { localStorage.setItem('ai_title_count', String(parseInt(localStorage.getItem('ai_title_count') || '0', 10) + form.count)) } catch {}
  try {

  const platList = PLATFORM_WORDS[form.platform] || PLATFORM_WORDS.general
  const typeList = TYPE_WORDS[form.type] || TYPE_WORDS.article

  // 构造多组生成
  const seeds = []
  const tricksUse = form.tricks.length ? form.tricks : ['number', 'suspense', 'emotion']

  // 1) 数字型
  if (tricksUse.includes('number')) {
    const nums = [3, 5, 7, 9, 10, 12, 15]
    for (let i = 0; i < 4; i++) {
      const n = pickOne(nums)
      const base = `${n} 个关于「${kw}」的${pickOne(typeList)}`
      seeds.push(pack(`${pickOne(platList)}｜${base}，最后一条最容易被忽视`, ['数字', '平台词']))
      seeds.push(pack(`一文看懂「${kw}」：${n} 个${pickOne(['关键事实','核心观点','必须知道的事','被忽视的细节'])}`, ['数字']))
    }
  }
  // 2) 疑问/设问
  if (tricksUse.includes('question')) {
    seeds.push(pack(`${pickOne(platList)}：关于「${kw}」，我们究竟在讨论什么？`, ['疑问', '平台词']))
    seeds.push(pack(`为什么说「${kw}」正在成为${pickOne(['2026 最大变量','下一个风口','普通人的机会'])}？`, ['疑问']))
    seeds.push(pack(`如何评价当下的「${kw}」？一个${pickOne(['从业者','一线投资者','过来人'])}说出了实话`, ['疑问', '权威']))
    seeds.push(pack(`${pickOne(['新手','小白','普通人'])}做「${kw}」最常见的 3 个错误，你中了几个？`, ['疑问', '互动', '数字']))
  }
  // 3) 悬念钩子
  if (tricksUse.includes('suspense')) {
    seeds.push(pack(`关于「${kw}」，90% 的人都${pickOne(['理解错了','知道得太晚','忽略了这件事'])}`, ['悬念']))
    seeds.push(pack(`「${kw}」背后藏着一个被忽视的${pickOne(['秘密','真相','逻辑'])}，看完倒吸一口气`, ['悬念']))
    seeds.push(pack(`我观察了 300 个做「${kw}」的人，发现了同一个${pickOne(['规律','现象','问题'])}`, ['悬念', '故事化']))
  }
  // 4) 对比
  if (tricksUse.includes('contrast')) {
    seeds.push(pack(`同样是做「${kw}」，为什么有人${pickOne(['年入百万','轻松破局','一帆风顺'])}，有人却越做越难？`, ['对比', '疑问']))
    seeds.push(pack(`「${kw}」过去 vs 现在：${pickOne(['3','5','8'])} 个维度看懂这波变化`, ['对比', '数字']))
    seeds.push(pack(`普通人 vs 高手：面对「${kw}」时的反应，差距就在这里`, ['对比']))
  }
  // 5) 情绪共鸣
  if (tricksUse.includes('emotion')) {
    seeds.push(pack(`看完关于「${kw}」的现状，我沉默了很久……`, ['情绪', '故事化']))
    seeds.push(pack(`如果你也在关注「${kw}」，这篇请一定读完${pickOne(['（信息量极大）','（真心话）',''])}`, ['情绪', '稀缺']))
    seeds.push(pack(`写给每一个在「${kw}」中${pickOne(['迷茫','挣扎','坚持'])}的人：请一定再坚持一下`, ['情绪']))
  }
  // 6) 反常识
  if (tricksUse.includes('anti')) {
    seeds.push(pack(`关于「${kw}」的最大误区：${pickOne(['你以为的优势','大家公认的做法','主流观点'])}，可能正在害你`, ['反常识', '悬念']))
    seeds.push(pack(`${pickOne(['万万没想到','真相令人意外','恰恰相反'])}：「${kw}」真正的关键其实不在这儿`, ['反常识']))
    seeds.push(pack(`被 90% 人忽略的「${kw}」真相：${pickOne(['你以为的机会','大家追捧的捷径'])}，其实是陷阱`, ['反常识', '悬念']))
  }
  // 7) 故事化
  if (tricksUse.includes('story')) {
    seeds.push(pack(`${pickOne(['我朋友','我同事','一位读者'])}靠「${kw}」翻身的真实故事，看完醍醐灌顶`, ['故事化']))
    seeds.push(pack(`从月入 3k 到年入 7 位数：他在「${kw}」这件事上踩过的所有坑`, ['故事化', '对比']))
    seeds.push(pack(`一个关于「${kw}」的真实故事，很短，却很深`, ['故事化', '情绪']))
  }
  // 8) 稀缺 / 紧迫
  if (tricksUse.includes('scarcity')) {
    seeds.push(pack(`「${kw}」的时间窗口正在关闭，再犹豫就真的晚了`, ['稀缺']))
    seeds.push(pack(`关于「${kw}」，这篇${pickOne(['只发一次','很快就删','请务必收藏'])}：${pickOne(typeList)}`, ['稀缺', '平台词']))
    seeds.push(pack(`现在上车「${kw}」还来得及吗？给你 ${pickOne([3,5])} 条${pickOne(['真话','硬核建议','冷思考'])}`, ['稀缺', '数字']))
  }
  // 9) 权威
  if (tricksUse.includes('authority')) {
    seeds.push(pack(`${pickOne(['清华教授','行业老兵','资深从业者','官方数据'])}：如何正确理解「${kw}」？`, ['权威']))
    seeds.push(pack(`看完 100+ 篇研报后，关于「${kw}」我总结了这 ${pickOne([3,5,7])} 个结论`, ['权威', '数字']))
  }
  // 10) 互动
  if (tricksUse.includes('interactive')) {
    seeds.push(pack(`关于「${kw}」，你最想了解哪一块？评论区告诉我`, ['互动']))
    seeds.push(pack(`做过「${kw}」的朋友，来说说你的感受？${pickOne(['评论区见','点赞最多的回复上墙',''])}`, ['互动']))
  }

  // 如果 desc 存在，追加融入
  if (form.desc.trim()) {
    seeds.push(pack(`${form.desc.trim()}｜「${kw}」${pickOne(platList)}`, ['类型词', '平台词']))
  }

  // 去重 & 取样 count 条
  let unique = []
  const seen = new Set()
  for (const s of seeds) {
    if (seen.has(s.title)) continue
    seen.add(s.title)
    unique.push(s)
  }
  // 不足则补带变体的
  let guard = 0
  while (unique.length < form.count && guard++ < 300) {
    const orig = pickOne(unique.length ? unique : seeds)
    const variant = makeVariant(orig.title, kw, platList, typeList)
    if (seen.has(variant)) continue
    seen.add(variant)
    unique.push(pack(variant, [...(orig.tags || []), '平台词']))
  }
  // 评分排序：长度合适 16–28 分高 + 技巧标签越多分越高
  unique.forEach((u, i) => {
    let score = 100 - i
    const L = u.len
    if (L >= 16 && L <= 28) score += 40
    else if (L >= 12 && L <= 32) score += 20
    else if (L < 8 || L > 42) score -= 20
    score += (u.tags.length - 1) * 8
    u.score = Math.round(score)
    u.key = 't-' + i + '-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6)
  })
  unique.sort((a, b) => b.score - a.score)

  // 按平台做长度微调：小红书/抖音偏短，公众号可长
  results.value = unique.slice(0, form.count).map(r => {
    if ((form.platform === 'xhs' || form.platform === 'dy') && r.len > 28) {
      const shorter = r.title.replace(/深度解读|一文讲透|万字长文|｜/g, '').slice(0, 26)
      return { ...r, title: shorter, len: shorter.length }
    }
    return r
  })

  // 延迟一下，做生成动画感
  await sleep(450)
} finally {
  generating.value = false
}
}

function makeVariant(title, kw, platList, typeList) {
  const rand = Math.random()
  if (rand < 0.3) return `${pickOne(platList)}｜${title}`.slice(0, 40)
  if (rand < 0.6) return `${title}（${pickOne(typeList)}）`.slice(0, 40)
  if (rand < 0.8) return `关于「${kw}」：${title}`
  return `${title}，建议先收藏`
}

function pack(title, tags) {
  const t = String(title).replace(/\s+/g, ' ').trim()
  return { title: t, len: t.length, tags: Array.from(new Set(tags || [])), fav: false, score: 0 }
}

function pickOne(arr) { return arr[Math.floor(Math.random() * arr.length)] }
function sleep(ms) { return new Promise(r => setTimeout(r, ms)) }

// ==== 交互 ====
async function doCopy(title) {
  const ok = await copyToClipboard(title)
  flashToast(ok ? '已复制标题' : '复制失败')
}
async function copyAll() {
  const text = sortedResults.value.map((r, i) => `${i + 1}. ${r.title}`).join('\n')
  const ok = await copyToClipboard(text)
  flashToast(ok ? '全部标题已复制' : '复制失败')
}
function markFavorite(r) { r.fav = !r.fav }

function clearHistory() {
  history.value = []
  try { localStorage.removeItem('ai_title_history') } catch {}
}

function flashToast(msg) {
  const el = document.createElement('div')
  el.textContent = msg
  el.className = 'fixed z-[999] left-1/2 bottom-10 -translate-x-1/2 px-4 py-2 rounded-lg bg-slate-900/90 text-white text-xs shadow-lg'
  document.body.appendChild(el)
  setTimeout(() => { el.style.opacity = '0'; el.style.transition = 'all .3s' }, 1200)
  setTimeout(() => document.body.removeChild(el), 1700)
}

// ==== 种子 & 历史加载 ====
onMounted(() => {
  try {
    const seed = localStorage.getItem('ai_seed_title')
    if (seed) { seedText.value = seed; localStorage.removeItem('ai_seed_title') }
    const h = localStorage.getItem('ai_title_history')
    if (h) history.value = JSON.parse(h).slice(0, 12)
  } catch {}
})
</script>

<style scoped>
input[type=range]::-webkit-slider-thumb { -webkit-appearance: none; }
</style>
