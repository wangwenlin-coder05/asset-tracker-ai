<template>
  <div class="w-full max-w-full min-w-0 overflow-x-hidden px-3 sm:px-4 lg:px-5 mt-3">

    <!-- 顶部行情条 -->
    <MarketTicker ref="marketTickerRef" v-if="activeCategory === 'all' || activeCategory === 'stock_pick'" />

    <div class="grid grid-cols-1 lg:grid-cols-[minmax(0,0.78fr)_minmax(0,1.65fr)] xl:grid-cols-[minmax(0,0.8fr)_minmax(0,1.65fr)_minmax(0,0.95fr)] 2xl:grid-cols-[minmax(0,0.86fr)_minmax(0,1.72fr)_minmax(0,0.96fr)_minmax(0,0.86fr)] gap-1.5 lg:gap-2 h-[calc(100vh-175px)] min-h-[500px] min-w-0">
      <!-- 第一栏：自动捕获记录 -->
      <section class="bg-white rounded-xl p-3 card-shadow flex flex-col overflow-hidden h-full min-w-0">

        <div class="flex flex-wrap items-center justify-between gap-1.5 mb-2 flex-shrink-0">
          <h4 class="text-sm font-bold text-slate-700 flex items-center gap-2"><Inbox class="w-4 h-4 text-emerald-500" />自动捕获记录</h4>
          <span class="text-[11px] text-slate-400">共 {{ filteredEvents.length }} 条<span v-if="selectedDate" class="text-slate-300"> / {{ events.length }}</span></span>
        </div>
        <!-- 分类 tab -->
        <div class="flex flex-wrap items-center gap-1 mb-2 flex-shrink-0">
          <button
            @click="activeCategory = 'all'"
            class="px-2 h-6 rounded-lg text-[10px] font-semibold flex items-center gap-1 transition-colors min-w-0"
            :class="activeCategory === 'all' ? 'bg-slate-800 text-white' : 'bg-slate-100 text-slate-500 hover:bg-slate-200'"
          >
            全部 <span class="px-1 rounded text-[9px]" :class="activeCategory === 'all' ? 'bg-white/20' : 'bg-white'">{{ totalFilteredCount }}</span>
          </button>
          <button
            @click="activeCategory = 'stock_pick'"
            class="px-2 h-6 rounded-lg text-[10px] font-semibold flex items-center gap-1 transition-colors min-w-0"
            :class="activeCategory === 'stock_pick' ? 'bg-emerald-500 text-white' : 'bg-emerald-50 text-emerald-600 hover:bg-emerald-100'"
          >
            <Target class="w-3 h-3" />推票 <span class="px-1 rounded text-[9px]" :class="activeCategory === 'stock_pick' ? 'bg-white/20' : 'bg-white'">{{ stockPickCount }}</span>
          </button>
          <button
            @click="activeCategory = 'market_news'"
            class="px-2 h-6 rounded-lg text-[10px] font-semibold flex items-center gap-1 transition-colors min-w-0"
            :class="activeCategory === 'market_news' ? 'bg-blue-500 text-white' : 'bg-blue-50 text-blue-600 hover:bg-blue-100'"
          >
            <LineChart class="w-3 h-3" />行情 <span class="px-1 rounded text-[9px]" :class="activeCategory === 'market_news' ? 'bg-white/20' : 'bg-white'">{{ marketNewsCount }}</span>
          </button>
          <button
            @click="activeCategory = 'marketing'"
            class="px-2 h-6 rounded-lg text-[10px] font-semibold flex items-center gap-1 transition-colors min-w-0"
            :class="activeCategory === 'marketing' ? 'bg-orange-500 text-white' : 'bg-orange-50 text-orange-600 hover:bg-orange-100'"
          >
            <MessageCircle class="w-3 h-3" />营销 <span class="px-1 rounded text-[9px]" :class="activeCategory === 'marketing' ? 'bg-white/20' : 'bg-white'">{{ marketingCount }}</span>
          </button>
        </div>
        <div v-if="!filteredEvents.length" class="flex-1 min-h-0 rounded-xl border-2 border-dashed border-slate-100 flex flex-col items-center justify-center text-center px-6">
          <ScanSearch class="w-14 h-14 text-slate-200 mb-3" />
          <p class="text-sm font-semibold text-slate-400">{{ selectedDate ? '所选日期无消息' : '等待微信股票消息' }}</p>
          <p class="text-xs text-slate-300 mt-1 leading-5">{{ selectedDate ? '请点击右上角"取消日期筛选"查看全部。' : '监听开启后，任意会话收到"【股票名称 6位代码】"格式的未读消息都会自动切换并显示。' }}</p>
        </div>
        <div v-else class="flex-1 min-h-0 space-y-1.5 overflow-y-auto overflow-x-hidden pr-0.5">
          <div v-for="event in filteredEvents" :key="event.id" @click="selectedId = event.id" class="w-full min-w-0 text-left rounded-lg border p-2.5 transition-all cursor-pointer group/event relative" :class="selectedId === event.id ? 'border-emerald-300 bg-emerald-50 shadow-sm' : 'border-slate-100 hover:border-slate-200 hover:bg-slate-50'">
            <button
              @click.stop="deleteEvent(event.id)"
              class="absolute right-2 top-2 z-10 w-6 h-6 rounded opacity-0 group-hover/event:opacity-100 flex items-center justify-center text-slate-400 hover:text-red-500 hover:bg-red-50 transition-all"
              :title="'删除这条消息'"
            >
              <X class="w-3.5 h-3.5" />
            </button>
            <div class="flex items-center justify-between gap-2 pr-6">
              <div class="flex items-center gap-1.5 min-w-0">
                <span class="w-1.5 h-1.5 rounded-full bg-emerald-400 flex-shrink-0"></span>
                <span class="text-sm font-bold text-slate-800 truncate">{{ event.sender || '未知发送人' }}</span>
              </div>
              <span class="text-[10px] text-slate-400 flex-shrink-0 flex items-center gap-1">
                <span class="text-indigo-500 font-medium">{{ formatFullTime(event.capturedAt, event.messageTime) }}</span>
              </span>
            </div>
            <p class="text-[11px] text-slate-400 mt-1 truncate flex items-center gap-1">
              <span class="text-slate-500">{{ event.recommendationDate || formatDate(event.capturedAt) }}</span>
              <span class="text-slate-300">·</span>
              <span>来自「{{ event.chatName || '未识别' }}」</span>
            </p>
            <div class="flex flex-wrap gap-1 mt-2 items-center">
              <span
                v-for="stock in event.stocks"
                :key="stock.code"
                class="px-1.5 py-0.5 rounded border text-[10px] font-medium transition-all"
                :class="stockTagClass(stock.code)"
                :title="`今天的推票消息中出现 ${stockCountMap.get(String(stock.code)) || 1} 次`"
              >{{ stock.name }} {{ stock.code }}<span v-if="stockTagLabel(stock.code)" class="ml-0.5 font-bold">{{ stockTagLabel(stock.code) }}</span></span>
              <!-- 链接标识 -->
              <span
                v-if="event.urls && event.urls.length"
                class="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded border border-blue-200 bg-blue-50 text-blue-600 text-[10px] font-medium"
                title="此消息包含链接"
              >
                <Link2 class="w-2.5 h-2.5" />
                链接{{ event.urls.length > 1 ? `x${event.urls.length}` : '' }}
              </span>
            </div>
            <!-- 分类标签 + 手动修改入口 -->
            <div class="flex items-center justify-between mt-2 gap-2">
              <div class="flex items-center gap-1 min-w-0">
                <template v-if="categoryChanger.eventId !== event.id">
                  <button
                    @click.stop="openCategoryChanger(event)"
                    class="group/cat inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold border transition-all hover:shadow-sm"
                    :class="categoryBadgeClass(event.category)"
                    title="点击修改该消息的分类（手动归类立即学习规则）"
                  >
                    <Tag class="w-2.5 h-2.5 opacity-70" />
                    {{ categoryLabel(event.category) }}
                    <Pencil class="w-2.5 h-2.5 opacity-0 group-hover/cat:opacity-100 transition-opacity" />
                  </button>
                </template>
                <template v-else>
                  <div class="flex items-center gap-1 flex-wrap">
                    <button
                      v-for="c in categoryOptions"
                      :key="c.value"
                      @click.stop="submitChangeCategory(event, c.value)"
                      class="h-6 px-2 rounded-full border text-[10px] font-semibold transition-colors"
                      :class="categoryChanger.newCategory === c.value ? c.activeClass : 'border-slate-200 text-slate-500 hover:bg-slate-50'"
                    >{{ c.label }}</button>
                    <button
                      @click.stop="closeCategoryChanger"
                      class="h-6 w-6 rounded-full border border-slate-200 text-slate-400 hover:text-slate-600 hover:bg-slate-50 flex items-center justify-center"
                      title="取消修改"
                    ><X class="w-3 h-3" /></button>
                  </div>
                </template>
              </div>
              <span
                v-if="categoryChanger.eventId === event.id && categoryChanger.status"
                class="text-[10px] flex-shrink-0"
                :class="categoryChanger.status.includes('失败') ? 'text-red-500' : 'text-emerald-600'"
              >{{ categoryChanger.status }}</span>
            </div>
          </div>
        </div>
      </section>

      <!-- 第二栏：消息详情 + 白名单/黑名单 -->
      <section class="bg-white rounded-xl p-3 card-shadow flex flex-col overflow-y-auto overflow-x-hidden h-full min-w-0">
        <div class="flex flex-wrap items-center justify-between gap-2 mb-2 flex-shrink-0">
          <h4 class="text-xs font-bold text-slate-700 flex items-center gap-1.5"><MessageSquareText class="w-4 h-4 text-emerald-500" />消息详情</h4>
          <div v-if="selectedEvent" class="flex flex-wrap items-center justify-end gap-1">
            <!-- 当前分类 + 快速修改（详情页） -->
            <div class="flex items-center gap-1">
              <template v-if="detailCategoryChanger.show !== true">
                <button
                  @click="openDetailCategoryChanger(selectedEvent)"
                  class="group/dcat inline-flex items-center gap-1 px-2 py-1 rounded-lg border text-[11px] font-semibold transition-all hover:shadow-sm"
                  :class="categoryBadgeClass(selectedEvent.category)"
                  title="点击修改该消息的分类（手动归类立即学习规则）"
                >
                  <Tag class="w-3 h-3 opacity-70" />
                  {{ categoryLabel(selectedEvent.category) }}
                  <Pencil class="w-3 h-3 opacity-0 group-hover/dcat:opacity-100 transition-opacity" />
                </button>
              </template>
              <template v-else>
                <button
                  v-for="c in categoryOptions"
                  :key="c.value"
                  @click="submitDetailCategoryChange(c.value)"
                  class="h-7 px-2 rounded-lg border text-[11px] font-semibold transition-colors"
                  :class="detailCategoryChanger.newCategory === c.value ? c.activeClass : 'border-slate-200 text-slate-500 hover:bg-slate-50'"
                >{{ c.label }}</button>
                <button
                  @click="closeDetailCategoryChanger"
                  class="h-7 w-7 rounded-lg border border-slate-200 text-slate-400 hover:text-slate-600 hover:bg-slate-50 flex items-center justify-center"
                  title="取消修改"
                ><X class="w-3.5 h-3.5" /></button>
              </template>
            </div>
            <button
              @click="deleteEvent(selectedEvent.id)"
              :disabled="deleting"
              class="px-2 py-1 rounded-lg border border-red-100 text-red-500 bg-red-50/40 text-[11px] hover:bg-red-50 disabled:opacity-50 flex items-center gap-1"
            >
              <Trash2 class="w-3 h-3" />删除
            </button>
            <button @click="copyResult" class="px-2 py-1 rounded-lg border border-slate-200 text-[11px] text-slate-600 hover:bg-slate-50 flex items-center gap-1"><Copy class="w-3 h-3" />{{ copied ? '已复制' : '复制' }}</button>
            <button
              v-if="selectedEvent?.category === 'stock_pick'"
              @click="showBindStocks = !showBindStocks"
              class="px-2 py-1 rounded-lg border text-[11px] font-semibold flex items-center gap-1 transition-all"
              :class="showBindStocks ? 'border-emerald-300 bg-emerald-50 text-emerald-600' : 'border-emerald-100 bg-emerald-50/50 text-emerald-600 hover:bg-emerald-100'"
              title="手动为该消息绑定股票代码"
            >
              <Target class="w-3 h-3" />{{ showBindStocks ? '收起' : '绑定股票' }}
            </button>
          </div>
        </div>

        <div v-if="!selectedEvent" class="flex-1 min-h-0 flex flex-col items-center justify-center text-center">
          <MessageSquareText class="w-12 h-12 text-slate-200 mb-2" />
          <p class="text-xs font-semibold text-slate-400">暂无可查看的提取结果</p>
          <p class="text-[11px] text-slate-300 mt-1">收到符合规则的微信消息后会自动展示详情。</p>
        </div>
        <div v-else class="flex-1 overflow-y-visible">
          <div v-if="selectedEvent.category === 'stock_pick' && selectedEvent.stocks && selectedEvent.stocks.length" class="rounded-xl border border-slate-100 overflow-hidden mb-3 flex-shrink-0">
            <div class="grid grid-cols-[minmax(80px,0.7fr)_80px_1fr] bg-slate-50 px-3 py-2 text-[11px] font-semibold text-slate-500"><span>股票名称</span><span>代码</span><span>推荐逻辑 <span class="font-normal text-slate-400">(双击编辑)</span></span></div>
            <div v-for="stock in selectedEvent.stocks" :key="stock.code" class="grid grid-cols-[minmax(80px,0.7fr)_80px_1fr] gap-2 px-3 py-2 border-t border-slate-100 text-sm items-start">
              <span class="font-bold text-slate-800">{{ stock.name }}</span><span class="font-mono font-semibold text-blue-600 cursor-pointer hover:text-blue-800 hover:underline" :title="'点击复制 ' + stock.name + ' 代码'" @click.stop="copyCode(stock.code, stock.name)">{{ copiedCode === stock.code ? '已复制' : stock.code }}</span>
              <span
    v-if="editingLogicStock !== stock.code"
    @dblclick="startEditLogic(stock)"
    class="text-slate-500 leading-5 cursor-pointer hover:bg-amber-50 rounded px-1 -mx-1 min-h-[1.25rem] block"
    :title="'双击编辑推荐逻辑'"
  >
    <template v-if="stock.logic">{{ stock.logic }}</template>
    <template v-else-if="aiExtractingStocks?.has(stock.code)">
      <span class="text-amber-400 text-[10px] flex items-center gap-1"><RefreshCw class="w-2.5 h-2.5 animate-spin" />AI 提取中...</span>
    </template>
    <template v-else>原消息未提供逻辑 · 双击输入</template>
  </span>
              <div v-else class="flex gap-1">
                <input
                  ref="logicInputRef"
                  v-model="editingLogicText"
                  @blur="saveStockLogic(stock.code)"
                  @keydown.escape="cancelEditLogic"
                  @keydown.enter="saveStockLogic(stock.code)"
                  @keydown.ctrl.enter.prevent="saveStockLogic(stock.code)"
                  class="flex-1 h-7 px-2 rounded border border-amber-300 text-xs focus:outline-none focus:border-amber-400 bg-amber-50"
                  placeholder="输入推荐逻辑，如：光伏龙头+HJT电池"
                />
              </div>
            </div>
          </div>

          <!-- 链接展示区域 -->
          <div v-if="selectedEvent.urls && selectedEvent.urls.length" class="rounded-xl border border-blue-100 bg-blue-50/30 overflow-hidden mb-3 flex-shrink-0">
            <div class="flex items-center gap-1.5 px-3 py-2 bg-blue-50 border-b border-blue-100">
              <span class="text-[11px] font-bold text-blue-700 flex items-center gap-1"><Link2 class="w-3.5 h-3.5" />消息链接</span>
              <span class="text-[10px] text-blue-500">{{ selectedEvent.urls.length }} 个</span>
            </div>
            <div class="px-3 py-2 space-y-1.5">
              <div
                v-for="(url, idx) in selectedEvent.urls"
                :key="idx"
                class="flex items-start gap-1.5"
              >
                <a
                  :href="url"
                  target="_blank"
                  rel="noopener noreferrer"
                  class="flex-1 text-xs text-blue-600 hover:text-blue-800 break-all font-mono leading-5 group/link"
                  :title="'点击在新窗口打开: ' + url"
                >
                  <span class="text-blue-400 group-hover/link:text-blue-600 transition-colors">{{ url }}</span>
                </a>
                <button
                  @click="copyUrlToClipboard(url)"
                  class="flex-shrink-0 px-1.5 py-0.5 rounded text-[9px] font-semibold bg-blue-100 text-blue-600 hover:bg-blue-200 transition-colors flex items-center gap-0.5"
                  :title="'复制链接: ' + url"
                >
                  <Copy class="w-2.5 h-2.5" />复制
                </button>
              </div>
            </div>
          </div>

          <!-- 绑定股票输入区域 -->
          <div v-if="showBindStocks" class="rounded-xl border border-emerald-200 bg-emerald-50/30 overflow-hidden mb-3 flex-shrink-0">
            <div class="flex items-center justify-between px-3 py-2 bg-emerald-50 border-b border-emerald-100">
              <span class="text-[11px] font-bold text-emerald-700 flex items-center gap-1"><Target class="w-3.5 h-3.5" />绑定股票</span>
              <button @click="cancelBindStocks" class="w-5 h-5 rounded flex items-center justify-center text-slate-400 hover:text-slate-600 hover:bg-slate-100" title="取消">
                <X class="w-3 h-3" />
              </button>
            </div>
            <div class="px-3 py-2.5">
              <textarea
                v-model="bindStocksInput"
                @keydown.ctrl.enter.prevent="confirmBindStocks"
                placeholder="输入股票代码、名称和推荐逻辑，支持多种格式：&#10;1. 002438 江苏神通：核电 + 半导体&#10;2. 601611 中国核电：电力 + 核电&#10;3. 603011 合锻智能：可控核聚变 + 核电&#10;或简写：002438 江苏神通"
                class="w-full h-20 px-2.5 py-1.5 rounded border border-emerald-200 text-[11px] leading-5 resize-none focus:outline-none focus:border-emerald-400 bg-white font-mono"
              ></textarea>
              <!-- 解析预览（可编辑纠正） -->
              <div v-if="parsedStocks.length" class="mt-2 space-y-1">
                <div
                  v-for="(s, idx) in parsedStocks"
                  :key="s.code"
                  class="flex items-center gap-1.5 px-2 py-1 rounded border border-emerald-200 bg-white text-[10px]"
                >
                  <input
                    :value="s.name"
                    @input="s.name = $event.target.value"
                    placeholder="名称"
                    class="w-16 px-1 py-0.5 rounded border border-emerald-200 text-emerald-700 font-medium text-[10px] focus:outline-none focus:border-emerald-400"
                  />
                  <input
                    :value="s.code"
                    @input="s.code = $event.target.value"
                    placeholder="代码"
                    class="w-14 px-1 py-0.5 rounded border border-emerald-200 text-emerald-500 font-mono text-[10px] focus:outline-none focus:border-emerald-400"
                  />
                  <input
                    :value="s.logic"
                    @input="s.logic = $event.target.value"
                    placeholder="推荐逻辑（可选）"
                    class="flex-1 px-1 py-0.5 rounded border border-emerald-200 text-slate-500 text-[10px] focus:outline-none focus:border-emerald-400"
                  />
                  <button @click="parsedStocks.splice(idx, 1)" class="text-red-400 hover:text-red-600 flex-shrink-0" title="移除">
                    <X class="w-3 h-3" />
                  </button>
                </div>
              </div>
              <div v-if="bindStocksError" class="mt-2 text-[10px] text-red-500">{{ bindStocksError }}</div>
              <div class="flex items-center justify-between mt-2">
                <span class="text-[10px] text-slate-400">按 Ctrl+Enter 确认绑定</span>
                <button
                  @click="confirmBindStocks"
                  :disabled="bindingStocks || !parsedStocks.length"
                  class="px-2.5 py-1 rounded text-[10px] font-semibold bg-emerald-500 text-white hover:bg-emerald-600 disabled:opacity-50 flex items-center gap-1"
                >
                  <Check class="w-3 h-3" />{{ bindingStocks ? '绑定中...' : '确认绑定' }}
                </button>
              </div>
            </div>
          </div>

          <div class="flex-shrink-0 flex flex-col">
            <div class="flex items-center justify-between mb-1.5 flex-shrink-0">
              <h4 class="text-[11px] font-bold text-slate-500">消息原文</h4>
              <span v-if="editingMessage" class="text-[10px] text-blue-500">编辑中 · 失焦自动保存</span>
              <span v-else class="text-[10px] text-slate-400">点击编辑</span>
            </div>
            <div
              class="w-full shrink-0 rounded-xl bg-slate-900 p-0 box-border"
              :style="{ height: (fixedBoxHeight && editingMessage ? fixedBoxHeight + 'px' : 'auto'), minHeight: (editingMessage ? fixedBoxHeight + 'px' : '80px') }"
            >
              <textarea
                v-if="editingMessage"
                ref="editTextareaRef"
                v-model="editingText"
                @blur="saveEditedMessage"
                @keydown.escape="cancelEditMessage"
                @input="autoGrowTextarea"
                class="w-full h-full whitespace-pre-wrap bg-transparent text-slate-100 p-4 text-xs leading-6 resize-none focus:outline-none rounded-xl box-border font-mono"
                :style="{ minHeight: (fixedBoxHeight ? fixedBoxHeight + 'px' : '120px') }"
                :rows="textareaRows"
              ></textarea>
              <pre
                v-else
                ref="preElRef"
                @click="startEditMessage"
                class="w-full whitespace-pre-wrap bg-transparent text-slate-100 p-4 text-xs leading-6 cursor-text hover:bg-slate-800 transition-colors rounded-xl m-0 box-border font-mono"
              ><span v-if="selectedEvent.sender || selectedEvent.capturedAt">{{ selectedEvent.sender || '未知' }} {{ formatFullTime(selectedEvent.capturedAt, selectedEvent.messageTime) }}：</span>
{{ selectedEvent.usefulMessage }}</pre>
            </div>
          </div>

          <!-- 规则管理按钮（训练规则 + 训练数据） + 一键分类 -->
          <div class="mt-3 pt-3 border-t border-slate-100 flex gap-2">
            <button @click="openRulesDialog" class="flex-1 h-8 rounded-lg bg-indigo-50 border border-indigo-100 text-indigo-600 text-[11px] font-semibold hover:bg-indigo-100 flex items-center justify-center gap-1 transition-colors">
              <Wand2 class="w-3.5 h-3.5" />规则
              <span class="px-1.5 py-0.5 rounded-full bg-indigo-200/60 text-indigo-700 text-[9px]">{{ ruleCountsText }}</span>
            </button>
            <button @click="reclassifyAll" :disabled="reclassifying" class="flex-1 h-8 rounded-lg bg-emerald-50 border border-emerald-100 text-emerald-600 text-[11px] font-semibold hover:bg-emerald-100 flex items-center justify-center gap-1 transition-colors disabled:opacity-50">
              <RefreshCw class="w-3.5 h-3.5" :class="{ 'animate-spin': reclassifying }" />{{ reclassifying ? '分类中...' : '一键分类消息' }}
            </button>
          </div>
        </div>
      </section>

      <!-- 第三栏：共同股票 · 出现次数排序 -->
      <section class="bg-white rounded-xl p-2.5 card-shadow flex flex-col overflow-hidden h-full min-w-0">
        <div class="flex flex-wrap items-center justify-between gap-2 mb-2 flex-shrink-0">
          <h4 class="text-sm font-bold text-slate-700 flex items-center gap-1.5"><Flame class="w-4 h-4 text-orange-500" />共同股票 · 出现次数排序</h4>
          <div class="flex flex-wrap items-center justify-end gap-1">
            <!-- 紧凑日历 -->
            <button @click="shiftMonth(-1)" class="w-6 h-6 rounded border border-slate-200 text-slate-500 hover:bg-slate-50 flex items-center justify-center"><ChevronLeft class="w-3 h-3" /></button>
            <button @click="calOpen = !calOpen" class="px-1.5 h-6 rounded border text-[11px] font-semibold flex items-center gap-1" :class="selectedDate ? 'border-indigo-300 bg-indigo-50 text-indigo-600' : 'border-slate-200 text-slate-600 hover:bg-slate-50'">
              <Calendar class="w-3 h-3" />{{ selectedDate || `${calMonth + 1}月` }}
            </button>
            <button @click="shiftMonth(1)" class="w-6 h-6 rounded border border-slate-200 text-slate-500 hover:bg-slate-50 flex items-center justify-center"><ChevronRight class="w-3 h-3" /></button>
            <button v-if="selectedDate" @click="selectedDate = ''" class="w-5 h-5 rounded text-slate-400 hover:text-red-500 hover:bg-red-50 flex items-center justify-center"><X class="w-3 h-3" /></button>
            <button @click="goToday" class="px-1.5 h-6 rounded border border-slate-200 text-[11px] text-slate-600 hover:bg-slate-50">今</button>
          </div>
        </div>

        <!-- 日历弹出面板 -->
        <div v-if="calOpen" class="mb-3 p-2 rounded-lg border border-slate-100 bg-slate-50/40 inline-block self-start flex-shrink-0">
          <div class="grid grid-cols-7 mb-0.5">
            <div v-for="(w, i) in weekLabels" :key="w" class="w-7 h-5 flex items-center justify-center text-[9px] font-semibold" :class="i === 0 || i === 6 ? 'text-rose-400' : 'text-slate-400'">{{ w }}</div>
          </div>
          <div class="grid grid-cols-7 gap-y-0.5">
            <div
              v-for="(cell, i) in calendarCells"
              :key="`${cell.year}-${cell.month}-${cell.day}-${i}`"
              class="w-7 h-7 flex flex-col items-center justify-center rounded cursor-pointer transition-all relative"
              :class="{
                'text-slate-300': !cell.current,
                'text-slate-600': cell.current && !cell.today && !cell.selected && cell.count === 0,
                'bg-indigo-500 text-white font-bold shadow-sm ring-1 ring-indigo-200': cell.selected,
                'bg-white text-indigo-600 font-semibold ring-1 ring-indigo-200 hover:bg-indigo-50': !cell.selected && cell.count > 0 && !cell.today,
                'ring-1 ring-orange-200 bg-orange-50 text-orange-600 font-semibold hover:bg-orange-100': cell.today && !cell.selected && cell.count === 0,
                'hover:bg-slate-100': cell.current && cell.count === 0 && !cell.selected,
              }"
              @click="cell.current ? pickDate(cell.date) : null"
            >
              <span class="text-[10px] leading-none">{{ cell.day }}</span>
              <span v-if="cell.count > 0 && !cell.selected" class="w-1 h-1 rounded-full mt-0.5" :class="cell.count >= 5 ? 'bg-rose-400' : cell.count >= 3 ? 'bg-amber-400' : 'bg-emerald-400'"></span>
            </div>
          </div>
        </div>

        <div v-if="!stockFrequency.length" class="flex-1 min-h-0 rounded-xl border-2 border-dashed border-slate-100 flex flex-col items-center justify-center">
          <TrendingUp class="w-10 h-10 text-slate-200 mb-1" />
          <p class="text-xs text-slate-400">暂无统计数据</p>
        </div>
        <div v-else class="border border-slate-100 rounded-xl overflow-hidden flex-1 min-h-0 flex flex-col">
          <div class="grid grid-cols-[24px_minmax(0,1fr)_60px_70px] bg-slate-50 px-3 py-2 text-xs font-semibold text-slate-500 flex-shrink-0 gap-2">
            <span class="text-center">#</span><span>股票</span><span class="text-right">次数</span>
            <span class="text-right">{{ marketOverview?.marketClosed ? '今日涨幅' : '当前涨幅' }}</span>
          </div>
          <div class="flex-1 min-h-0 overflow-y-auto">
            <div
              v-for="(s, idx) in stockFrequency"
              :key="s.code"
              @click="selectedStockCode = selectedStockCode === s.code ? '' : s.code"
              class="grid grid-cols-[24px_minmax(0,1fr)_60px_70px] gap-2 px-3 py-2 border-t border-slate-50 items-center cursor-pointer hover:bg-slate-50 transition-colors"
              :class="{ 'bg-emerald-50/60 hover:bg-emerald-50/80': selectedStockCode === s.code, 'bg-orange-50/40': idx === 0 && !selectedStockCode }"
            >
              <span class="text-xs font-bold text-center rounded" :class="idx < 3 ? (idx === 0 ? 'bg-orange-100 text-orange-600' : idx === 1 ? 'bg-slate-200 text-slate-600' : 'bg-amber-100 text-amber-700') : 'text-slate-400'">{{ idx + 1 }}</span>
              <div class="flex items-center gap-1.5 min-w-0">
                <span class="font-bold text-slate-800 text-sm truncate">{{ s.name }}</span>
                <span class="font-mono text-xs text-blue-600 flex-shrink-0 cursor-pointer hover:text-blue-800 hover:underline" :title="'点击复制 ' + s.name + ' 代码'" @click.stop="copyCode(s.code, s.name)">{{ copiedCode === s.code ? '已复制' : s.code }}</span>
              </div>
              <div class="flex items-center justify-end gap-1 min-w-0">
                <div class="h-1.5 rounded-full bg-slate-100 overflow-hidden flex-1" :title="`出现 ${s.count} 次`">
                  <div class="h-full rounded-full" :class="idx < 3 ? 'bg-orange-400' : 'bg-emerald-400'" :style="{ width: `${Math.min(100, s.count / maxStockCount * 100)}%` }"></div>
                </div>
                <span class="text-sm font-bold text-slate-700 flex-shrink-0">{{ s.count }}</span>
              </div>
              <span class="text-xs font-semibold text-right tabular-nums" :class="freqChgClass(s.code)">{{ freqChgText(s.code) }}</span>
            </div>
          </div>
        </div>
        <p v-if="selectedStockCode" class="text-[11px] text-emerald-600 mt-2 flex-shrink-0">
          已筛选「{{ stockFrequency.find(s => s.code === selectedStockCode)?.name || '' }} {{ selectedStockCode }}」 ·
          <button @click.prevent="selectedStockCode = ''" class="underline underline-offset-2 hover:text-emerald-700">取消</button>
        </p>
      </section>

      <!-- 第四栏：监听控制 + 图片提取 -->
      <section class="bg-white rounded-xl p-2.5 card-shadow flex flex-col h-full min-w-0 overflow-hidden">
        <!-- 顶部操作栏（在可滚动区域外，避免下拉菜单被裁剪） -->
        <div class="flex flex-wrap items-center justify-between gap-2 flex-shrink-0 min-w-0">
          <h3 class="text-sm font-bold text-slate-800 flex items-center gap-1.5">
            <Radio class="w-4 h-4 text-emerald-500" />微信自动选股提取
          </h3>
          <div class="flex flex-wrap items-center justify-end gap-1 min-w-0">
            <button
              v-if="selectedDate"
              @click="selectedDate = ''"
              class="h-7 px-2 rounded-lg border border-violet-200 text-violet-600 bg-violet-50/50 text-[11px] hover:bg-violet-50 flex items-center gap-1"
            >
              <X class="w-3 h-3" />取消筛选
            </button>
            <!-- 清空菜单 -->
            <div class="relative" v-if="events.length">
              <button
                @click="clearDropdownOpen = !clearDropdownOpen"
                :disabled="busy"
                class="h-7 px-2 rounded-lg border border-red-100 text-red-500 bg-red-50/40 text-[11px] hover:bg-red-50 disabled:opacity-50 flex items-center gap-1"
              >
                <Trash2 class="w-3 h-3" />清空
                <ChevronDown class="w-2.5 h-2.5" />
              </button>
              <div
                v-if="clearDropdownOpen"
                class="absolute right-0 top-full mt-1 z-50 bg-white rounded-lg border border-slate-200 shadow-lg py-1 min-w-[130px]"
                @mouseleave="clearDropdownOpen = false"
              >
                <button @click="clearAllEvents" class="w-full text-left px-3 py-1.5 text-[11px] text-red-600 hover:bg-red-50 flex items-center gap-2">
                  <Trash2 class="w-3 h-3" />清空全部消息
                </button>
                <div class="border-t border-slate-100 my-1"></div>
                <button
                  v-for="c in categoryOptions"
                  :key="c.value"
                  @click="clearByCategory(c.value)"
                  class="w-full text-left px-3 py-1.5 text-[11px] text-slate-700 hover:bg-slate-50 flex items-center gap-2"
                >
                  <Trash2 class="w-3 h-3" />清空{{ c.label }}
                </button>
              </div>
            </div>
            <button @click="refreshStatus" :disabled="busy" class="h-7 px-2 rounded-lg border border-slate-200 text-[11px] text-slate-600 hover:bg-slate-50 flex items-center gap-1 disabled:opacity-50">
              <RefreshCw class="w-3 h-3" :class="{ 'animate-spin': refreshing }" />刷新
            </button>
            <button v-if="!status.running" @click="startMonitor" :disabled="busy || !status.javaAvailable" class="h-7 px-3 rounded-lg bg-emerald-500 text-white text-[11px] font-semibold hover:bg-emerald-600 disabled:opacity-50 flex items-center gap-1">
              <Play class="w-3 h-3" />启动
            </button>
            <button v-else @click="stopMonitor" :disabled="busy" class="h-7 px-3 rounded-lg bg-red-50 text-red-600 border border-red-100 text-[11px] font-semibold hover:bg-red-100 disabled:opacity-50 flex items-center gap-1">
              <Square class="w-3 h-3" />停止
            </button>
          </div>
        </div>

        <div class="flex-1 min-h-0 overflow-y-auto overflow-x-hidden pr-0.5 mt-3 space-y-3">
          <div class="grid grid-cols-2 gap-2">
            <div class="rounded-lg p-2 border" :class="stateCardClass">
                <p class="text-[10px] opacity-70">监听状态</p>
                <p class="mt-0.5 text-[11px] font-bold flex items-center gap-1"><span class="w-1.5 h-1.5 rounded-full" :class="stateDotClass"></span>{{ stateLabel }}</p>
              </div>
              <div class="rounded-lg bg-blue-50 border border-blue-100 p-2">
                <p class="text-[10px] text-blue-500">扫描会话</p>
                <p class="mt-0.5 text-[11px] font-bold text-blue-800 truncate" :title="status.chatName">{{ status.chatName || '等待识别' }}</p>
              </div>
              <div class="rounded-lg bg-violet-50 border border-violet-100 p-2">
                <p class="text-[10px] text-violet-500">Java 环境</p>
                <p class="mt-0.5 text-[11px] font-bold text-violet-800">{{ status.javaAvailable ? 'JDK 21 就绪' : '未找到' }}</p>
              </div>
              <div class="rounded-lg bg-amber-50 border border-amber-100 p-2">
                <p class="text-[10px] text-amber-500">已提取消息</p>
                <p class="mt-0.5 text-[11px] font-bold text-amber-800">{{ filteredEvents.length }} 条<span v-if="selectedDate" class="text-amber-500 font-normal"> / {{ events.length }}</span></p>
              </div>
            </div>

            <div v-if="status.lastError || pageError" class="mt-2 px-2.5 py-2 rounded-lg bg-red-50 text-red-600 text-[11px] flex items-start gap-1.5">
              <CircleAlert class="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
              <span>{{ pageError || status.lastError }}</span>
            </div>
            <div v-else-if="status.state === 'NO_WINDOW'" class="mt-2 px-2.5 py-2 rounded-lg bg-amber-50 text-amber-700 text-[11px] flex items-center gap-1.5">
              <MonitorUp class="w-3.5 h-3.5" />未找到微信窗口，请打开微信电脑版。
            </div>
            <div v-else-if="status.state === 'NO_MESSAGE_LIST'" class="mt-2 px-2.5 py-2 rounded-lg bg-amber-50 text-amber-700 text-[11px] flex items-center gap-1.5">
              <MessagesSquare class="w-3.5 h-3.5" />已找到窗口，请先打开一个聊天会话。
            </div>

          <!-- AI 汇总操作 -->
          <div>
            <div class="flex items-center justify-between mb-2">
              <h4 class="text-xs font-bold text-slate-700 flex items-center gap-1.5"><Sparkles class="w-3.5 h-3.5 text-violet-500" />AI 分析</h4>
              <span class="text-[10px] text-slate-400">{{ whitelist.length }} 白名单</span>
            </div>
            <div class="flex items-center gap-1 mb-2">
              <select v-model="summaryDays" class="h-7 px-1.5 rounded border border-slate-200 text-[11px] bg-white flex-shrink-0">
                <option :value="1">最近1天</option>
                <option :value="3">最近3天</option>
                <option :value="7">最近7天</option>
                <option :value="14">最近14天</option>
                <option :value="30">最近30天</option>
              </select>
              <button
                @click="openMarketSelectDialog"
                class="flex-1 h-7 rounded bg-gradient-to-r from-violet-500 to-indigo-500 text-white text-[11px] font-semibold hover:from-violet-600 hover:to-indigo-600 flex items-center justify-center gap-1"
              >
                <Sparkles class="w-3 h-3" />AI 分析全部消息
              </button>
            </div>
          </div>

          <!-- 图片/文字上传提取股票 -->
          <div @paste="onPaste">
            <h4 class="text-xs font-bold text-slate-700 flex items-center gap-1.5 mb-2"><ScanSearch class="w-3.5 h-3.5 text-emerald-500" />图片/文字提取股票</h4>
            <div class="flex flex-col gap-2">
              <textarea
                v-model="extractTextInput"
                placeholder="粘贴文字消息（支持 Ctrl+V 粘贴图片）..."
                class="w-full h-16 px-2 py-1.5 rounded border border-slate-200 text-[11px] resize-none focus:outline-none focus:border-emerald-400"
              ></textarea>
              <div class="flex gap-1">
                <label class="flex-1 h-7 rounded bg-emerald-50 border border-emerald-200 text-emerald-700 text-[11px] font-semibold hover:bg-emerald-100 flex items-center justify-center gap-1 cursor-pointer">
                  <ScanSearch class="w-3 h-3" />上传图片
                  <input type="file" accept="image/*" multiple class="hidden" @change="onImageSelect" />
                </label>
                <button
                  @click="runExtract"
                  :disabled="extracting"
                  class="flex-1 h-7 rounded bg-gradient-to-r from-emerald-500 to-teal-500 text-white text-[11px] font-semibold hover:from-emerald-600 hover:to-teal-600 disabled:opacity-50 flex items-center justify-center gap-1"
                >
                  <Sparkles class="w-3 h-3" />{{ extracting ? '提取中...' : 'AI 提取' }}
                </button>
              </div>
              <p v-if="!selectedImageFiles.length" class="text-[10px] text-slate-400 flex items-center gap-1"><ClipboardPaste class="w-3 h-3" />在此区域按 Ctrl+V 可粘贴剪贴板图片</p>
              <!-- 多图缩略图列表 -->
              <div v-if="selectedImageFiles.length" class="flex flex-wrap gap-1.5">
                <div v-for="(img, idx) in selectedImageFiles" :key="idx" class="relative group/img w-16 h-16 rounded-lg border border-slate-200 overflow-hidden">
                  <img :src="img.url" class="w-full h-full object-cover" />
                  <button
                    @click="removeImage(idx)"
                    class="absolute top-0 right-0 w-4 h-4 bg-red-500 text-white rounded-bl flex items-center justify-center opacity-0 group-hover/img:opacity-100 transition-opacity"
                    title="删除此图"
                  >
                    <X class="w-2.5 h-2.5" />
                  </button>
                </div>
              </div>
              <div v-if="extractResult" class="rounded-lg border border-emerald-100 bg-emerald-50/40 p-2.5">
                <div class="flex items-center justify-between mb-1.5">
                  <span class="text-[10px] font-semibold text-emerald-700">提取结果（{{ extractResult.stocks?.length || 0 }} 只股票）</span>
                </div>
                <div v-if="extractResult.stocks?.length" class="flex flex-wrap gap-1">
                  <span
                    v-for="s in extractResult.stocks"
                    :key="s.code"
                    class="px-2 py-0.5 rounded bg-white border border-emerald-200 text-[10px] font-medium text-slate-700 flex items-center gap-1"
                  >
                    {{ s.name }} <span class="text-emerald-600">{{ s.code }}</span>
                    <button
                      @click="addStockFromExtract(s)"
                      :disabled="addingStockCode === s.code || s._added"
                      class="ml-0.5 px-1 rounded text-[9px] flex items-center gap-0.5 transition-colors disabled:opacity-60"
                      :class="s._added ? 'bg-slate-100 text-slate-400' : 'bg-emerald-500 text-white hover:bg-emerald-600'"
                      :title="s._added ? '已添加' : '添加到股票列表'"
                    >
                      <Plus class="w-2.5 h-2.5" />{{ s._added ? '已添加' : '添加' }}
                    </button>
                  </span>
                </div>
                <p v-else class="text-[10px] text-slate-400">未识别到股票</p>
              </div>

              <!-- 投资人绑定 & 保存 -->
              <div v-if="extractTextInput" class="mt-1 rounded-lg border border-indigo-100 bg-indigo-50/40 p-2.5">
                <div class="flex items-center justify-between mb-1.5">
                  <span class="text-[10px] font-semibold text-indigo-700 flex items-center gap-1">
                    <Users class="w-3 h-3" />绑定投资人并保存
                  </span>
                </div>
                <div class="grid grid-cols-2 gap-1.5 mb-1.5">
                  <div>
                    <label class="text-[9px] text-slate-500">投资人 / 推荐人</label>
                    <input
                      v-model="saveForm.sender"
                      list="sender-suggestions"
                      placeholder="如：王文林、杨海婷"
                      class="w-full mt-0.5 px-1.5 py-1 rounded border border-slate-200 text-[10px] focus:outline-none focus:border-indigo-400"
                    />
                    <datalist id="sender-suggestions">
                      <option v-for="s in senderSuggestions" :key="s" :value="s">{{ s }}</option>
                    </datalist>
                  </div>
                  <div>
                    <label class="text-[9px] text-slate-500">推荐日期</label>
                    <input
                      v-model="saveForm.recommendationDate"
                      type="date"
                      class="w-full mt-0.5 px-1.5 py-1 rounded border border-slate-200 text-[10px] focus:outline-none focus:border-indigo-400"
                    />
                  </div>
                </div>
                <div class="grid grid-cols-2 gap-1.5 mb-1.5">
                  <div>
                    <label class="text-[9px] text-slate-500">群聊名称（可选）</label>
                    <input
                      v-model="saveForm.chatName"
                      placeholder="如：牛股推荐群"
                      class="w-full mt-0.5 px-1.5 py-1 rounded border border-slate-200 text-[10px] focus:outline-none focus:border-indigo-400"
                    />
                  </div>
                  <div>
                    <label class="text-[9px] text-slate-500">消息分类</label>
                    <select
                      v-model="saveForm.category"
                      class="w-full mt-0.5 px-1.5 py-1 rounded border border-slate-200 text-[10px] focus:outline-none focus:border-indigo-400 bg-white"
                    >
                      <option value="">自动识别</option>
                      <option value="stock_pick">推票消息</option>
                      <option value="market_news">行情消息</option>
                      <option value="marketing">营销消息</option>
                    </select>
                  </div>
                </div>
                <div class="flex items-center justify-between">
                  <p v-if="saveMsg" :class="saveMsgTypeClass">{{ saveMsg }}</p>
                  <div v-else class="flex-1"></div>
                  <button
                    @click="saveExtractResult"
                    :disabled="savingExtract"
                    class="h-7 px-3 rounded bg-gradient-to-r from-indigo-500 to-violet-500 text-white text-[10px] font-semibold hover:from-indigo-600 hover:to-violet-600 disabled:opacity-50 flex items-center gap-1"
                  >
                    <Save class="w-3 h-3" />{{ savingExtract ? '保存中...' : '保存为推票/行情消息' }}
                  </button>
                </div>
              </div>
              <p v-if="extractError" class="text-[10px] text-red-500">{{ extractError }}</p>
            </div>
          </div>
        </div>
      </section>
    </div>

    <!-- 投资人分析 -->
    <section class="mt-4 bg-white rounded-xl p-4 card-shadow">
      <div class="flex items-center justify-between mb-3">
        <h3 class="text-sm font-bold text-slate-700 flex items-center gap-1.5">
          <Users class="w-4 h-4 text-indigo-500" />投资人分析
          <span class="text-[10px] text-slate-400 font-normal">T+1规则：D0涨幅>
            <input v-model.number="investorThreshold" min="0.5" max="50" step="0.5" type="number"
                   class="w-11 h-4 text-[10px] text-indigo-600 font-semibold border-b border-indigo-300 text-center bg-transparent outline-none focus:border-indigo-500" />
            % 需D1开盘仍保持才算有效止盈
          </span>
        </h3>
        <div class="flex items-center gap-2">
          <select v-model="investorDays" @change="loadInvestorAnalysis" class="text-[11px] rounded border border-slate-200 px-2 py-0.5 outline-none">
            <option :value="7">近 7 天</option>
            <option :value="14">近 14 天</option>
            <option :value="30">近 30 天</option>
            <option :value="60">近 60 天</option>
          </select>
          <button @click="openManualTracking()" class="text-[11px] text-emerald-500 hover:underline flex items-center gap-0.5">
            <UserPlus class="w-3 h-3" />新增投资人
          </button>
          <button @click="loadInvestorAnalysis" :disabled="investorLoading" class="text-[11px] text-blue-500 hover:underline disabled:opacity-50">
            {{ investorLoading ? '加载中...' : '刷新' }}
          </button>
        </div>
      </div>
      <div v-if="investorList.length === 0" class="text-[11px] text-slate-400 text-center py-4">
        暂无分析数据，请先刷新股价
      </div>
      <div v-else class="overflow-x-auto">
        <table class="w-full text-[12px]">
          <thead class="bg-slate-50 text-slate-500">
            <tr>
              <th class="px-2 py-2 text-left font-medium cursor-pointer hover:text-indigo-600" @click="toggleInvestorSort('sender')">
                推荐人 {{ investorSortKey === 'sender' ? (investorSortDesc ? '↓' : '↑') : '' }}
              </th>
              <th class="px-2 py-2 text-right font-medium cursor-pointer hover:text-indigo-600" @click="toggleInvestorSort('totalPicks')">
                推荐数 {{ investorSortKey === 'totalPicks' ? (investorSortDesc ? '↓' : '↑') : '' }}
              </th>
              <th class="px-2 py-2 text-right font-medium" title="胜 = T+1 有效止盈通过；平 = 涨幅 ≥ 0 但未通过 T+1；负 = 涨幅 < 0">胜/平/负</th>
              <th class="px-2 py-2 text-right font-medium cursor-pointer hover:text-indigo-600" @click="toggleInvestorSort('effectiveWinRate')">
                <span title="T+1 有效止盈率 = 有效止盈 / 已评估总数
