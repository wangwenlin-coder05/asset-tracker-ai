<template>
  <div class="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 p-2" @click.self="$emit('close')">
    <section class="w-full max-w-[95vw] max-h-[95vh] h-full rounded-xl bg-white shadow-2xl flex flex-col">
      <!-- 头部：标题 + 分区标签 -->
      <div class="px-5 pt-4 shrink-0">
        <div class="flex items-center justify-between">
          <h2 class="text-base font-semibold text-slate-800">设置</h2>
          <button class="text-xl leading-none text-slate-400 hover:text-slate-700" title="关闭" @click="$emit('close')">×</button>
        </div>
        <div class="flex items-center gap-1 mt-3 border-b border-slate-200">
          <button
            v-for="tab in TABS" :key="tab.key"
            class="px-3.5 py-2 text-sm flex items-center gap-1.5 border-b-2 -mb-px transition-colors"
            :class="activeSection === tab.key ? 'border-primary text-primary font-medium' : 'border-transparent text-slate-500 hover:text-slate-700'"
            @click="activeSection = tab.key"
          >
            <component :is="tab.icon" class="w-4 h-4" />{{ tab.label }}
          </button>
        </div>
      </div>

      <!-- 内容区 -->
      <div class="flex-1 min-h-0 px-5 py-4 flex flex-col">

        <!-- ===== 基础设置 ===== -->
        <div v-if="activeSection === 'basic'" class="h-full overflow-y-auto">
          <div class="max-w-2xl space-y-4">
            <!-- AI 模型 -->
            <div class="rounded-lg border border-slate-200 p-4">
              <div class="flex items-center gap-1.5 text-sm font-semibold text-slate-700 mb-3">
                <FlaskConical class="w-4 h-4 text-indigo-500" />AI 模型
              </div>
              <div class="space-y-3">
                <label class="block text-xs font-medium text-slate-600">
                  Agnes API Key
                  <input v-model="form.agnes_api_key" type="password" autocomplete="off" class="mt-1 w-full rounded border border-slate-200 px-3 py-2 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/10" placeholder="留空则保持现有配置" />
                </label>
                <label class="block text-xs font-medium text-slate-600">
                  GLM API Key
                  <input v-model="form.glm_api_key" type="password" autocomplete="off" class="mt-1 w-full rounded border border-slate-200 px-3 py-2 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/10" placeholder="留空则保持现有配置" />
                </label>
                <label class="block text-xs font-medium text-slate-600">
                  默认 AI 模型
                  <select v-model="form.default_model" class="mt-1 w-full rounded border border-slate-200 px-3 py-2 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/10 bg-white">
                    <option value="agnes-2.0-flash">agnes-2.0-flash（快速）</option>
                    <option value="agnes-2.5-pro">agnes-2.5-pro（深度推理）</option>
                    <option value="glm-4-flash-250414">GLM-4 Flash</option>
                    <option value="glm-4.6v">GLM-4.6V 视觉</option>
                  </select>
                </label>
                <div class="flex items-center gap-2">
                  <button type="button" class="rounded border border-slate-200 px-3 py-1.5 text-xs text-slate-600 hover:bg-slate-50 disabled:opacity-50 flex items-center gap-1.5 shrink-0" :disabled="testingModel" @click="testModel">
                    <FlaskConical class="w-3.5 h-3.5" />{{ testingModel ? '测试中...' : '模型测试' }}
                  </button>
                  <p v-if="testResult" class="text-xs text-emerald-600 truncate flex-1" :title="testResult">{{ testResult }}</p>
                  <p v-if="testError" class="text-xs text-rose-500 truncate flex-1" :title="testError">{{ testError }}</p>
                </div>
              </div>
            </div>

            <!-- 数据刷新 -->
            <div class="rounded-lg border border-slate-200 p-4">
              <div class="flex items-center gap-1.5 text-sm font-semibold text-slate-700 mb-3">
                <RefreshCw class="w-4 h-4 text-sky-500" />数据刷新
              </div>
              <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <label class="block text-xs font-medium text-slate-600">
                  黄金价格每日刷新次数
                  <div class="mt-1 flex items-center gap-2">
                    <input v-model.number="form.gold_daily_count" type="number" min="1" max="500" class="w-24 rounded border border-slate-200 px-2 py-2 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/10" placeholder="50" />
                    <span class="text-xs text-slate-400">次/天</span>
                  </div>
                  <span class="text-[10px] text-slate-400">间隔约 {{ intervalMinutes }} 分钟</span>
                </label>
                <label class="block text-xs font-medium text-slate-600">
                  实时行情刷新间隔
                  <select v-model.number="form.market_fetch_interval" class="mt-1 w-full rounded border border-slate-200 px-3 py-2 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/10 bg-white">
                    <option :value="15000">15 秒</option>
                    <option :value="30000">30 秒（推荐）</option>
                    <option :value="60000">1 分钟</option>
                    <option :value="120000">2 分钟</option>
                    <option :value="300000">5 分钟</option>
                  </select>
                </label>
              </div>
            </div>
            <div class="rounded-lg border border-slate-200 p-4">
              <div class="text-sm font-semibold text-slate-700 mb-3">蓄水池动画</div>
              <label class="block text-xs font-medium text-slate-600">
                魂环数量
                <select v-model.number="draftRingCount" class="mt-1 w-full rounded border border-slate-200 px-3 py-2 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/10 bg-white">
                  <option v-for="count in MAX_SOUL_RINGS - MIN_SOUL_RINGS + 1" :key="count" :value="count + MIN_SOUL_RINGS - 1">{{ count + MIN_SOUL_RINGS - 1 }} 个{{ count === 4 ? '（默认）' : '' }}</option>
                </select>
              </label>
              <p class="mt-2 text-xs text-slate-400">保存后立即生效；数量越多，魂环出现越密集。此设置保存在当前浏览器。</p>
            </div>
          </div>
        </div>

        <!-- ===== 交易手续费 ===== -->
        <div v-else-if="activeSection === 'fee'" class="h-full overflow-y-auto">
          <div class="max-w-2xl space-y-4">
            <!-- 档位列表 -->
            <div class="rounded-lg border border-slate-200 p-4">
              <div class="flex items-center justify-between mb-3">
                <div class="flex items-center gap-1.5 text-sm font-semibold text-slate-700">
                  <Receipt class="w-4 h-4 text-primary" />我的佣金档位
                </div>
                <span class="text-[10px] text-slate-400">点击选中 · 双击档位可编辑</span>
              </div>
              <div class="space-y-2">
                <div
                  v-for="p in feePresets" :key="p.id"
                  class="flex items-center gap-3 rounded-lg border px-3 py-2.5 transition-colors"
                  :class="[
                    p.id === activeFeeId ? 'border-primary bg-primary/5 ring-1 ring-primary/25' : 'border-slate-200',
                    editingId === p.id ? '' : 'cursor-pointer hover:bg-slate-50'
                  ]"
                  @click="editingId === p.id || (activeFeeId = p.id)"
                  @dblclick.stop="startEdit(p)"
                >
                  <span class="w-4 h-4 rounded-full border flex items-center justify-center shrink-0"
                    :class="p.id === activeFeeId ? 'border-primary bg-primary' : 'border-slate-300'">
                    <span v-if="p.id === activeFeeId" class="w-1.5 h-1.5 rounded-full bg-white"></span>
                  </span>

                  <!-- 展示态 -->
                  <div v-if="editingId !== p.id" class="flex-1 min-w-0" title="双击编辑">
                    <div class="text-sm text-slate-700 truncate">{{ p.name }}</div>
                    <div class="text-[11px] text-slate-400">股票 万{{ toWan(p.rate) }} · 最低 {{ p.min }} 元</div>
                    <div v-if="feeExtras(p).length" class="text-[11px] text-slate-400 flex flex-wrap gap-x-2 gap-y-0.5 mt-0.5">
                      <span v-for="(ex, i) in feeExtras(p)" :key="i" class="whitespace-nowrap">{{ ex }}</span>
                    </div>
                  </div>

                  <!-- 编辑态 -->
                  <div v-else class="flex-1 min-w-0 space-y-2" @click.stop @dblclick.stop>
                    <div class="flex flex-wrap items-center gap-2">
                      <input
                        :ref="el => (editNameEl = el)"
                        v-model="editForm.name" placeholder="名称"
                        class="w-28 rounded border border-slate-200 px-2 py-1 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/10"
                        @keydown.enter.prevent="commitEdit" @keydown.esc="cancelEdit"
                      />
                      <span class="text-[11px] text-slate-400">股票 万分之</span>
                      <input
                        v-model.number="editForm.rateWan" type="number" step="0.01" min="0"
                        class="w-20 rounded border border-slate-200 px-2 py-1 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/10"
                        @keydown.enter.prevent="commitEdit" @keydown.esc="cancelEdit"
                      />
                      <span class="text-[11px] text-slate-400">最低</span>
                      <input
                        v-model.number="editForm.min" type="number" step="1" min="0"
                        class="w-16 rounded border border-slate-200 px-2 py-1 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/10"
                        @keydown.enter.prevent="commitEdit" @keydown.esc="cancelEdit"
                      />
                      <button class="text-xs text-primary hover:underline shrink-0" @click="commitEdit">确定</button>
                      <button class="text-xs text-slate-400 hover:underline shrink-0" @click="cancelEdit">取消</button>
                    </div>
                    <div class="flex flex-wrap items-center gap-2">
                      <span class="text-[11px] text-slate-400">ETF/LOF 万</span>
                      <input v-model.number="editForm.etfRateWan" type="number" step="0.01" min="0" class="w-16 rounded border border-slate-200 px-2 py-1 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/10" @keydown.enter.prevent="commitEdit" @keydown.esc="cancelEdit" />
                      <span class="text-[11px] text-slate-400">最低</span>
                      <input v-model.number="editForm.etfMin" type="number" step="0.1" min="0" class="w-14 rounded border border-slate-200 px-2 py-1 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/10" @keydown.enter.prevent="commitEdit" @keydown.esc="cancelEdit" />
                      <span class="text-[11px] text-slate-400 ml-2">可转债 沪万</span>
                      <input v-model.number="editForm.cbRateShWan" type="number" step="0.01" min="0" class="w-16 rounded border border-slate-200 px-2 py-1 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/10" @keydown.enter.prevent="commitEdit" @keydown.esc="cancelEdit" />
                      <span class="text-[11px] text-slate-400">深万</span>
                      <input v-model.number="editForm.cbRateSzWan" type="number" step="0.01" min="0" class="w-16 rounded border border-slate-200 px-2 py-1 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/10" @keydown.enter.prevent="commitEdit" @keydown.esc="cancelEdit" />
                      <span class="text-[11px] text-slate-400">起步</span>
                      <input v-model.number="editForm.cbMin" type="number" step="0.1" min="0" class="w-14 rounded border border-slate-200 px-2 py-1 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/10" @keydown.enter.prevent="commitEdit" @keydown.esc="cancelEdit" />
                      <span class="text-[11px] text-slate-400 ml-2">场内LOF申购</span>
                      <input v-model.number="editForm.lofZhe" type="number" step="0.5" min="0" max="10" class="w-14 rounded border border-slate-200 px-2 py-1 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/10" @keydown.enter.prevent="commitEdit" @keydown.esc="cancelEdit" />
                      <span class="text-[11px] text-slate-400">折(0为不设)</span>
                    </div>
                  </div>

                  <template v-if="editingId !== p.id">
                    <span v-if="p.id === activeFeeId" class="text-[10px] text-primary font-semibold shrink-0">生效中</span>
                    <button class="text-slate-300 hover:text-rose-500 shrink-0" title="删除该档位" @click.stop="removeFeePreset(p.id)">
                      <Trash2 class="w-3.5 h-3.5" />
                    </button>
                  </template>
                </div>
              </div>

              <div class="mt-3 pt-3 border-t border-slate-100">
                <div class="text-[11px] text-slate-400 mb-1.5">快捷添加（最低佣金 5 元）</div>
                <div class="flex flex-wrap gap-1.5">
                  <button
                    v-for="q in QUICK_FEE_OPTIONS" :key="q.label"
                    class="px-2.5 py-1 rounded-full border border-slate-200 text-xs text-slate-600 hover:border-primary hover:text-primary transition-colors"
                    @click="quickAddFee(q)"
                  >{{ q.label }}</button>
                </div>
                <div class="text-[11px] text-slate-400 mt-3 mb-1.5">华宝优惠档位</div>
                <div class="flex flex-wrap gap-1.5">
                  <button
                    v-for="h in HUABAO_PRESETS" :key="h.name"
                    class="px-2.5 py-1 rounded-full border border-primary/30 bg-primary/5 text-xs text-primary hover:bg-primary/10 hover:border-primary transition-colors"
                    @click="quickAddHuabao(h)"
                  >{{ h.name }}</button>
                </div>
              </div>
            </div>

            <!-- 自定义新增 -->
            <div class="rounded-lg border border-slate-200 p-4">
              <div class="text-sm font-semibold text-slate-700 mb-3">新增自定义档位</div>
              <div class="space-y-3">
                <label class="block text-xs font-medium text-slate-600">
                  名称
                  <input v-model="newFee.name" placeholder="如：新开户" class="mt-1 w-full max-w-sm rounded border border-slate-200 px-3 py-2 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/10" />
                </label>
                <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div class="rounded-lg border border-slate-100 p-3">
                    <div class="text-[11px] text-slate-500 mb-2">股票</div>
                    <div class="flex items-center gap-2 text-[11px] text-slate-400">
                      万分之 <input v-model.number="newFee.rateWan" type="number" step="0.01" min="0" class="w-20 rounded border border-slate-200 px-2 py-1.5 text-sm text-slate-700 outline-none focus:border-primary focus:ring-2 focus:ring-primary/10" />
                      最低 <input v-model.number="newFee.min" type="number" step="1" min="0" class="w-14 rounded border border-slate-200 px-2 py-1.5 text-sm text-slate-700 outline-none focus:border-primary focus:ring-2 focus:ring-primary/10" /> 元
                    </div>
                  </div>
                  <div class="rounded-lg border border-slate-100 p-3">
                    <div class="text-[11px] text-slate-500 mb-2">ETF / LOF（选填）</div>
                    <div class="flex items-center gap-2 text-[11px] text-slate-400">
                      万分之 <input v-model.number="newFee.etfRateWan" type="number" step="0.01" min="0" class="w-20 rounded border border-slate-200 px-2 py-1.5 text-sm text-slate-700 outline-none focus:border-primary focus:ring-2 focus:ring-primary/10" />
                      最低 <input v-model.number="newFee.etfMin" type="number" step="0.1" min="0" class="w-14 rounded border border-slate-200 px-2 py-1.5 text-sm text-slate-700 outline-none focus:border-primary focus:ring-2 focus:ring-primary/10" /> 元
                    </div>
                  </div>
                  <div class="rounded-lg border border-slate-100 p-3">
                    <div class="text-[11px] text-slate-500 mb-2">可转债（选填）</div>
                    <div class="flex items-center gap-2 text-[11px] text-slate-400 flex-wrap">
                      沪 万分之 <input v-model.number="newFee.cbRateShWan" type="number" step="0.01" min="0" class="w-20 rounded border border-slate-200 px-2 py-1.5 text-sm text-slate-700 outline-none focus:border-primary focus:ring-2 focus:ring-primary/10" />
                      深 万分之 <input v-model.number="newFee.cbRateSzWan" type="number" step="0.01" min="0" class="w-20 rounded border border-slate-200 px-2 py-1.5 text-sm text-slate-700 outline-none focus:border-primary focus:ring-2 focus:ring-primary/10" />
                      起步 <input v-model.number="newFee.cbMin" type="number" step="0.1" min="0" class="w-14 rounded border border-slate-200 px-2 py-1.5 text-sm text-slate-700 outline-none focus:border-primary focus:ring-2 focus:ring-primary/10" /> 元
                    </div>
                  </div>
                  <div class="rounded-lg border border-slate-100 p-3">
                    <div class="text-[11px] text-slate-500 mb-2">场内 LOF 申购（选填）</div>
                    <div class="flex items-center gap-2 text-[11px] text-slate-400">
                      <input v-model.number="newFee.lofZhe" type="number" step="0.5" min="0" max="10" class="w-14 rounded border border-slate-200 px-2 py-1.5 text-sm text-slate-700 outline-none focus:border-primary focus:ring-2 focus:ring-primary/10" /> 折（0 为不设，如「1折」）
                    </div>
                  </div>
                </div>
                <button class="rounded bg-primary px-4 py-2 text-sm text-white hover:bg-blue-700" @click="addFeePreset">添加</button>
                <p v-if="feeHint" class="mt-1 text-xs" :class="feeHintType === 'error' ? 'text-rose-500' : 'text-emerald-600'">{{ feeHint }}</p>
              </div>
            </div>

            <p class="text-[11px] leading-relaxed text-slate-400">
              股票佣金 = 成交额 × 费率，不足最低佣金时按最低收取；印花税 0.1%（仅卖出）、过户费 0.001% 为固定项，无需设置。ETF/LOF、可转债、场内 LOF 申购为可选扩展费率，仅作记录展示。
              档位调整只对之后的买入 / 卖出 / T 计算生效，已录入的历史记录保持不变。
            </p>
          </div>
        </div>

        <!-- ===== 标语库 ===== -->
        <div v-else-if="activeSection === 'tips'" class="h-full overflow-y-auto">
          <div class="max-w-2xl space-y-4">
            <div class="rounded-lg border border-slate-200 p-4">
              <div class="flex items-center justify-between mb-3">
                <div class="flex items-center gap-1.5 text-sm font-semibold text-slate-700">
                  <Megaphone class="w-4 h-4 text-primary" />指标栏标语
                </div>
                <span class="text-[10px] text-slate-400">双击可编辑 · 顺序即轮播顺序</span>
              </div>

              <div class="space-y-2">
                <div
                  v-for="(t, i) in tipList" :key="i"
                  class="flex items-center gap-3 rounded-lg border border-slate-200 px-3 py-2.5"
                >
                  <span class="w-5 shrink-0 text-center text-[11px] text-slate-400">{{ i + 1 }}</span>

                  <!-- 展示态 -->
                  <div
                    v-if="editingTip !== i"
                    class="flex-1 min-w-0 truncate text-sm text-slate-700"
                    title="双击编辑"
                    @dblclick="startEditTip(i)"
                  >{{ t }}</div>

                  <!-- 编辑态 -->
                  <div v-else class="flex-1 min-w-0 flex items-center gap-2">
                    <input
                      :ref="el => (editTipEl = el)"
                      v-model="editTipText"
                      class="flex-1 min-w-0 rounded border border-slate-200 px-2 py-1 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/10"
                      @keydown.enter.prevent="commitTip" @keydown.esc="cancelTip"
                    />
                    <button class="text-xs text-primary hover:underline shrink-0" @click="commitTip">确定</button>
                    <button class="text-xs text-slate-400 hover:underline shrink-0" @click="cancelTip">取消</button>
                  </div>

                  <div v-if="editingTip !== i" class="flex items-center gap-1 shrink-0">
                    <button class="text-slate-300 hover:text-primary disabled:opacity-30 disabled:hover:text-slate-300" :disabled="i === 0" title="上移" @click="moveTip(i, -1)">
                      <ChevronUp class="w-3.5 h-3.5" />
                    </button>
                    <button class="text-slate-300 hover:text-primary disabled:opacity-30 disabled:hover:text-slate-300" :disabled="i === tipList.length - 1" title="下移" @click="moveTip(i, 1)">
                      <ChevronDown class="w-3.5 h-3.5" />
                    </button>
                    <button class="text-slate-300 hover:text-rose-500" title="删除" @click="removeTip(i)">
                      <Trash2 class="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>

                <p v-if="!tipList.length" class="py-2 text-xs text-slate-400">暂无标语，保存时会自动恢复为默认标语。</p>
              </div>

              <div class="mt-3 pt-3 border-t border-slate-100 flex items-end gap-2">
                <label class="flex-1 text-xs font-medium text-slate-600">
                  新增标语
                  <input
                    v-model="newTip"
                    placeholder="如：先看风险，再看收益"
                    class="mt-1 w-full rounded border border-slate-200 px-3 py-2 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/10"
                    @keydown.enter.prevent="addTip"
                  />
                </label>
                <button class="rounded bg-primary px-4 py-2 text-sm text-white hover:bg-blue-700 shrink-0" @click="addTip">添加</button>
                <button class="rounded border border-slate-200 px-3 py-2 text-sm text-slate-600 hover:bg-slate-50 shrink-0" @click="resetTips">恢复默认</button>
              </div>
            </div>

            <p class="text-[11px] leading-relaxed text-slate-400">
              标语显示在观察面板指标栏右侧，每 6 秒竖向轮播一条。可增删改并调整顺序，保存后立即生效。
            </p>
          </div>
        </div>

        <!-- ===== 运行日志 ===== -->
        <div v-else-if="activeSection === 'logs'" class="h-full flex gap-4 min-h-0">
          <!-- AI 统计 + 日志列表 -->
          <div class="w-[360px] shrink-0 flex flex-col">
            <div class="rounded-lg border border-slate-200 bg-slate-50/50 p-4 flex-1 flex flex-col min-h-0">
              <div class="flex items-center gap-4 mb-3 shrink-0">
                <span class="text-sm font-bold text-slate-700 flex items-center gap-1.5 shrink-0"><FlaskConical class="w-4 h-4 text-indigo-500" />AI 调用统计</span>
              </div>
              <!-- 数字卡片 -->
              <div class="grid grid-cols-2 gap-2 mb-3 shrink-0">
                <div class="bg-white rounded-lg border border-slate-100 p-2.5">
                  <div class="text-[10px] text-slate-400">累计调用</div>
                  <div class="text-xl font-bold text-slate-800 mt-0.5">{{ usage.total ?? '--' }}<span class="text-xs font-normal text-slate-400 ml-1">次</span></div>
                </div>
                <div class="bg-white rounded-lg border border-slate-100 p-2.5">
                  <div class="text-[10px] text-slate-400">今日调用</div>
                  <div class="text-xl font-bold text-indigo-600 mt-0.5">{{ usage.today ?? '--' }}<span class="text-xs font-normal text-slate-400 ml-1">次</span></div>
                </div>
              </div>
              <!-- 近 7 天趋势 -->
              <div v-if="usage.trend?.length" class="mb-3 shrink-0">
                <div class="text-[10px] text-slate-400 mb-1.5">近 7 天趋势</div>
                <div class="flex items-end gap-1 h-12 bg-white rounded-lg border border-slate-100 p-2">
                  <div v-for="(d, i) in usage.trend" :key="i" class="flex-1 flex flex-col items-center justify-end gap-1 h-full">
                    <div class="w-full rounded-sm bg-indigo-400/80 transition-all"
                      :style="{ height: trendBarHeight(d.count) + '%' }"
                      :title="`${d.date.slice(5)}: ${d.count} 次`"></div>
                    <span class="text-[9px] text-slate-400 leading-none">{{ d.date.slice(5) }}</span>
                  </div>
                </div>
              </div>
              <!-- 按模型分布 -->
              <div v-if="usage.byModel?.length" class="flex flex-wrap gap-1.5 mb-2 shrink-0">
                <div v-for="m in usage.byModel" :key="m.model" class="flex items-center gap-1 py-0.5 px-2 rounded-lg bg-white border border-slate-100">
                  <span class="text-[10px] text-slate-600 font-mono truncate max-w-[120px]">{{ m.model }}</span>
                  <span class="text-[10px] font-bold text-slate-700">{{ m.count }}</span>
                </div>
              </div>
              <p v-else class="text-xs text-slate-400 py-1 shrink-0">暂无 AI 调用记录，使用 AI 功能后会自动统计</p>

              <!-- 日志列表 -->
              <div class="mt-3 border-t border-slate-200 pt-3 flex-1 flex flex-col min-h-0">
                <div class="flex items-center justify-between mb-2 shrink-0">
                  <div class="flex items-center gap-1 text-xs font-semibold text-slate-500">
                    <Terminal class="w-3.5 h-3.5" />
                    <button
                      class="px-2 py-0.5 rounded transition-colors"
                      :class="activeLogTab === 'ai' ? 'bg-primary text-white' : 'text-slate-500 hover:bg-slate-100'"
                      @click="switchLogTab('ai')"
                    >AI 调用</button>
                    <button
                      class="px-2 py-0.5 rounded transition-colors"
                      :class="activeLogTab === 'tx' ? 'bg-primary text-white' : 'text-slate-500 hover:bg-slate-100'"
                      @click="switchLogTab('tx')"
                    >交易记录</button>
                  </div>
                  <div class="flex items-center gap-2">
                    <label class="flex items-center gap-1 text-xs text-slate-400 cursor-pointer select-none" @click.prevent="toggleAutoRefresh">
                      <span class="w-3.5 h-3.5 rounded border border-slate-300 flex items-center justify-center" :class="logAutoRefresh ? 'bg-primary border-primary' : ''">
                        <span v-if="logAutoRefresh" class="text-white text-[8px]">✓</span>
                      </span>
                      自动刷新
                    </label>
                    <button class="text-xs text-blue-500 hover:underline flex items-center gap-0.5" :disabled="loadingLogs" @click="fetchLogs">
                      <RefreshCw class="w-3 h-3" :class="{ 'animate-spin': loadingLogs }" />刷新
                    </button>
                  </div>
                </div>
                <div class="rounded-lg border border-slate-200 bg-white overflow-hidden flex-1 flex flex-col min-h-0">
                  <div class="flex-1 overflow-y-auto text-xs font-mono">
                    <!-- AI 调用日志行 -->
                    <div v-if="activeLogTab === 'ai'" v-for="log in logs" :key="log.id" class="border-b border-slate-100 last:border-b-0">
                      <div
                        class="flex items-center gap-2 px-3 py-1.5 hover:bg-slate-50 cursor-pointer select-none"
                        :class="logDetailId === log.id ? 'bg-indigo-50/50 border-l-2 border-indigo-400' : ''"
                        @click="selectLogDetail(log.id)"
                      >
                        <span class="text-slate-400 shrink-0 w-20">{{ formatLogTime(log.created_at) }}</span>
                        <span class="text-slate-600 shrink-0 w-24 truncate" :title="log.model">{{ log.model }}</span>
                        <span class="text-slate-400 shrink-0 w-12 text-right">{{ log.duration_ms }}ms</span>
                        <span v-if="log.success" class="text-emerald-600 shrink-0">✅</span>
                        <span v-else class="text-rose-500 shrink-0">❌</span>
                        <span class="text-slate-400 truncate flex-1 text-right">{{ log.response_len }}B</span>
                      </div>
                    </div>
                    <!-- 交易记录日志行 -->
                    <div v-else v-for="log in logs" :key="log.id" class="border-b border-slate-100 last:border-b-0">
                      <div
                        class="flex items-center gap-2 px-3 py-1.5 hover:bg-slate-50 cursor-pointer select-none"
                        :class="logDetailId === log.id ? 'bg-amber-50/60 border-l-2 border-amber-400' : ''"
                        @click="selectLogDetail(log.id)"
                      >
                        <span class="text-slate-400 shrink-0 w-20">{{ formatLogTime(log.created_at) }}</span>
                        <span class="text-slate-600 shrink-0 w-20 truncate" :title="log.action">{{ log.action }}</span>
                        <span class="text-slate-700 shrink-0 w-16 truncate" :title="log.stock_code">{{ log.stock_code }}</span>
                        <span class="text-slate-400 shrink-0 text-right">{{ log.before_count }} → {{ log.after_count }}</span>
                        <span class="text-slate-400 truncate flex-1 text-right">买{{ log.total_buy }}/卖{{ log.total_sell }}</span>
                      </div>
                    </div>
                    <div v-if="!logs.length && !loadingLogs" class="py-6 text-center text-slate-400 text-xs">暂无日志数据</div>
                    <div v-if="loadingLogs" class="py-6 text-center text-slate-400 text-xs">加载中...</div>
                  </div>
                  <div class="flex items-center justify-between px-3 py-1.5 bg-slate-50 border-t border-slate-200 text-[10px] text-slate-400 shrink-0">
                    <span>共 {{ logTotal }} 条记录</span>
                    <button v-if="logTotal > logs.length" class="text-blue-500 hover:underline" @click="loadMoreLogs">加载更多</button>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <!-- 日志详情 -->
          <div class="flex-1 min-w-0">
            <div class="rounded-lg border border-slate-200 bg-slate-50/50 p-4 h-full flex flex-col">
              <div class="flex items-center justify-between mb-3 shrink-0">
                <span class="text-xs font-semibold text-slate-500 flex items-center gap-1">
                  <Terminal class="w-3.5 h-3.5" />日志详情
                </span>
                <button v-if="selectedLog" class="text-xs text-slate-400 hover:text-slate-600" @click="logDetailId = null">关闭</button>
              </div>
              <div v-if="selectedLog" class="flex-1 overflow-y-auto text-[10px] text-slate-500 space-y-2">
                <!-- AI 调用日志详情 -->
                <template v-if="activeLogTab === 'ai'">
                  <div class="bg-white rounded-lg border border-slate-100 p-3 space-y-1">
                    <div class="flex justify-between"><span class="font-semibold text-slate-600">模型</span><span class="font-mono text-slate-700">{{ selectedLog.model }}</span></div>
                    <div class="flex justify-between"><span class="font-semibold text-slate-600">提供方</span><span>{{ selectedLog.provider }}</span></div>
                    <div class="flex justify-between"><span class="font-semibold text-slate-600">时间</span><span>{{ formatLogFull(selectedLog.created_at) }}</span></div>
                    <div class="flex justify-between"><span class="font-semibold text-slate-600">耗时</span><span>{{ selectedLog.duration_ms }}ms</span></div>
                    <div class="flex justify-between"><span class="font-semibold text-slate-600">状态</span>
                      <span :class="selectedLog.success ? 'text-emerald-600' : 'text-rose-500'">{{ selectedLog.success ? '✅ 成功' : '❌ 失败' }}</span>
                    </div>
                    <div class="flex justify-between"><span class="font-semibold text-slate-600">系统提示</span><span>{{ selectedLog.system_prompt_len }}B</span></div>
                    <div class="flex justify-between"><span class="font-semibold text-slate-600">用户输入</span><span>{{ selectedLog.user_prompt_len }}B</span></div>
                    <div class="flex justify-between"><span class="font-semibold text-slate-600">响应大小</span><span>{{ selectedLog.response_len }}B</span></div>
                  </div>
                  <div v-if="!selectedLog.success && selectedLog.error_msg" class="bg-rose-50 rounded-lg border border-rose-200 p-3">
                    <div class="font-semibold text-rose-600 mb-1">错误信息</div>
                    <div class="text-rose-500 break-all whitespace-pre-wrap">{{ selectedLog.error_msg }}</div>
                  </div>
                  <div v-if="selectedLog.request_content" class="bg-white rounded-lg border border-slate-100 p-3">
                    <div class="font-semibold text-slate-600 mb-1">请求内容</div>
                    <pre class="whitespace-pre-wrap break-all bg-slate-50 rounded px-2 py-1.5 overflow-x-auto max-h-48 overflow-y-auto text-[10px] leading-relaxed">{{ selectedLog.request_content }}</pre>
                  </div>
                  <div v-if="selectedLog.response_content" class="bg-white rounded-lg border border-slate-100 p-3">
                    <div class="font-semibold text-slate-600 mb-1">响应内容</div>
                    <pre class="whitespace-pre-wrap break-all bg-slate-50 rounded px-2 py-1.5 overflow-x-auto max-h-48 overflow-y-auto text-[10px] leading-relaxed">{{ selectedLog.response_content }}</pre>
                  </div>
                </template>
                <!-- 交易记录日志详情 -->
                <template v-else>
                  <div class="bg-white rounded-lg border border-slate-100 p-3 space-y-1">
                    <div class="flex justify-between"><span class="font-semibold text-slate-600">操作</span><span class="font-mono text-amber-600">{{ selectedLog.action }}</span></div>
                    <div class="flex justify-between"><span class="font-semibold text-slate-600">股票代码</span><span class="font-mono text-slate-700">{{ selectedLog.stock_code || '-' }}</span></div>
                    <div class="flex justify-between"><span class="font-semibold text-slate-600">时间</span><span>{{ formatLogFull(selectedLog.created_at) }}</span></div>
                    <div class="flex justify-between"><span class="font-semibold text-slate-600">持仓变化</span><span>{{ selectedLog.before_count }} → {{ selectedLog.after_count }}</span></div>
                    <div class="flex justify-between"><span class="font-semibold text-slate-600">总买入</span><span>{{ selectedLog.total_buy }} 股</span></div>
                    <div class="flex justify-between"><span class="font-semibold text-slate-600">总卖出</span><span>{{ selectedLog.total_sell }} 股</span></div>
                    <div class="flex justify-between"><span class="font-semibold text-slate-600">可交易数</span><span>{{ selectedLog.trade_count }} 股</span></div>
                  </div>
                  <div v-if="parseDetail(selectedLog.detail)" class="bg-white rounded-lg border border-slate-100 p-3">
                    <div class="font-semibold text-slate-600 mb-1">明细</div>
                    <pre class="whitespace-pre-wrap break-all bg-slate-50 rounded px-2 py-1.5 overflow-x-auto max-h-64 overflow-y-auto text-[10px] leading-relaxed">{{ formatDetail(selectedLog.detail) }}</pre>
                  </div>
                </template>
              </div>
              <div v-else class="flex-1 flex items-center justify-center text-xs text-slate-400">
                点击左侧日志查看详情
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- 底部操作栏 -->
      <div class="flex items-center justify-between gap-3 px-5 py-3 border-t border-slate-100 shrink-0">
        <div class="flex-1 min-w-0">
          <p v-if="configuredText" class="text-xs text-emerald-600 truncate">{{ configuredText }}</p>
          <p v-if="error" class="text-xs text-rose-500 truncate">{{ error }}</p>
        </div>
        <div class="flex gap-2 shrink-0">
          <button class="rounded border border-slate-200 px-3 py-1.5 text-sm text-slate-600 hover:bg-slate-50" @click="$emit('close')">取消</button>
          <button class="rounded bg-primary px-4 py-1.5 text-sm text-white hover:bg-blue-700 disabled:opacity-50" :disabled="saving" @click="save">{{ saving ? '保存中...' : '保存' }}</button>
        </div>
      </div>
    </section>
  </div>
