<template>
  <section class="h-full flex flex-col gap-4">
    <!-- 头部 -->
    <div class="flex items-center justify-between flex-shrink-0 gap-3 flex-wrap">
      <div class="flex items-center gap-2 min-w-0">
        <h2 class="text-lg font-bold text-slate-700">人生规划器</h2>
        <span class="text-xs text-slate-400 truncate">与 AI 持续对话，把考公 / 考研 / 工作等目标沉淀成一张会生长的规划网络</span>
      </div>
      <div class="flex items-center gap-2 flex-shrink-0">
        <button
          class="px-3 h-9 rounded-lg bg-white border border-slate-200 text-slate-600 text-sm font-medium hover:border-slate-300 hover:text-slate-800 transition-colors flex items-center gap-1.5"
          @click="openCreateNode"
        >
          <Plus class="w-4 h-4" /> 新增节点
        </button>
        <button
          class="px-3 h-9 rounded-lg bg-white border border-slate-200 text-slate-600 text-sm font-medium hover:border-slate-300 hover:text-slate-800 transition-colors disabled:opacity-45 disabled:cursor-not-allowed flex items-center gap-1.5"
          :disabled="busy || !messages.length"
          @click="regenerate"
        >
          <RefreshCw class="w-4 h-4" :class="{ 'animate-spin': regenerating }" /> 重新生成规划
        </button>
        <button
          class="px-3 h-9 rounded-lg bg-white border border-slate-200 text-slate-500 text-sm font-medium hover:border-rose-200 hover:text-rose-500 transition-colors disabled:opacity-45 disabled:cursor-not-allowed flex items-center gap-1.5"
          :disabled="busy || !messages.length"
          @click="clearChat"
        >
          <Trash2 class="w-4 h-4" /> 清空对话
        </button>
        <button
          class="px-3 h-9 rounded-lg bg-white border border-rose-200 text-rose-500 text-sm font-medium hover:bg-rose-50 transition-colors disabled:opacity-45 disabled:cursor-not-allowed flex items-center gap-1.5"
          :disabled="busy || !nodes.length"
          title="一键清除规划网络的全部数据（节点、每日任务、快照、精力、日历、变更日志、以及「不要了」清单）；个人档案与对话保留"
          @click="clearPlanData"
        >
          <Eraser class="w-4 h-4" /> 一键清除
        </button>
        <button
          class="px-3 h-9 rounded-lg bg-rose-500 text-white text-sm font-medium hover:bg-rose-600 transition-colors disabled:opacity-45 disabled:cursor-not-allowed flex items-center gap-1.5"
          :disabled="busy"
          title="彻底重置人生规划模块：清空节点、每日任务、快照、精力、日历、变更日志、「不要了」清单、人物画像（含动态画像）、路径库、技能 / 知识 / 事件、检索记录与全部对话记录；清完只剩「大脑」锚点，可重新对话输入训练"
          @click="resetAllLifeData"
        >
          <Trash2 class="w-4 h-4" /> 清空全部数据
        </button>
      </div>
    </div>

    <!-- 重点提醒区：固定单行高度，避免把下方画布挤出滚动条 -->
    <div
      v-if="alerts.length"
      class="flex flex-shrink-0 items-center gap-2 overflow-hidden rounded-xl border border-rose-100 bg-rose-50/60 px-3 py-1.5"
    >
      <AlertTriangle class="w-3.5 h-3.5 flex-shrink-0 text-rose-500" />
      <span class="flex-shrink-0 text-xs font-semibold text-rose-600">重点提醒</span>
      <span class="flex-shrink-0 text-[11px] text-rose-400">{{ alerts.length }} 条</span>
      <div class="flex min-w-0 flex-1 items-center gap-3 overflow-hidden whitespace-nowrap">
        <span v-for="(item, index) in alerts.slice(0, 3)" :key="index" class="min-w-0 truncate text-[11px] text-rose-700">
          <b class="font-semibold">{{ item.title }}</b><span class="mx-0.5 text-rose-300">·</span>{{ item.note }}
        </span>
        <span v-if="alerts.length > 3" class="flex-shrink-0 text-[11px] text-rose-400">等 {{ alerts.length }} 条</span>
      </div>
    </div>

    <!-- 主体：左对话 / 右规划网络；宽屏锁定可用高度（由脚本实测，见 measureGridHeight），保证整页不出现滚动条 -->
    <div
      ref="gridRef"
      class="min-h-0 grid grid-cols-1 gap-4 lg:h-[calc(100dvh-160px)]"
      :class="leftTab === 'persona' ? 'lg:grid-cols-[520px_minmax(0,1fr)]' : 'lg:grid-cols-[380px_minmax(0,1fr)]'"
      :style="gridStyle"
    >
      <!-- 左：对话 -->
      <div class="bg-white rounded-2xl border border-slate-100 shadow-sm flex flex-col min-h-0 overflow-hidden h-[68vh] lg:h-full">
        <header class="flex items-center gap-1 px-3 h-12 border-b border-slate-100 flex-shrink-0">
          <button
            v-for="tab in LEFT_TABS"
            :key="tab.id"
            type="button"
            class="flex h-8 items-center gap-1.5 rounded-lg px-2.5 text-xs font-medium transition-colors"
            :class="leftTab === tab.id ? 'bg-indigo-50 text-indigo-600' : 'text-slate-500 hover:bg-slate-50 hover:text-slate-700'"
            @click="leftTab = tab.id"
          >
            <component :is="tab.icon" class="w-3.5 h-3.5" />
            <span>{{ tab.label }}</span>
          </button>
          <span v-if="leftTab === 'chat' && messages.length" class="ml-auto text-xs text-slate-400">共 {{ messages.length }} 条</span>
        </header>

        <div v-show="leftTab === 'chat'" ref="chatListRef" class="flex-1 overflow-y-auto px-4 py-4 space-y-3">
          <template v-if="!messages.length">
            <div class="h-full flex flex-col items-center justify-center text-center gap-2 px-6">
              <Sparkles class="w-6 h-6 text-indigo-300" />
              <p class="text-sm text-slate-500">先说清楚你现在的处境和目标</p>
              <p class="text-xs text-slate-400 leading-relaxed">
                比如：现在大几、想考公还是考研、家里希望你做什么、手里有多少积蓄、身体和时间上的限制。
                说得越具体，右侧的规划网络就越贴近你的真实人生。
              </p>
            </div>
          </template>

          <div
            v-for="(msg, index) in messages"
            :key="msg.id || index"
            class="group flex items-start gap-1"
            :class="msg.role === 'user' ? 'justify-end' : 'justify-start'"
          >
            <!-- 用户消息：复制 -->
            <button
              v-if="msg.role === 'user'"
              type="button"
              class="mt-2 shrink-0 rounded p-1 text-slate-400 opacity-0 transition-opacity hover:bg-slate-100 hover:text-indigo-500 group-hover:opacity-100"
              title="复制这条内容"
              @click="copyMessage(msg)"
            >
              <Copy class="w-3.5 h-3.5" />
            </button>
            <div class="min-w-0" :class="msg.role === 'user' ? 'max-w-[98%]' : 'flex-1 w-full'">
              <div
                class="rounded-2xl px-3.5 py-2.5 text-[13px] leading-relaxed break-words"
                :class="msg.role === 'user' ? 'bg-indigo-500 text-white rounded-br-md' : 'bg-slate-50 text-slate-700 border border-slate-100 rounded-bl-md'"
              >
                <div v-if="msg.streaming && !msg.content" class="flex items-center gap-2 text-slate-400">
                  <Loader2 class="w-3.5 h-3.5 animate-spin" />
                  <span>正在思考…</span>
                </div>
                <template v-else>
                  <template v-for="(part, partIndex) in parseMessage(msg)" :key="partIndex">
                    <div v-if="part.type === 'text'" class="whitespace-pre-wrap" v-html="part.html"></div>
                    <!-- 代码块：JSON 载荷已在上游剔除，这里只留真正要给人看的代码 -->
                    <div v-else-if="part.type === 'code'" class="mt-2 overflow-hidden rounded-lg border border-slate-200 bg-white">
                      <div class="flex items-center justify-between border-b border-slate-100 bg-slate-50/70 px-2.5 py-1 text-[10px] font-medium uppercase tracking-wide text-slate-400">
                        <span>{{ part.lang || 'code' }}</span>
                        <button type="button" class="normal-case text-slate-400 transition-colors hover:text-indigo-500" @click="copyText(part.value)">复制</button>
                      </div>
                      <pre class="overflow-x-auto px-2.5 py-2 text-[11px] leading-relaxed text-slate-600">{{ part.value }}</pre>
                    </div>
                    <!-- Markdown 表格：短期任务清单，列固定为 任务名称｜截止时间｜优先级｜交付标准｜风险提示 -->
                    <div v-else-if="part.type === 'table'" class="mt-2 overflow-x-auto rounded-lg border border-slate-200 bg-white">
                      <table class="w-full border-collapse text-[11px] leading-relaxed">
                        <thead>
                          <tr class="bg-slate-50">
                            <th
                              v-for="(cell, cellIndex) in part.head"
                              :key="cellIndex"
                              class="whitespace-nowrap border-b border-slate-200 px-2.5 py-1.5 text-left font-semibold text-slate-500"
                            >{{ cell }}</th>
                          </tr>
                        </thead>
                        <tbody>
                          <tr
                            v-for="(row, rowIndex) in part.rows"
                            :key="rowIndex"
                            class="border-b border-slate-100 transition-colors last:border-b-0 hover:bg-slate-50/70"
                          >
                            <td
                              v-for="(cell, cellIndex) in row"
                              :key="cellIndex"
                              class="border-r border-slate-100 px-2.5 py-1.5 align-top text-slate-600 last:border-r-0"
                              @pointerenter="onCellEnter($event, part.head[cellIndex])"
                              @pointerleave="hideTip()"
                            >
                              <span :class="cellClass(part.head, cellIndex, cell)">{{ cell }}</span>
                            </td>
                          </tr>
                        </tbody>
                      </table>
                    </div>
                    <div v-else class="mt-2">
                      <!-- 渲染中与渲染失败时展示代码，渲染成功只留图形 -->
                      <div v-if="mermaidState[part.id] !== 'ok'" class="overflow-x-auto rounded-xl border border-slate-200 bg-white p-2.5">
                        <div v-if="mermaidState[part.id] === 'pending'" class="flex items-center gap-1.5 py-1 text-[11px] text-slate-400">
                          <Loader2 class="w-3.5 h-3.5 animate-spin" />正在绘制规划网络图…
                        </div>
                        <pre v-else class="whitespace-pre-wrap text-[11px] leading-relaxed text-slate-500">{{ part.value }}</pre>
                      </div>
                      <div
                        :data-mermaid-id="part.id"
                        class="overflow-x-auto"
                        :class="{ 'life-mermaid': mermaidState[part.id] === 'ok' }"
                      ></div>
                      <div v-if="mermaidState[part.id] === 'failed'" class="mt-1 flex items-center gap-2 text-[11px] text-slate-400">
                        <span>图形渲染失败，已按代码展示</span>
                        <button type="button" class="text-primary hover:underline" @click="copyText(part.value)">复制代码</button>
                      </div>
                    </div>
                  </template>
                </template>
              </div>
              <!-- 思考过程：阶段进度、模型思考、检索关键词与查到的资料 -->
              <div v-if="msg.role !== 'user' && hasTrace(msg)" class="mt-1.5 px-0.5">
                <button
                  type="button"
                  class="flex items-center gap-1 text-[11px] text-slate-500 transition-colors hover:text-indigo-500"
                  @click="toggleTrace(msg)"
                >
                  <ChevronRight class="w-3 h-3 transition-transform" :class="{ 'rotate-90': traceOpen.has(msg.id) }" />
                  <Brain class="w-3.5 h-3.5" />
                  <span>思考过程</span>
                  <span v-if="(msg.steps || []).length" class="text-slate-400">· {{ (msg.steps || []).length }} 步</span>
                  <span v-if="msg.search" class="text-slate-400">· 检索 {{ msg.search.count }} 篇</span>
                  <span v-else-if="msg.searchError" class="text-amber-600">· 未联网</span>
                  <Loader2 v-if="msg.streaming" class="w-3 h-3 animate-spin text-indigo-500" />
                </button>

                <div v-if="traceOpen.has(msg.id)" class="mt-1.5 space-y-1.5 border-l border-slate-200 pl-3">
                  <div
                    v-for="(step, stepIndex) in (msg.steps || [])"
                    :key="stepIndex"
                    class="flex items-start gap-1.5 text-[11px] leading-relaxed"
                  >
                    <Search
                      v-if="step.key === 'searching' || step.key === 'search'"
                      class="mt-0.5 w-3.5 h-3.5 flex-shrink-0"
                      :class="step.status === 'failed' ? 'text-amber-500' : step.status === 'skipped' ? 'text-slate-400' : 'text-sky-500'"
                    />
                    <Sparkles v-else class="mt-0.5 w-3.5 h-3.5 flex-shrink-0 text-indigo-400" />
                    <span :class="step.status === 'failed' ? 'text-amber-600' : 'text-slate-500'">{{ step.label }}</span>
                  </div>

                  <div v-if="msg.reasoning" class="whitespace-pre-wrap rounded-lg border border-slate-100 bg-slate-50 px-2.5 py-2 text-[11px] leading-relaxed text-slate-500">{{ msg.reasoning }}</div>

                  <div v-if="msg.search" class="space-y-1">
                    <div class="flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px]">
                      <span class="inline-flex items-center gap-1 text-sky-600"><Globe class="w-3 h-3" />检索到 {{ msg.search.count }} 篇资料</span>
                      <span class="text-slate-400">{{ msg.search.provider }}{{ msg.search.cached ? ' · 缓存' : '' }}</span>
                      <span v-if="msg.search.query" class="text-slate-400">关键词「{{ msg.search.query }}」</span>
                    </div>
                    <a
                      v-for="(source, sourceIndex) in (msg.search.sources || [])"
                      :key="sourceIndex"
                      :href="source.url"
                      target="_blank"
                      rel="noopener noreferrer"
                      class="block rounded border border-slate-200 px-2 py-1 text-[11px] text-slate-500 transition-colors hover:border-sky-300 hover:text-sky-600"
                      :title="source.snippet || source.url"
                    >
                      <span class="block truncate">{{ source.title || source.url }}</span>
                      <span v-if="source.snippet" class="mt-0.5 block truncate text-slate-400">{{ source.snippet }}</span>
                    </a>
                  </div>
                  <p v-else-if="msg.searchError" class="text-[11px] text-amber-600">{{ msg.searchError }}</p>
                </div>
              </div>
            </div>
            <!-- 助手回复：复制 + 就这条继续追问（生成中不显示） -->
            <div v-if="msg.role !== 'user' && !msg.streaming" class="mt-2 flex shrink-0 items-center gap-0.5 opacity-0 transition-opacity group-hover:opacity-100">
              <button type="button" class="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-indigo-500" title="复制这条回复" @click="copyMessage(msg)">
                <Copy class="w-3.5 h-3.5" />
              </button>
              <button type="button" class="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-indigo-500" title="就这条回复继续追问" @click="followUp(msg)">
                <CornerUpLeft class="w-3.5 h-3.5" />
              </button>
            </div>
          </div>

        </div>

        <div v-show="leftTab === 'chat'" class="border-t border-slate-100 p-3 flex-shrink-0">
          <!-- 模型选择：与设置里的「板块模型分配 · 人生规划」共用 ai_model_routes.life -->
          <div class="flex items-center justify-between gap-2 mb-2">
            <span class="text-[11px] text-slate-400 flex items-center gap-1 whitespace-nowrap min-w-0">
              <Cpu class="w-3.5 h-3.5" />对话模型
            </span>
            <button
              ref="modelBtnRef"
              type="button"
              class="min-w-0 max-w-[64%] h-7 rounded-lg border border-slate-200 bg-white pl-2.5 pr-2 text-[11px] text-slate-600 transition-colors flex items-center gap-1.5 hover:border-slate-300 disabled:opacity-50 disabled:cursor-not-allowed"
              :disabled="busy"
              title="切换后同步到设置里的「板块模型分配 · 人生规划」"
              @click="toggleModelMenu"
            >
              <span class="truncate">{{ activeModel || '加载中…' }}</span>
              <ChevronDown class="w-3 h-3 flex-shrink-0 text-slate-400 transition-transform" :class="{ 'rotate-180': modelMenuOpen }" />
            </button>
          </div>
          <textarea
            ref="draftRef"
            v-model="draft"
            rows="3"
            class="w-full resize-none rounded-xl border border-slate-200 px-3 py-2.5 text-[13px] leading-relaxed text-slate-700 outline-none transition-colors focus:border-indigo-300 focus:ring-2 focus:ring-indigo-50 disabled:bg-slate-50"
            placeholder="说说你的想法、目标或顾虑，Enter 发送，Shift+Enter 换行"
            :disabled="busy"
            @keydown="onDraftKeydown"
          ></textarea>
          <div class="flex items-center justify-between mt-2">
            <span class="text-[11px] text-slate-400">Enter 发送 · Shift+Enter 换行</span>
            <button
              class="px-4 h-9 rounded-lg bg-gradient-to-r from-indigo-500 to-blue-500 text-white text-sm font-medium shadow-sm hover:opacity-90 transition-opacity disabled:opacity-45 disabled:cursor-not-allowed flex items-center gap-1.5"
              :disabled="busy || !draft.trim()"
              @click="send"
            >
              <Send class="w-3.5 h-3.5" /> {{ sending ? '思考中' : '发送' }}
            </button>
          </div>
        </div>

        <!-- 左栏第二页：系统内个人人物画像（用户模型）+ 未来可选发展路径库 -->
        <div v-show="leftTab === 'persona'" class="flex-1 min-h-0 overflow-y-auto overscroll-contain bg-slate-50/40 p-3">
          <LifePersona :refresh-token="panelToken" @changed="onPersonaChanged" @focus-path="focusLifePath" />
        </div>
      </div>

      <!-- 右：规划网络 -->
      <div class="relative bg-white rounded-2xl border border-slate-100 shadow-sm flex flex-col min-h-0 overflow-hidden h-[78vh] lg:h-full">
        <header class="flex items-center justify-between px-3 h-12 border-b border-slate-100 flex-shrink-0 gap-2">
          <div class="flex items-center gap-1 min-w-0 overflow-x-auto">
            <button
              v-for="tab in TABS"
              :key="tab.id"
              type="button"
              class="px-2.5 h-8 rounded-lg text-xs font-medium whitespace-nowrap flex-shrink-0 transition-colors flex items-center gap-1.5"
              :class="activeTab === tab.id ? 'bg-indigo-50 text-indigo-600' : 'text-slate-500 hover:bg-slate-50 hover:text-slate-700'"
              @click="switchTab(tab.id)"
            >
              <component :is="tab.icon" class="w-3.5 h-3.5" />
              <span>{{ tab.label }}</span>
            </button>
          </div>
          <div v-if="activeTab === 'network'" class="flex items-center gap-1.5 flex-shrink-0">
            <span class="text-xs text-slate-400 whitespace-nowrap">共 {{ nodes.length }} 个节点 · {{ netView === 'mind' ? '思维导图视图' : layout.bands.length + ' 条系列' }} · 已完成 {{ doneCount }}</span>
            <div class="w-px h-5 bg-slate-200 mx-0.5"></div>
            <button
              class="h-8 px-2.5 rounded-lg border border-slate-200 text-xs font-medium text-slate-500 hover:text-indigo-600 hover:border-indigo-200 transition-colors flex items-center gap-1"
              title="一键展开全部子树"
              @click="expandAll"
            >
              <ChevronRight class="w-3.5 h-3.5" /> 一键展开
            </button>
            <button
              class="h-8 px-2.5 rounded-lg border border-slate-200 text-xs font-medium text-slate-500 hover:text-indigo-600 hover:border-indigo-200 transition-colors flex items-center gap-1"
              :title="navOrder.length ? (navIndex < 0 ? `自动定位到下一个节点（共 ${navOrder.length} 个）` : `自动定位到下一个节点（当前第 ${navIndex + 1} / ${navOrder.length} 个）`) : '暂无可定位节点'"
              :disabled="!navOrder.length"
              @click="focusNextNode"
            >
              <ChevronDown class="w-3.5 h-3.5" /> 下一个节点
              <span v-if="navOrder.length" class="text-[10px] text-slate-400 tabular-nums">{{ navIndex < 0 ? `${navOrder.length} 个` : `${navIndex + 1}/${navOrder.length}` }}</span>
            </button>
            <button class="w-8 h-8 rounded-lg border border-slate-200 text-slate-500 hover:text-slate-800 hover:border-slate-300 transition-colors flex items-center justify-center" title="放大" @click="zoomBy(1.2)"><ZoomIn class="w-4 h-4" /></button>
            <button class="w-8 h-8 rounded-lg border border-slate-200 text-slate-500 hover:text-slate-800 hover:border-slate-300 transition-colors flex items-center justify-center" title="缩小" @click="zoomBy(1 / 1.2)"><ZoomOut class="w-4 h-4" /></button>
            <button class="w-8 h-8 rounded-lg border border-slate-200 text-slate-500 hover:text-slate-800 hover:border-slate-300 transition-colors flex items-center justify-center" title="复位视图（把整棵树重新放进可视区）" @click="resetView"><RotateCcw class="w-4 h-4" /></button>
            <button
              class="w-8 h-8 rounded-lg border border-slate-200 text-slate-500 hover:text-slate-800 hover:border-slate-300 transition-colors flex items-center justify-center"
              :title="isFullscreen ? '退出全屏（Esc）' : '全屏：把整张无限画布铺满浏览器'"
              @click="toggleFullscreen"
            >
              <Minimize2 v-if="isFullscreen" class="w-4 h-4" />
              <Maximize2 v-else class="w-4 h-4" />
            </button>
          </div>
        </header>

        <div v-show="activeTab === 'network'" ref="canvasWrap" class="flex-1 min-h-0 relative flex flex-col bg-[radial-gradient(circle_at_top,#f8fafc_0%,#ffffff_70%)]">
          <!-- 冻结首行：时间轴刻度始终可见 —— 纵向滚动带不走它，横向只跟随画布平移，任何缩放级别都能看到 -->
          <div v-if="netView === 'mind'" class="relative h-11 flex-shrink-0 overflow-hidden border-b border-slate-100 bg-white/92 backdrop-blur-sm">
            <svg class="absolute inset-0 h-full w-full" @wheel="onStripWheel">
              <g class="life-axis">
                <rect x="4" y="3" width="132" height="17" rx="4" fill="#ffffff" opacity="0.94" />
                <text x="10" y="15" class="life-axis-title">任务时间（左早 → 右晚）</text>
                <line :x1="axisFromX * view.scale + view.tx" y1="27" :x2="axisToX * view.scale + view.tx" y2="27" stroke="#cbd5e1" stroke-width="1.2" />
                <line
                  v-for="tick in axisStripTicks"
                  :key="`strip-${tick.day}`"
                  :x1="tick.screenX" y1="22"
                  :x2="tick.screenX" y2="32"
                  stroke="#94a3b8" stroke-width="1.2"
                />
                <text
                  v-for="tick in axisStripTicks"
                  :key="`striplbl-${tick.day}`"
                  :x="tick.screenX"
                  y="13"
                  text-anchor="middle"
                  class="life-axis-label"
                >{{ tick.label }}</text>
              </g>
            </svg>
          </div>
          <!-- 画布＝无限画布：svg 就是可视区本身（不设 viewBox，坐标 1:1 等于像素），
               缩放/平移全部由内部 transform 完成，所以任何角落都能拖到、不会出现够不着的空白 -->
          <div class="flex-1 min-h-0 overflow-hidden relative">
          <svg
            ref="svgRef"
            class="life-canvas absolute inset-0 h-full w-full touch-none select-none"
            :class="{ 'is-panning': panning }"
            @wheel="onWheel"
            @pointerdown="onCanvasPointerDown"
          >
            <defs>
              <filter id="lifeGlow" x="-60%" y="-60%" width="220%" height="220%">
                <feGaussianBlur stdDeviation="6" result="blur" />
                <feMerge>
                  <feMergeNode in="blur" />
                  <feMergeNode in="SourceGraphic" />
                </feMerge>
              </filter>
              <marker id="lifeDepArrow" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="5" markerHeight="5" orient="auto">
                <path d="M 0 0 L 10 5 L 0 10 z" fill="#94a3b8" />
              </marker>
              <!-- 「大脑」卡片的底色：深墨 + 鎏金，与下面的任务卡片拉开层次 -->
              <linearGradient id="lifeBrainFill" x1="0" y1="0" x2="1" y2="1">
                <stop offset="0%" stop-color="#111c33" />
                <stop offset="100%" stop-color="#1f2a44" />
              </linearGradient>
            </defs>

            <g :transform="`translate(${view.tx} ${view.ty}) scale(${view.scale})`">
              <!-- 顶部横轴刻度已移到画布外的「冻结首行」，纵向滚动时始终可见，这里只留竖向日期网格 -->
              <!-- 思维导图竖向日期网格：与横轴刻度同一条 x，一眼看出任务是否对上日期列 -->
              <g v-if="netView === 'mind'" class="life-mind-grid">
                <line
                  v-for="tick in axisTicks"
                  :key="`mgrid-${tick.day}`"
                  :x1="tick.x" :y1="AXIS_Y + 6"
                  :x2="tick.x" :y2="layout.canvasH - 14"
                  stroke="#e5eaf3"
                  stroke-width="1"
                  stroke-dasharray="3 6"
                />
              </g>

              <!-- 系列条带：一条横向带 = 一条 series 主线（思维导图视图不画条带） -->
              <g v-if="netView !== 'mind'" class="life-bands">
                <g v-for="band in layout.bands" :key="band.key" :class="{ 'is-faded': isBandFaded(band.key) }">
                  <rect
                    :x="BAND_X"
                    :y="band.y"
                    :width="BAND_W"
                    :height="band.h - 12"
                    rx="16"
                    :fill="band.tint"
                    fill-opacity="0.75"
                    stroke="#e2e8f0"
                    stroke-width="1"
                  />
                  <text :x="TITLE_X" :y="band.y + 26" class="life-band-title" @click.stop="focusBand(band.key)">{{ truncate(band.name, 9) }}</text>
                  <text :x="TITLE_X" :y="band.y + 42" class="life-band-sub">{{ band.nodes.length }} 个节点</text>
                </g>
                <!-- 竖向日期网格：画在泳道框之上，与泳道横框交叉成网格，方便按列对齐看时间 -->
                <line
                  v-for="tick in axisTicks"
                  :key="`grid-${tick.day}`"
                  :x1="tick.x" :y1="AXIS_Y + 6"
                  :x2="tick.x" :y2="layout.canvasH - 14"
                  stroke="#dfe6f0"
                  stroke-width="1"
                  stroke-dasharray="3 6"
                />
              </g>

              <!-- 横向网状关联（跨赛道联动 / 时间冲突 / 精力冲突）：虚线，和纵向父子实线区分 -->
              <g v-if="netView === 'mind'" class="life-ref-links">
                <path
                  v-for="link in mindRefLinks"
                  :key="link.id"
                  :d="link.d"
                  fill="none"
                  stroke="#c084fc"
                  stroke-width="1.2"
                  stroke-dasharray="4 4"
                  opacity="0.7"
                />
              </g>

              <!-- 思维导图父子枝干：连线含义＝父子从属；箭头方向沿时间轴向后（早 → 晚），永远指向右端 -->
              <g v-if="netView === 'mind'" class="life-mind-links">
                <path
                  v-for="link in mindLinks"
                  :key="link.id"
                  :d="link.d"
                  fill="none"
                  stroke="#a9b8d0"
                  stroke-width="1.6"
                  marker-end="url(#lifeDepArrow)"
                  pathLength="1"
                  :stroke-dasharray="link.t < 1 ? '1 1' : 'none'"
                  :stroke-dashoffset="link.t < 1 ? 1 - link.t : 0"
                />
              </g>

              <!-- 思维导图合成分组标签：仅旧数据没有父子关系时出现，只做视觉分组，不是任务节点 -->
              <g v-if="netView === 'mind' && (layout.groups || []).length" class="life-mind-groups">
                <g v-for="group in layout.groups" :key="group.id">
                  <rect
                    :x="group.x - group.w / 2"
                    :y="group.y - 13"
                    :width="group.w"
                    height="26"
                    rx="13"
                    fill="#eef2ff"
                    stroke="#c7d2fe"
                    stroke-width="1"
                  />
                  <text :x="group.x" :y="group.y + 4" text-anchor="middle" class="life-mind-group-label">{{ group.title }}</text>
                </g>
              </g>

              <!-- 同系列内的依赖箭头：上一步 → 下一步（思维导图视图由父子枝干承载） -->
              <g v-if="netView !== 'mind'" class="life-deps">
                <path
                  v-for="link in depLinks"
                  :key="link.id"
                  :d="link.d"
                  fill="none"
                  stroke="#94a3b8"
                  stroke-width="1.4"
                  :stroke-opacity="depOpacity(link)"
                  marker-end="url(#lifeDepArrow)"
                />
              </g>

              <!-- 悬浮时的临时连线：跨系列依赖只在悬浮时出现，松开即消失；中点上标一句「前置/后续 · 谁」 -->
              <g v-if="hoverId" class="life-hover-deps">
                <path
                  v-for="link in hoverDepLinks"
                  :key="link.id"
                  :d="link.d"
                  fill="none"
                  stroke="#6366f1"
                  stroke-width="1.2"
                  stroke-dasharray="4 4"
                  stroke-opacity="0.75"
                  marker-end="url(#lifeDepArrow)"
                />
                <text
                  v-for="link in hoverDepLinks"
                  :key="`${link.id}-label`"
                  :x="link.mx"
                  :y="link.my - 5"
                  text-anchor="middle"
                  class="life-hover-dep-label"
                >{{ link.label }}</text>
              </g>

              <!-- 复合卡片（大表格框）：同一父任务下、同一天的任务并成一张表
                   表头＝最上面那行（一级任务），底纹 + 分隔线让下面各行读起来就是表格行 -->
              <g v-if="netView === 'mind' && (layout.taskBoxes || []).length" class="life-task-boxes">
                <g v-for="box in layout.taskBoxes" :key="box.id">
                  <rect
                    :x="box.x - box.w / 2"
                    :y="box.top"
                    :width="box.w"
                    :height="box.bottom - box.top"
                    rx="12"
                    fill="#ffffff"
                    :stroke="box.color"
                    :stroke-width="1.4"
                    :stroke-dasharray="box.dashed ? '4 3' : null"
                  />
                  <!-- 表头底纹：让人一眼看出最上面那行是一级任务 -->
                  <rect
                    :x="box.x - box.w / 2 + 1"
                    :y="box.top + 1"
                    :width="box.w - 2"
                    :height="box.headBottom - box.top - 1"
                    rx="11"
                    fill="#f8fafc"
                  />
                  <!-- 行分隔线：各子任务之间分隔开，读起来是一张表 -->
                  <line
                    v-for="row in box.rows.slice(1)"
                    :key="`sep-${row.id}`"
                    :x1="box.x - box.w / 2 + 1"
                    :y1="row.y - MIND_CARD_H / 2 + 6"
                    :x2="box.x + box.w / 2 - 1"
                    :y2="row.y - MIND_CARD_H / 2 + 6"
                    stroke="#eef2f7"
                    stroke-width="1"
                  />
                </g>
              </g>

              <!-- 人物画像思维导图：挂在大脑（本人）根节点的**左侧**，把画像内容（6 大维度 + 未来可选发展路径库）
                   以思维导图形式平铺展开，与右脑子枝干同一套样式（圆角卡片＋左侧色条＋曲线箭头），只是整棵树向左生长；
                   点一下切到左侧「人物画像」面板做查看与编辑，带推演子图的路径卡片点击可直接跳到对应子图 -->
              <g v-if="netView === 'mind' && layout.personaTree" class="life-persona-tree">
                <path
                  v-for="link in layout.personaTree.links"
                  :key="link.id"
                  :d="link.d"
                  fill="none"
                  stroke="#cbb98a"
                  stroke-width="1.6"
                  marker-end="url(#lifeDepArrow)"
                />
                <g
                  v-for="pnode in layout.personaTree.nodes"
                  :key="pnode.id"
                  class="life-persona-node"
                  style="cursor:pointer"
                  @click.stop="onPersonaNodeClick(pnode)"
                >
                  <title>{{ pnode.title }}</title>
                  <rect
                    :x="pnode.x - pnode.w / 2"
                    :y="pnode.y - pnode.h / 2"
                    :width="pnode.w"
                    :height="pnode.h"
                    rx="10"
                    fill="#ffffff"
                    :stroke="pnode.color"
                    stroke-width="1.4"
                  />
                  <!-- 与其它思维导图节点同款的左侧色条 -->
                  <rect
                    :x="pnode.x - pnode.w / 2 + 3"
                    :y="pnode.y - pnode.h / 2 + 3"
                    width="4"
                    :height="pnode.h - 6"
                    rx="2"
                    :fill="pnode.color"
                  />
                  <!-- 一级分支：维度名 / 路径库，下面标条目数 -->
                  <template v-if="pnode.depth === 1">
                    <text :x="pnode.x - pnode.w / 2 + 15" :y="pnode.y - 4" class="life-card-title">{{ pnode.label }}</text>
                    <text :x="pnode.x + pnode.w / 2 - 12" :y="pnode.y + 14" text-anchor="end" class="life-persona-tag">{{ pnode.tag }}</text>
                  </template>
                  <!-- 二级条目：整段文字按卡片宽度自动换行平铺；路径卡片右侧标适配分 -->
                  <template v-else>
                    <text
                      v-for="(line, i) in pnode.lines"
                      :key="i"
                      :x="pnode.x - pnode.w / 2 + 14"
                      :y="pnode.y - pnode.h / 2 + 24 + i * 16"
                      class="life-persona-item-text"
                    >{{ line }}</text>
                    <text
                      v-if="pnode.score !== undefined"
                      :x="pnode.x + pnode.w / 2 - 12"
                      :y="pnode.y - pnode.h / 2 + 24"
                      text-anchor="end"
                      class="life-persona-score"
                    >{{ pnode.score }} 分</text>
                  </template>
                </g>
              </g>

              <!-- 节点 -->
              <g class="life-nodes">
                <g
                  v-for="node in visibleNodes"
                  :key="node.id"
                  class="life-node"
                  :class="{
                    'is-dim': isDimmed(node.id),
                    'is-selected': selectedId === node.id,
                    'is-pruned': node.status === 'drop',
                    'is-root': netView === 'mind' && layout.rootId === node.id,
                    'is-brain': netView === 'mind' && isBrain(node),
                    'is-undated': netView === 'mind' && !hasDate(node) && !isBrain(node),
                    'is-locked': netView === 'mind' && isLockedNode(node),
                    'is-folded': netView === 'mind' && layout.fold && layout.fold[node.id] && !layout.fold[node.id].open,
                    'is-drawing': drawCursor !== null,
                    'is-new': nodeFlash(node.id) === 'new',
                    'is-updated': nodeFlash(node.id) === 'updated'
                  }"
                  style="cursor: pointer"
                  @pointerenter="onNodeEnter($event, node)"
                  @pointerleave="onNodeLeave()"
                  @click.stop="onNodeClick(node)"
                  @dblclick.stop="openEditNode(node)"
                >
                  <!-- 思维导图视图 · 任务类节点：直接用表格行展示（复选框 + 任务名 + 时间 + 资料入口）
                       行宽跟着任务名文字宽度走，标题完整显示不截断 -->
                  <template v-if="isTaskRow(node)">
                    <rect
                      v-if="!isInTaskBox(node)"
                      :x="node.x - rowWidth(node) / 2"
                      :y="node.y - MIND_CARD_H / 2"
                      :width="rowWidth(node)"
                      :height="MIND_CARD_H"
                      rx="8"
                      :fill="node.status === 'done' || node.status === 'drop' ? '#f8fafc' : '#ffffff'"
                      :stroke="node.status === 'done' || node.status === 'drop' ? '#e2e8f0' : nodeColor(node)"
                      stroke-width="1.2"
                    />
                    <rect
                      v-if="!isInTaskBox(node)"
                      :x="node.x - rowWidth(node) / 2"
                      :y="node.y - MIND_CARD_H / 2 + 3"
                      width="3"
                      :height="MIND_CARD_H - 6"
                      rx="1.5"
                      :fill="node.status === 'done' || node.status === 'drop' ? '#cbd5e1' : nodeColor(node)"
                    />
                    <!-- 复选框：勾上=已完成，再点取消；前置任务没完成时禁用；只做了一部分＝琥珀色半格并显示完成情况 -->
                    <g
                      class="life-task-check"
                      :class="{ 'is-off': isLockedNode(node), 'is-on': node.status === 'done', 'is-part': isPartialTask(node) }"
                      :transform="`translate(${node.x - rowWidth(node) / 2 + 11} ${node.y - 9})`"
                      @click.stop="toggleTaskDone(node)"
                      @pointerdown.stop
                    >
                      <title>{{ isLockedNode(node) ? '前置任务未完成，暂不能勾选' : node.status === 'done' ? '取消完成' : isPartialTask(node) ? `部分完成：${node.progressNote}（双击节点可修改）` : '标记完成' }}</title>
                      <rect width="18" height="18" rx="5" :fill="node.status === 'done' ? '#4f46e5' : isPartialTask(node) ? '#f59e0b' : '#ffffff'" :stroke="node.status === 'done' ? '#4f46e5' : isPartialTask(node) ? '#f59e0b' : '#cbd5e1'" stroke-width="1.4" />
                      <path v-if="node.status === 'done'" d="M4.5 9.2 L7.6 12.3 L13.6 6" fill="none" stroke="#ffffff" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" />
                      <path v-else-if="node.status === 'drop'" d="M5.5 5.5 L12.5 12.5 M12.5 5.5 L5.5 12.5" fill="none" stroke="#94a3b8" stroke-width="1.7" stroke-linecap="round" />
                      <path v-else-if="isPartialTask(node)" d="M5 9 H13" fill="none" stroke="#ffffff" stroke-width="2.2" stroke-linecap="round" />
                    </g>
                    <!-- 放弃：点一下标记放弃，依赖它的后续节点会重新变成「待解锁」 -->
                    <g
                      class="life-task-drop"
                      :class="{ 'is-on': node.status === 'drop' }"
                      :transform="`translate(${node.x - rowWidth(node) / 2 + 35} ${node.y - 7})`"
                      @click.stop="toggleTaskDrop(node)"
                      @pointerdown.stop
                    >
                      <title>{{ node.status === 'drop' ? '取消放弃' : '放弃该任务' }}</title>
                      <path d="M3 3 L10 10 M10 3 L3 10" fill="none" stroke="#94a3b8" stroke-width="1.5" stroke-linecap="round" />
                    </g>
                    <!-- 任务名：已完成/已放弃加删除线 -->
                    <text
                      :x="node.x - rowWidth(node) / 2 + 55"
                      :y="node.y + 4"
                      text-anchor="start"
                      class="life-card-title life-task-title"
                      :class="{ 'is-done': node.status === 'done' || node.status === 'drop' }"
                    >{{ cardTitle(node) }}</text>
                    <!-- 时间列：标明这个日期是什么日期（截止 / 开始 / 时间段） -->
                    <line :x1="node.x + rowWidth(node) / 2 - linkWidthOf(node) - TASK_TIME_W" :y1="node.y - 13" :x2="node.x + rowWidth(node) / 2 - linkWidthOf(node) - TASK_TIME_W" :y2="node.y + 13" stroke="#eef2f7" stroke-width="1" />
                    <text :x="node.x + rowWidth(node) / 2 - linkWidthOf(node) - TASK_TIME_W / 2" :y="node.y + 4" text-anchor="middle" class="life-task-time">{{ taskTimeLabel(node) }}</text>
                    <!-- 资料入口：标签写清「这是什么资料」（链接里的文件名/域名），点击打开 -->
                    <template v-if="resourceLabel(node)">
                      <line :x1="node.x + rowWidth(node) / 2 - linkWidthOf(node)" :y1="node.y - 13" :x2="node.x + rowWidth(node) / 2 - linkWidthOf(node)" :y2="node.y + 13" stroke="#eef2f7" stroke-width="1" />
                      <text
                        class="life-task-link"
                        :x="node.x + rowWidth(node) / 2 - linkWidthOf(node) / 2"
                        :y="node.y + 4"
                        text-anchor="middle"
                        @click.stop="openResource(node)"
                        @pointerdown.stop
                      >
                        <title>{{ resourceUrl(node) }}</title>
                        {{ resourceLabel(node) }}
                      </text>
                    </template>
                  </template>

                  <!-- 思维导图视图 · 「大脑」节点：整张图的根，固定在画布最顶部居中，实时显示人物塑造摘要 -->
                  <template v-else-if="netView === 'mind' && isBrain(node)">
                    <rect
                      :x="node.x - MIND_BRAIN_W / 2"
                      :y="node.y - MIND_BRAIN_H / 2"
                      :width="MIND_BRAIN_W"
                      :height="MIND_BRAIN_H"
                      rx="16"
                      fill="url(#lifeBrainFill)"
                      stroke="#c8a24a"
                      stroke-width="1.6"
                    />
                    <text :x="node.x - MIND_BRAIN_W / 2 + 16" :y="node.y - MIND_BRAIN_H / 2 + 19" class="life-brain-tag">大脑</text>
                    <text :x="node.x + MIND_BRAIN_W / 2 - 16" :y="node.y - MIND_BRAIN_H / 2 + 19" text-anchor="end" class="life-brain-sub">已完成 {{ persona.done }}/{{ persona.total }}<tspan v-if="persona.partial"> · 部分 {{ persona.partial }}</tspan></text>
                    <text :x="node.x" :y="node.y + 3" text-anchor="middle" class="life-brain-title">{{ cardTitle(node) }}</text>
                    <text :x="node.x" :y="node.y + 21" text-anchor="middle" class="life-brain-persona">{{ personaLine() }}</text>
                  </template>

                  <!-- 思维导图视图：矩形卡片节点（不用圆圈），根节点＝目标，子节点左侧标同级序号 -->
                  <template v-else-if="netView === 'mind'">
                    <rect
                      :x="node.x - rowWidth(node) / 2"
                      :y="node.y - MIND_CARD_H / 2"
                      :width="rowWidth(node)"
                      :height="MIND_CARD_H"
                      rx="10"
                      :fill="layout.rootId === node.id ? '#f5f3ff' : '#ffffff'"
                      :stroke="nodeColor(node)"
                      :stroke-width="layout.rootId === node.id ? 2.2 : 1.4"
                    />
                    <rect
                      :x="node.x - rowWidth(node) / 2"
                      :y="node.y - MIND_CARD_H / 2 + 3"
                      width="4"
                      :height="MIND_CARD_H - 6"
                      rx="2"
                      :fill="nodeColor(node)"
                    />
                    <text
                      v-if="node.seq"
                      :x="node.x - rowWidth(node) / 2 + 20"
                      :y="node.y + 4"
                      text-anchor="middle"
                      class="life-card-num"
                      :fill="nodeColor(node)"
                    >{{ node.seq }}</text>
                    <text
                      :x="node.x - rowWidth(node) / 2 + (node.seq ? 34 : 14)"
                      :y="node.y + 4"
                      text-anchor="start"
                      class="life-card-title"
                    >{{ cardTitle(node) }}</text>
                    <!-- 日期类型标注：普通卡片（根目标 / 目标 / 里程碑）也要标明这是开始日期还是截止日期 -->
                    <text
                      :x="node.x - rowWidth(node) / 2 + 14"
                      :y="node.y + 17"
                      text-anchor="start"
                      class="life-node-time"
                    >{{ cardTimeLabel(node) }}</text>
                    <text
                      v-if="carrierLabel(node)"
                      :x="node.x + rowWidth(node) / 2 - 6"
                      :y="node.y - MIND_CARD_H / 2 + 12"
                      text-anchor="end"
                      class="life-node-carrier"
                      :fill="carrierColor(node)"
                    >{{ carrierLabel(node) }}</text>
                  </template>

                  <!-- 条带视图：圆形节点 -->
                  <template v-else>
                    <circle
                      :cx="node.x"
                      :cy="node.y"
                      :r="nodeRadius(node) + 6"
                      :fill="nodeColor(node)"
                      :opacity="selectedId === node.id ? 0.24 : 0.13"
                    />
                    <circle
                      :cx="node.x"
                      :cy="node.y"
                      :r="nodeRadius(node)"
                      :fill="nodeColor(node)"
                      :filter="selectedId === node.id ? 'url(#lifeGlow)' : null"
                    />
                    <circle
                      :cx="node.x"
                      :cy="node.y"
                      :r="nodeRadius(node) + 3"
                      fill="none"
                      :stroke="statusColor(node.status)"
                      :stroke-width="node.status === 'todo' ? 1.2 : 2.2"
                      :stroke-dasharray="node.status === 'doing' ? '5 4' : null"
                    >
                      <animate v-if="node.status === 'doing'" attributeName="stroke-dashoffset" from="0" to="-18" dur="1.6s" repeatCount="indefinite" />
                    </circle>
                    <!-- 圆内序号：一眼看出同一系列内的执行先后 -->
                    <text v-if="stepOf(node)" :x="node.x" :y="node.y + 4" text-anchor="middle" class="life-node-step">{{ stepOf(node) }}</text>
                    <!-- 优先级小标记 -->
                    <text :x="node.x" :y="badgeY(node)" text-anchor="middle" class="life-node-pri" :fill="nodeColor(node)">{{ priorityBadge(node) }}</text>
                    <!-- 载体类型小徽标：AI 按内容匹配，一眼看出该节点是表格 / 链接 / 清单 / 分支还是计算卡片 -->
                    <text
                      v-if="carrierLabel(node)"
                      :x="node.x + nodeRadius(node) * 0.78"
                      :y="node.y - nodeRadius(node) * 0.78"
                      text-anchor="middle"
                      class="life-node-carrier"
                      :fill="carrierColor(node)"
                    >{{ carrierLabel(node) }}</text>
                    <text
                      :x="node.x"
                      :y="labelY(node)"
                      text-anchor="middle"
                      class="life-label"
                    >
                      <tspan v-for="(line, i) in nodeLabelLines(node)" :key="i" :x="node.x" :dy="i === 0 ? 0 : 11.5">{{ line }}</tspan>
                    </text>
                  </template>
                  <!-- 折叠开关：带子树的节点右侧显示 +/−，点一下展开/收起下一层 -->
                  <g
                    v-if="netView === 'mind' && layout.fold && layout.fold[node.id] && layout.fold[node.id].has"
                    class="life-fold"
                    style="cursor:pointer"
                    @click.stop="toggleFold(node.id)"
                    @pointerdown.stop
                  >
                    <title>{{ layout.fold[node.id].open ? '收起这棵子树' : '展开下一层子任务' }}</title>
                    <rect :x="node.x + rowWidth(node) / 2 + 1" :y="node.y - MIND_CARD_H / 2 - 2" width="15" height="15" rx="4" fill="#fff" stroke="#6366f1" stroke-width="1.2" />
                    <text :x="node.x + rowWidth(node) / 2 + 8.5" :y="node.y - MIND_CARD_H / 2 + 8" text-anchor="middle" class="life-fold-sign">{{ layout.fold[node.id].open ? '−' : '+' }}</text>
                  </g>
                  <!-- 「不要了」小减号：点一下＝删掉这个节点与它下面的全部任务，并登记进「不要了」清单，
                       之后 AI 更新规划不会再把它自动加回（除非你点名要它，或自己手动新增回来） -->
                  <g v-if="netView === 'mind' && !isBrain(node)" style="cursor:pointer" @click.stop="rejectNode(node)">
                    <title>不要了：删掉这个节点与它下面的任务，之后不再自动加回</title>
                    <rect :x="node.x + rowWidth(node) / 2 + 1" :y="node.y + MIND_CARD_H / 2 - 13" width="15" height="15" rx="4" fill="#fff" stroke="#fca5a5" stroke-width="1.2" />
                    <text :x="node.x + rowWidth(node) / 2 + 8.5" :y="node.y + MIND_CARD_H / 2 - 2.5" text-anchor="middle" style="font-size:12px;fill:#ef4444;pointer-events:none">−</text>
                  </g>
                </g>
              </g>
            </g>
          </svg>

          <!-- 空状态 -->
          <div v-if="!nodes.length && !loading" class="absolute inset-0 flex flex-col items-center justify-center text-center gap-2 pointer-events-none px-8">
            <Network class="w-8 h-8 text-slate-300" />
            <p class="text-sm text-slate-500">规划网络还是空的</p>
            <p class="text-xs text-slate-400 leading-relaxed max-w-md">
              先在左侧和 AI 聊几句，AI 会在后台自动把你的目标拆成节点。也可以点右上角「新增节点」自己先搭一个起点。
            </p>
          </div>

          <!-- 当前视图被过滤空了（例如只勾了短期任务但节点都是远期推演） -->
          <div
            v-if="nodes.length && !visibleNodes.length && !loading"
            class="absolute inset-0 flex flex-col items-center justify-center text-center gap-2 pointer-events-none px-8"
          >
            <Network class="w-8 h-8 text-slate-300" />
            <p class="text-sm text-slate-500">当前视图没有可见节点</p>
            <p class="text-xs text-slate-400 leading-relaxed max-w-md">
              勾选右下角「显示远期推演节点」即可展开远期结局、人际处事等分支。
            </p>
          </div>

          <!-- 更新中：每轮对话结束都会自动更新规划网络，这里给出持续可见的进度提示 -->
          <div
            v-if="updating"
            class="absolute top-3 left-1/2 -translate-x-1/2 px-3 h-8 rounded-full bg-white/92 border border-indigo-100 shadow-sm flex items-center gap-2 z-30"
          >
            <Loader2 class="w-3.5 h-3.5 text-indigo-500 animate-spin" />
            <span class="text-xs text-slate-600">正在更新中：AI 正在把本轮内容同步进规划网络…</span>
          </div>

          <!-- 画布内浮层控制条：远期推演开关 / 放大 / 缩小 / 复位 / 退出全屏，放在画布右下角，
               保证「放大（含浏览器全屏）之后」随时能找到退出与归位的入口 -->
          <div class="absolute right-3 bottom-3 z-30 flex items-center gap-1 rounded-xl border border-slate-200 bg-white/94 px-1.5 py-1 shadow-sm">
            <label class="flex h-7 cursor-pointer items-center gap-1.5 rounded-lg px-1.5 text-[11px] text-slate-500 hover:bg-slate-50 hover:text-slate-700" title="显示远期推演节点：展开远期结局与兜底路线">
              <input type="checkbox" class="accent-indigo-500" :checked="showFuture" @change="toggleFuture($event.target.checked)" />
              远期推演
            </label>
            <div class="w-px h-4 bg-slate-200 mx-0.5"></div>
            <button class="w-7 h-7 rounded-lg text-slate-500 hover:text-slate-800 hover:bg-slate-50 flex items-center justify-center" title="放大" @click="zoomBy(1.2)">
              <ZoomIn class="w-3.5 h-3.5" />
            </button>
            <span class="w-10 text-center text-[10px] tabular-nums text-slate-400">{{ Math.round(view.scale * 100) }}%</span>
            <button class="w-7 h-7 rounded-lg text-slate-500 hover:text-slate-800 hover:bg-slate-50 flex items-center justify-center" title="缩小" @click="zoomBy(1 / 1.2)">
              <ZoomOut class="w-3.5 h-3.5" />
            </button>
            <div class="w-px h-4 bg-slate-200 mx-0.5"></div>
            <button class="w-7 h-7 rounded-lg text-slate-500 hover:text-slate-800 hover:bg-slate-50 flex items-center justify-center" title="复位视图（把整棵树重新放进可视区）" @click="resetView">
              <RotateCcw class="w-3.5 h-3.5" />
            </button>
            <button
              class="w-7 h-7 rounded-lg flex items-center justify-center"
              :class="isFullscreen ? 'text-indigo-600 bg-indigo-50 hover:bg-indigo-100' : 'text-slate-500 hover:text-slate-800 hover:bg-slate-50'"
              :title="isFullscreen ? '退出全屏（Esc）' : '全屏：把整张无限画布铺满浏览器'"
              @click="toggleFullscreen"
            >
              <Minimize2 v-if="isFullscreen" class="w-3.5 h-3.5" />
              <Maximize2 v-else class="w-3.5 h-3.5" />
            </button>
          </div>

          <!-- 选中节点信息 -->
          <div
            v-if="selectedNode"
            class="absolute left-3 bottom-3 right-3 sm:right-auto sm:w-[330px] rounded-xl bg-white/96 border border-slate-100 shadow-lg px-3.5 py-3"
          >
            <div class="flex items-start justify-between gap-2">
              <div class="min-w-0">
                <div class="flex items-center gap-1.5 flex-wrap">
                  <span class="text-sm font-semibold text-slate-700 truncate">{{ selectedNode.title }}</span>
                  <span class="text-[10px] px-1.5 py-0.5 rounded-full" :style="{ color: domainColor(selectedNode.domain), background: domainColor(selectedNode.domain) + '14' }">{{ selectedNode.domain }}</span>
                  <span class="text-[10px] px-1.5 py-0.5 rounded-full" :style="{ color: statusColor(selectedNode.status), background: statusColor(selectedNode.status) + '18' }">{{ statusText(selectedNode.status) }}</span>
                  <span v-if="selectedCarrier" class="text-[10px] px-1.5 py-0.5 rounded-full border" :style="{ color: selectedCarrier.color, borderColor: selectedCarrier.color + '55', background: selectedCarrier.color + '10' }">{{ selectedCarrier.label }}</span>
                  <span v-if="isSharedNode" class="text-[10px] px-1.5 py-0.5 rounded-full bg-amber-50 text-amber-700 border border-amber-200">公共复用</span>
                </div>
                <p v-if="selectedNode.detail" class="mt-1.5 text-xs text-slate-500 leading-relaxed">{{ selectedNode.detail }}</p>
                <p v-else class="mt-1.5 text-xs text-slate-300">暂无细节描述</p>
                <!-- 横向关联：跨赛道联动 / 时间冲突 / 精力冲突，点一下跳到对应节点 -->
                <div v-if="selectedRefs.length" class="mt-2">
                  <p class="text-[10px] text-violet-500 mb-1">横向关联（跨赛道联动 / 时间冲突）</p>
                  <div class="flex flex-wrap gap-1">
                    <button
                      v-for="ref in selectedRefs"
                      :key="ref.id"
                      class="text-[10px] px-1.5 py-0.5 rounded-full border border-violet-200 bg-violet-50 text-violet-700 hover:bg-violet-100"
                      @click="focusRef(ref.id)"
                    >{{ ref.series ? ref.series + ' · ' : '' }}{{ ref.title }}</button>
                  </div>
                </div>
                <!-- 节点载体：按 content_type 渲染对应 UI（表格 / 链接 / 清单 / 进度 / 分支 / 计算 / 文档） -->
                <div v-if="selectedCarrier && selectedCarrier.body" class="mt-2 rounded-lg border border-slate-100 bg-slate-50/60 p-2">
                  <!-- 表格 -->
                  <table v-if="selectedCarrier.type === 'table' && Array.isArray(selectedCarrier.body.head)" class="w-full text-[10.5px] text-slate-600 border-collapse">
                    <thead>
                      <tr class="text-slate-400">
                        <th v-for="(h, i) in selectedCarrier.body.head" :key="i" class="text-left font-medium px-1.5 py-1 border-b border-slate-200">{{ h }}</th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr v-for="(row, ri) in (selectedCarrier.body.rows || [])" :key="ri" class="align-top">
                        <td v-for="(cell, ci) in row" :key="ci" class="px-1.5 py-1 border-b border-slate-100">{{ cell }}</td>
                      </tr>
                    </tbody>
                  </table>
                  <!-- 链接卡片 -->
                  <ul v-else-if="selectedCarrier.type === 'link'" class="space-y-1">
                    <li v-for="(item, i) in (Array.isArray(selectedCarrier.body) ? selectedCarrier.body : [])" :key="i">
                      <a :href="item.href" target="_blank" rel="noopener" class="text-[11px] text-teal-600 hover:underline break-all">{{ item.text || item.href }}</a>
                    </li>
                  </ul>
                  <!-- 打卡勾选清单 -->
                  <ul v-else-if="selectedCarrier.type === 'checklist'" class="space-y-1">
                    <li v-for="(item, i) in (Array.isArray(selectedCarrier.body) ? selectedCarrier.body : [])" :key="i" class="flex items-start gap-1.5 text-[11px] text-slate-600">
                      <span class="mt-0.5 w-3 h-3 rounded border flex-shrink-0" :class="item.done ? 'bg-indigo-500 border-indigo-500' : 'border-slate-300'"></span>
                      <span :class="item.done ? 'line-through text-slate-400' : ''">{{ item.text }}</span>
                    </li>
                  </ul>
                  <!-- 进度快照 -->
                  <div v-else-if="selectedCarrier.type === 'progress'" class="text-[11px] text-slate-600">
                    <div class="flex items-center justify-between mb-1">
                      <span>完成进度</span>
                      <span class="tabular-nums">{{ selectedCarrier.body.done || 0 }} / {{ selectedCarrier.body.total || 0 }}</span>
                    </div>
                    <div class="h-1.5 rounded-full bg-slate-200 overflow-hidden">
                      <div class="h-full rounded-full bg-violet-500" :style="{ width: `${selectedCarrier.body.total ? Math.min(100, Math.round((selectedCarrier.body.done || 0) / selectedCarrier.body.total * 100)) : 0}%` }"></div>
                    </div>
                  </div>
                  <!-- 条件分支 -->
                  <ul v-else-if="selectedCarrier.type === 'branch'" class="space-y-1.5">
                    <li v-for="(item, i) in (Array.isArray(selectedCarrier.body) ? selectedCarrier.body : [])" :key="i" class="text-[11px] text-slate-600 leading-snug">
                      <span class="text-amber-700">{{ item.cond }}</span>
                      <span class="text-slate-400 mx-1">→</span>
                      <span>{{ item.then }}</span>
                    </li>
                  </ul>
                  <!-- 计算公式 -->
                  <div v-else-if="selectedCarrier.type === 'calc'" class="text-[11px] text-slate-600 leading-snug">
                    <span class="text-slate-400">{{ selectedCarrier.body.label }}：</span>
                    <span class="font-mono">{{ selectedCarrier.body.expr }}</span>
                    <template v-if="selectedCarrier.body.result"><span class="text-slate-400 mx-1">=</span><span class="text-pink-600 font-semibold">{{ selectedCarrier.body.result }}</span></template>
                  </div>
                  <!-- 文档模板 -->
                  <div v-else-if="selectedCarrier.type === 'doc'" class="text-[11px] text-slate-600 leading-snug">
                    <p v-if="selectedCarrier.body.title" class="font-semibold text-slate-700">{{ selectedCarrier.body.title }}</p>
                    <p v-if="selectedCarrier.body.body" class="mt-0.5 whitespace-pre-wrap">{{ selectedCarrier.body.body }}</p>
                  </div>
                </div>
                <p v-if="selectedNode.risk" class="mt-1.5 text-xs text-amber-600 leading-relaxed">风险提示：{{ selectedNode.risk }}</p>
                <p v-if="selectedNode.horizon || selectedNode.startDate" class="mt-1 text-[11px] text-slate-400">
                  开始日期：{{ selectedNode.startDate || '未设置（按创建日期起算）' }} → 截止日期：{{ selectedNode.horizon || '—' }}
                </p>
              </div>
              <button class="w-7 h-7 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-50 flex items-center justify-center flex-shrink-0" @click="selectedId = ''"><X class="w-3.5 h-3.5" /></button>
            </div>
            <div class="mt-2.5 flex items-center gap-2">
              <button class="px-3 h-8 rounded-lg bg-slate-900 text-white text-xs font-medium hover:opacity-90 transition-opacity flex items-center gap-1.5" @click="openEditNode(selectedNode)">
                <Pencil class="w-3.5 h-3.5" /> 编辑
              </button>
              <span class="text-[11px] text-slate-400">{{ selectedNode.source === 'user' ? '手动创建' : 'AI 生成' }}</span>
            </div>
          </div>

          </div>
        </div>

        <!-- 结构化模块面板：模块2/3/15/16/17/18/19，均落库并可交互 -->
        <div v-if="activeTab !== 'network'" class="flex-1 min-h-0 overflow-y-auto bg-slate-50/40 p-3">
          <LifeTreeView
            v-if="activeTab === 'tree'"
            :nodes="nodes"
            :daily-tasks="dailyTasksForTree"
            :refresh-token="panelToken"
          />
          <LifeDailyTasks v-else-if="activeTab === 'tasks'" :refresh-token="panelToken" @changed="onPanelChanged" />
          <LifeReminders v-else-if="activeTab === 'reminders'" :refresh-token="panelToken" />
          <LifeSnapshots v-else-if="activeTab === 'snapshots'" :refresh-token="panelToken" @changed="onPanelChanged" />
          <LifeEnergy v-else-if="activeTab === 'energy'" :refresh-token="panelToken" @changed="onPanelChanged" />
          <LifeSkills v-else-if="activeTab === 'skills'" :refresh-token="panelToken" @changed="onPanelChanged" />
          <LifeCalendar v-else-if="activeTab === 'calendar'" :refresh-token="panelToken" @changed="onPanelChanged" />
          <LifeKnowledge v-else-if="activeTab === 'knowledge'" :refresh-token="panelToken" @changed="onPanelChanged" />
          <LifeChangeLog v-else-if="activeTab === 'changes'" :refresh-token="panelToken" @changed="onPanelChanged" />
          <LifeRetrievalApproval v-else-if="activeTab === 'retrieval'" :refresh-token="panelToken" />
        </div>
      </div>
    </div>

    <!-- 悬浮浮层：网络节点与任务表格单元格共用，展示完整名称、期限、优先级与详情 -->
    <Teleport to="body">
      <div
        v-if="hoverTip.visible"
        class="pointer-events-none fixed z-[130] w-[300px] rounded-xl border border-slate-200 bg-white p-2.5 shadow-xl shadow-slate-900/10"
        :class="hoverTip.below ? '' : '-translate-y-full'"
        :style="{ left: hoverTip.left, top: hoverTip.top }"
      >
        <p v-if="hoverTip.title" class="text-[12px] font-semibold leading-snug text-slate-700">{{ hoverTip.title }}</p>
        <div v-if="hoverTip.meta.length" class="mt-1 flex flex-wrap items-center gap-1">
          <span
            v-for="(item, index) in hoverTip.meta"
            :key="index"
            class="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] text-slate-500"
          >{{ item }}</span>
        </div>
        <!-- 节点固定五行：标签在左、内容在右，长文本自动换行 -->
        <div v-if="hoverTip.rows.length" class="mt-0.5 space-y-1">
          <div v-for="row in hoverTip.rows" :key="row.label" class="flex items-start gap-2 text-[11px] leading-relaxed">
            <span class="w-[52px] flex-shrink-0 text-slate-400">{{ row.label }}</span>
            <span class="min-w-0 flex-1 whitespace-pre-wrap text-slate-600">{{ row.value }}</span>
          </div>
        </div>
        <p v-if="hoverTip.body" class="mt-1.5 whitespace-pre-wrap text-[11px] leading-relaxed text-slate-500">{{ hoverTip.body }}</p>
      </div>
    </Teleport>

    <!-- 悬浮节点时的「前往下一个节点」浮层：有子节点才出现，一个子节点就是一个按钮，多个列成清单自己挑；
         鼠标从节点挪到浮层上时不能立刻消失（延迟收起 + 移入取消），否则来不及点 -->
    <Teleport to="body">
      <div
        v-if="nodeJump.visible"
        class="fixed z-[131] w-[236px] rounded-xl border border-slate-200 bg-white p-1.5 shadow-xl shadow-slate-900/10"
        :class="nodeJump.below ? '' : '-translate-y-full'"
        :style="{ left: nodeJump.left, top: nodeJump.top }"
        @mouseenter="clearJumpHide"
        @mouseleave="nodeJump.visible = false"
        @pointerdown.stop
      >
        <p class="px-2 py-1 text-[10px] font-semibold text-slate-400">
          前往下一个节点<i v-if="nodeJump.items.length > 1" class="not-italic text-slate-300">（{{ nodeJump.items.length }} 个分支，挑一个）</i>
        </p>
        <button
          v-for="item in nodeJump.items"
          :key="item.id"
          class="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left transition-colors hover:bg-indigo-50"
          @click="jumpToChild(item.id)"
        >
          <span class="h-1.5 w-1.5 flex-shrink-0 rounded-full bg-indigo-400"></span>
          <span class="min-w-0 flex-1 truncate text-[11.5px] leading-snug text-slate-600">{{ item.title }}</span>
          <span v-if="item.meta" class="flex-shrink-0 text-[10px] tabular-nums text-slate-400">{{ item.meta }}</span>
          <ChevronRight class="h-3.5 w-3.5 flex-shrink-0 text-slate-300" />
        </button>
      </div>
    </Teleport>

    <!-- 模型下拉：Teleport 到 body 并向上展开，避免被卡片 overflow-hidden 裁剪 -->
    <Teleport to="body">
      <transition name="life-menu">
        <div
          v-if="modelMenuOpen"
          ref="modelMenuRef"
          class="fixed z-[120] overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xl shadow-slate-900/10"
          :style="modelMenuStyle"
        >
          <div class="border-b border-slate-100 px-3 py-2 text-[11px] text-slate-400">选择对话模型</div>
          <div class="life-menu-scroll max-h-[280px] overflow-y-auto py-1">
            <template v-for="group in modelGroups" :key="group.id">
              <div class="flex items-center gap-1.5 px-3 pb-1 pt-2 text-[10px] font-semibold text-slate-400">
                <span class="h-1.5 w-1.5 rounded-full" :style="{ background: groupColor(group.id) }"></span>
                {{ group.name }}
              </div>
              <button
                v-for="model in group.models"
                :key="model"
                type="button"
                class="flex w-full items-center gap-2 px-3 py-1.5 text-left text-[12px] transition-colors"
                :class="model === activeModel ? 'bg-indigo-50 font-medium text-indigo-600' : 'text-slate-600 hover:bg-slate-50'"
                @click="selectModel(model)"
              >
                <span class="flex-1 truncate">{{ model }}</span>
                <Check v-if="model === activeModel" class="w-3.5 h-3.5 flex-shrink-0" />
              </button>
            </template>
            <p v-if="!modelGroups.length" class="px-3 py-3 text-[11px] text-slate-400">暂无可用模型，请先在设置里接入</p>
          </div>
        </div>
      </transition>
    </Teleport>

    <!-- 节点编辑弹窗 -->
    <div v-if="editing" class="fixed inset-0 z-[100] flex items-center justify-center" @keydown.esc="closeEdit" @keydown.ctrl.enter.prevent="saveNode" tabindex="-1" ref="dialogRef">
      <div class="absolute inset-0 bg-slate-900/40 backdrop-blur-sm"></div>
      <div class="relative w-[820px] max-w-[94vw] max-h-[90vh] bg-white rounded-2xl shadow-2xl flex flex-col overflow-hidden">
        <div class="flex items-center justify-between px-6 py-4 border-b border-slate-100 flex-shrink-0">
          <div>
            <h3 class="text-base font-bold text-slate-700">{{ editing.id ? '编辑规划节点' : '新增规划节点' }}</h3>
            <p class="text-xs text-slate-400 mt-0.5">节点越具体、时间刻度越明确，规划网络越有指导意义</p>
          </div>
          <button class="w-8 h-8 rounded-lg text-slate-400 hover:bg-slate-100 flex items-center justify-center transition-colors" @click="closeEdit"><X class="w-4 h-4" /></button>
        </div>

        <div class="flex-1 min-h-0 grid grid-cols-1 md:grid-cols-[minmax(0,1fr)_240px] overflow-hidden">
          <!-- 左：主要内容 -->
          <div class="overflow-y-auto overscroll-contain px-6 py-5 space-y-4">
            <div>
              <label class="block text-xs font-medium text-slate-500 mb-1.5">标题</label>
              <input
                v-model="form.title"
                class="w-full h-10 rounded-lg border border-slate-200 px-3 text-sm text-slate-700 outline-none transition-colors focus:border-indigo-300 focus:ring-2 focus:ring-indigo-50"
                placeholder="例如：考公上岸 / 三年内转行做数据分析"
              />
            </div>

            <div class="grid grid-cols-2 gap-3">
              <div>
                <label class="block text-xs font-medium text-slate-500 mb-1.5">领域</label>
                <select v-model="form.domain" class="w-full h-10 rounded-lg border border-slate-200 px-2.5 text-sm text-slate-700 outline-none focus:border-indigo-300">
                  <option v-for="d in LIFE_DOMAINS" :key="d" :value="d">{{ d }}</option>
                </select>
              </div>
              <div>
                <label class="block text-xs font-medium text-slate-500 mb-1.5">类型</label>
                <select v-model="form.kind" class="w-full h-10 rounded-lg border border-slate-200 px-2.5 text-sm text-slate-700 outline-none focus:border-indigo-300">
                  <option v-for="k in kindOptions" :key="k.value" :value="k.value">{{ k.label }}</option>
                </select>
              </div>
            </div>

            <div class="grid grid-cols-2 gap-3">
              <div>
                <label class="block text-xs font-medium text-slate-500 mb-1.5">状态</label>
                <select v-model="form.status" class="w-full h-10 rounded-lg border border-slate-200 px-2.5 text-sm text-slate-700 outline-none focus:border-indigo-300">
                  <option value="todo">待开始</option>
                  <option value="doing">进行中</option>
                  <option value="done">已完成</option>
                </select>
              </div>
              <div>
                <label class="block text-xs font-medium text-slate-500 mb-1.5">截止日期</label>
                <input
                  v-model="form.horizon"
                  class="w-full h-10 rounded-lg border border-slate-200 px-3 text-sm text-slate-700 outline-none focus:border-indigo-300 focus:ring-2 focus:ring-indigo-50"
                  placeholder="2026-12-12 或 1年内 / 5年后"
                />
              </div>
            </div>

            <div>
              <label class="block text-xs font-medium text-slate-500 mb-1.5">开始日期（可留空；留空时按创建日期起算）</label>
              <input
                v-model="form.startDate"
                class="w-full h-10 rounded-lg border border-slate-200 px-3 text-sm text-slate-700 outline-none focus:border-indigo-300 focus:ring-2 focus:ring-indigo-50"
                placeholder="2026-09-01"
              />
            </div>

            <div>
              <label class="block text-xs font-medium text-slate-500 mb-1.5">归属节点</label>
              <select v-model="form.parentId" class="w-full h-10 rounded-lg border border-slate-200 px-2.5 text-sm text-slate-700 outline-none focus:border-indigo-300">
                <option value="">挂到「大脑」（本人）下面</option>
                <option v-for="n in parentOptions" :key="n.id" :value="n.id">{{ n.title }}</option>
              </select>
            </div>

            <div>
              <div class="flex items-center justify-between mb-1.5">
                <label class="text-xs font-medium text-slate-500">优先级（重要程度）</label>
                <span class="text-xs text-slate-400">{{ form.weight }}</span>
              </div>
              <input v-model.number="form.weight" type="range" min="1" max="100" class="w-full accent-indigo-500" />
              <p class="mt-1 text-[11px] text-slate-400">对应任务表优先级：70 及以上为高、40~69 为中、其余为低；节点尺寸已统一，不再随数值变化</p>
            </div>

            <div>
              <label class="block text-xs font-medium text-slate-500 mb-1.5">方法与交付（操作方法 / 验收标准 / 资源链接）</label>
              <textarea
                v-model="form.detail"
                rows="5"
                class="w-full resize-none rounded-lg border border-slate-200 px-3 py-2.5 text-sm leading-relaxed text-slate-700 outline-none transition-colors focus:border-indigo-300 focus:ring-2 focus:ring-indigo-50"
                placeholder="方法：一步一步怎么做；验收：做到什么程度算完成；资源：网站 / 文档 / 工具链接"
              ></textarea>
            </div>

            <div>
              <label class="block text-xs font-medium text-slate-500 mb-1.5">风险提示</label>
              <input
                v-model="form.risk"
                class="w-full h-10 rounded-lg border border-slate-200 px-3 text-sm text-slate-700 outline-none transition-colors focus:border-indigo-300 focus:ring-2 focus:ring-indigo-50"
                placeholder="容易踩的坑，例如：多目标并行导致伪勤奋"
              />
            </div>

            <div>
              <label class="block text-xs font-medium text-slate-500 mb-1.5">完成情况（任务只做了一部分时填这里）</label>
              <textarea
                v-model="form.progressNote"
                rows="3"
                class="w-full resize-none rounded-lg border border-slate-200 px-3 py-2.5 text-sm leading-relaxed text-slate-700 outline-none transition-colors focus:border-indigo-300 focus:ring-2 focus:ring-indigo-50"
                placeholder="写清哪些做完了、哪些还没做，例如：真题已下载；听力只听了 1 套。保存后会折算进「大脑」的执行力"
              ></textarea>
            </div>
          </div>

          <!-- 右：操作区 -->
          <div class="border-t md:border-t-0 md:border-l border-slate-100 px-5 py-5 flex flex-col gap-3 bg-slate-50/60">
            <button
              class="w-full h-10 rounded-lg bg-gradient-to-r from-indigo-500 to-blue-500 text-white text-sm font-medium shadow-sm hover:opacity-90 transition-opacity disabled:opacity-45 disabled:cursor-not-allowed flex items-center justify-center gap-1.5"
              :disabled="saving"
              title="保存（也可按 Ctrl + Enter）"
              @click="saveNode"
            >
              <Loader2 v-if="saving" class="w-3.5 h-3.5 animate-spin" />
              <Check v-else class="w-3.5 h-3.5" /> 保存
            </button>
            <button
              class="w-full h-10 rounded-lg bg-white border border-slate-200 text-slate-600 text-sm font-medium hover:border-slate-300 transition-colors"
              @click="closeEdit"
            >取消</button>

            <div class="mt-auto pt-4 border-t border-slate-200">
              <template v-if="editing.id">
                <button
                  v-if="!confirmDelete"
                  class="w-full h-9 rounded-lg border border-rose-200 text-rose-500 text-xs font-medium hover:bg-rose-50 transition-colors flex items-center justify-center gap-1.5"
                  @click="confirmDelete = true"
                >
                  <Trash2 class="w-3.5 h-3.5" /> 删除此节点
                </button>
                <button
                  v-else
                  class="w-full h-9 rounded-lg bg-rose-500 text-white text-xs font-medium hover:bg-rose-600 transition-colors"
                  :disabled="saving"
                  @click="deleteNode"
                >再次点击确认删除</button>
                <p class="mt-2 text-[11px] text-slate-400 leading-relaxed">
                  {{ editing.source === 'user' ? '手动创建的节点，AI 不会自动删除它。' : 'AI 生成的节点，删除后可能在后续对话中重新出现。' }}
                </p>
              </template>
              <p v-else class="text-[11px] text-slate-400 leading-relaxed">保存后立即出现在右侧规划网络中。</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  </section>