总股票 = 有效止盈(✅) + 未达止盈线(—) + 亏损(❌)
  ✅ 有效止盈：最终累计涨幅>0 且 T+1 规则通过
  — 未达止盈线：最终累计涨幅>0 但还没达到阈值（5%）
  ❌ 亏损：最终累计涨幅 ≤ 0">
                  🎯 有效止盈率 {{ investorSortKey === 'effectiveWinRate' ? (investorSortDesc ? '↓' : '↑') : '' }}
                </span>
              </th>
              <th class="px-2 py-2 text-right font-medium" title="本周一至今的有效止盈率">
                🎯 本周
              </th>
              <th class="px-2 py-2 text-right font-medium cursor-pointer hover:text-indigo-600" @click="toggleInvestorSort('winRate')" title="T+1 有效止盈率（含今日）= 有效止盈数 / 已评估总数（不剔除今日）">
                📈 累计胜率 {{ investorSortKey === 'winRate' ? (investorSortDesc ? '↓' : '↑') : '' }}
              </th>
              <th class="px-2 py-2 text-right font-medium" title="本周一至今的累计胜率">
                📈 本周
              </th>
              <th class="px-2 py-2 text-right font-medium cursor-pointer hover:text-indigo-600" @click="toggleInvestorSort('avgHoldDays')" title="从买入到首次有效止盈的平均持仓天数">
                📅 平均持仓天数 {{ investorSortKey === 'avgHoldDays' ? (investorSortDesc ? '↓' : '↑') : '' }}
              </th>
              <th class="px-2 py-2 text-right font-medium cursor-pointer hover:text-indigo-600" @click="toggleInvestorSort('avgChangePercent')">
                平均涨幅 {{ investorSortKey === 'avgChangePercent' ? (investorSortDesc ? '↓' : '↑') : '' }}
              </th>
              <th class="px-2 py-2 text-center font-medium">操作</th>
              <th class="px-2 py-2 text-center font-medium">删除</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="inv in sortedInvestorList" :key="inv.sender" class="border-b border-slate-50 hover:bg-slate-50">
              <td class="px-2 py-2 font-medium text-slate-700">{{ inv.sender }}</td>
              <td class="px-2 py-2 text-right text-slate-600">{{ inv.totalPicks }}</td>
              <td class="px-2 py-2 text-right">
                <span class="text-red-500">{{ inv.winCount }}</span> /
                <span class="text-slate-400">{{ inv.flatCount }}</span> /
                <span class="text-green-500">{{ inv.lossCount }}</span>
                <span v-if="inv.pendingCount" class="text-amber-500 ml-1">· 待算{{ inv.pendingCount }}</span>
              </td>
              <td class="px-2 py-2 text-right">
                <template v-if="inv.effectiveWinRate !== null && inv.effectiveWinRate !== undefined">
                  <span class="font-bold text-red-500">{{ inv.effectiveWinRate.toFixed(1) }}%</span>
                  <div class="text-[9px] text-slate-400 mt-0.5 cursor-default"
                       :title="`共 ${inv.effectiveEvaluatedCount ?? inv.evaluatedCount} 只可评估股票（剔除今日 ${inv.todayExcludedCount || 0} 只）
✅ 有效止盈（通过T+1）：${inv.effectiveWinCount} 只
— 未达止盈线（涨幅>0但未到阈值）：${inv.effectiveLossCount} 只
❌ 亏损（累计涨幅≤0）：${inv.effectiveNoprizeCount || 0} 只
参与 T+1 检验的股票：${inv.effectiveTestCount || inv.effectiveWinCount + inv.effectiveLossCount} 只（仅涨幅>0的才参加）`">
                    <span class="text-emerald-500">✅{{ inv.effectiveWinCount }}</span>
                    <span class="text-slate-300 mx-0.5">·</span>
                    <span class="text-slate-400">—{{ inv.effectiveLossCount }}</span>
                    <span v-if="inv.effectiveNoprizeCount > 0" class="text-slate-300 mx-0.5">·</span>
                    <span v-if="inv.effectiveNoprizeCount > 0" class="text-rose-400">❌{{ inv.effectiveNoprizeCount }}</span>
                    <template v-if="inv.todayExcludedCount > 0">
                      <span class="text-slate-300 mx-0.5">·</span>
                      <span class="text-amber-500">剔除今日{{ inv.todayExcludedCount }}</span>
                    </template>
                  </div>
                </template>
                <span v-else class="text-amber-500">待刷新</span>
              </td>
              <td class="px-2 py-2 text-right">
                <template v-if="inv.week">
                  <span v-if="inv.week.effectiveWinRate !== null && inv.week.effectiveWinRate !== undefined" class="text-red-500 font-semibold">{{ inv.week.effectiveWinRate.toFixed(1) }}%</span>
                  <span v-else class="text-slate-300 text-[11px]">本周无</span>
                </template>
                <span v-else class="text-slate-300 text-[11px]">--</span>
              </td>
              <td class="px-2 py-2 text-right text-slate-500">
                <span v-if="inv.winRate !== null && inv.winRate !== undefined">{{ inv.winRate.toFixed(1) }}%</span>
                <span v-else class="text-slate-300">--</span>
              </td>
              <td class="px-2 py-2 text-right">
                <template v-if="inv.week">
                  <span v-if="inv.week.winRate !== null && inv.week.winRate !== undefined" class="text-slate-600">{{ inv.week.winRate.toFixed(1) }}%</span>
                  <span v-else class="text-slate-300 text-[11px]">本周无</span>
                </template>
                <span v-else class="text-slate-300 text-[11px]">--</span>
              </td>
              <td class="px-2 py-2 text-right">
                <span v-if="inv.avgHoldDays !== null && inv.avgHoldDays !== undefined" class="font-bold text-indigo-600">
                  {{ inv.avgHoldDays }} 天
                  <span v-if="inv.hitCount > 0" class="text-[10px] text-slate-400 font-normal">
                    共{{ inv.totalPicks }}只 达{{ inv.hitCount }}只
                  </span>
                </span>
                <span v-else class="text-slate-300 text-[10px]">暂无有效止盈</span>
              </td>
              <td class="px-2 py-2 text-right" :class="avgChangeColor(inv.avgChangePercent)">
                <template v-if="inv.avgChangePercent !== null && inv.avgChangePercent !== undefined">{{ inv.avgChangePercent >= 0 ? '+' : '' }}{{ inv.avgChangePercent.toFixed(2) }}%</template>
                <span v-else class="text-slate-300">--</span>
              </td>
              <td class="px-2 py-2 text-center whitespace-nowrap">
                <button @click="filterByInvestor(inv.sender)" class="text-blue-500 hover:underline">查看推票</button>
                <button @click="openManualTracking(inv.sender)" class="text-emerald-500 hover:underline ml-1">绑定股票</button>
              </td>
              <td class="px-2 py-2 text-center">
                <button @click="deleteInvestor(inv.sender)" class="text-red-400 hover:text-red-600 hover:underline" title="删除该投资人及其所有推票记录">删除</button>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </section>

    <!-- 投资人追踪 -->
    <section class="mt-4 bg-white rounded-xl p-4 card-shadow">
      <div class="flex items-center justify-between mb-2">
        <h3 class="text-sm font-bold text-slate-700 flex items-center gap-1.5">
          <TrendingUp class="w-4 h-4 text-blue-500" />推票追踪
          <span v-if="trackingStocks.length" class="text-[10px] text-slate-400 font-normal">共 {{ trackingStocks.length }} 只</span>
          <span v-if="trackingSummary.lockedCount" class="text-[10px] px-1.5 py-0.5 rounded bg-gradient-to-r from-amber-50 to-yellow-50 text-amber-700 font-bold border border-amber-300 shadow-[0_1px_2px_rgba(180,130,0,0.08)]">🔒 止盈 {{ trackingSummary.lockedCount }}</span>
          <template v-if="trackingStocks.length && !batchSelectMode">
            <span class="text-[10px] px-1.5 py-0.5 rounded bg-red-50 text-red-500 font-bold border border-red-100">↑ {{ trackingSummary.upCount }}</span>
            <span class="text-[10px] px-1.5 py-0.5 rounded bg-green-50 text-green-500 font-bold border border-green-100">↓ {{ trackingSummary.downCount }}</span>
            <span v-if="trackingSummary.flatCount" class="text-[10px] px-1.5 py-0.5 rounded bg-slate-50 text-slate-500 font-bold border border-slate-100">— {{ trackingSummary.flatCount }}</span>
            <span v-if="trackingSummary.pendingCount" class="text-[10px] px-1.5 py-0.5 rounded bg-amber-50 text-amber-500 font-bold border border-amber-100">? {{ trackingSummary.pendingCount }}</span>
          </template>
          <span v-if="batchSelectMode && selectedTrackingIds.size" class="text-[10px] text-red-500 font-normal">已选 {{ selectedTrackingIds.size }} 只</span>
          <span v-if="filterSender" class="text-[10px] text-blue-500 font-normal cursor-pointer" @click="clearInvestorFilter">× {{ filterSender }}</span>
        </h3>
        <div class="flex items-center gap-3">
          <!-- 排序按钮 -->
          <template v-if="!batchSelectMode && trackingStocks.length">
            <span class="text-[10px] text-slate-400">排序</span>
            <button @click="setTrackingSort('pickDate')" class="text-[10px] px-1.5 py-0.5 rounded transition-colors"
              :class="trackingSortKey === 'pickDate' ? 'bg-blue-100 text-blue-600 font-semibold' : 'text-slate-500 hover:text-slate-700'">
              推荐日期 {{ trackingSortKey === 'pickDate' ? (trackingSortDesc ? '↓' : '↑') : '' }}
            </button>
            <button @click="setTrackingSort('totalChangePercent')" class="text-[10px] px-1.5 py-0.5 rounded transition-colors"
              :class="trackingSortKey === 'totalChangePercent' ? 'bg-blue-100 text-blue-600 font-semibold' : 'text-slate-500 hover:text-slate-700'">
              涨幅 {{ trackingSortKey === 'totalChangePercent' ? (trackingSortDesc ? '↓' : '↑') : '' }}
            </button>
            <button @click="setTrackingSort('totalChangeAmount')" class="text-[10px] px-1.5 py-0.5 rounded transition-colors"
              :class="trackingSortKey === 'totalChangeAmount' ? 'bg-blue-100 text-blue-600 font-semibold' : 'text-slate-500 hover:text-slate-700'">
              变动金额 {{ trackingSortKey === 'totalChangeAmount' ? (trackingSortDesc ? '↓' : '↑') : '' }}
            </button>
            <button @click="setTrackingSort('holdingDays')" class="text-[10px] px-1.5 py-0.5 rounded transition-colors"
              :class="trackingSortKey === 'holdingDays' ? 'bg-blue-100 text-blue-600 font-semibold' : 'text-slate-500 hover:text-slate-700'">
              持仓天数 {{ trackingSortKey === 'holdingDays' ? (trackingSortDesc ? '↓' : '↑') : '' }}
            </button>
          </template>
          <template v-if="batchSelectMode">
            <button @click="selectAllTracking" class="text-[11px] text-slate-500 hover:underline">{{ selectedTrackingIds.size === trackingStocks.length ? '取消全选' : '全选' }}</button>
            <button @click="batchChangePickDate" :disabled="batchDeleting || !selectedTrackingIds.size" class="text-[11px] text-emerald-500 hover:underline disabled:opacity-50">
              改日期({{ selectedTrackingIds.size }})
            </button>
            <button @click="batchDeleteTracking" :disabled="batchDeleting || !selectedTrackingIds.size" class="text-[11px] text-red-500 hover:underline disabled:opacity-50">
              {{ batchDeleting ? '删除中...' : `删除选中(${selectedTrackingIds.size})` }}
            </button>
            <button @click="exitBatchSelectMode" :disabled="batchDeleting" class="text-[11px] text-slate-400 hover:underline disabled:opacity-50">退出</button>
          </template>
          <template v-else>
            <button @click="refreshAllTrackingPrices" :disabled="batchRefreshing" class="text-[11px] text-orange-500 hover:underline disabled:opacity-50">
              {{ batchRefreshing ? `批量刷新中(${batchRefreshProgress}/${batchRefreshTotal})...` : '刷新全部股价' }}
            </button>
            <span class="text-[10px] text-slate-400 font-mono" title="距离下次自动刷新股价">{{ batchRefreshing ? '' : priceRefreshCountdown }}</span>
            <button v-if="trackingStocks.length" @click="enterBatchSelectMode" class="text-[11px] text-red-500 hover:underline">批量操作</button>
            <button v-if="trackingStocks.length" @click="openDeleteByDateDialog" class="text-[11px] text-red-500 hover:underline">按日期删除</button>
            <button @click="loadTrackingStocks" :disabled="trackingLoading" class="text-[11px] text-blue-500 hover:underline disabled:opacity-50">
              {{ trackingLoading ? '加载中...' : '刷新列表' }}
            </button>
          </template>
        </div>
      </div>
      <div v-if="trackingStocks.length === 0" class="text-[11px] text-slate-400 text-center py-4">
        暂无追踪数据，推票消息中的股票将自动加入追踪
      </div>
      <div v-else class="space-y-2">
        <div v-for="t in sortedTrackingStocks" :key="t.id"
             @click="batchSelectMode && toggleSelectTracking(t.id)"
             :class="[
               'rounded-lg border p-3 transition-colors',
               batchSelectMode ? 'cursor-pointer' : '',
               batchSelectMode && selectedTrackingIds.has(t.id) ? 'border-red-300 bg-red-50' : t.isEffectiveProfit ? 'border-emerald-200 bg-emerald-50/60' : 'border-slate-100 hover:bg-slate-50'
             ]">
          <div class="flex items-center justify-between gap-3">
            <div class="flex items-center gap-1.5 flex-wrap min-w-0">
              <input v-if="batchSelectMode" type="checkbox" :checked="selectedTrackingIds.has(t.id)" @click.stop @change="toggleSelectTracking(t.id)" class="w-3.5 h-3.5 cursor-pointer flex-shrink-0" />
              <span class="text-sm font-semibold text-slate-700 flex-shrink-0">{{ t.stockName }}</span>
              <span v-if="t.isEffectiveProfit && t.effectiveProfitDayIndex !== null" class="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full bg-emerald-100 text-emerald-700 text-[10px] font-bold border border-emerald-200 flex-shrink-0"
                    :title="`T+1规则下有效止盈
