<template>
  <div class="w-full max-w-full min-w-0 overflow-x-hidden px-3 sm:px-4 lg:px-5 mt-3">
    <!-- 状态条 -->
    <div class="flex flex-wrap items-center gap-2 mb-2">
      <span class="text-sm font-bold text-slate-700 flex items-center gap-2">
        <Grid3x3 class="w-4 h-4 text-indigo-500" />批量回测 · 参数网格
      </span>
      <span class="px-2 py-0.5 rounded-full text-[11px] font-semibold"
        :class="serviceUp ? 'bg-emerald-50 text-emerald-600' : 'bg-red-50 text-red-500'">
        <span class="inline-block w-1.5 h-1.5 rounded-full mr-1 align-middle"
          :class="serviceUp ? 'bg-emerald-500' : 'bg-red-400'" />
        {{ serviceUp ? '量化服务在线' : '量化服务未连接' }}
      </span>
      <button v-if="!serviceUp" @click="ping" class="px-2 py-0.5 rounded text-[11px] text-indigo-500 border border-indigo-200 hover:bg-indigo-50">
        重试连接
      </button>
    </div>

    <div class="grid grid-cols-1 lg:grid-cols-[minmax(0,360px)_minmax(0,1fr)] gap-3">
      <!-- 左侧：配置 -->
      <section class="bg-white rounded-xl p-4 card-shadow flex flex-col gap-3 h-max">
        <h4 class="text-sm font-bold text-slate-700">网格配置</h4>

        <div>
          <label class="text-xs text-slate-500">股票代码（逗号分隔）</label>
          <textarea v-model="codesText" rows="3" placeholder="600000, 000001, sh.600519&#10;或使用下方已同步标的"
            class="w-full mt-1 px-3 py-2 rounded-lg border border-slate-200 text-sm focus:outline-none focus:border-indigo-300 resize-none" />
        </div>

        <!-- 已同步标的快速勾选 -->
        <div v-if="symbols.length">
          <p class="text-xs text-slate-400 mb-1">已同步标的 ({{ symbols.length }})</p>
          <div class="max-h-40 overflow-y-auto space-y-1">
            <label v-for="s in symbols" :key="s.code" class="flex items-center gap-2 px-2 py-1 rounded-lg border cursor-pointer text-xs transition-colors"
              :class="selected.has(s.code) ? 'border-indigo-400 bg-indigo-50' : 'border-slate-100 hover:border-indigo-200'">
              <input type="checkbox" :value="s.code" v-model="selectedCodes" class="accent-indigo-500"
                @click.stop />
              <span class="font-medium text-slate-700">{{ s.code }}</span>
              <span class="text-slate-400 ml-1 truncate">{{ s.name || '' }}</span>
              <span class="float-right text-slate-300">{{ s.bar_count || 0 }} bar</span>
            </label>
          </div>
          <button @click="applySelected" class="mt-2 px-2 py-1 rounded text-[11px] text-indigo-500 border border-indigo-200 hover:bg-indigo-50">
            应用勾选到输入框
          </button>
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
            <option value="buy_and_hold">买入持有（基准）</option>
          </select>
        </div>

        <!-- 参数扫描范围 -->
        <template v-if="form.strategy === 't1_take_profit'">
          <div>
            <label class="text-xs text-slate-500">止盈阈值扫描 %（逗号分隔）</label>
            <input v-model="form.take_profit_vals" placeholder="3, 5, 10, 20"
              class="w-full mt-1 px-3 py-2 rounded-lg border border-slate-200 text-sm" />
          </div>
          <div>
            <label class="text-xs text-slate-500">止损扫描 %（逗号分隔）</label>
            <input v-model="form.stop_loss_vals" placeholder="-3, -5, -8"
              class="w-full mt-1 px-3 py-2 rounded-lg border border-slate-200 text-sm" />
          </div>
          <label class="flex items-center gap-2 text-xs text-slate-600 cursor-pointer">
            <input type="checkbox" v-model="form.require_d1_hold" class="accent-indigo-500" />
            D0 已达标时校验 D1 开盘守住（T+1 强校验）
          </label>
        </template>

        <div>
          <label class="text-xs text-slate-500">初始资金</label>
          <input v-model.number="form.initial_cash" type="number" class="w-full mt-1 px-2 py-2 rounded-lg border border-slate-200 text-sm" />
        </div>

        <div>
          <label class="text-xs text-slate-500">最优排序指标</label>
          <select v-model="form.best_key" class="w-full mt-1 px-2 py-2 rounded-lg border border-slate-200 text-sm">
            <option value="sharpe_ratio">夏普比率</option>
            <option value="total_return">总收益</option>
            <option value="annualized_return">年化收益</option>
            <option value="win_rate">胜率</option>
            <option value="profit_loss_ratio">盈亏比</option>
          </select>
        </div>

        <button @click="runGrid" :disabled="loading"
          class="w-full px-4 py-2.5 rounded-lg text-sm font-bold text-white bg-indigo-500 hover:bg-indigo-600 disabled:opacity-50 flex items-center justify-center gap-2">
          <Grid3x3 class="w-4 h-4" />{{ loading ? `扫描中 (${gridSize} 组合)…` : '运行批量扫描' }}
        </button>
        <p v-if="gridSize > 0" class="text-[11px] text-slate-400 text-center">共 {{ gridSize }} 个参数组合</p>
      </section>

      <!-- 右侧：结果 -->
      <section class="bg-white rounded-xl p-4 card-shadow flex flex-col gap-3 min-w-0">
        <template v-if="!result">
          <div class="flex-1 min-h-[300px] rounded-xl border-2 border-dashed border-slate-100 flex flex-col items-center justify-center text-center px-6">
            <Grid3x3 class="w-12 h-12 text-slate-200 mb-3" />
            <p class="text-sm font-semibold text-slate-400">尚未运行批量扫描</p>
            <p class="text-xs text-slate-300 mt-1 leading-5">输入股票代码与参数扫描范围，点击「运行批量扫描」。<br/>结果按「最优排序指标」给出最佳参数组合。</p>
          </div>
        </template>

        <template v-else>
          <!-- 最优组合卡片 -->
          <div v-if="result.best" class="rounded-xl border border-emerald-200 bg-emerald-50/40 p-3">
            <p class="text-xs font-bold text-emerald-700 mb-1.5 flex items-center gap-1">
              <Award class="w-3.5 h-3.5" />最优参数组合（按 {{ bestKeyText }}）
            </p>
            <div class="grid grid-cols-2 md:grid-cols-3 gap-x-4 gap-y-1 text-xs">
              <span class="text-slate-500">股票: <b class="text-slate-700">{{ result.best.code }}</b> <span class="text-slate-400">{{ result.best.name || '' }}</span></span>
              <span v-if="result.best.take_profit != null" class="text-slate-500">止盈: <b class="text-slate-700">{{ (result.best.take_profit * 100).toFixed(0) }}%</b></span>
              <span v-if="result.best.stop_loss != null" class="text-slate-500">止损: <b class="text-slate-700">{{ (result.best.stop_loss * 100).toFixed(0) }}%</b></span>
              <span class="text-slate-500">收益: <b :class="result.best.total_return >= 0 ? 'text-profit' : 'text-loss'">{{ (result.best.total_return * 100).toFixed(2) }}%</b></span>
              <span class="text-slate-500">夏普: <b class="text-slate-700">{{ result.best.sharpe_ratio }}</b></span>
              <span class="text-slate-500">回撤: <b class="text-slate-700">{{ (result.best.max_drawdown * 100).toFixed(2) }}%</b></span>
            </div>
          </div>

          <!-- 跳过说明 -->
          <p v-if="result.skipped && result.skipped.length" class="text-[11px] text-amber-600">
            未同步/无数据跳过: {{ result.skipped.join(', ') }}
          </p>

          <!-- 对比表 -->
          <div>
            <p class="text-xs font-semibold text-slate-600 mb-1">对比表 ({{ result.rows.length }} 行)</p>
            <div class="max-h-[420px] overflow-y-auto rounded-lg border border-slate-100">
              <table class="w-full text-xs">
                <thead class="sticky top-0 bg-slate-50 text-slate-400">
                  <tr>
                    <th class="text-left px-2 py-1.5">代码</th>
                    <th v-if="result.rows.some(r => r.take_profit != null)" class="text-right px-2 py-1.5">止盈%</th>
                    <th v-if="result.rows.some(r => r.stop_loss != null)" class="text-right px-2 py-1.5">止损%</th>
                    <th class="text-right px-2 py-1.5">收益%</th>
                    <th class="text-right px-2 py-1.5">年化%</th>
                    <th class="text-right px-2 py-1.5">回撤%</th>
                    <th class="text-right px-2 py-1.5">夏普</th>
                    <th class="text-right px-2 py-1.5">胜率%</th>
                    <th class="text-right px-2 py-1.5">盈亏比</th>
                    <th class="text-right px-2 py-1.5">交易</th>
                  </tr>
                </thead>
                <tbody>
                  <tr v-for="(r, i) in result.rows" :key="i" class="border-t border-slate-50"
                    :class="isBest(r) ? 'bg-emerald-50/60 font-medium' : ''">
                    <td class="px-2 py-1.5 text-slate-600">{{ r.code }}<span class="text-slate-300 ml-1">{{ r.name || '' }}</span></td>
                    <td v-if="r.take_profit != null" class="px-2 py-1.5 text-right">{{ (r.take_profit * 100).toFixed(0) }}</td>
                    <td v-if="r.stop_loss != null" class="px-2 py-1.5 text-right">{{ (r.stop_loss * 100).toFixed(0) }}</td>
                    <td class="px-2 py-1.5 text-right font-medium" :class="r.total_return >= 0 ? 'text-profit' : 'text-loss'">{{ (r.total_return * 100).toFixed(2) }}</td>
                    <td class="px-2 py-1.5 text-right" :class="r.annualized_return >= 0 ? 'text-profit' : 'text-loss'">{{ (r.annualized_return * 100).toFixed(2) }}</td>
                    <td class="px-2 py-1.5 text-right text-slate-500">{{ (r.max_drawdown * 100).toFixed(2) }}</td>
                    <td class="px-2 py-1.5 text-right" :class="r.sharpe_ratio >= 1 ? 'text-profit' : 'text-slate-500'">{{ r.sharpe_ratio }}</td>
                    <td class="px-2 py-1.5 text-right" :class="r.win_rate >= 0.5 ? 'text-profit' : 'text-slate-500'">{{ (r.win_rate * 100).toFixed(1) }}</td>
                    <td class="px-2 py-1.5 text-right text-slate-500">{{ r.profit_loss_ratio != null ? r.profit_loss_ratio : '—' }}</td>
                    <td class="px-2 py-1.5 text-right text-slate-400">{{ r.trade_count }}</td>
                  </tr>
                  <tr v-if="!result.rows.length"><td :colspan="10" class="px-2 py-4 text-center text-slate-300">无有效结果</td></tr>
                </tbody>
              </table>
            </div>
          </div>
        </template>
      </section>
    </div>
  </div>