</template>

<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue'
import {
  AlertTriangle, Award, BatteryCharging, BellRing, BookOpen, Brain, CalendarDays, Check, ChevronDown, ChevronRight, Copy,
  CornerUpLeft, Cpu, Eraser, GitBranch, Globe, History, Inbox, ListChecks, Loader2, Maximize2, MessageSquare, Minimize2,
  Network, Pencil, Plus, RefreshCw, RotateCcw, Search, Send, Sparkles, Trash2, TrendingUp, X, ZoomIn, ZoomOut
} from 'lucide-vue-next'
import { aiSettingsApi, lifeApi, syncChannel } from '../utils/api'
import { buildModelGroups, buildModelOptions } from '../utils/aiModels'
import { toast } from '../utils/toast'
import LifeDailyTasks from './lifeplan/LifeDailyTasks.vue'
import LifeReminders from './lifeplan/LifeReminders.vue'
import LifeSnapshots from './lifeplan/LifeSnapshots.vue'
import LifeEnergy from './lifeplan/LifeEnergy.vue'
import LifeSkills from './lifeplan/LifeSkills.vue'
import LifeCalendar from './lifeplan/LifeCalendar.vue'
import LifeKnowledge from './lifeplan/LifeKnowledge.vue'
import LifeChangeLog from './lifeplan/LifeChangeLog.vue'
import LifeRetrievalApproval from './lifeplan/LifeRetrievalApproval.vue'
import LifeTreeView from './lifeplan/LifeTreeView.vue'
import LifePersona from './lifeplan/LifePersona.vue'