第 ${t.effectiveProfitDayIndex} 天达到，当时累计涨幅 ${t.effectiveProfitPercent !== null ? (t.effectiveProfitPercent >= 0 ? '+' : '') + t.effectiveProfitPercent.toFixed(2) + '%' : '--'}
（此值锁定，不会随最新股价变动而变化）`">
                ✅ 有效止盈 D{{ t.effectiveProfitDayIndex }}
                <span v-if="t.effectiveProfitPercent !== null" class="ml-0.5 font-black text-red-500">{{ t.effectiveProfitPercent >= 0 ? '+' : '' }}{{ t.effectiveProfitPercent.toFixed(2) }}%</span>
              </span>
              <span class="text-xs text-slate-400 flex-shrink-0">{{ t.stockCode }}</span>
              <span class="text-xs text-slate-300 flex-shrink-0">|</span>
              <span class="text-xs text-indigo-500 flex-shrink-0">{{ t.sender }}</span>
              <span class="text-xs text-slate-400 flex-shrink-0">{{ t.pickDate }}</span>
            </div>
            <div class="flex items-center gap-2 flex-shrink-0">
              <template v-if="t.isEffectiveProfit && t.effectiveProfitPercent !== null">
                <span class="text-[10px] text-slate-400 flex-shrink-0" :title="`第 ${t.effectiveProfitDayIndex} 天 T+1 规则通过时的累计涨幅（锁定值，不会随最新股价变化）`">止盈</span>
                <span class="text-sm font-bold flex items-center gap-1 tabular-nums min-w-[54px] justify-end text-red-500"
                      :title="`止盈时刻 +${t.effectiveProfitPercent.toFixed(2)}%（D${t.effectiveProfitDayIndex}）；最新累计 ${t.totalChangePercent !== null ? (t.totalChangePercent >= 0 ? '+' : '') + t.totalChangePercent.toFixed(2) + '%' : '--'}，点详情可查每日明细`">
                  +{{ t.effectiveProfitPercent.toFixed(2) }}%
                </span>
              </template>
              <template v-else-if="t.totalChangePercent !== null && t.totalChangePercent !== undefined">
                <span class="text-[10px] text-slate-400 flex-shrink-0" title="从推荐日开盘价到最新收盘价的累计涨幅，每日自动刷新">最新</span>
                <span :class="t.totalChangePercent >= 0 ? 'text-red-500' : 'text-green-500'"
                      class="text-sm font-bold flex items-center gap-1 tabular-nums min-w-[54px] justify-end"
                      :title="`最新累计涨幅 ${t.totalChangePercent >= 0 ? '+' : ''}${t.totalChangePercent.toFixed(2)}%（每日刷新，盘中有实时更新）`">
                  {{ t.totalChangePercent >= 0 ? '+' : '' }}{{ t.totalChangePercent.toFixed(2) }}%
                  <span v-if="t.latestCloseIsRealTime" class="inline-block w-1.5 h-1.5 rounded-full bg-orange-400 animate-pulse flex-shrink-0" title="盘中实时数据"></span>
                </span>
              </template>
              <span v-else class="text-xs text-slate-300 min-w-[72px] text-right">待刷新</span>
              <template v-if="!batchSelectMode">
                <button @click="toggleDailyDetail(t.id)" class="text-xs text-blue-400 hover:underline min-w-[28px] text-center flex-shrink-0">
                  {{ expandedTracking === t.id ? '收起' : '详情' }}
                </button>
                <button v-if="!t.locked" @click="refreshTrackingPrice(t.id)" class="text-xs text-orange-400 hover:underline min-w-[28px] text-center flex-shrink-0">刷新</button>
                <button v-else class="min-w-[28px] flex-shrink-0"></button>
                <button @click="lockTrackingStock(t)" class="text-xs hover:underline min-w-[42px] text-center flex-shrink-0"
                  :class="t.locked ? 'text-slate-400 cursor-default' : 'text-amber-500 hover:text-amber-600'">
                  {{ t.locked ? '已锁定' : '手动锁定' }}
                </button>
                <button @click="deleteTrackingStock(t)" class="text-xs text-red-400 hover:underline min-w-[28px] text-center flex-shrink-0">删除</button>
              </template>
            </div>
          </div>
          <div class="grid grid-cols-4 gap-2 mt-1.5 text-xs">
            <div>
              <div class="text-[10px]" :class="(t.entryType ?? 0) === 0 ? 'text-red-500 font-semibold' : 'text-slate-400'">发布日开盘{{ (t.entryType ?? 0) === 0 ? ' ● 买入价' : '' }}</div>
              <div class="text-slate-700 font-medium">¥{{ t.pickOpenPrice || '--' }}</div>
            </div>
            <div>
              <div class="text-[10px]" :class="(t.entryType ?? 0) === 1 ? 'text-red-500 font-semibold' : 'text-slate-400'">
                {{ t.pickCloseIsRealTime ? '现价（盘中）' : '发布日收盘' }}{{ (t.entryType ?? 0) === 1 ? ' ● 买入价' : '' }}
                <span v-if="t.pickChangePercent !== null" :class="t.pickChangePercent >= 0 ? 'text-red-400' : 'text-green-500'">({{ t.pickChangePercent >= 0 ? '+' : '' }}{{ t.pickChangePercent.toFixed(2) }}%)</span>
              </div>
              <div class="text-slate-700 font-medium flex items-center gap-1">
                ¥{{ t.pickClosePrice || '--' }}
                <span v-if="t.pickCloseIsRealTime" class="inline-block w-1.5 h-1.5 rounded-full bg-orange-400 animate-pulse" title="盘中实时数据"></span>
              </div>
            </div>
            <div>
              <div class="text-slate-400 text-[10px]">
                {{ t.latestCloseIsRealTime ? `现价（盘中 ${t.latestDate}）` : `最新收盘 (${t.latestDate})` }}
              </div>
              <div class="text-slate-700 font-medium flex items-center gap-1">
                ¥{{ t.latestClosePrice || '--' }}
                <span v-if="t.latestCloseIsRealTime" class="inline-block w-1.5 h-1.5 rounded-full bg-orange-400 animate-pulse" title="盘中实时数据"></span>
              </div>
            </div>
            <div>
              <div class="text-slate-400 text-[10px] flex items-center gap-1">
                持仓天数
                <span v-if="t.isEffectiveProfit && t.effectiveProfitDayIndex !== null" class="text-[10px] text-emerald-500">（已止盈）</span>
              </div>
              <div class="font-semibold text-slate-700">
                <span v-if="t.holdingDays !== null && t.holdingDays !== undefined">{{ t.holdingDays }}<span class="text-[10px] text-slate-400 font-normal"> 天</span></span>
                <span v-else class="text-slate-300">--</span>
              </div>
            </div>
          </div>
          <!-- 买入方式切换 -->
          <div class="flex items-center gap-1 mt-1.5">
            <span class="text-[10px] text-slate-400">买入价基准：</span>
            <div class="flex rounded overflow-hidden border border-slate-200 text-[10px]">
              <button @click="switchEntryType(t, 0)" class="px-2 py-0.5 transition-colors" :class="(t.entryType ?? 0) === 0 ? 'bg-slate-800 text-white' : 'bg-white text-slate-500 hover:bg-slate-50'">开盘</button>
              <button @click="switchEntryType(t, 1)" class="px-2 py-0.5 transition-colors" :class="(t.entryType ?? 0) === 1 ? 'bg-slate-800 text-white' : 'bg-white text-slate-500 hover:bg-slate-50'">尾盘</button>
            </div>
          </div>
          <!-- 每日股价明细 -->
          <div v-if="expandedTracking === t.id" class="mt-2 border-t border-slate-100 pt-2">
            <div v-if="dailyLoading" class="text-[10px] text-slate-400 text-center py-2">加载中...</div>
            <div v-else-if="dailyData.length === 0" class="text-[10px] text-slate-400 text-center py-2">暂无每日明细，请先刷新股价</div>
            <div v-else class="overflow-x-auto">
              <table class="w-full text-[10px]">
                <thead class="text-slate-400">
                  <tr>
                    <th class="px-1.5 py-1 text-left font-medium">交易日</th>
                    <th class="px-1.5 py-1 text-center font-medium">第N天</th>
                    <th class="px-1.5 py-1 text-right font-medium">开盘</th>
                    <th class="px-1.5 py-1 text-right font-medium">盘中</th>
                    <th class="px-1.5 py-1 text-right font-medium">收盘</th>
                    <th class="px-1.5 py-1 text-right font-medium">最高</th>
                    <th class="px-1.5 py-1 text-right font-medium">最低</th>
                    <th class="px-1.5 py-1 text-right font-medium" title="D0 = (收盘-开盘)/开盘（早盘买入口径）&#10;D1+ = (收盘-前收)/前收（A股标准口径）">当日涨跌</th>
                    <th class="px-1.5 py-1 text-right font-medium" title="累计涨跌 = 当日收盘 vs 推票日开盘（买入价基准）">累计涨跌</th>
                    <th class="px-1.5 py-1 text-right font-medium">变动金额</th>
                  </tr>
                </thead>
                <tbody>
                  <tr v-for="d in dailyData" :key="d.id"
                      class="border-b border-slate-50 transition-colors"
                      :class="[
                        d.dayIndex === 0 ? 'bg-blue-50/60' : '',
                        d.isProfitDay ? 'bg-emerald-50/60' : '',
                      ]">
                    <td class="px-1.5 py-1">
                      <div class="flex items-center gap-1">
                        <span class="text-slate-600">{{ d.tradeDate }}</span>
                        <span v-if="d.dayIndex === 0" class="text-[9px] px-1 py-0.5 rounded bg-blue-100 text-blue-600 font-semibold">推票日</span>
                        <span v-if="d.isProfitDay" class="text-[9px] px-1 py-0.5 rounded bg-emerald-100 text-emerald-700 font-bold">✅ 止盈锁定</span>
                      </div>
                    </td>
                    <td class="px-1.5 py-1 text-center">
                      <span class="text-slate-400">D{{ d.dayIndex }}</span>
                      <span v-if="d.dayIndex === 0" class="text-[9px] text-blue-500 ml-0.5">·</span>
                    </td>
                    <td class="px-1.5 py-1 text-right text-slate-700">¥{{ d.openPrice?.toFixed(2) }}</td>
                    <td class="px-1.5 py-1 text-right">
                      <template v-if="d.isProfitDay">
                        <span class="text-emerald-600 font-bold">¥{{ d.intradayPrice?.toFixed(2) }}</span>
                        <span class="inline-block text-[9px] text-emerald-500 font-semibold ml-0.5" title="止盈瞬间固化价格">🔒</span>
                      </template>
                      <template v-else-if="d.intradayIsRealTime">
                        <span class="text-orange-500 font-semibold">¥{{ d.intradayPrice?.toFixed(2) }}</span>
                        <span class="inline-block w-1.5 h-1.5 rounded-full bg-orange-400 animate-pulse ml-0.5" title="盘中实时价格"></span>
                      </template>
                      <template v-else>
                        <span class="text-slate-600">¥{{ d.intradayPrice?.toFixed(2) }}</span>
                      </template>
                    </td>
                    <td class="px-1.5 py-1 text-right text-slate-700">¥{{ d.closePrice?.toFixed(2) }}</td>
                    <td class="px-1.5 py-1 text-right text-red-400">¥{{ d.highPrice?.toFixed(2) }}</td>
                    <td class="px-1.5 py-1 text-right text-green-400">¥{{ d.lowPrice?.toFixed(2) }}</td>
                    <td class="px-1.5 py-1 text-right" :class="d.dayChangePercent >= 0 ? 'text-red-500' : 'text-green-500'">
                      {{ d.dayChangePercent >= 0 ? '+' : '' }}{{ d.dayChangePercent?.toFixed(2) }}%
                    </td>
                    <td class="px-1.5 py-1 text-right font-medium" :class="d.totalChangePercent >= 0 ? 'text-red-500' : 'text-green-500'">
                      {{ d.totalChangePercent >= 0 ? '+' : '' }}{{ d.totalChangePercent?.toFixed(2) }}%
                    </td>
                    <td class="px-1.5 py-1 text-right" :class="d.totalChangeAmount >= 0 ? 'text-red-500' : 'text-green-500'">
                      {{ d.totalChangeAmount >= 0 ? '+' : '' }}¥{{ d.totalChangeAmount?.toFixed(3) }}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
    </section>

    <section class="mt-4 rounded-xl border border-blue-100 bg-blue-50 p-4 text-xs text-blue-700 leading-6">
      <p class="font-bold">使用说明</p>
      <p>1. 打开微信电脑版并停留在聊天首页；2. 进入本板块后监听会自动启动；3. 程序持续检查左侧全部会话的未读标记并自动切换；4. 任意新消息包含股票名称和 6 位代码时会自动提取。</p>
      <p>程序只读取微信窗口当前可见的 UI 控件，不破解、不解密微信本地数据库，也不会自动发送或回复任何消息。</p>
    </section>

    <!-- 分类反馈弹窗 -->
    <div v-if="categoryFeedback.show" class="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-sm" @mousedown.self="closeCategoryFeedback">
      <div class="bg-white rounded-2xl shadow-2xl w-[420px] p-5 animate-[fadeIn_0.2s_ease]">
        <div class="flex items-center justify-between mb-4">
          <h4 class="text-base font-bold text-slate-800 flex items-center gap-2">
            <Sparkles class="w-4 h-4 text-violet-500" />这条消息分类对吗？
          </h4>
          <button @click="closeCategoryFeedback" class="text-slate-400 hover:text-slate-600"><X class="w-4 h-4" /></button>
        </div>

        <div class="rounded-xl bg-slate-50 p-3 mb-4 max-h-36 overflow-y-auto text-[11px] text-slate-600 whitespace-pre-wrap leading-5">{{ categoryFeedback.messageText }}</div>

        <div class="flex items-center gap-2 mb-4">
          <span class="text-[11px] text-slate-500">当前自动分类：</span>
          <span class="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-semibold" :class="categoryBadgeClass(categoryFeedback.predictedCategory)">
            {{ categoryLabel(categoryFeedback.predictedCategory) }}
          </span>
        </div>

        <div v-if="categoryFeedback.showCorrectPicker" class="mb-4">
          <p class="text-[11px] text-slate-500 mb-2">请选择正确的分类：</p>
          <div class="grid grid-cols-3 gap-2">
            <button
              v-for="c in categoryOptions"
              :key="c.value"
              @click="categoryFeedback.correctedCategory = c.value"
              class="h-9 rounded-lg border text-[11px] font-semibold transition-colors"
              :class="categoryFeedback.correctedCategory === c.value ? c.activeClass : 'border-slate-200 text-slate-600 hover:bg-slate-50'"
            >
              {{ c.label }}
            </button>
          </div>
        </div>

        <div class="flex items-center gap-2">
          <button
            @click="submitCategoryFeedback(true)"
            class="flex-1 h-10 rounded-xl bg-emerald-500 text-white text-sm font-semibold hover:bg-emerald-600 flex items-center justify-center gap-1.5 transition-all"
          >
            ✓ 分类对的
          </button>
          <button
            v-if="!categoryFeedback.showCorrectPicker"
            @click="categoryFeedback.showCorrectPicker = true"
            class="flex-1 h-10 rounded-xl border border-red-100 bg-red-50 text-red-600 text-sm font-semibold hover:bg-red-100 flex items-center justify-center gap-1.5 transition-all"
          >
            ✗ 分类不对
          </button>
          <button
            v-else
            @click="submitCategoryFeedback(false)"
            :disabled="!categoryFeedback.correctedCategory"
            class="flex-1 h-10 rounded-xl bg-red-500 text-white text-sm font-semibold hover:bg-red-600 disabled:opacity-50 flex items-center justify-center gap-1.5 transition-all"
          >
            提交修正
          </button>
          <button
            @click="closeCategoryFeedback"
            class="h-10 px-3 rounded-xl border border-slate-200 text-slate-500 text-sm hover:bg-slate-50 transition-colors"
            title="跳过（不记录反馈）"
          >
            跳过
          </button>
        </div>

        <p v-if="categoryFeedback.statusText" class="mt-3 text-[11px] text-center" :class="categoryFeedback.statusText.includes('失败') ? 'text-red-500' : 'text-emerald-600'">
          {{ categoryFeedback.statusText }}
        </p>
      </div>
    </div>

    <!-- 删除消息：股票重复次数确认弹窗 -->
    <div v-if="deleteStocksDialog.visible" class="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-sm">
      <div class="bg-white rounded-2xl shadow-2xl w-[480px] max-w-[92vw] p-5 animate-[fadeIn_0.2s_ease]">
        <div class="flex items-center justify-between mb-3">
          <h4 class="text-base font-bold text-slate-800 flex items-center gap-2">
            <AlertTriangle class="w-4 h-4 text-amber-500" />确认删除消息
          </h4>
          <button v-if="!deleteStocksDialog.deleting" @click="deleteStocksDialog.visible = false" class="text-slate-400 hover:text-slate-600"><X class="w-4 h-4" /></button>
        </div>

        <div v-if="deleteStocksDialog.eventName" class="rounded-xl bg-slate-50 p-2.5 mb-3 text-[11px] text-slate-600 max-h-20 overflow-y-auto leading-5 whitespace-pre-wrap">{{ deleteStocksDialog.eventName }}</div>

        <div v-if="deleteStocksDialog.loading" class="py-6 text-center text-[11px] text-slate-400">正在查询涉及的股票...</div>

        <template v-else>
          <div v-if="!deleteStocksDialog.stocks.length" class="py-4 text-center text-[11px] text-slate-400">
            该消息未关联任何追踪股票，直接删除即可
          </div>
          <template v-else>
            <p class="text-[11px] text-slate-500 mb-2">该消息涉及以下股票，默认只删本消息的追踪，保留其他投资人的：</p>
            <div class="space-y-1.5 mb-3 max-h-60 overflow-y-auto pr-1">
              <div v-for="s in deleteStocksDialog.stocks" :key="s.code" class="flex items-center justify-between rounded-lg border border-slate-100 px-2.5 py-2 hover:bg-slate-50">
                <div class="flex items-center gap-2">
                  <span class="text-xs font-semibold text-slate-700">{{ s.name || s.code }}</span>
                  <span class="text-[10px] text-slate-400">{{ s.code }}</span>
                </div>
                <div class="flex items-center gap-2">
                  <template v-if="s.count > 1">
                    <span class="text-[10px] text-amber-500">{{ s.count }} 次引用</span>
                    <label class="flex items-center gap-1 text-[10px] cursor-pointer select-none">
                      <input type="checkbox" v-model="s.deleteAll" class="w-3 h-3" :disabled="deleteStocksDialog.deleting" />
                      <span :class="s.deleteAll ? 'text-red-500 font-semibold' : 'text-slate-500'">
                        {{ s.deleteAll ? '⚠ 删所有人' : '仅删本消息' }}
                      </span>
                    </label>
                  </template>
                  <template v-else>
                    <span class="text-[10px] text-emerald-500">唯一追踪</span>
                    <span class="text-[10px] text-slate-400">直接删</span>
                  </template>
                </div>
              </div>
            </div>
            <p class="text-[10px] text-slate-400 leading-4 mb-3">
              说明：重复引用的股票默认<b class="text-slate-500">仅删除本消息关联</b>，保留其他投资人的追踪记录。勾选才会一起删。
            </p>
          </template>
        </template>

        <div class="flex items-center justify-end gap-2">
          <button
            @click="deleteStocksDialog.visible = false"
            :disabled="deleteStocksDialog.deleting"
            class="h-9 px-4 rounded-xl border border-slate-200 text-slate-500 text-sm hover:bg-slate-50 transition-colors disabled:opacity-50"
          >
            取消
          </button>
          <button
            @click="confirmDeleteEventWithStocks"
            :disabled="deleteStocksDialog.deleting || deleteStocksDialog.loading"
            class="h-9 px-4 rounded-xl bg-red-500 text-white text-sm font-semibold hover:bg-red-600 transition-colors disabled:opacity-50 flex items-center gap-1.5"
          >
            <Trash2 v-if="!deleteStocksDialog.deleting" class="w-3.5 h-3.5" />
            {{ deleteStocksDialog.deleting ? '删除中...' : '确认删除' }}
          </button>
        </div>
      </div>
    </div>

    <!-- 规则管理弹窗（训练规则 + 训练数据） -->
    <div v-if="showRulesDialog" class="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 overscroll-contain" @mousedown.self="showRulesDialog = false" @wheel.stop @touchmove.stop>
      <div class="bg-white rounded-2xl shadow-2xl w-[96vw] max-w-[1800px] h-[94vh] max-h-[94vh] flex flex-col overscroll-contain" style="contain: layout paint;">
        <!-- 头部（横向布局） -->
        <div class="flex items-center justify-between px-6 py-4 border-b border-slate-100 flex-shrink-0 gap-4">
          <div class="flex items-center gap-6 min-w-0 flex-1">
            <h4 class="text-lg font-bold text-slate-800 flex items-center gap-2 flex-shrink-0"><Wand2 class="w-5 h-5 text-indigo-500" />规则管理</h4>
            <!-- 标签页切换 -->
            <div class="flex items-center gap-1 bg-slate-100 rounded-lg p-0.5">
              <button @click="rulesTab = 'rules'" class="px-4 h-7 rounded-md text-xs font-semibold transition-colors" :class="rulesTab === 'rules' ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500 hover:text-slate-700'">训练规则</button>
              <button @click="rulesTab = 'data'" class="px-4 h-7 rounded-md text-xs font-semibold transition-colors" :class="rulesTab === 'data' ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500 hover:text-slate-700'">训练数据</button>
              <button @click="rulesTab = 'filters'" class="px-4 h-7 rounded-md text-xs font-semibold transition-colors" :class="rulesTab === 'filters' ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500 hover:text-slate-700'">白名单/黑名单</button>
            </div>
            <div v-if="rulesTab === 'rules'" class="flex items-center gap-3 flex-shrink-0">
              <span class="px-4 h-8 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200 text-sm font-semibold flex items-center gap-2"><span class="w-2 h-2 rounded-full bg-emerald-500"></span>推票 {{ ruleStats.stock_pick.total }}</span>
              <span class="px-4 h-8 rounded-full bg-blue-50 text-blue-700 border border-blue-200 text-sm font-semibold flex items-center gap-2"><span class="w-2 h-2 rounded-full bg-blue-500"></span>行情 {{ ruleStats.market_news.total }}</span>
              <span class="px-4 h-8 rounded-full bg-orange-50 text-orange-700 border border-orange-200 text-sm font-semibold flex items-center gap-2"><span class="w-2 h-2 rounded-full bg-orange-500"></span>营销 {{ ruleStats.marketing.total }}</span>
              <span class="px-4 h-8 rounded-full bg-slate-100 text-slate-500 border border-slate-200 text-sm font-semibold flex items-center gap-1"><Trash2 class="w-3.5 h-3.5" />已清理 {{ ruleCleanCount }}</span>
            </div>
          </div>
          <button @click="showRulesDialog = false" class="text-slate-400 hover:text-slate-600 flex-shrink-0"><X class="w-6 h-6" /></button>
        </div>

        <!-- 内容区 - 训练规则 -->
        <div v-if="rulesTab === 'rules'" class="flex-1 overflow-hidden flex flex-col p-6 gap-5 overscroll-contain" @wheel.stop @touchmove.stop>
          <!-- 分类说明 -->
          <div class="p-4 bg-slate-50 rounded-xl border border-slate-200 flex-shrink-0">
            <div class="text-sm font-bold text-slate-600 mb-3">📋 三类分类说明 · 优先级：推票 > 营销 > 行情</div>
            <div class="flex gap-3 text-[13px]">
              <span class="flex-1 px-4 py-2 rounded-lg bg-emerald-50 text-emerald-700 border border-emerald-200 font-semibold">推票 · 含股票代码/名称、推荐、回顾</span>
              <span class="flex-1 px-4 py-2 rounded-lg bg-blue-50 text-blue-700 border border-blue-200 font-semibold">行情 · 大盘走势、板块、资金流向</span>
              <span class="flex-1 px-4 py-2 rounded-lg bg-orange-50 text-orange-700 border border-orange-200 font-semibold">营销 · 课程/会员/加微信</span>
            </div>
          </div>

          <!-- 操作按钮 -->
          <div class="flex gap-3 flex-wrap items-center flex-shrink-0">
            <button @click="showAddRule = true" class="h-10 px-5 rounded-lg bg-indigo-500 text-white text-sm font-semibold hover:bg-indigo-600 flex items-center gap-2 shadow-sm">
              <Plus class="w-4 h-4" />新增规则
            </button>
            <button @click="reclassifyAll" :disabled="reclassifying" class="h-10 px-5 rounded-lg bg-slate-700 text-white text-sm font-semibold hover:bg-slate-800 flex items-center gap-2 shadow-sm disabled:opacity-50">
              <RefreshCw class="w-4 h-4" :class="{ 'animate-spin': reclassifying }" />{{ reclassifying ? '分类中...' : '重新分类' }}
            </button>
            <button @click="resetSystemRules" class="h-10 px-5 rounded-lg bg-amber-500 text-white text-sm font-semibold hover:bg-amber-600 flex items-center gap-2 shadow-sm">
              <RotateCcw class="w-4 h-4" />重置规则
            </button>
            <button @click="loadCategoryRules(true)" :disabled="categoryRulesLoading" class="h-10 px-5 rounded-lg border border-slate-200 text-slate-700 text-sm hover:bg-slate-50 flex items-center gap-2 disabled:opacity-50">
              <RefreshCw class="w-4 h-4" />刷新
            </button>
            <span class="ml-auto text-[13px] text-slate-500 leading-6 max-w-[500px]">
              <span class="font-semibold text-slate-600">自动分类流程：</span>系统规则打分 → 硬编码兜底 → 学习规则补充。修改消息分类后，系统自动提取关键词创建学习规则。
            </span>
          </div>

          <!-- 横向分栏：三列并排（主体区域，撑满剩余空间） -->
          <div class="grid grid-cols-3 gap-5 flex-1 min-h-0">
          <!-- ===== 推票规则 ===== -->
          <div class="rounded-xl border border-emerald-200 overflow-hidden flex flex-col bg-white">
            <div class="flex items-center justify-between px-4 py-3 bg-emerald-50 flex-shrink-0">
              <div class="flex items-center gap-2">
                <span class="w-2.5 h-2.5 rounded-full bg-emerald-500"></span>
                <span class="text-sm font-bold text-emerald-700">推票规则</span>
                <span class="text-[11px] text-emerald-500">系统{{ ruleStats.stock_pick.system }}条 · 学习{{ ruleStats.stock_pick.learned }}条</span>
              </div>
                <span class="text-[11px] text-emerald-500">✓命中 {{ ruleStats.stock_pick.hits }}</span>
            </div>
            <div class="p-3 space-y-1.5 flex-1 min-h-0 overflow-auto">
              <div v-for="rule in systemRulesByCategory.stock_pick" :key="'sys-sp-' + rule.id"
                class="flex items-center gap-2 px-3 py-2 rounded-lg text-[13px] group/rule"
                :class="rule.enabled ? 'bg-emerald-50/50 hover:bg-emerald-100/60' : 'bg-slate-50 text-slate-400'">
                <button @click="toggleSystemRule(rule)" class="w-5 h-5 rounded flex-shrink-0 flex items-center justify-center"
                  :class="rule.enabled ? 'bg-emerald-400 text-white' : 'bg-slate-200 text-slate-400'" :title="rule.enabled ? '禁用' : '启用'">
                  <component :is="rule.enabled ? Check : ''" class="w-3 h-3" />
                </button>
                <span class="px-1.5 py-0.5 rounded text-[10px] font-mono flex-shrink-0 text-slate-400 bg-slate-100">{{ rule.rule_type === 'regex' ? '正则' : '关键词' }}</span>
                <span class="truncate flex-1" :class="rule.enabled ? 'text-slate-700' : 'text-slate-400 line-through'" :title="rule.pattern">{{ rule.description || rule.pattern }}</span>
                <input v-if="rule.enabled" type="number" :value="rule.weight" @change="updateSystemRuleWeight(rule, $event)"
                  class="w-12 h-6 text-[11px] text-center border border-slate-200 rounded focus:outline-none focus:border-emerald-300" title="权重" />
              </div>
              <div v-for="rule in learnedRulesByCategory.stock_pick" :key="'lr-sp-' + rule.id"
                class="flex items-center gap-2 px-3 py-2 rounded-lg text-[13px] bg-emerald-50/30 hover:bg-emerald-50 group/lr">
                <span class="px-1.5 py-0.5 rounded text-[10px] font-medium flex-shrink-0 bg-emerald-100 text-emerald-700">学习</span>
                <span class="truncate flex-1 text-slate-700" :title="rule.keyword">{{ rule.keyword }}</span>
                <span class="text-[11px] flex-shrink-0" :class="rule.weight >= 0 ? 'text-emerald-500' : 'text-red-500'">{{ rule.weight >= 0 ? '+' : '' }}{{ rule.weight }}</span>
                <span class="text-[11px] text-emerald-500 flex-shrink-0">✓{{ rule.correct_count }}</span>
                <span v-if="rule.wrong_count > 0" class="text-[11px] text-red-400 flex-shrink-0">✗{{ rule.wrong_count }}</span>
               <button @click="deleteLearnedRule(rule.id)" class="opacity-0 group-hover/lr:opacity-100 w-6 h-6 rounded hover:bg-red-50 text-slate-400 hover:text-red-500 flex items-center justify-center"><X class="w-3.5 h-3.5" /></button>
              </div>
              <button v-if="hasMoreLearnedRules('stock_pick')" @click="loadMoreLearnedRules('stock_pick')" :disabled="loadingMoreRules.stock_pick" class="w-full py-2 text-[11px] text-emerald-600 hover:bg-emerald-50 rounded-lg disabled:opacity-50">
                {{ loadingMoreRules.stock_pick ? '加载中...' : `加载更多（已显示 ${learnedRuleLoadedCounts.stock_pick}/${learnedRuleTotals.stock_pick}）` }}
              </button>
              <p v-if="!ruleStats.stock_pick.total" class="text-[12px] text-slate-400 text-center py-4">暂无推票规则</p>
            </div>
          </div>

          <!-- ===== 行情规则 ===== -->
          <div class="rounded-xl border border-blue-200 overflow-hidden flex flex-col bg-white">
            <div class="flex items-center justify-between px-4 py-3 bg-blue-50 flex-shrink-0">
              <div class="flex items-center gap-2">
                <span class="w-2.5 h-2.5 rounded-full bg-blue-500"></span>
                <span class="text-sm font-bold text-blue-700">行情规则</span>
                <span class="text-[11px] text-blue-500">系统{{ ruleStats.market_news.system }}条 · 学习{{ ruleStats.market_news.learned }}条</span>
              </div>
                <span class="text-[11px] text-blue-500">✓命中 {{ ruleStats.market_news.hits }}</span>
            </div>
            <div class="p-3 space-y-1.5 flex-1 min-h-0 overflow-auto">
              <div v-for="rule in systemRulesByCategory.market_news" :key="'sys-mn-' + rule.id"
                class="flex items-center gap-2 px-3 py-2 rounded-lg text-[13px] group/rule"
                :class="rule.enabled ? 'bg-blue-50/50 hover:bg-blue-100/60' : 'bg-slate-50 text-slate-400'">
                <button @click="toggleSystemRule(rule)" class="w-5 h-5 rounded flex-shrink-0 flex items-center justify-center"
                  :class="rule.enabled ? 'bg-blue-400 text-white' : 'bg-slate-200 text-slate-400'" :title="rule.enabled ? '禁用' : '启用'">
                  <component :is="rule.enabled ? Check : ''" class="w-3 h-3" />
                </button>
                <span class="px-1.5 py-0.5 rounded text-[10px] font-mono flex-shrink-0 text-slate-400 bg-slate-100">{{ rule.rule_type === 'regex' ? '正则' : '关键词' }}</span>
                <span class="truncate flex-1" :class="rule.enabled ? 'text-slate-700' : 'text-slate-400 line-through'" :title="rule.pattern">{{ rule.description || rule.pattern }}</span>
                <input v-if="rule.enabled" type="number" :value="rule.weight" @change="updateSystemRuleWeight(rule, $event)"
                  class="w-12 h-6 text-[11px] text-center border border-slate-200 rounded focus:outline-none focus:border-blue-300" title="权重" />
              </div>
              <div v-for="rule in learnedRulesByCategory.market_news" :key="'lr-mn-' + rule.id"
                class="flex items-center gap-2 px-3 py-2 rounded-lg text-[13px] bg-blue-50/30 hover:bg-blue-50 group/lr">
                <span class="px-1.5 py-0.5 rounded text-[10px] font-medium flex-shrink-0 bg-blue-100 text-blue-700">学习</span>
                <span class="truncate flex-1 text-slate-700" :title="rule.keyword">{{ rule.keyword }}</span>
                <span class="text-[11px] flex-shrink-0" :class="rule.weight >= 0 ? 'text-emerald-500' : 'text-red-500'">{{ rule.weight >= 0 ? '+' : '' }}{{ rule.weight }}</span>
                <span class="text-[11px] text-emerald-500 flex-shrink-0">✓{{ rule.correct_count }}</span>
                <span v-if="rule.wrong_count > 0" class="text-[11px] text-red-400 flex-shrink-0">✗{{ rule.wrong_count }}</span>
               <button @click="deleteLearnedRule(rule.id)" class="opacity-0 group-hover/lr:opacity-100 w-6 h-6 rounded hover:bg-red-50 text-slate-400 hover:text-red-500 flex items-center justify-center"><X class="w-3.5 h-3.5" /></button>
              </div>
              <button v-if="hasMoreLearnedRules('market_news')" @click="loadMoreLearnedRules('market_news')" :disabled="loadingMoreRules.market_news" class="w-full py-2 text-[11px] text-blue-600 hover:bg-blue-50 rounded-lg disabled:opacity-50">
                {{ loadingMoreRules.market_news ? '加载中...' : `加载更多（已显示 ${learnedRuleLoadedCounts.market_news}/${learnedRuleTotals.market_news}）` }}
              </button>
              <p v-if="!ruleStats.market_news.total" class="text-[12px] text-slate-400 text-center py-4">暂无行情规则</p>
            </div>
          </div>

          <!-- ===== 营销规则 ===== -->
          <div class="rounded-xl border border-orange-200 overflow-hidden flex flex-col bg-white">
            <div class="flex items-center justify-between px-4 py-3 bg-orange-50 flex-shrink-0">
              <div class="flex items-center gap-2">
                <span class="w-2.5 h-2.5 rounded-full bg-orange-500"></span>
                <span class="text-sm font-bold text-orange-700">营销规则</span>
                <span class="text-[11px] text-orange-500">系统{{ ruleStats.marketing.system }}条 · 学习{{ ruleStats.marketing.learned }}条</span>
              </div>
                <span class="text-[11px] text-orange-500">✓命中 {{ ruleStats.marketing.hits }}</span>
            </div>
            <div class="p-3 space-y-1.5 flex-1 min-h-0 overflow-auto">
              <div v-for="rule in systemRulesByCategory.marketing" :key="'sys-mk-' + rule.id"
                class="flex items-center gap-2 px-3 py-2 rounded-lg text-[13px] group/rule"
                :class="rule.enabled ? 'bg-orange-50/50 hover:bg-orange-100/60' : 'bg-slate-50 text-slate-400'">
                <button @click="toggleSystemRule(rule)" class="w-5 h-5 rounded flex-shrink-0 flex items-center justify-center"
                  :class="rule.enabled ? 'bg-orange-400 text-white' : 'bg-slate-200 text-slate-400'" :title="rule.enabled ? '禁用' : '启用'">
                  <component :is="rule.enabled ? Check : ''" class="w-3 h-3" />
                </button>
                <span class="px-1.5 py-0.5 rounded text-[10px] font-mono flex-shrink-0 text-slate-400 bg-slate-100">{{ rule.rule_type === 'regex' ? '正则' : '关键词' }}</span>
                <span class="truncate flex-1" :class="rule.enabled ? 'text-slate-700' : 'text-slate-400 line-through'" :title="rule.pattern">{{ rule.description || rule.pattern }}</span>
                <input v-if="rule.enabled" type="number" :value="rule.weight" @change="updateSystemRuleWeight(rule, $event)"
                  class="w-12 h-6 text-[11px] text-center border border-slate-200 rounded focus:outline-none focus:border-orange-300" title="权重" />
              </div>
              <div v-for="rule in learnedRulesByCategory.marketing" :key="'lr-mk-' + rule.id"
                class="flex items-center gap-2 px-3 py-2 rounded-lg text-[13px] bg-orange-50/30 hover:bg-orange-50 group/lr">
                <span class="px-1.5 py-0.5 rounded text-[10px] font-medium flex-shrink-0 bg-orange-100 text-orange-700">学习</span>
                <span class="truncate flex-1 text-slate-700" :title="rule.keyword">{{ rule.keyword }}</span>
                <span class="text-[11px] flex-shrink-0" :class="rule.weight >= 0 ? 'text-emerald-500' : 'text-red-500'">{{ rule.weight >= 0 ? '+' : '' }}{{ rule.weight }}</span>
                <span class="text-[11px] text-emerald-500 flex-shrink-0">✓{{ rule.correct_count }}</span>
                <span v-if="rule.wrong_count > 0" class="text-[11px] text-red-400 flex-shrink-0">✗{{ rule.wrong_count }}</span>
               <button @click="deleteLearnedRule(rule.id)" class="opacity-0 group-hover/lr:opacity-100 w-6 h-6 rounded hover:bg-red-50 text-slate-400 hover:text-red-500 flex items-center justify-center"><X class="w-3.5 h-3.5" /></button>
              </div>
              <button v-if="hasMoreLearnedRules('marketing')" @click="loadMoreLearnedRules('marketing')" :disabled="loadingMoreRules.marketing" class="w-full py-2 text-[11px] text-orange-600 hover:bg-orange-50 rounded-lg disabled:opacity-50">
                {{ loadingMoreRules.marketing ? '加载中...' : `加载更多（已显示 ${learnedRuleLoadedCounts.marketing}/${learnedRuleTotals.marketing}）` }}
              </button>
              <p v-if="!ruleStats.marketing.total" class="text-[12px] text-slate-400 text-center py-4">暂无营销规则</p>
            </div>
          </div>
          </div>

          <p v-if="!systemRules.length && !learnedRules.length" class="text-[11px] text-slate-400 text-center py-4">暂无规则，请点击"新增规则"添加或修改消息分类自动学习</p>

          <!-- 分类规则计算说明（移至最下方，可折叠，展开时内部滚动） -->
          <div class="border border-slate-200 rounded-xl overflow-hidden flex-shrink-0">
            <button @click="showCalcRules = !showCalcRules" class="w-full flex items-center justify-between px-4 py-3 bg-white hover:bg-slate-50 text-left">
              <span class="text-sm font-bold text-slate-700 flex items-center gap-2"><Wand2 class="w-4 h-4 text-indigo-500" />分类规则计算说明</span>
              <ChevronDown class="w-4 h-4 text-slate-400" :class="{ 'rotate-180': showCalcRules }" />
            </button>
            <div v-if="showCalcRules" class="px-4 pb-4 space-y-3 text-[13px] text-slate-600 leading-6 border-t border-slate-100 pt-3 max-h-[35vh] overflow-y-auto">
              <div class="space-y-2">
                <p class="font-semibold text-slate-700">一、基础分类（categorizeMessage）</p>
                <div class="pl-3 space-y-1 text-[12px]">
                  <p>1. 检测 <code class="px-1 py-0.5 bg-slate-100 rounded text-[11px] font-mono">stocks_json</code> 是否有6位有效代码 → 有则直接判 <span class="text-emerald-600 font-semibold">推票</span></p>
                  <p>2. 检测文本中 <code class="px-1 py-0.5 bg-slate-100 rounded text-[11px] font-mono">【股票名 6位代码】</code> 格式 → 有则判 <span class="text-emerald-600 font-semibold">推票</span></p>
                  <p>3. 检测文本中6位数字代码（前后非数字） → 有则判 <span class="text-emerald-600 font-semibold">推票</span></p>
                  <p>4. 推票回顾模式：<code class="px-1 py-0.5 bg-slate-100 rounded text-[11px] font-mono">涨停/连板/T+1</code> → 判 <span class="text-emerald-600 font-semibold">推票</span></p>
                  <p>5. 有 <code class="px-1 py-0.5 bg-slate-100 rounded text-[11px] font-mono">【股票名】</code> + 推荐关键词 → 判 <span class="text-emerald-600 font-semibold">推票</span></p>
                  <p>6. 营销关键词评分 ≥ 3 → 判 <span class="text-orange-600 font-semibold">营销</span></p>
                  <p>7. 行情关键词评分 ≥ 2 → 判 <span class="text-blue-600 font-semibold">行情</span></p>
                  <p>8. 兜底：有 <code class="px-1 py-0.5 bg-slate-100 rounded text-[11px] font-mono">【】</code> 算推票，有行情关键词算行情，否则行情</p>
                </div>
              </div>
              <div class="space-y-2">
                <p class="font-semibold text-slate-700">二、学习规则评分（computeLearnedCategoryScores）</p>
                <div class="pl-3 space-y-1 text-[12px]">
                  <p>公式：<code class="px-1 py-0.5 bg-slate-100 rounded text-[11px] font-mono">得分 = weight × reliability × support × specificity × ambiguityFactor</code></p>
                  <p>• <code class="px-1 py-0.5 bg-slate-100 rounded text-[11px] font-mono">weight</code>：规则权重（-10 ~ 10，来自用户反馈修正）</p>
                  <p>• <code class="px-1 py-0.5 bg-slate-100 rounded text-[11px] font-mono">reliability = (correct + 1) / (correct + wrong + 2)</code>：正确率平滑估计</p>
                  <p>• <code class="px-1 py-0.5 bg-slate-100 rounded text-[11px] font-mono">support = 1 + log2(correct + wrong + 2) × 0.18</code>：样本量提升</p>
                  <p>• <code class="px-1 py-0.5 bg-slate-100 rounded text-[11px] font-mono">specificity</code>：关键词长度因子（5字以上1.35，4字1.1，3字0.78，短词0.5）</p>
                  <p>• <code class="px-1 py-0.5 bg-slate-100 rounded text-[11px] font-mono">ambiguityFactor</code>：多分类歧义惩罚（仅属1类=1，多类=0.45）</p>
                  <p class="text-slate-400">过滤条件：weight ≤ 0 跳过；correct=0 跳过；wrong > correct+3 跳过</p>
                </div>
              </div>
              <div class="space-y-2">
                <p class="font-semibold text-slate-700">三、相似样本评分（computeFeedbackSimilarityScores）</p>
                <div class="pl-3 space-y-1 text-[12px]">
                  <p>公式：<code class="px-1 py-0.5 bg-slate-100 rounded text-[11px] font-mono">得分 = Σ(similarity² × 4) × (1 + log2(count+1) × 0.18)</code></p>
                  <p>• <code class="px-1 py-0.5 bg-slate-100 rounded text-[11px] font-mono">similarity = coverage × 0.72 + jaccard × 0.28</code>（混合相似度）</p>
                  <p>• <code class="px-1 py-0.5 bg-slate-100 rounded text-[11px] font-mono">coverage = 交集数 / min(目标词数, 样本词数)</code></p>
                  <p>• <code class="px-1 py-0.5 bg-slate-100 rounded text-[11px] font-mono">jaccard = 交集数 / (目标词数 + 样本词数 - 交集数)</code></p>
                  <p>• 只取 top-8 最相似样本，<code class="px-1 py-0.5 bg-slate-100 rounded text-[11px] font-mono">similarity ≥ 0.16</code> 才计入</p>
                </div>
              </div>
              <div class="space-y-2">
                <p class="font-semibold text-slate-700">四、最终决策（categorizeMessageWithLearn）</p>
                <div class="pl-3 space-y-1 text-[12px]">
                  <p>总得分 = 学习规则评分 + 相似样本评分</p>
                  <p>基础分类加分：<code class="px-1 py-0.5 bg-slate-100 rounded text-[11px] font-mono">base === 'stock_pick' 且有效股票 → +6；否则 +1.35</code></p>
                  <p>按总得分降序排列，取最高分类为 <code class="px-1 py-0.5 bg-slate-100 rounded text-[11px] font-mono">winner</code></p>
                  <p>若 winner ≠ base，需同时满足：</p>
                  <p class="pl-4">• <code class="px-1 py-0.5 bg-slate-100 rounded text-[11px] font-mono">learnedEvidence ≥ threshold</code>（有股票5.5 / 无股票1.8）</p>
                  <p class="pl-4">• <code class="px-1 py-0.5 bg-slate-100 rounded text-[11px] font-mono">margin ≥ requiredMargin</code>（有股票2.5 / 无股票0.8）</p>
                  <p>否则保留基础分类，学习规则不覆盖。</p>
                </div>
              </div>
              <div class="space-y-2">
                <p class="font-semibold text-slate-700">五、系统规则打分（硬编码规则）</p>
                <div class="pl-3 space-y-1 text-[12px]">
                  <p>• 系统规则为正则/关键词匹配，命中后按权重加分</p>
                  <p>• 优先级：<span class="text-emerald-600 font-semibold">推票</span> > <span class="text-orange-600 font-semibold">营销</span> > <span class="text-blue-600 font-semibold">行情</span></p>
                  <p>• 手动修改消息分类时，自动提取关键词创建学习规则（<code class="px-1 py-0.5 bg-slate-100 rounded text-[11px] font-mono">updateRulesFromFeedback</code>）</p>
                  <p>• 有6位有效股票代码的消息，推票优先级最高，不会被学习规则覆盖</p>
                </div>
              </div>
            </div>
          </div>
        </div>

        <!-- 内容区 - 训练数据 -->
        <div v-if="rulesTab === 'data'" class="flex-1 overflow-hidden flex flex-col p-6 gap-5 overscroll-contain" @wheel.stop @touchmove.stop>
          <!-- 数据统计 -->
          <div class="flex gap-3 flex-wrap flex-shrink-0">
            <span class="px-4 h-8 rounded-full bg-indigo-50 text-indigo-700 border border-indigo-200 text-sm font-semibold flex items-center gap-2">推荐逻辑样本 {{ trainingData.pagination?.logicTotal || 0 }}条</span>
            <span class="px-4 h-8 rounded-full bg-amber-50 text-amber-700 border border-amber-200 text-sm font-semibold flex items-center gap-2">分类反馈 {{ trainingData.pagination?.fbTotal || 0 }}条</span>
            <span class="px-4 h-8 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200 text-sm font-semibold flex items-center gap-2">学习规则 {{ trainingData.pagination?.lrTotal || 0 }}条</span>
            <span class="px-4 h-8 rounded-full bg-blue-50 text-blue-700 border border-blue-200 text-sm font-semibold flex items-center gap-2">系统规则 {{ trainingData.pagination?.srTotal || 0 }}条</span>
            <span class="px-4 h-8 rounded-full bg-purple-50 text-purple-700 border border-purple-200 text-sm font-semibold flex items-center gap-2">推票追踪 {{ trainingData.pagination?.trTotal || 0 }}条</span>
            <button @click="loadTrainingData" :disabled="trainingDataLoading" class="h-8 px-4 rounded-lg border border-slate-200 text-slate-600 text-xs hover:bg-slate-50 flex items-center gap-1.5 disabled:opacity-50 ml-auto">
              <RefreshCw class="w-3 h-3" :class="{ 'animate-spin': trainingDataLoading }" />刷新
            </button>
          </div>

          <!-- 训练数据子标签页 -->
          <div class="flex items-center gap-1 bg-slate-100 rounded-lg p-0.5 flex-shrink-0 self-start">
            <button @click="trainingDataTab = 'logic'" class="px-4 h-7 rounded-md text-xs font-semibold transition-colors" :class="trainingDataTab === 'logic' ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500 hover:text-slate-700'">推荐逻辑样本</button>
            <button @click="trainingDataTab = 'feedback'" class="px-4 h-7 rounded-md text-xs font-semibold transition-colors" :class="trainingDataTab === 'feedback' ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500 hover:text-slate-700'">分类反馈 & 学习效果</button>
            <button @click="trainingDataTab = 'rules'" class="px-4 h-7 rounded-md text-xs font-semibold transition-colors" :class="trainingDataTab === 'rules' ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500 hover:text-slate-700'">全局规则库</button>
            <button @click="trainingDataTab = 'sysRules'" class="px-4 h-7 rounded-md text-xs font-semibold transition-colors" :class="trainingDataTab === 'sysRules' ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500 hover:text-slate-700'">系统规则</button>
            <button @click="trainingDataTab = 'tracking'" class="px-4 h-7 rounded-md text-xs font-semibold transition-colors" :class="trainingDataTab === 'tracking' ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500 hover:text-slate-700'">推票追踪</button>
            <button @click="trainingDataTab = 'learned'" class="px-4 h-7 rounded-md text-xs font-semibold transition-colors" :class="trainingDataTab === 'learned' ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500 hover:text-slate-700'">🎯 股票解析学习</button>
          </div>

          <!-- 推荐逻辑样本 -->
          <div v-if="trainingDataTab === 'logic'" class="flex-1 min-h-0 overflow-auto rounded-xl border border-slate-200">
            <table class="w-full text-[12px]">
              <thead class="bg-slate-50 sticky top-0">
                <tr>
                  <th class="px-3 py-2 text-left text-slate-500 font-semibold">发送人</th>
                  <th class="px-3 py-2 text-left text-slate-500 font-semibold">消息原文</th>
                  <th class="px-3 py-2 text-left text-slate-500 font-semibold">股票</th>
                  <th class="px-3 py-2 text-right text-slate-500 font-semibold">时间</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="item in trainingData.logicSamples" :key="item.event_id" class="border-t border-slate-100 hover:bg-slate-50">
                  <td class="px-3 py-2 text-slate-600 max-w-[100px] truncate" :title="item.sender">{{ item.sender || '-' }}</td>
                  <td class="px-3 py-2 text-slate-700 max-w-[400px] truncate" :title="item.original_text">{{ item.original_text }}</td>
                  <td class="px-3 py-2">
                    <span v-for="(s, si) in (item.stocks || [])" :key="si" class="inline-block px-1.5 py-0.5 rounded bg-emerald-50 text-emerald-600 text-[10px] font-mono mr-1">{{ s.code || s }}</span>
                    <span v-if="!item.stocks || !item.stocks.length" class="text-slate-400">-</span>
                  </td>
                  <td class="px-3 py-2 text-right text-slate-400 whitespace-nowrap text-[11px]">{{ formatDate(item.created_at) }} {{ formatTime(item.created_at) }}</td>
                </tr>
                <tr v-if="!trainingData.logicSamples || !trainingData.logicSamples.length">
                  <td colspan="4" class="px-3 py-8 text-center text-slate-400">暂无推荐逻辑训练样本</td>
                </tr>
              </tbody>
            </table>
          </div>

          <!-- 分类反馈 & 学习效果 -->
          <div v-if="trainingDataTab === 'feedback'" class="flex-1 min-h-0 overflow-auto rounded-xl border border-slate-200 p-3 space-y-2">
            <div v-for="item in trainingData.feedbackSamples" :key="item.id" class="border border-slate-200 rounded-lg p-3 bg-slate-50/30">
              <!-- 顶部：基本信息 -->
              <div class="flex items-start gap-3">
                <div class="flex-1 min-w-0">
                  <div class="text-[12px] leading-relaxed text-slate-700" :title="item.message_text">{{ item.message_text }}</div>
                  <div class="mt-1.5 flex items-center gap-2 text-[11px] text-slate-400">
                    <span>{{ formatDate(item.created_at) }} {{ formatTime(item.created_at) }}</span>
                    <span v-if="item.event_id" class="font-mono">· {{ item.event_id.slice(0, 12) }}</span>
                  </div>
                </div>
                <div class="flex flex-col items-center gap-1 flex-shrink-0">
                  <span class="px-2 py-0.5 rounded text-[10px] font-semibold line-through" :class="categoryBadgeClass(item.predicted_category)">{{ categoryLabel(item.predicted_category) }}</span>
                  <svg class="w-3 h-3 text-slate-300" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 14l-7 7m0 0l-7-7m7 7V3"/></svg>
                  <span v-if="item.user_corrected_category" class="px-2 py-0.5 rounded text-[10px] font-semibold" :class="categoryBadgeClass(item.user_corrected_category)">{{ categoryLabel(item.user_corrected_category) }}</span>
                  <span v-else-if="item.user_correct === 1" class="text-emerald-500 text-xs font-bold">✓</span>
                </div>
              </div>
              <!-- 学到了啥 -->
              <div v-if="item.learned_keywords && item.learned_keywords.length" class="mt-2 pt-2 border-t border-slate-200">
                <div class="text-[10px] text-slate-500 font-semibold mb-1.5">🧠 本次学到的规则（{{ item.learned_keywords.length }} 条）：</div>
                <div class="flex flex-wrap gap-1.5">
                  <template v-for="(kw, ki) in item.learned_keywords" :key="ki">
                    <span v-if="kw.action === 'weaken'"
                      class="inline-flex items-center gap-1 px-2 py-1 rounded-md bg-red-50 border border-red-100 text-[11px]">
                      <span class="font-mono text-red-400 font-bold">{{ kw.keyword }}</span>
                      <span class="text-red-400">→</span>
                      <span class="text-red-500 font-semibold">{{ categoryLabel(kw.category) }}</span>
                      <span class="text-red-400 font-bold">{{ kw.delta }}</span>
                      <span class="text-red-300 text-[9px]">({{ kw.label }})</span>
                    </span>
                    <span v-else class="inline-flex items-center gap-1 px-2 py-1 rounded-md bg-emerald-50 border border-emerald-100 text-[11px]">
                      <span class="font-mono text-emerald-600 font-bold">{{ kw.keyword }}</span>
                      <span class="text-emerald-400">→</span>
                      <span class="text-emerald-700 font-semibold">{{ categoryLabel(kw.category) }}</span>
                      <span class="text-emerald-500 font-bold">+{{ kw.delta }}</span>
                      <span class="text-emerald-400 text-[9px]">({{ kw.label }})</span>
                    </span>
                  </template>
                </div>
              </div>
              <div v-else class="mt-2 pt-2 border-t border-slate-200 text-[10px] text-slate-400">
                （无关键词可学，跳过规则更新）
              </div>
            </div>
            <div v-if="!trainingData.feedbackSamples || !trainingData.feedbackSamples.length" class="py-8 text-center text-slate-400 text-sm">
              暂无分类反馈数据。修改消息分类后，这里会显示"学到了啥"。
            </div>
          </div>

          <!-- 学习规则 -->
          <div v-if="trainingDataTab === 'rules'" class="flex-1 min-h-0 overflow-auto rounded-xl border border-slate-200">
            <table class="w-full text-[12px]">
              <thead class="bg-slate-50 sticky top-0">
                <tr>
                  <th class="px-3 py-2 text-left text-slate-500 font-semibold">分类</th>
                  <th class="px-3 py-2 text-left text-slate-500 font-semibold">关键词</th>
                  <th class="px-3 py-2 text-center text-slate-500 font-semibold">权重</th>
                  <th class="px-3 py-2 text-center text-slate-500 font-semibold">✓正确</th>
                  <th class="px-3 py-2 text-center text-slate-500 font-semibold">✗错误</th>
                  <th class="px-3 py-2 text-right text-slate-500 font-semibold">创建时间</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="r in trainingData.learnedRules" :key="r.id" class="border-t border-slate-100 hover:bg-slate-50">
                  <td class="px-3 py-2"><span class="px-2 py-0.5 rounded text-[10px] font-semibold" :class="categoryBadgeClass(r.category)">{{ categoryLabel(r.category) }}</span></td>
                  <td class="px-3 py-2 text-slate-700 font-mono">{{ r.keyword }}</td>
                  <td class="px-3 py-2 text-center" :class="r.weight >= 0 ? 'text-emerald-500' : 'text-red-500'">{{ r.weight >= 0 ? '+' : '' }}{{ r.weight }}</td>
                  <td class="px-3 py-2 text-center text-emerald-500">{{ r.correct_count }}</td>
                  <td class="px-3 py-2 text-center text-red-400">{{ r.wrong_count }}</td>
                  <td class="px-3 py-2 text-right text-slate-400 whitespace-nowrap text-[11px]">{{ formatDate(r.created_at) }} {{ formatTime(r.created_at) }}</td>
                </tr>
                <tr v-if="!trainingData.learnedRules || !trainingData.learnedRules.length">
                  <td colspan="6" class="px-3 py-8 text-center text-slate-400">暂无学习规则</td>
                </tr>
              </tbody>
            </table>
          </div>

          <!-- 系统规则 -->
          <div v-if="trainingDataTab === 'sysRules'" class="flex-1 min-h-0 overflow-auto rounded-xl border border-slate-200">
            <table class="w-full text-[12px]">
              <thead class="bg-slate-50 sticky top-0">
                <tr>
                  <th class="px-3 py-2 text-left text-slate-500 font-semibold">分类</th>
                  <th class="px-3 py-2 text-left text-slate-500 font-semibold">类型</th>
                  <th class="px-3 py-2 text-left text-slate-500 font-semibold">模式/描述</th>
                  <th class="px-3 py-2 text-center text-slate-500 font-semibold">权重</th>
                  <th class="px-3 py-2 text-center text-slate-500 font-semibold">状态</th>
                  <th class="px-3 py-2 text-right text-slate-500 font-semibold">创建时间</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="r in trainingData.systemRules" :key="r.id" class="border-t border-slate-100 hover:bg-slate-50">
                  <td class="px-3 py-2"><span class="px-2 py-0.5 rounded text-[10px] font-semibold" :class="categoryBadgeClass(r.category)">{{ categoryLabel(r.category) }}</span></td>
                  <td class="px-3 py-2 text-slate-500">{{ r.rule_type === 'regex' ? '正则' : '关键词' }}</td>
                  <td class="px-3 py-2 text-slate-700 max-w-[300px] truncate font-mono text-[11px]" :title="r.description || r.pattern">{{ r.description || r.pattern }}</td>
                  <td class="px-3 py-2 text-center text-slate-600">{{ r.weight }}</td>
                  <td class="px-3 py-2 text-center">
                    <span :class="r.enabled ? 'text-emerald-500' : 'text-slate-400'">{{ r.enabled ? '启用' : '禁用' }}</span>
                  </td>
                  <td class="px-3 py-2 text-right text-slate-400 whitespace-nowrap text-[11px]">{{ formatDate(r.created_at) }} {{ formatTime(r.created_at) }}</td>
                </tr>
                <tr v-if="!trainingData.systemRules || !trainingData.systemRules.length">
                  <td colspan="6" class="px-3 py-8 text-center text-slate-400">暂无系统规则</td>
                </tr>
              </tbody>
            </table>
          </div>

          <!-- 推票追踪 -->
          <div v-if="trainingDataTab === 'tracking'" class="flex-1 min-h-0 overflow-auto rounded-xl border border-slate-200">
            <table class="w-full text-[12px]">
              <thead class="bg-slate-50 sticky top-0">
                <tr>
                  <th class="px-3 py-2 text-left text-slate-500 font-semibold">发送人</th>
                  <th class="px-3 py-2 text-left text-slate-500 font-semibold">股票</th>
                  <th class="px-3 py-2 text-center text-slate-500 font-semibold">推票日</th>
                  <th class="px-3 py-2 text-right text-slate-500 font-semibold">开盘价</th>
                  <th class="px-3 py-2 text-right text-slate-500 font-semibold">收盘价</th>
                  <th class="px-3 py-2 text-right text-slate-500 font-semibold">当日涨幅</th>
                  <th class="px-3 py-2 text-right text-slate-500 font-semibold">累计涨幅</th>
                  <th class="px-3 py-2 text-center text-slate-500 font-semibold">锁定</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="item in trainingData.trackingData" :key="item.id" class="border-t border-slate-100 hover:bg-slate-50">
                  <td class="px-3 py-2 text-slate-600 max-w-[100px] truncate" :title="item.sender">{{ item.sender || '-' }}</td>
                  <td class="px-3 py-2 text-slate-700 font-mono">{{ item.stock_name }}({{ item.stock_code }})</td>
                  <td class="px-3 py-2 text-center text-slate-600">{{ item.pick_date }}</td>
                  <td class="px-3 py-2 text-right text-slate-600">{{ item.pick_open_price ?? '-' }}</td>
                  <td class="px-3 py-2 text-right text-slate-600">{{ item.pick_close_price ?? '-' }}</td>
                  <td class="px-3 py-2 text-right" :class="(item.pick_change_percent || 0) >= 0 ? 'text-red-500' : 'text-emerald-500'">{{ item.pick_change_percent != null ? Number(item.pick_change_percent).toFixed(2) + '%' : '-' }}</td>
                  <td class="px-3 py-2 text-right" :class="(item.total_change_percent || 0) >= 0 ? 'text-red-500' : 'text-emerald-500'">{{ item.total_change_percent != null ? Number(item.total_change_percent).toFixed(2) + '%' : '-' }}</td>
                  <td class="px-3 py-2 text-center">
                    <span :class="item.locked ? 'text-amber-500' : 'text-slate-400'">{{ item.locked ? '已锁定' : '-' }}</span>
                  </td>
                </tr>
                <tr v-if="!trainingData.trackingData || !trainingData.trackingData.length">
                  <td colspan="8" class="px-3 py-8 text-center text-slate-400">暂无推票追踪数据</td>
                </tr>
              </tbody>
            </table>
          </div>

          <!-- 股票解析学习 -->
          <div v-if="trainingDataTab === 'learned'" class="flex-1 min-h-0 overflow-auto rounded-xl border border-indigo-200 bg-indigo-50/20">
            <!-- 顶部统计 -->
            <!-- 顶部统计 -->
            <div class="sticky top-0 bg-indigo-50/80 backdrop-blur-sm border-b border-indigo-200 px-4 py-3 flex items-center gap-3 flex-shrink-0 z-10">
              <span class="px-3 py-1.5 rounded-full bg-indigo-100 text-indigo-700 text-xs font-semibold">已学 {{ learnedStockSamples.length }} 个样本</span>
              <span class="px-3 py-1.5 rounded-full bg-purple-100 text-purple-700 text-xs font-semibold">规则库 {{ learnedExtractionRules.length }} 条</span>
              <span class="ml-auto text-[11px] text-slate-500 leading-5 max-w-[480px]">
                💡 规则引擎：从「原文 + 用户纠正的股票列表」归纳出定界符 → 生成正则 → 自我验证。点击刷新重新推理所有样本。
              </span>
              <button @click="loadLearnedStockSamples" class="h-7 px-3 rounded border border-slate-200 text-slate-600 text-xs hover:bg-slate-50 flex items-center gap-1 flex-shrink-0">
                <RefreshCw class="w-3 h-3" />刷新学习库
              </button>
            </div>

            <!-- 子 tab 切换 -->
            <div class="flex items-center gap-1 bg-slate-100 rounded-lg p-0.5 m-3 w-fit">
              <button @click="learnedView = 'rules'" class="px-4 h-7 rounded-md text-xs font-semibold transition-colors" :class="learnedView === 'rules' ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500 hover:text-slate-700'">🧠 规则库（推理过程）</button>
              <button @click="learnedView = 'samples'" class="px-4 h-7 rounded-md text-xs font-semibold transition-colors" :class="learnedView === 'samples' ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500 hover:text-slate-700'">📚 原始样本库</button>
            </div>

            <!-- ====== 规则库视图（6 步推理过程） ====== -->
            <div v-if="learnedView === 'rules'" class="px-3 pb-3 space-y-3">
              <div v-if="learnedExtractionRules.length === 0" class="text-center py-16 text-slate-400">
                <div class="text-4xl mb-3">🧠</div>
                <div class="text-sm">规则库还是空的</div>
                <div class="text-[11px] mt-2 max-w-[360px] mx-auto leading-5">
                  点击右上角「刷新学习库」从历史样本推理规则。<br/>
                  或在「手动添加推票追踪」里提交纠正后的股票列表，系统会自动学习新规则。
                </div>
              </div>
              <div v-for="(rule, ri) in learnedExtractionRules" :key="rule.id" class="rounded-lg border bg-white overflow-hidden">
                <!-- 规则标题栏 -->
                <div class="px-4 py-2.5 bg-gradient-to-r from-indigo-50 to-purple-50 border-b border-indigo-100 flex items-center gap-2 flex-wrap">
                  <span class="text-[10px] font-bold font-mono px-2 py-0.5 rounded bg-indigo-500 text-white">R{{ ri + 1 }}</span>
                  <span class="text-[11px] font-semibold text-slate-700">
                    {{ rule.fingerprints.bracketType ? '括号' + rule.fingerprints.bracketType : rule.fingerprints.openChar ? '标记' + rule.fingerprints.openChar : rule.nameInCodePrefix ? 'name前code后' : 'code前name后' }}
                  </span>
                  <span v-if="rule.fingerprints.hasColon" class="text-[9px] px-1.5 py-0.5 rounded bg-amber-100 text-amber-700 font-semibold">含冒号</span>
                  <span v-if="rule.fingerprints.hasHash" class="text-[9px] px-1.5 py-0.5 rounded bg-slate-100 text-slate-600 font-semibold">含#</span>
                  <span v-if="rule.fingerprints.hasNewline" class="text-[9px] px-1.5 py-0.5 rounded bg-teal-100 text-teal-700 font-semibold">逐行</span>
                  <span class="ml-auto text-[10px] text-slate-400">命中 {{ rule.hitCount }} · 置信度 {{ (rule.confidence * 100).toFixed(0) }}%</span>
                  <span :class="rule._validation && rule._validation.precision >= 0.8 ? 'text-[10px] px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-700 font-semibold' : 'text-[10px] px-1.5 py-0.5 rounded bg-amber-100 text-amber-700 font-semibold'">
                    ✅{{ rule._validation?.hits || 0 }}/{{ rule._validation?.total || 0 }}
                  </span>
                </div>
                <!-- 规则核心正则 -->
                <div class="px-4 py-2.5 bg-slate-50 border-b border-slate-100">
                  <div class="flex gap-4 text-[11px]">
                    <div class="flex-1 min-w-0">
                      <div class="text-slate-400 mb-0.5">name 提取正则</div>
                      <code class="block px-2 py-1 rounded bg-white border border-slate-200 font-mono text-[10px] text-blue-600 break-all leading-5">{{ rule.nameExtraction || '(无)' }}</code>
                    </div>
                    <div class="flex-1 min-w-0">
                      <div class="text-slate-400 mb-0.5">logic 提取正则</div>
                      <code class="block px-2 py-1 rounded bg-white border border-slate-200 font-mono text-[10px] text-emerald-600 break-all leading-5">{{ rule.logicExtraction || '(无)' }}</code>
                    </div>
                  </div>
                </div>
                <!-- 6 步推理过程 -->
                <div class="px-4 py-3 space-y-2">
                  <div
                    v-for="trace in rule._trace"
                    :key="trace.step"
                    class="flex gap-2 text-[11px]"
                  >
                    <span class="flex-shrink-0 w-5 h-5 rounded-full bg-indigo-100 text-indigo-600 font-bold flex items-center justify-center text-[10px]">{{ trace.step }}</span>
                    <div class="flex-1 min-w-0">
                      <div class="font-semibold text-slate-700">{{ trace.title }}</div>
                      <div class="text-slate-500 leading-5">{{ trace.detail }}</div>
                      <!-- Step 2: 显示观察到的 span -->
                      <div v-if="trace.step === 2 && trace.observations?.length" class="mt-1.5 space-y-1">
                        <div v-for="(obs, oi) in trace.observations" :key="oi" class="text-[10px] font-mono bg-slate-50 rounded px-2 py-1 border border-slate-100">
                          <span v-if="obs.code" class="text-emerald-600 font-bold">{{ obs.code }}</span>
                          <span v-if="obs.name" class="text-blue-600 ml-1">「{{ obs.name }}」</span>
                          <span class="text-slate-400 ml-2">→ {{ obs.codeSpan ? 'code['+obs.codeSpan.start+'-'+obs.codeSpan.end+']' : '' }}{{ obs.nameSpan ? ' name['+obs.nameSpan.start+'-'+obs.nameSpan.end+']' : '' }}{{ obs.logicSpan ? ' logic['+obs.logicSpan.start+'-'+obs.logicSpan.end+']' : '' }}</span>
                          <div class="text-slate-400 text-[9px] mt-0.5 italic">…{{ obs.rawSegment?.slice(0, 100) }}{{ obs.rawSegment?.length > 100 ? '…' : '' }}</div>
                        </div>
                      </div>
                      <!-- Step 3: 显示归纳的定界符 -->
                      <div v-if="trace.step === 3" class="mt-1.5 space-y-1">
                        <div v-if="trace.beforeChars?.length" class="text-[10px]">
                          <span class="text-slate-400">name 前字符（多数字段）:</span>
                          <span v-for="(ch, ci) in trace.beforeChars" :key="ci" class="ml-1 px-1 rounded bg-amber-50 text-amber-700 font-mono">{{ JSON.stringify(ch) }}</span>
                        </div>
                        <div v-if="trace.afterChars?.length" class="text-[10px]">
                          <span class="text-slate-400">name 后字符（多数字段）:</span>
                          <span v-for="(ch, ci) in trace.afterChars" :key="ci" class="ml-1 px-1 rounded bg-amber-50 text-amber-700 font-mono">{{ JSON.stringify(ch) }}</span>
                        </div>
                        <div v-if="trace.logicDelimiter && trace.logicDelimiter !== '未检测到'" class="text-[10px]">
                          <span class="text-slate-400">logic 起始定界符:</span>
                          <span class="ml-1 px-1 rounded bg-emerald-50 text-emerald-700 font-mono">{{ trace.logicDelimiter }}</span>
                        </div>
                      </div>
                      <!-- Step 6: 显示验证详情 -->
                      <div v-if="trace.step === 6 && trace.validation" class="mt-1.5 text-[10px] space-y-0.5">
                        <div>精确率 <b :class="trace.validation.precision >= 0.8 ? 'text-emerald-600' : trace.validation.precision >= 0.5 ? 'text-amber-600' : 'text-red-500'">{{ (trace.validation.precision * 100).toFixed(1) }}%</b> · 召回率 <b class="text-slate-700">{{ (trace.validation.recall * 100).toFixed(1) }}%</b> {{ trace.parsedStocks }}</div>
                      </div>
                    </div>
                  </div>
                </div>
                <!-- 来源样本预览 -->
                <div v-if="rule._sourceStocks?.length || rule._sourceText" class="px-4 py-2.5 bg-gradient-to-r from-slate-50 to-slate-100 border-t border-slate-100">
                  <div class="text-[10px] text-slate-400 mb-1">来源样本（用户纠正的股票）</div>
                  <div class="flex flex-wrap gap-1">
                    <span v-for="(s, si) in rule._sourceStocks?.slice(0, 6)" :key="si" class="text-[10px] inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded bg-white border border-slate-200">
                      <span class="font-mono text-emerald-600 font-bold">{{ s.code }}</span>
                      <span class="text-blue-600">{{ s.name }}</span>
                    </span>
                  </div>
                </div>
              </div>
            </div>

            <!-- ====== 原始样本库视图（保留旧的 formatGroups） ====== -->
            <div v-if="learnedView === 'samples'" class="p-4 space-y-4">
              <div v-if="learnedFormatGroups.length" class="space-y-3">
                <div
                  v-for="(group, gi) in learnedFormatGroups"
                  :key="gi"
                  class="rounded-lg border border-indigo-200 bg-white overflow-hidden"
                >
                  <div class="px-4 py-2.5 bg-indigo-50 border-b border-indigo-100 flex items-center gap-3">
                    <span class="text-[10px] font-bold font-mono px-2 py-0.5 rounded bg-indigo-200 text-indigo-700">FORMAT #{{ gi + 1 }}</span>
                    <code class="text-[11px] font-mono text-indigo-600 truncate flex-1" :title="group.format">{{ group.format }}</code>
                    <span class="text-[11px] text-indigo-500">{{ group.count }} 次命中</span>
                  </div>
                  <div class="divide-y divide-slate-100">
                    <div v-for="sample in group.samples" :key="sample.event_id" class="px-4 py-2.5 hover:bg-slate-50">
                      <div class="flex items-start gap-2">
                        <div class="flex-1 min-w-0">
                          <div class="flex items-center gap-2 mb-1">
                            <span class="text-[10px] text-slate-500">📌 {{ sample.sender || '手动添加' }}</span>
                            <span class="text-[10px] text-slate-400">{{ sample.stocks.length }} 只股票</span>
                          </div>
                          <div class="text-[11px] text-slate-600 font-mono leading-5 bg-slate-50 rounded px-2 py-1 max-h-[60px] overflow-hidden" :title="sample.original_text">
                            {{ sample.original_text.length > 120 ? sample.original_text.slice(0, 120) + '...' : sample.original_text }}
                          </div>
                          <div class="flex flex-wrap gap-1 mt-1.5">
                            <span
                              v-for="(s, si) in sample.stocks"
                              :key="si"
                              class="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-emerald-50 text-emerald-700 text-[10px]"
                            >
                              <span class="font-mono font-bold">{{ s.code }}</span>
                              <span class="text-slate-500">·</span>
                              <span>{{ s.name }}</span>
                              <span v-if="s.logic" class="text-slate-400 ml-1" :title="s.logic">· {{ s.logic.slice(0, 20) }}</span>
                            </span>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
              <div v-else class="text-center py-16 text-slate-400">
                <div class="text-4xl mb-3">📚</div>
                <div class="text-sm">还没有学习样本</div>
                <div class="text-[11px] mt-2 max-w-[360px] mx-auto leading-5">
                  在「手动添加推票追踪」弹窗里，粘贴原文 → 纠正自动解析结果 → 点「添加」提交。
                </div>
              </div>
            </div>
          </div>

          <!-- 分页 -->
          <div v-if="trainingData._loaded" class="flex items-center justify-center gap-3 flex-shrink-0 py-2">
            <button @click="trainingDataPrevPage" :disabled="trainingDataPage <= 1 || trainingDataLoading" class="h-7 px-3 rounded border border-slate-200 text-slate-600 text-xs hover:bg-slate-50 disabled:opacity-40 flex items-center gap-1">
              <ChevronLeft class="w-3 h-3" />上一页
            </button>
            <span class="text-xs text-slate-500">第 {{ trainingDataPage }} 页 / 共 {{ Math.ceil(getCurrentTotal() / 50) }} 页</span>
            <button @click="trainingDataNextPage" :disabled="trainingDataLoading || !hasNextPage()" class="h-7 px-3 rounded border border-slate-200 text-slate-600 text-xs hover:bg-slate-50 disabled:opacity-40 flex items-center gap-1">
              下一页<ChevronRight class="w-3 h-3" />
            </button>
          </div>
        </div>

        <!-- 内容区 - 白名单/黑名单 -->
        <div v-if="rulesTab === 'filters'" class="flex-1 overflow-hidden flex flex-col p-6 gap-5 overscroll-contain" @wheel.stop @touchmove.stop>
          <div class="flex-1 overflow-y-auto space-y-5">
            <!-- 白名单 + AI 汇总 -->
            <div class="p-4 bg-slate-50 rounded-xl border border-slate-200">
              <div class="flex items-center justify-between mb-3">
                <h4 class="text-sm font-bold text-slate-700 flex items-center gap-1.5"><Users class="w-4 h-4 text-violet-500" />白名单 · AI 汇总</h4>
                <span class="text-[11px] text-slate-400">{{ whitelist.length }} 人</span>
              </div>
              <div class="flex gap-2 mb-3">
                <input
                  v-model="newNickname"
                  @keyup.enter="addWhitelist"
                  placeholder="添加昵称如: 王文林"
                  class="flex-1 h-8 px-3 rounded border border-slate-200 text-xs focus:outline-none focus:border-violet-300 bg-white"
                />
                <button @click="addWhitelist" class="h-8 px-3 rounded bg-violet-500 text-white text-xs hover:bg-violet-600 flex items-center gap-1 font-semibold">
                  <UserPlus class="w-3.5 h-3.5" />添加
                </button>
              </div>
              <div v-if="whitelist.length" class="flex flex-wrap gap-1.5 mb-3">
                <span
                  v-for="w in whitelist"
                  :key="w.id"
                  @click="toggleWhitelist(w)"
                  class="group/wh px-2.5 py-1 rounded text-xs font-medium flex items-center gap-1.5 cursor-pointer transition-colors"
                  :class="w.enabled ? 'bg-violet-100 text-violet-700 hover:bg-violet-200' : 'bg-slate-100 text-slate-400 line-through'"
                  :title="w.note || ''"
                >
                  {{ w.nickname }}
                  <button @click.stop="removeWhitelist(w.id)" class="opacity-0 group-hover/wh:opacity-100 text-slate-400 hover:text-red-500"><X class="w-3 h-3" /></button>
                </span>
              </div>
              <p v-else class="text-xs text-slate-400 mb-2">添加昵称后，系统会聚合这些人的消息供 AI 分析</p>

              <!-- AI 汇总操作 -->
              <div class="mt-3 pt-3 border-t border-slate-200">
                <div class="flex items-center gap-2 mb-2">
                  <select v-model="summaryDays" class="h-8 px-2 rounded border border-slate-200 text-xs bg-white flex-shrink-0">
                    <option :value="1">最近1天</option>
                    <option :value="3">最近3天</option>
                    <option :value="7">最近7天</option>
                    <option :value="14">最近14天</option>
                    <option :value="30">最近30天</option>
                  </select>
                  <button
                    @click="openMarketSelectDialog"
                    class="flex-1 h-8 rounded bg-gradient-to-r from-violet-500 to-indigo-500 text-white text-xs font-semibold hover:from-violet-600 hover:to-indigo-600 flex items-center justify-center gap-1.5"
                  >
                    <Sparkles class="w-3.5 h-3.5" />AI 分析全部消息
                  </button>
                </div>
                <div v-if="summaryResult" class="rounded-lg border border-violet-100 bg-violet-50/40 p-3">
                  <div class="flex items-center justify-between mb-2">
                    <span class="text-xs font-semibold text-violet-700">AI 分析报告</span>
                    <span class="text-[10px] text-violet-400">
                      {{ summaryResult.analyzedMessages || summaryResult.totalMessages }}/{{ summaryResult.totalMessages }} 条 · {{ summaryResult.periodDays }} 天
                      <span v-if="summaryResult.filteredOut > 0" class="text-slate-400">（已过滤 {{ summaryResult.filteredOut }} 条营销）</span>
                    </span>
                  </div>
                  <div class="text-xs text-slate-700 leading-6 whitespace-pre-wrap max-h-[300px] overflow-auto summary-markdown" v-html="summaryHtml"></div>
                </div>
                <p v-if="summaryError" class="text-xs text-red-500 mt-2">{{ summaryError }}</p>
              </div>
            </div>

            <!-- 黑名单管理 -->
            <div class="p-4 bg-slate-50 rounded-xl border border-slate-200">
              <div class="flex items-center justify-between mb-3">
                <h4 class="text-sm font-bold text-slate-700 flex items-center gap-1.5"><ShieldAlert class="w-4 h-4 text-rose-500" />黑名单 · 过滤消息</h4>
                <span class="text-[11px] text-slate-400">{{ blacklist.length }} 条</span>
              </div>
              <div class="flex gap-2 mb-2">
                <select v-model="newBlackType" class="h-8 px-2 rounded border border-slate-200 text-xs bg-white">
                  <option value="keyword">关键词</option>
                  <option value="sender">发送人</option>
                  <option value="chat_name">群聊</option>
                  <option value="session_keyword">会话跳过</option>
                </select>
                <input
                  v-model="newBlackValue"
                  @keyup.enter="addBlacklist"
                  :placeholder="newBlackType === 'keyword' ? '包含即过滤，如：办一个、福利' : newBlackType === 'sender' ? '发送人昵称' : newBlackType === 'chat_name' ? '群聊名称' : '会话跳过关键词'"
                  class="flex-1 h-8 px-2 rounded border border-slate-200 text-xs focus:outline-none focus:border-rose-300 bg-white"
                />
                <button @click="addBlacklist" class="h-8 px-3 rounded bg-rose-500 text-white text-xs hover:bg-rose-600 flex items-center gap-1 font-semibold">
                  <Ban class="w-3.5 h-3.5" />添加
                </button>
              </div>
              <input
                v-model="newBlackNote"
                placeholder="备注说明（可选）"
                class="w-full h-8 px-2 mb-3 rounded border border-slate-200 text-xs focus:outline-none focus:border-rose-300"
              />
              <div v-if="blacklist.length" class="flex flex-wrap gap-1.5 max-h-[200px] overflow-auto">
                <span
                  v-for="b in blacklist"
                  :key="b.id"
                  @click="toggleBlacklist(b)"
                  class="group/bl px-2.5 py-1 rounded text-xs font-medium flex items-center gap-1.5 cursor-pointer transition-colors"
                  :class="[
                    !b.enabled ? 'bg-slate-100 text-slate-400 line-through' :
                    b.type === 'session_keyword' ? 'bg-sky-100 text-sky-700 hover:bg-sky-200' :
                    'bg-rose-100 text-rose-700 hover:bg-rose-200'
                  ]"
                  :title="b.note || ''"
                >
                  <span
                    class="px-1 rounded bg-white/60 text-[10px] font-normal"
                    :class="b.type === 'session_keyword' ? 'text-sky-500' : 'text-slate-500'"
                  >{{ blackTypeLabel(b.type) }}</span>
                  {{ b.value }}
                  <button @click.stop="removeBlacklist(b.id)" class="opacity-0 group-hover/bl:opacity-100 text-slate-400 hover:text-red-500"><X class="w-3 h-3" /></button>
                </span>
              </div>
              <p v-else class="text-xs text-slate-400 mt-1">消息级过滤（命中即不入库） + 会话跳过（不点击进入）</p>
            </div>
          </div>
        </div>

        <!-- 底部 -->
        <div class="flex items-center justify-end px-6 py-4 border-t border-slate-100 flex-shrink-0">
          <button @click="showRulesDialog = false" class="h-10 px-6 rounded-lg border border-slate-200 text-slate-600 text-sm hover:bg-slate-50 font-medium">关闭</button>
        </div>
      </div>
    </div>

    <!-- 新增分类规则对话框 -->
    <div v-if="showAddRule" class="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-sm" @mousedown.self="showAddRule = false">
      <div class="bg-white rounded-2xl shadow-2xl w-[420px] max-w-[92vw] p-5">
        <div class="flex items-center justify-between mb-4">
          <h4 class="text-base font-bold text-slate-800 flex items-center gap-2"><Wand2 class="w-4 h-4 text-indigo-500" />新增分类规则</h4>
          <button @click="showAddRule = false" class="text-slate-400 hover:text-slate-600"><X class="w-4 h-4" /></button>
        </div>
        <div class="space-y-3">
          <div>
            <label class="text-[11px] font-semibold text-slate-500 block mb-1">分类</label>
            <div class="flex gap-1">
              <button
                v-for="c in categoryOptions"
                :key="c.value"
                @click="newRuleForm.category = c.value"
                class="flex-1 h-8 rounded-lg border text-[11px] font-semibold transition-colors"
                :class="newRuleForm.category === c.value ? c.activeClass : 'border-slate-200 text-slate-500 hover:bg-slate-50'"
              >{{ c.label }}</button>
            </div>
          </div>
          <div>
            <label class="text-[11px] font-semibold text-slate-500 block mb-1">关键词</label>
            <input
              v-model="newRuleForm.keyword"
              @keyup.enter="submitAddRule"
              placeholder="如: 涨停、T+1、放量"
              class="w-full h-9 px-3 rounded-lg border border-slate-200 text-sm focus:outline-none focus:border-indigo-300"
            />
          </div>
          <div>
            <label class="text-[11px] font-semibold text-slate-500 block mb-1">权重（数字越大越重要）</label>
            <input
              v-model.number="newRuleForm.weight"
              type="number"
              min="1"
              max="10"
              class="w-full h-9 px-3 rounded-lg border border-slate-200 text-sm focus:outline-none focus:border-indigo-300"
            />
          </div>
          <p class="text-[10px] text-slate-400">关键词命中消息时，会给对应分类加上权重分数。例如"涨停"出现给推票消息加2分。</p>
          <div v-if="addRuleError" class="text-[11px] text-red-500">{{ addRuleError }}</div>
        </div>
        <div class="flex items-center justify-end gap-2 mt-4">
          <button @click="showAddRule = false" class="h-9 px-4 rounded-xl border border-slate-200 text-slate-500 text-sm hover:bg-slate-50">取消</button>
          <button @click="submitAddRule" :disabled="addingRule" class="h-9 px-4 rounded-xl bg-indigo-500 text-white text-sm font-semibold hover:bg-indigo-600 disabled:opacity-50">
            {{ addingRule ? '添加中...' : '添加规则' }}
          </button>
        </div>
      </div>
    </div>
  </div>

  <!-- ===== 自定义行情分析：全屏选择弹窗 ===== -->
  <div
    v-if="showMarketSelectDialog"
    class="market-analysis-backdrop fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4"
    @click.self="closeMarketSelectDialog"
    @keydown="onMarketDialogKeydown"
  >
    <div class="market-analysis-shell w-full h-full max-w-[1800px] max-h-[96vh] flex flex-col overflow-hidden">
      <!-- 顶部栏 -->
      <div class="market-analysis-header flex items-center justify-between px-5 py-3.5">
        <div class="flex items-center gap-3">
          <div class="market-analysis-mark w-10 h-10 rounded-xl text-white flex items-center justify-center">
            <MessageSquareText class="w-5 h-5" />
          </div>
          <div>
            <div class="text-sm font-bold text-white flex items-center gap-2">
              自定义行情分析
              <Globe class="w-3.5 h-3.5 text-cyan-300" title="AI 将结合联网搜索进行分析" />
            </div>
            <div class="text-[11px] text-slate-400 mt-0.5">
              选择需要AI分析的消息。AI会基于所选内容并结合联网搜索相关数据给出分析报告
            </div>
          </div>
        </div>
        <div class="flex items-center gap-2">
          <div class="market-analysis-counter text-[11px] mr-2">已选 <span class="font-bold text-cyan-300">{{ marketSelectedCount }}</span> 条</div>
          <button
            @click="closeMarketSelectDialog"
            class="w-9 h-9 rounded-xl border border-white/10 bg-white/5 hover:bg-white/10 flex items-center justify-center text-slate-400 hover:text-white transition-colors"
          >
            <X class="w-5 h-5" />
          </button>
        </div>
      </div>

      <!-- 工具栏：快捷选择 + 搜索 -->
      <div class="market-analysis-toolbar px-5 py-3 flex flex-wrap items-center gap-2">
        <div class="market-analysis-segmented flex items-center gap-1 rounded-lg p-0.5">
          <button
            @click="setMarketSelectionMode('all')"
            class="h-7 px-3 rounded-md text-[11px] font-semibold transition-colors"
            :class="marketSelectionMode === 'all' ? 'bg-slate-600/80 text-white shadow-[0_0_14px_rgba(148,163,184,0.18)]' : 'text-slate-400 hover:text-slate-100 hover:bg-white/5'"
          >全选</button>
          <button
            @click="setMarketSelectionMode('market_news')"
            class="h-7 px-3 rounded-md text-[11px] font-semibold transition-colors"
            :class="marketSelectionMode === 'market_news' ? 'bg-cyan-500/80 text-slate-950 shadow-[0_0_16px_rgba(34,211,238,0.22)]' : 'text-slate-400 hover:text-slate-100 hover:bg-white/5'"
          >仅行情</button>
          <button
            @click="setMarketSelectionMode('stock_pick')"
            class="h-7 px-3 rounded-md text-[11px] font-semibold transition-colors"
            :class="marketSelectionMode === 'stock_pick' ? 'bg-emerald-400/85 text-slate-950 shadow-[0_0_16px_rgba(52,211,153,0.2)]' : 'text-slate-400 hover:text-slate-100 hover:bg-white/5'"
          >仅推票</button>
          <button
            @click="setMarketSelectionMode('manual')"
            class="h-7 px-3 rounded-md text-[11px] font-semibold transition-colors"
            :class="marketSelectionMode === 'manual' ? 'bg-amber-400/85 text-slate-950 shadow-[0_0_16px_rgba(251,191,36,0.18)]' : 'text-slate-400 hover:text-slate-100 hover:bg-white/5'"
          >手动选</button>
        </div>
        <button
          @click="toggleMarketVisibleSelectAll"
          class="h-7 px-3 rounded-lg border border-white/10 text-[11px] font-semibold text-slate-300 bg-white/5 hover:bg-white/10 hover:text-white flex items-center gap-1 transition-colors"
        >
          <Square v-if="!marketIsAllVisibleSelected" class="w-3 h-3" />
          <Check v-else class="w-3 h-3 text-cyan-300" />
          {{ marketIsAllVisibleSelected ? '取消全选当前' : '全选当前筛选' }}
        </button>
        <div class="market-analysis-search flex-1 min-w-[200px] max-w-md flex items-center gap-1.5 px-2.5 h-8 rounded-lg">
          <Search class="w-3.5 h-3.5 text-cyan-300/70" />
          <input
            v-model="marketSearchQuery"
            placeholder="搜索发送人/聊天名/消息内容..."
            class="flex-1 h-full bg-transparent text-[12px] text-slate-100 focus:outline-none placeholder:text-slate-500"
          />
        </div>
        <div class="flex items-center gap-2 ml-auto">
          <button
            @click="runCustomMarketAnalysis"
            :disabled="!marketSelectedCount || analyzingMarket"
            class="market-analysis-primary h-9 px-5 rounded-xl text-white text-[12px] font-bold disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
          >
            <Sparkles class="w-4 h-4" />
            {{ analyzingMarket ? 'AI 联网分析中...' : `确认分析 (${marketSelectedCount})` }}
          </button>
        </div>
      </div>

      <!-- 主体：左消息列表 / 右分析结果 -->
      <div class="market-analysis-body flex-1 min-h-0 grid grid-cols-5 overflow-hidden">
        <!-- 左：消息列表 -->
        <div class="market-analysis-list col-span-3 flex flex-col min-h-0">
          <div class="market-analysis-subheader px-3 py-2 text-[10px] font-semibold text-slate-400 flex items-center justify-between">
            <span>消息列表 · 共 {{ marketFilteredEvents.length }} 条</span>
            <span v-if="marketSearchQuery">搜索: {{ marketSearchQuery }}</span>
          </div>
          <div class="flex-1 min-h-0 overflow-y-auto">
            <div v-if="!marketFilteredEvents.length" class="h-full flex flex-col items-center justify-center text-slate-400">
              <Inbox class="w-14 h-14 mb-2 opacity-40" />
              <div class="text-sm">暂无符合条件的消息</div>
            </div>
            <div
              v-for="(ev, idx) in marketFilteredEvents"
              :key="ev.id"
              class="market-analysis-row"
            >
              <div
                @click="toggleMarketEvent(ev.id)"
                class="px-3 py-2.5 flex items-start gap-2 cursor-pointer transition-colors"
                :class="marketSelectedIds.has(ev.id) ? 'market-analysis-row-selected' : 'hover:bg-white/[0.035]'"
              >
                <div class="pt-0.5 flex-shrink-0">
                  <div
                    class="w-4 h-4 rounded border flex items-center justify-center transition-colors"
                    :class="marketSelectedIds.has(ev.id) ? 'bg-cyan-400 border-cyan-300 text-slate-950 shadow-[0_0_12px_rgba(34,211,238,0.35)]' : 'bg-white/5 border-white/20'"
                  >
                    <Check v-if="marketSelectedIds.has(ev.id)" class="w-3 h-3 text-slate-950" />
                  </div>
                </div>
                <div class="flex-1 min-w-0">
                  <div class="flex items-center gap-2 mb-0.5 flex-wrap">
                    <span
                      class="text-[10px] px-1.5 py-0.5 rounded font-semibold"
                      :class="categoryBadgeClass(ev.category)"
                    >{{ categoryLabel(ev.category) }}</span>
                    <span v-if="ev.sender" class="text-[10px] font-semibold text-slate-200 truncate max-w-[140px]">{{ ev.sender }}</span>
                    <span v-if="ev.chatName && ev.chatName !== ev.sender" class="text-[10px] text-slate-500 truncate max-w-[160px]">{{ ev.chatName }}</span>
                    <span class="text-[10px] text-slate-500">{{ ev.messageTime || ev.capturedAt }}</span>
                  </div>
                  <div class="text-[11px] text-slate-300 leading-snug whitespace-pre-wrap break-words line-clamp-3">
                    {{ ev.usefulMessage || ev.messageText || '' }}
                  </div>
                  <div v-if="ev.stocks && ev.stocks.length" class="mt-1 flex flex-wrap gap-1">
                    <span
                      v-for="s in ev.stocks"
                      :key="s.code"
                      class="text-[9px] px-1.5 py-0.5 rounded bg-emerald-50 text-emerald-700 border border-emerald-100 font-semibold"
                    >{{ s.name }} {{ s.code }}</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        <!-- 右：AI分析结果 -->
        <div class="market-analysis-result col-span-2 flex flex-col min-h-0">
          <div class="market-analysis-subheader px-3 py-2 text-[10px] font-semibold text-slate-300 flex items-center justify-between">
            <span class="flex items-center gap-1">
              <Globe class="w-3 h-3 text-cyan-300" />
              AI 联网分析报告
            </span>
            <span v-if="analyzingMarket" class="text-cyan-300 flex items-center gap-1">
              <RefreshCw class="w-3 h-3 animate-spin" />正在分析...
            </span>
          </div>
          <div class="market-analysis-report flex-1 min-h-0 overflow-y-auto p-5">
            <div v-if="analyzingMarket" class="h-full flex flex-col items-center justify-center text-slate-300 gap-3">
              <div class="relative w-14 h-14">
                <div class="absolute inset-0 rounded-full border border-cyan-300/15 shadow-[0_0_28px_rgba(34,211,238,0.12)]"></div>
                <div class="absolute inset-0 rounded-full border-2 border-t-cyan-300 border-r-indigo-400 border-b-transparent border-l-transparent animate-spin"></div>
                <Sparkles class="absolute inset-0 m-auto w-6 h-6 text-cyan-300" />
              </div>
              <div class="text-sm font-semibold">AI 正在深度分析...</div>
              <div class="text-[11px] text-slate-500">已选 {{ marketSelectedCount }} 条消息，正在联网搜索相关市场数据</div>
            </div>
            <div v-else-if="marketAnalysisError" class="h-full flex flex-col items-center justify-center text-red-500 gap-2">
              <AlertTriangle class="w-10 h-10 opacity-50" />
              <div class="text-sm font-semibold">分析失败</div>
              <div class="text-[11px]">{{ marketAnalysisError }}</div>
            </div>
            <div v-else-if="marketAnalysisResult" class="market-analysis-prose text-[12px] leading-relaxed text-slate-300 prose prose-sm max-w-none">
              <div v-html="renderMarkdown(marketAnalysisResult)"></div>
            </div>
            <div v-else class="h-full flex flex-col items-center justify-center text-slate-500 gap-2">
              <div class="market-analysis-empty-mark"><MessageSquareText class="w-9 h-9" /></div>
              <div class="text-sm">请选择消息后点击「确认分析」</div>
              <div class="text-[11px] text-center max-w-[280px]">
                AI会根据您选择的消息内容，同时联网搜索相关的股票行情、板块资讯、大盘走势等公开数据，给出综合的分析报告。
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
  <!-- ===== end 自定义行情分析弹窗 ===== -->

  <!-- ===== 手动添加推票追踪对话框（左主右控布局） ===== -->
  <Teleport to="body">
  <div v-if="showManualTracking" class="fixed inset-0 z-[1000] flex items-center justify-center bg-slate-900/40 backdrop-blur-sm p-4" @click.self="closeManualTracking" @keydown.esc="closeManualTracking" tabindex="-1">
    <section class="bg-white rounded-xl shadow-xl w-full max-w-2xl flex flex-col max-h-[92vh]">
      <!-- 标题栏 -->
      <div class="flex items-center justify-between px-5 py-3 border-b border-slate-100 flex-shrink-0">
        <h3 class="text-sm font-bold flex items-center gap-1.5">
          <Plus class="w-4 h-4 text-emerald-500" />手动添加推票追踪
        </h3>
        <button @click="closeManualTracking" class="w-6 h-6 rounded flex items-center justify-center text-slate-400 hover:text-slate-600 hover:bg-slate-100" title="关闭 (Esc)">
          <X class="w-4 h-4" />
        </button>
      </div>
      <!-- 主体：左侧表单 + 右侧操作按钮 -->
      <div class="flex gap-4 p-5 overflow-y-auto">
        <!-- 左侧：表单 -->
        <div class="flex-1 space-y-3 min-w-0">
          <!-- 投资人（从白名单选择 + 手动输入） -->
          <div>
            <label class="text-[11px] text-slate-500 flex items-center gap-1">
              投资人 <span class="text-red-500">*</span>
            </label>
            <select
              v-model="manualForm.sender"
              class="w-full px-2 py-1.5 text-xs border border-slate-200 rounded bg-white focus:outline-none focus:border-emerald-300"
            >
              <option value="">请选择已有投资人</option>
              <option v-for="s in manualInvestorOptions" :key="s" :value="s">{{ s }}</option>
            </select>
            <input
              v-model="manualForm.sender"
              class="w-full mt-1.5 px-2 py-1.5 text-xs border border-slate-200 rounded focus:outline-none focus:border-emerald-300"
              placeholder="或输入新的投资人昵称"
            />
          </div>
          <!-- 推荐日期 -->
          <div>
            <label class="text-[11px] text-slate-500">推荐日期 <span class="text-red-500">*</span></label>
            <input
              type="date"
              v-model="manualForm.pickDate"
              class="w-full px-2 py-1.5 text-xs border border-slate-200 rounded focus:outline-none focus:border-emerald-300"
            />
          </div>
          <!-- 股票多行输入（自动解析） -->
          <div>
            <label class="text-[11px] text-slate-500 flex items-center justify-between">
              <span>股票 <span class="text-red-500">*</span> <span class="text-[10px] text-slate-400">格式: 代码 名称：逻辑</span></span>
              <span class="text-[10px] text-emerald-500">已识别 {{ parsedManualStocks.length }} 只</span>
            </label>
            <textarea
              v-model="manualForm.stocksText"
              rows="10"
              class="w-full px-3 py-2 text-xs border border-slate-200 rounded resize-none font-mono leading-5 focus:outline-none focus:border-emerald-300"
              placeholder="每行一只，如:&#10;002438 江苏神通：核电 + 半导体&#10;601611 中国核电：电力 + 核电&#10;或逗号/分号分隔"
            ></textarea>
            <!-- 解析预览（可编辑纠正） -->
            <div v-if="parsedManualStocks.length" class="mt-1.5 space-y-1">
              <div
                v-for="(s, idx) in parsedManualStocks"
                :key="idx"
                class="flex items-center gap-1.5 px-2 py-1 rounded-lg bg-emerald-50 border border-emerald-100 text-[11px]"
              >
                <input
                  :value="s.code"
                  @input="s.code = $event.target.value"
                  placeholder="代码"
                  class="w-14 px-1 py-0.5 rounded border border-emerald-200 font-mono font-bold text-emerald-700 text-[10px] focus:outline-none focus:border-emerald-400 bg-white"
                />
                <input
                  :value="s.name"
                  @input="s.name = $event.target.value"
                  placeholder="名称"
                  class="w-16 px-1 py-0.5 rounded border border-emerald-200 text-slate-700 font-semibold text-[10px] focus:outline-none focus:border-emerald-400 bg-white"
                />
                <input
                  :value="s.logic"
                  @input="s.logic = $event.target.value"
                  placeholder="推荐逻辑（可选）"
                  class="flex-1 px-1 py-0.5 rounded border border-emerald-200 text-slate-400 text-[10px] focus:outline-none focus:border-emerald-400 bg-white"
                />
                <button @click="parsedManualStocks.splice(idx, 1)" class="text-red-400 hover:text-red-600 flex-shrink-0" title="移除">
                  <X class="w-3 h-3" />
                </button>
              </div>
            </div>
          </div>
          <div v-if="manualError" class="text-[11px] text-red-500">{{ manualError }}</div>
        </div>
        <!-- 右侧：操作按钮（垂直排列） -->
        <div class="flex flex-col gap-2 justify-end w-20 flex-shrink-0">
          <button
            @click="submitManualTracking"
            :disabled="submittingManual || !parsedManualStocks.length"
            class="px-3 py-2 rounded-lg bg-emerald-500 text-white text-xs font-semibold hover:bg-emerald-600 disabled:opacity-50 flex items-center justify-center gap-1"
          >
            <Plus class="w-3.5 h-3.5" />{{ submittingManual ? '提交中...' : '添加' }}
          </button>
          <button
            @click="closeManualTracking"
            class="px-3 py-2 rounded-lg bg-slate-100 text-slate-600 text-xs font-semibold hover:bg-slate-200"
          >
            取消
          </button>
          <button
            v-if="!submittingManual"
            @click="resetManualForm"
            class="px-3 py-2 rounded-lg text-slate-400 text-[11px] hover:bg-slate-50"
            title="清空表单"
          >
            重置
          </button>
        </div>
      </div>
    </section>
  </div>
  <!-- 批量修改推荐日期弹窗 -->
  <div v-if="showBatchDateDialog" class="fixed inset-0 z-[1001] flex items-center justify-center bg-slate-900/40 backdrop-blur-sm p-4">
    <section class="bg-white rounded-2xl shadow-2xl w-[380px] max-w-[92vw] overflow-hidden">
      <div class="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
        <h3 class="text-base font-bold text-slate-800 flex items-center gap-2">
          📅 批量修改推荐日期
        </h3>
        <button @click="cancelBatchChangeDate" class="text-slate-400 hover:text-slate-600"><X class="w-5 h-5" /></button>
      </div>
      <div class="p-5 space-y-4">
        <div class="text-[12px] text-slate-500 leading-5 bg-amber-50 rounded-lg px-3 py-2 border border-amber-100">
          已选中 <span class="font-bold text-amber-600">{{ selectedTrackingIds.size }}</span> 条推票记录。修改日期后，会自动重新刷新股价计算（累计涨跌、有效止盈等都会重新算）。
        </div>
        <div>
          <label class="text-[12px] font-semibold text-slate-600 block mb-1.5">新的推荐日期</label>
          <input
            type="date"
            v-model="batchDateValue"
            class="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:border-emerald-400"
          />
        </div>
      </div>
      <div class="px-5 py-3 bg-slate-50 border-t border-slate-100 flex items-center justify-end gap-2">
        <button @click="cancelBatchChangeDate" :disabled="batchDateSubmitting" class="h-8 px-4 rounded-lg bg-white border border-slate-200 text-slate-600 text-xs font-medium hover:bg-slate-50 disabled:opacity-50">
          取消
        </button>
        <button @click="confirmBatchChangeDate" :disabled="batchDateSubmitting" class="h-8 px-4 rounded-lg bg-emerald-500 text-white text-xs font-semibold hover:bg-emerald-600 disabled:opacity-50">
          {{ batchDateSubmitting ? '提交中...' : '确认修改' }}
        </button>
      </div>
    </section>
  </div>

  <!-- 按日期范围删除弹窗 -->
  <div v-if="showDeleteByDateDialog" class="fixed inset-0 z-[1001] flex items-center justify-center bg-slate-900/40 backdrop-blur-sm p-4">
    <section class="bg-white rounded-2xl shadow-2xl w-[420px] max-w-[92vw] overflow-hidden">
      <div class="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
        <h3 class="text-base font-bold text-slate-800 flex items-center gap-2">
          🗑️ 按日期范围删除
        </h3>
        <button @click="cancelDeleteByDate" class="text-slate-400 hover:text-slate-600"><X class="w-5 h-5" /></button>
      </div>
      <div class="p-5 space-y-4">
        <div class="text-[12px] text-red-600 leading-5 bg-red-50 rounded-lg px-3 py-2 border border-red-100">
          ⚠️ 此操作将 <b class="font-bold">软删除</b> 推荐日期在指定范围内的所有推票追踪记录（含每日股价明细），请谨慎操作。
        </div>
        <div class="flex items-center gap-3">
          <div class="flex-1">
            <label class="text-[12px] font-semibold text-slate-600 block mb-1.5">开始日期（含）</label>
            <input type="date" v-model="deleteDateRange.start" class="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:border-red-400" />
          </div>
          <div class="flex items-center pt-5 text-slate-400 text-sm">～</div>
          <div class="flex-1">
            <label class="text-[12px] font-semibold text-slate-600 block mb-1.5">结束日期（含）</label>
            <input type="date" v-model="deleteDateRange.end" class="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:border-red-400" />
          </div>
        </div>
        <div v-if="filterSender" class="text-[11px] text-blue-600 bg-blue-50 rounded-lg px-3 py-2 border border-blue-100">
          🔍 当前投资人筛选: <b>{{ filterSender }}</b> — 将只删除该投资人在日期范围内的记录
        </div>
        <div class="text-[11px] text-slate-400">
          提示：可配合"投资人筛选"使用，只删除某个投资人在某段时间内的记录。
        </div>
      </div>
      <div class="px-5 py-3 bg-slate-50 border-t border-slate-100 flex items-center justify-end gap-2">
        <button @click="cancelDeleteByDate" :disabled="deleteDateSubmitting" class="h-8 px-4 rounded-lg bg-white border border-slate-200 text-slate-600 text-xs font-medium hover:bg-slate-50 disabled:opacity-50">
          取消
        </button>
        <button @click="confirmDeleteByDate" :disabled="deleteDateSubmitting" class="h-8 px-4 rounded-lg bg-red-500 text-white text-xs font-semibold hover:bg-red-600 disabled:opacity-50">
          {{ deleteDateSubmitting ? '删除中...' : '确认删除' }}
        </button>
      </div>
    </section>
  </div>
  </Teleport>
</template>

<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue'
import { AlertTriangle, Ban, Calendar, Check, ChevronDown, ChevronLeft, ChevronRight, CircleAlert, ClipboardPaste, Copy, Flame, Globe, Inbox, KeyRound, LineChart, Link2, MessageCircle, MessageSquareText, MessagesSquare, MonitorUp, Pencil, Play, Plus, Radio, RefreshCw, RotateCcw, Save, ScanSearch, Search, ShieldAlert, Sparkles, Square, Tag, Target, Trash2, TrendingUp, UserPlus, Users, Wand2, X } from 'lucide-vue-next'
import { stockApi, wechatApi } from '../utils/api'
import { useStockPrice } from '../composables/useStockPrice'
import MarketTicker from './MarketTicker.vue'

const status = ref({ running: false, state: 'STOPPED', chatName: '', lastError: '', javaAvailable: false, events: [] })
const selectedId = ref('')
const editingMessage = ref(false)
const editingText = ref('')
const savingEdit = ref(false)
const textareaRows = ref(6)
const preElRef = ref(null)
const fixedBoxHeight = ref(0)
// 推荐逻辑编辑
const editingLogicStock = ref('')
const editingLogicText = ref('')
const logicInputRef = ref(null)
// 绑定股票（为带链接的消息手动绑定股票）
const showBindStocks = ref(false)
const bindStocksInput = ref('')
const bindingStocks = ref(false)
const bindStocksError = ref('')
// 手动添加推票追踪（不依赖微信消息，直接为投资人添加推荐记录）
const showManualTracking = ref(false)
const manualForm = reactive({
  sender: '',
  stocksText: '',
  pickDate: '',
})
const submittingManual = ref(false)
const manualError = ref('')
const busy = ref(false)
const refreshing = ref(false)
const deleting = ref(false)
const copied = ref(false)
const clearDropdownOpen = ref(false)
const copiedCode = ref('')
const pageError = ref('')
const calOpen = ref(false)

// 白名单
const whitelist = ref([])
const newNickname = ref('')
const summaryDays = ref(7)
const summarizing = ref(false)
const summaryResult = ref(null)
const summaryError = ref('')

// 黑名单
const blacklist = ref([])
const newBlackType = ref('keyword')  // sender / chat_name / keyword
const newBlackValue = ref('')
const newBlackNote = ref('')

// 投资人分析：目标盈利金额输入
const targetProfitMap = reactive({})  // sender -> 金额

// 图片/文字提取股票
const extractTextInput = ref('')
const extracting = ref(false)
const extractResult = ref(null)
const extractError = ref('')
const selectedImageFiles = ref([])  // 改为数组支持多图
const addingStockCode = ref('')

// 保存提取结果表单
const savingExtract = ref(false)
const saveMsg = ref('')
const saveMsgType = ref('ok')
const saveMsgTypeClass = computed(() => {
  switch (saveMsgType.value) {
    case 'ok': return 'text-[10px] text-emerald-600'
    case 'err': return 'text-[10px] text-red-500'
    case 'info': return 'text-[10px] text-blue-500'
    case 'warn': return 'text-[10px] text-amber-500'
    default: return 'text-[10px] text-slate-500'
  }
})
const saveForm = reactive({
  sender: '',
  recommendationDate: new Date().toISOString().slice(0, 10),
  chatName: '',
  category: '',
})
const senderSuggestions = ref([])  // 已有的投资人下拉建议

// 分类反馈
const categoryOptions = [
  { value: 'stock_pick', label: '推票消息', activeClass: 'bg-emerald-500 text-white border-emerald-500' },
  { value: 'market_news', label: '行情消息', activeClass: 'bg-blue-500 text-white border-blue-500' },
  { value: 'marketing', label: '营销消息', activeClass: 'bg-orange-500 text-white border-orange-500' },
]
function categoryLabel(v) {
  const m = { stock_pick: '推票消息', market_news: '行情消息', marketing: '营销消息' }
  return m[v] || (v || '未知')
}
function categoryBadgeClass(v) {
  const m = {
    stock_pick: 'bg-emerald-50 text-emerald-600 border border-emerald-100',
    market_news: 'bg-blue-50 text-blue-600 border border-blue-100',
    marketing: 'bg-orange-50 text-orange-600 border border-orange-100',
  }
  return m[v] || 'bg-slate-50 text-slate-600 border border-slate-200'
}
// 平均涨幅 5 档颜色（正数越红，负数越绿）
function avgChangeColor(val) {
  if (val === null || val === undefined) return 'text-slate-300'
  if (val >= 0) {
    if (val >= 20) return 'text-red-700 font-bold'
    if (val >= 10) return 'text-red-600 font-semibold'
    if (val >= 5) return 'text-red-500'
    if (val >= 2) return 'text-red-400'
    return 'text-red-300'
  } else {
    if (val <= -20) return 'text-green-700 font-bold'
    if (val <= -10) return 'text-green-600 font-semibold'
    if (val <= -5) return 'text-green-500'
    if (val <= -2) return 'text-green-400'
    return 'text-green-300'
  }
}
const categoryFeedback = reactive({
  show: false,
  eventId: '',
  messageText: '',
  predictedCategory: '',
  correctedCategory: '',
  showCorrectPicker: false,
  statusText: '',
})
function openCategoryFeedback({ eventId = '', messageText = '', predictedCategory = '' }) {
  if (!predictedCategory || !messageText) return
  categoryFeedback.show = true
  categoryFeedback.eventId = eventId
  categoryFeedback.messageText = String(messageText).slice(0, 400)
  categoryFeedback.predictedCategory = predictedCategory
  categoryFeedback.correctedCategory = ''
  categoryFeedback.showCorrectPicker = false
  categoryFeedback.statusText = ''
}
function closeCategoryFeedback() {
  categoryFeedback.show = false
  categoryFeedback.eventId = ''
  categoryFeedback.messageText = ''
  categoryFeedback.predictedCategory = ''
  categoryFeedback.correctedCategory = ''
  categoryFeedback.showCorrectPicker = false
  categoryFeedback.statusText = ''
}
async function submitCategoryFeedback(isCorrect) {
  try {
    categoryFeedback.statusText = '正在提交反馈...'
    await wechatApi.submitCategoryFeedback({
      eventId: categoryFeedback.eventId,
      messageText: categoryFeedback.messageText,
      predictedCategory: categoryFeedback.predictedCategory,
      userCorrect: isCorrect ? 1 : 0,
      userCorrectedCategory: isCorrect ? '' : categoryFeedback.correctedCategory,
    })
    categoryFeedback.statusText = isCorrect
      ? '✓ 反馈已记录，正在优化分类规则...'
      : '✓ 修正已记录，规则已更新'
    // 短暂显示成功状态后关闭
    setTimeout(closeCategoryFeedback, 900)
  } catch (err) {
    categoryFeedback.statusText = '提交失败：' + (err.response?.data?.error || err.message)
  }
}

// ================== 手动归类（修改消息分类）==================
// 列表卡片中的分类修改器
const categoryChanger = reactive({
  eventId: '',
  oldCategory: '',
  newCategory: '',
  status: '',
})
function openCategoryChanger(event) {
  if (!event?.id) return
  categoryChanger.eventId = event.id
  categoryChanger.oldCategory = event.category || ''
  categoryChanger.newCategory = event.category || 'market_news'
  categoryChanger.status = ''
}
function closeCategoryChanger() {
  categoryChanger.eventId = ''
  categoryChanger.oldCategory = ''
  categoryChanger.newCategory = ''
  categoryChanger.status = ''
}
async function submitChangeCategory(event, newCategory) {
  if (!event?.id || !newCategory) return
  const oldCategory = event.category || ''
  if (oldCategory === newCategory) {
    closeCategoryChanger()
    return
  }
  categoryChanger.newCategory = newCategory
  categoryChanger.status = '保存中...'
  try {
    await wechatApi.updateEventCategory(event.id, {
      category: newCategory,
      oldCategory,
      triggerLearn: true,
    })
    // 立即更新本地状态
    const e = events.value.find(x => x.id === event.id)
    if (e) e.category = newCategory
    // 同步更新 monitor 返回的 events（若是最近捕获的）
    if (status.value.events && Array.isArray(status.value.events)) {
      const me = status.value.events.find(x => x.id === event.id)
      if (me) me.category = newCategory
    }
    categoryChanger.status = '✓ 已归类，规则已更新'
    setTimeout(() => {
      closeCategoryChanger()
      // 刷新列表统计 + 规则面板（用户改分类后规则确实学到了，但前端没刷新）
      Promise.all([loadInvestorAnalysis(), loadTrackingStocks(), loadCategoryRules(true)]).catch(() => {})
    }, 700)
  } catch (err) {
    categoryChanger.status = '失败：' + (err.response?.data?.error || err.message)
  }
}

// 详情页中的分类修改器
const detailCategoryChanger = reactive({
  show: false,
  eventId: '',
  oldCategory: '',
  newCategory: '',
  status: '',
})
function openDetailCategoryChanger(event) {
  if (!event?.id) return
  detailCategoryChanger.show = true
  detailCategoryChanger.eventId = event.id
  detailCategoryChanger.oldCategory = event.category || ''
  detailCategoryChanger.newCategory = event.category || 'market_news'
  detailCategoryChanger.status = ''
}
function closeDetailCategoryChanger() {
  detailCategoryChanger.show = false
  detailCategoryChanger.eventId = ''
  detailCategoryChanger.oldCategory = ''
  detailCategoryChanger.newCategory = ''
  detailCategoryChanger.status = ''
}
async function submitDetailCategoryChange(newCategory) {
  const eventId = detailCategoryChanger.eventId
  const oldCategory = detailCategoryChanger.oldCategory
  if (!eventId || !newCategory) return
  if (oldCategory === newCategory) {
    closeDetailCategoryChanger()
    return
  }
  detailCategoryChanger.newCategory = newCategory
  detailCategoryChanger.status = '保存中...'
  try {
    await wechatApi.updateEventCategory(eventId, {
      category: newCategory,
      oldCategory,
      triggerLearn: true,
    })
    // 立即更新本地
    const e = events.value.find(x => x.id === eventId)
    if (e) e.category = newCategory
    if (status.value.events && Array.isArray(status.value.events)) {
      const me = status.value.events.find(x => x.id === eventId)
      if (me) me.category = newCategory
    }
    detailCategoryChanger.status = '✓ 已归类，规则已更新'
    setTimeout(() => {
      closeDetailCategoryChanger()
      Promise.all([loadInvestorAnalysis(), loadTrackingStocks(), loadCategoryRules(true)]).catch(() => {})
    }, 700)
  } catch (err) {
    detailCategoryChanger.status = '失败：' + (err.response?.data?.error || err.message)
  }
}

// 投资人追踪
const trackingStocks = ref([])  // 追踪列表
const trackingSummary = ref({ total: 0, lockedCount: 0, upCount: 0, downCount: 0, flatCount: 0, pendingCount: 0 })
const trackingLoading = ref(false)
const batchRefreshing = ref(false)
const batchRefreshProgress = ref(0)
const batchRefreshTotal = ref(0)
const nextPriceRefreshAt = ref(Date.now() + 120000)
const priceRefreshCountdown = ref('2:00')
const PRICE_REFRESH_INTERVAL = 120000

function updatePriceRefreshCountdown() {
  const remaining = Math.max(0, Math.floor((nextPriceRefreshAt.value - Date.now()) / 1000))
  const m = Math.floor(remaining / 60)
  const s = remaining % 60
  priceRefreshCountdown.value = `${m}:${s.toString().padStart(2, '0')}`
}
function scheduleNextPriceRefresh() {
  nextPriceRefreshAt.value = Date.now() + PRICE_REFRESH_INTERVAL
  updatePriceRefreshCountdown()
}
const filterSender = ref('')  // 按推荐人筛选
// 推票追踪排序
const trackingSortKey = ref('pickDate')  // pickDate | totalChangePercent | totalChangeAmount | holdingDays
const trackingSortDesc = ref(true)  // 是否降序
function setTrackingSort(key) {
  if (trackingSortKey.value === key) {
    trackingSortDesc.value = !trackingSortDesc.value  // 相同字段切换升降序
  } else {
    trackingSortKey.value = key
    trackingSortDesc.value = true  // 切换字段默认降序（最新/最高排前面）
  }
}
// 批量选中删除
const batchSelectMode = ref(false)
const selectedTrackingIds = ref(new Set())
const batchDeleting = ref(false)
const expandedTracking = ref('')  // 展开每日详情的trackingId
const dailyData = ref([])
const dailyLoading = ref(false)
// 推票追踪排序计算（纯粹按用户选择的字段排序，止盈/锁定股不置顶）
const sortedTrackingStocks = computed(() => {
  const list = [...trackingStocks.value]
  const key = trackingSortKey.value
  const desc = trackingSortDesc.value
  list.sort((a, b) => {
    let va = a[key], vb = b[key]
    if (va === null || va === undefined || va === '--') va = key === 'pickDate' ? '' : -Infinity
    if (vb === null || vb === undefined || vb === '--') vb = key === 'pickDate' ? '' : -Infinity
    let cmp = 0
    if (key === 'pickDate') {
      cmp = va < vb ? -1 : va > vb ? 1 : 0
    } else {
      cmp = (Number(va) || 0) - (Number(vb) || 0)
    }
    return desc ? -cmp : cmp
  })
  return list
})

// 投资人分析
const investorList = ref([])
const investorLoading = ref(false)
const investorDays = ref(7)
const investorThreshold = ref(5)
let thresholdTimer = null
watch(investorThreshold, () => {
  if (thresholdTimer) clearTimeout(thresholdTimer)
  thresholdTimer = setTimeout(() => {
    investorThreshold.value = Math.max(0.5, Math.min(50, investorThreshold.value || 5))
    loadInvestorAnalysis()
  }, 500)
})

// 实时解盘（已抽到子组件 MarketTicker）
const marketTickerRef = ref(null)
function restartMarketPolling() {
  return marketTickerRef.value?.restartMarketPolling?.()
}
defineExpose({ restartMarketPolling })
const manualInvestorOptions = computed(() => {
  const names = new Set()
  for (const item of whitelist.value || []) {
    if (item?.nickname) names.add(String(item.nickname).trim())
  }
  for (const item of investorList.value || []) {
    if (item?.sender) names.add(String(item.sender).trim())
  }
  for (const item of trackingStocks.value || []) {
    if (item?.sender) names.add(String(item.sender).trim())
  }
  for (const name of senderSuggestions.value || []) {
    if (name) names.add(String(name).trim())
  }
  return Array.from(names).filter(Boolean).sort((a, b) => a.localeCompare(b, 'zh-CN'))
})
// 排序
const investorSortKey = ref('effectiveWinRate')  // effectiveWinRate | winRate | totalPicks | avgChangePercent | avgHoldDays
const investorSortDesc = ref(true)
// 每只股票的平均持仓天数结果缓存
const holdDaysCache = reactive({})  // sender_{targetProfitPercent}_{days} -> result

async function calcHoldDays(inv) {
  const profit = Number(targetProfitMap[inv.sender])
  if (!profit || profit <= 0) {
    inv.avgHoldDays = null
    inv.hitCount = 0
    return
  }
  try {
    const cacheKey = `${inv.sender}_${profit}_${investorDays.value}`
    if (holdDaysCache[cacheKey] !== undefined) {
      const c = holdDaysCache[cacheKey]
      inv.avgHoldDays = c.avgHoldDays
      inv.hitCount = c.hitCount
      return
    }
    const res = await wechatApi.getInvestorHoldDays(inv.sender, profit, investorDays.value)
    holdDaysCache[cacheKey] = res
    inv.avgHoldDays = res?.avgHoldDays ?? null
    inv.hitCount = res?.hitCount ?? 0
  } catch (e) {
    console.error('计算持仓天数失败:', e)
  }
}

const sortedInvestorList = computed(() => {
  const list = [...investorList.value]
  const key = investorSortKey.value
  const desc = investorSortDesc.value
  list.sort((a, b) => {
    let va = a[key], vb = b[key]
    if (va === null || va === undefined) va = -Infinity
    if (vb === null || vb === undefined) vb = -Infinity
    if (typeof va === 'string') {
      return desc ? vb.localeCompare(va) : va.localeCompare(vb)
    }
    return desc ? vb - va : va - vb
  })
  return list
})

function toggleInvestorSort(key) {
  if (investorSortKey.value === key) {
    investorSortDesc.value = !investorSortDesc.value
  } else {
    investorSortKey.value = key
    investorSortDesc.value = true
  }
}

async function loadTrackingStocks() {
  if (trackingRequest) return trackingRequest
  const requestFilter = filterSender.value || undefined
  trackingRequest = (async () => {
  try {
    trackingLoading.value = true
    const res = await wechatApi.getTracking(requestFilter)
    trackingStocks.value = res?.data || res || []
    if (res?.summary) trackingSummary.value = res.summary
  } catch (err) {
    console.error('加载追踪数据失败:', err)
  } finally {
    trackingLoading.value = false
    trackingRequest = null
  }
  })()
  return trackingRequest
}

async function refreshTrackingPrice(id) {
  try {
    await wechatApi.refreshTracking(id)
    await loadTrackingStocks()
    await loadInvestorAnalysis()
  } catch (err) {
    console.error('刷新股价失败:', err)
  }
}

async function lockTrackingStock(t) {
  try {
    const newLocked = !t.locked
    await wechatApi.lockTracking(t.id, newLocked)
    await Promise.all([loadTrackingStocks(), loadInvestorAnalysis()])
  } catch (err) {
    console.error('锁定/解锁失败:', err)
  }
}

async function switchEntryType(t, entryType) {
  if ((t.entryType ?? 0) === entryType) return
  try {
    await wechatApi.setEntryType(t.id, entryType)
    await Promise.all([loadTrackingStocks(), loadInvestorAnalysis()])
  } catch (err) {
    console.error('切换买入方式失败:', err)
  }
}

// 删除单条追踪股票
async function deleteTrackingStock(t) {
  if (!t?.id) return
  if (!confirm(`确认删除追踪「${t.stockName} ${t.stockCode}」？\n此操作将删除该股票的所有追踪数据（含每日股价明细）。`)) return
  try {
    await wechatApi.deleteTracking(t.id)
    await Promise.all([loadTrackingStocks(), loadInvestorAnalysis()])
  } catch (err) {
    console.error('删除追踪股票失败:', err)
    alert('删除失败: ' + (err.response?.data?.error || err.message))
  }
}

// 批量选中删除
function enterBatchSelectMode() {
  batchSelectMode.value = true
  selectedTrackingIds.value = new Set()
}
function exitBatchSelectMode() {
  batchSelectMode.value = false
  selectedTrackingIds.value = new Set()
}
function toggleSelectTracking(id) {
  const s = new Set(selectedTrackingIds.value)
  if (s.has(id)) s.delete(id)
  else s.add(id)
  selectedTrackingIds.value = s
}
function selectAllTracking() {
  if (selectedTrackingIds.value.size === trackingStocks.value.length) {
    selectedTrackingIds.value = new Set()
  } else {
    selectedTrackingIds.value = new Set(trackingStocks.value.map(t => t.id))
  }
}
async function batchDeleteTracking() {
  if (!selectedTrackingIds.value.size) return
  const ids = Array.from(selectedTrackingIds.value)
  if (!confirm(`确认删除选中的 ${ids.length} 只追踪股票？\n此操作将删除这些股票的所有追踪数据（含每日股价明细）。`)) return
  batchDeleting.value = true
  try {
    let success = 0, failed = 0
    for (const id of ids) {
      try {
        await wechatApi.deleteTracking(id)
        success++
      } catch {
        failed++
      }
    }
    await Promise.all([loadTrackingStocks(), loadInvestorAnalysis()])
    selectedTrackingIds.value = new Set()
    batchSelectMode.value = false
    if (failed > 0) alert(`删除完成：成功 ${success}，失败 ${failed}`)
  } catch (err) {
    console.error('批量删除失败:', err)
    alert('批量删除失败: ' + (err.response?.data?.error || err.message))
  } finally {
    batchDeleting.value = false
  }
}

// 批量修改推荐日期的弹窗状态
const showBatchDateDialog = ref(false)
const batchDateValue = ref('')
const batchDateSubmitting = ref(false)

function batchChangePickDate() {
  if (!selectedTrackingIds.value.size) return
  // 默认日期用当前选中记录的第一个日期
  const first = trackingStocks.value.find(t => selectedTrackingIds.value.has(t.id))
  batchDateValue.value = first?.pickDate || todayStr()
  showBatchDateDialog.value = true
}

async function confirmBatchChangeDate() {
  const pickDate = String(batchDateValue.value || '').trim()
  if (!pickDate) { alert('请输入日期'); return }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(pickDate)) { alert('日期格式必须是 YYYY-MM-DD'); return }
  batchDateSubmitting.value = true
  try {
    const ids = [...selectedTrackingIds.value]
    const res = await fetch('/api/wechat/tracking/batch-update', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ids, pickDate }),
    })
    const data = await res.json()
    if (!res.ok) throw new Error(data.error || '更新失败')
    showBatchDateDialog.value = false
    batchDateSubmitting.value = false
    exitBatchSelectMode()
    // 日期改了之后需要重新刷新股价（基准日变了）
    await loadTrackingStocks()
    await loadInvestorAnalysis()
    // 静默刷新股价
    refreshAllTrackingPrices().catch(() => {})
  } catch (err) {
    batchDateSubmitting.value = false
    alert('批量改日期失败: ' + err.message)
  }
}
function cancelBatchChangeDate() {
  showBatchDateDialog.value = false
  batchDateSubmitting.value = false
}

// 按日期范围删除
const showDeleteByDateDialog = ref(false)
const deleteDateRange = reactive({ start: '', end: '' })
const deleteDateSubmitting = ref(false)

function openDeleteByDateDialog() {
  const today = todayStr()
  const weekAgo = new Date()
  weekAgo.setDate(weekAgo.getDate() - 7)
  deleteDateRange.start = `${weekAgo.getFullYear()}-${String(weekAgo.getMonth() + 1).padStart(2, '0')}-${String(weekAgo.getDate()).padStart(2, '0')}`
  deleteDateRange.end = today
  showDeleteByDateDialog.value = true
}

function cancelDeleteByDate() {
  showDeleteByDateDialog.value = false
  deleteDateSubmitting.value = false
}

async function confirmDeleteByDate() {
  const { start, end } = deleteDateRange
  if (!start || !end) { alert('请填写完整的日期范围'); return }
  if (start > end) { alert('开始日期不能晚于结束日期'); return }

  // 先查一下有多少条将被删除
  const willDelete = trackingStocks.value.filter(t => {
    const d = String(t.pickDate)
    return d >= start && d <= end && (!filterSender.value || t.sender === filterSender.value)
  })
  if (!willDelete.length) {
    alert(`日期范围 ${start} ~ ${end} 内没有匹配的推票记录`)
    return
  }

  const extra = filterSender.value ? `（仅投资人「${filterSender.value}」）` : ''
  if (!confirm(`确认删除 ${start} ~ ${end} 推荐日期内的 ${willDelete.length} 只追踪股票${extra}？\n此操作将软删除这些记录及其每日股价明细。`)) return

  deleteDateSubmitting.value = true
  try {
    const res = await fetch('/api/wechat/tracking/delete-by-date-range', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ startDate: start, endDate: end, sender: filterSender.value || undefined }),
    })
    const data = await res.json()
    if (!res.ok) throw new Error(data.error || '删除失败')
    showDeleteByDateDialog.value = false
    await loadTrackingStocks()
    await loadInvestorAnalysis()
    alert(`删除完成：共删除 ${data.deletedCount} 条记录`)
  } catch (err) {
    alert('删除失败: ' + (err.response?.data?.error || err.message))
  } finally {
    deleteDateSubmitting.value = false
  }
}

// 批量刷新全部股价（后端并行）
async function refreshAllTrackingPrices() {
  if (batchRefreshing.value) return
  batchRefreshing.value = true
  batchRefreshProgress.value = 0
  batchRefreshTotal.value = trackingStocks.value.length
  try {
    const res = await wechatApi.refreshAllTracking()
    batchRefreshProgress.value = res?.success || 0
    batchRefreshTotal.value = res?.total || 0
    await loadTrackingStocks()
    // Force reactivity update
    trackingStocks.value = [...trackingStocks.value]
    if (res?.failed > 0) {
      saveMsg.value = `刷新完成：成功${res.success}只，失败${res.failed}只`
      saveMsgType.value = 'err'
    }
  } catch (err) {
    console.error('批量刷新失败:', err)
  } finally {
    batchRefreshing.value = false
    scheduleNextPriceRefresh()
  }
}

// 删除投资人
async function deleteInvestor(sender) {
  if (!sender) return
  if (!confirm(`确认删除投资人「${sender}」？\n将删除该投资人的所有推票消息和追踪记录。\n其他人推荐过的相同股票会保留。`)) return
  try {
    await wechatApi.deleteInvestor(sender)
    if (filterSender.value === sender) filterSender.value = ''
    await Promise.all([loadTrackingStocks(), loadInvestorAnalysis()])
  } catch (err) {
    console.error('删除投资人失败:', err)
    alert('删除失败: ' + (err.response?.data?.error || err.message))
  }
}

// 加载投资人分析
async function loadInvestorAnalysis() {
  if (investorRequest) return investorRequest
  investorRequest = (async () => {
  try {
    investorLoading.value = true
    const res = await wechatApi.getInvestorAnalysis({ days: investorDays.value, targetProfitPercent: investorThreshold.value })
    investorList.value = res?.data || []
  } catch (err) {
    console.error('加载投资人分析失败:', err)
  } finally {
    investorLoading.value = false
    investorRequest = null
  }
  })()
  return investorRequest
}

// 按投资人筛选推票
function filterByInvestor(sender) {
  filterSender.value = sender
  loadTrackingStocks()
}

function clearInvestorFilter() {
  filterSender.value = ''
  loadTrackingStocks()
}

// 展开每日明细
async function toggleDailyDetail(trackingId) {
  if (expandedTracking.value === trackingId) {
    expandedTracking.value = ''
    dailyData.value = []
    return
  }
  expandedTracking.value = trackingId
  dailyData.value = []
  dailyLoading.value = true
  try {
    const res = await wechatApi.getTrackingDaily(trackingId)
    dailyData.value = res?.data || []
  } catch (err) {
    console.error('加载每日明细失败:', err)
  } finally {
    dailyLoading.value = false
  }
}

function onImageSelect(e) {
  const files = Array.from(e.target.files || [])
  if (!files.length) return
  for (const file of files) {
    if (!file.type.startsWith('image/')) continue
    selectedImageFiles.value.push({ file, url: URL.createObjectURL(file) })
  }
  // 允许重复选择同一文件
  e.target.value = ''
}

// Ctrl+V 粘贴剪贴板图片
function onPaste(e) {
  const items = e.clipboardData?.items
  if (!items) return
  let hasImage = false
  for (const item of items) {
    if (item.type.startsWith('image/')) {
      const file = item.getAsFile()
      if (file) {
        selectedImageFiles.value.push({ file, url: URL.createObjectURL(file) })
        hasImage = true
      }
    }
  }
  if (hasImage) e.preventDefault()
}

function removeImage(index) {
  const removed = selectedImageFiles.value.splice(index, 1)
  removed.forEach(img => URL.revokeObjectURL(img.url))
}

async function runExtract() {
  const hasText = extractTextInput.value.trim()
  const hasImage = selectedImageFiles.value.length
  if (!hasText && !hasImage) { extractError.value = '请输入文字或上传图片'; return }
  extracting.value = true
  extractError.value = ''
  extractResult.value = null
  try {
    const formData = new FormData()
    if (hasImage) {
      for (const img of selectedImageFiles.value) formData.append('image', img.file)
    }
    if (hasText) formData.append('text', extractTextInput.value.trim())
    const res = await wechatApi.extractImage(formData)
    extractResult.value = res
    
    // 自动填充识别到的发送人/投资人
    if (res?.sender && res.sender !== '未识别发送人' && !saveForm.sender?.trim()) {
      saveForm.sender = res.sender
    }
    
    // 自动填充分类
    if (res?.category) {
      saveForm.category = res.category
    } else {
      const stocks = res?.stocks || []
      saveForm.category = stocks.some(s => s.code && /^\d{6}$/.test(s.code)) ? 'stock_pick' : 'market_news'
    }
    // 如果后端未返回 category，手动判断营销消息
    if (!res?.category && saveForm.category !== 'stock_pick') {
      const text = hasText ? extractTextInput.value : (res?.rawText || '')
      const marketingPatterns = [/合作|加入|办一个|办理|会员|服务|咨询/, /元\/(月|年|个月|季度|周期)/, /\d{3,4}元/, /投资有风险.*入市须谨慎/, /老师|投顾|助理|客服|顾问/, /名额|限量|限时|优惠|折扣|涨价/]
      if (marketingPatterns.some(p => p.test(text))) {
        saveForm.category = 'marketing'
      }
    }
    
    // 如果是推票消息且已填写投资人，自动保存到追踪列表
    const stocks = res?.stocks || []
    const hasValidStock = stocks.some(s => s.code && /^\d{6}$/.test(s.code))
    if (hasValidStock && saveForm.category === 'stock_pick' && saveForm.sender?.trim()) {
      saveMsg.value = '识别成功，正在自动保存推票记录...'
      saveMsgType.value = 'info'
      await autoSaveExtractResult(res, hasText ? extractTextInput.value : `[图片提取] ${stocks.map(s => s.name).join(', ')}`)
    } else if (hasValidStock && !saveForm.sender?.trim()) {
      saveMsg.value = '识别成功！请先在左侧填写投资人/发送人，然后点击保存。'
      saveMsgType.value = 'warn'
    }
  } catch (err) {
    extractError.value = err.response?.data?.error || '提取失败'
  } finally {
    extracting.value = false
  }
}

// 自动保存提取结果
async function autoSaveExtractResult(res, messageText) {
  try {
    savingExtract.value = true
    const stocks = res?.stocks?.map(s => ({ name: s.name, code: s.code, logic: s.logic || '' })) || []
    let finalCategory = saveForm.category
    if (!finalCategory) {
      if (res?.category) {
        finalCategory = res.category
      } else {
        finalCategory = stocks.some(s => s.code && /^\d{6}$/.test(s.code)) ? 'stock_pick' : 'market_news'
      }
    }
    
    const saveResp = await wechatApi.saveExtract({
      text: messageText,
      sender: saveForm.sender,
      chatName: saveForm.chatName,
      stocks,
      recommendationDate: saveForm.recommendationDate,
      category: finalCategory,
    })
    const actualCategory = saveResp?.category || finalCategory
    const catLabel = actualCategory === 'stock_pick' ? '推票消息' : actualCategory === 'marketing' ? '营销消息' : '行情消息'
    
    saveMsg.value = `✓ 已自动保存 ${stocks.length} 只股票到追踪列表（投资人：${saveForm.sender}，分类：${catLabel}）`
    saveMsgType.value = 'ok'
    
    // 自动刷新相关列表
    await Promise.all([
      loadInvestorAnalysis(),
      loadTrackingStocks(),
      refreshStatus(),
    ])
    // 自动刷新股价
    refreshAllTrackingPrices()
    
    // 更新投资人建议列表
    senderSuggestions.value = Array.from(new Set([
      ...investorList.value.map(i => i.sender),
      ...trackingStocks.value.map(t => t.sender),
      ...saveForm.sender ? [saveForm.sender] : []
    ]))
    
    // 保存成功后弹出分类反馈弹窗
    openCategoryFeedback({
      eventId: saveResp?.id || '',
      messageText: messageText || '',
      predictedCategory: actualCategory,
    })
  } catch (err) {
    saveMsg.value = '自动保存失败：' + (err.response?.data?.error || err.message)
    saveMsgType.value = 'err'
  } finally {
    savingExtract.value = false
  }
}

// 一键添加股票到股票列表
async function addStockFromExtract(stock) {
  addingStockCode.value = stock.code
  try {
    await stockApi.createStock({ name: stock.name, code: stock.code, board: 'stock' })
    extractError.value = ''
    if (!stock._added) stock._added = true
  } catch (err) {
    extractError.value = err.response?.data?.error || `添加 ${stock.name} 失败`
  } finally {
    addingStockCode.value = ''
  }
}

// 保存提取结果，绑定投资人，自动加入追踪表
async function saveExtractResult() {
  if (!extractTextInput.value?.trim()) {
    saveMsg.value = '消息内容不能为空'
    saveMsgType.value = 'err'
    return
  }
  savingExtract.value = true
  saveMsg.value = ''
  try {
    const stocks = extractResult.value?.stocks?.map(s => ({ name: s.name, code: s.code, logic: s.logic || '' })) || []
    // 分类：优先用表单选择，其次从后端返回的提取结果，最后自动判断
    let finalCategory = saveForm.category
    if (!finalCategory) {
      if (extractResult.value?.category) {
        finalCategory = extractResult.value.category
      } else {
        finalCategory = stocks.some(s => s.code && /^\d{6}$/.test(s.code)) ? 'stock_pick' : 'market_news'
      }
    }
    const saveResp = await wechatApi.saveExtract({
      text: extractTextInput.value,
      sender: saveForm.sender,
      chatName: saveForm.chatName,
      stocks,
      recommendationDate: saveForm.recommendationDate,
      category: finalCategory,
    })
    const actualCategory = saveResp?.category || finalCategory
    const catLabel = actualCategory === 'stock_pick' ? '推票消息' : actualCategory === 'marketing' ? '营销消息' : '行情消息'
    saveMsg.value = `保存成功！归类为${catLabel}${saveForm.sender ? `（投资人：${saveForm.sender}）` : ''}`
    saveMsgType.value = 'ok'
    // 保存后自动刷新所有相关列表：投资人分析、追踪列表、消息列表
    await Promise.all([
      loadInvestorAnalysis(),
      loadTrackingStocks(),
      refreshStatus(),
    ])
    // 自动刷新股价
    refreshAllTrackingPrices()
    // 更新投资人建议列表（含新添加的投资人）
    senderSuggestions.value = Array.from(new Set([
      ...investorList.value.map(i => i.sender),
      ...trackingStocks.value.map(t => t.sender),
      ...saveForm.sender ? [saveForm.sender] : []
    ])).slice(0, 50)
    
    // 保存成功后弹出分类反馈弹窗（收集用户反馈以优化分类规则）
    openCategoryFeedback({
      eventId: saveResp?.id || '',
      messageText: extractTextInput.value || '',
      predictedCategory: actualCategory,
    })
  } catch (err) {
    saveMsg.value = err.response?.data?.error || '保存失败'
    saveMsgType.value = 'err'
  } finally {
    savingExtract.value = false
  }
}

// 提取后，把已有的投资人/sender填充到建议列表
watch([investorList, trackingStocks], () => {
  const s = new Set()
  investorList.value.forEach(i => s.add(i.sender))
  trackingStocks.value.forEach(t => t.sender && s.add(t.sender))
  if (saveForm.sender) s.add(saveForm.sender)
  senderSuggestions.value = Array.from(s).slice(0, 50)
}, { immediate: true })

const summaryHtml = computed(() => {
  if (!summaryResult.value?.summary) return ''
  return summaryResult.value.summary
    .replace(/^### (.*$)/gm, '<h5 class="text-[11px] font-bold text-violet-700 mt-1 mb-0.5">$1</h5>')
    .replace(/^## (.*$)/gm, '<h4 class="text-xs font-bold text-violet-700 mt-1.5 mb-0.5">$1</h4>')
    .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
    .replace(/`(.*?)`/g, '<code class="bg-slate-200 px-1 rounded text-[10px]">$1</code>')
    .replace(/^- (.*$)/gm, '<span class="block ml-1">$1</span>')
    .replace(/\n\n/g, '<br/><br/>')
    .replace(/\n/g, '<br/>')
})

async function loadWhitelist() {
  try {
    const res = await fetch('/api/wechat/whitelist')
    whitelist.value = await res.json()
  } catch {}
}

async function addWhitelist() {
  const name = newNickname.value.trim()
  if (!name) return
  try {
    await fetch('/api/wechat/whitelist', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ nickname: name }),
    })
    newNickname.value = ''
    await loadWhitelist()
  } catch {}
}

async function removeWhitelist(id) {
  try {
    await fetch(`/api/wechat/whitelist/${id}`, { method: 'DELETE' })
    await loadWhitelist()
  } catch {}
}

async function toggleWhitelist(w) {
  try {
    await fetch(`/api/wechat/whitelist/${w.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ enabled: !w.enabled }),
    })
    await loadWhitelist()
  } catch {}
}

