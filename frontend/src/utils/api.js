import axios from 'axios'
import { auth } from '../auth'

const api = axios.create({
  baseURL: '/api',
  timeout: 10000,
})

api.interceptors.request.use(config => {
  config.headers['X-CSRF-Token'] = auth.csrfToken
  config.withCredentials = true
  return config
})

// 跨标签页数据同步：任一标签页发生写操作（非 GET）后，广播通知其他标签页刷新。
// 同一 BroadcastChannel 实例不会收到自己发出的消息，因此当前写入的标签页不会自触发。
export const syncChannel = typeof BroadcastChannel !== 'undefined' ? new BroadcastChannel('stock-sync') : null

function broadcastDataChange(config) {
  const method = (config?.method || 'get').toLowerCase()
  if (method === 'get') return
  const at = Date.now()
  try {
    if (syncChannel) syncChannel.postMessage({ type: 'data-changed', at })
    else localStorage.setItem('stock-sync-tick', String(at))
  } catch (e) { /* 忽略 */ }
}

api.interceptors.response.use(
  response => {
    broadcastDataChange(response.config)
    return response.data
  },
  error => {
    if (error.response?.status === 401 && auth.user) window.location.reload()
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

export const dailyTaskApi = {
  list: (date) => api.get('/daily-tasks', { params: { date } }),
  create: (task) => api.post('/daily-tasks', task),
  update: (id, task) => api.put(`/daily-tasks/${id}`, task),
  state: (id, date, status) => api.put(`/daily-tasks/${id}/state`, { date, status }),
  remove: (id) => api.delete(`/daily-tasks/${id}`),
}

export const researchApi = {
  charts: (code) => api.get('/ai/charts', { params: { code }, timeout: 65000 }),
  news: (code) => api.get(`/stock/news/${encodeURIComponent(code)}`, { timeout: 65000 }),
  sentiment: (code) => api.get(`/stock/sentiment/${encodeURIComponent(code)}`, { timeout: 65000 }),
}

export const planApi = {
  getPlans: () => api.get('/plans'),
  createPlan: (data) => api.post('/plans', data),
  updatePlan: (id, data) => api.put(`/plans/${id}`, data),
  deletePlan: (id) => api.delete(`/plans/${id}`),
  getCompletions: (date) => api.get(`/plans/completions/${date}`),
  togglePlan: (id, date) => api.post(`/plans/${id}/toggle`, { date }),
}

export const lifeApi = {
  getPlan: () => api.get('/life/plan'),
  getChat: () => api.get('/life/chat'),
  // 规划对话里包含联网检索 + 推演，动辄一两分钟；原本 90s 比后端还短，会在生成中途被掐断
  send: (message, mode = 'auto') => api.post('/life/chat', { message, mode }, { timeout: 300000 }),
  // 流式对话：逐条接收「阶段进度 / 模型思考 / 检索关键词与资料」事件（NDJSON）
  // mode 传 auto 或不传，由后端按对话上下文自动决定输出详略
  sendStream: async (message, onEvent, mode = 'auto') => {
    const response = await fetch('/api/life/chat/stream', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': auth.csrfToken },
      body: JSON.stringify({ message, mode })
    })
    if (!response.ok) {
      const data = await response.json().catch(() => ({}))
      throw new Error(data.error || `请求失败 (${response.status})`)
    }
    const reader = response.body.getReader()
    const decoder = new TextDecoder()
    let buffer = ''
    let finalEvent = null
    while (true) {
      const { value, done } = await reader.read()
      if (done) break
      buffer += decoder.decode(value, { stream: true })
      let index
      while ((index = buffer.indexOf('\n')) >= 0) {
        const line = buffer.slice(0, index).trim()
        buffer = buffer.slice(index + 1)
        if (!line) continue
        let event
        try { event = JSON.parse(line) } catch (_) { continue }
        if (event.type === 'error') throw new Error(event.error || 'AI 暂时不可用')
        if (event.type === 'done') finalEvent = event
        onEvent(event)
      }
    }
    if (!finalEvent) throw new Error('AI 没有返回内容')
    broadcastDataChange({ method: 'post' })
    return finalEvent
  },
  extract: () => api.post('/life/plan/extract', {}, { timeout: 200000 }),
  // 后端单次模型调用超时就是 180s，输出被截断时还会补一次「精简重出」，
  // 前端超时必须比后端宽（原来 90s 比后端还短，规划还在生成就被前端掐断 → "aborted due to timeout"）
  regenerate: () => api.post('/life/plan/regenerate', {}, { timeout: 400000 }),
  createNode: (data) => api.post('/life/plan/nodes', data),
  updateNode: (id, data) => api.put(`/life/plan/nodes/${id}`, data),
  deleteNode: (id) => api.delete(`/life/plan/nodes/${id}`),
  clearPlan: () => api.delete('/life/plan'),
  clearChat: () => api.delete('/life/chat'),
  // 彻底重置人生规划模块（含对话、人物画像、路径库、技能/知识/事件、快照与检索记录）
  clearAllLifeData: () => api.delete('/life/data'),

  // 重点提醒区
  getAlerts: () => api.get('/life/alerts'),

  // 资料检索审批：待检索队列 / 手动归集 / 批次审批 / 账单
  // 单次提问最多 3 次联网检索，超出上限的检索需求会写进待检索队列，在这里归集成批并人工审批
  getRetrievalQueue: () => api.get('/life/retrieval/queue'),
  collectRetrieval: () => api.post('/life/retrieval/collect', {}),
  getRetrievalBatches: () => api.get('/life/retrieval/batches'),
  decideRetrievalBatch: (id, mode, ids = []) => api.post(`/life/retrieval/batches/${id}/decide`, { mode, ids }),
  getRetrievalBill: () => api.get('/life/retrieval/bill'),

  // 模块2 每日细分任务表
  getTasks: (params = {}) => api.get('/life/tasks', { params }),
  createTask: (data) => api.post('/life/tasks', data),
  updateTask: (id, data) => api.put(`/life/tasks/${id}`, data),
  setTaskState: (id, status) => api.post(`/life/tasks/${id}/state`, { status }),
  deleteTask: (id) => api.delete(`/life/tasks/${id}`),

  // 全局人物画像（用户模型）：6 大维度 + 未来可选发展路径库
  getPersona: () => api.get('/life/persona'),
  savePersona: (data) => api.put('/life/persona', data),
  // 动态人物画像：按右侧规划节点的完成度实时推导（状态/能力/习惯/性格/资源/未来可做之事）
  refreshPersonaDerived: (reason = '面板刷新') => api.post('/life/persona/derived/refresh', { reason }, { timeout: 200000 }),
  getPaths: () => api.get('/life/paths'),
  createPath: (data) => api.post('/life/paths', data),
  updatePath: (id, data) => api.put(`/life/paths/${id}`, data),
  deletePath: (id) => api.delete(`/life/paths/${id}`),

  // 模块15 任务进度快照
  getSnapshots: () => api.get('/life/snapshots'),

  // 资料检索审批（付费管控：待检索队列 / 批次归集 / 三种审批 / 账单）
  getRetrievalQueue: () => api.get('/life/retrieval/queue'),
  collectRetrieval: () => api.post('/life/retrieval/collect', {}, { timeout: 30000 }),
  getRetrievalBatches: () => api.get('/life/retrieval/batches'),
  decideRetrieval: (id, mode, ids = []) => api.post(`/life/retrieval/batches/${id}/decide`, { mode, ids }, { timeout: 180000 }),
  getRetrievalBill: () => api.get('/life/retrieval/bill'),
  createSnapshot: (reason = '') => api.post('/life/snapshots', { reason }),
  getSnapshot: (id) => api.get(`/life/snapshots/${id}`),
  // 回退到该快照存档的规划版本（还原规划节点）
  restoreSnapshot: (id) => api.post(`/life/snapshots/${id}/restore`),

  // 模块16 精力负荷评估表
  getEnergy: () => api.get('/life/energy'),
  createEnergy: (data) => api.post('/life/energy', data),

  // 模块3 个人技能档案表
  getSkills: () => api.get('/life/skills'),
  createSkill: (data) => api.post('/life/skills', data),
  updateSkill: (id, data) => api.put(`/life/skills/${id}`, data),
  deleteSkill: (id) => api.delete(`/life/skills/${id}`),

  // 模块18 个人学习知识库
  getKnowledge: () => api.get('/life/knowledge'),
  createKnowledge: (data) => api.post('/life/knowledge', data),
  updateKnowledge: (id, data) => api.put(`/life/knowledge/${id}`, data),
  deleteKnowledge: (id) => api.delete(`/life/knowledge/${id}`),
  reviewKnowledge: (id) => api.post(`/life/knowledge/${id}/review`),

  // 模块19 外部事件日历
  getEvents: () => api.get('/life/events'),
  createEvent: (data) => api.post('/life/events', data),
  updateEvent: (id, data) => api.put(`/life/events/${id}`, data),
  deleteEvent: (id) => api.delete(`/life/events/${id}`),

  // 模块17 变更日志
  getChanges: () => api.get('/life/changes'),
}

export const aiSettingsApi = {
  getSettings: () => api.get('/ai/settings'),
  updateSettings: (data) => api.put('/ai/settings', data),
  // 按配置的 Base URL + 认证方式从厂商接口拉取模型清单
  fetchModels: (data) => api.post('/ai/models/fetch', data, { timeout: 40000 }),
  // 一次性获取所有已配置厂商的模型清单（内置 + 自定义，按厂商分组）
  fetchAllModels: () => api.post('/ai/models/fetch-all', {}, { timeout: 90000 }),
  testModel: (data) => api.post('/ai/test-model', data, { timeout: 30000 }),
  parseModelDoc: (data) => api.post('/ai/parse-model-doc', data, { timeout: 60000 }),
  getUsage: () => api.get('/ai/usage'),
  getLogs: (params) => api.get('/ai/logs', { params }),
}

// 联网检索降级链：设置面板读取可排序的搜索引擎清单
export const searchApi = {
  sources: () => api.get('/search/sources'),
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

  // 记忆式学习：带反馈的识别（extract_learn）
  getExtractLearn: (q) => api.get('/extract/learn', { params: { q } }),
  submitExtractLearn: (data) => api.post('/extract/learn', data),

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

export const quizApi = {
  getQuestions: () => api.get('/quiz'),
  createQuestion: (data) => api.post('/quiz', data),
  updateQuestion: (id, data) => api.put(`/quiz/${id}`, data),
  deleteQuestion: (id) => api.delete(`/quiz/${id}`),
  uploadImage: (formData) => api.post('/quiz/upload-image', formData, { timeout: 60000, headers: { 'Content-Type': 'multipart/form-data' } }),
  evaluate: (data) => api.post('/quiz/evaluate', data, { timeout: 120000 }),
  saveAnswer: (data) => api.post('/quiz/answer', data),
  getAnswers: (questionId) => api.get(`/quiz/answers/${questionId}`),
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

// 量化回测引擎（通过 /quant 转发到 Python 服务）
export const quantApi = {
  ping: () => api.get('/quant/ping'),
  listSymbols: () => api.get('/quant/symbols'),
  syncSymbol: (data) => api.post('/quant/symbols/sync', data, { timeout: 180000 }),
  coverage: (code) => api.get(`/quant/symbols/${encodeURIComponent(code)}/coverage`),
  runBacktest: (data) => api.post('/quant/backtest/run', data, { timeout: 60000 }),
  runGrid: (data) => api.post('/quant/backtest/grid', data, { timeout: 120000 }),
  runExport: (fmt, data) => api.post(`/quant/backtest/export/${fmt}`, data, { timeout: 120000, responseType: 'json' }),
  listSurvivorshipWatch: () => api.get('/quant/survivorship/watch'),
  addSurvivorshipWatch: (data) => api.post('/quant/survivorship/watch', data),
  removeSurvivorshipWatch: (code) => api.delete(`/quant/survivorship/watch/${encodeURIComponent(code)}`),
  agentChat: (data) => api.post('/quant/agent/chat', data, { timeout: 120000 }),

  // 策略工坊：AI 生成 / 改进 / 校验 / 保存自定义策略
  strategyRegistry: () => api.get('/quant/strategy/registry'),
  strategyGenerate: (data) => api.post('/quant/strategy/generate', data, { timeout: 300000 }),
  strategyRefine: (data) => api.post('/quant/strategy/refine', data, { timeout: 300000 }),
  strategyValidate: (data) => api.post('/quant/strategy/validate', data, { timeout: 120000 }),
  strategySave: (data) => api.post('/quant/strategy/save', data, { timeout: 120000 }),
  strategyCustomList: () => api.get('/quant/strategy/custom'),
  strategyCustomDetail: (key) => api.get(`/quant/strategy/custom/${encodeURIComponent(key)}`),
  strategyCustomDelete: (key) => api.delete(`/quant/strategy/custom/${encodeURIComponent(key)}`),
  strategyRollback: (key, version) =>
    api.post(`/quant/strategy/custom/${encodeURIComponent(key)}/rollback`, null, {
      params: version ? { version } : {},
      timeout: 60000,
    }),
}

// 量化服务（Python）启停开关
export const quantServiceApi = {
  status: () => api.get('/quant-service/status'),
  start: () => api.post('/quant-service/start', {}, { timeout: 30000 }),
  stop: () => api.post('/quant-service/stop', {}, { timeout: 20000 }),
}
