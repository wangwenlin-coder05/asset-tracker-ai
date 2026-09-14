<template>
  <div class="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 p-2" @click.self="$emit('close')">
    <section class="w-full max-w-[95vw] max-h-[95vh] h-full rounded-xl bg-white shadow-2xl flex flex-col">
      <div class="flex items-center justify-between px-5 py-4 shrink-0">
        <h2 class="text-base font-semibold text-slate-800">设置</h2>
        <button class="text-xl leading-none text-slate-400 hover:text-slate-700" title="关闭" @click="$emit('close')">×</button>
      </div>
      <div class="flex gap-4 px-5 pb-4 flex-1 min-h-0">
        <!-- 第一栏：设置控件 -->
        <div class="w-[240px] shrink-0 space-y-3 overflow-y-auto">
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
            <button type="button" class="rounded border border-slate-200 px-3 py-1.5 text-xs text-slate-600 hover:bg-slate-50 disabled:opacity-50 flex items-center gap-1.5" :disabled="testingModel" @click="testModel">
              <FlaskConical class="w-3.5 h-3.5" />{{ testingModel ? '测试中...' : '模型测试' }}
            </button>
            <p v-if="testResult" class="text-xs text-emerald-600 truncate flex-1" :title="testResult">{{ testResult }}</p>
            <p v-if="testError" class="text-xs text-rose-500 truncate flex-1" :title="testError">{{ testError }}</p>
          </div>

          <label class="block text-xs font-medium text-slate-600">
            黄金价格每日刷新次数
            <div class="mt-1 flex items-center gap-2">
              <input v-model.number="form.gold_daily_count" type="number" min="1" max="500" class="w-20 rounded border border-slate-200 px-2 py-2 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/10" placeholder="50" />
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

          <p v-if="configuredText" class="text-xs text-emerald-600">{{ configuredText }}</p>
          <p v-if="error" class="text-xs text-rose-500">{{ error }}</p>

          <div class="flex justify-end gap-2 pt-2">
            <button class="rounded border border-slate-200 px-3 py-1.5 text-sm text-slate-600 hover:bg-slate-50" @click="$emit('close')">取消</button>
            <button class="rounded bg-primary px-3 py-1.5 text-sm text-white hover:bg-blue-700 disabled:opacity-50" :disabled="saving" @click="save">{{ saving ? '保存中...' : '保存' }}</button>
          </div>
        </div>

        <!-- 第二栏：AI 统计 + 日志列表 -->
        <div class="w-[360px] shrink-0 flex flex-col">
          <div class="rounded-lg border border-slate-200 bg-slate-50/50 p-4 flex-1 flex flex-col min-h-0">
            <div class="flex items-center gap-4 mb-3 shrink-0">
              <span class="text-sm font-bold text-slate-700 flex items-center gap-1.5 shrink-0"><FlaskConical class="w-4 h-4 text-indigo-500" />AI 调用统计</span>
              <span class="text-xs text-slate-400">{{ usage.date || '今天' }}</span>
              <span class="text-2xl font-bold text-primary ml-auto">{{ usage.total ?? '--' }}</span>
              <span class="text-sm text-slate-500">次调用</span>
            </div>
            <div v-if="usage.byModel?.length" class="flex flex-wrap gap-2 mb-2 shrink-0">
              <div v-for="m in usage.byModel" :key="m.model" class="flex items-center gap-1.5 py-1 px-2.5 rounded-lg bg-white border border-slate-100">
                <span class="text-xs text-slate-600 font-mono">{{ m.model }}</span>
                <span class="text-xs font-bold text-slate-700">{{ m.count }}</span>
              </div>
            </div>
            <p v-if="usage.total === 0" class="text-xs text-slate-400 py-1 shrink-0">今天暂无 AI 调用</p>

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
                      <span class="text-slate-400 shrink-0 w-16">{{ formatLogTime(log.created_at) }}</span>
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
                      <span class="text-slate-400 shrink-0 w-16">{{ formatLogTime(log.created_at) }}</span>
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

        <!-- 第三栏：日志详情 -->
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
                  <div class="flex justify-between"><span class="font-semibold text-slate-600">时间</span><span>{{ formatLogTime(selectedLog.created_at) }}</span></div>
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
                  <div class="flex justify-between"><span class="font-semibold text-slate-600">时间</span><span>{{ formatLogTime(selectedLog.created_at) }}</span></div>
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
    </section>
  </div>
</template>

<script setup>
import { computed, reactive, ref, onMounted, onUnmounted } from 'vue'
import { FlaskConical, Terminal, RefreshCw } from 'lucide-vue-next'
import { aiSettingsApi, stockApi } from '../utils/api'

const emit = defineEmits(['close'])
const form = reactive({ agnes_api_key: '', glm_api_key: '', default_model: 'agnes-2.0-flash', gold_daily_count: 50, market_fetch_interval: 30000 })
const usage = reactive({ date: '', total: null, byModel: [] })
const saving = ref(false)
const error = ref('')
const configured = reactive({ agnes: false, glm: false })
const testingModel = ref(false)
const testResult = ref('')
const testError = ref('')

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
  } catch {
    error.value = '读取设置失败，请确认后端已启动'
  }
  // 获取 AI 调用统计
  try {
    const data = await aiSettingsApi.getUsage()
    usage.date = data.date
    usage.total = data.total
    usage.byModel = data.byModel
  } catch (_) { /* 静默失败 */ }
  // 获取 AI 调用日志
  fetchLogs()
})

onUnmounted(() => {
  stopLogAutoRefresh()
})

function selectLogDetail(id) {
  logDetailId.value = logDetailId.value === id ? null : id
}

function formatLogTime(isoStr) {
  if (!isoStr) return ''
  const d = new Date(isoStr)
  return d.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false })
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
  saving.value = true
  error.value = ''
  try {
    await aiSettingsApi.updateSettings(payload)
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