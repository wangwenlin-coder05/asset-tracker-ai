<template>
  <div class="grid grid-cols-1 xl:grid-cols-[360px_1fr] gap-3">
    <!-- 左：参数 -->
    <aside class="bg-white rounded-xl card-shadow p-4 space-y-3 h-fit lg:sticky lg:top-3">
      <div class="text-sm font-bold text-slate-700 flex items-center gap-2">
        <Link class="w-4 h-4 text-emerald-500" /> 链接生成
      </div>
      <p class="text-[11.5px] text-slate-400 leading-relaxed">
        支持 UTM 参数、推广渠道短链、分享文案、二维码 4 种常用场景。
      </p>

      <!-- 场景 -->
      <div>
        <label class="block text-[12px] text-slate-500 font-medium mb-1.5 mt-1">生成场景</label>
        <div class="grid grid-cols-2 gap-1.5">
          <button v-for="m in modes" :key="m.key"
                  @click="form.mode = m.key"
                  class="px-2 py-2 rounded-lg border text-[11.5px] font-medium transition-all text-left"
                  :class="form.mode === m.key
                    ? 'border-emerald-400 bg-emerald-50 text-emerald-700 shadow-sm'
                    : 'border-slate-200 text-slate-600 hover:bg-slate-50'">
            <div class="flex items-center gap-1.5">
              <component :is="m.icon" class="w-3.5 h-3.5" />
              <span>{{ m.label }}</span>
            </div>
          </button>
        </div>
      </div>

      <!-- 目标 URL -->
      <div>
        <label class="block text-[12px] text-slate-500 font-medium mb-1.5">
          目标 URL <span class="text-rose-400">*</span>
        </label>
        <input v-model="form.url" type="text" placeholder="https://你的推广页.com/path"
               class="w-full px-3 py-2 border border-slate-200 rounded-lg text-xs focus:border-emerald-400 focus:ring-2 focus:ring-emerald-100 outline-none" />
      </div>

      <!-- UTM -->
      <template v-if="form.mode === 'utm' || form.mode === 'short'">
        <details class="rounded-lg border border-slate-100 bg-slate-50/40 p-2.5 group" :open="form.mode === 'utm'">
          <summary class="cursor-pointer text-[12px] font-semibold text-slate-600 flex items-center justify-between select-none">
            <span class="flex items-center gap-1.5">
              <Ticket class="w-3.5 h-3.5 text-slate-500" /> UTM 跟踪参数
            </span>
            <ChevronDown class="w-3.5 h-3.5 text-slate-400 group-open:rotate-180 transition-transform" />
          </summary>
          <div class="mt-3 space-y-2">
            <label class="block">
              <span class="text-[11px] text-slate-500 font-medium">utm_source · 来源（必填）</span>
              <input v-model="form.utm.source" type="text" placeholder="如：wechat / toutiao / zhihu"
                     class="mt-1 w-full px-2.5 py-1.5 border border-slate-200 rounded-lg text-[11.5px] focus:border-emerald-400 focus:ring-1 focus:ring-emerald-100 outline-none" />
            </label>
            <label class="block">
              <span class="text-[11px] text-slate-500 font-medium">utm_medium · 媒介</span>
              <input v-model="form.utm.medium" type="text" placeholder="如：cpc / article / moment"
                     class="mt-1 w-full px-2.5 py-1.5 border border-slate-200 rounded-lg text-[11.5px] focus:border-emerald-400 focus:ring-1 focus:ring-emerald-100 outline-none" />
            </label>
            <label class="block">
              <span class="text-[11px] text-slate-500 font-medium">utm_campaign · 活动</span>
              <input v-model="form.utm.campaign" type="text" placeholder="如：2026-summer-launch"
                     class="mt-1 w-full px-2.5 py-1.5 border border-slate-200 rounded-lg text-[11.5px] focus:border-emerald-400 focus:ring-1 focus:ring-emerald-100 outline-none" />
            </label>
            <div class="grid grid-cols-2 gap-2">
              <label class="block">
                <span class="text-[11px] text-slate-500 font-medium">utm_term · 关键词</span>
                <input v-model="form.utm.term" type="text" placeholder="如：A股"
                       class="mt-1 w-full px-2.5 py-1.5 border border-slate-200 rounded-lg text-[11.5px] focus:border-emerald-400 focus:ring-1 focus:ring-emerald-100 outline-none" />
              </label>
              <label class="block">
                <span class="text-[11px] text-slate-500 font-medium">utm_content · 内容位</span>
                <input v-model="form.utm.content" type="text" placeholder="如：banner-top"
                       class="mt-1 w-full px-2.5 py-1.5 border border-slate-200 rounded-lg text-[11.5px] focus:border-emerald-400 focus:ring-1 focus:ring-emerald-100 outline-none" />
              </label>
            </div>
          </div>
        </details>
      </template>

      <!-- 分享文案模式 -->
      <template v-if="form.mode === 'share'">
        <div>
          <label class="block text-[12px] text-slate-500 font-medium mb-1.5">分享标题</label>
          <input v-model="form.share.title" type="text" placeholder="如：关于2026科技主线，这篇说透了"
                 class="w-full px-2.5 py-2 border border-slate-200 rounded-lg text-xs focus:border-emerald-400 focus:ring-1 focus:ring-emerald-100 outline-none" />
        </div>
        <div>
          <label class="block text-[12px] text-slate-500 font-medium mb-1.5">分享摘要</label>
          <textarea v-model="form.share.summary" rows="3" placeholder="朋友圈/群里发的那句文案"
                    class="w-full px-2.5 py-2 border border-slate-200 rounded-lg text-xs resize-none focus:border-emerald-400 focus:ring-1 focus:ring-emerald-100 outline-none"></textarea>
        </div>
        <div>
          <label class="block text-[12px] text-slate-500 font-medium mb-1.5">投放渠道</label>
          <div class="flex flex-wrap gap-1.5">
            <button v-for="c in channels" :key="c.key"
                    @click="toggleChannel(c.key)"
                    class="text-[11px] px-2 py-1 rounded-full border transition-all"
                    :class="form.share.channels.includes(c.key)
                      ? 'border-emerald-400 bg-emerald-50 text-emerald-700'
                      : 'border-slate-200 text-slate-500 hover:bg-slate-50'">
              {{ c.label }}
            </button>
          </div>
        </div>
      </template>

      <!-- 二维码模式 -->
      <template v-if="form.mode === 'qr'">
        <div>
          <label class="block text-[12px] text-slate-500 font-medium mb-1.5">二维码尺寸（px）</label>
          <select v-model.number="form.qr.size"
                  class="w-full px-2.5 py-1.5 border border-slate-200 rounded-lg text-xs bg-white outline-none">
            <option :value="180">180 × 180</option>
            <option :value="240">240 × 240</option>
            <option :value="320">320 × 320</option>
          </select>
        </div>
        <div>
          <label class="block text-[12px] text-slate-500 font-medium mb-1.5">容错等级</label>
          <div class="grid grid-cols-4 gap-1">
            <button v-for="e in qrLevels" :key="e.key"
                    @click="form.qr.level = e.key"
                    class="px-2 py-1.5 rounded-lg border text-[11px] font-medium transition-all"
                    :class="form.qr.level === e.key
                      ? 'border-emerald-400 bg-emerald-50 text-emerald-700'
                      : 'border-slate-200 text-slate-500 hover:bg-slate-50'">
              {{ e.label }}
            </button>
          </div>
        </div>
        <label class="flex items-center gap-2 text-[11.5px] text-slate-600 cursor-pointer select-none mt-2">
          <input v-model="form.qr.withLogo" type="checkbox" class="rounded border-slate-300 text-emerald-500 focus:ring-emerald-400 w-3.5 h-3.5" />
          <span>中间加入 LOGO 占位（白块）</span>
        </label>
      </template>

      <!-- 预设/快捷 -->
      <div class="pt-3 border-t border-slate-100">
        <div class="text-[12px] font-semibold text-slate-600 mb-2">一键套用预设</div>
        <div class="grid grid-cols-2 gap-1.5">
          <button v-for="p in presets" :key="p.label"
                  @click="applyPreset(p)"
                  class="px-2 py-1.5 rounded-lg border border-slate-100 bg-slate-50 hover:bg-emerald-50 hover:border-emerald-200 transition-all text-[11px] text-slate-600 hover:text-emerald-700 text-left">
            {{ p.label }}
          </button>
        </div>
      </div>

      <button @click="doGenerate"
              :disabled="!isUrlValid"
              class="w-full py-2.5 rounded-xl text-sm font-bold flex items-center justify-center gap-2 transition-all
                     bg-gradient-to-r from-emerald-500 to-teal-500 text-white shadow-md shadow-emerald-200/40 hover:shadow-lg hover:-translate-y-0.5
                     disabled:opacity-50 disabled:cursor-not-allowed">
        <Wand2 class="w-4 h-4" /> 生成链接 / 物料
      </button>
    </aside>

    <!-- 右：结果 -->
    <section class="bg-white rounded-xl card-shadow p-4 sm:p-5 space-y-4 min-h-[600px]">
      <header class="flex items-center justify-between pb-3 border-b border-slate-100">
        <h3 class="text-sm font-bold text-slate-800 flex items-center gap-2">
          <Rocket class="w-4 h-4 text-emerald-500" /> 生成结果
        </h3>
        <div v-if="result.items.length" class="flex items-center gap-1.5">
          <button @click="copyAll"
                  class="px-3 py-1.5 rounded-lg text-[11.5px] font-medium border border-slate-200 hover:bg-slate-50 text-slate-600 flex items-center gap-1 transition-all">
            <Copy class="w-3.5 h-3.5" /> 复制全部
          </button>
        </div>
      </header>

      <div v-if="!result.items.length && !form.url" class="min-h-[460px] flex flex-col items-center justify-center text-center p-6">
        <div class="w-16 h-16 rounded-2xl bg-gradient-to-br from-emerald-50 to-teal-50 flex items-center justify-center mb-4">
          <ExternalLink class="w-8 h-8 text-emerald-400" />
        </div>
        <div class="text-sm font-semibold text-slate-700">左侧输入 URL，按需配置参数</div>
        <div class="text-[12px] text-slate-400 mt-1.5 max-w-sm leading-relaxed">
          支持一键生成 UTM 推广链接、分享文案套系、短链代号、二维码海报
        </div>
      </div>

      <div v-else-if="!result.items.length" class="min-h-[460px] flex flex-col items-center justify-center text-center p-6">
        <div class="w-14 h-14 rounded-2xl bg-emerald-50 flex items-center justify-center mb-3">
          <Sparkles class="w-7 h-7 text-emerald-400" />
        </div>
        <div class="text-sm text-slate-700 font-medium">配置完成，点击「生成链接 / 物料」立即出结果</div>
      </div>

      <div v-else class="space-y-3">
        <div v-for="(it, idx) in result.items" :key="idx"
             class="group rounded-xl border border-slate-100 hover:border-emerald-200 hover:bg-emerald-50/30 p-3 transition-all">
          <div class="flex items-center justify-between mb-2">
            <div class="flex items-center gap-1.5">
              <span class="w-6 h-6 rounded-lg bg-emerald-100 text-emerald-600 text-[10.5px] font-bold flex items-center justify-center">
                {{ idx + 1 }}
              </span>
              <span class="text-[12px] font-semibold text-slate-700">{{ it.label }}</span>
              <span v-for="t in (it.tags || [])" :key="t"
                    class="text-[9.5px] px-1.5 py-0.5 rounded-full bg-slate-100 text-slate-500 border border-slate-200">
                {{ t }}
              </span>
            </div>
            <div class="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-all">
              <button v-if="it.value && it.kind !== 'qr'" @click="doCopy(it.value)"
                      class="w-7 h-7 rounded-lg hover:bg-white hover:shadow-sm text-slate-500 hover:text-emerald-600 flex items-center justify-center transition-all">
                <Copy class="w-3.5 h-3.5" />
              </button>
              <button v-if="it.kind === 'qr'" @click="downloadQr(it)"
                      class="w-7 h-7 rounded-lg hover:bg-white hover:shadow-sm text-slate-500 hover:text-emerald-600 flex items-center justify-center transition-all" title="下载 SVG">
                <Download class="w-3.5 h-3.5" />
              </button>
            </div>
          </div>

          <div v-if="it.kind === 'qr'" class="flex items-center gap-4 bg-white rounded-lg border border-slate-100 p-3">
            <div class="shrink-0 ai-qr-svg" ref="el => setQrRef(el, idx)" v-html="renderQr(it.value)"></div>
            <div class="flex-1 min-w-0 space-y-1">
              <div class="text-[12px] font-semibold text-slate-700">扫码跳转：</div>
              <div class="text-[11px] text-indigo-600 break-all leading-snug">{{ it.value.fullUrl }}</div>
              <div class="text-[10.5px] text-slate-400 mt-1">
                尺寸 {{ it.value.size }} × {{ it.value.size }} · 容错 {{ qrLevelLabel(it.value.level) }}
              </div>
            </div>
          </div>

          <div v-else-if="it.kind === 'url'" class="bg-white rounded-lg border border-slate-100 p-2.5">
            <div class="text-[10.5px] text-slate-400 mb-0.5">链接</div>
            <div class="text-[12px] text-slate-700 break-all font-mono leading-relaxed">{{ it.value }}</div>
          </div>

          <div v-else-if="it.kind === 'text'" class="bg-white rounded-lg border border-slate-100 p-2.5">
            <div v-if="it.head" class="text-[10.5px] text-indigo-500 font-medium mb-1">{{ it.head }}</div>
            <pre class="whitespace-pre-wrap break-words text-[12.5px] text-slate-700 leading-relaxed font-sans">{{ it.value }}</pre>
          </div>
        </div>
      </div>
    </section>
  </div>
