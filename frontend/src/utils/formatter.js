export function fmtFee(val) {
  const n = parseFloat(val) || 0
  return Number.isInteger(n) ? n.toFixed(0) : n.toFixed(2)
}

export function fmtNum(val, decimals = 2) {
  const n = parseFloat(val) || 0
  const fixed = n.toFixed(decimals)
  return parseFloat(fixed).toString()
}

export function formatCurrency(val) {
  const n = parseFloat(val) || 0
  return `¥${n.toLocaleString('zh-CN', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`
}

export function formatPercent(val) {
  const n = parseFloat(val) || 0
  return `${n.toFixed(2)}%`
}

export function formatDate(dateStr) {
  if (!dateStr) return ''
  if (dateStr instanceof Date) {
    const y = dateStr.getFullYear()
    const m = String(dateStr.getMonth() + 1).padStart(2, '0')
    const d = String(dateStr.getDate()).padStart(2, '0')
    return `${y}-${m}-${d}`
  }
  return dateStr.substring(0, 10)
}

export function calculateHoldingDays(buyDate) {
  if (!buyDate) return 0
  const buy = new Date(buyDate)
  const today = new Date()
  buy.setHours(0, 0, 0, 0)
  today.setHours(0, 0, 0, 0)
  const diffTime = today - buy
  return Math.floor(diffTime / (1000 * 60 * 60 * 24)) + 1
}

export function calculateHoldingDaysByRange(buyDate, sellDate) {
  if (!buyDate || !sellDate) return 0
  const buy = new Date(buyDate)
  const sell = new Date(sellDate)
  buy.setHours(0, 0, 0, 0)
  sell.setHours(0, 0, 0, 0)
  const diffTime = sell - buy
  return Math.floor(diffTime / (1000 * 60 * 60 * 24)) + 1
}

export function debounce(fn, delay = 400) {
  let timer = null
  return function (...args) {
    if (timer) clearTimeout(timer)
    timer = setTimeout(() => fn.apply(this, args), delay)
  }
}

export function num(val) {
  return Number.isFinite(Number(val)) ? Number(val) : 0
}

export function sumBy(items, getValue) {
  if (!items || !Array.isArray(items)) return 0
  return items.reduce((sum, item) => sum + num(typeof getValue === 'function' ? getValue(item) : item[getValue]), 0)
}

export function sumByFilter(items, filterFn, getValue) {
  if (!items || !Array.isArray(items)) return 0
  return items.reduce((sum, item) => {
    if (filterFn(item)) return sum + num(typeof getValue === 'function' ? getValue(item) : item[getValue])
    return sum
  }, 0)
}

export function findByKeyword(items, keyword, key = 'name') {
  if (!items || !Array.isArray(items)) return null
  return items.find(item => {
    const value = item[key] || ''
    return value.includes(keyword)
  })
}

// === A股股票代码有效性验证 ===
// 编码规律：
//   600/601/603/605 沪主板(10%) | 68x 科创板(20%) | 900 沪B股
//   000/001/002 深主板(10%)   | 30x 创业板(20%)
//   8xx/92x 北交所(30%)
//   11/12 开头：可转债
//   730/780/787 等：新股申购代码（需排除）
//   5/15/16 开头：基金/REITs（需排除）
//
// strict 模式说明：
//   strict=false (默认) — 宽泛匹配：普通股 + 可转债 + B股 + 北交所，只要是"证券代码"都算
//   strict=true        — 严格匹配：只算A股普通股（沪深主板+科创+创业+北交所），排除可转债/B股/基金/申购代码
export function isValidStockCode(code, strict = false) {
  if (!code || typeof code !== 'string') return false
  const c = code.trim()
  if (!/^\d{6}$/.test(c)) return false
  const prefix3 = c.slice(0, 3)
  const prefix2 = c.slice(0, 2)
  const prefix1 = c.slice(0, 1)

  // 先排除新股申购代码（7开头）
  if (isSubscriptionCode(c)) return false

  // 排除基金代码（5/15/16开头等）
  if (prefix1 === '5') return false
  if (prefix2 === '15' || prefix2 === '16') return false

  // 沪市主板
  if (['600', '601', '603', '605'].includes(prefix3)) return true
  // 科创板
  if (prefix2 === '68') return true

  // 深市主板/原中小板
  if (['000', '001', '002'].includes(prefix3)) return true
  // 创业板
  if (prefix2 === '30') return true

  // 北交所（8开头、92开头）— 严格模式也算（北交所也是股票交易场所）
  if (prefix2 === '92' || prefix1 === '8') return true

  // 沪B股 — 严格模式排除（非A股普通股）
  if (prefix3 === '900') return !strict

  // 可转债 — 严格模式排除
  if (prefix2 === '11' || prefix2 === '12') return !strict

  return false
}

