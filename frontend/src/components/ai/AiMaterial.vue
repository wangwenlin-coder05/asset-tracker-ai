<template>
  <div class="grid grid-cols-1 xl:grid-cols-[360px_1fr] gap-3">
    <!-- 左：参数 -->
    <aside class="bg-white rounded-xl card-shadow p-4 space-y-3 h-fit lg:sticky lg:top-3">
      <div class="text-sm font-bold text-slate-700 flex items-center gap-2">
        <Layers class="w-4 h-4 text-purple-500" /> 素材合成
      </div>
      <p class="text-[11.5px] text-slate-400 leading-relaxed">
        选择模板 → 填写文案 / 选图 → 实时预览 → 导出 PNG。
      </p>

      <!-- 画布尺寸 -->
      <div>
        <label class="block text-[12px] text-slate-500 font-medium mb-1.5">输出尺寸</label>
        <div class="grid grid-cols-3 gap-1.5">
          <button v-for="sz in sizes" :key="sz.key"
                  @click="form.size = sz.key"
                  class="px-1.5 py-2 rounded-lg border text-[11px] font-medium transition-all"
                  :class="form.size === sz.key
                    ? 'border-purple-400 bg-purple-50 text-purple-700 shadow-sm'
                    : 'border-slate-200 text-slate-600 hover:bg-slate-50'">
            <div class="font-bold">{{ sz.w }}×{{ sz.h }}</div>
            <div class="text-[9.5px] opacity-75 font-normal">{{ sz.label }}</div>
          </button>
        </div>
      </div>

      <!-- 模板 -->
      <div>
        <label class="block text-[12px] text-slate-500 font-medium mb-1.5">模板风格</label>
        <div class="grid grid-cols-2 gap-1.5">
          <button v-for="t in templates" :key="t.key"
                  @click="form.tpl = t.key"
                  class="relative p-2 rounded-xl border transition-all overflow-hidden"
                  :class="form.tpl === t.key
                    ? 'border-purple-400 ring-2 ring-purple-100 bg-white shadow-sm'
                    : 'border-slate-200 hover:bg-slate-50'">
            <div class="h-12 rounded-lg mb-1.5 overflow-hidden" :class="t.previewBg">
              <div v-html="t.preview"></div>
            </div>
            <div class="text-[11px] font-semibold text-slate-700 text-left">{{ t.label }}</div>
            <Check v-if="form.tpl === t.key"
                   class="absolute top-1.5 right-1.5 w-4 h-4 rounded-full bg-purple-500 text-white p-0.5" />
          </button>
        </div>
      </div>

      <!-- 文案 -->
      <div>
        <label class="block text-[12px] text-slate-500 font-medium mb-1.5">主标题</label>
        <input v-model="form.title" type="text" placeholder="例如：2026 A 股主线攻略"
               class="w-full px-3 py-2 border border-slate-200 rounded-lg text-xs focus:border-purple-400 focus:ring-2 focus:ring-purple-100 outline-none" />
      </div>
      <div>
        <label class="block text-[12px] text-slate-500 font-medium mb-1.5">副标题 / 一句话亮点</label>
        <input v-model="form.subtitle" type="text" placeholder="从 0 到 1 的完整实操指南"
               class="w-full px-3 py-2 border border-slate-200 rounded-lg text-xs focus:border-purple-400 focus:ring-2 focus:ring-purple-100 outline-none" />
      </div>
      <div>
        <label class="block text-[12px] text-slate-500 font-medium mb-1.5">正文要点（1 条 1 行）</label>
        <textarea v-model="form.pointsText" rows="4"
          placeholder="1. 开头 3 秒抓注意力的 5 种方式&#10;2. 中间 30 秒：冲突 + 反转"
          class="w-full px-3 py-2 border border-slate-200 rounded-lg text-xs resize-none focus:border-purple-400 focus:ring-2 focus:ring-purple-100 outline-none"></textarea>
      </div>
      <div class="grid grid-cols-2 gap-2">
        <div>
          <label class="block text-[12px] text-slate-500 font-medium mb-1.5">作者 / 落款</label>
          <input v-model="form.author" type="text" placeholder="@AI工作台"
                 class="w-full px-2.5 py-2 border border-slate-200 rounded-lg text-xs focus:border-purple-400 focus:ring-1 focus:ring-purple-100 outline-none" />
        </div>
        <div>
          <label class="block text-[12px] text-slate-500 font-medium mb-1.5">标签</label>
          <input v-model="form.tag" type="text" placeholder="#干货 #2026"
                 class="w-full px-2.5 py-2 border border-slate-200 rounded-lg text-xs focus:border-purple-400 focus:ring-1 focus:ring-purple-100 outline-none" />
        </div>
      </div>

      <!-- 图片占位 -->
      <div>
        <label class="block text-[12px] text-slate-500 font-medium mb-1.5">封面图 URL（可选）</label>
        <input v-model="form.coverUrl" type="text" placeholder="https://..."
               class="w-full px-3 py-2 border border-slate-200 rounded-lg text-xs focus:border-purple-400 focus:ring-1 focus:ring-purple-100 outline-none" />
        <div class="mt-2 grid grid-cols-4 gap-1.5">
          <button v-for="c in coverPresets" :key="c.name"
                  @click="form.coverUrl = c.url"
                  class="aspect-video rounded-lg border border-slate-100 overflow-hidden hover:border-purple-300 transition-all"
                  :class="{ 'ring-2 ring-purple-300': form.coverUrl === c.url }">
            <img :src="c.url" :alt="c.name" class="w-full h-full object-cover" referrerpolicy="no-referrer"
                 @error="$event.target.style.opacity=0.1;$event.target.parentNode.style.background=c.bg" />
          </button>
        </div>
      </div>

      <!-- 主题色 -->
      <div>
        <label class="flex items-center justify-between text-[12px] text-slate-500 font-medium mb-1.5">
          <span>主题色 / 字号</span>
        </label>
        <div class="grid grid-cols-7 gap-1.5 mb-2">
          <button v-for="c in themeColors" :key="c.key"
                  @click="form.theme = c.key"
                  class="aspect-square rounded-lg border transition-all"
                  :class="form.theme === c.key ? 'ring-2 ring-offset-1 ring-slate-400 scale-110 border-slate-200' : 'border-slate-100'"
                  :style="{ background: c.grad }"
                  :title="c.name"></button>
        </div>
        <div>
          <label class="flex items-center justify-between text-[11px] text-slate-500 mb-1">
            <span>标题字号</span><span>{{ form.titleSize }}px</span>
          </label>
          <input v-model.number="form.titleSize" type="range" min="22" max="60"
                 class="w-full h-1.5 bg-slate-100 rounded-full appearance-none cursor-pointer accent-purple-500" />
        </div>
      </div>

      <div class="grid grid-cols-2 gap-2">
        <button @click="doExport('svg')"
                class="py-2 rounded-lg text-xs font-bold border border-slate-200 hover:bg-slate-50 text-slate-600 flex items-center justify-center gap-1 transition-all">
          <Download class="w-3.5 h-3.5" /> 导出 SVG
        </button>
        <button @click="doExport('png')"
                class="py-2 rounded-lg text-xs font-bold bg-gradient-to-r from-purple-500 to-indigo-500 text-white shadow-sm hover:shadow-md flex items-center justify-center gap-1 transition-all">
          <ImageDown class="w-3.5 h-3.5" /> 导出 PNG
        </button>
      </div>
    </aside>

    <!-- 右：实时预览 -->
    <section class="bg-slate-50 rounded-xl border border-slate-100 p-4 sm:p-6">
      <header class="flex items-center justify-between mb-4">
        <h3 class="text-sm font-bold text-slate-800 flex items-center gap-2">
          <Eye class="w-4 h-4 text-purple-500" /> 实时预览
        </h3>
        <div class="flex items-center gap-2 text-[11px] text-slate-500">
          <span class="inline-flex items-center gap-0.5 px-2 py-0.5 rounded bg-white border border-slate-200">
            <Maximize2 class="w-3 h-3" /> {{ currentSize.w }} × {{ currentSize.h }}
          </span>
          <span>{{ tpl.label }}</span>
        </div>
      </header>

      <div class="flex items-center justify-center">
        <div id="ai-material-preview-wrap"
             class="bg-white rounded-xl shadow-xl overflow-hidden"
             :style="previewWrapStyle">
          <svg ref="svgRef" :width="currentSize.w" :height="currentSize.h"
               xmlns="http://www.w3.org/2000/svg" shape-rendering="geometricPrecision" text-rendering="optimizeLegibility"
               :viewBox="`0 0 ${currentSize.w} ${currentSize.h}`">
            <g v-html="renderSvg" />
          </svg>
        </div>
      </div>
    </section>
  </div>
