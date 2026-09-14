const mysql=require('mysql2/promise');
(async()=>{
  const c=await mysql.createConnection({host:'localhost',user:'root',password:'1234',database:'stock_calculator',dateStrings:true});
  const [rows]=await c.query("SELECT id, stock_name, locked, latest_date, latest_close_price, total_change_percent, pick_open_price, effective_profit_percent, effective_profit_day_index FROM wechat_tracking WHERE stock_code='605179'");
  rows.forEach(r=>console.log(JSON.stringify(r)));
  // 再查 daily 表的最新行
  if (rows[0]) {
    const [d]=await c.query("SELECT day_index, trade_date, close_price, high_price FROM wechat_tracking_daily WHERE tracking_id=? ORDER BY day_index DESC LIMIT 3",[rows[0].id]);
    console.log('daily latest:', d.map(r=>JSON.stringify(r)).join('\n'));
  }
  await c.end();
})();
