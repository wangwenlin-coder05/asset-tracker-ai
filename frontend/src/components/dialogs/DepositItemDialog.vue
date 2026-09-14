<template>
  <div class="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50 p-3 overflow-hidden" :class="{ 'hidden': !visible }">
    <div class="bg-gradient-to-br from-white via-white to-emerald-50/20 rounded-xl p-4 w-[calc(100vw-24px)] max-w-[1160px] dialog-glow relative h-[650px] overflow-hidden flex flex-col transition-all duration-300">
      <div class="flex justify-between items-center mb-2 flex-shrink-0">
        <h3 class="text-base font-bold text-slate-800 flex items-center gap-2">
          <Wallet class="w-5 h-5 text-emerald-500" />
          {{ depositItem ? '编辑存款' : '新增存款' }}
        </h3>
        <button @click="$emit('close')" class="text-neutral hover:text-slate-800">
          <X class="w-5 h-5" />
        </button>
      </div>
      <div class="flex gap-3 min-h-0 flex-1">
        <div v-if="form.itemType === 'installment'" class="w-[260px] flex-shrink-0 flex flex-col border border-slate-200 rounded-lg bg-slate-50/30 p-3">
          <label class="block text-xs font-medium text-slate-600 mb-1">还款清单</label>
          <div class="flex-1 space-y-0.5 overflow-y-auto">
            <div
              v-for="bill in installmentBills"
              :key="bill.period"
              class="flex items-center justify-between px-2 py-1.5 bg-slate-50 rounded text-xs"
              :class="{ 'line-through text-slate-400': bill.paid }"
            >
              <div class="flex items-center gap-1.5">
                <div :class="bill.paid ? 'w-3 h-3 rounded-full bg-emerald-100 text-emerald-500 flex items-center justify-center' : 'w-3 h-3 rounded-full border border-slate-300'">
                  <Check v-if="bill.paid" class="w-2 h-2" />
                </div>
                <span class="font-medium">第{{ bill.period }}期</span>
              </div>
              <div class="text-right min-w-[80px]">
                <div class="text-slate-400 text-[10px]">{{ bill.date }}</div>
                <div class="font-medium">¥{{ formatNumber(bill.amount) }}</div>
              </div>
            </div>
            <div v-if="installmentBills.length === 0" class="text-xs text-slate-400 text-center py-2">请填写分期信息</div>
          </div>
        </div>
        <div class="flex-1 min-w-0 flex flex-col border border-slate-200 rounded-lg bg-slate-50/30 p-3">
          <div class="space-y-2">
            <div class="deposit-field-row">
              <label class="text-xs font-medium text-slate-700">类型</label>
              <div class="flex gap-2">
                <button
                  @click="form.itemType = 'normal'"
                  class="flex-1 py-1.5 px-2 rounded-lg border-2 text-xs font-medium transition-all"
                  :class="form.itemType === 'normal' ? 'border-emerald-500 bg-emerald-50 text-emerald-700' : 'border-slate-200 bg-white text-slate-500 hover:border-slate-300'"
                >普通存款</button>
                <button
                  @click="form.itemType = 'debt'"
                  class="flex-1 py-1.5 px-2 rounded-lg border-2 text-xs font-medium transition-all"
                  :class="form.itemType === 'debt' ? 'border-emerald-500 bg-emerald-50 text-emerald-700' : 'border-slate-200 bg-white text-slate-500 hover:border-slate-300'"
                >普通欠债</button>
                <button
                  @click="form.itemType = 'installment'"
                  class="flex-1 py-1.5 px-2 rounded-lg border-2 text-xs font-medium transition-all"
                  :class="form.itemType === 'installment' ? 'border-emerald-500 bg-emerald-50 text-emerald-700' : 'border-slate-200 bg-white text-slate-500 hover:border-slate-300'"
                >分期还款</button>
              </div>
            </div>
            <div class="deposit-field-row">
              <label class="text-xs font-medium text-slate-700">名称</label>
              <input
                type="text"
                v-model="form.name"
                class="w-full border border-slate-200 rounded px-2.5 py-1.5 text-sm text-slate-800 focus:input-focus"
                placeholder="如：定期存款"
              />
            </div>
            <div v-if="form.itemType === 'normal'" class="flex gap-2">
              <div class="flex-1">
                <label class="block text-xs font-medium text-slate-600 mb-0.5">金额 (元)</label>
                <input
                  v-if="!form.bindType"
                  type="text"
                  inputmode="decimal"
                  :value="displayAmountInput"
                  @input="onAmountInput('amount', $event.target.value)"
                  @blur="onAmountBlur('amount')"
                  class="w-full border border-slate-200 rounded px-2.5 py-1.5 text-sm text-slate-800 focus:input-focus"
                  placeholder="支持算式，如 1000+50*2"
                />
                <div v-else class="w-full border border-amber-300 rounded px-2.5 py-1.5 text-sm text-amber-600 bg-amber-50 flex items-center gap-1">
                  <Link2 class="w-3 h-3" />
                  自动同步（{{ bindTypeLabel }}）
                </div>
              </div>
              <div class="flex-1">
                <label class="block text-xs font-medium text-slate-600 mb-0.5">备注</label>
                <input
                  type="text"
                  v-model="form.note"
                  class="w-full border border-slate-200 rounded px-2.5 py-1.5 text-sm text-slate-800 focus:input-focus"
                  placeholder="如：3年期"
                />
              </div>
            </div>
            <div v-if="form.itemType === 'debt'" class="space-y-2">
              <div class="flex gap-2">
                <div class="flex-1">
                  <label class="block text-xs font-medium text-slate-600 mb-0.5">欠款金额 (元)</label>
                  <input
                    type="text"
                    inputmode="decimal"
                    :value="displayDebtAmountInput"
                    @input="onAmountInput('debtAmount', $event.target.value)"
                    @blur="onAmountBlur('debtAmount')"
                    class="w-full border border-slate-200 rounded px-2.5 py-1.5 text-sm text-slate-800 focus:input-focus"
                    placeholder="支持算式，如 -(1000+500)"
                  />
                </div>
                <div class="w-[110px]">
                  <label class="block text-xs font-medium text-slate-600 mb-0.5">还款模式</label>
                  <div class="flex gap-1">
                    <button
                      type="button"
                      @click="form.repaymentMode = 'auto'"
                      class="flex-1 py-1.5 px-1 rounded-lg border-2 text-xs font-medium transition-all"
                      :class="form.repaymentMode === 'auto' ? 'border-emerald-500 bg-emerald-50 text-emerald-700' : 'border-slate-200 bg-white text-slate-500 hover:border-slate-300'"
                    >自动</button>
                    <button
                      type="button"
                      @click="form.repaymentMode = 'manual'"
                      class="flex-1 py-1.5 px-1 rounded-lg border-2 text-xs font-medium transition-all"
                      :class="form.repaymentMode === 'manual' ? 'border-emerald-500 bg-emerald-50 text-emerald-700' : 'border-slate-200 bg-white text-slate-500 hover:border-slate-300'"
                    >手动</button>
                  </div>
                </div>
              </div>
              <div v-if="form.repaymentMode === 'auto'" class="grid grid-cols-1 gap-2">
                <div>
                  <label class="block text-xs font-medium text-slate-600 mb-0.5">每月还款日</label>
                  <input
                    type="number"
                    step="1"
                    v-model.number="form.repaymentDay"
                    min="1"
                    max="28"
                    class="w-full border border-slate-200 rounded px-2.5 py-1.5 text-sm text-slate-800 focus:input-focus"
                    placeholder="日"
                  />
                </div>
              </div>
              <div class="deposit-field-row">
                <label class="text-xs font-medium text-slate-700">绑定还款账户</label>
                <div class="relative">
                  <input
                    type="text"
                    :value="paymentAccountSearch || selectedAccountLabel"
                    @focus="onAccountFocus"
                    @input="onAccountInput"
                    @blur="onAccountBlur"
                    :placeholder="'搜索选择还款账户...'"
                    :class="['w-full border rounded px-2.5 py-1.5 text-sm focus:outline-none transition-all', form.paymentAccountId && !paymentAccountSearch ? 'border-emerald-400 bg-emerald-50 text-emerald-700 font-medium' : 'border-slate-200 text-slate-800 focus:input-focus']"
                  />
                  <div v-if="showAccountDropdown && filteredAccounts.length > 0" class="absolute z-50 top-full left-0 right-0 mt-1 max-h-[150px] overflow-y-auto bg-white border border-slate-200 rounded-lg shadow-lg">
                    <div
                      v-for="acc in filteredAccounts"
                      :key="acc.id"
                      :class="['p-2 cursor-pointer text-xs flex items-center justify-between', acc.id === form.paymentAccountId ? 'bg-emerald-100 text-emerald-700 font-medium' : 'hover:bg-emerald-50 text-slate-700']"
                      @mousedown.prevent="selectAccount(acc)"
                    >
                      <span class="flex items-center gap-1">
                        <Check v-if="acc.id === form.paymentAccountId" class="w-3 h-3" />
                        {{ acc.name }}
                      </span>
                      <span class="text-slate-400">¥{{ formatNumber(acc.amount) }}</span>
                    </div>
                  </div>
                  <div v-if="showAccountDropdown && filteredAccounts.length === 0" class="absolute z-50 top-full left-0 right-0 mt-1 bg-white border border-slate-200 rounded-lg shadow-lg p-2 text-xs text-slate-400 text-center">
                    无匹配账户
                  </div>
                </div>
              </div>
            </div>
            <div v-if="form.itemType === 'installment'" class="space-y-2">
              <div class="grid grid-cols-3 gap-2">
                <div>
                  <label class="block text-xs font-medium text-slate-600 mb-0.5">总金额 (元)</label>
                  <input
                    type="text"
                    inputmode="decimal"
                    :value="displayTotalPrincipal"
                    @input="onAmountInput('totalPrincipal', $event.target.value); calculateInstallment()"
                    @blur="onAmountBlur('totalPrincipal')"
                    class="w-full border border-slate-200 rounded px-2.5 py-1.5 text-sm text-slate-800 focus:input-focus"
                    placeholder="支持算式，如 20000+1200"
                  />
                </div>
                <div>
                  <label class="block text-xs font-medium text-slate-600 mb-0.5">总利息 (元)</label>
                  <input
                    type="text"
                    inputmode="decimal"
                    :value="displayTotalInterest"
                    @input="onAmountInput('totalInterest', $event.target.value); calculateInstallment()"
                    @blur="onAmountBlur('totalInterest')"
                    class="w-full border border-slate-200 rounded px-2.5 py-1.5 text-sm text-slate-800 focus:input-focus"
                    placeholder="支持算式"
                  />
                </div>
                <div>
                  <label class="block text-xs font-medium text-slate-600 mb-0.5">分期数</label>
                  <input
                    type="number"
                    step="1"
                    v-model.number="form.installments"
                    @input="calculateInstallment"
                    class="w-full border border-slate-200 rounded px-2.5 py-1.5 text-sm text-slate-800 focus:input-focus"
                  />
                </div>
              </div>
              <div class="grid grid-cols-3 gap-2">
                <div>
                  <label class="block text-xs font-medium text-slate-600 mb-0.5">每月还款日</label>
                  <input
                    type="number"
                    step="1"
                    v-model.number="form.monthlyDay"
                    min="1"
                    max="28"
                    class="w-full border border-slate-200 rounded px-2.5 py-1.5 text-sm text-slate-800 focus:input-focus"
                  />
                </div>
                <div>
                  <label class="block text-xs font-medium text-slate-600 mb-0.5">开始日期</label>
                  <input
                    type="date"
                    v-model="form.startDate"
                    class="w-full border border-slate-200 rounded px-2.5 py-1.5 text-sm text-slate-800 focus:input-focus"
                  />
                </div>
                <div>
                  <label class="block text-xs font-medium text-slate-600 mb-0.5">每期还款</label>
                  <div class="w-full border border-slate-200 rounded px-2.5 py-1.5 text-sm text-slate-500 bg-slate-50">
                    ¥{{ formatNumber(perPayment) }}
                  </div>
                </div>
              </div>
            </div>
            <div class="flex items-center justify-between gap-2">
              <label class="flex items-center gap-1.5 text-xs text-slate-500 cursor-pointer">
                <input type="checkbox" v-model="form.excludeTotal" class="rounded border-slate-300 text-slate-400 focus:ring-0" />
                不计入总额
              </label>
            </div>
            <div v-if="form.itemType === 'normal'" class="deposit-field-row">
              <label class="text-xs font-medium text-slate-700">绑定指标（自动同步）</label>
              <div class="relative">
                <input
                  type="text"
                  :value="bindSearch || selectedBindLabel"
                  @focus="onBindFocus"
                  @input="onBindInput"
                  @blur="onBindBlur"
                  :placeholder="'搜索选择绑定指标...'"
                  :class="['w-full border rounded px-2.5 py-1.5 text-sm focus:outline-none transition-all', form.bindType && !bindSearch ? 'border-amber-400 bg-amber-50 text-amber-700 font-medium' : 'border-slate-200 text-slate-800 focus:input-focus']"
                />
                <div v-if="showBindDropdown && filteredBindOptions.length > 0" class="absolute z-50 top-full left-0 right-0 mt-1 max-h-[150px] overflow-y-auto bg-white border border-slate-200 rounded-lg shadow-lg">
                  <div
                    v-for="opt in filteredBindOptions"
                    :key="opt.value"
                    :class="['p-2 cursor-pointer text-xs flex items-center justify-between', opt.value === form.bindType ? 'bg-amber-100 text-amber-700 font-medium' : 'hover:bg-amber-50 text-slate-700']"
                    @mousedown.prevent="selectBind(opt)"
                  >
                    <span class="flex items-center gap-1">
                      <Check v-if="opt.value === form.bindType" class="w-3 h-3" />
                      {{ opt.label }}
                    </span>
                    <span v-if="opt.amount !== undefined" class="text-slate-400">¥{{ formatNumber(opt.amount) }}</span>
                  </div>
                </div>
                <div v-if="showBindDropdown && filteredBindOptions.length === 0" class="absolute z-50 top-full left-0 right-0 mt-1 bg-white border border-slate-200 rounded-lg shadow-lg p-2 text-xs text-slate-400 text-center">
                  无匹配项
                </div>
              </div>
            </div>
            <div v-else-if="form.itemType === 'installment'" class="deposit-field-row">
              <label class="text-xs font-medium text-slate-700">还款账户（自动扣款）</label>
              <div class="relative">
                <input
                  type="text"
                  :value="paymentAccountSearch || selectedAccountLabel"
                  @focus="onAccountFocus"
                  @input="onAccountInput"
                  @blur="onAccountBlur"
                  :placeholder="'搜索选择还款账户...'"
                  :class="['w-full border rounded px-2.5 py-1.5 text-sm focus:outline-none transition-all', form.paymentAccountId && !paymentAccountSearch ? 'border-emerald-400 bg-emerald-50 text-emerald-700 font-medium' : 'border-slate-200 text-slate-800 focus:input-focus']"
                />
                <div v-if="showAccountDropdown && filteredAccounts.length > 0" class="absolute z-50 top-full left-0 right-0 mt-1 max-h-[150px] overflow-y-auto bg-white border border-slate-200 rounded-lg shadow-lg">
                  <div
                    v-for="acc in filteredAccounts"
                    :key="acc.id"
                    :class="['p-2 cursor-pointer text-xs flex items-center justify-between', acc.id === form.paymentAccountId ? 'bg-emerald-100 text-emerald-700 font-medium' : 'hover:bg-emerald-50 text-slate-700']"
                    @mousedown.prevent="selectAccount(acc)"
                  >
                    <span class="flex items-center gap-1">
                      <Check v-if="acc.id === form.paymentAccountId" class="w-3 h-3" />
                      {{ acc.name }}
                    </span>
                    <span class="text-slate-400">¥{{ formatNumber(acc.amount) }}</span>
                  </div>
                </div>
                <div v-if="showAccountDropdown && filteredAccounts.length === 0" class="absolute z-50 top-full left-0 right-0 mt-1 bg-white border border-slate-200 rounded-lg shadow-lg p-2 text-xs text-slate-400 text-center">
                  无匹配账户
                </div>
              </div>
            </div>
          </div>
          <div class="mt-auto pt-2">
            <!-- 图标 -->
            <div class="flex items-start gap-3 mb-1.5">
              <div class="flex-shrink-0 flex flex-col items-center gap-1">
                <label class="text-[10px] font-medium text-slate-500">当前图标</label>
                <div class="w-16 h-16 rounded-lg border-2 border-dashed border-slate-300 bg-white flex items-center justify-center overflow-hidden cursor-pointer hover:border-emerald-400 transition-colors" @click="triggerIconPicker">
                  <img v-if="form.icon" :src="form.icon" class="w-full h-full object-contain p-1" alt="图标" />
                  <Upload v-else class="w-5 h-5 text-slate-300" />
                  <input ref="iconInput" type="file" accept="image/*" class="hidden" @change="handleIconUpload" />
                </div>
                <span v-if="form.icon" @click="form.icon = ''" class="text-[9px] text-red-400 cursor-pointer hover:underline">清除</span>
              </div>
              <div class="flex-1 min-w-0">
                <div class="flex items-center justify-between mb-1">
                  <span class="text-[10px] font-medium text-slate-500">已有图标</span>
                  <div class="flex gap-1">
                    <button @click="triggerIconPicker" class="px-2 py-0.5 text-[10px] bg-slate-100 text-slate-600 rounded hover:bg-emerald-50 transition-all flex items-center gap-0.5"><Upload class="w-2.5 h-2.5" />上传</button>
                    <button @click="generateAiIcon" :disabled="aiGenerating" class="px-2 py-0.5 text-[10px] rounded transition-all flex items-center gap-0.5" :class="aiGenerating ? 'bg-slate-100 text-slate-400' : 'bg-amber-50 text-amber-600 hover:bg-amber-100'"><Sparkles class="w-2.5 h-2.5" />{{ aiGenerating ? '生成中' : 'AI生成' }}</button>
                  </div>
                </div>
                <p v-if="aiError" class="text-[9px] text-red-500 mb-1">{{ aiError }}</p>
                <div class="flex flex-wrap gap-1 max-h-[48px] overflow-y-auto">
                  <div
                    v-for="ico in existingIcons"
                    :key="ico.path"
                    class="w-9 h-9 rounded border cursor-pointer overflow-hidden flex-shrink-0"
                    :class="form.icon === ico.path ? 'border-emerald-500 ring-2 ring-emerald-200' : 'border-slate-200 hover:border-slate-400'"
                    @click="form.icon = ico.path"
                  >
                    <img :src="ico.path" class="w-full h-full object-contain p-0.5" />
                  </div>
                  <div v-if="existingIcons.length === 0" class="text-[9px] text-slate-400 py-2">暂无已有图标，上传或AI生成</div>
                </div>
              </div>
            </div>
            <button
              @click="handleConfirm"
              class="py-1.5 px-8 bg-emerald-500 text-white rounded-lg hover:bg-emerald-600 transition-all font-medium text-sm w-full"
            >确认</button>
          </div>
        </div>
        <div class="w-[170px] flex-shrink-0 flex flex-col gap-2">
          <label class="block text-xs font-medium text-slate-600">所属分组</label>
          <div class="flex-1 border border-slate-200 rounded-lg overflow-hidden overflow-y-auto">
            <div
              v-for="group in groupNames"
              :key="group"
              class="p-2 cursor-pointer hover:bg-emerald-50 transition-all text-xs text-slate-700"
              :class="{ 'bg-emerald-50 text-emerald-700': form.groupName === group }"
              @click="form.groupName = group"
            >{{ group }}</div>
          </div>
          <div class="flex gap-1 items-stretch">
            <input
              type="text"
              v-model="newGroupName"
              class="flex-1 min-w-0 border border-slate-200 rounded px-1.5 py-1 text-xs text-slate-700 focus:input-focus"
              placeholder="新分组"
              @keydown.enter="addNewGroup"
            />
            <button @click="addNewGroup" class="px-2 py-1 bg-slate-100 text-slate-600 rounded text-xs hover:bg-emerald-50 hover:text-emerald-600 transition-all flex-shrink-0 whitespace-nowrap">+添加</button>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, reactive, computed, watch, onMounted, nextTick } from 'vue'
