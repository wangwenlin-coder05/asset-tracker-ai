<template>
  <div class="wool-dialog-mask" @click.prevent.stop>
    <section ref="dialogRef" class="wool-dialog" role="dialog" aria-modal="true" aria-labelledby="wool-dialog-title" tabindex="-1" @pointerdown.stop @click.stop @keydown="handleDialogKeydown">
      <header class="wool-dialog__header">
        <div>
          <span class="wool-kicker">DAILY LEDGER / {{ form.recordType === 'spend' ? 'OUT' : 'IN' }}</span>
          <h2 id="wool-dialog-title">{{ item ? '编辑记录' : (form.recordType === 'spend' ? '记一笔消费' : '记一笔羊毛') }}</h2>
        </div>
        <button type="button" class="icon-command" title="关闭" :disabled="saving" @click.stop="requestClose"><X /></button>
      </header>

      <div class="record-switch" aria-label="记录类型">
        <button type="button" :class="{ active: form.recordType === 'spend' }" @click.stop="setType('spend')">
          <ReceiptText /> 消费支出
        </button>
        <button type="button" :class="{ active: form.recordType === 'reward' }" @click.stop="setType('reward')">
          <Coins /> 羊毛收益
        </button>
      </div>
      <div class="wool-dialog__body">
      <div class="form-grid">
        <div class="field full name-field">
          <span>名称</span>
          <div class="suggestion-wrapper">
            <input v-model.trim="form.name" maxlength="200" :placeholder="form.recordType === 'spend' ? '例如：午餐、加油、日用品' : '例如：签到红包、返现、优惠券'" @input="onNameInput" @focus="openNameSuggestions" @keydown.escape="showNameSuggestions = false" />
            <div v-if="showNameSuggestions && nameSuggestions.length" class="suggestion-list">
              <button type="button" v-for="(suggestion, index) in nameSuggestions" :key="index" @pointerdown.prevent.stop="selectNameSuggestion(suggestion)">
                <span class="suggestion-name">{{ suggestion.name }}</span>
                <span class="suggestion-category">{{ suggestion.category }}</span>
                <span v-if="getDepositName(suggestion.depositItemId)" class="suggestion-deposit">{{ getDepositName(suggestion.depositItemId) }}</span>
                <span class="suggestion-count">{{ suggestion.count }}次</span>
              </button>
            </div>
          </div>
        </div>
        <label class="field">
          <span>日期</span>
          <div class="with-icon"><CalendarDays /><input v-model="form.woolDate" type="date" /></div>
        </label>
        <label class="field">
          <span>{{ form.recordType === 'spend' ? '商户/去向' : '平台/来源' }}</span>
          <div class="suggestion-wrapper with-icon">
            <Store />
            <input v-model.trim="form.merchant" maxlength="120" placeholder="选填" @input="onMerchantInput" @focus="openMerchantSuggestions" @keydown.escape="showMerchantSuggestions = false" />
            <div v-if="showMerchantSuggestions && merchantSuggestions.length" class="suggestion-list">
              <button type="button" v-for="(suggestion, index) in merchantSuggestions" :key="index" @pointerdown.prevent.stop="selectMerchantSuggestion(suggestion.name)">
                <span class="suggestion-name">{{ suggestion.name }}</span>
                <span v-if="suggestion.category" class="suggestion-category">{{ suggestion.category }}</span>
                <span class="suggestion-count">{{ suggestion.count }}次</span>
              </button>
            </div>
          </div>
        </label>
        <label class="field amount-field">
          <span>金额{{ amountExpression ? ` = ${computedAmount}` : '' }}</span>
          <div class="money-input"><b>¥</b><input v-model="amountExpression" type="text" inputmode="decimal" placeholder="0.00 或算式如 23-45+24+12" @blur="commitAmount" /></div>
        </label>
        <label class="field">
          <span>分类（可自定义）</span>
          <div class="suggestion-wrapper">
            <input v-model.trim="form.category" maxlength="64" placeholder="选择或直接输入分类" @input="onCategoryInput" @focus="openCategorySuggestions" @keydown.escape="showCategorySuggestions = false" />
            <div v-if="showCategorySuggestions && categorySuggestions.length" class="suggestion-list">
              <button type="button" v-for="(suggestion, index) in categorySuggestions" :key="index" @pointerdown.prevent.stop="selectCategorySuggestion(suggestion.name)">
                <span class="suggestion-name">{{ suggestion.name }}</span>
                <span class="suggestion-count">{{ suggestion.count }}次</span>
              </button>
            </div>
          </div>
        </label>
        <label class="field full deposit-field">
          <span>{{ form.recordType === 'spend' ? '从哪个存款小项支付' : '到账到哪个存款小项' }}</span>
          <div class="deposit-select-wrapper">
            <button ref="depositButtonRef" type="button" class="deposit-select" :class="{ selected: selectedDeposit, open: showDepositDropdown }" aria-haspopup="listbox" :aria-expanded="showDepositDropdown" @mouseenter="openDepositMenu" @mouseleave="closeDepositMenu" @keydown.down.prevent="openDepositMenu">
              <span class="deposit-select__icon"><WalletCards /></span>
              <span class="deposit-select__copy">
                <b>{{ selectedDeposit?.name || '请选择存款小项' }}</b>
                <small>{{ selectedDeposit ? selectedDeposit.groupName : '搜索并选择付款或到账账户' }}</small>
              </span>
              <span v-if="selectedDeposit" class="deposit-select__balance" :class="selectedDeposit.amount < 0 ? 'negative' : 'positive'">¥{{ formatMoney(selectedDeposit.amount) }}</span>
              <ChevronDown class="deposit-select__arrow" :class="{ rotated: showDepositDropdown }" />
            </button>
          </div>
          <div v-if="selectedDeposit" class="balance-preview" :class="form.recordType">
            <WalletCards />
            <span>{{ form.recordType === 'spend' ? '保存后扣减' : '保存后增加' }} ¥{{ formatMoney(form.amount) }}</span>
            <b>预计余额 ¥{{ formatMoney(projectedBalance) }}</b>
          </div>
        </label>
        <label class="field full">
          <span>备注</span>
          <textarea v-model.trim="form.note" maxlength="500" rows="3" placeholder="记录优惠规则、商品明细、报销状态或任何值得回看的信息"></textarea>
        </label>
      </div>

      <div class="receipt-zone" :class="{ dragging: isDragging }" @dragenter.prevent.stop="handleDragEnter" @dragover.prevent.stop @dragleave.prevent.stop="handleDragLeave" @drop.prevent.stop="handleDrop">
        <div class="receipt-zone__title">
          <div><ImagePlus /><span>图片凭证</span><small>{{ previews.length }}/9</small></div>
          <div class="receipt-actions">
            <button type="button" v-if="previews.length" class="ai-command" :disabled="recognizing || saving" @click.stop="recognizeFirstImage"><Sparkles />{{ recognizing ? '识别中' : 'AI识别' }}</button>
            <button type="button" class="upload-command" :disabled="recognizing || saving || previews.length >= 9" @click.stop="fileInput?.click()"><UploadCloud />选择图片</button>
          </div>
          <input ref="fileInput" hidden type="file" accept="image/*" multiple @change="handleFiles" />
        </div>
        <div v-if="recognizing || recognitionMessage || recognitionError" class="ai-status" :class="{ success: recognitionMessage, error: recognitionError }">
          <LoaderCircle v-if="recognizing" class="spin" /><Sparkles v-else />
          <span>{{ recognizing ? 'GLM-4.6V 正在识别金额、分类、商户和日期…' : (recognitionError || recognitionMessage) }}</span>
          <b v-if="aiConfidence">可信度 {{ Math.round(aiConfidence * 100) }}%</b>
        </div>
        <div v-if="previews.length" class="receipt-grid">
          <figure v-for="(preview, index) in previews" :key="preview.key">
            <img :src="preview.url" alt="凭证预览" @click.stop="previewUrl = preview.url" />
            <button type="button" title="移除图片" :disabled="saving" @click.stop="removePreview(index)"><Trash2 /></button>
          </figure>
        </div>
        <div v-else class="receipt-empty"><UploadCloud /><strong>拖入账单或订单截图</strong><span>上传后点击“AI识别”提取金额和商户</span><small>支持 JPG / PNG / WEBP，单张不超过 10MB</small></div>
      </div>
      </div>

      <p v-if="errorMessage" class="form-error">{{ errorMessage }}</p>
      <footer class="wool-dialog__footer">
        <span>保存后会同步更新所选存款余额，并写入资金明细。</span>
        <div>
          <button type="button" class="secondary-command" :disabled="saving" @click.stop="requestClose">取消</button>
          <button type="button" class="primary-command" :disabled="saving || recognizing" @click.stop="handleConfirm">
            <LoaderCircle v-if="saving" class="spin" />
            <Check v-else />
            {{ saving ? '正在保存' : '保存记录' }}
          </button>
        </div>
      </footer>
    </section>

    <Teleport to="body">
      <div v-if="showDepositDropdown" class="deposit-popover" :class="{ drawer: depositMenuDrawer }" :style="depositMenuStyle" @pointerdown.stop @click.stop @keydown.esc.stop="closeDepositMenu" @mouseenter="cancelCloseDepositMenu" @mouseleave="closeDepositMenu">
        <div class="deposit-popover__head">
          <div><WalletCards /><span>选择资金账户</span><small>{{ filteredDeposits.length }} 个可用小项</small></div>
          <button type="button" title="关闭账户列表" @click="forceCloseDepositMenu"><X /></button>
        </div>
        <label class="deposit-search"><Search /><input ref="depositSearchRef" v-model.trim="depositSearch" placeholder="搜索名称或分组" @keydown.down.prevent="focusFirstDeposit" /></label>
        <div class="deposit-popover__list" role="listbox">
          <section v-for="group in depositGroups" :key="group.name" class="deposit-popover__group">
            <header><span>{{ group.name }}</span><small>{{ group.items.length }}</small></header>
            <button v-for="deposit in group.items" :key="deposit.id" type="button" class="deposit-option" :class="{ selected: form.depositItemId === deposit.id }" role="option" :aria-selected="form.depositItemId === deposit.id" @click="selectDeposit(deposit)">
              <span class="deposit-option__icon">{{ deposit.name.slice(0, 1) }}</span>
              <span class="deposit-info"><b>{{ deposit.name }}</b><small>{{ deposit.itemType === 'debt' ? '欠款账户' : (deposit.note || '资金账户') }}</small></span>
              <span class="deposit-amount" :class="deposit.amount < 0 ? 'negative' : 'positive'"><small>当前余额</small><b>¥{{ formatMoney(deposit.amount) }}</b></span>
              <Check v-if="form.depositItemId === deposit.id" class="deposit-option__check" />
            </button>
          </section>
          <div v-if="!filteredDeposits.length" class="deposit-popover__empty"><Search /><strong>没有匹配的存款小项</strong><span>换一个关键词试试</span></div>
        </div>
      </div>
    </Teleport>

    <div v-if="previewUrl" class="image-preview-overlay" @click.self="previewUrl = ''">
      <button type="button" class="preview-close" title="关闭预览" @click.stop="previewUrl = ''"><X /></button><img :src="previewUrl" alt="预览" class="image-preview-img" @click.stop />
    </div>
  </div>
