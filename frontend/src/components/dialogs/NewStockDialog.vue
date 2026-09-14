<template>
  <div class="fixed inset-0 bg-black/50 flex items-center justify-center z-50" :class="{ 'hidden': !visible }">
    <div class="bg-white rounded-xl p-6 w-[420px] card-shadow dialog-enter">
      <div class="flex justify-between items-center mb-4">
        <h3 class="text-lg font-bold text-slate-800 flex items-center gap-2">
          <PlusCircle class="w-5 h-5 text-primary" />
          新增买入
        </h3>
        <button @click="$emit('close')" class="text-neutral hover:text-slate-800">
          <X class="w-5 h-5" />
        </button>
      </div>
      <div class="space-y-3">
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
                v-for="n in [100, 200, 400]"
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
import { ref, reactive, computed, onMounted, watch } from 'vue'
import { PlusCircle, X } from 'lucide-vue-next'
import { calcBuyFee } from '../../utils/calculator'
import { fmtNum } from '../../utils/formatter'
import { useStock } from '../../composables/useStock'
import { wechatApi } from '../../utils/api'

const emit = defineEmits(['close', 'confirm'])

const { stocks } = useStock()

const visible = ref(true)

const pasteText = ref('')

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
onMounted(() => loadWechatTracking())

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
  name: '',
  code: '',
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
