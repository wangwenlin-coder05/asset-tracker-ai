<template>
  <main class="ipo-page">
    <header class="ipo-head">
      <div>
        <p class="ipo-kicker">IPO CALENDAR</p>
        <h1>打新日历</h1>
        <p>申购日期、发行价、顶格申购所需市值、中签公布日与上市日期。</p>
      </div>
      <div class="ipo-actions">
        <a href="https://data.10jqka.com.cn/ipo/xgsgyzq/" target="_blank" rel="noopener noreferrer">查看同花顺原页</a>
        <button @click="refresh" :disabled="loading">{{ loading ? '加载中…' : '刷新' }}</button>
      </div>
    </header>
    <p v-if="source" class="ipo-source">数据来源：{{ sourceLabel }}</p>
    <p v-if="error" class="ipo-error">{{ error }} <a href="https://data.10jqka.com.cn/ipo/xgsgyzq/" target="_blank" rel="noopener noreferrer">打开同花顺查看</a></p>

    <!-- 我的打新资格 -->
    <section class="ipo-elig">
      <div class="ipo-elig-head">
        <span class="ipo-elig-title">我的打新资格</span>
        <span class="ipo-elig-sub">
          <template v-if="mvLoading">底仓计算中…</template>
          <template v-else-if="mvLoaded">依据 T-2（{{ t2Date }}）前 {{ avgDays }} 个交易日日均底仓</template>
          <template v-else>底仓数据未加载</template>
        </span>
      </div>
      <div class="ipo-elig-mv">
        <span>沪市底仓 <b :class="mvSh >= 10000 ? 'is-ok' : 'is-need'">{{ money(mvSh) }}元</b></span>
        <span>深市底仓 <b :class="mvSz >= 10000 ? 'is-ok' : 'is-need'">{{ money(mvSz) }}元</b></span>
      </div>
      <div class="ipo-elig-chips">
        <span v-for="c in boardChips" :key="c.key" class="ipo-chip" :class="'is-' + c.status">{{ c.label }}</span>
      </div>
      <p class="ipo-elig-tip">沪市底仓只打沪市新股（主板 60 / 科创 68），深市底仓只打深市新股（主板 00 / 创业 30），互不通用；科创板、创业板、北交所权限可在「资产总览 · 打新资格」面板勾选。</p>
    </section>

    <div class="ipo-table-wrap">
      <table>
        <thead><tr><th>申购日期</th><th>申购代码</th><th>股票简称</th><th>发行价格</th><th>顶格申购需配市值</th><th>申购上限</th><th>中签公布日</th><th>上市日期</th><th>打新资格</th></tr></thead>
        <tbody>
          <tr v-for="row in tableRows" :key="`${row.code || row.applyCode}-${row.date}`">
            <td>{{ row.date || '—' }}</td><td>{{ row.applyCode || '—' }}</td><td>{{ row.name || '—' }}</td><td>{{ row.price || '—' }}</td>
            <td>{{ row.marketValue || '—' }}</td><td>{{ row.limit || '—' }}</td><td>{{ row.lotteryDate || '—' }}</td><td>{{ row.listingDate || '—' }}</td>
            <td><span class="ipo-badge" :class="'is-' + row.elig.status" :title="row.elig.detail">{{ row.elig.label }}</span></td>
          </tr>
          <tr v-if="!loading && !tableRows.length"><td colspan="9" class="empty">暂无数据</td></tr>
        </tbody>
      </table>
    </div>
  </main>
</template>

<script setup>
import { computed, onMounted, ref } from 'vue'
import { ipoBoardOf } from '../utils/stockBoard'

const rows = ref([])
const loading = ref(false)
const error = ref('')
const source = ref('')

// T-2 前 20 个交易日日均底仓（沪深分开，与资产总览同一接口）
const mvSh = ref(0)
const mvSz = ref(0)
const mvLoading = ref(false)
const mvLoaded = ref(false)
const t2Date = ref('')
const avgDays = ref(0)

