<template>
  <div class="grid grid-cols-1 xl:grid-cols-[360px_1fr] gap-3">
    <!-- ====== 左侧：参数配置 ====== -->
    <aside class="space-y-3">
      <div class="bg-white rounded-xl card-shadow p-4">
        <div class="text-sm font-bold text-slate-700 mb-3 flex items-center gap-2">
          <Settings class="w-4 h-4 text-indigo-500" /> 创作参数
        </div>

        <!-- 选题/主题 -->
        <label class="block text-[12px] text-slate-500 mb-1.5 font-medium">
          选题 / 主题 <span class="text-rose-400">*</span>
        </label>
        <textarea v-model="form.topic" rows="2"
          placeholder="如：为什么今年 A 股 AI 概念值得关注？"
          class="w-full px-3 py-2 border border-slate-200 rounded-lg text-xs resize-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 outline-none transition-all"></textarea>

        <!-- 分类/标签 -->
        <div class="grid grid-cols-2 gap-2 mt-3">
          <div>
            <label class="block text-[12px] text-slate-500 mb-1.5 font-medium">分类</label>
            <select v-model="form.category"
                    class="w-full px-2.5 py-2 border border-slate-200 rounded-lg text-xs bg-white focus:ring-1 focus:ring-indigo-200 focus:border-indigo-400 outline-none">
              <option v-for="c in categories" :key="c" :value="c">{{ c }}</option>
            </select>
          </div>
          <div>
            <label class="block text-[12px] text-slate-500 mb-1.5 font-medium">目标读者</label>
            <select v-model="form.audience"
                    class="w-full px-2.5 py-2 border border-slate-200 rounded-lg text-xs bg-white focus:ring-1 focus:ring-indigo-200 focus:border-indigo-400 outline-none">
              <option value="general">大众读者</option>
              <option value="investor">投资/理财人群</option>
              <option value="youth">年轻群体</option>
              <option value="biz">职场/商务</option>
              <option value="parent">宝妈/家庭</option>
              <option value="student">学生群体</option>
            </select>
          </div>
        </div>

        <!-- 风格 -->
        <div class="mt-3">
          <label class="block text-[12px] text-slate-500 mb-1.5 font-medium">文章风格</label>
          <div class="grid grid-cols-3 gap-1.5">
            <button v-for="s in styles" :key="s.key"
                    @click="form.style = s.key"
                    class="px-2 py-1.5 rounded-lg border text-[11.5px] font-medium transition-all"
                    :class="form.style === s.key
                      ? 'border-indigo-400 bg-indigo-50 text-indigo-600 shadow-sm'
                      : 'border-slate-200 text-slate-600 hover:border-slate-300 hover:bg-slate-50'">
              {{ s.label }}
            </button>
          </div>
        </div>

        <!-- 模型 -->
        <div class="mt-3">
          <label class="block text-[12px] text-slate-500 mb-1.5 font-medium">生成模型</label>
          <div class="grid grid-cols-2 gap-1.5">
            <button v-for="m in models" :key="m.key"
                    @click="form.model = m.key"
                    class="px-2 py-1.5 rounded-lg border text-[11.5px] font-medium transition-all text-left"
                    :class="form.model === m.key
                      ? 'border-indigo-400 bg-indigo-50 text-indigo-600 shadow-sm'
                      : 'border-slate-200 text-slate-600 hover:border-slate-300 hover:bg-slate-50'">
              <div class="flex items-center justify-between">
                <span>{{ m.label }}</span>
                <span class="text-[9px] opacity-70">{{ m.tag }}</span>
              </div>
            </button>
          </div>
        </div>

        <!-- 字数 -->
        <div class="mt-3">
          <label class="flex items-center justify-between text-[12px] text-slate-500 mb-1.5 font-medium">
            <span>目标字数</span>
            <span class="text-indigo-600 font-semibold">{{ form.wordCount }} 字</span>
          </label>
          <input v-model.number="form.wordCount" type="range" min="300" max="5000" step="100"
                 class="w-full h-2 bg-slate-100 rounded-full appearance-none cursor-pointer accent-indigo-500" />
          <div class="flex justify-between text-[10px] text-slate-400 mt-1">
            <span>300</span><span>2000</span><span>5000</span>
          </div>
        </div>

        <!-- 高级参数 -->
        <details class="mt-3 group rounded-lg border border-slate-100 p-2.5 bg-slate-50/50 hover:bg-slate-50 transition-all">
          <summary class="cursor-pointer text-[12px] font-semibold text-slate-600 flex items-center justify-between select-none">
            <span class="flex items-center gap-1.5">
              <Sliders class="w-3.5 h-3.5 text-slate-500" /> 高级参数
            </span>
            <ChevronDown class="w-3.5 h-3.5 text-slate-400 group-open:rotate-180 transition-transform" />
          </summary>
          <div class="mt-3 space-y-2.5">
            <div>
              <label class="flex items-center justify-between text-[11px] text-slate-500 mb-1">
                <span>随机性 (temperature)</span>
                <span class="font-medium">{{ form.temp.toFixed(1) }}</span>
              </label>
              <input v-model.number="form.temp" type="range" min="0" max="1.5" step="0.1"
                     class="w-full h-1.5 bg-slate-100 rounded-full appearance-none cursor-pointer accent-indigo-500" />
            </div>
            <div>
              <label class="block text-[11px] text-slate-500 mb-1 font-medium">必包含关键词（逗号分隔）</label>
              <input v-model="form.mustInclude" type="text"
                     class="w-full px-2.5 py-1.5 border border-slate-200 rounded-lg text-[11.5px] focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 outline-none" />
            </div>
            <div>
              <label class="block text-[11px] text-slate-500 mb-1 font-medium">参考正文（来自热点解析，可编辑）</label>
              <textarea v-model="form.seedContent" rows="3"
                        class="w-full px-2.5 py-1.5 border border-slate-200 rounded-lg text-[11px] resize-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 outline-none"></textarea>
            </div>
            <label class="flex items-center gap-2 text-[11.5px] text-slate-600 cursor-pointer select-none">
              <input v-model="form.addImagePrompts" type="checkbox" class="rounded border-slate-300 text-indigo-500 focus:ring-indigo-400 w-3.5 h-3.5" />
              <span>每 2 段自动插入「配图提示词」占位</span>
            </label>
            <label class="flex items-center gap-2 text-[11.5px] text-slate-600 cursor-pointer select-none">
              <input v-model="form.withEmoji" type="checkbox" class="rounded border-slate-300 text-indigo-500 focus:ring-indigo-400 w-3.5 h-3.5" />
              <span>段落标题加 emoji（适合公众号/小红书）</span>
            </label>
          </div>
        </details>

        <!-- 生成按钮 -->
        <div class="mt-4 flex flex-col gap-2">
          <button @click="doGenerate"
                  :disabled="generating || !form.topic.trim()"
                  class="w-full py-2.5 rounded-xl text-sm font-bold flex items-center justify-center gap-2 transition-all
                         bg-gradient-to-r from-indigo-500 to-blue-500 text-white shadow-md shadow-indigo-200/50 hover:shadow-lg hover:-translate-y-0.5
                         disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:translate-y-0">
            <Wand2 class="w-4 h-4" :class="{ 'animate-spin': generating }" />
            {{ generating ? '生成中...' : '一键生成文章' }}
          </button>
          <div class="grid grid-cols-2 gap-2">
            <button @click="regenerateTitleOnly"
                    :disabled="generating"
                    class="py-2 rounded-lg text-xs font-medium border border-slate-200 hover:bg-slate-50 text-slate-600 disabled:opacity-50 transition-all flex items-center justify-center gap-1">
              <Hash class="w-3.5 h-3.5" /> 优化标题
            </button>
            <button @click="clearAll"
                    class="py-2 rounded-lg text-xs font-medium border border-slate-200 hover:bg-slate-50 text-slate-600 transition-all flex items-center justify-center gap-1">
              <Trash2 class="w-3.5 h-3.5" /> 清空
            </button>
          </div>
        </div>
      </div>
    </aside>

    <!-- ====== 右侧：生成结果 ====== -->
    <section class="bg-white rounded-xl card-shadow p-4 sm:p-5 flex flex-col min-h-[600px]">
      <header class="flex items-start justify-between gap-3 mb-3 pb-3 border-b border-slate-100">
        <div class="flex-1 min-w-0">
          <input v-model="result.title" @blur="onTitleBlur"
                 type="text" placeholder="(生成后可直接编辑标题)"
                 :class="'w-full bg-transparent outline-none text-lg font-bold text-slate-800 leading-snug border-b border-transparent focus:border-indigo-300 pb-1 transition-all' + (generating ? ' opacity-60' : '')" />
          <div class="mt-2 flex flex-wrap items-center gap-1.5 text-[11px] text-slate-500">
            <span class="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded bg-slate-50 border border-slate-100">
              <FileText class="w-3 h-3" /> {{ result.wordCount }} 字
            </span>
            <span class="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded bg-slate-50 border border-slate-100">
              <Clock class="w-3 h-3" /> {{ result.readingTime }} 分钟阅读
            </span>
            <span class="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded bg-slate-50 border border-slate-100">
              <Layers class="w-3 h-3" /> {{ result.paragraphCount }} 段
            </span>
            <span v-if="lastGenTime" class="px-1.5 py-0.5 rounded bg-indigo-50 border border-indigo-100 text-indigo-600">
              {{ lastGenTime }}s · {{ form.model.toUpperCase() }}
            </span>
          </div>
        </div>

        <div class="flex flex-wrap items-center gap-1.5 shrink-0">
          <button @click="copyResult('title')"
                  :disabled="!result.title"
                  class="px-2.5 py-1.5 rounded-lg text-[11px] font-medium border border-slate-200 hover:bg-slate-50 text-slate-600 disabled:opacity-40 transition-all flex items-center gap-1">
            <Copy class="w-3 h-3" /> 标题
          </button>
          <button @click="copyResult('body')"
                  :disabled="!result.body"
                  class="px-2.5 py-1.5 rounded-lg text-[11px] font-medium border border-slate-200 hover:bg-slate-50 text-slate-600 disabled:opacity-40 transition-all flex items-center gap-1">
            <Copy class="w-3 h-3" /> 正文
          </button>
          <button @click="saveToLibrary"
                  :disabled="!result.body || saving"
                  class="px-2.5 py-1.5 rounded-lg text-[11px] font-medium bg-gradient-to-r from-emerald-500 to-teal-500 text-white shadow-sm hover:shadow-md disabled:opacity-40 transition-all flex items-center gap-1">
            <Save class="w-3 h-3" /> {{ saving ? '保存中' : savedId ? '已保存' : '入库' }}
          </button>
          <button @click="shareAsLink"
                  :disabled="!result.body"
                  class="px-2.5 py-1.5 rounded-lg text-[11px] font-medium border border-indigo-200 hover:bg-indigo-50 text-indigo-600 disabled:opacity-40 transition-all flex items-center gap-1">
            <Share2 class="w-3 h-3" /> 分享
          </button>
        </div>
      </header>

      <!-- 结果区 -->
      <div class="flex-1 min-h-[400px] relative overflow-hidden">
        <!-- 空态 -->
        <div v-if="!generating && !result.body"
             class="absolute inset-0 flex flex-col items-center justify-center text-center p-6">
          <div class="w-16 h-16 rounded-2xl bg-gradient-to-br from-indigo-50 to-blue-50 flex items-center justify-center mb-4 shadow-inner">
            <Sparkles class="w-8 h-8 text-indigo-400" />
          </div>
          <div class="text-sm font-semibold text-slate-700">在左侧输入选题，立即出稿</div>
          <div class="text-[12px] text-slate-400 mt-1.5 max-w-sm leading-relaxed">
            可以先去「热点选题」一键发送热门话题到这里，再选风格、模型生成
          </div>
          <div v-if="seedHot" class="mt-4 max-w-md w-full p-3 rounded-xl bg-amber-50/60 border border-amber-100 text-left">
            <div class="text-[11px] text-amber-700 font-semibold mb-1.5 flex items-center gap-1">
              <Sparkles class="w-3.5 h-3.5" /> 待使用的热点种子
            </div>
            <div class="text-[13px] font-semibold text-amber-900/80 leading-snug">{{ seedHot.title }}</div>
            <div class="text-[10.5px] text-amber-700/80 mt-1">{{ seedHot.source }} · {{ seedHot.category }}</div>
          </div>
        </div>

        <!-- 生成中 -->
        <div v-else-if="generating" class="absolute inset-0 p-4 overflow-y-auto">
          <div class="space-y-3 animate-pulse">
            <div class="h-6 bg-indigo-100/60 rounded w-1/2"></div>
            <div class="h-3 bg-slate-100 rounded w-full"></div>
            <div class="h-3 bg-slate-100 rounded w-11/12"></div>
            <div class="h-3 bg-slate-100 rounded w-9/12"></div>
            <div class="h-5 bg-indigo-100/60 rounded w-1/3 mt-3"></div>
            <div class="h-3 bg-slate-100 rounded w-full"></div>
            <div class="h-3 bg-slate-100 rounded w-11/12"></div>
            <div class="h-3 bg-slate-100 rounded w-10/12"></div>
          </div>
          <div class="mt-5 flex items-center justify-center gap-2 text-[12px] text-indigo-500 font-medium">
            <Loader class="w-4 h-4 animate-spin" />
            {{ liveStageText }}
          </div>
        </div>

        <!-- 结果正文 -->
        <div v-else class="absolute inset-0 p-3 sm:p-5 overflow-y-auto">
          <article ref="articleRef"
                   v-html="renderedHtml"
                   class="ai-article prose prose-sm prose-slate max-w-none
                          [&_h2]:text-base [&_h2]:font-bold [&_h2]:text-slate-800 [&_h2]:my-4 [&_h2]:flex [&_h2]:items-center [&_h2]:gap-2
                          [&_h3]:text-[13px] [&_h3]:font-semibold [&_h3]:text-slate-700 [&_h3]:mt-4 [&_h3]:mb-2
                          [&_p]:text-[13px] [&_p]:leading-7 [&_p]:text-slate-700 [&_p]:my-2.5 [&_p]:text-justify [&_p]:indent-8
                          [&_blockquote]:border-l-4 [&_blockquote]:border-indigo-200 [&_blockquote]:bg-indigo-50/40 [&_blockquote]:py-2 [&_blockquote]:px-3 [&_blockquote]:rounded-r-lg [&_blockquote]:text-[12.5px] [&_blockquote]:text-indigo-900/80
                          [&_ul]:text-[12.5px] [&_ul]:text-slate-700 [&_ul]:my-2.5 [&_ul]:space-y-1 [&_ul]:pl-6 [&_ul_li]:list-disc
                          [&_.ai-img-placeholder]:border-2 [&_.ai-img-placeholder]:border-dashed [&_.ai-img-placeholder]:border-indigo-200 [&_.ai-img-placeholder]:bg-indigo-50/30 [&_.ai-img-placeholder]:rounded-xl [&_.ai-img-placeholder]:py-5 [&_.ai-img-placeholder]:text-center [&_.ai-img-placeholder]:text-[11px] [&_.ai-img-placeholder]:text-indigo-500 [&_.ai-img-placeholder]:my-4 [&_.ai-img-placeholder]:flex [&_.ai-img-placeholder]:items-center [&_.ai-img-placeholder]:justify-center [&_.ai-img-placeholder]:gap-2"></article>
        </div>
      </div>
    </section>
  </div>