// 黑名单
async function loadBlacklist() {
  try {
    blacklist.value = await wechatApi.getBlacklist()
  } catch {}
}

const blackTypeLabel = (t) => ({ sender: '发送人', chat_name: '群聊', keyword: '关键词', session_keyword: '会话跳过' }[t] || t)

async function addBlacklist() {
  const value = newBlackValue.value.trim()
  if (!value) return
  try {
    await wechatApi.addBlacklist({ type: newBlackType.value, value, note: newBlackNote.value.trim() })
    newBlackValue.value = ''
    newBlackNote.value = ''
    await loadBlacklist()
  } catch (err) {
    extractError.value = err.response?.data?.error || '添加黑名单失败'
  }
}

async function removeBlacklist(id) {
  try {
    await wechatApi.deleteBlacklist(id)
    await loadBlacklist()
  } catch {}
}

async function toggleBlacklist(b) {
  try {
    await wechatApi.updateBlacklist(b.id, { enabled: !b.enabled })
    await loadBlacklist()
  } catch {}
}

// ========== 分类规则管理 ==========
const systemRules = ref([])
const learnedRules = ref([])
const ruleCounts = ref({ stock_pick: 0, market_news: 0, marketing: 0 })
const showAddRule = ref(false)
const showRulesDialog = ref(false)
const rulesTab = ref('rules')
const trainingDataTab = ref('logic')
const trainingData = ref({ logicSamples: [], feedbackSamples: [], learnedRules: [], systemRules: [] })
const trainingDataLoading = ref(false)
// 按格式指纹分组的学习样本
const learnedFormatGroups = computed(() => {
  if (!learnedStockSamples.value.length) return []
  const groups = {}
  for (const s of learnedStockSamples.value) {
    const key = s.formatSignature || '(无格式)'
    if (!groups[key]) groups[key] = { format: key, count: 0, samples: [] }
    groups[key].count++
    groups[key].samples.push(s)
  }
  // 按命中次数倒序
  return Object.values(groups).sort((a, b) => b.count - a.count)
})