import { Wallet, X, Link2, Check, Upload, Sparkles } from 'lucide-vue-next'
import { fmtNum } from '../../utils/formatter'
import { depositApi } from '../../utils/api'

function safeEvalExpression(expr) {
  if (expr == null) return null
  const s = String(expr).trim()
  if (!s) return null
  // 如果是纯数字（包含小数点/负号），直接 parse
  if (/^-?\d+(\.\d+)?$/.test(s)) return parseFloat(s)
  // 只允许数字、运算符、小数点、空格、括号
  if (!/^[0-9+\-*/().\s%]+$/.test(s)) return null
  try {
    // eslint-disable-next-line no-new-func
    const val = Function(`"use strict"; return (${s.replace(/%/g, '/100')});`)()
    if (typeof val !== 'number' || !Number.isFinite(val)) return null
    return Math.round(val * 1e8) / 1e8
  } catch { return null }
}

const props = defineProps({
  groupName: { type: String, default: '默认分组' },
  depositItem: { type: Object, default: null },
  allDeposits: { type: Array, default: () => [] }
})

const emit = defineEmits(['close', 'confirm'])

const visible = ref(true)
const newGroupName = ref('')
const customGroups = ref([])
const iconInput = ref(null)
const existingIcons = ref([])
const aiGenerating = ref(false)
const aiError = ref('')

