import { reactive, computed } from 'vue'

const state = reactive({
  currentBoard: 'stock',
  stocks: [],
  clearedStocks: [],
  deposits: [],
  woolItems: [],
  goldItems: [],
  notes: [],
  plans: [],
  aiSettings: {},
  dailyNote: '',
  allTransactionsVisible: false,
  expandedCards: new Set(),
})

export function useAppStore() {
  const stockList = computed(() => state.stocks.filter(s => !s.isCleared))
  const clearedList = computed(() => state.stocks.filter(s => s.isCleared))
  const goldList = computed(() => state.goldItems)

  function switchBoard(board) {
    state.currentBoard = board
    if (board === 'gold') {
      document.body.classList.add('gold-mode')
    } else {
      document.body.classList.remove('gold-mode')
    }
  }

  function setStocks(data) {
    state.stocks = data
  }

  function setDeposits(data) {
    state.deposits = data
  }

  function setWoolItems(data) {
    state.woolItems = data
  }

  function setGoldItems(data) {
    state.goldItems = data
  }

  function setNotes(data) {
    state.notes = data
  }

  function setPlans(data) {
    state.plans = data
  }

  function setAiSettings(data) {
    state.aiSettings = data
  }

  function setDailyNote(note) {
    state.dailyNote = note
  }

  function toggleAllTransactions() {
    state.allTransactionsVisible = !state.allTransactionsVisible
  }

  function toggleCardExpanded(cardId) {
    if (state.expandedCards.has(cardId)) {
      state.expandedCards.delete(cardId)
    } else {
      state.expandedCards.add(cardId)
    }
  }

  function isCardExpanded(cardId) {
    return state.expandedCards.has(cardId)
  }

  return {
    state,
    stockList,
    clearedList,
    goldList,
    switchBoard,
    setStocks,
    setDeposits,
    setWoolItems,
    setGoldItems,
    setNotes,
    setPlans,
    setAiSettings,
    setDailyNote,
    toggleAllTransactions,
    toggleCardExpanded,
    isCardExpanded,
  }
}

export default state
