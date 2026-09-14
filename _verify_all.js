const mysql=require('mysql2/promise');
(async()=>{
  const c=await mysql.createConnection({host:'localhost',user:'root',password:'1234',database:'stock_calculator',dateStrings:true});
  
  for (const code of ['605388','001358']) {
    console.log(`\n========== ${code} ==========`);
    const [rows]=await c.query(
      `SELECT id, stock_name, stock_code, pick_date, pick_open_price, pick_close_price, 
              pick_change_percent, d1_open_change_percent, target_profit_percent, 
              is_effective_profit, effective_profit_day_index, effective_profit_percent, 
              locked FROM wechat_tracking WHERE stock_code=? AND deleted_at IS NULL`,
      [code]
    );
    if (!rows.length) { console.log('无记录'); continue; }
    const t = rows[0];
    console.log(`D0涨幅=${t.pick_change_percent}% D1开盘涨幅=${t.d1_open_change_percent}% target=${t.target_profit_percent}%`);
    console.log(`DB判定: isEff=${t.is_effective_profit} dayIdx=${t.effective_profit_day_index} pct=${t.effective_profit_percent} locked=${t.locked}`);
    
    const [dailies]=await c.query(
      `SELECT day_index, trade_date, high_price, total_change_percent FROM wechat_tracking_daily WHERE tracking_id=? ORDER BY day_index ASC`, 
      [t.id]
    );
    const pickOpen = Number(t.pick_open_price);
    const target = Number(t.target_profit_percent) || 5;
    
    console.log('\n正确T+1模拟:');
    console.log(`  规则: D0>${target}%时，D1开盘>=${target}%算止盈; 否则从D1开始遍历daily high`);
    
    let correctDayIdx = null;
    let correctPct = null;
    const d0 = Number(t.pick_change_percent);
    const d1Open = Number(t.d1_open_change_percent);
    
    if (d0 > target && d1Open >= target) {
      console.log(`  D1开盘=${d1Open}% >= ${target}% → 正确止盈日=D1`);
      correctDayIdx = 1; correctPct = d1Open;
    } else {
      console.log(`  从D1开始遍历daily high:`);
      for (const d of dailies) {
        if (Number(d.day_index) < 1) continue;
        const highPct = (((Number(d.high_price) - pickOpen) / pickOpen) * 100);
        const closePct = Number(d.total_change_percent);
        const best = Math.max(highPct, closePct);
        if (best >= target) {
          console.log(`  ✅ D${d.day_index}: high=${highPct.toFixed(2)}% close=${closePct}% → 正确止盈日=D${d.day_index}`);
          correctDayIdx = Number(d.day_index); correctPct = best;
          break;
        }
      }
    }
    
    const dbMatch = correctDayIdx === Number(t.effective_profit_day_index);
    console.log(`  DB结果=${t.effective_profit_day_index} vs 正确=${correctDayIdx} → ${dbMatch ? '✅一致' : '❌不一致'}`);
  }
  await c.end();
})();
