const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const dotenv = require('dotenv');
const mysql = require('mysql2/promise');
const { BUSINESS_TABLES } = require('../backend/tenant-db');
const { decryptSecret, isSecret } = require('../backend/secrets');

function connectionConfig(environment) {
  for (const name of ['DB_HOST', 'DB_USER', 'DB_PASSWORD', 'DB_NAME']) {
    if (!environment[name]) throw new Error(`缺少 ${name}`);
  }
  return {
    host: environment.DB_HOST, port: Number(environment.DB_PORT) || 3306,
    user: environment.DB_USER, password: environment.DB_PASSWORD, database: environment.DB_NAME,
    dateStrings: true, timezone: '+08:00', supportBigNumbers: true, bigNumberStrings: true,
    multipleStatements: false,
    ...(environment.DB_SSL === 'true' ? { ssl: { rejectUnauthorized: true } } : {}),
  };
}

function canonicalJson(value) {
  if (Array.isArray(value)) return value.map(canonicalJson);
  if (value && typeof value === 'object') return Object.fromEntries(Object.keys(value).sort().map(key => [key, canonicalJson(value[key])]));
  return value;
}

function rowDigest(rows, columns) {
  const hash = crypto.createHash('sha256');
  for (const row of rows) {
    const normalized = columns.map(column => {
      const value = row[column.COLUMN_NAME];
      if (value === null) return null;
      if (column.DATA_TYPE === 'json') return canonicalJson(typeof value === 'string' ? JSON.parse(value) : value);
      return Buffer.isBuffer(value) ? value.toString('base64') : String(value);
    });
    hash.update(JSON.stringify(normalized) + '\n');
  }
  return hash.digest('hex');
}

function splitConstraints(ddl) {
  const constraints = [];
  const lines = ddl.split('\n').filter(line => {
    if (!/^\s*CONSTRAINT .* FOREIGN KEY /.test(line)) return true;
    constraints.push(line.trim().replace(/,$/, ''));
    return false;
  });
  return { ddl: lines.join('\n').replace(/,\n\)/, '\n)'), constraints };
}