</template>

<script setup>
import { reactive, ref, computed } from 'vue'
import {
  Layers, Check, Download, ImageDown, Eye, Maximize2,
} from 'lucide-vue-next'

const sizes = [
  { key: '1080x1440', w: 1080, h: 1440, label: '小红书 3:4' },
  { key: '1080x1920', w: 1080, h: 1920, label: '手机 9:16' },
  { key: '1080x1080', w: 1080, h: 1080, label: '方图 1:1' },
  { key: '1242x2208', w: 1242, h: 2208, label: '公众号头图' },
  { key: '900x500',   w: 900,  h: 500,  label: '横板封面' },
  { key: '300x420',   w: 300,  h: 420,  label: '名片小图' },
]

const themeColors = [
  { key: 'indigo', name: '靛青', grad: 'linear-gradient(135deg,#6366f1,#3b82f6)' },
  { key: 'rose',   name: '玫瑰', grad: 'linear-gradient(135deg,#f43f5e,#ec4899)' },
  { key: 'amber',  name: '琥珀', grad: 'linear-gradient(135deg,#f59e0b,#ef4444)' },
  { key: 'emerald',name: '翠绿', grad: 'linear-gradient(135deg,#10b981,#0ea5e9)' },
  { key: 'purple', name: '紫霞', grad: 'linear-gradient(135deg,#a855f7,#6366f1)' },
  { key: 'ink',    name: '水墨', grad: 'linear-gradient(135deg,#0f172a,#334155)' },
  { key: 'cream',  name: '奶油', grad: 'linear-gradient(135deg,#fef3c7,#fde68a)' },
]

