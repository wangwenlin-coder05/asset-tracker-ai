import { ref, computed } from 'vue'
import { woolApi } from '../utils/api'
import { num, sumBy, sumByFilter } from '../utils/formatter'

const woolItems = ref([])
const loading = ref(false)
const currentMonth = ref(new Date())
const selectedDate = ref(new Date())

function normalizeItem(item) {
  return {
    ...item,
    amount: num(item.amount),
    recordType: item.recordType === 'spend' ? 'spend' : 'reward',
    category: item.category || '',
    merchant: item.merchant || '',
    paymentMethod: item.paymentMethod || '',
    depositItemId: item.depositItemId || '',
    depositTransactionId: item.depositTransactionId || '',
    images: Array.isArray(item.images) ? item.images : (item.image ? [item.image] : []),
    createdAt: Number(item.createdAt) || Number(item.created_at) || Date.now()
  }
}

export function useWool() {
  const rewardItems = computed(() => woolItems.value.filter(item => item.recordType !== 'spend'))
  const spendItems = computed(() => woolItems.value.filter(item => item.recordType === 'spend'))
  const totalReward = computed(() => sumByFilter(woolItems.value, item => item.recordType === 'reward', 'amount'))
  const totalSpend = computed(() => sumByFilter(woolItems.value, item => item.recordType === 'spend', 'amount'))
  const netAmount = computed(() => totalReward.value - totalSpend.value)
  const totalAmount = totalReward
  const totalCount = computed(() => woolItems.value.length)
  const monthItems = computed(() => {
    const year = currentMonth.value.getFullYear()
    const month = currentMonth.value.getMonth()
    return woolItems.value.filter(item => {
      const date = new Date(`${item.woolDate}T00:00:00`)
      return date.getFullYear() === year && date.getMonth() === month
    }).sort((a, b) => {
      const dateCompare = b.woolDate.localeCompare(a.woolDate)
      if (dateCompare !== 0) return dateCompare
      return Number(b.createdAt || 0) - Number(a.createdAt || 0)
    })
  })
  const monthReward = computed(() => sumByFilter(monthItems.value, item => item.recordType === 'reward', 'amount'))
  const monthSpend = computed(() => sumByFilter(monthItems.value, item => item.recordType === 'spend', 'amount'))
  const monthAmount = monthReward
  const monthNet = computed(() => monthReward.value - monthSpend.value)
  const monthCount = computed(() => monthItems.value.length)
  const dailyItems = computed(() => {
    const dateStr = formatDate(selectedDate.value)
    return woolItems.value.filter(item => item.woolDate === dateStr).slice().sort((a, b) => Number(b.createdAt || 0) - Number(a.createdAt || 0))
  })
  const dailyReward = computed(() => sumByFilter(dailyItems.value, item => item.recordType === 'reward', 'amount'))
  const dailySpend = computed(() => sumByFilter(dailyItems.value, item => item.recordType === 'spend', 'amount'))
  const dailyTotal = computed(() => dailyReward.value - dailySpend.value)

  async function loadWoolItems() {
    loading.value = true
    try {
      const data = await woolApi.getItems()
      woolItems.value = Array.isArray(data) ? data.map(normalizeItem) : []
    } catch (error) {
      console.error('Failed to load wool items:', error)
      throw error
    } finally {
      loading.value = false
    }
  }

  async function addWoolItem(data) {
    const item = normalizeItem(await woolApi.createItem(data))
    woolItems.value.unshift(item)
    return item
  }

  async function updateWoolItem(id, data) {
    const result = await woolApi.updateItem(id, data)
    const index = woolItems.value.findIndex(item => item.id === id)
    if (index !== -1) woolItems.value[index] = normalizeItem({ ...woolItems.value[index], ...data, ...result })
    woolItems.value.sort((a, b) => {
      const dateCompare = b.woolDate.localeCompare(a.woolDate)
      if (dateCompare !== 0) return dateCompare
      return Number(b.createdAt || 0) - Number(a.createdAt || 0)
    })
    return result
  }

  async function deleteWoolItem(id) {
    await woolApi.deleteItem(id)
    woolItems.value = woolItems.value.filter(item => item.id !== id)
  }

  async function uploadWoolImage(file) {
    const formData = new FormData()
    formData.append('image', file)
    return woolApi.uploadImage(formData)
  }

  async function recognizeWoolImage(imagePath) {
    return woolApi.recognizeImage(imagePath)
  }

  function changeMonth(delta) {
    const date = new Date(currentMonth.value)
    date.setDate(1)
    date.setMonth(date.getMonth() + delta)
    currentMonth.value = date
  }

  function jumpToDate(dateStr) {
    const value = typeof dateStr === 'string' ? dateStr : dateStr?.target?.value
    if (!value) return
    selectedDate.value = new Date(`${value}T00:00:00`)
    currentMonth.value = new Date(`${value}T00:00:00`)
  }

  async function saveQuickAmount(amount) {
    if (numberOf(amount) <= 0) return
    await addWoolItem({ woolDate: formatDate(selectedDate.value), name: '快速录入', amount: numberOf(amount), recordType: 'reward', category: '其他' })
  }

  function formatDate(date) {
    const year = date.getFullYear()
    const month = String(date.getMonth() + 1).padStart(2, '0')
    const day = String(date.getDate()).padStart(2, '0')
    return `${year}-${month}-${day}`
  }

  return {
    woolItems, rewardItems, spendItems, loading, currentMonth, selectedDate,
    totalReward, totalSpend, netAmount, totalAmount, monthItems, monthReward,
    monthSpend, monthAmount, monthNet, totalCount, monthCount, dailyItems,
    dailyReward, dailySpend, dailyTotal, loadWoolItems, addWoolItem,
    updateWoolItem, deleteWoolItem, uploadWoolImage, recognizeWoolImage, changeMonth, jumpToDate,
    saveQuickAmount, formatDate
  }
}
