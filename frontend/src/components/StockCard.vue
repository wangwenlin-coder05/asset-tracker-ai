<template>
  <div class="bg-white rounded-lg card-shadow overflow-x-auto" :data-id="stock.id">
    <table class="w-full min-w-[1530px] stock-card-table">
      <colgroup>
        <col style="width:70px"><col style="width:62px"><col style="width:100px"><col style="width:55px"><col style="width:62px">
        <col style="width:150px"><col style="width:66px"><col style="width:72px"><col style="width:80px"><col style="width:65px">
        <col style="width:60px"><col style="width:74px"><col style="width:78px"><col style="width:94px"><col style="width:54px">
        <col style="width:78px"><col style="width:68px"><col style="width:54px"><col style="width:90px"><col style="width:90px">
      </colgroup>
      <thead>
        <tr class="bg-slate-50">
          <th class="p-1.5 text-left text-xs font-medium text-neutral w-[80px]">股票名称</th>
          <th class="p-1.5 text-left text-xs font-medium text-neutral w-[65px]">股票代码</th>
          <th class="p-1.5 text-left text-xs font-medium text-neutral w-[58px]">买入日期</th>
          <th class="p-1.5 text-left text-xs font-medium text-neutral w-[50px] whitespace-nowrap">持仓天数</th>
          <th class="p-1.5 text-left text-xs font-medium text-neutral w-[70px]">首次买入价</th>
          <th class="p-1.5 text-left text-xs font-medium w-[150px] stock-cost-head">持仓成本</th>
          <th class="p-1.5 text-left text-xs font-medium w-[72px] stock-count-head">持仓股数</th>
          <th class="p-1.5 text-left text-xs font-medium text-neutral w-[80px]">卖出仓位</th>
          <th
            class="p-1.5 text-left text-xs font-medium text-neutral w-[80px] group/sellprice relative cursor-pointer select-none"
            :title="realtimePrice?.price ? `点击填入现价 ¥${formatNumber(realtimePrice.price, 3)}` : ''"
            @click="fillCurrentPrice"
          >
            <span class="transition-opacity duration-150 group-hover/sellprice:opacity-0">目标卖出价</span>
            <span
              v-if="realtimePrice && realtimePrice.price && !localStock.isCleared"
              class="absolute inset-0 hidden group-hover/sellprice:flex items-center gap-0.5 px-1.5 text-xs font-medium text-blue-600 transition-all pointer-events-none"
            >
              <Zap class="w-3 h-3" />
              填入现价
            </span>
          </th>
          <th class="p-1.5 text-left text-xs font-medium text-neutral w-[65px]">目标盈利</th>
          <th class="p-1.5 text-left text-xs font-medium text-neutral w-[55px]">卖出股数</th>
          <th class="p-1.5 text-left text-xs font-medium text-neutral w-[70px]">卖出金额</th>
          <th class="p-1.5 text-left text-xs font-medium text-neutral w-[80px]">下次手续费</th>
          <th class="p-1.5 text-left text-xs font-medium text-neutral w-[90px]">净盈利/收益率</th>
          <th class="p-1.5 text-left text-xs font-medium text-neutral w-[60px] whitespace-nowrap">盈亏比</th>
          <th class="p-1.5 text-left text-xs font-medium text-neutral w-[75px] whitespace-nowrap">对应市价</th>
          <th class="p-1.5 text-left text-xs font-medium text-neutral w-[65px] whitespace-nowrap">基准价</th>
          <th class="p-1.5 text-left text-xs font-medium text-neutral w-[55px] whitespace-nowrap">涨幅%</th>
          <th class="p-1.5 text-left text-xs font-medium text-emerald-600 w-[90px] whitespace-nowrap" title="历史换手衰减系数 = 1 ÷ (1 − 前十大流通股东占流通股比例)">✅ 计算公式</th>
          <th class="p-1.5 text-center text-xs font-medium text-neutral w-[75px]">操作</th>
        </tr>
      </thead>
      <tbody>
        <template v-if="stock.isCleared">
          <tr class="stock-summary-row">
            <td class="p-1.5"><input type="text" v-model="localStock.name" @blur="updateStockField('name')" class="w-full border border-slate-200 rounded px-1.5 py-0.5 text-xs focus:input-focus" /></td>
            <td class="p-1.5"><input type="text" v-model="localStock.code" @blur="updateStockField('code')" class="w-full border border-slate-200 rounded px-1.5 py-0.5 text-xs focus:input-focus" /></td>
            <td class="p-1.5"><input type="date" v-model="localStock.buyDate" @change="updateStockField('buyDate')" class="w-full border border-slate-200 rounded px-0.5 py-0.5 text-xs focus:input-focus" /></td>
            <td class="p-1.5 text-sm font-medium whitespace-nowrap">{{ holdingDays }}天</td>
            <td class="p-1.5 text-sm">{{ localStock.buyRecords && localStock.buyRecords.length > 0 ? formatNumber(localStock.buyRecords[0].buyPrice, 3) : '-' }}</td>
            <td class="p-1.5 stock-cost-cell">
              <template v-if="localStock.buyRecords && localStock.buyRecords.length > 0">
                <div class="cost-board">
                  <div class="cost-board__row">
                    <span class="cost-board__cost">{{ formatNumber(calcRes.avgCost, 3) }}</span>
                    <span v-if="realtimePrice" class="cost-board__current" :class="realtimePrice.change >= 0 ? 'up' : 'down'">
                      ¥{{ formatNumber(realtimePrice.price, 2) }}
                    </span>
                    <span v-if="realtimePrice" class="cost-board__pct" :class="realtimePrice.change >= 0 ? 'up' : 'down'">
                      {{ realtimePrice.change >= 0 ? '+' : '' }}{{ realtimePrice.changePercent }}%
                    </span>
                  </div>
                </div>
              </template>
              <template v-else><input type="number" step="0.001" v-model.number="localStock.cost" @blur="updateStockField('cost')" class="w-full border border-amber-300 rounded px-1.5 py-0.5 text-xs text-amber-700 font-medium focus:border-amber-400 focus:ring-1 focus:ring-amber-300 focus:outline-none" /></template>
            </td>
            <td class="p-1.5 stock-count-cell"><span class="stock-count-value is-zero">0</span></td>
            <td class="p-1.5 text-sm">{{ {full:'全仓',half:'半仓',third:'1/3仓',quarter:'1/4仓'}[localStock.position] || localStock.position }}</td>
            <td class="p-1.5 text-sm">{{ formatNumber(localStock.sellPrice, 3) }}</td>
            <td class="p-1.5 text-sm">{{ formatNumber(localStock.targetProfit) }}</td>
            <td class="p-1.5 text-sm font-medium">{{ totalSellCount }}股</td>
            <td class="p-1.5 text-sm font-medium">¥{{ formatNumber(totalSellAmount) }}</td>
            <td class="p-1.5 text-sm">¥{{ formatNumber(totalSellFee) }}</td>
            <td class="p-1.5 text-sm font-medium" :class="profitColorClass(displayProfit)">
              ¥{{ formatNumber(displayProfit) }} ({{ totalBuyAmount > 0 ? ((displayProfit / totalBuyAmount) * 100).toFixed(2) : '0.00' }}%)
            </td>
            <td class="p-1.5 text-sm">{{ localStock.profitLossRatio != null ? localStock.profitLossRatio + '%' : '' }}</td>
            <td class="p-1.5 text-sm">{{ ratioPrice != null ? formatNumber(ratioPrice, 3) : '' }}</td>
            <td class="p-1.5 text-sm">{{ localStock.basePrice != null ? formatNumber(localStock.basePrice, 3) : '' }}</td>
            <td class="p-1.5 text-sm">{{ localStock.priceChangePercent != null ? localStock.priceChangePercent + '%' : '' }}</td>
            <td class="p-1.5 text-sm font-medium text-emerald-600" :title="decayCoeffTooltip">{{ decayCoefficient != null ? formatNumber(decayCoefficient, 2) : '' }}</td>
            <td class="p-1.5 text-center">
              <div class="flex justify-center gap-1">
                <button @click="toggleTransactions" class="text-neutral hover:text-slate-600 transition-all" title="展开/收起交易"><component :is="expanded ? ChevronDown : ChevronRight" class="w-4 h-4" /></button>
                <button @click="$emit('buy', stock.id)" class="text-neutral hover:text-primary transition-all" title="重新买入"><PlusCircle class="w-4 h-4" /></button>
                <button @click="$emit('delete', stock.id)" class="text-neutral hover:text-loss transition-all" title="删除"><Trash2 class="w-4 h-4" /></button>
              </div>
            </td>
          </tr>
        </template>
        <template v-else>
          <tr class="stock-summary-row">
          <td class="p-1.5">
            <input type="text" v-model="localStock.name" @blur="updateStockField('name')" class="w-full border border-slate-200 rounded px-1.5 py-0.5 text-xs focus:input-focus" />
          </td>
          <td class="p-1.5">
            <input type="text" v-model="localStock.code" @blur="updateStockField('code')" class="w-full border border-slate-200 rounded px-1.5 py-0.5 text-xs focus:input-focus" />
          </td>
          <td class="p-1.5">
            <input type="date" v-model="localStock.buyDate" @change="updateStockField('buyDate')" class="w-full border border-slate-200 rounded px-0.5 py-0.5 text-xs focus:input-focus" />
          </td>
          <td class="p-1.5 text-sm font-medium whitespace-nowrap">{{ holdingDays }}天</td>
          <td class="p-1.5 text-sm">{{ localStock.buyRecords && localStock.buyRecords.length > 0 ? formatNumber(localStock.buyRecords[0].buyPrice, 3) : '-' }}</td>
          <td class="p-1.5 stock-cost-cell">
            <template v-if="localStock.buyRecords && localStock.buyRecords.length > 0">
              <div class="cost-board" :class="floatingProfit >= 0 ? 'is-profit' : 'is-loss'">
                <div class="cost-board__row">
                  <span class="cost-board__cost">{{ formatNumber(calcRes.avgCost, 3) }}</span>
                  <span v-if="realtimePrice" class="cost-board__current" :class="realtimePrice.change >= 0 ? 'up' : 'down'">
                    ¥{{ formatNumber(realtimePrice.price, 2) }}
                  </span>
                  <span v-if="realtimePrice" class="cost-board__pct" :class="realtimePrice.change >= 0 ? 'up' : 'down'">
                    {{ realtimePrice.change >= 0 ? '+' : '' }}{{ realtimePrice.changePercent }}%
                  </span>
                </div>
                <div v-if="realtimePrice && calcRes.tradeCount > 0" class="cost-board__row cost-board__hero">
                  <span class="cost-board__label">浮{{ floatingProfit >= 0 ? '盈' : '亏' }}</span>
                  <span class="cost-board__profit" :class="floatingProfit >= 0 ? 'up' : 'down'">
                    {{ floatingProfit >= 0 ? '+' : '' }}¥{{ formatNumber(Math.abs(floatingProfit)) }}
                  </span>
                  <span class="cost-board__pct" :class="floatingProfit >= 0 ? 'up' : 'down'">
                    {{ floatingProfitRate >= 0 ? '+' : '' }}{{ floatingProfitRate.toFixed(2) }}%
                  </span>
                </div>
              </div>
            </template>
            <template v-else>
              <input type="number" step="0.001" v-model.number="localStock.cost" @blur="updateStockField('cost')" class="w-full border border-amber-300 rounded px-1.5 py-0.5 text-xs text-amber-700 font-medium focus:border-amber-400 focus:ring-1 focus:ring-amber-300 focus:outline-none" />
            </template>
          </td>
          <td class="p-1.5 stock-count-cell">
            <input type="number" step="1" v-model.number="localStock.count" @blur="updateStockField('count')" class="stock-count-input w-full rounded px-1.5 py-0.5 text-xs font-medium focus:input-focus" />
          </td>
          <td class="p-1.5">
            <select v-model="localStock.position" @change="updateStockField('position')" class="w-full border border-slate-200 rounded px-1.5 py-0.5 text-xs focus:input-focus bg-white whitespace-nowrap">
              <option value="full">全仓</option>
              <option value="half">半仓</option>
              <option value="third">1/3仓</option>
              <option value="quarter">1/4仓</option>
            </select>
          </td>
          <td class="p-1.5">
            <input type="number" step="0.001" v-model.number="localStock.sellPrice" @blur="updateStockField('sellPrice')" class="w-full border border-slate-200 rounded px-1.5 py-0.5 text-xs focus:input-focus" />
          </td>
          <td class="p-1.5">
            <input type="number" step="0.01" v-model.number="localStock.targetProfit" @blur="updateStockField('targetProfit')" class="w-full border border-slate-200 rounded px-1.5 py-0.5 text-xs focus:input-focus" />
          </td>
          <td class="p-1.5 text-sm font-medium">{{ calcRes.tradeCount }}股</td>
          <td class="p-1.5 text-sm font-medium">¥{{ formatNumber(calcRes.sellTotal) }}</td>
          <td class="p-1.5 text-sm">
            <span :title="`卖出佣金¥${formatNumber(calcRes.sellCommission)} 过户费¥${formatNumber(calcRes.transferFee)} 印花税¥${formatNumber(calcRes.stampTax)}`" class="cursor-help border-b border-dashed border-neutral/30 hover:border-neutral">¥{{ formatNumber(calcRes.nextTotalFee) }}</span>
          </td>
          <td class="p-1.5 text-sm font-medium" :class="profitColorClass(displayProfit)">
            ¥{{ formatNumber(displayProfit) }} ({{ totalBuyAmount > 0 ? ((displayProfit / totalBuyAmount) * 100).toFixed(2) : '0.00' }}%)
          </td>
          <td class="p-1.5">
            <input type="number" step="0.01" v-model.number="localStock.profitLossRatio" @blur="updateStockField('profitLossRatio')" class="w-full border border-slate-200 rounded px-1.5 py-0.5 text-xs focus:input-focus" placeholder="%" />
          </td>
          <td class="p-1.5">
            <div class="flex gap-1 items-center">
              <input type="number" step="0.001" :value="ratioPrice != null ? ratioPrice.toFixed(3) : ''" @change="applyRatioPrice" class="w-full border border-slate-200 rounded px-1.5 py-0.5 text-xs focus:input-focus" placeholder="市价" />
              <button @click="applyRatioPrice" class="text-neutral hover:text-primary transition-all whitespace-nowrap text-xs" title="写入目标卖出价"><ArrowRight class="w-3 h-3" /></button>
            </div>
          </td>
          <td class="p-1.5">
            <input type="number" step="0.001" v-model.number="localStock.basePrice" @blur="updateStockField('basePrice')" class="w-full border border-slate-200 rounded px-1.5 py-0.5 text-xs focus:input-focus" placeholder="基准价" />
          </td>
          <td class="p-1.5">
            <input type="number" step="0.01" v-model.number="localStock.priceChangePercent" @blur="updateStockField('priceChangePercent')" class="w-full border border-slate-200 rounded px-1.5 py-0.5 text-xs focus:input-focus" placeholder="%" />
          </td>
          <td class="p-1.5">
            <div v-if="!editingFormula"
                 class="w-full rounded px-1.5 py-0.5 text-xs cursor-pointer transition-colors select-none"
                 :class="decayCoefficient != null
                   ? 'text-emerald-600 font-medium hover:bg-emerald-50'
                   : 'text-slate-300 hover:bg-slate-50 hover:text-slate-400'"
                 :title="decayCoeffTooltip"
                 @click="startEditFormula">
              {{ decayCoefficient != null ? formatNumber(decayCoefficient, 2) : '点击输入占比' }}
            </div>
            <input v-else
                   ref="formulaInput"
                   type="number" step="0.01" min="0" max="100"
                   v-model.number="localStock.topTenFloatRatio"
                   @blur="saveFormula"
                   @keydown.enter.exact.prevent="saveFormula"
                   class="w-full border border-emerald-300 rounded px-1.5 py-0.5 text-xs text-emerald-700 font-medium focus:border-emerald-400 focus:ring-1 focus:ring-emerald-300 focus:outline-none"
                   placeholder="占比%" />
          </td>
          <td class="p-1.5 text-center">
            <div class="flex justify-center gap-1">
              <button @click="toggleTransactions" class="text-neutral hover:text-slate-600 transition-all" title="展开/收起交易"><component :is="expanded ? ChevronDown : ChevronRight" class="w-4 h-4" /></button>
              <button @click="$emit('buy', stock.id)" class="text-neutral hover:text-primary transition-all" title="加仓"><PlusCircle class="w-4 h-4" /></button>
              <button @click="$emit('sell', stock.id)" class="text-neutral hover:text-primary transition-all" title="记录卖出"><BookOpen class="w-4 h-4" /></button>
              <button @click="$emit('clear', stock.id, stock.sellPrice, calcRes.tradeCount, calcRes.avgCost)" class="text-neutral hover:text-primary transition-all" title="清仓"><LogOut class="w-4 h-4" /></button>
              <button @click="$emit('delete', stock.id)" class="text-neutral hover:text-loss transition-all" title="删除"><Trash2 class="w-4 h-4" /></button>
            </div>
          </td>
        </tr>
        </template>
          <tr v-if="rebuyRecommendation" class="stock-rebuy-row">
            <td colspan="20" class="px-3 py-2">
              <div class="stock-rebuy-guide">
                <Target class="w-4 h-4 flex-shrink-0" />
                <span class="stock-rebuy-label">下次建议承接价</span>
                <strong>¥{{ formatNumber(rebuyRecommendation.price, 3) }}</strong>
                <span class="stock-rebuy-shares-wrap"><span>按</span><input v-model.number="rebuySharesInput" class="stock-rebuy-shares" type="number" min="1" step="100" :placeholder="String(rebuyRecommendation.defaultShares)" /><span>股</span></span>
                <span class="stock-rebuy-separator"></span>
                <span>预计买入费 ¥{{ formatNumber(rebuyRecommendation.fee) }}</span>
                <span>承接后有效成本 ¥{{ formatNumber(rebuyRecommendation.effectiveCost, 3) }}</span>
                <span>清仓后基准 ¥{{ formatNumber(rebuyRecommendation.postClearCost, 3) }}</span>
                <span class="stock-rebuy-result" :class="profitColorClass(rebuyRecommendation.realizedPnl)">本轮{{ rebuyRecommendation.realizedPnl >= 0 ? '盈利' : '亏损' }} ¥{{ formatNumber(Math.abs(rebuyRecommendation.realizedPnl)) }}继续计入成本</span>
              </div>
            </td>
          </tr>

        <!-- 交易明细 -->
        <tr v-if="expanded && allTransactions.length > 0">
          <td colspan="20" class="p-0 pt-2">
            <div class="mx-4 mb-2 border border-stone-200 rounded-lg overflow-hidden">
              <table class="w-full text-xs">
                <colgroup>
                  <col style="width:7%"><col style="width:10%"><col style="width:9%"><col style="width:7%"><col style="width:9%">
                  <col style="width:9%"><col style="width:9%"><col style="width:9%"><col style="width:15%"><col style="width:12%"><col style="width:4%">
                </colgroup>
                <thead>
                  <tr class="text-stone-400 bg-stone-100/40">
                    <th class="py-1.5 px-1 text-left font-medium whitespace-nowrap">类型</th>
                    <th class="py-1.5 px-1 text-left font-medium whitespace-nowrap">日期</th>
                    <th class="py-1.5 px-1 text-left font-medium whitespace-nowrap">价格</th>
                    <th class="py-1.5 px-1 text-left font-medium whitespace-nowrap">股数</th>
                    <th class="py-1.5 px-1 text-left font-medium whitespace-nowrap">金额</th>
                    <th class="py-1.5 px-1 text-left font-medium whitespace-nowrap">佣金</th>
                    <th class="py-1.5 px-1 text-left font-medium whitespace-nowrap">过户费</th>
                    <th class="py-1.5 px-1 text-left font-medium whitespace-nowrap">印花税</th>
                    <th class="py-1.5 px-1 text-left font-medium whitespace-nowrap">净盈利</th>
                    <th class="py-1.5 px-1 text-left font-medium whitespace-nowrap">成本变化</th>
                    <th class="py-1.5 px-1 text-left font-medium whitespace-nowrap">操作</th>
                  </tr>
                </thead>
                <tbody class="text-slate-600">
                  <template v-for="(groupItem, gIndex) in transactionGroups" :key="gIndex">

                    <!-- ====== 独立行：建仓 / 补仓 / 止盈 / 止损 ====== -->
                    <tr v-if="groupItem.type === 'row'" class="border-b border-stone-100">
                      <td class="py-1.5 px-1 whitespace-nowrap">
                        <select
                            class="text-xs rounded px-1 py-px focus:ring-1 focus:ring-amber-300 outline-none"
                            :class="txSelectClass(groupItem.tx)"
                            :value="groupItem.tx.tType || ''"
                            @change="changeTxType(groupItem.tx, $event.target.value)"
                          >
                            <template v-if="groupItem.tx.type === 'buy'">
                              <option value="">建仓/买入</option>
                              <option value="补仓">补仓</option>
                              <option value="正T">正T</option>
                              <option value="反T承接">反T承接</option>
                            </template>
                            <template v-else>
                              <option value="">清仓</option>
                              <option value="止盈">止盈</option>
                              <option value="止损">止损</option>
                              <option value="正T卖出">正T卖出</option>
                              <option value="反T">反T</option>
                            </template>
                          </select>
                      </td>
                      <td class="py-1.5 px-1">
                        <input type="date" :value="groupItem.tx.buyDate || groupItem.tx.sellDate" @change="updateTransaction(groupItem.tx, 'date', $event.target.value)" class="w-full border border-stone-200 rounded px-1 py-0.5 text-xs focus:input-focus" />
                      </td>
                      <td class="py-1.5 px-1">
                        <input type="number" step="0.001" :value="groupItem.tx.type === 'buy' ? groupItem.tx.buyPrice : groupItem.tx.sellPrice" @change="updateTransaction(groupItem.tx, 'price', parseFloat($event.target.value))" class="w-full border border-stone-200 rounded px-1 py-0.5 text-xs focus:input-focus" />
                      </td>
                      <td class="py-1.5 px-1">
                        <input type="number" step="1" :value="groupItem.tx.type === 'buy' ? groupItem.tx.buyCount : groupItem.tx.sellCount" @change="updateTransaction(groupItem.tx, 'count', parseInt($event.target.value))" class="w-full border border-stone-200 rounded px-1 py-0.5 text-xs focus:input-focus" />
                      </td>
                      <td class="py-1.5 px-1 whitespace-nowrap">¥{{ formatNumber((groupItem.tx.type === 'buy' ? groupItem.tx.buyPrice : groupItem.tx.sellPrice) * (groupItem.tx.type === 'buy' ? groupItem.tx.buyCount : groupItem.tx.sellCount)) }}</td>
                      <td class="py-1.5 px-1">
                        <input type="number" step="0.01" :value="groupItem.tx.type === 'buy' ? groupItem.tx.commission : groupItem.tx.sellCommission" @change="updateTransaction(groupItem.tx, 'commission', parseFloat($event.target.value))" class="w-full border border-stone-200 rounded px-1 py-0.5 text-xs focus:input-focus" />
                      </td>
                      <td class="py-1.5 px-1">
                        <input type="number" step="0.01" :value="groupItem.tx.type === 'buy' ? groupItem.tx.transferFee : groupItem.tx.sellTransferFee" @change="updateTransaction(groupItem.tx, 'transferFee', parseFloat($event.target.value))" class="w-full border border-stone-200 rounded px-1 py-0.5 text-xs focus:input-focus" />
                      </td>
                      <td class="py-1.5 px-1">
                        <input v-if="groupItem.tx.type === 'sell'" type="number" step="0.01" :value="groupItem.tx.stampTax" @change="updateTransaction(groupItem.tx, 'stampTax', parseFloat($event.target.value))" class="w-full border border-stone-200 rounded px-1 py-0.5 text-xs focus:input-focus" />
                        <span v-else>-</span>
                      </td>
                      <td class="py-1.5 px-1 whitespace-nowrap font-medium" :class="groupItem.tx.type === 'sell' ? profitColorClass(groupItem.profitDisplay) : ''">
                        <template v-if="groupItem.tx.type === 'sell'">¥{{ formatNumber(groupItem.profitDisplay) }}</template>
                        <template v-else>-</template>
                      </td>
                      <td class="py-1.5 px-1 whitespace-nowrap">
                        <template v-if="groupItem.costChangeDisplay">
                          <span :class="groupItem.costImpact >= 0 ? 'text-profit' : 'text-loss'">{{ formatNumber(groupItem.oldCost, 3) }}{{ groupItem.costImpact >= 0 ? '+' : '' }}{{ formatNumber(groupItem.costImpact, 3) }} => {{ formatNumber(groupItem.newCost, 3) }}</span>
                        </template>
                        <template v-else>-</template>
                      </td>
                      <td class="py-1.5 px-1 text-center">
                        <button @click="$emit('delete-transaction', stock.id, groupItem.tx.type, groupItem.tx.id)" class="text-slate-400 hover:text-loss transition-all px-1" title="删除记录"><Trash2 class="w-3 h-3" /></button>
                      </td>
                    </tr>

                    <!-- ====== T组：气泡包裹 ====== -->
                    <template v-if="groupItem.type === 'group'">
                      <tr>
                        <td colspan="11" class="p-0">
                          <div class="mx-2 my-1 rounded-lg border border-amber-300/30 bg-amber-50/15 overflow-hidden">
                            <table class="w-full text-xs">
                              <colgroup>
                                <col style="width:7%"><col style="width:10%"><col style="width:9%"><col style="width:7%"><col style="width:9%">
                                <col style="width:9%"><col style="width:9%"><col style="width:9%"><col style="width:15%"><col style="width:12%"><col style="width:4%">
                              </colgroup>
                              <!-- 组头部 -->
                              <tr class="bg-amber-100/40">
                                <td colspan="11" class="py-1 px-3 text-xs font-medium text-amber-700">
                                  {{ groupItem.tType }}组 {{ groupItem.isCompleted ? '已完成' : '待承接' }}
                                  <template v-if="groupItem.isCompleted">
                                    <span class="mx-1">|</span>
                                    盈利 <span :class="profitColorClass(groupItem.groupNetProfit)">¥{{ formatNumber(groupItem.groupNetProfit) }}</span>
                                    <span class="mx-1">|</span>
                                    成本 {{ formatNumber(groupItem.groupOldCost, 3) }}{{ groupItem.groupCostChange >= 0 ? '+' : '' }}{{ formatNumber(groupItem.groupCostChange, 3) }} => {{ formatNumber(groupItem.groupNewCost, 3) }}
                                  </template>
                                </td>
                              </tr>
                              <!-- 组内交易行 -->
                              <tr v-for="(row, rIdx) in groupItem.rows" :key="rIdx" class="border-b border-amber-100/30 last:border-b-0">
                                <td class="py-1.5 px-1 pl-6 whitespace-nowrap">
                                  <select
                                      class="text-xs rounded px-1 py-px focus:ring-1 focus:ring-amber-300 outline-none"
                                      :class="txSelectClass(row.tx)"
                                      :value="row.tx.tType || ''"
                                      @change="changeTxType(row.tx, $event.target.value)"
                                    >
                                      <template v-if="row.tx.type === 'buy'">
                                        <option value="">建仓/买入</option>
                                        <option value="补仓">补仓</option>
                                        <option value="正T">正T</option>
                                        <option value="反T承接">反T承接</option>
                                      </template>
                                      <template v-else>
                                        <option value="">清仓</option>
                                        <option value="止盈">止盈</option>
                                        <option value="止损">止损</option>
                                        <option value="正T卖出">正T卖出</option>
                                        <option value="反T">反T</option>
                                      </template>
                                    </select>
                                </td>
                                <td class="py-1.5 px-1">
                                  <input type="date" :value="row.tx.buyDate || row.tx.sellDate" @change="updateTransaction(row.tx, 'date', $event.target.value)" class="w-full border border-stone-100 rounded px-1 py-0.5 text-xs focus:input-focus" />
                                </td>
                                <td class="py-1.5 px-1">
                                  <input type="number" step="0.001" :value="row.tx.type === 'buy' ? row.tx.buyPrice : row.tx.sellPrice" @change="updateTransaction(row.tx, 'price', parseFloat($event.target.value))" class="w-full border border-stone-100 rounded px-1 py-0.5 text-xs focus:input-focus" />
                                </td>
                                <td class="py-1.5 px-1">
                                  <input type="number" step="1" :value="row.tx.type === 'buy' ? row.tx.buyCount : row.tx.sellCount" @change="updateTransaction(row.tx, 'count', parseInt($event.target.value))" class="w-full border border-stone-100 rounded px-1 py-0.5 text-xs focus:input-focus" />
                                </td>
                                <td class="py-1.5 px-1 whitespace-nowrap">¥{{ formatNumber((row.tx.type === 'buy' ? row.tx.buyPrice : row.tx.sellPrice) * (row.tx.type === 'buy' ? row.tx.buyCount : row.tx.sellCount)) }}</td>
                                <td class="py-1.5 px-1">
                                  <input type="number" step="0.01" :value="row.tx.type === 'buy' ? row.tx.commission : row.tx.sellCommission" @change="updateTransaction(row.tx, 'commission', parseFloat($event.target.value))" class="w-full border border-stone-100 rounded px-1 py-0.5 text-xs focus:input-focus" />
                                </td>
                                <td class="py-1.5 px-1">
                                  <input type="number" step="0.01" :value="row.tx.type === 'buy' ? row.tx.transferFee : row.tx.sellTransferFee" @change="updateTransaction(row.tx, 'transferFee', parseFloat($event.target.value))" class="w-full border border-stone-100 rounded px-1 py-0.5 text-xs focus:input-focus" />
                                </td>
                                <td class="py-1.5 px-1">
                                  <input v-if="row.tx.type === 'sell'" type="number" step="0.01" :value="row.tx.stampTax" @change="updateTransaction(row.tx, 'stampTax', parseFloat($event.target.value))" class="w-full border border-stone-100 rounded px-1 py-0.5 text-xs focus:input-focus" />
                                  <span v-else>-</span>
                                </td>
                                <td class="py-1.5 px-1 whitespace-nowrap font-medium">
                                  <template v-if="row.tx.type === 'sell'">¥{{ formatNumber(row.profitDisplay) }}</template>
                                  <template v-else>-</template>
                                </td>
                                <td class="py-1.5 px-1 whitespace-nowrap">
                                  <template v-if="row.costChangeDisplay">
                                    <span :class="row.costImpact >= 0 ? 'text-profit' : 'text-loss'">{{ formatNumber(row.oldCost, 3) }}{{ row.costImpact >= 0 ? '+' : '' }}{{ formatNumber(row.costImpact, 3) }} => {{ formatNumber(row.newCost, 3) }}</span>
                                  </template>
                                  <template v-else>-</template>
                                </td>
                                <td class="py-1.5 px-1 text-center">
                                  <button @click="$emit('delete-transaction', stock.id, row.tx.type, row.tx.id)" class="text-slate-400 hover:text-loss transition-all px-1" title="删除记录"><Trash2 class="w-3 h-3" /></button>
                                </td>
                              </tr>
                              <!-- 待承接：保本价 + 预览 + 录入 -->
                              <tr v-if="!groupItem.isCompleted" class="border-t border-amber-100/50">
                                <td colspan="11" class="py-1.5 px-3 text-xs">
                                  <div class="flex items-center gap-2 justify-center">
                                    <span class="text-stone-400">保本{{ groupItem.tType === '正T' ? '卖' : '买' }}价 ¥{{ formatNumber(groupItem.breakEvenPrice, 3) }}</span>
                                    <span class="text-stone-300">|</span>
                                    <span class="text-stone-400">预览{{ groupItem.tType === '正T' ? '卖' : '买' }}价</span>
                                    <input type="number" step="0.001" v-model="previewPrices[groupItem.previewKey]" class="w-20 border border-stone-200 rounded px-1 py-0.5 text-xs focus:input-focus" placeholder="输入价位" />
                                    <span v-if="previewPrices[groupItem.previewKey]" class="font-medium" :class="profitColorClass(previewProfit(groupItem))">¥{{ formatNumber(previewProfit(groupItem)) }}</span>
                                    <button v-if="previewPrices[groupItem.previewKey]" @click="emit('quick-record', props.stock.id, groupItem, parseFloat(previewPrices[groupItem.previewKey]))" class="px-2 py-0.5 bg-amber-100 text-amber-700 rounded text-xs font-medium hover:bg-amber-200 transition-all">录入</button>
                                  </div>
                                </td>
                              </tr>
                            </table>
                          </div>
                        </td>
                      </tr>
                    </template>

                  </template>

                  <!-- 总计行：4 块大数字，一眼看懂赚/亏 -->
                  <tr class="bg-stone-100/60 border-t-2 border-stone-300">
                    <td colspan="12" class="py-2 px-3">
                      <div class="flex items-center gap-4 flex-wrap text-sm">
                        <!-- 左侧：交易数量 -->
                        <div class="flex items-center gap-1.5 text-stone-500 shrink-0">
                          <History class="w-3.5 h-3.5" />
                          <span class="font-semibold text-stone-700">总计</span>
                          <span class="text-xs">({{ allTransactions.length }}笔)</span>
                        </div>

                        <!-- 分隔 -->
                        <div class="h-5 w-px bg-stone-300"></div>

                        <!-- 投入 -->
                        <div class="flex items-center gap-1.5 shrink-0 cursor-help border border-transparent hover:border-stone-300 hover:bg-stone-50 rounded px-1.5 py-0.5 transition-all" :title="investTooltip">
                          <span class="text-xs text-stone-500">💵投入</span>
                          <span class="font-mono font-semibold text-stone-800">¥{{ formatNumber(investTotal) }}</span>
                        </div>

                        <!-- 收回 -->
                        <div class="flex items-center gap-1.5 shrink-0 cursor-help border border-transparent hover:border-stone-300 hover:bg-stone-50 rounded px-1.5 py-0.5 transition-all" :title="recoverTooltip">
                          <span class="text-xs text-stone-500">📥收回</span>
                          <span class="font-mono font-semibold text-stone-800">¥{{ formatNumber(recoverTotal) }}</span>
                        </div>

                        <!-- 分隔 -->
                        <div class="h-5 w-px bg-stone-300"></div>

                        <!-- 已实现盈亏（核心） -->
                        <div class="flex items-center gap-1.5 shrink-0 cursor-help border border-transparent hover:border-stone-300 hover:bg-stone-50 rounded px-1.5 py-0.5 transition-all" :title="profitTooltip">
                          <span class="text-xs text-stone-500">🎯已实现</span>
                          <span class="font-mono font-bold text-base" :class="profitColorClass(finalProfit)">¥{{ formatNumber(finalProfit) }}</span>
                        </div>

                        <!-- 收益率 -->
                        <div class="flex items-center gap-1 shrink-0 cursor-help border border-transparent hover:border-stone-300 hover:bg-stone-50 rounded px-1.5 py-0.5 transition-all" :title="rateTooltip">
                          <span class="text-xs font-semibold" :class="profitColorClass(finalProfit)">{{ finalRateLabel }}</span>
                        </div>

                        <!-- 弹性填充 -->
                        <div class="flex-1"></div>

                        <!-- 总手续费 -->
                        <div class="flex items-center gap-1 shrink-0 text-xs text-stone-500">
                          💸总手续费 <span class="font-mono font-medium text-stone-700">¥{{ formatNumber(totalFee) }}</span>
                        </div>
                      </div>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </td>
        </tr>

        <!-- 备注行 -->
        <tr v-if="expanded">
          <td colspan="20" class="p-0">
            <div class="mx-4 mb-2">
              <div class="flex items-start gap-2">
                <template v-if="!editingNotes">
                  <div v-if="localStock.notes" class="flex-1 text-xs text-slate-500 bg-stone-50 rounded px-2 py-1 cursor-pointer hover:bg-stone-100" @dblclick="startEditNotes">{{ localStock.notes }}</div>
                  <div v-else class="flex-1 text-xs text-stone-400 italic cursor-pointer hover:text-stone-500 px-2 py-1" @dblclick="startEditNotes">添加备注</div>
                </template>
                <textarea v-else ref="notesTextarea" v-model="localStock.notes" @blur="saveNotes" @keydown.enter.exact="saveNotes" class="flex-1 border border-stone-200 rounded px-2 py-1 text-xs focus:input-focus resize-none" rows="2"></textarea>
              </div>
            </div>
          </td>
        </tr>
      </tbody>
    </table>
  </div>
