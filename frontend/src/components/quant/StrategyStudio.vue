<template>
  <div class="studio-mask" @click.self="emit('close')">
    <div class="studio-panel" role="dialog" aria-modal="true">
      <!-- 头部 -->
      <header class="flex items-center gap-3 px-5 py-3.5 border-b border-slate-100 flex-shrink-0">
        <span class="w-9 h-9 rounded-xl bg-gradient-to-br from-indigo-500 to-violet-500 flex items-center justify-center flex-shrink-0">
          <Sparkles class="w-4 h-4 text-white" />
        </span>
        <div class="min-w-0">
          <h3 class="text-sm font-bold text-slate-800 flex items-center gap-2">
            AI 策略工坊
            <span class="px-1.5 py-0.5 rounded text-[10px] font-medium bg-violet-50 text-violet-600">自定义策略</span>
          </h3>
          <p class="text-[11px] text-slate-400 truncate">用一句话描述你的交易想法，AI 写成可回测的策略代码，校验通过后即可直接回测</p>
        </div>
        <span v-if="!aiReady" class="ml-auto px-2 py-1 rounded-full text-[10px] bg-amber-50 text-amber-600 border border-amber-200 flex items-center gap-1 flex-shrink-0">
          <AlertCircle class="w-3 h-3" />未配置 AI Key
        </span>
        <button @click="emit('close')" title="关闭 (Esc)"
          class="ml-auto w-8 h-8 rounded-lg hover:bg-slate-100 flex items-center justify-center text-slate-400 flex-shrink-0">
          <X class="w-4 h-4" />
        </button>
      </header>

      <div class="flex-1 min-h-0 grid grid-cols-1 lg:grid-cols-[250px_minmax(0,1fr)]">
        <!-- 左：我的策略库 -->
        <aside class="border-r border-slate-100 bg-slate-50/60 flex flex-col min-h-0">
          <div class="flex items-center justify-between px-3 py-2.5 border-b border-slate-100 flex-shrink-0">
            <span class="text-xs font-bold text-slate-600 flex items-center gap-1.5">
              <BookOpen class="w-3.5 h-3.5 text-slate-400" />我的策略库
              <span class="text-slate-400 font-normal">({{ library.length }})</span>
            </span>
            <button @click="loadLibrary" :disabled="libBusy" title="刷新"
              class="w-6 h-6 rounded-md hover:bg-slate-200/70 flex items-center justify-center text-slate-400">
              <RefreshCw class="w-3.5 h-3.5" :class="libBusy && 'animate-spin'" />
            </button>
          </div>

          <div class="flex-1 min-h-0 overflow-y-auto p-2 space-y-2" style="overscroll-behavior: contain">
            <div v-if="!library.length" class="px-3 py-8 text-center">
              <Lightbulb class="w-7 h-7 text-slate-200 mx-auto mb-2" />
              <p class="text-[11px] text-slate-400 leading-5">还没有自定义策略<br />在右侧描述一个想法试试</p>
            </div>

            <div v-for="s in library" :key="s.key"
              class="rounded-xl border bg-white p-2.5 transition-colors"
              :class="editingKey === s.key ? 'border-indigo-300 ring-1 ring-indigo-100' : 'border-slate-100 hover:border-indigo-200'">
              <div class="flex items-start gap-1.5">
                <span class="text-xs font-bold text-slate-700 leading-tight flex-1 min-w-0 break-words">{{ s.name }}</span>
                <span class="px-1 py-0.5 rounded text-[9px] bg-slate-100 text-slate-500 flex-shrink-0">v{{ s.version }}</span>
              </div>
              <p class="text-[10px] text-slate-400 mt-0.5 font-mono truncate">{{ s.key }}</p>
              <p v-if="s.description" class="text-[10px] text-slate-400 mt-1 line-clamp-2 leading-4">{{ s.description }}</p>
              <p class="text-[10px] text-slate-300 mt-1">{{ fmtTime(s.updated_at) }} · {{ s.params.length }} 个参数</p>
              <div class="flex items-center gap-1 mt-2">
                <button @click="loadIntoStudio(s)" title="载入并改进"
                  class="flex-1 px-1.5 py-1 rounded-md text-[10px] font-medium bg-indigo-50 text-indigo-600 hover:bg-indigo-100 flex items-center justify-center gap-1">
                  <Pencil class="w-3 h-3" />改进
                </button>
                <button @click="doRollback(s)" :disabled="!s.history_count || busy"
                  title="回滚到上一版"
                  class="px-1.5 py-1 rounded-md text-[10px] text-slate-500 bg-slate-100 hover:bg-slate-200 disabled:opacity-40 flex items-center justify-center">
                  <RotateCcw class="w-3 h-3" />
                </button>
                <button @click="doDelete(s)" :disabled="busy" title="删除"
                  class="px-1.5 py-1 rounded-md text-[10px] text-red-500 bg-red-50 hover:bg-red-100 disabled:opacity-40 flex items-center justify-center">
                  <Trash2 class="w-3 h-3" />
                </button>
              </div>
            </div>
          </div>
        </aside>

        <!-- 右：工作区 -->
        <main class="min-h-0 overflow-y-auto p-4 space-y-3" style="overscroll-behavior: contain">
          <!-- 想法输入 -->
          <section class="rounded-xl border border-slate-100 bg-white p-3.5">
            <div class="flex items-center gap-2 mb-2">
              <span class="w-5 h-5 rounded-md bg-indigo-50 text-indigo-500 flex items-center justify-center text-[11px] font-bold">1</span>
              <h4 class="text-xs font-bold text-slate-700">描述你的交易想法</h4>
              <span class="text-[11px] text-slate-400">说人话就行，AI 负责翻译成代码</span>
            </div>
            <textarea v-model="idea" rows="4" :disabled="busy"
              placeholder="例如：找连续 3 天缩量回调、今天放量突破前高的股票买入；跌破 10 日均线就卖出。"
              class="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm resize-y focus:outline-none focus:border-indigo-300 disabled:bg-slate-50"></textarea>

            <div class="flex flex-wrap items-end gap-2 mt-2">
              <div class="min-w-[180px]">
                <label class="text-[11px] text-slate-500">基于已有策略改写（可选）</label>
                <select v-model="baseKey" :disabled="busy"
                  class="w-full mt-1 px-2 py-1.5 rounded-lg border border-slate-200 text-xs bg-white">
                  <option value="">不基于任何策略，从零写</option>
                  <optgroup label="内置策略">
                    <option v-for="k in builtinKeys" :key="k" :value="k">{{ stratName(k) }}</option>
                  </optgroup>
                  <optgroup v-if="library.length" label="我的自定义策略">
                    <option v-for="s in library" :key="s.key" :value="s.key">{{ s.name }}</option>
                  </optgroup>
                </select>
              </div>
              <button @click="generate" :disabled="!canGenerate"
                class="px-4 py-2 rounded-lg text-sm font-bold text-white bg-indigo-500 hover:bg-indigo-600 disabled:opacity-50 flex items-center gap-1.5">
                <Sparkles class="w-4 h-4" :class="busy && 'animate-pulse'" />
                {{ busy ? (stage || '生成中…') : '生成策略' }}
              </button>
            </div>
            <p v-if="!serviceUp" class="text-[11px] text-amber-600 mt-2 flex items-center gap-1">
              <AlertCircle class="w-3.5 h-3.5" />请先在上方开启量化服务
            </p>
          </section>

          <!-- 错误 -->
          <section v-if="error" class="rounded-xl border border-red-100 bg-red-50/70 px-3.5 py-2.5 text-xs text-red-600 flex items-start gap-2">
            <AlertCircle class="w-4 h-4 flex-shrink-0 mt-0.5" />
            <span class="leading-5">{{ error }}</span>
          </section>

          <!-- 草稿审阅 -->
          <section v-if="draft" class="rounded-xl border border-slate-100 bg-white p-3.5 space-y-3">
            <div class="flex items-center gap-2">
              <span class="w-5 h-5 rounded-md bg-indigo-50 text-indigo-500 flex items-center justify-center text-[11px] font-bold">2</span>
              <h4 class="text-xs font-bold text-slate-700">审阅并微调</h4>
              <span v-if="editingKey" class="px-1.5 py-0.5 rounded text-[10px] bg-amber-50 text-amber-600">改进中 · 保存将覆盖 v{{ editingVersion }}</span>
              <span v-else class="px-1.5 py-0.5 rounded text-[10px] bg-emerald-50 text-emerald-600">新策略</span>
            </div>

            <div class="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div>
                <label class="text-[11px] text-slate-500">策略名称</label>
                <input v-model="draft.name" class="w-full mt-1 px-2.5 py-1.5 rounded-lg border border-slate-200 text-sm" />
              </div>
              <div>
                <label class="text-[11px] text-slate-500">策略标识（英文小写下划线）</label>
                <input v-model="draft.key" :disabled="!!editingKey"
                  class="w-full mt-1 px-2.5 py-1.5 rounded-lg border border-slate-200 text-sm font-mono disabled:bg-slate-50" />
              </div>
            </div>

            <div>
              <label class="text-[11px] text-slate-500">一句话说明</label>
              <input v-model="draft.description" class="w-full mt-1 px-2.5 py-1.5 rounded-lg border border-slate-200 text-sm" />
            </div>

            <div class="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div class="rounded-lg border border-emerald-100 bg-emerald-50/40 px-2.5 py-2">
                <span class="text-[10px] font-bold text-emerald-600">买入条件</span>
                <p class="text-xs text-slate-600 mt-0.5 leading-5">{{ draft.buy_rule || '—' }}</p>
              </div>
              <div class="rounded-lg border border-red-100 bg-red-50/40 px-2.5 py-2">
                <span class="text-[10px] font-bold text-red-500">卖出条件</span>
                <p class="text-xs text-slate-600 mt-0.5 leading-5">{{ draft.sell_rule || '—' }}</p>
              </div>
            </div>

            <p v-if="draft.notes" class="text-[11px] text-slate-500 bg-slate-50 rounded-lg px-2.5 py-2 leading-5">
              <span class="font-semibold text-slate-600">提示：</span>{{ draft.notes }}
            </p>

            <!-- 参数 -->
            <div v-if="draft.params && draft.params.length">
              <p class="text-[11px] font-semibold text-slate-500 mb-1.5">
                可调参数
                <span class="font-normal text-slate-400">· 建仓股数等直接填，试跑就用你填的值</span>
              </p>
              <div class="grid grid-cols-2 sm:grid-cols-3 gap-2">
                <label v-for="p in draft.params" :key="p.key" class="flex flex-col gap-1">
                  <span class="text-[10px] text-slate-500">{{ p.label }}</span>
                  <input v-model.number="paramValues[p.key]" type="number"
                    :step="p.step || 'any'" :min="p.min" :max="p.max"
                    class="w-full px-2 py-1 rounded-md border border-slate-200 text-xs focus:outline-none focus:border-indigo-300" />
                </label>
              </div>
            </div>

            <!-- 冒烟结果 -->
            <div v-if="smoke" class="rounded-lg border px-3 py-2"
              :class="(!smoke.ok || smoke.zero_trades) ? 'border-red-200 bg-red-50/60' : 'border-emerald-100 bg-emerald-50/50'">
              <div class="flex items-center gap-1.5 text-[11px] font-semibold"
                :class="(!smoke.ok || smoke.zero_trades) ? 'text-red-600' : 'text-emerald-700'">
                <AlertCircle v-if="!smoke.ok || smoke.zero_trades" class="w-3.5 h-3.5" />
                <CheckCircle2 v-else class="w-3.5 h-3.5" />
                {{ !smoke.ok ? '冒烟回测未通过' : (smoke.zero_trades ? '冒烟回测跑通，但 0 笔交易' : '冒烟回测通过') }}
              </div>
              <p v-if="!smoke.ok" class="text-[11px] text-red-500 mt-1 leading-5 break-all">{{ smoke.error || '未知错误' }}</p>
              <p v-else-if="smoke.skipped" class="text-[11px] text-slate-500 mt-1">{{ smoke.note }}</p>
              <p v-else class="text-[11px] text-slate-600 mt-1">
                样本 {{ smoke.sample }}<span v-if="smoke.sample_name"> · {{ smoke.sample_name }}</span>
                · {{ smoke.bars }} 根 K 线 → 收益
                <b :class="(smoke.metrics?.total_return_pct ?? 0) >= 0 ? 'text-profit' : 'text-loss'">{{ smoke.metrics?.total_return_pct }}%</b>
                · 回撤 {{ smoke.metrics?.max_drawdown_pct }}% ·
                <b :class="smoke.zero_trades ? 'text-red-600' : 'text-slate-700'">{{ smoke.metrics?.trade_count }} 笔</b>
              </p>
              <p v-if="smoke.zero_trades" class="text-[11px] text-red-500 mt-1 leading-5">
                策略在整段样本里从没开过仓，所以收益恒为 0。多半是只写了「补仓/加仓」，漏了空仓时的「首仓买入」条件——
                加仓在空仓时不生效。请让 AI 改进或在代码里补上首仓规则。
              </p>
            </div>

            <!-- 警告 -->
            <ul v-if="warnings && warnings.length" class="space-y-1">
              <li v-for="(w, i) in warnings" :key="i" class="text-[11px] text-amber-600 flex items-start gap-1.5">
                <AlertCircle class="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />{{ w }}
              </li>
            </ul>

            <!-- 代码 -->
            <div class="rounded-lg border border-slate-100 overflow-hidden">
              <button @click="showCode = !showCode"
                class="w-full flex items-center gap-2 px-3 py-2 bg-slate-50 text-[11px] font-semibold text-slate-600 hover:bg-slate-100">
                <Code2 class="w-3.5 h-3.5 text-slate-400" />策略代码
                <span class="text-slate-400 font-normal">{{ draft.code.split('\n').length }} 行</span>
                <ChevronDown class="w-3.5 h-3.5 ml-auto text-slate-400 transition-transform" :class="showCode && 'rotate-180'" />
              </button>
              <textarea v-if="showCode" v-model="draft.code" rows="18" spellcheck="false"
                class="w-full px-3 py-2 text-[11px] font-mono leading-5 resize-y focus:outline-none border-t border-slate-100 bg-[#0f172a] text-slate-100"></textarea>
            </div>

            <!-- 操作 -->
            <div class="flex flex-wrap items-center gap-2 pt-0.5">
              <button @click="doValidate" :disabled="busy"
                class="px-3 py-1.5 rounded-lg text-xs font-medium text-slate-600 bg-slate-100 hover:bg-slate-200 disabled:opacity-50 flex items-center gap-1">
                <RefreshCw class="w-3.5 h-3.5" :class="busy && 'animate-spin'" />校验并试跑
              </button>
              <button @click="doSave" :disabled="busy"
                class="px-4 py-1.5 rounded-lg text-xs font-bold text-white bg-emerald-500 hover:bg-emerald-600 disabled:opacity-50 flex items-center gap-1">
                <Save class="w-3.5 h-3.5" />{{ editingKey ? '保存为新版本' : '保存为策略' }}
              </button>
              <span v-if="saveMsg" class="text-[11px]" :class="saveOk ? 'text-emerald-600' : 'text-red-500'">{{ saveMsg }}</span>
            </div>
          </section>

          <!-- 改进意见 -->
          <section v-if="draft" class="rounded-xl border border-slate-100 bg-white p-3.5">
            <div class="flex items-center gap-2 mb-2">
              <span class="w-5 h-5 rounded-md bg-indigo-50 text-indigo-500 flex items-center justify-center text-[11px] font-bold">3</span>
              <h4 class="text-xs font-bold text-slate-700">还不满意？让 AI 继续改</h4>
              <span class="text-[11px] text-slate-400">AI 会直接修改代码逻辑，不是调参数</span>
            </div>
            <div class="flex gap-2">
              <input v-model="feedback" :disabled="busy"
                @keyup.enter="refine"
                placeholder="例如：加一个止损，跌破买入价 5% 就卖；买入条件再严格一点"
                class="flex-1 min-w-0 px-3 py-2 rounded-lg border border-slate-200 text-sm focus:outline-none focus:border-indigo-300" />
              <button @click="refine" :disabled="!feedback.trim() || busy"
                class="px-4 py-2 rounded-lg text-sm font-medium text-white bg-violet-500 hover:bg-violet-600 disabled:opacity-50 flex items-center gap-1">
                <Sparkles class="w-4 h-4" />改进
              </button>
            </div>
          </section>

          <!-- 空态 -->
          <section v-if="!draft && !error && !busy"
            class="rounded-xl border-2 border-dashed border-slate-100 py-12 text-center">
            <Lightbulb class="w-10 h-10 text-slate-200 mx-auto mb-2" />
            <p class="text-sm font-semibold text-slate-400">把你的想法写在上方</p>
            <p class="text-[11px] text-slate-300 mt-1 leading-5">
              AI 会生成完整策略代码 → 自动静态安全校验 → 在本地行情上真跑一次回测 → 通过后即可保存。
            </p>
          </section>

          <section v-if="busy"
            class="rounded-xl border border-indigo-100 bg-indigo-50/50 py-10 text-center">
            <Loader2 class="w-8 h-8 text-indigo-400 mx-auto mb-2 animate-spin" />
            <p class="text-sm font-semibold text-indigo-500">{{ stage || 'AI 正在写策略…' }}</p>
            <p class="text-[11px] text-slate-400 mt-1">通常会尝试 1~3 次，自动修复校验不通过的问题</p>
          </section>
        </main>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onBeforeUnmount } from 'vue'