const LIFE_DOMAINS = ['学业', '职业', '财务', '健康', '家庭', '成长']
const DOMAIN_COLORS = {
  学业: '#6366f1',
  职业: '#0ea5e9',
  财务: '#10b981',
  健康: '#f43f5e',
  家庭: '#f59e0b',
  成长: '#8b5cf6'
}
const STATUS_COLORS = { todo: '#cbd5e1', doing: '#f59e0b', done: '#10b981', drop: '#94a3b8' }
const STATUS_TEXT = { todo: '待开始', doing: '进行中', done: '已完成', drop: '已剪枝' }
const KIND_TEXT = [
  { value: 'goal', label: '目标' },
  { value: 'action', label: '行动' },
  { value: 'milestone', label: '里程碑' },
  { value: 'domain', label: '领域' },
  { value: 'self', label: '中心画像' }
]
const CANVAS = { w: 1000, h: 720, cx: 500, cy: 360 }
// 画布改为「横向时间轴 + 系列条带」：X 轴是从早到晚的时间，一条横带 = 一条 series 主线
const AXIS_Y = 20
const BAND_TOP = 40
const BAND_X = 24
const BAND_W = 952
const TITLE_X = 40
const BAND_LEFT = 210
const BAND_RIGHT = 958
const NODE_GAP = 96
// 条带容器自适应：节点多时按泳道分行排布，条带盒子随之加高（盒子随内容变多自动变大）
const BAND_HEAD = 54
const LANE_H = 60
const LANE_GAP = 108
// 条带底色轮转（低饱和，只用来区分是哪一条系列）
const SERIES_TINTS = ['#f8fafc', '#fefce8', '#f0fdf4', '#eff6ff']
// 节点圆圈颜色统一表示优先级：P0 红 / P1 黄 / P2 绿 / 里程碑 蓝
const PRIORITY_COLORS = { P0: '#ef4444', P1: '#f59e0b', P2: '#22c55e', P3: '#94a3b8' }
const MILESTONE_COLOR = '#3b82f6'
const kindOptions = KIND_TEXT
const messages = ref([])
const nodes = ref([])
const draft = ref('')
const draftRef = ref(null)
const sending = ref(false)
const updating = ref(false)
const regenerating = ref(false)
const loading = ref(true)
const selectedId = ref('')
// 「下一个节点」的游标：记住上一次定位到哪个节点，下次从它的下一个开始，避免每次都从头找
const focusCursor = ref('')
// 全屏：把承载无限画布的那一块容器整体铺满浏览器，看得更多
const canvasWrap = ref(null)
const isFullscreen = ref(false)
const hoverId = ref('')
// 右侧面板标签：规划网络 + 7 个结构化模块
const activeTab = ref('network')
// 左栏分页：与 AI 对话 / 人物画像（用户模型）。切到画像时左栏放宽，保证画像与路径卡片看得清
const leftTab = ref('chat')
const LEFT_TABS = [
  { id: 'chat', label: '与 AI 对话', icon: MessageSquare },
  { id: 'persona', label: '人物画像', icon: Brain }
]
// 输出详略由后端按对话上下文自动判定，前端不再暴露模式开关
// 面板刷新令牌：切换标签页或收到跨标签页同步事件时递增，让面板重新拉数据
const panelToken = ref(0)
const alerts = ref([])
// 规划网络只保留思维导图视图（其余条带视图已下线）
const netView = ref('mind')
// 视图切换时终止绘制动画：其它视图不做「一层层长出来」，免得节点被动画挡住
watch(netView, () => { cancelAnimationFrame(drawRafId); drawCursor.value = null })
const focusSeries = ref('')
// 是否显示远期推演节点（默认选中：长期推演分支与远期里程碑一并呈现）
const showFuture = ref(true)
// 思维导图视图的折叠状态：默认整棵树全部展开（collapsedIds 为空），点节点右侧 + / − 收起或展开子树
const collapsedIds = ref(new Set())
// 每日任务快照：供【人生推演】树图判断上游任务是否已具备
const treeTasks = ref([])
// 节点与表格单元格共用的悬浮浮层：展示完整信息，解决「节点标题太短看不懂」
const hoverTip = reactive({ visible: false, below: false, left: '0px', top: '0px', title: '', meta: [], rows: [], body: '' })
// 节点悬浮时的「前往下一个节点」跳转浮层：节点有子节点才出现；只有一个子节点就是一个按钮，
// 多个子节点就列成清单让用户自己挑要跳哪一个
const nodeJump = reactive({ visible: false, below: true, left: '0px', top: '0px', items: [] })
// 鼠标从节点移到浮层上需要一点时间，所以收起不是立刻执行，而是延迟一下（移进浮层就取消）
let jumpHideTimer = null

// ===== 节点悬浮 → 「前往下一个节点」 =====
// 这段必须放在 onNodeEnter / onNodeLeave 之前：模板里的悬浮浮层和这两个事件处理器都会直接引用它们，
// 提前定义才能保证不管编译器怎么处理绑定，作用域里都找得到
// 父节点 → 它的直接子节点（只取当前画布上真的画出来的那些：折叠起来的子树不在 visibleNodes 里，
// 自然也不会出现在跳转清单里）
const jumpChildren = computed(() => {
  const map = new Map()
  for (const node of visibleNodes.value) {
    const pid = node.parentId ? String(node.parentId) : ''
    if (!pid) continue
    if (!map.has(pid)) map.set(pid, [])
    map.get(pid).push(node)
  }
  return map
})

function clearJumpHide() {
  if (jumpHideTimer) { clearTimeout(jumpHideTimer); jumpHideTimer = null }
}
// 收起浮层延迟一下：给鼠标留出从节点挪到浮层上的时间，移过去就取消收起
function scheduleJumpHide() {
  clearJumpHide()
  jumpHideTimer = setTimeout(() => { nodeJump.visible = false; jumpHideTimer = null }, 220)
}