const templates = [
  { key: 'list',  label: '要点清单',
    previewBg: 'bg-gradient-to-br from-indigo-100 to-blue-50',
    preview: `<div class="h-full flex flex-col justify-between p-2"><div><div class="h-1.5 bg-indigo-500 rounded w-1/2 mb-1"></div><div class="h-1 bg-slate-400 rounded w-4/5 mb-0.5"></div></div><div class="space-y-0.5"><div class="h-0.5 bg-slate-300 rounded"></div><div class="h-0.5 bg-slate-300 rounded w-11/12"></div><div class="h-0.5 bg-slate-300 rounded w-5/6"></div></div></div>` },
  { key: 'cover', label: '大字封面',
    previewBg: 'bg-gradient-to-br from-rose-100 to-pink-50',
    preview: `<div class="h-full flex flex-col justify-center items-center text-center p-2"><div class="h-2.5 bg-rose-500 rounded w-3/4 mb-1.5"></div><div class="h-1 bg-slate-400 rounded w-2/3"></div></div>` },
  { key: 'image', label: '图文结合',
    previewBg: 'bg-gradient-to-br from-emerald-100 to-teal-50',
    preview: `<div class="h-full flex gap-1 p-1"><div class="w-1/3 bg-emerald-300 rounded"></div><div class="flex-1 space-y-1 pt-1"><div class="h-1.5 bg-emerald-600 rounded w-3/4"></div><div class="h-0.5 bg-slate-300 rounded"></div><div class="h-0.5 bg-slate-300 rounded w-5/6"></div></div></div>` },
  { key: 'quote', label: '金句卡片',
    previewBg: 'bg-gradient-to-br from-purple-100 to-indigo-50',
    preview: `<div class="h-full flex items-center justify-center p-2"><div class="text-purple-600 text-lg leading-none">“</div><div class="h-2 bg-purple-400 rounded w-2/3 mx-1"></div><div class="text-purple-600 text-lg leading-none rotate-180">“</div></div>` },
]

