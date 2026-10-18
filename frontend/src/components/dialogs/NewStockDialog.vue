<template>
  <div class="fixed inset-0 bg-black/50 flex items-center justify-center z-50" :class="{ 'hidden': !visible }" @keydown="handleShortcut">
    <div class="bg-white rounded-xl p-6 w-[760px] h-[720px] max-w-[95vw] max-h-[90vh] flex flex-col card-shadow dialog-enter" role="dialog" aria-modal="true" aria-label="新增买入">
      <div class="flex justify-between items-center mb-4">
        <h3 class="text-lg font-bold text-slate-800 flex items-center gap-2">
          <PlusCircle class="w-5 h-5 text-primary" />
          新增买入
          <span v-if="stockSuffix" class="text-sm font-normal text-slate-500">{{ stockSuffix }}</span>
        </h3>
        <button @click="$emit('close')" :disabled="batchSubmitting" class="text-neutral hover:text-slate-800 disabled:opacity-40">
          <X class="w-5 h-5" />
        </button>
      </div>
      <div class="flex gap-2 mb-4 rounded-lg bg-slate-100 p-1">
        <button v-for="mode in [{ value: false, label: '单只买入' }, { value: true, label: '批量买入' }]" :key="String(mode.value)" :disabled="batchSubmitting" @click="batchMode = mode.value" class="flex-1 rounded-md py-2 text-sm font-medium transition-colors" :class="batchMode === mode.value ? 'bg-white text-emerald-700 shadow-sm' : 'text-slate-500'">{{ mode.label }}</button>
      </div>
      <p class="mb-3 text-xs text-slate-400">Ctrl / ⌘ + Enter 提交 · Esc 关闭 · Alt + 1 / 2 切换模式<span v-if="batchMode"> · Alt + N 新增一行</span></p>
      <div v-if="batchMode" class="buy-form-scroll space-y-3 flex-1 min-h-0 overflow-y-auto pr-1">
        <div class="rounded-xl border border-emerald-100 bg-emerald-50 p-3 text-xs leading-5 text-emerald-800">一次录入多只股票的买入记录；已有持仓自动追加补仓，不会重复新建标的。支持每行不同日期、价格和股数。</div>
        <textarea v-model="pasteText" :disabled="batchSubmitting" placeholder="粘贴股票代码和名称，每行一只，例如：002438 江苏神通" class="w-full h-20 rounded-lg border border-slate-200 px-3 py-2 text-xs"></textarea>
        <div class="flex items-center justify-between gap-2">
          <button @click="importBatchStocks" :disabled="batchSubmitting || !parsedPastedStocks.length" class="rounded-lg border border-emerald-200 px-3 py-1.5 text-xs text-emerald-700 disabled:opacity-40">导入识别结果（{{ parsedPastedStocks.length }}）</button>
          <button @click="addBatchRow" :disabled="batchSubmitting" class="rounded-lg border border-slate-200 px-3 py-1.5 text-xs text-slate-600 disabled:opacity-40">＋ 添加一行</button>
        </div>
        <div v-for="(row, index) in batchRows" :key="row.key" class="rounded-xl border border-slate-200 bg-slate-50 p-3 space-y-2">
          <div class="flex items-center justify-between text-xs text-slate-500"><span>买入 {{ index + 1 }}</span><button @click="batchRows.splice(index, 1)" :disabled="batchSubmitting || batchRows.length === 1" class="text-rose-500 disabled:opacity-40">移除</button></div>
          <div class="grid grid-cols-2 sm:grid-cols-5 gap-2">
            <label class="text-xs text-slate-500">代码<input v-model="row.code" @change="resolveBatchName(row)" :disabled="batchSubmitting" placeholder="6 位代码" class="mt-1 w-full rounded border border-slate-200 px-2 py-2 text-slate-800" /></label>
            <label class="text-xs text-slate-500">名称<input v-model="row.name" :disabled="batchSubmitting" placeholder="股票名称" class="mt-1 w-full rounded border border-slate-200 px-2 py-2 text-slate-800" /></label>
            <label class="text-xs text-slate-500">买入日期<input v-model="row.buyDate" :disabled="batchSubmitting" type="date" class="mt-1 w-full rounded border border-slate-200 px-2 py-2 text-slate-800" /></label>
            <label class="text-xs text-slate-500">买入价<input v-model.number="row.buyPrice" :disabled="batchSubmitting" type="number" min="0.001" step="0.001" placeholder="元" class="mt-1 w-full rounded border border-slate-200 px-2 py-2 text-slate-800" /></label>
            <label class="text-xs text-slate-500">股数<input v-model.number="row.buyCount" :disabled="batchSubmitting" type="number" min="1" step="1" class="mt-1 w-full rounded border border-slate-200 px-2 py-2 text-slate-800" /></label>
          </div>
          <div class="flex flex-wrap items-center gap-2 text-xs">
            <span class="text-slate-400">日期</span>
            <button v-for="offset in [0, -1, -2]" :key="offset" @click="setBatchDate(row, offset)" :disabled="batchSubmitting" class="rounded border border-slate-200 px-2 py-1 text-slate-500 hover:border-emerald-300 disabled:opacity-40">{{ offset === 0 ? '今天' : offset === -1 ? '昨天' : '前天' }}</button>
            <span class="ml-2 text-slate-400">股数</span>
            <button v-for="count in [100, 200, 300, 400]" :key="count" @click="row.buyCount = count" :disabled="batchSubmitting" class="rounded border px-2 py-1 disabled:opacity-40" :class="row.buyCount === count ? 'border-emerald-500 bg-emerald-500 text-white' : 'border-slate-200 text-slate-500 hover:border-emerald-300'">{{ count }}</button>
          </div>
          <p class="text-xs text-slate-500">成交额 ¥{{ formatNumber((row.buyPrice || 0) * (row.buyCount || 0)) }} · 手续费 ¥{{ formatNumber(calcBuyFee(row.buyPrice, row.buyCount).total) }}</p>
        </div>
        <div class="rounded-lg bg-emerald-50 p-3 text-sm text-emerald-800">共 {{ batchRows.length }} 笔 · 总支出（含费用）¥{{ formatNumber(batchTotal) }}</div>
        <p v-if="batchMessage" role="status" class="text-xs leading-5 text-amber-700">{{ batchMessage }}</p>
        <button @click="submitBatch" :disabled="batchSubmitting || !batchRows.length" class="w-full rounded-lg bg-emerald-600 py-2.5 font-medium text-white hover:bg-emerald-700 disabled:opacity-50">{{ batchSubmitting ? '提交中…' : '确认批量买入' }}</button>
      </div>
      <div v-else class="buy-form-scroll space-y-3 flex-1 min-h-0 overflow-y-auto pr-1">
        <!-- 快速粘贴提取 -->
        <div>
          <label class="block text-sm font-medium text-neutral mb-1">快速粘贴（自动提取代码/名称）</label>
          <textarea
            v-model="pasteText"
            placeholder="粘贴股票文本，自动提取代码和名称，支持格式：&#10;002438 江苏神通：核电 + 半导体&#10;1. 601611 中国核电：电力 + 核电"
            class="w-full h-16 px-3 py-2 rounded border border-slate-200 text-xs leading-5 resize-none focus:input-focus font-mono"
          ></textarea>
          <div v-if="parsedPastedStocks.length" class="mt-2 space-y-1">
            <div
              v-for="s in parsedPastedStocks"
              :key="s.code"
              @click="applyParsedStock(s)"
              class="flex items-center gap-2 px-2 py-1 rounded border border-emerald-200 bg-emerald-50 text-[11px] cursor-pointer hover:bg-emerald-100 transition-colors"
            >
              <span class="font-medium text-emerald-700">{{ s.name }}</span>
              <span class="font-mono text-emerald-500">{{ s.code }}</span>
              <span v-if="s.logic" class="text-slate-400 truncate flex-1">— {{ s.logic }}</span>
            </div>
          </div>
        </div>
        <div class="grid grid-cols-2 gap-3">
          <div>
            <label class="block text-sm font-medium text-neutral mb-1">股票名称</label>
            <input
              type="text"
              v-model="form.name"
              @input="onNameInput"
              class="w-full border border-slate-200 rounded px-3 py-2 text-sm focus:input-focus"
              placeholder="如：曲美家居"
            />
          </div>
          <div>
            <label class="block text-sm font-medium text-neutral mb-1">股票代码</label>
            <input
              type="text"
              v-model="form.code"
              @input="onCodeInput"
              class="w-full border border-slate-200 rounded px-3 py-2 text-sm focus:input-focus"
              placeholder="如：603818"
            />
          </div>
        </div>
        <div>
          <label class="block text-sm font-medium text-neutral mb-1">买入日期</label>
          <div class="flex gap-1 items-center">
            <input
              type="date"
              v-model="form.buyDate"
              class="flex-1 min-w-0 border border-slate-200 rounded px-3 py-2 text-sm focus:input-focus"
            />
            <button
              @click="setDate(-1)"
              class="px-2 py-1.5 text-xs rounded border border-slate-200 text-slate-500 hover:border-blue-300 hover:text-blue-600 transition-all flex-shrink-0"
            >昨天</button>
            <button
              @click="setDate(-2)"
              class="px-2 py-1.5 text-xs rounded border border-slate-200 text-slate-500 hover:border-blue-300 hover:text-blue-600 transition-all flex-shrink-0"
            >前天</button>
          </div>
        </div>
        <div class="grid grid-cols-2 gap-3">
          <div>
            <label class="block text-sm font-medium text-neutral mb-1">首次买入价 (元)</label>
            <input
              type="number"
              step="0.001"
              v-model.number="form.buyPrice"
              @input="calculateFee"
              class="w-full border border-slate-200 rounded px-3 py-2 text-sm focus:input-focus"
            />
          </div>
          <div>
            <label class="block text-sm font-medium text-neutral mb-1">买入股数</label>
            <div class="flex gap-1 items-center">
              <input
                type="number"
                step="1"
                v-model.number="form.buyCount"
                @input="calculateFee"
                class="flex-1 min-w-0 border border-slate-200 rounded px-2 py-2 text-sm focus:input-focus"
              />
              <button
                v-for="n in [100, 200, 300, 400]"
                :key="n"
                @click="form.buyCount = n"
                :class="[
                  'w-8 h-7 flex items-center justify-center text-xs rounded border transition-all flex-shrink-0',
                  form.buyCount === n
                    ? 'bg-green-500 text-white border-green-500'
                    : 'border-slate-200 text-slate-500 hover:border-green-300 hover:text-green-600'
                ]"
              >{{ n }}</button>
            </div>
          </div>
        </div>
        <div class="bg-slate-50 p-3 rounded-lg text-xs text-neutral">
          <div class="mb-1">佣金: ¥{{ formatNumber(fee.commission) }}</div>
          <div class="mb-1">过户费: ¥{{ formatNumber(fee.transferFee) }}</div>
          <div class="font-medium">合计: ¥{{ formatNumber(fee.total) }}</div>
        </div>
        <button
          @click="handleConfirm"
          class="w-full py-2.5 bg-primary text-white rounded-lg hover:bg-primary/90 transition-all font-medium"
        >确认录入</button>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, reactive, computed, onMounted, onBeforeUnmount, nextTick, watch } from 'vue'