const form = reactive({
  name: '',
  amount: 0,
  note: '',
  groupName: props.groupName,
  itemType: 'normal',
  excludeTotal: false,
  bindType: '',
  totalPrincipal: 0,
  totalInterest: 0,
  installments: 12,
  monthlyDay: 1,
  startDate: '',
  paymentAccountId: '',
  repaymentDay: null,
  repaymentMode: 'auto',
  icon: ''
})

const displayAmountInput = ref('')
const displayDebtAmountInput = ref('')
const displayTotalPrincipal = ref('')
const displayTotalInterest = ref('')

function syncDisplayAmounts() {
  displayAmountInput.value = form.amount != null ? String(form.amount) : ''
  displayDebtAmountInput.value = form.amount != null ? String(form.amount) : ''
  displayTotalPrincipal.value = form.totalPrincipal != null ? String(form.totalPrincipal) : ''
  displayTotalInterest.value = form.totalInterest != null ? String(form.totalInterest) : ''
}

function onAmountBlur(target) {
  const key = target
  let expr, field
  if (target === 'amount') {
    expr = displayAmountInput.value
    field = 'amount'
  } else if (target === 'debtAmount') {
    expr = displayDebtAmountInput.value
    field = 'amount'
  } else if (target === 'totalPrincipal') {
    expr = displayTotalPrincipal.value
    field = 'totalPrincipal'
  } else {
    expr = displayTotalInterest.value
    field = 'totalInterest'
  }
  if (expr == null || String(expr).trim() === '') { form[field] = 0; syncDisplayAmounts(); return }
  const val = safeEvalExpression(expr)
  if (val != null) {
    form[field] = Math.round(val * 100) / 100
  }
  syncDisplayAmounts()
}