// 板块权限开关与「资产总览 · 打新资格」面板共用同一批 localStorage 键
const perms = ref(readPerms())
function readPerms() {
  const on = (key) => localStorage.getItem(key) === '1'
  return {
    exp: on('ipo_has2YearExp'),
    gem: on('ipo_gemOpen'),
    star: on('ipo_starOpen'),
    bj: on('ipo_bjOpen'),
    cb: on('ipo_cbOpen')
  }
}

const sourceLabel = computed(() => ({
  '10jqka': '同花顺公开页面',
  stock_xgsglb_em: '东方财富新股申购总览',
  stock_ipo_ths: '同花顺新股申购',
  akshare: 'AKShare'
}[source.value] || source.value))

async function load() {
  loading.value = true
  error.value = ''
  try {
    const response = await fetch('/api/newstock-calendar')
    const data = await response.json()
    if (!response.ok) throw new Error(data.error || '打新日历暂不可用')
    rows.value = Array.isArray(data.rows) ? data.rows : []
    source.value = data.source || ''
  } catch (failure) {
    error.value = failure.message
    rows.value = []
  } finally {
    loading.value = false
  }
}

async function loadMarketValue() {
  mvLoading.value = true
  try {
    const response = await fetch('/api/stock/ipo-market-value', { cache: 'no-store' })
    const data = await response.json()
    if (!response.ok) throw new Error(data.error || '底仓数据不可用')
    mvSh.value = Number(data.sh) || 0
    mvSz.value = Number(data.sz) || 0
    t2Date.value = data.t2Date || ''
    avgDays.value = Number(data.avgDays) || 0
    mvLoaded.value = true
  } catch (failure) {
    console.error('[IPO] 底仓日均拉取失败', failure)
  } finally {
    mvLoading.value = false
  }
}

function refresh() {
  load()
  loadMarketValue()
}

function money(value) {
  return Math.round(Number(value) || 0).toLocaleString('zh-CN')
}

// 各板块申购条件：沪市每 1 万 = 1000 股，深市每 5000 = 500 股，门槛均为日均 ≥1 万
const BOARDS = {
  shmain: { name: '沪市主板', market: 'sh', perm: null, exp: false },
  szmain: { name: '深市主板', market: 'sz', perm: null, exp: false },
  star: { name: '科创板', market: 'sh', perm: 'star', exp: true },
  gem: { name: '创业板', market: 'sz', perm: 'gem', exp: true },
  bj: { name: '北交所', market: null, perm: 'bj', exp: true },
  cb: { name: '可转债', market: null, perm: 'cb', exp: true }
}
const BOARD_ORDER = ['shmain', 'szmain', 'star', 'gem', 'bj', 'cb']

// 从申购代码（缺失时用股票代码）识别上市板块（判定规则统一收敛到 utils/stockBoard.js）
function boardOf(row) {
  return ipoBoardOf(row.code || row.applyCode, row.name)
}

function eligibility(key) {
  const board = BOARDS[key]
  if (!board) return { name: '未知板块', status: 'unknown', reasons: ['未能识别上市板块'], unit: 0 }
  const reasons = []
  if (board.perm && !perms.value[board.perm]) reasons.push('未开通权限')
  if (board.exp && !perms.value.exp) reasons.push('不满2年经验')
  if (board.market && !mvLoaded.value) return { name: board.name, status: 'unknown', reasons: ['底仓待加载'], unit: 0 }
  const mv = board.market === 'sh' ? mvSh.value : board.market === 'sz' ? mvSz.value : 0
  if (board.market && mv < 10000) reasons.push(`底仓差${money(10000 - mv)}元`)
  const unit = board.market === 'sh' ? Math.floor(mv / 10000) * 1000 : board.market === 'sz' ? Math.floor(mv / 5000) * 500 : 0
  return { name: board.name, status: reasons.length ? 'no' : 'ok', reasons, unit }
}

function statusText(e) {
  if (e.status === 'ok') return '有资格'
  if (e.status === 'unknown') return '待定'
  return e.reasons.join('、')
}

const boardChips = computed(() => BOARD_ORDER.map((key) => {
  const e = eligibility(key)
  return { key, status: e.status, label: `${e.name} · ${statusText(e)}` }
}))

