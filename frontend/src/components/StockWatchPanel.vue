<template>
  <!-- 浮动触发按钮 -->
  <button
    @click="showPanel = true"
    class="watch-fab-btn"
    title="每日观察 & 分析"
  >
    <span class="watch-fab-icon">
      <TrendingUp class="h-4 w-4" :stroke-width="1.6" />
    </span>
    <span class="watch-fab-text">每日分析</span>
    <span v-if="todayCount > 0" class="watch-fab-badge">{{ todayCount }}</span>
  </button>

  <!-- 全屏弹层 -->
  <Transition name="watch-panel">
    <div v-if="showPanel" class="watch-overlay" @click.self="closePanel">
      <div class="watch-shell">
        <!-- 顶部头部 -->
        <header class="watch-header">
          <div class="watch-header-glow"></div>
          <div class="watch-header-grain"></div>

          <div class="watch-header-inner">
            <div class="watch-brand">
              <div class="watch-brand-mark">
                <Sparkles class="w-5 h-5" :stroke-width="1.5" />
              </div>
              <div class="watch-brand-text">
                <h2 class="watch-title">每日观察 &amp; 分析</h2>
                <p class="watch-subtitle">前一日看盘记录 · 当日操作计划 · 次日复盘</p>
              </div>
            </div>

            <div class="watch-header-tools">
              <!-- 日期切换器 -->
              <div class="watch-date">
                <button @click="shiftDate(-1)" class="watch-date-nav" title="前一天">
                  <ChevronLeft class="w-3.5 h-3.5" :stroke-width="1.8" />
                </button>
                <button @click="goToday" class="watch-date-label" :class="{ 'is-today': currentDate === todayStr }">
                  {{ formatDateLabel(currentDate) }}
                </button>
                <button @click="shiftDate(1)" class="watch-date-nav" title="后一天">
                  <ChevronRight class="w-3.5 h-3.5" :stroke-width="1.8" />
                </button>
              </div>

              <span class="watch-tool-sep"></span>

              <!-- 情绪筛选 -->
              <div class="watch-filters">
                <button
                  v-for="f in sentimentFilters"
                  :key="f.value"
                  @click="activeSentiment = activeSentiment === f.value ? '' : f.value"
                  class="watch-filter"
                  :class="{ 'is-active': activeSentiment === f.value, ['tone-' + (f.value || 'all')]: true }"
                  :title="f.label"
                >
                  <span>{{ f.label }}</span>
                </button>
              </div>

              <span class="watch-tool-sep"></span>

              <button @click="toggleSummary" class="watch-btn-line" :class="{ 'is-on': !summaryCollapsed }" :title="summaryCollapsed ? '展开盘后总结' : '收起盘后总结'">
                <ClipboardList class="w-3.5 h-3.5" :stroke-width="1.8" />
                <span>盘后总结</span>
              </button>

              <button @click="openAddDialog" class="watch-btn-gold">
                <Plus class="w-3.5 h-3.5" :stroke-width="2" />
                <span>添加</span>
              </button>

              <button @click="closePanel" class="watch-btn-ghost" title="关闭">
                <X class="w-4 h-4" :stroke-width="1.7" />
              </button>
            </div>
          </div>
        </header>

        <!-- 统计概览条（点击可筛选） -->
        <div class="watch-metrics">
          <button class="watch-metric" :class="{ 'is-active': activeMetric === 'all' }" title="观察清单总数，点击取消筛选" @click="toggleMetric('all')">
            <span class="watch-metric-num">{{ watchlist.length }}</span>
            <span class="watch-metric-label">观察总数</span>
          </button>
          <span class="watch-metric-sep"></span>
          <button class="watch-metric" :class="{ 'is-active': activeMetric === 'holding' }" :title="'当前处于持仓状态的股票，点击筛选。持仓数 = ' + holdingCount" @click="toggleMetric('holding')">
            <span class="watch-metric-num tone-up">{{ holdingCount }}</span>
            <span class="watch-metric-label">持仓中</span>
          </button>
          <span class="watch-metric-sep"></span>
          <button class="watch-metric" :class="{ 'is-active': activeMetric === 'analyzed' }" :title="'今日已填写盘后分析的股票，点击筛选。已分析数 = ' + todayCount" @click="toggleMetric('analyzed')">
            <span class="watch-metric-num tone-gold">{{ todayCount }}</span>
            <span class="watch-metric-label">今日已分析</span>
          </button>
          <span class="watch-metric-sep"></span>
          <button class="watch-metric" :class="{ 'is-active': activeMetric === 'reviewed' }" :title="'今日已标记复盘结果的股票，点击筛选。已复盘数 = ' + reviewStats.total" @click="toggleMetric('reviewed')">
            <span class="watch-metric-num tone-gold">{{ reviewStats.total }}</span>
            <span class="watch-metric-label">已复盘</span>
          </button>
          <span class="watch-metric-sep"></span>
          <button class="watch-metric" :class="{ 'is-active': activeMetric === 'hit' }" :title="'想法命中率 = 命中(符合) ÷ 复盘总数 = ' + reviewStats.hit + ' ÷ ' + reviewStats.total + ' = ' + reviewStats.rate + '%，点击筛选今日命中' " @click="toggleMetric('hit')">
            <span class="watch-metric-num tone-gold">{{ reviewStats.rate }}<small class="watch-metric-unit">%</small></span>
            <span class="watch-metric-label">想法命中率</span>
          </button>
          <div class="watch-metric-spacer"></div>
          <div class="watch-metric-tip">
            <Lightbulb class="w-3 h-3" :stroke-width="1.6" />
            <div class="watch-tip-viewport">
              <div class="watch-tip-roll" :style="{ transform: `translateY(-${tipIndex * 100}%)` }">
                <span v-for="(t, i) in metricTips" :key="i" class="watch-tip-line">{{ t }}</span>
              </div>
            </div>
          </div>
        </div>

        <!-- 主体区：卡片 + 盘后总结 -->
        <div class="watch-main">
          <button v-if="canScrollLeft" class="watch-scroll-nav is-prev" title="上一页" aria-label="上一页" @click="scrollTrack(-1)">
            <ChevronLeft class="w-4 h-4" :stroke-width="2" />
          </button>
          <button v-if="canScrollRight" class="watch-scroll-nav is-next" title="下一页" aria-label="下一页" @click="scrollTrack(1)">
            <ChevronRight class="w-4 h-4" :stroke-width="2" />
          </button>
          <!-- 横向滚动卡片区 -->
          <div class="watch-stage" ref="stageRef" @scroll="updateStageScroll">
            <div v-if="loading" class="watch-state">
              <Loader2 class="w-5 h-5 watch-spin" :stroke-width="1.5" />
              <span>正在载入</span>
            </div>

            <div v-else-if="filteredList.length === 0" class="watch-state">
              <div class="watch-state-mark">
                <Target class="w-7 h-7" :stroke-width="1.2" />
              </div>
              <p class="watch-state-title">
                {{ watchlist.length === 0 ? '尚未建立观察清单' : '该情绪分类下暂无标的' }}
              </p>
              <p class="watch-state-sub">
                {{ watchlist.length === 0 ? '添加持仓或看好的股票，开始记录每日分析' : '切换其他情绪分类查看' }}
              </p>
              <button v-if="watchlist.length === 0" @click="openAddDialog" class="watch-btn-gold is-lg">
                <Plus class="w-3.5 h-3.5" :stroke-width="2" />
                <span>添加第一只</span>
              </button>
            </div>

            <div v-else class="watch-track">
              <article
                v-for="item in filteredList"
                :key="item.id"
                class="watch-card"
                :class="[
                  'tone-' + (getSentiment(item) || 'none'),
                  { 'is-pinned': item.pinned },
                  { 'is-dragging': dragId === item.id },
                  { 'is-drop-target': dragOverId === item.id, 'drop-after': dragOverId === item.id && dragOverAfter }
                ]"
                @dragstart="onCardDragStart(item, $event)"
                @dragover="onCardDragOver(item, $event)"
                @dragleave="onCardDragLeave(item, $event)"
                @drop.prevent="onCardDrop(item)"
                @dragend="clearDragState"
              >
                <span class="watch-card-rule"></span>

                <!-- 头部 -->
                <div class="watch-card-top">
                  <div class="watch-card-id">
                    <div class="watch-card-name-row">
                      <h3
                        class="watch-card-name"
                        :class="{ 'is-draggable': !item.pinned, 'is-dragging': !item.pinned && dragId === item.id }"
                        :draggable="!item.pinned"
                        :title="item.pinned ? undefined : '按住名称拖动排序'"
                        @dragstart.stop="onCardDragStart(item, $event)"
                        @dragend="clearDragState"
                      >
                        {{ item.name }}
                      </h3>
                      <Pin v-if="item.pinned" class="w-3 h-3 watch-card-pin" :stroke-width="1.8" />
                      <template v-if="stockPrices[item.code]">
                        <span class="watch-quote-price" :class="stockPrices[item.code].change >= 0 ? 'tone-up' : 'tone-down'">
                          {{ formatNumber(stockPrices[item.code].price, 2) }}
                        </span>
                        <span class="watch-quote-delta" :class="stockPrices[item.code].change >= 0 ? 'tone-up' : 'tone-down'">
                          {{ stockPrices[item.code].changePercent >= 0 ? '+' : '' }}{{ stockPrices[item.code].changePercent }}%
                        </span>
                      </template>
                      <span v-else class="watch-quote-na">暂无行情</span>
                    </div>
                    <p class="watch-card-code">{{ item.code }}<span class="watch-dot">·</span>{{ getStockBoard(item.code) }}</p>
                  </div>
                  <div class="watch-card-side">
                    <span class="watch-chip" :class="item.isHolding ? 'chip-hold' : 'chip-watch'">
                      {{ item.isHolding ? '持仓' : '观察' }}
                    </span>
                  </div>
                </div>

                <!-- 分析内容 -->
                <div class="watch-card-body watch-triple">
                  <!-- 昨日 -->
                  <section class="watch-card-section is-yesterday" :class="{ 'is-empty': !getPrevAnalysis(item) }">
                    <header class="watch-section-head">
                      <div class="watch-yest-left">
                        <span class="watch-section-title">
                          <Clock class="w-3 h-3" :stroke-width="1.7" />
                          <span>{{ getPrevAnalysis(item) ? getPrevAnalysis(item).date : '昨日' }}</span>
                        </span>
                        <span v-if="getPrevAnalysis(item)" class="watch-yest-inline">
                          <span v-if="getPrevAnalysis(item).actionType" class="watch-mini">{{ actionTypeLabel(getPrevAnalysis(item).actionType) }}</span>
                          <span v-if="getPrevAnalysis(item).sentiment" class="watch-mini is-sentiment">
                            <component :is="sentimentIcon(getPrevAnalysis(item).sentiment)" class="w-3 h-3" :stroke-width="2" />
                            {{ sentimentShortLabel(getPrevAnalysis(item).sentiment) }}
                          </span>
                        </span>
                      </div>
                      <button @click="openHistory(item)" class="watch-history-text" :title="`历史每日记录（${(item.analyses || []).length} 条）`">历史</button>
                    </header>
                    <template v-if="getPrevAnalysis(item)">
                      <div v-if="hasPriceTargets(getPrevAnalysis(item))" class="watch-card-targets">
                        <div v-if="getPrevAnalysis(item).targetBuyPrice != null" class="watch-target is-buy">
                          <span class="watch-target-key">买</span>
                          <span class="watch-target-val tone-up">{{ priceRangeText(getPrevAnalysis(item), 'targetBuyPrice', 'targetBuyPriceHigh') }}</span>
                          <span v-if="getPrevAnalysis(item).buyShareCount" class="watch-target-shares">{{ getPrevAnalysis(item).buyShareCount }}股</span>
                        </div>
                        <div v-if="getPrevAnalysis(item).targetSellPrice != null" class="watch-target is-sell">
                          <span class="watch-target-key">卖</span>
                          <span class="watch-target-val tone-down">{{ priceRangeText(getPrevAnalysis(item), 'targetSellPrice', 'targetSellPriceHigh') }}</span>
                          <span v-if="getPrevAnalysis(item).sellShareCount" class="watch-target-shares">{{ getPrevAnalysis(item).sellShareCount }}股</span>
                        </div>
                        <div v-if="getPrevAnalysis(item).stopLossPrice != null" class="watch-target is-loss">
                          <span class="watch-target-key">损</span>
                          <span class="watch-target-val tone-warn">{{ priceRangeText(getPrevAnalysis(item), 'stopLossPrice', 'stopLossPriceHigh') }}</span>
                        </div>
                      </div>
                      <p v-if="getPrevAnalysis(item).note" class="watch-section-note">{{ getPrevAnalysis(item).note }}</p>
                      <p v-if="getPrevAnalysis(item).nextDayNote" class="watch-section-next">
                        <span class="watch-section-next-key">明日看法</span>{{ getPrevAnalysis(item).nextDayNote }}
                      </p>
                      <!-- 对昨日计划的验证（复盘标记） -->
                      <div class="watch-today-verify">
                        <div class="watch-verify-row">
                          <button
                            v-for="r in reviewResults"
                            :key="r.value"
                            class="watch-verify-btn"
                            :class="['rv-' + r.value, { 'is-active': todayAnalysis(item)?.reviewResult === r.value, 'is-suggest': !todayAnalysis(item)?.reviewResult && suggestedVerdict(getPrevAnalysis(item), item.code) === r.value }]"
                            :title="'标记复盘：' + reviewLabel(r.value)"
                            @click="setReview(item.id, currentDate, r.value)"
                          >
                            <span>{{ r.short }}</span>
                          </button>
                          <button v-if="todayAnalysis(item)?.reviewResult" class="watch-review-clear" title="清除复盘标记" @click="setReview(item.id, currentDate, '')">
                            <X class="w-2.5 h-2.5" :stroke-width="2" />
                          </button>
                        </div>
                        <p v-if="getTodayAnalysis(item)?.reviewNote" class="watch-review-note-inline">复盘 · {{ getTodayAnalysis(item).reviewNote }}</p>
                      </div>
                    </template>
                    <p v-else class="watch-section-empty">暂无昨日记录</p>
                  </section>

                  <!-- 今日总结 -->
                  <section class="watch-card-section is-today watch-today-compact">
                    <header class="watch-section-head">
                      <span class="watch-section-title">
                        <PenLine class="w-3 h-3" :stroke-width="1.7" />
                        <span>总结</span>
                      </span>
                    </header>
                    <textarea
                      :value="getTodayAnalysis(item)?.note || ''"
                      @blur="saveInlineNote(item, $event.target.value)"
                      class="watch-today-input"
                      rows="2"
                      placeholder="盘后总结…（失焦自动保存）"
                    ></textarea>
                  </section>

                  <!-- 明日 -->
                  <section class="watch-card-section is-tomorrow">
                    <header class="watch-section-head">
                      <div class="watch-tomorrow-head-left">
                        <span class="watch-section-title">
                          <Calendar class="w-3 h-3" :stroke-width="1.7" />
                          <span>明日看法 / 计划</span>
                        </span>
                        <div v-if="getTodayAnalysis(item)?.actionType || getTodayAnalysis(item)?.sentiment" class="watch-today-saved-chips is-inline">
                          <span v-if="getTodayAnalysis(item).actionType" class="watch-mini">{{ actionTypeLabel(getTodayAnalysis(item).actionType) }}</span>
                          <span v-if="getTodayAnalysis(item).sentiment" class="watch-mini is-sentiment">
                            <component :is="sentimentIcon(getTodayAnalysis(item).sentiment)" class="w-3 h-3" :stroke-width="2" />
                            {{ sentimentShortLabel(getTodayAnalysis(item).sentiment) }}
                          </span>
                        </div>
                      </div>
                      <button @click="openEditDialog(item)" class="watch-section-icobtn" title="编辑明日计划">
                        <Pencil class="w-3 h-3" :stroke-width="1.7" />
                      </button>
                    </header>
                    <div v-if="hasPriceTargets(getTodayAnalysis(item))" class="watch-card-targets">
                      <div v-if="getTodayAnalysis(item).targetBuyPrice != null" class="watch-target is-buy">
                        <span class="watch-target-key">买</span>
                        <span class="watch-target-val tone-up">{{ priceRangeText(getTodayAnalysis(item), 'targetBuyPrice', 'targetBuyPriceHigh') }}</span>
                        <span v-if="getTodayAnalysis(item).buyShareCount" class="watch-target-shares">{{ getTodayAnalysis(item).buyShareCount }}股</span>
                      </div>
                      <div v-if="getTodayAnalysis(item).targetSellPrice != null" class="watch-target is-sell">
                        <span class="watch-target-key">卖</span>
                        <span class="watch-target-val tone-down">{{ priceRangeText(getTodayAnalysis(item), 'targetSellPrice', 'targetSellPriceHigh') }}</span>
                        <span v-if="getTodayAnalysis(item).sellShareCount" class="watch-target-shares">{{ getTodayAnalysis(item).sellShareCount }}股</span>
                      </div>
                      <div v-if="getTodayAnalysis(item).stopLossPrice != null" class="watch-target is-loss">
                        <span class="watch-target-key">损</span>
                        <span class="watch-target-val tone-warn">{{ priceRangeText(getTodayAnalysis(item), 'stopLossPrice', 'stopLossPriceHigh') }}</span>
                      </div>
                    </div>
                    <p v-if="getTodayAnalysis(item)?.nextDayNote" class="watch-tomorrow-text">{{ getTodayAnalysis(item).nextDayNote }}</p>
                    <p v-if="!getTodayAnalysis(item)?.actionType && !getTodayAnalysis(item)?.sentiment && !hasPriceTargets(getTodayAnalysis(item)) && !getTodayAnalysis(item)?.nextDayNote" class="watch-section-empty">暂无明日计划</p>
                  </section>
                </div>

                <!-- 底部操作 -->
                <div class="watch-card-foot">
                  <button @click="togglePin(item)" class="watch-icon-btn" :class="{ 'is-on': item.pinned }" :title="item.pinned ? '取消置顶' : '置顶'">
                    <Pin class="w-3.5 h-3.5" :stroke-width="1.7" />
                  </button>
                  <button @click="openHistory(item)" class="watch-icon-btn" :title="'历史每日记录（' + (item.analyses?.length || 0) + ' 条）'">
                    <ClipboardList class="w-3.5 h-3.5" :stroke-width="1.7" />
                  </button>
                  <button @click="emitTrade(item, 'buy')" class="watch-trade-btn is-buy" title="登记买入">买</button>
                  <button @click="emitTrade(item, 'sell')" class="watch-trade-btn is-sell" title="登记卖出">卖</button>
                  <button @click="removeItem(item)" class="watch-icon-btn is-danger" title="移除">
                    <Trash2 class="w-3.5 h-3.5" :stroke-width="1.7" />
                  </button>
                </div>
              </article>

              <!-- 添加占位卡 -->
              <button @click="openAddDialog" class="watch-card is-add">
                <div class="watch-add-inner">
                  <span class="watch-add-ring">
                    <Plus class="w-6 h-6" :stroke-width="1.6" />
                  </span>
                  <span class="watch-add-title">添加股票</span>
                  <span class="watch-add-sub">持仓或看好的都可以加</span>
                </div>
              </button>
            </div>
          </div>

          <!-- 盘后总结（内联面板，替代原抽屉） -->
          <section v-if="!summaryCollapsed" class="watch-summary-inline is-open">
            <div class="watch-summary-body">
              <div class="watch-summary-grid">
                <div class="watch-summary-left">
                  <div class="watch-summary-stats">
                    <div class="watch-sum-stat">
                      <span class="watch-sum-num">{{ summaryStats.count }}</span>
                      <span class="watch-sum-key">分析标的</span>
                    </div>
                    <div class="watch-sum-stat">
                      <span class="watch-sum-num tone-up">{{ summaryStats.bull }}</span>
                      <span class="watch-sum-key">看多</span>
                    </div>
                    <div class="watch-sum-stat">
                      <span class="watch-sum-num tone-down">{{ summaryStats.bear }}</span>
                      <span class="watch-sum-key">看空</span>
                    </div>
                    <div class="watch-sum-stat">
                      <span class="watch-sum-num">{{ summaryStats.neutral }}</span>
                      <span class="watch-sum-key">震荡</span>
                    </div>
                    <div class="watch-sum-stat">
                      <span class="watch-sum-num" :class="summaryStats.avgPct == null ? '' : (summaryStats.avgPct >= 0 ? 'tone-up' : 'tone-down')">
                        {{ summaryStats.avgPct == null ? '—' : (summaryStats.avgPct >= 0 ? '+' : '') + summaryStats.avgPct + '%' }}
                      </span>
                      <span class="watch-sum-key">平均涨跌</span>
                    </div>
                    <div class="watch-sum-stat">
                      <span class="watch-sum-num tone-gold">{{ summaryStats.rate }}<small class="watch-metric-unit">%</small></span>
                      <span class="watch-sum-key">命中率 {{ summaryStats.hit }}/{{ summaryStats.reviewed }}</span>
                    </div>
                  </div>

                  <div class="watch-summary-section">
                    <div class="watch-summary-sec-head">
                      <span class="watch-field-label">情绪命中率</span>
                      <span class="watch-summary-sec-sub">全部历史复盘 · 看哪类判断最准</span>
                    </div>
                    <div class="watch-sent-acc">
                      <div
                        v-for="s in sentimentAccuracy"
                        :key="s.value"
                        class="watch-sent-acc-item"
                        :class="'tone-' + s.value"
                      >
                        <div class="watch-sent-acc-top">
                          <component :is="sentimentIcon(s.value)" class="w-3 h-3" :stroke-width="2" />
                          <span class="watch-sent-acc-label">{{ sentimentShortLabel(s.value) }}</span>
                        </div>
                        <div class="watch-sent-acc-bar">
                          <i :style="{ width: (s.rate ?? 0) + '%' }"></i>
                        </div>
                        <div class="watch-sent-acc-foot">
                          <span class="watch-sent-acc-rate">{{ s.rate == null ? '—' : s.rate + '%' }}</span>
                          <span class="watch-sent-acc-cnt">{{ s.hit }}/{{ s.total }}</span>
                        </div>
                      </div>
                    </div>
                  </div>

                  <div class="watch-summary-section is-grow">
                    <div class="watch-summary-sec-head">
                      <span class="watch-field-label">当日分析清单 <em class="watch-summary-sec-count">{{ summaryItems.length }} 只</em></span>
                      <div class="watch-summary-sec-tools">
                        <div class="watch-date is-sm">
                          <button @click="shiftSummaryDate(-1)" class="watch-date-nav" title="前一天">
                            <ChevronLeft class="w-3.5 h-3.5" :stroke-width="1.8" />
                          </button>
                          <button @click="goSummaryToday" class="watch-date-label" :class="{ 'is-today': summaryDate === todayStr }">
                            {{ summaryDate }}
                          </button>
                          <button @click="shiftSummaryDate(1)" class="watch-date-nav" title="后一天">
                            <ChevronRight class="w-3.5 h-3.5" :stroke-width="1.8" />
                          </button>
                        </div>
                        <button class="watch-btn-ghost is-mini" title="收起盘后总结" @click="toggleSummary">
                          <X class="w-3.5 h-3.5" :stroke-width="1.8" />
                          <span>收起</span>
                        </button>
                      </div>
                    </div>

                    <ul v-if="summaryItems.length" class="watch-summary-list">
                      <li v-for="{ item, analysis } in summaryItems" :key="item.id" class="watch-summary-row">
                        <div class="watch-summary-row-head">
                          <span class="watch-summary-name">{{ item.name }}</span>
                          <span class="watch-summary-code">{{ item.code }}</span>
                          <span v-if="analysis.sentiment" class="watch-mini is-sentiment">
                            <component :is="sentimentIcon(analysis.sentiment)" class="w-3 h-3" :stroke-width="2" />
                            {{ sentimentShortLabel(analysis.sentiment) }}
                          </span>
                          <span v-if="analysis.actionType" class="watch-mini">{{ actionTypeLabel(analysis.actionType) }}</span>
                          <span
                            v-if="dayChangeOfCode(item.code, summaryDate)"
                            class="watch-tl-pct"
                            :class="dayChangeOfCode(item.code, summaryDate).pct >= 0 ? 'tone-up' : 'tone-down'"
                          >
                            当日 {{ dayChangeOfCode(item.code, summaryDate).pct >= 0 ? '+' : '' }}{{ dayChangeOfCode(item.code, summaryDate).pct }}%
                          </span>
                          <button class="watch-summary-open" title="查看历史" @click="openHistory(item)">
                            <ClipboardList class="w-3.5 h-3.5" :stroke-width="1.7" />
                          </button>
                        </div>
                        <p v-if="analysis.note" class="watch-summary-note">{{ analysis.note }}</p>
                        <div class="watch-tl-review">
                          <template v-if="analysis.reviewResult">
                            <span class="watch-card-review" :class="'rv-' + analysis.reviewResult">
                              <History class="w-3 h-3" :stroke-width="1.8" />
                              <span>{{ reviewLabel(analysis.reviewResult) }}</span>
                            </span>
                            <button class="watch-tl-clear" @click="setReview(item.id, summaryDate, '')">清除</button>
                          </template>
                          <template v-else>
                            <span class="watch-tl-review-key">验证</span>
                            <button
                              v-for="r in reviewResults"
                              :key="r.value"
                              class="watch-verify-btn"
                              :class="['rv-' + r.value, { 'is-suggest': suggestedVerdict(analysis, item.code) === r.value }]"
                              @click="setReview(item.id, summaryDate, r.value)"
                            >{{ r.short }}</button>
                            <span v-if="suggestedVerdict(analysis, item.code)" class="watch-tl-suggest">
                              建议 {{ reviewLabel(suggestedVerdict(analysis, item.code)) }}
                            </span>
                          </template>
                        </div>
                      </li>
                    </ul>

                    <div v-else class="watch-add-empty">
                      <Layers class="w-7 h-7" :stroke-width="1.4" />
                      <span>该日暂无分析记录</span>
                    </div>
                  </div>
                </div>

                <div class="watch-summary-right">
                  <div class="watch-summary-section">
                    <div class="watch-summary-sec-head">
                      <span class="watch-field-label">近 28 日复盘热力</span>
                      <span class="watch-summary-sec-sub">金=判断好 · 绿=偏差</span>
                    </div>
                    <div class="watch-heat">
                      <span
                        v-for="d in heatmapDays"
                        :key="d.date"
                        class="watch-heat-cell"
                        :class="heatClass(d)"
                        :title="heatTitle(d)"
                      ></span>
                    </div>
                  </div>

                  <div class="watch-summary-section is-grow">
                    <div class="watch-summary-sec-head">
                      <span class="watch-field-label">总结正文</span>
                      <button class="watch-btn-ghost is-mini" title="按所选日期重新汇总分析、行情和持仓盈亏；会替换正文，不会自动保存" @click="regenerateSummary">
                        <RefreshCw class="w-3 h-3" :stroke-width="1.7" />
                        <span>重新生成</span>
                      </button>
                    </div>
                    <p class="watch-summary-help">盈亏含实际持仓、当日买卖及手续费；重新生成会替换正文，保存后才写入历史。</p>
                    <textarea
                      v-model="summaryText"
                      class="watch-textarea is-summary"
                      rows="8"
                      placeholder="点击「重新生成」按当日行情与复盘自动汇总，也可手动补充盘面感受…"
                    ></textarea>
                  </div>
                </div>
              </div>

              <footer class="watch-summary-foot">
                <span class="watch-sum-saved">{{ summarySavedTip }}</span>
                <button @click="saveSummary" class="watch-btn-gold" :disabled="summarySaving">
                  <Save class="w-3.5 h-3.5" :stroke-width="1.8" />
                  <span>{{ summarySaving ? '保存中…' : '保存总结' }}</span>
                </button>
              </footer>
            </div>
          </section>
        </div>

        <!-- 底部 -->
        <footer class="watch-footer">
          <span class="watch-footer-hint">每只股票每天一条分析记录 · 支持回看历史与次日复盘 · 拖动卡片可自由排序（置顶卡片固定在顶部）</span>
          <button @click="closePanel" class="watch-btn-ghost is-wide">收起面板</button>
        </footer>

        <!-- 添加抽屉：从卡片层下方自右侧拉出 -->
        <Transition name="watch-drawer">
          <div v-if="showAddDialog" class="watch-drawer-layer">
            <div class="watch-drawer-scrim" @click="showAddDialog = false"></div>

            <aside class="watch-drawer">
              <header class="watch-dialog-head">
                <div class="watch-dialog-title">
                  <h3>添加观察股票</h3>
                  <span class="watch-dialog-code">检索添加 · 或直接点选下方平铺</span>
                </div>
                <button @click="showAddDialog = false" class="watch-btn-ghost" title="收起">
                  <ChevronsRight class="w-4 h-4" :stroke-width="1.8" />
                </button>
              </header>

              <div class="watch-add-grid">
                <!-- 左栏：手动检索添加 -->
                <div class="watch-add-left">
                  <label class="watch-field">
                    <span class="watch-field-label">股票代码 / 名称</span>
                    <div class="watch-search">
                      <Search class="w-3.5 h-3.5 watch-search-icon" :stroke-width="1.7" />
                      <input
                        ref="searchInputRef"
                        v-model="searchKeyword"
                        @input="onSearchInput"
                        type="text"
                        placeholder="输入代码或名称检索"
                        class="watch-input"
                      />
                      <Loader2 v-if="searching" class="w-3.5 h-3.5 watch-spin watch-search-icon is-right" :stroke-width="1.7" />
                    </div>
                    <div v-if="searchResults.length > 0" class="watch-suggest">
                      <button
                        v-for="s in searchResults"
                        :key="s.code"
                        @click="selectSearchResult(s)"
                        class="watch-suggest-item"
                      >
                        <span class="watch-suggest-name">{{ s.name }}</span>
                        <span class="watch-suggest-code">{{ s.code }}</span>
                        <span class="watch-suggest-board">{{ s.board || '' }}</span>
                      </button>
                    </div>
                  </label>

                  <div class="watch-field">
                    <span class="watch-field-label">类型</span>
                    <div class="watch-segment">
                      <button @click="addForm.isHolding = true" :class="{ 'is-active': addForm.isHolding }">持仓中</button>
                      <button @click="addForm.isHolding = false" :class="{ 'is-active': !addForm.isHolding }">观察中</button>
                    </div>
                  </div>

                  <button @click="confirmAdd()" :disabled="!addForm.code" class="watch-btn-gold is-block">
                    <Plus class="w-3.5 h-3.5" :stroke-width="2" />
                    <span>加入观察清单</span>
                  </button>
                </div>

                <!-- 右栏：持仓 / 清仓 平铺点选 -->
                <div class="watch-add-right">
                  <div class="watch-add-right-head">
                    <span class="watch-field-label">持仓 / 清仓 快速添加</span>
                    <div class="watch-add-filter">
                      <Search class="w-3.5 h-3.5 watch-search-icon" :stroke-width="1.7" />
                      <input
                        v-model="quickFilter"
                        type="text"
                        placeholder="筛选名称或代码"
                        class="watch-input is-sm"
                      />
                    </div>
                  </div>

                  <div v-if="filteredQuickAdd.length > 0" class="watch-tile-grid">
                    <button
                      v-for="s in filteredQuickAdd"
                      :key="s.code"
                      @click="quickAddStock(s)"
                      class="watch-tile"
                      :title="'添加 ' + s.name + ' ' + s.code"
                    >
                      <span class="watch-tile-name">{{ s.name }}</span>
                      <span class="watch-tile-meta">
                        <span class="watch-tile-code">{{ s.code }}</span>
                        <span class="watch-tile-tag" :class="s.cleared ? 'is-cleared' : 'is-holding'">
                          {{ s.cleared ? '清仓' : '持仓' }}
                        </span>
                      </span>
                    </button>
                  </div>
                  <div v-else class="watch-add-empty">
                    <Layers class="w-7 h-7" :stroke-width="1.4" />
                    <span>{{ quickFilter ? '没有匹配的股票' : '暂无可快速添加的股票' }}</span>
                  </div>
                </div>
              </div>
            </aside>
          </div>
        </Transition>

        <!-- 编辑抽屉：与添加抽屉同款，自右侧拉出 -->
        <Transition name="watch-drawer">
          <div v-if="showEditDialog" class="watch-drawer-layer">
            <div class="watch-drawer-scrim" @click="showEditDialog = false"></div>

            <aside class="watch-drawer is-edit">
              <header class="watch-dialog-head">
                <div class="watch-dialog-title">
                  <h3>{{ editingItem?.name }}</h3>
                  <span class="watch-dialog-code">{{ editingItem?.code }}</span>
                </div>
                <button @click="showEditDialog = false" class="watch-btn-ghost" title="收起">
                  <ChevronsRight class="w-4 h-4" :stroke-width="1.8" />
                </button>
              </header>

              <div class="watch-dialog-body">
                <div class="watch-date-banner">
                  <Calendar class="w-3.5 h-3.5" :stroke-width="1.6" />
                  <span class="watch-date-banner-val">{{ currentDate }}</span>
                  <span class="watch-date-banner-tag">
                    {{ isPastDate(currentDate) ? '历史 · 可复盘' : (currentDate === todayStr ? '今日 · 写计划' : '未来 · 预设计划') }}
                  </span>
                </div>

                <div class="watch-field">
                  <span class="watch-field-label">操作计划</span>
                  <div class="watch-grid-8">
                    <button
                      v-for="a in actionTypes"
                      :key="a.value"
                      @click="editForm.actionType = editForm.actionType === a.value ? '' : a.value"
                      class="watch-opt"
                      :class="['act-' + a.value, { 'is-active': editForm.actionType === a.value }]"
                    >
                      <Check v-if="editForm.actionType === a.value" class="watch-opt-tick" :stroke-width="3.4" />
                      {{ a.label }}
                    </button>
                  </div>
                </div>

                <div class="watch-field">
                  <span class="watch-field-label">情绪判断</span>
                  <div class="watch-grid-5">
                    <button
                      v-for="s in sentiments"
                      :key="s.value"
                      @click="editForm.sentiment = editForm.sentiment === s.value ? '' : s.value"
                      class="watch-mood"
                      :class="['tone-' + s.value, { 'is-active': editForm.sentiment === s.value }]"
                    >
                      <Check v-if="editForm.sentiment === s.value" class="watch-opt-tick" :stroke-width="3.4" />
                      <component :is="s.icon" class="w-4 h-4" :stroke-width="1.8" />
                      <span>{{ s.label }}</span>
                    </button>
                  </div>
                </div>

                <div class="watch-field">
                  <span class="watch-field-label">价格计划
                    <span v-if="currentHoldingShares" class="watch-field-hint">· 当前持仓 {{ currentHoldingShares }} 股</span>
                  </span>
                  <div class="watch-grid-3">
                    <label class="watch-price">
                      <span class="watch-price-key is-buy">目标买入</span>
                      <div class="watch-price-row">
                        <input
                          v-model="buyPriceText"
                          type="text"
                          inputmode="decimal"
                          placeholder="3.6~3.8"
                          class="watch-input is-price tone-up"
                          @keydown="onRangeKeydown"
                          @input="onPriceText('buy')"
                        />
                        <input
                          v-if="buyPriceText"
                          v-model.number="editForm.buyShareCount"
                          type="number"
                          min="0"
                          :placeholder="'股数' + (currentHoldingShares ? '（持仓' + currentHoldingShares + '）' : '')"
                          class="watch-input is-price is-shares"
                        />
                      </div>
                      <div v-if="buyPriceText" class="watch-shares-quick">
                        <button type="button" class="watch-shares-qbtn" :disabled="!currentHoldingShares" @click="fillBuyShares('half')" :title="'一半：' + Math.floor(currentHoldingShares / 2) + '股'">一半</button>
                        <button type="button" class="watch-shares-qbtn" :disabled="!currentHoldingShares" @click="fillBuyShares('1x')" :title="'一倍：' + currentHoldingShares + '股'">一倍</button>
                        <button type="button" class="watch-shares-qbtn" :disabled="!currentHoldingShares" @click="fillBuyShares('2x')" :title="'两倍：' + (currentHoldingShares * 2) + '股'">两倍</button>
                        <button type="button" class="watch-shares-qbtn" @click="fillBuyShares(100)">100</button>
                        <button type="button" class="watch-shares-qbtn" @click="fillBuyShares(200)">200</button>
                        <button type="button" class="watch-shares-qbtn" @click="fillBuyShares(300)">300</button>
                        <button type="button" class="watch-shares-qbtn" @click="fillBuyShares(400)">400</button>
                      </div>
                    </label>
                    <label class="watch-price">
                      <span class="watch-price-key is-sell">目标卖出</span>
                      <div class="watch-price-row">
                        <input
                          v-model="sellPriceText"
                          type="text"
                          inputmode="decimal"
                          placeholder="3.6~3.8"
                          class="watch-input is-price tone-down"
                          @keydown="onRangeKeydown"
                          @input="onPriceText('sell')"
                        />
                        <input
                          v-if="sellPriceText"
                          v-model.number="editForm.sellShareCount"
                          type="number"
                          min="0"
                          :placeholder="'股数' + (currentHoldingShares ? '（持仓' + currentHoldingShares + '）' : '')"
                          class="watch-input is-price is-shares"
                        />
                      </div>
                      <div v-if="sellPriceText" class="watch-shares-quick">
                        <button type="button" class="watch-shares-qbtn" :disabled="!currentHoldingShares" @click="fillSellShares('half')" :title="'半仓：' + Math.floor(currentHoldingShares / 2) + '股'">半仓</button>
                        <button type="button" class="watch-shares-qbtn" :disabled="!currentHoldingShares" @click="fillSellShares('full')" :title="'全仓：' + currentHoldingShares + '股'">全仓</button>
                        <button type="button" class="watch-shares-qbtn" :disabled="!currentHoldingShares" @click="fillSellShares(100)">100</button>
                        <button type="button" class="watch-shares-qbtn" :disabled="!currentHoldingShares" @click="fillSellShares(200)">200</button>
                        <button type="button" class="watch-shares-qbtn" :disabled="!currentHoldingShares" @click="fillSellShares(300)">300</button>
                        <button type="button" class="watch-shares-qbtn" :disabled="!currentHoldingShares" @click="fillSellShares(400)">400</button>
                      </div>
                    </label>
                    <label class="watch-price">
                      <span class="watch-price-key is-loss">止损价</span>
                      <div class="watch-price-row">
                        <input
                          v-model="lossPriceText"
                          type="text"
                          inputmode="decimal"
                          placeholder="3.6~3.8"
                          class="watch-input is-price tone-warn"
                          @keydown="onRangeKeydown"
                          @input="onPriceText('loss')"
                        />
                      </div>
                      <div class="watch-shares-quick">
                        <button type="button" class="watch-shares-qbtn" :disabled="!editForm.targetBuyPrice" @click="fillStopLossByPct(0.03)" :title="'买入价 -3%'">-3%</button>
                        <button type="button" class="watch-shares-qbtn" :disabled="!editForm.targetBuyPrice" @click="fillStopLossByPct(0.05)" :title="'买入价 -5%'">-5%</button>
                        <button type="button" class="watch-shares-qbtn" :disabled="!editForm.targetBuyPrice" @click="fillStopLossByPct(0.08)" :title="'买入价 -8%'">-8%</button>
                        <button type="button" class="watch-shares-qbtn" :disabled="!editForm.targetBuyPrice" @click="fillStopLossByPct(0.10)" :title="'买入价 -10%'">-10%</button>
                      </div>
                    </label>
                  </div>
                </div>

                <div class="watch-field">
                  <span class="watch-field-label">分析备注 / 明日看法</span>
                  <textarea
                    v-model="editForm.nextDayNote"
                    rows="5"
                    placeholder="记录走势判断、操作理由、关键价位逻辑与明日看法…"
                    class="watch-textarea"
                  ></textarea>
                  <div class="watch-templates">
                    <span class="watch-templates-key">快捷</span>
                    <button v-for="t in quickTemplates" :key="t" @click="appendTemplate(t)" class="watch-template">{{ t }}</button>
                  </div>
                </div>
              </div>

              <footer class="watch-dialog-foot">
                <button v-if="getTodayAnalysis(editingItem)" @click="deleteAnalysis" class="watch-btn-ghost is-danger">删除</button>
                <button @click="saveAnalysis" class="watch-btn-gold is-block">
                  <Save class="w-3.5 h-3.5" :stroke-width="1.8" />
                  <span>保存分析</span>
                </button>
              </footer>
            </aside>
          </div>
        </Transition>

        <!-- 历史每日记录抽屉 -->
        <Transition name="watch-drawer">
          <div v-if="showHistoryDrawer" class="watch-drawer-layer">
            <div class="watch-drawer-scrim" @click="showHistoryDrawer = false"></div>

            <aside class="watch-drawer is-history">
              <header class="watch-dialog-head">
                <div class="watch-dialog-title">
                  <h3>{{ historyItem?.name }}</h3>
                  <span class="watch-dialog-code">{{ historyItem?.code }} · 历史每日记录</span>
                </div>
                <button @click="showHistoryDrawer = false" class="watch-btn-ghost" title="收起">
                  <ChevronsRight class="w-4 h-4" :stroke-width="1.8" />
                </button>
              </header>

              <div class="watch-hist-stats">
                <div class="watch-hist-stat">
                  <span class="watch-hist-num">{{ historyList.length }}</span>
                  <span class="watch-hist-key">记录天数</span>
                </div>
                <span class="watch-metric-sep"></span>
                <div class="watch-hist-stat">
                  <span class="watch-hist-num">{{ historyReview.total }}</span>
                  <span class="watch-hist-key">已复盘</span>
                </div>
                <span class="watch-metric-sep"></span>
                <div class="watch-hist-stat">
                  <span class="watch-hist-num tone-up">{{ historyReview.hit }}</span>
                  <span class="watch-hist-key">判断正确</span>
                </div>
                <span class="watch-metric-sep"></span>
                <div class="watch-hist-stat">
                  <span class="watch-hist-num tone-gold">{{ historyReview.rate }}<small class="watch-metric-unit">%</small></span>
                  <span class="watch-hist-key">命中率</span>
                </div>
                <template v-if="historyStreak.streak > 0">
                  <span class="watch-metric-sep"></span>
                  <div class="watch-hist-stat">
                    <span class="watch-hist-num" :class="historyStreak.type === 'hit' ? 'tone-up' : 'tone-gold'">{{ historyStreak.streak }}</span>
                    <span class="watch-hist-key">{{ historyStreak.type === 'hit' ? '连续命中' : '连续失误' }}</span>
                  </div>
                </template>
                <div class="watch-metric-spacer"></div>
                <button class="watch-btn-ghost is-wide" @click="copyHistory">
                  <Copy class="w-3.5 h-3.5" :stroke-width="1.7" />
                  <span>{{ copiedTip ? '已复制' : '复制记录' }}</span>
                </button>
              </div>

              <div class="watch-hist-body">
                <div v-if="!historyList.length" class="watch-state">
                  <div class="watch-state-mark"><History class="w-7 h-7" :stroke-width="1.2" /></div>
                  <p class="watch-state-title">暂无历史记录</p>
                  <p class="watch-state-sub">每天写一条分析，就会在这里沉淀成时间轴</p>
                </div>

                <ul v-else class="watch-timeline">
                  <li v-for="a in historyList" :key="a.date" class="watch-tl-item">
                    <span class="watch-tl-node" :class="'tone-' + (a.sentiment || 'none')"></span>
                    <div class="watch-tl-card" :class="'tone-' + (a.sentiment || 'none')">
                      <div class="watch-tl-head">
                        <span class="watch-tl-date">{{ a.date }}</span>
                        <span class="watch-tl-week">{{ weekLabel(a.date) }}</span>
                        <span v-if="a.sentiment" class="watch-mini is-sentiment">
                          <component :is="sentimentIcon(a.sentiment)" class="w-3 h-3" :stroke-width="2" />
                          {{ sentimentShortLabel(a.sentiment) }}
                        </span>
                        <span v-if="a.actionType" class="watch-mini">{{ actionTypeLabel(a.actionType) }}</span>
                        <span
                          v-if="dayChangeOfCode(historyItem.code, a.date)"
                          class="watch-tl-pct"
                          :class="dayChangeOfCode(historyItem.code, a.date).pct >= 0 ? 'tone-up' : 'tone-down'"
                        >
                          当日 {{ dayChangeOfCode(historyItem.code, a.date).pct >= 0 ? '+' : '' }}{{ dayChangeOfCode(historyItem.code, a.date).pct }}%
                        </span>
                      </div>

                      <div v-if="hasPriceTargets(a) || a.note" class="watch-tl-content">
                        <div v-if="hasPriceTargets(a)" class="watch-card-targets">
                          <div v-if="a.targetBuyPrice != null" class="watch-target is-buy">
                            <span class="watch-target-key">买</span>
                            <span class="watch-target-val tone-up">{{ priceRangeText(a, 'targetBuyPrice', 'targetBuyPriceHigh') }}</span>
                            <span v-if="a.buyShareCount" class="watch-target-shares">{{ a.buyShareCount }}股</span>
                          </div>
                          <div v-if="a.targetSellPrice != null" class="watch-target is-sell">
                            <span class="watch-target-key">卖</span>
                            <span class="watch-target-val tone-down">{{ priceRangeText(a, 'targetSellPrice', 'targetSellPriceHigh') }}</span>
                            <span v-if="a.sellShareCount" class="watch-target-shares">{{ a.sellShareCount }}股</span>
                          </div>
                          <div v-if="a.stopLossPrice != null" class="watch-target is-loss">
                            <span class="watch-target-key">损</span>
                            <span class="watch-target-val tone-warn">{{ priceRangeText(a, 'stopLossPrice', 'stopLossPriceHigh') }}</span>
                          </div>
                        </div>

                        <p v-if="a.note" class="watch-tl-note">{{ a.note }}</p>
                      </div>

                      <div class="watch-tl-review">
                        <template v-if="a.reviewResult">
                          <span class="watch-card-review" :class="'rv-' + a.reviewResult">
                            <History class="w-3 h-3" :stroke-width="1.8" />
                            <span>{{ reviewLabel(a.reviewResult) }}</span>
                          </span>
                          <button class="watch-tl-clear" @click="setReview(historyItem.id, a.date, '')">清除</button>
                        </template>
                        <template v-else>
                          <span class="watch-tl-review-key">验证</span>
                          <button
                            v-for="r in reviewResults"
                            :key="r.value"
                            class="watch-verify-btn"
                            :class="['rv-' + r.value, { 'is-suggest': suggestedVerdict(a, historyItem.code) === r.value }]"
                            @click="setReview(historyItem.id, a.date, r.value)"
                          >{{ r.short }}</button>
                          <span v-if="suggestedVerdict(a, historyItem.code)" class="watch-tl-suggest">
                            建议 {{ reviewLabel(suggestedVerdict(a, historyItem.code)) }}
                          </span>
                        </template>
                      </div>

                      <p v-if="a.reviewNote" class="watch-tl-rvnote">复盘 · {{ a.reviewNote }}</p>
                    </div>
                  </li>
                </ul>
              </div>
            </aside>
          </div>
        </Transition>

      </div>
    </div>
  </Transition>