</template>

<script setup>
import { computed, reactive, ref, nextTick, onMounted, onUnmounted } from 'vue'
import { FlaskConical, Terminal, RefreshCw, Receipt, Trash2, Settings, Megaphone, ChevronUp, ChevronDown } from 'lucide-vue-next'
import { aiSettingsApi, stockApi } from '../utils/api'
import { useSoulRingSettings, MIN_SOUL_RINGS, MAX_SOUL_RINGS } from '../composables/useSoulRingSettings'
import {
  feeConfig, toWan, applyFeeSettings,
  QUICK_FEE_OPTIONS, HUABAO_PRESETS, FEE_PRESETS_KEY,
  parseFeePresets, serializeFeePresets, newFeePresetId,
  feeExtras,
} from '../utils/feeConfig'
import {
  DEFAULT_METRIC_TIPS, METRIC_TIPS_KEY,
  parseMetricTips, serializeMetricTips, setMetricTips,
} from '../utils/metricTips'

const emit = defineEmits(['close'])
const { ringCount, setRingCount } = useSoulRingSettings()
const draftRingCount = ref(ringCount.value)
const form = reactive({ agnes_api_key: '', glm_api_key: '', default_model: 'agnes-2.0-flash', gold_daily_count: 50, market_fetch_interval: 30000 })
const usage = reactive({ date: '', total: null, today: null, byModel: [], trend: [] })
const saving = ref(false)
const error = ref('')
const configured = reactive({ agnes: false, glm: false })
const testingModel = ref(false)
const testResult = ref('')
const testError = ref('')

