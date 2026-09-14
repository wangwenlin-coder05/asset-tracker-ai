import axios from 'axios'

const api = axios.create({
  baseURL: '/api',
  timeout: 10000,
})

api.interceptors.response.use(
  response => response.data,
  error => {
    console.error('API Error:', error.response?.data || error)
    throw error
  }
)

export const stockApi = {
  getStocks: (board) => api.get('/stocks', { params: { board } }),
  getStock: (id) => api.get(`/stocks/${id}`),
  createStock: (data) => api.post('/stocks', data),
  updateStock: (id, data) => api.put(`/stocks/${id}`, data),
  deleteStock: (id) => api.delete(`/stocks/${id}`),
  clearStock: (id) => api.put(`/stocks/${id}/clear`),
  getBuyRecords: (stockId) => api.get(`/stocks/${stockId}/buy-records`),
  createBuyRecord: (stockId, data) => api.post(`/stocks/${stockId}/buy-record`, data),
  updateBuyRecord: (stockId, recordId, data) => api.put(`/stocks/${stockId}/buy-record/${recordId}`, data),
  deleteBuyRecord: (stockId, recordId) => api.delete(`/stocks/${stockId}/buy-record/${recordId}`),
  getSellRecords: (stockId) => api.get(`/stocks/${stockId}/sell-records`),
  createSellRecord: (stockId, data) => api.post(`/stocks/${stockId}/sell-record`, data),
  updateSellRecord: (stockId, recordId, data) => api.put(`/stocks/${stockId}/sell-record/${recordId}`, data),
  deleteSellRecord: (stockId, recordId) => api.delete(`/stocks/${stockId}/sell-record/${recordId}`),
  // 交易记录日志（持仓股数变动审计）
  createTxLog: (data) => api.post('/stocks/tx-log', data),
  getTxLogs: (params) => api.get('/stocks/tx-logs', { params }),
}

export const depositApi = {
  getDeposits: () => api.get('/deposits'),
  createDeposit: (data) => api.post('/deposits', data),
  updateDeposit: (id, data) => api.put(`/deposits/${id}`, data),
  deleteDeposit: (id) => api.delete(`/deposits/${id}`),
  moveDeposit: (id, data) => api.put(`/deposits/${id}/move`, data),
  uploadIcon: (formData) => api.post('/deposits/upload-icon', formData, { headers: { 'Content-Type': 'multipart/form-data' } }),
  getIcons: () => api.get('/deposits/icons'),
  generateIcon: (data) => api.post('/deposits/generate-icon', data),
  saveIcon: (data) => api.post('/deposits/save-icon', data),
  getTransactions: (id) => api.get(`/deposits/${id}/transactions`),
  addTransaction: (id, data) => api.post(`/deposits/${id}/transactions`, data),
  repay: (id, data) => api.post(`/deposits/${id}/repay`, data),
}

export const installmentApi = {
  getPlan: (depositItemId) => api.get(`/installments/${depositItemId}`),
  createPlan: (data) => api.post('/installments', data),
  updatePlan: (id, data) => api.put(`/installments/${id}`, data),
  deletePlan: (id) => api.delete(`/installments/${id}`),
  getBills: (planId) => api.get(`/installments/${planId}/bills`),
  payBill: (billId) => api.put(`/installments/bills/${billId}/pay`),
}

export const woolApi = {
  getItems: () => api.get('/wool'),
  createItem: (data) => api.post('/wool', data),
  updateItem: (id, data) => api.put(`/wool/${id}`, data),
  deleteItem: (id) => api.delete(`/wool/${id}`),
  uploadImage: (formData) => api.post('/wool/upload-image', formData, { headers: { 'Content-Type': 'multipart/form-data' } }),
  recognizeImage: (imagePath) => api.post('/wool/recognize', { imagePath }, { timeout: 70000 }),
  getCalendar: (month) => api.get('/wool/calendar', { params: { month } }),
  getDailyAmount: (date) => api.get(`/wool/daily/${date}`),
  setDailyAmount: (date, quickAmount) => api.put(`/wool/daily/${date}`, { quickAmount }),
}

export const noteApi = {
  getNotes: () => api.get('/stock/notes'),
  createNote: (data) => api.post('/stock/notes', data),
  updateNote: (id, data) => api.put(`/stock/notes/${id}`, data),
  deleteNote: (id) => api.delete(`/stock/notes/${id}`),
}

export const toolApi = {
  getTools: () => api.get('/tools'),
  getCategories: () => api.get('/tools/categories'),
  createTool: (data) => api.post('/tools', data),
  updateTool: (id, data) => api.put(`/tools/${id}`, data),
  deleteTool: (id) => api.delete(`/tools/${id}`),
  reorderTools: (order) => api.post('/tools/reorder', { order }),
}

export const planApi = {
  getPlans: () => api.get('/plans'),
  createPlan: (data) => api.post('/plans', data),
  updatePlan: (id, data) => api.put(`/plans/${id}`, data),
  deletePlan: (id) => api.delete(`/plans/${id}`),
  togglePlan: (id) => api.put(`/plans/${id}/toggle`),
}