const trainingDataPage = ref(1)
const categoryRulesLoading = ref(false)
const ruleCleanCount = ref(0)
const learnedRuleTotals = reactive({ stock_pick: 0, market_news: 0, marketing: 0 })
const learnedRuleLoadedCounts = reactive({ stock_pick: 0, market_news: 0, marketing: 0 })
const loadingMoreRules = reactive({ stock_pick: false, market_news: false, marketing: false })
const RULE_PAGE_SIZE = 80
let categoryRulesLoadedAt = 0
let categoryRulesRequest = null
const CATEGORY_RULES_CACHE_TTL = 60000
const RULE_CATEGORIES = ['stock_pick', 'market_news', 'marketing']
let previousBodyOverflow = ''

watch(showRulesDialog, visible => {
  if (typeof document === 'undefined') return
  if (visible) {
    previousBodyOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
  } else {
    document.body.style.overflow = previousBodyOverflow
  }
})

// 懒加载训练数据：切到 data 标签时加载
watch(rulesTab, tab => {
  if (tab === 'data' && !trainingData.value._loaded) {
    trainingDataPage.value = 1
    loadTrainingData()
  }
})

const systemRulesByCategory = computed(() => Object.fromEntries(
  RULE_CATEGORIES.map(category => [category, systemRules.value.filter(rule => rule.category === category)])
))
const learnedRulesByCategory = computed(() => Object.fromEntries(
  RULE_CATEGORIES.map(category => [category, learnedRules.value.filter(rule => rule.category === category)])
))
const ruleStats = computed(() => Object.fromEntries(RULE_CATEGORIES.map(category => {
  const system = systemRulesByCategory.value[category]
  const learned = learnedRulesByCategory.value[category]
  return [category, {
    system: system.length,
    learned: learnedRuleTotals[category] || learned.length,
    total: (system.length + learnedRuleTotals[category]) || (system.length + learned.length),
    hits: learned.reduce((sum, rule) => sum + Number(rule.correct_count || 0), 0),
  }]
})))

