<template>
  <div class="min-h-screen bg-[#0B0F17] text-slate-100 p-6">
    <header class="mb-5 flex items-center justify-between">
      <div>
        <p class="text-[11px] tracking-widest text-sky-400/80 font-semibold mb-1">K-LINE AI · CHART ANALYSIS</p>
        <h1 class="text-2xl font-bold">K线AI看图分析</h1>
        <p class="text-xs text-slate-400 mt-1">AI 直接读「眼前这张图」：趋势、高低点、支撑压力、量能与指标状态，并给出操作意见。</p>
      </div>
      <div class="text-right text-xs text-slate-400 space-y-1">
        <div class="text-base font-mono font-semibold text-slate-200">{{ stockCode || '—' }} {{ stockName }}</div>
        <div v-if="analysis">现价 ¥{{ analysis.metrics?.price }} · 截至 {{ new Date(analysis.fetchedAt).toLocaleString('zh-CN') }}<span v-if="fromCache" class="text-amber-300/80"> · 本地缓存</span></div>
      </div>
    </header>

    <!-- 操作意见横幅 -->
    <div v-if="analysis" class="mb-5 rounded-2xl border p-4" :class="bannerClass">
      <div class="flex items-start gap-3">
        <div class="shrink-0 w-9 h-9 rounded-full flex items-center justify-center text-lg font-bold" :class="iconBgClass">
          <component :is="iconComp" class="w-5 h-5" />
        </div>
        <div class="flex-1">
          <div class="text-sm font-semibold mb-1">{{ adviceLabel }}</div>
          <div class="text-sm leading-6 text-slate-100/90">{{ analysis.advice }}</div>
          <div class="text-[11px] text-slate-400 mt-2">基于最近 60 根日 K 的形态与指标，仅供研究参考，不构成投资建议。</div>
        </div>
      </div>
    </div>
    <div v-else-if="loading" class="mb-5 rounded-2xl border border-white/10 bg-white/[0.03] p-10 text-center text-slate-400 text-sm">正在拉取 K 线并看图分析…</div>
    <div v-else-if="error" class="mb-5 rounded-2xl border border-rose-400/30 bg-rose-500/10 p-4 text-sm text-rose-300">{{ error }}</div>

    <div class="grid grid-cols-1 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)] gap-4">
      <!-- K 线 -->
      <section class="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
        <div class="flex items-center justify-between mb-2">
          <div class="text-xs font-semibold text-slate-400 tracking-widest">近 60 日 K 线（前复权）</div>
          <div class="text-[10px] text-slate-500 flex items-center gap-3">
            <span class="flex items-center gap-1"><i class="inline-block w-2 h-2 rounded-sm" style="background:#fbbf24"></i>MA5</span>
            <span class="flex items-center gap-1"><i class="inline-block w-2 h-2 rounded-sm" style="background:#60a5fa"></i>MA20</span>
          </div>
        </div>
        <div v-if="klineHtml" class="rounded-lg overflow-hidden" v-html="klineHtml"></div>
        <div v-else class="h-[240px] flex items-center justify-center text-slate-500 text-sm">暂无 K 线数据</div>
      </section>

      <!-- 指标 + 信号 -->
      <section class="rounded-2xl border border-white/10 bg-white/[0.03] p-4 space-y-4">
        <div>
          <div class="text-xs font-semibold text-slate-400 mb-2 tracking-widest">关键指标</div>
          <div v-if="analysis" class="grid grid-cols-4 gap-2 text-center">
            <div v-for="m in metricCards" :key="m.label" class="rounded-lg bg-white/[0.04] p-2">
              <div class="text-[10px] text-slate-500">{{ m.label }}</div>
              <div class="text-sm font-semibold mt-0.5" :class="m.toneClass || 'text-slate-100'">{{ m.value }}</div>
            </div>
          </div>
        </div>

        <div>
          <div class="text-xs font-semibold text-slate-400 mb-2 tracking-widest">
            看图信号（{{ analysis?.adviceClass === 'bull' ? '利好占优' : analysis?.adviceClass === 'bear' ? '利空占优' : '多空交织' }}）
          </div>
          <ul v-if="analysis?.signals?.length" class="space-y-1.5">
            <li v-for="s in analysis.signals" :key="s.id"
              class="rounded-lg border px-3 py-2 flex items-start gap-2 text-xs"
              :class="signalBorderClass(s.score)">
              <span class="shrink-0 mt-0.5 w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold"
                :class="signalBadgeClass(s.score)">
                {{ s.score > 0 ? '+' + s.score : s.score }}
              </span>
              <div class="flex-1 min-w-0">
                <div class="font-semibold text-slate-100 truncate">{{ groupLabel(s.group) }} · {{ s.title }}</div>
                <div class="text-slate-400 mt-0.5 leading-5">{{ s.detail }}</div>
              </div>
            </li>
          </ul>
          <p v-else class="text-xs text-slate-500">暂无信号</p>
        </div>
      </section>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import { TrendingUp, TrendingDown, Minus } from 'lucide-vue-next'