// 悬浮节点：有子节点就在节点旁弹出跳转浮层（一个子节点＝一个按钮，多个＝清单）
function showNodeJump(event, node) {
  clearJumpHide()
  const kids = jumpChildren.value.get(String(node.id)) || []
  if (!kids.length) { nodeJump.visible = false; return }
  const el = event?.currentTarget
  if (!el) return
  const rect = el.getBoundingClientRect()
  const width = 236
  const left = Math.min(Math.max(8, rect.left + rect.width / 2 - width / 2), Math.max(8, window.innerWidth - width - 8))
  // 悬浮信息浮层按「节点是否贴近屏幕顶部 (rect.top < 150)」决定弹上还是弹下，跳转浮层必须躲到它对面，
  // 否则两块浮层会叠在一起盖住彼此
  const tipBelow = rect.top < 150
  let below = !tipBelow && rect.bottom + 12 + Math.min(4, kids.length) * 30 < window.innerHeight
  let top = below ? rect.bottom + 8 : rect.top - 8
  // 节点就贴在屏幕最顶上时上方没有空间，只能让到下方、并额外下移避开悬浮信息浮层
  if (tipBelow && rect.top < 160) { below = true; top = rect.bottom + 168 }
  nodeJump.items = kids.map(kid => ({
    id: String(kid.id),
    title: kid.title || '未命名节点',
    meta: kid.horizon || kid.startDate || ''
  }))
  nodeJump.left = `${Math.round(left)}px`
  nodeJump.top = `${Math.round(top)}px`
  nodeJump.below = below
  nodeJump.visible = true
}

// 跳到选中的那个子节点：复用「下一个节点」的居中 + 选中逻辑，并把全局游标也挪过去，
// 这样之后点顶部「下一个节点」就是从这一支继续往下看
function jumpToChild(id) {
  const target = visibleNodes.value.find(node => String(node.id) === String(id))
  if (!target) return
  focusCursor.value = String(target.id)
  selectedId.value = String(target.id)
  centerOnNode(target)
  viewTouched = true
  nodeJump.visible = false
  clearJumpHide()
}

// 右侧标签栏：规划网络 + 短期时间线 + 7 个结构化模块面板
const TABS = [
  { id: 'network', label: '规划网络', icon: Network },
  { id: 'tree', label: '人生推演', icon: GitBranch },
  { id: 'tasks', label: '每日任务', icon: ListChecks },
  { id: 'reminders', label: '提醒汇总', icon: BellRing },
  { id: 'snapshots', label: '进度快照', icon: TrendingUp },
  { id: 'energy', label: '精力负荷', icon: BatteryCharging },
  { id: 'skills', label: '个人档案', icon: Award },
  { id: 'calendar', label: '外部事件', icon: CalendarDays },
  { id: 'knowledge', label: '知识库', icon: BookOpen },
  { id: 'changes', label: '变更日志', icon: History },
  { id: 'retrieval', label: '检索审批', icon: Inbox }
]

function switchTab(id) {
  if (activeTab.value === id) return
  activeTab.value = id
  // 递增令牌让面板重新拉最新数据（面板修改与 AI 同步都可能发生在切换之间）
  if (id !== 'network') panelToken.value += 1
}

function toggleFuture(checked) {
  showFuture.value = Boolean(checked)
}

// 思维导图：点节点展开/收起其子树（只在思维导图视图生效），Set 整体替换以触发响应式重算
function toggleFold(id) {
  if (netView.value !== 'mind' || !id) return
  const next = new Set(collapsedIds.value)
  if (next.has(id)) next.delete(id)
  else next.add(id)
  collapsedIds.value = next
}

// 一键展开：清空「已收起」集合，整棵树恢复到全部展开的状态
function expandAll() {
  collapsedIds.value = new Set()
}

// 任务状态写库：写完重新拉节点（依赖它的后续节点自动解锁 / 重新锁定），同时刷新每日任务面板
async function setTaskStatus(node, status) {
  if (!node || node.kind !== 'action' || node.status === status) return false
  try {
    await lifeApi.updateNode(node.id, { status })
    await refreshNodesAndTasks()
    panelToken.value += 1
    return true
  } catch (error) {
    toast(error?.response?.data?.error || '任务状态更新失败', 'error')
    return false
  }
}
// 勾选完成 / 取消完成
async function toggleTaskDone(node) {
  if (isLockedNode(node)) {
    toast('前置任务还没完成，先完成前置任务才能勾选', 'error')
    return
  }
  const done = node.status === 'done'
  const next = done ? 'todo' : 'done'
  if (await setTaskStatus(node, next)) toast(done ? '已取消完成' : '已完成，后续任务解锁', 'success')
}
// 放弃 / 取消放弃
async function toggleTaskDrop(node) {
  const dropped = node.status === 'drop'
  const next = dropped ? 'todo' : 'drop'
  if (await setTaskStatus(node, next)) toast(dropped ? '已恢复该任务' : '已放弃该任务', 'success')
}

// 思维导图里点带子树的节点＝展开/收起；叶子节点则用于选中查看详情
function onNodeClick(node) {
  // 单击只负责选中（详情面板会给出「编辑」入口），不再顺手收起子树：
  //   之前单击带子树的节点会直接折叠，双击想编辑时先被折叠吞掉，看着就像「点一下就没了、找不到编辑入口」。
  //   折叠/展开只由节点右上角的 +/− 按钮负责。
  if (!node) return
  selectedId.value = String(node.id)
}

// 点条带标题：在「聚焦单系列」与其他视图之间切换
function focusBand(key) {
  if (netView.value === 'focus' && focusSeries.value === key) {
    netView.value = 'main'
    focusSeries.value = ''
    return
  }
  netView.value = 'focus'
  focusSeries.value = key
}

async function loadAlerts() {
  try {
    const [data, taskData] = await Promise.all([
      lifeApi.getAlerts(),
      lifeApi.getTasks({ from: lifeShiftToday(-7), to: lifeShiftToday(30) }).catch(() => ({ tasks: [] }))
    ])
    alerts.value = data.alerts || []
    treeTasks.value = taskData.tasks || []
  } catch (_) {
    alerts.value = []
  }
}

// 【人生推演】树图需要的「前置任务是否已具备」数据源
const dailyTasksForTree = computed(() => treeTasks.value)

// 跨标签页同步：其他标签页写库后刷新面板与重点提醒
function onExternalChange() {
  panelToken.value += 1
  loadAlerts()
}

// 面板写库成功后：刷新提醒区、各面板与画布/树图数据
async function onPanelChanged() {
  panelToken.value += 1
  loadAlerts()
  await refreshNodesAndTasks()
}

// 本地日期偏移，用于拉取前后各若干天的每日任务
function lifeShiftToday(days) {
  const d = new Date()
  d.setDate(d.getDate() + days)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

// 浮层里只需要「高/中/低」，和任务表优先级列对应
function priorityText(weight) {
  const value = Number(weight)
  if (!Number.isFinite(value)) return ''
  if (value >= 70) return '高'
  if (value >= 40) return '中'
  return '低'
}

// 统一在元素正上方弹出；贴近屏幕顶部时翻转到下方
function showTip(event, payload) {
  const el = event?.currentTarget
  if (!el) return
  const rect = el.getBoundingClientRect()
  const width = 300
  const left = Math.min(Math.max(8, rect.left + rect.width / 2 - width / 2), Math.max(8, window.innerWidth - width - 8))
  const below = rect.top < 150
  hoverTip.left = `${Math.round(left)}px`
  hoverTip.top = `${Math.round(below ? rect.bottom + 8 : rect.top - 8)}px`
  hoverTip.below = below
  hoverTip.title = payload.title || ''
  hoverTip.meta = payload.meta || []
  hoverTip.rows = payload.rows || []
  hoverTip.body = payload.body || ''
  hoverTip.visible = true
}

function hideTip() {
  hoverTip.visible = false
}

// 节点悬浮固定五行：任务 / 截止时间 / 优先级 / 方法与交付 / 风险提示，与任务表列一一对应
function onNodeEnter(event, node) {
  hoverId.value = node.id
  const rows = [
    { label: '任务', value: node.title || '—' },
    { label: '开始日期', value: node.startDate || '未设置（按创建日期起算）' },
    { label: '截止日期', value: node.horizon || '—' },
    { label: '优先级', value: priorityText(node.weight) || '—' },
    { label: '方法与交付', value: node.detail || '—' },
    { label: '风险提示', value: node.risk || '—' }
  ]
  // 部分完成：只做了一部分的任务，把「哪些做完了、哪些没做」也显示出来
  if (node.progressNote) rows.push({ label: '完成情况', value: node.progressNote })
  showTip(event, { rows })
  showNodeJump(event, node)
}

function onNodeLeave() {
  hoverId.value = ''
  hideTip()
  scheduleJumpHide()
}

// 单元格文字较长时才弹浮层，短内容不打扰
function onCellEnter(event, column) {
  const el = event?.currentTarget
  const text = String(el?.textContent || '').trim()
  if (text.length <= 20) return
  const body = el.querySelector('span')?.textContent?.trim() || text
  showTip(event, { title: column || '', meta: [], body })
}
const modelOptions = ref([])
const modelGroups = ref([])
const activeModel = ref('')
const modelMenuOpen = ref(false)
const confirmDelete = ref(false)
const saving = ref(false)
const editing = ref(null)
// startDate＝开始日期，horizon＝截止日期，两者分开存、可各自修改
const form = reactive({ title: '', detail: '', risk: '', domain: '成长', kind: 'goal', status: 'todo', startDate: '', horizon: '', parentId: '', weight: 50, progressNote: '' })

const chatListRef = ref(null)
const svgRef = ref(null)
const dialogRef = ref(null)
const gridRef = ref(null)
const modelBtnRef = ref(null)
const modelMenuRef = ref(null)
const gridHeight = ref(0)
const view = reactive({ scale: 1, tx: 0, ty: 0 })
// 拖拽平移过程中给光标「抓手」反馈，让拖拽有可感知的手感
const panning = ref(false)
// 缩放下限/上限：允许一直缩到看清全貌、也允许放到很大看清文字
const MIN_SCALE = 0.05
const MAX_SCALE = 6
// 模型下拉采用固定定位向上展开，避免被卡片 overflow-hidden 裁掉
const modelMenuStyle = reactive({ left: '0px', bottom: '0px', width: '260px' })

// 底部呼吸留白（含 #boardContent 的 pb-4）
const GRID_BOTTOM_RESERVE = 24
const gridStyle = computed(() => (gridHeight.value ? { height: `${gridHeight.value}px` } : null))

const busy = computed(() => sending.value || updating.value)
const doneCount = computed(() => nodes.value.filter(n => n.status === 'done').length)
const selectedNode = computed(() => nodes.value.find(n => n.id === selectedId.value) || null)
const parentOptions = computed(() =>
  nodes.value
    .filter(n => n.id !== editing.value?.id && n.kind !== 'self')
    .map(n => ({ id: n.id, title: n.title }))
    .slice(0, 60)
)

function domainColor(domain) {
  return DOMAIN_COLORS[domain] || '#64748b'
}
function statusColor(status) {
  return STATUS_COLORS[status] || STATUS_COLORS.todo
}
function statusText(status) {
  return STATUS_TEXT[status] || STATUS_TEXT.todo
}
// 节点内容载体：AI 按内容自动匹配 content_type，前端据此渲染对应载体 UI
// 画布上给一个小徽标，完整载体在右下角详情面板渲染
const CARRIER_META = {
  text: { label: '文本', color: '#64748b' },
  table: { label: '表格', color: '#0284c7' },
  link: { label: '链接', color: '#0d9488' },
  checklist: { label: '清单', color: '#6366f1' },
  progress: { label: '进度', color: '#8b5cf6' },
  branch: { label: '分支', color: '#d97706' },
  calc: { label: '计算', color: '#db2777' },
  doc: { label: '文档', color: '#0f766e' }
}
function carrierOf(node) {
  const type = String(node?.contentType || '').toLowerCase()
  return CARRIER_META[type] ? type : ''
}
function carrierLabel(node) {
  return CARRIER_META[carrierOf(node)]?.label || ''
}
function carrierColor(node) {
  return CARRIER_META[carrierOf(node)]?.color || '#94a3b8'
}
// 任务类节点（kind=action）：思维导图里渲染成表格行（复选框 + 任务名 + 截止时间 + 资料入口），
// 而不是普通小卡片 —— 一行一件事，同一日期列对齐，看起来就是一张任务表
function isTaskRow(node) {
  return netView.value === 'mind' && node?.kind === 'action' && !node?.synthetic
}
// 文字像素宽度的粗略估算：中文按 12px、半角按 7px（卡片字号 12px），用来算任务行要多宽
function textWidthOf(str) {
  let w = 0
  for (const ch of String(str || '')) w += /[\u4e00-\u9fff\u3000-\u303f\uff00-\uffef]/.test(ch) ? 12 : 7
  return w
}
// 任务行时间列宽度：要装得下「截止 10-24」「建立 10-16」「近期」这类带前缀的标签
const TASK_TIME_W = 92
// 任务行的固定占用：勾选/放弃区 55 + 时间列 + 右内边距 10（资料列宽度单独加）
const TASK_ROW_FIXED = 55 + TASK_TIME_W + 10
// 资料入口的宽度：标签写「这是什么资料」，短则保底 66，长了截断到 300
const LINK_W_MIN = 66
const LINK_W_MAX = 300
// 资料标签最多能显示多少字：按列宽上限反算，避免明明还有位置却把用途说明截掉
const LINK_LABEL_MAX = Math.floor((LINK_W_MAX - 14) / 12)
// 任务行宽度＝任务名宽度 + 固定占用 + 资料列宽度（下限 320、上限 640 防止超长标题把画布撑爆）
function taskRowWidth(node) {
  return Math.min(MIND_TASK_MAX_W, Math.max(MIND_TASK_W, TASK_ROW_FIXED + textWidthOf(node?.title) + linkWidthOf(node)))
}
// 资料入口标签＝「这个资料是干嘛的」（刷题网站 / 视频课程 / 官方报名入口…），不是把网址直接展示出来。
// 网址通过悬浮 tooltip 与点击打开，标签只负责说清用途
const LINK_RULES = [
  [/fenbi|huatu|offcn|zhgwy|gwy|zhenti|exam|kaoshi|tiku|51test|juzi|examcoo|gongkao|chsi|neea|ncre|pta/i, '刷题/真题网站'],
  [/leetcode|nowcoder|lintcode|hackerrank|codewars|codeforces|luogu|acwing|牛客|力扣/i, '编程刷题'],
  [/icourse163|mooc|coursera|udemy|khanacademy|xuetangx|study\.163|bilibili|youtube|imooc|jikexueyuan/i, '视频课程'],
  [/runoob|w3school|mozilla|readthedocs|developer\.|docs?\./i, '技术文档'],
  [/github|gitee|gitlab|coding\.net|bitbucket/i, '代码仓库'],
  [/zhihu|csdn|juejin|cnblogs|segmentfault|jianshu|v2ex|reddit/i, '经验/问答社区'],
  [/gov\.cn|edu\.cn|\.edu|ac\.cn|scs\.gov|ncss|chinajob|51job|zhaopin/i, '官方入口'],
  [/pan\.baidu|ailiyun|aliyundrive|123pan|drive\.google|onedrive|dropbox|wenku|docin/i, '网盘/文库资料'],
  [/\.pdf(\?|$)/i, 'PDF 资料'],
  [/\.(docx?|xlsx?|pptx?|csv)(\?|$)/i, '文档资料'],
  [/\.(mp4|avi|mov|mkv|flv)(\?|$)/i, '视频资料'],
  [/\.(zip|rar|7z|tar|gz)(\?|$)/i, '打包资料'],
  [/taobao|jd\.com|tmall|amazon|dangdang/i, '购买入口'],
  [/36kr|sspai|news|ifeng|sina/i, '行业资讯'],
  [/blog|medium|substack|wordpress/i, '博客文章'],
  [/qidian|zongheng|weread|kindle/i, '电子书']
]
// 标题里出现的关键词 → 用途（优先级低于网址特征，高于兜底）
const TITLE_LINK_WORDS = [
  [/刷题|真题|题库|模拟卷/, '刷题/真题网站'],
  [/课程|网课|视频|教程|公开课/, '视频课程'],
  [/文档|手册|指南|规范|API/, '技术文档'],
  [/官网|报名|查分|准考证/, '官方入口'],
  [/下载|pdf|资料包|讲义/, '资料下载']
]
function linkPurposeOf(node, url) {
  const text = `${url} ${node?.title || ''} ${node?.detail || ''}`
  for (const [re, label] of LINK_RULES) {
    if (re.test(text)) return label
  }
  const title = String(node?.title || '')
  for (const [re, label] of TITLE_LINK_WORDS) {
    if (re.test(title)) return label
  }
  return '外部资料'
}
function resourceLabel(node) {
  if (!isTaskRow(node)) return resourceUrl(node) ? '资料' : ''
  // 1) 节点上显式写的资料用途
  const explicit = String(node?.resourceTitle || node?.resourceTag || '').trim()
  if (explicit) return truncate(explicit, LINK_LABEL_MAX)
  const url = resourceUrl(node)
  if (!url) return ''
  // 2) detail「资源：」段里紧挨着网址的中文备注（如「行测刷题网站｜https://…」）
  const seg = (String(node?.detail || '').match(/资源[:：]\s*([^；;]+)/) || [])[1] || ''
  const note = ((seg.match(/^(.*?)(?:https?:\/\/|$)/) || [])[1] || '').replace(/[｜|,，、\-—\s]+$/g, '').trim()
  if (/[\u4e00-\u9fff]/.test(note) && note.length <= LINK_LABEL_MAX) return note
  // 3) 按网址/标题特征判断这个站是干嘛用的
  return linkPurposeOf(node, url)
}
// 资料列宽度：跟着标签文字宽度走，保证标签完整显示
function linkWidthOf(node) {
  const label = isTaskRow(node) ? resourceLabel(node) : ''
  if (!label) return 0
  return Math.min(LINK_W_MAX, Math.max(LINK_W_MIN, textWidthOf(label) + 14))
}
// 节点卡片半宽：任务行最宽，根节点（大脑）次之，普通卡片最窄。连线端点、折叠按钮、避让间距都跟着它走
function rowWidth(node) {
  if (isTaskRow(node)) return taskRowWidth(node)
  return isBrain(node) ? MIND_BRAIN_W : cardWidthOf(node)
}
// 普通卡片宽度＝按标题实际文字宽度自适应（下限 MIND_CARD_W、上限 MIND_CARD_MAX_W）。
// 卡片高度固定，宽度必须撑得下标题，否则标题就只能被截断省略 —— 宁可变宽，也不隐藏文字
function cardWidthOf(node) {
  const lead = Number(node?.seq) ? 34 : 14 // 左侧「同级序号」占用 + 右内边距
  return Math.min(MIND_CARD_MAX_W, Math.max(MIND_CARD_W, lead + textWidthOf(node?.title) + 16))
}
// 根节点＝「大脑」：整棵图的起点锚，也是「人物塑造」的汇总展示位。
// 布局期不能读 layout.value（正在求值中），所以根节点 id 由 mindLayout 写入这个模块级变量，供布局与渲染共用
let mindBrainId = ''
function isBrain(node) {
  return netView.value === 'mind' && !!node && String(node.id) === mindBrainId
}
// 人物塑造：先不接 AI，直接用「任务的完成 / 放弃 / 延期」状态做数值聚合
//   完成＝正向塑造，放弃与延期＝负向塑造；后面要接 AI 时，这里是唯一改动的入口
const persona = computed(() => {
  const tasks = nodes.value.filter(n => n.kind === 'action')
  const total = tasks.length
  const done = tasks.filter(n => n.status === 'done').length
  const drop = tasks.filter(n => n.status === 'drop').length
  const delay = tasks.filter(n => n.status === 'delay').length
  // 部分完成：填了「完成情况」但还没整体完成的，按半件折算进执行力
  const partial = tasks.filter(n => n.status !== 'done' && String(n.progressNote || '').trim()).length
  const active = Math.max(1, total - drop)
  return {
    total,
    done,
    drop,
    partial,
    // 执行力＝（做完 + 部分完成折算一半）占「没放弃的」比例；专注＝没放弃的比例；稳定＝没延期的比例
    exec: Math.round(((done + partial * 0.5) / active) * 100),
    focus: total ? Math.round(((total - drop) / total) * 100) : 0,
    steady: total ? Math.round(((total - delay) / total) * 100) : 0
  }
})
// 大脑卡片上那一行人物塑造摘要
function personaLine() {
  if (!persona.value.total) return '还没有任务，先立目标'
  const partial = persona.value.partial ? ` · 部分完成 ${persona.value.partial}` : ''
  return `执行力 ${persona.value.exec}% · 专注 ${persona.value.focus}% · 稳定 ${persona.value.steady}%${partial}`
}
// 画布上「大脑左侧」的人物画像思维导图的数据源：6 大维度的正文（按行拆成条目）+ 未来可选发展路径库；
// 完整画像与路径库的查看编辑仍在左侧「人物画像」面板里，画布侧只负责把它平铺成思维导图
const PERSONA_DIM_KEYS = ['hardSkills', 'timeHabits', 'traits', 'resources', 'valuesPref', 'risks']
// 中文标签兜底：后端接口异常 / 缓存未命中时也不能让画布上出现 hardSkills 这种英文键名
const PERSONA_DIM_LABELS = {
  hardSkills: '硬能力',
  timeHabits: '时间与行为习惯',
  traits: '性格与心智特质',
  resources: '资源',
  valuesPref: '目标价值偏好',
  risks: '风险与短板'
}
// 动态画像 7 维的中文标签兜底（与后端 LIFE_PERSONA_DERIVED_DIMS 一一对应）
const PERSONA_DERIVED_LABELS = {
  state: '当前状态',
  abilities: '能力基线',
  habits: '行为习惯',
  traits: '性格特质',
  resources: '资源盘点',
  future: '未来可做的事',
  advantage: '相对优势'
}
const personaProfile = ref({ filled: 0, dims: [], paths: [], derived: [], derivedAt: 0 })
// 维度正文按行拆开：画布上一行＝思维导图的一个叶子条目
function personaLines(text) {
  return String(text || '')
    .split(/\r?\n/)
    .map(line => line.trim())
    .filter(Boolean)
}
async function loadPersonaSummary() {
  try {
    const [personaResult, pathResult] = await Promise.all([
      lifeApi.getPersona().catch(() => ({})),
      lifeApi.getPaths().catch(() => ({}))
    ])
    const row = personaResult.persona || {}
    const dimMeta = new Map((personaResult.dims || []).map(dim => [dim.key, dim]))
    const dims = PERSONA_DIM_KEYS.map(key => {
      const meta = dimMeta.get(key) || {}
      return { key, label: meta.label || PERSONA_DIM_LABELS[key] || key, lines: personaLines(row[key]) }
    })
    const paths = (pathResult.items || []).map(item => ({
      id: String(item.id),
      name: String(item.name || '未命名路径'),
      score: Number(item.score) || 0,
      nodeId: item.nodeId || ''
    }))
    // 动态画像：7 个维度由后端按右侧规划节点的完成度实时反推，值同样是「按行拆条目」；
    // 接口没带回维度元数据时用本地中文标签兜底，保证画布上永远是 7 条中文分支
    const derivedRow = personaResult.derived || {}
    const derivedMeta = (personaResult.derivedDims || []).length
      ? personaResult.derivedDims
      : Object.keys(PERSONA_DERIVED_LABELS).map(key => ({ key, label: PERSONA_DERIVED_LABELS[key], hint: '' }))
    const derived = derivedMeta.map(meta => ({
      key: meta.key,
      label: meta.label || PERSONA_DERIVED_LABELS[meta.key] || meta.key,
      hint: meta.hint || '',
      lines: personaLines(derivedRow[meta.key])
    }))
    personaProfile.value = {
      filled: dims.filter(dim => dim.lines.length).length,
      dims,
      paths,
      derived,
      derivedAt: Number(derivedRow.updatedAt) || 0
    }
  } catch (_) { /* 画像摘要拉取失败不影响画布渲染 */ }
}
// 画像面板或 AI 对话写库后（都会递增 panelToken）刷新画布上的画像思维导图
watch(panelToken, () => { loadPersonaSummary() })
// 点画像思维导图的卡片：带推演子图的路径卡片直接跳到右侧对应子图，其余切到左侧「人物画像」面板
function onPersonaNodeClick(pnode) {
  if (pnode && pnode.nodeId) { focusLifePath(pnode.nodeId); return }
  leftTab.value = 'persona'
}
// 资料链接：从 detail 的「资源：https://…」段或 content_type=link 的 content_body 里提取可点开的网址
function resourceUrl(node) {
  const body = typeof node?.contentBody === 'string' ? node.contentBody : JSON.stringify(node?.contentBody || {})
  const hit = `${node?.detail || ''} ${body}`.match(/https?:\/\/[^\s"'）)、，]+/)
  return hit ? hit[0] : ''
}
function openResource(node) {
  const url = resourceUrl(node)
  if (url) window.open(url, '_blank', 'noopener')
}
// 开始日期与截止日期都有、且不是同一天 → 显示成区间「9/1→12/12」，让「这是一段周期任务」一眼可读
function spanLabel(node) {
  const s = daysFromToday(node?.startDate)
  const e = daysFromToday(node?.horizon)
  if (s !== null && e !== null && s !== e) return `${dateLabelOf(s)}→${dateLabelOf(e)}`
  return ''
}
// 任务行右侧的时间列：必须标明「这个日期是什么日期」，避免开始日期和截止日期混淆
//   有区间 → 「9/1→12/12」；有截止日期 → 「截止 M-D」；只有时间段 → 近期/中期/远期；都没有 → 「开始 M-D」（＝任务建立日）
function taskTimeLabel(node) {
  const span = spanLabel(node)
  if (span) return span
  const day = daysFromToday(node?.horizon)
  if (day !== null) return `截止 ${dateLabelOf(day)}`
  // 只填了开始日期（没有截止日期）时按开始日期标注，不再退回时间刻度
  const start = daysFromToday(node?.startDate)
  if (start !== null) return `开始 ${dateLabelOf(start)}`
  const period = { urgent: '近期', mid: '中期', future: '远期' }[node?.timeGroup]
  if (period) return period
  const created = daysFromToday(createdDayOf(node))
  return created === null ? '开始 今天' : `开始 ${dateLabelOf(created)}`
}
// 普通卡片（根目标 / 目标 / 里程碑）的日期标注：同样必须写明这是哪一类日期，
//   有截止日期 → 「截止 M-D」；只有时间段 → 近期/中期/远期；都没有 → 「开始 M-D」（＝节点建立日）
function cardTimeLabel(node) {
  if (isTaskRow(node)) return ''
  const span = spanLabel(node)
  if (span) return span
  const day = daysFromToday(node?.horizon)
  if (day !== null) return `截止 ${dateLabelOf(day)}`
  // 只填了开始日期（没有截止日期）时按开始日期标注，不再退回时间刻度
  const start = daysFromToday(node?.startDate)
  if (start !== null) return `开始 ${dateLabelOf(start)}`
  const period = { urgent: '近期', mid: '中期', future: '远期' }[node?.timeGroup]
  if (period) return period
  const created = daysFromToday(createdDayOf(node))
  return created === null ? '开始 今天' : `开始 ${dateLabelOf(created)}`
}
// 横向关联列表：跨赛道联动 / 时间冲突，点一下可跳到对应节点
const selectedRefs = computed(() => {
  const node = selectedNode.value
  if (!node || !Array.isArray(node.referenceIds)) return []
  const byId = new Map(nodes.value.map(item => [String(item.id), item]))
  return node.referenceIds.map(ref => byId.get(String(ref))).filter(Boolean).map(item => ({ id: item.id, title: item.title, series: item.series || '' }))
})
function focusRef(id) {
  const target = nodes.value.find(item => String(item.id) === String(id))
  if (target) selectedId.value = target.id
}
// 公共节点标记：复盘 / 方法 / 资料 / 模板全网络复用
const isSharedNode = computed(() => selectedNode.value?.shared === true)

// 详情面板里的载体结构化内容（表格行列、链接、清单、分支、计算等）
const selectedCarrier = computed(() => {
  const node = selectedNode.value
  const type = carrierOf(node)
  if (!type) return null
  const body = node?.contentBody
  return {
    type,
    label: CARRIER_META[type].label,
    color: CARRIER_META[type].color,
    body: body && typeof body === 'object' ? body : null
  }
})
function truncate(text, max) {
  const str = String(text || '')
  return str.length > max ? str.slice(0, max) + '…' : str
}
// 节点标签：拆成两行短标签（上行「#序号｜日期」、下行任务名），保证相邻节点标签不横向重叠
function shortHorizon(text) {
  const match = /(\d{4})-(\d{2})-(\d{2})/.exec(String(text || ''))
  if (match) return `${match[1].slice(2)}-${match[2]}-${match[3]}`
  return truncate(text, 7)
}
function nodeLabelLines(node) {
  const step = stepOf(node)
  const start = node.startDate ? shortHorizon(node.startDate) : ''
  const end = node.horizon ? shortHorizon(node.horizon) : ''
  // 开始与截止日期都有且不同时显示区间（09-01→12-12），只有一边就显示单日期
  const span = start && end && start !== end ? `${start}→${end}` : (end || start)
  const head = [step ? `#${step}` : '', span].filter(Boolean).join('｜')
  const title = truncate(node.title, node.kind === 'self' ? 12 : 8)
  return head ? [head, title] : [title]
}
// 思维导图卡片内的标题：默认完整显示，不做省略。
// 任务行按标题量宽、普通卡片按标题量宽，宽度都随文字走，所以除非标题撞到宽度上限（超长标题）才省略
function cardTitle(node) {
  if (isTaskRow(node)) {
    if (taskRowWidth(node) < MIND_TASK_MAX_W) return String(node.title || '')
    return truncate(node.title, Math.floor((MIND_TASK_MAX_W - TASK_ROW_FIXED) / 12))
  }
  if (isBrain(node)) return String(node.title || '')
  if (cardWidthOf(node) < MIND_CARD_MAX_W) return String(node.title || '')
  const lead = Number(node?.seq) ? 34 : 14
  return truncate(node.title, Math.floor((MIND_CARD_MAX_W - lead - 16) / 12))
}
// 这一行是否已经并进某张大表格框：并进去的行不再画自己的小框，交给大框统一画
function isInTaskBox(node) {
  const map = layout.value && layout.value.taskBoxOf
  return !!(map && node && map[String(node.id)])
}
// 标签上下交错：同一条带内相邻节点一上一下，避免标签在同一水平线上互相遮挡
function labelBelow(node) {
  return (Number(node.nidx) || 0) % 2 === 0
}
function labelY(node) {
  const r = nodeRadius(node)
  return labelBelow(node) ? node.y + r + 13 : node.y - r - 24
}
// 优先级小标记放在标签的相反侧，避免和标签挤在一起
function badgeY(node) {
  const r = nodeRadius(node)
  return labelBelow(node) ? node.y - r - 8 : node.y + r + 13
}
// 节点统一尺寸：权重不再影响圆圈大小，避免「大小含义不明」的误读
const NODE_R = 14
function nodeRadius(node) {
  return node.kind === 'self' ? 26 : NODE_R
}

// ===== 时序分组 =====
// 截止日期距今天数；没有可识别日期返回 null
function daysFromToday(text) {
  const match = /(\d{4})-(\d{2})-(\d{2})/.exec(String(text || ''))
  if (!match) return null
  const now = new Date()
  const base = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime()
  const target = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3])).getTime()
  if (!Number.isFinite(target)) return null
  return Math.round((target - base) / 86400000)
}
// 任务建立日期（YYYY-MM-DD）：任务没有截止日期、也没有时间段时，就以它自己的建立时间作为起跑日
function createdDayOf(node) {
  const raw = node?.createdAt ?? node?.created_at
  const ms = typeof raw === 'number' ? raw : Number(raw)
  const date = Number.isFinite(ms) && ms > 0 ? new Date(ms) : (raw ? new Date(raw) : null)
  if (!date || Number.isNaN(date.getTime())) return null
  const pad = value => String(value).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
}
// 距今天数 → 真实日期标签（跨年时带上年份，例如 2027/1/15）
function dateLabelOf(offset) {
  const base = new Date()
  base.setHours(0, 0, 0, 0)
  base.setDate(base.getDate() + offset)
  const month = base.getMonth() + 1
  const day = base.getDate()
  return base.getFullYear() === new Date().getFullYear()
    ? `${month}/${day}`
    : `${base.getFullYear()}/${month}/${day}`
}
// ===== 系列分组与优先级配色 =====
// 系列 = 节点所属主线（后端 series 字段）；旧数据没有 series 时回退到领域
function seriesOf(node) {
  return String(node?.series || '').trim() || String(node?.domain || '').trim() || '未分类'
}
// 节点圆色统一表示优先级：P0 红 / P1 黄 / P2 绿 / 里程碑 蓝
function priorityOf(node) {
  const value = String(node?.priority || '').trim().toUpperCase()
  if (PRIORITY_COLORS[value]) return value
  // 旧数据没有 priority 时按权重兜底
  const weight = Number(node?.weight)
  if (!Number.isFinite(weight)) return ''
  if (weight >= 80) return 'P0'
  if (weight >= 50) return 'P1'
  return 'P2'
}
function nodeColor(node) {
  if (node.kind === 'milestone') return MILESTONE_COLOR
  return PRIORITY_COLORS[priorityOf(node)] || '#cbd5e1'
}
// 是否已排截止日期（没有日期＝按时间段估算落位，卡片用虚线框标出）
function hasDate(node) {
  return daysFromToday(lifeDateOf(node)) !== null
}
// 节点的生效日期（决定它在时间轴上的落位）——不能一刀切永远用截止日期：
//   ① 同时填了开始日期与截止日期、且跨度超过一周 → 这类是「备考 / 周期推进」型任务，
//      它在开始那天就已经进入执行状态，所以按「开始日期」落位（先开始先排）。
//   ② 只有一个日期 → 用那个日期。
//   ③ 两个都有但跨度 ≤ 7 天 → 属于「某天要交付」的单点任务，按截止日期落位。
function lifeDateOf(node) {
  const start = String(node?.startDate || '')
  const end = String(node?.horizon || '')
  const sd = daysFromToday(start)
  const ed = daysFromToday(end)
  if (sd !== null && ed !== null && ed - sd > 7) return start
  return end || start
}
function priorityBadge(node) {
  return node.kind === 'milestone' ? '里程碑' : (priorityOf(node) || '')
}
// 远期推演节点：远期人生推演分支、一年以后、远期里程碑；默认折叠，日常只看短期执行任务
function isFutureNode(node) {
  if (seriesOf(node) === '人生推演') return true
  const days = daysFromToday(lifeDateOf(node))
  if (days !== null && days > 365) return true
  return node.kind === 'milestone' && node.timeGroup === 'future'
}
// 未解锁：前置任务还没完成（思维导图视图里这类节点统一置灰）
const nodeStatusById = computed(() => new Map(nodes.value.map(n => [n.id, n.status])))
function isLockedNode(node) {
  const deps = Array.isArray(node.deps) ? node.deps : []
  return deps.some(id => (nodeStatusById.value.get(String(id)) || 'todo') !== 'done')
}

