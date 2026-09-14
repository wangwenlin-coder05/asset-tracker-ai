<template>
  <div>
    <div id="depositPanel" class="mb-4 px-5">
      <div class="flex items-center justify-between mb-3">
        <h3 class="text-sm font-semibold text-slate-600 flex items-center gap-2">
          <Wallet class="w-4 h-4" />
          存款分组
        </h3>
        <button @click="openAddGroupDialog" class="px-3 py-1.5 text-xs border border-emerald-300 text-emerald-600 rounded-lg hover:bg-emerald-50 transition-all flex items-center gap-1">
          <Plus class="w-3 h-3" />
          新增分组
        </button>
      </div>
      <div id="depositGroups" class="grid grid-cols-5 gap-3">
        <div
          v-for="groupName in orderedGroupNames"
          :key="groupName"
          :class="['bg-white rounded-xl p-4 card-shadow deposit-group', { 'deposit-excluded-group': groupName === excludedGroupName, 'deposit-group-preview-before': groupPreview.name === groupName && groupPreview.position === 'before', 'deposit-group-preview-after': groupPreview.name === groupName && groupPreview.position === 'after', 'deposit-item-group-target': itemPreview.groupName === groupName && !itemPreview.itemId }]"
          @dragover.prevent="onGroupDragOver($event, groupName)"
          @drop="onDrop($event, groupName)"
        >
          <div class="flex items-center justify-between mb-3 cursor-grab" :draggable="groupName !== excludedGroupName" @dragstart="onGroupDragStart($event, groupName)" @dragend="onDragEnd">
            <div class="flex items-center gap-2">
              <h4 class="font-bold text-slate-700">{{ groupName }}</h4>
              <span class="text-xs text-slate-400 font-medium">{{ formatNumber(groupTotalAmount(groupName)) }}</span>
            </div>
            <button @click="openAddDepositDialog(groupName)" class="text-neutral hover:text-emerald-500 transition-all">
              <PlusCircle class="w-4 h-4" />
            </button>
          </div>
          <div class="space-y-2 min-h-[40px]">
            <DepositItem
              v-for="item in groupedDeposits[groupName]"
              :key="item.id"
              :deposit-item="item"
              :group-name="groupName"
              :all-deposits="deposits"
              :draggable="!draggedGroup"
              :class="getItemDropClasses(item, groupName)"
              @dragstart="onDragStart($event, item)"
              @dragend="onDragEnd"
              @dragover.prevent.stop="onItemDragOver($event, item, groupName)"
              @drop.stop="onDropItem($event, item, groupName)"
              @edit="openEditDepositDialog"
              @delete="handleDeleteDeposit"
              @update="handleUpdateDeposit"
              @repay="handleRepaySuccess"
              @float-panel="handleFloatPanel"
            />
          </div>
        </div>
      </div>
    </div>
    <DepositItemDialog
      v-if="showDepositDialog"
      :group-name="currentGroupName"
      :deposit-item="currentDeposit"
      :all-deposits="deposits"
      @close="showDepositDialog = false"
      @confirm="handleAddDeposit"
    />
    <DepositFloatPanel
      :visible="floatPanelVisible"
      :title="floatPanelTitle"
      :type="floatPanelType"
      :bills="floatPanelBills"
      :transactions="floatPanelTransactions"
      :trigger-rect="floatPanelTriggerRect"
      @close="closeFloatPanel"
    />
  </div>
</template>

<script setup>
import { ref, computed } from 'vue'
import { Wallet, Plus, PlusCircle } from 'lucide-vue-next'
import DepositItem from './DepositItem.vue'
import DepositItemDialog from './dialogs/DepositItemDialog.vue'
import DepositFloatPanel from './DepositFloatPanel.vue'
import { useDeposit } from '../composables/useDeposit'
import { useStock } from '../composables/useStock'
import { useGold } from '../composables/useGold'
import { depositApi, installmentApi } from '../utils/api'
import { fmtNum, sumByFilter } from '../utils/formatter'