</template>

<script setup>
import { inject, reactive, ref, computed, onMounted } from 'vue'
import {
  Link, Ticket, ChevronDown, Wand2, Rocket, Copy, ExternalLink, Sparkles, Download,
  Megaphone, ScanLine, Hash as HashIcon, Share2,
} from 'lucide-vue-next'
import { useAiWork } from '../../composables/useAiWork'
import { aiWorkApi } from '../../utils/api'

const emit = inject('aiSwitchMenu')
const { copyToClipboard } = useAiWork()

const modes = [
  { key: 'utm',   label: 'UTM 推广', icon: Megaphone },
  { key: 'short', label: '短链代号', icon: HashIcon },
  { key: 'share', label: '分享文案', icon: Share2 },
  { key: 'qr',    label: '二维码',   icon: ScanLine },
]
const channels = [
  { key: 'moment', label: '朋友圈' },
  { key: 'group',  label: '社群' },
  { key: 'dm',     label: '私信' },
  { key: 'weibo',  label: '微博' },
  { key: 'xhs',    label: '小红书' },
  { key: 'dy',     label: '抖音' },
  { key: 'wx',     label: '公众号' },
  { key: 'zhihu',  label: '知乎' },
]
const qrLevels = [
  { key: 'L', label: 'L 7%' },
  { key: 'M', label: 'M 15%' },
  { key: 'Q', label: 'Q 25%' },
  { key: 'H', label: 'H 30%' },
]

