const { spawn, spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');

// 微信推票消息：不设数量限制，全部保留
// EVENTS_LIMIT 仅作为兜底防御性上限，避免极端情况下内存爆炸（实际不会触达）
const EVENTS_LIMIT = 1000000;

// 营销消息判断
function isMarketingMessage(text) {
  if (!text || typeof text !== 'string') return true;
  const t = text.replace(/\s+/g, '');
  const marketingKeywords = [
    '办一个', '518元', '2980元', '合作后', '加入前', '加入后',
    '报喜', '学员', '回放课', '直播回放', '领取福利', '尾声福利',
    '办理链接', '优惠券', '新客户特惠', '官方指导价',
    '回复【', '回【', '回复8', '回复1', '回复2', '回复6',
    '少走很多弯路', '大胆尝试一次', '被套亏损严重',
    '特惠', '办一个试试', '试试吧', '也不贵',
    '给您申请', '课程', '教学软件',
  ];
  const marketKeywords = [
    '放量', '反弹', '量能', '涨停', '跌停', '板块', '科技股', '消费',
    '仓位', '短线', '超短', '快进快出', '行情', '大盘', '走势', '趋势',
    '支撑', '压力', '均线', 'K线', 'MACD', '布林', '创业板', '科创板',
    '沪深', '上证', '深证', '北证', '熔断', '跌停板', '涨停板',
    '主力', '资金流入', '资金流出', '北向资金', '融资融券',
    '洗盘', '出货', '吸筹', '拉升', '打压', '诱多', '诱空',
    '突破', '回踩', '企稳', '调整', '震荡', '反包', '打板',
    '早盘', '尾盘', '集合竞价', '盘后', '盘中',
    '牛市', '熊市', '猴市', '结构性行情',
  ];
  let score = 0;
  for (const kw of marketingKeywords) { if (t.includes(kw)) score -= 2; }
  for (const kw of marketKeywords) { if (t.includes(kw)) score += 3; }
  const stockCount = (t.match(/\d{6}/g) || []).length;
  if (stockCount > 0) score += 1;
  const hasTestimonial = t.includes('案例为个别客户') || t.includes('历史收益') || t.includes('历史特定时间');
  if (hasTestimonial && score < 3) return true;
  return score < 0;
}

// 消息分类: 有6位有效股票代码=stock_pick(推票), 有推票回顾关键词=stock_pick, 
// 有营销关键词=marketing, 其余=market_news
// 注意：仅有股票名称但没有6位代码的，不算推票（如"共封装光学""东晶电子"这种只有名字的不算）
// 营销消息关键词/模式（命中即归类为 marketing）
const MARKETING_PATTERNS = [
  /合作|加入|办一个|办理|会员|服务|咨询/,
  /元\/(月|年|个月|季度|周期)/,
  /\d{3,4}元/,
  /不是荐股|不构成投资建议|仅供.*参考/,
  /投资有风险.*入市须谨慎|入市有风险/,
  /老师|投顾|助理|客服|顾问/,
  /添加|加微信|添加微信|扫码|二维码/,
  /名额|限量|限时|优惠|折扣|涨价/,
  /回复.*数字|回复\[\d+\]/,
];

// 推票回顾关键词 - 即使没有股票代码，只要有【股票名】+这些关键词也算推票
const STOCK_PICK_REVIEW_PATTERNS = [
  /【[^】]{2,10}】[^】]*(涨停|跌停|连板|T\+1|T\+0|累计涨|封板|打板|强势涨停|两连板|2连板|3连板)/,
  /^(?:今日|早盘|午盘|尾盘|盘后).*(?:推荐|观察|优选|票来了|每日掘金)/,
  /票来了|今日早盘观察|短线优选|每日推荐|每日掘金/,
  /【[^】]{2,10}】/,  // 有【】包裹的股票名，大概率是推票
];

// 行情消息关键词 - 没有推票特征时，有这些关键词归为行情
const MARKET_NEWS_PATTERNS = [
  /大盘|走势|趋势|板块|行情|市场|指数|沪指|深成指|创业板指/,
  /放量|反弹|回调|震荡|调整|突破|回踩|企稳|反包/,
  /资金流入|资金流出|北向资金|融资融券|主力|机构/,
  /早盘|尾盘|盘后|盘中|集合竞价/,
  /涨停板|跌停板|熔断/,
  /牛股|妖股|龙头|热点|题材|概念/,
];

// 营销关键词补充（更细致的识别）
const MARKETING_KEYWORDS = [
  '办一个', '518元', '2980元', '合作后', '加入前', '加入后',
  '报喜', '学员', '回放课', '直播回放', '领取福利', '尾声福利',
  '办理链接', '优惠券', '新客户特惠', '官方指导价',
  '回复【', '回【', '回复8', '回复1', '回复2', '回复6',
  '少走很多弯路', '大胆尝试一次', '被套亏损严重',
  '特惠', '办一个试试', '试试吧', '也不贵',
  '给您申请', '课程', '教学软件',
  '加微信', '添加微信', '扫码加', '二维码加',
  '名额有限', '限时优惠', '原价', '现价', '折扣',
  '老师好', '老师建议', '操作建议', '仅供参考',
  '风险提示', '不构成', '投资建议',
];

function categorizeMessage(text, stocksJson) {
  try {
    if (!text || typeof text !== 'string' || !text.trim()) return 'market_news';
    const cleanText = text.replace(/\s+/g, '');

    // === 优先级：股票检测 > 营销检测 > 行情检测 ===
    // 原因：含股票代码的消息即使有营销内容，对投资人分析更重要

    // 1. 从 stocksJson 判断：必须有一个股票带有效的6位代码
    try {
      const stocks = JSON.parse(stocksJson || '[]');
      const hasValidStock = stocks.some(s => s && s.code && /^\d{6}$/.test(String(s.code).trim()));
      if (hasValidStock) return 'stock_pick';
    } catch {}

    // 2. 文本中包含【股票名 6位代码】格式
    const bracketCodeMatch = text.match(/【\s*[^】]*?\s+\d{6}\s*】/);
    if (bracketCodeMatch) return 'stock_pick';

    // 3. 文本中包含6位数字股票代码且前后非数字（避免身份证/电话号误判）
    const codeMatches = cleanText.match(/(?:^|[^\d])(\d{6})(?:$|[^\d])/g) || [];
    if (codeMatches.length > 0) return 'stock_pick';
    if (/^\d{6}$/.test(cleanText)) return 'stock_pick';

    // 4. 推票回顾模式：【股票名】+ 涨停/连板/T+1 等关键词（即使没有代码也算）
    for (const pattern of STOCK_PICK_REVIEW_PATTERNS) {
      try { if (pattern.test(text)) return 'stock_pick'; } catch {}
    }

    // 5. 有【股票名】格式且包含推荐相关关键词
    const hasStockBracket = /【[#⭕🔥\s]*[^】]{2,10}[#⭕🔥\s]*】/.test(text);
    const hasRecommendKeyword = /(?:推荐|观察|优选|票|来|掘金|选|关注|留意|分享|买入|介入|布局)/.test(text);
    if (hasStockBracket && hasRecommendKeyword) return 'stock_pick';

    // 6. 营销消息检查（只有在没有股票特征时才检查）
    for (const p of MARKETING_PATTERNS) {
      try { if (p.test(text)) return 'marketing'; } catch {}
    }
    let marketingScore = 0;
    for (const kw of MARKETING_KEYWORDS) {
      if (text.includes(kw)) marketingScore += 2;
    }
    if (marketingScore >= 3) return 'marketing';

    // 7. 行情消息关键词
    let newsScore = 0;
    for (const pattern of MARKET_NEWS_PATTERNS) {
      try { if (pattern.test(text)) newsScore += 2; } catch {}
    }
    if (newsScore >= 2) return 'market_news';

    // 8. 如果有【】但没有推票关键词，仍然倾向于推票
    if (hasStockBracket) return 'stock_pick';

    // 9. 兜底：如果有少量行情关键词，归为行情
    const fallbackNewsKw = ['大盘', '走势', '板块', '行情', '放量', '反弹', '回调', '震荡', '突破', '回踩', '企稳', '市场', '指数', '沪指', '深成指', '创业板', '资金', '主力'];
    for (const kw of fallbackNewsKw) {
      if (text.includes(kw)) return 'market_news';
    }

    // 10. 再次兜底：文本非空但无任何匹配，归为行情（避免显示"未知"）
    if (text.trim().length > 0) return 'market_news';

    return 'market_news';
  } catch (err) {
    console.error('[分类] categorizeMessage 异常:', err.message);
    return 'market_news';
  }
}

// 黑名单匹配：命中任一启用的规则即返回 true（跳过处理，不入库不提取）
// 类型: sender(发送人完全匹配) / chat_name(群聊名完全匹配) / keyword(关键词包含匹配)
let _blacklistCache = [];
let _blacklistCacheTime = 0;
const BLACKLIST_CACHE_TTL = 60000;  // 60秒缓存，避免每消息都查库
async function isBlacklisted({ sender = '', chatName = '', text = '' }) {
  try {
    const db = getPool();
    const now = Date.now();
    if (now - _blacklistCacheTime > BLACKLIST_CACHE_TTL || !_blacklistCache.length) {
      const [rows] = await db.query('SELECT type, value FROM wechat_blacklist WHERE enabled = 1');
      _blacklistCache = rows;
      _blacklistCacheTime = now;
    }
    for (const item of _blacklistCache) {
      const v = String(item.value || '').trim();
      if (!v) continue;
      if (item.type === 'sender' && sender && String(sender).trim() === v) return true;
      if (item.type === 'chat_name' && chatName && String(chatName).trim() === v) return true;
      if (item.type === 'keyword' && text && String(text).includes(v)) return true;
    }
    return false;
  } catch (e) {
    // 表未创建或查询失败时不影响业务
    return false;
  }
}

// 手动刷新黑名单缓存（黑名单新增/删除/修改时调用）
function clearBlacklistCache() {
  _blacklistCache = [];
  _blacklistCacheTime = 0;
}

let pool = null;
function getPool() {
  if (pool) return pool;
  const mysql = require('mysql2/promise');
  pool = mysql.createPool({
    host: 'localhost', user: 'root', password: '1234',
    database: 'stock_calculator', dateStrings: true, timezone: '+08:00',
  });
  return pool;
}

const javaSource = path.join(__dirname, 'java', 'WechatStockExtractor.java');
const javaBuildDir = path.join(__dirname, '.launcher', 'java');
const javaClass = path.join(javaBuildDir, 'WechatStockExtractor.class');
const monitorSource = path.join(__dirname, 'java', 'WechatWindowMonitor.java');
const monitorClass = path.join(javaBuildDir, 'WechatWindowMonitor.class');
const windowReaderScript = path.join(__dirname, 'wechat_monitor.py');

const monitorState = {
  process: null,
  running: false,
  state: 'STOPPED',
  chatName: '',
  lastError: '',
  startedAt: '',
  events: [],
  stopping: false,
};

const investorNameCache = new Map();
let investorNameCacheTime = 0;
const INVESTOR_NAME_CACHE_TTL = 30000;

function normalizeInvestorKey(value) {
  return cleanSender(value)
    .normalize('NFKC')
    .toLocaleLowerCase('zh-CN')
    .replace(/[\s·•・._\-—–~～,，。:：;；'"“”‘’()（）[\]【】{}]+/g, '');
}

async function resolveCanonicalInvestorName(value) {
  const cleaned = cleanSender(value || '');
  if (!cleaned) return '';
  const key = normalizeInvestorKey(cleaned);
  if (!key) return cleaned;

  const now = Date.now();
  if (now - investorNameCacheTime > INVESTOR_NAME_CACHE_TTL) {
    investorNameCache.clear();
    investorNameCacheTime = now;
  }
  if (investorNameCache.has(key)) return investorNameCache.get(key);

  try {
    const db = getPool();
    const [rows] = await db.query(
      `SELECT sender FROM (
         SELECT sender, MAX(created_at) AS last_seen FROM wechat_events
         WHERE sender IS NOT NULL AND sender != '' AND sender != '未识别发送人'
         GROUP BY sender
         UNION ALL
         SELECT sender, MAX(updated_at) AS last_seen FROM wechat_tracking
         WHERE sender IS NOT NULL AND sender != '' AND sender != '未识别发送人'
         GROUP BY sender
       ) names ORDER BY last_seen DESC LIMIT 500`
    );
    for (const row of rows) {
      const existing = cleanSender(row.sender || '');
      if (existing && normalizeInvestorKey(existing) === key) {
        investorNameCache.set(key, existing);
        return existing;
      }
    }
  } catch (err) {
    console.error('归并投资人名称失败:', err.message);
  }

  investorNameCache.set(key, cleaned);
  return cleaned;
}

function safeDate(year, month, day) {
  const value = new Date(year, month - 1, day);
  if (value.getFullYear() !== year || value.getMonth() !== month - 1 || value.getDate() !== day) return '';
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

function detectDate(text, capturedAt) {
  // 推票日期一般在消息开头（"8月6日 星期四 早盘观察"），
  // 行情复盘里大量提到历史日期（"6月23日开启的赛道退潮"），
  // 所以只在前 100 字符里找，避免抓到复盘的历史日期。
  const head = String(text || '').slice(0, 100);
  const now = new Date();
  const year = now.getFullYear();
  const today = `${year}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;

  const cnHead = head.match(/(?:(20\d{2})年)?(\d{1,2})月(\d{1,2})日/);
  if (cnHead) {
    const y = Number(cnHead[1] || year);
    const m = Number(cnHead[2]);
    const d = Number(cnHead[3]);
    const candidate = safeDate(y, m, d);
    if (candidate && !isDateTooOld(candidate, now, 14)) return candidate;
  }
  const dotHead = head.match(/(?:^|\D)(\d{1,2})[./-](\d{1,2})(?!\d)/);
  if (dotHead) {
    const candidate = safeDate(year, Number(dotHead[1]), Number(dotHead[2]));
    if (candidate && !isDateTooOld(candidate, now, 14)) return candidate;
  }

  // 头部没找到，再在全文找一次，但必须和 capturedAt 日期一致（±1天内）
  if (capturedAt) {
    const capDate = safeDateFromIso(capturedAt);
    if (capDate) {
      const cnAll = String(text || '').match(/(?:(20\d{2})年)?(\d{1,2})月(\d{1,2})日/);
      if (cnAll) {
        const candidate = safeDate(Number(cnAll[1] || year), Number(cnAll[2]), Number(cnAll[3]));
        if (candidate && datesClose(candidate, capDate)) return candidate;
      }
    }
  }

  return '';
}

function safeDateFromIso(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(+d)) return '';
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function isDateTooOld(dateStr, now, maxDays) {
  const [y, m, d] = dateStr.split('-').map(Number);
  const candidate = new Date(y, m - 1, d);
  const diffMs = now - candidate;
  return Math.abs(diffMs) > maxDays * 24 * 60 * 60 * 1000;
}

function datesClose(a, b) {
  const da = new Date(a);
  const db = new Date(b);
  return Math.abs(da - db) <= 24 * 60 * 60 * 1000;
}

function sanitizeRecommendationDate(recommendationDate, capturedAt) {
  if (!recommendationDate) return '';
  if (!capturedAt) return recommendationDate;
  const capDate = safeDateFromIso(capturedAt);
  if (!capDate) return recommendationDate;
  // 差距超过 2 天大概率是从复盘历史里误抓的（比如"6月23日开启的赛道退潮"）
  if (isDateTooOld(recommendationDate, new Date(capDate), 2)) return '';
  return recommendationDate;
}

const INVALID_SENDERS = new Set([
  '', '微信', '微信电脑版', 'WeChat', 'wechat', '聊天', '消息',
  '文件传输助手', '文件助手', '系统消息', '系统', '通知', '服务通知',
  '订阅号消息', '服务号', '公众号', '新闻', '腾讯新闻',
  '全部会话', '会话', '联系人', '通讯录', '朋友圈',
  '发现', '我', '收藏', '表情', '视频号',
  '看盘', '消息列表', '消息管理器',
]);

function cleanSender(value) {
  let s = String(value || '').trim()
    .replace(/^[【[]|[】\]]$/g, '')
    .trim();
  // 去掉尾部常见时间后缀（如"8月5日""星期三""09:06"）
  s = s.replace(/\s*(?:星期[一二三四五六日天])?\s*\d{1,2}:\d{2}\s*$/g, '').trim();
  s = s.replace(/\s*\d{1,2}月\d{1,2}日(?:星期[一二三四五六日天])?\s*$/g, '').trim();
  if (INVALID_SENDERS.has(s)) return '';
  if (s.length > 20) s = s.slice(0, 20);
  return s;
}

function isUsefulHeader(line) {
  const compact = line.replace(/\s+/g, '');
  if (/^(?:👉|回复|回【|官方指导价|新客户特惠)/.test(compact) || /(?:合作后|预约“?每日掘金|仓位跟上)/.test(compact)) return false;
  return ['今日早盘观察', '短线优选', '每日推荐', '每日掘金', '票来了'].some(word => compact.includes(word))
    || /\d{1,2}月\d{1,2}日.*(?:观察|优选|推荐|股票|票)/.test(compact);
}

function cleanUsefulLine(line) {
  return line.replace(/^[，,、；;\s]+/, '').trim();
}

// Non-stock name blacklist
const NON_STOCK_NAMES = [
  '风险提示', '风险提示：', '风险提示:',
  '免责声明', '免责声明：',
  '投资建议', '投资建议：',
  '仅供参考', '仅供参考。',
  '不构成', '不构成投资建议',
  '市场有风险', '投资有风险',
  '入市须谨慎',
  '点击', '点击查看',
  '打开', '打开链接',
  '复制', '复制链接',
  '链接', '网址',
  '详情', '详情请',
  '完整版',
  '早盘观察池',
  '观察池',
  '推送',
  '每日', '今日',
  '早盘', '尾盘',
  '盘后', '盘中',
];

function isNonStockName(name) {
  if (!name) return true;
  const trimmed = name.trim();
  return NON_STOCK_NAMES.some(nonStock => trimmed === nonStock || trimmed.startsWith(nonStock));
}

function codeIsPartOfLongerNumber(line, codeStart, code) {
  const codeEnd = codeStart + code.length;
  // Check if there are more digits after the code
  if (codeEnd < line.length && /\d/.test(line[codeEnd])) {
    return true;
  }
  // Check if preceded by a letter (like A in A047062) - likely part of license number
  if (codeStart > 0 && /[a-zA-Z]/.test(line[codeStart - 1])) {
    return true;
  }
  // Check if preceded by more digits
  if (codeStart > 0 && /\d/.test(line[codeStart - 1])) {
    let start = codeStart - 1;
    while (start >= 0 && /\d/.test(line[start])) start--;
    const totalLen = codeEnd - start - 1;
    if (totalLen > 6) return true;
  }
  return false;
}

function extractUrls(text) {
  const urlRegex = /https?:\/\/[\w\-._~:/?#[\]@!$&'()*+,;=%]+/g;
  const urls = [];
  let match;
  while ((match = urlRegex.exec(text)) !== null) {
    let url = match[0];
    // Clean trailing punctuation
    while (url.endsWith('。') || url.endsWith('.') || url.endsWith(',')) {
      url = url.slice(0, -1);
    }
    if (!urls.includes(url)) {
      urls.push(url);
    }
  }
  return urls;
}

function extractWithJavascript(rawText, senderHint = '') {
  const normalized = String(rawText || '').replace(/\r\n?/g, '\n').trim();
  let sender = cleanSender(senderHint);
  const stocks = [];
  const urls = extractUrls(normalized);
  const usefulLines = [];
  let nonEmptyLineCount = 0;

  for (const originalLine of normalized.split('\n')) {
    let line = originalLine.trim();
    if (!line) continue;
    nonEmptyLineCount += 1;

    if (!sender) {
      const labelled = line.match(/^(?:发送人|联系人|群聊)\s*[:：]\s*(.+)$/);
      const dateTimeSender = line.match(/^(.{2,30}?)\s+\d{1,2}月\d{1,2}日\s+(?:星期[一二三四五六日天])?\s*\d{1,2}:\d{2}\s*[:：]?$/);
      const timed = line.match(/^(.{1,40}?)\s+(?:上午|下午)?\s*\d{1,2}:\d{2}$/);
      const inline = !/^https?:/i.test(line) && line.match(/^([^【】\[\]：:]{1,30})[:：]\s*(.+)$/);
      const fromPattern = line.match(/^来自[-—–\s]*([^-—–\s]{2,10})/);
      const sayPattern = line.match(/^([^【】\[\]：:]{2,10})\s*说\s*[:：]/);
      const senderColon = line.match(/^发送人\s*[:：]\s*(.+)$/);
      
      if (labelled) {
        sender = cleanSender(labelled[1]);
        continue;
      }
      if (senderColon) {
        sender = cleanSender(senderColon[1]);
        continue;
      }
      if (dateTimeSender && !/\d{6}/.test(line)) {
        let raw = dateTimeSender[1].trim();
        const dashMatch = raw.match(/[-—–]\s*(.+)$/);
        sender = cleanSender(dashMatch ? dashMatch[1] : raw);
        continue;
      }
      if (timed && !/\d{6}/.test(line)) {
        sender = cleanSender(timed[1]);
        continue;
      }
      if (fromPattern && !/\d{6}/.test(line)) {
        sender = cleanSender(fromPattern[1]);
        continue;
      }
      if (sayPattern && !/\d{6}/.test(line)) {
        sender = cleanSender(sayPattern[1]);
        continue;
      }
      if (inline && !/\d{6}/.test(line)) {
        sender = cleanSender(inline[1]);
        line = inline[2].trim();
      }
    }

    // Helper: extract logic from Chinese parentheses after a stock code
    const extractLogic = (line, code) => {
      const idx = line.indexOf(code);
      if (idx < 0) return '';
      const after = line.slice(idx + code.length);
      const m = after.match(/[（(]\s*([^）)]+?)\s*[）)]/);
      return m ? m[1].trim() : '';
    };

    // Pattern 1: 【股票名 6位代码】format
    const stockPattern1 = /【\s*([^】]*?)\s+(\d{6})\s*】/g;
    let match;
    while ((match = stockPattern1.exec(line)) !== null) {
      const name = match[1].replace(/\s+/g, '').replace(/^[⭕🔥\[\]红包]+/, '');
      if (!name || isNonStockName(name)) continue;
      const logic = extractLogic(line, match[2]);
      const stock = { name, code: match[2], logic };
      const existingIndex = stocks.findIndex(item => item.code === stock.code);
      if (existingIndex === -1) stocks.push(stock);
      else if (logic && !stocks[existingIndex].logic) stocks[existingIndex].logic = logic;
    }

    // Pattern 2: 【股票名】followed by bare code on same line
    const stockPattern2 = /【\s*([^】]{2,15})\s*】\s*(?:[^\d]*?)(\d{6})/g;
    while ((match = stockPattern2.exec(line)) !== null) {
      const name = match[1].replace(/\s+/g, '').replace(/^[⭕🔥\[\]红包]+/, '');
      if (!name || isNonStockName(name)) continue;
      const logic = extractLogic(line, match[2]);
      const stock = { name, code: match[2], logic };
      const existingIndex = stocks.findIndex(item => item.code === stock.code);
      if (existingIndex === -1) stocks.push(stock);
      else if (logic && !stocks[existingIndex].logic) stocks[existingIndex].logic = logic;
    }

    // Pattern 3: bare "股票名 6位代码" without brackets (more conservative)
    const stockPattern3 = /([\u4e00-\u9fa5A-Za-z]{2,10})\s+(\d{6})(?!\d)/g;
    while ((match = stockPattern3.exec(line)) !== null) {
      const name = match[1].replace(/\s+/g, '');
      const codeStart = match.index + match[1].length + 1; // +1 for the space
      if (/^\d{1,2}[:：]\d{2}/.test(line)) continue;
      if (!name || isNonStockName(name)) continue;
      // Skip if code is part of a longer number (like license number)
      if (codeIsPartOfLongerNumber(line, codeStart, match[2])) continue;
      const logic = extractLogic(line, match[2]);
      const stock = { name, code: match[2], logic };
      const existingIndex = stocks.findIndex(item => item.code === stock.code);
      if (existingIndex === -1) stocks.push(stock);
      else if (logic && !stocks[existingIndex].logic) stocks[existingIndex].logic = logic;
    }

    // Always include all lines to preserve full message content
    usefulLines.push(cleanUsefulLine(line));
  }

  return {
    sender: sender || '',
    recommendationDate: detectDate(normalized),
    originalMessage: normalized,
    usefulMessage: usefulLines.join('\n'),
    filteredLineCount: Math.max(0, nonEmptyLineCount - usefulLines.length),
    stocks,
    urls,
    engine: 'javascript-fallback',
  };
}

function findJavaTools() {
  const candidates = [
    process.env.JAVA_HOME,
    path.join(process.env.USERPROFILE || '', '.jdks', 'ms-21.0.11'),
  ].filter(Boolean);
  for (const home of candidates) {
    const java = path.join(home, 'bin', 'java.exe');
    const javac = path.join(home, 'bin', 'javac.exe');
    if (fs.existsSync(java) && fs.existsSync(javac)) return { java, javac };
  }
  const javaCheck = spawnSync('java', ['-version'], { encoding: 'utf8', windowsHide: true, timeout: 3000 });
  const javacCheck = spawnSync('javac', ['-version'], { encoding: 'utf8', windowsHide: true, timeout: 3000 });
  if (!javaCheck.error && javaCheck.status === 0 && !javacCheck.error && javacCheck.status === 0) {
    return { java: 'java', javac: 'javac' };
  }
  return null;
}

function javaAvailable() {
  return Boolean(findJavaTools());
}

function ensureJavaCompiled() {
  const tools = findJavaTools();
  if (!tools) throw new Error('未找到 JDK，请安装 Java 17 或更高版本');
  fs.mkdirSync(javaBuildDir, { recursive: true });
  const newestSourceTime = Math.max(fs.statSync(javaSource).mtimeMs, fs.statSync(monitorSource).mtimeMs);
  const oldestClassTime = Math.min(
    fs.existsSync(javaClass) ? fs.statSync(javaClass).mtimeMs : 0,
    fs.existsSync(monitorClass) ? fs.statSync(monitorClass).mtimeMs : 0,
  );
  if (oldestClassTime >= newestSourceTime) return tools;
  const compiled = spawnSync(tools.javac, ['-encoding', 'UTF-8', '-d', javaBuildDir, javaSource, monitorSource], {
    encoding: 'utf8',
    windowsHide: true,
    timeout: 20000,
  });
  if (compiled.error || compiled.status !== 0) {
    throw new Error((compiled.stderr || compiled.stdout || compiled.error?.message || 'Java 编译失败').trim());
  }
  return tools;
}
function extractWechatStocks(rawText, senderHint = '') {
  if (!javaAvailable()) return extractWithJavascript(rawText, senderHint);
  try {
    const tools = ensureJavaCompiled();
    const senderArg = Buffer.from(String(senderHint || ''), 'utf8').toString('base64');
    const executed = spawnSync(tools.java, ['-cp', javaBuildDir, 'WechatStockExtractor', senderArg], {
      input: String(rawText || ''),
      encoding: 'utf8',
      windowsHide: true,
      timeout: 10000,
      maxBuffer: 5 * 1024 * 1024,
    });
    if (executed.error || executed.status !== 0) {
      throw new Error((executed.stderr || executed.stdout || executed.error?.message || 'Java 执行失败').trim());
    }
    return { ...JSON.parse(executed.stdout), engine: 'java' };
  } catch (error) {
    return { ...extractWithJavascript(rawText, senderHint), javaError: error.message };
  }
}

// 允许 server.js 注册带学习的分类器（未注册则退回本地简单分类）
let _categoryClassifierHook = null;
function setCategoryClassifierHook(fn) { _categoryClassifierHook = fn; }

// AI 补全推荐逻辑 hook（由 server.js 注册，推票消息入库后异步触发）
let _autoFillLogicHook = null;
function setAutoFillLogicHook(fn) { _autoFillLogicHook = fn; }

async function saveEventToDb(event) {
  try {
    // 先对发送人/聊天名做一次清洗，过滤"微信""文件传输助手"等无效值
    let cleanEventSender = cleanSender(event.sender || '');
    const cleanChatName = cleanSender(event.chatName || '');

    // 发送人识别优先级：1) 已有 sender 2) chat_name 去掉后缀后作为 sender 3) 从消息内容再次尝试提取
    if (!cleanEventSender && cleanChatName) {
      // 尝试从 chat_name 中去掉日期时间后缀后当作 sender
      cleanEventSender = cleanSender(cleanChatName);
      // 如果 chat_name 看起来是"某某群"这种群聊名，再尝试用提取器从消息内找人名
      if (cleanEventSender && /群|交流|讨论|分享|服务|客户$/.test(cleanEventSender)) {
        try {
          const msgText = event.usefulMessage || event.originalMessage || '';
          const reextract = extractWithJavascript(msgText, '');
          if (reextract && reextract.sender) cleanEventSender = cleanSender(reextract.sender);
        } catch (_) {}
      }
    }

    // 黑名单前置检查：命中则跳过整条消息（不入库、不提取、不追踪）
    const hit = await isBlacklisted({
      sender: cleanEventSender,
      chatName: cleanChatName,
      text: event.usefulMessage || event.originalMessage || '',
    });
    if (hit) return event.category || 'market_news';

    const db = getPool();
    const stocksJson = JSON.stringify(event.stocks || []);
    const urlsJson = JSON.stringify(event.urls || []);
    const now = Date.now();
    const id = event.id || `${now}-${Math.random().toString(36).slice(2, 8)}`;
    const messageText = event.usefulMessage || event.originalMessage || '';
    // 自动分类: stock_pick / market_news / marketing（优先用 server.js 注册的带学习分类器）
    let category = 'market_news';
    try {
      if (_categoryClassifierHook) {
        const hookResult = await _categoryClassifierHook(messageText, stocksJson);
        if (hookResult && ['stock_pick', 'market_news', 'marketing'].includes(hookResult)) {
          category = hookResult;
        } else {
          category = categorizeMessage(messageText, stocksJson);
        }
      } else {
        category = categorizeMessage(messageText, stocksJson);
      }
    } catch (catErr) {
      console.error('[分类] saveEventToDb 分类异常，使用本地兜底:', catErr.message);
      category = categorizeMessage(messageText, stocksJson);
    }
    if (!category || !['stock_pick', 'market_news', 'marketing'].includes(category)) {
      category = 'market_news';
    }
    // 最终 sender 规范化，识别不到就留空（''），不写"未识别发送人"
    const finalSender = await resolveCanonicalInvestorName(cleanEventSender) || '';

    // 同 sender + 同消息前缀（前120字）+ 同一天 → 视为重复，跳过
    if (finalSender && messageText) {
      const textPrefix = String(messageText).trim().slice(0, 120);
      const capturedDay = (event.capturedAt || '').slice(0, 10);
      try {
        const [dupRows] = await db.query(
          `SELECT id FROM wechat_events WHERE sender = ? AND LEFT(message_text, 120) = ? AND captured_at LIKE ? LIMIT 1`,
          [finalSender, textPrefix, capturedDay + '%']
        );
        if (dupRows.length) {
          console.log(`[去重] 跳过重复消息 sender=${finalSender} id=${dupRows[0].id}`);
          return category;
        }
      } catch (_) { /* 去重查询失败就继续插入 */ }
    }

    await db.execute(
      `INSERT INTO wechat_events (id, chat_name, sender, message_text, message_time, captured_at, stocks_json, created_at, category, urls_json)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE chat_name=VALUES(chat_name),
         sender = CASE
           WHEN (wechat_events.sender IS NULL OR wechat_events.sender = '' OR wechat_events.sender = '未识别发送人') AND VALUES(sender) != '' THEN VALUES(sender)
           ELSE wechat_events.sender
         END,
         message_text=VALUES(message_text),
         message_time=VALUES(message_time), captured_at=VALUES(captured_at),
         stocks_json=VALUES(stocks_json), category=VALUES(category),
         urls_json=VALUES(urls_json)`,
      [id, cleanChatName, finalSender, messageText,
       event.messageTime || '', event.capturedAt || '', stocksJson, now, category, urlsJson]
    );
    // 推荐股票消息自动同步到追踪表，并自动归到规范化后的投资人名下。
    // 注意：sender 为空的不写入追踪表（避免投资人分析中出现"未识别发送人"），等识别到 sender 后再补
    if (category === 'stock_pick' && finalSender) {
      try {
        const stocks = JSON.parse(stocksJson || '[]');
        const validStocks = stocks.filter(s => s && s.code && /^\d{6}$/.test(String(s.code).trim()));
        if (validStocks.length > 0) {
          const pickDate = normalizeDateStr(event.capturedAt || event.messageTime || String(now));
          if (pickDate) {
            for (const stock of validStocks) {
              const trackingId = `${id}_${stock.code}`;
              await db.execute(
                `INSERT IGNORE INTO wechat_tracking
                  (id, event_id, chat_name, sender, stock_code, stock_name, pick_date, pick_message, created_at, updated_at)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                [trackingId, id, cleanChatName, finalSender,
                 stock.code, stock.name || '', pickDate, messageText, now, now]
              );
            }
          }
        }
      } catch (e) {
        console.error('自动同步追踪表失败:', e.message);
      }
    }
    // 推票消息且存在 logic 为空的股票时，异步 AI 补全
    if (category === 'stock_pick' && _autoFillLogicHook) {
      const stocks = JSON.parse(stocksJson || '[]');
      if (stocks.some(s => s && s.code && !s.logic)) {
        _autoFillLogicHook(id, messageText, stocks).catch(() => {});
      }
    }
    return category;
  } catch (err) {
    console.error('保存微信消息到数据库失败:', err.message);
    return event.category || 'market_news';
  }
}

