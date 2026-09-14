import { ref, computed, watch } from 'vue'
import { depositApi } from '../utils/api'
import { num, sumByFilter } from '../utils/formatter'
import { useStock } from './useStock'
import { useGold } from './useGold'

const deposits = ref([])
const loading = ref(false)
let bindSyncInitialized = false

function setupBindSync() {
  if (bindSyncInitialized) return
  bindSyncInitialized = true

  const { stockTotalAssets } = useStock()
  const { zheshangMarketValue, ccbMarketValue, physicalMarketValue } = useGold()

  const bindValueMap = {
    stock_total_assets: stockTotalAssets,
    gold_zheshang: zheshangMarketValue,
    gold_ccb: ccbMarketValue,
    gold_physical: physicalMarketValue
  }

  async function syncBindValues() {
    const bindItems = deposits.value.filter(d => d.bindType)
    for (const item of bindItems) {
      let newValue = null
      if (item.bindType.startsWith('deposit:')) {
        const targetId = item.bindType.substring(8)
        const target = deposits.value.find(d => d.id === targetId)
        if (target) newValue = target.amount
      } else {
        const valueComputed = bindValueMap[item.bindType]
        if (valueComputed) newValue = valueComputed.value
      }
      if (newValue !== null && Math.abs(newValue - (item.amount || 0)) > 0.01) {
        const idx = deposits.value.findIndex(d => d.id === item.id)
        if (idx !== -1) {
          deposits.value[idx] = { ...deposits.value[idx], amount: newValue }
        }
        try {
          await depositApi.updateDeposit(item.id, { amount: newValue })
        } catch (e) {
          console.error('Failed to sync bind value:', e)
        }
      }
    }
  }

  watch([stockTotalAssets, zheshangMarketValue, ccbMarketValue, physicalMarketValue], async () => {
    await syncBindValues()
  }, { deep: true })
}

export function useDeposit() {
  setupBindSync()

  const excludedGroupName = '\u4e0d\u8ba1\u5165\u5b58\u6b3e\u603b\u989d'
  const groupedDeposits = computed(() => {
    const groups = { [excludedGroupName]: [] }
    deposits.value.forEach(deposit => {
      const groupName = deposit.excludeTotal ? excludedGroupName : (deposit.groupName || '\u9ed8\u8ba4\u5206\u7ec4')
      if (!groups[groupName]) groups[groupName] = []
      groups[groupName].push(deposit)
    })
    Object.values(groups).forEach(items => items.sort((a, b) => num(a.sortOrder) - num(b.sortOrder)))
    return groups
  })

  const totalAmount = computed(() => sumByFilter(deposits.value, item => !item.excludeTotal, 'amount'))

  async function loadDeposits() {
    loading.value = true
    try {
      const data = await depositApi.getDeposits()
      deposits.value = data
    } catch (error) {
      console.error('Failed to load deposits:', error)
    } finally {
      loading.value = false
    }
  }

  async function addDeposit(data) {
    try {
      const item = await depositApi.createDeposit(data)
      const created = { ...data, ...item }
      deposits.value.push(created)
      return created
    } catch (error) {
      console.error('Failed to add deposit:', error)
      throw error
    }
  }

  async function updateDeposit(id, data) {
    try {
      await depositApi.updateDeposit(id, data)
      const index = deposits.value.findIndex(item => item.id === id)
      if (index !== -1) {
        deposits.value[index] = { ...deposits.value[index], ...data }
      }
    } catch (error) {
      console.error('Failed to update deposit:', error)
      throw error
    }
  }

  async function deleteDeposit(id) {
    try {
      await depositApi.deleteDeposit(id)
      deposits.value = deposits.value.filter(item => item.id !== id)
    } catch (error) {
      console.error('Failed to delete deposit:', error)
      throw error
    }
  }

  function getDeposit(id) {
    return deposits.value.find(item => item.id === id)
  }

  return {
    deposits,
    loading,
    groupedDeposits,
    totalAmount,
    loadDeposits,
    addDeposit,
    updateDeposit,
    deleteDeposit,
    getDeposit,
    moveDeposit: depositApi.moveDeposit
  }
}