</template>

<script setup>
import { ref, computed, watch, nextTick } from 'vue'
import { ChevronRight, ChevronDown, PlusCircle, BookOpen, LogOut, Trash2, ArrowRight, History, Target, Zap } from 'lucide-vue-next'
import { calcStock, calcRatioPrice } from '../utils/calculator'
import { fmtNum, calculateHoldingDays, calculateHoldingDaysByRange } from '../utils/formatter'

const props = defineProps({
  stock: { type: Object, required: true },
  realtimePrice: { type: Object, default: null }
})

const emit = defineEmits(['buy', 'sell', 'clear', 'delete', 'delete-transaction', 'update', 'update-transaction', 'quick-record', 'change-tx-type'])

const localStock = ref({ ...props.stock })
const expanded = ref(false)
const editingNotes = ref(false)
const notesTextarea = ref(null)
const previewPrices = ref({})
const rebuySharesInput = ref(null)
const activeInput = ref(null)
const editingFormula = ref(false)
const formulaInput = ref(null)

watch(() => props.stock, (newStock) => {
  activeInput.value = null
  localStock.value = { ...newStock }
  rebuySharesInput.value = null
}, { deep: true })

// 目标卖出价 → 目标盈利 = calcRes.targetNetProfit，同时更新涨幅%
watch(() => localStock.value.sellPrice, (newVal) => {
  if (activeInput.value === 'targetProfit' || activeInput.value === 'priceChangePercent') return
  const tc = calcRes.value.tradeCount
  const avgCost = calcRes.value.avgCost
  if (newVal == null || newVal <= 0 || tc <= 0 || avgCost <= 0) return
  activeInput.value = 'sellPrice'
  localStock.value.targetProfit = calcRes.value.targetNetProfit
  const basePrice = localStock.value.basePrice
  if (basePrice && basePrice > 0) {
    localStock.value.priceChangePercent = parseFloat(((newVal / basePrice - 1) * 100).toFixed(2))
  }
})