</template>

<script setup>
import { inject, reactive, ref, computed, watch, onMounted } from 'vue'
import {
  Settings, Sliders, ChevronDown, Wand2, Hash, Trash2, FileText, Clock, Layers, Copy, Save, Share2, Sparkles, Loader,
} from 'lucide-vue-next'
import { useAiWork } from '../../composables/useAiWork'
import { aiWorkApi } from '../../utils/api'

const emit = inject('aiSwitchMenu')
const { categories, styles, models, copyToClipboard, countWords } = useAiWork()

const seedHot = ref(null)
const articleRef = ref(null)
const savedId = ref(null)

const form = reactive({
  topic: '',
  category: '科技',
  audience: 'general',
  style: 'professional',
  model: 'gpt4o-mini',
  wordCount: 1500,
  temp: 0.7,
  mustInclude: '',
  seedContent: '',
  addImagePrompts: true,
  withEmoji: false,
})

const result = reactive({
  title: '',
  body: '',           // 纯文本（段落数组 join）
  paragraphs: [],     // [{type, text}]
  wordCount: 0,
  paragraphCount: 0,
  readingTime: 0,
  tags: '',
  plain: '',
})

const generating = ref(false)
const saving = ref(false)
const lastGenTime = ref(0)
const liveStageText = ref('')

