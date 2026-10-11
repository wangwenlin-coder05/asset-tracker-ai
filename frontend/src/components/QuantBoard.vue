<template>
  <div class="w-full max-w-full min-w-0 overflow-x-hidden px-3 sm:px-4 lg:px-5 mt-3">
    <!-- 顶部：标题 + 服务开关 + 说明 -->
    <div class="flex flex-wrap items-center gap-3 mb-3">
      <span class="text-base font-bold text-slate-800 flex items-center gap-2">
        <Gauge class="w-5 h-5 text-indigo-500" />策略回测工作台
      </span>

      <!-- 量化服务开关 -->
      <button @click="toggleService" :disabled="serviceBusy"
        class="flex items-center gap-2 px-3 py-1.5 rounded-full border text-xs font-semibold transition-colors disabled:opacity-60"
        :class="serviceUp
          ? 'border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100'
          : 'border-slate-200 bg-white text-slate-500 hover:bg-slate-50'">
        <span class="relative inline-flex w-8 h-4 rounded-full transition-colors"
          :class="serviceUp ? 'bg-emerald-500' : 'bg-slate-300'">
          <span class="absolute top-0.5 w-3 h-3 rounded-full bg-white shadow transition-all duration-200"
            :class="serviceUp ? 'left-[18px]' : 'left-0.5'" />
        </span>
        {{ serviceBusy ? '处理中…' : (serviceUp ? '量化服务已开启' : '量化服务已关闭') }}
      </button>
      <span v-if="checking" class="text-[11px] text-slate-400">检测中…</span>

      <button @click="showHelp = true"
        class="ml-auto px-2 py-1 rounded text-[11px] text-slate-500 border border-slate-200 hover:bg-slate-100 transition-colors flex items-center gap-1">
        <HelpCircle class="w-3.5 h-3.5" />操作说明
      </button>
    </div>

    <!-- 服务未开启提示 -->
    <div v-if="!serviceUp && !checking"
      class="mb-3 rounded-xl border border-amber-200 bg-amber-50/70 px-4 py-3 text-xs text-amber-800 flex flex-wrap items-center gap-2">
      <AlertCircle class="w-4 h-4 flex-shrink-0" />
      <span>量化服务未开启，回测跑不了。点上方开关一键启动，不用再手动敲命令。</span>
      <span v-if="serviceErr" class="text-red-600 font-medium">{{ serviceErr }}</span>
    </div>

    <!-- ① 策略选择（点选 / 多选） -->
    <section class="bg-white rounded-xl p-4 card-shadow mb-3">
      <div class="flex flex-wrap items-center justify-between gap-2 mb-3">
        <div class="flex items-center gap-2">
          <h4 class="text-sm font-bold text-slate-700">① 选择策略</h4>
          <span class="text-[11px] text-slate-400">点卡片即可选中，支持多选 → 一次横向对比多个策略</span>
        </div>
        <div class="flex items-center gap-3 text-[11px]">
          <span class="text-slate-400">已选 {{ selectedStrategies.size }} 个</span>
          <button @click="selectAllStrategies" class="text-indigo-500 hover:text-indigo-700">全选</button>
          <button @click="clearStrategies" class="text-slate-400 hover:text-slate-600">清空</button>
          <button @click="openStudio"
            class="px-3 py-1.5 rounded-lg text-xs font-bold text-white bg-gradient-to-r from-indigo-500 to-violet-500 hover:opacity-90 flex items-center gap-1.5 shadow-sm">
            <Sparkles class="w-3.5 h-3.5" />AI 策略工坊
            <span v-if="customStrategies.length" class="px-1.5 rounded-full bg-white/25 text-[10px] leading-4">{{ customStrategies.length }}</span>
          </button>
        </div>
      </div>

      <div class="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-2.5">
        <div v-for="s in strategyCards" :key="s.key" @click="toggleStrategy(s.key)"
          class="rounded-xl border-2 p-3 cursor-pointer transition-all select-none"
          :class="selectedStrategies.has(s.key)
            ? 'border-indigo-400 bg-indigo-50/60 shadow-sm'
            : 'border-slate-100 bg-white hover:border-indigo-200 hover:bg-slate-50'">
          <div class="flex items-center gap-2">
            <span class="w-4 h-4 rounded-md border flex items-center justify-center flex-shrink-0"
              :class="selectedStrategies.has(s.key) ? 'bg-indigo-500 border-indigo-500' : 'border-slate-300 bg-white'">
              <Check v-if="selectedStrategies.has(s.key)" class="w-3 h-3 text-white" />
            </span>
            <span class="text-sm font-bold text-slate-700 flex-1 min-w-0 truncate">{{ s.name }}</span>
            <span class="px-1.5 py-0.5 rounded text-[10px] font-medium flex-shrink-0" :class="s.badgeClass">{{ s.badge }}</span>
            <button v-if="s.custom" @click.stop="deleteCustomStrategy(s)"
              class="flex-shrink-0 w-5 h-5 rounded-md flex items-center justify-center text-slate-400 hover:text-red-500 hover:bg-red-50"
              title="删除此策略">
              <Trash2 class="w-3 h-3" />
            </button>
          </div>

          <p class="text-[11px] text-slate-500 mt-1.5">{{ s.summary }}</p>

          <div class="mt-2 space-y-0.5 text-[11px] leading-5">
            <p><span class="text-emerald-600 font-semibold mr-1">买</span><span class="text-slate-600">{{ s.buy }}</span></p>
            <p><span class="text-red-500 font-semibold mr-1">卖</span><span class="text-slate-600">{{ s.sell }}</span></p>
          </div>
          <p class="text-[10px] text-slate-400 mt-1.5">适合：{{ s.scene }}</p>

          <!-- 选中后展开该策略的参数 -->
          <div v-if="selectedStrategies.has(s.key) && visibleFields(s.key).length" @click.stop
            class="mt-2.5 pt-2.5 border-t border-indigo-100 grid grid-cols-2 gap-2">
            <template v-for="f in visibleFields(s.key)" :key="f[0]">
              <label v-if="f[2] === 'check'"
                class="col-span-2 flex items-center gap-1.5 text-[11px] text-slate-600 cursor-pointer">
                <input type="checkbox" v-model="params[s.key][f[0]]" class="accent-indigo-500" />{{ f[1] }}
              </label>
              <div v-else-if="f[2] === 'select'" class="col-span-2">
                <span class="text-[11px] text-slate-500">{{ f[1] }}</span>
                <select v-model="params[s.key][f[0]]"
                  class="w-full mt-1 px-2 py-1.5 rounded-lg border border-slate-200 text-xs bg-white">
                  <option v-for="o in f[3].options" :key="o[0]" :value="o[0]">{{ o[1] }}</option>
                </select>
              </div>
              <div v-else>
                <span class="text-[11px] text-slate-500">{{ f[1] }}</span>
                <input type="number" v-model.number="params[s.key][f[0]]" :step="f[3].step" :min="f[3].min"
                  :placeholder="f[3].ph || ''"
                  class="w-full mt-1 px-2 py-1.5 rounded-lg border border-slate-200 text-xs" />
              </div>
            </template>
          </div>
        </div>
      </div>
    </section>

    <div class="grid grid-cols-1 lg:grid-cols-[minmax(0,330px)_minmax(0,1fr)] gap-3">
      <!-- ② 回测设置 -->
      <section class="bg-white rounded-xl p-4 card-shadow flex flex-col gap-3 h-max">
        <div class="flex items-center justify-between">
          <h4 class="text-sm font-bold text-slate-700">② 回测设置</h4>
          <button class="text-[11px] text-indigo-500 hover:text-indigo-700" @click="loadSymbols">刷新标的</button>
        </div>

        <div>
          <label class="text-xs text-slate-500">股票代码</label>
          <div class="flex gap-2 mt-1">
            <input v-model="form.code" @input="onCodeInput" placeholder="如 600000 / sh.600000"
              class="flex-1 min-w-0 px-3 py-2 rounded-lg border border-slate-200 text-sm focus:outline-none focus:border-indigo-300" />
            <button @click="sync" :disabled="syncing || !serviceUp"
              class="px-3 py-2 rounded-lg text-sm font-medium text-white bg-slate-500 hover:bg-slate-600 disabled:opacity-50 flex items-center gap-1">
              <RefreshCw class="w-3.5 h-3.5" :class="syncing && 'animate-spin'" />同步
            </button>
          </div>
          <p v-if="syncMsg" class="text-[11px] mt-1" :class="syncErr ? 'text-red-500' : 'text-emerald-600'">{{ syncMsg }}</p>
        </div>

        <div>
          <div class="flex items-center justify-between">
            <label class="text-xs text-slate-500">回测区间</label>
            <button v-if="symbolRange" @click="applySymbolRange"
              class="text-[11px] text-indigo-500 hover:text-indigo-700">用标的范围</button>
          </div>
          <!-- 快捷区间 -->
          <div class="flex flex-wrap gap-1 mt-1.5">
            <button v-for="p in datePresets" :key="p.label" type="button" @click="applyPreset(p.months)"
              class="px-2 py-0.5 rounded-full text-[11px] border transition-colors"
              :class="isPresetActive(p.months) ? 'border-indigo-400 bg-indigo-50 text-indigo-600' : 'border-slate-200 text-slate-500 hover:border-indigo-300 hover:text-indigo-600'">
              {{ p.label }}
            </button>
          </div>
          <div class="grid grid-cols-2 gap-2 mt-2">
            <div>
              <label class="text-[11px] text-slate-400">开始日期</label>
              <div class="mt-1">
                <DatePicker v-model="form.start" placeholder="开始日期" />
              </div>
            </div>
            <div>
              <label class="text-[11px] text-slate-400">结束日期</label>
              <div class="mt-1">
                <DatePicker v-model="form.end" placeholder="结束日期" />
              </div>
            </div>
          </div>
          <p v-if="symbolRange" class="text-[11px] text-slate-400 mt-1">
            标的可用区间 {{ symbolRange.first }} ~ {{ symbolRange.last }}
          </p>
        </div>

        <div>
          <label class="text-xs text-slate-500">初始资金</label>
          <input v-model.number="form.initial_cash" type="number"
            class="w-full mt-1 px-2 py-2 rounded-lg border border-slate-200 text-sm" />
        </div>

        <div>
          <label class="text-xs text-slate-500">首次建仓股数 <span class="text-slate-300">（留空=满仓）</span></label>
          <input v-model.number="form.initial_shares" type="number" min="100" step="100" placeholder="如 1000，留空则用全部资金买"
            class="w-full mt-1 px-2 py-2 rounded-lg border border-slate-200 text-sm" />
        </div>

        <div>
          <label class="text-xs text-slate-500">最大加仓次数 <span class="text-slate-300">（留空=不限）</span></label>
          <input v-model.number="form.max_adds" type="number" min="0" step="1" placeholder="如 5，留空表示不限制补仓次数"
            class="w-full mt-1 px-2 py-2 rounded-lg border border-slate-200 text-sm" />
        </div>

        <label class="flex items-center gap-2 text-xs text-slate-600 cursor-pointer">
          <input type="checkbox" v-model="form.compare_benchmark" class="accent-indigo-500" />
          对比沪深300基准
        </label>

        <button @click="run" :disabled="loading || !canRun"
          class="w-full px-4 py-2.5 rounded-lg text-sm font-bold text-white bg-indigo-500 hover:bg-indigo-600 disabled:opacity-50 flex items-center justify-center gap-2">
          <Play class="w-4 h-4" />{{ loading ? '回测中…' : runLabel }}
        </button>
        <p class="text-[11px] text-slate-400 -mt-1">
          {{ selectedStrategies.size }} 个策略 × {{ effectiveCodes.length }} 只标的 = {{ taskCount }} 次回测
        </p>

        <!-- 本地标的列表 -->
        <div v-if="symbols.length" class="mt-1">
          <div class="flex items-center justify-between mb-1">
            <p class="text-xs text-slate-400">本地已同步标的 ({{ symbols.length }}) · 已选 {{ selectedCodes.size }}</p>
            <div class="flex gap-2 text-[11px]">
              <button @click="selectAllSymbols" class="text-indigo-500 hover:text-indigo-700">全选</button>
              <button @click="clearSymbols" class="text-slate-400 hover:text-slate-600">清空</button>
            </div>
          </div>
          <div class="max-h-48 overflow-y-auto space-y-1">
            <button v-for="s in symbols" :key="s.code" type="button" @click="toggleSymbol(s.code)"
              class="w-full text-left px-2 py-1.5 rounded-lg border text-xs transition-colors"
              :class="selectedCodes.has(s.code) ? 'border-indigo-400 bg-indigo-50' : 'border-slate-100 hover:border-indigo-300 hover:bg-indigo-50'">
              <span class="mr-1 text-indigo-600" :class="selectedCodes.has(s.code) ? '' : 'opacity-0'">✓</span>
              <span class="font-medium text-slate-700">{{ s.code }}</span>
              <span class="text-slate-400 ml-1">{{ s.name || '' }}</span>
              <span class="float-right text-slate-300">{{ s.bar_count || 0 }} 根</span>
            </button>
          </div>
        </div>
      </section>

      <!-- ③ 结果 -->
      <section class="bg-white rounded-xl p-4 card-shadow flex flex-col gap-3 min-w-0">
        <!-- 多组合对比 -->
        <template v-if="multiReport.length">
          <div class="flex flex-wrap items-center justify-between gap-2">
            <h4 class="text-sm font-bold text-slate-700">③ 回测对比（{{ multiReport.length }} 组）</h4>
            <div class="flex items-center gap-2 text-[11px]">
              <span class="text-slate-400">点表头可排序</span>
              <button @click="clearResults" class="text-slate-400 hover:text-slate-600">清空</button>
            </div>
          </div>

          <div class="rounded-lg bg-slate-50 border border-slate-100 px-3 py-2 text-xs text-slate-600">
            <span class="font-semibold text-emerald-600">最赚：</span>
            <span v-if="bestRow">{{ bestRow.code }} · {{ stratName(bestRow.strategy) }} →
              {{ bestRow.minfo.total_return_pct }}%（回撤 {{ bestRow.minfo.max_drawdown_pct }}%）</span>
            <span v-else class="text-slate-400">全部失败</span>
          </div>

          <div class="overflow-x-auto">
            <table class="w-full text-xs border-collapse">
              <thead>
                <tr class="text-slate-400 border-b border-slate-100">
                  <th class="text-left py-1.5 pr-2 font-medium">标的 / 策略</th>
                  <th v-for="c in COLS" :key="c.k" @click="toggleSort(c.k)"
                    class="text-right px-1 font-medium cursor-pointer hover:text-indigo-500 whitespace-nowrap select-none">
                    {{ c.label }}<span v-if="sortKey === c.k">{{ sortDir < 0 ? ' ↓' : ' ↑' }}</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="row in sortedRows" :key="row.code + '|' + row.strategy"
                  class="border-b border-slate-50 hover:bg-indigo-50/40 cursor-pointer"
                  :class="isBest(row) && 'bg-emerald-50/50'" @click="viewDetail(row)">
                  <td class="py-1.5 pr-2">
                    <div class="flex items-center gap-1.5">
                      <span class="font-medium text-slate-700">{{ row.code }}</span>
                      <span v-if="isBest(row)" class="px-1 py-0.5 rounded text-[10px] bg-emerald-100 text-emerald-700 font-semibold">最佳</span>
                    </div>
                    <div class="text-[11px] text-indigo-500">{{ stratName(row.strategy) }}</div>
                    <div v-if="!row.ok" class="text-[11px] text-red-500">{{ row.error }}</div>
                  </td>
                  <template v-if="row.ok">
                    <td class="text-right px-1 font-semibold" :class="row.minfo.total_return_pct >= 0 ? 'text-profit' : 'text-loss'">{{ row.minfo.total_return_pct }}%</td>
                    <td class="text-right px-1 font-semibold" :class="row.minfo.annualized_pct >= 0 ? 'text-profit' : 'text-loss'">{{ row.minfo.annualized_pct }}%</td>
                    <td class="text-right px-1 font-semibold text-loss">{{ row.minfo.max_drawdown_pct }}%</td>
                    <td class="text-right px-1">{{ row.minfo.sharpe_ratio }}</td>
                    <td class="text-right px-1">{{ row.minfo.win_rate_pct }}%</td>
                    <td class="text-right px-1">{{ row.minfo.trade_count }}</td>
                  </template>
                  <template v-else>
                    <td colspan="6" class="text-right px-1 text-slate-300">—</td>
                  </template>
                </tr>
              </tbody>
            </table>
          </div>
          <p class="text-[11px] text-slate-400">点任意一行 → 看该组合的净值曲线与逐笔交易。</p>
        </template>

        <!-- 空态 -->
        <template v-else-if="!report">
          <div class="flex-1 min-h-[320px] rounded-xl border-2 border-dashed border-slate-100 flex flex-col items-center justify-center text-center px-6">
            <LineChart class="w-12 h-12 text-slate-200 mb-3" />
            <p class="text-sm font-semibold text-slate-400">还没有回测结果</p>
            <p class="text-xs text-slate-300 mt-1 leading-5">
              上面点选 1~N 个策略，左侧填代码（或勾选已同步标的），点「运行回测」。<br />
              选多个策略就会生成横向对比表，一眼看出哪个策略更赚。
            </p>
          </div>
        </template>

        <!-- 单组明细 -->
        <template v-else>
          <div class="flex flex-wrap items-center gap-2">
            <h4 class="text-sm font-bold text-slate-700">③ 回测结果</h4>
            <span class="text-xs text-slate-500">{{ report.code }} · {{ stratName(report.strategy) }}</span>
            <span v-if="verdictTag" class="px-2 py-0.5 rounded-full border text-[11px] font-semibold" :class="verdictTag.cls">
              {{ verdictTag.text }}
            </span>
            <button @click="clearResults" class="ml-auto text-[11px] text-slate-400 hover:text-slate-600">清空</button>
          </div>

          <!-- 一句话结论 -->
          <div class="rounded-lg border border-indigo-100 bg-indigo-50/50 px-3 py-2 text-xs text-slate-700">
            {{ verdictText }}
          </div>

          <!-- 收益 -->
          <div>
            <p class="text-[11px] font-semibold text-slate-400 mb-1.5">收益表现</p>
            <div class="grid grid-cols-2 md:grid-cols-5 gap-2">
              <MetricCard label="总收益" :value="report.metrics.total_return_pct" suffix="%" hint="回测区间内账户净值的整体涨幅"
                :positive="report.metrics.total_return_pct >= 0" />
              <MetricCard label="年化收益" :value="report.metrics.annualized_pct" suffix="%" hint="按复利折算到每年的平均收益"
                :positive="report.metrics.annualized_pct >= 0" />
              <MetricCard label="期末资产" :value="report.metrics.final_equity" prefix="¥" hint="初始资金 + 累计盈亏"
                :positive="true" />
              <MetricCard label="平均盈利" :value="report.metrics.avg_win" prefix="¥" hint="所有盈利交易的平均每笔赚多少" :positive="true" />
              <MetricCard label="平均亏损" :value="report.metrics.avg_loss ?? 0" prefix="-¥" hint="所有亏损交易的平均每笔亏多少" :positive="false" warn />
            </div>
          </div>

          <!-- 风险 -->
          <div>
            <p class="text-[11px] font-semibold text-slate-400 mb-1.5">风险控制</p>
            <div class="grid grid-cols-2 md:grid-cols-4 gap-2">
              <MetricCard label="最大回撤" :value="report.metrics.max_drawdown_pct" suffix="%" hint="账户从最高点跌到最低点的最大幅度，衡量你要扛多少浮亏"
                :positive="false" warn />
              <MetricCard label="夏普比率" :value="report.metrics.sharpe_ratio" hint="每承担 1 份波动换来的超额收益：>1 尚可，>1.5 优秀，>2 很强"
                :positive="report.metrics.sharpe_ratio >= 1" />
              <MetricCard label="卡玛比率" :value="report.metrics.calmar_ratio" hint="年化收益 ÷ 最大回撤：>1 合格，>2 优秀"
                :positive="report.metrics.calmar_ratio && report.metrics.calmar_ratio >= 1" />
              <MetricCard label="盈利因子" :value="report.metrics.profit_factor" hint="总盈利 ÷ 总亏损：>1 说明整体是赚的"
                :positive="report.metrics.profit_factor && report.metrics.profit_factor >= 1" />
            </div>
          </div>

          <!-- 交易 -->
          <div>
            <p class="text-[11px] font-semibold text-slate-400 mb-1.5">交易统计</p>
            <div class="grid grid-cols-2 md:grid-cols-5 gap-2">
              <MetricCard label="交易次数" :value="report.metrics.trade_count" hint="回测区间内完成的完整买卖笔数" />
              <MetricCard label="胜率" :value="report.metrics.win_rate_pct" suffix="%" hint="盈利笔数 ÷ 总笔数"
                :positive="report.metrics.win_rate_pct >= 50" />
              <MetricCard label="盈亏比" :value="report.metrics.profit_loss_ratio" hint="平均盈利 ÷ 平均亏损：胜率低但盈亏比高照样赚钱"
                :positive="report.metrics.profit_loss_ratio && report.metrics.profit_loss_ratio >= 1" />
              <MetricCard label="最大连盈" :value="report.metrics.max_consecutive_wins" hint="连续盈利的最多笔数" :positive="true" />
              <MetricCard label="最大连亏" :value="report.metrics.max_consecutive_losses ?? 0" hint="连续亏损的最多笔数" :positive="false" warn />
            </div>
          </div>

          <!-- 分年度收益 -->
          <div v-if="report.metrics.yearly_returns && Object.keys(report.metrics.yearly_returns).length"
            class="px-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
            <span class="text-slate-400">分年度收益：</span>
            <span v-for="(v, y) in report.metrics.yearly_returns" :key="y" class="font-semibold"
              :class="v >= 0 ? 'text-profit' : 'text-loss'">{{ y }}：{{ (v * 100).toFixed(1) }}%</span>
          </div>

          <!-- 净值曲线 -->
          <div>
            <div class="flex items-center justify-between mb-1">
              <p class="text-xs font-semibold text-slate-600">净值曲线</p>
              <p class="text-[11px] text-slate-400">初始 ¥{{ fmtMoney(report.metrics.initial_cash) }} · 实线=策略，虚线=沪深300</p>
            </div>
            <EquityChartView
              :data="report.equity_curve.map(p => ({ date: p.date, value: p.equity }))"
              :overlay="report.benchmark && report.benchmark.equity_curve ? report.benchmark.equity_curve.map(p => ({ date: p.date, value: p.equity })) : []"
              :trades="report.trades.map(t => ({ entry_date: t.entry_date, exit_date: t.exit_date }))"
              height="210" />
          </div>

          <!-- 回撤曲线 -->
          <div>
            <div class="flex items-center justify-between mb-1">
              <p class="text-xs font-semibold text-slate-600">回撤曲线</p>
              <p class="text-[11px] text-slate-400">越贴近 0 越安全，向下越深说明中途亏得越多</p>
            </div>
            <LineChartView :data="report.drawdown_curve.map(p => ({ date: p.date, value: p.drawdown_pct }))"
              height="120" invert fill color="#ef4444" format-value="%" :negative-fill="true" show-axis />
          </div>

          <!-- 交易明细 -->
          <TradeDetail :trades="report.trades" />
        </template>
      </section>
    </div>

    <!-- AI 投研助手 -->
    <section class="mt-3 bg-white rounded-xl p-4 card-shadow flex flex-col gap-3">
      <div class="flex items-center gap-2">
        <span class="w-2 h-2 rounded-full bg-indigo-500" />
        <h4 class="text-sm font-bold text-slate-700">AI 投研助手</h4>
        <span class="text-[11px] text-slate-400">不想点参数？直接用一句话让它跑：同步 → 回测 → 报告</span>
      </div>
      <div class="flex gap-2">
        <input v-model="agentMsg" @keyup.enter="sendAgent" placeholder="试试：回测茅台，止盈5%，止损5%"
          class="flex-1 min-w-0 px-3 py-2 rounded-lg border border-slate-200 text-sm focus:outline-none focus:border-indigo-300" />
        <button @click="sendAgent" :disabled="agentBusy || !serviceUp"
          class="px-4 py-2 rounded-lg text-sm font-medium text-white bg-indigo-500 hover:bg-indigo-600 disabled:opacity-50 flex items-center gap-1">
          <Sparkles class="w-4 h-4" />{{ agentBusy ? '思考中…' : '执行' }}
        </button>
      </div>
      <template v-if="agentOut">
        <div class="rounded-xl border border-indigo-100 bg-indigo-50/50 p-3">
          <div v-if="agentOut.steps && agentOut.steps.length" class="text-[11px] text-slate-400 mb-1 flex flex-wrap gap-1">
            <span v-for="(s, i) in agentOut.steps" :key="i" class="px-1.5 py-0.5 rounded bg-white border border-indigo-100">{{ s.tool }}</span>
          </div>
          <pre class="text-xs text-slate-700 whitespace-pre-wrap leading-relaxed font-sans">{{ agentOut.message }}</pre>
        </div>
      </template>
    </section>

    <!-- 操作说明 -->
    <div v-if="showHelp" class="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-sm overscroll-contain">
      <div class="bg-white rounded-2xl shadow-xl w-full max-w-2xl max-h-[92vh] flex flex-col overflow-hidden">
        <div class="flex items-center justify-between px-5 py-3 border-b border-slate-100 flex-shrink-0">
          <div class="flex items-center gap-2">
            <HelpCircle class="w-4 h-4 text-indigo-500" />
            <h4 class="text-sm font-bold text-slate-700">策略回测 · 操作说明</h4>
          </div>
          <button @click="showHelp = false" title="关闭 (Esc)"
            class="w-8 h-8 rounded-lg hover:bg-slate-100 flex items-center justify-center text-slate-400">
            <X class="w-4 h-4" />
          </button>
        </div>
        <div class="px-5 py-4 overflow-y-auto space-y-4 text-xs text-slate-600 leading-relaxed">
          <section>
            <h5 class="text-sm font-bold text-slate-700 mb-1.5">1. 三步跑起来</h5>
            <ol class="list-decimal pl-4 space-y-1">
              <li>顶部开关打开<b>量化服务</b>（关了就点一下，会自动启动，不用敲命令）。</li>
              <li>在「① 选择策略」里<b>点卡片</b>选策略，可以多选；选中后卡片内直接调参数。</li>
              <li>左侧填代码点「同步」拉行情（或勾选已同步标的），再点「运行回测」。</li>
            </ol>
          </section>
          <section>
            <h5 class="text-sm font-bold text-slate-700 mb-1.5">2. 怎么看结果</h5>
            <ul class="pl-1 space-y-1">
              <li>选多个策略 → 出<b>对比表</b>，按总收益排序，标出「最佳」，点行看明细。</li>
              <li>选一个策略 → 出<b>单组明细</b>：一句话结论 + 收益/风险/交易三组指标 + 净值曲线 + 逐笔交易。</li>
              <li>指标卡<b>鼠标悬停</b>会显示这个指标到底什么意思。</li>
            </ul>
          </section>
          <section>
            <h5 class="text-sm font-bold text-slate-700 mb-1.5">3. 七个策略速览</h5>
            <ul class="pl-1 space-y-1">
              <li><b>T+1 有效止盈</b>：复刻微信选股模型，D1 起涨到阈值才卖（防 D0 虚涨）。</li>
              <li><b>T+1 + 买入确认</b>：先等放量/均线多头信号，再按 T+1 止盈。</li>
              <li><b>均线金叉</b>：短均线上穿买、下穿卖，最经典的顺势策略。</li>
              <li><b>动量趋势</b>：站上 N 日均线做多，跌破离场。</li>
              <li><b>布林带回归</b>：跌破下轨买、回中轨卖，做震荡波段。</li>
              <li><b>海龟突破</b>：突破 N 日新高买、破 N 日新低止损。</li>
              <li><b>买入持有</b>：躺着不动，用来对照「策略有没有跑赢躺平」。</li>
            </ul>
          </section>
          <section>
            <h5 class="text-sm font-bold text-slate-700 mb-1.5">4. AI 策略工坊（自定义策略）</h5>
            <ul class="pl-1 space-y-1">
              <li>点右上角<b>「AI 策略工坊」</b>打开右侧抽屉，用一句话描述想法（如「缩量回调后放量突破买入，跌破 10 日线卖出」）。</li>
              <li>AI 会写出完整策略代码，并自动做<b>安全校验</b>和<b>冒烟回测</b>，不通过会自己修，最多试 3 次。</li>
              <li>审阅时可改名称/代码，不满意就在「让 AI 继续改」里提意见（AI 直接改代码逻辑，不是调参数）。</li>
              <li>保存后策略出现在上方卡片里（紫色「自定义」标签），和内置策略一样可多选回测。</li>
              <li>左侧策略库支持<b>改进 / 回滚到上一版 / 删除</b>，每次保存自动留快照。</li>
            </ul>
          </section>
          <section>
            <h5 class="text-sm font-bold text-slate-700 mb-1.5">5. 关键指标</h5>
            <ul class="pl-1 space-y-1">
              <li><b>最大回撤</b>：中途最多亏多少，决定你扛不扛得住。</li>
              <li><b>夏普比率</b>：每份波动换多少收益，&gt;1 尚可、&gt;2 很强。</li>
              <li><b>卡玛比率</b>：年化 ÷ 回撤，看收益与回撤的性价比。</li>
              <li><b>胜率 / 盈亏比</b>：别只看胜率，盈亏比高照样赚（如胜率 40%、盈亏比 3:1）。</li>
            </ul>
          </section>
          <section>
            <h5 class="text-sm font-bold text-slate-700 mb-1.5">6. 避坑</h5>
            <ul class="pl-1 space-y-1">
              <li>数据源 baostock，自动前复权；回测已含佣金/印花税/滑点。</li>
              <li>引擎按<b>次日开盘成交</b>，避免用当日收盘在盘中下单的前视偏差。</li>
              <li>历史盈利 ≠ 未来赚钱，结果仅作研究参考，不构成投资建议。</li>
            </ul>
          </section>
        </div>
      </div>
    </div>

    <!-- AI 策略工坊（右侧抽屉） -->
    <StrategyStudio v-if="showStudio"
      :service-up="serviceUp"
      :ai-ready="aiReady"
      :builtin-keys="builtinKeys"
      :strat-names="stratNameMap"
      :sample-code="effectiveCodes[0] || ''"
      @close="showStudio = false"
      @changed="onStudioChanged" />
  </div>