// 部分完成：任务只做了一部分（填了「完成情况」但还没整体完成），复选框显示琥珀色半格
function isPartialTask(node) {
  return !!node && node.kind === 'action' && node.status !== 'done' && node.status !== 'drop' && !!String(node.progressNote || '').trim()
}

// ===== 步骤排序与车道槽位 =====
function stepOf(node) {
  const value = Number(node && node.stepNo)
  return Number.isFinite(value) && value > 0 ? value : 0
}
// 同一车道内的先后顺序：步骤序号 -> 截止日期 -> 创建时间
function compareByStep(a, b) {
  const sa = stepOf(a)
  const sb = stepOf(b)
  if (sa !== sb) return sa && sb ? sa - sb : (sa ? -1 : 1)
  const da = daysFromToday(lifeDateOf(a))
  const db = daysFromToday(lifeDateOf(b))
  if (da !== db) {
    if (da === null) return 1
    if (db === null) return -1
    return da - db
  }
  return (Number(a.createdAt) || 0) - (Number(b.createdAt) || 0)
}
// ===== 思维导图布局：以目标节点（例：考研）为根，保留横轴（截止日期）、去掉纵轴泳道，按父子关系向右发散 =====
// 与泳道视图同源（同一份节点数据），切视图只换布局算法，不新增存储、不改数据库
const MIND_ROW_H = 60
const MIND_TOP = 64
const MIND_CARD_W = 150
const MIND_CARD_MAX_W = 460
const MIND_CARD_H = 48
// 根节点＝「大脑」＝用户本人（kind=self 的画像节点）：占画布最左侧一条独立的「本人」列，比普通卡片更大更重
const MIND_BRAIN_W = 268
const MIND_BRAIN_H = 64
// 大脑根节点**左侧**是一整片「人物画像」思维导图：把画像内容（6 大维度 + 未来可选发展路径库）向左侧平铺展开。
// 两列自右向左：0＝维度 / 路径库分支、1＝维度条目 / 单条发展路径（卡片一律右对齐），
// 分支直接从大脑左边缘拉线；原先那一列「人物画像 / 大脑属性」根卡片已删除（讲的就是大脑本身，重复信息），
// 树宽随之少掉一列，画布不再为那张卡片留空。
const MIND_PERSONA_PAD = 32          // 画像树最左侧与画布左边缘的留白
const MIND_PERSONA_DIM_W = 152       // 第 1 列：6 大维度 / 路径库分支卡片宽度
const MIND_PERSONA_DIM_H = 46        // 分支卡片高度
const MIND_PERSONA_ITEM_MIN_W = 220  // 第 2 列：条目卡片最小宽度
const MIND_PERSONA_ITEM_MAX_W = 340  // 条目卡片最大宽度（超长条目在卡片内换行，不撑爆画布）
const MIND_PERSONA_COL_GAP = 30      // 相邻两列之间的横向间距
const MIND_PERSONA_BRAIN_GAP = 40    // 画像树与大脑（根节点）之间的间距
const MIND_PERSONA_VGAP = 16         // 画像树相邻卡片之间的纵向间距
const PERSONA_ITEM_MAX_LINES = 8     // 单个条目卡片最多换多少行，防止极端长文把树撑得过高
// 树总宽＝留白 + 两列 + 一条列间距；MIND_LEFT＝树宽 + 与大脑的间距，大脑从 MIND_LEFT 起
const MIND_PERSONA_TREE_W = MIND_PERSONA_PAD + MIND_PERSONA_DIM_W + MIND_PERSONA_COL_GAP + MIND_PERSONA_ITEM_MAX_W
const MIND_LEFT = MIND_PERSONA_TREE_W + MIND_PERSONA_BRAIN_GAP

// 6 大维度各自一个颜色，让画像树的每一支一眼可辨；路径库统一走鎏金，呼应「大脑属性」的配色
const PERSONA_DIM_COLORS = {
  hardSkills: '#6366f1',
  timeHabits: '#0ea5e9',
  traits: '#8b5cf6',
  resources: '#10b981',
  valuesPref: '#f59e0b',
  risks: '#ef4444'
}
const PERSONA_ROOT_COLOR = '#c8a24a'
const PERSONA_PATH_COLOR = '#b8912f'
const PERSONA_DERIVED_COLOR = '#0d9488'   // 动态画像整体走青绿，与「手填画像」的金色系区分开
// 动态画像 7 维各自一个颜色（与后端 LIFE_PERSONA_DERIVED_DIMS 的 key 一一对应）
const PERSONA_DERIVED_COLORS = {
  state: '#e11d48',
  abilities: '#6366f1',
  habits: '#0ea5e9',
  traits: '#8b5cf6',
  resources: '#10b981',
  future: '#f59e0b',
  advantage: '#14b8a6'
}
// 复用 textWidthOf 的「中文 12px / 半角 7px」估算：按像素宽度把一个长句切成多行，用于条目卡片内自动换行
function wrapByWidth(text, maxWidth) {
  const str = String(text || '').replace(/\s+/g, ' ').trim()
  if (!str) return ['']
  const rows = []
  let line = ''
  let width = 0
  for (const ch of str) {
    const cw = textWidthOf(ch)
    if (width + cw > maxWidth && line) { rows.push(line); line = ''; width = 0 }
    line += ch
    width += cw
  }
  if (line) rows.push(line)
  return rows
}
// 单行文字超出卡片宽度时截断加省略号（分支名 / 路径名这类单行展示）
function fitPersonaText(text, maxWidth) {
  const str = String(text || '')
  if (textWidthOf(str) <= maxWidth) return str
  let out = ''
  let width = 0
  for (const ch of str) {
    const cw = textWidthOf(ch)
    if (width + cw > maxWidth - 12) break
    out += ch
    width += cw
  }
  return out + '…'
}

// ===== 根节点（大脑）左侧的「人物画像」思维导图 =====
// 层级：人物画像（根）→ 6 大维度 / 未来可选发展路径库（分支）→ 维度条目 / 单条发展路径（叶子）
// 与右侧规划网络完全同一套样式（圆角卡片 + 左侧色条 + 贝塞尔曲线箭头），只是整棵树向「左」生长：
// 箭头一律由父节点指向子节点（朝左），最右端的画像根卡片再由一条曲线挂到大脑的左边缘
function buildPersonaTree() {
  const data = personaProfile.value
  const dims = data.dims || []
  const paths = data.paths || []
  // 两列右对齐排布：每列卡片都贴齐本列的右边缘，连线端点因此始终整齐
  const rightEdge = [
    MIND_LEFT - MIND_PERSONA_BRAIN_GAP,                                                            // 一级分支列
    MIND_LEFT - MIND_PERSONA_BRAIN_GAP - MIND_PERSONA_DIM_W - MIND_PERSONA_COL_GAP                  // 二级条目列
  ]
  const curve = (x1, y1, x2, y2) => {
    const bend = Math.max(16, (x1 - x2) / 2)
    return `M ${x1} ${y1} C ${x1 - bend} ${y1}, ${x2 + bend} ${y2}, ${x2} ${y2}`
  }
  const nodes = []
  const links = []
  // 连线起点＝大脑左边缘与大脑同高：去掉根卡片后，各一级分支直接从这里散开
  const rootY = MIND_TOP
  let cursor = MIND_TOP - MIND_PERSONA_DIM_H / 2 // 下一张卡片的顶边

  // 一级分支：动态画像 7 维（最外层第一支，由右侧规划完成度实时反推）+ 6 大维度 + 未来可选发展路径库
  const selfDimBranches = dims.map(dim => ({
    id: `persona-dim-${dim.key}`,
    color: PERSONA_DIM_COLORS[dim.key] || PERSONA_ROOT_COLOR,
    label: dim.label,
    tag: dim.lines.length ? `${dim.lines.length} 条` : '待补充',
    items: dim.lines.map((text, index) => ({
      id: `persona-dim-${dim.key}-${index}`,
      text,
      color: PERSONA_DIM_COLORS[dim.key] || PERSONA_ROOT_COLOR
    }))
  }))
  const derivedBranches = (data.derived || []).map(dim => ({
    id: `persona-derived-${dim.key}`,
    color: PERSONA_DERIVED_COLORS[dim.key] || PERSONA_DERIVED_COLOR,
    label: dim.label,
    tag: dim.lines.length ? `${dim.lines.length} 条` : '待推导',
    hint: dim.hint,
    items: dim.lines.map((text, index) => ({
      id: `persona-derived-${dim.key}-${index}`,
      text,
      color: PERSONA_DERIVED_COLORS[dim.key] || PERSONA_DERIVED_COLOR
    }))
  }))
  const branches = [...derivedBranches, ...selfDimBranches]
  branches.push({
    id: 'persona-paths',
    color: PERSONA_PATH_COLOR,
    label: '未来可选发展路径库',
    tag: paths.length ? `${paths.length} 条` : '待生成',
    items: paths.map(path => ({
      id: `persona-path-${path.id}`,
      text: path.name,
      score: path.score,
      color: PERSONA_PATH_COLOR,
      nodeId: path.nodeId
    }))
  })

  for (const branch of branches) {
    const label = fitPersonaText(branch.label, MIND_PERSONA_DIM_W - 28)
    const branchY = cursor + MIND_PERSONA_DIM_H / 2
    nodes.push({
      id: branch.id,
      depth: 1,
      x: rightEdge[0] - MIND_PERSONA_DIM_W / 2,
      y: branchY,
      w: MIND_PERSONA_DIM_W,
      h: MIND_PERSONA_DIM_H,
      color: branch.color,
      title: branch.label,
      label,
      tag: branch.tag,
      lines: [],
      nodeId: ''
    })
    links.push({ id: `brain>${branch.id}`, d: curve(MIND_LEFT, rootY, rightEdge[0], branchY) })
    cursor += MIND_PERSONA_DIM_H + MIND_PERSONA_VGAP

    for (const item of branch.items) {
      const hasScore = item.score !== undefined
      const reserve = hasScore ? 54 : 0
      const width = Math.min(MIND_PERSONA_ITEM_MAX_W, Math.max(MIND_PERSONA_ITEM_MIN_W, textWidthOf(item.text) + 28 + reserve))
      const rows = wrapByWidth(item.text, Math.max(80, width - 28 - reserve))
      if (rows.length > PERSONA_ITEM_MAX_LINES) {
        rows.length = PERSONA_ITEM_MAX_LINES
        rows[PERSONA_ITEM_MAX_LINES - 1] += ' …'
      }
      const height = Math.max(MIND_PERSONA_DIM_H, 20 + rows.length * 16)
      const itemY = cursor + height / 2
      nodes.push({
        id: item.id,
        depth: 2,
        x: rightEdge[1] - width / 2,
        y: itemY,
        w: width,
        h: height,
        color: item.color,
        title: item.text,
        label: '',
        tag: '',
        lines: rows,
        score: hasScore ? item.score : undefined,
        nodeId: item.nodeId || ''
      })
      links.push({ id: `${branch.id}>${item.id}`, d: curve(rightEdge[0] - MIND_PERSONA_DIM_W, branchY, rightEdge[1], itemY) })
      cursor += height + MIND_PERSONA_VGAP
    }
  }

  return { nodes, links, bottom: cursor - MIND_PERSONA_VGAP }
}
// 任务类节点在思维导图里渲染成「表格行」，比普通卡片宽，好放下 复选框 / 任务名 / 时间 / 资料入口
// 宽度不固定：按任务名实际文字宽度算，保证一个标题完整显示、不被截成一半
const MIND_TASK_W = 320
const MIND_TASK_MAX_W = 640
// 时间轴按「有任务的日期」列排布：一个日期独占一列，列宽≥该列最宽的任务行，同列卡片严格对齐。
// 这样今天和明天之间不会被整条时间跨度压成几像素 —— 不管跨度多大，任务都平铺得开
const MIND_COL_PITCH = MIND_TASK_W + 20
const MIND_COL_PAD = 40 // 列内最宽行两侧预留的余量，避免相邻列贴在一起
const MIND_COL_EXTRA = 26
const MIND_COL_EXTRA_MAX = 140