function hasMoreLearnedRules(category) {
  return learnedRuleLoadedCounts[category] < learnedRuleTotals[category]
}

async function loadMoreLearnedRules(category) {
  if (loadingMoreRules[category] || !hasMoreLearnedRules(category)) return
  loadingMoreRules[category] = true
  try {
    const offset = learnedRuleLoadedCounts[category]
    const res = await wechatApi.getCategoryRules({
      category,
      learnedOffset: offset,
      learnedLimit: RULE_PAGE_SIZE,
    })
    const incoming = (res.learnedRules || []).map(rule => ({
      ...rule,
      categoryLabel: { stock_pick: '推票', market_news: '行情', marketing: '营销' }[rule.category] || rule.category,
    }))
    if (incoming.length) {
      learnedRules.value = [...learnedRules.value, ...incoming]
      learnedRuleLoadedCounts[category] += incoming.length
    }
  } catch (err) {
    console.error('加载更多学习规则失败:', err)
  } finally {
    loadingMoreRules[category] = false
  }
}

function openRulesDialog() {
  showRulesDialog.value = true
  rulesTab.value = 'rules'
  trainingDataTab.value = 'logic'
  loadCategoryRules().catch(() => {})
  // 训练数据懒加载，切换到 data 标签时再加载
}
const addingRule = ref(false)
const addRuleError = ref('')
const reclassifying = ref(false)
const showCalcRules = ref(false)  // 分类规则计算说明默认收起
const newRuleForm = reactive({ category: 'stock_pick', keyword: '', weight: 2 })

const ruleCountsText = computed(() => {
  const total = Object.values(ruleCounts.value).reduce((sum, count) => sum + Number(count || 0), 0)
  return `${total} 条规则`
})

function ruleCategoryColor(cat) {
  const m = {
    stock_pick: 'bg-emerald-100 text-emerald-700',
    market_news: 'bg-blue-100 text-blue-700',
    marketing: 'bg-orange-100 text-orange-700',
  }
  return m[cat] || 'bg-slate-100 text-slate-600'
}

async function loadCategoryRules(force = false) {
  if (!force && categoryRulesLoadedAt && Date.now() - categoryRulesLoadedAt < CATEGORY_RULES_CACHE_TTL) return
  if (categoryRulesRequest) return categoryRulesRequest
  categoryRulesLoading.value = true
  categoryRulesRequest = wechatApi.getCategoryRules({ learnedLimit: RULE_PAGE_SIZE }).then(res => {
    const labelMap = { stock_pick: '推票', market_news: '行情', marketing: '营销' }
    systemRules.value = (res.systemRules || []).map(r => ({ ...r, categoryLabel: labelMap[r.category] || r.category }))
    learnedRules.value = (res.learnedRules || []).map(r => ({ ...r, categoryLabel: labelMap[r.category] || r.category }))
    ruleCounts.value = res.counts || {}
    for (const category of RULE_CATEGORIES) {
      learnedRuleTotals[category] = Number(res.learnedCounts?.[category] || 0)
      learnedRuleLoadedCounts[category] = Number(res.loadedCounts?.[category] || 0)
    }
    ruleCleanCount.value = res.cleanedCount || 0
    categoryRulesLoadedAt = Date.now()
  }).catch(err => {
    console.error('加载分类规则失败:', err)
    throw err
  }).finally(() => {
    categoryRulesLoading.value = false
    categoryRulesRequest = null
  })
  return categoryRulesRequest
}

async function loadTrainingData() {
  if (trainingDataLoading.value) return
  trainingDataLoading.value = true
  try {
    const res = await wechatApi.getTrainingData({ page: trainingDataPage.value, pageSize: 50 })
    trainingData.value = {
      logicSamples: res.logicSamples || [],
      feedbackSamples: res.feedbackSamples || [],
      learnedRules: res.learnedRules || [],
      systemRules: res.systemRules || [],
      trackingData: res.trackingData || [],
      pagination: res.pagination || { page: 1, pageSize: 50, logicTotal: 0, fbTotal: 0, lrTotal: 0, srTotal: 0, trTotal: 0 },
      _loaded: true,
    }
  } catch (err) {
    console.error('加载训练数据失败:', err)
  } finally {
    trainingDataLoading.value = false
  }
}

function trainingDataPrevPage() {
  if (trainingDataPage.value > 1) {
    trainingDataPage.value--
    trainingData.value._loaded = false
    loadTrainingData()
  }
}

function trainingDataNextPage() {
  const p = trainingData.value.pagination
  if (!p) return
  const totalKey = { logic: 'logicTotal', feedback: 'fbTotal', rules: 'lrTotal', sysRules: 'srTotal', tracking: 'trTotal' }[trainingDataTab.value]
  const total = p[totalKey] || 0
  if (trainingDataPage.value * p.pageSize < total) {
    trainingDataPage.value++
    trainingData.value._loaded = false
    loadTrainingData()
  }
}

function getCurrentTotal() {
  const p = trainingData.value.pagination
  if (!p) return 0
  const totalKey = { logic: 'logicTotal', feedback: 'fbTotal', rules: 'lrTotal', sysRules: 'srTotal', tracking: 'trTotal' }[trainingDataTab.value]
  return p[totalKey] || 0
}

function hasNextPage() {
  const p = trainingData.value.pagination
  if (!p) return false
  return trainingDataPage.value * p.pageSize < getCurrentTotal()
}

async function toggleSystemRule(rule) {
  try {
    await wechatApi.updateSystemRule(rule.id, { enabled: !rule.enabled })
    rule.enabled = !rule.enabled
  } catch (err) {
    console.error('切换规则失败:', err)
  }
}

async function updateSystemRuleWeight(rule, event) {
  const newWeight = parseInt(event.target.value) || 1
  if (newWeight === rule.weight) return
  try {
    await wechatApi.updateSystemRule(rule.id, { weight: newWeight })
    rule.weight = newWeight
  } catch (err) {
    console.error('更新权重失败:', err)
  }
}

async function deleteLearnedRule(id) {
  if (!confirm('删除这条学习规则？')) return
  try {
    const deletedRule = learnedRules.value.find(rule => rule.id === id)
    await wechatApi.deleteLearnedRule(id)
    learnedRules.value = learnedRules.value.filter(r => r.id !== id)
    if (deletedRule?.category && learnedRuleTotals[deletedRule.category] > 0) {
      learnedRuleTotals[deletedRule.category]--
      learnedRuleLoadedCounts[deletedRule.category] = Math.max(0, learnedRuleLoadedCounts[deletedRule.category] - 1)
    }
  } catch (err) {
    console.error('删除规则失败:', err)
  }
}

async function submitAddRule() {
  if (!newRuleForm.keyword.trim()) {
    addRuleError.value = '请输入关键词'
    return
  }
  addingRule.value = true
  addRuleError.value = ''
  try {
    await wechatApi.addLearnedRule({
      category: newRuleForm.category,
      keyword: newRuleForm.keyword.trim(),
      weight: newRuleForm.weight,
    })
    newRuleForm.keyword = ''
    newRuleForm.weight = 2
    showAddRule.value = false
    await loadCategoryRules()
  } catch (err) {
    addRuleError.value = err.response?.data?.error || '添加失败'
  } finally {
    addingRule.value = false
  }
}

async function reclassifyAll() {
  const total = events.value.length
  if (!confirm(`将重新分类当前全部 ${total} 条消息，可能需要一些时间。`)) return
  reclassifying.value = true
  try {
    const res = await wechatApi.reclassifyEvents()
    alert(`重新分类完成：共 ${res.total} 条消息，修正 ${res.recategorized} 条`)
    // 刷新当前列表
    await refreshStatus()
  } catch (err) {
    alert('重新分类失败: ' + (err.response?.data?.error || err.message))
  } finally {
    reclassifying.value = false
  }
}

async function resetSystemRules() {
  if (!confirm('确定重置所有系统规则到默认状态？这将清除所有自定义修改（开关/权重调整），但不会删除学习规则。')) return
  try {
    await wechatApi.resetSystemRules()
    await loadCategoryRules()
    alert('系统规则已重置为默认状态')
  } catch (err) {
    alert('重置失败: ' + (err.response?.data?.error || err.message))
  }
}