const coverPresets = [
  // 使用稳定的占位图
  { name: '渐变 1', url: 'https://images.unsplash.com/photo-1518770660439-4636190af475?w=600&auto=format&fit=crop', bg: '#1e293b' },
  { name: '渐变 2', url: 'https://images.unsplash.com/photo-1557682250-33bd709cbe85?w=600&auto=format&fit=crop', bg: '#7c3aed' },
  { name: '商业',   url: 'https://images.unsplash.com/photo-1454165804606-c3d57bc86b40?w=600&auto=format&fit=crop', bg: '#0ea5e9' },
  { name: '抽象',   url: 'https://images.unsplash.com/photo-1557683316-973673baf926?w=600&auto=format&fit=crop', bg: '#f43f5e' },
]

const form = reactive({
  size: '1080x1440',
  tpl: 'list',
  theme: 'indigo',
  title: '2026 A 股主线全攻略',
  subtitle: '从选股到仓位的完整实操清单',
  pointsText: '1. 先定方向：科技 / 高股息 / 复苏三条主线\n2. 再定仓位：单票不超过 15%，行业不超过 30%\n3. 十大流通股东占比 → 算出历史换手衰减系数\n4. 三角形分布测算真实市场成本\n5. 破位即减仓，不扛单不猜底',
  author: '@AI创作工作台',
  tag: '#干货 #2026 #A股',
  coverUrl: coverPresets[0].url,
  titleSize: 48,
})

const svgRef = ref(null)

const currentSize = computed(() => sizes.find(s => s.key === form.size) || sizes[0])
const tpl = computed(() => templates.find(t => t.key === form.tpl) || templates[0])
const theme = computed(() => {
  const themeMap = {
    indigo:  { a: '#6366f1', b: '#3b82f6', bg: ['#eef2ff', '#eff6ff'], text: '#1e1b4b' },
    rose:    { a: '#f43f5e', b: '#ec4899', bg: ['#fff1f2', '#fdf2f8'], text: '#4c0519' },
    amber:   { a: '#f59e0b', b: '#ef4444', bg: ['#fffbeb', '#fef2f2'], text: '#451a03' },
    emerald: { a: '#10b981', b: '#0ea5e9', bg: ['#ecfdf5', '#f0f9ff'], text: '#064e3b' },
    purple:  { a: '#a855f7', b: '#6366f1', bg: ['#faf5ff', '#eef2ff'], text: '#3b0764' },
    ink:     { a: '#0f172a', b: '#334155', bg: ['#f1f5f9', '#e2e8f0'], text: '#020617' },
    cream:   { a: '#f59e0b', b: '#b45309', bg: ['#fefce8', '#fffbeb'], text: '#451a03' },
  }
  return themeMap[form.theme] || themeMap.indigo
})

const previewWrapStyle = computed(() => {
  const { w, h } = currentSize.value
  const maxW = Math.min(window.innerWidth - 490, 720)  // 适配大屏
  const maxH = window.innerHeight - 260
  const r = Math.min(maxW / w, maxH / h, 0.6)
  return {
    transform: `scale(${Math.max(r, 0.18)})`,
    transformOrigin: 'center top',
    width: w + 'px',
    height: h + 'px',
  }
})

const points = computed(() => String(form.pointsText || '')
  .split(/\n+/).map(s => s.trim()).filter(Boolean).slice(0, 8))