const stockCode = ref('')
const stockName = ref('')
const analysis = ref(null)
const loading = ref(false)
const error = ref('')
const klineHtml = ref('')
const fromCache = ref(false)

// 本地缓存：把 API 结果存到浏览器，重开页面秒显、并支持离线查看
const CACHE_PREFIX = 'kline-analysis:'
function loadCache(code) {
  try {
    const obj = JSON.parse(localStorage.getItem(CACHE_PREFIX + code) || 'null')
    return obj && obj.data ? obj : null
  } catch { return null }
}
function saveCache(code, data) {
  try { localStorage.setItem(CACHE_PREFIX + code, JSON.stringify({ savedAt: Date.now(), data })) } catch {}
}

onMounted(async () => {
  const p = new URLSearchParams(window.location.search)
  stockCode.value = p.get('code') || ''
  stockName.value = decodeURIComponent(p.get('name') || '') || ''
  if (!stockCode.value) { error.value = '缺少 ?code= 参数'; return }

  // 先用本地缓存渲染，随后再向 API 请求最新数据
  const cached = loadCache(stockCode.value)
  if (cached) {
    analysis.value = cached.data
    klineHtml.value = renderKline(cached.data.candles || [])
    fromCache.value = true
  }

  loading.value = !cached
  try {
    const res = await fetch(`/api/ai/charts?code=${encodeURIComponent(stockCode.value)}`)
    const data = await res.json()
    if (!res.ok || !data.ok) throw new Error(data.error || '分析失败')
    analysis.value = data
    klineHtml.value = renderKline(data.candles || [])
    fromCache.value = false
    error.value = ''
    saveCache(stockCode.value, data)
  } catch (e) {
    // 有本地缓存时静默降级，不打断查看
    if (!cached) error.value = e.message || '分析失败'
  } finally {
    loading.value = false
  }
})

function renderKline(candles) {
  const W = 760, H = 300, padL = 44, padR = 12, padT = 12, padB = 24
  const n = candles.length
  if (!n) return ''
  const closes = candles.map(c => c.c)
  const highs = candles.map(c => c.h)
  const lows = candles.map(c => c.l)
  const min = Math.min(...lows), max = Math.max(...highs)
  const y = v => padT + (H - padT - padB) * (1 - (v - min) / (max - min || 1))
  const x = i => padL + (W - padL - padR) * (i / (n - 1 || 1))
  const barW = Math.max(2, ((W - padL - padR) / n) * 0.55)
  const maSeries = m => candles.map((_, i) => {
    if (i + 1 < m) return null
    let s = 0
    for (let j = i - m + 1; j <= i; j++) s += closes[j]
    return s / m
  })
  const path = arr => arr.map((v, i) => (v == null ? '' : `${i === 0 ? 'M' : 'L'}${x(i).toFixed(1)},${y(v).toFixed(1)}`)).filter(Boolean).join(' ')
  const ma5 = maSeries(5), ma20 = maSeries(20)
  const up = '#34d399', down = '#f87171'

  const grid = []
  for (let g = 0; g <= 4; g++) {
    const gy = padT + (H - padT - padB) * g / 4
    grid.push({ y: gy, label: (max - (max - min) * g / 4).toFixed(2) })
  }
  const parts = [`<svg viewBox="0 0 ${W} ${H}" class="w-full h-auto" xmlns="http://www.w3.org/2000/svg">`]
  parts.push(grid.map(g =>
    `<line x1="${padL}" y1="${g.y}" x2="${W - padR}" y2="${g.y}" stroke="rgba(255,255,255,0.06)"/>` +
    `<text x="4" y="${g.y + 3}" font-size="10" fill="#64748b">${g.label}</text>`
  ).join('\n'))
  parts.push(candles.map((c, i) => {
    const cx = x(i)
    const color = c.c >= c.o ? up : down
    const top = Math.min(y(c.o), y(c.c)), bh = Math.max(1.5, Math.abs(y(c.o) - y(c.c)))
    return `<line x1="${cx}" y1="${y(c.h)}" x2="${cx}" y2="${y(c.l)}" stroke="${color}" stroke-width="1"/>` +
           `<rect x="${(cx - barW / 2).toFixed(1)}" y="${top.toFixed(1)}" width="${barW.toFixed(1)}" height="${bh.toFixed(1)}" fill="${color}" opacity="0.85"/>`
  }).join('\n'))
  parts.push(`<path d="${path(ma5)}" fill="none" stroke="#fbbf24" stroke-width="1.2" opacity="0.9"/>`)
  parts.push(`<path d="${path(ma20)}" fill="none" stroke="#60a5fa" stroke-width="1.4" opacity="0.9"/>`)
  parts.push(`<text x="${padL}" y="${H - 6}" font-size="10" fill="#64748b">${candles[0].date}</text>`)
  parts.push(`<text x="${W - padR}" y="${H - 6}" text-anchor="end" font-size="10" fill="#64748b">${candles[n - 1].date}</text>`)
  parts.push('</svg>')
  return parts.join('\n')
}

