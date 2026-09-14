export const positionMap = {
  full: 1,
  half: 0.5,
  third: 1 / 3,
  quarter: 0.25
}

export function calcStock(item) {
  const { cost, buyPrice, count: rawCount, sellPrice, position, sellRecords = [], buyRecords = [] } = item

  // T 卖出集合（用于判断未完成 T 买入）
  const numberOrZero = value => Number.isFinite(Number(value)) ? Number(value) : 0
  const buyFeeFor = record => numberOrZero(record.commission) + numberOrZero(record.transferFee) + numberOrZero(record.handlingFee) + numberOrZero(record.regulatoryFee)
  const sellFeeFor = record => numberOrZero(record.sellCommission) + numberOrZero(record.sellTransferFee) + numberOrZero(record.stampTax) + numberOrZero(record.handlingFee) + numberOrZero(record.regulatoryFee) + numberOrZero(record.otherFee)

  const totalBuyCount = buyRecords.reduce((sum, record) => sum + numberOrZero(record.buyCount), 0)
  const totalSellCount = sellRecords.reduce((sum, record) => sum + numberOrZero(record.sellCount), 0)
  const count = buyRecords.length > 0 ? Math.max(0, totalBuyCount - totalSellCount) : Math.max(0, numberOrZero(rawCount))
  const totalBuyAmount = buyRecords.reduce((sum, record) => sum + numberOrZero(record.buyPrice) * numberOrZero(record.buyCount), 0)
  const totalBuyFee = buyRecords.reduce((sum, record) => sum + buyFeeFor(record), 0)
  const totalBuyGross = totalBuyAmount + totalBuyFee
  const totalSellNet = sellRecords.reduce((sum, record) => sum + numberOrZero(record.sellPrice) * numberOrZero(record.sellCount) - sellFeeFor(record), 0)

  // Remaining cost follows actual cash flow: buys add capital and net sell proceeds recover capital.
  const remainingCostTotal = buyRecords.length > 0 ? totalBuyGross - totalSellNet : numberOrZero(cost) * count
  const averageBuyCost = totalBuyCount > 0 ? totalBuyGross / totalBuyCount : numberOrZero(cost)
  const avgCost = count > 0 ? remainingCostTotal / count : averageBuyCost

  // 真实持仓股数：buyRecords 存在时由「总买-总卖」推导，否则回退到手动录入的 rawCount
  const realCount = buyRecords.length > 0 ? count : Math.max(0, numberOrZero(rawCount))

  // Kept for the T-transaction display; it is not separately applied to cost.
  const sellTGroupIds = new Set(sellRecords.filter(record => record.tType).map(record => record.tGroupId).filter(Boolean))
  const tTotalProfit = buyRecords.reduce((sum, record) => {
    if (!record.tGroupId || !sellTGroupIds.has(record.tGroupId)) return sum
    return sum + numberOrZero(record.costChange)
  }, 0)

  const posRate = positionMap[position] || 1
  // 实时计算 count：总买入股数 - 总卖出股数
  const tradeCount = item.isCleared ? 0 : Math.floor(count * posRate)
  const holdTotal = count > 0 ? remainingCostTotal : 0
  const sellTotal = sellPrice * tradeCount

  const sellCommission = Math.max(sellTotal * 0.00023, 5.00)
  const stampTax = sellTotal * 0.001
  const transferFee = sellTotal * 0.00001
  const otherFee = transferFee

  let nextBuyFee = 0
  let buyCommission = 0
  let buyTransferFee = 0

  if (count > 0 && tradeCount > 0) {
    const ratio = tradeCount / count
    buyCommission = totalBuyFee * ratio
    nextBuyFee = buyCommission
  } else if (tradeCount > 0) {
    const buyTotal = sellPrice * tradeCount
    buyCommission = Math.max(buyTotal * 0.00023, 5.00)
    buyTransferFee = buyTotal * 0.00001
    nextBuyFee = buyCommission + buyTransferFee
  }

  const nextSellFee = sellCommission + stampTax + otherFee
  const nextTotalFee = nextSellFee

  const existingSellFee = sellRecords.reduce((sum, r) => sum + (r.sellCommission || 0) + (r.sellTransferFee || 0) + (r.stampTax || 0) + (r.otherFee || 0), 0)
  let estimatedSellFee = existingSellFee

  if (sellRecords.length === 0 && item.isCleared && sellPrice > 0 && count > 0) {
    const estSellTotal = sellPrice * count
    const estSellCommission = Math.max(estSellTotal * 0.00023, 5.00)
    const estStampTax = estSellTotal * 0.001
    const estTransferFee = estSellTotal * 0.00001
    estimatedSellFee = estSellCommission + estStampTax + estTransferFee
  }

  const totalFee = totalBuyFee + estimatedSellFee
  // 已实现盈利：所有卖出记录的净盈利总和（清仓时全部计入）
  const realizedProfit = sellRecords.reduce((sum, r) => sum + (r.netProfit || 0), 0)
  // 净盈利：清仓时为已实现盈利，持仓时叠加目标价差额
  const targetNetProfit = item.isCleared ? 0 : parseFloat((sellTotal - avgCost * tradeCount - nextSellFee).toFixed(2))
  const netProfit = parseFloat((realizedProfit + targetNetProfit).toFixed(2))
  // 收益率：持仓时基于目标卖出价差额
  const rate = avgCost > 0 && sellPrice > 0 ? parseFloat(((sellPrice - avgCost) / avgCost * 100).toFixed(2)) : 0

  return {
    count: realCount,
    totalBuyCount,
    totalSellCount,
    tradeCount,
    holdTotal,
    sellTotal,
    totalFee,
    nextTotalFee,
    nextBuyFee,
    nextSellFee,
    sellCostTotal: avgCost * tradeCount,
    netProfit,
    rate,
    sellCommission,
    transferFee,
    stampTax,
    otherFee,
    avgCost,
    existingSellFee,
    realizedProfit,
    targetNetProfit,
    totalBuyCount,
    totalBuyFee,
    buyCommission,
    buyTransferFee,
    tTotalProfit,
    totalBuyGross,
    totalSellNet,
    remainingCostTotal
  }
}