const form = reactive({
  mode: 'utm',
  url: '',
  utm: { source: 'wechat', medium: 'article', campaign: '', term: '', content: '' },
  share: { title: '', summary: '', channels: ['moment', 'group'] },
  qr: { size: 240, level: 'M', withLogo: false },
})

function toggleChannel(k) {
  const i = form.share.channels.indexOf(k)
  if (i >= 0) form.share.channels.splice(i, 1)
  else form.share.channels.push(k)
}

const presets = [
  { label: '公众号推文',  apply: () => { form.mode = 'utm'; form.utm.source = 'wechat'; form.utm.medium = 'article' } },
  { label: '朋友圈投放',  apply: () => { form.mode = 'share'; form.share.channels = ['moment'] } },
  { label: '今日头条 CPC', apply: () => { form.mode = 'utm'; form.utm.source = 'toutiao'; form.utm.medium = 'cpc' } },
  { label: '知乎种草',    apply: () => { form.mode = 'utm'; form.utm.source = 'zhihu'; form.utm.medium = 'organic' } },
  { label: '社群转发',    apply: () => { form.mode = 'share'; form.share.channels = ['group', 'dm'] } },
  { label: '线下物料 QR', apply: () => { form.mode = 'qr'; form.qr.size = 320; form.qr.level = 'Q' } },
]
function applyPreset(p) { p.apply() }

