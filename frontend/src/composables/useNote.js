import { ref, computed } from 'vue'
import { noteApi } from '../utils/api'

const notes = ref([])
const loading = ref(false)

export function useNote() {
  async function loadNotes() {
    loading.value = true
    try {
      const data = await noteApi.getNotes()
      notes.value = data
    } catch (error) {
      console.error('Failed to load notes:', error)
    } finally {
      loading.value = false
    }
  }

  async function addNote(data) {
    try {
      const item = await noteApi.createNote(data)
      notes.value.push(item)
      return item
    } catch (error) {
      console.error('Failed to add note:', error)
      throw error
    }
  }

  async function updateNote(id, data) {
    try {
      await noteApi.updateNote(id, data)
      const index = notes.value.findIndex(item => item.id === id)
      if (index !== -1) {
        notes.value[index] = { ...notes.value[index], ...data }
      }
    } catch (error) {
      console.error('Failed to update note:', error)
      throw error
    }
  }

  async function deleteNote(id) {
    try {
      await noteApi.deleteNote(id)
      notes.value = notes.value.filter(item => item.id !== id)
    } catch (error) {
      console.error('Failed to delete note:', error)
      throw error
    }
  }

  return {
    notes,
    loading,
    loadNotes,
    addNote,
    updateNote,
    deleteNote
  }
}