function extractSeedFromStorage() {
  try {
    const a = localStorage.getItem('ai_seed_article')
    if (a) {
      const obj = JSON.parse(a)
      if (!form.topic && obj.title) form.topic = obj.title + ' 的结构解读'
      if (obj.content) form.seedContent = obj.content
      localStorage.removeItem('ai_seed_article')
    }
    const h = localStorage.getItem('ai_seed_hot')
    if (h) {
      const obj = JSON.parse(h)
      seedHot.value = obj
      if (!form.topic) form.topic = `主题：${obj.title}`
      if (obj.category) form.category = obj.category
      localStorage.removeItem('ai_seed_hot')
    }
  } catch {}
}

// ==== 渲染 HTML ====
const EMOJI_POOL = ['🧠', '💡', '⚡', '📌', '🎯', '🌱', '🔎', '📊', '🏁', '✅', '🔥', '🧭']
const renderedHtml = computed(() => {
  if (!result.paragraphs.length) return ''
  let imgCount = 0
  const nodes = []
  result.paragraphs.forEach((p, idx) => {
    if (p.type === 'h2' || p.type === 'h3') {
      const t = p.type
      const emoji = form.withEmoji ? (EMOJI_POOL[idx % EMOJI_POOL.length] + ' ') : ''
      nodes.push(`<${t}>${emoji}${esc(p.text)}</${t}>`)
    } else if (p.type === 'quote') {
      nodes.push(`<blockquote>${esc(p.text)}</blockquote>`)
    } else if (p.type === 'ul') {
      nodes.push(`<ul>${(p.items || []).map(x => `<li>${esc(x)}</li>`).join('')}</ul>`)
    } else {
      nodes.push(`<p>${esc(p.text)}</p>`)
    }
    // 每 2 段 (p) 插入图片提示词占位
    if (form.addImagePrompts && p.type === 'p' && ((idx + 1) % 3 === 0)) {
      imgCount++
      nodes.push(`<div class="ai-img-placeholder">
        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="shrink-0"><rect width="18" height="18" x="3" y="3" rx="2"/><circle cx="9" cy="9" r="2"/><path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21"/></svg>
        <span>配图建议 ${imgCount}：<code>与「${esc(form.topic.slice(0, 20))}」主题相关的实景/概念图，16:9，适合公众号</code></span>
      </div>`)
    }
  })
  return nodes.join('\n')
})