// ======= SVG 渲染 =======
const renderSvg = computed(() => {
  const t = theme.value
  const { w, h } = currentSize.value
  let out = ''
  // 背景（渐变）
  out += `<defs>
    <linearGradient id="bgG" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="${t.bg[0]}"/>
      <stop offset="100%" stop-color="${t.bg[1]}"/>
    </linearGradient>
    <linearGradient id="acG" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0%" stop-color="${t.a}"/>
      <stop offset="100%" stop-color="${t.b}"/>
    </linearGradient>
    <clipPath id="rc16"><rect rx="16" ry="16" width="100%" height="100%"/></clipPath>
    <clipPath id="rc32"><rect rx="32" ry="32" width="100%" height="100%"/></clipPath>
  </defs>`
  out += `<rect width="${w}" height="${h}" fill="url(#bgG)"/>`
  // 装饰圆点
  out += `<circle cx="${w - 80}" cy="${80}" r="180" fill="${t.a}" opacity="0.06"/>`
  out += `<circle cx="80" cy="${h - 120}" r="220" fill="${t.b}" opacity="0.05"/>`

  if (form.tpl === 'cover') out += renderCover(w, h, t)
  else if (form.tpl === 'image') out += renderImage(w, h, t)
  else if (form.tpl === 'quote') out += renderQuote(w, h, t)
  else out += renderList(w, h, t)

  // 底部落款
  const footY = h - 56
  out += `<g>
    <rect x="40" y="${footY}" width="${w - 80}" height="32" rx="16" fill="#ffffff" opacity="0.8"/>
    <text x="64" y="${footY + 21}" font-size="20" fill="${t.text}" font-family="PingFang SC, Microsoft YaHei, sans-serif" font-weight="600">${escXml(form.author || '@AI创作工作台')}</text>
    <text x="${w - 64}" y="${footY + 21}" text-anchor="end" font-size="18" fill="${t.a}" font-family="PingFang SC, Microsoft YaHei, sans-serif" font-weight="700">${escXml(form.tag || '')}</text>
  </g>`
  return out
})

function escXml(s) {
  return String(s || '').replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]))
}

function splitLines(text, maxChars) {
  const s = String(text || '').trim()
  if (!s) return []
  if (s.length <= maxChars) return [s]
  const out = []
  let cur = ''
  for (const ch of s) {
    cur += ch
    if (cur.length >= maxChars) { out.push(cur); cur = '' }
  }
  if (cur) out.push(cur)
  return out
}

function renderList(w, h, t) {
  let s = ''
  const padX = 56
  let y = 80
  // 上方色带
  s += `<rect x="${padX}" y="${y}" width="120" height="10" rx="5" fill="url(#acG)"/>`
  y += 50
  // 主标题
  const titleLines = splitLines(form.title, Math.max(6, Math.floor((w - 2 * padX) / (form.titleSize * 0.65))))
  titleLines.forEach(line => {
    s += `<text x="${padX}" y="${y}" font-size="${form.titleSize}" font-weight="800" fill="${t.text}" font-family="PingFang SC, Microsoft YaHei, sans-serif">${escXml(line)}</text>`
    y += form.titleSize + 8
  })
  y += 8
  // 副标题
  s += `<text x="${padX}" y="${y}" font-size="${Math.floor(form.titleSize * 0.5)}" fill="${t.a}" font-weight="600" font-family="PingFang SC, Microsoft YaHei, sans-serif">${escXml(form.subtitle || '')}</text>`
  y += 40
  // 分隔
  s += `<line x1="${padX}" y1="${y}" x2="${w - padX}" y2="${y}" stroke="${t.a}" stroke-opacity="0.25" stroke-width="2"/>`
  y += 32
  // 卡片式要点
  const list = points.value.length ? points.value : ['（未填写要点 · 请在左侧录入）']
  const cardH = Math.min(96, Math.floor((h - y - 140) / Math.max(list.length, 1)))
  list.forEach((p, i) => {
    const cy = y + i * (cardH + 16)
    s += `<rect x="${padX}" y="${cy}" width="${w - 2 * padX}" height="${cardH}" rx="22" fill="#ffffff" stroke="${t.a}" stroke-opacity="0.18"/>`
    // 序号圆
    s += `<circle cx="${padX + 32}" cy="${cy + cardH / 2}" r="24" fill="url(#acG)"/>`
    s += `<text x="${padX + 32}" y="${cy + cardH / 2 + 8}" text-anchor="middle" font-size="24" fill="#ffffff" font-weight="800" font-family="PingFang SC, Microsoft YaHei, sans-serif">${i + 1}</text>`
    // 文案（最多 2 行）
    const maxC = Math.floor((w - 2 * padX - 96) / (Math.floor(form.titleSize * 0.46)))
    const lines = splitLines(p.replace(/^\d+[\.、\)\s]+/, ''), Math.max(4, maxC)).slice(0, 2)
    lines.forEach((ln, li) => {
      s += `<text x="${padX + 72}" y="${cy + cardH / 2 + (li === 0 ? (lines.length === 1 ? 6 : -4) : 28)}"
                font-size="${Math.floor(form.titleSize * 0.46)}" fill="${t.text}" font-weight="600" font-family="PingFang SC, Microsoft YaHei, sans-serif">${escXml(ln)}</text>`
    })
  })
  return s
}