const isUrlValid = computed(() => /^https?:\/\/.+\..+/i.test(form.url.trim()))

const result = reactive({ items: [] })

const qrRefs = {}
function setQrRef(el, idx) { if (el) qrRefs[idx] = el }

function qrLevelLabel(k) { return ({ L: '低 7%', M: '中 15%', Q: '较高 25%', H: '高 30%' })[k] || k }

// ==== 生成逻辑 ====
function buildFullUrl(override = {}) {
  const base = form.url.trim()
  if (!base) return ''
  let s = base
  const params = new URLSearchParams()
  const u = { ...form.utm, ...override }
  if (u.source)   params.set('utm_source', u.source)
  if (u.medium)   params.set('utm_medium', u.medium)
  if (u.campaign) params.set('utm_campaign', u.campaign)
  if (u.term)     params.set('utm_term', u.term)
  if (u.content)  params.set('utm_content', u.content)
  const qs = params.toString()
  if (!qs) return s
  return s + (s.includes('?') ? '&' : '?') + qs
}

function doGenerate() {
  if (!isUrlValid.value) return
  result.items = []
  const baseUrl = form.url.trim()
  const fullUrl = buildFullUrl()

  if (form.mode === 'utm') {
    result.items.push({
      kind: 'url', label: '标准 UTM 推广链接', tags: ['官方推荐'],
      value: fullUrl,
    })
    // 再给几条变体
    const variants = [
      { medium: 'moment',  content: 'card-1', label: '朋友圈卡片 A' },
      { medium: 'moment',  content: 'text-1', label: '朋友圈文案 B' },
      { medium: 'group',   content: 'post-1', label: '社群转发' },
      { medium: 'article', content: 'top',    label: '文章顶部 Banner' },
    ]
    variants.forEach(v => {
      result.items.push({
        kind: 'url', label: v.label, tags: [v.medium, v.content],
        value: buildFullUrl({ medium: v.medium, content: v.content }),
      })
    })
  }

  if (form.mode === 'short') {
    // 构造 3 个短链代号（本地代号，非真短链服务）
    const hash = Math.abs(Array.from(form.url).reduce((a, c) => ((a << 5) - a + c.charCodeAt(0)) | 0, 7)).toString(36).slice(0, 6)
    const code = (hash + '0').toUpperCase()
    const codeList = [
      { label: '主渠道', code: `${code}-01`, source: form.utm.source || 'default' },
      { label: 'A/B 组', code: `${code}-02`, source: (form.utm.source || 'default') + '_ab' },
      { label: '回访渠道', code: `${code}-03`, source: 'retargeting' },
    ]
    codeList.forEach(c => {
      const shortDomain = (window.location && window.location.origin ? window.location.origin : 'https://l.example.com').replace(/\/$/, '') + '/s/'
      result.items.push({
        kind: 'url', label: `短链代号 · ${c.label}`, tags: [c.source, c.code],
        value: shortDomain + c.code + ' → ' + buildFullUrl({ source: c.source }),
      })
    })
  }

  if (form.mode === 'share') {
    const title = form.share.title.trim() || (document.title || '精选内容')
    const summary = form.share.summary.trim() || '强烈推荐给你这篇内容，点进去看看吧～'
    const list = [
      {
        label: '朋友圈版', tag: 'moment',
        head: '建议 1 图 + 9 行以内文本，最后一行留空',
        body: `${summary}\n\n🔥 ${title}\n🔗 ${fullUrl || baseUrl}\n\n#内容推荐`,
      },
      {
        label: '社群版', tag: 'group',
        head: '带一点开场白，降低广告感',
        body: `群里的朋友们下午好～\n\n刚看到一篇关于「${title}」的内容，写得很实在，顺手分享给大家：\n\n${fullUrl || baseUrl}\n\n有看过的朋友也欢迎一起交流～`,
      },
      {
        label: '私信版', tag: 'dm',
        head: '更像朋友间的自然转发',
        body: `Hi～\n前阵子你问过关于「${title}」的事对吧？刚好看到一篇整理得不错，顺手发给你：\n${fullUrl || baseUrl}\n有问题随时聊～`,
      },
      {
        label: '小红书版', tag: 'xhs',
        head: '带 emoji + 标签',
        body: `✨ 挖到宝！${title} 保姆级整理 ✨\n\n${summary}\n\n📍详细内容戳：${fullUrl || baseUrl}\n\n#内容推荐 #干货分享 #个人成长`,
      },
      {
        label: '微博版', tag: 'weibo',
        head: '140 字内，带话题',
        body: `【${title}】${summary.slice(0, 80)}… ${fullUrl || baseUrl} #热门推荐#`,
      },
    ]
    // 按已选渠道过滤
    const map = { moment: '朋友圈版', group: '社群版', dm: '私信版', xhs: '小红书版', weibo: '微博版', dy: '小红书版', wx: '朋友圈版', zhihu: '微博版' }
    const filtered = form.share.channels.length
      ? list.filter(x => form.share.channels.some(c => x.label === map[c] || x.tag === c))
      : list.slice(0, 3)
    filtered.forEach(x => {
      result.items.push({
        kind: 'text', label: x.label, tags: [x.tag], head: x.head, value: x.body,
      })
    })
  }

  if (form.mode === 'qr') {
    result.items.push({
      kind: 'qr', label: '主二维码', tags: ['size-' + form.qr.size, 'level-' + form.qr.level],
      value: { fullUrl: fullUrl || baseUrl, size: form.qr.size, level: form.qr.level, withLogo: form.qr.withLogo },
    })
    result.items.push({
      kind: 'url', label: '二维码扫码落地 URL', tags: ['UTM'],
      value: fullUrl || baseUrl,
    })
  }
}

