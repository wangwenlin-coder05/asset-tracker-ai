const mysql=require('mysql2/promise');
(async()=>{
  const c=await mysql.createConnection({host:'localhost',user:'root',password:'1234',database:'stock_calculator',dateStrings:true});
  
  const [trackings]=await c.query(
    `SELECT t.id, t.stock_name, t.stock_code, t.pick_open_price, t.pick_change_percent, 
            t.d1_open_change_percent, t.target_profit_percent, t.is_effective_profit, 
            t.effective_profit_day_index, t.effective_profit_percent, t.locked
     FROM wechat_tracking t WHERE t.deleted_at IS NULL AND t.is_effective_profit = 1`
  );
  
  console.log(`共 ${trackings.length} 条有效止盈记录\n`);
  
  let ok = 0, fail = 0;
  for (const t of trackings) {
    const target = Number(t.target_profit_percent) || 5;
    const pickOpen = Number(t.pick_open_price);
    const d0Pct = Number(t.pick_change_percent);
    const d1OpenPct = Number(t.d1_open_change_percent);
    const dbDayIdx = Number(t.effective_profit_day_index);
    
    // 取 daily 数据
    const [dailies]=await c.query(
      `SELECT day_index, high_price, total_change_percent FROM wechat_tracking_daily WHERE tracking_id=? ORDER BY day_index ASC`,
      [t.id]
    );
    
    // 正确 T+1 模拟
    let correctDayIdx = null;
    let startSearchDay = 1;
    
    if (d0Pct > target) {
      if (d1OpenPct >= target) {
        correctDayIdx = 1;
        startSearchDay = 2;
      }
    }
    
    if (correctDayIdx === null) {
      for (const d of dailies) {
        if (Number(d.day_index) < startSearchDay) continue;
        const closePct = Number(d.total_change_percent);
        const highPct = Number(d.high_price) > 0 && pickOpen > 0 
          ? (((Number(d.high_price) - pickOpen) / pickOpen) * 100) : -999;
        const best = Math.max(highPct, closePct);
        if (best >= target) { correctDayIdx = Number(d.day_index); break; }
      }
    }
    
    const match = correctDayIdx === dbDayIdx;
    const mark = match ? '✅' : '❌';
    if (match) ok++; else fail++;
    
    console.log(`${mark} ${t.stock_name}(${t.stock_code}): D0=${d0Pct}% D1开=${d1OpenPct}% target=${target}% → DB=D${dbDayIdx} 正确=D${correctDayIdx}`);
  }
  
  console.log(`\n结果: ${ok}✅ ${fail}❌`);
  await c.end();
})();