// 日期标准化：支持 ISO时间戳/毫秒时间戳/YYYY-MM-DD/YYYY-M-D
function normalizeDateStr(input) {
  if (!input) return '';
  if (typeof input === 'number') {
    const d = new Date(input);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }
  const s = String(input).trim();
  const m = s.match(/(\d{4})[-./](\d{1,2})[-./](\d{1,2})/);
  if (m) return `${m[1]}-${String(m[2]).padStart(2, '0')}-${String(m[3]).padStart(2, '0')}`;
  if (/^\d+$/.test(s)) {
    const d = new Date(Number(s));
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }
  // ISO 格式 2026-08-04T12:00:00.000Z
  const iso = s.match(/(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
  return '';
}

async function loadEventsFromDb() {
  try {
    const db = getPool();
    // 不设 LIMIT，加载全部消息
    const [rows] = await db.query('SELECT * FROM wechat_events ORDER BY created_at DESC');
    return rows.map(r => {
      let cat = r.category;
      if (!cat || !['stock_pick', 'market_news', 'marketing'].includes(cat)) {
        cat = 'market_news';
      }
      return {
        id: r.id,
        chatName: r.chat_name,
        sender: r.sender,
        usefulMessage: r.message_text,
        messageTime: r.message_time,
        capturedAt: r.captured_at,
        stocks: JSON.parse(r.stocks_json || '[]'),
        urls: JSON.parse(r.urls_json || '[]'),
        category: cat,
      };
    });
  } catch (err) {
    console.error('加载微信消息失败:', err.message);
    return [];
  }
}

async function pushMonitorEvent(event) {
  try {
    // 清洗 recommendationDate：如果它和 capturedAt 差太远（> 7天），
    // 说明是从行情复盘的历史描述里误提取的（如"6月23日开启的赛道退潮"），清掉它
    const recommendationDate = sanitizeRecommendationDate(event.recommendationDate, event.capturedAt);

    // 先对发送人/聊天名做一次清洗
    const cleanEventSender = cleanSender(event.sender || '');
    const cleanChatName = cleanSender(event.chatName || '');
    const canonicalSender = await resolveCanonicalInvestorName(cleanEventSender);
    const cleanedEvent = { ...event, sender: canonicalSender, chatName: cleanChatName, recommendationDate };

    // 先检查黑名单，命中则跳过（不加入UI、不入库）
    const hit = await isBlacklisted({
      sender: cleanEventSender,
      chatName: cleanChatName,
      text: cleanedEvent.usefulMessage || cleanedEvent.originalMessage || '',
    });
    if (hit) return;
    
    const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const fullEvent = { ...cleanedEvent, id };
    // 先异步入库 + 带学习的分类，拿到最终 category 后再推入内存，
    // 避免"先显示本地分类再被学习分类覆盖"的闪烁
    const finalCategory = await saveEventToDb(fullEvent);
    fullEvent.category = finalCategory || 'market_news';
    monitorState.events.unshift(fullEvent);
  } catch (err) {
    console.error('[推送消息] pushMonitorEvent 异常:', err.message);
  }
}

function handleMonitorLine(line) {
  if (monitorState.stopping) return;
  const value = String(line || '').trim();
  if (!value.startsWith('{')) return;
  try {
    const event = JSON.parse(value);
    if (event.type === 'ready') {
      monitorState.state = 'READY';
      monitorState.lastError = '';
    } else if (event.type === 'state') {
      monitorState.state = event.state || 'WATCHING';
      monitorState.chatName = event.chatName || '';
    } else if (event.type === 'error') {
      monitorState.state = 'ERROR';
      monitorState.lastError = event.message || '微信窗口读取失败';
    } else if (event.type === 'stock-message') {
      monitorState.state = 'WATCHING';
      monitorState.chatName = event.chatName || monitorState.chatName;
      pushMonitorEvent(event);
    }
  } catch (error) {
    monitorState.lastError = `监听输出解析失败：${error.message}`;
  }
}

function startWechatMonitor() {
  if (monitorState.process && !monitorState.process.killed) return getWechatMonitorStatus();
  const tools = ensureJavaCompiled();
  monitorState.stopping = false;
  monitorState.running = true;
  monitorState.state = 'STARTING';
  monitorState.lastError = '';
  monitorState.startedAt = new Date().toISOString();

  const child = spawn(tools.java, ['-cp', javaBuildDir, 'WechatWindowMonitor', windowReaderScript], {
    cwd: __dirname,
    windowsHide: true,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  monitorState.process = child;
  let stdoutBuffer = '';
  child.stdout.on('data', chunk => {
    stdoutBuffer += chunk.toString('utf8');
    const lines = stdoutBuffer.split(/\r?\n/);
    stdoutBuffer = lines.pop() || '';
    lines.forEach(handleMonitorLine);
  });
  child.stderr.on('data', chunk => {
    const message = chunk.toString('utf8').trim();
    if (message) monitorState.lastError = message;
  });
  child.on('error', error => {
    monitorState.lastError = error.message;
    monitorState.state = 'ERROR';
  });
  child.on('exit', (code, signal) => {
    if (stdoutBuffer.trim()) handleMonitorLine(stdoutBuffer);
    if (monitorState.process !== child) return;
    monitorState.process = null;
    monitorState.running = false;
    if (monitorState.state !== 'STOPPED') {
      monitorState.state = code === 0 || signal ? 'STOPPED' : 'ERROR';
      if (code && !monitorState.lastError) monitorState.lastError = `Java 监听进程退出，代码 ${code}`;
    }
  });
  return getWechatMonitorStatus();
}

function stopWechatMonitor() {
  const child = monitorState.process;
  monitorState.stopping = true;
  if (child && !child.killed) {
    if (process.platform === 'win32' && child.pid) {
      spawnSync('taskkill', ['/PID', String(child.pid), '/T', '/F'], { windowsHide: true, timeout: 5000 });
    } else {
      child.kill();
    }
  }
  monitorState.process = null;
  monitorState.running = false;
  monitorState.state = 'STOPPED';
  monitorState.chatName = '';
  return getWechatMonitorStatus();
}

function getWechatMonitorStatus() {
  return {
    running: monitorState.running,
    state: monitorState.state,
    chatName: monitorState.chatName,
    lastError: monitorState.lastError,
    startedAt: monitorState.startedAt,
    javaAvailable: javaAvailable(),
    events: monitorState.events.length ? monitorState.events : [],
  };
}

async function deleteWechatEvent(id) {
  monitorState.events = monitorState.events.filter(event => event.id !== id);
  try {
    const db = getPool();
    // 先查该事件关联的所有 tracking id，删 daily
    const [tkRows] = await db.query('SELECT id FROM wechat_tracking WHERE event_id = ?', [id]);
    if (tkRows.length) {
      const tkIds = tkRows.map(r => r.id);
      await db.execute(
        `DELETE FROM wechat_tracking_daily WHERE tracking_id IN (${tkIds.map(() => '?').join(',')})`,
        tkIds
      );
      await db.execute('DELETE FROM wechat_tracking WHERE event_id = ?', [id]);
    }
    await db.execute('DELETE FROM wechat_events WHERE id = ?', [id]);
  } catch (err) {
    console.error('删除微信消息失败:', err.message);
  }
  return { deleted: 1, remaining: monitorState.events.length };
}

// 同步更新内存中某条事件的分类/发送人（避免轮询 refreshStatus 把前端本地修改覆盖回去）
function updateWechatEventCategoryInMemory(id, category, sender) {
  const e = monitorState.events.find(ev => ev.id === id);
  if (e) {
    if (category !== null && category !== undefined) e.category = category;
    if (sender !== null && sender !== undefined) e.sender = sender;
  } else {
    console.warn(`[updateWechatEventCategoryInMemory] event ${id} not found in memory (total ${monitorState.events.length} events)`);
  }
}

async function clearWechatEvents() {
  const count = monitorState.events.length;
  monitorState.events = [];
  try {
    const db = getPool();
    // 先删 daily → tracking → events，避免孤儿数据
    const [allTk] = await db.query('SELECT id FROM wechat_tracking');
    if (allTk.length) {
      const allTkIds = allTk.map(r => r.id);
      await db.execute(
        `DELETE FROM wechat_tracking_daily WHERE tracking_id IN (${allTkIds.map(() => '?').join(',')})`,
        allTkIds
      );
    }
    await db.execute('DELETE FROM wechat_tracking');
    await db.execute('DELETE FROM wechat_events');
  } catch (err) {
    console.error('清空微信消息失败:', err.message);
  }
  return { deleted: count };
}

// 清理 DB 中不在 keepIds 列表里的事件及其 tracking + daily（硬删除，不保留）
async function purgeEventsNotInList(db, keepIds) {
  try {
    // 查需要删除的 event 对应的 tracking id
    const [orphanTk] = await db.query(
      `SELECT t.id FROM wechat_tracking t LEFT JOIN wechat_events e ON t.event_id = e.id
       WHERE e.id IS NULL OR t.event_id NOT IN (${keepIds.map(() => '?').join(',')})`,
      keepIds
    );
    if (orphanTk.length) {
      const tkIds = orphanTk.map(r => r.id);
      await db.execute(
        `DELETE FROM wechat_tracking_daily WHERE tracking_id IN (${tkIds.map(() => '?').join(',')})`,
        tkIds
      );
    }
    // 删该部分 tracking
    await db.execute(
      `DELETE FROM wechat_tracking WHERE event_id NOT IN (${keepIds.map(() => '?').join(',')})`,
      keepIds
    );
    // 删超出的 events（同时删不在 keepIds 的孤儿）
    const [delRes] = await db.execute(
      `DELETE FROM wechat_events WHERE id NOT IN (${keepIds.map(() => '?').join(',')})`,
      keepIds
    );
    return delRes.affectedRows || 0;
  } catch (err) {
    console.error('[purgeEventsNotInList] 清理异常:', err.message);
    return 0;
  }
}

async function initEventsFromDb() {
  if (monitorState.events.length === 0) {
    monitorState.events = await loadEventsFromDb();
  }
  // 不再启动时清理旧数据，全部保留
  // 启动一个定时任务：周期性重新识别 sender 为空的事件
  startSenderRetryJob();
}

// 周期重新识别 sender：对 wechat_events 中 sender 为空/"未识别发送人" 的记录，
// 结合 chat_name + message_text 重新提取 sender；识别成功后更新 event 并补 tracking（如需要）
let _senderRetryTimer = null;
function startSenderRetryJob() {
  if (_senderRetryTimer) return;

  // 立即执行一次重试
  setImmediate(() => runSenderRetry());

  // 每 15 秒重试一次（更频繁地尝试识别发送人）
  _senderRetryTimer = setInterval(runSenderRetry, 15000);
  if (_senderRetryTimer.unref) _senderRetryTimer.unref();
}

async function runSenderRetry() {
  try {
    const db = getPool();
    const [rows] = await db.query(
      `SELECT id, chat_name, sender, message_text, message_time, captured_at, category, stocks_json, created_at
       FROM wechat_events
       WHERE (sender IS NULL OR sender = '' OR sender = '未识别发送人')
       ORDER BY created_at DESC
       LIMIT 100`
    );
    if (!rows.length) return;
    let updated = 0;
    for (const r of rows) {
      let newSender = '';
      const cleanChatName = cleanSender(r.chat_name || '');
      // 1) 尝试从 chat_name 直接提取
      if (cleanChatName && !/群|交流|讨论|分享|服务|客户$/.test(cleanChatName)) {
        newSender = cleanChatName;
      }
      // 2) chat_name 是群名，再从文本里找
      if (!newSender && r.message_text) {
        try {
          const re = extractWithJavascript(r.message_text, '');
          if (re && re.sender) newSender = cleanSender(re.sender);
        } catch (_) {}
      }
      // 3) 再尝试 chat_name 本身（即使带"群"字也作为最后手段）
      if (!newSender && cleanChatName) newSender = cleanChatName;
      // 只有没找到新发送人才跳过（记录已包含空字符串发送者，下次还会重试）
      if (!newSender) continue;
      const canonical = await resolveCanonicalInvestorName(newSender);
      if (!canonical) continue;
      // 更新 event 的 sender
      await db.execute(
        `UPDATE wechat_events SET sender = ? WHERE id = ? AND (sender IS NULL OR sender = '' OR sender = '未识别发送人')`,
        [canonical, r.id]
      );
      updated++;
      // 如果是 stock_pick 分类且有股票代码，补写 tracking 记录
      if (r.category === 'stock_pick' && r.stocks_json) {
        try {
          const stocks = JSON.parse(r.stocks_json || '[]');
          const validStocks = stocks.filter(s => s && s.code && /^\d{6}$/.test(String(s.code).trim()));
          if (validStocks.length > 0) {
            const pickDate = normalizeDateStr(r.captured_at || r.message_time || String(r.created_at));
            const now = Date.now();
            for (const s of validStocks) {
              const trackingId = `${r.id}_${s.code}`;
              await db.execute(
                `INSERT IGNORE INTO wechat_tracking
                  (id, event_id, chat_name, sender, stock_code, stock_name, pick_date, pick_message, created_at, updated_at)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                [trackingId, r.id, cleanChatName, canonical,
                 s.code, s.name || '', pickDate, r.message_text || '', now, now]
              );
            }
          }
        } catch (_) {}
      }
      // 同步更新内存 monitorState
      updateWechatEventCategoryInMemory(r.id, null, canonical);
    }
    if (updated > 0) {
      console.log(`[senderRetry] 成功补识别 ${updated} 条消息的投资人`);
    }
  } catch (err) {
    console.error('[senderRetry] 重试识别失败:', err.message);
  }
}

module.exports = {
  extractWechatStocks,
  javaAvailable,
  startWechatMonitor,
  stopWechatMonitor,
  getWechatMonitorStatus,
  deleteWechatEvent,
  clearWechatEvents,
  initEventsFromDb,
  isBlacklisted,
  clearBlacklistCache,
  cleanSender,
  normalizeInvestorKey,
  resolveCanonicalInvestorName,
  updateWechatEventCategoryInMemory,
  setCategoryClassifierHook,
  setAutoFillLogicHook,
  EVENTS_LIMIT,
  monitorState,
};