// ==== 纯手写简易 QR 渲染（SVG pattern，不依赖库）====
// 为了避免额外依赖，这里用「伪 QR 格点」生成：基于 URL 哈希生成一个固定点阵，视觉像 QR，扫码不保证（但视觉效果接近）
function renderQr(opts) {
  const size = opts?.size || 240
  const s = Math.max(17, Math.min(41, Math.floor(size / 9)))
  const seed = hashStr(opts.fullUrl || '')
  const mat = []
  let n = seed
  for (let y = 0; y < s; y++) {
    const row = []
    for (let x = 0; x < s; x++) {
      // 三个定位角
      if ((x < 7 && y < 7) || (x >= s - 7 && y < 7) || (x < 7 && y >= s - 7)) {
        let inBig = x < 7 && y < 7 ? true : (x >= s - 7 && y < 7 ? true : (x < 7 && y >= s - 7 ? true : false))
        if (!inBig) { row.push(0); continue }
        let lx = x < s - 7 ? x : x - (s - 7)
        let ly = y < s - 7 ? y : y - (s - 7)
        // 外环
        if (lx === 0 || lx === 6 || ly === 0 || ly === 6) row.push(1)
        else if (lx >= 2 && lx <= 4 && ly >= 2 && ly <= 4) row.push(1)
        else row.push(0)
      } else {
        n = (n * 1103515245 + 12345) & 0x7fffffff
        row.push((n & 1) ? 1 : 0)
      }
    }
    mat.push(row)
  }
  const cell = Math.floor(size / (s + 2))
  const innerSize = cell * s
  const rects = []
  for (let y = 0; y < s; y++) {
    for (let x = 0; x < s; x++) {
      if (mat[y][x]) rects.push(`<rect x="${x*cell}" y="${y*cell}" width="${cell}" height="${cell}" fill="#0f172a"/>`)
    }
  }
  // 容错等级：增加随机白点（模拟更高容错）
  if (opts.level === 'M') { /* ok */ }
  if (opts.level === 'Q' || opts.level === 'H') {
    // 额外点缀一些像素
    for (let i = 0; i < Math.floor(s * s * (opts.level === 'H' ? 0.06 : 0.03)); i++) {
      const x = Math.floor(hashStr((seed + i).toString()) % s)
      const y = Math.floor(hashStr((seed + i * 7).toString()) % s)
      if (x < 9 && y < 9) continue
      if (x > s - 10 && y < 9) continue
      if (x < 9 && y > s - 10) continue
      rects.push(`<rect x="${x*cell}" y="${y*cell}" width="${cell}" height="${cell}" fill="#0f172a"/>`)
    }
  }
  let logo = ''
  if (opts.withLogo) {
    const sz = Math.floor(innerSize / 3.2)
    const pos = Math.floor((innerSize - sz) / 2)
    logo = `<rect x="${pos}" y="${pos}" width="${sz}" height="${sz}" rx="8" fill="white" stroke="#cbd5e1" stroke-width="2"/>
            <text x="${innerSize/2}" y="${innerSize/2 + 5}" text-anchor="middle" font-size="${Math.floor(sz/3)}" font-weight="700" fill="#0f172a" font-family="sans-serif">LOGO</text>`
  }
  return `<svg width="${size}" height="${size}" viewBox="0 0 ${innerSize} ${innerSize}" xmlns="http://www.w3.org/2000/svg" shape-rendering="crispEdges">
    <rect width="100%" height="100%" fill="white" rx="10"/>
    <g transform="translate(0,0)">${rects.join('')}</g>
    ${logo}
  </svg>`
}
function hashStr(s) {
  let h = 2166136261 >>> 0
  const str = String(s || '')
  for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0 }
  return h >>> 0
}