</template>

<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue'
import { CalendarDays, Check, ChevronDown, Coins, ImagePlus, LoaderCircle, ReceiptText, Search, Sparkles, Store, Trash2, UploadCloud, WalletCards, X } from 'lucide-vue-next'
import { useWool } from '../../composables/useWool'
import { useDeposit } from '../../composables/useDeposit'

const props = defineProps({
  date: { type: String, default: '' },
  item: { type: Object, default: null },
  defaultType: { type: String, default: 'spend' },
  knownCategories: { type: Array, default: () => [] }
})
const emit = defineEmits(['close', 'confirm'])
const { uploadWoolImage, recognizeWoolImage, woolItems } = useWool()
const { deposits, loadDeposits } = useDeposit()
const fileInput = ref(null)
const dialogRef = ref(null)
const depositButtonRef = ref(null)
const depositSearchRef = ref(null)
const isDragging = ref(false)
const dragDepth = ref(0)
const saving = ref(false)
const recognizing = ref(false)
const errorMessage = ref('')
const recognitionMessage = ref('')
const recognitionError = ref('')
const aiConfidence = ref(0)
const existingImages = ref([...(props.item?.images || [])])
const pendingFiles = ref([])
const previewUrl = ref('')
const showNameSuggestions = ref(false)
const showCategorySuggestions = ref(false)
const showMerchantSuggestions = ref(false)
const showDepositDropdown = ref(false)
const amountExpression = ref(String(Number(props.item?.amount) || 0))

const AMOUNT_EXPR_RE = /^[\d+\-*/.()\s]+$/