export function calcRatioPrice(item, avgCost) {
  const basePrice = parseFloat(item.basePrice)
  const pct = parseFloat(item.priceChangePercent)
  
  if (!isNaN(basePrice) && basePrice > 0 && !isNaN(pct)) {
    return basePrice * (1 + pct / 100)
  }

  const ratio = parseFloat(item.profitLossRatio)
  
  if (item.lastEditedRatio === 'profitLossRatio' || (!isNaN(ratio) && item.ratioPrice == null)) {
    if (isNaN(ratio) || avgCost == null || avgCost <= 0) return null
    return avgCost * (1 + ratio / 100)
  }

  if (item.ratioPrice != null) return item.ratioPrice

  if (!isNaN(ratio) && avgCost != null && avgCost > 0) {
    return avgCost * (1 + ratio / 100)
  }

  return null
}

export function calcGold(item) {
  const { buyRecords = [], sellRecords = [] } = item
  let totalBuyGrams = 0, totalBuyAmount = 0, totalBuyFee = 0, giftGrams = 0

  buyRecords.forEach(r => {
    const count = Number(r.buyCount) || 0
    const price = Number(r.buyPrice) || 0
    const amount = price * count
    if (price > 0) {
      totalBuyGrams += count
      totalBuyAmount += amount + (Number(r.commission) || 0)
    } else {
      giftGrams += count
    }
    totalBuyFee += Number(r.commission) || 0
  })

  let totalSellGrams = 0, totalSellAmount = 0, totalSellFee = 0
  sellRecords.forEach(s => {
    const sellCount = Number(s.sellCount) || 0
    const sellPrice = Number(s.sellPrice) || 0
    const fee = Number(s.sellCommission) || 0
    totalSellGrams += sellCount
    totalSellAmount += sellPrice * sellCount - fee
    totalSellFee += fee
  })

  // 做T摊薄成本：实际买入成本 - 实际卖出收入 = 剩余持仓净成本
  const netCost = totalBuyAmount - totalSellAmount
  let finalGrams = totalBuyGrams - totalSellGrams + giftGrams

  // 修复：浮点数积累误差保护
  // 如果剩余克数小于 0.01g，视为清仓（避免显示 -0.0004g 这种不可能的负数）
  if (finalGrams > -0.01 && finalGrams <= 0) {
    finalGrams = 0
  } else if (finalGrams < -0.01) {
    // 异常数据（卖出 > 买入超过 0.01g），保底为 0 并在控制台提醒
    console.warn('[calcGold] 卖出克数超过买入克数！finalGrams=' + finalGrams, { totalBuyGrams, totalSellGrams, giftGrams })
    finalGrams = 0
  }

  const avgPrice = finalGrams > 0 ? parseFloat((netCost / finalGrams).toFixed(4)) : 0
  const totalFee = totalBuyFee + totalSellFee

  return { totalGrams: finalGrams, totalAmount: parseFloat(netCost.toFixed(2)), avgPrice, totalFee }
}