const TABS = [
  { key: 'basic', label: '基础设置', icon: Settings },
  { key: 'fee', label: '交易手续费', icon: Receipt },
  { key: 'tips', label: '标语库', icon: Megaphone },
  { key: 'logs', label: '运行日志', icon: Terminal },
]
const activeSection = ref('basic')

// 交易手续费：用户可维护的档位列表，选中的档位为当前生效配置
const feePresets = ref(parseFeePresets(''))
const activeFeeId = ref(feePresets.value[0]?.id || '')
const newFee = reactive({ name: '', rateWan: 2.3, min: 5, etfRateWan: 0, etfMin: 0, cbRateShWan: 0, cbRateSzWan: 0, cbMin: 0, lofZhe: 0 })
const feeHint = ref('')
const feeHintType = ref('ok')
// 双击档位进入内联编辑
const editingId = ref(null)
const editForm = reactive({ name: '', rateWan: 0, min: 5, etfRateWan: 0, etfMin: 0, cbRateShWan: 0, cbRateSzWan: 0, cbMin: 0, lofZhe: 0 })
let editNameEl = null

const activeFee = computed(() => feePresets.value.find(p => p.id === activeFeeId.value) || null)

// 标语库：指标栏竖向轮播的标语，可增删改 + 排序
const tipList = ref([...DEFAULT_METRIC_TIPS])
const newTip = ref('')
const editingTip = ref(-1)
const editTipText = ref('')
let editTipEl = null