import { PlusCircle, X } from 'lucide-vue-next'
import { calcBuyFee } from '../../utils/calculator'
import { fmtNum } from '../../utils/formatter'
import { useStock } from '../../composables/useStock'
import { wechatApi } from '../../utils/api'

const emit = defineEmits(['close', 'confirm'])

const props = defineProps({
  prefill: { type: Object, default: () => ({}) }
})

const { stocks, addStock, addBuyRecord, refreshStock } = useStock()

const visible = ref(true)

// 标题后追加的股票名 + 代码
const stockSuffix = computed(() => {
  const n = (form.name || '').trim()
  const c = (form.code || '').trim()
  if (!n && !c) return ''
  return [n, c].filter(Boolean).join(' ')
})

const pasteText = ref('')
const batchMode = ref(false)
const batchSubmitting = ref(false)
const batchMessage = ref('')
let batchRowKey = 0
function createBatchRow(stock = {}) {
  const now = new Date()
  const buyDate = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
  return { key: ++batchRowKey, code: stock.code || '', name: stock.name || '', buyDate, buyPrice: null, buyCount: 100 }
}
const batchRows = ref([createBatchRow(), createBatchRow()])
const batchTotal = computed(() => batchRows.value.reduce((sum, row) => sum + (row.buyPrice || 0) * (row.buyCount || 0) + calcBuyFee(row.buyPrice, row.buyCount).total, 0))