async function runSummarize(category) {
  if (!whitelist.value.length) { summaryError.value = '请先添加白名单昵称'; return }
  summarizing.value = true
  summaryError.value = ''
  summaryResult.value = null
  try {
    const payload = { days: summaryDays.value }
    if (category) payload.category = category
    const res = await fetch('/api/wechat/whitelist/summarize', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
    const data = await res.json()
    if (!res.ok) throw new Error(data.error || '分析失败')
    summaryResult.value = data
  } catch (err) {
    summaryError.value = err.message
  } finally {
    summarizing.value = false
  }
}
let timer = null
let autoRefreshTimer = null
let autoPriceRefreshTimer = null
let priceRefreshTickTimer = null
let trackingRequest = null
let investorRequest = null
let statusRequest = null
let panelRefreshTimer = null
let knownEventIds = null

function schedulePanelRefresh() {
  if (panelRefreshTimer) clearTimeout(panelRefreshTimer)
  panelRefreshTimer = setTimeout(() => {
    Promise.all([loadTrackingStocks(), loadInvestorAnalysis()]).catch(() => {})
    panelRefreshTimer = null
  }, 500)
}

// 筛选
const selectedDate = ref(todayStr()) // 'YYYY-MM-DD'，默认只显示今天
const selectedStockCode = ref('')
const activeCategory = ref('all') // 'all' | 'stock_pick' | 'market_news'

// 日历
const today = new Date()
const calYear = ref(today.getFullYear())
const calMonth = ref(today.getMonth()) // 0-11
const weekLabels = ['日', '一', '二', '三', '四', '五', '六']

const events = computed(() => status.value.events || [])

// 按日期归类：eventsByDay['2026-08-04'] = count
const eventsByDay = computed(() => {
  const map = {}
  for (const e of events.value) {
    const d = eventDate(e)
    if (!d) continue
    map[d] = (map[d] || 0) + 1
  }
  return map
})
const eventsByDayCount = computed(() => Object.values(eventsByDay.value).reduce((s, n) => s + n, 0))

function eventDate(e) {
  // recommendationDate 只有在和 capturedAt 足够接近时才优先使用。
  // 行情复盘会提到"6月23日开启的赛道退潮"，被 detectDate 误抓成 recommendationDate='2026-06-23'
  // 但 capturedAt 是今天 '2026-08-06'，差了 44 天，此时应该忽略 recommendationDate。
  if (e.recommendationDate) {
    if (e.capturedAt) {
      const dRec = new Date(e.recommendationDate)
      const dCap = parseCapturedAt(e.capturedAt)
      if (!Number.isNaN(+dRec) && !Number.isNaN(+dCap)) {
        const diffDays = Math.abs(dRec - dCap) / (24 * 60 * 60 * 1000)
        if (diffDays <= 2) return e.recommendationDate
      }
    } else {
      return e.recommendationDate
    }
  }
  if (e.capturedAt) {
    const d = parseCapturedAt(e.capturedAt)
    if (!Number.isNaN(+d)) return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  }
  if (e.pickedAt || e.createdAt || e.created_at) {
    const ts = Number(e.pickedAt || e.createdAt || e.created_at)
    if (!Number.isNaN(ts) && ts > 0) {
      const d = new Date(ts)
      if (!Number.isNaN(+d)) return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
    }
  }
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

const dateEventCount = computed(() => selectedDate.value ? (eventsByDay.value[selectedDate.value] || 0) : 0)

const dateStockFilteredEvents = computed(() => {
  let list = events.value
  if (selectedDate.value) list = list.filter(e => eventDate(e) === selectedDate.value)
  if (selectedStockCode.value) list = list.filter(e => Array.isArray(e.stocks) && e.stocks.some(s => s.code === selectedStockCode.value))
  const seen = new Set()
  return list.filter(e => {
    const key = (e.usefulMessage || e.messageText || '').trim()
    if (!key) return true
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
})

const filteredEvents = computed(() => activeCategory.value === 'all'
  ? dateStockFilteredEvents.value
  : dateStockFilteredEvents.value.filter(e => e.category === activeCategory.value))

const dateFilteredCounts = computed(() => {
  const counts = { stock_pick: 0, market_news: 0, marketing: 0 }
  for (const event of dateStockFilteredEvents.value) {
    if (counts[event.category] !== undefined) counts[event.category]++
  }
  return counts
})
const stockPickCount = computed(() => dateFilteredCounts.value.stock_pick)
const marketNewsCount = computed(() => dateFilteredCounts.value.market_news)
const marketingCount = computed(() => dateFilteredCounts.value.marketing)
const totalFilteredCount = computed(() => stockPickCount.value + marketNewsCount.value + marketingCount.value)

// 股票出现次数统计（仅基于 stock_pick 类型的消息，避免营销/行情消息里的股票干扰统计）
const stockFrequency = computed(() => {
  const map = new Map() // code -> { code, name, count }
  let total = 0
  const dateFilter = selectedDate.value // 跟随日期筛选，默认只显示今天
  for (const e of events.value) {
    if (e.category !== 'stock_pick') continue
    if (!Array.isArray(e.stocks)) continue
    if (dateFilter && eventDate(e) !== dateFilter) continue
    for (const s of e.stocks) {
      const code = String(s.code || '')
      if (!code) continue
      const prev = map.get(code)
      if (prev) {
        prev.count += 1
        if (!prev.name && s.name) prev.name = s.name
      } else {
        map.set(code, { code, name: s.name || code, count: 1 })
      }
      total += 1
    }
  }
  const arr = Array.from(map.values())
  arr.sort((a, b) => b.count - a.count || a.name.localeCompare(b.name, 'zh-CN'))
  stockTotals.total = total
  stockTotals.max = arr.length ? arr[0].count : 0
  return arr
})
const stockTotals = { total: 0, max: 0 }
const totalStockOccurrences = computed(() => stockTotals.total)
const maxStockCount = computed(() => stockTotals.max)

// 股票涨跌幅（用于股票频率表显示"今日涨幅/当前涨幅"）
const { stockPrices: _stockPrices, fetchStockPrices: _fetchStockPrices } = useStockPrice()
const stockFrequencyCodes = computed(() => stockFrequency.value.map(s => s.code))
let _prevFreqCodes = ''
watch(stockFrequencyCodes, (codes) => {
  const joined = codes.join(',')
  if (joined === _prevFreqCodes) return
  _prevFreqCodes = joined
  if (codes.length > 0) _fetchStockPrices(codes, true)
})

function freqChgPercent(code) {
  return _stockPrices.value[code]?.changePercent ?? null
}
function freqChgText(code) {
  const cp = freqChgPercent(code)
  if (cp == null) return '--'
  return (cp > 0 ? '+' : '') + cp.toFixed(2) + '%'
}
function freqChgClass(code) {
  const cp = freqChgPercent(code)
  if (cp == null || cp === 0) return 'text-slate-400'
  return cp > 0 ? 'text-red-500' : 'text-emerald-500'
}

// 股票代码 → 出现次数映射，用于消息卡片中按频次着色（同样只统计 stock_pick 类型）
const stockCountMap = computed(() => {
  const map = new Map()
  const now = new Date()
  const todayKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
  for (const e of events.value) {
    if (e.category !== 'stock_pick') continue
    if (!Array.isArray(e.stocks)) continue
    const eDate = parseCapturedAt(e.capturedAt)
    const eKey = `${eDate.getFullYear()}-${String(eDate.getMonth() + 1).padStart(2, '0')}-${String(eDate.getDate()).padStart(2, '0')}`
    if (eKey !== todayKey) continue
    for (const s of e.stocks) {
      const code = String(s.code || '')
      if (!code) continue
      map.set(code, (map.get(code) || 0) + 1)
    }
  }
  return map
})

// 根据出现次数返回颜色 class（次数越多颜色越深）
function stockTagClass(code) {
  const count = stockCountMap.value.get(String(code)) || 1
  if (count >= 5) return 'bg-red-100 border-red-300 text-red-700'
  if (count >= 4) return 'bg-orange-100 border-orange-300 text-orange-700'
  if (count >= 3) return 'bg-amber-100 border-amber-300 text-amber-700'
  if (count >= 2) return 'bg-emerald-200 border-emerald-300 text-emerald-800'
  return 'bg-white border-emerald-100 text-emerald-700'
}

// 根据出现次数返回标签文本
function stockTagLabel(code) {
  const count = stockCountMap.value.get(String(code)) || 0
  return count > 1 ? `×${count}` : ''
}

// 日历单元格
const calendarCells = computed(() => {
  const y = calYear.value
  const m = calMonth.value
  const firstDay = new Date(y, m, 1)
  const firstWeekday = firstDay.getDay()
  const daysInMonth = new Date(y, m + 1, 0).getDate()
  const prevMonthDays = new Date(y, m, 0).getDate()

  const cells = []
  // 上一月填充
  for (let i = firstWeekday - 1; i >= 0; i--) {
    const day = prevMonthDays - i
    const dateStr = monthDayStr(y, m - 1, day)
    cells.push(mkCell(y, m - 1, day, false, dateStr))
  }
  // 当前月
  const tY = today.getFullYear(), tM = today.getMonth(), tD = today.getDate()
  const todayStr = monthDayStr(tY, tM, tD)
  const selStr = selectedDate.value
  for (let d = 1; d <= daysInMonth; d++) {
    const dateStr = monthDayStr(y, m, d)
    const cell = mkCell(y, m, d, true, dateStr)
    if (dateStr === todayStr) cell.today = true
    if (dateStr === selStr) cell.selected = true
    cell.count = eventsByDay.value[dateStr] || 0
    cells.push(cell)
  }
  // 下一月填充到 42 格（6 行）
  let nd = 1
  while (cells.length < 42) {
    const dateStr = monthDayStr(y, m + 1, nd)
    cells.push(mkCell(y, m + 1, nd, false, dateStr))
    nd++
  }
  return cells
})

function monthDayStr(y, m, d) {
  const dt = new Date(y, m, d)
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`
}
function mkCell(y, m, d, current, dateStr) {
  const dt = new Date(y, m, d)
  return {
    current,
    year: dt.getFullYear(),
    month: dt.getMonth(),
    day: dt.getDate(),
    date: dateStr,
    count: eventsByDay.value[dateStr] || 0,
    today: false,
    selected: false,
  }
}

function shiftMonth(delta) {
  let m = calMonth.value + delta
  let y = calYear.value
  if (m < 0) { m = 11; y -= 1 }
  if (m > 11) { m = 0; y += 1 }
  calMonth.value = m
  calYear.value = y
}

function goToday() {
  calYear.value = today.getFullYear()
  calMonth.value = today.getMonth()
  selectedDate.value = monthDayStr(today.getFullYear(), today.getMonth(), today.getDate())
}

function pickDate(dateStr) {
  selectedDate.value = selectedDate.value === dateStr ? '' : dateStr
  calOpen.value = false
}

const selectedEvent = computed(() => filteredEvents.value.find(event => event.id === selectedId.value) || filteredEvents.value[0] || null)

// 消息原文编辑功能
const editTextareaRef = ref(null)

function startEditMessage() {
  if (!selectedEvent.value) return
  // 先获取pre的实际高度，锁定容器高度 → 切换时外部布局完全不动
  const preHeight = preElRef.value?.offsetHeight || 0
  fixedBoxHeight.value = Math.max(preHeight, 120)
  editingText.value = (selectedEvent.value.sender ? selectedEvent.value.sender + ' ' : '') +
    (selectedEvent.value.capturedAt ? formatFullTime(selectedEvent.value.capturedAt, selectedEvent.value.messageTime) + '：\n' : '') +
    (selectedEvent.value.usefulMessage || '')
  // 行数以实际内容计算；但以锁定的高度为准，不会比原来更小
  textareaRows.value = Math.max(6, editingText.value.split('\n').length)
  editingMessage.value = true
  nextTick(() => {
    if (editTextareaRef.value) {
      editTextareaRef.value.focus()
      editTextareaRef.value.selectionStart = editTextareaRef.value.selectionEnd = editingText.value.length
    }
  })
}

function autoGrowTextarea() {
  textareaRows.value = Math.max(6, (editingText.value || '').split('\n').length)
  // 输入时如果超过原来的锁定高度，则同步扩大固定高度 → 内容变多不会被裁切
  nextTick(() => {
    if (editTextareaRef.value) {
      const newH = editTextareaRef.value.scrollHeight
      if (newH > fixedBoxHeight.value) fixedBoxHeight.value = newH
    }
  })
}

function cancelEditMessage() {
  editingMessage.value = false
  editingText.value = ''
  fixedBoxHeight.value = 0
}

async function saveEditedMessage() {
  if (!selectedEvent.value || savingEdit.value) { editingMessage.value = false; return }
  savingEdit.value = true
  try {
    const res = await wechatApi.updateEventText(selectedEvent.value.id, { messageText: editingText.value })
    if (res?.ok) {
      await refreshStatus()
      if (res?.sender && selectedEvent.value) {
        selectedEvent.value.sender = res.sender
      }
    }
  } catch (err) {
    console.error('保存修改失败:', err)
    alert('保存失败：' + (err.response?.data?.error || err.message))
  } finally {
    editingMessage.value = false
    editingText.value = ''
    savingEdit.value = false
    fixedBoxHeight.value = 0
  }
}

// 推荐逻辑编辑
function startEditLogic(stock) {
  editingLogicStock.value = stock.code
  editingLogicText.value = stock.logic || ''
  nextTick(() => {
    const inputs = document.querySelectorAll('[ref="logicInputRef"]')
    if (inputs.length) inputs[inputs.length - 1]?.focus()
  })
}

function cancelEditLogic() {
  editingLogicStock.value = ''
  editingLogicText.value = ''
}

async function saveStockLogic(stockCode) {
  if (!selectedEvent.value || !stockCode) { cancelEditLogic(); return }
  const logic = editingLogicText.value.trim()
  const oldStock = selectedEvent.value.stocks.find(s => s.code === stockCode)
  const oldLogic = oldStock?.logic || ''
  try {
    const res = await wechatApi.updateStockLogic(selectedEvent.value.id, { stockCode, logic })
    if (res?.ok && res?.stocks) {
      if (selectedEvent.value) selectedEvent.value.stocks = res.stocks
    }
    // 如果逻辑有变化，自动提交训练数据让 AI 学习
    if (logic !== oldLogic) {
      trainLogicInBackground()
    }
  } catch (err) {
    console.error('保存推荐逻辑失败:', err)
  } finally {
    cancelEditLogic()
  }
}

// 后台提交训练数据，不阻塞UI
function trainLogicInBackground() {
  const ev = selectedEvent.value
  if (!ev || !ev.id) return
  const stocks = ev.stocks
    .filter(s => s.logic)
    .map(s => ({ name: s.name, code: s.code, logic: s.logic }))
  if (!stocks.length) return
  fetch('/api/wechat/logic/train', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      eventId: ev.id,
      originalText: ev.usefulMessage || ev.originalMessage || '',
      stocks,
      sender: ev.sender || '',
    }),
  }).catch(() => {}) // 静默失败，不干扰用户
}

// 自动 AI 提取无逻辑的股票
const aiExtractedEvents = ref(new Set())
const aiExtractingStocks = ref(new Set())

async function autoExtractMissingLogic() {
  const ev = selectedEvent.value
  if (!ev || ev.category !== 'stock_pick' || !ev.stocks?.length) return
  // 编辑中不触发，已尝试过的不重试
  if (editingLogicStock.value) return
  if (aiExtractedEvents.value.has(ev.id)) return
  const missing = ev.stocks.filter(s => s.code && !s.logic)
  if (!missing.length) { aiExtractedEvents.value.add(ev.id); return }
  const text = ev.usefulMessage || ev.originalMessage || ev.message_text || ''
  if (!text.trim()) { aiExtractedEvents.value.add(ev.id); return }
  aiExtractedEvents.value.add(ev.id)
  // 标记正在提取的股票
  const missingCodes = new Set(missing.map(s => s.code))
  aiExtractingStocks.value = new Set([...aiExtractingStocks.value, ...missingCodes])
  try {
    const stocks = missing.map(s => ({ name: s.name, code: s.code }))
    const res = await fetch('/api/wechat/ai/extract-logic', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ originalText: text, stocks }),
    })
    const data = await res.json()
    if (!res.ok || !data.results?.length) return
    for (const r of data.results) {
      if (!r.logic) continue
      await wechatApi.updateStockLogic(ev.id, { stockCode: r.code, logic: r.logic })
      const stock = ev.stocks.find(s => s.code === r.code)
      if (stock) stock.logic = r.logic
    }
  } catch (_) {
    // 静默失败
  } finally {
    // 清除提取状态
    aiExtractingStocks.value = new Set([...aiExtractingStocks.value].filter(c => !missingCodes.has(c)))
  }
}

// ===== 绑定股票功能 =====
// 解析用户输入的股票信息，支持多种格式
// 格式1: 002438 江苏神通
// 格式2: 1. 002438 江苏神通：核电 + 半导体
// 格式3: 002438 江苏神通：核电 + 半导体，601611 中国核电：电力 + 核电
// 格式4: 002674 兴业科技 机器人 600666 奥瑞德 算力 002428 云南锗业 半导体（空格分隔多股票）
// 格式5: 002428（纯代码，自动查名称）
// 格式6: 云南锗业（纯名称，自动查代码）
// 格式7: #AI智能体（智度股份）：NFTG概念+中报预增（括号内为股票名）
// 股票解析学习样本缓存：[{ event_id, original_text, stocks: [{code,name,logic}], sender, formatSignature }]
// formatSignature 是格式指纹：把原文中的股票代码替换成 ?，股票名替换成 N 后得到的通用格式模板
const learnedStockSamples = ref([])
const learnedExtractionRules = ref([])  // 推理出的股票提取规则库（与 3045 行的分类规则 learnedRules 解耦）
const learnedView = ref('rules')  // rules = 规则库推理过程视图，samples = 原始样本库视图

// 加载训练样本 + 自动预热规则库（从历史样本推理提取规则）
async function loadLearnedStockSamples() {
  try {
    const res = await fetch('/api/wechat/training-data?pageSize=200')
    const data = await res.json()
    if (data?.logicSamples?.length) {
      learnedStockSamples.value = data.logicSamples
        .filter(s => s.stocks && s.stocks.length)
        .map(s => ({
          event_id: s.event_id,
          original_text: s.original_text,
          stocks: s.stocks,
          sender: s.sender,
          created_at: s.created_at,
        }))
        .sort((a, b) => (b.created_at || 0) - (a.created_at || 0))
      // 预热规则库：从每条样本推理规则
      for (const sample of learnedStockSamples.value) {
        const rule = learnExtractionRules(sample.original_text, sample.stocks)
        if (rule) {
          rule._sampleCodeCount = (sample.original_text.match(/\d{6}/g) || []).length
          mergeRuleToLibrary(rule)
        }
      }
    }
  } catch (_) {}
}

// ===== 归纳式规则学习引擎 =====
// 核心思想：从 (原文, 用户纠正的 stocks[]) 对每个 stock 定位精确 span，
// 观察 name/code/logic 周围的定界符，跨 stock 归纳出共同模式 → 生成正则 → 自我验证。

// 把字符串里所有"普通字符"转义为正则字面量，保留 \s \S \d \w 等 meta
function escapeRegexLiteral(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

// 从 text 中找到 target 的所有出现位置，返回 [{start, end}]
function findAllOccurrences(text, target) {
  const results = []
  if (!target) return results
  let idx = 0
  while ((idx = text.indexOf(target, idx)) !== -1) {
    results.push({ start: idx, end: idx + target.length })
    idx += target.length
  }
  return results
}

// 归纳"名字前后定界符"——收集每个 stock.name 前后相邻的 1-2 个字符，取交集
function inferNameDelimiters(text, stocks) {
  const beforeChars = []   // 每个 stock.name 前紧邻字符
  const afterChars = []    // 每个 stock.name 后紧邻字符
  const before2 = []       // 前 2 字符
  const after2 = []        // 后 2 字符

  for (const s of stocks) {
    if (!s.name) continue
    const occ = findAllOccurrences(text, s.name)
    if (!occ.length) continue
    // 取第一个出现（通常是我们要的那个）
    const o = occ[0]
    const chBefore = o.start > 0 ? text[o.start - 1] : ''
    const chAfter = o.end < text.length ? text[o.end] : ''
    beforeChars.push(chBefore)
    afterChars.push(chAfter)
    before2.push(text.slice(Math.max(0, o.start - 2), o.start))
    after2.push(text.slice(o.end, Math.min(text.length, o.end + 2)))
  }

  // 取"多数"定界符（出现频率 > 50%）
  const majority = arr => {
    const counts = {}
    arr.forEach(c => { counts[c] = (counts[c] || 0) + 1 })
    const total = arr.length
    return Object.entries(counts)
      .filter(([, v]) => v / total > 0.5)
      .sort((a, b) => b[1] - a[1])
      .map(([k]) => k)
  }

  return {
    beforeChars: majority(beforeChars),
    afterChars: majority(afterChars),
    before2: majority(before2),
    after2: majority(after2),
  }
}

// 归纳 logic 起始定界符：看每个 stock 的 logic 在原文里，前面紧挨着 name 结尾的是什么
function inferLogicDelimiters(text, stocks) {
  const starters = []
  for (const s of stocks) {
    if (!s.name || !s.logic) continue
    const nameOcc = findAllOccurrences(text, s.name)
    if (!nameOcc.length) continue
    const nameEnd = nameOcc[0].end
    const afterName = text.slice(nameEnd, nameEnd + 30)
    // logic 应该从某个位置开始等于 s.logic
    const logicIdx = afterName.indexOf(s.logic.trim())
    if (logicIdx < 0) continue
    const gap = afterName.slice(0, logicIdx)
    starters.push(gap)
  }
  if (!starters.length) return null
  // 多数相同的 gap 作为定界符
  const counts = {}
  starters.forEach(s => { counts[s] = (counts[s] || 0) + 1 })
  const best = Object.entries(counts).sort((a, b) => b[1] - a[1])[0]
  if (!best) return null
  return best[0]
}

// 真正的规则推理：定位 + 归纳 + 生成正则 + 自我验证
function learnExtractionRules(text, stocks) {
  if (!text || !stocks || !stocks.length) return null

  const trace = []

  // ---- Step 1: 定位每个 code 在原文中的精确位置 ----
  const codeMatches = [...text.matchAll(/\d{6}/g)].map(m => ({ code: m[0], index: m.index }))
  const codeSet = new Set(codeMatches.map(c => c.code))
  const stocksWithCode = stocks.filter(s => s.code && codeSet.has(s.code))
  if (!stocksWithCode.length && !stocks.some(s => s.name)) return null

  trace.push({
    step: 1, title: '定位 code',
    detail: `在原文中找到 ${codeMatches.length} 个 6 位代码，其中 ${stocksWithCode.length}/${stocks.length} 个与用户纠正结果匹配`,
    codes: codeMatches.map(c => ({ code: c.code, at: c.index, snippet: text.slice(Math.max(0, c.index - 8), Math.min(text.length, c.index + 14)) })),
  })

  // ---- Step 2: 对每个 (stock)，在原文里定位 code + name + logic 的精确 span ----
  const observations = []
  for (const stock of stocksWithCode.length ? stocksWithCode : stocks) {
    if (!stock.code && !stock.name) continue
    const obs = { stock, codeSpan: null, nameSpan: null, logicSpan: null, rawSegment: '' }

    // code span
    if (stock.code) {
      const cm = codeMatches.find(c => c.code === stock.code)
      if (cm) obs.codeSpan = { start: cm.index, end: cm.index + 6 }
    }

    // name span
    if (stock.name) {
      const occ = findAllOccurrences(text, stock.name)
      if (occ.length) {
        let best = occ[0]
        if (obs.codeSpan) {
          let minDist = Infinity
          for (const o of occ) {
            const dist = Math.abs(o.end - obs.codeSpan.start) + Math.abs(o.start - obs.codeSpan.end)
            if (dist < minDist) { minDist = dist; best = o }
          }
        }
        obs.nameSpan = best
      }
    }

    // logic span
    if (stock.logic && obs.nameSpan) {
      const afterName = text.slice(obs.nameSpan.end)
      const trimmedLogic = stock.logic.trim()
      const logicIdx = afterName.indexOf(trimmedLogic)
      if (logicIdx >= 0) {
        obs.logicSpan = {
          start: obs.nameSpan.end + logicIdx,
          end: obs.nameSpan.end + logicIdx + trimmedLogic.length,
        }
      }
    }

    if (obs.codeSpan) {
      const i = codeMatches.findIndex(c => c.code === stock.code)
      const prevEnd = i > 0 ? codeMatches[i - 1].index + 6 : Math.max(0, obs.codeSpan.start - 40)
      const nextStart = i + 1 < codeMatches.length ? codeMatches[i + 1].index : text.length
      obs.rawSegment = text.slice(prevEnd, nextStart)
    } else if (obs.nameSpan) {
      obs.rawSegment = text.slice(
        Math.max(0, obs.nameSpan.start - 30),
        Math.min(text.length, obs.nameSpan.end + 50)
      )
    }

    observations.push(obs)
  }

  trace.push({
    step: 2, title: '定位 code/name/logic 精确位置',
    detail: `对 ${observations.length} 只股票逐一在原文里找到各自的 code、name、logic 起点和终点`,
    observations: observations.map(o => ({
      code: o.stock.code,
      name: o.stock.name,
      codeSpan: o.codeSpan,
      nameSpan: o.nameSpan,
      logicSpan: o.logicSpan,
      rawSegment: o.rawSegment,
    })),
  })

  if (!observations.length) return null

  // ---- Step 3: 归纳共同特征 ----
  const nameDelim = inferNameDelimiters(text, stocks)
  const logicDelim = inferLogicDelimiters(text, stocks)

  const namePositions = []
  for (const o of observations) {
    if (!o.nameSpan || !o.codeSpan) continue
    namePositions.push(o.nameSpan.end <= o.codeSpan.start ? 'before' : 'after')
  }
  const nameBeforeCode = namePositions.length
    ? namePositions.filter(p => p === 'before').length >= namePositions.length / 2
    : true

  const newlinesBetween = (() => {
    if (codeMatches.length < 2) return text.includes('\n')
    let count = 0
    for (let i = 1; i < codeMatches.length; i++) {
      const gap = text.slice(codeMatches[i - 1].index + 6, codeMatches[i].index)
      if (gap.includes('\n')) count++
    }
    return count >= codeMatches.length - 1
  })()

  trace.push({
    step: 3, title: '归纳共同特征（定界符 + 相对位置）',
    detail: `跨 ${observations.length} 个观察归纳：name 在 code ${nameBeforeCode ? '前' : '后'}，${newlinesBetween ? '每条之间换行' : '同行或空格分隔'}`,
    beforeChars: nameDelim.beforeChars,
    afterChars: nameDelim.afterChars,
    logicDelimiter: logicDelim === null ? '未检测到' : JSON.stringify(logicDelim),
    nameBeforeCode,
    newlinesBetween,
  })

  // ---- Step 4: 生成提取正则（完整包裹优先，允许 name 内部空格）----
  // 关键：如果原文里不存在任何用户纠正的股票 code（noCodeInText=true），
  // 则所有分支都生成 name-only 正则（不含 \d{6}），因为 code 根本不在原文里。
  const noCodeInText = stocksWithCode.length === 0
  let nameExtraction = null
  let enclosingRegex = null
  let enclosingLogicRegex = null
  const closeCharByOpen = { '（': '）', '(': ')', '【': '】', '[': ']', '{': '}', '《': '》', '〈': '〉', '<': '>' }
  const openCandidates = /[（(【\[\{《〈<\]\}#⭐⭕🔥👉★●]/

  // 先找最常见的 open char（从 name 前紧邻字符 + 前 2 字符位置收集）
  const allBefore = [...(nameDelim.beforeChars || []), ...(nameDelim.before2 || [])]
  const openChars = []
  for (const c of allBefore) {
    if (c.length === 1 && openCandidates.test(c) && !openChars.includes(c)) openChars.push(c)
  }

  // 检测：closeCh 是否在 code 之后（包裹 name+code 整体）
  let detectedBracketWrap = false
  let wrapOpenCh = ''
  let wrapCloseCh = ''
  let wrapLogicEnd = ''  // closeCh 后到下一个股票块开始前的逻辑结束标记

  if (openChars.length && observations.length >= 2) {
    // 挑第一个 bracket 类型的 openChar
    for (const o of openChars) {
      const cl = closeCharByOpen[o]
      if (!cl) continue
      // 检查：对至少 80% 的股票，cl 是否在 codeSpan.end 之后 + gap <= 5
      let wrapCount = 0
      for (const obs of observations) {
        if (!obs.codeSpan) continue
        const afterCode = text.slice(obs.codeSpan.end, obs.codeSpan.end + 20)
        if (afterCode.startsWith(cl)) wrapCount++
        else if (afterCode.startsWith(' ') && afterCode[1] === cl) wrapCount++
      }
      if (wrapCount / Math.max(observations.length, 1) >= 0.6) {
        detectedBracketWrap = true
        wrapOpenCh = o
        wrapCloseCh = cl
        break
      }
    }
  }

  // 检测前缀符号（⭕⭐🔥等），它可能和括号组合：⭕【name code】
  const prefixSymbols = nameDelim.beforeChars.filter(c => /[⭐⭕🔥👉★●✓✔▶►▷◇◆◎★☆]/.test(c))
  const prefixSymbol = prefixSymbols.length ? prefixSymbols[0] : ''

  // 记录 openCh（括号型的）
  const bracketOpenCh = openChars.find(c => closeCharByOpen[c]) || ''

  let nameRegexExplain = ''

  if (detectedBracketWrap) {
    // ===== 分支 A: 完整包裹格式 =====
    const gaps = observations
      .filter(o => o.nameSpan && o.codeSpan)
      .map(o => text.slice(o.nameSpan.end, o.codeSpan.start))
    const commonGap = majorityString(gaps) || '\\s+'
    const escapedOpen = escapeRegexLiteral(wrapOpenCh)
    const escapedClose = escapeRegexLiteral(wrapCloseCh)
    const escapedGap = commonGap === '\\s+' ? commonGap : escapeRegexLiteral(commonGap)

    const namePart = '([\\u4e00-\\u9fa5A-Za-z\\s]{2,20}?)'
    const codePart = '(\\d{6})'

    const escapedPrefix = prefixSymbol ? escapeRegexLiteral(prefixSymbol) : null
    const wrapContent = noCodeInText
      ? escapedOpen + '\\s*' + namePart + '\\s*' + escapedClose
      : (nameBeforeCode
          ? namePart + '\\s*' + codePart
          : codePart + '\\s*' + namePart) + '\\s*' + escapedClose

    if (escapedPrefix) {
      enclosingRegex = escapedPrefix + '\\s*' + wrapContent
    } else {
      enclosingRegex = wrapContent
    }
    nameExtraction = enclosingRegex
    nameRegexExplain = noCodeInText
      ? `【完整包裹·无code】检测到 ${wrapOpenCh}name${wrapCloseCh}（原文无股票代码）→ 只抓 name`
      : `【完整包裹】检测到 ${wrapOpenCh}name${commonGap}code${wrapCloseCh} → 生成锚定正则精确捕获`

    // logic 提取：closeCh 之后到下一个 [prefix]openCh 之前的文本
    // 先看 closeCh 和下一个股票块之间有什么
    const betweenBlocks = observations.length >= 2
      ? (() => {
          const o0 = observations[0], o1 = observations[1]
          const end0 = o0.codeSpan ? o0.codeSpan.end + 1 : 0
          const start1 = o1.codeSpan ? o1.codeSpan.start - 8 : text.length
          return text.slice(end0, Math.max(end0, start1)).trim()
        })()
      : ''
    if (betweenBlocks) {
      // 找到 betweenBlocks 里第一个"非标点"位置作为逻辑起点，到前缀符号前结束
      const logicStartInBlock = betweenBlocks.search(/[\u4e00-\u9fa5A-Za-z+#]/)
      if (logicStartInBlock >= 0) {
        // 把 betweenBlocks 的 content 部分（去掉前缀符号）作为 logic 提取参考
        const prefixPattern = prefixSymbol ? escapeRegexLiteral(prefixSymbol) + '?' : ''
        enclosingLogicRegex = escapedClose + '\\s*([^' + escapedOpen + '\\n\\r]+?)\\s*(?=' + prefixPattern + escapedOpen + '|$)'
      }
    }

  } else if (bracketOpenCh) {
    // ===== 分支 B: 有括号但不确定是否包裹整体 =====
    const closeCh = closeCharByOpen[bracketOpenCh] || ''
    if (closeCh) {
      const escapedOpen = escapeRegexLiteral(bracketOpenCh)
      const escapedClose = escapeRegexLiteral(closeCh)
      if (noCodeInText) {
        // 原文无股票代码 → name-only：openCh + name + closeCh（必需，防止非贪婪提前停）
        nameExtraction = escapedOpen + '\\s*([\\u4e00-\\u9fa5A-Za-z\\s]{2,20}?)\\s*' + escapedClose
        // 把它设为 enclosingRegex，让 parseByRule 走快速路径 matchAll 全文
        // 否则通用分段路径会按换行/假6位数切分，丢失跨段括号匹配
        enclosingRegex = nameExtraction
      } else if (nameBeforeCode) {
        nameExtraction = escapedOpen + '\\s*([\\u4e00-\\u9fa5A-Za-z\\s]{2,20}?)\\s*(\\d{6})'
        nameExtraction += '(?:\\s*' + escapedClose + ')?'
      } else {
        nameExtraction = escapedOpen + '\\s*(\\d{6})\\s*([\\u4e00-\\u9fa5A-Za-z\\s]{2,20})'
        nameExtraction += '(?:\\s*' + escapedClose + ')?'
      }
      nameRegexExplain = noCodeInText
        ? `【半包裹·无code】检测到 ${bracketOpenCh}name${closeCh}（原文无股票代码）→ 只抓 name`
        : `【半包裹】检测到前缀 ${bracketOpenCh}，闭合 ${closeCh} 位置不统一 → 正则加前缀约束 + 可选闭合`
    } else {
      nameExtraction = escapeRegexLiteral(bracketOpenCh) + '\\s*([\\u4e00-\\u9fa5A-Za-z\\s]{2,20})'
      nameRegexExplain = `【前缀标记】检测到 ${bracketOpenCh}name → 捕获标记后内容`
    }
  } else if (prefixSymbol) {
    // ===== 分支 C: 只有前缀符号，无括号 =====
    if (noCodeInText) {
      nameExtraction = escapeRegexLiteral(prefixSymbol) + '?\\s*([\\u4e00-\\u9fa5A-Za-z\\s]{2,20})'
      enclosingRegex = nameExtraction
      nameRegexExplain = `【前缀符号·无code】检测到 ${prefixSymbol}（原文无股票代码）→ 只抓 name`
    } else if (nameBeforeCode) {
      nameExtraction = escapeRegexLiteral(prefixSymbol) + '?\\s*([\\u4e00-\\u9fa5A-Za-z\\s]{2,20})\\s*(\\d{6})'
      nameRegexExplain = `【前缀符号】检测到 ${prefixSymbol} → 加可选前缀约束`
    } else {
      nameExtraction = escapeRegexLiteral(prefixSymbol) + '?\\s*(\\d{6})\\s*([\\u4e00-\\u9fa5A-Za-z\\s]{2,20})'
      nameRegexExplain = `【前缀符号】检测到 ${prefixSymbol} → 加可选前缀约束`
    }
  } else {
    // ===== 分支 D: 无定界符，纯 name+code 相对位置 =====
    if (noCodeInText) {
      // 原文无股票代码，也无任何定界符 → 无法自动生成正则
      // 这种情况应该靠用户纠正来补全，但我们仍然尝试生成一个宽松正则
      // 基于 common name 特征：如果观察到的 name 都是中文名，就匹配中文名
      const sampleNames = observations.map(o => o.stock.name).filter(Boolean)
      if (sampleNames.length) {
        const allChinese = sampleNames.every(n => /^[\u4e00-\u9fa5]+$/.test(n))
        if (allChinese) {
          nameExtraction = '([\\u4e00-\\u9fa5]{2,6})'
          nameRegexExplain = `【无定界符·纯中文】所有 name 都是 2-6 个中文字 → 匹配连续中文`
        }
      }
      if (!nameExtraction) {
        nameExtraction = '([\\u4e00-\\u9fa5A-Za-z]{2,10})'
        nameRegexExplain = '【无定界符·无code】无明显特征 → 匹配连续中英文'
      }
    } else if (nameBeforeCode) {
      const gaps = observations
        .filter(o => o.nameSpan && o.codeSpan && o.nameSpan.end <= o.codeSpan.start)
        .map(o => text.slice(o.nameSpan.end, o.codeSpan.start))
      const commonGap = majorityString(gaps)
      if (commonGap != null) {
        nameExtraction = '([\\u4e00-\\u9fa5A-Za-z\\s]{2,20})' + escapeRegexLiteral(commonGap) + '\\s*(\\d{6})'
        nameRegexExplain = `name 在 code 前，中间隔 ${JSON.stringify(commonGap)} → name捕获 + gap + code捕获`
      } else {
        nameExtraction = '([\\u4e00-\\u9fa5A-Za-z\\s]{2,20})\\s*(\\d{6})'
        nameRegexExplain = 'name 在 code 前，间隔不统一 → name捕获(允许空格) + 可选空白 + 6位code'
      }
    } else {
      const gaps = observations
        .filter(o => o.nameSpan && o.codeSpan && o.codeSpan.end <= o.nameSpan.start)
        .map(o => text.slice(o.codeSpan.end, o.nameSpan.start))
      const commonGap = majorityString(gaps)
      if (commonGap != null) {
        nameExtraction = '(\\d{6})' + escapeRegexLiteral(commonGap) + '\\s*([\\u4e00-\\u9fa5A-Za-z\\s]{2,20})'
        nameRegexExplain = `code 在 name 前，中间隔 ${JSON.stringify(commonGap)} → code捕获 + gap + name捕获`
      } else {
        nameExtraction = '(\\d{6})\\s*([\\u4e00-\\u9fa5A-Za-z\\s]{2,20})'
        nameRegexExplain = 'code 在 name 前，间隔不统一 → 6位code + 可选空白 + name捕获'
      }
    }
  }

  trace.push({
    step: 4, title: '生成 name 提取正则',
    detail: nameRegexExplain,
    regex: nameExtraction,
  })

  // ---- Step 5: 生成 logic 提取正则 ----
  let logicExtraction = null
  let logicRegexExplain = ''
  const stocksWithLogic = stocks.filter(s => s.logic && s.logic.trim())
  // 当原文无 code 时，logic 终止条件不能依赖 \d{6}，改为"下一个股票块标记"或换行/结尾
  const logicStopAnchor = noCodeInText
    ? '\\s*(?=$|[\\n\\r]|' + (openChars.length ? openChars.map(c => escapeRegexLiteral(c)).join('|') : '') + ')'
    : '\\s*(?=\\d{6}|$|[\\n\\r])'
  if (stocksWithLogic.length) {
    if (logicDelim != null && logicDelim.length > 0) {
      logicExtraction = escapeRegexLiteral(logicDelim) + '\\s*(.+?)' + logicStopAnchor
      logicRegexExplain = `学习到 logic 起始定界符 ${JSON.stringify(logicDelim)} → 定界符后非贪婪捕获`
    } else {
      const colonPresent = stocksWithLogic.some(s => {
        const occ = findAllOccurrences(text, s.name)
        if (!occ.length) return false
        const after = text.slice(occ[0].end, occ[0].end + 30)
        return /[：:]/.test(after)
      })
      if (colonPresent) {
        logicExtraction = '[：:]\\s*(.+?)' + logicStopAnchor
        logicRegexExplain = '无统一定界符但检测到冒号 → 冒号后捕获'
      } else {
        logicExtraction = '\\s*(.+?)' + logicStopAnchor
        logicRegexExplain = '无明显定界符 → 取 name 后剩余文本直到下一个块/换行'
      }
    }
  } else {
    logicRegexExplain = '用户未提供 logic 纠正，不生成 logic 正则'
  }

  trace.push({
    step: 5, title: '生成 logic 提取正则',
    detail: logicRegexExplain,
    regex: logicExtraction,
  })

  // ---- Step 6: 自我验证 ----
  // 优先用 enclosingRegex（完整包裹正则）验证，否则用分段模式
  const validation = selfValidate(text, stocks, nameExtraction, logicExtraction, nameBeforeCode, enclosingRegex, enclosingLogicRegex)

  trace.push({
    step: 6, title: '自我验证（正则在原文回跑）',
    detail: validation.detail || `用刚生成的正则在原文上跑一遍 → 命中 ${validation.hits}/${validation.total}，精确率 ${(validation.precision * 100).toFixed(1)}%，召回率 ${(validation.recall * 100).toFixed(1)}%${validation.error ? '（出错: ' + validation.error + '）' : ''}`,
    validation,
    parsedStocks: validation.parsedCount ? '(成功解析出 ' + validation.parsedCount + ' 只)' : '(未解析出任何股票)',
  })

  const rule = {
    id: 'rule_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8),
    segmentStrategy: enclosingRegex ? 'enclosing' : (noCodeInText ? (newlinesBetween ? 'by_newline' : 'by_openchar') : (newlinesBetween ? 'by_newline' : 'by_code')),
    codePattern: noCodeInText ? null : '\\d{6}',
    nameInCodePrefix: nameBeforeCode,
    nameInCodeSuffix: !nameBeforeCode,
    nameExtraction,
    logicExtraction,
    enclosingRegex,        // 完整包裹正则（可选，有则 parseByRule 直接 matchAll）
    enclosingLogicRegex,  // 配合 enclosingRegex 的 logic 正则
    fingerprints: {
      bracketType: detectedBracketWrap ? wrapOpenCh + wrapCloseCh : (bracketOpenCh && closeCharByOpen[bracketOpenCh] ? bracketOpenCh + closeCharByOpen[bracketOpenCh] : (bracketOpenCh || openChars[0] || '')),
      hasColon: /[：:]/.test(text),
      hasHash: text.includes('#'),
      hasNewline: newlinesBetween,
      openChar: bracketOpenCh || openChars[0] || prefixSymbol,
      logicDelim: logicDelim || '',
      textLength: text.length,
      stockCount: stocks.length,
    },
    hitCount: 1,
    confidence: validation.precision,
    createdAt: Date.now(),
    _validation: validation,
    _trace: trace,
    _sourceText: text.length > 500 ? text.slice(0, 500) + '...' : text,
    _sourceStocks: stocks.slice(0, 10),
  }

  // 精确率必须 >= 60% 才进规则库（低于这个基本没用）
  if (validation.precision < 0.6) return null

  return rule
}

// 辅助：在字符串数组里找多数相同值
function majorityString(arr) {
  if (!arr || !arr.length) return null
  const counts = {}
  arr.forEach(s => { counts[s] = (counts[s] || 0) + 1 })
  const sorted = Object.entries(counts).sort((a, b) => b[1] - a[1])
  const best = sorted[0]
  if (best && best[1] / arr.length >= 0.6 && best[0].length <= 6) return best[0]
  return null
}

// 自我验证：用学到的正则在原文上跑，计算精确率和召回率
function selfValidate(text, expectedStocks, nameReStr, logicReStr, nameBeforeCode, enclosingRe, enclosingLogicRe) {
  if (!nameReStr) return { precision: 0, recall: 0, hits: 0, total: expectedStocks.length }

  let parsed = []
  try {
    parsed = parseByRule(
      {
        nameExtraction: nameReStr,
        logicExtraction: logicReStr,
        nameInCodePrefix: nameBeforeCode,
        enclosingRegex: enclosingRe,
        enclosingLogicRegex: enclosingLogicRe,
        segmentStrategy: enclosingRe ? 'enclosing' : null,
      },
      text
    ) || []
  } catch (e) {
    return { precision: 0, recall: 0, hits: 0, total: expectedStocks.length, error: String(e) }
  }

  let hits = 0
  for (const exp of expectedStocks) {
    const match = parsed.find(p =>
      (exp.code && p.code === exp.code) ||
      (exp.name && p.name === exp.name) ||
      // enclosingRegex 下 name 可能带空格，做去空格宽松匹配
      (exp.name && p.name && p.name.replace(/\s/g, '') === exp.name.replace(/\s/g, ''))
    )
    if (match) hits++
  }

  const precision = parsed.length ? hits / parsed.length : 0
  const recall = expectedStocks.length ? hits / expectedStocks.length : 0
  return { precision, recall, hits, total: expectedStocks.length, parsedCount: parsed.length }
}

// 把新规则合并到规则库（相同特征的规则合并 hitCount）
function mergeRuleToLibrary(newRule) {
  if (!newRule) return
  const lib = learnedExtractionRules.value
  // 找有没有"本质相同"的规则（nameExtraction + logicExtraction + fingerprints 核心字段一致）
  const existing = lib.find(r =>
    r.nameExtraction === newRule.nameExtraction &&
    r.logicExtraction === newRule.logicExtraction &&
    r.fingerprints.bracketType === newRule.fingerprints.bracketType &&
    r.nameInCodePrefix === newRule.nameInCodePrefix
  )
  if (existing) {
    existing.hitCount++
    existing.lastHitAt = Date.now()
    existing.confidence = Math.min(1, existing.confidence + 0.05)
    return existing
  }
  // 新规则
  newRule.lastHitAt = Date.now()
  lib.unshift(newRule)
  // 最多保留 50 条规则
  if (lib.length > 50) lib.length = 50
  return newRule
}

// 给一段新文本，找最匹配的规则——先特征打分，再实际跑解析验证
function matchBestRule(text) {
  if (!learnedExtractionRules.value.length) return null

  const inputHasColon = /[：:]/.test(text)
  const inputHasHash = text.includes('#')
  const inputCodes = [...text.matchAll(/\d{6}/g)]
  const inputCodeCount = inputCodes.length

  // 预筛：先按特征给每个规则打分
  const candidates = []
  for (const rule of learnedExtractionRules.value) {
    let score = 0
    const fp = rule.fingerprints

    if (fp.hasColon === inputHasColon) score += 2
    if (fp.hasHash === inputHasHash) score += 2

    // 括号类型精准匹配
    if (fp.bracketType && fp.bracketType.length >= 2) {
      if (text.includes(fp.bracketType[0]) && text.includes(fp.bracketType[1])) score += 4
      else if (text.includes(fp.bracketType[0]) || text.includes(fp.bracketType[1])) score += 1
    } else if (fp.openChar) {
      if (text.includes(fp.openChar)) score += 2
    }

    // 代码数量接近度
    const refCount = rule._sampleCodeCount || fp.stockCount || 1
    const diff = Math.abs(refCount - inputCodeCount)
    if (diff === 0) score += 2
    else if (diff <= 2) score += 1

    // 经验权重
    score += rule.hitCount * 0.3
    score += (rule.confidence || 0.5) * 1.5

    candidates.push({ rule, score })
  }

  // 取 top 5 候选，实际跑 parseByRule 看谁能解析出最多结果
  candidates.sort((a, b) => b.score - a.score)
  const topCandidates = candidates.slice(0, Math.min(5, candidates.length))

  let bestRule = null
  let bestResultCount = 0
  let bestScore = 0

  for (const { rule, score: featureScore } of topCandidates) {
    try {
      const parsed = parseByRule(rule, text)
      const count = parsed ? parsed.length : 0
      // 最终分 = 特征分 + 解析结果数奖励
      const finalScore = featureScore + count * 2
      if (count > bestResultCount || (count === bestResultCount && finalScore > bestScore)) {
        bestResultCount = count
        bestScore = finalScore
        bestRule = rule
      }
    } catch (_) {}
  }

  // 阈值：必须至少解析出 1 只股票 且 特征分 >= 3
  if (!bestRule || bestResultCount === 0 || bestScore < 3) return null

  // 命中计数 +1
  bestRule.hitCount = (bestRule.hitCount || 1) + 1
  bestRule.lastHitAt = Date.now()
  return bestRule
}

// 用规则解析一段文本
function parseByRule(rule, text) {
  if (!rule || !text) return null

  // ====== 快速路径：enclosingRegex 完整包裹正则，直接 matchAll ======
  if (rule.enclosingRegex || rule.segmentStrategy === 'enclosing') {
    const result = []
    try {
      const re = new RegExp(rule.enclosingRegex || rule.nameExtraction, 'g')
      let match
      let lastEnd = -1
      while ((match = re.exec(text)) !== null) {
        if (match.index === lastEnd) { re.lastIndex++; continue }
        lastEnd = match.index

        let name = '', code = ''
        // enclosingRegex 通常有 2 个捕获组：name + code
        for (let g = 1; g < match.length; g++) {
          const group = match[g]
          if (!group) continue
          if (/^\d{6}$/.test(group.trim())) code = group.trim()
          else if (!code) name = group.trim()  // 第一个非数字组就是 name（允许含空格）
          else if (!name) name = group.trim()
        }

        // 如果只有 1 个 group 且不是 code
        if (!name && match[1] && !/^\d{6}$/.test(match[1].trim())) {
          name = match[1].trim()
        }
        // code 兜底
        if (!code) {
          const codeInMatch = match[0].match(/\d{6}/)
          if (codeInMatch) code = codeInMatch[0]
        }
        // name 兜底：从 match 里去掉 code 和标点
        if (!name) {
          const stripped = match[0].replace(/[\d]{6}/, '').replace(/[\s⭐⭕🔥👉★●【】（）()\[\]{}《》]/g, '').trim()
          if (/[\u4e00-\u9fa5A-Za-z]{2,}/.test(stripped)) name = stripped
        }

        if (!name && !code) continue

        // logic 提取：enclosingRegex 包裹块之后到下一个包裹块之前
        let logic = ''
        if (rule.enclosingLogicRegex) {
          try {
            const afterBlock = text.slice(match.index + match[0].length)
            const logicRe = new RegExp(rule.enclosingLogicRegex)
            const logicMatch = afterBlock.match(logicRe)
            if (logicMatch && logicMatch[1]) {
              logic = logicMatch[1].trim().replace(/[，,。；;\s]+$/, '')
            }
          } catch (_) {}
        }
        // 兜底：用通用 logicExtraction
        if (!logic && rule.logicExtraction) {
          try {
            const afterBlock = text.slice(match.index + match[0].length)
            const logicRe = new RegExp(rule.logicExtraction)
            const logicMatch = afterBlock.match(logicRe)
            if (logicMatch && logicMatch[1]) {
              logic = logicMatch[1].trim().replace(/[，,。；;\s]+$/, '')
            }
          } catch (_) {}
        }

        // 去重
        if (!result.find(r => (code && r.code === code) || (name && r.name.replace(/\s/g, '') === name.replace(/\s/g, '')))) {
          result.push({ code, name, logic })
        }
      }
    } catch (_) {}

    return result.length ? result : null
  }

  // ====== 通用分段路径 ======
  let segments = []
  const codeMatches = [...text.matchAll(/\d{6}/g)]

  if (rule.segmentStrategy === 'by_newline' || (!rule.segmentStrategy && text.includes('\n') && codeMatches.length > 1)) {
    const lines = text.split(/[\n\r]+/).map(l => l.trim()).filter(Boolean)
    for (const line of lines) {
      const codesInLine = [...line.matchAll(/\d{6}/g)]
      if (codesInLine.length === 0) {
        segments.push({ text: line, code: null })
      } else if (codesInLine.length === 1) {
        segments.push({ text: line, code: codesInLine[0][0] })
      } else {
        for (let i = 0; i < codesInLine.length; i++) {
          const start = codesInLine[i].index
          const end = i < codesInLine.length - 1 ? codesInLine[i + 1].index : line.length
          segments.push({ text: line.slice(start, end).trim(), code: codesInLine[i][0] })
        }
      }
    }
  } else if (codeMatches.length > 0) {
    for (let i = 0; i < codeMatches.length; i++) {
      const cm = codeMatches[i]
      const nextIdx = i + 1 < codeMatches.length ? codeMatches[i + 1].index : text.length
      segments.push({ text: text.slice(cm.index, nextIdx), code: cm[0] })
    }
  } else {
    segments.push({ text, code: null })
  }

  const result = []
  for (const seg of segments) {
    if (!seg.text) continue

    const stock = seg.code
      ? { code: seg.code, name: '', logic: '' }
      : { code: '', name: '', logic: '' }

    if (!stock.code) {
      const cm = seg.text.match(/\d{6}/)
      if (cm) stock.code = cm[0]
    }

    if (rule.nameExtraction) {
      try {
        const nameRe = new RegExp(rule.nameExtraction)
        const nameMatch = seg.text.match(nameRe)
        if (nameMatch) {
          let nameFound = ''
          let digitGroup = null
          for (let g = 1; g < nameMatch.length; g++) {
            const group = nameMatch[g]
            if (!group) continue
            if (/^\d{6}$/.test(group)) { digitGroup = g; continue }
            if (/[\u4e00-\u9fa5A-Za-z]{2,}/.test(group.trim())) {
              nameFound = group.trim()
              break
            }
          }
          if (!nameFound && nameMatch[1] && !digitGroup) {
            nameFound = nameMatch[1].trim()
          }
          stock.name = nameFound
        }
      } catch (_) {}
    }

    if (!stock.name && stock.code) {
      const codeIdx = seg.text.indexOf(stock.code)
      if (codeIdx >= 0) {
        const beforeCode = seg.text.slice(Math.max(0, codeIdx - 15), codeIdx)
        const afterCode = seg.text.slice(codeIdx + 6, codeIdx + 25)
        const cnBefore = beforeCode.match(/[\u4e00-\u9fa5A-Za-z\s]{2,15}/)
        const cnAfter = afterCode.match(/[\u4e00-\u9fa5A-Za-z\s]{2,15}/)
        if (rule.nameInCodePrefix && cnBefore) stock.name = cnBefore[0].trim()
        else if (cnAfter) stock.name = cnAfter[0].trim()
        else if (cnBefore) stock.name = cnBefore[0].trim()
      } else {
        const cnMatch = seg.text.match(/[\u4e00-\u9fa5A-Za-z\s]{2,15}/)
        if (cnMatch) stock.name = cnMatch[0].trim()
      }
    } else if (!stock.name && !stock.code) {
      const cnMatch = seg.text.match(/[\u4e00-\u9fa5A-Za-z\s]{2,15}/)
      if (cnMatch) stock.name = cnMatch[0].trim()
    }

    if (rule.logicExtraction) {
      try {
        const logicRe = new RegExp(rule.logicExtraction)
        const logicMatch = seg.text.match(logicRe)
        if (logicMatch && logicMatch[1]) {
          stock.logic = logicMatch[1].trim().replace(/[，,。；;]$/, '')
        }
      } catch (_) {}
    }

    const key = stock.code || stock.name
    if (!key) continue
    if (!result.find(r => (stock.code && r.code === stock.code) || (stock.name && r.name && stock.name.replace(/\s/g, '') === r.name.replace(/\s/g, '')))) {
      result.push(stock)
    }
  }

  return result.length ? result : null
}

function parseStockText(text) {
  if (!text) return []

  // ===== 第一步：尝试用学到的规则引擎解析 =====
  const rule = matchBestRule(text)
  if (rule) {
    const parsed = parseByRule(rule, text)
    if (parsed && parsed.length) return parsed
  }

  const normalized = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n')
  const rawLines = normalized.split(/[\n,;，；]+/).map(l => l.trim()).filter(Boolean)

  // 拆分包含多个股票代码的行（格式4）
  const lines = []
  for (const raw of rawLines) {
    const codes = [...raw.matchAll(/\d{6}/g)]
    if (codes.length <= 1) {
      lines.push(raw)
      continue
    }
    for (let i = 0; i < codes.length; i++) {
      const start = codes[i].index
      const end = i < codes.length - 1 ? codes[i + 1].index : raw.length
      lines.push(raw.slice(start, end).trim())
    }
  }

  const stocks = []
  for (const line of lines) {
    // 只清除真正的编号（1-2位数字+点/顿号），不清除6位股票代码
    const cleanLine = line.replace(/^\s*\d{1,2}[\.\、\s]+\s*/, '').trim()
    const codeMatch = cleanLine.match(/(\d{6})/)
    if (!codeMatch) {
      // 格式7: #AI智能体（智度股份）：NFTG概念 → 从括号中提取股票名
      const parenMatch = cleanLine.match(/[（(]([\u4e00-\u9fa5A-Za-z]{2,10})[）)]/)
      if (parenMatch) {
        const pName = parenMatch[1]
        let pLogic = ''
        const colonIdx2 = cleanLine.indexOf('：') >= 0 ? cleanLine.indexOf('：') : cleanLine.indexOf(':')
        if (colonIdx2 >= 0) {
          pLogic = cleanLine.slice(colonIdx2 + 1).replace(/[\s]+/g, ' ').trim()
        }
        if (!stocks.find(s => s.name === pName)) {
          stocks.push({ code: '', name: pName, logic: pLogic })
        }
        continue
      }
      // 格式6: 纯股票名称
      const nameMatch = cleanLine.match(/^[\u4e00-\u9fa5]{2,4}$/)
      if (nameMatch && !stocks.find(s => s.name === nameMatch[0])) {
        stocks.push({ code: '', name: nameMatch[0], logic: '' })
      }
      continue
    }
    const code = codeMatch[1]
    const codeIdx = cleanLine.indexOf(code)
    const afterCode = cleanLine.slice(codeIdx + 6).trim()

    let name = ''
    let logic = ''
    const cnColon = afterCode.indexOf('：')
    const enColon = afterCode.indexOf(':')
    const colonIdx = cnColon >= 0 && enColon >= 0 ? Math.min(cnColon, enColon) : (cnColon >= 0 ? cnColon : enColon)

    if (colonIdx >= 0) {
      name = afterCode.slice(0, colonIdx).replace(/[\s#【】\[\]（）()]/g, '').trim()
      logic = afterCode.slice(colonIdx + 1).replace(/[\s]+/g, ' ').trim()
    } else {
      // 无冒号：尝试提取前2-10个中英文字符作为名称，剩余为逻辑
      const nameMatch = afterCode.match(/^([\u4e00-\u9fa5A-Za-z]{2,10})/)
      if (nameMatch) {
        name = nameMatch[1]
        logic = afterCode.slice(nameMatch[0].length).replace(/[\s]+/g, ' ').trim()
      }
    }

    if (!name) {
      const cnMatch = cleanLine.match(/([\u4e00-\u9fa5A-Za-z]{2,10})/)
      name = cnMatch ? cnMatch[1] : ''
    }

    if (code && !stocks.find(s => s.code === code)) {
      stocks.push({ code, name, logic })
    }
  }
  return stocks
}

// 自动补全缺失的股票名称/代码
const nameLookupCache = ref({})
async function autoFillMissingNames(stocks) {
  // code → name
  const missingNames = stocks.filter(s => !s.name && s.code)
  for (const s of missingNames) {
    if (nameLookupCache.value[s.code]) {
      s.name = nameLookupCache.value[s.code]
      continue
    }
    try {
      const res = await fetch(`/api/stock/name/${s.code}`)
      const data = await res.json()
      if (data.name) {
        s.name = data.name
        nameLookupCache.value[s.code] = data.name
      }
    } catch (_) {}
  }
  // name → code
  const missingCodes = stocks.filter(s => s.name && !s.code)
  for (const s of missingCodes) {
    try {
      const res = await fetch(`/api/stock/search?name=${encodeURIComponent(s.name)}`)
      const data = await res.json()
      if (data.results?.length) {
        s.code = data.results[0].code
        nameLookupCache.value[s.code] = data.results[0].name
      }
    } catch (_) {}
  }
}

const parsedStocks = ref([])

// 监听输入变化，自动解析并补全缺失的股票名称/代码
let autoFillTimer = null
watch(() => bindStocksInput.value, (val) => {
  clearTimeout(autoFillTimer)
  if (!val) { parsedStocks.value = []; return }
  // 先同步解析显示
  const stocks = parseStockText(val)
  parsedStocks.value = stocks
  // 延迟自动补全，避免频繁请求
  autoFillTimer = setTimeout(async () => {
    const hasMissing = stocks.some(s => (s.code && !s.name) || (s.name && !s.code))
    if (hasMissing) {
      await autoFillMissingNames(stocks)
      // 触发响应式更新
      parsedStocks.value = [...stocks]
    }
  }, 300)
})

function cancelBindStocks() {
  showBindStocks.value = false
  bindStocksInput.value = ''
  bindStocksError.value = ''
}

// 手动添加弹窗的股票解析（复用绑定股票的解析逻辑）
const parsedManualStocks = ref([])

// 监听手动添加文本变化，自动补全名称
let manualFillTimer = null
watch(() => manualForm.stocksText, (val) => {
  clearTimeout(manualFillTimer)
  if (!val) { parsedManualStocks.value = []; return }
  const stocks = parseStockText(val)
  parsedManualStocks.value = stocks
  manualFillTimer = setTimeout(async () => {
    const hasMissing = stocks.some(s => (s.code && !s.name) || (s.name && !s.code))
    if (hasMissing) {
      await autoFillMissingNames(stocks)
      parsedManualStocks.value = [...stocks]
    }
  }, 300)
})

// ===== 手动添加推票追踪 =====
function todayStr() {
  const d = new Date()
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}
function openManualTracking(sender = '') {
  manualError.value = ''
  manualForm.sender = sender || ''
  manualForm.stocksText = ''
  manualForm.pickDate = todayStr()
  showManualTracking.value = true
}
function closeManualTracking() {
  showManualTracking.value = false
}
function resetManualForm() {
  manualForm.sender = ''
  manualForm.stocksText = ''
  manualForm.pickDate = todayStr()
  manualError.value = ''
}
async function submitManualTracking() {
  manualError.value = ''
  const sender = String(manualForm.sender || '').trim()
  const date = String(manualForm.pickDate || '').trim()
  const stocks = parsedManualStocks.value
  if (!sender) { manualError.value = '投资人不能为空'; return }
  if (!date) { manualError.value = '推荐日期不能为空'; return }
  if (!stocks.length) { manualError.value = '请输入至少一只股票（格式：代码 名称）'; return }
  submittingManual.value = true
  try {
    // 提交前先补全缺失的代码/名称
    await autoFillMissingNames(stocks)
    // 校验是否仍有缺失
    const missing = stocks.find(s => !s.code || !s.name)
    if (missing) {
      manualError.value = `「${missing.name || missing.code}」信息不完整，请检查`
      return
    }
    // 批量添加：循环调用单个接口
    for (const s of stocks) {
      await wechatApi.addManualTracking({
        sender, stockCode: s.code, stockName: s.name, pickDate: date, pickMessage: s.logic,
      })
    }
    showManualTracking.value = false
    Promise.all([
      loadTrackingStocks(),
      loadInvestorAnalysis(),
      refreshAllTrackingPrices(),
    ]).catch(() => {})
    
    // 自动学习：将用户确认/纠正的股票数据提交训练（保存所有有 code+name 的样本）
    const trainStocks = stocks.filter(s => s.code && s.name)
    if (trainStocks.length) {
      try {
        const originalText = manualForm.stocksText || stocks.map(s => `${s.code} ${s.name} ${s.logic || ''}`).join('\n')
        await fetch('/api/wechat/logic/train', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            eventId: `manual_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
            originalText,
            stocks: trainStocks.map(s => ({ name: s.name, code: s.code, logic: s.logic || '' })),
            sender,
          }),
        })
        // ✨ 规则引擎学习：从这次纠正中推理出提取规则
        const newRule = learnExtractionRules(originalText, trainStocks.map(s => ({ name: s.name, code: s.code, logic: s.logic || '' })))
        if (newRule) mergeRuleToLibrary(newRule)
      } catch (_) {}
    }
  } catch (err) {
    manualError.value = err.response?.data?.error || '添加失败'
  } finally {
    submittingManual.value = false
  }
}

