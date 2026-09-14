const mysql=require('mysql2/promise');
(async()=>{
  const c=await mysql.createConnection({host:'localhost',user:'root',password:'1234',database:'stock_calculator',dateStrings:true});
  const [rows]=await c.query(`SELECT stock_code,is_effective_profit,effective_profit_day_index,effective_profit_percent,locked FROM wechat_tracking WHERE stock_code IN ('605388','001358')`);
  rows.forEach(r=>console.log(JSON.stringify(r)));
  await c.end();
})();