import {
  Sparkles, X, Save, RefreshCw, Trash2, RotateCcw, Pencil, BookOpen,
  Lightbulb, Code2, ChevronDown, CheckCircle2, AlertCircle, Loader2,
} from 'lucide-vue-next'
import { quantApi } from '../../utils/api'

const props = defineProps({
  serviceUp: { type: Boolean, default: false },
  aiReady: { type: Boolean, default: false },
  builtinKeys: { type: Array, default: () => [] },
  stratNames: { type: Object, default: () => ({}) },
  sampleCode: { type: String, default: '' },
})
const emit = defineEmits(['close', 'changed'])

function stratName(k) { return props.stratNames[k] || k }

// ---------- 状态 ----------
const library = ref([])
const libBusy = ref(false)
const idea = ref('')
const baseKey = ref('')
const feedback = ref('')
const busy = ref(false)
const stage = ref('')
const error = ref('')
const draft = ref(null)
const smoke = ref(null)
const warnings = ref([])
const paramValues = ref({})
const showCode = ref(false)
const saveMsg = ref('')
const saveOk = ref(false)
const editingKey = ref('')
const editingVersion = ref(0)

const canGenerate = computed(() => !!idea.value.trim() && !busy.value && props.serviceUp)

// ---------- 数据 ----------
async function loadLibrary() {
  if (libBusy.value) return
  libBusy.value = true
  try {
    const r = await quantApi.strategyRegistry()
    library.value = r.custom || []
  } catch (e) {
    library.value = []
  } finally {
    libBusy.value = false
  }
}

