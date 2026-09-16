<template>
  <div class="w-full max-w-full min-w-0 overflow-x-hidden px-3 sm:px-4 lg:px-5 mt-3">
    <!-- 服务状态条 -->
    <div class="flex flex-wrap items-center gap-2 mb-2">
      <span class="text-sm font-bold text-slate-700 flex items-center gap-2">
        <Gauge class="w-4 h-4 text-indigo-500" />策略回测工作台
      </span>
      <span class="px-2 py-0.5 rounded-full text-[11px] font-semibold"
        :class="serviceUp ? 'bg-emerald-50 text-emerald-600' : 'bg-red-50 text-red-500'">
        <span class="inline-block w-1.5 h-1.5 rounded-full mr-1 align-middle"
          :class="serviceUp ? 'bg-emerald-500' : 'bg-red-400'" />
        {{ serviceUp ? '量化服务在线' : (checking ? '连接中…' : '量化服务未连接') }}
      </span>
      <p v-if="!serviceUp && !checking" class="text-[11px] text-slate-400">
        请在 quant/ 目录运行: python -m uvicorn quant.api:app --port 8000
      </p>
      <button v-if="!serviceUp && !checking" @click="ping"
        class="px-2 py-0.5 rounded text-[11px] text-indigo-500 border border-indigo-200 hover:bg-indigo-50">
        重试连接
      </button>
    </div>

    <div class="grid grid-cols-1 lg:grid-cols-[minmax(0,340px)_minmax(0,1fr)] gap-3">
      <!-- 左侧参数面板 -->
      <section class="bg-white rounded-xl p-4 card-shadow flex flex-col gap-3 h-max">
        <div class="flex items-center justify-between">
          <h4 class="text-sm font-bold text-slate-700">回测参数</h4>
          <button class="text-[11px] text-indigo-500 hover:text-indigo-700" @click="loadSymbols">
            刷新标的列表
          </button>
        </div>

        <div>
          <label class="text-xs text-slate-500">股票代码</label>
          <div class="flex gap-2 mt-1">
            <input v-model="form.code" placeholder="如 600000 / sh.600000"
              class="flex-1 min-w-0 px-3 py-2 rounded-lg border border-slate-200 text-sm focus:outline-none focus:border-indigo-300" />
            <button @click="sync" :disabled="syncing" class="px-3 py-2 rounded-lg text-sm font-medium text-white bg-indigo-500 hover:bg-indigo-600 disabled:opacity-50 flex items-center gap-1">
              <RefreshCw class="w-3.5 h-3.5" :class="syncing && 'animate-spin'" />同步行情
            </button>
          </div>
          <p v-if="syncMsg" class="text-[11px] mt-1" :class="syncErr ? 'text-red-500' : 'text-emerald-600'">{{ syncMsg }}</p>
        </div>

        <div class="grid grid-cols-2 gap-2">
          <div>
            <label class="text-xs text-slate-500">开始日期</label>
            <input type="date" v-model="form.start" class="w-full mt-1 px-2 py-2 rounded-lg border border-slate-200 text-sm" />
          </div>
          <div>
            <label class="text-xs text-slate-500">结束日期</label>
            <input type="date" v-model="form.end" class="w-full mt-1 px-2 py-2 rounded-lg border border-slate-200 text-sm" />
          </div>
        </div>

        <div>
          <label class="text-xs text-slate-500">策略</label>
          <select v-model="form.strategy" class="w-full mt-1 px-2 py-2 rounded-lg border border-slate-200 text-sm">
            <option value="t1_take_profit">T+1 有效止盈</option>
            <option value="t1_confirmed">T+1 + 买入技术确认</option>
            <option value="buy_and_hold">买入持有（基准）</option>
          </select>
        </div>

        <template v-if="form.strategy === 't1_take_profit' || form.strategy === 't1_confirmed'">
          <div class="grid grid-cols-2 gap-2">
            <div>
              <label class="text-xs text-slate-500">有效止盈阈值 %</label>
              <input v-model.number="form.take_profit_pct" type="number" step="0.05" min="0"
                class="w-full mt-1 px-2 py-2 rounded-lg border border-slate-200 text-sm" />
            </div>
            <div>
              <label class="text-xs text-slate-500">止损 %</label>
              <input v-model.number="form.stop_loss_pct" type="number" step="1"
                class="w-full mt-1 px-2 py-2 rounded-lg border border-slate-200 text-sm" />
            </div>
          </div>
          <div class="grid grid-cols-2 gap-2">
            <div>
              <label class="text-xs text-slate-500">移动止盈回撤 %</label>
              <input v-model.number="form.trailing_stop_pct" type="number" step="1" min="0"
                placeholder="留空=关闭" class="w-full mt-1 px-2 py-2 rounded-lg border border-slate-200 text-sm" />
            </div>
            <div>
              <label class="text-xs text-slate-500">持仓天数上限</label>
              <input v-model.number="form.max_hold_days" type="number" step="1" min="1"
                placeholder="留空=不限" class="w-full mt-1 px-2 py-2 rounded-lg border border-slate-200 text-sm" />
            </div>
          </div>
          <label class="flex items-center gap-2 text-xs text-slate-600 mt-1 cursor-pointer">
            <input type="checkbox" v-model="form.require_d1_hold" class="accent-indigo-500" />
            D0 已达标时校验 D1 开盘守住（T+1 强校验）
          </label>
          <template v-if="form.strategy === 't1_confirmed'">
            <div>
              <label class="text-xs text-slate-500">买入确认信号</label>
              <select v-model="form.entry_mode" class="w-full mt-1 px-2 py-2 rounded-lg border border-slate-200 text-sm">
                <option value="volume_break">放量突破</option>
                <option value="ma_bull">均线多头</option>
                <option value="none">直接建仓</option>
              </select>
            </div>
            <div class="grid grid-cols-2 gap-2" v-if="form.entry_mode === 'ma_bull'">
              <div>
                <label class="text-xs text-slate-500">短均线</label>
                <input v-model.number="form.ma_short" type="number" step="1" min="1"
                  class="w-full mt-1 px-2 py-2 rounded-lg border border-slate-200 text-sm" />
              </div>
              <div>
                <label class="text-xs text-slate-500">长均线</label>
                <input v-model.number="form.ma_long" type="number" step="1" min="1"
                  class="w-full mt-1 px-2 py-2 rounded-lg border border-slate-200 text-sm" />
              </div>
            </div>
            <div class="grid grid-cols-2 gap-2" v-if="form.entry_mode === 'volume_break'">
              <div>
                <label class="text-xs text-slate-500">放量窗口</label>
                <input v-model.number="form.vol_window" type="number" step="1" min="1"
                  class="w-full mt-1 px-2 py-2 rounded-lg border border-slate-200 text-sm" />
              </div>
              <div>
                <label class="text-xs text-slate-500">放量倍数</label>
                <input v-model.number="form.vol_mult" type="number" step="0.1" min="0"
                  class="w-full mt-1 px-2 py-2 rounded-lg border border-slate-200 text-sm" />
              </div>
            </div>
          </template>
        </template>

        <div>
          <label class="text-xs text-slate-500">初始资金</label>
          <input v-model.number="form.initial_cash" type="number" class="w-full mt-1 px-2 py-2 rounded-lg border border-slate-200 text-sm" />
        </div>

        <label class="flex items-center gap-2 text-xs text-slate-600 cursor-pointer">
          <input type="checkbox" v-model="form.compare_benchmark" class="accent-indigo-500" />
          对比沪深300基准
        </label>

        <button @click="run" :disabled="loading"
          class="w-full px-4 py-2.5 rounded-lg text-sm font-bold text-white bg-indigo-500 hover:bg-indigo-600 disabled:opacity-50 flex items-center justify-center gap-2">
          <Play class="w-4 h-4" />{{ loading ? '回测中…' : '运行回测' }}
        </button>

        <!-- 本地标的列表 -->
        <div v-if="symbols.length" class="mt-2">
          <p class="text-xs text-slate-400 mb-1">本地已同步标的 ({{ symbols.length }})</p>
          <div class="max-h-48 overflow-y-auto space-y-1">
            <button v-for="s in symbols" :key="s.code" type="button"
              @click="form.code = s.code"
              class="w-full text-left px-2 py-1.5 rounded-lg border text-xs hover:border-indigo-300 hover:bg-indigo-50 transition-colors"
              :class="form.code === s.code ? 'border-indigo-400 bg-indigo-50' : 'border-slate-100'">
              <span class="font-medium text-slate-700">{{ s.code }}</span>
              <span class="text-slate-400 ml-1">{{ s.name || '' }}</span>
              <span class="float-right text-slate-300">{{ s.bar_count || 0 }} bar</span>
            </button>
          </div>
        </div>
      </section>

      <!-- 右侧结果面板 -->
      <section class="bg-white rounded-xl p-4 card-shadow flex flex-col gap-3 min-w-0">
        <template v-if="!report">
          <div class="flex-1 min-h-[300px] rounded-xl border-2 border-dashed border-slate-100 flex flex-col items-center justify-center text-center px-6">
            <LineChart class="w-12 h-12 text-slate-200 mb-3" />
            <p class="text-sm font-semibold text-slate-400">尚未运行回测</p>
            <p class="text-xs text-slate-300 mt-1 leading-5">选择代码与参数后点击「运行回测」。<br/>数据来源默认 baostock（真实、可复权）。</p>
          </div>
        </template>

        <template v-else>
          <!-- 指标卡 -->
          <div class="grid grid-cols-2 md:grid-cols-4 gap-2">
            <MetricCard label="总收益" :value="report.metrics.total_return_pct" suffix="%" :positive="report.metrics.total_return_pct >= 0" />
            <MetricCard label="年化收益" :value="report.metrics.annualized_pct" suffix="%" :positive="report.metrics.annualized_pct >= 0" />
            <MetricCard label="最大回撤" :value="report.metrics.max_drawdown_pct" suffix="%" :positive="false" warn />
            <MetricCard label="夏普比率" :value="report.metrics.sharpe_ratio" :positive="report.metrics.sharpe_ratio >= 1" />
            <MetricCard label="胜率" :value="report.metrics.win_rate_pct" suffix="%" :positive="report.metrics.win_rate_pct >= 50" />
            <MetricCard label="盈亏比" :value="report.metrics.profit_loss_ratio" :positive="report.metrics.profit_loss_ratio && report.metrics.profit_loss_ratio >= 1" />
            <MetricCard label="交易次数" :value="report.metrics.trade_count" />
            <MetricCard label="期末资产" :value="report.metrics.final_equity" :prefix="'¥'" :positive="true" />
          </div>

          <!-- 基准对比（可选） -->
          <div v-if="report.benchmark" class="flex items-center gap-2 text-xs px-1">
            <span class="text-slate-400">vs 沪深300 基准: </span>
            <span class="font-semibold" :class="report.benchmark.total_return_pct >= 0 ? 'text-profit' : 'text-loss'">
              收益 {{ report.benchmark.total_return_pct }}%
            </span>
            <span class="text-slate-300">·</span>
            <span class="text-slate-500">最大回撤 {{ report.benchmark.max_drawdown_pct }}%</span>
            <span v-if="report.metrics.total_return_pct > report.benchmark.total_return_pct"
              class="px-1.5 py-0.5 rounded bg-emerald-50 text-emerald-600 font-semibold">超额收益 ✓</span>
          </div>

          <!-- 净值曲线（叠加基准 + 买卖点 + 持仓条） -->
          <div>
            <p class="text-xs font-semibold text-slate-600 mb-1">净值曲线（初始 {{ report.metrics.initial_cash }}）</p>
            <EquityChartView
              :data="report.equity_curve.map(p => ({ date: p.date, value: p.equity }))"
              :overlay="report.benchmark && report.benchmark.equity_curve ? report.benchmark.equity_curve.map(p => ({ date: p.date, value: p.equity })) : []"
              :trades="report.trades.map(t => ({ entry_date: t.entry_date, exit_date: t.exit_date }))"
              height="200" />
          </div>
          <!-- 回撤曲线 -->
          <div>
            <p class="text-xs font-semibold text-slate-600 mb-1">回撤曲线</p>
            <LineChartView :data="report.drawdown_curve.map(p => ({ date: p.date, value: p.drawdown_pct }))" height="120" invert fill color="#ef4444" format-value="%"
              :negative-fill="true" />
          </div>

          <!-- 交易明细 -->
          <div>
            <p class="text-xs font-semibold text-slate-600 mb-1">交易明细 ({{ report.trades.length }})</p>
            <div class="max-h-56 overflow-y-auto rounded-lg border border-slate-100">
              <table class="w-full text-xs">
                <thead class="sticky top-0 bg-slate-50 text-slate-400">
                  <tr>
                    <th class="text-left px-2 py-1.5">买入日</th>
                    <th class="text-left px-2 py-1.5">卖出日</th>
                    <th class="text-right px-2 py-1.5">买入价</th>
                    <th class="text-right px-2 py-1.5">卖出价</th>
                    <th class="text-right px-2 py-1.5">收益%</th>
                    <th class="text-right px-2 py-1.5">净盈亏</th>
                    <th class="text-right px-2 py-1.5">原因</th>
                  </tr>
                </thead>
                <tbody>
                  <tr v-for="(t, i) in report.trades" :key="i" class="border-t border-slate-50"
                    :class="t.net_pnl >= 0 ? 'bg-profit/5' : 'bg-loss/5'">
                    <td class="px-2 py-1.5 text-slate-500">{{ t.entry_date }}</td>
                    <td class="px-2 py-1.5 text-slate-500">{{ t.exit_date }}</td>
                    <td class="px-2 py-1.5 text-right">{{ t.entry_price }}</td>
                    <td class="px-2 py-1.5 text-right">{{ t.exit_price }}</td>
                    <td class="px-2 py-1.5 text-right font-medium" :class="t.return_pct >= 0 ? 'text-profit' : 'text-loss'">
                      {{ t.return_pct }}%
                    </td>
                    <td class="px-2 py-1.5 text-right font-medium" :class="t.net_pnl >= 0 ? 'text-profit' : 'text-loss'">
                      {{ t.net_pnl }}
                    </td>
                    <td class="px-2 py-1.5 text-right">
                      <span class="px-1.5 py-0.5 rounded text-[10px]" :class="reasonClass(t.reason)">{{ reasonText(t.reason) }}</span>
                    </td>
                  </tr>
                  <tr v-if="!report.trades.length"><td colspan="7" class="px-2 py-4 text-center text-slate-300">无成交记录</td></tr>
                </tbody>
              </table>
            </div>
          </div>
        </template>
      </section>
    </div>

    <!-- AI 投研助手 -->
    <section class="mt-3 bg-white rounded-xl p-4 card-shadow flex flex-col gap-3">
      <div class="flex items-center gap-2">
        <span class="w-2 h-2 rounded-full bg-indigo-500" />
        <h4 class="text-sm font-bold text-slate-700">AI 投研助手</h4>
        <span class="text-[11px] text-slate-400">自然语言驱动：同步→回测→报告</span>
      </div>
      <div class="flex gap-2">
        <input v-model="agentMsg" @keyup.enter="sendAgent" placeholder="试试：回测茅台，止盈5%，止损5%"
          class="flex-1 min-w-0 px-3 py-2 rounded-lg border border-slate-200 text-sm focus:outline-none focus:border-indigo-300" />
        <button @click="sendAgent" :disabled="agentBusy"
          class="px-4 py-2 rounded-lg text-sm font-medium text-white bg-indigo-500 hover:bg-indigo-600 disabled:opacity-50 flex items-center gap-1">
          <Sparkles class="w-4 h-4" />{{ agentBusy ? '思考中…' : '执行' }}
        </button>
      </div>
      <template v-if="agentOut">
        <div class="rounded-xl border border-indigo-100 bg-indigo-50/50 p-3">
          <div v-if="agentOut.steps && agentOut.steps.length" class="text-[11px] text-slate-400 mb-1 flex flex-wrap gap-1">
            <span v-for="(s, i) in agentOut.steps" :key="i" class="px-1.5 py-0.5 rounded bg-white border border-indigo-100">
              {{ s.tool }}
            </span>
          </div>
          <pre class="text-xs text-slate-700 whitespace-pre-wrap leading-relaxed font-sans">{{ agentOut.message }}</pre>
        </div>
      </template>
    </section>
  </div>