function addBatchRow() {
  batchRows.value.push(createBatchRow())
}

function setBatchDate(row, offset) {
  const date = new Date()
  date.setDate(date.getDate() + offset)
  row.buyDate = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

async function resolveBatchName(row) {
  const code = row.code.trim()
  const known = allKnownStocks.value.find(stock => stock.code === code)
  if (known) { row.name = known.name; return }
  if (!/^\d{6}$/.test(code)) return
  try {
    const response = await fetch(`/api/stock/name/${code}`)
    const data = await response.json()
    if (row.code.trim() === code && !batchSubmitting.value && data.name) row.name = data.name
  } catch (_) {}
}

function importBatchStocks() {
  const imported = parsedPastedStocks.value.filter(stock => stock.code && !batchRows.value.some(row => row.code === stock.code))
  batchRows.value = batchRows.value.filter(row => row.code || row.name || row.buyPrice)
  for (const stock of imported) {
    const row = createBatchRow(stock)
    batchRows.value.push(row)
    if (!row.name) resolveBatchName(row)
  }
  if (!batchRows.value.length) addBatchRow()
  pasteText.value = ''
}

async function submitBatch() {
  if (batchSubmitting.value) return
  for (const [index, row] of batchRows.value.entries()) {
    if (!/^\d{6}$/.test(row.code.trim()) || !row.name.trim() || !/^\d{4}-\d{2}-\d{2}$/.test(row.buyDate)
      || !Number.isFinite(row.buyPrice) || row.buyPrice <= 0 || !Number.isInteger(row.buyCount) || row.buyCount <= 0) {
      batchMessage.value = `第 ${index + 1} 行请填写有效的代码、名称、日期、正数价格和整数股数。`
      return
    }
  }
  batchSubmitting.value = true
  batchMessage.value = ''
  const rows = [...batchRows.value]
  let completed = 0
  try {
    for (const row of rows) {
      batchMessage.value = `正在录入 ${completed + 1}/${rows.length}：${row.name}`
      const code = row.code.trim()
      const existing = stocks.value.find(stock => stock.code === code && !stock.isCleared)
      const stock = row.stockId ? stocks.value.find(stock => stock.id === row.stockId) : existing || await addStock({ name: row.name.trim(), code, buyDate: row.buyDate, buyPrice: row.buyPrice, cost: row.buyPrice, count: row.buyCount })
      row.stockId = stock.id
      const buyFee = calcBuyFee(row.buyPrice, row.buyCount)
      await addBuyRecord(stock.id, { buyDate: row.buyDate, buyPrice: row.buyPrice, buyCount: row.buyCount, commission: buyFee.commission, transferFee: buyFee.transferFee, tType: existing ? '补仓' : '' })
      batchRows.value = batchRows.value.filter(pending => pending.key !== row.key)
      completed++
      await refreshStock(stock.id)
    }
    emit('confirm', { batchCompleted: true })
  } catch (error) {
    batchMessage.value = `已成功 ${completed} 笔，其余保留，可检查后重试。${error.message || '录入失败'}`
  } finally {
    batchSubmitting.value = false
  }
}

// 微信推票列表里的股票（去重后的 code→name 映射）
const wechatTrackingStocks = ref([])
let wechatLoaded = false
async function loadWechatTracking() {
  if (wechatLoaded) return
  wechatLoaded = true
  try {
    const res = await wechatApi.getTracking()
    const list = res?.data || []
    const seen = new Set()
    const merged = []
    for (const s of list) {
      const code = String(s.stockCode || '').trim()
      const name = String(s.stockName || '').trim()
      if (!code || seen.has(code)) continue
      seen.add(code)
      merged.push({ code, name })
    }
    wechatTrackingStocks.value = merged
  } catch (_) {}
}
// 合并股票池：用户持仓 + 微信推票
const allKnownStocks = computed(() => {
  const merged = [...(stocks.value || [])]
  const ownCodes = new Set((stocks.value || []).map(s => s.code))
  for (const s of wechatTrackingStocks.value) {
    if (!ownCodes.has(s.code)) merged.push(s)
  }
  return merged
})
watch(visible, v => { if (v) loadWechatTracking() })
onMounted(async () => {
  loadWechatTracking()
  await nextTick()
  document.querySelector('[aria-label="新增买入"] textarea')?.focus()
})
onBeforeUnmount(() => {
  clearTimeout(_nameQueryTimer.t)
  clearTimeout(_codeQueryTimer.t)
})

function handleShortcut(event) {
  if (event.isComposing || event.repeat) return
  if (event.key === 'Escape') {
    event.preventDefault()
    event.stopPropagation()
    if (!batchSubmitting.value) emit('close')
    return
  }
  if (batchSubmitting.value) return
  if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') {
    event.preventDefault()
    event.stopPropagation()
    if (batchMode.value) submitBatch()
    else handleConfirm()
  } else if (event.altKey && ['1', '2'].includes(event.key)) {
    event.preventDefault()
    batchMode.value = event.key === '2'
  } else if (event.altKey && event.key.toLowerCase() === 'n' && batchMode.value) {
    event.preventDefault()
    addBatchRow()
  }
}