const computedAmount = computed(() => {
  let expr = amountExpression.value.trim()
  if (!expr) return 0
  if (!AMOUNT_EXPR_RE.test(expr)) return Number(expr) || 0
  expr = expr.replace(/[+\-*/(]\s*$/, '')
  if (!/[+\-*/(]/.test(expr)) return Number(expr) || 0
  try {
    const result = Function(`"use strict"; return (${expr})`)()
    return Number.isFinite(result) ? Math.round(result * 100) / 100 : 0
  } catch {
    return 0
  }
})

watch(amountExpression, (val) => {
  form.amount = computedAmount.value
})

function commitAmount() {
  if (amountExpression.value.trim()) {
    amountExpression.value = String(computedAmount.value)
  }
  form.amount = computedAmount.value
}
const depositSearch = ref('')
const depositMenuStyle = ref({})
const depositMenuDrawer = ref(false)
let closeDepositTimer = null
let isAlive = true
let recognitionRun = 0
let previousActiveElement = null
let previousBodyOverflow = ''

const form = reactive({
  recordType: props.item?.recordType || props.defaultType,
  woolDate: props.item?.woolDate || props.date || new Date().toISOString().slice(0, 10),
  name: props.item?.name || '',
  amount: Number(props.item?.amount) || 0,
  category: props.item?.category || '',
  merchant: props.item?.merchant || '',
  paymentMethod: props.item?.paymentMethod || '',
  depositItemId: props.item?.depositItemId || '',
  note: props.item?.note || ''
})

const spendCategories = ['餐饮', '交通', '购物', '生活缴费', '娱乐', '医疗', '人情', '学习', '旅行', '数码', '家居', '其他']
const rewardCategories = ['返现', '红包', '优惠券', '积分', '赠品', '活动奖励', '报销', '退款', '其他']
const categoryOptions = computed(() => [...new Set([...(form.recordType === 'spend' ? spendCategories : rewardCategories), ...props.knownCategories])])

const nameSuggestions = computed(() => {
  const query = form.name.trim().toLowerCase()
  const records = woolItems.value.filter(item => item.recordType === form.recordType && item.name)
  const groups = new Map()
  for (const item of records) {
    const key = `${item.name}_${item.category || ''}`
    if (!groups.has(key)) {
      groups.set(key, { name: item.name, category: item.category || '', merchant: item.merchant || '', depositItemId: item.depositItemId || '', count: 0 })
    }
    groups.get(key).count++
  }
  const sorted = [...groups.values()].sort((a, b) => b.count - a.count)
  const filtered = query ? sorted.filter(s => {
    return s.name.toLowerCase().includes(query) ||
           (s.category && s.category.toLowerCase().includes(query)) ||
           (s.merchant && s.merchant.toLowerCase().includes(query))
  }) : sorted
  return filtered.slice(0, 8)
})

function openNameSuggestions() {
  showNameSuggestions.value = true
}

function selectNameSuggestion(suggestion) {
  form.name = suggestion.name
  if (!form.category) form.category = suggestion.category
  if (!form.merchant) form.merchant = suggestion.merchant
  if (!form.depositItemId && suggestion.depositItemId) form.depositItemId = suggestion.depositItemId
  showNameSuggestions.value = false
}

const categorySuggestions = computed(() => {
  const query = form.category.trim().toLowerCase()
  const records = woolItems.value.filter(item => item.recordType === form.recordType && item.category)
  const groups = new Map()
  for (const item of records) {
    const name = item.category
    if (!groups.has(name)) groups.set(name, { name, count: 0 })
    groups.get(name).count++
  }
  const sorted = [...groups.values()].sort((a, b) => b.count - a.count)
  const defaultCats = form.recordType === 'spend' ? spendCategories : rewardCategories
  const merged = [
    ...defaultCats.map(name => ({ name, count: -1 })),
    ...sorted
  ]
  const filtered = query ? merged.filter(s => s.name.toLowerCase().includes(query)) : merged
  const seen = new Set()
  const result = []
  for (const s of filtered) {
    if (!seen.has(s.name)) {
      seen.add(s.name)
      result.push(s)
    }
  }
  return result.slice(0, 12)
})

function openCategorySuggestions() {
  showCategorySuggestions.value = true
}

function onCategoryInput() {
  showCategorySuggestions.value = true
}

function selectCategorySuggestion(category) {
  form.category = category
  showCategorySuggestions.value = false
}

const merchantSuggestions = computed(() => {
  const query = form.merchant.trim().toLowerCase()
  const records = woolItems.value.filter(item => item.recordType === form.recordType && item.merchant)
  const groups = new Map()
  for (const item of records) {
    const name = item.merchant
    if (!groups.has(name)) {
      groups.set(name, { name, category: item.category || '', depositItemId: item.depositItemId || '', count: 0 })
    }
    groups.get(name).count++
  }
  const sorted = [...groups.values()].sort((a, b) => b.count - a.count)
  const filtered = query ? sorted.filter(s => s.name.toLowerCase().includes(query)) : sorted
  return filtered.slice(0, 8)
})

function openMerchantSuggestions() {
  showMerchantSuggestions.value = true
}

function onMerchantInput() {
  showMerchantSuggestions.value = true
}

function selectMerchantSuggestion(merchant) {
  form.merchant = merchant.name
  if (!form.category && merchant.category) form.category = merchant.category
  if (!form.depositItemId && merchant.depositItemId) form.depositItemId = merchant.depositItemId
  showMerchantSuggestions.value = false
}

const categoryKeywords = {
  spend: {
    '餐饮': ['饭', '餐', '早餐', '午餐', '晚餐', '夜宵', '奶茶', '咖啡', '外卖', '火锅', '烧烤', '汉堡', '披萨', '肯德基', '麦当劳', '德克士', '沙县', '小吃', '面馆', '麻辣烫', '卤味', '寿司', '甜品', '蛋糕', '面包', '奶茶', '果汁', '茶', '咖啡', '星巴克', '瑞幸', '蜜雪冰城', '美团', '饿了么'],
    '交通': ['打车', '滴滴', '地铁', '公交', '高铁', '火车', '机票', '加油', '停车', '过路费', '滴滴出行', '高德打车', '哈啰'],
    '购物': ['淘宝', '京东', '拼多多', '唯品会', '天猫', '超市', '便利店', '全家', '711', '屈臣氏', '优衣库', '购物', '衣服', '鞋', '包', '化妆品', '护肤品'],
    '生活缴费': ['电费', '水费', '燃气', '话费', '网费', '宽带', '物业', '房租', '美团外卖', '水电费'],
    '娱乐': ['电影', '游戏', 'KTV', '演出', '演唱会', '酒吧', '剧本杀', '密室逃脱', '爱奇艺', '腾讯视频', '优酷', 'B站', '会员'],
    '医疗': ['医院', '挂号', '药', '药店', '看病', '体检', '牙科', '眼科', '诊所'],
    '人情': ['红包', '礼物', '生日', '婚礼', '份子钱', '请客', '聚会'],
    '学习': ['书', '教材', '课程', '培训', '考试', '网课', '英语', '编程', '得到', '知识星球'],
    '旅行': ['酒店', '民宿', '机票', '旅游', '景点', '门票', '携程', '飞猪', '去哪儿'],
    '数码': ['手机', '电脑', '平板', '耳机', '音箱', '相机', '硬盘', '充电器', '数据线'],
    '家居': ['家具', '家电', '装修', '水电', '灯具', '厨具', '家纺', '床垫'],
  },
  reward: {
    '返现': ['返现', '返利', 'Cashback', '现金返还'],
    '红包': ['红包', '微信红包', '支付宝红包', '口令红包'],
    '优惠券': ['券', '优惠券', '满减', '折扣券', '代金券'],
    '积分': ['积分', '积分兑换', '签到积分', '商城积分'],
    '赠品': ['赠品', '送', '免费', '试用'],
    '活动奖励': ['活动', '抽奖', '中奖', '奖励', '竞赛'],
    '报销': ['报销', '报销款', '差旅报销'],
    '退款': ['退款', '退货', '退款成功'],
  }
}

function autoDetectCategory(name) {
  if (!name) return ''
  const keywords = categoryKeywords[form.recordType] || {}
  for (const [category, words] of Object.entries(keywords)) {
    if (words.some(word => name.includes(word))) {
      return category
    }
  }
  return ''
}
const availableDeposits = computed(() => deposits.value.filter(item => item.itemType !== 'installment').slice().sort((a, b) => `${a.groupName}${String(a.sortOrder).padStart(5, '0')}`.localeCompare(`${b.groupName}${String(b.sortOrder).padStart(5, '0')}`, 'zh-CN')))
function getDepositName(id) {
  return deposits.value.find(item => item.id === id)?.name || ''
}
const filteredDeposits = computed(() => {
  const query = depositSearch.value.toLowerCase()
  if (!query) return availableDeposits.value
  return availableDeposits.value.filter(item => [item.name, item.groupName, item.note].some(value => String(value || '').toLowerCase().includes(query)))
})
const depositGroups = computed(() => {
  const map = new Map()
  for (const item of filteredDeposits.value) {
    const name = item.groupName || '默认分组'
    if (!map.has(name)) map.set(name, [])
    map.get(name).push(item)
  }
  return [...map.entries()].map(([name, items]) => ({ name, items }))
})
const selectedDeposit = computed(() => deposits.value.find(item => item.id === form.depositItemId) || null)
const projectedBalance = computed(() => {
  const current = Number(selectedDeposit.value?.amount) || 0
  const amount = Math.max(0, Number(form.amount) || 0)
  return current + (form.recordType === 'spend' ? -amount : amount)
})
const previews = computed(() => [
  ...existingImages.value.map((path, index) => ({ key: `existing-${path}-${index}`, url: imageUrl(path), existing: true, path })),
  ...pendingFiles.value.map(entry => ({ key: entry.key, url: entry.url, existing: false, path: entry.uploadedPath || '' }))
])

function formatMoney(value) {
  const number = Number(value)
  return Number.isFinite(number) ? number.toFixed(2) : '0.00'
}

function imageUrl(path) {
  if (!path) return ''
  return /^(https?:|blob:|data:)/.test(path) ? path : `/${String(path).replace(/^\//, '')}`
}

function setType(type) {
  form.recordType = type
}

function updateDepositMenuPosition() {
  const rect = dialogRef.value?.getBoundingClientRect()
  if (!rect) return
  const edge = 12
  const gap = 14
  const availableLeft = rect.left - edge - gap
  const canDockBesideDialog = window.innerWidth >= 900 && availableLeft >= 292
  const width = canDockBesideDialog ? Math.min(360, availableLeft) : Math.min(350, window.innerWidth - edge * 2)
  const top = canDockBesideDialog ? Math.max(edge, rect.top) : edge
  const height = canDockBesideDialog
    ? Math.min(rect.height, window.innerHeight - top - edge)
    : window.innerHeight - edge * 2

  depositMenuDrawer.value = !canDockBesideDialog
  depositMenuStyle.value = {
    left: `${canDockBesideDialog ? rect.left - gap - width : edge}px`,
    top: `${top}px`,
    width: `${width}px`,
    height: `${height}px`,
    maxHeight: `${height}px`
  }
}

function handleViewportResize() {
  if (showDepositDropdown.value) updateDepositMenuPosition()
}

async function openDepositMenu() {
  if (saving.value) return
  if (closeDepositTimer) { clearTimeout(closeDepositTimer); closeDepositTimer = null }
  updateDepositMenuPosition()
  showDepositDropdown.value = true
  await nextTick()
  depositSearchRef.value?.focus()
}

function closeDepositMenu() {
  closeDepositTimer = setTimeout(() => {
    showDepositDropdown.value = false
    depositSearch.value = ''
    closeDepositTimer = null
  }, 150)
}

function cancelCloseDepositMenu() {
  if (closeDepositTimer) { clearTimeout(closeDepositTimer); closeDepositTimer = null }
}

function forceCloseDepositMenu() {
  cancelCloseDepositMenu()
  showDepositDropdown.value = false
  depositSearch.value = ''
}

function toggleDepositMenu() {
  if (showDepositDropdown.value) closeDepositMenu()
  else openDepositMenu()
}

function selectDeposit(deposit) {
  form.depositItemId = deposit.id
  errorMessage.value = ''
  forceCloseDepositMenu()
  nextTick(() => depositButtonRef.value?.focus())
}

function focusFirstDeposit() {
  document.querySelector('.deposit-popover .deposit-option')?.focus()
}

function onNameInput() {
  showNameSuggestions.value = true
  if (!form.category) {
    const detected = autoDetectCategory(form.name)
    if (detected) {
      form.category = detected
      return
    }
    const matches = nameSuggestions.value
    if (matches.length === 1) {
      form.category = matches[0].category
      if (!form.merchant) form.merchant = matches[0].merchant
    }
  }
}

async function ensureUploaded(entry) {
  if (entry.uploadedPath) return entry.uploadedPath
  const result = await uploadWoolImage(entry.file)
  entry.uploadedPath = result?.imagePath || ''
  if (!entry.uploadedPath) throw new Error('图片上传后未返回有效路径')
  return entry.uploadedPath
}

function applyRecognition(result, force = false) {
  if (!result) return
  if (force || !form.name) form.name = result.name || form.name
  if ((force || Number(form.amount) <= 0) && Number(result.amount) > 0) {
    form.amount = Number(result.amount)
    amountExpression.value = String(form.amount)
  }
  if (force || !form.category) form.category = result.category || form.category
  if (force || !form.merchant) form.merchant = result.merchant || form.merchant
  if ((force || !form.woolDate) && result.woolDate) form.woolDate = result.woolDate
  if (force || !form.note) form.note = result.note || form.note
  if (force || !props.item) form.recordType = result.recordType === 'reward' ? 'reward' : 'spend'
  aiConfidence.value = Number(result.confidence) || 0
  recognitionMessage.value = `${result.model || 'GLM-4.6V'} 已回填金额、分类、商户和日期，请确认后保存。`
}

async function recognizePath(path, force = false) {
  if (!path || recognizing.value || saving.value) return
  const run = ++recognitionRun
  recognizing.value = true
  recognitionMessage.value = ''
  recognitionError.value = ''
  aiConfidence.value = 0
  try {
    const result = await recognizeWoolImage(path)
    if (!isAlive || run !== recognitionRun) return
    applyRecognition(result, force)
  } catch (error) {
    if (!isAlive || run !== recognitionRun) return
    recognitionError.value = error.response?.data?.error || error.message || 'AI识别失败，可继续手动填写。'
  } finally {
    if (isAlive && run === recognitionRun) recognizing.value = false
  }
}

async function recognizePending(entry, force = false) {
  try {
    const path = await ensureUploaded(entry)
    await recognizePath(path, force)
  } catch (error) {
    if (!isAlive) return
    recognitionError.value = error.response?.data?.error || error.message || '图片上传失败，可重新选择。'
    recognizing.value = false
  }
}

async function recognizeFirstImage() {
  if (pendingFiles.value.length) return recognizePending(pendingFiles.value[pendingFiles.value.length - 1], true)
  if (existingImages.value.length) return recognizePath(existingImages.value[0], true)
}

function addFiles(fileList) {
  errorMessage.value = ''
  recognitionError.value = ''
  recognitionMessage.value = ''
  aiConfidence.value = 0
  const remaining = 9 - previews.value.length
  if (remaining <= 0) {
    errorMessage.value = '最多上传 9 张图片。'
    return
  }
  const existingKeys = new Set(pendingFiles.value.map(entry => entry.key))
  const files = Array.from(fileList || []).filter(file => file.type.startsWith('image/')).slice(0, remaining)
  for (const file of files) {
    if (file.size > 10 * 1024 * 1024) {
      errorMessage.value = `${file.name} 超过 10MB，已跳过`
      continue
    }
    const key = `${file.name}-${file.size}-${file.lastModified}`
    if (existingKeys.has(key)) continue
    const entry = { file, key, url: URL.createObjectURL(file), uploadedPath: '' }
    pendingFiles.value.push(entry)
    existingKeys.add(key)
  }
}

function handleFiles(event) {
  addFiles(event.target.files)
  event.target.value = ''
}

function handleDragEnter() {
  dragDepth.value += 1
  isDragging.value = true
}

function handleDragLeave() {
  dragDepth.value = Math.max(0, dragDepth.value - 1)
  if (dragDepth.value === 0) isDragging.value = false
}

function handleDrop(event) {
  dragDepth.value = 0
  isDragging.value = false
  addFiles(event.dataTransfer.files)
}

function removePreview(index) {
  recognitionRun += 1
  recognizing.value = false
  recognitionMessage.value = ''
  if (index < existingImages.value.length) {
    existingImages.value.splice(index, 1)
    return
  }
  const pendingIndex = index - existingImages.value.length
  const [removed] = pendingFiles.value.splice(pendingIndex, 1)
  if (removed?.url) URL.revokeObjectURL(removed.url)
}

async function handleConfirm() {
  errorMessage.value = ''
  if (!form.name || !form.woolDate || Number(form.amount) <= 0) {
    errorMessage.value = '请填写名称、日期和有效金额。'
    return
  }
  if (!form.depositItemId) {
    errorMessage.value = '请选择支付或到账对应的存款小项。'
    return
  }
  saving.value = true
  try {
    const uploaded = []
    for (const entry of pendingFiles.value) uploaded.push(await ensureUploaded(entry))
    emit('confirm', {
      ...form,
      amount: Number(form.amount),
      paymentMethod: selectedDeposit.value?.name || '',
      images: [...existingImages.value, ...uploaded]
    }, (error) => {
      if (!isAlive) return
      if (error) {
        errorMessage.value = error
        saving.value = false
      }
    })
  } catch (error) {
    errorMessage.value = error.response?.data?.error || '保存失败，请检查图片或服务器状态后重试。'
    saving.value = false
  }
}

function requestClose() {
  if (saving.value) return
  if (showDepositDropdown.value) {
    closeDepositMenu()
    return
  }
  if (previewUrl.value) {
    previewUrl.value = ''
    return
  }
  recognitionRun += 1
  emit('close')
}

function handleDocumentPointerDown(event) {
  if (!event.target.closest('.suggestion-wrapper')) {
    showNameSuggestions.value = false
    showCategorySuggestions.value = false
    showMerchantSuggestions.value = false
  }
  if (showDepositDropdown.value && !event.target.closest('.deposit-popover') && !event.target.closest('.deposit-select')) forceCloseDepositMenu()
}

function handleDialogKeydown(event) {
  if (event.key === 'Escape') {
    event.preventDefault()
    requestClose()
    return
  }
  if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) {
    event.preventDefault()
    if (!saving.value && !recognizing.value) handleConfirm()
    return
  }
  if (event.key !== 'Tab' || !dialogRef.value) return
  const focusable = [...dialogRef.value.querySelectorAll('button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])')]
  if (!focusable.length) return
  const first = focusable[0]
  const last = focusable[focusable.length - 1]
  if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus() }
  else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus() }
}