function esc(s) {
  return String(s || '').replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]))
}

function computeMeta() {
  const plain = result.paragraphs.map(p => {
    if (p.type === 'ul') return (p.items || []).join('；')
    return p.text
  }).join('\n')
  result.plain = plain
  result.body = plain
  result.wordCount = countWords(plain)
  result.paragraphCount = result.paragraphs.length
  result.readingTime = Math.max(1, Math.ceil(result.wordCount / 350))
  // 自动 tags 取关键词
  result.tags = (form.mustInclude || form.topic || '').split(/[,，、\s]+/).filter(Boolean).slice(0, 5).join(',')
}

// ==== 生成（离线结构化，无外部 LLM 依赖）====
const liveStages = [
  '拆解选题结构...',
  '扩展核心论点...',
  '补充案例与数据...',
  '润色段落衔接...',
  '生成总结与引导...',
]

async function doGenerate() {
  if (!form.topic.trim()) return
  generating.value = true
  savedId.value = null
  lastGenTime.value = 0
  const t0 = Date.now()
  // 如果没有标题，先拟一个
  if (!result.title) result.title = await makeTitle(form.topic)

  try {
    const paragraphs = []
    const topic = form.topic.trim()
    const musts = (form.mustInclude || '').split(/[,，、\s]+/).filter(Boolean)
    const seedSentences = splitIntoSentences(form.seedContent).slice(0, 12)

    // 开场白
    paragraphs.push({ type: 'p', text: buildOpening(topic, form.style) })

    // 核心标题组
    const h2Titles = pickH2Titles(topic, form.style, form.category)
    h2Titles.forEach((sec, si) => {
      paragraphs.push({ type: 'h2', text: sec.title })
      // 每 section 2~4 段
      const pCount = weightedRandom([3, 3, 4, 2])
      for (let i = 0; i < pCount; i++) {
        const seedRef = seedSentences.shift()
        paragraphs.push({
          type: 'p',
          text: buildBodyParagraph(topic, sec.title, sec.angle, si, i, pCount, musts, seedRef, form.audience, form.style)
        })
      }
      // 第 2 节插一个引言
      if (si === 1) {
        paragraphs.push({ type: 'quote', text: buildQuote(topic, form.style) })
      }
      // 第 1 节插个列表（建议类）
      if (si === 0) {
        paragraphs.push({
          type: 'ul',
          items: buildListItems(topic, sec.title, form.style, form.category)
        })
      }
    })

    // 结尾
    paragraphs.push({ type: 'h2', text: '总结与展望' })
    paragraphs.push({ type: 'p', text: buildClosing(topic, form.style, musts) })

    // 依据字数目标裁剪或扩写
    const finalPs = adjustWordCount(paragraphs, form.wordCount, topic, form.style)

    result.paragraphs = finalPs
    computeMeta()
    lastGenTime.value = ((Date.now() - t0) / 1000).toFixed(1)
  } finally {
    // 模拟阶段推进
    for (let i = 0; i < liveStages.length; i++) {
      liveStageText.value = liveStages[i]
      await sleep(150)
    }
    generating.value = false
    liveStageText.value = ''
  }
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)) }