async function confirmBindStocks() {
  if (!selectedEvent.value || !parsedStocks.value.length) return
  bindingStocks.value = true
  bindStocksError.value = ''
  try {
    // 提交前先补全缺失的代码/名称
    const stocks = parsedStocks.value
    await autoFillMissingNames(stocks)
    const missing = stocks.find(s => !s.code || !s.name)
    if (missing) {
      bindStocksError.value = `「${missing.name || missing.code}」信息不完整，请检查`
      bindingStocks.value = false
      return
    }
    const res = await wechatApi.bindStocks(selectedEvent.value.id, { stocks })
    if (res?.ok && res?.stocks) {
      // 局部更新：更新选中事件的股票和分类
      selectedEvent.value.stocks = res.stocks
      if (res.category) selectedEvent.value.category = res.category
      // 同时更新列表中的数据
      const eventInList = events.value.find(e => e.id === selectedEvent.value.id)
      if (eventInList) {
        eventInList.stocks = res.stocks
        if (res.category) eventInList.category = res.category
      }
      cancelBindStocks()
      // 自动刷新：追踪列表、投资人分析、股价
      Promise.all([
        loadTrackingStocks(),
        loadInvestorAnalysis(),
        refreshAllTrackingPrices(),
      ]).catch(() => {})
      
      // 自动学习：将用户确认/纠正的股票数据提交训练
      const finalStocks = parsedStocks.value.filter(s => s.logic && s.name)
      if (finalStocks.length) {
        fetch('/api/wechat/logic/train', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            eventId: selectedEvent.value.id,
            originalText: bindStocksInput.value,
            stocks: finalStocks.map(s => ({ name: s.name, code: s.code, logic: s.logic })),
            sender: selectedEvent.value.sender || '',
          }),
        }).catch(() => {})
      }
    }
  } catch (err) {
    bindStocksError.value = err.response?.data?.error || '绑定失败'
  } finally {
    bindingStocks.value = false
  }
}

const stateLabel = computed(() => ({ STOPPED: '已停止', STARTING: '正在启动', READY: '等待微信窗口', NO_WINDOW: '未找到微信窗口', NO_CONVERSATION_LIST: '未找到会话列表', NO_CONVERSATION_LIST: '未找到会话列表', SWITCHING: '正在切换未读会话', WATCHING: '正在监听', WATCHING_ALL: '正在巡检全部会话', ERROR: '监听异常' }[status.value.state] || status.value.state))
const stateCardClass = computed(() => ['WATCHING', 'WATCHING_ALL', 'SWITCHING'].includes(status.value.state) ? 'bg-emerald-50 border-emerald-100 text-emerald-800' : status.value.state === 'ERROR' ? 'bg-red-50 border-red-100 text-red-700' : 'bg-slate-50 border-slate-100 text-slate-700')
const stateDotClass = computed(() => ['WATCHING', 'WATCHING_ALL', 'SWITCHING'].includes(status.value.state) ? 'bg-emerald-500 animate-pulse' : status.value.state === 'ERROR' ? 'bg-red-500' : status.value.running ? 'bg-amber-400 animate-pulse' : 'bg-slate-300')

// ============ 自定义行情分析弹窗（全屏多选 + AI 联网搜索分析）============
const showMarketSelectDialog = ref(false)
const marketSelectionMode = ref('market_news') // all / market_news / stock_pick / manual
const marketSelectedIds = ref(new Set())
const marketSearchQuery = ref('')
const analyzingMarket = ref(false)
const marketAnalysisResult = ref('')
const marketAnalysisError = ref('')

const marketFilteredEvents = computed(() => {
  const q = marketSearchQuery.value.trim().toLowerCase()
  let list = events.value
  if (marketSelectionMode.value === 'market_news') {
    list = list.filter(e => e.category === 'market_news')
  } else if (marketSelectionMode.value === 'stock_pick') {
    list = list.filter(e => e.category === 'stock_pick')
  }
  if (q) {
    list = list.filter(e =>
      (e.sender || '').toLowerCase().includes(q) ||
      (e.chatName || '').toLowerCase().includes(q) ||
      (e.usefulMessage || e.messageText || '').toLowerCase().includes(q)
    )
  }
  return list
})

const marketAllVisibleIds = computed(() => new Set(marketFilteredEvents.value.map(e => e.id)))
const marketIsAllVisibleSelected = computed(() => {
  const ids = marketAllVisibleIds.value
  if (!ids.size) return false
  for (const id of ids) if (!marketSelectedIds.value.has(id)) return false
  return true
})
const marketSelectedCount = computed(() => marketSelectedIds.value.size)

function openMarketSelectDialog() {
  marketSelectionMode.value = 'all'
  marketSearchQuery.value = ''
  marketSelectedIds.value = new Set()
  // 保留已有的分析结果/进行中的分析状态，不重置 marketAnalysisResult / marketAnalysisError / analyzingMarket
  // 默认选中所有消息
  for (const e of events.value) {
    marketSelectedIds.value.add(e.id)
  }
  showMarketSelectDialog.value = true
}

function setMarketSelectionMode(mode) {
  marketSelectionMode.value = mode
  if (mode === 'all') {
    marketSelectedIds.value = new Set(events.value.map(e => e.id))
  } else if (mode === 'market_news') {
    marketSelectedIds.value = new Set(events.value.filter(e => e.category === 'market_news').map(e => e.id))
  } else if (mode === 'stock_pick') {
    marketSelectedIds.value = new Set(events.value.filter(e => e.category === 'stock_pick').map(e => e.id))
  } else {
    // manual 不自动选
  }
}

function toggleMarketVisibleSelectAll() {
  if (marketIsAllVisibleSelected.value) {
    for (const id of marketAllVisibleIds.value) marketSelectedIds.value.delete(id)
  } else {
    for (const id of marketAllVisibleIds.value) marketSelectedIds.value.add(id)
  }
}

function toggleMarketEvent(id) {
  if (marketSelectedIds.value.has(id)) marketSelectedIds.value.delete(id)
  else marketSelectedIds.value.add(id)
}

let marketAnalysisAbortController = null

async function runCustomMarketAnalysis() {
  if (!marketSelectedIds.value.size) { alert('请先至少勾选一条消息'); return }
  analyzingMarket.value = true
  marketAnalysisError.value = ''
  marketAnalysisResult.value = ''
  // 取消之前的分析（如果有）
  if (marketAnalysisAbortController) marketAnalysisAbortController.abort()
  marketAnalysisAbortController = new AbortController()
  try {
    const selectedEvents = events.value
      .filter(e => marketSelectedIds.value.has(e.id))
      .map(e => ({
        id: e.id,
        sender: e.sender || '',
        chatName: e.chatName || '',
        time: e.messageTime || e.capturedAt || '',
        category: e.category,
        message: e.usefulMessage || e.messageText || '',
        stocks: Array.isArray(e.stocks) ? e.stocks.map(s => s.name + ' ' + s.code) : []
      }))
    const res = await fetch('/api/wechat/ai/market-analysis', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ events: selectedEvents, days: summaryDays.value }),
      signal: marketAnalysisAbortController.signal,
    })
    const data = await res.json()
    if (!res.ok) throw new Error(data.error || '分析失败')
    marketAnalysisResult.value = data.summary || data.result || '（空结果）'
  } catch (err) {
    if (err.name === 'AbortError') return // 被新分析中断，不显示错误
    marketAnalysisError.value = err.message
  } finally {
    analyzingMarket.value = false
    marketAnalysisAbortController = null
  }
}

function closeMarketSelectDialog() {
  // 不中断正在进行的分析，仅隐藏弹窗
  showMarketSelectDialog.value = false
}

// ============ end 自定义行情分析弹窗 ============

watch(filteredEvents, value => { if (value.length && !value.some(event => event.id === selectedId.value)) selectedId.value = value[0].id }, { immediate: true })

async function refreshStatus() {
  if (statusRequest) return statusRequest
  statusRequest = (async () => {
  refreshing.value = true
  try {
    const nextStatus = await wechatApi.getStatus()
    const nextEvents = Array.isArray(nextStatus?.events) ? nextStatus.events : []
    if (knownEventIds && nextEvents.some(event => event.id && !knownEventIds.has(event.id))) schedulePanelRefresh()
    knownEventIds = new Set(nextEvents.map(event => event.id).filter(Boolean))
    status.value = nextStatus
    pageError.value = ''
  } catch (error) {
    pageError.value = error.response?.data?.error || '获取监听状态失败'
  } finally {
    refreshing.value = false
    statusRequest = null
  }
  })()
  return statusRequest
}

async function startMonitor() {
  busy.value = true; pageError.value = ''
  try { status.value = await wechatApi.startMonitor() } catch (error) { pageError.value = error.response?.data?.message || error.response?.data?.error || '启动监听失败' } finally { busy.value = false }
}

async function stopMonitor() {
  busy.value = true
  try { status.value = await wechatApi.stopMonitor() } catch (error) { pageError.value = error.response?.data?.error || '停止监听失败' } finally { busy.value = false }
}

// 删除消息：先查询该消息涉及的股票及其重复次数，弹确认框
const deleteStocksDialog = ref({
  visible: false,
  eventId: '',
  eventName: '',
  stocks: [],          // [{ code, name, trackingId, count, otherCount }]
  loading: false,
  deleting: false,
})

async function deleteEvent(id) {
  if (!id) return
  deleteStocksDialog.value = { visible: true, eventId: id, eventName: '', stocks: [], loading: true, deleting: false }
  // 同时查消息摘要展示
  const ev = status.value.events.find(e => e.id === id)
  const preview = ev ? (ev.usefulMessage || ev.originalMessage || '').slice(0, 60) : ''
  deleteStocksDialog.value.eventName = preview
  try {
    const r = await wechatApi.getEventStocksUsage(id)
    const data = r.data || {}
    deleteStocksDialog.value.stocks = (data.stocks || []).map(s => ({
      code: s.code,
      name: s.name,
      trackingId: s.trackingId,
      count: s.count,
      otherCount: s.otherCount,
      // count===1 直接删；count>1 只删一次（不删全部）
      deleteAll: s.count <= 1,
    }))
  } catch (err) {
    pageError.value = err.response?.data?.error || '查询股票失败'
    deleteStocksDialog.value.visible = false
  } finally {
    deleteStocksDialog.value.loading = false
  }
}

async function confirmDeleteEventWithStocks() {
  const { eventId, stocks } = deleteStocksDialog.value
  if (!eventId) return
  deleteStocksDialog.value.deleting = true
  try {
    const stockOptions = stocks.map(s => ({ code: s.code, deleteAll: s.deleteAll }))
    await wechatApi.deleteEventWithOptions(eventId, { stockOptions })
    status.value = { ...status.value, events: status.value.events.filter(event => event.id !== eventId) }
    deleteStocksDialog.value.visible = false
    // 自动刷新：追踪列表、投资人分析、股价
    Promise.all([
      loadTrackingStocks(),
      loadInvestorAnalysis(),
      refreshAllTrackingPrices(),
    ]).catch(() => {})
  } catch (err) {
    pageError.value = err.response?.data?.error || '删除失败'
  } finally {
    deleteStocksDialog.value.deleting = false
  }
}

async function clearAllEvents() {
  if (!confirm(`确定清空全部 ${events.value.length} 条微信选股消息？此操作不可恢复。`)) return
  clearDropdownOpen.value = false
  busy.value = true
  try {
    await wechatApi.clearEvents()
    status.value = { ...status.value, events: [] }
    selectedId.value = ''
    selectedDate.value = ''
    selectedStockCode.value = ''
  } catch (err) {
    pageError.value = err.response?.data?.error || '清空失败'
  } finally {
    busy.value = false
  }
}

async function clearByCategory(category) {
  const label = categoryLabel(category)
  const count = events.value.filter(e => e.category === category).length
  if (!count) return
  if (!confirm(`确定清空 ${count} 条「${label}」？此操作不可恢复。`)) return
  clearDropdownOpen.value = false
  busy.value = true
  try {
    const res = await wechatApi.clearEvents(category)
    if (res?.ok) {
      status.value = { ...status.value, events: status.value.events.filter(e => e.category !== category) }
      selectedId.value = ''
    }
  } catch (err) {
    pageError.value = err.response?.data?.error || '清空失败'
  } finally {
    busy.value = false
  }
}

function formatTime(value) {
  if (!value) return ''
  const d = parseCapturedAt(value)
  const hh = String(d.getHours()).padStart(2, '0')
  const mm = String(d.getMinutes()).padStart(2, '0')
  return `${hh}:${mm}`
}
function formatDate(value) {
  if (!value) return ''
  const d = parseCapturedAt(value)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

// 用 capturedAt 推导"8月4日 星期二 16:37"格式的完整时间
const WEEKDAYS = ['星期日', '星期一', '星期二', '星期三', '星期四', '星期五', '星期六']
function parseCapturedAt(capturedAt) {
  if (!capturedAt) return new Date()
  if (typeof capturedAt === 'number') return new Date(capturedAt)
  if (capturedAt instanceof Date) return capturedAt
  // Normalize: handle various formats
  const str = String(capturedAt).trim()
  // Replace nanoseconds with milliseconds (Java OffsetDateTime may produce nanoseconds)
  const normalized = str.replace(/\.(\d{3})\d+(.*)$/, '.$1$2')
  let d = new Date(normalized)
  if (!Number.isNaN(+d)) return d
  // Try parsing as MySQL DATETIME string: '2026-08-05 10:30:45'
  const mysqlMatch = str.match(/^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2}):(\d{2})/)
  if (mysqlMatch) {
    d = new Date(
      parseInt(mysqlMatch[1]), parseInt(mysqlMatch[2]) - 1, parseInt(mysqlMatch[3]),
      parseInt(mysqlMatch[4]), parseInt(mysqlMatch[5]), parseInt(mysqlMatch[6])
    )
    if (!Number.isNaN(+d)) return d
  }
  // Fallback: use current time
  return new Date()
}

function formatFullTime(capturedAt, messageTime) {
  const d = parseCapturedAt(capturedAt)
  const datePart = `${d.getMonth() + 1}月${d.getDate()}日 ${WEEKDAYS[d.getDay()]}`
  if (messageTime) {
    // messageTime from WeChat is just HH:MM, combine with date part
    return `${datePart} ${messageTime}`
  }
  const hh = String(d.getHours()).padStart(2, '0')
  const mm = String(d.getMinutes()).padStart(2, '0')
  return `${datePart} ${hh}:${mm}`
}

async function copyResult() {
  if (!selectedEvent.value) return
  const event = selectedEvent.value
  const stockLines = event.stocks.map(stock => `${stock.name}\t${stock.code}\t${stock.logic}`).join('\n')
  const header = `${event.sender || '未知'} ${formatFullTime(event.capturedAt, event.messageTime)}：\n`
  await navigator.clipboard.writeText(`发送人：${event.sender}\n微信会话：${event.chatName}\n推荐日期：${event.recommendationDate || formatDate(event.capturedAt)}\n\n${stockLines}\n\n${header}${event.usefulMessage}`)
  copied.value = true
  setTimeout(() => { copied.value = false }, 1500)
}

async function copyUrlToClipboard(url) {
  try {
    await navigator.clipboard.writeText(url)
    const target = event?.target?.closest('button')
    if (target) {
      const original = target.innerHTML
      target.innerHTML = '<svg class="w-2.5 h-2.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>已复制'
      target.classList.remove('bg-blue-100', 'text-blue-600', 'hover:bg-blue-200')
      target.classList.add('bg-emerald-100', 'text-emerald-700')
      setTimeout(() => {
        target.innerHTML = original
        target.classList.remove('bg-emerald-100', 'text-emerald-700')
        target.classList.add('bg-blue-100', 'text-blue-600', 'hover:bg-blue-200')
      }, 1200)
    }
  } catch (err) {
    console.error('复制失败:', err)
  }
}

async function copyCode(code, name) {
  try {
    await navigator.clipboard.writeText(code)
    copiedCode.value = code
    setTimeout(() => { copiedCode.value = '' }, 1200)
  } catch {
    // 忽略剪贴板权限错误
  }
}

function renderMarkdown(text) {
  if (!text) return ''
  return text
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/### (.+)/g, '<h3 class="text-sm font-bold text-slate-800 mt-4 mb-2">$1</h3>')
    .replace(/## (.+)/g, '<h2 class="text-base font-bold text-slate-800 mt-5 mb-2">$1</h2>')
    .replace(/^# (.+)/gm, '<h1 class="text-lg font-bold text-slate-800 mt-5 mb-2">$1</h1>')
    .replace(/\*\*(.+?)\*\*/g, '<strong class="font-bold text-slate-800">$1</strong>')
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    .replace(/^- (.+)/gm, '<li class="text-slate-700 ml-4 list-disc">$1</li>')
    .replace(/^\d+\. (.+)/gm, '<li class="text-slate-700 ml-4 list-decimal">$1</li>')
    .replace(/\n{2,}/g, '</p><p class="mb-2 text-slate-700">')
    .replace(/\n/g, '<br/>')
}

// 选中推票消息时，自动为无逻辑的股票后台 AI 提取（仅 id 变化时触发一次）
watch(selectedId, (id) => {
  if (!id) return
  nextTick(() => {
    const ev = selectedEvent.value
    if (!ev) return
    // 自动展开绑定区域：有链接但无股票的消息
    if (ev.urls?.length && (!ev.stocks || !ev.stocks.length)) {
      showBindStocks.value = true
    }
    if (ev && ev.category === 'stock_pick' && ev.stocks?.some(s => !s.logic)) {
      autoExtractMissingLogic()
    }
  })
})

onMounted(async () => {
  await refreshStatus()
  await Promise.all([loadWhitelist(), loadBlacklist(), loadTrackingStocks(), loadInvestorAnalysis(), loadCategoryRules(), loadLearnedStockSamples()])
  timer = setInterval(() => {
    if (!document.hidden) refreshStatus()
  }, 1200)
  // 每 30 秒自动刷新推票追踪列表和投资人分析
  autoRefreshTimer = setInterval(() => {
    if (!document.hidden) {
      Promise.all([loadTrackingStocks(), loadInvestorAnalysis()]).catch(() => {})
    }
  }, 30000)
  // 每 2 分钟自动刷新全部股价（静默执行，不显示进度和错误）
  autoPriceRefreshTimer = setInterval(() => {
    if (!document.hidden && !batchRefreshing.value) {
      wechatApi.refreshAllTracking().then(res => {
        if (res?.total > 0) loadTrackingStocks()
      }).catch(() => {})
    }
    scheduleNextPriceRefresh()
  }, 120000)
  // 每秒更新倒计时显示
  updatePriceRefreshCountdown()
  priceRefreshTickTimer = setInterval(updatePriceRefreshCountdown, 1000)
})
onBeforeUnmount(() => {
  if (timer) clearInterval(timer)
  if (autoRefreshTimer) clearInterval(autoRefreshTimer)
  if (autoPriceRefreshTimer) clearInterval(autoPriceRefreshTimer)
  if (priceRefreshTickTimer) clearInterval(priceRefreshTickTimer)
  if (panelRefreshTimer) clearTimeout(panelRefreshTimer)
  if (typeof document !== 'undefined') document.body.style.overflow = previousBodyOverflow
})
</script>

<style scoped>
.market-analysis-backdrop {
  background:
    radial-gradient(circle at 16% 12%, rgba(14, 165, 233, 0.13), transparent 29%),
    radial-gradient(circle at 84% 88%, rgba(79, 70, 229, 0.12), transparent 28%),
    rgba(2, 6, 23, 0.78);
  backdrop-filter: blur(9px) saturate(118%);
}

.market-analysis-shell {
  position: relative;
  isolation: isolate;
  border: 1px solid rgba(103, 232, 249, 0.16);
  border-radius: 16px;
  color-scheme: dark;
  background:
    linear-gradient(145deg, rgba(8, 19, 34, 0.985), rgba(5, 13, 27, 0.99) 48%, rgba(8, 15, 31, 0.99)),
    #07101f;
  box-shadow:
    0 38px 100px rgba(0, 0, 0, 0.52),
    0 0 80px rgba(14, 165, 233, 0.08),
    inset 0 1px 0 rgba(255, 255, 255, 0.07);
}

.market-analysis-shell::before {
  content: '';
  position: absolute;
  inset: 0;
  z-index: 0;
  pointer-events: none;
  border-radius: inherit;
  opacity: 0.32;
  background-image:
    linear-gradient(rgba(56, 189, 248, 0.045) 1px, transparent 1px),
    linear-gradient(90deg, rgba(99, 102, 241, 0.035) 1px, transparent 1px);
  background-size: 36px 36px;
  mask-image: linear-gradient(to bottom, black, transparent 82%);
}

.market-analysis-shell::after {
  content: '';
  position: absolute;
  inset: 0;
  z-index: 0;
  pointer-events: none;
  border-radius: inherit;
  background:
    radial-gradient(circle at 0 0, rgba(34, 211, 238, 0.11), transparent 30%),
    radial-gradient(circle at 100% 100%, rgba(99, 102, 241, 0.1), transparent 32%);
}

.market-analysis-shell > * {
  position: relative;
  z-index: 1;
}

.market-analysis-header {
  border-bottom: 1px solid rgba(148, 163, 184, 0.12);
  background: linear-gradient(90deg, rgba(14, 165, 233, 0.075), rgba(15, 23, 42, 0.38) 45%, rgba(99, 102, 241, 0.07));
  box-shadow: inset 0 -1px 0 rgba(255, 255, 255, 0.018);
}

.market-analysis-mark {
  border: 1px solid rgba(103, 232, 249, 0.28);
  background: linear-gradient(145deg, rgba(14, 165, 233, 0.82), rgba(79, 70, 229, 0.78));
  box-shadow: 0 0 24px rgba(14, 165, 233, 0.2), inset 0 1px 0 rgba(255, 255, 255, 0.3);
}

.market-analysis-counter {
  padding: 5px 9px;
  border: 1px solid rgba(103, 232, 249, 0.13);
  border-radius: 8px;
  color: #94a3b8;
  background: rgba(15, 23, 42, 0.5);
}

.market-analysis-toolbar {
  border-bottom: 1px solid rgba(148, 163, 184, 0.1);
  background: rgba(7, 16, 31, 0.72);
  box-shadow: 0 10px 28px rgba(2, 6, 23, 0.1);
}

.market-analysis-segmented {
  border: 1px solid rgba(148, 163, 184, 0.13);
  background: rgba(15, 23, 42, 0.68);
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.025);
}

.market-analysis-search {
  border: 1px solid rgba(103, 232, 249, 0.13);
  background: rgba(15, 23, 42, 0.64);
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.02);
  transition: border-color 180ms ease, box-shadow 180ms ease, background-color 180ms ease;
}

.market-analysis-search:focus-within {
  border-color: rgba(103, 232, 249, 0.42);
  background: rgba(15, 23, 42, 0.82);
  box-shadow: 0 0 0 3px rgba(34, 211, 238, 0.07), 0 0 24px rgba(14, 165, 233, 0.08);
}

.market-analysis-primary {
  border: 1px solid rgba(125, 211, 252, 0.27);
  background: linear-gradient(110deg, #0891b2, #2563eb 52%, #4f46e5);
  box-shadow: 0 10px 26px rgba(37, 99, 235, 0.23), inset 0 1px 0 rgba(255, 255, 255, 0.25);
  transition: transform 180ms ease, box-shadow 180ms ease, filter 180ms ease;
}

.market-analysis-primary:hover:not(:disabled) {
  transform: translateY(-1px);
  filter: brightness(1.08);
  box-shadow: 0 14px 34px rgba(37, 99, 235, 0.3), 0 0 22px rgba(34, 211, 238, 0.1);
}

.market-analysis-body {
  background: rgba(3, 10, 22, 0.55);
}

.market-analysis-list {
  border-right: 1px solid rgba(148, 163, 184, 0.1);
  background: rgba(8, 17, 31, 0.66);
}

.market-analysis-result {
  background: linear-gradient(150deg, rgba(9, 19, 35, 0.9), rgba(6, 13, 27, 0.93));
}

.market-analysis-subheader {
  min-height: 34px;
  border-bottom: 1px solid rgba(148, 163, 184, 0.1);
  background: linear-gradient(90deg, rgba(14, 165, 233, 0.05), rgba(99, 102, 241, 0.035));
}

.market-analysis-row {
  border-bottom: 1px solid rgba(148, 163, 184, 0.075);
  background: rgba(9, 18, 33, 0.48);
}

.market-analysis-row-selected {
  position: relative;
  background: linear-gradient(90deg, rgba(8, 145, 178, 0.14), rgba(37, 99, 235, 0.055));
  box-shadow: inset 2px 0 0 rgba(34, 211, 238, 0.76);
}

.market-analysis-report {
  background: radial-gradient(circle at 92% 7%, rgba(79, 70, 229, 0.08), transparent 28%);
}

.market-analysis-empty-mark {
  display: flex;
  width: 64px;
  height: 64px;
  align-items: center;
  justify-content: center;
  margin-bottom: 8px;
  border: 1px solid rgba(103, 232, 249, 0.12);
  border-radius: 18px;
  color: rgba(103, 232, 249, 0.45);
  background: linear-gradient(145deg, rgba(14, 165, 233, 0.07), rgba(99, 102, 241, 0.04));
  box-shadow: 0 0 34px rgba(14, 165, 233, 0.07), inset 0 1px 0 rgba(255, 255, 255, 0.035);
}

.market-analysis-prose :deep(h1),
.market-analysis-prose :deep(h2),
.market-analysis-prose :deep(h3),
.market-analysis-prose :deep(strong) {
  color: #e2e8f0;
}

.market-analysis-prose :deep(p),
.market-analysis-prose :deep(li) {
  color: #cbd5e1;
}

.market-analysis-shell ::-webkit-scrollbar {
  width: 6px;
}

.market-analysis-shell ::-webkit-scrollbar-track {
  background: rgba(15, 23, 42, 0.34);
}

.market-analysis-shell ::-webkit-scrollbar-thumb {
  border-radius: 999px;
  background: linear-gradient(#0e7490, #4f46e5);
}

</style>