// 目标盈利 → 目标卖出价，同时更新涨幅%
watch(() => localStock.value.targetProfit, (newVal) => {
  if (activeInput.value === 'sellPrice' || activeInput.value === 'basePrice' || activeInput.value === 'priceChangePercent') return
  const tc = calcRes.value.tradeCount
  const avgCost = calcRes.value.avgCost
  if (newVal == null || tc <= 0 || avgCost <= 0) return
  activeInput.value = 'targetProfit'
  let lo = 0.001, hi = Math.max(avgCost * 5, 0.01)
  for (let i = 0; i < 50; i++) {
    const mid = (lo + hi) / 2
    const sellTotal = mid * tc
    const commission = Math.max(sellTotal * 0.00023, 5)
    const stampTax = sellTotal * 0.001
    const transferFee = sellTotal * 0.00001
    const profit = sellTotal - avgCost * tc - commission - stampTax - transferFee
    if (profit > newVal) hi = mid
    else lo = mid
  }
  localStock.value.sellPrice = parseFloat(((lo + hi) / 2).toFixed(3))
  const basePrice = localStock.value.basePrice
  if (basePrice && basePrice > 0) {
    localStock.value.priceChangePercent = parseFloat(((localStock.value.sellPrice / basePrice - 1) * 100).toFixed(2))
  }
})