</template>

<script setup>
import { ref, reactive, computed } from 'vue'
import { Grid3x3, Award } from 'lucide-vue-next'
import { quantApi } from '../../utils/api'

const serviceUp = ref(false)
const loading = ref(false)
const symbols = ref([])
const result = ref(null)
const selected = computed(() => new Set(selectedCodes.value))

const form = reactive({
  start: '',
  end: '',
  strategy: 't1_take_profit',
  take_profit_vals: '3, 5, 10, 20',
  stop_loss_vals: '-3, -5, -8',
  require_d1_hold: true,
  initial_cash: 1000000,
  best_key: 'sharpe_ratio',
})
const codesText = ref('')
const selectedCodes = ref([])

function parseVals(str) {
  return str.split(/[,，\s]+/).map(s => parseFloat(s)).filter(v => !isNaN(v))
}

const gridSize = computed(() => {
  if (form.strategy !== 't1_take_profit') return 1
  const tp = parseVals(form.take_profit_vals).length
  const sl = parseVals(form.stop_loss_vals).length
  return Math.max(tp, 1) * Math.max(sl, 1)
})

const bestKeyText = computed(() => ({
  sharpe_ratio: '夏普比率', total_return: '总收益', annualized_return: '年化收益',
  win_rate: '胜率', profit_loss_ratio: '盈亏比',
}[form.best_key] || form.best_key))