function resetDraft() {
  draft.value = null
  smoke.value = null
  warnings.value = []
  paramValues.value = {}
  error.value = ''
  saveMsg.value = ''
  showCode.value = false
  editingKey.value = ''
  editingVersion.value = 0
}

function initParamValues(params) {
  const v = {}
  for (const p of (params || [])) v[p.key] = p.default
  paramValues.value = v
}

function applyResult(res) {
  draft.value = { ...res.draft }
  smoke.value = res.smoke || null
  warnings.value = res.warnings || []
  initParamValues(res.draft?.params)
}

// ---------- 生成 ----------
async function generate() {
  if (!canGenerate.value) return
  busy.value = true
  error.value = ''
  saveMsg.value = ''
  stage.value = 'AI 正在写策略…'
  try {
    const res = await quantApi.strategyGenerate({
      idea: idea.value.trim(),
      base_key: baseKey.value || undefined,
      sample_code: props.sampleCode || undefined,
    })
    if (!res.ok) {
      error.value = res.error || '生成失败'
      if (res.draft) draft.value = { ...res.draft }
      warnings.value = res.warnings || []
      return
    }
    editingKey.value = ''
    editingVersion.value = 0
    applyResult(res)
  } catch (e) {
    error.value = e.response?.data?.detail || e.message || '生成失败'
  } finally {
    busy.value = false
    stage.value = ''
  }
}