// 基准价 → 涨幅%
watch(() => localStock.value.basePrice, (newVal) => {
  if (activeInput.value === 'priceChangePercent' || activeInput.value === 'sellPrice' || activeInput.value === 'targetProfit') return
  const sellPrice = localStock.value.sellPrice
  if (!newVal || newVal <= 0 || !sellPrice || sellPrice <= 0) return
  activeInput.value = 'basePrice'
  localStock.value.priceChangePercent = parseFloat(((sellPrice / newVal - 1) * 100).toFixed(2))
})

// 涨幅% → 目标卖出价
watch(() => localStock.value.priceChangePercent, (newVal) => {
  if (activeInput.value === 'basePrice' || activeInput.value === 'sellPrice' || activeInput.value === 'targetProfit') return
  const basePrice = localStock.value.basePrice
  if (!basePrice || basePrice <= 0 || newVal == null) return
  activeInput.value = 'priceChangePercent'
  localStock.value.sellPrice = parseFloat((basePrice * (1 + newVal / 100)).toFixed(3))
})

const calcRes = computed(() => calcStock(localStock.value))

// 历史换手衰减系数 = 1 ÷ (1 − 前十大流通股东占流通股比例)
// localStock.topTenFloatRatio 存储百分比数值（如 64.56 表示 64.56%）
const decayCoefficient = computed(() => {
  const ratio = localStock.value.topTenFloatRatio
  if (ratio == null || ratio === '' || isNaN(ratio)) return null
  const r = parseFloat(ratio)
  if (r <= 0 || r >= 100) return null
  const denom = 1 - r / 100
  if (denom === 0) return null
  return 1 / denom
})