function onAmountInput(target, rawValue) {
  if (target === 'amount') {
    displayAmountInput.value = rawValue
    const n = safeEvalExpression(rawValue)
    if (n != null) form.amount = Math.round(n * 100) / 100
  } else if (target === 'debtAmount') {
    displayDebtAmountInput.value = rawValue
    const n = safeEvalExpression(rawValue)
    if (n != null) form.amount = Math.round(n * 100) / 100
  } else if (target === 'totalPrincipal') {
    displayTotalPrincipal.value = rawValue
    const n = safeEvalExpression(rawValue)
    if (n != null) form.totalPrincipal = Math.round(n * 100) / 100
  } else {
    displayTotalInterest.value = rawValue
    const n = safeEvalExpression(rawValue)
    if (n != null) form.totalInterest = Math.round(n * 100) / 100
  }
}

watch(() => props.depositItem, (item) => {
  if (item) {
    form.name = item.name || ''
    form.amount = item.amount || 0
    form.note = item.note || ''
    form.groupName = item.groupName || '默认分组'
    form.itemType = item.itemType || 'normal'
    form.excludeTotal = item.excludeTotal || false
    form.bindType = item.bindType || ''
    form.totalPrincipal = item.totalPrincipal || 0
    form.totalInterest = item.totalInterest || 0
    form.installments = item.installments || 12
    form.monthlyDay = item.monthlyDay || 1
    form.startDate = item.startDate || ''
    form.paymentAccountId = item.paymentAccountId || ''
    form.repaymentDay = item.repaymentDay || null
    form.repaymentMode = item.repaymentMode || 'auto'
    form.icon = item.icon || ''
  }
  syncDisplayAmounts()
}, { immediate: true })