function addTip() {
  const t = newTip.value.trim()
  if (!t) return
  tipList.value = [...tipList.value, t]
  newTip.value = ''
}
function removeTip(i) {
  tipList.value = tipList.value.filter((_, idx) => idx !== i)
  if (editingTip.value === i) editingTip.value = -1
}
function moveTip(i, dir) {
  const j = i + dir
  if (j < 0 || j >= tipList.value.length) return
  const arr = [...tipList.value]
  ;[arr[i], arr[j]] = [arr[j], arr[i]]
  tipList.value = arr
}
function startEditTip(i) {
  editingTip.value = i
  editTipText.value = tipList.value[i]
  nextTick(() => editTipEl?.focus?.())
}
function commitTip() {
  const i = editingTip.value
  if (i < 0) return
  const t = editTipText.value.trim()
  if (t) {
    const arr = [...tipList.value]
    arr[i] = t
    tipList.value = arr
  }
  editingTip.value = -1
}
function cancelTip() { editingTip.value = -1 }
function resetTips() {
  tipList.value = [...DEFAULT_METRIC_TIPS]
  editingTip.value = -1
}

// 日志相关
const logs = ref([])
const logTotal = ref(0)
const logOffset = ref(0)
const logDetailId = ref(null)
const loadingLogs = ref(false)
const logAutoRefresh = ref(false)
let logRefreshTimer = null
const activeLogTab = ref('ai')  // 'ai' | 'tx'

