// 联网搜索模块（免注册 / 本地自托管优先 / 顺序自动降级）
//
// 设计目标：不再依赖 Serper 这类需要注册的商用接口，全部换成免注册、可本地部署的搜索源，
// 优先本地自托管服务省额度，Tavily 只做最后一层兜底。
//
// 通用网页搜索降级链（从高到低，前者失败才切下一级，绝不并行，避免同时消耗多家额度）：
//   ① 秘塔 Metaso  国内 AI 原生搜索，优先抓 gov.cn，需 API Key（未配置则自动跳过）
//   ② SearXNG     本地 Docker 自托管（百度 / 搜狗 / 360 / 夸克 / 中国搜索），无额度上限，后端启动时自动拉起
//   ③ Bing        免 key 免注册网页搜索（国内可直连，解析 b_algo 结果块）
//   ④ 豆包搜索    火山引擎官方搜索 API，每月 500 次免费，需 API Key（额度少，只作备用）
//   ⑤ Claw Search 永久免费第三方聚合（无需 key；实测其 API 后端常返 502，只做兜底）
//   ⑥ OpenSERP    备选本地自托管（本机未跑时连接被拒会快速失败）
//   ⑦ DuckDuckGo  免 key 免注册（国内网络通常不可达，仅作海外环境兜底）
//   ⑧ Tavily      终极兜底，额度宝贵，前面全失败才启用
// 这份顺序是「默认顺序」，可在「系统设置 → 联网搜索 → 搜索引擎降级顺序」手动调整；
// 用户排过顺序后以用户设置为准，开机自检结论也不再覆盖它。
//
// 财经金融类查询走 AKShare 单独分支，拿结构化数据，不进入网页搜索降级链。
//
// 公共约束：全部原生 fetch（无第三方 npm SDK）；查询缓存；熔断；8 秒超时；结果合并去重；
//          调用日志；单会话总调用上限 12 次（命中缓存不计入）。
const { execFile } = require('node:child_process');
const path = require('node:path');

// 单次查询返回条数：原来写死 6，是「每次只拿到 6 条」的真正原因 ——
// SearXNG / Bing / 抓取分支解析出的结果最后都被 toResults / mergeResults 截到这个数。
// 现在放到 24（可用 SEARCH_RESULT_LIMIT 覆盖），并同步调高 SearXNG 引擎的 page_size。
const RESULT_LIMIT = Number(process.env.SEARCH_RESULT_LIMIT || 24)
const SNIPPET_MAX = 600
const TIMEOUT_MS = 8000          // 单次请求超时：超时即判失败并降级
const CACHE_TTL = 24 * 60 * 60 * 1000
const CACHE_MAX = 400
const BREAKER_THRESHOLD = 3      // 连续失败 3 次 → 标记不健康
const BREAKER_COOLDOWN = 10 * 60 * 1000  // 10 分钟冷却，冷却期内直接跳过
const SESSION_LIMIT = Number(process.env.SEARCH_SESSION_LIMIT || 12)  // 单会话总调用上限
const SESSION_WINDOW = 30 * 60 * 1000   // 会话窗口（30 分钟内的调用算同一次会话）
const DDG_MIN_INTERVAL = 3000    // DuckDuckGo 最小请求间隔，避免触发验证码
const BING_MIN_INTERVAL = 1200   // Bing 抓取同样有反爬，连打会弹验证
const CLAW_MIN_INTERVAL = 700    // Claw Search 限 100 次/分钟，留出安全余量
// SearXNG 自己会并发打百度/搜狗/360/夸克，连续提问叠加上来最容易触发百度验证码，
// 这里给本地聚合器本身也留一个最小间隔（单次对话本来就限 3 次检索，影响很小）
const SEARXNG_MIN_INTERVAL = 1500
const AKSHARE_TIMEOUT = 60000    // akshare 首次 import 较慢

// 本地自托管服务的地址，可用环境变量覆盖
const SEARXNG_URL = process.env.SEARXNG_URL || 'http://localhost:8080'
const OPENSERP_URL = process.env.OPENSERP_URL || 'http://localhost:7000'
// Claw Search：第三方免费聚合，无需密钥，地址可用环境变量覆盖
const CLAW_URL = process.env.CLAW_SEARCH_URL || 'https://www.claw-search.com'

