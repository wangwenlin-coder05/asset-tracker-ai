require('dotenv').config();
const mysql = require('mysql2/promise');
const { databaseConfig } = require('./backend/config');
(async () => {
  const conn = await mysql.createConnection(databaseConfig());
  const [cols] = await conn.query('SHOW COLUMNS FROM life_plan_rejects');
  console.log(cols.map(c => `${c.Field}(${c.Type})`).join(' | '));
  const [rows] = await conn.query('SELECT * FROM life_plan_rejects LIMIT 3');
  console.log('行数样例:', JSON.stringify(rows));
  const [n] = await conn.query('SELECT COUNT(*) c FROM life_plan_rejects');
  console.log('总行数:', n[0].c);
  await conn.end();
})().catch(e => { console.error('ERR:', e.message); process.exit(1); });