</template>

<script setup>
import { ref, computed, onMounted, onBeforeUnmount, watch, nextTick } from 'vue'
import {
  TrendingUp, Plus, X, Sparkles, ChevronLeft, ChevronRight, ChevronsRight,
  Pin, Pencil, Trash2, Loader2, Lightbulb, Target, Calendar, History, Save,
  Search, Layers, Check,
  ClipboardList, Copy, RefreshCw, CornerDownLeft, Clock, PenLine, FileText,
  ArrowUpRight, ArrowDownRight, Minus, TrendingDown
} from 'lucide-vue-next'
import { fmtNum, getStockBoard, isValidStockCode } from '../utils/formatter'
import { metricTips, loadMetricTips } from '../utils/metricTips'
import { isClosedDay, nearestTradingDay } from '../utils/tradingDay'
import { calculateDailyProfit } from '../utils/dailyProfit'

const props = defineProps({
  stockPrices: { type: Object, default: () => ({}) },
  holdingStocks: { type: Array, default: () => [] },
  clearedStocks: { type: Array, default: () => [] }
})

const emit = defineEmits(['refresh-price', 'buy', 'sell'])

function formatNumber(val, decimals = 2) {
  return fmtNum(val, decimals)
}

const watchlist = ref([])
const loading = ref(true)
const showPanel = ref(false)
const showAddDialog = ref(false)
const showEditDialog = ref(false)
const currentDate = ref(nearestTradingDay(toLocalDateStr(new Date())))
const activeSentiment = ref('')
const activeMetric = ref('')
const editingItem = ref(null)