function mindLayout() {
  // 受「显示远期推演节点」开关控制：不勾选只看短期执行任务，勾选才展开远期结局 / 人际分支
  const pool = nodes.value.filter(n => showFuture.value || !isFutureNode(n))
  const byId = new Map(pool.map(n => [n.id, n]))
  // 根节点＝「大脑」＝用户本人（kind=self 的画像节点），而不是某个任务或目标；
  // 一级节点才是各条赛道 / 目标（domain→goal→action），没有画像节点时退回领域 / 目标 / 首个节点
  const selfNode = pool.find(n => n.kind === 'self') || null
  const center = selfNode || pool.find(n => n.kind === 'domain') || pool.find(n => n.kind === 'goal') || pool[0] || null
  // 布局期（本函数内）也要判断「谁是大脑」，但不能读 layout.value（正在求值），所以写到模块级变量共用
  mindBrainId = center ? String(center.id) : ''
  // 有真实父子关系就按 parent_id 展开；一条都没有（旧数据）时按主线 series 临时分组，避免退化成一列
  const linked = pool.some(n => n.parentId && byId.has(n.parentId) && n.parentId !== n.id)
  const synthetic = new Map()   // 合成分组标签：仅用于布局，不落库、不参与任务统计
  const parentOf = new Map()    // 节点 id → 上级 id（可能是合成分组）
  const children = new Map()
  // 节点半宽：矩形卡片统一按卡片半宽，合成分组标签按文字长度量宽
  // 节点半高：只有「大脑」比别人高，画竖向连线时要按各自高度算端点
  const halfH = node => (isBrain(node) ? MIND_BRAIN_H : MIND_CARD_H) / 2
  const widthOf = node => (node && node.card ? rowWidth(node) / 2 : node?.synthetic ? Math.max(64, String(node.title || '').length * 13 + 22) : rowWidth(node) / 2)
  const linkUp = (childId, parentId) => {
    if (!childId || !parentId || childId === parentId) return
    parentOf.set(childId, parentId)
    if (!children.has(parentId)) children.set(parentId, [])
    children.get(parentId).push(childId)
  }

  for (const node of pool) {
    if (center && node.id === center.id) continue
    const pid = node.parentId && byId.has(node.parentId) && node.parentId !== node.id ? node.parentId : ''
    if (pid) { linkUp(node.id, pid); continue }
    if (node.kind === 'domain' && center) { linkUp(node.id, center.id); continue }
    if (!linked && center) {
      const gid = `series#${seriesOf(node)}`
      if (!synthetic.has(gid)) {
        synthetic.set(gid, { id: gid, title: seriesOf(node), synthetic: true })
        linkUp(gid, center.id)
      }
      linkUp(node.id, gid)
      continue
    }
    if (center) linkUp(node.id, center.id)
  }
  // 折叠：只收起「被手动收起」的节点子树，默认为空＝整棵思维导图默认全部展开
  const collapsed = collapsedIds.value
  const hidden = new Set()
  const hideDescendants = id => {
    for (const kid of (children.get(id) || [])) {
      if (hidden.has(kid)) continue
      hidden.add(kid)
      hideDescendants(kid)
    }
  }
  for (const id of [...byId.keys(), ...synthetic.keys()]) {
    if (collapsed.has(id)) hideDescendants(id)
  }
  const nodeOf = id => synthetic.get(id) || byId.get(id) || null
  const kidsOf = id => (children.get(id) || [])
    .filter(kid => !hidden.has(kid))
    .slice()
    .sort((a, b) => compareByStep(nodeOf(a), nodeOf(b)))
  const orderedRoots = (center ? [center.id] : []).concat(
    [...byId.keys(), ...synthetic.keys()]
      .filter(id => !parentOf.has(id) && id !== center?.id)
      .sort((a, b) => compareByStep(nodeOf(a), nodeOf(b)))
  )

  // 纵向排布＝先序遍历逐行下挂：根节点（大脑）永远在最顶部，所有后代都在它下面。
  // 之前是「父节点居中于子节点之间」，父节点会浮在自己子树中间、上面还压着卡片，看着不像思维导图
  const tree = new Map()
  let row = 0
  const walk = (id, depth, sibIndex) => {
    const y = row * MIND_ROW_H
    row += 1
    tree.set(id, { y, depth, sibIndex })
    for (const [index, kid] of kidsOf(id).entries()) walk(kid, depth + 1, index)
    return y
  }
  for (const [index, rootId] of orderedRoots.entries()) {
    walk(rootId, 0, index)
    row += 0.4 // 相邻根节点之间留一点空隙
  }

  const ys = [...tree.values()].map(item => item.y)
  const minY = ys.length ? Math.min(...ys, 0) : 0
  const maxY = ys.length ? Math.max(...ys, 0) : 0

  // 横向＝真实截止日期（保留横坐标：左早右晚）
  // 时间线长度随「最远任务时间」自动延长：日期域取当前可见的全部任务（只排除根节点，它不对应任何日期）
  const axisPool = pool.filter(n => n.id !== center?.id)
  // 每个任务都必须落在时间轴上有意义的位置，不存在「待排期」的空档：
  //   ① 有截止日期 → 用截止日期
  //   ② 只有时间段（近期/中期/远期）→ 落到该时间段的估算日期
  //   ③ 连时间段都没有 → 用任务自己的「建立日期」：任务什么时候建的，就从什么时候开始
  const PERIOD_DAY = { urgent: 7, mid: 90, future: 365 }
  const periodDayOf = node => {
    const exact = daysFromToday(lifeDateOf(node))
    if (exact !== null) return exact
    const period = PERIOD_DAY[node?.timeGroup]
    if (period !== undefined) return period
    return daysFromToday(createdDayOf(node))
  }
  const realDays = axisPool.map(n => daysFromToday(lifeDateOf(n))).filter(v => v !== null)
  const realDaySet = new Set(realDays)
  // 时间轴左端锚定「今天」，最多回看两周：陈旧的历史日期（例如 2024 年）不参与，否则整条轴会被拖到几年前
  const minDay = Math.max(-14, realDays.length ? Math.min(0, ...realDays) : 0)
  // 「大脑」＝起点锚点：独占画布最左侧一条「本人」列，时间轴（日期列）从它右侧才开始铺。
  // 这样大脑永远落在所有日期列的左边 —— 它发出的连线只会往右指，任何箭头都不可能指回它
  const brainX = MIND_LEFT + MIND_BRAIN_W / 2
  // 大脑根节点**左侧**：一整片「人物画像」思维导图（6 大维度 + 未来可选发展路径库），与右脑子枝干同一套样式，
  //   整棵树向左生长。它本身就是大脑（本人）的属性，放在起点锚点的外侧，不占用右侧时间轴的排布空间 ——
  //   右侧照旧全部留给赛道与任务
  const personaTree = center ? buildPersonaTree() : null
  const TIMELINE_LEFT = MIND_LEFT + MIND_BRAIN_W + MIND_COL_PAD

  // 横坐标＝「任务日期」列：每个有任务的日期独占一列，列宽随该列最宽的任务行自适应。
  // 不再用「天数 × 每天像素」按比例压缩 —— 那样时间跨度一大，今天和明天只差几像素，任务全叠在一起
  const dayBuckets = new Map()
  for (const n of axisPool) {
    const day = periodDayOf(n)
    if (day === null) continue
    const key = Math.max(minDay, day) // 逾期 / 过早的日期统一落到轴左端那一列
    dayBuckets.set(key, (dayBuckets.get(key) || 0) + 1)
  }
  // 「今天」永远占一列，作为轴上的「现在」参考（逾期任务也落在这一列）。
  // 关键：先并入再统一排序 —— 之前用 columns.unshift(0) 把今天硬插到数组首位，
  // 于是今天的列排到了「更早的日期」（如 10-3、10-16）左边，违反左早右晚
  if (!dayBuckets.has(0)) dayBuckets.set(0, 0)
  const columns = [...dayBuckets.keys()].sort((a, b) => a - b)
  // 同一日期列里最宽的那张任务行，决定这一列至少要多宽（保证文字完整、同列严格对齐）
  const widestRowOfDay = day => axisPool.reduce((max, n) => {
    const at = Math.max(minDay, periodDayOf(n) ?? minDay)
    return at === day ? Math.max(max, rowWidth(n)) : max
  }, 0)
  const colWidthOf = day => Math.max(MIND_COL_PITCH, widestRowOfDay(day) + MIND_COL_PAD) + Math.min(MIND_COL_EXTRA_MAX, Math.max(0, (dayBuckets.get(day) || 1) - 1) * MIND_COL_EXTRA)
  const xByDay = new Map()
  let axisCursor = TIMELINE_LEFT
  for (const day of columns) {
    const w = colWidthOf(day)
    xByDay.set(day, axisCursor + w / 2)
    axisCursor += w
  }
  const datedW = Math.max(MIND_COL_PITCH, axisCursor - TIMELINE_LEFT)
  // 根节点＝「大脑」：固定在整张图最顶部、左侧「本人」列里，所有日期列都在它右边。
  // x 只依赖画布左边距（上面的 brainX），不依赖任何节点位置，所以不会循环依赖

  // 落在两列之间的日期（例如只有「近期≈1周 / 中期≈3个月」这种时间段估算）插到相邻列之间，不额外撑长轴
  const xOfDay = day => {
    const key = Math.max(minDay, day)
    if (xByDay.has(key)) return xByDay.get(key)
    const next = columns.find(d => d > key)
    if (next === undefined) return TIMELINE_LEFT + datedW
    const prev = [...columns].reverse().find(d => d < key)
    if (prev === undefined) return TIMELINE_LEFT
    return (xByDay.get(prev) + xByDay.get(next)) / 2
  }

  const pos = new Map()
  const place = (id, parentX) => {
    if (pos.has(id)) return
    const node = nodeOf(id)
    let x
    if (parentX === null) {
      // 根节点：只有「大脑」本人占最左侧那条「本人」列；其它游离根节点（父节点被剪枝掉等）落到自己的日期列
      const day = periodDayOf(node)
      x = center && String(id) === String(center.id) ? brainX : Math.max(TIMELINE_LEFT, xOfDay(day === null ? 0 : day))
    } else {
      const day = periodDayOf(node)
      if (day === null) {
        // 极少数脏数据（没有日期、没有时间段、连建立日期都没有）：落到「今天」那一列。
        // 之前是继承父节点 x，横向位置就没有时间含义了，箭头就会指向「不是更晚」的那一张
        x = Math.max(TIMELINE_LEFT, xOfDay(0))
      } else {
        // 有日期（或按时间段估算）的任务：横坐标＝它在时间轴上的位置，不再被父节点推开
        // 和父节点压住的情况交给下面的「去重叠」收尾统一次处理，日期列优先保住
        x = Math.max(TIMELINE_LEFT, xOfDay(day)) // 逾期/已被裁掉的历史日期统一靠到轴左端，不会跑到画布外
      }
    }
    const info = tree.get(id)
    if (info) pos.set(id, { x, y: MIND_TOP + (info.y - minY) })
    for (const kid of kidsOf(id)) place(kid, x)
  }
  for (const rootId of orderedRoots) place(rootId, null)

  // 去重叠收尾：横坐标按日期分列、纵坐标按父子行，是两套独立逻辑，叠加后不同分支的卡片可能压在一起。
  // 这里统一收尾一遍：同一水平带上（纵向区间相交）的任何两张卡，只要横向相交就依次往右推开。
  // 只往右推（单调），所以必然收敛；最左边那张保持原位，尽量不破坏它原本的日期列。
  const placedList = [...pos.entries()].map(([id, at]) => ({ id, at }))
  for (let pass = 0; pass < 4; pass += 1) {
    let moved = false
    placedList.sort((a, b) => (a.at.y - b.at.y) || (a.at.x - b.at.x))
    for (let i = 0; i < placedList.length; i += 1) {
      const a = placedList[i]
      for (let j = i + 1; j < placedList.length; j += 1) {
        const b = placedList[j]
        if (Math.abs(a.at.y - b.at.y) >= MIND_CARD_H + 6) continue // 纵向不挨着，互不影响
        const minX = a.at.x + rowWidth(nodeOf(a.id)) / 2 + rowWidth(nodeOf(b.id)) / 2 + 20
        if (b.at.x < minX) {
          b.at.x = minX
          moved = true
        }
      }
    }
    if (!moved) break
  }

  // ==== 复合卡片（大表格框）：同一父任务下、落在同一天的任务行，并成一张表 ====
  // 触发条件：① 是任务行 ② 它和自己所有后代都是任务行 ③ 全在同一日期列（同一 x）
  // 这样「一级任务 + 它的二级/三级子任务」是一张表（表头＝一级任务，下面逐行是子任务），
  // 而不是一摞各自带小框、看着反而更零碎的卡片
  const taskBoxOf = {}   // 节点 id → 所属大框 id（模板里用它判断某行要不要画自己的小框）
  const taskBoxes = []
  for (const node of pool) {
    if (!isTaskRow(node)) continue
    const at = pos.get(node.id)
    if (!at || hidden.has(String(node.id))) continue
    const pid = parentOf.get(node.id)
    const pat = pid ? pos.get(pid) : null
    // 只在链条最顶端建框，避免同一串任务被嵌套建好几个框
    if (pat && isTaskRow(nodeOf(pid)) && Math.abs(pat.x - at.x) < 8) continue
    const members = [node]
    const queue = [...kidsOf(node.id)]
    let sameColumn = true
    while (queue.length) {
      const kid = queue.shift()
      const kat = pos.get(kid.id)
      if (!isTaskRow(kid) || !kat || Math.abs(kat.x - at.x) >= 8) {
        sameColumn = false // 有非任务行的后代，或子任务分布在别的日期列 —— 这张表装不下，退回各自独立卡片
        break
      }
      members.push(kid)
      queue.push(...kidsOf(kid.id))
    }
    if (!sameColumn || members.length < 2) continue
    members.sort((a, b) => pos.get(a.id).y - pos.get(b.id).y)
    const head = members[0]
    const headAt = pos.get(head.id)
    const lastAt = pos.get(members[members.length - 1].id)
    const boxId = `taskbox-${head.id}`
    taskBoxes.push({
      id: boxId,
      x: headAt.x,
      w: Math.max(...members.map(m => rowWidth(m))),
      top: headAt.y - MIND_CARD_H / 2 - 5,
      headBottom: headAt.y + MIND_CARD_H / 2,
      bottom: lastAt.y + MIND_CARD_H / 2 + 5,
      rows: members.map(m => ({ id: String(m.id), y: pos.get(m.id).y })),
      color: nodeColor(head),
      dashed: !hasDate(head),
      count: members.length
    })
    for (const m of members) taskBoxOf[String(m.id)] = boxId
  }

  // 刻度：每个「有任务的日期」列一个，直接用同一套 xByDay 映射 —— 刻度天然正对任务列「对上点」
  // 时间段估算出来的列（近期/中期/远期）没有确切日期，标签改显示时间段名
  const tickLabelOf = day => {
    if (day === 0) return '今天'
    if (realDaySet.has(day)) return dateLabelOf(day)
    return { 7: '近期', 90: '中期', 365: '远期' }[day] || dateLabelOf(day)
  }
  const MAX_TICKS = 24
  const tickEvery = Math.max(1, Math.ceil(columns.length / MAX_TICKS))
  const ticks = []
  for (let i = 0; i < columns.length; i += tickEvery) {
    const day = columns[i]
    ticks.push({ day, x: xByDay.get(day), label: tickLabelOf(day) })
  }

  // 同级序号：根节点不标，子节点按同级顺序标 1、2、3…
  const seqOf = new Map()
  for (const id of [...byId.keys(), ...synthetic.keys()]) {
    if (hidden.has(id)) continue
    const pid = parentOf.get(id)
    if (!pid) continue
    const siblings = kidsOf(pid)
    seqOf.set(id, siblings.indexOf(id) + 1)
  }

  const list = []
  for (const node of pool) {
    const info = tree.get(node.id)
    const at = pos.get(node.id)
    if (!info || !at) continue
    list.push({ node, x: at.x, y: at.y, nidx: info.sibIndex, seq: seqOf.get(node.id) || 0 })
  }
  // 合成分组标签（仅旧数据没有父子关系时出现）：只画一个细标签做视觉分组，不参与节点统计
  const groups = []
  for (const group of synthetic.values()) {
    if (group.card) continue // 通用模块走卡片渲染，不作为「合成分组标签」
    const at = pos.get(group.id)
    if (!at) continue
    groups.push({ id: group.id, title: group.title, x: at.x, y: at.y, w: widthOf(group) })
  }

  // 父子枝干：连线含义＝父子从属（不是先后依赖），但箭头方向一律沿时间轴向后指（早 → 晚）
  // 连线方向：一律沿时间轴「向后」指（早 → 晚），绝不画往回勾的线。
  // 横向位置本来就等于日期顺序（左早右晚），所以只按左右两端决定：
  // 从左边那张的右边缘 → 右边那张的左边缘，箭头永远落在「右端」＝时间更晚的那个节点上。
  // 这样日子过去了也照样能顺着箭头读：先做的在左，箭头指向下一步，一直指到最终目标。
  const links = []
  for (const id of [...byId.keys(), ...synthetic.keys()]) {
    const pid = parentOf.get(id)
    const a = pid ? pos.get(pid) : null
    const b = pos.get(id)
    if (!a || !b) continue
    // 已经并进同一张大表格框的两行之间不画箭头 —— 它们在框内就是上下相邻的表格行
    if (taskBoxOf[String(id)] && taskBoxOf[String(id)] === taskBoxOf[String(pid)]) continue
    const halfA = widthOf(nodeOf(pid))
    const halfB = widthOf(nodeOf(id))
    // ① 父子落在同一条竖直带（同一天，或同一天但被挤开的间距很小）：
    //    横向没有余地可走，改画一段竖直短线，箭头朝下＝「挂在上一层下面」。
    //    「大脑 → 目标 → 子目标 → 任务」这种同日期的主干就是靠这条线一层一层串起来的
    if (Math.abs(a.x - b.x) < 8) {
      const top = a.y <= b.y ? a : b
      const bot = a.y <= b.y ? b : a
      const y1 = top.y + halfH(top === a ? nodeOf(pid) : nodeOf(id)) + 3
      const y2 = bot.y - halfH(top === a ? nodeOf(id) : nodeOf(pid)) - 4
      if (y2 > y1 + 2) links.push({ id: `${pid}>${id}`, d: `M ${a.x} ${y1} V ${y2}` })
      continue
    }
    // ② 分属两个日期列：沿时间轴向后指（早 → 晚），箭头永远落在右边那张＝时间更晚的那张
    const left = a.x <= b.x ? { x: a.x, y: a.y, half: halfA } : { x: b.x, y: b.y, half: halfB }
    const right = a.x <= b.x ? { x: b.x, y: b.y, half: halfB } : { x: a.x, y: a.y, half: halfA }
    const x1 = left.x + left.half + 2 // 左节点的右边缘（线的起点）
    const x2 = right.x - right.half - 4 // 右节点的左边缘（箭头落点）
    if (x2 <= x1 + 6) continue
    const mx = (x1 + x2) / 2
    links.push({ id: `${pid}>${id}`, d: `M ${x1} ${left.y} C ${mx} ${left.y} ${mx} ${right.y} ${x2} ${right.y}` })
  }

  // 横向网状关联连线：跨赛道联动 / 时间冲突 / 精力冲突 / 任务互相影响
  // 用虚线绘制，与纵向父子实线区分开（同一对节点只画一条）
  const refLinks = []
  const refDrawn = new Set()
  for (const node of pool) {
    const a = pos.get(node.id)
    if (!a || !Array.isArray(node.referenceIds)) continue
    for (const ref of node.referenceIds) {
      const b = pos.get(String(ref))
      if (!b) continue
      const key = [String(node.id), String(ref)].sort().join('~')
      if (refDrawn.has(key)) continue
      refDrawn.add(key)
      refLinks.push({ id: `ref:${key}`, d: `M ${a.x} ${a.y} L ${b.x} ${b.y}` })
    }
  }

  // 哪些节点带子树（可折叠），以及当前是展开还是收起
  const fold = {}
  for (const id of [...byId.keys(), ...synthetic.keys()]) {
    const hasKids = (children.get(id) || []).some(kid => synthetic.has(kid) || byId.has(kid))
    if (hasKids) fold[id] = { has: true, open: !collapsed.has(id) }
  }

  const maxX = pos.size ? Math.max(MIND_LEFT, ...[...pos.values()].map(p => p.x)) : MIND_LEFT
  // 轴两端＝第一条日期列的左边缘 → 最后一条日期列的右边缘，再向右兜住超出的远期节点
  const fromX = TIMELINE_LEFT
  const toX = Math.max(columns.length ? axisCursor : TIMELINE_LEFT + MIND_COL_PITCH, maxX)
  // 右侧要兜住最宽的那张卡片（卡片宽度随标题自适应，最宽到 MIND_CARD_MAX_W），否则最右边的节点会被裁到画布外
  const canvasW = Math.max(TIMELINE_LEFT + MIND_COL_PITCH + 240, Math.round(maxX + MIND_CARD_MAX_W / 2))
  // 画布高度贴住内容（不再强制撑到 CANVAS.h），下面就不会出现一大片够不着的空地；
  // 缩放后内容比可视区高时，靠鼠标拖拽上下查看。左侧画像树比右侧规划网络高时也要兜住
  const canvasH = Math.max(
    Math.round(maxY - minY + MIND_TOP + MIND_CARD_H),
    personaTree ? Math.round(personaTree.bottom + 40) : 0
  )
  return {
    mind: true,
    bands: [{ key: '思维导图', name: '思维导图', y: 0, h: canvasH, nodes: list, tint: 'transparent' }],
    pos,
    canvasW,
    canvasH,
    links,
    refLinks,
    // 复合卡片：同一父任务下、同一天的任务并成的大表格框（表头＝一级任务，下面逐行是子任务）
    taskBoxes,
    taskBoxOf,
    groups,
    fold,
    rootId: center?.id || '',
    // 大脑根节点**左侧**的「人物画像」思维导图（仅思维导图视图有）；没有大脑时不渲染
    personaTree,
    // 横轴刻度：思维导图也保留「截止日期」横坐标；一个日期一列，列宽随该日任务数自适应
    axis: { ticks, minDay, columns: columns.length, fromX, toX },
    empty: !list.length
  }
}

// ===== 条带布局：X 轴＝时间（左→右即先后），Y 轴＝series 主线 =====
const layout = computed(() => {
  if (netView.value === 'mind') return mindLayout()
  const pool = nodes.value.filter(n => n.kind !== 'self' && n.kind !== 'domain' && (showFuture.value || !isFutureNode(n)))
  const groups = new Map()
  for (const node of pool) {
    const key = seriesOf(node)
    if (!groups.has(key)) groups.set(key, [])
    groups.get(key).push(node)
  }
  let entries = [...groups.entries()].map(([key, list]) => {
    const sorted = [...list].sort(compareByStep)
    const days = sorted.map(n => daysFromToday(lifeDateOf(n))).filter(v => v !== null)
    return { key, list: sorted, firstDay: days.length ? Math.min(...days) : Number.POSITIVE_INFINITY }
  })
  // 主线概览：只保留含 1 年内任务（或有步骤序号）的主线，画面更干净；
  // 勾选了「显示远期推演节点」就不再裁剪，否则「人生推演」远期分支会被这条规则整条丢掉
  if (netView.value !== 'full' && !showFuture.value) {
    const main = entries.filter(item => item.list.some(n => {
      const days = daysFromToday(lifeDateOf(n))
      return (days !== null && days <= 365) || stepOf(n) > 0
    }))
    if (main.length) entries = main
  }
  entries.sort((a, b) => {
    if (a.key === '人生推演') return 1
    if (b.key === '人生推演') return -1
    return a.firstDay - b.firstDay
  })
  // ===== 全局日期刻度：所有泳道共用同一根横轴，列对齐后与泳道框交叉成网格 =====
  const allDays = []
  for (const entry of entries) {
    for (const node of entry.list) {
      const day = daysFromToday(lifeDateOf(node))
      if (day !== null) allDays.push(day)
    }
  }
  const minDay = allDays.length ? Math.min(...allDays) : 0
  const maxDay = allDays.length ? Math.max(...allDays) : minDay + 30
  const daySpan = Math.max(1, maxDay - minDay)
  const datedW = (BAND_RIGHT - BAND_LEFT) * 0.86 // 最右侧 14% 留给「日期未定」的节点
  const xOfDay = day => BAND_LEFT + ((day - minDay) / daySpan) * datedW
  const xOfUndated = BAND_LEFT + datedW + 46
  const TICKS = 6
  const ticks = Array.from({ length: TICKS + 1 }, (_, i) => {
    const day = Math.round(minDay + (daySpan * i) / TICKS)
    return { day, x: xOfDay(day), label: dateLabelOf(day) }
  })

  const count = Math.max(1, entries.length)
  // 稀疏时条带铺满视口的基础高度；内容更多时由下面的泳道把盒子撑高
  const baseH = Math.max(120, Math.round((CANVAS.h - BAND_TOP - 20) / count))
  const pos = new Map()
  let cursorY = BAND_TOP
  const bands = entries.map((entry, index) => {
    const days = entry.list.map(n => daysFromToday(lifeDateOf(n)))
    // X 由全局日期刻度决定；时间相近的节点向右错开，避免圆圈叠在一起
    const placed = []
    let lastX = Number.NEGATIVE_INFINITY
    for (let i = 0; i < entry.list.length; i++) {
      const day = days[i]
      let x = day === null ? xOfUndated : xOfDay(day)
      if (x - lastX < NODE_GAP) x = lastX + NODE_GAP
      lastX = x
      placed.push({ node: entry.list[i], x })
    }
    // 泳道分行：同一行内两个节点至少隔开 LANE_GAP，放不下就另起一行，条带盒子随之加高
    const laneLastX = []
    const laneOf = []
    for (const item of placed) {
      let lane = laneLastX.findIndex(lastX => item.x - lastX >= LANE_GAP)
      if (lane === -1) { laneLastX.push(item.x); lane = laneLastX.length - 1 }
      else laneLastX[lane] = item.x
      laneOf.push(lane)
    }
    const laneCount = Math.max(1, laneLastX.length)
    const h = Math.max(baseH, BAND_HEAD + laneCount * LANE_H + 14)
    const y = cursorY
    cursorY = y + h
    const laneSeen = []
    const nodes = placed.map((item, i) => {
      const lane = laneOf[i]
      const withinLane = laneSeen[lane] || 0
      laneSeen[lane] = withinLane + 1
      const nodeY = y + BAND_HEAD + (h - BAND_HEAD) / 2 + (lane - (laneCount - 1) / 2) * LANE_H
      pos.set(item.node.id, { x: item.x, y: nodeY })
      return { node: item.node, x: item.x, y: nodeY, nidx: withinLane }
    })
    return { key: entry.key, name: entry.key, y, h, nodes, tint: SERIES_TINTS[index % SERIES_TINTS.length] }
  })
  return { bands, pos, canvasH: cursorY + 20, axis: { ticks, minDay, maxDay, undatedX: xOfUndated > BAND_RIGHT ? xOfUndated : BAND_RIGHT } }
})

// 参与渲染的节点（带条带算出的坐标 + 条带内序号，序号用于标签上下交错）
const visibleNodesRaw = computed(() => {
  const list = []
  for (const band of layout.value.bands) {
    band.nodes.forEach((item, i) => list.push({ ...item.node, x: item.x, y: item.y, nidx: item.nidx ?? i, seq: item.seq || 0 }))
  }
  return list
})

// ===== 画布「绘制过程」动画：沿箭头方向一条线一条线推出去 =====
// 顺序＝从大脑根节点出发，沿父子连线做深度优先遍历：节点出现 → 引出它到子节点的线
// → 线延伸到子节点那儿，子节点才浮现 → 子节点若还有下家，就再从它引一条线继续往外延伸。
// 一条分支推到底再回到上一个岔口推下一条，读起来就是「顺着箭头一路推演」的感觉。
const drawCursor = ref(null)  // null＝不播动画（全部直接显示）；小数＝进度（整数部分＝已画到的节点序号，小数部分＝当前连线的生长比例）
let drawRafId = 0

// 绘制顺序：大脑 → 一级赛道 → 它下面的计划 → 再下面的动作 …… 沿箭头一路推到底，再回到岔口推下一条
const drawOrder = computed(() => {
  const kids = new Map()
  for (const link of layout.value.links || []) {
    const [pid, cid] = String(link.id).split('>')
    if (!pid || !cid) continue
    if (!kids.has(pid)) kids.set(pid, [])
    kids.get(pid).push(cid)
  }
  const seen = new Set()
  const order = []
  const walk = id => {
    if (seen.has(id)) return
    seen.add(id)
    order.push(id)
    for (const kid of kids.get(id) || []) walk(kid)
  }
  if (layout.value.rootId) walk(layout.value.rootId)
  // 没被父子线串起来的（并进表格框的、孤立节点）按画布上的自然顺序补在后面
  for (const node of visibleNodesRaw.value) {
    const id = String(node.id)
    if (!seen.has(id)) { seen.add(id); order.push(id) }
  }
  return order
})
const drawRank = computed(() => new Map(drawOrder.value.map((id, index) => [id, index])))

// 正在绘制中的节点在这张表里「还没到位」，所以要按进度逐个放出来
const visibleNodes = computed(() => {
  const list = visibleNodesRaw.value
  const cursor = drawCursor.value
  if (cursor === null) return list
  const rank = drawRank.value
  const shown = Math.floor(cursor) + 1  // 已完整浮现的节点数（含大脑）
  return list.filter(node => (rank.get(String(node.id)) ?? 0) < shown)
})

// 思维导图父子枝干：动画期间只画「已经长到位」的线，正在长的那条按比例延伸
const mindLinks = computed(() => {
  const links = layout.value.links || []
  const cursor = drawCursor.value
  if (cursor === null) return links.map(link => ({ ...link, t: 1 }))
  const rank = drawRank.value
  const shown = Math.floor(cursor) + 1
  const frac = cursor - Math.floor(cursor)
  const out = []
  for (const link of links) {
    const cid = String(link.id).split('>')[1]
    const r = rank.get(cid)
    // 没有父子序号的补画线（合框、兜底节点）直接显示，避免它们永远画不出来
    if (r === undefined || r < shown) out.push({ ...link, t: 1 })
    else if (r === shown) out.push({ ...link, t: Math.max(0.04, frac) })
  }
  return out
})

// 横向网状关联：两端都画出来了才显示，避免动画期间出现「悬空」的虚线
const mindRefLinks = computed(() => {
  const links = layout.value.refLinks || []
  const cursor = drawCursor.value
  if (cursor === null) return links.map(link => ({ ...link, t: 1 }))
  const rank = drawRank.value
  const shown = Math.floor(cursor) + 1
  return links
    .map(link => {
      const [a, b] = String(link.id).replace(/^ref:/, '').split('~')
      const ra = rank.get(a)
      const rb = rank.get(b)
      const okA = ra === undefined || ra < shown
      const okB = rb === undefined || rb < shown
      return okA && okB ? { ...link, t: 1 } : null
    })
    .filter(Boolean)
})

// 播放绘制动画：节点多的时候自动加快，总时长封顶，不会让人为了看动画干等
function playDraw() {
  cancelAnimationFrame(drawRafId)
  // 只有思维导图（无限画布）视图才有「沿箭头一层层长出来」的绘制过程，其它视图直接全量渲染
  if (netView.value !== 'mind') { drawCursor.value = null; return }
  const total = drawOrder.value.length
  if (!total) { drawCursor.value = null; return }
  if (typeof window !== 'undefined' && window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    drawCursor.value = null
    return
  }
  const perStep = Math.max(48, Math.min(150, 3200 / total))
  const start = performance.now()
  drawCursor.value = 0
  const tick = now => {
    const cursor = (now - start) / perStep
    if (cursor >= total) { drawCursor.value = null; return }
    drawCursor.value = cursor
    drawRafId = requestAnimationFrame(tick)
  }
  drawRafId = requestAnimationFrame(tick)
}
// 聚焦某一系列时，其余条带淡化
function isBandFaded(key) {
  return netView.value === 'focus' && focusSeries.value !== '' && focusSeries.value !== key
}
// 横轴改真实日期：列刻度由 layout 里的全局日期刻度算出，与泳道横框交叉成网格
const axisTicks = computed(() => layout.value.axis?.ticks || [])
// 冻结时间轴：刻度按当前缩放/平移换算成屏幕坐标；标签太挤时自动抽稀，保证始终看得清
const axisStripTicks = computed(() => {
  const out = []
  for (const tick of axisTicks.value) {
    const screenX = tick.x * view.scale + view.tx
    if (out.length && screenX - out[out.length - 1].screenX < 36) continue
    out.push({ day: tick.day, label: tick.label, screenX })
  }
  return out
})
// 横轴两端：思维导图下按任务实际分布伸缩，条带视图保持固定宽度
const axisFromX = computed(() => layout.value.axis?.fromX ?? BAND_LEFT)
const axisToX = computed(() => layout.value.axis?.toX ?? BAND_RIGHT)

// ===== 依赖连线 =====
// 只画同一条系列内的直接前置依赖，跨条带一律不画（避免满天交叉虚线）
function buildDepLinks(list, sameSeriesOnly) {
  const pos = layout.value.pos
  const byId = new Map(nodes.value.map(n => [n.id, n]))
  const links = []
  for (const node of list) {
    for (const depId of node.deps || []) {
      const from = byId.get(depId)
      if (!from || from.id === node.id) continue
      if (sameSeriesOnly && seriesOf(from) !== seriesOf(node)) continue
      const a = pos.get(from.id)
      const b = pos.get(node.id)
      if (!a || !b) continue
      const dx = b.x - a.x
      const dy = b.y - a.y
      const dist = Math.max(1, Math.hypot(dx, dy))
      const ux = dx / dist
      const uy = dy / dist
      const x1 = a.x + ux * (nodeRadius(from) + 3)
      const y1 = a.y + uy * (nodeRadius(from) + 3)
      const x2 = b.x - ux * (nodeRadius(node) + 6)
      const y2 = b.y - uy * (nodeRadius(node) + 6)
      if (Math.hypot(x2 - x1, y2 - y1) < 2) continue
      links.push({ id: `${from.id}>${node.id}`, d: `M ${x1} ${y1} L ${x2} ${y2}`, aId: from.id, bId: node.id })
    }
  }
  return links
}
const depLinks = computed(() => buildDepLinks(visibleNodes.value, true))
// 悬浮时的临时连线：把跨系列依赖也画出来，移开即消失。
// 单独连一根线出来很容易看不懂（用户会问「这根线从别处连过来是啥意思」），
// 所以在线的中点补一句「前置 · XXX」/「后续 · XXX」，一眼看清方向与对面是谁
function shortNodeTitle(title) {
  const text = String(title || '').replace(/\s+/g, ' ').trim()
  return text.length > 12 ? `${text.slice(0, 12)}…` : text
}
const hoverDepLinks = computed(() => {
  if (!hoverId.value) return []
  const target = visibleNodes.value.find(n => n.id === hoverId.value)
  if (!target) return []
  const byId = new Map(visibleNodes.value.map(n => [n.id, n]))
  return buildDepLinks([target], false).map(link => {
    const from = byId.get(link.aId)
    const to = byId.get(link.bId)
    const incoming = link.bId === target.id
    const other = byId.get(incoming ? link.aId : link.bId)
    return {
      ...link,
      // 箭头永远指向「本任务」：指向它的那条是前置，从它出去的那条是后续
      label: `${incoming ? '前置' : '后续'} · ${shortNodeTitle(other?.title) || '关联任务'}`,
      mx: (from.x + to.x) / 2,
      my: (from.y + to.y) / 2
    }
  })
})