const decayCoeffTooltip = computed(() => {
  const ratio = localStock.value.topTenFloatRatio
  const baseTip = '历史换手衰减系数 = 1 ÷ (1 − 前十大流通股东占流通股比例)\n点击输入占比（如 64.56），失焦或回车后显示系数'
  if (ratio == null || ratio === '' || isNaN(ratio)) return baseTip
  const r = parseFloat(ratio)
  if (r <= 0 || r >= 100) return `占比 ${r}% 无效，应在 0–100 之间`
  const denom = 1 - r / 100
  return `占比 ${r}% → 系数 = 1 ÷ (1 − ${r}%) = 1 ÷ ${denom.toFixed(4)} ≈ ${(1 / denom).toFixed(2)}`
})

// 浮动盈亏：基于现价与持仓成本的差额 × 剩余股数
const floatingProfit = computed(() => {
  if (!props.realtimePrice || calcRes.value.avgCost <= 0 || calcRes.value.tradeCount <= 0) return 0
  return (props.realtimePrice.price - calcRes.value.avgCost) * calcRes.value.tradeCount
})
// 浮盈率：(现价 - 成本) / 成本
const floatingProfitRate = computed(() => {
  if (!props.realtimePrice || calcRes.value.avgCost <= 0) return 0
  return (props.realtimePrice.price - calcRes.value.avgCost) / calcRes.value.avgCost * 100
})
const holdingDays = computed(() => {
  if (localStock.value.isCleared) {
    const base = localStock.value.frozenHoldingDays || 0
    return base || calculateHoldingDaysByRange(localStock.value.buyDate, localStock.value.sellDate)
  }
  return calculateHoldingDays(localStock.value.buyDate)
})