function splitIntoSentences(s) {
  if (!s) return []
  return String(s).split(/(?<=[。！？!?\.])/).map(x => x.trim()).filter(Boolean)
}

function weightedRandom(arr) {
  return arr[Math.floor(Math.random() * arr.length)]
}

function pick(arr, n) {
  const a = [...arr]
  const out = []
  while (a.length && out.length < n) out.push(a.splice(Math.floor(Math.random() * a.length), 1)[0])
  return out
}

function pickH2Titles(topic, style, category) {
  const pool = {
    professional: [
      { title: '一、背景与行业现状', angle: '从行业发展脉络切入，交代宏观环境' },
      { title: '二、核心驱动因素分析', angle: '拆解推动趋势的内在变量' },
      { title: '三、典型案例与实践路径', angle: '用案例佐证，形成可落地参考' },
      { title: '四、风险、挑战与应对', angle: '提出风险提示，体现客观理性' },
    ],
    opinion: [
      { title: '我为什么看好这件事？', angle: '先亮观点，开门见山' },
      { title: '三个被忽视的关键事实', angle: '摆事实，制造信息差' },
      { title: '为什么绝大多数人做反了？', angle: '制造认知冲突' },
      { title: '普通个体该如何抓住机会？', angle: '给读者的行动建议' },
    ],
    storytelling: [
      { title: '故事要从一个小细节说起', angle: '场景化开头，拉近距离' },
      { title: '转折点：一切都在悄悄改变', angle: '制造冲突与转折' },
      { title: '三类人，三种完全不同的结局', angle: '分类叙事，引发代入' },
      { title: '最后，说说真正该在意的事', angle: '情感收束 + 观点升华' },
    ],
    marketing: [
      { title: '90% 的人都忽略了这个机会', angle: '制造稀缺与错过感' },
      { title: '3 个数据，看懂这波红利', angle: '数据增强信服力' },
      { title: '聪明人已经在这样做了', angle: '群体认同 + 从众心理' },
      { title: '现在上车还来得及吗？', angle: '降低决策成本，引导行动' },
    ],
    knowledge: [
      { title: '先把概念讲清楚', angle: '建立知识框架' },
      { title: '原理是怎样运作的？', angle: '拆解底层逻辑' },
      { title: '常见误区与澄清', angle: '避坑指南' },
      { title: '如何在实践中应用？', angle: '可执行建议' },
    ],
    shortvideo: [
      { title: '开头 3 秒：一句话抓住注意力', angle: '钩子设计' },
      { title: '中间 30 秒：冲突 + 反转', angle: '信息密度' },
      { title: '结尾 5 秒：引导点赞收藏', angle: '互动引导' },
    ],
  }
  const usePool = pool[style] || pool.professional
  // 把 category 关键词和 topic 关键词揉进标题（简单替换占位）
  const kw = extractKeyword(topic)
  return usePool.slice(0, style === 'shortvideo' ? 3 : 4).map(x => ({
    title: x.title.replace('这件事', kw || '这一趋势').replace('这个机会', kw || '这个机会'),
    angle: x.angle,
  }))
}