function neighborsOf(id) {
  const set = new Set([id])
  for (const link of depLinks.value) {
    if (link.aId === id) set.add(link.bId)
    if (link.bId === id) set.add(link.aId)
  }
  return set
}
function isDimmed(id) {
  if (!hoverId.value) return false
  const keep = neighborsOf(hoverId.value)
  keep.add(hoverId.value)
  return !keep.has(id)
}
function depOpacity(link) {
  if (!hoverId.value) return 0.72
  return link.aId === hoverId.value || link.bId === hoverId.value ? 0.95 : 0.1
}

// ===== 节点数据更新（布局由 series 条带确定性推导，不再保存坐标） =====
// 每次刷新都比对一次「节点快照」，把结果分成两类并给出醒目的亮色提示：
//   added   = 这次新长出来的节点 → 金色闪烁
//   updated = 这次内容被改写过的节点（标题 / 状态 / 日期 / 归属 / 载体等）→ 青色闪烁
// 只做局部提示，不重播整棵树的绘制动画，正在浏览的视图（平移 / 缩放 / 选中）完全不动
const NODE_DIFF_FIELDS = ['title', 'detail', 'risk', 'domain', 'kind', 'status', 'startDate', 'horizon', 'parentId', 'weight', 'progressNote', 'series', 'timeGroup', 'contentType', 'contentBody']
function nodeSnapshot(node) {
  return NODE_DIFF_FIELDS.map(key => (node?.[key] == null ? '' : String(node[key]))).join('\u0001')
}
function applyNodes(incoming) {
  const before = new Map(nodes.value.map(n => [String(n.id), nodeSnapshot(n)]))
  const isFirstLoad = !nodes.value.length
  const list = incoming.map(item => ({ ...item }))
  nodes.value = list
  if (isFirstLoad) return { added: [], updated: [] }
  const added = []
  const updated = []
  for (const node of list) {
    const key = String(node.id)
    if (!before.has(key)) { added.push(key); continue }
    if (before.get(key) !== nodeSnapshot(node)) updated.push(key)
  }
  flashNodeChanges({ added, updated })
  return { added, updated }
}

// 变更节点亮色闪烁：金色=新增、青色=已改写，4.2 秒后自动褪去，让人一眼看清「这次动了哪些地方」
const newNodeIds = ref(new Set())
const updatedNodeIds = ref(new Set())
let nodeFlashTimer = null
function nodeFlash(id) {
  const key = String(id)
  if (newNodeIds.value.has(key)) return 'new'
  if (updatedNodeIds.value.has(key)) return 'updated'
  return ''
}
function flashNodeChanges(payload) {
  if (nodeFlashTimer) { clearTimeout(nodeFlashTimer); nodeFlashTimer = null }
  const added = (payload?.added || []).map(String)
  const updated = (payload?.updated || []).map(String)
  if (!added.length && !updated.length) {
    newNodeIds.value = new Set()
    updatedNodeIds.value = new Set()
    return
  }
  newNodeIds.value = new Set(added)
  updatedNodeIds.value = new Set(updated)
  nodeFlashTimer = setTimeout(() => {
    newNodeIds.value = new Set()
    updatedNodeIds.value = new Set()
    nodeFlashTimer = null
  }, 4200)
}

// ===== 视图交互 =====
function svgPoint(event) {
  const svg = svgRef.value
  if (!svg) return { x: 0, y: 0 }
  const point = svg.createSVGPoint()
  point.x = event.clientX
  point.y = event.clientY
  return point.matrixTransform(svg.getScreenCTM().inverse())
}
function worldPoint(event) {
  const point = svgPoint(event)
  return { x: (point.x - view.tx) / view.scale, y: (point.y - view.ty) / view.scale }
}
function zoomBy(ratio) {
  hideTip()
  const pane = svgRef.value?.parentElement
  // 以可视区中心为缩放锚点：缩放前后中心指向的画布点不动，不会出现「放大后上面被顶出去够不着」
  const center = { x: (pane?.clientWidth || CANVAS.w) / 2, y: (pane?.clientHeight || CANVAS.h) / 2 }
  const next = Math.max(MIN_SCALE, Math.min(MAX_SCALE, view.scale * ratio))
  view.tx = center.x - (center.x - view.tx) * (next / view.scale)
  view.ty = center.y - (center.y - view.ty) * (next / view.scale)
  view.scale = next
  viewTouched = true
  clampView()
}
function resetView() {
  view.scale = 1
  view.tx = 0
  view.ty = 0
  viewTouched = true
  clampView()
}
// 无限画布：允许往四周多拖一点空白（PAN_PAD），但不会把内容拖丢 —— 任何位置都还能拖回来
const PAN_PAD = 220
function clampView() {
  const pane = svgRef.value?.parentElement
  if (!pane) return
  const contentW = (layout.value.canvasW || CANVAS.w) * view.scale
  const contentH = (layout.value.canvasH || CANVAS.h) * view.scale
  view.tx = Math.min(PAN_PAD, Math.max(pane.clientWidth - contentW - PAN_PAD, view.tx))
  view.ty = Math.min(PAN_PAD, Math.max(pane.clientHeight - contentH - PAN_PAD, view.ty))
}
// 「下一个节点」的遍历顺序＝画布上的视觉顺序（从上到下、从左到右），
// 不是数据库顺序，这样连点按钮就是顺着图一棵一棵往下看
const navOrder = computed(() => [...visibleNodes.value].sort((a, b) => (a.y - b.y) || (a.x - b.x)))
const navIndex = computed(() => navOrder.value.findIndex(item => String(item.id) === String(focusCursor.value)))
// 全屏：把承载无限画布的那一整块（含冻结首行时间轴）铺满浏览器，等于给画布更大的可视区
async function toggleFullscreen() {
  const el = canvasWrap.value
  if (!el) return
  try {
    if (document.fullscreenElement) await document.exitFullscreen()
    else await el.requestFullscreen()
  } catch (e) {
    toast('当前浏览器不允许全屏，可以试试按 F11', 'warning')
  }
}
// 浏览器全屏状态变化（含按 Esc 退出）时同步按钮图标，并重算一次视图，把整棵树放进新的可视区
function onFullscreenChange() {
  isFullscreen.value = document.fullscreenElement === canvasWrap.value
  nextTick(() => {
    viewTouched = false
    fitView()
  })
}
// 把某个节点移到可视区正中：用当前缩放换算，缩放太小（节点还看不清）时抬到可读倍率
function centerOnNode(target) {
  const pane = svgRef.value?.parentElement
  if (!pane || !target) return
  if (view.scale < 0.6) view.scale = 0.9
  view.tx = pane.clientWidth / 2 - target.x * view.scale
  view.ty = pane.clientHeight / 2 - target.y * view.scale
  clampView()
}
function focusNextNode() {
  const order = navOrder.value
  if (!order.length) return
  hideTip()
  const at = order.findIndex(item => String(item.id) === String(focusCursor.value))
  const next = order[(at + 1) % order.length]
  focusCursor.value = String(next.id)
  selectedId.value = String(next.id)
  centerOnNode(next)
  viewTouched = true
}

// 画布是无限画布，装载时按「适配宽度」把整棵树放进可视区（缩放下限见 MIN_SCALE）；
// 用户一旦手动平移缩放过，就不再自动干预
let viewTouched = false
function fitView() {
  const pane = svgRef.value?.parentElement
  if (!pane) return
  const cw = layout.value.canvasW || CANVAS.w
  const ch = layout.value.canvasH || CANVAS.h
  const fit = cw > 0 ? pane.clientWidth / cw : 1
  view.scale = Math.max(MIN_SCALE, Math.min(1, fit))
  view.tx = 0
  view.ty = 0
  // 纵向也尽量把内容放进可视区，放不下就贴顶显示
  if (ch * view.scale < pane.clientHeight) view.ty = (pane.clientHeight - ch * view.scale) / 2
  clampView()
}
watch(
  () => [`${layout.value.canvasW}`, `${layout.value.canvasH}`, activeTab.value, netView.value].join('|'),
  async () => {
    if (viewTouched || activeTab.value !== 'network') return
    await nextTick()
    fitView()
  },
  { flush: 'post' }
)
// 左侧「人物画像」里点「看推演子图」：展开该节点的全部祖先 + 居中 + 选中，让右侧画布直接跳到这条路径的推演子图
async function focusLifePath(nodeId) {
  const id = String(nodeId || '')
  if (!id) return
  const byId = new Map(nodes.value.map(node => [String(node.id), node]))
  if (!byId.has(id)) {
    toast.info('这条路径对应的推演子图还没出现在规划网络里，先在对话里让 AI 展开')
    return
  }
  const next = new Set(collapsedIds.value)
  const guard = new Set()
  let cursor = byId.get(id)
  while (cursor && !guard.has(String(cursor.id))) {
    guard.add(String(cursor.id))
    next.delete(String(cursor.id))
    cursor = byId.get(String(cursor.parentId || ''))
  }
  collapsedIds.value = next
  await nextTick()
  const target = visibleNodes.value.find(node => String(node.id) === id)
  if (!target) return
  selectedId.value = id
  focusCursor.value = id
  centerOnNode(target)
  viewTouched = true
}

// 画像 / 路径库有改动：刷新重点提醒即可，节点不用重拉
function onPersonaChanged() {
  loadAlerts()
  // 画像/路径库有改动 → 同步刷新画布大脑右侧那张画像卡片上的摘要数字
  loadPersonaSummary()
}

function onWheel(event) {
  // 普通滚轮＝上下平移整张画布（无限画布没有滚动条，滚轮就是上下移动）；Ctrl/⌘ + 滚轮才缩放
  if (!event.ctrlKey && !event.metaKey) {
    event.preventDefault()
    hideTip()
    view.ty -= event.deltaY
    if (event.shiftKey) view.tx -= event.deltaY
    viewTouched = true
    clampView()
    return
  }
  event.preventDefault()
  hideTip() // 缩放后浮层位置会失准，直接收起
  const point = svgPoint(event)
  const ratio = event.deltaY < 0 ? 1.12 : 1 / 1.12
  const next = Math.max(MIN_SCALE, Math.min(MAX_SCALE, view.scale * ratio))
  view.tx = point.x - (point.x - view.tx) * (next / view.scale)
  view.ty = point.y - (point.y - view.ty) * (next / view.scale)
  view.scale = next
  viewTouched = true
  clampView()
}
// 冻结时间轴上的滚轮：普通滚轮上下平移画布，Ctrl/⌘ + 滚轮横向锚定缩放
function onStripWheel(event) {
  const box = svgRef.value?.getBoundingClientRect()
  if (!event.ctrlKey && !event.metaKey) {
    event.preventDefault()
    view.ty -= event.deltaY
    viewTouched = true
    clampView()
    return
  }
  event.preventDefault()
  hideTip()
  const ratio = event.deltaY < 0 ? 1.12 : 1 / 1.12
  const next = Math.max(MIN_SCALE, Math.min(MAX_SCALE, view.scale * ratio))
  const localX = event.clientX - (box?.left ?? 0)
  const anchorX = (localX - view.tx) / view.scale
  view.tx = localX - anchorX * next
  view.scale = next
  viewTouched = true
  clampView()
}
let panState = null
function onCanvasPointerDown(event) {
  if (event.target.closest('.life-node')) return
  hideTip()
  panState = { x: event.clientX, y: event.clientY, tx: view.tx, ty: view.ty }
  panning.value = true
  selectedId.value = ''
  window.addEventListener('pointermove', onPanMove)
  window.addEventListener('pointerup', onPanUp)
}
function onPanMove(event) {
  if (!panState) return
  // 上下左右都能拖：无限画布想看点哪里就拖哪里
  view.tx = panState.tx + (event.clientX - panState.x)
  view.ty = panState.ty + (event.clientY - panState.y)
  viewTouched = true
  clampView()
}
function onPanUp() {
  panState = null
  panning.value = false
  window.removeEventListener('pointermove', onPanMove)
  window.removeEventListener('pointerup', onPanUp)
}

// ===== 数据加载 =====
async function loadAll() {
  try {
    const [plan, chat] = await Promise.all([lifeApi.getPlan(), lifeApi.getChat()])
    messages.value = chat.messages || []
    applyNodes(plan.nodes || [])
    await scrollChatToBottom()
  } catch (error) {
    toast(error?.response?.data?.error || '规划数据加载失败', 'error')
  } finally {
    loading.value = false
  }
  // 数据到位后播放一次「绘制过程」：从大脑开始一层层长出赛道与任务
  await nextTick()
  playDraw()
}

async function scrollChatToBottom() {
  await nextTick()
  const el = chatListRef.value
  if (el) el.scrollTop = el.scrollHeight
}

// ===== 对话 =====
// 消息正文解析：把 Mermaid 代码块拆成独立片段，其余按文本渲染
// 结果按消息 id 缓存，避免模板每次渲染都重复解析、产生新片段标识
const parsedCache = new Map()
const mermaidCode = new Map()
const mermaidState = reactive({})
let mermaidLib = null

// 「思考过程」展开状态：生成中默认展开，回答完成即收起，点标题可再次展开
const traceOpen = reactive(new Set())

function hasTrace(msg) {
  return Boolean(msg?.steps?.length || msg?.reasoning || msg?.search || msg?.searchError)
}

function toggleTrace(msg) {
  if (!msg?.id) return
  if (traceOpen.has(msg.id)) traceOpen.delete(msg.id)
  else traceOpen.add(msg.id)
}

// Markdown 表格分隔行，例如 | --- | --- | --- | --- | --- |
const TABLE_SEP = /^\s*\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)+\|?\s*$/

function splitCells(line) {
  let value = String(line || '').trim()
  if (value.startsWith('|')) value = value.slice(1)
  if (value.endsWith('|')) value = value.slice(0, -1)
  return value.split('|').map(cell => cell.trim())
}

// 至少三段才是表格行；普通句子里偶然出现的单个竖线不算
function isTableRow(line) {
  const value = String(line || '').trim()
  return value.includes('|') && value.split('|').length >= 3
}

// 机器载荷：这几块是给后端解析画布操作、检索账单用的内部协议，用户明确表示不想看到，
// 因此在渲染前整段剔除（含它的标题与后面的代码块）。剔除只影响展示，后端仍拿到完整原文做解析。
const PROTOCOL_SECTION = /【(?:画布更新指令|本轮待检索账单清单|本轮待检索账单)】[\s\S]*?(?=\n【|$)/g
function stripProtocol(text) {
  return String(text || '').replace(PROTOCOL_SECTION, '').replace(/\n{3,}/g, '\n\n').replace(/^\s*\n/, '').trimEnd()
}

function escapeHtml(text) {
  return String(text).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

// 轻量内联 Markdown：只认最常出现的加粗、行内代码、链接、【小标题】与列表符号。
// 先整体转义再插入标签，模型输出里的原始 HTML 不会被执行。
function inlineMarkdown(text) {
  const escaped = escapeHtml(text)
    .replace(/`([^`\n]+)`/g, '<code class="rounded border border-slate-200 bg-white px-1 py-0.5 text-[12px] text-indigo-600">$1</code>')
    .replace(/\*\*([^*\n]+)\*\*/g, '<strong class="font-semibold text-slate-800">$1</strong>')
    .replace(/\[([^\]\n]+)\]\((https?:\/\/[^)\s]+)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer" class="text-primary underline decoration-primary/30 underline-offset-2">$1</a>')
  return escaped
    .split('\n')
    .map(line => {
      const trimmed = line.trim()
      const heading = trimmed.match(/^#{1,6}\s+(.+)$/)
      if (heading) return `<span class="mt-2 inline-block font-semibold text-slate-800">${heading[1]}</span>`
      const title = trimmed.match(/^【(.+?)】$/)
      if (title) return `<span class="mt-2 inline-block font-semibold text-slate-800">${title[1]}</span>`
      if (/^[-*]\s+/.test(trimmed)) return `<span class="text-indigo-400">·</span> ${trimmed.replace(/^[-*]\s+/, '')}`
      return line
    })
    .join('\n')
}

// 段落文字里挑出 Markdown 表格：表头行 + 分隔行 + 连续数据行，其余按内联 Markdown 渲染
function splitTextParts(text) {
  const lines = String(text || '').split('\n')
  const parts = []
  let buffer = []
  const flushText = () => {
    if (buffer.length) {
      const value = buffer.join('\n')
      parts.push({ type: 'text', value, html: inlineMarkdown(value) })
      buffer = []
    }
  }
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    if (isTableRow(line) && i + 1 < lines.length && TABLE_SEP.test(lines[i + 1])) {
      const head = splitCells(line)
      const rows = []
      let j = i + 2
      while (j < lines.length && isTableRow(lines[j])) {
        rows.push(splitCells(lines[j]))
        j += 1
      }
      if (rows.length) {
        flushText()
        parts.push({ type: 'table', head, rows })
        i = j - 1
        continue
      }
    }
    buffer.push(line)
  }
  flushText()
  return parts
}

// 优先级与重复类型上色，让任务清单一眼看出轻重缓急、哪些是每天都要做的
const BADGE = 'rounded px-1.5 py-0.5 text-[10px] font-semibold'
const PRIORITY_CLASS = {
  P0: `${BADGE} bg-rose-50 text-rose-600`,
  P1: `${BADGE} bg-amber-50 text-amber-600`,
  P2: `${BADGE} bg-sky-50 text-sky-600`,
  P3: `${BADGE} bg-slate-100 text-slate-500`,
  高: `${BADGE} bg-rose-50 text-rose-600`,
  中: `${BADGE} bg-amber-50 text-amber-600`,
  低: `${BADGE} bg-slate-100 text-slate-500`
}
const REPEAT_CLASS = {
  每日重复: `${BADGE} bg-indigo-50 text-indigo-600`,
  每周重复: `${BADGE} bg-violet-50 text-violet-600`,
  工作日重复: `${BADGE} bg-teal-50 text-teal-600`,
  单次: `${BADGE} bg-slate-100 text-slate-500`
}

function cellClass(head, index, cell) {
  const title = String(head?.[index] || '')
  const value = String(cell || '').trim()
  if (title.includes('优先级')) return PRIORITY_CLASS[value] || ''
  if (title.includes('重复')) return REPEAT_CLASS[value] || ''
  return ''
}

function buildMessageParts(key, msg) {
  const text = stripProtocol(msg?.content)
  const parts = []
  // 语言标记后面可能带空格（模型偶尔写成 "``` mermaid"），这里都容错
  const pattern = /```[ \t]*([a-zA-Z]*)[ \t]*\n?([\s\S]*?)```/g
  let cursor = 0
  let match
  let seq = 0
  while ((match = pattern.exec(text))) {
    if (match.index > cursor) parts.push(...splitTextParts(text.slice(cursor, match.index)))
    const lang = String(match[1] || '').toLowerCase()
    const code = String(match[2] || '').trim()
    if (code) {
      // 裸 JSON 载荷（可能是模型漏了【画布更新指令】标题直接贴出来的）同样不给用户看
      const isOpsPayload = lang === 'json' && /"(op|nodes|op_queue_search)"\s*:/.test(code)
      if (lang === 'mermaid') {
        const id = `${key || 'msg'}-mmd-${seq++}`
        mermaidCode.set(id, code)
        parts.push({ type: 'mermaid', id, value: code })
      } else if (!isOpsPayload) {
        parts.push({ type: 'code', lang, value: code })
      }
    }
    cursor = match.index + match[0].length
  }
  if (cursor < text.length) parts.push(...splitTextParts(text.slice(cursor)))
  return parts.length ? parts : [{ type: 'text', value: text, html: inlineMarkdown(text) }]
}

function parseMessage(msg) {
  const key = String(msg?.id || '')
  // 流式生成期间正文会持续变化，按 id 缓存失效处理
  if (msg?.streaming) return buildMessageParts(key, msg)
  if (parsedCache.has(key)) return parsedCache.get(key)
  const result = buildMessageParts(key, msg)
  parsedCache.set(key, result)
  return result
}

// Mermaid 按需加载，不进入首屏包；主题与会话气泡背景保持一致
async function ensureMermaid() {
  if (!mermaidLib) {
    const mod = await import('mermaid')
    mermaidLib = mod.default
    // 主题色与页面一致：靛蓝节点 + 石板灰文字，比默认 neutral 更贴合整页风格
    mermaidLib.initialize({
      startOnLoad: false,
      theme: 'base',
      securityLevel: 'strict',
      fontFamily: 'inherit',
      themeVariables: {
        fontSize: '13px',
        primaryColor: '#eef2ff',
        primaryBorderColor: '#c7d2fe',
        primaryTextColor: '#334155',
        lineColor: '#a5b4fc',
        arrowheadColor: '#a5b4fc'
      },
      flowchart: { useMaxWidth: true, padding: 12 }
    })
  }
  return mermaidLib
}

// 渲染页面中尚未处理的 Mermaid 图形块；失败时保留代码展示，不影响阅读
async function renderMermaidBlocks() {
  const targets = document.querySelectorAll('[data-mermaid-id]')
  for (const el of targets) {
    const id = el.getAttribute('data-mermaid-id') || ''
    if (!id || el.getAttribute('data-rendered') === '1') continue
    const code = mermaidCode.get(id)
    if (!code) continue
    el.setAttribute('data-rendered', '1')
    mermaidState[id] = 'pending'
    try {
      const mermaid = await ensureMermaid()
      const { svg } = await mermaid.render(`mmd-svg-${id}`, code)
      el.innerHTML = svg
      mermaidState[id] = 'ok'
    } catch (_) {
      el.innerHTML = ''
      mermaidState[id] = 'failed'
    }
  }
}

// 消息更新后重新绘制其中的规划网络图
watch(messages, async () => {
  await nextTick()
  renderMermaidBlocks()
}, { deep: true })

async function copyText(text) {
  const value = String(text || '')
  if (!value) return
  try {
    await navigator.clipboard.writeText(value)
    toast('已复制到剪贴板', 'success')
  } catch (_) {
    toast('复制失败，请手动选择文本复制', 'error')
  }
}

// 复制单条消息到剪贴板
async function copyMessage(msg) {
  await copyText(msg?.content)
}

// 就某条回复继续追问：把该回复摘要作为引用预填进输入框，用户补充后自行发送
function followUp(msg) {
  const text = String(msg?.content || '').replace(/\s+/g, ' ').trim()
  if (!text) return
  const brief = text.length > 60 ? `${text.slice(0, 60)}…` : text
  draft.value = draft.value.trim() ? `${draft.value}\n关于你上面说的「${brief}」，我的想法是：` : `关于你上面说的「${brief}」，我的想法是：`
  nextTick(() => {
    const el = draftRef.value
    if (!el) return
    el.focus()
    el.setSelectionRange(el.value.length, el.value.length)
  })
}

function onDraftKeydown(event) {
  if (event.key === 'Enter' && !event.shiftKey && !event.isComposing) {
    event.preventDefault()
    send()
  }
}

async function send() {
  const text = draft.value.trim()
  if (!text || busy.value) return
  messages.value.push({ id: `local-${Date.now()}`, role: 'user', content: text })
  draft.value = ''
  sending.value = true

  // 先占位一条助手消息，边生成边把过程事件写进去
  const live = reactive({
    id: `local-a-${Date.now()}`,
    role: 'assistant',
    content: '',
    steps: [],
    reasoning: '',
    search: null,
    searchError: '',
    streaming: true
  })
  messages.value.push(live)
  traceOpen.add(live.id)
  await scrollChatToBottom()
  // 从这一刻起画布就进入「正在更新中」状态：整轮（生成回复 → 文本同步进规划网络 → 拉取最新节点）
  // 全程都显示提示，用户不用点「重新生成规划」也能确认它确实在更新
  updating.value = true

  try {
    // 后端在「文本同步进规划网络」完成后会回传 plan 事件，用它判断画布该何时刷新
    let planApplied = null
    let editOnlyFlag = false
    const result = await lifeApi.sendStream(text, event => {
      if (!event || !event.type) return
      if (event.type === 'stage') {
        live.steps.push({ key: event.key || '', label: event.label || '', status: event.status || 'ok' })
      } else if (event.type === 'thinking') {
        live.reasoning = String(event.text || '')
      } else if (event.type === 'search') {
        const step = [...live.steps].reverse().find(item => item.key === 'searching')
        if (step) step.label = `已检索到 ${event.count} 篇资料 · ${event.provider}${event.cached ? ' · 缓存' : ''}`
        live.search = {
          provider: event.provider,
          cached: event.cached,
          count: event.count,
          query: event.query,
          sources: event.sources
        }
      } else if (event.type === 'plan') {
        planApplied = Number(event.applied || 0)
      } else if (event.type === 'done') {
        // 立刻上屏：后面还要等「文本同步进规划网络」完成，不能把回复拖到那时才显示
        live.content = event.reply || live.content
        live.search = event.search || live.search
        live.searchError = event.searchError || ''
        if (event.reasoning) live.reasoning = event.reasoning
        if (event.editOnly) editOnlyFlag = true
        live.streaming = false
      }
      nextTick(scrollChatToBottom)
    })
    live.content = result.reply || '导师没有返回内容'
    live.search = result.search || live.search
    live.searchError = result.searchError || ''
    if (result.reasoning) live.reasoning = result.reasoning
    // 修改类指令：本次不联网，直接改规划网络（过程区明确写一句，避免你以为它又去查资料了）
    if ((result.editOnly || editOnlyFlag) && !live.steps.some(step => step.key === 'editOnly')) {
      live.steps.push({
        key: 'editOnly',
        label: '这是修改规划的指令：直接调整规划网络，本次未联网检索',
        status: 'skipped'
      })
    }
    if (Array.isArray(result.queuedSearch) && result.queuedSearch.length) {
      live.steps.push({
        key: 'queued',
        label: `${result.queuedSearch.length} 条检索需求已转入待审批队列：${result.queuedSearch.join('、')}`,
        status: 'skipped'
      })
    }
    live.streaming = false
    traceOpen.delete(live.id) // 回答完成即收起过程，点标题可再次展开
    if (planApplied === null) {
      // 没收到「同步完成」事件（连接被中途掐断、或同步比预期更慢）时的兜底：
      // 以前只等 1.5 秒抓一次就收工，抓到的还是同步前的旧节点，画布看着什么都没变、
      // 只能手动点「重新生成规划」才出数据。改成有界轮询，直到后端真把本轮回复写进规划网络
      const changed = await refreshPlanUntilChanged()
      if (!changed) toast('本轮没有产生规划变更；如需重建整棵规划树，可点「重新生成规划」', 'info', 6000)
    } else {
      // 同步已完成，直接拉最新节点与任务，不再盲等固定时长
      await refreshNodesAndTasks()
      panelToken.value += 1
      loadAlerts()
      // 无痛更新：本次新增/改写的节点由 applyNodes 自动打亮色闪烁，
      // 不重播整棵树的绘制动画、不重设视图，你正在看的位置不会被拽走
      if (planApplied > 0) toast(`已把本轮回复同步进规划网络（${planApplied} 项调整）`, 'success')
    }
  } catch (error) {
    live.streaming = false
    live.content = error?.message || 'AI 暂时不可用，请稍后再试'
    traceOpen.delete(live.id)
  } finally {
    sending.value = false
    updating.value = false
    await scrollChatToBottom()
  }
}