const adviceLabel = computed(() => {
  const c = analysis.value?.adviceClass
  if (c === 'bull') return '操作意见 · 偏多'
  if (c === 'bear') return '操作意见 · 偏空'
  return '操作意见 · 中性'
})
const iconComp = computed(() => analysis.value?.adviceClass === 'bull' ? TrendingUp
  : analysis.value?.adviceClass === 'bear' ? TrendingDown : Minus)
const bannerClass = computed(() => {
  const c = analysis.value?.adviceClass
  if (c === 'bull') return 'border-emerald-400/40 bg-emerald-500/10'
  if (c === 'bear') return 'border-rose-400/40 bg-rose-500/10'
  return 'border-amber-400/40 bg-amber-500/10'
})
const iconBgClass = computed(() => {
  const c = analysis.value?.adviceClass
  if (c === 'bull') return 'bg-emerald-500/20 text-emerald-300'
  if (c === 'bear') return 'bg-rose-500/20 text-rose-300'
  return 'bg-amber-500/20 text-amber-300'
})

const metricCards = computed(() => {
  const m = analysis.value?.metrics || {}
  const maBull = m.ma5 && m.ma20 && Number(m.ma5) > Number(m.ma20)
  return [
    { label: '现价', value: m.price ?? '—' },
    { label: 'MA20', value: m.ma20 ?? '—', toneClass: maBull ? 'text-emerald-300' : 'text-rose-300' },
    { label: 'RSI14', value: m.rsi ?? '—',
      toneClass: Number(m.rsi) >= 70 ? 'text-rose-300' : Number(m.rsi) <= 30 ? 'text-emerald-300' : 'text-slate-100' },
    { label: '量比', value: m.volRatio ?? '—', toneClass: Number(m.volRatio) > 1.5 ? 'text-amber-300' : 'text-slate-100' },
    { label: 'MA5', value: m.ma5 ?? '—' },
    { label: 'MA10', value: m.ma10 ?? '—' },
    { label: 'MA60', value: m.ma60 ?? '—' },
    { label: '20日趋势', value: m.trendPct != null ? m.trendPct + '%' : '—',
      toneClass: Number(m.trendPct) >= 0 ? 'text-emerald-300' : 'text-rose-300' },
  ]
})

function groupLabel(g) {
  return { trend: '趋势', swing: '高低点', level: '支撑压力', volume: '量能', ma: '均线', macd: 'MACD', kdj: 'KDJ', boll: '布林' }[g] || g
}
function signalBorderClass(score) {
  if (score > 0) return 'border-emerald-400/25 bg-emerald-500/[0.06]'
  if (score < 0) return 'border-rose-400/25 bg-rose-500/[0.06]'
  return 'border-white/10 bg-white/[0.02]'
}
function signalBadgeClass(score) {
  if (score > 0) return 'bg-emerald-500/25 text-emerald-300'
  if (score < 0) return 'bg-rose-500/25 text-rose-300'
  return 'bg-slate-600/30 text-slate-400'
}
</script>

<style scoped>
</style>