</template>

<script setup>
import { ref, reactive } from 'vue'
import { Gauge, LineChart, Play, RefreshCw, Sparkles } from 'lucide-vue-next'
import { quantApi } from '../utils/api'
import LineChartView from './quant/LineChartView.vue'
import MetricCard from './quant/MetricCard.vue'
import EquityChartView from './quant/EquityChartView.vue'

const serviceUp = ref(false)
const checking = ref(false)
const loading = ref(false)
const syncing = ref(false)
const syncErr = ref(false)
const syncMsg = ref('')
const symbols = ref([])
const report = ref(null)

const form = reactive({
  code: '',
  strategy: 't1_take_profit',
  take_profit_pct: 5,
  stop_loss_pct: -5,
  require_d1_hold: true,
  trailing_stop_pct: null,
  max_hold_days: null,
  entry_mode: 'volume_break',
  ma_short: 5,
  ma_long: 20,
  vol_window: 20,
  vol_mult: 1.5,
  start: '',
  end: '',
  initial_cash: 1000000,
  compare_benchmark: true,
})

async function ping() {
  checking.value = true
  serviceUp.value = false
  try {
    await quantApi.ping()
    serviceUp.value = true
  } catch (e) {
    serviceUp.value = false
  } finally {
    checking.value = false
  }
}

