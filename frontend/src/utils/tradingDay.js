/**
 * A 股交易日判断
 * 周末 + 法定节假日（春节、国庆、五一、清明、端午、中秋、元旦）休市
 * 节假日日期基于国务院官方公告，每年更新
 */

// 各年法定节假日休市日期（YYYY-MM-DD），按年分组
const HOLIDAYS = {
  2026: [
    '2026-01-01', '2026-01-02', '2026-01-05', // 元旦
    '2026-02-16', '2026-02-17', '2026-02-18', '2026-02-19', '2026-02-20', // 春节
    '2026-04-04', '2026-04-05', '2026-04-06', // 清明
    '2026-05-01', '2026-05-02', '2026-05-03', '2026-05-04', '2026-05-05', // 五一
    '2026-06-19', '2026-06-20', '2026-06-21', '2026-06-22', // 端午
    '2026-09-25', '2026-09-26', '2026-09-27', // 中秋
    '2026-10-01', '2026-10-02', '2026-10-05', '2026-10-06', '2026-10-07', // 国庆
  ],
  2027: [
    '2027-01-01', // 元旦
    '2027-02-08', '2027-02-09', '2027-02-10', '2027-02-11', '2027-02-12', // 春节
    '2027-04-05', // 清明
    '2027-05-03', '2027-05-04', '2027-05-05', '2027-05-06', // 五一
    '2027-06-09', '2027-06-10', '2027-06-11', // 端午
    '2027-09-15', '2027-09-16', // 中秋
    '2027-10-01', '2027-10-02', '2027-10-04', '2027-10-05', '2027-10-06', // 国庆
  ],
}

// 构建全局日期集合（O(1) 查询）
const holidaySet = new Set()
Object.values(HOLIDAYS).forEach(dates => dates.forEach(d => holidaySet.add(d)))

/**
 * 判断 A 股指定日期是否休市（周末或法定节假日）
 * @param {string} dateStr - 'YYYY-MM-DD'
 * @returns {boolean} true = 休市
 */
export function isClosedDay(dateStr) {
  if (!dateStr || dateStr.length !== 10) return false
  const d = new Date(dateStr + 'T00:00:00')
  const day = d.getDay() // 0=Sun, 6=Sat
  if (day === 0 || day === 6) return true
  return holidaySet.has(dateStr)
}

/**
 * 返回休市原因文案
 * @param {string} dateStr
 * @returns {string} '' 表示正常交易日
 */
export function closedReason(dateStr) {
  if (!dateStr || dateStr.length !== 10) return ''
  const d = new Date(dateStr + 'T00:00:00')
  const day = d.getDay()
  if (day === 0) return '周日 · 休市'
  if (day === 6) return '周六 · 休市'
  if (holidaySet.has(dateStr)) {
    return '节假日 · 休市'
  }
  return ''
}

/**
 * 给定一个 'YYYY-MM-DD'，跳过其后的休市日，返回最近的交易日（若当天是交易日则返回当天）
 * 用于「周五做的计划，周六/周日仍延续显示，周一才切到新一天」的场景
 * @param {string} dateStr - 'YYYY-MM-DD'
 * @returns {string} 交易日 'YYYY-MM-DD'
 */
export function nearestTradingDay(dateStr) {
  if (!dateStr || dateStr.length !== 10) return dateStr
  let d = new Date(dateStr + 'T00:00:00')
  let guard = 0
  while (guard++ < 20 && (d.getDay() === 0 || d.getDay() === 6 || holidaySet.has(toYMD(d)))) {
    d.setDate(d.getDate() - 1)
  }
  return toYMD(d)
}

/**
 * 给定一个 'YYYY-MM-DD'，若当天休市则前进到下一个交易日（不后退）
 * @param {string} dateStr
 * @returns {string}
 */
export function nextTradingDay(dateStr) {
  if (!dateStr || dateStr.length !== 10) return dateStr
  let d = new Date(dateStr + 'T00:00:00')
  let guard = 0
  while (guard++ < 20 && (d.getDay() === 0 || d.getDay() === 6 || holidaySet.has(toYMD(d)))) {
    d.setDate(d.getDate() + 1)
  }
  return toYMD(d)
}

function toYMD(d) {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}