// 搜索源定义：id 用于熔断记账，name 用于日志与前端展示，desc / needKey 供系统设置面板排序展示
const SOURCES = [
  { id: 'metaso', name: '秘塔 Metaso', desc: '国内 AI 原生搜索，优先抓 gov.cn 官网，需填写 API Key', needKey: true },
  { id: 'searxng', name: 'SearXNG', desc: '本地自托管聚合搜索（百度/搜狗/360/夸克/中国搜索），随服务自动拉起，无额度上限', needKey: false },
  { id: 'bing', name: 'Bing 必应', desc: '免密钥网页搜索，国内可直连', needKey: false },
  { id: 'volcengine', name: '豆包搜索（火山引擎）', desc: '字节官方搜索 API，每月 500 次免费，需填写 API Key', needKey: true },
  { id: 'claw', name: 'Claw Search', desc: '永久免费第三方聚合，无需密钥；服务偶发 502，仅作兜底', needKey: false },
  { id: 'openserp', name: 'OpenSERP', desc: '备选本地自托管聚合搜索，需本机已启动', needKey: false },
  { id: 'duckduckgo', name: 'DuckDuckGo', desc: '免密钥，国内网络通常不可达，仅海外兜底', needKey: false },
  { id: 'tavily', name: 'Tavily', desc: '终极兜底，需在下方填写 API Key', needKey: true }
]
// 默认顺序快照：用户后来在设置里排过顺序时，用它决定「后新增的搜索源」该插回哪个位置
const DEFAULT_SOURCE_IDS = SOURCES.map(source => source.id)

// 需要密钥的搜索源 → 其密钥字段名（密钥按租户加密存储在 ai_settings）
const KEY_FIELDS = { metaso: 'metaso_api_key', volcengine: 'volcengine_api_key', tavily: 'tavily_api_key' }

// ===== 缓存 =====
const searchCache = new Map()

function cacheKey(userId, query) {
  return `${userId}::${String(query || '').replace(/\s+/g, ' ').trim().toLowerCase()}`
}

function readCache(userId, query) {
  const hit = searchCache.get(cacheKey(userId, query))
  if (!hit) return null
  if (Date.now() - hit.at > CACHE_TTL) {
    searchCache.delete(cacheKey(userId, query))
    return null
  }
  return hit.value
}

function writeCache(userId, query, value) {
  if (searchCache.size >= CACHE_MAX) {
    const oldest = searchCache.keys().next().value
    if (oldest) searchCache.delete(oldest)
  }
  searchCache.set(cacheKey(userId, query), { at: Date.now(), value })
}

// ===== 熔断 =====
const breaker = new Map()
SOURCES.forEach(source => breaker.set(source.id, { fails: 0, openUntil: 0, lastError: '' }))

function breakerOpen(id) {
  const state = breaker.get(id)
  if (!state) return false
  if (!state.openUntil) return false
  if (Date.now() >= state.openUntil) {
    // 冷却结束，自动重试：重置计数
    state.fails = 0
    state.openUntil = 0
    console.log(`[Search] 熔断冷却结束，重新启用 ${id}`)
    return false
  }
  return true
}

// 记录一次失败。连续 3 次失败即熔断，并返回 true 表示需要终止本轮搜索
function noteFailure(id, message) {
  const state = breaker.get(id)
  if (!state) return false
  state.fails += 1
  state.lastError = message
  if (state.fails >= BREAKER_THRESHOLD) {
    state.openUntil = Date.now() + BREAKER_COOLDOWN
    console.warn(`[Search] ${id} 连续失败 ${state.fails} 次，已熔断，冷却 10 分钟（${message}）`)
    return true
  }
  return false
}

function noteSuccess(id) {
  const state = breaker.get(id)
  if (!state) return
  state.fails = 0
  state.openUntil = 0
}

// ===== 会话调用上限（单会话 12 次，命中缓存不计入） =====
const sessionUsage = new Map()

function readUsage(userId) {
  const state = sessionUsage.get(userId)
  if (!state || Date.now() - state.at > SESSION_WINDOW) return { count: 0, at: Date.now() }
  return state
}

function sessionQuotaExceeded(userId) {
  return readUsage(userId).count >= SESSION_LIMIT
}

function noteSessionCall(userId) {
  const state = readUsage(userId)
  state.count += 1
  state.at = Date.now()
  sessionUsage.set(userId, state)
  return state.count
}

function getSearchUsage(userId) {
  const state = readUsage(userId)
  return { used: state.count, limit: SESSION_LIMIT }
}

// 清除某用户的会话计数（例如开新一轮对话时）
function resetSearchSession(userId) {
  sessionUsage.delete(userId)
}

// ===== 工具函数 =====
function clip(text) {
  const value = String(text == null ? '' : text).replace(/\s+/g, ' ').trim()
  return value.length > SNIPPET_MAX ? `${value.slice(0, SNIPPET_MAX)}…` : value
}

// 各家 API 的字段大小写风格不一（秘塔 webpages、Claw 的 web.results、豆包大驼峰 Title/Url），统一在这里认下来
function toResults(list) {
  return (Array.isArray(list) ? list : [])
    .map(item => ({
      title: clip(item?.title || item?.name || item?.Title || ''),
      url: String(item?.url || item?.link || item?.Url || '').trim(),
      snippet: clip(item?.snippet || item?.Snippet || item?.content || item?.Content || item?.description || item?.summary || ''),
      publishedAt: String(item?.publishedDate || item?.published_at || item?.pubDate || item?.PublishTime || item?.date || '').trim()
    }))
    .filter(item => item.title || item.snippet || item.url)
    .slice(0, RESULT_LIMIT)
}

