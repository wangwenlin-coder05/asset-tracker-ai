const mysql=require('mysql2/promise');
(async()=>{
  const c=await mysql.createConnection({host:'localhost',user:'root',password:'1234',database:'stock_calculator',dateStrings:true});

  // 1. 先解锁这 5 条，让 refreshTrackingPrices 能重新跑 T+1 判定
  const [unlock] = await c.query(`
    UPDATE wechat_tracking
    SET locked = 0, is_effective_profit = 0,
        effective_profit_percent = NULL, effective_profit_day_index = NULL
    WHERE id IN (
      SELECT t.id FROM (
        SELECT id FROM wechat_tracking
        WHERE deleted_at IS NULL AND is_effective_profit = 1
          AND pick_change_percent IS NOT NULL
          AND pick_change_percent > COALESCE(target_profit_percent, 5.0)
          AND (d1_open_change_percent IS NULL OR d1_open_change_percent < COALESCE(target_profit_percent, 5.0))
      ) t
    )
  `);
  console.log(`解锁了 ${unlock.affectedRows} 条违反 T+1 的记录，等待 refreshTrackingPrices 重算...`);

  await c.end();
})();