const selectedLog = computed(() => {
  if (!logDetailId.value) return null
  return logs.value.find(l => l.id === logDetailId.value) || null
})

const intervalMinutes = computed(() => {
  const n = Math.max(1, Math.min(500, Number(form.gold_daily_count) || 50))
  return Math.round((15 * 60) / n)
})

const configuredText = computed(() => {
  const providers = []
  if (configured.agnes) providers.push('Agnes')
  if (configured.glm) providers.push('GLM')
  return providers.length ? `已配置：${providers.join('、')}` : ''
})

onMounted(async () => {
  try {
    const settings = await aiSettingsApi.getSettings()
    configured.agnes = Boolean(settings?.agnes_api_key_configured)
    configured.glm = Boolean(settings?.glm_api_key_configured)
    if (settings?.gold_daily_count) {
      form.gold_daily_count = Number(settings.gold_daily_count) || 50
    }
    if (settings?.default_model) {
      form.default_model = settings.default_model
    }
    if (settings?.market_fetch_interval) {
      form.market_fetch_interval = Number(settings.market_fetch_interval) || 30000
    }
    // 标语库：读取用户维护的标语列表
    tipList.value = parseMetricTips(settings?.[METRIC_TIPS_KEY])
    // 佣金档位：读取用户维护的列表，并定位当前生效档位
    feePresets.value = parseFeePresets(settings?.[FEE_PRESETS_KEY])
    const curRate = Number(settings?.stock_commission_rate)
    const curMinRaw = Number(settings?.stock_min_commission)
    const curMin = Number.isFinite(curMinRaw) ? curMinRaw : feeConfig.minCommission
    let matched = Number.isFinite(curRate) && curRate > 0
      ? feePresets.value.find(p => Math.abs(p.rate - curRate) < 1e-9 && p.min === curMin)
      : null
    if (!matched && Number.isFinite(curRate) && curRate > 0) {
      // 已生效配置不在档位列表中（如首次升级），补一条并选中
      matched = { id: newFeePresetId(), name: '当前生效', rate: curRate, min: curMin }
      feePresets.value = [...feePresets.value, matched]
    }
    activeFeeId.value = matched?.id || feePresets.value[0]?.id || ''
  } catch {
    error.value = '读取设置失败，请确认后端已启动'
  }
  // 获取 AI 调用统计
  try {
    const data = await aiSettingsApi.getUsage()
    usage.date = data.date
    usage.total = data.total
    usage.today = data.today ?? data.total  // 兼容旧接口
    usage.byModel = data.byModel
    usage.trend = data.trend || []
  } catch (_) { /* 静默失败 */ }
  // 获取 AI 调用日志
  fetchLogs()
})