function extractKeyword(topic) {
  const m = String(topic).match(/[\u4e00-\u9fa5A-Za-z0-9]{2,10}/g)
  if (!m) return ''
  // 最长的非停用词
  const stop = ['为什么','怎么','如何','什么','今年','今日','最新','一个','什么是','我们','可以','这个','那个','还是','以及','同时','因为','所以','但是']
  const filt = m.filter(x => !stop.includes(x))
  return filt.sort((a,b)=>b.length-a.length)[0] || ''
}

// 句子库
const OPENINGS = {
  professional: [
    '近一段时间，{k} 成为业内讨论的热点。从数据上看，相关关注度在近三个月内明显走高，背后既有政策层面的引导，也有产业周期与资本预期的共振。',
    '站在当前的时点回顾 {k} 的演进脉络，我们会发现它并非突然出现的风口，而是多年技术积累与市场需求叠加后的必然结果。',
    '如果要用一个词来概括 {k} 所处的阶段，「从 0 到 1」或许仍不准确，更准确的表述应是：正在完成「从 1 到 N」的关键跨越。',
  ],
  opinion: [
    '关于 {k}，我想讲几句可能和大多数人不一样的看法。',
    '关于 {k}，网上的争论已经很多了，但大部分人其实没有说到点子上。',
  ],
  storytelling: [
    '上周和一位在这行做了十年的朋友吃饭，他聊到 {k} 时说了一句话，我至今印象深刻。',
    '先讲一个真实的小故事，它可能比任何数据都更能说明 {k} 正在发生什么。',
  ],
  marketing: [
    '如果你也在关注 {k}，接下来这 3 分钟请务必认真看完，信息量极大。',
    '关于 {k}，有一个 99% 的人都不知道的真相。',
  ],
  knowledge: [
    '在正式展开之前，我们先把「{k}」的核心概念界定清楚，避免后续讨论出现歧义。',
  ],
  shortvideo: [
    '看完这条你会明白，{k} 到底是怎么回事。',
  ],
}

function pickOpen(style) { return weightedRandom(OPENINGS[style] || OPENINGS.professional) }

function buildOpening(topic, style) {
  const kw = extractKeyword(topic) || '这一主题'
  let s = pickOpen(style).replace(/\{k\}/g, kw)
  if (style === 'professional') {
    s += '\n本文尝试从行业现状、核心驱动、典型案例与风险应对四个维度，系统梳理 {k} 背后的逻辑框架。'.replace(/\{k\}/g, kw)
  }
  return s
}

function buildBodyParagraph(topic, secTitle, angle, si, pi, pc, musts, seedRef, audience, style) {
  const kw = extractKeyword(topic) || '该主题'
  const templates = []
  if (style === 'professional') {
    templates.push('从行业研究的视角看，{a} 的背后至少存在三层逻辑：短期事件驱动、中期产业结构调整，以及长期趋势演进。'.replace('{a}', secTitle.replace(/^[一二三四五六七八九十]+、/, '')))
    templates.push('具体而言，{k} 在这一阶段呈现出两个典型特征：一是参与主体快速扩容，二是竞争格局从「跑马圈地」逐步走向「结构分化」。')
    templates.push('结合公开数据与一线访谈，我们注意到头部公司与腰部公司在资源分配策略上的差异正在拉大，这也解释了为什么同样处于 {k} 赛道，不同公司的业绩表现差异会如此显著。')
    templates.push('如果把时间拉长到 3–5 年来看，{a} 带来的变化将不仅仅是业务层面的，更会深刻影响组织形态、人才结构与上下游生态分工。'.replace('{a}', secTitle.replace(/^[一二三四五六七八九十]+、/, '')))
  } else if (style === 'opinion') {
    templates.push('很多人之所以对 {k} 产生误判，核心原因就在于只看到了表层现象，而忽略了底层逻辑。')
    templates.push('在我看来，真正重要的不是「有没有机会」，而是「你打算用什么方式参与」。方式错了，再好的赛道也赚不到钱。')
    templates.push('市场的分歧点，往往才是超额收益的来源。当所有人都在讨论 {k} 的时候，你更应该问自己一个问题：别人没有看到的，是什么？')
    templates.push('我一直强调一个原则：看大方向，赚小波动的钱。放在 {k} 这件事上，这个原则同样成立。')
  } else if (style === 'storytelling') {
    templates.push('我身边有位朋友就是最好的例子：三年前他第一次接触 {k} 时，完全没有经验，只是凭着一股劲儿扎了进去。')
    templates.push('真正的转折点发生在去年冬天。他跟我说，那天晚上他在办公室待了一整夜，终于把一个关键问题想通了。')
    templates.push('其实他当时也没想太多，只是照着最朴素的方式一步一步去做。谁也没想到，就是这种「笨办法」，反而让他走在了很多同行前面。')
    templates.push('从他身上我深刻体会到：很多时候，做成一件事的关键并不在于你懂多少，而在于你愿不愿意反复打磨一个看起来很普通的细节。')
  } else if (style === 'marketing') {
    templates.push('如果你现在还没关注 {k}，请一定把这一段认真读完——因为这可能是你距离机会最近的一次。')
    templates.push('为什么说 {k} 的红利才刚刚开始？核心原因有三个，我一条一条说。')
    templates.push('很多人之所以错过，不是因为没看到，而是看到了却没有行动。总想着等一等、再看看，结果一等就等没了。')
    templates.push('所以现在最关键的问题不是「要不要做」，而是「你打算什么时候开始做」。时间窗口，永远是最稀缺的资源。')
  } else if (style === 'knowledge') {
    templates.push('要理解 {k}，首先要建立一个正确的心智模型：它不是一个单一的概念，而是一整套相互关联的机制。')
    templates.push('从机制层面拆解，{a} 主要包含输入、处理、输出与反馈四个环节，其中最容易被忽视的其实是「反馈」环节。'.replace('{a}', secTitle.replace(/^[一二三四五六七八九十]+、/, '')))
    templates.push('很多新手会犯的典型错误，就是跳过了基础框架，直接去追逐各种表面技巧，结果越学越乱。')
    templates.push('正确的学习路径应当是：先建立整体框架，再逐个击破细节，最后通过实践把零散知识拼接成体系。')
  } else {
    templates.push('关于 {k} 的讨论持续升温，其中既有理性分析，也不乏情绪化表达。')
  }

  let base = weightedRandom(templates).replace(/\{k\}/g, kw)
  // 插入必须关键词（均匀分布）
  if (musts.length) {
    const word = musts[(si + pi) % musts.length]
    if (word && !base.includes(word)) {
      base += `尤其在「${word}」这一点上，表现得尤为突出。`
    }
  }
  // 如果有参考正文的句子，融合改写
  if (seedRef) {
    base += '参考原文中的观点可以进一步佐证：' + rephrase(seedRef)
  }
  // 根据受众调整语气
  if (audience === 'investor') base = base.replace(/机会/g, '确定性与风险收益比')
  if (audience === 'youth')    base = base.replace(/应当|必须/g, '建议可以')
  return base
}

