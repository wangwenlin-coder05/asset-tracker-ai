const mysql=require('mysql2/promise');
(async()=>{
  const c=await mysql.createConnection({host:'localhost',user:'root',password:'1234',database:'stock_calculator',dateStrings:true});

  // 找：D0 涨幅 > target，且 D1 开盘涨幅 < target，但却被标记为有效止盈
  const [bad] = await c.query(`
    SELECT id, stock_name, stock_code, pick_open_price, pick_close_price, pick_change_percent,
           d1_open_change_percent, target_profit_percent, effective_profit_percent,
           effective_profit_day_index, locked, is_effective_profit
    FROM wechat_tracking
    WHERE deleted_at IS NULL AND is_effective_profit = 1
      AND pick_change_percent IS NOT NULL
      AND pick_change_percent > COALESCE(target_profit_percent, 5.0)
      AND (d1_open_change_percent IS NULL OR d1_open_change_percent < COALESCE(target_profit_percent, 5.0))
  `);

  console.log(`违反 T+1 的有效止盈记录: ${bad.length} 条`);
  for (const r of bad) {
    const target = r.target_profit_percent || 5.0;
    console.log(`  ${r.stock_name}(${r.stock_code}) pick_open=${r.pick_open_price} D0涨=${r.pick_change_percent}%>target=${target} D1开盘=${r.d1_open_change_percent}%<target locked=${r.locked} eff_pct=${r.effective_profit_percent}% eff_day=D${r.effective_profit_day_index}`);
  }

  await c.end();
})();