export const aiSettingsApi = {
  getSettings: () => api.get('/ai/settings'),
  updateSettings: (data) => api.put('/ai/settings', data),
  testModel: (data) => api.post('/ai/test-model', data, { timeout: 30000 }),
  getUsage: () => api.get('/ai/usage'),
  getLogs: (params) => api.get('/ai/logs', { params }),
}

export const wechatApi = {
  getStatus: () => api.get('/wechat/status'),
  startMonitor: () => api.post('/wechat/monitor/start', {}, { timeout: 30000 }),
  stopMonitor: () => api.post('/wechat/monitor/stop'),
  extract: (data) => api.post('/wechat/extract', data, { timeout: 20000 }),
  extractImage: (formData) => api.post('/wechat/extract-image', formData, { timeout: 60000, headers: { 'Content-Type': 'multipart/form-data' } }),
  saveExtract: (data) => api.post('/wechat/extract/save', data, { timeout: 20000 }),

  deleteEvent: (id) => api.delete(`/wechat/events/${id}`),
  getEventStocksUsage: (id) => api.get(`/wechat/events/${id}/stocks-usage`),
  deleteEventWithOptions: (id, data) => api.post(`/wechat/events/${id}/delete`, data),
  clearEvents: (category) => api.delete('/wechat/events', { params: category ? { category } : {} }),
  // 更新单条消息分类（手动归类，立即学习规则）
  updateEventCategory: (id, data) => api.put(`/wechat/events/${id}/category`, data),
  updateEventText: (id, data) => api.put(`/wechat/events/${id}/text`, data),
  updateStockLogic: (id, data) => api.put(`/wechat/events/${id}/stock-logic`, data),
  bindStocks: (id, data) => api.put(`/wechat/events/${id}/stocks`, data),
  // 投资人追踪
  getTracking: (sender) => api.get('/wechat/tracking', { params: sender ? { sender } : {} }),
  getTrackingDaily: (id) => api.get(`/wechat/tracking/${id}/daily`),
  refreshTracking: (id) => api.post(`/wechat/tracking/${id}/refresh`),
  refreshAllTracking: () => api.post('/wechat/tracking/refresh-all', {}, { timeout: 120000 }),
  getInvestorAnalysis: (params) => {
    const query = {}
    if (typeof params === 'number') query.days = params
    else if (params) Object.assign(query, params)
    return api.get('/wechat/investor-analysis', { params: query })
  },
  deleteInvestor: (sender) => api.delete(`/wechat/investor/${encodeURIComponent(sender)}`),
  deleteTracking: (id) => api.delete(`/wechat/tracking/${encodeURIComponent(id)}`),
  lockTracking: (id, locked) => api.put(`/wechat/tracking/${encodeURIComponent(id)}/lock`, { locked }),
  addManualTracking: (data) => api.post('/wechat/tracking/manual', data),

  // 分类反馈
  submitCategoryFeedback: (data) => api.post('/wechat/category-feedback', data),

  // 训练数据
  getTrainingData: (params) => api.get('/wechat/training-data', { params }),

  // 分类规则管理
  getCategoryRules: (params) => api.get('/wechat/category-rules', { params }),
  updateSystemRule: (id, data) => api.put(`/wechat/category-rules/system/${id}`, data),
  deleteLearnedRule: (id) => api.delete(`/wechat/category-rules/learned/${id}`),
  addLearnedRule: (data) => api.post('/wechat/category-rules/learned', data),
  reclassifyEvents: () => api.post('/wechat/reclassify'),
  resetSystemRules: () => api.post('/wechat/category-rules/system/reset'),

  // 黑名单
  getBlacklist: () => api.get('/wechat/blacklist'),
  addBlacklist: (data) => api.post('/wechat/blacklist', data),
  deleteBlacklist: (id) => api.delete(`/wechat/blacklist/${id}`),
  updateBlacklist: (id, data) => api.put(`/wechat/blacklist/${id}`, data),

  // 投资人平均持仓天数
  getInvestorHoldDays: (sender, targetProfit, days) => api.get(`/wechat/investor/${encodeURIComponent(sender)}/hold-days`, {
    params: { targetProfit, days }
  }),
}

export const goldApi = {
  getPrice: () => api.get('/gold-price'),
}

export const aiWorkApi = {
  // 热点
  getHotPlatforms: () => api.get('/ai/hot/platforms'),
  getHotList: (platform = 'weibo') => api.get('/ai/hot', { params: { platform } }),
  getHotBatch: (platforms = 'weibo,zhihu,toutiao') => api.get('/ai/hot/batch', { params: { platforms } }),
  // 正文解析
  parseArticle: (url) => api.get('/ai/article-parse', { params: { url } }),
  // 文章库 CRUD
  listArticles: (params) => api.get('/ai/articles', { params }),
  getArticle: (id) => api.get(`/ai/articles/${id}`),
  createArticle: (data) => api.post('/ai/articles', data),
  updateArticle: (id, data) => api.put(`/ai/articles/${id}`, data),
  deleteArticle: (id) => api.delete(`/ai/articles/${id}`),
}

export default api
