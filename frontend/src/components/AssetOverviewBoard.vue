<template>
  <div class="ov-root">
    <!-- 星空 · 云雾 · 星尘 -->
    <div class="ov-sky" aria-hidden="true">
      <span class="ov-glow g1"></span>
      <span class="ov-glow g2"></span>
      <span class="ov-cloud c1"></span>
      <span class="ov-cloud c2"></span>
      <span class="ov-cloud c3"></span>
      <span
        v-for="s in stars"
        :key="s.id"
        class="ov-star"
        :style="s.style"
      ></span>
    </div>

    <div class="ov-stage">
      <!-- ① 顶部通栏 -->
      <header class="ov-hero glass">
        <span class="ov-hero-sheen" aria-hidden="true"></span>

        <div class="ov-hero-left">
          <span class="ov-hero-mark"><Sparkles :stroke-width="1.7" /></span>
          <div class="ov-hero-titles">
            <h1>资产总览</h1>
            <p>{{ feeText }}</p>
          </div>
        </div>

        <div class="ov-screen" :class="{ 'is-blurred': hideAssets }">
          <div
            class="ov-screen-num"
            :class="{ 'is-risk': rollNeg, 'is-growing': isGrowing, 'is-snapping': snapping }"
          >
            <span class="ov-screen-cur">¥</span>
            <span v-if="rollNeg" class="ov-screen-sign">-</span>
            <template v-for="(pos, i) in rollShown.int" :key="'p' + (rollShown.int.length - 1 - i)">
              <span class="ov-col">
                <span
                  class="ov-od"
                  :style="{ '--ci': rollShown.dec.length + (rollShown.int.length - 1 - i), ...initialDigitStyle(rollShown.int.length - 1 - i) }"
                >
                  <span class="ov-od-col" :style="{ transform: `translateY(-${pos}em)` }">
                    <span v-for="k in ROLL_CELLS" :key="k" class="ov-od-d">{{ (k - 1) % 10 }}</span>
                  </span>
                </span>
                <span class="ov-unit">{{ placeName(i, rollShown.int.length) }}</span>
              </span>
              <span
                v-if="commaAfter(i, rollShown.int.length)"
                :key="'c' + i"
                class="ov-screen-comma"
              >,</span>
            </template>
            <span class="ov-screen-dot">.</span>
            <span
              v-for="(pos, i) in rollShown.dec"
              :key="'d' + i"
              class="ov-od"
              :style="{ '--ci': rollShown.dec.length - 1 - i }"
            >
              <span class="ov-od-col" :style="{ transform: `translateY(-${pos}em)` }">
                <span v-for="k in ROLL_CELLS" :key="k" class="ov-od-d">{{ (k - 1) % 10 }}</span>
              </span>
            </span>
          </div>
        </div>

        <button
          class="ov-eye"
          :title="hideAssets ? '显示资产' : '隐藏资产'"
          @click="toggleHide"
        >
          <component :is="hideAssets ? EyeOff : Eye" :stroke-width="1.9" />
        </button>
      </header>

      <!-- 危机提醒 -->
      <div
        v-if="showCrisisReminder"
        class="ov-crisis glass"
        :style="{ '--accent': crisisAccent }"
      >
        <span class="ov-crisis-ic">
          <component :is="crisisIcon" :stroke-width="1.7" />
        </span>
        <div class="ov-crisis-body">
          <span class="ov-crisis-title">{{ crisisConfig.title }}</span>
          <div class="ov-crisis-ratio">
            <b class="ov-crisis-num">{{ stockTrappedRatio.toFixed(1) }}%</b>
            <span class="ov-crisis-label">{{ crisisConfig.label }}</span>
          </div>
        </div>
      </div>

      <!-- ② 数据概览区 -->
      <section class="ov-flow" :class="{ 'is-blurred': hideAssets }">
        <!-- 存款 -->
        <article class="ov-card glass is-deposit" :style="{ '--i': 0 }">
          <span class="ov-card-wm" aria-hidden="true"><PiggyBank :stroke-width="1.2" /></span>

          <div class="ov-card-head">
            <span class="ov-card-ic"><PiggyBank :stroke-width="1.8" /></span>
            <h3>存款</h3>
          </div>

          <div class="ov-card-main">
            <div class="ov-card-num">
              <div class="ov-card-big">¥{{ formatNumber(depositTotal) }}</div>
              <div class="ov-card-sub">账户存款总额 · 占净资 {{ depositShare.toFixed(1) }}%</div>
            </div>
          </div>
        </article>

        <!-- 股票 -->
        <article class="ov-card glass is-stock" :style="{ '--i': 1 }">
          <span class="ov-card-wm" aria-hidden="true"><TrendingUp :stroke-width="1.2" /></span>

          <div class="ov-card-head">
            <span class="ov-card-ic"><TrendingUp :stroke-width="1.8" /></span>
            <h3>股票</h3>
            <span class="ov-card-badge">本金可编辑</span>
          </div>

          <div class="ov-card-main">
            <div class="ov-card-num">
              <div class="ov-card-big">¥{{ formatNumber(stockTotalAsset) }}</div>
            </div>
          </div>

          <div class="ov-metrics">
            <div class="ov-metric">
              <span class="ov-metric-label">本金</span>
              <input
                type="number"
                step="0.01"
                :value="stockPrincipal"
                class="ov-metric-input"
                @input="onPrincipalInput"
              />
            </div>
            <div class="ov-metric">
              <span class="ov-metric-label">持仓市值</span>
              <b
                class="ov-metric-val"
                :class="stockHoldingMarketValue >= stockHoldingAmount ? 'is-profit' : 'is-risk'"
              >¥{{ formatNumber(stockHoldingMarketValue) }}</b>
            </div>
            <div class="ov-metric">
              <span class="ov-metric-label">总盈利</span>
              <b
                class="ov-metric-val"
                :class="stockTotalProfit >= 0 ? 'is-profit' : 'is-risk'"
              >¥{{ formatNumber(stockTotalProfit) }}</b>
            </div>
            <div class="ov-metric is-combo">
              <span class="ov-metric-label" title="被套资金 = 持仓成本；被套比例 = 被套资金 ÷ 股票总资产">被套/被套比例</span>
              <b class="ov-metric-val">¥{{ formatNumber(stockHoldingAmount) }}<em :style="{ color: crisisAccent }">{{ stockTrappedRatio.toFixed(1) }}%</em></b>
            </div>
            <div class="ov-metric">
              <span class="ov-metric-label">浮亏</span>
              <b class="ov-metric-val is-risk">¥{{ formatNumber(stockUnrealizedLoss) }}</b>
            </div>
          </div>

          <!-- A股打新资格 -->
          <div class="ov-ipo">
            <div class="ov-ipo-head">
              <span class="ov-ipo-title">
                打新资格
                <span class="ov-ipo-tip">
                  <b>A股打新规则</b>
                  <ul>
                    <li>沪深市值<b>分开计算</b>，不互通；每 5000 元 = 1 单位 = 500 股</li>
                    <li>门槛：T-2 日前 <b>20 个交易日日均</b> ≥ 1 万元</li>
                    <li>主板：开户即可；创业板：2年经验 + 日均≥10万</li>
                    <li>科创板：2年经验 + 日均≥50万；北交所：2年+50万，需预缴</li>
                    <li>可转债：<b>无需底仓</b>，2年经验 + 日均≥10万 + 签风险书</li>
                    <li>申购不预缴款，<b>T+2 中签后缴款</b></li>
                    <li>12 个月内 3 次中签不缴 → 禁打新 6 个月</li>
                    <li>同一人多账户申购同股，仅第一笔有效</li>
                  </ul>
                </span>
              </span>
            </div>

            <div class="ov-ipo-mv-hint">
              <span v-if="ipoAvg.loaded">T-2（{{ ipoAvg.t2Date }}）前 {{ ipoAvg.avgDays }} 个交易日日均</span>
              <span v-else-if="ipoAvg.loading">日均计算中…</span>
              <span v-else class="is-realtime">当前实时市值（日均未加载）</span>
              <button class="ov-ipo-refresh" @click="loadIpoMarketValue" :disabled="ipoAvg.loading">{{ ipoAvg.loading ? '…' : '刷新' }}</button>
            </div>

            <div class="ov-ipo-mv">
              <div class="ov-ipo-mv-item">
                <span class="ov-ipo-mv-label">{{ ipoAvg.loaded ? '沪市日均底仓' : '沪市实时底仓' }}</span>
                <b :class="ipoEffectiveMv.sh >= 10000 ? 'is-ok' : 'is-need'">¥{{ fmtNum(ipoEffectiveMv.sh) }}</b>
                <span class="ov-ipo-mv-sub">{{ ipoUnits(ipoEffectiveMv.sh) }}股{{ ipoGap(ipoEffectiveMv.sh) > 0 ? ' · 差' + fmtNum(ipoGap(ipoEffectiveMv.sh)) : '' }}<em v-if="ipoAvg.loaded && ipoMarketValue.sh !== ipoEffectiveMv.sh">（实时¥{{ fmtNum(ipoMarketValue.sh) }}）</em></span>
              </div>
              <div class="ov-ipo-mv-item">
                <span class="ov-ipo-mv-label">{{ ipoAvg.loaded ? '深市日均底仓' : '深市实时底仓' }}</span>
                <b :class="ipoEffectiveMv.sz >= 10000 ? 'is-ok' : 'is-need'">¥{{ fmtNum(ipoEffectiveMv.sz) }}</b>
                <span class="ov-ipo-mv-sub">{{ ipoUnits(ipoEffectiveMv.sz) }}股{{ ipoGap(ipoEffectiveMv.sz) > 0 ? ' · 差' + fmtNum(ipoGap(ipoEffectiveMv.sz)) : '' }}<em v-if="ipoAvg.loaded && ipoMarketValue.sz !== ipoEffectiveMv.sz">（实时¥{{ fmtNum(ipoMarketValue.sz) }}）</em></span>
              </div>
            </div>

            <div class="ov-ipo-boards">
              <div v-for="b in ipoBoards" :key="b.key" class="ov-ipo-row">
                <span class="ov-ipo-board-name">{{ b.name }}</span>
                <span class="ov-ipo-board-desc">{{ b.desc }}</span>
                <span class="ov-ipo-status" :class="ipoBoardStatus(b).ok ? 'is-ok' : 'is-need'">{{ ipoBoardStatus(b).text }}</span>
              </div>
              <div class="ov-ipo-row is-cb">
                <span class="ov-ipo-board-name">可转债</span>
                <span class="ov-ipo-board-desc">11/12开头 · 无需底仓 · 顶格申购</span>
                <span class="ov-ipo-status" :class="ipoConvertibleStatus.ok ? 'is-ok' : 'is-need'">{{ ipoConvertibleStatus.text }}</span>
              </div>
            </div>

            <!-- 20 日底仓市值走势图 -->
            <div class="ov-ipo-chart">
              <div class="ov-ipo-chart-head">
                <span>近 {{ ipoAvg.avgDays || 20 }} 日底仓市值</span>
                <span class="ov-ipo-chart-legend"><i class="dot-sh"></i>沪市<i class="dot-sz"></i>深市</span>
              </div>
              <svg class="ov-ipo-chart-svg" viewBox="0 0 400 110" v-if="ipoAvg.shDaily.length">
                <!-- Y 轴网格线 + 刻度 -->
                <g class="ov-ipo-chart-axis">
                  <line v-for="t in ipoChart.yTicks" :key="'y'+t.val" :x1="36" :y1="t.y" :x2="396" :y2="t.y" stroke="rgba(0,0,0,0.07)" stroke-dasharray="2 3" />
                  <text v-for="t in ipoChart.yTicks" :key="'yl'+t.val" x="33" :y="t.y + 2.5" font-size="8" fill="rgba(0,0,0,0.4)" text-anchor="end">{{ t.val >= 10000 ? (t.val/10000) + '万' : t.val }}</text>
                </g>
                <!-- 1 万基准线 -->
                <line x1="36" :y1="ipoChart.tenK" x2="396" :y2="ipoChart.tenK" stroke="rgba(217,119,87,0.35)" stroke-width="1" stroke-dasharray="4 3" />
                <text x="39" :y="ipoChart.tenK - 2" font-size="7.5" fill="rgba(217,119,87,0.7)">1万门槛</text>
                <!-- 数据线 -->
                <polyline :points="ipoChart.sh" fill="none" stroke="#4a7fb5" stroke-width="1.8" stroke-linejoin="round" stroke-linecap="round" />
                <polyline :points="ipoChart.sz" fill="none" stroke="#2f9e73" stroke-width="1.8" stroke-linejoin="round" stroke-linecap="round" />
                <!-- X 轴日期 -->
                <g class="ov-ipo-chart-xlabel">
                  <text v-for="x in ipoChart.xLabels" :key="x.label" :x="x.x" y="108" font-size="7.5" fill="rgba(0,0,0,0.4)" text-anchor="middle">{{ x.label }}</text>
                </g>
              </svg>
              <div v-else class="ov-ipo-chart-empty">暂无数据</div>
            </div>
          </div>
        </article>

        <!-- 黄金 -->
        <article class="ov-card glass is-gold" :style="{ '--i': 2 }">
          <span class="ov-card-wm" aria-hidden="true"><Coins :stroke-width="1.2" /></span>

          <div class="ov-card-head">
            <span class="ov-card-ic"><Coins :stroke-width="1.8" /></span>
            <h3>黄金</h3>
          </div>

          <div class="ov-card-main">
            <div class="ov-card-num">
              <div class="ov-card-big">¥{{ formatNumber(goldTotalMarketValue) }}</div>
              <div class="ov-card-sub">总市值 · 占净资 {{ goldShare.toFixed(1) }}%</div>
            </div>
          </div>

          <div class="ov-metrics">
            <div class="ov-metric">
              <span class="ov-metric-label">总成本</span>
              <b class="ov-metric-val">¥{{ formatNumber(goldTotalCost) }}</b>
            </div>
            <div class="ov-metric">
              <span class="ov-metric-label">总市值</span>
              <b class="ov-metric-val">¥{{ formatNumber(goldTotalMarketValue) }}</b>
            </div>
            <div class="ov-metric ov-avg" tabindex="0">
              <span class="ov-metric-label">总均价</span>
              <b class="ov-metric-val">¥{{ formatNumber(goldAvgPrice) }}</b>
              <div class="ov-avg-tip">
                <div class="tip-title">总均价 = 净成本 ÷ 总克数</div>
                <div class="tip-row"><span>累计买入总额（含手续费）</span><b>+¥{{ formatNumber(goldTotalBuyAmount) }}</b></div>
                <div class="tip-row"><span>累计卖出收入（扣手续费）</span><b>-¥{{ formatNumber(goldTotalSellAmount) }}</b></div>
                <div class="tip-row"><span>净成本（买入 - 卖出）</span><b>=¥{{ formatNumber(goldTotalCost) }}</b></div>
                <div class="tip-row"><span>总克数</span><b>{{ formatNumber(goldTotalGrams, 4) }}g</b></div>
                <div class="tip-row result"><span>总均价</span><b>=¥{{ formatNumber(goldAvgPrice, 4) }}/g</b></div>
                <div v-if="goldHasSell" class="tip-note">
                  注：卖出盈亏已摊入剩余持仓成本<br />赚钱卖出 → 均价下降；亏钱卖出 → 均价上升
                </div>
              </div>
            </div>
            <div class="ov-metric">
              <span class="ov-metric-label">总克数</span>
              <b class="ov-metric-val">{{ formatNumber(goldTotalGrams, 2) }}g</b>
            </div>
          </div>
        </article>
      </section>

      <!-- ③ 可视化 -->
      <section class="ov-charts" :class="{ 'is-blurred': hideAssets }">
        <!-- 资产分布 -->
        <article class="ov-chart glass" :style="{ '--i': 3 }">
          <div class="ov-chart-head">
            <span class="ov-card-ic"><ChartPie :stroke-width="1.8" /></span>
            <div>
              <h3>资产分布</h3>
              <p>存款 · 股票 · 黄金占比</p>
            </div>
          </div>

          <div class="ov-donut-body">
            <div class="ov-donut-wrap">
              <span class="ov-donut-halo" aria-hidden="true"></span>
              <svg class="ov-donut" viewBox="0 0 120 120">
                <circle class="ov-donut-track" cx="60" cy="60" r="46" />
                <g class="ov-donut-rot">
                  <circle
                    v-for="seg in donutSegments"
                    :key="seg.key"
                    class="ov-donut-seg"
                    cx="60"
                    cy="60"
                    r="46"
                    :stroke="seg.color"
                    :stroke-dasharray="`${seg.dash} ${donutC - seg.dash}`"
                    :stroke-dashoffset="seg.offset"
                    transform="rotate(-90 60 60)"
                  />
                </g>
              </svg>
              <div class="ov-donut-center">
                <span>净资产</span>
                <b>{{ compactWan(netAssetTotal) }}</b>
              </div>
            </div>

            <ul class="ov-legend">
              <li v-for="seg in donutSegments" :key="seg.key">
                <i :style="{ background: seg.color }"></i>
                <span class="lg-label">{{ seg.label }}</span>
                <span class="lg-val">¥{{ formatNumber(seg.value) }}</span>
                <b class="lg-pct">{{ seg.percent.toFixed(1) }}%</b>
              </li>
            </ul>
          </div>
        </article>

        <!-- 收益趋势 -->
        <article class="ov-chart glass" :style="{ '--i': 4 }">
          <div class="ov-chart-head">
            <span class="ov-card-ic"><ChartLine :stroke-width="1.8" /></span>
            <div>
              <h3>收益趋势</h3>
              <p>已实现收益累计（元）</p>
            </div>
            <b
              v-if="trendGeom"
              class="ov-chart-total"
              :class="trendGeom.total >= 0 ? 'is-profit' : 'is-risk'"
            >¥{{ formatNumber(trendGeom.total) }}</b>
          </div>

          <div v-if="trendGeom" class="ov-trend">
            <svg class="ov-trend-svg" :viewBox="`0 0 ${trendGeom.W} ${trendGeom.H}`">
              <defs>
                <linearGradient id="ovTrendFill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stop-color="#86c8ff" stop-opacity="0.42" />
                  <stop offset="100%" stop-color="#86c8ff" stop-opacity="0" />
                </linearGradient>
                <linearGradient id="ovTrendLine" x1="0" y1="0" x2="1" y2="0">
                  <stop offset="0%" stop-color="#aad7ff" />
                  <stop offset="100%" stop-color="#4aa8f0" />
                </linearGradient>
              </defs>

              <!-- 网格 + Y 轴刻度 -->
              <g class="ov-grid">
                <template v-for="(t, i) in trendGeom.ticks" :key="i">
                  <line
                    :x1="trendGeom.padL"
                    :y1="t.y"
                    :x2="trendGeom.W - trendGeom.padR"
                    :y2="t.y"
                  />
                  <text :x="trendGeom.padL - 10" :y="t.y + 4" text-anchor="end">{{ t.label }}</text>
                </template>
              </g>

              <!-- 坐标轴 -->
              <line
                class="ov-axis"
                :x1="trendGeom.padL"
                :y1="trendGeom.padT"
                :x2="trendGeom.padL"
                :y2="trendGeom.H - trendGeom.padB"
              />
              <line
                class="ov-axis"
                :x1="trendGeom.padL"
                :y1="trendGeom.H - trendGeom.padB"
                :x2="trendGeom.W - trendGeom.padR"
                :y2="trendGeom.H - trendGeom.padB"
              />
              <line
                class="ov-zero"
                :x1="trendGeom.padL"
                :y1="trendGeom.zeroY"
                :x2="trendGeom.W - trendGeom.padR"
                :y2="trendGeom.zeroY"
              />

              <!-- X 轴刻度 -->
              <text
                v-for="(xl, i) in trendGeom.xLabels"
                :key="'x' + i"
                class="ov-xlab"
                :x="xl.x"
                :y="trendGeom.H - 10"
                :text-anchor="xl.anchor"
              >{{ xl.label }}</text>

              <path class="ov-trend-area" :d="trendGeom.area" fill="url(#ovTrendFill)" />
              <path ref="trendPathRef" class="ov-trend-line" :d="trendGeom.line" />
              <path class="ov-trend-flow" :d="trendGeom.line" />

              <circle class="ov-trend-halo" :cx="trendGeom.last.x" :cy="trendGeom.last.y" r="9" />
              <circle class="ov-trend-dot" :cx="trendGeom.last.x" :cy="trendGeom.last.y" r="4.5" />
            </svg>
          </div>

          <div v-else class="ov-trend-empty">
            <span class="ov-trend-empty-ic"><Sparkles :stroke-width="1.6" /></span>
            <p>收益数据积累中</p>
            <span>完成卖出后，这里会描绘出你的收益曲线</span>
          </div>
        </article>
      </section>
    </div>
  </div>