// 判断是否为新股申购代码
// 730/732/734 → 沪市主板申购
// 780/783/787 → 科创板申购
// 700/704 → 沪市配股/转债申购
// 002/300 开头的深市新股用本身代码申购，不需要单独排除
export function isSubscriptionCode(code) {
  if (!code || typeof code !== 'string') return false
  const c = code.trim()
  if (!/^\d{6}$/.test(c)) return false
  const prefix3 = c.slice(0, 3)
  const prefix2 = c.slice(0, 2)
  const prefix1 = c.slice(0, 1)

  // 7开头的申购/配号代码
  if (prefix1 === '7') {
    const subPrefixes = ['730', '731', '732', '734', '735', '736', '737', '738', '739',
                         '780', '781', '782', '783', '784', '785', '786', '787', '788', '789',
                         '700', '704', '706', '710', '752', '760', '770', '790']
    if (subPrefixes.includes(prefix3)) return true
    if (prefix2 === '70' || prefix2 === '71' || prefix2 === '72' ||
        prefix2 === '74' || prefix2 === '75' || prefix2 === '76' ||
        prefix2 === '77' || prefix2 === '79') return true
    return true // 所有7开头都视为申购/配号类代码
  }
  return false
}

// 从文本中提取所有符合A股编码规律的6位股票代码
export function extractValidStockCodes(text, strict = false) {
  if (!text || typeof text !== 'string') return []
  const codes = new Set()
  const matches = text.match(/(?:^|[^\d])(\d{6})(?:$|[^\d])/g) || []
  for (const m of matches) {
    const code = m.replace(/[^\d]/g, '')
    if (isValidStockCode(code, strict)) codes.add(code)
  }
  return [...codes]
}

// 根据股票代码判断所属板块
export function getStockBoard(code) {
  if (!code) return 'unknown'
  const c = String(code).trim()
  const prefix3 = c.slice(0, 3)
  const prefix2 = c.slice(0, 2)
  const prefix1 = c.slice(0, 1)

  if (['600', '601', '603', '605'].includes(prefix3)) return '沪主板'
  if (prefix2 === '68') return '科创板'
  if (prefix3 === '900') return '沪B股'
  if (['000', '001', '002'].includes(prefix3)) return '深主板'
  if (prefix2 === '30') return '创业板'
  if (prefix2 === '92' || prefix1 === '8') return '北交所'
  if (prefix2 === '11') return '沪转债'
  if (prefix2 === '12') return '深转债'
  if (isSubscriptionCode(c)) return '申购代码'
  if (prefix1 === '5' || prefix2 === '15' || prefix2 === '16') return '基金'
  return '其他'
}

// 根据股票代码+名称判断涨跌幅限制
// 注意：ST/*ST 股票涨跌幅为5%（科创板/创业板ST为20%不变），需要结合名称判断
export function getPriceLimit(code, stockName = '') {
  if (!code) return 10
  const c = String(code).trim()
  const prefix3 = c.slice(0, 3)
  const prefix2 = c.slice(0, 2)
  const prefix1 = c.slice(0, 1)
  const name = stockName || ''

  // 判断是否ST（名称前缀）
  const isST = /^(ST|\*ST|SST|S\*ST)/.test(name)

  // 主板10%，ST后5%
  if (['600', '601', '603', '605', '000', '001', '002'].includes(prefix3)) {
    return isST ? 5 : 10
  }
  // 科创板/创业板20%，ST后仍为20%（注册制板块ST不改变涨跌幅）
  if (prefix2 === '68' || prefix2 === '30') return 20
  // 北交所30%
  if (prefix2 === '92' || prefix1 === '8') return 30
  // 可转债无涨跌幅限制（首日），日常20%
  if (prefix2 === '11' || prefix2 === '12') return 20

  return isST ? 5 : 10
}

// 判断股票类型：stock / bond / fund / subscription / bshare
export function getStockType(code) {
  if (!code) return 'unknown'
  const c = String(code).trim()
  const prefix3 = c.slice(0, 3)
  const prefix2 = c.slice(0, 2)
  const prefix1 = c.slice(0, 1)

  if (isSubscriptionCode(c)) return 'subscription'
  if (prefix1 === '5' || prefix2 === '15' || prefix2 === '16') return 'fund'
  if (prefix2 === '11' || prefix2 === '12') return 'bond'
  if (prefix3 === '900') return 'bshare'
  if (isValidStockCode(c, true)) return 'stock'
  return 'unknown'
}
