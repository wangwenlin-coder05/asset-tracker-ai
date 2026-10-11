export function calculateDailyProfit(stocks, codes, date, changes) {
  const selectedCodes = new Set(codes)
  let total = 0
  let missing = 0
  let matched = 0
  for (const stock of stocks) {
    if (!selectedCodes.has(stock.code)) continue
    const buys = (stock.buyRecords || []).filter(record => record.buyDate && record.buyDate <= date)
    const sells = (stock.sellRecords || []).filter(record => record.sellDate && record.sellDate <= date)
    const openingCount = buys.filter(record => record.buyDate < date).reduce((sum, record) => sum + Number(record.buyCount || 0), 0)
      - sells.filter(record => record.sellDate < date).reduce((sum, record) => sum + Number(record.sellCount || 0), 0)
    const todayBuys = buys.filter(record => record.buyDate === date)
    const todaySells = sells.filter(record => record.sellDate === date)
    if (!openingCount && !todayBuys.length && !todaySells.length) continue
    matched++
    const history = changes[stock.code] || []
    const dayIndex = history.findIndex(day => day.date === date)
    const close = Number(history[dayIndex]?.close)
    const previousClose = Number(history[dayIndex - 1]?.close)
    if (!(close > 0) || (openingCount && !(previousClose > 0)) || openingCount < 0) {
      missing++
      continue
    }
    total += openingCount ? openingCount * (close - previousClose) : 0
    for (const record of todayBuys) {
      total += (close - Number(record.buyPrice)) * Number(record.buyCount)
        - Number(record.commission || 0) - Number(record.transferFee || 0)
    }
    for (const record of todaySells) {
      total += (Number(record.sellPrice) - close) * Number(record.sellCount)
        - Number(record.sellCommission || 0) - Number(record.sellTransferFee || 0) - Number(record.stampTax || 0)
    }
  }
  return { amount: missing ? null : Number(total.toFixed(2)), matched, missing }
}