const transactionGroups = computed(() => {
  const transactions = [
    ...localStock.value.buyRecords.map(r => ({ type: 'buy', ...r })),
    ...localStock.value.sellRecords.map(r => ({ type: 'sell', ...r }))
  ].sort((a, b) => {
    if (a.createdAt && b.createdAt) return a.createdAt - b.createdAt
    const dateA = a.buyDate || a.sellDate || ''
    const dateB = b.buyDate || b.sellDate || ''
    return dateA.localeCompare(dateB)
  })

  const totalBuyCount = localStock.value.buyRecords.reduce((sum, r) => sum + (r.buyCount || 0), 0)
  const totalSellCount = localStock.value.sellRecords.reduce((sum, r) => sum + (r.sellCount || 0), 0)
  const isCleared = localStock.value.isCleared

  let lastSellRecord = null
  for (const t of transactions) {
    if (t.type === 'sell') {
      if (!lastSellRecord || t.createdAt > lastSellRecord.createdAt) lastSellRecord = t
    }
  }

  // 分组：首次买入 → 建仓，有tGroupId → T组，其余 → 独立行
  const groups = {}
  const ungrouped = []
  let firstBuyFound = false
  let firstBuyRecord = null

  for (const t of transactions) {
    if (t.type === 'buy' && !t.tType && !firstBuyFound) {
      firstBuyRecord = t
      firstBuyFound = true
    } else if (t.tGroupId) {
      if (!groups[t.tGroupId]) groups[t.tGroupId] = []
      groups[t.tGroupId].push(t)
    } else {
      ungrouped.push(t)
    }
  }

  const result = []
  let currentCostBasis = 0
  let currentTotalCount = 0

  const numberOrZero = value => Number.isFinite(Number(value)) ? Number(value) : 0
  const buyCash = record => numberOrZero(record.buyPrice) * numberOrZero(record.buyCount)
    + numberOrZero(record.commission) + numberOrZero(record.transferFee)
    + numberOrZero(record.handlingFee) + numberOrZero(record.regulatoryFee)
  const sellFees = record => numberOrZero(record.sellCommission) + numberOrZero(record.sellTransferFee)
    + numberOrZero(record.stampTax) + numberOrZero(record.handlingFee)
    + numberOrZero(record.regulatoryFee) + numberOrZero(record.otherFee)
  const sellNetCash = record => numberOrZero(record.sellPrice) * numberOrZero(record.sellCount) - sellFees(record)

  function getCurrentCost() {
    return currentTotalCount > 0 ? currentCostBasis / currentTotalCount : 0
  }

  function applyTransactionToCost(t) {
    if (t.type === 'buy') {
      currentCostBasis += buyCash(t)
      currentTotalCount += numberOrZero(t.buyCount)
      return
    }

    currentCostBasis -= sellNetCash(t)
    currentTotalCount = Math.max(0, currentTotalCount - numberOrZero(t.sellCount))
  }

  // === 建仓 ===
  if (firstBuyRecord) {
    applyTransactionToCost(firstBuyRecord)
    const newCost = getCurrentCost()

    result.push({
      type: 'row',
      tx: firstBuyRecord,
      typeLabel: '<span class="px-1 py-px bg-blue-100 text-blue-700 rounded text-sm font-medium">建仓</span>',
      profitDisplay: 0,
      costImpact: newCost,
      oldCost: 0,
      newCost,
      costChangePerShare: newCost,
      costChangeDisplay: true
    })
  }

  // === 合并 T 组和独立行，按时间排序 ===
  const sortedGroups = Object.values(groups).map(group => {
    const groupTType = group[0].tType
    const isZhengT = groupTType === '正T' || groupTType === '正T卖出'
    group.sort((a, b) => {
      if (a.type === b.type) return 0
      if (isZhengT) return a.type === 'buy' ? -1 : 1
      return a.type === 'sell' ? -1 : 1
    })
    const firstTx = group[0]
    return {
      type: 'group',
      group,
      groupTType,
      isZhengT,
      firstDate: firstTx.buyDate || firstTx.sellDate || '',
      firstCreatedAt: firstTx.createdAt || 0
    }
  })

  const sortedUngrouped = ungrouped.map(t => ({
    type: 'row',
    tx: t,
    date: t.buyDate || t.sellDate || '',
    createdAt: t.createdAt || 0
  }))

  const mixedItems = [...sortedGroups, ...sortedUngrouped].sort((a, b) => {
    const ca = a.firstCreatedAt || a.createdAt || 0
    const cb = b.firstCreatedAt || b.createdAt || 0
    if (ca && cb && ca !== cb) return ca - cb
    const dateA = a.firstDate || a.date || ''
    const dateB = b.firstDate || b.date || ''
    return dateA.localeCompare(dateB)
  })

  // 按时间顺序处理每个项目
  mixedItems.forEach(item => {
    if (item.type === 'row') {
      // === 独立行 ===
      const t = item.tx
      const oldCost = getCurrentCost()

      applyTransactionToCost(t)

      const newCost = getCurrentCost()
      const costImpact = newCost - oldCost
      const profitDisplay = t.type === 'sell' ? sellNetCash(t) - oldCost * numberOrZero(t.sellCount) : 0

      let typeLabel
      if (t.type === 'buy') {
        typeLabel = t.tType === '补仓'
          ? '<span class="px-1 py-px bg-blue-100 text-blue-700 rounded text-sm font-medium">补仓</span>'
          : '<span class="px-1 py-px bg-green-100 text-green-700 rounded text-sm font-medium">买</span>'
      } else {
        const isLastSell = isCleared && lastSellRecord && t.id === lastSellRecord.id
        if (isLastSell) {
          typeLabel = '<span class="px-1 py-px bg-purple-100 text-purple-700 rounded text-sm font-medium">清仓</span>'
        } else if (t.tType === '止盈') {
          typeLabel = '<span class="px-1 py-px bg-emerald-100 text-emerald-700 rounded text-sm font-medium">止盈</span>'
        } else if (t.tType === '止损') {
          typeLabel = '<span class="px-1 py-px bg-red-100 text-red-700 rounded text-sm font-medium">止损</span>'
        } else {
          typeLabel = '<span class="px-1 py-px bg-red-100 text-red-700 rounded text-sm font-medium">卖</span>'
        }
      }

      result.push({
        type: 'row',
        tx: t,
        typeLabel,
        profitDisplay,
        costImpact,
        oldCost,
        newCost,
        costChangePerShare: costImpact,
        costChangeDisplay: t.type === 'buy' || t.type === 'sell'
      })
    } else {
      // === T 组 ===
      const { group, groupTType, isZhengT } = item
      const isCompleted = group.length >= 2
      const groupOldCost = getCurrentCost()

      const groupRows = []
      group.forEach((t, index) => {
        const oldCost = getCurrentCost()

        applyTransactionToCost(t)

        const newCost = getCurrentCost()
        const costImpact = newCost - oldCost
        let profitDisplay = 0
        if (t.type === 'sell') {
          const matchedBuy = group.find(g => g.type === 'buy')
          if (matchedBuy) {
            profitDisplay = sellNetCash(t) - buyCash(matchedBuy)
          } else {
            profitDisplay = sellNetCash(t) - oldCost * numberOrZero(t.sellCount)
          }
        }

        let typeLabel
        if (t.type === 'buy') {
          typeLabel = '<span class="px-1 py-px bg-green-100 text-green-700 rounded text-sm font-medium">买</span>'
        } else {
          const isClearSell = isCleared && lastSellRecord && t.id === lastSellRecord.id
          typeLabel = isClearSell
            ? '<span class="px-1 py-px bg-purple-100 text-purple-700 rounded text-sm font-medium">清仓</span>'
            : '<span class="px-1 py-px bg-red-100 text-red-700 rounded text-sm font-medium">卖</span>'
        }

        groupRows.push({
          tx: t,
          typeLabel,
          profitDisplay,
          costImpact,
          newCost,
          oldCost,
          costChangePerShare: costImpact,
          costChangeDisplay: t.type === 'buy' || t.type === 'sell'
        })
      })

      const groupNewCost = getCurrentCost()
      const groupCostChange = groupNewCost - groupOldCost

      let groupNetProfit = 0
      if (isCompleted) {
        const buyTx = group.find(t => t.type === 'buy')
        const sellTx = group.find(t => t.type === 'sell')
        if (buyTx && sellTx) {
          const buyFees = (buyTx.commission || 0) + (buyTx.transferFee || 0)
          const sellFees = (sellTx.sellCommission || 0) + (sellTx.sellTransferFee || 0) + (sellTx.stampTax || 0)
          groupNetProfit = (sellTx.sellPrice - buyTx.buyPrice) * sellTx.sellCount - buyFees - sellFees
        }
      }

      groupRows.forEach(row => {
        row.costChangePerShare = row.costImpact
        row.costChangeDisplay = row.tx.type === 'buy' || row.tx.type === 'sell'
      })

      let breakEvenPrice = null
      if (!isCompleted) {
        const firstTx = group[0]
        if (isZhengT) {
          const buyCost = firstTx.buyPrice * firstTx.buyCount + (firstTx.commission || 0) + (firstTx.transferFee || 0)
          let lo = firstTx.buyPrice, hi = firstTx.buyPrice * 2
          for (let i = 0; i < 50; i++) {
            const mid = (lo + hi) / 2
            const amt = mid * firstTx.buyCount
            const comm = Math.max(amt * 0.00023, 5)
            const stamp = amt * 0.001
            const tf = amt * 0.00001
            if (amt - comm - stamp - tf > buyCost) hi = mid
            else lo = mid
          }
          breakEvenPrice = (lo + hi) / 2
        } else {
          const sellAmt = firstTx.sellPrice * firstTx.sellCount
          const sellFees = (firstTx.sellCommission || 0) + (firstTx.sellTransferFee || 0) + (firstTx.stampTax || 0)
          const sellNet = sellAmt - sellFees
          let lo = 0.01, hi = firstTx.sellPrice
          for (let i = 0; i < 50; i++) {
            const mid = (lo + hi) / 2
            const amt = mid * firstTx.sellCount
            const comm = Math.max(amt * 0.00023, 5)
            const tf = amt * 0.00001
            if (amt + comm + tf > sellNet) hi = mid
            else lo = mid
          }
          breakEvenPrice = (lo + hi) / 2
        }
      }

      result.push({
        type: 'group',
        tType: isZhengT ? '正T' : '反T',
        isCompleted,
        groupNetProfit,
        groupCostChange,
        groupOldCost,
        groupNewCost,
        breakEvenPrice,
        previewKey: group[0].id,
        rows: groupRows
      })
    }
  })

  return result
})