onUnmounted(() => {
  stopLogAutoRefresh()
})

function flashFeeHint(msg, type = 'ok') {
  feeHint.value = msg
  feeHintType.value = type
}

// 从表单字段生成档位对象（费率万→小数、折扣折→小数）
function buildPreset(name, f) {
  const rate = (Number(f.rateWan) || 0) / 10000
  const min = Math.max(0, Number(f.min) || 0)
  return {
    name,
    rate,
    min,
    etfRate: (Number(f.etfRateWan) || 0) / 10000,
    etfMin: Math.max(0, Number(f.etfMin) || 0),
    cbRateSh: (Number(f.cbRateShWan) || 0) / 10000,
    cbRateSz: (Number(f.cbRateSzWan) || 0) / 10000,
    cbMin: Math.max(0, Number(f.cbMin) || 0),
    lofDiscount: (Number(f.lofZhe) || 0) / 10,
  }
}

function addFeePreset() {
  const rate = (Number(newFee.rateWan) || 0) / 10000
  if (!(rate > 0)) {
    flashFeeHint('请填写大于 0 的股票佣金费率', 'error')
    return
  }
  const min = Math.max(0, Number(newFee.min) || 0)
  const name = String(newFee.name || '').trim() || `万${toWan(rate)} · 最低${min}元`
  const dup = feePresets.value.find(p => Math.abs(p.rate - rate) < 1e-9 && p.min === min)
  if (dup) {
    activeFeeId.value = dup.id
    flashFeeHint(`已存在相同档位「${dup.name}」，已选中`)
    return
  }
  const item = { id: newFeePresetId(), ...buildPreset(name, newFee) }
  feePresets.value = [...feePresets.value, item]
  activeFeeId.value = item.id
  newFee.name = ''
  newFee.etfRateWan = 0
  newFee.etfMin = 0
  newFee.cbRateShWan = 0
  newFee.cbRateSzWan = 0
  newFee.cbMin = 0
  newFee.lofZhe = 0
  flashFeeHint(`已新增档位「${name}」，保存后生效`)
}