const defaultGroups = ['默认分组', '银行存款', '现金', '投资', '负债']
const groupNames = computed(() => {
  return [...defaultGroups, ...customGroups.value]
})

const paymentAccounts = computed(() => {
  return props.allDeposits.filter(d => {
    if (d.itemType === 'installment') return false
    if (d.itemType === 'debt') return false
    if (d.excludeTotal) return false
    if (props.depositItem && d.id === props.depositItem.id) return false
    return true
  })
})

const paymentAccountSearch = ref('')
const showAccountDropdown = ref(false)
const bindSearch = ref('')
const showBindDropdown = ref(false)

const predefinedBindOptions = [
  { value: 'stock_total_assets', label: '股票总资产' },
  { value: 'gold_zheshang', label: '浙商积存金市值' },
  { value: 'gold_ccb', label: '建行积存金市值' },
  { value: 'gold_physical', label: '实物黄金市值' },
]

const allBindOptions = computed(() => {
  const depositOpts = props.allDeposits
    .filter(d => d.id !== props.depositItem?.id && d.itemType !== 'installment' && !d.excludeTotal)
    .map(d => ({ value: `deposit:${d.id}`, label: d.name, amount: d.amount }))
  return [...predefinedBindOptions, ...depositOpts]
})

const filteredBindOptions = computed(() => {
  const keyword = bindSearch.value.trim().toLowerCase()
  if (!keyword) return allBindOptions.value
  return allBindOptions.value.filter(opt => opt.label.toLowerCase().includes(keyword))
})