function rephrase(s) {
  const str = String(s).trim()
  if (!str) return ''
  // 简易改写：在前后加句式
  const prefixes = ['从某种意义上说，', '值得关注的是，', '站在读者视角看，', '结合实际情况来看，']
  const suffix = ['这一点值得我们持续关注。', '这或许会成为后续讨论的关键节点。', '后续仍需结合更多数据验证。']
  return weightedRandom(prefixes) + str.replace(/^笔者认为[，,]?/g, '').replace(/^因此[，,]?/g, '') + weightedRandom(suffix)
}

function buildQuote(topic, style) {
  const kw = extractKeyword(topic) || '这一趋势'
  const q = [
    `关于「${kw}」，真正决定长期结果的，从来不是短期运气，而是认知与行动的闭环质量。`,
    `任何关于「${kw}」的讨论，如果只谈收益不谈风险，本质上都是不完整的。`,
    `在「${kw}」这件事上，慢就是快，少即是多。`,
  ]
  return weightedRandom(q)
}

function buildListItems(topic, secTitle, style, category) {
  const kw = extractKeyword(topic) || '这一主题'
  const base = [
    `第一，明确你参与 ${kw} 的核心目标：是短期跟进，还是中长期布局？`,
    `第二，盘点你手中的弹药：时间、资金、资源、人脉，各自能投入多少？`,
    `第三，设定清晰的退出或调整阈值——什么情况下继续，什么情况下止损？`,
    `第四，建立最小可验证单元（MVP），用 2–4 周做一次真实试验。`,
    `第五，形成复盘机制，至少每月回顾一次假设与结果的差异。`,
  ]
  return base.slice(0, 4 + (category === '财经' ? 1 : 0))
}

function buildClosing(topic, style, musts) {
  const kw = extractKeyword(topic) || '这一主题'
  let s = ''
  if (style === 'marketing') {
    s = `最后再总结一下：关于 ${kw}，机会确实存在，但窗口期不会永远敞开。现在最重要的，不是纠结「做不做」，而是「用最小成本先试一试」。`
    s += `\n如果你觉得这篇文章对你有启发，欢迎点赞、收藏、转发给身边同样在关注 ${kw} 的朋友。`
  } else if (style === 'professional') {
    s = `综合来看，${kw} 正在从一个「可选话题」变成「必须理解的基础框架」。它的意义不仅在于提供了新的业务增长点，更在于倒逼我们重新审视原有认知的边界。`
    s += `\n未来一段时期，真正能走得远的，一定是那些既能看懂大方向、又能把每个细节做扎实的人和组织。`
  } else if (style === 'opinion') {
    s = `说到底，关于 ${kw}，每个人都该有自己的判断——但这个判断，最好建立在你真正做过功课的基础上。`
    s += `\n毕竟，为自己的决策买单的，永远是你自己。`
  } else {
    s = `希望以上关于「${kw}」的梳理，能为你接下来的判断与行动提供一点有价值的参考。`
  }
  if (musts.length) {
    s += `\n最后再次提醒：${musts.map(m => `「${m}」`).join('、')} 等关键词值得你在实际落地中重点关注。`
  }
  return s
}