async function loadSymbols() {
  try {
    const res = await quantApi.listSymbols()
    symbols.value = (res && res.symbols) || []
  } catch (e) {
    symbols.value = []
  }
}

async function sync() {
  if (!form.code) return
  syncing.value = true
  syncMsg.value = ''
  syncErr.value = false
  try {
    const res = await quantApi.syncSymbol({
      code: form.code.trim(),
      start: form.start || '2018-01-01',
      end: form.end || undefined,
    })
    syncMsg.value = `同步完成：写入 ${res.written} 条，覆盖 ${res.first_date} ~ ${res.last_date}`
    await loadSymbols()
  } catch (e) {
    syncErr.value = true
    syncMsg.value = e.response?.data?.detail || e.message || '同步失败'
  } finally {
    syncing.value = false
  }
}

async function run() {
  if (!form.code) return
  loading.value = true
  report.value = null
  const payload = {
    code: form.code.trim(),
    strategy: form.strategy,
    take_profit: form.take_profit_pct / 100,
    stop_loss: form.stop_loss_pct / 100,
    require_d1_hold: form.require_d1_hold,
    trailing_stop: (form.trailing_stop_pct === null || form.trailing_stop_pct === '') ? null : form.trailing_stop_pct / 100,
    max_hold_days: (form.max_hold_days === null || form.max_hold_days === '') ? null : form.max_hold_days,
    entry_mode: form.strategy === 't1_confirmed' ? form.entry_mode : undefined,
    ma_short: form.strategy === 't1_confirmed' ? form.ma_short : undefined,
    ma_long: form.strategy === 't1_confirmed' ? form.ma_long : undefined,
    vol_window: form.strategy === 't1_confirmed' ? form.vol_window : undefined,
    vol_mult: form.strategy === 't1_confirmed' ? form.vol_mult : undefined,
    compare_benchmark: form.compare_benchmark,
    start: form.start || undefined,
    end: form.end || undefined,
    initial_cash: form.initial_cash,
  }
  try {
    report.value = await quantApi.runBacktest(payload)
  } catch (e) {
    alert(e.response?.data?.detail || e.message || '回测失败')
  } finally {
    loading.value = false
  }
}

function reasonText(r) {
  return { RULE: '规则触发', TARGET: '达标', STOP_LOSS: '止损', END: '到期平仓' }[r] || r
}
function reasonClass(r) {
  if (r === 'STOP_LOSS') return 'bg-red-50 text-red-500'
  if (r === 'END') return 'bg-slate-100 text-slate-400'
  return 'bg-emerald-50 text-emerald-600'
}

// ---------- AI 助手 ----------
const agentMsg = ref('')
const agentBusy = ref(false)
const agentOut = ref(null)

async function sendAgent() {
  const t = (agentMsg.value || '').trim()
  if (!t || agentBusy.value) return
  agentBusy.value = true
  agentOut.value = null
  try {
    const res = await quantApi.agentChat({ text: t })
    agentOut.value = res
  } catch (e) {
    agentOut.value = { ok: false, message: e.response?.data?.detail || e.message || 'AI 调用失败' }
  } finally {
    agentBusy.value = false
  }
}

ping()
loadSymbols()
</script>