function isBest(r) {
  return result.value.best && result.value.best === r
}

async function ping() {
  serviceUp.value = false
  try { await quantApi.ping(); serviceUp.value = true } catch (e) { serviceUp.value = false }
}
async function loadSymbols() {
  try {
    const res = await quantApi.listSymbols()
    symbols.value = (res && res.symbols) || []
  } catch (e) { symbols.value = [] }
}
function applySelected() {
  codesText.value = selectedCodes.value.join(', ')
}

async function runGrid() {
  const codes = codesText.value.split(/[,，\s]+/).map(s => s.trim()).filter(Boolean)
  if (!codes.length) { alert('请输入至少一个股票代码'); return }
  loading.value = true
  result.value = null
  const params = {}
  if (form.strategy === 't1_take_profit') {
    const tp = parseVals(form.take_profit_vals).map(v => v / 100)
    const sl = parseVals(form.stop_loss_vals).map(v => v / 100)
    if (tp.length) params.take_profit = tp
    if (sl.length) params.stop_loss = sl
    if (form.require_d1_hold) params.require_d1_hold = [true]
  }
  const payload = {
    codes,
    strategy: form.strategy,
    params,
    start: form.start || undefined,
    end: form.end || undefined,
    initial_cash: form.initial_cash,
    best_key: form.best_key,
  }
  try {
    result.value = await quantApi.runGrid(payload)
  } catch (e) {
    alert(e.response?.data?.detail || e.message || '批量扫描失败')
  } finally {
    loading.value = false
  }
}

ping()
loadSymbols()
</script>