const allTransactions = computed(() => {
  return transactionGroups.value.reduce((arr, g) => {
    if (g.type === 'row') arr.push(g.tx)
    else if (g.type === 'group') g.rows.forEach(r => arr.push(r.tx))
    return arr
  }, [])
})

const totalFee = computed(() => {
  const totalBuyFee = localStock.value.buyRecords.reduce((sum, r) => sum + (r.commission || 0) + (r.transferFee || 0), 0)
  const totalSellFee = localStock.value.sellRecords.reduce((sum, r) => sum + (r.sellCommission || 0) + (r.sellTransferFee || 0) + (r.stampTax || 0), 0)
  return totalBuyFee + totalSellFee
})

// 总买入本金（用于计算清仓收益率）
const totalBuyAmount = computed(() => {
  // 只算非赠送（buyPrice > 0）的买入
  return localStock.value.buyRecords.reduce((sum, r) => sum + ((r.buyPrice || 0) * (r.buyCount || 0)), 0)
})

const totalSellCount = computed(() => {
  return localStock.value.sellRecords.reduce((sum, r) => sum + (r.sellCount || 0), 0)
})

const totalSellAmount = computed(() => {
  return localStock.value.sellRecords.reduce((sum, r) => sum + ((r.sellPrice || 0) * (r.sellCount || 0)), 0)
})

const totalSellFee = computed(() => {
  return localStock.value.sellRecords.reduce((sum, r) => sum + (r.sellCommission || 0) + (r.sellTransferFee || 0) + (r.stampTax || 0) + (r.otherFee || 0), 0)
})

// ===== 总计行专用的 4 个核心数据（2026-09-03 修复：用最朴素的"花了多少 vs 现在值多少"法）=====

// 💵 投入：累计买入总支出（含所有手续费）— 现金流出
const investTotal = computed(() => parseFloat((Number(calcRes.value.totalBuyGross) || 0).toFixed(2)))

// 📥 收回：累计卖出净收入（扣手续费后）— 现金流入
const recoverTotal = computed(() => parseFloat((Number(calcRes.value.totalSellNet) || 0).toFixed(2)))

// 剩余持仓市值（用市价或目标价）
const remainingMarketValue = computed(() => {
  const held = calcRes.value.tradeCount
  if (held <= 0) return 0
  const price = props.realtimePrice?.price || Number(localStock.value.sellPrice) || 0
  return parseFloat((price * held).toFixed(2))
})

// 🎯 最终盈亏 = 旧周期累计 + 已收回 + 剩余市值 - 总投入
// 注：公式绝对不依赖 sellRecords.netProfit（那个可能被历史反T误差污染）
const finalProfit = computed(() => {
  const accumulated = Number(localStock.value.accumulatedProfit) || 0
  if (localStock.value.isCleared) {
    // 清仓：没有剩余持仓
    return parseFloat((accumulated + recoverTotal.value - investTotal.value).toFixed(2))
  }
  return parseFloat((accumulated + recoverTotal.value + remainingMarketValue.value - investTotal.value).toFixed(2))
})

// 📊 收益率 = 总盈亏 ÷ 总投入
const finalRateLabel = computed(() => {
  if (investTotal.value <= 0) return '—'
  const pct = (finalProfit.value / investTotal.value) * 100
  const sign = pct >= 0 ? '+' : ''
  return `${sign}${pct.toFixed(2)}%`
})

// ===== 每个数据块的 tooltip（悬浮显示计算公式和过程）=====
const profitTooltip = computed(() => {
  const ac = Number(localStock.value.accumulatedProfit) || 0
  const sellNet = recoverTotal.value
  const buyGross = investTotal.value
  const remainMv = remainingMarketValue.value
  const held = calcRes.value.tradeCount
  const price = props.realtimePrice?.price || Number(localStock.value.sellPrice) || 0
  const isCleared = localStock.value.isCleared

  const lines = [
    `=== 🎯 最终盈亏（花了多少 vs 现在值多少）===`,
    `公式：旧周期 + 已收回 + 剩余市值 - 总投入`,
    '',
    `旧周期累计：¥${ac}`,
    `已收回（卖出净收入）：¥${sellNet}`,
  ]
  if (isCleared) {
    lines.push(`剩余持仓：已清仓`)
  } else {
    lines.push(`剩余市值（${price.toFixed(3)} × ${held}股）：¥${remainMv}`)
  }
  lines.push(`总投入（买入总支出）：-¥${buyGross}`)
  lines.push('-----------------------------------------')
  lines.push(`最终盈亏 = ¥${finalProfit.value}（${finalRateLabel.value}）`)
  return lines.join('\n')
})

const investTooltip = computed(() => {
  const buyRecords = localStock.value.buyRecords || []
  const lines = [`=== 💵 投入（累计买入总支出）===`, `买入笔数：${buyRecords.length}`, `公式：Σ(买入价 × 股数 + 买入手续费)`]
  buyRecords.forEach((r) => {
    const gross = Number(r.buyPrice || 0) * Number(r.buyCount || 0)
    const fee = (Number(r.commission) || 0) + (Number(r.transferFee) || 0)
    const label = r.tType ? `[${r.tType}]` : ''
    lines.push(`  ${label}${r.buyDate || ''} ¥${r.buyPrice}×${r.buyCount}股 + 手续费¥${fee.toFixed(2)} = ¥${(gross + fee).toFixed(2)}`)
  })
  lines.push('-----------------------------------------')
  lines.push(`  合计 ≈ ¥${investTotal.value}`)
  return lines.join('\n')
})

const recoverTooltip = computed(() => {
  const sellRecords = localStock.value.sellRecords || []
  const lines = [`=== 📥 收回（累计卖出净收入）===`, `卖出笔数：${sellRecords.length}`, `公式：Σ(卖出价 × 股数 - 卖出手续费)`]
  sellRecords.forEach((r) => {
    const gross = Number(r.sellPrice || 0) * Number(r.sellCount || 0)
    const fee = (Number(r.sellCommission) || 0) + (Number(r.sellTransferFee) || 0) + (Number(r.stampTax) || 0) + (Number(r.otherFee) || 0)
    const net = gross - fee
    const label = r.tType ? `[${r.tType}]` : ''
    lines.push(`  ${label}${r.sellDate || ''} ¥${r.sellPrice}×${r.sellCount}股 - 手续费¥${fee.toFixed(2)} = ¥${net.toFixed(2)}`)
  })
  lines.push('-----------------------------------------')
  lines.push(`  合计 ≈ ¥${recoverTotal.value}`)
  return lines.join('\n')
})

const rateTooltip = computed(() => {
  const lines = [
    `=== 📊 收益率 ===`,
    `公式：最终盈亏 ÷ 总投入 × 100%`,
    `     ¥${finalProfit.value} ÷ ¥${investTotal.value} × 100% = ${finalRateLabel.value}`,
  ]
  return lines.join('\n')
})