const { deposits, groupedDeposits, loadDeposits, addDeposit, updateDeposit, deleteDeposit, getDeposit } = useDeposit()
const { stocks, holdingAmount, totalProfit, loadStocks, fetchStockPrices } = useStock()
const { loadGoldItems, fetchGoldPrice } = useGold()
const showDepositDialog = ref(false)
const currentGroupName = ref('\u9ed8\u8ba4\u5206\u7ec4')
const currentDeposit = ref(null)
const excludedGroupName = '\u4e0d\u8ba1\u5165\u5b58\u6b3e\u603b\u989d'
const floatPanelVisible = ref(false)
const floatPanelTitle = ref('')
const floatPanelType = ref('')
const floatPanelBills = ref([])
const floatPanelTransactions = ref([])
const floatPanelTriggerRect = ref(null)
const GROUP_ORDER_KEY = 'deposit-group-order'
const groupOrder = ref(JSON.parse(localStorage.getItem(GROUP_ORDER_KEY) || '[]'))
const draggedItem = ref(null)
const draggedGroup = ref(null)
const groupPreview = ref({ name: null, position: 'before' })
const itemPreview = ref({ groupName: null, itemId: null, position: 'after' })
const orderedGroupNames = computed(() => Object.keys(groupedDeposits.value).sort((a, b) => {
  if (a === excludedGroupName) return 1
  if (b === excludedGroupName) return -1
  const ai = groupOrder.value.indexOf(a), bi = groupOrder.value.indexOf(b)
  return (ai < 0 ? 9999 : ai) - (bi < 0 ? 9999 : bi)
}))

function groupTotalAmount(groupName) {
  const items = groupedDeposits.value[groupName] || []
  return sumByFilter(items, item => groupName !== excludedGroupName && !item.excludeTotal, 'amount')
}

function formatNumber(val) { return fmtNum(val) }