function renderCover(w, h, t) {
  let s = ''
  const y0 = Math.floor(h * 0.1)
  // 背景图（如果有）
  if (form.coverUrl) {
    s += `<image href="${escAttr(form.coverUrl)}" x="0" y="0" width="${w}" height="${h}" preserveAspectRatio="xMidYMid slice" opacity="0.22" clip-path="url(#rc16)"/>`
  }
  // 渐变遮罩
  s += `<rect x="0" y="${h * 0.35}" width="${w}" height="${h * 0.65}" fill="url(#acG)" opacity="0.85"/>`
  // 顶部标签
  s += `<rect x="${Math.floor(w / 2 - 140)}" y="${y0}" width="280" height="50" rx="25" fill="#ffffff" opacity="0.92"/>`
  s += `<text x="${w / 2}" y="${y0 + 33}" text-anchor="middle" font-size="24" fill="${t.a}" font-weight="800" font-family="PingFang SC, Microsoft YaHei, sans-serif">AI 精选 · 干货卡片</text>`
  // 标题
  const cY = Math.floor(h * 0.48)
  const titleLines = splitLines(form.title, Math.max(6, Math.floor((w - 160) / (form.titleSize * 0.6))))
  titleLines.forEach((ln, i) => {
    s += `<text x="${w / 2}" y="${cY + i * (form.titleSize + 14)}" text-anchor="middle" font-size="${form.titleSize}" font-weight="900" fill="#ffffff" font-family="PingFang SC, Microsoft YaHei, sans-serif">${escXml(ln)}</text>`
  })
  // 副标题
  const subY = cY + titleLines.length * (form.titleSize + 14) + 30
  const subLines = splitLines(form.subtitle, Math.max(6, Math.floor((w - 160) / 26)))
  subLines.forEach((ln, i) => {
    s += `<text x="${w / 2}" y="${subY + i * 36}" text-anchor="middle" font-size="26" fill="#ffffff" opacity="0.92" font-family="PingFang SC, Microsoft YaHei, sans-serif">${escXml(ln)}</text>`
  })
  return s
}

function renderImage(w, h, t) {
  let s = ''
  const pad = 48
  const imgH = Math.floor(h * 0.42)
  if (form.coverUrl) {
    s += `<image href="${escAttr(form.coverUrl)}" x="${pad}" y="${pad}" width="${w - 2 * pad}" height="${imgH}" preserveAspectRatio="xMidYMid slice" clip-path="url(#rc32)"/>`
  } else {
    s += `<rect x="${pad}" y="${pad}" width="${w - 2 * pad}" height="${imgH}" rx="32" fill="url(#acG)" opacity="0.7"/>`
  }
  let y = pad + imgH + 40
  const titleLines = splitLines(form.title, Math.max(6, Math.floor((w - 2 * pad) / (form.titleSize * 0.62))))
  titleLines.forEach(ln => {
    s += `<text x="${pad}" y="${y}" font-size="${form.titleSize}" font-weight="800" fill="${t.text}" font-family="PingFang SC, Microsoft YaHei, sans-serif">${escXml(ln)}</text>`
    y += form.titleSize + 10
  })
  y += 16
  s += `<text x="${pad}" y="${y}" font-size="${Math.floor(form.titleSize * 0.44)}" fill="${t.a}" font-weight="600" font-family="PingFang SC, Microsoft YaHei, sans-serif">${escXml(form.subtitle || '')}</text>`
  y += 40
  const list = points.value.slice(0, 5)
  list.forEach((p, i) => {
    s += `<circle cx="${pad + 14}" cy="${y + 10}" r="8" fill="${t.a}"/>`
    const maxC = Math.floor((w - 2 * pad - 40) / 20)
    const ln = splitLines(p.replace(/^\d+[\.、\)\s]+/, ''), maxC)[0] || ''
    s += `<text x="${pad + 40}" y="${y + 16}" font-size="22" fill="${t.text}" font-weight="600" font-family="PingFang SC, Microsoft YaHei, sans-serif">${escXml(ln)}</text>`
    y += 40
  })
  return s
}