// ---------- 改进 ----------
async function refine() {
  const fb = feedback.value.trim()
  if (!fb || busy.value || !draft.value) return
  busy.value = true
  error.value = ''
  saveMsg.value = ''
  stage.value = 'AI 正在按你的意见改…'
  try {
    let res
    if (editingKey.value) {
      res = await quantApi.strategyRefine({
        key: editingKey.value, feedback: fb, sample_code: props.sampleCode || undefined,
      })
    } else {
      res = await quantApi.strategyGenerate({
        idea: idea.value.trim() || draft.value.description || '改进这个策略',
        base_code: draft.value.code,
        feedback: fb,
        sample_code: props.sampleCode || undefined,
      })
    }
    if (!res.ok) {
      error.value = res.error || '改进失败'
      return
    }
    applyResult(res)
    feedback.value = ''
  } catch (e) {
    error.value = e.response?.data?.detail || e.message || '改进失败'
  } finally {
    busy.value = false
    stage.value = ''
  }
}

// ---------- 校验 / 保存 ----------
function draftPayload() {
  return {
    key: (draft.value.key || '').trim(),
    name: (draft.value.name || '').trim(),
    code: draft.value.code || '',
    description: draft.value.description || '',
    buy_rule: draft.value.buy_rule || '',
    sell_rule: draft.value.sell_rule || '',
    idea: idea.value.trim() || draft.value.description || '',
    params: { ...paramValues.value },
  }
}