</template>

<script setup>
import { ref, reactive, computed, onMounted, onBeforeUnmount } from 'vue'
import { Gauge, LineChart, Play, RefreshCw, Sparkles, HelpCircle, X, Check, AlertCircle, Trash2 } from 'lucide-vue-next'
import { quantApi, quantServiceApi } from '../utils/api'
import LineChartView from './quant/LineChartView.vue'
import MetricCard from './quant/MetricCard.vue'
import EquityChartView from './quant/EquityChartView.vue'
import StrategyStudio from './quant/StrategyStudio.vue'
import TradeDetail from './quant/TradeDetail.vue'
import DatePicker from './quant/DatePicker.vue'

// ---------- 策略元数据（点选卡片 + 说明） ----------
const STRATEGIES = [
  {
    key: 't1_take_profit', name: 'T+1 有效止盈', badge: '短线', badgeClass: 'bg-amber-50 text-amber-600',
    summary: '复刻你微信选股那套「次日止盈」模型',
    buy: '空仓即建仓（次日开盘成交）',
    sell: 'D1 起涨到阈值卖出，否则止损/到期平仓',
    scene: '验证推荐票短线止盈到底赚不赚',
  },
  {
    key: 't1_confirmed', name: 'T+1 + 买入确认', badge: '短线·进阶', badgeClass: 'bg-amber-50 text-amber-700',
    summary: '先等技术信号确认，再按 T+1 止盈',
    buy: '放量突破 或 均线多头 才建仓',
    sell: '同 T+1 有效止盈',
    scene: '过滤弱势股，减少无效买入',
  },
  {
    key: 'ma_cross', name: '均线金叉', badge: '趋势', badgeClass: 'bg-sky-50 text-sky-600',
    summary: '最经典的顺势跟随策略',
    buy: '短均线上穿长均线（金叉）',
    sell: '短均线下穿长均线（死叉）',
    scene: '趋势明显的行情；震荡市会反复打脸',
  },
  {
    key: 'momentum', name: '动量趋势', badge: '趋势', badgeClass: 'bg-sky-50 text-sky-600',
    summary: '强者恒强，站上均线就做多',
    buy: '收盘价站上 N 日均线',
    sell: '跌破 N 日均线',
    scene: '单边上涨的强势股',
  },
  {
    key: 'bollinger', name: '布林带回归', badge: '震荡', badgeClass: 'bg-violet-50 text-violet-600',
    summary: '超跌低吸、回到中轨高抛',
    buy: '跌破下轨（超跌）',
    sell: '反弹回中轨之上',
    scene: '震荡市；单边牛市容易踏空',
  },
  {
    key: 'turtle', name: '海龟突破', badge: '趋势', badgeClass: 'bg-sky-50 text-sky-600',
    summary: '突破新高买入，破位就止损',
    buy: '突破 N 日最高价',
    sell: '跌破 N 日最低价',
    scene: '大级别突破行情',
  },
  {
    key: 'buy_and_hold', name: '买入持有', badge: '基准', badgeClass: 'bg-slate-100 text-slate-500',
    summary: '什么都不做，一直拿着',
    buy: '首个交易日建仓',
    sell: '回测结束才平仓',
    scene: '对照基准：看策略有没有跑赢躺平',
  },
]
const STRAT_NAME = Object.fromEntries(STRATEGIES.map((s) => [s.key, s.name]))
const BUILTIN_KEYS = new Set(STRATEGIES.map((s) => s.key))
function stratName(k) { return STRAT_NAME[k] || stratNameMap.value[k] || k }

