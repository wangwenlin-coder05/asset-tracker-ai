const mysql=require('mysql2/promise');
(async()=>{
  const c=await mysql.createConnection({host:'localhost',user:'root',password:'1234',database:'stock_calculator',dateStrings:true});
  
  console.log('=== 兴欣新材 001358 ===');
  const [rows]=await c.query(
    `SELECT id, stock_name, stock_code, pick_date, pick_open_price, pick_close_price, 
            pick_change_percent, d1_open_change_percent, target_profit_percent, 
            is_effective_profit, effective_profit_day_index, effective_profit_percent, 
            locked, total_change_percent, latest_close_price 
     FROM wechat_tracking WHERE stock_code='001358' AND deleted_at IS NULL`
  );
  const t = rows[0];
  console.log('主表:', JSON.stringify(t, null, 2));
  
  console.log('\n=== daily 明细 ===');
  const [dailies]=await c.query(
    `SELECT day_index, trade_date, open_price, close_price, high_price, low_price, 
            day_change_percent, total_change_percent 
     FROM wechat_tracking_daily WHERE tracking_id=? ORDER BY day_index ASC`, 
    [t.id]
  );
  dailies.forEach(d => {
    const pickOpen = Number(t.pick_open_price);
    const highPct = Number(d.high_price) > 0 && pickOpen > 0 
      ? (((Number(d.high_price) - pickOpen) / pickOpen) * 100).toFixed(2) 
      : null;
    console.log(`D${d.day_index} ${d.trade_date}: open=${d.open_price} close=${d.close_price} high=${d.high_price} | 收盘累计=${d.total_change_percent}% 盘中最高累计=${highPct}%`);
  });
  
  // 手动模拟 T+1 计算
  const target = Number(t.target_profit_percent) || 5.0;
  const d0Pct = Number(t.pick_change_percent);
  const d1OpenPct = Number(t.d1_open_change_percent);
  
  console.log(`\n=== T+1 手动模拟 ===`);
  console.log(`目标阈值: ${target}%`);
  console.log(`D0 涨幅: ${d0Pct}%`);
  console.log(`D1 开盘涨幅: ${d1OpenPct}%`);
  
  if (d0Pct > target) {
    console.log(`D0 大涨 > ${target}%，T+1 卖不出`);
    if (d1OpenPct >= target) {
      console.log(`D1 开盘仍 >= ${target}%，有效止盈日 = D1`);
    } else {
      console.log(`D1 开盘没守住 ${target}%，需从 D1 收盘开始往后找`);
      let found = false;
      for (const d of dailies) {
        if (Number(d.day_index) < 1) continue;
        const pickOpen = Number(t.pick_open_price);
        const highPct = Number(d.high_price) > 0 && pickOpen > 0 
          ? (((Number(d.high_price) - pickOpen) / pickOpen) * 100) 
          : -999;
        const closePct = Number(d.total_change_percent) || -999;
        const best = Math.max(highPct, closePct);
        console.log(`  D${d.day_index}: best=${best.toFixed(2)}%`);
        if (best >= target && !found) {
          console.log(`  ✅ 首次达到 ${target}% 在 D${d.day_index}（盘中最高${highPct.toFixed(2)}%，收盘${closePct.toFixed(2)}%）`);
          found = true;
        }
      }
      if (!found) console.log(`  ❌ 所有日都没达到 ${target}%`);
    }
  } else {
    console.log(`D0 没大涨，从 D1 开始遍历 daily 历史`);
  }
  
  await c.end();
})();