// 面板写库后同步刷新：规划节点 + 每日任务（画布与人生推演树都依赖这两份数据）
// 返回本次 { added, updated }，闪烁提示由 applyNodes 内部完成，这里不重设视图
async function refreshNodesAndTasks(silent = false) {
  try {
    const [plan, taskData] = await Promise.all([
      lifeApi.getPlan(),
      lifeApi.getTasks({ from: lifeShiftToday(-7), to: lifeShiftToday(30) }).catch(() => ({ tasks: [] }))
    ])
    const diff = applyNodes(plan.nodes || [])
    treeTasks.value = taskData.tasks || []
    // 右侧规划一变就重算左侧动态画像：后端按完成度指纹判重，没实质变化不会重复调模型。
    // silent=true 用于轮询兜底：每轮都触发一次重算太浪费，等画布真出现变化再重算
    if (!silent) refreshPersonaDerived('规划刷新')
    return diff
  } catch (_) { return { added: [], updated: [] } }   /* 增量刷新失败不打断面板操作 */
}

// 动态画像重算（不阻塞主流程）：防抖 1.5 秒合并连续改动，完成后重拉画像摘要，
// 保证「右侧规划改动 → 左侧人物画像跟着一直变」
let personaDeriveTimer = null
let personaDeriveInFlight = false
function refreshPersonaDerived(reason = '规划刷新') {
  if (personaDeriveTimer) clearTimeout(personaDeriveTimer)
  personaDeriveTimer = setTimeout(() => { runPersonaDerive(reason) }, 1500)
}
async function runPersonaDerive(reason) {
  if (personaDeriveInFlight) { refreshPersonaDerived(reason); return }
  personaDeriveInFlight = true
  try {
    await lifeApi.refreshPersonaDerived(reason)
    await loadPersonaSummary()
  } catch (_) { /* 画像重算失败保留上一版，不打断任何操作 */ } finally { personaDeriveInFlight = false }
}

// 收不到「同步完成」事件时的兜底刷新：后端写完规划网络可能要几十秒，
// 只抓一次多半抓到旧数据，所以每 4 秒拉一次，直到画布真的出现新增/改写，或超过 100 秒放弃。
// 轮询期间保持 updating=true（界面继续显示「正在更新中」），用户不用手动点任何按钮。
async function refreshPlanUntilChanged() {
  updating.value = true
  try {
    for (let attempt = 0; attempt < 25; attempt++) {
      if (attempt) await new Promise(resolve => setTimeout(resolve, 4000))
      const diff = await refreshNodesAndTasks(true)
      if (diff.added.length || diff.updated.length) {
        panelToken.value += 1
        loadAlerts()
        refreshPersonaDerived('规划刷新')
        return true
      }
    }
    return false
  } finally {
    updating.value = false
  }
}

async function regenerate() {
  if (busy.value || !messages.value.length) return
  regenerating.value = true
  updating.value = true
  try {
    const result = await lifeApi.regenerate()
    applyNodes(result.nodes || [])
    panelToken.value += 1
    loadAlerts()
    // 输出两部分：①自然语言规划解读已写入对话流，随后端一起刷新会话，用户可直接看到本次解读
    if (result.summary) {
      const chat = await lifeApi.getChat().catch(() => null)
      if (chat) messages.value = chat.messages || []
    }
    toast('已根据全部对话重新生成规划网络', 'success')
    // 重生成后重新播一遍绘制过程，直观看到整棵树被重新推演一遍
    await nextTick()
    playDraw()
    // 规划全量重建后，左侧动态画像同步跟着重算（后端按完成度指纹判重，避免重复调模型）
    refreshPersonaDerived('重新生成规划')
  } catch (error) {
    toast(error?.response?.data?.error || '重新生成失败', 'error')
  } finally {
    regenerating.value = false
    updating.value = false
  }
}

async function clearChat() {
  if (busy.value || !messages.value.length) return
  try {
    await lifeApi.clearChat()
    messages.value = []
    toast('对话记录已清空，规划节点保留', 'success')
  } catch (error) {
    toast(error?.response?.data?.error || '清空失败', 'error')
  }
}

// ===== 节点编辑 =====
function openCreateNode() {
  editing.value = { id: '' }
  Object.assign(form, {
    title: '',
    detail: '',
    risk: '',
    domain: nodes.value.find(n => n.kind === 'self')?.domain || '成长',
    kind: 'goal',
    status: 'todo',
    startDate: '',
    horizon: '',
    parentId: selectedId.value || String(nodes.value.find(n => n.kind === 'self')?.id || ''),
    weight: 60,
    progressNote: ''
  })
  confirmDelete.value = false
  nextTick(() => dialogRef.value?.focus())
}

function openEditNode(node) {
  if (!node) return
  editing.value = { id: node.id, source: node.source }
  Object.assign(form, {
    title: node.title || '',
    detail: node.detail || '',
    risk: node.risk || '',
    domain: node.domain || '成长',
    kind: node.kind || 'goal',
    status: node.status || 'todo',
    startDate: node.startDate || '',
    horizon: node.horizon || '',
    parentId: node.parentId || '',
    weight: Number(node.weight) || 50,
    progressNote: node.progressNote || ''
  })
  confirmDelete.value = false
  nextTick(() => dialogRef.value?.focus())
}

function closeEdit() {
  editing.value = null
  confirmDelete.value = false
}

async function saveNode() {
  if (saving.value) return
  // 按钮不再因为标题为空而变灰（那会让人以为按钮坏了）；点下去若没填标题就明确提示
  if (!form.title.trim()) { toast('请先填写标题', 'warning'); return }
  saving.value = true
  const payload = {
    title: form.title.trim(),
    detail: form.detail.trim(),
    risk: form.risk.trim(),
    domain: form.domain,
    kind: form.kind,
    status: form.status,
    startDate: form.startDate.trim(),
    horizon: form.horizon.trim(),
    parentId: form.parentId || '',
    weight: Number(form.weight) || 50,
    progressNote: form.progressNote.trim()
  }
  try {
    const result = editing.value.id
      ? await lifeApi.updateNode(editing.value.id, payload)
      : await lifeApi.createNode(payload)
    applyNodes(result.nodes || [])
    toast(editing.value.id ? '节点已更新' : '节点已创建', 'success')
    refreshPersonaDerived('节点变更')
    closeEdit()
  } catch (error) {
    toast(error?.response?.data?.error || '保存失败', 'error')
  } finally {
    saving.value = false
  }
}

// 「不要了」小减号：删掉这个节点与它下面挂的全部任务，并把它们的标题登记进「不要了」清单
// —— 之后 AI 更新规划不会再自动加回，除非你在对话里点名要它，或自己手动新增同名节点（新增会自动解除登记）
async function rejectNode(node) {
  if (!node || busy.value) return
  const name = String(node.title || '').trim() || '这个节点'
  if (!window.confirm(`不要了：删掉「${name}」以及它下面挂的全部任务？\n之后 AI 更新规划不会再自动把它加回来。`)) return
  updating.value = true
  try {
    const result = await lifeApi.deleteNode(node.id)
    if (String(selectedId.value) === String(node.id)) selectedId.value = ''
    applyNodes(result.nodes || [])
    panelToken.value += 1
    loadAlerts()
    refreshPersonaDerived('节点删除')
    toast('已移出规划，后续不会再自动加回', 'success')
  } catch (error) {
    toast(error?.response?.data?.error || '删除失败', 'error')
  } finally {
    updating.value = false
  }
}

// 一键清除（测试用）：清空规划网络的全部数据
// 清掉：节点、每日任务、快照、精力记录、日历事件、变更日志，以及「不要了」清单
// 保留：个人档案、与 AI 的对话记录
async function clearPlanData() {
  if (busy.value || !nodes.value.length) return
  if (!window.confirm('一键清除规划网络的全部数据？\n将清空：节点、每日任务、快照、精力记录、日历事件、变更日志，以及「不要了」清单。\n个人档案与对话记录会保留。此操作不可撤销。')) return
  updating.value = true
  try {
    const result = await lifeApi.clearPlan()
    selectedId.value = ''
    applyNodes(result.nodes || [])
    panelToken.value += 1
    loadAlerts()
    toast('规划数据已全部清除', 'success')
  } catch (error) {
    toast(error?.response?.data?.error || '清除失败', 'error')
  } finally {
    updating.value = false
  }
}

// 彻底重置（清干净重新输入训练）：
// 清掉整个模块的全部数据 —— 节点、每日任务、快照、精力、日历、变更日志、「不要了」清单、
// 人物画像（含动态画像）、路径库、技能 / 知识 / 事件、检索记录，以及全部对话记录；
// 清完之后只留「大脑」锚点，可以直接重新开一段对话输入。
async function resetAllLifeData() {
  if (busy.value) return
  if (!window.confirm('彻底清空人生规划模块的全部数据？\n将清空：规划节点、每日任务、进度快照、精力记录、日历事件、变更日志、「不要了」清单、人物画像（含动态画像）、未来发展路径库、技能档案、知识/错题库、检索记录，以及全部对话记录。\n清完只剩「大脑」锚点，可直接重新对话输入训练。此操作不可撤销。')) return
  updating.value = true
  try {
    const result = await lifeApi.clearAllLifeData()
    selectedId.value = ''
    messages.value = []
    treeTasks.value = []
    personaProfile.value = { filled: 0, dims: [], paths: [], derived: [], derivedAt: 0 }
    applyNodes(result.nodes || [])
    panelToken.value += 1
    loadAlerts()
    toast('模块数据已全部清空，可以重新开始对话输入了', 'success')
  } catch (error) {
    toast(error?.response?.data?.error || '清空失败', 'error')
  } finally {
    updating.value = false
  }
}

async function deleteNode() {
  if (!editing.value?.id) return
  saving.value = true
  try {
    const result = await lifeApi.deleteNode(editing.value.id)
    selectedId.value = ''
    applyNodes(result.nodes || [])
    toast('节点已删除', 'success')
    refreshPersonaDerived('节点删除')
    closeEdit()
  } catch (error) {
    toast(error?.response?.data?.error || '删除失败', 'error')
  } finally {
    saving.value = false
  }
}

// ===== 模型选择（与设置里的板块模型分配共用 ai_model_routes.life）=====
function parseRoutes(raw) {
  try {
    const parsed = JSON.parse(raw || '{}')
    return parsed && typeof parsed === 'object' ? parsed : {}
  } catch (_) {
    return {}
  }
}

async function loadModelSettings() {
  try {
    const settings = await aiSettingsApi.getSettings()
    let custom = []
    try {
      const list = JSON.parse(settings?.ai_custom_models || '[]')
      custom = Array.isArray(list) ? list : []
    } catch (_) { custom = [] }
    let catalog = {}
    try {
      const saved = JSON.parse(settings?.ai_model_catalog || '{}')
      catalog = saved && typeof saved === 'object' && !Array.isArray(saved) ? saved : {}
    } catch (_) { catalog = {} }
    modelOptions.value = buildModelOptions(custom, catalog)
    modelGroups.value = buildModelGroups(custom, catalog)
    const routes = parseRoutes(settings?.ai_model_routes)
    const saved = [routes.life, routes.assistant, settings?.default_model]
      .find(model => model && modelOptions.value.includes(model))
    activeModel.value = saved || modelOptions.value[0] || ''
  } catch (_) {
    // 设置读取失败不影响对话，保持默认模型即可
  }
}

async function saveModel() {
  if (!activeModel.value) return
  try {
    const settings = await aiSettingsApi.getSettings()
    const routes = parseRoutes(settings?.ai_model_routes)
    // 读-改-写：只覆盖 life 键，避免清掉其它板块的模型路由
    routes.life = activeModel.value
    await aiSettingsApi.updateSettings({ ai_model_routes: JSON.stringify(routes) })
    toast(`人生规划已切换到 ${activeModel.value}`, 'success')
  } catch (error) {
    toast(error?.response?.data?.error || '模型切换失败', 'error')
  }
}

// ===== 模型下拉 =====
const GROUP_COLORS = ['#6366f1', '#0ea5e9', '#10b981', '#f59e0b', '#f43f5e', '#8b5cf6', '#14b8a6']

// 厂商配色：按 id 稳定取色，同一厂商每次打开颜色一致
function groupColor(id) {
  const key = String(id || '')
  let sum = 0
  for (let i = 0; i < key.length; i++) sum = (sum + key.charCodeAt(i) * (i + 7)) % 997
  return GROUP_COLORS[sum % GROUP_COLORS.length]
}

function closeModelMenu() {
  modelMenuOpen.value = false
}

function toggleModelMenu() {
  if (busy.value) return
  if (modelMenuOpen.value) {
    closeModelMenu()
    return
  }
  const rect = modelBtnRef.value?.getBoundingClientRect()
  if (!rect) return
  const width = Math.max(260, Math.round(rect.width))
  modelMenuStyle.width = `${width}px`
  modelMenuStyle.left = `${Math.min(Math.max(8, Math.round(rect.left)), Math.max(8, window.innerWidth - width - 8))}px`
  modelMenuStyle.bottom = `${Math.round(window.innerHeight - rect.top + 6)}px`
  modelMenuOpen.value = true
}

function selectModel(model) {
  closeModelMenu()
  if (!model || model === activeModel.value) return
  activeModel.value = model
  saveModel()
}

// 点击下拉之外的区域即收起（符合「失去焦点自动收起」的习惯）
function onModelMenuPointerDown(event) {
  if (!modelMenuOpen.value) return
  if (modelMenuRef.value?.contains(event.target) || modelBtnRef.value?.contains(event.target)) return
  closeModelMenu()
}

// 窗口尺寸变化时固定定位失效，直接收起
function onModelMenuViewportChange() {
  if (modelMenuOpen.value) closeModelMenu()
}

// 页面滚动同样会让固定定位失效，需收起；但下拉自身列表（.life-menu-scroll）的滚动必须放行，
// 否则用户一滚动选项列表菜单就会消失
function onModelMenuScroll(event) {
  if (!modelMenuOpen.value) return
  if (modelMenuRef.value?.contains(event.target)) return
  closeModelMenu()
}

// ===== 可用高度实测：不依赖对顶部留白/表头高度的硬编码估算 =====
// 宽屏（两栏）时按「视口高度 - 网格在文档中的实际顶部位置 - 底部留白」计算，
// 随后按实际溢出量逐次收缩（只减不增，避免来回震荡），确保整页不出现滚动条。
async function syncGridHeight() {
  await nextTick()
  const el = gridRef.value
  if (!el || !window.matchMedia('(min-width: 1024px)').matches) {
    gridHeight.value = 0
    return
  }
  const top = el.getBoundingClientRect().top + window.scrollY
  let height = window.innerHeight - top - GRID_BOTTOM_RESERVE
  for (let pass = 0; pass < 3; pass += 1) {
    gridHeight.value = Math.max(200, Math.round(height))
    await nextTick()
    const overflow = document.documentElement.scrollHeight - window.innerHeight
    if (overflow <= 1) break
    height -= overflow
  }
}

// 重点提醒区出现或消失会改变可用高度，重新量一次，保证整页不出现滚动条
watch(() => alerts.value.length, () => { nextTick(syncGridHeight) })

function onEscape(event) {
  if (event.key !== 'Escape') return
  if (modelMenuOpen.value) {
    event.stopPropagation()
    closeModelMenu()
    return
  }
  if (editing.value) {
    event.stopPropagation()
    closeEdit()
  }
}

onMounted(() => {
  loadAll()
  loadAlerts()
  loadPersonaSummary()
  loadModelSettings()
  syncGridHeight()
  if (syncChannel) syncChannel.addEventListener('message', onExternalChange)
  window.addEventListener('keydown', onEscape)
  window.addEventListener('resize', syncGridHeight)
  window.addEventListener('resize', onModelMenuViewportChange)
  window.addEventListener('pointerdown', onModelMenuPointerDown)
  window.addEventListener('scroll', onModelMenuScroll, true)
  document.addEventListener('fullscreenchange', onFullscreenChange)
})

onBeforeUnmount(() => {
  if (syncChannel) syncChannel.removeEventListener('message', onExternalChange)
  window.removeEventListener('keydown', onEscape)
  window.removeEventListener('resize', syncGridHeight)
  window.removeEventListener('resize', onModelMenuViewportChange)
  window.removeEventListener('pointerdown', onModelMenuPointerDown)
  window.removeEventListener('scroll', onModelMenuScroll, true)
  document.removeEventListener('fullscreenchange', onFullscreenChange)
  window.removeEventListener('pointermove', onPanMove)
  window.removeEventListener('pointerup', onPanUp)
})
</script>

<style scoped>
.life-node {
  transition: opacity 0.22s ease;
}
.life-node.is-dim {
  opacity: 0.16;
}
/* 思维导图：中心根节点高亮，前置未完成的子节点置灰（待解锁） */
.life-node.is-root {
  filter: drop-shadow(0 3px 9px rgba(79, 70, 229, 0.5));
}
.life-node.is-locked,
.life-node.is-locked.is-dim {
  opacity: 0.34;
}
.life-mind-group-label {
  font-size: 11px;
  fill: #4f46e5;
  pointer-events: none;
}
/* 已收起的节点：轮廓加粗，提示其下还有一层可展开 */
.life-node.is-folded > circle:nth-of-type(2) {
  stroke-width: 2.4;
}
/* 思维导图卡片：矩形节点（不用圆圈），左侧数字＝同级先后序号 */
.life-card-num {
  font-size: 12px;
  font-weight: 700;
  pointer-events: none;
}
.life-card-title {
  font-size: 11.5px;
  font-weight: 500;
  fill: #334155;
  pointer-events: none;
}
/* 普通卡片上的日期类型标注（截止 M-D / 开始 M-D / 时间段），字号更小更轻，不抢标题 */
.life-node-time {
  font-size: 10px;
  fill: #94a3b8;
  pointer-events: none;
}
.life-node.is-root .life-card-title {
  font-weight: 700;
  fill: #4338ca;
}
/* ===== 「大脑」节点：整张图最顶部的根，深墨 + 鎏金，实时显示人物塑造摘要 ===== */
.life-brain-tag {
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 1px;
  fill: #d9b45f;
  pointer-events: none;
}
.life-brain-sub {
  font-size: 10px;
  fill: #8e9bb3;
  pointer-events: none;
}
.life-brain-title {
  font-size: 15px;
  font-weight: 700;
  fill: #f6f7fb;
  pointer-events: none;
}
.life-brain-persona {
  font-size: 10.5px;
  fill: #a9b7cd;
  pointer-events: none;
}
.life-node.is-brain > rect:first-of-type {
  filter: drop-shadow(0 6px 14px rgba(17, 28, 51, 0.28));
}
/* ===== 大脑左侧的「人物画像」思维导图：暖白鎏金，与右脑子枝干同款卡片 ===== */
.life-persona-node > rect {
  transition: filter 0.18s ease;
}
.life-persona-node:hover > rect:first-of-type {
  filter: drop-shadow(0 6px 14px rgba(200, 162, 74, 0.32));
}
.life-persona-tag {
  font-size: 9.5px;
  font-weight: 600;
  letter-spacing: 0.5px;
  fill: #b9a06a;
  pointer-events: none;
}
/* 画像条目的正文：整段平铺展示，长句自动换行 */
.life-persona-item-text {
  font-size: 11px;
  fill: #475569;
  pointer-events: none;
}
.life-persona-score {
  font-size: 11px;
  font-weight: 700;
  fill: #b0892f;
  pointer-events: none;
}
/* 没有明确截止日期的卡片：虚线框，一眼区分「有明确截止日」和「按时间段/建立时间落位」 */
.life-node.is-undated > rect:first-of-type {
  stroke-dasharray: 4 3;
}
/* 悬浮临时连线的中点标签：白色描边垫底，压在任何连线上都看得清 */
.life-hover-dep-label {
  font-size: 10px;
  font-weight: 600;
  fill: #4f46e5;
  stroke: #ffffff;
  stroke-width: 3px;
  paint-order: stroke;
  pointer-events: none;
}
/* 无痛更新：这次新增的节点亮金色呼吸闪 3 下，4.2 秒后自动褪去，让人一眼看清「新长出来的是哪几个」 */
.life-node.is-new > rect:first-of-type {
  stroke: #ff9f1c;
  stroke-width: 3;
  animation: lifeNewNodePulse 4.2s ease-out both;
}
@keyframes lifeNewNodePulse {
  0% { stroke: #ffd166; stroke-width: 4.2; filter: drop-shadow(0 0 14px rgba(255, 190, 0, 1)); }
  6% { stroke-width: 4.2; filter: drop-shadow(0 0 16px rgba(255, 190, 0, 1)); }
  18% { filter: drop-shadow(0 0 4px rgba(255, 190, 0, 0.45)); }
  30% { filter: drop-shadow(0 0 16px rgba(255, 190, 0, 1)); }
  42% { filter: drop-shadow(0 0 4px rgba(255, 190, 0, 0.45)); }
  54% { filter: drop-shadow(0 0 16px rgba(255, 190, 0, 1)); }
  66% { filter: drop-shadow(0 0 4px rgba(255, 190, 0, 0.4)); }
  78% { filter: drop-shadow(0 0 12px rgba(255, 190, 0, 0.85)); }
  100% { stroke: #f59f0b; stroke-width: 3; filter: none; }
}
/* 无痛更新：内容被改写过的节点亮青色呼吸闪，区分于「全新节点」 */
.life-node.is-updated > rect:first-of-type {
  stroke: #22d3ee;
  stroke-width: 3;
  animation: lifeUpdatedNodePulse 4.2s ease-out both;
}
@keyframes lifeUpdatedNodePulse {
  0% { stroke: #67e8f9; stroke-width: 4.2; filter: drop-shadow(0 0 14px rgba(34, 211, 238, 1)); }
  6% { stroke-width: 4.2; filter: drop-shadow(0 0 16px rgba(34, 211, 238, 1)); }
  18% { filter: drop-shadow(0 0 4px rgba(34, 211, 238, 0.45)); }
  30% { filter: drop-shadow(0 0 16px rgba(34, 211, 238, 1)); }
  42% { filter: drop-shadow(0 0 4px rgba(34, 211, 238, 0.45)); }
  54% { filter: drop-shadow(0 0 16px rgba(34, 211, 238, 1)); }
  66% { filter: drop-shadow(0 0 4px rgba(34, 211, 238, 0.4)); }
  78% { filter: drop-shadow(0 0 12px rgba(34, 211, 238, 0.85)); }
  100% { stroke: #06b6d4; stroke-width: 3; filter: none; }
}
/* ===== 绘制动画：连线走到位后节点才浮现，像「一边推演一边长出来」 ===== */
.life-node.is-drawing {
  animation: lifeNodeIn 0.26s ease-out both;
}
@keyframes lifeNodeIn {
  from { opacity: 0; }
  to { opacity: 1; }
}
/* ===== 任务类节点＝表格行：复选框 / 任务名 / 截止时间 / 资料入口，同一日期列对齐后就是一张任务表 ===== */
.life-task-check {
  cursor: pointer;
}
.life-task-check.is-off {
  cursor: not-allowed;
  opacity: 0.45;
}
.life-task-check > rect {
  transition: fill 0.15s ease, stroke 0.15s ease;
}
.life-task-check:not(.is-off):hover > rect {
  stroke: #4f46e5;
}
.life-task-check.is-part:not(.is-off):hover > rect {
  stroke: #d97706;
}
.life-task-title.is-done {
  fill: #94a3b8;
  text-decoration: line-through;
}
.life-task-time {
  font-size: 11px;
  fill: #64748b;
  pointer-events: none;
}
.life-task-link {
  font-size: 11px;
  font-weight: 600;
  fill: #4f46e5;
  text-decoration: underline;
  cursor: pointer;
}
.life-task-link:hover {
  fill: #3730a3;
}
.life-task-drop {
  cursor: pointer;
  opacity: 0.45;
  transition: opacity 0.15s ease;
}
.life-task-drop:hover,
.life-task-drop.is-on {
  opacity: 1;
}
/* 已收起的卡片：描边改虚线，提示其下还有一层可展开 */
.life-node.is-folded > rect:first-of-type {
  stroke-dasharray: 5 4;
}
.life-node > rect:first-of-type {
  transition: stroke-width 0.2s ease;
}
.life-node:hover > rect:first-of-type {
  stroke-width: 2.4;
}
.life-fold {
  pointer-events: none;
}
.life-fold-sign {
  font-size: 12px;
  font-weight: 700;
  fill: #4f46e5;
}
.life-node circle {
  transition: r 0.25s ease, opacity 0.22s ease;
}
.life-node:hover circle:first-of-type {
  opacity: 0.24;
}
.life-label {
  font-size: 11px;
  font-weight: 500;
  fill: #475569;
  paint-order: stroke;
  stroke: #ffffff;
  stroke-width: 3px;
  stroke-linejoin: round;
  pointer-events: none;
}
/* 圆内序号：白字压在彩色圆上，一眼看出同一系列内的执行先后 */
.life-node-step {
  font-size: 11px;
  font-weight: 700;
  fill: #ffffff;
  pointer-events: none;
}
/* 圆上方优先级小标记 */
.life-node-pri {
  font-size: 9.5px;
  font-weight: 600;
  paint-order: stroke;
  stroke: #ffffff;
  stroke-width: 2.5px;
  stroke-linejoin: round;
  pointer-events: none;
}
/* 节点右上角载体类型小徽标（文本/表格/链接/清单/进度/分支/计算/文档） */
.life-node-carrier {
  font-size: 8.5px;
  font-weight: 600;
  paint-order: stroke;
  stroke: #ffffff;
  stroke-width: 2.5px;
  stroke-linejoin: round;
  pointer-events: none;
}
/* 条带标题：点击可聚焦该系列 */
.life-band-title {
  font-size: 11.5px;
  font-weight: 600;
  fill: #334155;
  cursor: pointer;
}
.life-band-sub {
  font-size: 10px;
  fill: #94a3b8;
  pointer-events: none;
}
.life-band-title:hover {
  fill: #4f46e5;
}
.life-bands g.is-faded {
  opacity: 0.18;
}
/* 已剪枝分支：淡化显示，保留痕迹供回看 */
.life-node.is-pruned {
  opacity: 0.42;
}
.life-axis-label {
  font-size: 10px;
  fill: #94a3b8;
  pointer-events: none;
}
.life-axis-label.is-muted {
  fill: #cbd5e1;
}
.life-axis-title {
  font-size: 10px;
  font-weight: 600;
  fill: #64748b;
  pointer-events: none;
}
.life-deps path {
  transition: stroke-opacity 0.22s ease;
}
.life-board text {
  user-select: none;
}
/* 画布拖拽平移：默认「可抓取」光标，按住时变「抓取中」，让拖拽有可感知的手感 */
.life-canvas {
  cursor: grab;
}
.life-canvas.is-panning {
  cursor: grabbing;
}
/* 规划网络图输出：白底卡片与气泡底色分层，图形居中自适应 */
.life-mermaid {
  padding: 12px 14px;
  border-radius: 14px;
  border: 1px solid #e2e8f0;
  background: linear-gradient(180deg, #ffffff, #f8fafc);
}
.life-mermaid :deep(svg) {
  display: block;
  margin: 0 auto;
  height: auto;
  max-width: 100%;
}
/* 模型下拉：向上展开的进出场动效 */
.life-menu-enter-active,
.life-menu-leave-active {
  transition: opacity 0.16s ease, transform 0.16s ease;
}
.life-menu-enter-from,
.life-menu-leave-to {
  opacity: 0;
  transform: translateY(6px);
}
.life-menu-scroll {
  scrollbar-width: thin;
  scrollbar-color: #cbd5e1 transparent;
}
.life-menu-scroll::-webkit-scrollbar {
  width: 8px;
}
.life-menu-scroll::-webkit-scrollbar-track {
  background: transparent;
}
.life-menu-scroll::-webkit-scrollbar-thumb {
  background: #cbd5e1;
  border-radius: 9999px;
}
.life-menu-scroll::-webkit-scrollbar-thumb:hover {
  background: #94a3b8;
}
</style>