function quickAddFee(opt) {
  const min = 5
  const dup = feePresets.value.find(p => Math.abs(p.rate - opt.rate) < 1e-9 && p.min === min)
  if (dup) {
    activeFeeId.value = dup.id
    flashFeeHint(`「${dup.name}」已在列表中，已选中`)
    return
  }
  const name = `${opt.label} · 最低${min}元`
  const item = { id: newFeePresetId(), name, rate: opt.rate, min }
  feePresets.value = [...feePresets.value, item]
  activeFeeId.value = item.id
  flashFeeHint(`已新增档位「${name}」，保存后生效`)
}

function quickAddHuabao(h) {
  const dup = feePresets.value.find(p => p.name === h.name)
  if (dup) {
    activeFeeId.value = dup.id
    flashFeeHint(`「${dup.name}」已在列表中，已选中`)
    return
  }
  const item = { id: newFeePresetId(), ...h }
  feePresets.value = [...feePresets.value, item]
  activeFeeId.value = item.id
  flashFeeHint(`已新增档位「${h.name}」，保存后生效`)
}

function removeFeePreset(id) {
  const list = feePresets.value.filter(p => p.id !== id)
  if (!list.length) {
    flashFeeHint('至少保留一个档位', 'error')
    return
  }
  feePresets.value = list
  if (activeFeeId.value === id) activeFeeId.value = list[0].id
  if (editingId.value === id) editingId.value = null
  flashFeeHint('已删除档位，保存后生效')
}

// 双击档位卡片进入编辑态，自动聚焦名称并全选
function startEdit(p) {
  editingId.value = p.id
  editForm.name = p.name
  editForm.rateWan = toWan(p.rate)
  editForm.min = p.min
  editForm.etfRateWan = p.etfRate ? toWan(p.etfRate) : 0
  editForm.etfMin = p.etfMin || 0
  editForm.cbRateShWan = p.cbRateSh ? toWan(p.cbRateSh) : 0
  editForm.cbRateSzWan = p.cbRateSz ? toWan(p.cbRateSz) : 0
  editForm.cbMin = p.cbMin || 0
  editForm.lofZhe = p.lofDiscount ? p.lofDiscount * 10 : 0
  nextTick(() => {
    editNameEl?.focus?.()
    editNameEl?.select?.()
  })
}

function cancelEdit() {
  editingId.value = null
}