// 历史记录 / 盘后总结
const showHistoryDrawer = ref(false)
const historyItem = ref(null)
const summaryCollapsed = ref(true)
const summaryDate = ref(currentDate.value)
const summaryText = ref('')
const summaryAuto = ref('')
const summarySaving = ref(false)
const summarySavedTip = ref('')
const dayChanges = ref({})
const quickNotes = ref({})
const loadingChanges = ref(false)
const copiedTip = ref(false)

// 指标栏标语：竖向轮播，每 6s 换一条（标语库在「设置 → 标语库」里维护）
const tipIndex = ref(0)
let tipTimer = null
function startTipRoll() {
  stopTipRoll()
  tipTimer = setInterval(() => {
    tipIndex.value = (tipIndex.value + 1) % metricTips.value.length
  }, 6000)
}
function stopTipRoll() {
  if (tipTimer) { clearInterval(tipTimer); tipTimer = null }
}
watch(metricTips, () => { tipIndex.value = 0 })

// 添加相关
const searchKeyword = ref('')
const searchResults = ref([])
const searching = ref(false)
const searchInputRef = ref(null)
const addForm = ref({ code: '', name: '', isHolding: false })

// 编辑表单
const editForm = ref({
  actionType: '', sentiment: '',
  targetBuyPrice: null, targetBuyPriceHigh: null,
  targetSellPrice: null, targetSellPriceHigh: null,
  stopLossPrice: null, stopLossPriceHigh: null,
  buyShareCount: null, sellShareCount: null,
  note: '', nextDayNote: '', reviewResult: ''
})

// 价格区间文本输入（支持 "3.6~3.8" 格式）
const buyPriceText = ref('')
const sellPriceText = ref('')
const lossPriceText = ref('')

function parseRangeText(str) {
  if (str == null || str === '') return { low: null, high: null }
  const parts = String(str).split(/[~\s]+/).filter(Boolean)
  const low = parts[0] !== undefined ? Number(parts[0]) : null
  const high = parts[1] !== undefined ? Number(parts[1]) : null
  return {
    low: Number.isFinite(low) ? low : null,
    high: Number.isFinite(high) ? high : null
  }
}

function formatRangeText(low, high) {
  if (low == null || low === '') return ''
  if (high == null || high === '') return String(low)
  return `${low}~${high}`
}

// 空格或波浪线自动补全为 ~ 分隔符
function onRangeKeydown(e) {
  if (e.key === ' ' || e.key === '~') {
    e.preventDefault()
    const input = e.target
    const val = input.value
    if (!val.endsWith('~')) {
      input.value = val + '~'
      input.dispatchEvent(new Event('input', { bubbles: true }))
    }
  }
}

function onPriceText(field) {
  const map = {
    buy: [buyPriceText, 'targetBuyPrice', 'targetBuyPriceHigh'],
    sell: [sellPriceText, 'targetSellPrice', 'targetSellPriceHigh'],
    loss: [lossPriceText, 'stopLossPrice', 'stopLossPriceHigh']
  }
  const [textRef, lowKey, highKey] = map[field]
  const { low, high } = parseRangeText(textRef.value)
  editForm.value[lowKey] = low
  editForm.value[highKey] = high
}

// 当前编辑股票的持仓股数
const currentHoldingShares = computed(() => {
  const code = editingItem.value?.code
  if (!code) return 0
  const s = props.holdingStocks.find(h => String(h.code || '').trim() === String(code).trim())
  return Number(s?.count) || 0
})

// 卖出股数快捷填充
function fillSellShares(mode) {
  const held = currentHoldingShares.value
  if (mode === 'half') {
    editForm.value.sellShareCount = held > 0 ? Math.floor(held / 2) : null
  } else if (mode === 'full') {
    editForm.value.sellShareCount = held > 0 ? held : null
  } else {
    editForm.value.sellShareCount = Number(mode)
  }
}

// 买入股数快捷填充（以当前持仓为基准）
function fillBuyShares(mode) {
  const held = currentHoldingShares.value
  if (mode === 'half') {
    editForm.value.buyShareCount = held > 0 ? Math.floor(held / 2) : null
  } else if (mode === '1x') {
    editForm.value.buyShareCount = held > 0 ? held : null
  } else if (mode === '2x') {
    editForm.value.buyShareCount = held > 0 ? held * 2 : null
  } else {
    editForm.value.buyShareCount = Number(mode)
  }
}

// 止损价快捷填充（基于目标买入低价的跌幅百分比）
function fillStopLossByPct(pct) {
  const buyLow = editForm.value.targetBuyPrice
  if (!buyLow) return
  const price = Number((buyLow * (1 - pct)).toFixed(3))
  lossPriceText.value = String(price)
  editForm.value.stopLossPrice = price
  editForm.value.stopLossPriceHigh = null
}

const todayStr = toLocalDateStr(new Date())

// === 配置 ===
const sentimentFilters = [
  { value: '', label: '全部' },
  { value: 'very_bullish', label: '强烈看多' },
  { value: 'bullish', label: '看涨' },
  { value: 'neutral', label: '震荡' },
  { value: 'bearish', label: '看跌' },
  { value: 'very_bearish', label: '强烈看空' }
]

const actionTypes = [
  { value: 'hold', label: '继续持仓' },
  { value: 'buy_t', label: '正T' },
  { value: 'sell_t', label: '反T' },
  { value: 'buy', label: '买入' },
  { value: 'sell', label: '卖出' },
  { value: 'wait', label: '观望' },
  { value: 'add', label: '加仓' },
  { value: 'reduce', label: '减仓' }
]

const sentiments = [
  { value: 'very_bullish', label: '强烈看多', icon: TrendingUp },
  { value: 'bullish', label: '看涨', icon: ArrowUpRight },
  { value: 'neutral', label: '震荡', icon: Minus },
  { value: 'bearish', label: '看跌', icon: ArrowDownRight },
  { value: 'very_bearish', label: '强烈看空', icon: TrendingDown }
]

// 情绪图标与「情绪判断」选项共用同一套细线描边图标，保证全局观感一致
function sentimentIcon(v) {
  return sentiments.find(s => s.value === v)?.icon || Minus
}

const reviewResults = [
  { value: 'hit', label: '符合预期', short: '符合' },
  { value: 'partial', label: '部分符合', short: '部分' },
  { value: 'miss', label: '判断错误', short: '错误' },
  { value: 'stopped', label: '止损出局', short: '止损' }
]

const quickTemplates = ['放量突破', '缩量回调', '支撑位企稳', '压力位承压', '均线多头排列', 'MACD金叉', 'KDJ超卖', '板块龙头']

// === 计算属性 ===
// 置顶永远在最前，其余按 sortOrder 降序，再按创建时间升序
const sortComparator = (a, b) => {
  if (b.pinned !== a.pinned) return b.pinned - a.pinned
  return (b.sortOrder || 0) - (a.sortOrder || 0) || a.createdAt - b.createdAt
}

const filteredList = computed(() => {
  let list = [...watchlist.value].sort(sortComparator)
  if (activeSentiment.value) list = list.filter(item => getSentiment(item) === activeSentiment.value)
  if (activeMetric.value) {
    const m = activeMetric.value
    if (m === 'holding') list = list.filter(item => item.isHolding)
    else if (m === 'analyzed') list = list.filter(item => getTodayAnalysis(item))
    else if (m === 'reviewed') list = list.filter(item => getTodayAnalysis(item)?.reviewResult)
    else if (m === 'hit') list = list.filter(item => getTodayAnalysis(item)?.reviewResult === 'hit')
  }
  return list
})

function toggleMetric(key) {
  activeMetric.value = activeMetric.value === key ? '' : key
}

// === 卡片拖拽自由排序 ===
const dragId = ref(null)
const dragOverId = ref(null)
const dragOverAfter = ref(false)

function onCardDragStart(item, e) {
  // 置顶卡片固定在顶部，不参与拖拽
  if (item.pinned) { e.preventDefault(); return }
  dragId.value = item.id
  e.dataTransfer.effectAllowed = 'move'
  e.dataTransfer.setData('text/plain', String(item.id))
}

function onCardDragOver(item, e) {
  if (!dragId.value || item.pinned || item.id === dragId.value) return
  e.preventDefault()
  e.dataTransfer.dropEffect = 'move'
  const rect = e.currentTarget.getBoundingClientRect()
  dragOverId.value = item.id
  dragOverAfter.value = e.clientX > rect.left + rect.width / 2
}

function onCardDragLeave(item, e) {
  if (dragOverId.value !== item.id) return
  // 在卡片内部的子元素之间移动时不算离开
  if (e.currentTarget.contains(e.relatedTarget)) return
  dragOverId.value = null
}

function onCardDrop(item) {
  const sourceId = dragId.value
  const insertAfter = dragOverAfter.value
  clearDragState()
  if (!sourceId || sourceId === item.id || item.pinned) return

  const ordered = [...watchlist.value].sort(sortComparator)
  const from = ordered.findIndex(i => i.id === sourceId)
  if (from < 0) return
  const [moved] = ordered.splice(from, 1)

  const to = ordered.findIndex(i => i.id === item.id)
  if (to < 0) return
  ordered.splice(insertAfter ? to + 1 : to, 0, moved)

  const before = new Map(ordered.map(i => [i.id, i.sortOrder || 0]))
  const total = ordered.length
  ordered.forEach((it, idx) => { it.sortOrder = total - idx })
  watchlist.value = ordered

  persistOrder(ordered.filter(it => (it.sortOrder || 0) !== before.get(it.id)))
}

function clearDragState() {
  dragId.value = null
  dragOverId.value = null
  dragOverAfter.value = false
}