// 参数定义：[key, label, type, opts]；opts.when = 依赖 entry_mode 的取值
const PARAM_FIELDS = {
  t1_take_profit: [
    ['take_profit_pct', '有效止盈阈值 %', 'number', { step: 0.5, min: 0 }],
    ['stop_loss_pct', '止损 %', 'number', { step: 1 }],
    ['trailing_stop_pct', '移动止盈回撤 %', 'number', { step: 1, min: 0, ph: '留空=关闭' }],
    ['max_hold_days', '持仓上限 (天)', 'number', { step: 1, min: 1, ph: '留空=不限' }],
    ['require_d1_hold', 'D0 已达标时，校验 D1 开盘守住阈值', 'check'],
  ],
  t1_confirmed: [
    ['entry_mode', '买入确认信号', 'select', { options: [['volume_break', '放量突破'], ['ma_bull', '均线多头'], ['none', '直接建仓']] }],
    ['take_profit_pct', '有效止盈阈值 %', 'number', { step: 0.5, min: 0 }],
    ['stop_loss_pct', '止损 %', 'number', { step: 1 }],
    ['ma_short', '短均线', 'number', { step: 1, min: 1, when: 'ma_bull' }],
    ['ma_long', '长均线', 'number', { step: 1, min: 1, when: 'ma_bull' }],
    ['vol_window', '放量窗口', 'number', { step: 1, min: 1, when: 'volume_break' }],
    ['vol_mult', '放量倍数', 'number', { step: 0.1, min: 0, when: 'volume_break' }],
    ['require_d1_hold', 'D0 已达标时，校验 D1 开盘守住阈值', 'check'],
  ],
  ma_cross: [
    ['fast', '短均线', 'number', { step: 1, min: 1 }],
    ['slow', '长均线', 'number', { step: 1, min: 1 }],
  ],
  momentum: [['window', '均线窗口', 'number', { step: 1, min: 2 }]],
  bollinger: [
    ['window', '窗口', 'number', { step: 1, min: 2 }],
    ['k', '标准差倍数', 'number', { step: 0.1, min: 0 }],
  ],
  turtle: [
    ['entry_n', '突破买入 N', 'number', { step: 1, min: 2 }],
    ['exit_n', '跌破卖出 N', 'number', { step: 1, min: 2 }],
  ],
  buy_and_hold: [],
}

