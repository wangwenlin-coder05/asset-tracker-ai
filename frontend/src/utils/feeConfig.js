import { reactive } from 'vue'
import { aiSettingsApi } from './api'

// A 股默认费率：佣金万 2.3（最低 5 元）、印花税 0.1%（仅卖出）、过户费 0.001%
export const DEFAULT_FEE = {
  commissionRate: 0.00023,
  minCommission: 5,
  stampTaxRate: 0.001,
  transferFeeRate: 0.00001,
}

// 后端存储「用户自定义佣金档位」的设置键，值为 JSON 字符串
export const FEE_PRESETS_KEY = 'stock_fee_presets'

// 默认档位：万 2.3、最低 5 元（老账户沿用）
export const DEFAULT_FEE_PRESETS = [
  { id: 'fee-default', name: '默认户', rate: 0.00023, min: 5 },
]

// 快捷添加的常见佣金档位（最低佣金默认 5 元）
export const QUICK_FEE_OPTIONS = [
  { label: '万2.5', rate: 0.00025 },
  { label: '万2', rate: 0.0002 },
  { label: '万1.5', rate: 0.00015 },
  { label: '万1.2', rate: 0.00012 },
  { label: '万1', rate: 0.0001 },
  { label: '万0.85', rate: 0.000085 },
]

// 华宝优惠费率档位（扫码新开户 / 企微认证），含 ETF/LOF、可转债(沪/深)、场内 LOF 申购扩展费率
export const HUABAO_PRESETS = [
  {
    name: '华宝 · 新开户（万1.154）',
    rate: 0.0001154, min: 5,
    etfRate: 0, etfMin: 0,
    cbRateSh: 0, cbRateSz: 0, cbMin: 0,
    lofDiscount: 0,
  },
  {
    name: '华宝 · 企微认证（万0.854）',
    rate: 0.0000854, min: 1,
    etfRate: 0.00006, etfMin: 0.2,
    cbRateSh: 0.000044, cbRateSz: 0.00008, cbMin: 0.5,
    lofDiscount: 0.1,
  },
]

export const feeConfig = reactive({ ...DEFAULT_FEE, activePresetName: DEFAULT_FEE_PRESETS[0].name })

export function toWan(rate) {
  return parseFloat((Number(rate || 0) * 10000).toFixed(4))
}

export function newFeePresetId() {
  return `fee-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`
}

function fallbackPresets() {
  return DEFAULT_FEE_PRESETS.map(p => ({ ...p }))
}

// 解析后端存储的档位 JSON，异常时回退到默认档位
export function parseFeePresets(raw) {
  if (!raw) return fallbackPresets()
  try {
    const arr = typeof raw === 'string' ? JSON.parse(raw) : raw
    if (!Array.isArray(arr)) return fallbackPresets()
    const list = arr
      .map(p => ({
        id: String(p.id || newFeePresetId()),
        name: String(p.name || '未命名'),
        rate: Number(p.rate) || 0,
        min: Number.isFinite(Number(p.min)) ? Number(p.min) : 5,
        etfRate: Number(p.etfRate) || 0,
        etfMin: Number(p.etfMin) || 0,
        cbRateSh: Number(p.cbRateSh) || 0,
        cbRateSz: Number(p.cbRateSz) || 0,
        cbMin: Number(p.cbMin) || 0,
        lofDiscount: Number(p.lofDiscount) || 0,
      }))
      .filter(p => p.rate > 0)
    return list.length ? list : fallbackPresets()
  } catch {
    return fallbackPresets()
  }
}

export function serializeFeePresets(list) {
  return JSON.stringify(
    (list || []).map(p => ({
      id: p.id, name: p.name, rate: Number(p.rate) || 0, min: Number(p.min) || 0,
      etfRate: Number(p.etfRate) || 0, etfMin: Number(p.etfMin) || 0,
      cbRateSh: Number(p.cbRateSh) || 0, cbRateSz: Number(p.cbRateSz) || 0, cbMin: Number(p.cbMin) || 0,
      lofDiscount: Number(p.lofDiscount) || 0,
    }))
  )
}

// “场内 LOF 申购折扣”文案：0.1 → “1折”、0.15 → “1.5折”；无效返回空串
export function zheLabel(ratio) {
  const r = Number(ratio)
  if (!(r > 0) || r >= 1) return ''
  const v = r * 10
  return (Number.isInteger(v) ? String(v) : v.toFixed(1)) + '折'
}

// 汇总档位扩展费率（ETF/LOF、可转债、场内 LOF 申购），供列表展示
export function feeExtras(p) {
  if (!p) return []
  const parts = []
  if (p.etfRate > 0) {
    parts.push(`ETF/LOF 万${toWan(p.etfRate)}${p.etfMin > 0 ? ` 最低${p.etfMin}元` : ''}`)
  }
  if (p.cbRateSh > 0 || p.cbRateSz > 0) {
    const sh = p.cbRateSh > 0 ? `万${toWan(p.cbRateSh)}` : '—'
    const sz = p.cbRateSz > 0 ? `万${toWan(p.cbRateSz)}` : '—'
    parts.push(`可转债 沪${sh}/深${sz}${p.cbMin > 0 ? ` 最低${p.cbMin}元` : ''}`)
  }
  if (p.lofDiscount > 0) {
    const z = zheLabel(p.lofDiscount)
    if (z) parts.push(`场内LOF申购 ${z}`)
  }
  return parts
}

export function applyFeeSettings(settings) {
  if (!settings) return
  const rate = Number(settings.stock_commission_rate)
  const min = Number(settings.stock_min_commission)
  if (Number.isFinite(rate) && rate > 0) feeConfig.commissionRate = rate
  if (Number.isFinite(min) && min >= 0) feeConfig.minCommission = min
  // 记录当前生效档位名称，供 T 计算器等面板标注费用来源
  const matched = parseFeePresets(settings[FEE_PRESETS_KEY])
    .find(p => Math.abs(p.rate - feeConfig.commissionRate) < 1e-9 && p.min === feeConfig.minCommission)
  feeConfig.activePresetName = matched?.name || '当前配置'
}

export async function loadFeeSettings() {
  try {
    applyFeeSettings(await aiSettingsApi.getSettings())
  } catch (_) {
    // 后端不可用时保持默认费率，不影响页面渲染
  }
}

// 佣金：按费率计算，不足最低佣金时取最低值
export function commissionOf(amount) {
  return Math.max((Number(amount) || 0) * feeConfig.commissionRate, feeConfig.minCommission)
}

// 买入费用：佣金 + 过户费
export function buyFeeParts(amount) {
  const amt = Number(amount) || 0
  const commission = commissionOf(amt)
  const transferFee = amt * feeConfig.transferFeeRate
  return { commission, transferFee, total: commission + transferFee }
}

// 卖出费用：佣金 + 印花税 + 过户费
export function sellFeeParts(amount) {
  const amt = Number(amount) || 0
  const commission = commissionOf(amt)
  const stampTax = amt * feeConfig.stampTaxRate
  const transferFee = amt * feeConfig.transferFeeRate
  return { commission, stampTax, transferFee, total: commission + stampTax + transferFee }
}