function renderQuote(w, h, t) {
  let s = ''
  // 装饰引号
  s += `<text x="${w / 2}" y="${Math.floor(h * 0.2)}" text-anchor="middle" font-size="${Math.floor(Math.min(w, h) * 0.25)}"
           font-weight="900" fill="${t.a}" opacity="0.12" font-family="Georgia, serif">“</text>`
  const cX = w / 2
  const cY = h / 2
  const quoteText = form.title || '（输入主标题作为金句）'
  const maxChars = Math.max(4, Math.floor((w - 200) / (form.titleSize * 0.62)))
  const lines = splitLines(quoteText, maxChars)
  const boxH = lines.length * (form.titleSize + 14)
  let y = cY - boxH / 2 + form.titleSize
  lines.forEach(ln => {
    s += `<text x="${cX}" y="${y}" text-anchor="middle" font-size="${form.titleSize}" font-weight="800" fill="${t.text}"
             font-family="PingFang SC, Microsoft YaHei, sans-serif">${escXml(ln)}</text>`
    y += form.titleSize + 14
  })
  // 分隔线 + 副标题
  s += `<line x1="${w / 2 - 80}" y1="${y + 18}" x2="${w / 2 + 80}" y2="${y + 18}" stroke="${t.a}" stroke-width="3"/>`
  s += `<text x="${cX}" y="${y + 60}" text-anchor="middle" font-size="${Math.floor(form.titleSize * 0.46)}" fill="${t.a}"
           font-weight="600" font-family="PingFang SC, Microsoft YaHei, sans-serif">${escXml(form.subtitle || '— ' + (form.author || 'AI 创作工作台'))}</text>`
  return s
}

function escAttr(s) { return String(s || '').replace(/"/g, '&quot;').replace(/&/g, '&amp;') }

// ======= 导出 =======
function getSvgString() {
  if (!svgRef.value) return ''
  const clone = svgRef.value.cloneNode(true)
  clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg')
  return `<?xml version="1.0" encoding="UTF-8"?>\n` + new XMLSerializer().serializeToString(clone)
}

function download(name, blob) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url; a.download = name
  document.body.appendChild(a); a.click(); a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

async function doExport(type) {
  const svg = getSvgString()
  if (!svg) return
  if (type === 'svg') {
    download(`material_${Date.now()}.svg`, new Blob([svg], { type: 'image/svg+xml;charset=utf-8' }))
    return
  }
  // PNG：通过 Image + Canvas
  const { w, h } = currentSize.value
  const img = new Image()
  const url = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg)
  img.onload = () => {
    const canvas = document.createElement('canvas')
    canvas.width = w; canvas.height = h
    const ctx = canvas.getContext('2d')
    ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, w, h)
    ctx.drawImage(img, 0, 0, w, h)
    canvas.toBlob((blob) => {
      if (blob) download(`material_${Date.now()}.png`, blob)
      else flashToast('PNG 导出失败')
    }, 'image/png')
  }
  img.onerror = () => flashToast('图片加载失败，请尝试导出 SVG')
  img.src = url
}

function flashToast(msg) {
  const el = document.createElement('div')
  el.textContent = msg
  el.className = 'fixed z-[999] left-1/2 bottom-10 -translate-x-1/2 px-4 py-2 rounded-lg bg-slate-900/90 text-white text-xs shadow-lg'
  document.body.appendChild(el)
  setTimeout(() => { el.style.opacity = '0'; el.style.transition = 'all .3s' }, 1200)
  setTimeout(() => document.body.removeChild(el), 1700)
}
</script>

<style scoped>
input[type=range]::-webkit-slider-thumb { -webkit-appearance: none; }
.aspect-video { aspect-ratio: 16 / 9; }
</style>