// 搜索结果容器的字段名各家不同，第三方服务契约还会随版本变（Claw Search 实测经常超时、结构也无从离线确认）。
// 与其硬猜某一个名字，这里统一做一次提取：先认已知容器名，再往下浅层递归找「像搜索结果列表」的数组
// （元素同时带标题和链接才算），这样换源或被改字段都不至于白跑一趟。
const LIST_KEYS = ['webpages', 'WebResults', 'webResults', 'results', 'items', 'list', 'data', 'web']
function looksLikeResults(list) {
  if (!Array.isArray(list) || !list.length) return false
  return list.slice(0, 3).some(item => item && typeof item === 'object' &&
    (item.title || item.name || item.Title) && (item.url || item.link || item.Url))
}
function extractResultList(data, depth = 0) {
  if (!data || typeof data !== 'object') return []
  if (Array.isArray(data)) return looksLikeResults(data) ? data : []
  for (const key of LIST_KEYS) {
    const value = data[key]
    if (Array.isArray(value) && looksLikeResults(value)) return value
  }
  if (depth >= 2) return []
  for (const key of LIST_KEYS) {
    const found = extractResultList(data[key], depth + 1)
    if (found.length) return found
  }
  return []
}

// ===== 检索结果预处理（在送入大模型之前执行，全场景通用）=====
// 规则：① 丢弃外文无关站点 ② 按来源权威度排序 ③ 去重 ④ 最多保留前 CONTEXT_LIMIT 条 ⑤ 标注发布时间
const CONTEXT_LIMIT = Number(process.env.SEARCH_CONTEXT_LIMIT || 8)

// 来源权威度分层：数字越小越优先，未命中的普通站点垫底
const SOURCE_TIERS = [
  { weight: 0, re: /(^|\.)gov\.cn(\/|$|:)|(^|\.)gov(\/|$|:)/i },                                    // 政府官网
  { weight: 1, re: /(xinhuanet|people\.com\.cn|news\.cn|chinanews|chinadaily|cctv|gmw\.cn|qstheory|china\.com\.cn)/i }, // 权威官方媒体
  { weight: 2, re: /(^|\.)edu\.cn(\/|$)|(^|\.)org\.cn(\/|$)|(^|\.)ac\.cn(\/|$)|moe\.gov/i },         // 行业正规平台 / 机构
  { weight: 4, re: /(weixin\.qq\.com|mp\.weixin|zhihu\.com|toutiao|baijiahao|sohu\.com|163\.com|sina\.com|bilibili|xiaohongshu|douban|jianshu)/i } // 自媒体
]

function sourceWeight(url) {
  const host = String(url || '').toLowerCase()
  if (host) for (const tier of SOURCE_TIERS) if (tier.re.test(host)) return tier.weight
  return 3
}

// 标题 + 摘要里没有任何中文 → 判定为外文站点，国内规划场景直接丢弃
function hasChinese(text) {
  return /[\u4e00-\u9fff]/.test(String(text || ''))
}

// 发布时间取不到时，从标题 / 摘要里兜底认一个日期
function guessPublishedAt(item) {
  const direct = String(item?.publishedAt || '').trim()
  if (direct) return direct.slice(0, 10)
  const text = `${item?.title || ''} ${item?.snippet || ''}`
  const full = /(20\d{2})\s*[-/年]\s*(\d{1,2})\s*[-/月]\s*(\d{1,2})/.exec(text)
  if (full) return `${full[1]}-${String(full[2]).padStart(2, '0')}-${String(full[3]).padStart(2, '0')}`
  const month = /(20\d{2})\s*年\s*(\d{1,2})\s*月/.exec(text)
  if (month) return `${month[1]}-${String(month[2]).padStart(2, '0')}`
  return ''
}