const totalProfit = computed(() => {
  const accumulated = Number(localStock.value.accumulatedProfit) || 0
  let sum = accumulated
  const processedGroups = new Set()
  allTransactions.value.forEach(t => {
    if (t.tGroupId) {
      if (processedGroups.has(t.tGroupId)) return
      processedGroups.add(t.tGroupId)
      const buyTx = localStock.value.buyRecords.find(r => r.tGroupId === t.tGroupId)
      const sellTx = localStock.value.sellRecords.find(r => r.tGroupId === t.tGroupId)
      if (buyTx && sellTx) {
        const buyFees = (buyTx.commission || 0) + (buyTx.transferFee || 0)
        const sellFees = (sellTx.sellCommission || 0) + (sellTx.sellTransferFee || 0) + (sellTx.stampTax || 0)
        sum += (sellTx.sellPrice - buyTx.buyPrice) * sellTx.sellCount - buyFees - sellFees
      }
    } else {
      sum += t.netProfit || 0
    }
  })
  return sum
})

const displayProfit = computed(() => {
  const accumulated = Number(localStock.value.accumulatedProfit) || 0
  if (localStock.value.isCleared) {
    return parseFloat((accumulated + calcRes.value.totalSellNet - calcRes.value.totalBuyGross).toFixed(2))
  }
  return parseFloat((accumulated + calcRes.value.targetNetProfit).toFixed(2))
})

const rebuyRecommendation = computed(() => {
  const buyCount = Number(calcRes.value.totalBuyCount) || 0
  const soldCount = Number(totalSellCount.value) || 0
  const heldShares = localStock.value.buyRecords?.length
    ? Math.max(0, buyCount - soldCount)
    : Math.max(0, Number(localStock.value.count) || 0)
  if (!localStock.value.isCleared && heldShares > 0) return null

  const defaultShares = soldCount > 0 ? soldCount : buyCount
  const requestedShares = Number(rebuySharesInput.value)
  const shares = requestedShares > 0 ? requestedShares : defaultShares
  const sellNet = Number(totalSellAmount.value) - Number(totalSellFee.value)
  const referenceCost = Number(calcRes.value.avgCost) || 0
  if (shares <= 0 || sellNet <= 0 || referenceCost <= 0) return null

  const currentCycleProfit = parseFloat((calcRes.value.totalSellNet - calcRes.value.totalBuyGross).toFixed(2))
  const realizedPnl = Number(currentCycleProfit) || 0
  const buyFeeAt = price => {
    const gross = price * shares
    return Math.max(gross * 0.00023, 5) + gross * 0.00001
  }

  // First fold the completed trade P/L into the cleared-position reference cost.
  // The next buy fee is then spread over the requested shares, so larger positions
  // approach that post-clear cost instead of collapsing toward zero.
  const postClearCost = Math.max(0, referenceCost - Math.abs(realizedPnl) / defaultShares)
  const targetGross = postClearCost * shares
  if (targetGross <= 0) return null
  let lo = 0
  let hi = postClearCost
  for (let i = 0; i < 60; i++) {
    const mid = (lo + hi) / 2
    if (mid * shares + buyFeeAt(mid) <= targetGross) lo = mid
    else hi = mid
  }

  const price = Math.floor(lo * 1000) / 1000
  const fee = buyFeeAt(price)
  const effectiveCost = (Number(calcRes.value.remainingCostTotal) + price * shares + fee) / shares
  return { price, shares, defaultShares, fee, effectiveCost, referenceCost, postClearCost, realizedPnl }
})

const ratioPrice = computed(() => calcRatioPrice(localStock.value, calcRes.value.avgCost))

function formatNumber(val, decimals = 2) {
  return fmtNum(val, decimals)
}

function profitColorClass(value) {
  const amount = Number(value) || 0
  if (amount > 0) return 'text-profit'
  if (amount < 0) return 'text-loss'
  return 'text-neutral'
}

function previewProfit(groupItem) {
  const price = parseFloat(previewPrices.value[groupItem.previewKey])
  if (isNaN(price) || price <= 0) return 0
  const firstTx = groupItem.rows[0].tx
  if (groupItem.tType === '正T') {
    // 正T：已有买入，预览卖出利润
    const buyCost = firstTx.buyPrice * firstTx.buyCount + (firstTx.commission || 0) + (firstTx.transferFee || 0)
    const sellAmt = price * firstTx.buyCount
    const comm = Math.max(sellAmt * 0.00023, 5)
    const stamp = sellAmt * 0.001
    const tf = sellAmt * 0.00001
    return sellAmt - comm - stamp - tf - buyCost
  } else {
    // 反T：已有卖出，预览买入承接利润
    const sellAmt = firstTx.sellPrice * firstTx.sellCount
    const sellFees = (firstTx.sellCommission || 0) + (firstTx.sellTransferFee || 0) + (firstTx.stampTax || 0)
    const sellNet = sellAmt - sellFees
    const buyAmt = price * firstTx.sellCount
    const comm = Math.max(buyAmt * 0.00023, 5)
    const tf = buyAmt * 0.00001
    return sellNet - buyAmt - comm - tf
  }
}

function toggleTransactions() {
  expanded.value = !expanded.value
}

function updateStockField(field) {
  if (field === 'sellPrice' || field === 'targetProfit' || field === 'basePrice' || field === 'priceChangePercent') {
    const data = {}
    if (localStock.value.sellPrice != null) data.sellPrice = localStock.value.sellPrice
    if (localStock.value.targetProfit != null) data.targetProfit = localStock.value.targetProfit
    if (localStock.value.basePrice != null) data.basePrice = localStock.value.basePrice
    if (localStock.value.priceChangePercent != null) data.priceChangePercent = localStock.value.priceChangePercent
    emit('update', props.stock.id, data)
  } else {
    emit('update', props.stock.id, { [field]: localStock.value[field] })
  }
}

function applyRatioPrice() {
  if (ratioPrice.value) {
    localStock.value.sellPrice = parseFloat(ratioPrice.value.toFixed(3))
    emit('update', props.stock.id, { sellPrice: localStock.value.sellPrice })
  }
}

function fillCurrentPrice() {
  if (!props.realtimePrice || !props.realtimePrice.price) return
  localStock.value.sellPrice = parseFloat(props.realtimePrice.price.toFixed(3))
  emit('update', props.stock.id, { sellPrice: localStock.value.sellPrice })
}

function startEditNotes() {
  editingNotes.value = true
  nextTick(() => {
    if (notesTextarea.value) notesTextarea.value.focus()
  })
}

function saveNotes() {
  editingNotes.value = false
  emit('update', props.stock.id, { notes: localStock.value.notes || '' })
}

function startEditFormula() {
  editingFormula.value = true
  nextTick(() => {
    if (formulaInput.value) formulaInput.value.focus()
  })
}

function saveFormula() {
  editingFormula.value = false
  // 输入空值时存 null；否则存数值
  const v = localStock.value.topTenFloatRatio
  const val = (v == null || v === '' || isNaN(v)) ? null : parseFloat(v)
  localStock.value.topTenFloatRatio = val
  console.log('[saveFormula] stockId=', props.stock.id, 'ratio=', v, '->', val)
  emit('update', props.stock.id, { topTenFloatRatio: val })
}

function updateTransaction(tx, field, value) {
  const updateData = {}
  if (field === 'date') {
    updateData[tx.type === 'buy' ? 'buyDate' : 'sellDate'] = value
  } else if (field === 'price') {
    updateData[tx.type === 'buy' ? 'buyPrice' : 'sellPrice'] = value
  } else if (field === 'count') {
    updateData[tx.type === 'buy' ? 'buyCount' : 'sellCount'] = value
  } else if (field === 'commission') {
    updateData[tx.type === 'buy' ? 'commission' : 'sellCommission'] = value
  } else if (field === 'transferFee') {
    updateData[tx.type === 'buy' ? 'transferFee' : 'sellTransferFee'] = value
  } else if (field === 'stampTax') {
    updateData.stampTax = value
  } else if (field === 'tProfit') {
    updateData.tProfit = value
  } else if (field === 'tType') {
    updateData.tType = value
  }
  emit('update-transaction', props.stock.id, tx.type, tx.id, updateData)
}

function changeTxType(tx, newType) {
  emit('change-tx-type', props.stock.id, tx, newType)
}

function txSelectClass(tx) {
  if (tx.type === 'buy') {
    if (tx.tType === '正T' || tx.tType === '反T承接') return 'bg-green-100 text-green-700 font-medium'
    return 'bg-blue-100 text-blue-700 font-medium'
  }
  // sell
  if (tx.tType === '止盈') return 'bg-emerald-100 text-emerald-700 font-medium'
  if (tx.tType === '正T卖出' || tx.tType === '反T') return 'bg-amber-100 text-amber-700 font-medium'
  return 'bg-red-100 text-red-700 font-medium'
}
</script>