async function persistOrder(changed) {
  try {
    await Promise.all(changed.map(it => fetch(`/api/stock/watchlist/${it.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sortOrder: it.sortOrder })
    })))
  } catch (e) {
    console.error('保存排序失败:', e)
    await loadWatchlist()
  }
}

const todayCount = computed(() => watchlist.value.filter(item => getTodayAnalysis(item)).length)
const holdingCount = computed(() => watchlist.value.filter(item => item.isHolding).length)
const pinnedCount = computed(() => watchlist.value.filter(item => item.pinned).length)

// 全局复盘统计（所有股票、所有日期）
const reviewStats = computed(() => {
  let total = 0, hit = 0
  for (const item of watchlist.value) {
    for (const a of item.analyses || []) {
      if (!a.reviewResult) continue
      total++
      if (a.reviewResult === 'hit') hit++
    }
  }
  return { total, hit, rate: total ? Math.round((hit / total) * 100) : 0 }
})

// 按情绪分类的复盘命中率（全局），帮你发现哪类判断最准
const sentimentAccuracy = computed(() => {
  const map = {}
  for (const s of sentiments) map[s.value] = { value: s.value, total: 0, hit: 0 }
  for (const item of watchlist.value) {
    for (const a of item.analyses || []) {
      if (!a.reviewResult || !map[a.sentiment]) continue
      map[a.sentiment].total++
      if (a.reviewResult === 'hit') map[a.sentiment].hit++
    }
  }
  return sentiments.map(s => {
    const m = map[s.value]
    return { ...m, rate: m.total ? Math.round((m.hit / m.total) * 100) : null }
  })
})

// code -> { date -> { date, pct, close, open } }
const changeMap = computed(() => {
  const m = {}
  for (const code in dayChanges.value) {
    m[code] = {}
    for (const d of dayChanges.value[code] || []) m[code][d.date] = d
  }
  return m
})

// 单只股票的历史记录（倒序）与命中统计
const historyList = computed(() => {
  const list = historyItem.value?.analyses || []
  return [...list].sort((a, b) => String(b.date).localeCompare(String(a.date)))
})

const historyReview = computed(() => {
  let total = 0, hit = 0
  for (const a of historyList.value) {
    if (!a.reviewResult) continue
    total++
    if (a.reviewResult === 'hit') hit++
  }
  return { total, hit, rate: total ? Math.round((hit / total) * 100) : 0 }
})

// 历史抽屉：最近一段连续命中 / 连续失误
const historyStreak = computed(() => {
  const reviewed = historyList.value.filter(a => a.reviewResult)
  if (!reviewed.length) return { streak: 0, type: '' }
  const isHit = reviewed[0].reviewResult === 'hit'
  let streak = 0
  for (const a of reviewed) {
    if ((a.reviewResult === 'hit') !== isHit) break
    streak++
  }
  return { streak, type: isHit ? 'hit' : 'miss' }
})

// 盘后总结：某日所有分析
const summaryItems = computed(() => {
  const out = []
  for (const item of watchlist.value) {
    const analysis = (item.analyses || []).find(x => x.date === summaryDate.value)
    if (analysis) out.push({ item, analysis })
  }
  return out
})

const summaryStats = computed(() => {
  let bull = 0, bear = 0, neutral = 0, reviewed = 0, hit = 0
  let pctSum = 0, pctCount = 0
  for (const { item, analysis } of summaryItems.value) {
    const s = analysis.sentiment
    if (s === 'very_bullish' || s === 'bullish') bull++
    else if (s === 'very_bearish' || s === 'bearish') bear++
    else if (s === 'neutral') neutral++
    if (analysis.reviewResult) {
      reviewed++
      if (analysis.reviewResult === 'hit') hit++
    }
    const info = dayChangeOfCode(item.code, summaryDate.value)
    if (info) { pctSum += info.pct; pctCount++ }
  }
  return {
    count: summaryItems.value.length, bull, bear, neutral, reviewed, hit,
    rate: reviewed ? Math.round((hit / reviewed) * 100) : 0,
    avgPct: pctCount ? Number((pctSum / pctCount).toFixed(2)) : null
  }
})

// 近 28 日复盘热力
const heatmapDays = computed(() => {
  const out = []
  const end = parseLocalDate(summaryDate.value)
  for (let i = 27; i >= 0; i--) {
    const d = new Date(end)
    d.setDate(d.getDate() - i)
    const ds = toLocalDateStr(d)
    let total = 0, reviewed = 0, hit = 0, pctSum = 0, pctCount = 0
    for (const item of watchlist.value) {
      const a = (item.analyses || []).find(x => x.date === ds)
      if (!a) continue
      total++
      if (a.reviewResult) {
        reviewed++
        if (a.reviewResult === 'hit') hit++
      }
      const info = dayChangeOfCode(item.code, ds)
      if (info) { pctSum += info.pct; pctCount++ }
    }
    out.push({
      date: ds, total, reviewed, hit,
      rate: reviewed ? hit / reviewed : 0,
      avgPct: pctCount ? Number((pctSum / pctCount).toFixed(2)) : null
    })
  }
  return out
})

// 快速添加候选：持仓优先，其次清仓；已在观察清单中的排除
const quickAddCandidates = computed(() => {
  const existing = new Set(watchlist.value.map(w => w.code))
  const seen = new Set()
  const out = []
  const push = (list, cleared) => {
    for (const s of list) {
      const code = String(s?.code || '').trim()
      if (!code || seen.has(code) || existing.has(code)) continue
      seen.add(code)
      out.push({ code, name: s.name || code, cleared })
    }
  }
  push(props.holdingStocks, false)
  push(props.clearedStocks, true)
  return out
})

// 右侧平铺网格的筛选
const quickFilter = ref('')
const filteredQuickAdd = computed(() => {
  const k = quickFilter.value.trim().toLowerCase()
  if (!k) return quickAddCandidates.value
  return quickAddCandidates.value.filter(s =>
    s.name.toLowerCase().includes(k) || s.code.includes(k)
  )
})

// === 方法 ===
function formatDateLabel(d) {
  if (d === todayStr) return '今日 · ' + d.slice(5)
  const dt = parseLocalDate(d)
  const week = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'][dt.getDay()]
  return `${d.slice(5)} ${week}`
}

// 日期切换：休市日直接跳过，只落在交易日
function shiftDate(n) {
  const d = parseLocalDate(currentDate.value)
  let guard = 0
  do {
    d.setDate(d.getDate() + n)
  } while (isClosedDay(toLocalDateStr(d)) && ++guard < 30)
  currentDate.value = toLocalDateStr(d)
}

function goToday() { currentDate.value = nearestTradingDay(toLocalDateStr(new Date())) }

function getTodayAnalysis(item) {
  return item.analyses?.find(a => a.date === currentDate.value) || null
}

function todayAnalysis(item) { return getTodayAnalysis(item) }

// 获取前一天的分析记录（用于显示昨日备注）
function getPrevAnalysis(item) {
  const analyses = item.analyses || []
  if (analyses.length === 0) return null
  // 找到所有日期小于当前日期的，取最近的一个
  const prev = analyses
    .filter(a => a.date < currentDate.value)
    .sort((a, b) => b.date.localeCompare(a.date))[0]
  return prev || null
}

function getSentiment(item) {
  const a = getTodayAnalysis(item)
  return a?.sentiment || ''
}

function hasPriceTargets(a) {
  return a && (a.targetBuyPrice != null || a.targetSellPrice != null || a.stopLossPrice != null)
}

function priceRangeText(a, lowKey, highKey) {
  if (!a) return ''
  const low = a[lowKey]
  const high = a[highKey]
  if (low == null) return ''
  if (high == null) return formatNumber(low, 2)
  return `${formatNumber(low, 2)}~${formatNumber(high, 2)}`
}

function actionTypeLabel(v) {
  const a = actionTypes.find(x => x.value === v)
  return a ? a.label : v
}

function sentimentShortLabel(v) {
  const s = sentiments.find(x => x.value === v)
  return s ? s.label : v
}

function reviewLabel(v) {
  const r = reviewResults.find(x => x.value === v)
  return r ? r.label : v
}

function isPastDate(d) { return d < todayStr }

// === 本地日期工具（避免 UTC 偏移导致跨日） ===
function toLocalDateStr(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
function parseLocalDate(s) {
  const m = String(s || '').match(/^(\d{4})-(\d{2})-(\d{2})$/)
  if (!m) return new Date()
  return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]))
}
function weekLabel(d) {
  const dt = parseLocalDate(d)
  return ['周日', '周一', '周二', '周三', '周四', '周五', '周六'][dt.getDay()] || ''
}

// === 行情验证数据 ===
function dayChangeOfCode(code, date) {
  const info = changeMap.value[code]?.[date]
  return info && info.pct != null ? info : null
}
function dayChangeOf(code) {
  return dayChangeOfCode(code, currentDate.value)
}

// 依据当日实际涨跌与情绪判断，给出建议的复盘结论
function suggestedVerdict(a, code) {
  if (!a || !a.sentiment) return null
  const info = dayChangeOfCode(code, a.date)
  if (!info) return null
  const pct = info.pct
  const s = a.sentiment
  if (s === 'very_bullish' || s === 'bullish') {
    if (pct >= (s === 'very_bullish' ? 1 : 0.3)) return 'hit'
    if (pct <= -1.5) return 'miss'
    return 'partial'
  }
  if (s === 'very_bearish' || s === 'bearish') {
    if (pct <= (s === 'very_bearish' ? -1 : -0.3)) return 'hit'
    if (pct >= 1.5) return 'miss'
    return 'partial'
  }
  if (s === 'neutral') {
    if (Math.abs(pct) <= 1.5) return 'hit'
    if (Math.abs(pct) >= 4) return 'miss'
    return 'partial'
  }
  return null
}

async function loadDayChanges(codes, days = 120) {
  const list = [...new Set((codes || []).filter(Boolean))]
  const missing = list.filter(c => !dayChanges.value[c])
  if (!missing.length) return
  loadingChanges.value = true
  try {
    const res = await fetch('/api/stock/daily-changes', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ codes: missing, days })
    })
    const json = await res.json()
    if (json.data) dayChanges.value = { ...dayChanges.value, ...json.data }
  } catch (e) {
    console.error('获取日涨跌失败:', e)
  } finally {
    loadingChanges.value = false
  }
}

// === 历史记录 ===
async function openHistory(item) {
  historyItem.value = item
  showHistoryDrawer.value = true
  await loadDayChanges([item.code], 180)
}

async function copyHistory() {
  const item = historyItem.value
  if (!item) return
  const lines = [`${item.name} ${item.code} · 历史每日记录`]
  for (const a of historyList.value) {
    const info = dayChangeOfCode(item.code, a.date)
    const pct = info ? `${info.pct >= 0 ? '+' : ''}${info.pct}%` : '—'
    const parts = [
      a.date,
      sentimentShortLabel(a.sentiment) || '—',
      actionTypeLabel(a.actionType) || '—',
      `当日${pct}`,
      reviewLabel(a.reviewResult) || '未复盘'
    ]
    lines.push(parts.join(' | ') + (a.note ? ` | ${a.note.replace(/\s+/g, ' ')}` : ''))
  }
  try {
    await navigator.clipboard.writeText(lines.join('\n'))
    copiedTip.value = true
    setTimeout(() => { copiedTip.value = false }, 1600)
  } catch (e) {
    console.error('复制失败:', e)
  }
}

// === 复盘标记 ===
async function setReview(watchId, date, result) {
  if (!watchId || !date) return
  try {
    const res = await fetch(`/api/stock/watchlist/${watchId}/analysis`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ date, reviewResult: result })
    })
    const json = await res.json()
    if (json.ok) {
      await loadWatchlist()
      if (historyItem.value) {
        historyItem.value = watchlist.value.find(w => w.id === watchId) || historyItem.value
      }
    }
  } catch (e) {
    console.error('复盘标记失败:', e)
  }
}

// 随手记：把输入追加到当日备注并保存
async function saveQuickNote(item) {
  const raw = (quickNotes.value[item.id] || '').trim()
  if (!raw) return
  const analysis = getTodayAnalysis(item)
  const prev = (analysis?.note || '').trim()
  const note = prev ? `${prev}\n${raw}` : raw
  try {
    const res = await fetch(`/api/stock/watchlist/${item.id}/analysis`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ date: currentDate.value, note })
    })
    const json = await res.json()
    if (json.ok) {
      quickNotes.value[item.id] = ''
      await loadWatchlist()
    }
  } catch (e) {
    console.error('随手记保存失败:', e)
  }
}

// 内联保存：盘后分析（失焦自动保存）
async function saveInlineNote(item, value) {
  await saveInlineField(item, 'note', value)
}
async function saveInlineField(item, field, value) {
  if (!item) return
  try {
    const res = await fetch(`/api/stock/watchlist/${item.id}/analysis`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ date: currentDate.value, [field]: value })
    })
    const json = await res.json()
    if (json.ok) await loadWatchlist()
  } catch (e) { console.error('内联保存失败:', e) }
}

// === 盘后总结 ===
function heatClass(d) {
  if (!d.total) return 'is-empty'
  if (!d.reviewed) return 'is-rec'
  if (d.rate >= 0.7) return 'is-hit'
  if (d.rate >= 0.4) return 'is-mid'
  return 'is-miss'
}
function heatTitle(d) {
  if (!d.total) return `${d.date} · 无记录`
  const parts = [`${d.date}`, `记录 ${d.total}`]
  if (d.reviewed) parts.push(`复盘 ${d.reviewed}`, `命中 ${d.hit}`)
  if (d.avgPct != null) parts.push(`均涨跌 ${d.avgPct >= 0 ? '+' : ''}${d.avgPct}%`)
  return parts.join(' · ')
}

const summaryDailyProfit = computed(() => calculateDailyProfit(
  [...props.holdingStocks, ...props.clearedStocks],
  summaryItems.value.map(({ item }) => item.code),
  summaryDate.value,
  dayChanges.value
))

function buildAutoSummary() {
  const st = summaryStats.value
  const list = summaryItems.value
  if (!list.length) return `【${summaryDate.value} 盘后总结】\n当日暂无观察分析记录。`
  const lines = []
  lines.push(`【${summaryDate.value} 盘后总结】`)
  const avg = st.avgPct == null ? '—' : `${st.avgPct >= 0 ? '+' : ''}${st.avgPct}%`
  const profit = summaryDailyProfit.value
  const profitText = profit.amount == null ? `暂无法计算（${profit.missing} 只持仓行情缺失）` : `${profit.amount >= 0 ? '+' : '-'}¥${formatNumber(Math.abs(profit.amount))}`
  lines.push(`共记录 ${st.count} 只标的：看多 ${st.bull} · 看空 ${st.bear} · 震荡 ${st.neutral}；当日平均涨跌 ${avg}，当日盈亏 ${profitText}。`)
  lines.push(`盈亏口径：记录标的中 ${profit.matched} 只实际持仓，含当日买卖及手续费；未买入的观察标的不计盈亏。`)
  if (st.reviewed) lines.push(`已复盘 ${st.reviewed} 只，判断正确 ${st.hit} 只，命中率 ${st.rate}%。`)

  const hits = [], misses = []
  for (const { item, analysis } of list) {
    const verdict = analysis.reviewResult || suggestedVerdict(analysis, item.code)
    if (verdict === 'hit') hits.push(item.name)
    else if (verdict === 'miss') misses.push(item.name)
  }
  if (hits.length) lines.push(`判断到位：${hits.join('、')}。`)
  if (misses.length) lines.push(`判断偏差：${misses.join('、')}，需留意。`)

  const notes = list.filter(x => x.analysis.note).slice(0, 6)
  if (notes.length) {
    lines.push('要点：')
    for (const { item, analysis } of notes) {
      lines.push(`· ${item.name}：${analysis.note.replace(/\s+/g, ' ').slice(0, 60)}`)
    }
  }
  return lines.join('\n')
}

function regenerateSummary() {
  if (summaryText.value && summaryText.value !== summaryAuto.value && summaryText.value !== buildAutoSummary()
    && !confirm('重新生成会覆盖当前手动编辑的总结正文，是否继续？')) return
  const text = buildAutoSummary()
  summaryAuto.value = text
  summaryText.value = text
}

async function loadSummary() {
  try {
    const res = await fetch(`/api/stock/daily-summary?date=${encodeURIComponent(summaryDate.value)}`)
    const json = await res.json()
    summaryText.value = json.content || ''
    summaryAuto.value = json.autoContent || ''
    if (summaryAuto.value && summaryText.value === summaryAuto.value) {
      summaryAuto.value = buildAutoSummary()
      summaryText.value = summaryAuto.value
    }
  } catch (e) {
    console.error('加载盘后总结失败:', e)
    summaryText.value = ''
    summaryAuto.value = ''
  }
  if (!summaryText.value) {
    summaryAuto.value = buildAutoSummary()
    summaryText.value = summaryAuto.value
  }
}

// 展开面板内的盘后总结（工具栏按钮 / 展开按钮共用）
async function openSummary() {
  if (summaryDate.value !== currentDate.value) summaryDate.value = currentDate.value
  summarySavedTip.value = ''
  summaryCollapsed.value = false
  await loadDayChanges(watchlist.value.map(w => w.code), 120)
  await loadSummary()
}

async function toggleSummary() {
  if (summaryCollapsed.value) {
    await openSummary()
  } else {
    summaryCollapsed.value = true
  }
}

async function shiftSummaryDate(n) {
  const d = parseLocalDate(summaryDate.value)
  d.setDate(d.getDate() + n)
  summaryDate.value = toLocalDateStr(d)
  summarySavedTip.value = ''
  await loadSummary()
}

async function goSummaryToday() {
  summaryDate.value = todayStr
  summarySavedTip.value = ''
  await loadSummary()
}

async function saveSummary() {
  summarySaving.value = true
  try {
    const res = await fetch('/api/stock/daily-summary', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ date: summaryDate.value, content: summaryText.value, autoContent: summaryAuto.value })
    })
    const json = await res.json()
    if (json.ok) {
      summarySavedTip.value = `已保存 · ${new Date().toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })}`
    }
  } catch (e) {
    console.error('保存盘后总结失败:', e)
  } finally {
    summarySaving.value = false
  }
}

// === 加载 ===
async function loadWatchlist() {
  try {
    const res = await fetch('/api/stock/watchlist')
    watchlist.value = await res.json()
  } catch (e) {
    console.error('加载观察列表失败:', e)
  } finally {
    loading.value = false
    nextTick(() => updateStageScroll())
  }
}

function closePanel() { showPanel.value = false }

// === 横向翻页 ===
const stageRef = ref(null)
const canScrollLeft = ref(false)
const canScrollRight = ref(false)
function updateStageScroll() {
  const el = stageRef.value
  if (!el) return
  const max = el.scrollWidth - el.clientWidth
  canScrollLeft.value = el.scrollLeft > 1
  canScrollRight.value = el.scrollLeft < max - 1
}
function scrollTrack(dir) {
  const el = stageRef.value
  if (!el) return
  const max = el.scrollWidth - el.clientWidth
  const page = el.clientWidth
  const target = dir > 0
    ? Math.min(el.scrollLeft + page, max)
    : Math.max(el.scrollLeft - page, 0)
  el.scrollTo({ left: target, behavior: 'smooth' })
}

// === 添加 ===
function openAddDialog() {
  addForm.value = { code: '', name: '', isHolding: false }
  searchKeyword.value = ''
  searchResults.value = []
  quickFilter.value = ''
  showAddDialog.value = true
  setTimeout(() => searchInputRef.value?.focus(), 100)
}

let searchTimer = null
function onSearchInput() {
  clearTimeout(searchTimer)
  const kw = searchKeyword.value.trim()
  if (!kw) { searchResults.value = []; return }
  // 6 位代码：先落 code，再异步补名称，保证「加入」按钮即时可用
  if (/^\d{6}$/.test(kw) && isValidStockCode(kw)) {
    if (addForm.value.code !== kw) addForm.value.name = ''
    addForm.value.code = kw
  }
  searchTimer = setTimeout(doSearch, 300)
}

async function doSearch() {
  const kw = searchKeyword.value.trim()
  if (!kw) { searchResults.value = []; return }
  searching.value = true
  try {
    if (/^\d{6}$/.test(kw)) {
      if (!isValidStockCode(kw)) { searchResults.value = []; return }
      addForm.value.code = kw
      try {
        const r = await fetch(`/api/stock/name/${kw}`)
        const j = await r.json()
        if (j.name && addForm.value.code === kw) addForm.value.name = j.name
      } catch (_) {}
      if (addForm.value.code === kw) {
        searchResults.value = [{ code: kw, name: addForm.value.name || kw, board: getStockBoard(kw) }]
      }
      return
    }
    const res = await fetch(`/api/stock/search?name=${encodeURIComponent(kw)}`)
    const json = await res.json()
    searchResults.value = (json.results || []).slice(0, 10).map(s => ({
      code: s.code, name: s.name, board: getStockBoard(s.code)
    }))
  } catch (e) { console.error('搜索失败:', e) }
  finally { searching.value = false }
}

function selectSearchResult(s) {
  addForm.value.code = s.code
  addForm.value.name = s.name
  searchResults.value = []
  searchKeyword.value = s.name + ' ' + s.code
}

async function quickAddStock(s) {
  addForm.value.code = s.code
  addForm.value.name = s.name
  addForm.value.isHolding = !s.cleared
  await confirmAdd(true)
}

// 快捷登记买卖：交给上层 StockBoard 打开对应的买卖弹窗
function emitTrade(item, type) {
  emit(type, { code: item.code, name: item.name })
}

async function confirmAdd(keepOpen = false) {
  if (!addForm.value.code) return
  if (watchlist.value.some(w => w.code === addForm.value.code)) {
    alert('该股票已在观察列表中')
    return
  }
  try {
    const res = await fetch('/api/stock/watchlist', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        code: addForm.value.code,
        name: addForm.value.name || addForm.value.code,
        isHolding: addForm.value.isHolding
      })
    })
    const json = await res.json()
    if (json.id) {
      await loadWatchlist()
      emit('refresh-price')
      if (keepOpen) {
        addForm.value = { code: '', name: '', isHolding: false }
        searchKeyword.value = ''
        searchResults.value = []
        searchInputRef.value?.focus()
      } else {
        showAddDialog.value = false
      }
    }
  } catch (e) { console.error('添加失败:', e) }
}

// === 编辑 ===
function openEditDialog(item) {
  editingItem.value = item
  const a = getTodayAnalysis(item)
  const mergedNote = [a?.nextDayNote, a?.note].filter(Boolean).join('\n')
  editForm.value = {
    actionType: a?.actionType || '',
    sentiment: a?.sentiment || '',
    targetBuyPrice: a?.targetBuyPrice ?? null,
    targetBuyPriceHigh: a?.targetBuyPriceHigh ?? null,
    targetSellPrice: a?.targetSellPrice ?? null,
    targetSellPriceHigh: a?.targetSellPriceHigh ?? null,
    stopLossPrice: a?.stopLossPrice ?? null,
    stopLossPriceHigh: a?.stopLossPriceHigh ?? null,
    buyShareCount: a?.buyShareCount ?? null,
    sellShareCount: a?.sellShareCount ?? null,
    nextDayNote: mergedNote,
    reviewResult: a?.reviewResult || ''
  }
  buyPriceText.value = formatRangeText(editForm.value.targetBuyPrice, editForm.value.targetBuyPriceHigh)
  sellPriceText.value = formatRangeText(editForm.value.targetSellPrice, editForm.value.targetSellPriceHigh)
  lossPriceText.value = formatRangeText(editForm.value.stopLossPrice, editForm.value.stopLossPriceHigh)
  showEditDialog.value = true
}

function appendTemplate(t) {
  if (editForm.value.nextDayNote && !editForm.value.nextDayNote.endsWith('\n')) {
    editForm.value.nextDayNote += '\n'
  }
  editForm.value.nextDayNote += t + '：'
}

async function saveAnalysis() {
  if (!editingItem.value) return
  const { nextDayNote, ...rest } = editForm.value
  try {
    const res = await fetch(`/api/stock/watchlist/${editingItem.value.id}/analysis`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        date: currentDate.value,
        ...rest,
        note: nextDayNote,
        nextDayNote
      })
    })
    const json = await res.json()
    if (json.ok) {
      await loadWatchlist()
      showEditDialog.value = false
    }
  } catch (e) { console.error('保存失败:', e) }
}

async function deleteAnalysis() {
  if (!editingItem.value) return
  if (!confirm('确定删除当日分析记录？')) return
  try {
    const res = await fetch(`/api/stock/watchlist/${editingItem.value.id}/analysis/${currentDate.value}`, {
      method: 'DELETE'
    })
    const json = await res.json()
    if (json.ok) {
      await loadWatchlist()
      showEditDialog.value = false
    }
  } catch (e) { console.error('删除失败:', e) }
}

async function togglePin(item) {
  try {
    await fetch(`/api/stock/watchlist/${item.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pinned: !item.pinned })
    })
    await loadWatchlist()
  } catch (e) { console.error('置顶失败:', e) }
}