const selectedBindLabel = computed(() => {
  if (!form.bindType) return ''
  const opt = allBindOptions.value.find(o => o.value === form.bindType)
  return opt ? opt.label : ''
})

function selectBind(opt) {
  form.bindType = opt.value
  bindSearch.value = ''
  showBindDropdown.value = false
}

function onBindFocus(e) { showBindDropdown.value = true; if (form.bindType) { bindSearch.value = ''; e.target.value = '' } }
function onBindInput(e) { bindSearch.value = e.target.value; showBindDropdown.value = true; if (form.bindType) form.bindType = '' }
function onBindBlur() { setTimeout(() => { showBindDropdown.value = false }, 150) }

const filteredAccounts = computed(() => {
  const keyword = paymentAccountSearch.value.trim().toLowerCase()
  if (!keyword) return paymentAccounts.value
  return paymentAccounts.value.filter(acc => acc.name.toLowerCase().includes(keyword))
})

const selectedAccountLabel = computed(() => {
  if (!form.paymentAccountId) return ''
  const acc = paymentAccounts.value.find(a => a.id === form.paymentAccountId)
  return acc ? `${acc.name}（¥${formatNumber(acc.amount)}）` : ''
})

function selectAccount(acc) { form.paymentAccountId = acc.id; paymentAccountSearch.value = ''; showAccountDropdown.value = false }
function onAccountFocus(e) { showAccountDropdown.value = true; if (form.paymentAccountId) { paymentAccountSearch.value = ''; e.target.value = '' } }
function onAccountInput(e) { paymentAccountSearch.value = e.target.value; showAccountDropdown.value = true; if (form.paymentAccountId) form.paymentAccountId = '' }
function onAccountBlur() { setTimeout(() => { showAccountDropdown.value = false }, 150) }