const tableRows = computed(() => rows.value.map((row) => {
  const e = eligibility(boardOf(row))
  const text = statusText(e)
  return {
    ...row,
    elig: {
      status: e.status,
      label: text,
      detail: e.status === 'ok' && e.unit > 0 ? `${e.name} · 可申购 ${e.unit} 股` : `${e.name} · ${text}`
    }
  }
}))

onMounted(() => {
  load()
  loadMarketValue()
})
</script>

<style scoped>
.ipo-page { min-height: calc(100vh - 20px); padding: 32px clamp(20px, 5vw, 80px); background: linear-gradient(135deg, #f8fbff, #eef3fb); color: #17253d; }
.ipo-head { display: flex; justify-content: space-between; align-items: flex-end; gap: 20px; margin-bottom: 12px; }
.ipo-kicker { color: #2563eb; font-size: 11px; letter-spacing: .18em; }
.ipo-head h1 { margin: 6px 0; font-size: 32px; }
.ipo-head p { color: #718096; }
.ipo-actions { display: flex; align-items: center; gap: 10px; }
.ipo-actions a, .ipo-head button { border: 1px solid #2563eb; color: #2563eb; border-radius: 8px; padding: 8px 16px; background: white; font-size: 13px; }
.ipo-head button:disabled { opacity: .55; cursor: wait; }
.ipo-source { margin: 0 0 12px; color: #64748b; font-size: 12px; }
.ipo-error { padding: 12px; color: #b42340; background: #fff1f2; border-radius: 8px; }
.ipo-error a { margin-left: 8px; color: #2563eb; }
.ipo-elig { margin: 0 0 14px; padding: 14px 18px; background: #fff; border: 1px solid #dbe5f2; border-radius: 14px; box-shadow: 0 12px 30px #25456b12; }
.ipo-elig-head { display: flex; align-items: baseline; gap: 12px; flex-wrap: wrap; }
.ipo-elig-title { font-weight: 700; color: #17253d; }
.ipo-elig-sub { color: #64748b; font-size: 12px; }
.ipo-elig-mv { display: flex; gap: 22px; margin-top: 8px; font-size: 13px; color: #42526b; flex-wrap: wrap; }
.ipo-elig-mv b { font-size: 15px; }
.ipo-elig-mv b.is-ok { color: #1f9d55; }
.ipo-elig-mv b.is-need { color: #d97757; }
.ipo-elig-chips { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 10px; }
.ipo-chip { font-size: 12px; padding: 5px 10px; border-radius: 999px; border: 1px solid transparent; }
.ipo-chip.is-ok { background: #e8f8ef; color: #1f9d55; border-color: #b7e6cd; }
.ipo-chip.is-no { background: #fff1f2; color: #b42340; border-color: #f6c9d0; }
.ipo-chip.is-unknown { background: #f1f5f9; color: #64748b; border-color: #dbe5f2; }
.ipo-elig-tip { margin: 10px 0 0; color: #94a3b8; font-size: 12px; line-height: 1.6; }
.ipo-table-wrap { overflow: auto; background: #fff; border: 1px solid #dbe5f2; border-radius: 14px; box-shadow: 0 12px 30px #25456b12; }
table { width: 100%; min-width: 1080px; border-collapse: collapse; font-size: 13px; }
th, td { padding: 12px 14px; border-bottom: 1px solid #edf1f6; white-space: nowrap; text-align: left; }
th { background: #f3f7fc; color: #42526b; font-weight: 600; }
tbody tr:hover { background: #f8fbff; }
.empty { text-align: center; color: #94a3b8; padding: 42px; }
.ipo-badge { display: inline-block; font-size: 12px; padding: 3px 8px; border-radius: 6px; }
.ipo-badge.is-ok { background: #e8f8ef; color: #1f9d55; }
.ipo-badge.is-no { background: #fff1f2; color: #b42340; }
.ipo-badge.is-unknown { background: #f1f5f9; color: #94a3b8; }
@media (max-width: 700px) { .ipo-head { align-items: flex-start; flex-direction: column; } .ipo-actions { width: 100%; } }
</style>