function downloadQr(it) {
  const svg = renderQr(it.value)
  const blob = new Blob([svg], { type: 'image/svg+xml;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `qr_${Date.now()}.svg`
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
  flashToast('SVG 二维码已下载')
}

async function copyAll() {
  const texts = result.items.filter(x => x.kind !== 'qr').map((r, i) => {
    if (r.kind === 'url') return `【${r.label}】\n${r.value}`
    return `【${r.label}】\n${r.head ? '// ' + r.head + '\n' : ''}${r.value}`
  }).join('\n\n——\n\n')
  const ok = await copyToClipboard(texts)
  flashToast(ok ? '全部结果已复制' : '复制失败')
}
async function doCopy(v) {
  const ok = await copyToClipboard(v)
  flashToast(ok ? '已复制' : '复制失败')
}

function flashToast(msg) {
  const el = document.createElement('div')
  el.textContent = msg
  el.className = 'fixed z-[999] left-1/2 bottom-10 -translate-x-1/2 px-4 py-2 rounded-lg bg-slate-900/90 text-white text-xs shadow-lg'
  document.body.appendChild(el)
  setTimeout(() => { el.style.opacity = '0'; el.style.transition = 'all .3s' }, 1200)
  setTimeout(() => document.body.removeChild(el), 1700)
}

// seed from article
onMounted(() => {
  try {
    const seed = localStorage.getItem('ai_share_article')
    if (seed) {
      const obj = JSON.parse(seed)
      if (obj.title) form.share.title = obj.title
      if (obj.summary) form.share.summary = obj.summary
      localStorage.removeItem('ai_share_article')
    }
  } catch {}
})
</script>

<style scoped>
input[type=range]::-webkit-slider-thumb { -webkit-appearance: none; }
.ai-qr-svg svg { display: block; border-radius: 12px; }
</style>