const perPayment = computed(() => {
  if (form.installments === 0) return 0
  return (form.totalPrincipal + form.totalInterest) / form.installments
})

const installmentBills = computed(() => {
  const bills = []
  if (!form.startDate || form.installments === 0) return bills
  const start = new Date(form.startDate)
  const amount = perPayment.value
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  let currentMonth = start.getMonth()
  let currentYear = start.getFullYear()
  const monthlyDay = form.monthlyDay || 1
  if (start.getDate() > monthlyDay) { currentMonth++; if (currentMonth > 11) { currentMonth = 0; currentYear++ } }
  for (let i = 0; i < form.installments; i++) {
    const billDate = new Date(currentYear, currentMonth + i, 1)
    const day = Math.min(monthlyDay, getDaysInMonth(billDate))
    billDate.setDate(day)
    bills.push({
      period: i + 1,
      date: `${billDate.getFullYear()}/${String(billDate.getMonth() + 1).padStart(2, '0')}/${String(billDate.getDate()).padStart(2, '0')}`,
      amount: i === form.installments - 1 ? (form.totalPrincipal + form.totalInterest) - amount * (form.installments - 1) : amount,
      paid: billDate <= today
    })
  }
  return bills
})

function getDaysInMonth(date) { return new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate() }

const bindTypeLabel = computed(() => {
  const map = { stock_total_assets: '股票总资产', gold_zheshang: '浙商积存金', gold_ccb: '建行积存金', gold_physical: '实物黄金' }
  return map[form.bindType] || ''
})