// 解析粘贴的股票文本，格式与 WechatStockBoard 一致
// 支持格式: 002438 江苏神通：核电 + 半导体 / 002674 兴业科技 机器人 600666 奥瑞德 算力 / 002428（纯代码）/ #AI智能体（智度股份）：NFTG概念
const nameCache = {}
const parsedPastedStocks = computed(() => {
  const text = pasteText.value.trim()
  if (!text) return []
  const normalized = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n')
  const rawLines = normalized.split(/[\n,;，；]+/).map(l => l.trim()).filter(Boolean)

  // 拆分包含多个股票代码的行
  const lines = []
  for (const raw of rawLines) {
    const codes = [...raw.matchAll(/\d{6}/g)]
    if (codes.length <= 1) { lines.push(raw); continue }
    for (let i = 0; i < codes.length; i++) {
      const start = codes[i].index
      const end = i < codes.length - 1 ? codes[i + 1].index : raw.length
      lines.push(raw.slice(start, end).trim())
    }
  }

  const result = []
  for (const line of lines) {
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
        if (!result.find(s => s.name === pName)) {
          result.push({ code: '', name: pName, logic: pLogic })
        }
        continue
      }
      // 纯股票名称
      const nameMatch = cleanLine.match(/^[\u4e00-\u9fa5]{2,4}$/)
      if (nameMatch && !result.find(s => s.name === nameMatch[0])) {
        result.push({ code: '', name: nameMatch[0], logic: '' })
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

    if (code && !result.find(s => s.code === code)) {
      result.push({ code, name, logic })
    }
  }
  return result
})