export function calcBuyFee(buyPrice, buyCount) {
  const totalAmount = buyPrice * buyCount
  const commission = parseFloat(Math.max(totalAmount * 0.00023, 5.00).toFixed(2))
  const transferFee = parseFloat((totalAmount * 0.00001).toFixed(2))
  return { commission, transferFee, total: parseFloat((commission + transferFee).toFixed(2)) }
}

export function calcSellFee(sellPrice, sellCount) {
  const totalAmount = sellPrice * sellCount
  const commission = parseFloat(Math.max(totalAmount * 0.00023, 5.00).toFixed(2))
  const stampTax = parseFloat((totalAmount * 0.001).toFixed(2))
  const transferFee = parseFloat((totalAmount * 0.00001).toFixed(2))
  return { commission, stampTax, transferFee, total: parseFloat((commission + stampTax + transferFee).toFixed(2)) }
}

export const CRISIS_LEVELS = {
  '安全': {
    icon: 'smile',
    title: '很安全',
    boxBg: 'bg-emerald-50',
    boxBorder: 'border-emerald-200',
    iconColor: 'text-emerald-500',
    titleColor: 'text-emerald-600',
    ratioColor: 'text-emerald-500',
    labelColor: 'text-emerald-400',
    glowColor: 'rgba(16, 185, 129, 0.08)',
    movie: null,
    label: '被套'
  },
  '警戒': {
    icon: 'meh',
    title: '小注意',
    boxBg: 'bg-amber-50',
    boxBorder: 'border-amber-200',
    iconColor: 'text-amber-500',
    titleColor: 'text-amber-600',
    ratioColor: 'text-amber-500',
    labelColor: 'text-amber-400',
    glowColor: 'rgba(245, 158, 11, 0.10)',
    movie: null,
    label: '被套'
  },
  '危险': {
    icon: 'frown',
    title: '小危险',
    boxBg: 'bg-orange-50',
    boxBorder: 'border-orange-200',
    iconColor: 'text-orange-500',
    titleColor: 'text-orange-600',
    ratioColor: 'text-orange-500',
    labelColor: 'text-orange-400',
    glowColor: 'rgba(249, 115, 22, 0.12)',
    movie: null,
    label: '被套'
  },
  '危机': {
    icon: 'dizzy',
    title: '大危机！',
    boxBg: 'bg-rose-50',
    boxBorder: 'border-rose-200',
    iconColor: 'text-rose-500',
    titleColor: 'text-rose-600',
    ratioColor: 'text-rose-500',
    labelColor: 'text-rose-400',
    glowColor: 'rgba(244, 63, 94, 0.15)',
    movie: null,
    label: '被套'
  }
}

export function getCrisisLevel(ratio) {
  if (ratio < 30) return '安全'
  if (ratio < 50) return '警戒'
  if (ratio < 70) return '危险'
  return '危机'
}