async function doValidate() {
  if (busy.value) return
  busy.value = true
  stage.value = '校验并试跑…'
  saveMsg.value = ''
  try {
    const res = await quantApi.strategyValidate({ ...draftPayload() })
    warnings.value = res.warnings || []
    smoke.value = res.smoke || null
    if (res.ok && res.zero_trades) {
      saveOk.value = false
      saveMsg.value = '0 笔交易：策略从未开仓，请先补上首仓规则'
    } else {
      saveOk.value = !!res.ok
      saveMsg.value = res.ok ? '校验通过，可以保存' : ('校验未通过：' + (res.errors || []).join('；'))
    }
  } catch (e) {
    saveOk.value = false
    saveMsg.value = e.response?.data?.detail || e.message || '校验失败'
  } finally {
    busy.value = false
    stage.value = ''
  }
}

async function doSave() {
  if (busy.value || !draft.value) return
  const p = draftPayload()
  if (!p.key) { saveMsg.value = '请填写策略标识'; saveOk.value = false; return }
  if (!p.name) { saveMsg.value = '请填写策略名称'; saveOk.value = false; return }
  busy.value = true
  stage.value = '保存中…'
  saveMsg.value = ''
  try {
    const res = await quantApi.strategySave({ ...p, note: editingKey.value ? 'AI 改进' : 'AI 生成' })
    saveOk.value = true
    saveMsg.value = `已保存 ${res.meta?.name || p.name} · v${res.meta?.version ?? ''}`
    editingKey.value = res.meta?.key || p.key
    editingVersion.value = res.meta?.version || editingVersion.value
    await loadLibrary()
    emit('changed')
  } catch (e) {
    saveOk.value = false
    saveMsg.value = e.response?.data?.detail || e.message || '保存失败'
  } finally {
    busy.value = false
    stage.value = ''
  }
}