const params = reactive({
  t1_take_profit: { take_profit_pct: 5, stop_loss_pct: -5, require_d1_hold: true, trailing_stop_pct: null, max_hold_days: null },
  t1_confirmed: { entry_mode: 'volume_break', take_profit_pct: 5, stop_loss_pct: -5, ma_short: 5, ma_long: 20, vol_window: 20, vol_mult: 1.5, require_d1_hold: true, trailing_stop_pct: null, max_hold_days: null },
  ma_cross: { fast: 5, slow: 20 },
  momentum: { window: 20 },
  bollinger: { window: 20, k: 2 },
  turtle: { entry_n: 20, exit_n: 10 },
  buy_and_hold: {},
})

// ---------- 自定义策略（AI 策略工坊产物） ----------
const customStrategies = ref([])
const builtinKeys = ref([])
const aiReady = ref(false)
const showStudio = ref(false)

// 自定义策略的 PARAMS 声明 → 与内置参数相同的字段格式 [key, label, type, opts]
function customFields(defs) {
  return (defs || []).map((d) => {
    const type = d.type === 'bool' || d.type === 'check'
      ? 'check'
      : (d.options && d.options.length) ? 'select' : 'number'
    const options = (d.options || []).map((o) => (Array.isArray(o) ? o : [o, String(o)]))
    return [d.key, d.label || d.key, type, { step: d.step ?? 1, min: d.min, max: d.max, ph: '', options }]
  })
}