function commitEdit() {
  const id = editingId.value
  if (!id) return
  const rate = (Number(editForm.rateWan) || 0) / 10000
  const min = Math.max(0, Number(editForm.min) || 0)
  if (!(rate > 0)) {
    flashFeeHint('请填写大于 0 的股票佣金费率', 'error')
    return
  }
  const name = String(editForm.name || '').trim() || `万${toWan(rate)} · 最低${min}元`
  const dup = feePresets.value.find(p => p.id !== id && Math.abs(p.rate - rate) < 1e-9 && p.min === min)
  if (dup) {
    flashFeeHint(`已存在相同档位「${dup.name}」`, 'error')
    return
  }
  const next = buildPreset(name, editForm)
  feePresets.value = feePresets.value.map(p => (p.id === id ? { ...next, id } : p))
  editingId.value = null
  flashFeeHint(`已更新档位「${name}」，保存后生效`)
}

function selectLogDetail(id) {
  logDetailId.value = logDetailId.value === id ? null : id
}

function trendBarHeight(count) {
  if (!count) return 4 // 最小值留个细线
  const max = Math.max(...usage.trend.map(d => d.count), 1)
  return Math.max(4, (count / max) * 100)
}
// MySQL DATETIME(3) 形如 "YYYY-MM-DD HH:mm:ss.SSS"，无时区标识。
// 用 new Date(字符串) 解析在不同浏览器上行为不一致（Safari 直接 Invalid Date），
// 这里按本地时间显式解析，避免时区歧义。
function parseLogTime(str) {
  if (!str) return null
  const m = String(str).match(/^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2}):(\d{2})(?:\.(\d{1,3}))?/)
  if (!m) return null
  const ms = m[7] ? Number(m[7].padEnd(3, '0').slice(0, 3)) : 0
  return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), Number(m[4]), Number(m[5]), Number(m[6]), ms)
}
function formatLogTime(str) {
  const d = parseLogTime(str)
  if (!d || isNaN(d.getTime())) return ''
  const now = new Date()
  const sameDay = d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth() && d.getDate() === now.getDate()
  if (sameDay) {
    return d.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false })
  }
  const md = `${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  const hm = d.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', hour12: false })
  return `${md} ${hm}`
}
function formatLogFull(str) {
  const d = parseLogTime(str)
  if (!d || isNaN(d.getTime())) return str || ''
  const pad = n => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
}

async function fetchLogs() {
  loadingLogs.value = true
  logOffset.value = 0
  logDetailId.value = null
  try {
    const data = activeLogTab.value === 'ai'
      ? await aiSettingsApi.getLogs({ limit: 50, offset: 0 })
      : await stockApi.getTxLogs({ limit: 50, offset: 0 })
    logs.value = data.logs || []
    logTotal.value = data.total || 0
  } catch (_) {
    /* 静默失败 */
  } finally {
    loadingLogs.value = false
  }
}

async function loadMoreLogs() {
  if (loadingLogs.value) return
  loadingLogs.value = true
  logOffset.value = logs.value.length
  try {
    const data = activeLogTab.value === 'ai'
      ? await aiSettingsApi.getLogs({ limit: 50, offset: logOffset.value })
      : await stockApi.getTxLogs({ limit: 50, offset: logOffset.value })
    if (data.logs?.length) {
      logs.value = [...logs.value, ...data.logs]
    }
  } catch (_) {
    /* 静默失败 */
  } finally {
    loadingLogs.value = false
  }
}

function switchLogTab(tab) {
  if (activeLogTab.value === tab) return
  activeLogTab.value = tab
  fetchLogs()
}

// 交易日志 detail 字段是 JSON 字符串，解析后用于 v-if 判断和格式化展示
function parseDetail(raw) {
  if (!raw) return null
  try {
    const obj = typeof raw === 'string' ? JSON.parse(raw) : raw
    return obj && typeof obj === 'object' && Object.keys(obj).length ? obj : null
  } catch (_) {
    return null
  }
}

function formatDetail(raw) {
  const obj = parseDetail(raw)
  if (!obj) return ''
  return JSON.stringify(obj, null, 2)
}

function toggleAutoRefresh() {
  logAutoRefresh.value = !logAutoRefresh.value
  if (logAutoRefresh.value) {
    startLogAutoRefresh()
  } else {
    stopLogAutoRefresh()
  }
}

function startLogAutoRefresh() {
  stopLogAutoRefresh()
  logRefreshTimer = setInterval(() => {
    fetchLogs()
  }, 5000)
}

function stopLogAutoRefresh() {
  if (logRefreshTimer) {
    clearInterval(logRefreshTimer)
    logRefreshTimer = null
  }
}

async function save() {
  const payload = Object.fromEntries(
    Object.entries(form).filter(([key, value]) => {
      if (key === 'gold_daily_count') return true
      if (key === 'market_fetch_interval') return true
      return String(value).trim()
    })
  )
  payload.gold_daily_count = String(Math.max(1, Math.min(500, Number(form.gold_daily_count) || 50)))
  payload.market_fetch_interval = String(form.market_fetch_interval || 30000)
  // 佣金档位：持久化整份列表 + 当前选中档位的生效值
  payload[FEE_PRESETS_KEY] = serializeFeePresets(feePresets.value)
  // 标语库：持久化整份标语列表（为空时回退默认）
  payload[METRIC_TIPS_KEY] = serializeMetricTips(tipList.value)
  const fee = activeFee.value
  payload.stock_commission_rate = String(fee && fee.rate > 0 ? fee.rate : feeConfig.commissionRate)
  payload.stock_min_commission = String(fee ? Math.max(0, Number(fee.min) || 0) : feeConfig.minCommission)
  saving.value = true
  error.value = ''
  try {
    await aiSettingsApi.updateSettings(payload)
    setRingCount(draftRingCount.value)
    applyFeeSettings(payload)
    setMetricTips(parseMetricTips(payload[METRIC_TIPS_KEY]))
    emit('close')
  } catch {
    error.value = '保存失败，请稍后重试'
  } finally {
    saving.value = false
  }
}

// 模型预览测试：用当前配置的 API Key 和选择的模型发送"你好"
async function testModel() {
  testingModel.value = true
  testResult.value = ''
  testError.value = ''
  try {
    const res = await aiSettingsApi.testModel({
      model: form.default_model,
      agnes_api_key: form.agnes_api_key,
      glm_api_key: form.glm_api_key,
      message: '你好',
    })
    testResult.value = res?.reply || res?.content || JSON.stringify(res)
  } catch (err) {
    testError.value = err.response?.data?.error || err.response?.data?.message || '测试失败，请检查 API Key 和模型配置'
  } finally {
    testingModel.value = false
  }
}
</script>