async function init() {
  await Promise.all([loadDeposits(), loadStocks(), loadGoldItems()])
  await fetchGoldPrice()
  const codes = stocks.value.filter(s => !s.isCleared && s.code).map(s => s.code)
  if (codes.length) await fetchStockPrices(codes, true)
}
init()
function persistGroups() { localStorage.setItem(GROUP_ORDER_KEY, JSON.stringify(groupOrder.value)) }
function openAddGroupDialog() {
  const groupName = prompt('\u8bf7\u8f93\u5165\u65b0\u5206\u7ec4\u540d\u79f0', '\u65b0\u5206\u7ec4')
  if (groupName) { if (!groupOrder.value.includes(groupName)) groupOrder.value.push(groupName); persistGroups(); addDeposit({ groupName, name: '\u65b0\u5b58\u6b3e\u9879', amount: 0 }) }
}
function openAddDepositDialog(groupName) { currentGroupName.value = groupName; currentDeposit.value = null; showDepositDialog.value = true }
async function openEditDepositDialog(id) {
  closeFloatPanel()
  let deposit = getDeposit(id)
  if (!deposit) return
  // 分期项：若缺少 planId 或关键字段，从后端补拉分期计划确保回填完整
  if (deposit.itemType === 'installment' && (!deposit.planId || !deposit.startDate)) {
    try {
      const plan = await installmentApi.getPlan(id)
      if (plan && plan.id) {
        deposit = {
          ...deposit,
          planId: plan.id,
          totalPrincipal: parseFloat(plan.total_principal) || 0,
          totalInterest: parseFloat(plan.total_interest) || 0,
          installments: plan.installments || 12,
          monthlyDay: plan.monthly_day || 1,
          startDate: plan.start_date || '',
          paymentAccountId: plan.payment_account_id || ''
        }
      }
    } catch (e) {
      console.error('[Deposit] 加载分期计划失败:', e)
    }
  }
  currentDeposit.value = deposit
  currentGroupName.value = deposit.groupName || '默认分组'
  showDepositDialog.value = true
}
async function handleAddDeposit(data) {
  const baseData = { ...data, excludeTotal: currentGroupName.value === excludedGroupName }
  try {
    if (data.itemType === 'installment') {
      if (currentDeposit.value) {
        await updateDeposit(currentDeposit.value.id, baseData)
        let planId = currentDeposit.value.planId
        if (!planId) {
          try {
            const existingPlan = await installmentApi.getPlan(currentDeposit.value.id)
            if (existingPlan && existingPlan.id) planId = existingPlan.id
          } catch (e) { /* 无已有计划 */ }
        }
        if (planId) {
          await installmentApi.updatePlan(planId, data)
        } else {
          await installmentApi.createPlan({ depositItemId: currentDeposit.value.id, ...data })
        }
      } else {
        const created = await addDeposit({ ...baseData, groupName: currentGroupName.value })
        await installmentApi.createPlan({ depositItemId: created.id, ...data })
      }
    } else {
      if (currentDeposit.value) {
        await updateDeposit(currentDeposit.value.id, baseData)
        let planId = currentDeposit.value.planId
        if (!planId) {
          try {
            const existingPlan = await installmentApi.getPlan(currentDeposit.value.id)
            if (existingPlan && existingPlan.id) planId = existingPlan.id
          } catch (e) { /* 无已有计划 */ }
        }
        if (planId) {
          await installmentApi.deletePlan(planId)
        }
      } else {
        await addDeposit({ ...baseData, groupName: currentGroupName.value })
      }
    }
    showDepositDialog.value = false
  } catch (err) {
    console.error('[Deposit] 提交失败:', err)
    alert('提交失败：' + (err?.response?.data?.error || err.message || '未知错误'))
  }
}
async function handleUpdateDeposit(id, data) { await updateDeposit(id, data) }
async function handleRepaySuccess() {
  // 还款后无需全量刷新，useDeposit 已经是局部更新
}
async function handleDeleteDeposit(id) { if (confirm('\u786e\u5b9a\u5220\u9664\u8be5\u5b58\u6b3e\u9879\uff1f')) await deleteDeposit(id) }
function resetDragPreview() { groupPreview.value = { name: null, position: 'before' }; itemPreview.value = { groupName: null, itemId: null, position: 'after' } }
function onDragStart(event, item) { draggedItem.value = item; draggedGroup.value = null; resetDragPreview(); event.dataTransfer.effectAllowed = 'move' }
function onGroupDragStart(event, name) { if (name === excludedGroupName) return; draggedGroup.value = name; draggedItem.value = null; resetDragPreview(); event.dataTransfer.effectAllowed = 'move' }
function onDragEnd() { draggedItem.value = null; draggedGroup.value = null; resetDragPreview() }
function pointerPosition(event) {
  const rect = event.currentTarget.getBoundingClientRect()
  const verticalDistance = Math.abs(event.clientY - (rect.top + rect.height / 2))
  const horizontalDistance = Math.abs(event.clientX - (rect.left + rect.width / 2))
  return verticalDistance > horizontalDistance ? (event.clientY < rect.top + rect.height / 2 ? 'before' : 'after') : (event.clientX < rect.left + rect.width / 2 ? 'before' : 'after')
}
function getItemDropClasses(item, groupName) {
  const preview = itemPreview.value
  if (!draggedItem.value || preview.groupName !== groupName || !preview.itemId) return {}

  const items = (groupedDeposits.value[groupName] || []).filter(entry => entry.id !== draggedItem.value.id)
  const targetIndex = items.findIndex(entry => entry.id === preview.itemId)
  if (targetIndex < 0) return {}

  const upperId = preview.position === 'before' ? items[targetIndex - 1]?.id : items[targetIndex]?.id
  const lowerId = preview.position === 'before' ? items[targetIndex]?.id : items[targetIndex + 1]?.id
  return {
    'deposit-drop-edge-bottom': item.id === upperId,
    'deposit-drop-edge-top': item.id === lowerId
  }
}
function onGroupDragOver(event, groupName) {
  event.dataTransfer.dropEffect = 'move'
  if (draggedGroup.value && groupName !== excludedGroupName && groupName !== draggedGroup.value) {
    groupPreview.value = { name: groupName, position: pointerPosition(event) }
    itemPreview.value = { groupName: null, itemId: null, position: 'after' }
  } else if (draggedItem.value && event.target === event.currentTarget) {
    itemPreview.value = { groupName, itemId: null, position: 'after' }
  }
}
function onItemDragOver(event, item, groupName) {
  if (draggedGroup.value) {
    if (groupName !== excludedGroupName && groupName !== draggedGroup.value) {
      const groupEl = event.currentTarget.closest('.deposit-group')
      if (groupEl) {
        const rect = groupEl.getBoundingClientRect()
        const verticalDistance = Math.abs(event.clientY - (rect.top + rect.height / 2))
        const horizontalDistance = Math.abs(event.clientX - (rect.left + rect.width / 2))
        const pos = verticalDistance > horizontalDistance ? (event.clientY < rect.top + rect.height / 2 ? 'before' : 'after') : (event.clientX < rect.left + rect.width / 2 ? 'before' : 'after')
        groupPreview.value = { name: groupName, position: pos }
      } else {
        groupPreview.value = { name: groupName, position: pointerPosition(event) }
      }
      itemPreview.value = { groupName: null, itemId: null, position: 'after' }
    }
    return
  }
  if (!draggedItem.value || draggedItem.value.id === item.id) return
  const rect = event.currentTarget.getBoundingClientRect()
  itemPreview.value = { groupName, itemId: item.id, position: event.clientY < rect.top + rect.height / 2 ? 'before' : 'after' }
}
async function onDrop(event, targetGroupName) {
  if (draggedGroup.value && groupPreview.value.name) reorderGroup()
  else if (draggedItem.value) await moveItem(draggedItem.value, targetGroupName, null, 'after')
  onDragEnd()
}
function reorderGroup() {
  const target = groupPreview.value.name
  if (!target || !draggedGroup.value) return
  const groups = orderedGroupNames.value.filter(name => name !== excludedGroupName && name !== draggedGroup.value)
  let index = groups.indexOf(target)
  if (groupPreview.value.position === 'after') index += 1
  groups.splice(Math.max(0, index), 0, draggedGroup.value)
  groupOrder.value = groups
  persistGroups()
}
async function onDropItem(event, targetItem, targetGroupName) {
  if (draggedGroup.value && groupPreview.value.name) { reorderGroup(); onDragEnd(); return }
  if (draggedItem.value) await moveItem(draggedItem.value, targetGroupName, targetItem, itemPreview.value.position)
  onDragEnd()
}
async function moveItem(item, targetGroupName, targetItem, position = 'before') {
  const items = (groupedDeposits.value[targetGroupName] || []).filter(entry => entry.id !== item.id)
  let index = targetItem ? items.findIndex(entry => entry.id === targetItem.id) : items.length
  if (index < 0) index = items.length
  if (targetItem && position === 'after') index += 1
  items.splice(index, 0, item)
  await Promise.all(items.map((entry, order) => updateDeposit(entry.id, { groupName: targetGroupName === excludedGroupName ? entry.groupName : targetGroupName, excludeTotal: targetGroupName === excludedGroupName, sortOrder: order })))
}

