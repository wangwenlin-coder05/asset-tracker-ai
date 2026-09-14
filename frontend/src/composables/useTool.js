import { ref, computed } from 'vue'
import { toolApi } from '../utils/api'

const tools = ref([])
const loading = ref(false)

const categories = computed(() => {
  const set = new Set()
  tools.value.forEach(t => {
    if (t.category) set.add(t.category)
  })
  return [...set].sort()
})

export function useTool() {
  async function loadTools() {
    loading.value = true
    try {
      const data = await toolApi.getTools()
      tools.value = data
    } catch (error) {
      console.error('Failed to load tools:', error)
    } finally {
      loading.value = false
    }
  }

  async function loadCategories() {
    // 分类已从 tools 自动计算，无需额外请求
  }

  async function addTool(data) {
    try {
      const item = await toolApi.createTool(data)
      tools.value.push(item)
      return item
    } catch (error) {
      console.error('Failed to add tool:', error)
      throw error
    }
  }

  async function updateTool(id, data) {
    try {
      await toolApi.updateTool(id, data)
      const index = tools.value.findIndex(item => item.id === id)
      if (index !== -1) {
        tools.value[index] = { ...tools.value[index], ...data }
      }
    } catch (error) {
      console.error('Failed to update tool:', error)
      throw error
    }
  }

  async function deleteTool(id) {
    try {
      await toolApi.deleteTool(id)
      tools.value = tools.value.filter(item => item.id !== id)
    } catch (error) {
      console.error('Failed to delete tool:', error)
      throw error
    }
  }

  async function reorderTools(order) {
    try {
      await toolApi.reorderTools(order)
    } catch (error) {
      console.error('Failed to reorder tools:', error)
      throw error
    }
  }

  return {
    tools,
    categories,
    loading,
    loadTools,
    loadCategories,
    addTool,
    updateTool,
    deleteTool,
    reorderTools
  }
}