async function importCloud({ sourceFile = '.env', targetFile = '.env.cloud.local', apply = false } = {}) {
  const sourceEnvironment = dotenv.parse(fs.readFileSync(sourceFile));
  const targetEnvironment = dotenv.parse(fs.readFileSync(targetFile));
  const sourceConfig = connectionConfig(sourceEnvironment);
  const targetConfig = connectionConfig(targetEnvironment);
  if (targetEnvironment.DB_SSL !== 'true') throw new Error('云库必须开启验证证书的 TLS');
  if (sourceConfig.host === targetConfig.host && sourceConfig.port === targetConfig.port && sourceConfig.database === targetConfig.database) throw new Error('源库和目标库不能相同');
  const sourceKey = Buffer.from(sourceEnvironment.KEY_ENCRYPTION_KEY || '', 'base64');
  const targetKey = Buffer.from(targetEnvironment.KEY_ENCRYPTION_KEY || '', 'base64');
  if (sourceKey.length !== 32 || targetKey.length !== 32 || !crypto.timingSafeEqual(sourceKey, targetKey)) throw new Error('云端 KEY_ENCRYPTION_KEY 必须与本机保持一致');
  const originalKey = process.env.KEY_ENCRYPTION_KEY;
  process.env.KEY_ENCRYPTION_KEY = sourceEnvironment.KEY_ENCRYPTION_KEY;
  let source;
  let target;
  let locked = false;
  let snapshotOpen = false;
  try {
    source = await mysql.createConnection(sourceConfig);
    target = await mysql.createConnection(targetConfig);
    const [targetTables] = await target.query('SHOW FULL TABLES');
    if (targetTables.length) throw new Error('目标库非空，拒绝覆盖。部分失败也需人工检查独立目标库，不能自动重跑');
    if (apply) {
      const [lock] = await target.query("SELECT GET_LOCK('stock-cloud-import', 0) acquired");
      if (Number(lock[0].acquired) !== 1) throw new Error('另一个云库导入正在运行');
      locked = true;
      const [recheck] = await target.query('SHOW TABLES');
      if (recheck.length) throw new Error('目标库已被其他进程修改');
    }
    await source.query('SET TRANSACTION ISOLATION LEVEL REPEATABLE READ');
    await source.query('START TRANSACTION WITH CONSISTENT SNAPSHOT, READ ONLY');
    snapshotOpen = true;
    const [existing] = await source.query('SHOW FULL TABLES');
    const names = existing.map(row => Object.values(row)[0]);
    const expected = [...BUSINESS_TABLES, 'users', 'user_sessions', 'schema_migrations'];
    if (names.length !== expected.length || expected.some(name => !names.includes(name)) || existing.some(row => Object.values(row)[1] !== 'BASE TABLE')) throw new Error('源库必须恰好包含 Phase 1 的 38 张表，拒绝静默遗漏未知表/视图');
    const [markers] = await source.query("SELECT name FROM schema_migrations WHERE name='phase1'");
    if (markers.length !== 1) throw new Error('本机尚未完成 Phase 1 迁移');
    const [owners] = await source.query("SELECT id FROM users WHERE role='owner' AND disabled=0");
    if (!owners.length) throw new Error('源库缺少有效 owner');
    const [users] = await source.query('SELECT id FROM users');
    const userIds = new Set(users.map(user => String(user.id)));
    const [collations] = await target.query('SHOW COLLATION');
    const supportedCollations = new Set(collations.map(row => row.Collation));
    const snapshot = [];
    let secretsChecked = 0;
    for (const name of expected) {
      const [schemas] = await source.query('SHOW CREATE TABLE ??', [name]);
      const ddl = schemas[0]['Create Table'];
      for (const match of ddl.matchAll(/\bCOLLATE[= ]+([a-zA-Z0-9_]+)/g)) {
        if (!supportedCollations.has(match[1])) throw new Error(`云端不支持 ${name} 的排序规则 ${match[1]}，需先人工确认转换策略`);
      }
      const [columns] = await source.execute('SELECT COLUMN_NAME, DATA_TYPE, IS_NULLABLE, EXTRA FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=? AND TABLE_NAME=? ORDER BY ORDINAL_POSITION', [sourceConfig.database, name]);
      if (columns.some(column => /(?:VIRTUAL|STORED) GENERATED/.test(column.EXTRA))) throw new Error(`不支持自动生成列: ${name}`);
      if (BUSINESS_TABLES.has(name) && !columns.some(column => column.COLUMN_NAME === 'user_id' && column.IS_NULLABLE === 'NO')) throw new Error(`业务表未隔离: ${name}`);
      const [indexes] = await source.query('SHOW INDEX FROM ??', [name]);
      const primary = indexes.filter(index => index.Key_name === 'PRIMARY').sort((left, right) => left.Seq_in_index - right.Seq_in_index).map(index => index.Column_name);
      if (!primary.length) throw new Error(`缺少主键: ${name}`);
      if (BUSINESS_TABLES.has(name)) {
        for (const index of indexes.filter(index => !index.Non_unique)) {
          if (!indexes.some(part => part.Key_name === index.Key_name && part.Column_name === 'user_id')) throw new Error(`唯一索引未隔离: ${name}.${index.Key_name}`);
        }
      }
      const order = primary.map(mysql.escapeId).join(',');
      const [rows] = name === 'user_sessions' ? [[]] : await source.query(`SELECT * FROM ${mysql.escapeId(name)} ORDER BY ${order}`);
      for (const row of rows) {
        if (BUSINESS_TABLES.has(name) && !userIds.has(String(row.user_id))) throw new Error(`业务表存在无主数据: ${name}`);
        if (name === 'ai_settings' && isSecret(row.setting_key) && row.setting_value) {
          decryptSecret(row.setting_value, row.user_id, row.setting_key);
          secretsChecked++;
        }
      }
      snapshot.push({ name, ...splitConstraints(ddl), columns, primary, rows, digest: rowDigest(rows, columns) });
      console.log(`${name}: ${rows.length} 行${name === 'user_sessions' ? '（本机会话不复制）' : ''}`);
    }
    await source.rollback();
    snapshotOpen = false;
    console.log(`预检通过: ${snapshot.length} 张表，${snapshot.reduce((total, table) => total + table.rows.length, 0)} 行，${secretsChecked} 个加密 Key 验证成功`);
    if (!apply) {
      console.log('只读预检结束；云库未创建表、未导入数据。明确确认后才加 --apply');
      return { tables: snapshot.length, applied: false };
    }
    const backupDirectory = path.resolve('.launcher', 'phase1-backups');
    fs.mkdirSync(backupDirectory, { recursive: true });
    const backupFile = path.join(backupDirectory, `cloud-source-${Date.now()}.json`);
    fs.writeFileSync(backupFile, JSON.stringify(snapshot), { flag: 'wx', mode: 0o600 });
    console.log('已保存忽略版本控制的源库快照（含私人数据，请妥善保管）');
    for (const table of snapshot) await target.query(table.ddl);
    const markerTable = snapshot.find(table => table.name === 'schema_migrations');
    async function insertRows(table) {
      const names = table.columns.map(column => column.COLUMN_NAME);
      for (let offset = 0; offset < table.rows.length; offset += 50) {
        const batch = table.rows.slice(offset, offset + 50).map(row => names.map(name => {
          const value = row[name];
          return value && typeof value === 'object' && !Buffer.isBuffer(value) ? JSON.stringify(value) : value;
        }));
        await target.query(`INSERT INTO ${mysql.escapeId(table.name)} (${names.map(mysql.escapeId).join(',')}) VALUES ?`, [batch]);
      }
    }
    for (const table of snapshot.filter(table => table.name !== 'schema_migrations')) {
      await insertRows(table);
      console.log(`已导入 ${table.name}`);
    }
    for (const table of snapshot) {
      for (const constraint of table.constraints) await target.query(`ALTER TABLE ${mysql.escapeId(table.name)} ADD ${constraint}`);
    }
    for (const table of snapshot.filter(table => table.name !== 'schema_migrations')) {
      const [rows] = await target.query(`SELECT * FROM ${mysql.escapeId(table.name)} ORDER BY ${table.primary.map(mysql.escapeId).join(',')}`);
      if (rows.length !== table.rows.length || rowDigest(rows, table.columns) !== table.digest) throw new Error(`云库内容校验失败: ${table.name}；迁移完成标记不会写入`);
    }
    await target.beginTransaction();
    try {
      await insertRows(markerTable);
      const [rows] = await target.query('SELECT * FROM schema_migrations ORDER BY name');
      if (rowDigest(rows, markerTable.columns) !== markerTable.digest) throw new Error('迁移标记校验失败');
      await target.commit();
    } catch (error) { await target.rollback(); throw error; }
    console.log('云库导入完成；逐表行数与 SHA-256 一致、外键恢复、本机会话未迁移。本机库未修改');
    return { tables: snapshot.length, applied: true, backupFile };
  } finally {
    if (snapshotOpen && source) await source.rollback().catch(() => {});
    if (locked && target) await target.query("SELECT RELEASE_LOCK('stock-cloud-import')").catch(() => {});
    if (source) await source.end();
    if (target) await target.end();
    if (originalKey === undefined) delete process.env.KEY_ENCRYPTION_KEY;
    else process.env.KEY_ENCRYPTION_KEY = originalKey;
  }
}

if (require.main === module) {
  const argumentsList = process.argv.slice(2);
  if (argumentsList.some(argument => argument !== '--apply')) throw new Error('仅支持 --apply；默认是只读预检');
  importCloud({ apply: argumentsList.includes('--apply') }).catch(error => {
    console.error(`云库导入停止: ${error.code || error.name}。检查预检/云库结构；不输出可能含私人数据的 SQL 错误`);
    if (!error.sql) console.error(error.message);
    process.exitCode = 1;
  });
}

module.exports = { importCloud, rowDigest, splitConstraints };