</template>

<script setup>
import { userStorage as localStorage } from '../auth'
import { computed, markRaw, nextTick, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue'
import {
  Eye, EyeOff, Smile, Meh, Frown, AlertTriangle,
  Sparkles, PiggyBank, TrendingUp, Coins, Activity, ChartPie, ChartLine
} from 'lucide-vue-next'
import { CRISIS_LEVELS, getCrisisLevel, calcStock } from '../utils/calculator'
import { fmtNum, getStockBoard } from '../utils/formatter'
import { useStock } from '../composables/useStock'
import { useStockPrice } from '../composables/useStockPrice'
import { useGold } from '../composables/useGold'
import { useDeposit } from '../composables/useDeposit'
import { feeConfig, toWan } from '../utils/feeConfig'

// 与「设置 → 交易手续费」当前生效档位保持一致
const feeText = computed(() =>
  `跟随档位「${feeConfig.activePresetName || '当前配置'}」· 佣金万${toWan(feeConfig.commissionRate)} · 最低 ${feeConfig.minCommission} 元`
)

// 看板切换会卸载组件，资产显隐需持久化，否则切回来会重置
const HIDE_ASSETS_KEY = 'overviewHideAssets'
const hideAssets = ref(localStorage.getItem(HIDE_ASSETS_KEY) === '1')
function toggleHide() {
  hideAssets.value = !hideAssets.value
  localStorage.setItem(HIDE_ASSETS_KEY, hideAssets.value ? '1' : '0')
}

const {
  stocks,
  stockList,
  totalCost,
  holdingAmount,
  stockHoldingMarketValue,
  stockPrincipal,
  totalProfit,
  loadStocks
} = useStock()

const { stockPrices, fetchStockPrices, startStockPriceTimer, stopStockPriceTimer } = useStockPrice()

const {
  goldItems,
  totalAmount,
  totalGrams,
  avgPrice,
  marketValue,
  totalBuyAmount: goldTotalBuyAmount,
  totalSellAmount: goldTotalSellAmount,
  loadGoldItems,
  fetchGoldPrice
} = useGold()

const { totalAmount: depositTotalAmount, loadDeposits } = useDeposit()

const iconMap = {
  smile: markRaw(Smile),
  meh: markRaw(Meh),
  frown: markRaw(Frown),
  dizzy: markRaw(AlertTriangle)
}

const CRISIS_REMINDER_KEY = 'crisisReminderSeen'
const showCrisisReminder = ref(localStorage.getItem(CRISIS_REMINDER_KEY) !== '1')
let reminderTimer = null

function onPrincipalInput(e) {
  const val = parseFloat(e.target.value) || 0
  stockPrincipal.value = val
  localStorage.setItem('stockPrincipal', val)
}

const stockTotalProfit = computed(() => totalProfit.value)
const stockTotalAsset = computed(() =>
  stockPrincipal.value + stockTotalProfit.value - stockHoldingAmount.value + stockHoldingMarketValue.value
)
const stockHoldingAmount = computed(() => holdingAmount.value)

const stockCodes = computed(() => {
  const codes = new Set()
  stockList.value.forEach(s => { if (s.code) codes.add(String(s.code).trim()) })
  return [...codes]
})

const stockUnrealizedLoss = computed(() => {
  return stockList.value.reduce((sum, stock) => {
    if (stock.isCleared) return sum
    const res = calcStock(stock)
    const remaining = res.remainingCostTotal
    if (!Number.isFinite(remaining) || remaining <= 0) return sum
    const priceInfo = stockPrices.value[stock.code]
    const price = priceInfo?.price
    const marketValue = Number.isFinite(price) && price > 0 ? res.count * price : 0
    const loss = remaining - marketValue
    if (loss <= 0) return sum
    return sum + loss
  }, 0)
})

const stockTrappedRatio = computed(() => {
  if (stockTotalAsset.value <= 0) return 0
  return (stockHoldingAmount.value / stockTotalAsset.value) * 100
})

/* ---------- A股打新资格统计 ---------- */
function exchangeOf(code) {
  const board = getStockBoard(code)
  if (board === '沪主板' || board === '科创板') return 'sh'
  if (board === '深主板' || board === '创业板') return 'sz'
  if (board === '北交所') return 'bj'
  return null
}
// 各市场持仓实时市值（仅作参考，实际打新以 20 日日均为准）
const ipoMarketValue = computed(() => {
  let sh = 0, sz = 0, bj = 0
  stockList.value.forEach(stock => {
    if (stock.isCleared) return
    const res = calcStock(stock)
    const price = stockPrices.value[stock.code]?.price
    if (!price || !Number.isFinite(price)) return
    const mv = res.count * price
    const ex = exchangeOf(stock.code)
    if (ex === 'sh') sh += mv
    else if (ex === 'sz') sz += mv
    else if (ex === 'bj') bj += mv
  })
  return { sh, sz, bj }
})

// T-2 前 20 个交易日日均市值（从后端拉取，含每日明细）
const ipoAvg = ref({ sh: 0, sz: 0, bj: 0, shDaily: [], szDaily: [], bjDaily: [], avgDays: 0, t2Date: '', loading: false, loaded: false })
async function loadIpoMarketValue() {
  ipoAvg.value.loading = true
  try {
    const res = await fetch('/api/stock/ipo-market-value', { cache: 'no-store' })
    const data = await res.json()
    ipoAvg.value = {
      sh: data.sh || 0,
      sz: data.sz || 0,
      bj: data.bj || 0,
      shDaily: data.shDaily || [],
      szDaily: data.szDaily || [],
      bjDaily: data.bjDaily || [],
      avgDays: data.avgDays || 0,
      t2Date: data.t2Date || '',
      loading: false,
      loaded: true
    }
  } catch (e) {
    console.error('[IPO] 拉取日均市值失败', e)
    ipoAvg.value.loading = false
  }
}
// 用于资格判断的市值：已加载则用 20 日日均（含0），未加载才降级用实时市值
const ipoEffectiveMv = computed(() => {
  if (ipoAvg.value.loaded) return { sh: ipoAvg.value.sh, sz: ipoAvg.value.sz, bj: ipoAvg.value.bj }
  return { sh: ipoMarketValue.value.sh, sz: ipoMarketValue.value.sz, bj: ipoMarketValue.value.bj }
})

// 每 5000 元市值 = 1 个申购单位 = 500 股
function ipoUnits(mv) { return Math.floor(mv / 5000) * 500 }
function ipoGap(mv) { return Math.max(0, 10000 - mv) }

// 近 20 日底仓市值走势图（viewBox 400x110，留坐标轴空间）
const ipoChart = computed(() => {
  const sh = ipoAvg.value.shDaily
  const sz = ipoAvg.value.szDaily
  const days = sh.length || sz.length
  if (!days) return { sh: '', sz: '', yTicks: [], xLabels: [], maxV: 10000 }
  const maxV = Math.max(10000, ...sh.map((d) => d.value), ...sz.map((d) => d.value))
  // Y 轴刻度：0、1万、ceil(max/10000)*10000，取整到万
  const topTick = Math.ceil(maxV / 10000) * 10000
  const yTicks = [
    { val: 0, y: 100 },
    { val: 10000, y: 100 - (10000 / topTick) * 80 },
    { val: topTick, y: 20 }
  ]
  const toY = (v) => 100 - (v / topTick) * 80
  const padX = 36
  const chartW = 400 - padX - 4
  const toX = (i) => padX + (i / Math.max(1, days - 1)) * chartW
  const build = (arr) => arr.map((d, i) => `${toX(i)},${toY(d.value)}`).join(' ')
  // X 轴标签：首、中、尾
  const xLabels = [
    { x: toX(0), label: sh[0]?.date.slice(5) || '' },
    { x: toX(Math.floor((days - 1) / 2)), label: sh[Math.floor((days - 1) / 2)]?.date.slice(5) || '' },
    { x: toX(days - 1), label: sh[days - 1]?.date.slice(5) || '' }
  ]
  return { sh: build(sh), sz: build(sz), yTicks, xLabels, maxV: topTick, tenK: toY(10000) }
})

// 用户可配置的账户条件（持久化）
const ipoSettings = reactive({
  has2YearExp: localStorage.getItem('ipo_has2YearExp') === '1',
  gemOpen: localStorage.getItem('ipo_gemOpen') === '1',   // 创业板权限
  starOpen: localStorage.getItem('ipo_starOpen') === '1', // 科创板权限
  bjOpen: localStorage.getItem('ipo_bjOpen') === '1',     // 北交所权限
  cbOpen: localStorage.getItem('ipo_cbOpen') === '1'      // 可转债权限
})
function toggleIpo(key) {
  ipoSettings[key] = !ipoSettings[key]
  localStorage.setItem('ipo_' + key, ipoSettings[key] ? '1' : '0')
}
const ipoTotalAsset = computed(() => netAssetTotal.value)

// 各板块资格
const ipoBoards = computed(() => {
  const asset = ipoTotalAsset.value
  const exp = ipoSettings.has2YearExp
  const sh = ipoEffectiveMv.value.sh
  const sz = ipoEffectiveMv.value.sz
  return [
    {
      key: 'main', name: '沪深主板', assetReq: 0, expReq: false, permReq: true, perm: true,
      mv: Math.max(sh, sz), mvLabel: sh >= sz ? '沪' : '深',
      desc: '60/00开头 · 底仓≥1万', gap: ipoGap(Math.max(sh, sz)), unit: ipoUnits(Math.max(sh, sz))
    },
    {
      key: 'gem', name: '创业板', assetReq: 100000, expReq: true, permReq: true, perm: ipoSettings.gemOpen,
      mv: sz, mvLabel: '深', desc: '30开头 · 深市底仓≥1万', gap: ipoGap(sz), unit: ipoUnits(sz)
    },
    {
      key: 'star', name: '科创板', assetReq: 500000, expReq: true, permReq: true, perm: ipoSettings.starOpen,
      mv: sh, mvLabel: '沪', desc: '68开头 · 沪市底仓≥1万', gap: ipoGap(sh), unit: ipoUnits(sh)
    },
    {
      key: 'bj', name: '北交所', assetReq: 500000, expReq: true, permReq: true, perm: ipoSettings.bjOpen,
      mv: 0, mvLabel: '—', desc: '8/4开头 · 无需底仓（需预缴）', gap: 0, unit: 0
    }
  ]
})
const ipoConvertible = computed(() => {
  const asset = ipoTotalAsset.value
  return {
    assetReq: 100000, expReq: true, permReq: true, perm: ipoSettings.cbOpen,
    assetGap: Math.max(0, 100000 - asset)
  }
})
function ipoUnmet(b) {
  const unmet = []
  if (b.permReq && !b.perm) unmet.push('未开通权限')
  if (b.expReq && !ipoSettings.has2YearExp) unmet.push('不满2年经验')
  if (b.assetReq > 0 && ipoTotalAsset.value < b.assetReq) unmet.push(`资产差¥${fmtNum(b.assetReq - ipoTotalAsset.value)}`)
  if (b.gap > 0) unmet.push(`底仓差¥${fmtNum(b.gap)}`)
  return unmet
}
// 直接列出所有未满足的条件；全部满足才显示可申购
function ipoBoardStatus(b) {
  const unmet = ipoUnmet(b)
  if (unmet.length) return { ok: false, text: unmet.join(' · ') }
  return { ok: true, text: b.unit > 0 ? `可申${b.unit}股` : '可申购' }
}
const ipoConvertibleStatus = computed(() => {
  const unmet = ipoUnmet({ ...ipoConvertible.value, gap: 0 })
  if (unmet.length) return { ok: false, text: unmet.join(' · ') }
  return { ok: true, text: '可申购' }
})

const goldTotalCost = computed(() => totalAmount.value)
const goldTotalGrams = computed(() => totalGrams.value)
const goldAvgPrice = computed(() => avgPrice.value)
const goldTotalMarketValue = computed(() => marketValue.value)
const goldHasSell = computed(() => goldItems.value.some(item => (item.sellRecords || []).length > 0))

const depositTotal = computed(() => depositTotalAmount.value)

const netAssetTotal = computed(() => depositTotal.value + stockTotalAsset.value + goldTotalMarketValue.value)

/* ---------- 净资产大屏数字（按位轮动） ---------- */
const rollNeg = computed(() => netAssetTotal.value < 0)

const rollTarget = computed(() => {
  const fixed = Math.abs(netAssetTotal.value).toFixed(2)
  const [int, dec] = fixed.split('.')
  return { intDigits: int.split('').map(Number), decDigits: dec.split('').map(Number) }
})

// 整数位每三位插一个千分位逗号：len 为整数位数，返回第 i 位之后是否需要逗号
function commaAfter(i, len) {
  return i < len - 1 && (len - 1 - i) % 3 === 0
}

// 数位名称，按从右往左的位序索引
const PLACE_NAMES = ['个', '十', '百', '千', '万', '十万', '百万', '千万', '亿', '十亿', '百亿', '千亿', '万亿']
function placeName(i, len) {
  return PLACE_NAMES[len - 1 - i] || ''
}

// 每位数字渲染的是“格子序号”而不是数字本身：列里放 INITIAL_TURNS + 1 轮 0-9，
// 落位序号是 turns * 10 + d；初始动画滚满三整圈，后续刷新只滚变化位并滚满两整圈
const INITIAL_TURNS = 3
const SUB_TURNS = 2
const ROLL_CELLS = (INITIAL_TURNS + 1) * 10
const rollShown = ref({ int: [0], dec: [0, 0] })
const snapping = ref(false)
const isGrowing = ref(false)

// 落位：滚满三整圈后停在目标数字上（初始动画口径）
const toPosInitial = (digits) => digits.map((d) => INITIAL_TURNS * 10 + d)

// 补位节奏：小于单次滚动时长，让各位重叠成一道连贯的波
const GROW_STEP = 560
const ROLL_DUR = 4600
const initialRollSchedule = ref([])
let growTimers = []

function createInitialRollSchedule(digitCount) {
  let delay = 0
  return Array.from({ length: digitCount }, (_, place) => {
    const remaining = digitCount - place
    if (place > 0) delay += GROW_STEP
    const duration = remaining === 1 ? 6600 : ROLL_DUR
    return { delay, duration }
  })
}

function initialDigitStyle(place) {
  if (!isGrowing.value) return {}
  const duration = initialRollSchedule.value[place]?.duration || ROLL_DUR
  return { '--roll-dur': `${duration}ms` }
}

function stopGrow() {
  growTimers.forEach(clearTimeout)
  growTimers = []
  isGrowing.value = false
}

const mountReady = ref(false)
let initialShown = false

// 初始动画：进入资产总览页后整屏所有位滚满三整圈落到目标（位数变化时从个位逐位补位）
function runInitialRoll(t, suspense = true) {
  stopGrow()
  const tInt = t.intDigits
  const tDec = t.decDigits
  initialRollSchedule.value = suspense ? createInitialRollSchedule(tInt.length)
    : tInt.map((_, index) => ({ delay: index * GROW_STEP, duration: ROLL_DUR }))
  isGrowing.value = true
  const schedule = initialRollSchedule.value
  const finish = schedule[schedule.length - 1]
  const sameWidth =
    rollShown.value.int.length === tInt.length && rollShown.value.dec.length === tDec.length

  if (sameWidth) {
    // 先无过渡退回短位（画面完全一致），再整圈滚到目标
    snapping.value = true
    rollShown.value = {
      int: rollShown.value.int.map((p) => p % 10),
      dec: rollShown.value.dec.map((p) => p % 10)
    }
    requestAnimationFrame(() => {
      snapping.value = false
      rollShown.value = { int: toPosInitial(tInt), dec: toPosInitial(tDec) }
    })
    growTimers.push(setTimeout(() => { isGrowing.value = false }, finish.duration))
    return
  }

  // 位数变化：从个位起逐位补位，新位从 0 滚一整圈到目标值，已就位的低位保持不动
  isGrowing.value = true
  const reveal = (len) => {
    const slice = tInt.slice(tInt.length - len)
    const settled = len > 1 ? rollShown.value.int.slice(-(len - 1)) : []
    rollShown.value = { int: [0, ...settled], dec: rollShown.value.dec }
    requestAnimationFrame(() => {
      rollShown.value = { int: toPosInitial(slice), dec: toPosInitial(tDec) }
    })
  }

  reveal(1)
  for (let len = 2; len <= tInt.length; len++) {
    growTimers.push(setTimeout(() => reveal(len), schedule[len - 1].delay))
  }
  growTimers.push(
    setTimeout(() => { isGrowing.value = false }, finish.delay + finish.duration)
  )
}

// 后续动画：只滚改变的数位并滚满两整圈；数字变大（该位从下往上滚），变小（从上往下滚）
function runSubRoll(t) {
  stopGrow()
  const tInt = t.intDigits
  const tDec = t.decDigits
  const curInt = rollShown.value.int.map((p) => ((p % 10) + 10) % 10)
  const curDec = rollShown.value.dec.map((p) => ((p % 10) + 10) % 10)
  const sameWidth = curInt.length === tInt.length && curDec.length === tDec.length

  // 位数变化（跨数量级，罕见）：沿用初始式补位动画
  if (!sameWidth) {
    runInitialRoll(t, false)
    return
  }

  const baseInt = tInt.map((dNew, i) => {
    const dOld = curInt[i]
    if (dNew === dOld) return rollShown.value.int[i]
    return dNew > dOld ? dOld : SUB_TURNS * 10 + dOld
  })
  const baseDec = tDec.map((dNew, i) => {
    const dOld = curDec[i]
    if (dNew === dOld) return rollShown.value.dec[i]
    return dNew > dOld ? dOld : SUB_TURNS * 10 + dOld
  })
  const targetInt = tInt.map((dNew, i) => {
    const dOld = curInt[i]
    if (dNew === dOld) return rollShown.value.int[i]
    return dNew > dOld ? SUB_TURNS * 10 + dNew : dNew
  })
  const targetDec = tDec.map((dNew, i) => {
    const dOld = curDec[i]
    if (dNew === dOld) return rollShown.value.dec[i]
    return dNew > dOld ? SUB_TURNS * 10 + dNew : dNew
  })

  snapping.value = true
  rollShown.value = { int: baseInt, dec: baseDec }
  requestAnimationFrame(() => {
    snapping.value = false
    rollShown.value = { int: targetInt, dec: targetDec }
  })
}

function onRollTarget(t) {
  if (!mountReady.value) return
  if (!initialShown) {
    initialShown = true
    runInitialRoll(t)
  } else {
    runSubRoll(t)
  }
}

watch(rollTarget, onRollTarget)

const shareOf = (val) => {
  if (netAssetTotal.value <= 0) return 0
  return (val / netAssetTotal.value) * 100
}
const depositShare = computed(() => shareOf(depositTotal.value))
const stockShare = computed(() => shareOf(stockTotalAsset.value))
const goldShare = computed(() => shareOf(goldTotalMarketValue.value))

/* ---------- 危机等级配色 ---------- */
const LEVEL_ACCENT = {
  '安全': '#36b37e',
  '警戒': '#e0a63c',
  '危险': '#ff9470',
  '危机': '#f4708e'
}

const crisisLevel = computed(() => getCrisisLevel(stockTrappedRatio.value))
const crisisConfig = computed(() => CRISIS_LEVELS[crisisLevel.value] || CRISIS_LEVELS['安全'])
const crisisIcon = computed(() => iconMap[crisisConfig.value.icon] || Smile)
const crisisAccent = computed(() => LEVEL_ACCENT[crisisLevel.value] || '#36b37e')

/* ---------- 资产分布环形图 ---------- */
const DONUT_R = 46
const DONUT_GAP = 7
const donutC = 2 * Math.PI * DONUT_R
const donutProgress = ref(1)

const donutSegments = computed(() => {
  const items = [
    { key: 'deposit', label: '存款', value: depositTotal.value, color: '#7fd6b0' },
    { key: 'stock', label: '股票', value: stockTotalAsset.value, color: '#86c8ff' },
    { key: 'gold', label: '黄金', value: goldTotalMarketValue.value, color: '#e6c887' }
  ]
  const total = items.reduce((sum, i) => sum + i.value, 0) || 1
  let acc = 0
  return items.map(item => {
    const frac = item.value / total
    const full = frac * donutC
    const dash = full > DONUT_GAP * 1.6 ? (full - DONUT_GAP) * donutProgress.value : full * donutProgress.value
    const seg = { ...item, percent: frac * 100, dash, offset: -acc * donutC }
    acc += frac
    return seg
  })
})

let donutRaf = 0
function playDonut() {
  cancelAnimationFrame(donutRaf)
  const start = performance.now()
  const dur = 1200
  const tick = (now) => {
    const p = Math.min(1, (now - start) / dur)
    donutProgress.value = 1 - Math.pow(1 - p, 3)
    if (p < 1) donutRaf = requestAnimationFrame(tick)
  }
  donutProgress.value = 0
  donutRaf = requestAnimationFrame(tick)
}

/* ---------- 收益趋势折线图 ---------- */
const trendSeries = computed(() => {
  const raw = []
  const collect = (records) => {
    ;(records || []).forEach(r => {
      const v = Number(r.netProfit)
      if (r.sellDate && Number.isFinite(v) && v !== 0) raw.push({ date: r.sellDate, value: v })
    })
  }
  stocks.value.forEach(s => collect(s.sellRecords))
  goldItems.value.forEach(g => collect(g.sellRecords))

  raw.sort((a, b) => String(a.date).localeCompare(String(b.date)))

  let acc = 0
  return raw.map(p => {
    acc += p.value
    return { date: String(p.date), value: acc }
  })
})

function axisNum(v) {
  const n = Number(v) || 0
  if (Math.abs(n) >= 10000) return (n / 10000).toFixed(1) + '万'
  return n.toFixed(0)
}

const trendGeom = computed(() => {
  const pts = trendSeries.value
  if (pts.length < 2) return null

  const W = 460
  const H = 208
  const padL = 54
  const padR = 18
  const padT = 20
  const padB = 32
  const plotW = W - padL - padR
  const plotH = H - padT - padB

  const values = pts.map(p => p.value)
  const min = Math.min(0, ...values)
  const max = Math.max(0, ...values)
  const span = max - min || 1

  const yOf = (v) => padT + (1 - (v - min) / span) * plotH
  const coords = pts.map((p, i) => ({
    x: padL + (i / (pts.length - 1)) * plotW,
    y: yOf(p.value)
  }))

  const line = coords.map((c, i) => `${i ? 'L' : 'M'}${c.x.toFixed(2)} ${c.y.toFixed(2)}`).join(' ')
  const area = `${line} L${coords[coords.length - 1].x.toFixed(2)} ${(padT + plotH).toFixed(2)} L${coords[0].x.toFixed(2)} ${(padT + plotH).toFixed(2)} Z`

  const ticks = []
  for (let k = 0; k < 4; k++) {
    const v = min + (span * k) / 3
    ticks.push({ v, y: yOf(v), label: axisNum(v) })
  }

  const midIdx = Math.floor((pts.length - 1) / 2)
  const xLabels = [
    { x: padL, label: pts[0].date.slice(5, 10), anchor: 'start' },
    { x: padL + plotW / 2, label: pts[midIdx].date.slice(5, 10), anchor: 'middle' },
    { x: padL + plotW, label: pts[pts.length - 1].date.slice(5, 10), anchor: 'end' }
  ]

  return {
    W,
    H,
    padL,
    padR,
    padT,
    padB,
    line,
    area,
    ticks,
    xLabels,
    last: coords[coords.length - 1],
    zeroY: yOf(0),
    total: values[values.length - 1]
  }
})

const trendPathRef = ref(null)

function playTrendDraw() {
  const el = trendPathRef.value
  if (!el || typeof el.getTotalLength !== 'function') return
  const len = el.getTotalLength()
  if (!Number.isFinite(len) || len <= 0) return
  el.style.transition = 'none'
  el.style.strokeDasharray = `${len}`
  el.style.strokeDashoffset = `${len}`
  void el.getBoundingClientRect()
  el.style.transition = 'stroke-dashoffset 1.6s cubic-bezier(0.2, 0.8, 0.3, 1)'
  el.style.strokeDashoffset = '0'
}

watch(trendGeom, (g) => {
  if (!g) return
  nextTick(playTrendDraw)
}, { flush: 'post' })

/* ---------- 星尘 ---------- */
const stars = ref([])
function buildStars() {
  const list = []
  for (let i = 0; i < 56; i++) {
    const size = (Math.random() * 2.1 + 1).toFixed(2)
    list.push({
      id: i,
      style: {
        left: (Math.random() * 100).toFixed(2) + '%',
        top: (Math.random() * 100).toFixed(2) + '%',
        width: size + 'px',
        height: size + 'px',
        '--o': (0.25 + Math.random() * 0.55).toFixed(2),
        '--dur': (8 + Math.random() * 10).toFixed(2) + 's',
        '--delay': (-Math.random() * 14).toFixed(2) + 's'
      }
    })
  }
  stars.value = list
}

function formatNumber(val, decimals = 2) {
  return fmtNum(val, decimals)
}

function compactWan(val) {
  const n = Number(val) || 0
  if (Math.abs(n) >= 10000) return (n / 10000).toFixed(1) + '万'
  return fmtNum(n, 0)
}

onMounted(async () => {
  buildStars()
  if (showCrisisReminder.value) {
    localStorage.setItem(CRISIS_REMINDER_KEY, '1')
    reminderTimer = window.setTimeout(() => {
      showCrisisReminder.value = false
    }, 4000)
  }
  // 基础数据并行加载（股票列表/黄金列表/存款互不依赖），尽快进入初始动画
  await Promise.all([loadStocks(), loadGoldItems(), loadDeposits()])
  if (!stockPrincipal.value) {
    stockPrincipal.value = Math.round(totalCost.value)
  }

  playDonut()
  nextTick(playTrendDraw)

  // 基础数据到位立即触发初始滚动动画，不再阻塞等待金价网络请求
  mountReady.value = true
  onRollTarget(rollTarget.value)

  // 打新底仓市值（20日日均）在数据就绪后异步加载
  loadIpoMarketValue()

  // 金价后台补充，回来后由 watch(rollTarget) 自动驱动后续滚动更新
  fetchGoldPrice()

  // 启动 30s 股价定时刷新，驱动大屏净资产数字的逐位滚动动画
  startStockPriceTimer(() => stockCodes.value)
})

onBeforeUnmount(() => {
  if (reminderTimer) window.clearTimeout(reminderTimer)
  cancelAnimationFrame(donutRaf)
  stopGrow()
  stopStockPriceTimer()
})
</script>

<style scoped>
/* ============ 主题变量 ============ */
.ov-root {
  --ice: #86c8ff;
  --ice-deep: #4aa8f0;
  --ice-ink: #3d84c6;
  --ink: #222838;
  --ink-soft: #5b6b84;
  --ink-faint: #93a4bd;
  --profit: #36b37e;
  --risk: #ff9470;
  --glass-a: rgba(255, 255, 255, 0.52);
  --glass-b: rgba(255, 255, 255, 0.14);
  --glass-base: rgba(255, 255, 255, 0.25);
  --edge: rgba(255, 255, 255, 0.72);
  --hair: rgba(150, 182, 216, 0.26);
  --shadow: 0 18px 46px rgba(84, 132, 190, 0.14);
  --font-display: 'Songti SC', 'STSong', 'Noto Serif SC', 'SimSun', serif;
  --font-body: 'PingFang SC', 'Hiragino Sans GB', 'Microsoft YaHei', 'Segoe UI', sans-serif;
  --font-num: 'DIN Alternate', 'Bahnschrift SemiLight', 'Bahnschrift', 'Segoe UI', sans-serif;

  position: relative;
  z-index: 0;
  min-height: 100vh;
  padding: 20px 22px 64px;
  font-family: var(--font-body);
  color: var(--ink);
  -webkit-font-smoothing: antialiased;
}

/* ============ 星空背景 ============ */
.ov-sky {
  position: fixed;
  inset: 0;
  z-index: 0;
  overflow: hidden;
  pointer-events: none;
  background:
    radial-gradient(115% 85% at 10% 6%, #d2e7ff 0%, rgba(210, 231, 255, 0) 55%),
    radial-gradient(95% 75% at 90% 10%, #e7f3ff 0%, rgba(231, 243, 255, 0) 52%),
    radial-gradient(120% 95% at 72% 102%, #d9eafb 0%, rgba(217, 234, 251, 0) 60%),
    linear-gradient(160deg, #e9f4ff 0%, #f8fcff 44%, #e7f1fc 74%, #f3f9ff 100%);
}
.ov-sky::after {
  content: '';
  position: absolute;
  inset: 0;
  opacity: 0.04;
  mix-blend-mode: soft-light;
  background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='160' height='160'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='3'/%3E%3C/filter%3E%3Crect width='160' height='160' filter='url(%23n)'/%3E%3C/svg%3E");
}

.ov-glow {
  position: absolute;
  border-radius: 50%;
  filter: blur(64px);
  opacity: 0.5;
}
.ov-glow.g1 {
  width: 38vw;
  height: 38vw;
  left: 4vw;
  top: 6vh;
  background: radial-gradient(circle, rgba(134, 200, 255, 0.75), transparent 68%);
  animation: ovPulse 16s ease-in-out infinite;
}
.ov-glow.g2 {
  width: 32vw;
  height: 32vw;
  right: 6vw;
  bottom: 4vh;
  background: radial-gradient(circle, rgba(184, 216, 255, 0.72), transparent 70%);
  animation: ovPulse 21s ease-in-out infinite reverse;
}
@keyframes ovPulse {
  0%, 100% { opacity: 0.34; transform: scale(1); }
  50% { opacity: 0.58; transform: scale(1.09); }
}

.ov-cloud {
  position: absolute;
  border-radius: 50%;
  filter: blur(48px);
  opacity: 0.6;
}
.ov-cloud.c1 {
  width: 54vw;
  height: 44vh;
  left: -10vw;
  top: -8vh;
  background: radial-gradient(circle, rgba(255, 255, 255, 0.95), rgba(255, 255, 255, 0) 70%);
  animation: ovDrift1 40s ease-in-out infinite;
}
.ov-cloud.c2 {
  width: 46vw;
  height: 40vh;
  right: -8vw;
  top: 16vh;
  background: radial-gradient(circle, rgba(212, 234, 255, 0.9), rgba(212, 234, 255, 0) 70%);
  animation: ovDrift2 50s ease-in-out infinite;
}
.ov-cloud.c3 {
  width: 62vw;
  height: 42vh;
  left: 18vw;
  bottom: -14vh;
  background: radial-gradient(circle, rgba(255, 255, 255, 0.88), rgba(255, 255, 255, 0) 72%);
  animation: ovDrift3 58s ease-in-out infinite;
}
@keyframes ovDrift1 {
  0%, 100% { transform: translate3d(0, 0, 0) scale(1); }
  50% { transform: translate3d(5vw, 3vh, 0) scale(1.08); }
}
@keyframes ovDrift2 {
  0%, 100% { transform: translate3d(0, 0, 0) scale(1); }
  50% { transform: translate3d(-4vw, 4vh, 0) scale(1.06); }
}
@keyframes ovDrift3 {
  0%, 100% { transform: translate3d(0, 0, 0) scale(1); }
  50% { transform: translate3d(-6vw, -3vh, 0) scale(1.05); }
}

.ov-star {
  position: absolute;
  border-radius: 50%;
  background: #ffffff;
  box-shadow: 0 0 6px rgba(150, 205, 255, 0.9), 0 0 14px rgba(255, 255, 255, 0.7);
  animation: ovStar var(--dur, 12s) ease-in-out infinite;
  animation-delay: var(--delay, 0s);
}
@keyframes ovStar {
  0%, 100% { transform: translate3d(0, 0, 0); opacity: var(--o, 0.5); }
  50% { transform: translate3d(7px, -16px, 0); opacity: calc(var(--o, 0.5) * 0.35); }
}

/* ============ 内容层 ============ */
.ov-stage {
  position: relative;
  z-index: 1;
  display: flex;
  flex-direction: column;
  gap: 20px;
}

/* ============ 磨砂玻璃基底 ============ */
.glass {
  position: relative;
  background:
    linear-gradient(158deg, var(--glass-a) 0%, var(--glass-b) 62%),
    var(--glass-base);
  backdrop-filter: blur(22px) saturate(1.55);
  -webkit-backdrop-filter: blur(22px) saturate(1.55);
  border: 1px solid var(--edge);
  border-radius: 24px;
  box-shadow:
    var(--shadow),
    0 2px 6px rgba(84, 132, 190, 0.06),
    inset 0 1px 0 rgba(255, 255, 255, 0.9);
}

/* ============ ① 顶部通栏 ============ */
.ov-hero {
  display: flex;
  align-items: center;
  gap: 22px;
  flex-wrap: wrap;
  padding: 22px 26px;
  border-radius: 26px;
  overflow: hidden;
}
.ov-hero-sheen {
  position: absolute;
  inset: 0;
  pointer-events: none;
  overflow: hidden;
  border-radius: inherit;
}
.ov-hero-sheen::after {
  content: '';
  position: absolute;
  top: -60%;
  left: -45%;
  width: 30%;
  height: 220%;
  transform: rotate(13deg);
  filter: blur(7px);
  background: linear-gradient(
    100deg,
    transparent 0%,
    rgba(255, 255, 255, 0.85) 45%,
    rgba(178, 218, 255, 0.55) 60%,
    transparent 100%
  );
  animation: ovSheen 7.5s cubic-bezier(0.4, 0, 0.2, 1) infinite;
}
@keyframes ovSheen {
  0% { left: -45%; }
  55% { left: 125%; }
  100% { left: 125%; }
}

/* 顶部通栏装饰轨道已移除：半透明磨砂卡片会透出背景圆环，造成视觉重叠 */
@keyframes ovSpin { to { transform: rotate(360deg); } }

.ov-hero-left {
  display: flex;
  align-items: center;
  gap: 14px;
  flex: 0 0 auto;
  position: relative;
  z-index: 1;
}
.ov-hero-mark {
  width: 46px;
  height: 46px;
  flex-shrink: 0;
  display: grid;
  place-items: center;
  border-radius: 15px;
  color: #ffffff;
  background: linear-gradient(140deg, #a9d6ff, #5aa9ee 55%, #7cc0f5);
  box-shadow: 0 10px 26px rgba(90, 169, 238, 0.4), inset 0 1px 0 rgba(255, 255, 255, 0.7);
}
.ov-hero-mark svg { width: 21px; height: 21px; }

.ov-hero-titles h1 {
  margin: 0;
  font-family: var(--font-display);
  font-size: 27px;
  font-weight: 700;
  letter-spacing: 0.16em;
  background: linear-gradient(115deg, #2b3a52 0%, #4a7fb5 42%, #8fc4f5 72%, #cbe2f7 100%);
  -webkit-background-clip: text;
  background-clip: text;
  color: transparent;
}
.ov-hero-titles p {
  margin: 5px 0 0;
  font-size: 12px;
  letter-spacing: 0.04em;
  color: var(--ink-faint);
}

/* ============ 净资产大屏 ============ */
/* 数字直接落在通栏玻璃上，不再自成一个带底色/边框/投影的小盒子 */
.ov-screen {
  position: relative;
  z-index: 1;
  margin-left: auto;
  padding: 16px 30px 26px;
  background: none;
  border: none;
  box-shadow: none;
  transition: filter 0.3s ease;
}
.ov-screen-num {
  position: relative;
  z-index: 1;
  display: flex;
  align-items: flex-end;
  line-height: 1;
  font-family: var(--font-num);
  font-weight: 700;
  font-size: clamp(40px, 4.6vw, 76px);
  letter-spacing: 0.01em;
  font-variant-numeric: tabular-nums;
  color: var(--ice-deep);
  /* 辉光交给每一位的 drop-shadow：text-shadow 会被 .ov-od 的 overflow 裁成方块 */
  text-shadow: none;
  /* 数值变化时：逐位错峰，从个位往前滚，先滚的先停 */
  --roll-dur: 4.6s;
  --roll-step: 110ms;
}
/* 补位时节奏由 JS 的补位时机控制，取消逐位错峰避免叠加 */
.ov-screen-num.is-growing {
  --roll-step: 0ms;
}
/* 回位瞬间：画面完全一致，直接跳，不要过渡 */
.ov-screen-num.is-snapping .ov-od-col {
  transition: none;
}
.ov-screen-num.is-risk {
  color: var(--risk);
}
.ov-screen-cur {
  font-size: 0.42em;
  font-weight: 600;
  margin: 0 0.14em 0.28em 0;
  color: var(--ice-ink);
  opacity: 0.86;
}
.ov-screen-sign {
  font-size: 0.62em;
  margin: 0 0.08em 0.12em 0;
}
.ov-screen-dot {
  padding: 0 0.05em;
}
.ov-screen-comma {
  font-size: 0.46em;
  font-weight: 600;
  /* 上提使逗号落在数字基线上：0.4em 是相对本元素自身字号，约等于大字号的 0.18em */
  margin: 0 0.06em 0.4em 0.04em;
  color: var(--ice-ink);
  opacity: 0.72;
  background: none;
}
/* 数位列：列高固定 1em，数位名绝对定位到下方，不影响整行对齐 */
/* 用 inline-flex 而非 inline-block，避免标签换行产生的空白把数字挤偏 */
.ov-col {
  position: relative;
  display: inline-flex;
  flex-direction: column;
  align-items: center;
  height: 1em;
  background: none;
}
.ov-unit {
  position: absolute;
  top: 100%;
  left: 50%;
  transform: translateX(-50%);
  margin-top: 7px;
  font-family: var(--font-body);
  font-size: 11px;
  font-weight: 500;
  line-height: 1;
  letter-spacing: 0.06em;
  white-space: nowrap;
  color: var(--ink-faint);
  text-shadow: none;
  font-variant-numeric: normal;
}
.ov-od {
  display: inline-block;
  height: 1em;
  overflow: hidden;
  background: none;
  filter: drop-shadow(0 3px 15px rgba(74, 168, 240, 0.4));
}
.ov-screen-num.is-risk .ov-od {
  filter: drop-shadow(0 3px 15px rgba(255, 148, 112, 0.4));
}
.ov-od-col {
  display: block;
  background: none;
  transition: transform var(--roll-dur, 2.4s) cubic-bezier(0.22, 1, 0.36, 1);
  transition-delay: calc(var(--ci, 0) * var(--roll-step, 90ms));
  will-change: transform;
}
.ov-od-d {
  display: block;
  height: 1em;
  line-height: 1;
  text-align: center;
  background: none;
}

.is-profit { color: var(--profit); }
.is-risk { color: var(--risk); }

.ov-eye {
  position: relative;
  z-index: 1;
  width: 40px;
  height: 40px;
  flex-shrink: 0;
  display: grid;
  place-items: center;
  border-radius: 13px;
  color: var(--ink-soft);
  background: linear-gradient(158deg, rgba(255, 255, 255, 0.6), rgba(255, 255, 255, 0.22));
  border: 1px solid rgba(255, 255, 255, 0.8);
  box-shadow: 0 8px 20px rgba(84, 132, 190, 0.1), inset 0 1px 0 rgba(255, 255, 255, 0.9);
  transition: all 0.22s ease;
}
.ov-eye svg { width: 17px; height: 17px; }
.ov-eye:hover {
  color: var(--ice-ink);
  transform: translateY(-2px);
  box-shadow: 0 14px 26px rgba(84, 132, 190, 0.2), inset 0 1px 0 rgba(255, 255, 255, 0.95);
}

/* ============ 危机提醒 ============ */
.ov-crisis {
  display: flex;
  align-items: center;
  gap: 16px;
  padding: 15px 22px;
  border-radius: 20px;
  border-color: color-mix(in srgb, var(--accent, #36b37e) 42%, rgba(255, 255, 255, 0.8));
  box-shadow:
    0 14px 34px rgba(84, 132, 190, 0.12),
    0 0 32px color-mix(in srgb, var(--accent, #36b37e) 22%, transparent),
    inset 0 1px 0 rgba(255, 255, 255, 0.9);
}
.ov-crisis-ic {
  width: 46px;
  height: 46px;
  flex-shrink: 0;
  display: grid;
  place-items: center;
  border-radius: 15px;
  color: var(--accent, #36b37e);
  background: color-mix(in srgb, var(--accent, #36b37e) 15%, rgba(255, 255, 255, 0.6));
  border: 1px solid color-mix(in srgb, var(--accent, #36b37e) 26%, transparent);
}
.ov-crisis-ic svg { width: 24px; height: 24px; }
.ov-crisis-body { display: flex; flex-direction: column; gap: 3px; }
.ov-crisis-title {
  font-size: 14px;
  font-weight: 600;
  letter-spacing: 0.06em;
  color: var(--accent, #36b37e);
}
.ov-crisis-ratio { display: flex; align-items: baseline; gap: 8px; }
.ov-crisis-num {
  font-family: var(--font-num);
  font-size: 27px;
  font-weight: 700;
  font-variant-numeric: tabular-nums;
  color: var(--accent, #36b37e);
}
.ov-crisis-label { font-size: 12px; color: var(--ink-faint); }

/* ============ ② 数据概览区（等高三栏，顶部对齐） ============ */
.ov-flow {
  display: grid;
  grid-template-columns: 1fr 1.8fr 1fr;
  gap: 20px;
  align-items: stretch;
  transition: filter 0.3s ease;
}

.ov-card {
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 24px 26px;
  animation: ovCardIn 0.9s cubic-bezier(0.2, 0.8, 0.3, 1) both;
  animation-delay: calc(var(--i, 0) * 120ms + 120ms);
  transition:
    transform 0.4s cubic-bezier(0.2, 0.8, 0.3, 1),
    box-shadow 0.4s ease,
    border-color 0.4s ease;
}
.ov-card::before {
  content: '';
  position: absolute;
  left: 26px;
  right: 26px;
  top: 0;
  height: 1.5px;
  border-radius: 2px;
  opacity: 0.9;
}
.ov-card:hover,
.ov-card:focus-within {
  z-index: 60;
  transform: translateY(-8px);
  border-color: rgba(255, 255, 255, 0.96);
  box-shadow:
    0 32px 64px rgba(84, 132, 190, 0.22),
    0 0 42px rgba(134, 200, 255, 0.26),
    inset 0 1px 0 rgba(255, 255, 255, 0.95);
}

.ov-card.is-deposit::before { background: linear-gradient(90deg, transparent, #6fd6a8, transparent); }
.ov-card.is-stock::before { background: linear-gradient(90deg, transparent, #86c8ff, transparent); }
.ov-card.is-gold::before { background: linear-gradient(90deg, transparent, #e6c887, transparent); }


/* 卡片角落水印图标 */
.ov-card-wm {
  position: absolute;
  right: 4px;
  bottom: 2px;
  width: 108px;
  height: 108px;
  opacity: 0.06;
  transform: rotate(-12deg);
  pointer-events: none;
}
.ov-card-wm svg { width: 100%; height: 100%; }
.is-deposit .ov-card-wm { color: #2f9e73; }
.is-stock .ov-card-wm { color: #4a7fb5; }
.is-gold .ov-card-wm { color: #b99440; }

.ov-card-head {
  display: flex;
  align-items: center;
  gap: 10px;
  position: relative;
  z-index: 1;
}
.ov-card-head h3 {
  margin: 0;
  font-size: 15px;
  font-weight: 600;
  letter-spacing: 0.1em;
  color: var(--ink-soft);
}
.ov-card-ic {
  width: 30px;
  height: 30px;
  flex-shrink: 0;
  display: grid;
  place-items: center;
  border-radius: 10px;
  border: 1px solid rgba(255, 255, 255, 0.85);
  background: linear-gradient(150deg, rgba(255, 255, 255, 0.7), rgba(255, 255, 255, 0.28));
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.9);
}
.ov-card-ic svg { width: 16px; height: 16px; }
.is-deposit .ov-card-ic { color: #34a97c; }
.is-stock .ov-card-ic { color: var(--ice-ink); }
.is-gold .ov-card-ic { color: #b99440; }

.ov-card-badge {
  margin-left: auto;
  font-size: 10.5px;
  letter-spacing: 0.1em;
  color: var(--ink-faint);
  padding: 3px 10px;
  border-radius: 999px;
  border: 1px dashed rgba(150, 182, 216, 0.55);
  background: rgba(255, 255, 255, 0.3);
}

.ov-card-big {
  position: relative;
  z-index: 1;
  font-family: var(--font-num);
  font-size: 34px;
  font-weight: 700;
  line-height: 1.05;
  letter-spacing: 0.01em;
  font-variant-numeric: tabular-nums;
  color: var(--ice-deep);
  animation: ovNumIn 0.85s cubic-bezier(0.2, 0.8, 0.3, 1) both;
  animation-delay: calc(var(--i, 0) * 120ms + 240ms);
}
.is-deposit .ov-card-big { color: #2f9e73; }
.is-stock .ov-card-big { color: var(--ice-deep); }
.is-gold .ov-card-big { color: #b99440; }

.ov-card-sub {
  position: relative;
  z-index: 1;
  margin-top: -6px;
  font-size: 11.5px;
  letter-spacing: 0.05em;
  color: var(--ink-faint);
}

/* 大数字区 */
.ov-card-main {
  position: relative;
  z-index: 1;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}
.ov-card-num { flex: 1; min-width: 0; }

/* ---------- A股打新资格 ---------- */
.ov-ipo {
  position: relative;
  z-index: 1;
  margin-top: 10px;
  padding-top: 10px;
  border-top: 1px solid transparent;
  border-image: linear-gradient(90deg, transparent, var(--hair), transparent) 1;
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.ov-ipo-head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
}
.ov-ipo-title {
  position: relative;
  font-size: 12px;
  font-weight: 600;
  letter-spacing: 0.1em;
  color: var(--ink);
  cursor: help;
}
.ov-ipo-title::after {
  content: 'ⓘ';
  margin-left: 4px;
  font-size: 10px;
  opacity: 0.55;
  font-weight: 400;
}
.ov-ipo-tip {
  position: absolute;
  left: 0;
  top: calc(100% + 8px);
  z-index: 50;
  width: 280px;
  padding: 12px 14px;
  background: rgba(20, 26, 38, 0.96);
  border: 1px solid rgba(134, 200, 255, 0.3);
  border-radius: 10px;
  box-shadow: 0 12px 32px rgba(0, 0, 0, 0.5);
  color: #d9e0eb;
  font-size: 11.5px;
  font-weight: 400;
  letter-spacing: 0.02em;
  line-height: 1.65;
  opacity: 0;
  visibility: hidden;
  transform: translateY(-4px);
  transition: opacity 0.18s, transform 0.18s, visibility 0.18s;
  pointer-events: none;
}
.ov-ipo-title:hover .ov-ipo-tip {
  opacity: 1;
  visibility: visible;
  transform: translateY(0);
}
.ov-ipo-tip b {
  color: #F5E7BE;
  font-weight: 600;
}
.ov-ipo-tip > b {
  display: block;
  margin-bottom: 6px;
  font-size: 12px;
  letter-spacing: 0.06em;
}
.ov-ipo-tip ul {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 3px;
}
.ov-ipo-tip li {
  padding-left: 12px;
  position: relative;
}
.ov-ipo-tip li::before {
  content: '·';
  position: absolute;
  left: 2px;
  color: #4aa8f0;
  font-weight: 700;
}
.ov-ipo-mv-hint {
  display: flex;
  align-items: center;
  justify-content: space-between;
  font-size: 10px;
  color: var(--ink-faint);
  letter-spacing: 0.03em;
}
.ov-ipo-refresh {
  padding: 1px 8px;
  font-size: 10px;
  border-radius: 5px;
  border: 1px solid rgba(0, 0, 0, 0.1);
  background: rgba(255, 255, 255, 0.4);
  color: var(--ink-faint);
  cursor: pointer;
}
.ov-ipo-refresh:disabled { opacity: 0.5; cursor: default; }
.ov-ipo-mv {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 6px;
}
.ov-ipo-mv-item {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr);
  align-items: baseline;
  gap: 2px 7px;
  padding: 6px 9px;
  border-radius: 10px;
  background: rgba(255, 255, 255, 0.45);
  border: 1px solid rgba(255, 255, 255, 0.6);
}
.ov-ipo-mv-label {
  grid-column: 1 / -1;
  font-size: 10.5px;
  letter-spacing: 0.08em;
  color: var(--ink-faint);
}
.ov-ipo-mv-item b {
  font-family: var(--font-num);
  font-size: 15px;
  font-weight: 700;
  font-variant-numeric: tabular-nums;
  color: var(--ink);
}
.ov-ipo-mv-item b.is-ok { color: #2f9e6b; }
.ov-ipo-mv-item b.is-need { color: #d97757; }
.ov-ipo-mv-sub {
  min-width: 0;
  line-height: 1.5;
  text-align: right;
  overflow-wrap: anywhere;
  font-size: 10px;
  color: var(--ink-faint);
  font-family: var(--font-num);
  font-variant-numeric: tabular-nums;
}
.ov-ipo-mv-sub em {
  font-style: normal;
  opacity: 0.7;
  margin-left: 2px;
}
.ov-ipo-boards {
  display: flex;
  flex-direction: column;
  gap: 3px;
}
.ov-ipo-row {
  display: grid;
  grid-template-columns: 64px 1fr auto;
  align-items: center;
  gap: 8px;
  font-size: 11px;
}
.ov-ipo-board-name {
  font-weight: 600;
  color: var(--ink);
}
.ov-ipo-board-desc {
  color: var(--ink-faint);
  font-size: 10.5px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.ov-ipo-status {
  font-size: 10.5px;
  font-weight: 600;
  font-family: var(--font-num);
  padding: 1px 7px;
  border-radius: 6px;
  text-align: right;
  line-height: 1.5;
}
.ov-ipo-status.is-ok {
  color: #2f9e6b;
  background: rgba(47, 158, 107, 0.12);
}
.ov-ipo-status.is-need {
  color: #d97757;
  background: rgba(217, 119, 87, 0.12);
}

/* 20 日底仓市值走势图 */
.ov-ipo-chart {
  margin-top: 6px;
  padding-top: 6px;
  border-top: 1px dashed rgba(0, 0, 0, 0.08);
}
.ov-ipo-chart-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  font-size: 10.5px;
  color: var(--ink-faint);
  margin-bottom: 2px;
}
.ov-ipo-chart-legend {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-size: 10px;
}
.ov-ipo-chart-legend i {
  display: inline-block;
  width: 8px;
  height: 2px;
  border-radius: 1px;
  margin-right: 2px;
}
.ov-ipo-chart-legend .dot-sh { background: #4a7fb5; }
.ov-ipo-chart-legend .dot-sz { background: #2f9e73; }
.ov-ipo-chart-svg {
  width: 100%;
  height: auto;
  aspect-ratio: 400 / 110;
  display: block;
}
.ov-ipo-chart-empty {
  font-size: 11px;
  color: var(--ink-faint);
  text-align: center;
  padding: 14px 0;
}

/* 指标网格 */
.ov-metrics {
  position: relative;
  z-index: 1;
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 4px 20px;
  margin-top: 6px;
  padding-top: 16px;
  border-top: 1px solid transparent;
  border-image: linear-gradient(90deg, transparent, var(--hair), transparent) 1;
}
.ov-metric {
  display: flex;
  flex-direction: column;
  gap: 4px;
  min-width: 0;
  padding: 7px 0;
}
.ov-metric-label {
  font-size: 11px;
  letter-spacing: 0.09em;
  color: var(--ink-faint);
}
.ov-metric-val {
  font-family: var(--font-num);
  font-size: 16.5px;
  font-weight: 600;
  font-variant-numeric: tabular-nums;
  color: var(--ink);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.ov-metric-input {
  width: 100%;
  max-width: 118px;
  font-family: var(--font-num);
  font-size: 16.5px;
  font-weight: 600;
  font-variant-numeric: tabular-nums;
  color: var(--ink);
  background: rgba(255, 255, 255, 0.55);
  border: 1px solid rgba(255, 255, 255, 0.85);
  border-radius: 9px;
  padding: 3px 10px;
  transition: all 0.2s ease;
}
.ov-metric-input:focus {
  outline: none;
  background: rgba(255, 255, 255, 0.9);
  border-color: rgba(134, 200, 255, 0.85);
  box-shadow: 0 0 0 3px rgba(134, 200, 255, 0.22);
}

/* 股票卡片：3 列紧凑布局 */
.is-stock .ov-metrics { grid-template-columns: repeat(5, minmax(0, 1fr)); gap: 4px 10px; }
.is-stock .ov-metric-val em {
  font-style: normal;
  font-size: 12px;
  margin-left: 5px;
  opacity: 0.85;
}
.is-stock .ov-metric-label[title] { cursor: help; }

/* 总均价悬浮说明 */
.ov-avg {
  position: relative;
  cursor: help;
  outline: none;
}
.ov-avg-tip {
  position: absolute;
  top: calc(100% + 10px);
  left: 0;
  z-index: 80;
  min-width: 276px;
  padding: 12px 14px;
  border-radius: 14px;
  background: rgba(34, 40, 56, 0.94);
  border: 1px solid rgba(134, 200, 255, 0.42);
  box-shadow: 0 18px 44px rgba(20, 40, 70, 0.34), 0 0 22px rgba(134, 200, 255, 0.18);
  backdrop-filter: blur(14px);
  color: #eaf3ff;
  font-size: 12px;
  line-height: 1.65;
  white-space: nowrap;
  opacity: 0;
  pointer-events: none;
  transform: translateY(-6px);
  transition: opacity 0.2s ease, transform 0.2s ease;
}
.ov-avg-tip::before {
  content: '';
  position: absolute;
  bottom: 100%;
  left: 22px;
  border: 6px solid transparent;
  border-bottom-color: rgba(134, 200, 255, 0.42);
}
.ov-avg:hover .ov-avg-tip,
.ov-avg:focus .ov-avg-tip {
  opacity: 1;
  pointer-events: auto;
  transform: translateY(0);
}
.ov-avg-tip .tip-title {
  margin-bottom: 7px;
  padding-bottom: 6px;
  border-bottom: 1px dashed rgba(134, 200, 255, 0.35);
  font-size: 12px;
  font-weight: 700;
  color: #a9d6ff;
}
.ov-avg-tip .tip-row {
  display: flex;
  justify-content: space-between;
  gap: 20px;
  padding: 2px 0;
  font-variant-numeric: tabular-nums;
}
.ov-avg-tip .tip-row span { color: #b9c8dd; }
.ov-avg-tip .tip-row b { color: #ffffff; font-weight: 600; }
.ov-avg-tip .tip-row.result {
  margin-top: 6px;
  padding-top: 6px;
  border-top: 1px dashed rgba(134, 200, 255, 0.35);
}
.ov-avg-tip .tip-row.result span,
.ov-avg-tip .tip-row.result b { color: #a9d6ff; }
.ov-avg-tip .tip-note {
  margin-top: 7px;
  padding-top: 6px;
  border-top: 1px dashed rgba(134, 200, 255, 0.28);
  color: #93a4bd;
  font-size: 11px;
  line-height: 1.55;
  white-space: normal;
}

/* ============ ③ 可视化 ============ */
.ov-charts {
  display: grid;
  grid-template-columns: 1fr 1.32fr;
  gap: 20px;
  align-items: stretch;
  transition: filter 0.3s ease;
}
.ov-chart {
  display: flex;
  flex-direction: column;
  gap: 16px;
  padding: 24px 26px;
  overflow: hidden;
  animation: ovCardIn 0.9s cubic-bezier(0.2, 0.8, 0.3, 1) both;
  animation-delay: calc(var(--i, 0) * 120ms + 220ms);
  transition:
    transform 0.4s cubic-bezier(0.2, 0.8, 0.3, 1),
    box-shadow 0.4s ease,
    border-color 0.4s ease;
}
.ov-chart:hover {
  transform: translateY(-6px);
  border-color: rgba(255, 255, 255, 0.96);
  box-shadow:
    0 28px 58px rgba(84, 132, 190, 0.2),
    0 0 38px rgba(134, 200, 255, 0.22),
    inset 0 1px 0 rgba(255, 255, 255, 0.95);
}
.ov-chart-head {
  display: flex;
  align-items: center;
  gap: 12px;
}
.ov-chart-head h3 {
  margin: 0;
  font-size: 15px;
  font-weight: 600;
  letter-spacing: 0.1em;
  color: var(--ink-soft);
}
.ov-chart-head p {
  margin: 3px 0 0;
  font-size: 11px;
  letter-spacing: 0.05em;
  color: var(--ink-faint);
}
.ov-chart-total {
  margin-left: auto;
  font-family: var(--font-num);
  font-size: 19px;
  font-weight: 700;
  font-variant-numeric: tabular-nums;
}

/* 环形图 */
.ov-donut-body {
  flex: 1;
  display: flex;
  align-items: center;
  gap: 24px;
  flex-wrap: wrap;
}
.ov-donut-wrap {
  position: relative;
  flex: 0 0 auto;
  width: 168px;
  height: 168px;
}
.ov-donut-halo {
  position: absolute;
  inset: -6px;
  border-radius: 50%;
  background: radial-gradient(circle, rgba(134, 200, 255, 0.3), rgba(134, 200, 255, 0) 68%);
  filter: blur(12px);
  animation: ovHalo 5.5s ease-in-out infinite;
}
@keyframes ovHalo {
  0%, 100% { opacity: 0.45; transform: scale(0.94); }
  50% { opacity: 0.9; transform: scale(1.04); }
}
.ov-donut { position: relative; width: 100%; height: 100%; display: block; }
.ov-donut-track {
  fill: none;
  stroke: rgba(255, 255, 255, 0.55);
  stroke-width: 14;
}
.ov-donut-rot {
  transform-origin: 60px 60px;
  animation: ovSpin 90s linear infinite;
}
.ov-donut-seg {
  fill: none;
  stroke-width: 14;
  stroke-linecap: round;
  filter: drop-shadow(0 0 6px rgba(134, 200, 255, 0.4));
}
.ov-donut-center {
  position: absolute;
  inset: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 3px;
  pointer-events: none;
}
.ov-donut-center span {
  font-size: 11px;
  letter-spacing: 0.16em;
  color: var(--ink-faint);
}
.ov-donut-center b {
  font-family: var(--font-num);
  font-size: 23px;
  font-weight: 700;
  color: var(--ice-deep);
  font-variant-numeric: tabular-nums;
  animation: ovNumIn 0.9s cubic-bezier(0.2, 0.8, 0.3, 1) both;
  animation-delay: 0.6s;
}

.ov-legend {
  list-style: none;
  margin: 0;
  padding: 0;
  flex: 1 1 190px;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 14px;
}
.ov-legend li {
  display: flex;
  align-items: center;
  gap: 10px;
  font-size: 12.5px;
  color: var(--ink-soft);
  padding-bottom: 12px;
  border-bottom: 1px solid transparent;
  border-image: linear-gradient(90deg, transparent, var(--hair), transparent) 1;
}
.ov-legend li:last-child { border-bottom: 0; padding-bottom: 0; }
.ov-legend i {
  width: 9px;
  height: 9px;
  flex-shrink: 0;
  border-radius: 50%;
  box-shadow: 0 0 9px currentColor;
}
.ov-legend .lg-label { letter-spacing: 0.06em; }
.ov-legend .lg-val {
  margin-left: auto;
  font-family: var(--font-num);
  font-variant-numeric: tabular-nums;
  color: var(--ink);
}
.ov-legend .lg-pct {
  width: 56px;
  text-align: right;
  font-family: var(--font-num);
  font-weight: 700;
  font-variant-numeric: tabular-nums;
  color: var(--ice-ink);
}

/* 折线图 */
.ov-trend { flex: 1; display: flex; flex-direction: column; justify-content: center; }
.ov-trend-svg { width: 100%; height: auto; display: block; overflow: visible; }

.ov-grid line {
  stroke: rgba(150, 182, 216, 0.22);
  stroke-width: 1;
  stroke-dasharray: 3 5;
}
.ov-grid text {
  fill: #9aabc4;
  font-family: var(--font-num);
  font-size: 10px;
  font-variant-numeric: tabular-nums;
}
.ov-axis {
  stroke: rgba(120, 158, 200, 0.42);
  stroke-width: 1.2;
}
.ov-zero {
  stroke: rgba(120, 158, 200, 0.45);
  stroke-width: 1;
  stroke-dasharray: 5 5;
}
.ov-xlab {
  fill: #9aabc4;
  font-family: var(--font-num);
  font-size: 10.5px;
  letter-spacing: 0.04em;
}

.ov-trend-line {
  fill: none;
  stroke: url(#ovTrendLine);
  stroke-width: 2.6;
  stroke-linecap: round;
  stroke-linejoin: round;
  filter: drop-shadow(0 3px 10px rgba(74, 168, 240, 0.4));
}
/* 沿线流动的柔光 */
.ov-trend-flow {
  fill: none;
  stroke: rgba(255, 255, 255, 0.95);
  stroke-width: 2.6;
  stroke-linecap: round;
  stroke-dasharray: 22 240;
  animation: ovFlow 3.8s linear infinite;
  filter: drop-shadow(0 0 8px rgba(134, 200, 255, 0.95));
  pointer-events: none;
}
@keyframes ovFlow {
  from { stroke-dashoffset: 262; }
  to { stroke-dashoffset: 0; }
}
.ov-trend-area {
  animation: ovNumIn 1.2s ease both;
  animation-delay: 1s;
}
.ov-trend-halo {
  fill: rgba(134, 200, 255, 0.35);
  animation: ovDotPulse 2.6s ease-in-out infinite;
  transform-origin: center;
}
.ov-trend-dot {
  fill: #ffffff;
  stroke: var(--ice-deep);
  stroke-width: 2.6;
  filter: drop-shadow(0 0 8px rgba(74, 168, 240, 0.75));
}
@keyframes ovDotPulse {
  0%, 100% { opacity: 0.25; r: 7; }
  50% { opacity: 0.7; r: 12; }
}

.ov-trend-empty {
  flex: 1;
  min-height: 190px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 6px;
  text-align: center;
}
.ov-trend-empty-ic {
  width: 46px;
  height: 46px;
  display: grid;
  place-items: center;
  border-radius: 15px;
  color: var(--ice-ink);
  background: linear-gradient(150deg, rgba(134, 200, 255, 0.34), rgba(255, 255, 255, 0.55));
  border: 1px solid rgba(255, 255, 255, 0.85);
  margin-bottom: 4px;
}
.ov-trend-empty-ic svg { width: 22px; height: 22px; }
.ov-trend-empty p {
  margin: 0;
  font-size: 13.5px;
  font-weight: 600;
  letter-spacing: 0.08em;
  color: var(--ink-soft);
}
.ov-trend-empty > span:last-child {
  font-size: 11.5px;
  color: var(--ink-faint);
}

/* ============ 通用动效 ============ */
@keyframes ovCardIn {
  from { opacity: 0; transform: translateY(26px) scale(0.985); }
  to { opacity: 1; transform: none; }
}
@keyframes ovNumIn {
  from { opacity: 0; transform: translateY(10px); filter: blur(6px); }
  to { opacity: 1; transform: none; filter: blur(0); }
}

.is-blurred {
  filter: blur(26px);
  user-select: none;
  pointer-events: none;
}

/* ============ 响应式 ============ */
@media (max-width: 1180px) {
  .ov-flow { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .ov-card.is-deposit { order: 1; }
  .ov-card.is-gold { order: 2; }
  .ov-card.is-stock { order: 3; grid-column: span 2; }
}
@media (max-width: 1080px) {
  .ov-charts { grid-template-columns: minmax(0, 1fr); }
  .ov-screen { margin-left: 0; width: 100%; }
}
@media (max-width: 720px) {
  .ov-root { padding: 14px 14px 56px; }
  .ov-hero { padding: 18px 18px; }
  .ov-card, .ov-chart { padding: 20px 18px; }
  .ov-card-big { font-size: 29px; }
  .ov-screen { padding: 13px 18px 15px; }
  .ov-screen-num { font-size: clamp(30px, 9vw, 44px); }
  .ov-flow { grid-template-columns: minmax(0, 1fr); }
  .ov-card.is-deposit,
  .ov-card.is-gold,
  .ov-card.is-stock { order: 0; grid-column: auto; }
  .ov-metrics { grid-template-columns: minmax(0, 1fr); }
  .ov-donut-wrap { margin: 0 auto; }
  .ov-avg-tip { min-width: 236px; }
}

/* 仅收敛持续性的环境动画，保留图表与卡片入场动效 */
@media (prefers-reduced-motion: reduce) {
  .ov-glow, .ov-cloud, .ov-star, .ov-hero-sheen::after,
  .ov-donut-rot, .ov-donut-halo, .ov-trend-flow, .ov-trend-halo {
    animation: none !important;
  }
}
</style>
