import { ref } from 'vue'
import { aiSettingsApi } from './api'

// 指标栏标语库（默认值）。可在「设置 → 标语库」里增删改，保存后写入后端设置。
export const DEFAULT_METRIC_TIPS = [
  '点指标即可筛选 · 再点取消 · 告别情绪化交易',
  '昨日计划 + 今日验证 = 闭环复盘',
  '分批买 · 分批卖 · 小亏快跑 · 大赚拿住',
  '止损是纪律，不是认输',
  '先看风险，再看收益',
  '持仓天数越短，试错成本越低',
  'T+1 卖出前，先想好明天怎么办',
  '量化指标辅助决策，情绪交给纪律',
  '复盘昨天，才能看懂今天',
]

// 后端设置键，值为 JSON 字符串数组
export const METRIC_TIPS_KEY = 'stock_metric_tips'

// 全局响应式标语库：设置页保存后立即生效，无需刷新
export const metricTips = ref([...DEFAULT_METRIC_TIPS])

function sanitize(list) {
  return (Array.isArray(list) ? list : [])
    .map(t => String(t ?? '').trim())
    .filter(Boolean)
}

// 解析后端存储的 JSON，异常或为空时回退默认标语
export function parseMetricTips(raw) {
  if (!raw) return [...DEFAULT_METRIC_TIPS]
  try {
    const arr = typeof raw === 'string' ? JSON.parse(raw) : raw
    const list = sanitize(arr)
    return list.length ? list : [...DEFAULT_METRIC_TIPS]
  } catch {
    return [...DEFAULT_METRIC_TIPS]
  }
}

export function serializeMetricTips(list) {
  return JSON.stringify(sanitize(list))
}

// 应用一份标语（空列表回退默认），并同步到全局
export function setMetricTips(list) {
  const clean = sanitize(list)
  metricTips.value = clean.length ? clean : [...DEFAULT_METRIC_TIPS]
}

export function applyMetricTipSettings(settings) {
  if (!settings) return
  metricTips.value = parseMetricTips(settings[METRIC_TIPS_KEY])
}

export async function loadMetricTips() {
  try {
    applyMetricTipSettings(await aiSettingsApi.getSettings())
  } catch (_) {
    // 后端不可用时保持默认标语，不影响页面渲染
  }
}