// 内置卡片 + 自定义卡片
const strategyCards = computed(() => [
  ...STRATEGIES,
  ...customStrategies.value.map((s) => ({
    key: s.key,
    name: s.name,
    badge: '自定义',
    badgeClass: 'bg-violet-50 text-violet-600',
    summary: s.description || 'AI 生成的策略',
    buy: s.buy_rule || '见代码',
    sell: s.sell_rule || '见代码',
    scene: `AI 生成 · v${s.version} · ${(s.params || []).length} 个参数`,
    custom: true,
  })),
])

const stratNameMap = computed(() => {
  const m = {}
  for (const s of strategyCards.value) m[s.key] = s.name
  return m
})

function ensureCustomParams() {
  for (const s of customStrategies.value) {
    if (!params[s.key]) {
      const init = {}
      for (const d of s.params || []) init[d.key] = d.default
      params[s.key] = init
    }
  }
}

async function loadRegistry() {
  try {
    const r = await quantApi.strategyRegistry()
    builtinKeys.value = r.builtin || []
    customStrategies.value = r.custom || []
    ensureCustomParams()
    // 清理已被删除的自定义策略残留选中项
    const valid = new Set(strategyCards.value.map((s) => s.key))
    const next = new Set()
    let changed = false
    for (const k of selectedStrategies.value) {
      if (valid.has(k)) next.add(k); else changed = true
    }
    if (changed) selectedStrategies.value = next
  } catch (e) {
    // 量化服务未开启时静默失败，开关打开后会重新加载
  }
}