// ---------- 库操作 ----------
async function loadIntoStudio(s) {
  if (busy.value) return
  busy.value = true
  stage.value = '载入策略…'
  error.value = ''
  try {
    const meta = await quantApi.strategyCustomDetail(s.key)
    draft.value = {
      key: meta.key,
      name: meta.name,
      description: meta.description || '',
      buy_rule: meta.buy_rule || '',
      sell_rule: meta.sell_rule || '',
      notes: '',
      code: meta.code || '',
      params: meta.params || [],
    }
    initParamValues(meta.params || [])
    idea.value = meta.idea || ''
    editingKey.value = meta.key
    editingVersion.value = meta.version || 0
    smoke.value = null
    warnings.value = []
    saveMsg.value = ''
    showCode.value = true
    feedback.value = ''
  } catch (e) {
    error.value = e.response?.data?.detail || e.message || '载入失败'
  } finally {
    busy.value = false
    stage.value = ''
  }
}

async function doDelete(s) {
  if (busy.value) return
  if (!window.confirm(`确定删除自定义策略「${s.name}」？该操作不可撤销。`)) return
  busy.value = true
  try {
    await quantApi.strategyCustomDelete(s.key)
    if (editingKey.value === s.key) resetDraft()
    await loadLibrary()
    emit('changed')
  } catch (e) {
    error.value = e.response?.data?.detail || e.message || '删除失败'
  } finally {
    busy.value = false
  }
}