onMounted(async () => {
  previousActiveElement = document.activeElement
  previousBodyOverflow = document.body.style.overflow
  document.body.style.overflow = 'hidden'
  document.addEventListener('pointerdown', handleDocumentPointerDown, true)
  window.addEventListener('resize', handleViewportResize)
  if (!deposits.value.length) await loadDeposits()
  await nextTick()
  dialogRef.value?.querySelector('input')?.focus()
})

onBeforeUnmount(() => {
  isAlive = false
  recognitionRun += 1
  if (closeDepositTimer) clearTimeout(closeDepositTimer)
  document.body.style.overflow = previousBodyOverflow
  document.removeEventListener('pointerdown', handleDocumentPointerDown, true)
  window.removeEventListener('resize', handleViewportResize)
  pendingFiles.value.forEach(entry => URL.revokeObjectURL(entry.url))
  if (previousActiveElement instanceof HTMLElement) previousActiveElement.focus()
})
</script>

<style scoped>
.wool-dialog-mask{position:fixed;inset:0;z-index:80;display:flex;align-items:center;justify-content:center;padding:24px;background:rgba(15,18,20,.66);backdrop-filter:blur(7px)}
.wool-dialog{width:min(780px,calc(100vw - 32px));max-height:calc(100vh - 40px);overflow:auto;background:#fffdf6;border:2px solid #171918;border-radius:8px;box-shadow:12px 12px 0 #171918}
.wool-dialog__header{position:sticky;top:0;z-index:2;display:flex;align-items:center;justify-content:space-between;padding:20px 22px 16px;background:#fffdf6;border-bottom:2px solid #171918}.wool-dialog__header h2{margin:2px 0 0;font-size:24px;line-height:1.1;color:#171918}.wool-kicker{font-size:10px;font-weight:900;letter-spacing:1.4px;color:#ef5b46}
.icon-command{width:36px;height:36px;display:grid;place-items:center;border:2px solid #171918;background:#bdf6df;box-shadow:3px 3px 0 #171918}.icon-command svg{width:18px}.record-switch{display:grid;grid-template-columns:1fr 1fr;border-bottom:2px solid #171918}.record-switch button{height:50px;display:flex;align-items:center;justify-content:center;gap:8px;background:#fff;border:0;font-weight:900;color:#5b5e5c}.record-switch button+button{border-left:2px solid #171918}.record-switch button.active{background:#fff07a;color:#171918}.record-switch button:first-child.active{background:#ff8d7c}.record-switch svg{width:18px}
.form-grid{display:grid;grid-template-columns:1fr 1fr;gap:14px;padding:20px 22px}.field{display:flex;flex-direction:column;gap:6px}.field.full{grid-column:1/-1}.field>span{font-size:11px;font-weight:900;color:#555a57}.field input,.field select,.field textarea{width:100%;border:1.5px solid #171918;border-radius:5px;background:#fff;padding:10px 11px;font-size:13px;color:#171918;outline:none}.field input:focus,.field select:focus,.field textarea:focus{box-shadow:0 0 0 3px #bdf6df}.money-input,.with-icon{position:relative}.money-input b,.with-icon svg{position:absolute;left:11px;top:50%;transform:translateY(-50%)}.money-input input{padding-left:30px;font-size:18px;font-weight:900}.with-icon svg{width:16px}.with-icon input{padding-left:36px}.payment-options{display:flex;flex-wrap:wrap;gap:7px}.payment-options button{padding:7px 12px;border:1.5px solid #171918;border-radius:4px;background:#fff;font-size:12px;font-weight:700}.payment-options button.active{background:#bdf6df;box-shadow:2px 2px 0 #171918}
.receipt-zone{margin:0 22px 20px;padding:14px;border:2px dashed #171918;background:#f5f1e6;transition:.2s}.receipt-zone.dragging{background:#bdf6df;transform:translateY(-2px)}.receipt-zone__title{display:flex;align-items:center;justify-content:space-between;gap:12px}.receipt-zone__title>div{display:flex;align-items:center;gap:8px;font-size:12px;font-weight:900}.receipt-zone__title svg{width:17px}.receipt-zone__title small{padding:2px 6px;background:#171918;color:#fff}.upload-command{display:flex;align-items:center;gap:6px;padding:7px 10px;border:1.5px solid #171918;background:#fff07a;font-size:12px;font-weight:900;box-shadow:2px 2px 0 #171918}.upload-command svg{width:15px}.receipt-grid{display:grid;grid-template-columns:repeat(6,1fr);gap:8px;margin-top:12px}.receipt-grid figure{position:relative;aspect-ratio:1;border:1.5px solid #171918;background:#fff;overflow:hidden}.receipt-grid img{width:100%;height:100%;object-fit:cover;cursor:zoom-in}.receipt-grid figure button{position:absolute;right:3px;top:3px;width:24px;height:24px;display:grid;place-items:center;border:1px solid #171918;background:#ff8d7c}.receipt-grid figure button svg{width:13px}.receipt-empty{padding:22px 8px 10px;text-align:center;font-size:11px;color:#747875}
.form-error{margin:-8px 22px 14px;padding:9px 11px;border-left:4px solid #e74831;background:#ffe7e2;color:#9f2c1c;font-size:12px;font-weight:700}.wool-dialog__footer{position:sticky;bottom:0;display:flex;align-items:center;justify-content:space-between;gap:16px;padding:14px 22px;background:#fffdf6;border-top:2px solid #171918}.wool-dialog__footer>span{font-size:11px;color:#777}.wool-dialog__footer>div{display:flex;gap:8px}.secondary-command,.primary-command{height:38px;padding:0 16px;border:1.5px solid #171918;font-size:12px;font-weight:900}.secondary-command{background:#fff}.primary-command{display:flex;align-items:center;gap:7px;background:#bdf6df;box-shadow:3px 3px 0 #171918}.primary-command svg{width:16px}.spin{animation:spin 1s linear infinite}@keyframes spin{to{transform:rotate(360deg)}}
@media(max-width:640px){.wool-dialog-mask{padding:10px}.wool-dialog{max-height:calc(100vh - 20px);box-shadow:5px 5px 0 #171918}.form-grid{grid-template-columns:1fr;padding:16px}.field.full{grid-column:auto}.receipt-zone{margin:0 16px 16px}.receipt-grid{grid-template-columns:repeat(3,1fr)}.wool-dialog__footer{align-items:flex-end}.wool-dialog__footer>span{display:none}}
.deposit-field{position:relative}.deposit-select-wrapper{position:relative}.deposit-select{display:flex;align-items:center;justify-content:space-between;width:100%;height:44px;padding:0 12px;border:1.5px solid #171918;border-radius:5px;background:#fff;font-size:13px;font-weight:800;text-align:left;cursor:pointer}.deposit-select:hover{background:#faf7f0}.deposit-select svg{width:16px;transition:transform .2s}.deposit-select svg.rotated{transform:rotate(180deg)}.deposit-dropdown{position:absolute;left:0;right:0;top:calc(100% + 4px);z-index:10;max-height:300px;overflow-y:auto;border:1.5px solid #171918;border-top:0;background:#fffdf6;box-shadow:4px 4px 0 #171918}.deposit-option{display:flex;align-items:center;justify-content:space-between;padding:10px 14px;border-bottom:1px solid #eee9dc;cursor:pointer}.deposit-option:last-child{border-bottom:0}.deposit-option:hover{background:#bdf6df}.deposit-option.selected{background:#80d7ff}.deposit-info{flex:1;min-width:0}.deposit-name{display:block;font-size:13px;font-weight:900;overflow:hidden;white-space:nowrap;text-overflow:ellipsis}.deposit-group{display:block;font-size:9px;color:#777}.deposit-amount{flex-shrink:0;margin-left:12px;font-size:13px;font-weight:900}.deposit-amount.positive{color:#087e57}.deposit-amount.negative{color:#d83b2b}.balance-preview{display:flex;align-items:center;gap:8px;margin-top:7px;padding:8px 10px;border:1.5px solid #171918;background:#bdf6df;font-size:11px}.balance-preview.spend{background:#ffd3cc}.balance-preview svg{width:15px}.balance-preview b{margin-left:auto}.receipt-actions{display:flex;gap:7px}.ai-command{display:flex;align-items:center;gap:6px;padding:7px 10px;border:1.5px solid #171918;background:#80d7ff;font-size:12px;font-weight:900;box-shadow:2px 2px 0 #171918}.ai-command:disabled,.upload-command:disabled{opacity:.55;cursor:wait}.ai-command svg{width:15px}.ai-status{display:flex;align-items:center;gap:7px;margin-top:10px;padding:9px 10px;border:1.5px solid #171918;background:#e7f6ff;font-size:11px;font-weight:700}.ai-status.success{background:#bdf6df}.ai-status.error{background:#ffe1dc;color:#9f2c1c}.ai-status svg{width:15px;flex-shrink:0}.ai-status b{margin-left:auto;font-size:9px;white-space:nowrap}.name-field{position:relative}.suggestion-wrapper{position:relative}.suggestion-list{position:absolute;left:0;right:0;top:calc(100% + 4px);z-index:10;max-height:220px;overflow-y:auto;border:1.5px solid #171918;border-top:0;background:#fffdf6;box-shadow:4px 4px 0 #171918}.suggestion-list button{display:flex;align-items:center;gap:10px;width:100%;padding:9px 12px;border:0;border-bottom:1px solid #eee9dc;background:transparent;text-align:left;font-size:12px}.suggestion-list button:last-child{border-bottom:0}.suggestion-list button:hover{background:#bdf6df}.suggestion-name{flex:1;overflow:hidden;white-space:nowrap;text-overflow:ellipsis;font-weight:900}.suggestion-category{padding:2px 6px;background:#eee9dc;font-size:9px;font-weight:800}.suggestion-count{font-size:9px;color:#777}.image-preview-overlay{position:fixed;inset:0;z-index:90;display:flex;align-items:center;justify-content:center;background:rgba(0,0,0,.85);cursor:zoom-out}.image-preview-img{max-width:92vw;max-height:92vh;object-fit:contain;border-radius:4px}/* Interaction-safe workspace refinements */
.wool-dialog-mask{z-index:110;padding:20px;background:rgba(12,15,14,.74);overscroll-behavior:contain}
.wool-dialog{position:relative;isolation:isolate;display:flex;flex-direction:column;width:min(1040px,calc(100vw - 40px));height:min(760px,calc(100vh - 40px));max-height:none;overflow:hidden;border-radius:6px;box-shadow:10px 10px 0 #171918,0 24px 70px rgba(0,0,0,.36);outline:none}
.wool-dialog:before{content:"";position:absolute;z-index:5;left:18px;top:0;width:86px;height:5px;background:#ff806e;box-shadow:92px 0 0 #fff07a,184px 0 0 #80d7ff}
.wool-dialog__header{position:relative;top:auto;z-index:20;flex:0 0 auto;padding:18px 22px 14px;background:rgba(255,253,246,.98)}
.wool-dialog__header>div{display:flex;align-items:flex-end;gap:12px}.wool-dialog__header h2{font-size:22px}.wool-kicker{padding-bottom:2px}
.icon-command{transition:transform .16s,box-shadow .16s}.icon-command:hover:not(:disabled){transform:translate(-1px,-1px);box-shadow:5px 5px 0 #171918}.icon-command:disabled{opacity:.45}
.record-switch{position:relative;z-index:19;flex:0 0 auto}.record-switch button{height:44px;transition:background .16s,color .16s}.record-switch button:focus-visible,.icon-command:focus-visible,.primary-command:focus-visible,.secondary-command:focus-visible,.ai-command:focus-visible,.upload-command:focus-visible{outline:3px solid #80d7ff;outline-offset:-3px}
.workflow-strip{position:relative;z-index:18;display:grid;grid-template-columns:auto 1fr auto 1fr auto;align-items:center;gap:10px;flex:0 0 auto;padding:8px 22px;border-bottom:1.5px solid #171918;background:#f5f1e6}.workflow-strip span{display:flex;align-items:center;gap:5px;font-size:9px;font-weight:900;color:#9a9c9a;white-space:nowrap}.workflow-strip span.done{color:#171918}.workflow-strip span svg{width:13px;height:13px;padding:2px;border:1px solid currentColor;background:#fff}.workflow-strip span.done:first-child svg{background:#80d7ff}.workflow-strip span.done:last-child svg{background:#bdf6df}.workflow-strip i{height:1px;background:#b7b4aa}.workflow-strip span.done+i{background:#171918}
.wool-dialog__body{position:relative;z-index:10;display:grid;grid-template-columns:minmax(0,1.18fr) minmax(310px,.82fr);min-height:0;flex:1;background:#fffdf6}
.form-grid{display:grid;align-content:start;grid-template-columns:1fr 1fr;gap:12px;min-width:0;overflow-y:auto;padding:18px 20px 24px;overscroll-behavior:contain;scrollbar-gutter:stable}
.field{min-width:0}.field>span{display:flex;align-items:center;min-height:15px;color:#4d514f}.field input,.field select,.field textarea{transition:border-color .15s,box-shadow .15s,background .15s}.field input:hover,.field select:hover,.field textarea:hover{background:#fff}.field input:focus,.field select:focus,.field textarea:focus{border-color:#087e57;box-shadow:0 0 0 3px rgba(189,246,223,.9)}
.deposit-select-wrapper{position:relative}.deposit-select{display:block;height:42px;padding:0 42px 0 11px;border-radius:5px;appearance:auto;cursor:pointer;text-overflow:ellipsis}.deposit-select-wrapper>svg{position:absolute;right:12px;top:50%;width:17px;pointer-events:none;transform:translateY(-50%);color:#087e57}.balance-preview{min-height:36px;border-radius:4px}.balance-preview b{font-size:12px}
.suggestion-list{z-index:40;border-top:1.5px solid #171918;box-shadow:4px 4px 0 #171918,0 12px 30px rgba(0,0,0,.12)}.suggestion-list button{cursor:pointer}.suggestion-list button:focus-visible{outline:2px solid #087e57;outline-offset:-2px}
.suggestion-wrapper.with-icon svg{position:absolute;left:11px;top:50%;width:16px;transform:translateY(-50%);pointer-events:none;z-index:1}.suggestion-wrapper.with-icon input{padding-left:36px}
.receipt-zone{display:flex;flex-direction:column;min-height:0;margin:16px 18px 16px 0;padding:14px;overflow-y:auto;border-style:solid;background:#f3efe3;overscroll-behavior:contain;scrollbar-gutter:stable}.receipt-zone.dragging{border-color:#087e57;background:#bdf6df;transform:none;box-shadow:inset 0 0 0 3px rgba(8,126,87,.16)}.receipt-zone__title{position:sticky;top:-14px;z-index:3;margin:-14px -14px 0;padding:14px;background:#f3efe3;border-bottom:1px solid rgba(23,25,24,.18)}.receipt-zone.dragging .receipt-zone__title{background:#bdf6df}.receipt-actions{flex-wrap:wrap;justify-content:flex-end}.ai-command,.upload-command{min-height:32px;border-radius:4px;transition:transform .15s,box-shadow .15s}.ai-command:hover:not(:disabled),.upload-command:hover:not(:disabled){transform:translate(-1px,-1px);box-shadow:4px 4px 0 #171918}.ai-status{flex:0 0 auto;border-radius:4px;line-height:1.45}.ai-status span{min-width:0}.receipt-grid{grid-template-columns:repeat(3,minmax(0,1fr));align-content:start;gap:9px}.receipt-grid figure{border-radius:4px;box-shadow:2px 2px 0 #171918}.receipt-grid figure button{border-radius:3px}.receipt-grid figure button:disabled{opacity:.45}.receipt-empty{display:flex;flex:1;min-height:250px;flex-direction:column;align-items:center;justify-content:center;padding:24px 12px;text-align:center}.receipt-empty>svg{width:42px;height:42px;padding:10px;margin-bottom:12px;border:1.5px solid #171918;background:#fff07a;box-shadow:4px 4px 0 #171918}.receipt-empty strong{font-size:13px}.receipt-empty span{margin-top:5px;font-size:10px;color:#515653}.receipt-empty small{margin-top:4px;font-size:9px;color:#8a8d8b}
.form-error{position:relative;z-index:22;flex:0 0 auto;margin:0;padding:9px 22px;border-left:0;border-top:1.5px solid #171918;background:#ffe1dc}
.wool-dialog__footer{position:relative;bottom:auto;z-index:20;flex:0 0 auto;min-height:62px;padding:11px 22px;background:#fffdf6}.wool-dialog__footer>span{max-width:55%;line-height:1.4}.secondary-command,.primary-command{min-width:92px;border-radius:4px}.primary-command{justify-content:center;min-width:118px}.primary-command:hover:not(:disabled){transform:translate(-1px,-1px);box-shadow:5px 5px 0 #171918}.secondary-command:hover:not(:disabled){background:#eee9dc}.primary-command:disabled,.secondary-command:disabled{opacity:.48;cursor:not-allowed}
.image-preview-overlay{z-index:130;cursor:default;backdrop-filter:blur(8px)}.image-preview-img{max-width:88vw;max-height:86vh;border:2px solid #fff;box-shadow:8px 8px 0 #fff07a}.preview-close{position:absolute;right:24px;top:24px;width:42px;height:42px;display:grid;place-items:center;border:2px solid #171918;background:#fff07a;box-shadow:4px 4px 0 #fff}.preview-close svg{width:20px}
@media(max-width:820px){.wool-dialog-mask{padding:10px}.wool-dialog{width:calc(100vw - 20px);height:calc(100vh - 20px);box-shadow:5px 5px 0 #171918}.wool-dialog__header{padding:16px}.wool-dialog__header>div{display:block}.wool-kicker{display:block;margin-bottom:3px}.workflow-strip{padding:8px 14px}.wool-dialog__body{grid-template-columns:1fr;overflow-y:auto}.form-grid{overflow:visible;padding:16px}.receipt-zone{min-height:330px;margin:0 16px 16px;overflow:visible}.receipt-zone__title{position:relative;top:auto}.wool-dialog__footer{padding:10px 16px}.wool-dialog__footer>span{display:none}}
@media(max-width:560px){.workflow-strip{grid-template-columns:auto 1fr auto 1fr auto;gap:5px}.workflow-strip span{font-size:8px}.workflow-strip span svg{display:none}.form-grid{grid-template-columns:1fr;gap:11px}.field.full{grid-column:auto}.receipt-actions{width:100%;justify-content:stretch}.receipt-actions button{flex:1;justify-content:center}.receipt-grid{grid-template-columns:repeat(3,1fr)}.balance-preview{align-items:flex-start;flex-wrap:wrap}.balance-preview b{width:100%;margin-left:23px}.wool-dialog__footer>div{width:100%}.secondary-command,.primary-command{flex:1}.preview-close{right:12px;top:12px}}.workflow-strip span.active{color:#087e57}.workflow-strip span.active svg{background:#80d7ff;animation:softPulse 1.1s ease-in-out infinite}@keyframes softPulse{50%{box-shadow:0 0 0 4px rgba(128,215,255,.35)}}
/* Searchable account popover */
.deposit-select{display:flex;align-items:center;width:100%;height:54px;padding:0 12px;border:1.5px solid #171918;border-radius:5px;background:#fff;text-align:left;cursor:pointer;appearance:none;transition:background .15s,box-shadow .15s,transform .15s}.deposit-select:hover,.deposit-select.open{background:#f3fff9;box-shadow:0 0 0 3px rgba(189,246,223,.85)}.deposit-select.selected{border-color:#087e57}.deposit-select__icon{display:grid;place-items:center;width:32px;height:32px;flex:0 0 auto;border:1.5px solid #171918;background:#bdf6df}.deposit-select__icon svg{width:17px}.deposit-select__copy{display:block;min-width:0;flex:1;margin-left:10px}.deposit-select__copy b,.deposit-select__copy small{display:block;overflow:hidden;white-space:nowrap;text-overflow:ellipsis}.deposit-select__copy b{font-size:12px;color:#171918}.deposit-select__copy small{margin-top:2px;font-size:9px;font-weight:600;color:#777}.deposit-select__balance{flex:0 0 auto;margin-left:10px;font-size:12px;font-weight:950}.deposit-select__balance.positive{color:#087e57}.deposit-select__balance.negative{color:#d83b2b}.deposit-select__arrow{width:16px;flex:0 0 auto;margin-left:9px;transition:transform .18s}.deposit-select__arrow.rotated{transform:rotate(180deg)}
.deposit-popover{position:fixed;z-index:180;display:flex;flex-direction:column;overflow:hidden;border:2px solid #171918;border-radius:6px;background:#fffdf6;box-shadow:7px 7px 0 #171918,0 20px 55px rgba(0,0,0,.28);transform-origin:right center;animation:depositPopoverIn .18s ease-out}.deposit-popover.drawer{transform-origin:left center;box-shadow:9px 9px 0 #171918,18px 0 70px rgba(0,0,0,.34)}@keyframes depositPopoverIn{from{opacity:0;transform:translateX(-12px) scale(.985)}to{opacity:1;transform:translateX(0) scale(1)}}.deposit-popover__head{display:flex;align-items:center;justify-content:space-between;gap:10px;padding:11px 12px;border-bottom:1.5px solid #171918;background:#bdf6df}.deposit-popover__head>div{display:flex;align-items:center;gap:7px;min-width:0}.deposit-popover__head svg{width:17px}.deposit-popover__head span{font-size:12px;font-weight:950}.deposit-popover__head small{padding:2px 6px;background:#171918;color:#fff;font-size:8px;font-weight:800}.deposit-popover__head button{width:28px;height:28px;display:grid;place-items:center;flex:0 0 auto;border:1.5px solid #171918;background:#fff}.deposit-popover__head button:hover{background:#ff806e}.deposit-popover__head button svg{width:14px}.deposit-search{position:relative;display:block;padding:10px 11px;border-bottom:1px solid #d5d2c9;background:#f5f1e6}.deposit-search>svg{position:absolute;left:21px;top:50%;width:15px;transform:translateY(-50%);color:#6d716e}.deposit-search input{width:100%;height:34px;padding:0 10px 0 34px;border:1.5px solid #171918;border-radius:4px;background:#fff;font-size:11px;outline:none}.deposit-search input:focus{box-shadow:0 0 0 3px #80d7ff}.deposit-popover__list{min-height:120px;overflow-y:auto;overscroll-behavior:contain;scrollbar-gutter:stable;background:#fffdf6}.deposit-popover__group>header{position:sticky;top:0;z-index:2;display:flex;align-items:center;justify-content:space-between;padding:6px 11px;border-bottom:1px solid #d5d2c9;background:#eee9dc}.deposit-popover__group>header span{font-size:9px;font-weight:950;color:#555a57}.deposit-popover__group>header small{min-width:18px;padding:1px 5px;border:1px solid #aaa69b;background:#fff;text-align:center;font-size:8px}.deposit-option{position:relative;display:grid;grid-template-columns:34px minmax(0,1fr) auto 18px;align-items:center;gap:9px;width:100%;min-height:54px;padding:7px 11px;border:0;border-bottom:1px solid #ebe7dc;background:#fffdf6;text-align:left;cursor:pointer}.deposit-option:hover,.deposit-option:focus-visible{z-index:1;background:#eefcf6;outline:2px solid #087e57;outline-offset:-2px}.deposit-option.selected{background:#d9f8eb}.deposit-option__icon{width:32px;height:32px;display:grid;place-items:center;border:1.5px solid #171918;background:#fff07a;font-size:13px;font-weight:950}.deposit-info{min-width:0}.deposit-info b,.deposit-info small{display:block;overflow:hidden;white-space:nowrap;text-overflow:ellipsis}.deposit-info b{font-size:11px}.deposit-info small{margin-top:2px;font-size:8px;color:#777}.deposit-amount{min-width:92px;text-align:right}.deposit-amount small,.deposit-amount b{display:block}.deposit-amount small{font-size:7px;color:#999}.deposit-amount b{font-size:11px}.deposit-amount.positive b{color:#087e57}.deposit-amount.negative b{color:#d83b2b}.deposit-option__check{width:16px;color:#087e57}.deposit-popover__empty{min-height:160px;display:flex;flex-direction:column;align-items:center;justify-content:center;padding:20px;text-align:center}.deposit-popover__empty>svg{width:30px;height:30px;padding:7px;border:1.5px solid #171918;background:#fff07a}.deposit-popover__empty strong{margin-top:10px;font-size:11px}.deposit-popover__empty span{margin-top:3px;font-size:9px;color:#888}
@media(max-width:560px){.deposit-popover{left:8px!important;top:8px!important;width:min(330px,calc(100vw - 16px))!important;height:calc(100vh - 16px)!important;max-height:none!important}.deposit-select__balance{font-size:10px}.deposit-option{grid-template-columns:32px minmax(0,1fr) auto 16px}.deposit-amount{min-width:78px}}.deposit-popover__list{flex:1;min-height:0}
</style>