function openStudio() {
  showStudio.value = true
  loadRegistry()
}
function onStudioChanged() { loadRegistry() }

async function deleteCustomStrategy(s) {
  if (!window.confirm(`确定删除自定义策略「${s.name}」？删除后无法恢复。`)) return
  try {
    await quantApi.strategyCustomDelete(s.key)
    selectedStrategies.value.delete(s.key)
    await loadRegistry()
  } catch (e) {
    alert('删除失败：' + (e.response?.data?.detail || e.message))
  }
}

function visibleFields(key) {
  if (PARAM_FIELDS[key]) {
    const p = params[key] || {}
    return PARAM_FIELDS[key].filter((f) => !f[3] || !f[3].when || p.entry_mode === f[3].when)
  }
  const s = customStrategies.value.find((x) => x.key === key)
  return s ? customFields(s.params) : []
}

const COLS = [
  { k: 'total_return_pct', label: '总收益' },
  { k: 'annualized_pct', label: '年化' },
  { k: 'max_drawdown_pct', label: '回撤' },
  { k: 'sharpe_ratio', label: '夏普' },
  { k: 'win_rate_pct', label: '胜率' },
  { k: 'trade_count', label: '次数' },
]

// ---------- 状态 ----------
const serviceUp = ref(false)
const checking = ref(false)
const serviceBusy = ref(false)
const serviceErr = ref('')
const loading = ref(false)
const syncing = ref(false)
const syncErr = ref(false)
const syncMsg = ref('')
const symbols = ref([])
const report = ref(null)
const showHelp = ref(false)
const selectedCodes = ref(new Set())
const selectedStrategies = ref(new Set(['t1_take_profit']))
const multiReport = ref([])
const sortKey = ref('total_return_pct')
const sortDir = ref(-1)