// 简易标题生成
const TITLE_PATTERNS = [
  '{kw}：一场正在悄悄发生的结构性变化',
  '深度解读｜{kw} 的底层逻辑与 2026 年机会窗口',
  '关于 {kw}，90% 的人都理解错了',
  '{kw} 背后，藏着被忽视的三个关键变量',
  '为什么我建议你现在就开始关注 {kw}？',
  '一文讲透：{kw} 的现状、趋势与应对策略',
  '从 {kw} 出发，看未来三年的行业分化路径',
]
function makeTitle(topic) {
  const kw = extractKeyword(topic) || topic.slice(0, 10)
  return weightedRandom(TITLE_PATTERNS).replace(/\{kw\}/g, kw)
}

// 根据字数目标扩写 / 裁剪
function adjustWordCount(paras, target, topic, style) {
  let out = [...paras]
  let wc = countWordsFromList(out)
  // 不足则每 2 段插入一段扩写
  let guard = 0
  while (wc < target && guard++ < 50) {
    const positions = []
    for (let i = 1; i < out.length - 1; i++) if (out[i].type === 'p') positions.push(i)
    if (!positions.length) break
    const idx = weightedRandom(positions)
    const sec = findRecentH2(out, idx)
    out.splice(idx + 1, 0, {
      type: 'p',
      text: buildBodyParagraph(topic, sec || '补充分析', '补充', 99, guard, 1, [], null, 'general', style)
    })
    wc = countWordsFromList(out)
  }
  // 过多则删尾部的段落
  guard = 0
  while (wc > target * 1.1 && out.length > 5 && guard++ < 50) {
    // 从后往前删，跳过标题和结尾
    for (let i = out.length - 2; i >= 0; i--) {
      if (out[i].type === 'p') { out.splice(i, 1); break }
    }
    wc = countWordsFromList(out)
  }
  return out
}
function findRecentH2(list, idx) {
  for (let i = idx; i >= 0; i--) if (list[i].type === 'h2' || list[i].type === 'h3') return list[i].text
  return null
}
function countWordsFromList(list) {
  return countWords(list.map(p => Array.isArray(p.items) ? p.items.join('；') : (p.text || '')).join('\n'))
}

// ==== 辅助动作 ====
async function regenerateTitleOnly() {
  if (!form.topic.trim()) return
  const t = makeTitle(form.topic)
  result.title = t
  await copyToClipboard(t)
  toast('新标题已生成并复制')
}

function clearAll() {
  form.topic = ''
  form.mustInclude = ''
  form.seedContent = ''
  seedHot.value = null
  result.title = ''
  result.paragraphs = []
  result.body = ''
  result.wordCount = 0
  result.paragraphCount = 0
  result.readingTime = 0
  result.tags = ''
  savedId.value = null
}

async function copyResult(which) {
  let text
  if (which === 'title') text = result.title
  else {
    // 复制 HTML 时使用纯正文（保留换行）
    const arr = result.paragraphs.map(p => {
      if (p.type === 'h2') return `\n## ${p.text}\n`
      if (p.type === 'h3') return `\n### ${p.text}\n`
      if (p.type === 'quote') return `> ${p.text}`
      if (p.type === 'ul') return (p.items || []).map(x => `- ${x}`).join('\n')
      return p.text
    })
    text = `${result.title}\n\n` + arr.join('\n\n')
  }
  const ok = await copyToClipboard(text)
  toast(ok ? (which === 'title' ? '标题已复制' : '正文已复制') : '复制失败')
}

function onTitleBlur() {
  // 标题编辑完成，无需保存，实时同步到 reactive
}

async function saveToLibrary() {
  saving.value = true
  try {
    const payload = {
      title: result.title,
      category: form.category,
      style: form.style,
      model: form.model,
      word_count: result.wordCount,
      tags: result.tags,
      content: JSON.stringify(result.paragraphs),
      plain_text: result.plain,
      status: 'draft',
    }
    const r = savedId.value
      ? await aiWorkApi.updateArticle(savedId.value, payload)
      : await aiWorkApi.createArticle(payload)
    if (r?.id || r?.data?.id) {
      savedId.value = r?.id || r?.data?.id
      toast('已保存到文章库')
    } else {
      toast(r?.error || '保存失败')
    }
  } catch (e) {
    toast('保存失败：' + (e.message || ''))
  } finally {
    saving.value = false
  }
}

function shareAsLink() {
  // 跳到链接生成，预填文案
  try {
    localStorage.setItem('ai_share_article', JSON.stringify({
      title: result.title,
      summary: (result.plain || '').slice(0, 120),
    }))
  } catch {}
  emit && emit('link')
}

function toast(msg) {
  const el = document.createElement('div')
  el.textContent = msg
  el.className = 'fixed z-[999] left-1/2 bottom-10 -translate-x-1/2 px-4 py-2 rounded-lg bg-slate-900/90 text-white text-xs shadow-lg transition-opacity'
  document.body.appendChild(el)
  setTimeout(() => { el.style.opacity = '0' }, 1200)
  setTimeout(() => document.body.removeChild(el), 1700)
}

onMounted(() => { extractSeedFromStorage() })
</script>

<style scoped>
input[type=range]::-webkit-slider-thumb { -webkit-appearance: none; }
.prose-slate code { background: #f1f5f9; border-radius: 4px; padding: 0 4px; font-size: 11px; }
</style>
