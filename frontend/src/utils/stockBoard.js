/**
 * A股 6 位代码 → 板块 / 市场归属的唯一判定入口。
 * 此前 formatter.js、打新日历、资产总览各维护一套前缀判断，容易走样，统一收敛到这里。
 */

// 规范板块键：
//   shmain 沪主板 | szmain 深主板 | star 科创板 | gem 创业板 | bj 北交所
//   cbSh 沪转债 | cbSz 深转债 | bshare 沪B股 | fund 基金/REITs | subscription 新股申购/配号
export function boardKindOf(code) {
  const c = String(code || '').trim()
  const p3 = c.slice(0, 3)
  const p2 = c.slice(0, 2)
  const p1 = c.slice(0, 1)

  if (['600', '601', '603', '605'].includes(p3)) return 'shmain'
  if (p2 === '68') return 'star'
  if (p3 === '900') return 'bshare'
  if (['000', '001', '002'].includes(p3)) return 'szmain'
  if (p2 === '30') return 'gem'
  if (p2 === '92' || p1 === '8') return 'bj'
  if (p2 === '11') return 'cbSh'
  if (p2 === '12') return 'cbSz'
  if (p1 === '7') return 'subscription'
  if (p1 === '5' || p2 === '15' || p2 === '16') return 'fund'
  return 'unknown'
}

// 板块键 → 中文展示名
export const BOARD_CN = {
  shmain: '沪主板',
  szmain: '深主板',
  star: '科创板',
  gem: '创业板',
  bj: '北交所',
  cbSh: '沪转债',
  cbSz: '深转债',
  bshare: '沪B股',
  fund: '基金',
  subscription: '申购代码',
  unknown: '其他'
}

// 交易所归属：沪 sh / 深 sz / 北 bj，无法归位返回 null
export function exchangeOf(code) {
  switch (boardKindOf(code)) {
    case 'shmain':
    case 'star':
      return 'sh'
    case 'szmain':
    case 'gem':
      return 'sz'
    case 'bj':
      return 'bj'
    default:
      return null
  }
}

/**
 * 新股 / 打新场景的上市板块判定：code 可能是申购代码，需归位到对应板块。
 * 返回打新日历使用的板块键：shmain / szmain / star / gem / bj / cb，无法识别返回 null
 */
export function ipoBoardOf(code, name = '') {
  if (String(name || '').includes('转债')) return 'cb'
  const c = String(code || '').trim()
  if (/^78/.test(c)) return 'star'      // 787xxx 科创板申购代码
  if (/^7[03]/.test(c)) return 'shmain' // 730xxx 沪市主板申购代码
  if (/^4/.test(c)) return 'bj'         // 沿用历史判定：4 开头归北交所
  const kind = boardKindOf(c)
  if (kind === 'shmain' || kind === 'szmain' || kind === 'star' || kind === 'gem' || kind === 'bj') return kind
  return null
}