const form = reactive({
  code: '',
  start: '',
  end: '',
  initial_cash: 1000000,
  initial_shares: null,
  max_adds: null,
  compare_benchmark: true,
})

// ---------- 选择交互 ----------
function toggleStrategy(key) {
  const s = selectedStrategies.value
  if (s.has(key)) s.delete(key); else s.add(key)
  selectedStrategies.value = new Set(s)
}
function selectAllStrategies() { selectedStrategies.value = new Set(strategyCards.value.map((s) => s.key)) }
function clearStrategies() { selectedStrategies.value = new Set() }

function toggleSymbol(code) {
  const s = selectedCodes.value
  if (s.has(code)) s.delete(code); else s.add(code)
  selectedCodes.value = new Set(s)
  if (s.size) form.code = ''
}
function selectAllSymbols() { selectedCodes.value = new Set(symbols.value.map((x) => x.code)); form.code = '' }
function clearSymbols() { selectedCodes.value = new Set() }
function onCodeInput() { if (selectedCodes.value.size) selectedCodes.value = new Set() }
function nameOf(code) { return (symbols.value.find((x) => x.code === code) || {}).name || '' }

const effectiveCodes = computed(() => {
  if (selectedCodes.value.size) return [...selectedCodes.value]
  const c = (form.code || '').trim()
  return c ? [c] : []
})

// ---------- 日期区间 ----------
const datePresets = [
  { label: '近3月', months: 3 },
  { label: '近6月', months: 6 },
  { label: '近1年', months: 12 },
  { label: '近3年', months: 36 },
  { label: '近5年', months: 60 },
]