let currentFloatPanelItemId = null

function handleFloatPanel(data) {
  if (data.visible && floatPanelVisible.value && currentFloatPanelItemId === data.itemId) {
    closeFloatPanel()
    return
  }

  floatPanelVisible.value = data.visible
  currentFloatPanelItemId = data.itemId
  if (data.visible) {
    floatPanelTitle.value = data.title
    floatPanelType.value = data.type
    floatPanelTriggerRect.value = data.triggerRect
    floatPanelTransactions.value = []
    floatPanelBills.value = []
    if (data.type === 'installment') {
      loadFloatPanelInstallmentBills(data.itemId)
    } else {
      loadFloatPanelTransactions(data.itemId)
    }
  }
}

function closeFloatPanel() {
  floatPanelVisible.value = false
  currentFloatPanelItemId = null
}

async function loadFloatPanelTransactions(itemId) {
  try {
    floatPanelTransactions.value = await depositApi.getTransactions(itemId)
  } catch (error) {
    console.error('Failed to load transactions:', error)
  }
}

async function loadFloatPanelInstallmentBills(itemId) {
  try {
    const plan = await installmentApi.getPlan(itemId)
    if (plan && plan.id) {
      floatPanelBills.value = await installmentApi.getBills(plan.id)
    }
  } catch (error) {
    console.error('Failed to load installment bills:', error)
  }
}

defineExpose({ loadDeposits })
</script>