function prepareResults(results) {
  const seen = new Set()
  const kept = []
  for (const item of Array.isArray(results) ? results : []) {
    const title = String(item?.title || '').trim()
    const snippet = String(item?.snippet || '').trim()
    const url = String(item?.url || '').trim()
    if (!title && !snippet && !url) continue
    if (!hasChinese(`${title}${snippet}`)) continue   // 外文站点一律丢弃
    const key = url ? url.replace(/^https?:\/\//, '').replace(/\/$/, '').toLowerCase() : title.toLowerCase()
    if (key && seen.has(key)) continue
    if (key) seen.add(key)
    kept.push({ ...item, publishedAt: guessPublishedAt(item) })
  }
  // 权威度优先，同权重保持原顺序（sort 稳定），最后只留前 CONTEXT_LIMIT 条
  return kept
    .map((item, index) => ({ item, index, weight: sourceWeight(item.url) }))
    .sort((a, b) => (a.weight - b.weight) || (a.index - b.index))
    .slice(0, CONTEXT_LIMIT)
    .map(entry => entry.item)
}

// 合并多源结果并按 URL / 标题去重
function mergeResults(groups) {
  const seenUrl = new Set()
  const seenTitle = new Set()
  const merged = []
  for (const group of groups) {
    for (const item of group || []) {
      const urlKey = item.url ? item.url.replace(/^https?:\/\//, '').replace(/\/$/, '').toLowerCase() : ''
      const titleKey = (item.title || '').trim().toLowerCase()
      if (urlKey && seenUrl.has(urlKey)) continue
      if (!urlKey && titleKey && seenTitle.has(titleKey)) continue
      if (urlKey) seenUrl.add(urlKey)
      if (titleKey) seenTitle.add(titleKey)
      merged.push(item)
    }
  }
  return merged
}

async function fetchWithTimeout(url, options = {}, timeoutMs = TIMEOUT_MS) {
  return fetch(url, { ...options, signal: AbortSignal.timeout(timeoutMs) })
}

// 请求间隔保护：抓取型搜索引擎（Bing / Claw / DuckDuckGo）高频连打会被弹验证码或限流，
// 每个源各自保证最小调用间隔，间隔不够就先等一会儿再发。
const lastCallAt = {}
async function throttle(id, gapMs) {
  const wait = gapMs - (Date.now() - (lastCallAt[id] || 0))
  if (wait > 0) await new Promise(resolve => setTimeout(resolve, wait))
  lastCallAt[id] = Date.now()
}

// ===== ① 秘塔 Metaso：国内 AI 原生搜索，Bearer 鉴权，POST /api/v1/search =====
// 官方契约（REST，无需 SDK）：{ q, scope:"webpage", includeSummary, page, includeRawContent, conciseSnippet }
// 实测这家失败时会返回 { code, message }（例如 code=5000 系统内部错误），成功时结果在 webpages 数组里；
// 因为没有可用密钥、拿不到成功样例，结果容器交由 extractResultList 统一兼容，不赌单一字段名。
async function searchMetaso(query, apiKey) {
  const response = await fetchWithTimeout('https://metaso.cn/api/v1/search', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json', Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({ q: query, scope: 'webpage', includeSummary: false, page: '1', includeRawContent: false, conciseSnippet: false })
  })
  if (!response.ok) throw Object.assign(new Error(`HTTP ${response.status}`), { status: response.status })
  const data = await response.json()
  const list = extractResultList(data)
  // 没拿到结果又带错误码：把原始错误抛出来，方便在设置里定位是 Key 未激活还是额度问题
  if (!list.length && data?.code) throw new Error(`秘塔返回错误 ${data.code}：${data.message || '未知原因'}`)
  return toResults(list)
}

// ===== ④ 豆包搜索（火山引擎）：官方搜索 API，API Key 接入 =====
// POST https://open.feedcoopapi.com/search_api/web_search，body 用大驼峰字段名
// 结果在 Result.WebResults，字段 Title / Url / Summary / Snippet / Content / PublishTime
async function searchVolcengine(query, apiKey) {
  const response = await fetchWithTimeout('https://open.feedcoopapi.com/search_api/web_search', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      Query: query,
      SearchType: 'web',
      Count: Math.min(RESULT_LIMIT, 50),   // 接口最多 50 条
      Filter: { NeedContent: false, NeedUrl: true }   // 只要带原文链接的结果，没链接的只能当噪音
    })
  })
  if (!response.ok) throw Object.assign(new Error(`HTTP ${response.status}`), { status: response.status })
  const data = await response.json()
  const items = data?.Result?.WebResults
  if (!Array.isArray(items)) {
    const error = data?.ResponseMetadata?.Error
    throw new Error(error ? `豆包搜索错误 ${error.Code || ''}：${error.Message || ''}`.trim() : '豆包搜索未返回结果列表')
  }
  return toResults(items.map(item => ({
    title: item.Title,
    url: item.Url,
    // Summary 是 500~1000 字、和 query 强相关的正文片段，官方明确推荐喂大模型；Snippet 只有约 200 字
    snippet: item.Summary || item.Snippet || item.Content || '',
    publishedAt: item.PublishTime || ''
  })))
}

// ===== ⑤ Claw Search：永久免费第三方聚合，无需密钥 =====
// 契约按官方说明是 { web: { results: [{ title, url, description }] } }，但这家的服务不稳定、
// 实测多次超时拿不到响应体，所以容器也不写死，交给 extractResultList 兜住字段变动。
async function searchClaw(query) {
  await throttle('claw', CLAW_MIN_INTERVAL)
  const response = await fetchWithTimeout(`${CLAW_URL}/api/search?q=${encodeURIComponent(query)}`, {
    headers: { Accept: 'application/json', 'User-Agent': 'LifePlanner/1.0' }
  })
  if (!response.ok) throw Object.assign(new Error(`HTTP ${response.status}`), { status: response.status })
  const data = await response.json()
  return toResults(extractResultList(data))
}