function fmtDate(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function applyPreset(months) {
  const base = form.end ? new Date(form.end) : new Date()
  const end = isNaN(base.getTime()) ? new Date() : base
  const start = new Date(end)
  start.setMonth(start.getMonth() - months)
  form.start = fmtDate(start)
  form.end = fmtDate(end)
}

function isPresetActive(months) {
  if (!form.start || !form.end) return false
  const base = new Date(form.end)
  if (isNaN(base.getTime())) return false
  const start = new Date(base)
  start.setMonth(start.getMonth() - months)
  return form.start === fmtDate(start)
}

// 已选标的（或手输代码）在本地实际拥有的行情区间
function symbolPool() {
  const codes = effectiveCodes.value
  if (codes.length) {
    const matched = symbols.value.filter((s) => codes.includes(s.code))
    if (matched.length) return matched
  }
  return symbols.value
}

const symbolRange = computed(() => {
  const pool = symbolPool()
  const firsts = pool.map((s) => s.first_date).filter(Boolean).sort()
  const lasts = pool.map((s) => s.last_date).filter(Boolean).sort()
  if (!firsts.length || !lasts.length) return null
  return { first: firsts[0], last: lasts[lasts.length - 1] }
})

function applySymbolRange() {
  const r = symbolRange.value
  if (!r) return
  form.start = r.first
  form.end = r.last
}

const taskCount = computed(() => effectiveCodes.value.length * selectedStrategies.value.size)
const canRun = computed(() => serviceUp.value && taskCount.value > 0)
const runLabel = computed(() => {
  if (!serviceUp.value) return '请先开启量化服务'
  if (!taskCount.value) return '请先选策略和标的'
  if (taskCount.value === 1) return '运行回测'
  return `运行回测（${taskCount.value} 组对比）`
})

// ---------- 服务开关 ----------
async function checkService(silent = false) {
  if (!silent) checking.value = true
  const wasUp = serviceUp.value
  try {
    const r = await quantServiceApi.status()
    serviceUp.value = !!r.running
    aiReady.value = !!r.aiReady
    // 服务刚恢复时，自动拉取策略和标的列表
    if (!wasUp && serviceUp.value) {
      await Promise.all([loadSymbols(), loadRegistry()]).catch(() => {})
    }
  } catch (e) {
    serviceUp.value = false
  } finally {
    if (!silent) checking.value = false
  }
}

async function toggleService() {
  if (serviceBusy.value) return
  serviceBusy.value = true
  serviceErr.value = ''
  try {
    if (serviceUp.value) {
      const r = await quantServiceApi.stop()
      serviceUp.value = !!r.running
      if (r.running) serviceErr.value = r.message || '停止失败'
    } else {
      const r = await quantServiceApi.start()
      serviceUp.value = !!r.running
      if (!r.running) serviceErr.value = r.error || '启动失败'
    }
    if (serviceUp.value) { await loadSymbols(); await loadRegistry() }
  } catch (e) {
    serviceErr.value = e.response?.data?.error || e.message || '操作失败'
    await checkService(true)
  } finally {
    serviceBusy.value = false
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

// ---------- 回测 ----------
function buildPayload(code, s) {
  const p = params[s] || {}
  const optNum = (v) => (v === null || v === '' || v === undefined ? null : v)
  const payload = {
    code,
    strategy: s,
    start: form.start || undefined,
    end: form.end || undefined,
    initial_cash: form.initial_cash,
    initial_shares: form.initial_shares || undefined,
    max_adds: form.max_adds ?? undefined,
    compare_benchmark: form.compare_benchmark,
  }
  // 自定义策略（AI 策略工坊）：参数按 PARAMS 声明的 key 原样传
  if (!BUILTIN_KEYS.has(s)) {
    payload.params = { ...p }
    return payload
  }
  if (s === 't1_take_profit' || s === 't1_confirmed') {
    payload.take_profit = p.take_profit_pct / 100
    payload.stop_loss = p.stop_loss_pct / 100
    payload.require_d1_hold = p.require_d1_hold
    payload.trailing_stop = optNum(p.trailing_stop_pct) === null ? null : p.trailing_stop_pct / 100
    payload.max_hold_days = optNum(p.max_hold_days)
  }
  if (s === 't1_confirmed') {
    payload.entry_mode = p.entry_mode
    payload.ma_short = p.ma_short
    payload.ma_long = p.ma_long
    payload.vol_window = p.vol_window
    payload.vol_mult = p.vol_mult
  }
  if (s === 'ma_cross') { payload.fast = p.fast; payload.slow = p.slow }
  if (s === 'momentum') payload.window = p.window
  if (s === 'bollinger') { payload.window = p.window; payload.k = p.k }
  if (s === 'turtle') { payload.entry_n = p.entry_n; payload.exit_n = p.exit_n }
  return payload
}

async function run() {
  const codes = effectiveCodes.value
  const strats = [...selectedStrategies.value]
  if (!codes.length) { alert('请先输入股票代码，或勾选本地已同步标的'); return }
  if (!strats.length) { alert('请至少选择一个策略'); return }
  if (!serviceUp.value) { alert('请先开启量化服务'); return }

  loading.value = true
  report.value = null
  multiReport.value = []
  try {
    const tasks = []
    for (const c of codes) for (const s of strats) tasks.push({ code: c, strategy: s })

    if (tasks.length === 1) {
      report.value = await quantApi.runBacktest(buildPayload(tasks[0].code, tasks[0].strategy))
      return
    }
    for (const t of tasks) {
      try {
        const r = await quantApi.runBacktest(buildPayload(t.code, t.strategy))
        multiReport.value.push({ code: t.code, name: nameOf(t.code), strategy: t.strategy, ok: true, minfo: r.metrics })
      } catch (e) {
        multiReport.value.push({ code: t.code, name: nameOf(t.code), strategy: t.strategy, ok: false, error: e.response?.data?.detail || e.message })
      }
    }
  } catch (e) {
    alert(e.response?.data?.detail || e.message || '回测失败')
  } finally {
    loading.value = false
  }
}

function viewDetail(row) {
  if (!row.ok) return
  form.code = row.code
  selectedCodes.value = new Set()
  selectedStrategies.value = new Set([row.strategy])
  multiReport.value = []
  run()
}

function clearResults() {
  report.value = null
  multiReport.value = []
}

// ---------- 对比表排序 ----------
const sortedRows = computed(() => {
  const rows = [...multiReport.value]
  rows.sort((a, b) => {
    if (a.ok !== b.ok) return a.ok ? -1 : 1
    const av = a.minfo?.[sortKey.value]
    const bv = b.minfo?.[sortKey.value]
    if (av == null && bv == null) return 0
    if (av == null) return 1
    if (bv == null) return -1
    return (av - bv) * sortDir.value
  })
  return rows
})
function toggleSort(k) {
  if (sortKey.value === k) sortDir.value = -sortDir.value
  else { sortKey.value = k; sortDir.value = -1 }
}
const bestRow = computed(() => {
  let best = null
  for (const r of multiReport.value) {
    if (!r.ok) continue
    if (!best || r.minfo.total_return_pct > best.minfo.total_return_pct) best = r
  }
  return best
})
function isBest(row) {
  const b = bestRow.value
  return !!b && row.ok && row.code === b.code && row.strategy === b.strategy
}

// ---------- 单组结论 ----------
const verdictTag = computed(() => {
  const m = report.value?.metrics
  if (!m) return null
  if (m.total_return_pct > 0 && (m.sharpe_ratio ?? 0) >= 1) return { text: '表现不错', cls: 'bg-emerald-50 text-emerald-600 border-emerald-200' }
  if (m.total_return_pct > 0) return { text: '小赚', cls: 'bg-emerald-50 text-emerald-600 border-emerald-200' }
  return { text: '亏损', cls: 'bg-red-50 text-red-500 border-red-200' }
})
const verdictText = computed(() => {
  const r = report.value
  if (!r) return ''
  const m = r.metrics
  const seg = []
  seg.push(m.total_return_pct >= 0 ? `总收益 +${m.total_return_pct}%` : `总收益 ${m.total_return_pct}%`)
  seg.push(`最大回撤 ${m.max_drawdown_pct}%`)
  seg.push(`共 ${m.trade_count} 笔，胜率 ${m.win_rate_pct}%`)
  if (r.benchmark) {
    const d = m.total_return_pct - r.benchmark.total_return_pct
    seg.push(`较沪深300${d >= 0 ? '跑赢' : '跑输'} ${Math.abs(d).toFixed(1)} 个百分点`)
  }
  return seg.join('，') + '。'
})

function fmtMoney(v) {
  if (typeof v !== 'number') return v
  return new Intl.NumberFormat('zh-CN', { maximumFractionDigits: 0 }).format(v)
}
function reasonText(r) {
  const s = String(r || '')
  // 兼容旧版返回的枚举值；新版后端直接返回中文说明
  return { RULE: '规则触发', TARGET: '达标止盈', STOP_LOSS: '止损', END: '回测结束平仓' }[s] || s || '—'
}
function reasonClass(r) {
  const s = String(r || '')
  if (/止损|跌破|死叉/.test(s)) return 'bg-red-50 text-red-500'
  if (/结束|到期/.test(s)) return 'bg-slate-100 text-slate-400'
  if (/止盈|金叉|突破|站上|建仓|下轨/.test(s)) return 'bg-emerald-50 text-emerald-600'
  return 'bg-slate-100 text-slate-500'
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
    agentOut.value = await quantApi.agentChat({ text: t })
  } catch (e) {
    agentOut.value = { ok: false, message: e.response?.data?.detail || e.message || 'AI 调用失败' }
  } finally {
    agentBusy.value = false
  }
}

// ---------- 生命周期 ----------
function onKey(e) { if (e.key === 'Escape') showHelp.value = false }
let pollTimer = null
onMounted(async () => {
  window.addEventListener('keydown', onKey)
  // 进入策略回测工作台：自动启动量化服务
  try {
    const r = await quantServiceApi.status()
    if (!r.running) {
      const s = await quantServiceApi.start()
      serviceUp.value = !!s.running
      if (!s.running) serviceErr.value = s.error || '启动失败'
    } else {
      serviceUp.value = true
      aiReady.value = !!r.aiReady
    }
  } catch (e) {
    // 服务状态接口不可用时也尝试启动一次
    try {
      const s = await quantServiceApi.start()
      serviceUp.value = !!s.running
    } catch { serviceUp.value = false }
  }
  if (serviceUp.value) {
    await Promise.all([loadSymbols(), loadRegistry()]).catch(() => {})
  }
  pollTimer = setInterval(() => { if (!document.hidden) checkService(true) }, 10000)
})
onBeforeUnmount(async () => {
  window.removeEventListener('keydown', onKey)
  if (pollTimer) clearInterval(pollTimer)
  // 退出策略回测工作台：自动关闭量化服务
  try { await quantServiceApi.stop() } catch { /* 忽略 */ }
  serviceUp.value = false
})
</script>