async function removeItem(item) {
  if (!confirm(`确定从观察列表移除「${item.name}」？`)) return
  try {
    await fetch(`/api/stock/watchlist/${item.id}`, { method: 'DELETE' })
    await loadWatchlist()
  } catch (e) { console.error('删除失败:', e) }
}

// === 遮罩打开时锁定页面滚动，避免滚轮穿透到底层页面 ===
const overlayOpen = computed(() =>
  showPanel.value || showAddDialog.value || showEditDialog.value || showHistoryDrawer.value
)

function setPageScrollLocked(locked) {
  document.documentElement.style.overflow = locked ? 'hidden' : ''
  document.body.style.overflow = locked ? 'hidden' : ''
}

watch(overlayOpen, setPageScrollLocked)

// 面板打开后再按需拉取行情验证数据，避免无谓请求
watch(showPanel, (v) => {
  if (v) { loadDayChanges(watchlist.value.map(w => w.code), 120); startTipRoll() }
  else { stopTipRoll() }
})

onBeforeUnmount(() => {
  setPageScrollLocked(false)
  stopTipRoll()
  window.removeEventListener('resize', updateStageScroll)
})

onMounted(() => {
  loadWatchlist()
  loadMetricTips()
  window.addEventListener('resize', updateStageScroll)
  if (showPanel.value) startTipRoll()
  nextTick(() => updateStageScroll())
})

defineExpose({ loadWatchlist })
</script>

<style scoped>
/* ============================================================
   设计基调：深墨 · 鎏金 · 细线
   墨色底 + 金色点缀 + 1px 细线描边 + 克制留白
   ============================================================ */