// ===== ② SearXNG：本地自托管，?q=&format=json =====
async function searchSearxng(query) {
  await throttle('searxng', SEARXNG_MIN_INTERVAL)
  const url = `${SEARXNG_URL}/search?q=${encodeURIComponent(query)}&format=json`
  const response = await fetchWithTimeout(url, {
    headers: { Accept: 'application/json', 'User-Agent': 'LifePlanner/1.0' }
  })
  if (!response.ok) throw Object.assign(new Error(`HTTP ${response.status}`), { status: response.status })
  const data = await response.json()
  return toResults(data?.results)
}

// ===== ③ Bing：免 key 免注册，解析 b_algo 结果块（国内可直连，SearXNG 的第一备选） =====
// Bing 会把真实地址包在 bing.com/ck/a?…&u=a1<base64url> 里，需要还原
function decodeBingUrl(href) {
  const match = /[?&]u=a1([A-Za-z0-9\-_]+)/.exec(href || '')
  if (!match) return href
  try {
    const text = Buffer.from(match[1].replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8')
    return /^https?:\/\//.test(text) ? text : href
  } catch (err) {
    return href
  }
}

// 实测 cn.bing.com 不认 &first=（第 2/3 页与第 1 页完全相同），靠翻页凑不到量，
// 改用「三个索引变体」互补：国内 ensearch 全球 / .com 全球 / 国内默认，三者结果互不重复，
// 单次调用即可拿到 24~30 条原始结果（仍然只算一次会话额度，不额外消耗配额）。
// 顺序上把 ensearch 放前面：它对中文长查询的相关性明显更好，截断时优先保住这批结果。
const BING_VARIANTS = [
  { host: 'https://cn.bing.com/search', extra: '&ensearch=1' },
  { host: 'https://www.bing.com/search', extra: '&ensearch=1&cc=us' },
  { host: 'https://cn.bing.com/search', extra: '' }
]

function parseBingBlocks(html) {
  const items = []
  const blockPattern = /<li class="b_algo"[\s\S]*?<\/li>/g
  let block
  while ((block = blockPattern.exec(html)) !== null) {
    const link = /<h2[^>]*>\s*<a[^>]+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/.exec(block[0])
    if (!link) continue
    const snippet = /<p[^>]*>([\s\S]*?)<\/p>/.exec(block[0])
    items.push({
      title: stripTags(link[2]),
      url: decodeBingUrl(link[1]),
      snippet: stripTags(snippet ? snippet[1] : '')
    })
  }
  return items
}

async function searchBing(query) {
  await throttle('bing', BING_MIN_INTERVAL)
  const items = []
  const seen = new Set()
  let firstError = null
  for (const variant of BING_VARIANTS) {
    if (items.length >= RESULT_LIMIT) break
    const url = `${variant.host}?q=${encodeURIComponent(query)}&setlang=zh-CN${variant.extra}`
    try {
      const response = await fetchWithTimeout(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122 Safari/537.36',
          Accept: 'text/html,application/xhtml+xml',
          'Accept-Language': 'zh-CN,zh;q=0.9'
        }
      })
      if (response.status === 403 || response.status === 429) {
        throw Object.assign(new Error('被拦截或被限流'), { status: response.status })
      }
      if (!response.ok) throw Object.assign(new Error(`HTTP ${response.status}`), { status: response.status })
      for (const item of parseBingBlocks(await response.text())) {
        const key = item.url ? item.url.replace(/^https?:\/\//, '').replace(/\/$/, '').toLowerCase() : item.title
        if (key && seen.has(key)) continue
        if (key) seen.add(key)
        items.push(item)
      }
    } catch (err) {
      // 某个变体失败不该拖垮整条搜索：记下首个错误，其余变体继续补齐
      if (!firstError) firstError = err
    }
  }
  if (!items.length && firstError) throw firstError
  return toResults(items)
}