async function applyParsedStock(stock) {
  form.code = stock.code
  if (stock.name) {
    form.name = stock.name
  } else if (nameCache[stock.code]) {
    form.name = nameCache[stock.code]
  } else {
    const match = allKnownStocks.value.find(s => s.code === stock.code)
    if (match && match.name) {
      form.name = match.name
      nameCache[stock.code] = match.name
    } else {
      try {
        const res = await fetch(`/api/stock/name/${stock.code}`)
        const data = await res.json()
        if (data.name) {
          form.name = data.name
          nameCache[stock.code] = data.name
        }
      } catch (_) {}
    }
  }
  pasteText.value = ''
}

const form = reactive({
  name: props.prefill?.name || '',
  code: props.prefill?.code || '',
  buyDate: new Date().toISOString().split('T')[0],
  buyPrice: null,
  buyCount: 100
})

const fee = computed(() => calcBuyFee(form.buyPrice, form.buyCount))

const _nameQueryTimer = { t: null }

function onNameInput() {
  const val = form.name.trim()
  if (!val) return
  // 1) 先查本地股票池
  const match = allKnownStocks.value.find(s => s.name === val)
  if (match && match.code) {
    form.code = match.code
    return
  }
  // 2) 本地没找到 → 远程查东方财富（debounce 500ms）
  if (val.length < 2) return
  if (_nameQueryTimer.t) clearTimeout(_nameQueryTimer.t)
  _nameQueryTimer.t = setTimeout(async () => {
    if (form.name.trim() !== val) return
    try {
      const res = await fetch(`/api/stock/search?name=${encodeURIComponent(val)}`)
      const data = await res.json()
      const first = data.results && data.results[0]
      if (first && first.code && form.name.trim() === val) {
        form.code = first.code
      }
    } catch (_) {}
  }, 500)
}

const _codeQueryTimer = { t: null, pending: false }

function onCodeInput() {
  const val = form.code.trim()
  if (!val) return
  // 1) 先查本地股票池
  const match = allKnownStocks.value.find(s => s.code === val)
  if (match && match.name) {
    form.name = match.name
    return
  }
  // 2) 本地没找到 → 远程查腾讯行情（debounce 400ms 避免打太多）
  if (!/^\d{6}$/.test(val)) return
  if (_codeQueryTimer.t) clearTimeout(_codeQueryTimer.t)
  _codeQueryTimer.t = setTimeout(async () => {
    if (form.code.trim() !== val) return // 用户又改了代码，跳过旧请求
    try {
      const res = await fetch(`/api/stock/name/${val}`)
      const data = await res.json()
      if (data.name && form.code.trim() === val) {
        form.name = data.name
      }
    } catch (_) {}
  }, 400)
}

function calculateFee() {}

function setDate(daysAgo) {
  const d = new Date()
  d.setDate(d.getDate() + daysAgo)
  form.buyDate = d.toISOString().split('T')[0]
}

function formatNumber(val, decimals = 2) {
  return fmtNum(val, decimals)
}

async function handleConfirm() {
  if (!form.name || !form.buyPrice || !form.buyCount) {
    alert('请填写完整信息')
    return
  }
  emit('confirm', {
    name: form.name,
    code: form.code,
    buyDate: form.buyDate,
    buyPrice: form.buyPrice,
    count: form.buyCount,
    cost: form.buyPrice
  })
}
</script>

<style scoped>
.buy-form-scroll {
  scrollbar-width: none;
  -ms-overflow-style: none;
}
.buy-form-scroll::-webkit-scrollbar {
  display: none;
}
</style>