function calculateInstallment() {}

function formatNumber(val, decimals = 2) { return fmtNum(val, decimals) }

function addNewGroup() {
  if (newGroupName.value && !groupNames.value.includes(newGroupName.value)) {
    customGroups.value.push(newGroupName.value)
    form.groupName = newGroupName.value
    newGroupName.value = ''
  }
}

// --- 图标功能 ---
function triggerIconPicker() { iconInput.value?.click() }

async function handleIconUpload(e) {
  const file = e.target.files?.[0]
  if (!file) return
  const fd = new FormData()
  fd.append('icon', file)
  try {
    const res = await depositApi.uploadIcon(fd)
    form.icon = res.iconPath
    loadExistingIcons()
  } catch (err) { aiError.value = '上传失败'; setTimeout(() => aiError.value = '', 2000) }
  e.target.value = ''
}

async function loadExistingIcons() {
  try { existingIcons.value = await depositApi.getIcons() } catch (e) { /* ignore */ }
}

async function generateAiIcon() {
  if (aiGenerating.value) return
  aiGenerating.value = true
  aiError.value = ''
  try {
    const res = await depositApi.generateIcon({ title: form.name || '存款项' })
    if (res.iconUrl) {
      const saveRes = await depositApi.saveIcon({ title: form.name || '存款项', imageUrl: res.iconUrl })
      form.icon = saveRes.iconPath
      loadExistingIcons()
    }
  } catch (err) { aiError.value = err.response?.data?.error || 'AI生成失败'; setTimeout(() => aiError.value = '', 3000) }
  finally { aiGenerating.value = false }
}

onMounted(() => loadExistingIcons())

async function handleConfirm() {
  if (!form.name) { alert('请填写名称'); return }
  const data = {
    name: form.name, amount: form.amount, note: form.note, groupName: form.groupName,
    itemType: form.itemType, excludeTotal: form.excludeTotal, bindType: form.bindType,
    icon: form.icon
  }
  if (form.itemType === 'debt') { data.paymentAccountId = form.paymentAccountId; data.repaymentDay = form.repaymentDay; data.repaymentMode = form.repaymentMode }
  if (form.itemType === 'installment') { data.totalPrincipal = form.totalPrincipal; data.totalInterest = form.totalInterest; data.installments = form.installments; data.monthlyDay = form.monthlyDay; data.startDate = form.startDate; data.paymentAccountId = form.paymentAccountId }
  emit('confirm', data)
}
</script>