// ===== ⑦ DuckDuckGo：免 key 免注册，解析 HTML 结果页（国内网络通常不可达，仅海外兜底） =====
async function searchDuckDuckGo(query) {
  // 低频保护：两次调用至少间隔 3 秒，避免触发验证码拦截
  await throttle('duckduckgo', DDG_MIN_INTERVAL)

  const url = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}&kl=cn-zh`
  const response = await fetchWithTimeout(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122 Safari/537.36',
      Accept: 'text/html,application/xhtml+xml',
      'Accept-Language': 'zh-CN,zh;q=0.9'
    }
  })
  if (response.status === 403 || response.status === 202) {
    // 验证码拦截：直接判定失败并降级
    throw Object.assign(new Error('触发验证码拦截'), { status: response.status })
  }
  if (!response.ok) throw Object.assign(new Error(`HTTP ${response.status}`), { status: response.status })
  const html = await response.text()

  const items = []
  const linkPattern = /<a[^>]+class="[^"]*result__a[^"]*"[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/g
  const snippetPattern = /<a[^>]+class="[^"]*result__snippet[^"]*"[^>]*>([\s\S]*?)<\/a>/g
  const snippets = []
  let snippetMatch
  while ((snippetMatch = snippetPattern.exec(html)) !== null) snippets.push(snippetMatch[1])

  let match
  let index = 0
  while ((match = linkPattern.exec(html)) !== null && items.length < RESULT_LIMIT) {
    let href = match[1]
    // DDG 跳转链接形如 //duckduckgo.com/l/?uddg=<encoded>，还原成真实地址
    const uddg = /uddg=([^&]+)/.exec(href)
    if (uddg) href = decodeURIComponent(uddg[1])
    if (href.startsWith('//')) href = `https:${href}`
    items.push({
      title: stripTags(match[2]),
      url: href,
      snippet: stripTags(snippets[index] || '')
    })
    index += 1
  }
  return toResults(items)
}

function stripTags(html) {
  return String(html || '')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#x27;|&#39;/g, "'")
    .trim()
}

// ===== ⑥ OpenSERP：备选本地自托管 =====
async function searchOpenSerp(query) {
  const attempts = [
    `${OPENSERP_URL}/search?q=${encodeURIComponent(query)}&limit=${RESULT_LIMIT}&format=json`,
    `${OPENSERP_URL}/v1/search?q=${encodeURIComponent(query)}&limit=${RESULT_LIMIT}`,
    `${OPENSERP_URL}/search?q=${encodeURIComponent(query)}&engine=google&limit=${RESULT_LIMIT}`
  ]
  let lastError = null
  for (const url of attempts) {
    try {
      const response = await fetchWithTimeout(url, { headers: { Accept: 'application/json' } })
      if (!response.ok) throw Object.assign(new Error(`HTTP ${response.status}`), { status: response.status })
      const data = await response.json()
      const list = Array.isArray(data) ? data : (data?.results || data?.items || data?.data || [])
      const results = toResults(list)
      if (results.length) return results
      lastError = new Error('未返回结果')
    } catch (err) {
      lastError = err
    }
  }
  throw lastError || new Error('OpenSERP 不可用')
}

// ===== ⑧ Tavily：终极兜底，额度宝贵 =====
async function searchTavily(query, apiKey) {
  const response = await fetchWithTimeout('https://api.tavily.com/search', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({ query, max_results: RESULT_LIMIT, search_depth: 'basic' })
  })
  if (!response.ok) throw Object.assign(new Error(`HTTP ${response.status}`), { status: response.status })
  const data = await response.json()
  return toResults(data?.results)
}

// ===== 财经分支：AKShare 结构化数据，不进网页搜索链 =====
const FINANCE_PATTERN = /(股票|个股|股价|行情|大盘|指数|上证|深证|创业板|科创|沪深|涨停|跌停|龙虎榜|市盈率|估值|市值|财务报表|营收|净利润|分红|股息|可转债|转债|新股|打新|申购|中签|基金|ETF|期货|黄金|白银|原油|外汇|汇率|美元|人民币|债券|国债|利率|加息|降息|央行|美联储|GDP|CPI|PPI|M2|通胀|通缩|宏观|财经|股指|券商|板块|龙头|北向资金|融资融券)/i

function isFinanceQuery(query) {
  return FINANCE_PATTERN.test(String(query || ''))
}

function pythonBin() {
  const venv = path.join(__dirname, '..', 'quant', '.venv', 'Scripts', 'python.exe')
  if (process.env.PYTHON_BIN) return process.env.PYTHON_BIN
  try {
    if (require('node:fs').existsSync(venv)) return venv
  } catch (err) { /* 忽略 */ }
  return 'python'
}

// 调用 quant/finance_query.py 拿结构化财经数据
function akShareQuery(query) {
  return new Promise((resolve, reject) => {
    const script = path.join(__dirname, '..', 'quant', 'finance_query.py')
    const child = execFile(pythonBin(), [script, String(query).slice(0, 200)], {
      cwd: path.join(__dirname, '..'),
      timeout: AKSHARE_TIMEOUT,
      maxBuffer: 16 * 1024 * 1024,
      windowsHide: true
    }, (error, stdout, stderr) => {
      if (error) return reject(new Error(String(stderr || error.message || '').split('\n').filter(Boolean).pop() || 'akshare 调用失败'))
      try {
        const lines = String(stdout || '').trim().split('\n')
        const payload = JSON.parse(lines[lines.length - 1])
        resolve(payload)
      } catch (parseError) {
        reject(new Error(`akshare 输出解析失败：${parseError.message}`))
      }
    })
    child.on('error', reject)
  })
}

// ===== 统一入口：财经分支优先 → 缓存 → 顺序降级 =====
// getSecret(field) 由调用方注入，用于按租户解密各服务商密钥（只有 Tavily 需要）
async function multiSearch(query, { userId = '', getSecret } = {}) {
  const clean = String(query || '').trim().slice(0, 200)
  if (!clean) throw new Error('搜索关键词为空')

  // 财经类：直接走 AKShare，不占用网页搜索额度，也不进降级链
  if (isFinanceQuery(clean)) {
    console.log(`[Search] 财经查询走 AKShare 分支：${clean}`)
    try {
      const payload = await akShareQuery(clean)
      const results = toResults(payload?.items)
      if (results.length) {
        console.log(`[Search] provider=AKShare status=200 query=${clean} count=${results.length}`)
        return { provider: 'AKShare', query: clean, results, cached: false, finance: true, intent: payload?.intent || '' }
      }
      console.warn(`[Search] AKShare 未返回结构化数据，降级进入网页搜索链：${clean}`)
    } catch (err) {
      console.warn(`[Search] AKShare 调用失败，降级进入网页搜索链：${err.message}`)
    }
  }

  // 命中缓存直接返回，不消耗任何额度、也不计入会话上限
  const cached = readCache(userId, clean)
  if (cached) {
    console.log(`[Search] provider=${cached.provider} status=cache query=${clean}`)
    return { ...cached, cached: true }
  }

  // 单会话总调用上限保护：防止 Agent 进入无限循环搜索
  if (sessionQuotaExceeded(userId)) {
    const error = new Error(`本次会话联网检索已达上限 ${SESSION_LIMIT} 次，请先消化已有资料或换个问题`)
    error.code = 'SEARCH_SESSION_LIMIT'
    throw error
  }

  const groups = []
  const attempted = []
  let lastError = null
  let primaryProvider = ''

  for (const source of SOURCES) {
    // 熔断冷却期内：直接跳过该源
    if (breakerOpen(source.id)) {
      console.log(`[Search] ${source.name} 处于熔断冷却期，跳过`)
      continue
    }
    // 需要密钥的源，没配置就直接跳过（不消耗任何额度）
    let apiKey = ''
    const keyField = KEY_FIELDS[source.id]
    if (keyField) {
      apiKey = await getSecret(keyField).catch(() => '')
      if (!apiKey) {
        console.log(`[Search] ${source.name} 未配置密钥，跳过`)
        continue
      }
    }

    const used = noteSessionCall(userId)
    try {
      let results = []
      if (source.id === 'metaso') results = await searchMetaso(clean, apiKey)
      else if (source.id === 'searxng') results = await searchSearxng(clean)
      else if (source.id === 'bing') results = await searchBing(clean)
      else if (source.id === 'volcengine') results = await searchVolcengine(clean, apiKey)
      else if (source.id === 'claw') results = await searchClaw(clean)
      else if (source.id === 'openserp') results = await searchOpenSerp(clean)
      else if (source.id === 'duckduckgo') results = await searchDuckDuckGo(clean)
      else if (source.id === 'tavily') results = await searchTavily(clean, apiKey)
      attempted.push(source.name)

      if (results.length) {
        noteSuccess(source.id)
        if (!primaryProvider) primaryProvider = source.name
        groups.push(results)
        console.log(`[Search] provider=${source.name} status=200 query=${clean} count=${results.length} sessionUsed=${used}`)
        // 任一级拿到结果即收手：避免继续消耗后面的额度（SearXNG / Bing 都是整页结果，够用）
        break
      }
      lastError = new Error('未返回结果')
      console.log(`[Search] provider=${source.name} status=empty query=${clean}`)
      if (noteFailure(source.id, '未返回结果')) {
        // 任一源触发熔断 → 终止本轮搜索，不再尝试剩下的服务商
        const error = new Error(`${source.name} 连续失败已熔断，本轮搜索终止`)
        error.code = 'SEARCH_BREAKER_TRIPPED'
        throw error
      }
    } catch (err) {
      if (err.code === 'SEARCH_BREAKER_TRIPPED') throw err
      lastError = err
      console.warn(`[Search] provider=${source.name} status=${err.status || 'error'} query=${clean} msg=${err.message}`)
      if (noteFailure(source.id, err.message)) {
        const tripped = new Error(`${source.name} 连续失败已熔断，本轮搜索终止`)
        tripped.code = 'SEARCH_BREAKER_TRIPPED'
        throw tripped
      }
    }
  }

  const merged = mergeResults(groups).slice(0, RESULT_LIMIT)
  if (merged.length) {
    // 送入模型前统一做质量过滤：外文站点丢掉后若一条不剩，宁可退回原始结果，也不让一次成功的检索变成失败
    const prepared = prepareResults(merged)
    const results = prepared.length ? prepared : merged.slice(0, CONTEXT_LIMIT)
    const value = { provider: primaryProvider || '本地聚合', query: clean, results, cached: false }
    writeCache(userId, clean, value)
    return value
  }

  const detail = attempted.length ? `已尝试：${attempted.join(' → ')}` : '本地与免注册搜索源均不可用'
  throw new Error(lastError ? `全部搜索源均未取到结果（${detail}；最后错误：${lastError.message}）` : `全部搜索源均未取到结果（${detail}）`)
}

// 兼容旧调用名
const webSearch = multiSearch

// 启动自检得出的主力可用源：把它提到降级链最前面，避免每轮查询都先白等一个不可用的源
// （实测本机 SearXNG 容器因容器内 DNS / 引擎反爬返回空结果，每轮都要先耗 8 秒才轮到 Bing）
// 用户在系统设置里手动排过顺序后（orderLocked），这里不再覆盖，以用户设置优先。
let orderLocked = false

function setPrimarySource(name) {
  if (orderLocked) {
    console.log(`[Search] 已按系统设置固定降级链顺序，忽略自检结论 ${name}`)
    return
  }
  // 链首是需要密钥的源（默认顺序下就是秘塔，也是用户指定的首选）：自检拿不到密钥、
  // 无法判断用户到底配没配，这时候不该把无密钥的源提到它前面去 —— 配了秘塔却被自检降级，
  // 与「秘塔首选」的预期相悖；没配的话运行时本来就一条 continue 直接跳过，不产生任何等待。
  if (SOURCES[0]?.needKey) {
    console.log(`[Search] 降级链首位是需密钥的 ${SOURCES[0].name}，保持不动（自检结论 ${name} 不用于调整顺序）`)
    return
  }
  const index = SOURCES.findIndex(source => source.name === name)
  if (index <= 0) return
  const [picked] = SOURCES.splice(index, 1)
  SOURCES.unshift(picked)
  console.log(`[Search] 主力源调整为 ${name}（依据启动自检结论）`)
}

// 按系统设置里的顺序重排降级链；空数组视为未设置，保持默认顺序
function setSourceOrder(ids) {
  const wanted = (Array.isArray(ids) ? ids : []).map(id => String(id || '').trim().toLowerCase()).filter(Boolean)
  const rank = id => {
    const index = DEFAULT_SOURCE_IDS.indexOf(id)
    return index === -1 ? DEFAULT_SOURCE_IDS.length : index
  }
  const picked = []
  for (const id of wanted) {
    const source = SOURCES.find(item => item.id === id)
    if (source && !picked.includes(source)) picked.push(source)
  }
  if (!picked.length) return getSourceOrder()
  // 用户设置里没有的源（例如版本升级后新加的搜索源）按「默认顺序里的位置」插回，
  // 而不是一律堆到末尾 —— 否则老用户加回来的秘塔 / 豆包会被排到 DuckDuckGo 后面
  for (const source of [...SOURCES].sort((a, b) => rank(a.id) - rank(b.id))) {
    if (picked.includes(source)) continue
    const at = picked.findIndex(item => rank(item.id) > rank(source.id))
    if (at === -1) picked.push(source)
    else picked.splice(at, 0, source)
  }
  SOURCES.splice(0, SOURCES.length, ...picked)
  orderLocked = true
  console.log(`[Search] 降级链顺序已按系统设置调整：${SOURCES.map(item => item.name).join(' → ')}`)
  return getSourceOrder()
}

function getSourceOrder() {
  return SOURCES.map(({ id, name, desc, needKey }) => ({ id, name, desc: desc || '', needKey: Boolean(needKey) }))
}

// 把搜索结果压缩成可读文本，注入模型上下文（结果已在 multiSearch 阶段过滤、排序、限 8 条）
function formatSearchContext(search) {
  if (!search?.results?.length) return ''
  const lines = search.results.map((item, index) => {
    const source = item.url ? `（${item.url}）` : ''
    const time = `｜发布时间：${item.publishedAt || '未知'}`
    return `${index + 1}. ${item.title || '未命名'}${source}${time}\n${item.snippet || ''}`
  })
  return `【联网检索结果｜来源：${search.provider}${search.cached ? '，命中缓存' : ''}】\n${lines.join('\n')}`
}

module.exports = {
  multiSearch,
  webSearch,
  akShareQuery,
  isFinanceQuery,
  formatSearchContext,
  getSearchUsage,
  resetSearchSession,
  // 启动自检据此把真正能用的源提到降级链最前面
  setPrimarySource,
  // 系统设置面板可手动排序降级链，设置优先于自检结论
  setSourceOrder,
  getSourceOrder,
  // 供启动期健康自检逐个打真实查询用
  searchSearxng,
  searchBing,
  searchDuckDuckGo,
  searchOpenSerp,
  SOURCES
}