async function doRollback(s) {
  if (busy.value || !s.history_count) return
  if (!window.confirm(`把「${s.name}」回滚到上一个版本？当前版本会先快照，可再次回滚。`)) return
  busy.value = true
  try {
    const res = await quantApi.strategyRollback(s.key)
    await loadLibrary()
    emit('changed')
    saveOk.value = true
    saveMsg.value = `已回滚到 v${res.rolled_back_to}`
  } catch (e) {
    error.value = e.response?.data?.detail || e.message || '回滚失败'
  } finally {
    busy.value = false
  }
}

// ---------- 杂项 ----------
function fmtTime(ts) {
  if (!ts) return ''
  const d = new Date(ts * 1000)
  const p = (n) => String(n).padStart(2, '0')
  return `${d.getMonth() + 1}/${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`
}

function onKey(e) { if (e.key === 'Escape' && !busy.value) emit('close') }
onMounted(() => {
  window.addEventListener('keydown', onKey)
  loadLibrary()
})
onBeforeUnmount(() => window.removeEventListener('keydown', onKey))
</script>

<style scoped>
.studio-mask {
  position: fixed;
  inset: 0;
  z-index: 60;
  display: flex;
  justify-content: flex-end;
  background: rgba(15, 23, 42, 0.45);
  backdrop-filter: blur(3px);
  overscroll-behavior: contain;
  animation: studioFade 0.28s ease both;
}
.studio-panel {
  width: min(1180px, 94vw);
  height: 100%;
  background: #fff;
  display: flex;
  flex-direction: column;
  box-shadow: -12px 0 40px rgba(15, 23, 42, 0.18);
  animation: studioSlide 0.38s cubic-bezier(0.22, 1, 0.36, 1) both;
}
@keyframes studioFade {
  from { opacity: 0; }
  to { opacity: 1; }
}
@keyframes studioSlide {
  from { transform: translateX(100%); }
  to { transform: translateX(0); }
}
@media (max-width: 980px) {
  .studio-panel { width: 100%; }
}
.line-clamp-2 {
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}
</style>