/* ---------- 浮动按钮 ---------- */
.watch-fab-btn {
  position: fixed;
  right: 24px;
  bottom: 80px;
  z-index: 30;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  height: 40px;
  padding: 0 16px 0 9px;
  border-radius: 999px;
  border: 1px solid rgba(212, 175, 55, 0.35);
  background:
    linear-gradient(180deg, rgba(255, 255, 255, 0.08), rgba(255, 255, 255, 0) 60%),
    linear-gradient(135deg, #14161F 0%, #0B0D14 100%);
  color: #E9D9A6;
  font-size: 14px;
  font-weight: 500;
  letter-spacing: 0.02em;
  box-shadow:
    0 10px 28px rgba(0, 0, 0, 0.32),
    0 1px 0 rgba(255, 255, 255, 0.06) inset;
  transition: transform 0.25s cubic-bezier(0.4, 0, 0.2, 1), box-shadow 0.25s, border-color 0.25s;
}
.watch-fab-btn:hover {
  transform: translateY(-2px);
  border-color: rgba(212, 175, 55, 0.6);
  box-shadow:
    0 16px 36px rgba(0, 0, 0, 0.4),
    0 0 0 1px rgba(212, 175, 55, 0.12),
    0 1px 0 rgba(255, 255, 255, 0.08) inset;
}
.watch-fab-icon {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  border-radius: 50%;
  background: linear-gradient(135deg, rgba(212, 175, 55, 0.22), rgba(212, 175, 55, 0.06));
  border: 1px solid rgba(212, 175, 55, 0.28);
  color: #E8C86A;
}
.watch-fab-text { white-space: nowrap; }
.watch-fab-badge {
  position: absolute;
  top: -5px;
  right: -5px;
  min-width: 18px;
  height: 18px;
  padding: 0 5px;
  border-radius: 999px;
  background: linear-gradient(135deg, #E8C86A, #C9A227);
  color: #17181D;
  font-size: 10px;
  font-weight: 700;
  box-shadow: 0 0 0 2px #0B0D14;
  display: flex;
  align-items: center;
  justify-content: center;
}

/* ---------- 弹层 ---------- */
.watch-overlay {
  position: fixed;
  inset: 0;
  z-index: 50;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 14px;
  background: rgba(4, 6, 10, 0.88);
}

.watch-shell {
  --ink-0: #0B0F17;
  --ink-1: #111722;
  --ink-2: #171E2C;
  --hair: rgba(255, 255, 255, 0.09);
  --hair-2: rgba(255, 255, 255, 0.17);
  --gold: #D4AF37;
  --gold-2: #E8C86A;
  --txt-1: #F4F7FC;
  --txt-2: #C3CCDC;
  --txt-3: #8792A6;
  --up: #F2555A;
  --down: #2FBF71;
  --warn: #E0A458;

  width: 100%;
  max-width: min(1880px, 97vw);
  height: 95vh;
  position: relative;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  border-radius: 22px;
  border: 1px solid var(--hair);
  background:
    radial-gradient(140% 90% at 50% -10%, rgba(255, 255, 255, 0.04), transparent 55%),
    linear-gradient(180deg, var(--ink-1) 0%, var(--ink-0) 100%);
  box-shadow:
    0 40px 90px rgba(0, 0, 0, 0.55),
    0 0 0 1px rgba(0, 0, 0, 0.3);
  color: var(--txt-1);
}

/* ---------- 头部 ---------- */
.watch-header {
  position: relative;
  flex-shrink: 0;
  overflow: hidden;
  border-bottom: 1px solid var(--hair);
}
.watch-header-glow {
  position: absolute;
  inset: 0;
  background:
    radial-gradient(120% 160% at 8% 0%, rgba(212, 175, 55, 0.13) 0%, transparent 55%),
    radial-gradient(100% 140% at 92% 0%, rgba(232, 200, 106, 0.07) 0%, transparent 55%),
    linear-gradient(180deg, rgba(255, 255, 255, 0.03), transparent);
}
.watch-header-grain {
  position: absolute;
  inset: 0;
  opacity: 0.22;
  background-image:
    radial-gradient(circle at 18% 78%, rgba(255, 255, 255, 0.035) 0%, transparent 26%),
    radial-gradient(circle at 76% 62%, rgba(255, 255, 255, 0.028) 0%, transparent 22%);
}
.watch-header-inner {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px 16px;
  padding: 8px 20px;
}

.watch-brand { display: flex; align-items: center; gap: 12px; min-width: 0; flex-shrink: 0; }
.watch-brand-mark {
  width: 34px;
  height: 34px;
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 10px;
  color: var(--gold-2);
  background: linear-gradient(160deg, rgba(212, 175, 55, 0.16), rgba(212, 175, 55, 0.03));
  border: 1px solid rgba(212, 175, 55, 0.28);
  box-shadow: 0 0 0 1px rgba(212, 175, 55, 0.06) inset;
}
.watch-brand-text { min-width: 0; }
.watch-title {
  font-size: 17px;
  font-weight: 600;
  letter-spacing: 0.05em;
  color: #F2F5FA;
  line-height: 1.15;
}
.watch-subtitle {
  margin-top: 3px;
  font-size: 11px;
  letter-spacing: 0.04em;
  color: var(--txt-3);
}

.watch-header-tools { display: flex; align-items: center; flex-wrap: nowrap; justify-content: flex-end; min-width: 0; gap: 10px; }
.watch-tool-sep { width: 1px; height: 22px; background: var(--hair); }

/* 日期切换 */
.watch-date {
  display: flex;
  align-items: center;
  padding: 4px;
  border-radius: 13px;
  border: 1px solid var(--hair);
  background: rgba(255, 255, 255, 0.03);
}
.watch-date-nav {
  width: 26px;
  height: 26px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 8px;
  color: var(--txt-3);
  transition: all 0.18s;
}
.watch-date-nav:hover { color: var(--gold-2); background: rgba(212, 175, 55, 0.08); }
.watch-date-label {
  min-width: 96px;
  height: 26px;
  padding: 0 10px;
  border-radius: 8px;
  font-size: 11.5px;
  letter-spacing: 0.03em;
  color: var(--txt-2);
  transition: all 0.18s;
}
.watch-date-label:hover { color: var(--txt-1); }
.watch-date-label.is-today {
  color: var(--gold-2);
  font-weight: 500;
  background: rgba(212, 175, 55, 0.1);
}

/* 情绪筛选 */
.watch-filters {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 4px;
  border-radius: 13px;
  border: 1px solid var(--hair-2);
  background: rgba(255, 255, 255, 0.05);
}
.watch-filter {
  height: 30px;
  padding: 0 11px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-radius: 9px;
  border: 1px solid transparent;
  font-size: 11.5px;
  font-weight: 500;
  letter-spacing: 0.06em;
  white-space: nowrap;
  color: var(--txt-2);
  transition: all 0.2s;
}
.watch-filter:hover { color: #FFFFFF; background: rgba(255, 255, 255, 0.1); }
.watch-filter.is-active { color: #fff; background: rgba(255, 255, 255, 0.14); }
.watch-filter.tone-all.is-active {
  color: #F5E7BE;
  border-color: rgba(232, 200, 106, 0.6);
  background: rgba(212, 175, 55, 0.24);
}
.watch-filter.tone-very_bullish.is-active {
  color: #FFA2A5;
  border-color: rgba(242, 85, 90, 0.62);
  background: rgba(242, 85, 90, 0.22);
}
.watch-filter.tone-bullish.is-active {
  color: #FFB4B6;
  border-color: rgba(242, 85, 90, 0.42);
  background: rgba(242, 85, 90, 0.14);
}
.watch-filter.tone-neutral.is-active {
  color: #EDF1F8;
  border-color: rgba(255, 255, 255, 0.3);
  background: rgba(255, 255, 255, 0.16);
}
.watch-filter.tone-bearish.is-active {
  color: #A6F0C8;
  border-color: rgba(47, 191, 113, 0.42);
  background: rgba(47, 191, 113, 0.14);
}
.watch-filter.tone-very_bearish.is-active {
  color: #8FE5B4;
  border-color: rgba(47, 191, 113, 0.62);
  background: rgba(47, 191, 113, 0.22);
}

/* 按钮 */
.watch-btn-gold {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  height: 30px;
  padding: 0 13px;
  border-radius: 9px;
  border: 1px solid rgba(212, 175, 55, 0.4);
  background: linear-gradient(180deg, rgba(212, 175, 55, 0.2), rgba(212, 175, 55, 0.08));
  color: #EBD9A4;
  font-size: 11.5px;
  font-weight: 500;
  letter-spacing: 0.03em;
  transition: all 0.2s;
}
.watch-btn-gold:hover {
  border-color: rgba(212, 175, 55, 0.7);
  background: linear-gradient(180deg, rgba(212, 175, 55, 0.3), rgba(212, 175, 55, 0.14));
  box-shadow: 0 6px 18px rgba(212, 175, 55, 0.16);
}
.watch-btn-gold:disabled { opacity: 0.35; cursor: not-allowed; }
.watch-btn-gold.is-block { width: 100%; height: 46px; font-size: 14.5px; }
.watch-btn-gold.is-lg { height: 42px; margin-top: 6px; }

.watch-btn-ghost {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 30px;
  height: 30px;
  border-radius: 9px;
  border: 1px solid var(--hair);
  background: rgba(255, 255, 255, 0.02);
  color: var(--txt-3);
  font-size: 11px;
  transition: all 0.2s;
}
.watch-btn-ghost:hover { color: var(--txt-1); border-color: var(--hair-2); background: rgba(255, 255, 255, 0.05); }
.watch-btn-ghost.is-wide { width: auto; padding: 0 10px; }
.watch-btn-ghost.is-danger:hover { color: #FF8A8E; border-color: rgba(242, 85, 90, 0.4); background: rgba(242, 85, 90, 0.08); }

/* ---------- 统计条 ---------- */
.watch-metrics {
  display: flex;
  align-items: center;
  flex-wrap: nowrap;
  gap: 10px 18px;
  padding: 4px 20px;
  border-bottom: 1px solid var(--hair);
  background: rgba(255, 255, 255, 0.015);
}
.watch-metric {
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding: 2px 5px;
  margin: 0;
  border: 1px solid transparent;
  border-radius: 8px;
  background: none;
  font: inherit;
  text-align: left;
  cursor: pointer;
  transition: border-color 0.15s, background 0.15s;
}
.watch-metric:hover { background: rgba(255, 255, 255, 0.04); }
.watch-metric.is-active {
  border-color: rgba(232, 200, 106, 0.5);
  background: rgba(212, 175, 55, 0.14);
}
.watch-metric.is-active .watch-metric-label { color: var(--gold-2); }
.watch-metric-num {
  font-size: 16px;
  font-weight: 600;
  letter-spacing: 0.02em;
  color: var(--txt-1);
  font-variant-numeric: tabular-nums;
  line-height: 1;
}
.watch-metric-label {
  font-size: 9.5px;
  letter-spacing: 0.1em;
  color: var(--txt-3);
}
.watch-metric-sep { width: 1px; height: 18px; background: var(--hair); }
.watch-metric-spacer { flex: 1; }
.watch-metric-tip {
  display: flex;
  align-items: center;
  gap: 5px;
  font-size: 10.5px;
  letter-spacing: 0.04em;
  color: var(--txt-3);
}
.watch-tip-viewport {
  width: 232px;
  height: 16px;
  overflow: hidden;
}
.watch-tip-roll {
  height: 100%;
  display: flex;
  flex-direction: column;
  will-change: transform;
  transition: transform 0.55s cubic-bezier(0.4, 0, 0.2, 1);
}
.watch-tip-line {
  flex: 0 0 100%;
  height: 100%;
  line-height: 16px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.tone-up { color: var(--up) !important; }
.tone-down { color: var(--down) !important; }
.tone-warn { color: var(--warn) !important; }
.tone-gold { color: var(--gold-2) !important; }
.tone-muted { color: var(--txt-2) !important; }

/* ---------- 舞台 ---------- */
.watch-main {
  position: relative;
  flex: 1 1 auto;
  min-height: 0;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}
.watch-stage {
  flex: 1 1 auto;
  min-height: 0;
  overflow-x: auto;
  overflow-y: hidden;
  overscroll-behavior: contain;
  padding: 6px 18px;
}
.watch-track { display: flex; gap: 12px; align-items: stretch; height: 100%; }
.watch-track::after { content: ''; flex: 0 0 10px; }
.watch-scroll-nav {
  position: absolute;
  top: 50%;
  transform: translateY(-50%);
  z-index: 20;
  width: 34px;
  height: 34px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 50%;
  border: 1px solid var(--hair-2);
  background: rgba(18, 18, 20, 0.92);
  color: var(--txt-2);
  box-shadow: 0 6px 18px rgba(0, 0, 0, 0.4);
  transition: all 0.18s;
}
.watch-scroll-nav:hover {
  color: var(--gold-2);
  border-color: rgba(212, 175, 55, 0.5);
  background: rgba(28, 28, 32, 0.96);
}
.watch-scroll-nav.is-prev { left: 10px; }
.watch-scroll-nav.is-next { right: 10px; }

/* ---------- 卡片 ---------- */
.watch-card {
  position: relative;
  /* 一行正好放下 5 张（4 个 16px 间距），更多则横向滚动 */
  flex: 0 0 calc((100% - 64px) / 5);
  min-width: 252px;
  height: auto;
  min-height: 0;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  border-radius: 18px;
  border: 1px solid var(--hair);
  background:
    linear-gradient(180deg, rgba(255, 255, 255, 0.075), rgba(255, 255, 255, 0.02) 42%),
    var(--ink-2);
  transition: transform 0.28s cubic-bezier(0.4, 0, 0.2, 1), border-color 0.28s, box-shadow 0.28s;
}
.watch-card::before {
  content: '';
  position: absolute;
  inset: 0;
  border-radius: inherit;
  pointer-events: none;
  background: linear-gradient(180deg, rgba(255, 255, 255, 0.06), transparent 30%);
  opacity: 0.7;
}
.watch-card:hover {
  transform: translateY(-4px);
  border-color: rgba(232, 200, 106, 0.35);
  box-shadow: 0 20px 44px rgba(0, 0, 0, 0.45), 0 0 0 1px rgba(232, 200, 106, 0.12) inset;
}
.watch-card.is-pinned {
  border-color: rgba(212, 175, 55, 0.34);
  box-shadow: 0 8px 26px rgba(212, 175, 55, 0.08);
}
.watch-card.is-pinned:hover {
  border-color: rgba(212, 175, 55, 0.55);
  box-shadow: 0 22px 48px rgba(0, 0, 0, 0.45), 0 0 0 1px rgba(212, 175, 55, 0.14);
}

/* ---------- 拖拽排序 ---------- */
.watch-card.is-dragging {
  opacity: 0.4;
  transform: scale(0.97);
  border-color: rgba(232, 200, 106, 0.5);
  box-shadow: 0 24px 50px rgba(0, 0, 0, 0.5);
}

.watch-card-name.is-draggable {
  cursor: grab;
  user-select: none;
  transition: color 0.15s ease;
}
.watch-card-name.is-draggable:hover {
  color: var(--gold-2);
}
.watch-card-name.is-draggable:active {
  cursor: grabbing;
}
.watch-card-name.is-dragging {
  opacity: 0.4;
}

/* 插入位置指示：卡片内侧边缘的金色光条 */
.watch-card.is-drop-target::after {
  content: '';
  position: absolute;
  top: 8px;
  bottom: 8px;
  width: 3px;
  border-radius: 999px;
  background: linear-gradient(180deg, rgba(232, 200, 106, 0.12), #E8C86A, rgba(232, 200, 106, 0.12));
  box-shadow: 0 0 12px rgba(232, 200, 106, 0.8);
  z-index: 5;
  pointer-events: none;
}

.watch-card.is-drop-target:not(.drop-after)::after { left: 0; }
.watch-card.is-drop-target.drop-after::after { right: 0; }

/* 顶部细线（情绪色） */
.watch-card-rule {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  height: 2px;
  background: rgba(255, 255, 255, 0.1);
}
.watch-card.tone-very_bullish .watch-card-rule { background: linear-gradient(90deg, #F2555A, rgba(242, 85, 90, 0.15)); }
.watch-card.tone-bullish .watch-card-rule { background: linear-gradient(90deg, #F2555A99, rgba(242, 85, 90, 0.1)); }
.watch-card.tone-neutral .watch-card-rule { background: linear-gradient(90deg, rgba(255, 255, 255, 0.35), rgba(255, 255, 255, 0.06)); }
.watch-card.tone-bearish .watch-card-rule { background: linear-gradient(90deg, #2FBF7199, rgba(47, 191, 113, 0.1)); }
.watch-card.tone-very_bearish .watch-card-rule { background: linear-gradient(90deg, #2FBF71, rgba(47, 191, 113, 0.15)); }

.watch-card-top {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 10px;
  padding: 10px 10px 4px;
}
.watch-card-id { min-width: 0; }
.watch-card-name-row { display: flex; align-items: center; gap: 7px; }
.watch-card-name {
  min-width: 0;
  font-size: 16px;
  font-weight: 600;
  letter-spacing: 0.02em;
  color: #F2F5FA;
  line-height: 1.3;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.watch-card-pin { color: var(--gold-2); flex-shrink: 0; }
.watch-card-code {
  margin-top: 3px;
  font-size: 12px;
  letter-spacing: 0.06em;
  color: var(--txt-3);
  font-variant-numeric: tabular-nums;
}
.watch-dot { margin: 0 6px; opacity: 0.5; }

.watch-chip {
  flex-shrink: 0;
  padding: 4px 12px;
  border-radius: 999px;
  font-size: 11.5px;
  font-weight: 500;
  letter-spacing: 0.08em;
  border: 1px solid transparent;
}
.watch-chip.chip-hold {
  color: #7FE0AE;
  border-color: rgba(47, 191, 113, 0.3);
  background: rgba(47, 191, 113, 0.1);
}
.watch-chip.chip-watch {
  color: var(--txt-2);
  border-color: var(--hair);
  background: rgba(255, 255, 255, 0.03);
}

/* 行情（内联到昵称旁） */
.watch-quote-price {
  flex-shrink: 0;
  font-size: 16px;
  font-weight: 700;
  letter-spacing: 0.01em;
  font-variant-numeric: tabular-nums;
  line-height: 1;
}
.watch-quote-delta {
  flex-shrink: 0;
  display: inline-flex;
  align-items: center;
  gap: 2px;
  font-size: 11px;
  font-weight: 500;
  font-variant-numeric: tabular-nums;
  opacity: 0.9;
}
.watch-quote-na { flex-shrink: 0; font-size: 11px; letter-spacing: 0.04em; color: var(--txt-3); }

/* 卡片内容 */
.watch-card-body {
  position: relative;
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 3px 8px 3px;
  overflow-y: auto;
}
.watch-triple {
  display: flex;
  flex-direction: column;
  gap: 4px;
  flex: 1 1 auto;
  min-height: 0;
}
.watch-card-section {
  flex: 0 0 auto;
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 4px 7px;
  border-radius: 10px;
  border: 1px solid var(--hair);
  background: rgba(255, 255, 255, 0.025);
  position: relative;
}
.watch-card-section.is-empty {
  align-items: center;
  justify-content: center;
}
/* 今日区域：占据卡片主体剩余空间，textarea 自适应撑满 */
.watch-card-section.is-today.watch-today-compact {
  flex: 1 1 auto;
  min-height: 0;
}
.watch-card-section.is-today.watch-today-compact .watch-today-input {
  flex: 1 1 auto;
  min-height: 38px;
  resize: none;
}
.watch-section-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 6px;
}
.watch-section-title {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.06em;
  color: var(--txt-2);
}
.watch-yest-left {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-wrap: nowrap;
  min-width: 0;
  overflow: hidden;
}
.watch-yest-inline {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  min-width: 0;
}
.watch-section-icobtn {
  width: 20px;
  height: 20px;
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 6px;
  color: var(--txt-3);
  transition: all 0.15s;
}
.watch-section-icobtn:hover { color: var(--gold-2); background: rgba(212, 175, 55, 0.12); }
.watch-history-text {
  padding: 2px 8px;
  border-radius: 6px;
  font-size: 11px;
  color: var(--txt-3);
  transition: all 0.15s;
}
.watch-history-text:hover { color: var(--gold-2); background: rgba(212, 175, 55, 0.12); }
.watch-section-head .watch-mini {
  padding: 2px 7px;
  font-size: 10.5px;
  border-radius: 7px;
}
.watch-section-note {
  font-size: 12px;
  line-height: 1.45;
  color: var(--txt-2);
  white-space: pre-wrap;
  word-break: break-word;
}
.watch-section-next {
  font-size: 12px;
  line-height: 1.45;
  color: var(--txt-3);
  white-space: pre-wrap;
  word-break: break-word;
}
.watch-section-next-key {
  display: inline-block;
  margin-right: 5px;
  padding: 1px 5px;
  border-radius: 4px;
  border: 1px solid var(--hair-2);
  font-size: 10px;
  color: var(--gold-2);
}
.watch-section-empty {
  font-size: 11px;
  color: var(--txt-3);
}
.watch-today-input {
  width: 100%;
  resize: vertical;
  padding: 6px 8px;
  border-radius: 8px;
  border: 1px solid var(--hair-2);
  background: rgba(0, 0, 0, 0.18);
  color: var(--txt-2);
  font-size: 12.5px;
  line-height: 1.5;
  transition: border-color 0.15s;
}
.watch-today-input:focus {
  outline: none;
  border-color: rgba(212, 175, 55, 0.5);
}
.watch-tomorrow-text {
  font-size: 12px;
  line-height: 1.45;
  color: var(--txt-2);
  white-space: pre-wrap;
  word-break: break-word;
}
.watch-today-verify {
  display: grid;
  gap: 3px;
  margin-bottom: 2px;
}
.watch-review-note-inline {
  margin: 0;
  padding: 4px 7px;
  border-radius: 7px;
  color: var(--txt-3);
  font-size: 10.5px;
  line-height: 1.4;
  letter-spacing: 0.03em;
  border: 1px dashed var(--hair);
  background: rgba(255, 255, 255, 0.025);
}
.watch-today-saved-meta {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 6px;
  margin-bottom: 3px;
  flex-wrap: wrap;
}
.watch-today-saved-meta .watch-section-empty {
  margin: 0;
}
.watch-today-saved-chips {
  display: flex;
  flex-wrap: wrap;
  gap: 5px;
  min-height: 20px;
  align-items: center;
}
.watch-today-saved-chips.is-inline {
  display: inline-flex;
  flex-wrap: nowrap;
  margin-left: 4px;
  min-height: 0;
}
.watch-today-saved-chips.is-inline .watch-mini {
  padding: 1px 7px;
  font-size: 10px;
}
.watch-today-saved-meta .watch-card-targets {
  flex-wrap: nowrap;
}
.watch-today-saved-meta .watch-mini,
.watch-today-saved-meta .watch-target {
  padding: 3px 7px;
  font-size: 11px;
}
.watch-card-section.is-tomorrow {
  margin-top: 2px;
  padding-top: 6px;
  border-top: 1px dashed var(--hair);
}
.watch-tomorrow-head-left {
  display: flex;
  align-items: center;
  gap: 4px;
  min-width: 0;
  flex-wrap: wrap;
}
.watch-tomorrow-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 4px;
}
.watch-tomorrow-label {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-size: 10.5px;
  color: var(--txt-3);
  letter-spacing: 0.04em;
}
/* 顶部信息行：操作/情绪 + 价格计划，强制同一行 */
.watch-card-meta {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: nowrap;
  flex-shrink: 0;
}
.watch-card-chips {
  display: flex;
  flex-wrap: wrap;
  gap: 7px;
  min-height: 20px;
  flex-shrink: 0;
  align-items: center;
}
.watch-card-meta .watch-card-chips {
  flex: 0 1 auto;
  min-width: 0;
  overflow: hidden;
  flex-wrap: nowrap;
  gap: 5px;
  min-height: 0;
}
.watch-card-meta .watch-mini {
  padding: 3px 7px;
  font-size: 11px;
  letter-spacing: 0.02em;
  white-space: nowrap;
}
/* ---------- 价格计划（目标买入 / 目标卖出 / 止损） ---------- */
.watch-card-targets {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  flex-shrink: 0;
}
.watch-card-meta .watch-card-targets {
  flex: 0 0 auto;
  margin-left: auto;
  flex-wrap: nowrap;
  gap: 5px;
}
.watch-target {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 3px 8px;
  border-radius: 8px;
  border: 1px solid transparent;
  font-variant-numeric: tabular-nums;
}
.watch-target.is-buy { border-color: rgba(242, 85, 90, 0.6); background: rgba(242, 85, 90, 0.16); }
.watch-target.is-sell { border-color: rgba(47, 191, 113, 0.6); background: rgba(47, 191, 113, 0.16); }
.watch-target.is-loss { border-color: rgba(224, 164, 88, 0.6); background: rgba(224, 164, 88, 0.16); }
.watch-target-key { font-size: 11px; font-weight: 800; letter-spacing: 0.04em; }
.watch-target.is-buy .watch-target-key { color: #FF9EA1; }
.watch-target.is-sell .watch-target-key { color: #8FE5B4; }
.watch-target.is-loss .watch-target-key { color: #EBC98A; }
.watch-target-val { font-size: 14.5px; font-weight: 800; letter-spacing: 0.01em; line-height: 1.1; }
.watch-target-shares { font-size: 11px; font-weight: 600; color: var(--txt-3); opacity: 0.85; }
.watch-card-chips.is-empty { opacity: 0; pointer-events: none; }
.watch-mini {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  padding: 4px 12px;
  border-radius: 9px;
  font-size: 12px;
  font-weight: 500;
  letter-spacing: 0.03em;
  color: var(--txt-2);
  border: 1px solid var(--hair-2);
  background: rgba(255, 255, 255, 0.075);
}
.watch-mini.is-sentiment { color: #F0DCA4; border-color: rgba(232, 200, 106, 0.45); background: rgba(212, 175, 55, 0.16); }

/* ---------- 今日备注 ---------- */
.watch-card-todaynote {
  flex: 1 1 0;
  min-height: 0;
  display: flex;
  flex-direction: column;
  padding: 8px 10px;
  border-radius: 10px;
  border: 1px solid rgba(232, 200, 106, 0.25);
  background: rgba(212, 175, 55, 0.07);
}
.watch-card-todaynote.is-empty {
  border-color: var(--hair);
  background: rgba(255, 255, 255, 0.025);
}
.watch-todaynote-label {
  display: flex;
  align-items: center;
  gap: 5px;
  margin-bottom: 5px;
  font-size: 11px;
  letter-spacing: 0.08em;
  color: var(--gold-2);
  flex-shrink: 0;
}
.watch-todaynote-text {
  margin: 0;
  font-size: 12.5px;
  line-height: 1.6;
  color: var(--txt-1);
  flex: 1;
  min-height: 0;
  overflow: hidden;
  letter-spacing: 0.01em;
  white-space: pre-wrap;
  word-break: break-word;
}
.watch-todaynote-empty {
  margin: 0;
  font-size: 11.5px;
  color: var(--txt-3);
  font-style: italic;
}

/* ---------- 昨日备注 ---------- */
.watch-card-prevnote {
  flex-shrink: 0;
  padding: 6px 10px;
  border-radius: 8px;
  border: 1px solid var(--hair);
  background: rgba(255, 255, 255, 0.015);
}
.watch-card-prevnote.is-empty {
  opacity: 0.45;
  padding: 4px 10px;
}
.watch-prevnote-label {
  display: flex;
  align-items: center;
  gap: 4px;
  margin-bottom: 3px;
  font-size: 10px;
  letter-spacing: 0.08em;
  color: var(--txt-3);
}
.watch-prevnote-text {
  margin: 0;
  font-size: 11px;
  line-height: 1.5;
  color: var(--txt-2);
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
  letter-spacing: 0.01em;
  opacity: 0.8;
}

/* ---------- 盘中 · 盘后记录 ---------- */
.watch-card-intraday {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.watch-intraday-label {
  display: flex;
  align-items: center;
  gap: 5px;
  font-size: 10.5px;
  letter-spacing: 0.08em;
  color: var(--gold-2);
  flex-shrink: 0;
}
.watch-intraday-input {
  flex: 1;
  width: 100%;
  resize: none;
  padding: 8px 10px;
  border-radius: 10px;
  border: 1px solid var(--hair-2);
  background: rgba(255, 255, 255, 0.04);
  color: var(--txt-1);
  font-size: 12px;
  line-height: 1.55;
  letter-spacing: 0.01em;
  font-family: inherit;
  transition: border-color 0.18s, background 0.18s;
}
.watch-intraday-input::placeholder { color: var(--txt-3); }
.watch-intraday-input:focus {
  outline: none;
  border-color: rgba(232, 200, 106, 0.5);
  background: rgba(212, 175, 55, 0.06);
}
.watch-intraday-foot {
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-shrink: 0;
}
.watch-intraday-hint {
  font-size: 10px;
  letter-spacing: 0.06em;
  color: var(--txt-3);
}
.watch-intraday-save {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  height: 22px;
  padding: 0 8px;
  border-radius: 7px;
  border: 1px solid rgba(232, 200, 106, 0.4);
  background: rgba(212, 175, 55, 0.16);
  color: var(--gold-2);
  font-size: 10.5px;
  transition: all 0.16s;
}
.watch-intraday-save:hover { background: rgba(212, 175, 55, 0.28); color: #FFFFFF; }
.watch-intraday-save:active { transform: translateY(1px); }

.watch-card-review {
  display: inline-flex;
  align-items: center;
  gap: 7px;
  padding: 6px 13px;
  border-radius: 10px;
  font-size: 12px;
  font-weight: 500;
  letter-spacing: 0.04em;
  border: 1px solid transparent;
}
.watch-card-review.rv-hit { color: #7FE0AE; border-color: rgba(47, 191, 113, 0.28); background: rgba(47, 191, 113, 0.08); }
.watch-card-review.rv-partial { color: #EBC98A; border-color: rgba(224, 164, 88, 0.28); background: rgba(224, 164, 88, 0.08); }
.watch-card-review.rv-miss { color: #FF9A9D; border-color: rgba(242, 85, 90, 0.28); background: rgba(242, 85, 90, 0.08); }
.watch-card-review.rv-stopped { color: var(--txt-2); border-color: var(--hair); background: rgba(255, 255, 255, 0.03); }

/* 卡片底部 */
.watch-card-foot {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 5px 10px;
  border-top: 1px solid var(--hair);
  background: rgba(0, 0, 0, 0.14);
}
.watch-icon-btn {
  width: 30px;
  height: 30px;
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 8px;
  color: var(--txt-3);
  transition: all 0.18s;
}
.watch-icon-btn:hover { color: var(--txt-1); background: rgba(255, 255, 255, 0.05); }
.watch-icon-btn.is-on { color: var(--gold-2); background: rgba(212, 175, 55, 0.1); }
.watch-icon-btn.is-danger:hover { color: #FF8A8E; background: rgba(242, 85, 90, 0.1); }

/* 快捷登记买卖 */
.watch-trade-btn {
  flex: 1 1 0;
  min-width: 0;
  height: 30px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 8px;
  border: 1px solid var(--hair);
  background: rgba(255, 255, 255, 0.03);
  font-size: 12px;
  font-weight: 600;
  letter-spacing: 0.04em;
  transition: all 0.18s;
}
.watch-trade-btn.is-buy {
  color: #FFA2A5;
  border-color: rgba(242, 85, 90, 0.5);
  background: rgba(242, 85, 90, 0.16);
}
.watch-trade-btn.is-buy:hover {
  color: #fff;
  border-color: rgba(242, 85, 90, 0.85);
  background: rgba(242, 85, 90, 0.34);
}
.watch-trade-btn.is-sell {
  color: #8FE5B4;
  border-color: rgba(47, 191, 113, 0.5);
  background: rgba(47, 191, 113, 0.16);
}
.watch-trade-btn.is-sell:hover {
  color: #fff;
  border-color: rgba(47, 191, 113, 0.85);
  background: rgba(47, 191, 113, 0.34);
}

/* 添加卡 */
.watch-card.is-add {
  border-style: dashed;
  border-color: var(--hair-2);
  background: rgba(255, 255, 255, 0.012);
  cursor: pointer;
}
.watch-card.is-add::before { opacity: 0.3; }
.watch-card.is-add:hover {
  border-color: rgba(212, 175, 55, 0.4);
  background: rgba(212, 175, 55, 0.035);
}
.watch-add-inner {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 11px;
  padding: 24px;
}
.watch-add-ring {
  width: 60px;
  height: 60px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 50%;
  color: var(--txt-2);
  border: 1px solid var(--hair-2);
  background: rgba(255, 255, 255, 0.03);
  transition: all 0.35s cubic-bezier(0.4, 0, 0.2, 1);
}
.watch-card.is-add:hover .watch-add-ring {
  color: var(--gold-2);
  border-color: rgba(212, 175, 55, 0.45);
  background: rgba(212, 175, 55, 0.1);
  transform: rotate(90deg) scale(1.06);
}
.watch-add-title { font-size: 15.5px; font-weight: 500; letter-spacing: 0.06em; color: var(--txt-2); }
.watch-card.is-add:hover .watch-add-title { color: #EBD9A4; }
.watch-add-sub { font-size: 12px; letter-spacing: 0.04em; color: var(--txt-3); }

/* 状态 */
.watch-state {
  width: 100%;
  height: 100%;
  min-height: 250px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 10px;
  color: var(--txt-3);
}
.watch-state-mark {
  width: 80px;
  height: 80px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 22px;
  color: var(--txt-3);
  border: 1px solid var(--hair);
  background: rgba(255, 255, 255, 0.02);
  margin-bottom: 6px;
}
.watch-state-title { font-size: 16px; letter-spacing: 0.06em; color: var(--txt-2); }
.watch-state-sub { font-size: 12.5px; letter-spacing: 0.04em; color: var(--txt-3); }

/* 底部 */
.watch-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  padding: 3px 18px;
  border-top: 1px solid var(--hair);
  background: rgba(255, 255, 255, 0.015);
}
.watch-footer-hint { font-size: 10.5px; letter-spacing: 0.04em; color: var(--txt-3); }

/* ---------- 抽屉 ---------- */
.watch-drawer-layer {
  position: absolute;
  inset: 0;
  z-index: 30;
}
.watch-drawer-scrim {
  position: absolute;
  inset: 0;
  background: rgba(6, 8, 12, 0.5);
  backdrop-filter: blur(3px);
}
.watch-drawer {
  position: absolute;
  top: 0;
  right: 0;
  height: 100%;
  width: min(1180px, 86%);
  display: flex;
  flex-direction: column;
  overflow: hidden;
  border-left: 1px solid rgba(212, 175, 55, 0.22);
  background:
    radial-gradient(115% 62% at 100% 0%, rgba(212, 175, 55, 0.13) 0%, transparent 58%),
    radial-gradient(120% 85% at 0% 100%, rgba(86, 112, 196, 0.2) 0%, transparent 62%),
    linear-gradient(180deg, #1B2233 0%, #121826 55%, #0E1220 100%);
  box-shadow:
    -46px 0 96px rgba(0, 0, 0, 0.62),
    -1px 0 0 rgba(0, 0, 0, 0.5),
    inset 1px 0 0 rgba(255, 255, 255, 0.06);
  color: var(--txt-1);
}
/* 顶部鎏金 → 靛蓝 光线 */
.watch-drawer::before {
  content: '';
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  height: 2px;
  z-index: 2;
  pointer-events: none;
  background: linear-gradient(90deg, transparent, var(--gold-2) 28%, #6B84C8 74%, transparent);
  opacity: 0.8;
}
/* 左缘竖向光线 */
.watch-drawer::after {
  content: '';
  position: absolute;
  top: 0;
  bottom: 0;
  left: 0;
  width: 2px;
  z-index: 2;
  pointer-events: none;
  background: linear-gradient(180deg, transparent, var(--gold-2) 24%, #6B84C8 76%, transparent);
  opacity: 0.6;
}
.watch-drawer.is-edit { width: min(760px, 68%); }
.watch-drawer-enter-active,
.watch-drawer-leave-active { transition: opacity 0.3s ease; }
.watch-drawer-enter-active .watch-drawer,
.watch-drawer-leave-active .watch-drawer { transition: transform 0.38s cubic-bezier(0.22, 1, 0.36, 1); }
.watch-drawer-enter-from,
.watch-drawer-leave-to { opacity: 0; }
.watch-drawer-enter-from .watch-drawer,
.watch-drawer-leave-to .watch-drawer { transform: translateX(100%); }

.watch-dialog-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 20px 24px;
  border-bottom: 1px solid rgba(212, 175, 55, 0.18);
  background: linear-gradient(180deg, rgba(212, 175, 55, 0.09), rgba(212, 175, 55, 0));
}
.watch-dialog-head h3 {
  font-size: 16.5px;
  font-weight: 600;
  letter-spacing: 0.05em;
  color: #F2F5FA;
}
.watch-dialog-title { display: flex; align-items: baseline; gap: 10px; }
.watch-dialog-code {
  font-size: 12px;
  letter-spacing: 0.08em;
  color: var(--txt-3);
  font-variant-numeric: tabular-nums;
}

.watch-dialog-body {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  overscroll-behavior: contain;
  padding: 24px;
  display: flex;
  flex-direction: column;
  gap: 20px;
}
.watch-dialog-foot {
  display: flex;
  gap: 10px;
  padding: 18px 24px;
  border-top: 1px solid var(--hair);
}

/* 字段 */
.watch-field { display: flex; flex-direction: column; gap: 10px; }
.watch-field-label {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: 11.5px;
  font-weight: 600;
  letter-spacing: 0.14em;
  color: var(--txt-2);
}
.watch-field-hint {
  font-size: 10.5px;
  font-weight: 400;
  letter-spacing: 0.04em;
  color: var(--txt-3);
  opacity: 0.8;
}


/* 输入 */
.watch-input,
.watch-textarea {
  width: 100%;
  border-radius: 11px;
  border: 1px solid var(--hair-2);
  background: rgba(255, 255, 255, 0.07);
  color: var(--txt-1);
  font-size: 13.5px;
  letter-spacing: 0.02em;
  outline: none;
  transition: border-color 0.2s, box-shadow 0.2s, background 0.2s;
}
.watch-input { height: 42px; padding: 0 14px; }
.watch-textarea { padding: 12px 14px; resize: none; line-height: 1.65; }
.watch-input::placeholder,
.watch-textarea::placeholder { color: var(--txt-3); }
.watch-input:focus,
.watch-textarea:focus {
  border-color: rgba(232, 200, 106, 0.7);
  background: rgba(212, 175, 55, 0.1);
  box-shadow: 0 0 0 3px rgba(212, 175, 55, 0.16);
}
.watch-input.is-price {
  height: 40px;
  font-weight: 600;
  font-variant-numeric: tabular-nums;
}
.watch-input.is-price.tone-up { color: var(--up); }
.watch-input.is-price.tone-down { color: var(--down); }
.watch-input.is-price.tone-warn { color: var(--warn); }

.watch-search { position: relative; }
.watch-search-icon {
  position: absolute;
  top: 50%;
  left: 12px;
  transform: translateY(-50%);
  color: var(--txt-3);
  pointer-events: none;
}
.watch-search-icon.is-right { left: auto; right: 12px; }
.watch-search .watch-input { padding-left: 34px; }

/* 搜索建议 */
.watch-suggest {
  margin-top: 7px;
  max-height: 196px;
  overflow-y: auto;
  overscroll-behavior: contain;
  border-radius: 11px;
  border: 1px solid var(--hair-2);
  background: rgba(255, 255, 255, 0.07);
}
.watch-suggest-item {
  width: 100%;
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 11px 14px;
  border-bottom: 1px solid var(--hair);
  text-align: left;
  transition: background 0.15s;
}
.watch-suggest-item:last-child { border-bottom: none; }
.watch-suggest-item:hover { background: rgba(212, 175, 55, 0.18); }
.watch-suggest-name { font-size: 13.5px; font-weight: 600; color: #FFFFFF; letter-spacing: 0.02em; }
.watch-suggest-code { font-size: 11px; color: var(--gold-2); font-variant-numeric: tabular-nums; letter-spacing: 0.06em; }
.watch-suggest-board { margin-left: auto; font-size: 10.5px; letter-spacing: 0.08em; color: var(--txt-3); }

/* 分段控件 */
.watch-segment {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 5px;
  padding: 5px;
  border-radius: 12px;
  border: 1px solid var(--hair-2);
  background: rgba(255, 255, 255, 0.05);
}
.watch-segment button {
  height: 38px;
  border-radius: 9px;
  font-size: 13px;
  font-weight: 500;
  letter-spacing: 0.05em;
  color: var(--txt-2);
  transition: all 0.2s;
}
.watch-segment button:hover { color: #FFFFFF; background: rgba(255, 255, 255, 0.07); }
.watch-segment button.is-active {
  color: #F5E7BE;
  background: linear-gradient(180deg, rgba(212, 175, 55, 0.34), rgba(212, 175, 55, 0.16));
  border: 1px solid rgba(232, 200, 106, 0.6);
}

/* 选项网格 */
.watch-grid-8 { display: grid; grid-template-columns: repeat(8, minmax(0, 1fr)); gap: 6px; }
.watch-grid-5 { display: grid; grid-template-columns: repeat(5, 1fr); gap: 6px; }
.watch-grid-3 { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; }

.watch-opt {
  height: 40px;
  border-radius: 10px;
  border: 1px solid var(--hair-2);
  background: rgba(255, 255, 255, 0.055);
  color: var(--txt-2);
  font-size: 12px;
  font-weight: 500;
  letter-spacing: 0.04em;
  transition: all 0.2s;
}
.watch-opt:hover { color: #FFFFFF; border-color: rgba(255, 255, 255, 0.32); background: rgba(255, 255, 255, 0.1); }
.watch-opt.is-active {
  color: #F5E7BE;
  border-color: rgba(232, 200, 106, 0.65);
  background: linear-gradient(180deg, rgba(212, 175, 55, 0.34), rgba(212, 175, 55, 0.16));
  box-shadow: 0 4px 14px rgba(212, 175, 55, 0.18);
}
.watch-opt.rv-hit.is-active { color: #A6F0C8; border-color: rgba(47, 191, 113, 0.85); background: linear-gradient(180deg, rgba(47, 191, 113, 0.42), rgba(47, 191, 113, 0.2)); box-shadow: 0 0 0 2px rgba(47, 191, 113, 0.4), 0 8px 18px rgba(0, 0, 0, 0.35); transform: translateY(-1px); }
.watch-opt.rv-partial.is-active { color: #F0D49B; border-color: rgba(224, 164, 88, 0.85); background: linear-gradient(180deg, rgba(224, 164, 88, 0.42), rgba(224, 164, 88, 0.2)); box-shadow: 0 0 0 2px rgba(224, 164, 88, 0.4), 0 8px 18px rgba(0, 0, 0, 0.35); transform: translateY(-1px); }
.watch-opt.rv-miss.is-active { color: #FFAEB1; border-color: rgba(242, 85, 90, 0.85); background: linear-gradient(180deg, rgba(242, 85, 90, 0.42), rgba(242, 85, 90, 0.2)); box-shadow: 0 0 0 2px rgba(242, 85, 90, 0.4), 0 8px 18px rgba(0, 0, 0, 0.35); transform: translateY(-1px); }
.watch-opt.rv-stopped.is-active { color: #FFFFFF; border-color: rgba(255, 255, 255, 0.5); background: rgba(255, 255, 255, 0.2); box-shadow: 0 0 0 2px rgba(255, 255, 255, 0.24), 0 8px 18px rgba(0, 0, 0, 0.35); transform: translateY(-1px); }

/* 操作计划：每类独立色相；未选中=暗色描边，选中=整块实色+对勾 */
.watch-opt.act-hold { --act: 232, 200, 106; }
.watch-opt.act-buy_t { --act: 99, 214, 218; }
.watch-opt.act-sell_t { --act: 199, 155, 242; }
.watch-opt.act-buy { --act: 242, 85, 90; }
.watch-opt.act-sell { --act: 47, 191, 113; }
.watch-opt.act-wait { --act: 166, 182, 206; }
.watch-opt.act-add { --act: 255, 138, 91; }
.watch-opt.act-reduce { --act: 169, 217, 107; }
.watch-opt.act-hold,
.watch-opt.act-buy_t,
.watch-opt.act-sell_t,
.watch-opt.act-buy,
.watch-opt.act-sell,
.watch-opt.act-wait,
.watch-opt.act-add,
.watch-opt.act-reduce {
  color: rgba(var(--act), 0.62);
  border-color: rgba(255, 255, 255, 0.14);
  background: rgba(255, 255, 255, 0.04);
}
.watch-opt.act-hold:hover,
.watch-opt.act-buy_t:hover,
.watch-opt.act-sell_t:hover,
.watch-opt.act-buy:hover,
.watch-opt.act-sell:hover,
.watch-opt.act-wait:hover,
.watch-opt.act-add:hover,
.watch-opt.act-reduce:hover {
  color: rgba(var(--act), 0.96);
  border-color: rgba(var(--act), 0.55);
  background: rgba(var(--act), 0.14);
}
.watch-opt.act-hold.is-active,
.watch-opt.act-buy_t.is-active,
.watch-opt.act-sell_t.is-active,
.watch-opt.act-buy.is-active,
.watch-opt.act-sell.is-active,
.watch-opt.act-wait.is-active,
.watch-opt.act-add.is-active,
.watch-opt.act-reduce.is-active {
  color: #0B0F18;
  font-weight: 800;
  border-color: rgba(var(--act), 1);
  background: linear-gradient(180deg, rgba(var(--act), 1), rgba(var(--act), 0.82));
  box-shadow: 0 0 0 2px rgba(var(--act), 0.55), 0 8px 18px rgba(var(--act), 0.38);
  transform: translateY(-1px);
}
.watch-opt { position: relative; }
.watch-opt-tick {
  position: absolute;
  top: 3px;
  right: 3px;
  box-sizing: border-box;
  width: 15px;
  height: 15px;
  padding: 2.5px;
  border-radius: 50%;
  background: #0B0F18;
  color: #FFFFFF;
  box-shadow: 0 0 0 1px rgba(255, 255, 255, 0.4);
}

/* 情绪选择 */
.watch-mood {
  height: 40px;
  display: flex;
  flex-direction: row;
  align-items: center;
  justify-content: center;
  gap: 6px;
  border-radius: 10px;
  border: 1px solid var(--hair-2);
  background: rgba(255, 255, 255, 0.055);
  color: var(--txt-2);
  font-size: 12px;
  letter-spacing: 0.03em;
  transition: all 0.2s;
}
.watch-mood.tone-very_bullish { color: #FF9EA1; border-color: rgba(242, 85, 90, 0.4); background: rgba(242, 85, 90, 0.1); }
.watch-mood.tone-bullish { color: #FFB4B6; border-color: rgba(242, 85, 90, 0.32); background: rgba(242, 85, 90, 0.07); }
.watch-mood.tone-neutral { color: #D9E0EB; border-color: rgba(255, 255, 255, 0.24); background: rgba(255, 255, 255, 0.06); }
.watch-mood.tone-bearish { color: #A6F0C8; border-color: rgba(47, 191, 113, 0.32); background: rgba(47, 191, 113, 0.07); }
.watch-mood.tone-very_bearish { color: #8FE5B4; border-color: rgba(47, 191, 113, 0.4); background: rgba(47, 191, 113, 0.1); }
.watch-mood:hover { color: #FFFFFF; border-color: rgba(255, 255, 255, 0.32); background: rgba(255, 255, 255, 0.1); }
.watch-mood.is-active {
  color: #fff;
  box-shadow: 0 0 0 2px rgba(255, 255, 255, 0.24), 0 8px 20px rgba(0, 0, 0, 0.42);
  transform: translateY(-1px);
}
.watch-mood.tone-very_bullish.is-active { color: #FFD3D4; border-color: rgba(242, 85, 90, 0.9); background: rgba(242, 85, 90, 0.4); }
.watch-mood.tone-bullish.is-active { color: #FFC9CB; border-color: rgba(242, 85, 90, 0.7); background: rgba(242, 85, 90, 0.28); }
.watch-mood.tone-neutral.is-active { color: #FFFFFF; border-color: rgba(255, 255, 255, 0.5); background: rgba(255, 255, 255, 0.24); }
.watch-mood.tone-bearish.is-active { color: #C6F5DA; border-color: rgba(47, 191, 113, 0.7); background: rgba(47, 191, 113, 0.28); }
.watch-mood.tone-very_bearish.is-active { color: #D6FBE6; border-color: rgba(47, 191, 113, 0.9); background: rgba(47, 191, 113, 0.4); }

/* 价格 */
.watch-price { display: flex; flex-direction: column; gap: 6px; }
.watch-price-key { font-size: 11px; letter-spacing: 0.1em; color: var(--txt-3); }
.watch-price-key.is-buy { color: #FF9EA1; }
.watch-price-key.is-sell { color: #8FE5B4; }
.watch-price-key.is-loss { color: #EBC98A; }
.watch-price-row { display: flex; align-items: center; gap: 6px; }
.watch-price-row .watch-input.is-price { flex: 0 0 108px; width: 108px; min-width: 0; transition: flex-grow 0.18s ease; }
/* 未填价格时股数框不渲染，价格框占满整行；填价后收缩，股数框出现 */
.watch-price-row .watch-input.is-price:only-child { flex-grow: 1; }
.watch-input.is-price.is-shares {
  flex: 1 1 80px;
  min-width: 64px;
  text-align: center;
  color: var(--txt-2);
  animation: watch-shares-in 0.18s ease;
}
@keyframes watch-shares-in {
  from { opacity: 0; transform: translateX(4px); }
  to { opacity: 1; transform: none; }
}
.watch-shares-quick {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  margin-top: 5px;
}
.watch-shares-qbtn {
  flex: 0 0 auto;
  padding: 2px 7px;
  border-radius: 6px;
  font-size: 10.5px;
  font-weight: 500;
  color: var(--txt-3);
  background: rgba(255, 255, 255, 0.04);
  border: 1px solid var(--hair);
  cursor: pointer;
  transition: all 0.15s;
}
.watch-shares-qbtn:hover:not(:disabled) {
  color: var(--gold-2);
  border-color: rgba(212, 175, 55, 0.45);
  background: rgba(212, 175, 55, 0.1);
}
.watch-shares-qbtn:disabled {
  opacity: 0.35;
  cursor: not-allowed;
}

/* 模板 */
.watch-templates { display: flex; flex-wrap: wrap; align-items: center; gap: 6px; margin-top: 9px; }
.watch-templates-key { font-size: 11px; letter-spacing: 0.12em; color: var(--txt-3); }
.watch-template {
  padding: 4px 11px;
  border-radius: 8px;
  border: 1px solid var(--hair);
  background: rgba(255, 255, 255, 0.02);
  color: var(--txt-2);
  font-size: 11.5px;
  letter-spacing: 0.03em;
  transition: all 0.18s;
}
.watch-template:hover { color: var(--gold-2); border-color: rgba(212, 175, 55, 0.3); background: rgba(212, 175, 55, 0.07); }

/* 添加弹窗：左右两栏 */
.watch-add-grid {
  flex: 1;
  min-height: 0;
  display: grid;
  grid-template-columns: 296px 1fr;
}
.watch-add-left {
  display: flex;
  flex-direction: column;
  gap: 18px;
  padding: 20px;
  overflow-y: auto;
  overscroll-behavior: contain;
  border-right: 1px solid rgba(212, 175, 55, 0.14);
  background: linear-gradient(180deg, rgba(212, 175, 55, 0.05), rgba(212, 175, 55, 0) 46%);
}
.watch-add-right {
  display: flex;
  flex-direction: column;
  gap: 12px;
  min-height: 0;
  padding: 20px;
  overflow-y: auto;
  overscroll-behavior: contain;
  background: radial-gradient(120% 72% at 100% 0%, rgba(86, 112, 196, 0.1), transparent 58%);
}
.watch-add-right-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}
.watch-add-filter {
  position: relative;
  display: flex;
  align-items: center;
  flex: 1;
  max-width: 260px;
}
.watch-input.is-sm { height: 32px; padding-left: 32px; font-size: 12.5px; }

/* 平铺网格：尽量一屏铺完，不出现滚轴 */
.watch-tile-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(112px, 1fr));
  gap: 6px;
  align-content: start;
}
.watch-tile {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 9px 11px;
  border-radius: 9px;
  border: 1px solid var(--hair-2);
  background: rgba(255, 255, 255, 0.075);
  text-align: left;
  transition: all 0.16s;
}
.watch-tile:hover {
  border-color: rgba(232, 200, 106, 0.65);
  background: rgba(212, 175, 55, 0.16);
  transform: translateY(-1px);
}
.watch-tile-name {
  font-size: 13px;
  font-weight: 600;
  color: #FFFFFF;
  letter-spacing: 0.02em;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.watch-tile-meta { display: flex; align-items: center; justify-content: space-between; gap: 5px; }
.watch-tile-code {
  font-size: 10.5px;
  color: var(--txt-2);
  font-variant-numeric: tabular-nums;
  letter-spacing: 0.04em;
}
.watch-tile-tag {
  flex-shrink: 0;
  padding: 0 6px;
  border-radius: 999px;
  font-size: 9.5px;
  line-height: 15px;
  font-weight: 600;
  letter-spacing: 0.04em;
  border: 1px solid transparent;
}
.watch-tile-tag.is-holding {
  color: #A6F0C8;
  border-color: rgba(47, 191, 113, 0.5);
  background: rgba(47, 191, 113, 0.2);
}
.watch-tile-tag.is-cleared {
  color: #E4E9F2;
  border-color: var(--hair-2);
  background: rgba(255, 255, 255, 0.12);
}
.watch-add-empty {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 10px;
  color: var(--txt-3);
  font-size: 12.5px;
  letter-spacing: 0.04em;
}

@media (max-width: 980px) {
  .watch-drawer,
  .watch-drawer.is-edit { width: 100%; }
  .watch-add-grid { grid-template-columns: 1fr; overflow-y: auto; }
  .watch-add-left { border-right: none; border-bottom: 1px solid var(--hair); overflow-y: visible; }
  .watch-add-right { overflow-y: visible; }
}

/* 日期横幅 */
.watch-date-banner {
  display: flex;
  align-items: center;
  gap: 9px;
  padding: 12px 14px;
  border-radius: 11px;
  border: 1px solid var(--hair);
  background: rgba(255, 255, 255, 0.022);
  color: var(--txt-3);
}
.watch-date-banner-val {
  font-size: 13px;
  letter-spacing: 0.06em;
  color: var(--txt-1);
  font-variant-numeric: tabular-nums;
}
.watch-date-banner-tag {
  margin-left: auto;
  font-size: 10.5px;
  letter-spacing: 0.1em;
  color: var(--gold-2);
  opacity: 0.85;
}

/* 动画与滚动条 */
.watch-spin { animation: watchSpin 1s linear infinite; }
@keyframes watchSpin { to { transform: rotate(360deg); } }

.watch-panel-enter-active,
.watch-panel-leave-active { transition: opacity 0.28s ease; }
.watch-panel-enter-from,
.watch-panel-leave-to { opacity: 0; }
.watch-panel-enter-from .watch-shell,
.watch-panel-leave-to .watch-shell { transform: translateY(18px) scale(0.985); }
.watch-shell { transition: transform 0.3s cubic-bezier(0.4, 0, 0.2, 1); }

.watch-stage::-webkit-scrollbar,
.watch-dialog-body::-webkit-scrollbar,
.watch-suggest::-webkit-scrollbar { height: 6px; width: 6px; }
.watch-stage::-webkit-scrollbar-track,
.watch-dialog-body::-webkit-scrollbar-track,
.watch-suggest::-webkit-scrollbar-track { background: transparent; }
.watch-stage::-webkit-scrollbar-thumb,
.watch-dialog-body::-webkit-scrollbar-thumb,
.watch-suggest::-webkit-scrollbar-thumb {
  background: rgba(255, 255, 255, 0.12);
  border-radius: 3px;
}
.watch-stage::-webkit-scrollbar-thumb:hover,
.watch-dialog-body::-webkit-scrollbar-thumb:hover,
.watch-suggest::-webkit-scrollbar-thumb:hover { background: rgba(212, 175, 55, 0.35); }

/* 添加弹窗两栏：滚动条极细且默认透明，仅悬停时显形 */
.watch-add-left::-webkit-scrollbar,
.watch-add-right::-webkit-scrollbar { width: 4px; }
.watch-add-left::-webkit-scrollbar-track,
.watch-add-right::-webkit-scrollbar-track { background: transparent; }
.watch-add-left::-webkit-scrollbar-thumb,
.watch-add-right::-webkit-scrollbar-thumb { background: transparent; border-radius: 2px; }
.watch-add-left:hover::-webkit-scrollbar-thumb,
.watch-add-right:hover::-webkit-scrollbar-thumb { background: rgba(255, 255, 255, 0.16); }

/* ============================================================
   历史每日记录 / 复盘验证 / 盘后总结
   ============================================================ */

/* ---------- 头部：描边按钮 ---------- */
.watch-btn-line {
  display: inline-flex;
  align-items: center;
  gap: 7px;
  height: 30px;
  padding: 0 13px;
  border-radius: 9px;
  border: 1px solid var(--hair-2);
  background: rgba(255, 255, 255, 0.05);
  color: var(--txt-2);
  font-size: 11.5px;
  font-weight: 500;
  letter-spacing: 0.05em;
  transition: all 0.2s;
}
.watch-btn-line:hover {
  color: #F5E7BE;
  border-color: rgba(232, 200, 106, 0.6);
  background: rgba(212, 175, 55, 0.14);
}
.watch-btn-line.is-on {
  color: #0B0F18;
  font-weight: 700;
  border-color: rgba(232, 200, 106, 1);
  background: linear-gradient(180deg, #E8C86A, #C9A44C);
  box-shadow: 0 0 0 2px rgba(232, 200, 106, 0.35), 0 8px 18px rgba(212, 175, 55, 0.3);
}
.watch-metric-unit { margin-left: 1px; font-size: 0.62em; opacity: 0.8; }

/* ---------- 卡片头部 ---------- */
.watch-card-side { display: flex; align-items: center; gap: 7px; flex-shrink: 0; }

/* ---------- 卡片内：复盘区（验证想法 + 历史入口） ---------- */
.watch-review-zone {
  display: flex;
  flex-direction: column;
  gap: 7px;
  margin: 0 18px;
  padding: 9px 0 11px;
  border-top: 1px dashed var(--hair);
  height: 74px;
  flex-shrink: 0;
  overflow: hidden;
}
.watch-review-bar { display: flex; align-items: center; gap: 8px; }
.watch-review-key {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  font-size: 11px;
  letter-spacing: 0.1em;
  color: var(--txt-3);
}
.watch-review-pct { font-size: 11.5px; font-weight: 600; font-variant-numeric: tabular-nums; letter-spacing: 0.02em; }
.watch-review-loading { font-size: 10.5px; color: var(--txt-3); letter-spacing: 0.04em; }
.watch-review-hint { font-size: 11px; letter-spacing: 0.04em; color: var(--txt-3); }
.watch-review-hist {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  height: 24px;
  margin-left: auto;
  padding: 0 9px;
  border-radius: 8px;
  border: 1px solid var(--hair);
  background: rgba(255, 255, 255, 0.03);
  color: var(--txt-3);
  font-size: 10.5px;
  font-variant-numeric: tabular-nums;
  transition: all 0.18s;
}
.watch-review-hist:hover {
  color: var(--gold-2);
  border-color: rgba(232, 200, 106, 0.5);
  background: rgba(212, 175, 55, 0.14);
}
.watch-review-hist.has-records { color: var(--txt-2); }
.watch-review-hist b { font-weight: 600; }
.watch-today-verify .watch-verify-row { display: flex; gap: 4px; min-width: 0; flex-wrap: nowrap; }
.watch-today-verify .watch-review-clear { margin-left: auto; }
.watch-verify-btn {
  height: 23px;
  padding: 0 8px;
  border-radius: 8px;
  border: 1px solid var(--hair-2);
  background: rgba(255, 255, 255, 0.05);
  color: var(--txt-2);
  font-size: 11px;
  font-weight: 500;
  letter-spacing: 0.02em;
  transition: all 0.16s;
  display: inline-flex;
  align-items: center;
  gap: 3px;
}
.watch-verify-btn.is-active {
  color: var(--gold-2);
  border-color: rgba(212, 175, 55, 0.65);
  background: rgba(212, 175, 55, 0.18);
}
.watch-verify-btn:hover { color: #FFFFFF; border-color: rgba(255, 255, 255, 0.34); background: rgba(255, 255, 255, 0.1); }
.watch-verify-btn:active { transform: translateY(1px); }
.watch-verify-btn.rv-hit.is-suggest { color: #A6F0C8; border-color: rgba(47, 191, 113, 0.65); background: rgba(47, 191, 113, 0.16); }
.watch-verify-btn.rv-partial.is-suggest { color: #F0D49B; border-color: rgba(224, 164, 88, 0.65); background: rgba(224, 164, 88, 0.16); }
.watch-verify-btn.rv-miss.is-suggest { color: #FFAEB1; border-color: rgba(242, 85, 90, 0.65); background: rgba(242, 85, 90, 0.16); }
.watch-verify-btn.rv-stopped.is-suggest { color: #FFFFFF; border-color: rgba(255, 255, 255, 0.34); background: rgba(255, 255, 255, 0.12); }
.watch-verify-tip { font-size: 10.5px; letter-spacing: 0.04em; color: var(--gold-2); opacity: 0.85; }
.watch-review-clear {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 15px;
  height: 15px;
  margin-left: auto;
  border-radius: 999px;
  color: var(--txt-3);
  opacity: 0;
  transition: opacity 0.18s;
}
.watch-verify-row:hover .watch-review-clear { opacity: 0.5; }
.watch-review-clear:hover { opacity: 1 !important; color: #FF8A8E; background: rgba(242, 85, 90, 0.12); }

/* ---------- 抽屉尺寸 ---------- */
.watch-drawer.is-history { width: min(720px, 64%); }

/* ---------- 历史抽屉 ---------- */
.watch-hist-stats {
  display: flex;
  align-items: center;
  gap: 16px;
  padding: 15px 26px;
  border-bottom: 1px solid var(--hair);
  background: linear-gradient(180deg, rgba(212, 175, 55, 0.06), rgba(212, 175, 55, 0));
}
.watch-hist-stat { display: flex; flex-direction: column; gap: 4px; }
.watch-hist-num {
  font-size: 21px;
  font-weight: 600;
  letter-spacing: 0.02em;
  font-variant-numeric: tabular-nums;
  color: var(--txt-1);
}
.watch-hist-key { font-size: 11px; letter-spacing: 0.1em; color: var(--txt-3); }
.watch-hist-body {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  overscroll-behavior: contain;
  padding: 22px 26px 28px;
  background: radial-gradient(ellipse at 100% 0%, rgba(99, 102, 241, 0.12), transparent 55%),
    radial-gradient(ellipse at 0% 85%, rgba(45, 212, 191, 0.07), transparent 55%), #121720;
}

.watch-summary-help { margin: 0 0 10px; color: var(--txt-3); font-size: 11px; line-height: 1.7; }
.watch-hist-body .watch-tl-card { background: linear-gradient(135deg, #202938, #18202c); border-color: rgba(148, 163, 184, 0.18); box-shadow: 0 8px 22px rgba(0, 0, 0, 0.12); }
.watch-hist-body .watch-tl-card.tone-bullish,
.watch-hist-body .watch-tl-card.tone-very_bullish { background: linear-gradient(135deg, #33232e, #1c2230); border-color: rgba(251, 113, 133, 0.24); }
.watch-hist-body .watch-tl-card.tone-bearish,
.watch-hist-body .watch-tl-card.tone-very_bearish { background: linear-gradient(135deg, #16332f, #192331); border-color: rgba(52, 211, 153, 0.24); }
.watch-hist-body .watch-tl-card.tone-neutral { background: linear-gradient(135deg, #2c2941, #1b2331); border-color: rgba(167, 139, 250, 0.28); }
.watch-hist-body .watch-tl-card.tone-neutral::before,
.watch-hist-body .watch-tl-node.tone-neutral { background: #a78bfa; }
.watch-hist-body .watch-tl-week { color: #94a3b8; }
.watch-hist-body .watch-tl-note { color: #d2dce9; }
.watch-hist-body .watch-tl-pct { padding: 4px 8px; border-radius: 7px; background: rgba(15, 23, 42, 0.5); }

.watch-timeline { position: relative; padding-left: 22px; }
.watch-timeline::before {
  content: '';
  position: absolute;
  left: 5px;
  top: 6px;
  bottom: 6px;
  width: 1px;
  background: linear-gradient(180deg, rgba(212, 175, 55, 0.4), rgba(255, 255, 255, 0.06));
}
.watch-tl-item { position: relative; margin-bottom: 14px; }
.watch-tl-item:last-child { margin-bottom: 0; }
.watch-tl-node {
  position: absolute;
  left: -22px;
  top: 18px;
  width: 11px;
  height: 11px;
  border-radius: 999px;
  border: 2px solid var(--ink-0);
  background: rgba(255, 255, 255, 0.4);
}
.watch-tl-node.tone-very_bullish { background: #F2555A; box-shadow: 0 0 0 3px rgba(242, 85, 90, 0.16); }
.watch-tl-node.tone-bullish { background: rgba(242, 85, 90, 0.72); }
.watch-tl-node.tone-neutral { background: rgba(255, 255, 255, 0.55); }
.watch-tl-node.tone-bearish { background: rgba(47, 191, 113, 0.72); }
.watch-tl-node.tone-very_bearish { background: #2FBF71; box-shadow: 0 0 0 3px rgba(47, 191, 113, 0.16); }

.watch-tl-card {
  position: relative;
  display: flex;
  flex-direction: column;
  gap: 0;
  padding: 13px 16px 13px 17px;
  border-radius: 14px;
  border: 1px solid var(--hair);
  background: linear-gradient(180deg, rgba(255, 255, 255, 0.055), rgba(255, 255, 255, 0.015));
  overflow: hidden;
  transition: border-color 0.2s, transform 0.2s;
}
/* 左侧情绪色条：给每条记录一个统一重心 */
.watch-tl-card::before {
  content: '';
  position: absolute;
  left: 0;
  top: 11px;
  bottom: 11px;
  width: 3px;
  border-radius: 0 3px 3px 0;
  background: rgba(255, 255, 255, 0.16);
}
.watch-tl-card.tone-very_bullish::before { background: #F2555A; }
.watch-tl-card.tone-bullish::before { background: rgba(242, 85, 90, 0.78); }
.watch-tl-card.tone-neutral::before { background: rgba(255, 255, 255, 0.42); }
.watch-tl-card.tone-bearish::before { background: rgba(47, 191, 113, 0.78); }
.watch-tl-card.tone-very_bearish::before { background: #2FBF71; }
.watch-tl-card:hover { border-color: var(--hair-2); transform: translateY(-1px); }

/* 头部：日期 + 标签，当日涨跌幅靠右 */
.watch-tl-head { display: flex; align-items: center; flex-wrap: wrap; gap: 8px; }
.watch-tl-date {
  font-size: 14px;
  font-weight: 700;
  letter-spacing: 0.03em;
  color: var(--txt-1);
  font-variant-numeric: tabular-nums;
}
.watch-tl-week { font-size: 11px; letter-spacing: 0.08em; color: var(--txt-3); }
.watch-tl-pct {
  margin-left: auto;
  font-size: 13px;
  font-weight: 700;
  font-variant-numeric: tabular-nums;
  letter-spacing: 0.02em;
}

/* 正文：价位 + 备注 归为一组 */
.watch-tl-content {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin-top: 10px;
}
.watch-tl-note {
  font-size: 12.5px;
  line-height: 1.68;
  letter-spacing: 0.02em;
  color: var(--txt-2);
  white-space: pre-wrap;
  word-break: break-word;
}

/* 底部：验证操作，用细分隔线归组 */
.watch-tl-review {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 6px;
  margin-top: 11px;
  padding-top: 10px;
  border-top: 1px dashed var(--hair);
}
.watch-tl-review-key { font-size: 11px; letter-spacing: 0.1em; color: var(--txt-3); }
.watch-tl-review .watch-verify-btn { height: 26px; padding: 0 11px; }
.watch-tl-clear {
  padding: 0 8px;
  height: 22px;
  border-radius: 7px;
  border: 1px solid var(--hair);
  color: var(--txt-3);
  font-size: 10.5px;
  letter-spacing: 0.04em;
  transition: all 0.16s;
}
.watch-tl-clear:hover { color: #FF8A8E; border-color: rgba(242, 85, 90, 0.4); background: rgba(242, 85, 90, 0.08); }
.watch-tl-suggest { font-size: 10.5px; letter-spacing: 0.04em; color: var(--gold-2); opacity: 0.85; }
.watch-tl-rvnote {
  margin-top: 9px;
  font-size: 12px;
  line-height: 1.6;
  letter-spacing: 0.02em;
  color: var(--txt-3);
  padding-left: 10px;
  border-left: 2px solid rgba(212, 175, 55, 0.3);
}

/* ---------- 盘后总结（内联面板，整块覆盖 watch-main） ---------- */
.watch-summary-inline {
  flex: 0 0 0;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  border-top: 1px solid rgba(212, 175, 55, 0.16);
  background: linear-gradient(180deg, rgba(212, 175, 55, 0.05), rgba(255, 255, 255, 0.012));
}
.watch-summary-inline.is-open {
  position: absolute;
  inset: 0;
  z-index: 6;
  border-radius: inherit;
  border-top: 1px solid rgba(232, 200, 106, 0.3);
  background: linear-gradient(180deg, #1A2130 0%, #12161F 100%);
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.05);
  animation: watchSummaryIn 0.26s ease both;
}
@keyframes watchSummaryIn {
  from { opacity: 0; transform: translateY(16px); }
  to { opacity: 1; transform: translateY(0); }
}
.watch-summary-body {
  display: flex;
  flex-direction: column;
  flex: 1 1 auto;
  min-height: 0;
  overflow: hidden;
}
.watch-summary-foot {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 14px;
  padding: 8px 32px 10px;
  border-top: 1px solid var(--hair);
  flex-shrink: 0;
}

.watch-summary-grid {
  flex: 1;
  min-height: 0;
  display: grid;
  grid-template-columns: 1fr 360px;
  grid-template-rows: minmax(0, 1fr);
}
.watch-summary-left,
.watch-summary-right {
  display: flex;
  flex-direction: column;
  gap: 12px;
  min-height: 0;
  padding: 14px 20px;
  overflow-y: auto;
  overscroll-behavior: contain;
}
.watch-summary-left { border-right: 1px solid rgba(212, 175, 55, 0.14); }
.watch-summary-right { background: radial-gradient(120% 70% at 100% 0%, rgba(86, 112, 196, 0.1), transparent 60%); }

.watch-summary-stats {
  display: grid;
  grid-template-columns: repeat(6, 1fr);
  gap: 8px;
}
.watch-sum-stat {
  display: flex;
  flex-direction: column;
  gap: 5px;
  padding: 12px 12px 11px;
  border-radius: 12px;
  border: 1px solid var(--hair);
  background: rgba(255, 255, 255, 0.045);
}
.watch-sum-num {
  font-size: 19px;
  font-weight: 600;
  letter-spacing: 0.02em;
  font-variant-numeric: tabular-nums;
  color: var(--txt-1);
}
.watch-sum-key { font-size: 10.5px; letter-spacing: 0.08em; color: var(--txt-3); }

.watch-summary-section { display: flex; flex-direction: column; gap: 12px; }
.watch-summary-section.is-grow { flex: 1; min-height: 0; }
.watch-summary-sec-head { display: flex; align-items: center; justify-content: space-between; gap: 10px; }
.watch-summary-sec-sub { font-size: 10.5px; letter-spacing: 0.06em; color: var(--txt-3); }
.watch-summary-sec-count { font-style: normal; font-size: 11px; font-weight: 600; color: var(--gold-2); margin-left: 4px; }
.watch-summary-sec-tools { display: flex; align-items: center; gap: 10px; flex-shrink: 0; }
.watch-btn-ghost.is-mini { height: 28px; padding: 0 10px; gap: 5px; font-size: 11.5px; border-radius: 8px; }

.watch-summary-list { display: flex; flex-direction: column; gap: 9px; }
.watch-summary-row {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 13px 15px;
  border-radius: 13px;
  border: 1px solid var(--hair);
  background: linear-gradient(180deg, rgba(255, 255, 255, 0.05), rgba(255, 255, 255, 0.014));
  transition: border-color 0.2s;
}
.watch-summary-row:hover { border-color: var(--hair-2); }
.watch-summary-row-head { display: flex; align-items: center; flex-wrap: wrap; gap: 7px; }
.watch-summary-name { font-size: 14px; font-weight: 600; letter-spacing: 0.02em; color: #FFFFFF; }
.watch-summary-code { font-size: 11px; color: var(--txt-3); font-variant-numeric: tabular-nums; letter-spacing: 0.04em; }
.watch-summary-note {
  font-size: 12.5px;
  line-height: 1.65;
  letter-spacing: 0.02em;
  color: var(--txt-2);
  white-space: pre-wrap;
  word-break: break-word;
}
.watch-summary-open {
  margin-left: auto;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 26px;
  border-radius: 8px;
  border: 1px solid var(--hair);
  color: var(--txt-3);
  transition: all 0.18s;
}
.watch-summary-open:hover { color: var(--gold-2); border-color: rgba(232, 200, 106, 0.5); background: rgba(212, 175, 55, 0.14); }

.watch-heat { display: grid; grid-template-columns: repeat(14, 1fr); gap: 4px; }
.watch-heat-cell {
  height: 18px;
  border-radius: 4px;
  border: 1px solid transparent;
  background: rgba(255, 255, 255, 0.05);
  transition: transform 0.15s;
}
.watch-heat-cell:hover { transform: scale(1.14); }
.watch-heat-cell.is-empty { background: rgba(255, 255, 255, 0.035); }
.watch-heat-cell.is-rec { background: rgba(255, 255, 255, 0.16); }
.watch-heat-cell.is-hit { background: rgba(212, 175, 55, 0.78); border-color: rgba(232, 200, 106, 0.6); }
.watch-heat-cell.is-mid { background: rgba(212, 175, 55, 0.36); }
.watch-heat-cell.is-miss { background: rgba(47, 191, 113, 0.42); border-color: rgba(47, 191, 113, 0.4); }

/* 情绪命中率分布 */
.watch-sent-acc { display: grid; grid-template-columns: repeat(5, 1fr); gap: 8px; }
.watch-sent-acc-item {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 9px 10px;
  border-radius: 10px;
  border: 1px solid var(--hair);
  background: rgba(255, 255, 255, 0.03);
  transition: border-color 0.18s, background 0.18s;
}
.watch-sent-acc-item:hover { border-color: var(--hair-2); background: rgba(255, 255, 255, 0.055); }
.watch-sent-acc-top { display: flex; align-items: center; gap: 5px; font-size: 11.5px; font-weight: 600; letter-spacing: 0.04em; }
.watch-sent-acc-item.tone-very_bullish .watch-sent-acc-top,
.watch-sent-acc-item.tone-bullish .watch-sent-acc-top { color: #FFA2A5; }
.watch-sent-acc-item.tone-neutral .watch-sent-acc-top { color: var(--txt-2); }
.watch-sent-acc-item.tone-bearish .watch-sent-acc-top,
.watch-sent-acc-item.tone-very_bearish .watch-sent-acc-top { color: #8FE5B4; }
.watch-sent-acc-bar { height: 4px; border-radius: 3px; background: rgba(255, 255, 255, 0.08); overflow: hidden; }
.watch-sent-acc-bar i {
  display: block;
  height: 100%;
  border-radius: 3px;
  background: linear-gradient(90deg, rgba(212, 175, 55, 0.55), rgba(232, 200, 106, 0.95));
  transition: width 0.4s ease;
}
.watch-sent-acc-foot { display: flex; align-items: baseline; justify-content: space-between; gap: 6px; }
.watch-sent-acc-rate { font-size: 13px; font-weight: 700; color: var(--txt-1); }
.watch-sent-acc-cnt { font-size: 10.5px; color: var(--txt-3); }

.watch-textarea.is-summary { flex: 1; min-height: 150px; resize: vertical; font-size: 13px; }
.watch-sum-saved { font-size: 11.5px; letter-spacing: 0.06em; color: var(--gold-2); opacity: 0.85; }

@media (max-width: 1180px) {
  .watch-summary-grid { grid-template-columns: 1fr; overflow-y: auto; }
  .watch-summary-left { border-right: none; overflow-y: visible; }
  .watch-summary-right { overflow-y: visible; }
  .watch-summary-stats { grid-template-columns: repeat(3, 1fr); }
  .watch-sent-acc { grid-template-columns: repeat(3, 1fr); }
}
@media (max-width: 980px) {
  .watch-drawer.is-history { width: 100%; }
  .watch-summary-sec-tools { gap: 6px; }
}

.watch-main::-webkit-scrollbar,
.watch-hist-body::-webkit-scrollbar,
.watch-summary-left::-webkit-scrollbar,
.watch-summary-right::-webkit-scrollbar { width: 5px; }
.watch-main::-webkit-scrollbar-track,
.watch-hist-body::-webkit-scrollbar-track,
.watch-summary-left::-webkit-scrollbar-track,
.watch-summary-right::-webkit-scrollbar-track { background: transparent; }
.watch-main::-webkit-scrollbar-thumb,
.watch-hist-body::-webkit-scrollbar-thumb,
.watch-summary-left::-webkit-scrollbar-thumb,
.watch-summary-right::-webkit-scrollbar-thumb { background: rgba(255, 255, 255, 0.12); border-radius: 3px; }
.watch-main::-webkit-scrollbar-thumb:hover,
.watch-hist-body::-webkit-scrollbar-thumb:hover,
.watch-summary-left::-webkit-scrollbar-thumb:hover,
.watch-summary-right::-webkit-scrollbar-thumb:hover { background: rgba(212, 175, 55, 0.35); }
</style>
