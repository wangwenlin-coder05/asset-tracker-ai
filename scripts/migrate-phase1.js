require('dotenv').config({ quiet: true });
const fs = require('node:fs');
const path = require('node:path');
const net = require('node:net');
const { pipeline } = require('node:stream/promises');
const bcrypt = require('bcryptjs');
const mysql = require('mysql2/promise');
const { databaseConfig } = require('../backend/config');
const { BUSINESS_TABLES } = require('../backend/tenant-db');
const { encryptSecret, isSecret } = require('../backend/secrets');

const quote = name => mysql.escapeId(name);

async function copyLegacyFiles(source, target) {
  await fs.promises.mkdir(target, { recursive: true });
  for (const entry of await fs.promises.readdir(source, { withFileTypes: true })) {
    if (entry.isSymbolicLink()) throw new Error('旧上传目录含符号链接，请先人工检查');
    const original = path.join(source, entry.name);
    const destination = path.join(target, entry.name);
    if (entry.isDirectory()) await copyLegacyFiles(original, destination);
    else if (entry.isFile() && !fs.existsSync(destination)) {
      const staged = destination + '.phase1-copying';
      await pipeline(fs.createReadStream(original), fs.createWriteStream(staged));
      await fs.promises.rename(staged, destination);
    }
  }
}

async function backup(connection, directory, tables) {
  fs.mkdirSync(directory, { recursive: true });
  const filename = path.join(directory, `phase1-${Date.now()}.sql`);
  const descriptor = fs.openSync(filename, 'wx', 0o600);
  try {
    fs.writeSync(descriptor, 'SET FOREIGN_KEY_CHECKS=0;\n');
    for (const table of tables) {
      const [ddl] = await connection.query(`SHOW CREATE TABLE ${quote(table)}`);
      fs.writeSync(descriptor, `DROP TABLE IF EXISTS ${quote(table)};\n${ddl[0]['Create Table']};\n`);
      const [rows] = await connection.query(`SELECT * FROM ${quote(table)}`);
      for (const row of rows) {
        const columns = Object.keys(row);
        fs.writeSync(descriptor, `INSERT INTO ${quote(table)} (${columns.map(quote).join(',')}) VALUES (${columns.map(column => mysql.escape(row[column])).join(',')});\n`);
      }
    }
    fs.writeSync(descriptor, 'SET FOREIGN_KEY_CHECKS=1;\n');
  } finally { fs.closeSync(descriptor); }
  console.log(`已备份数据库到 ${filename}（含私人数据与旧密钥，请妥善保管）`);
  return filename;
}

async function migratePhase1({ apply = false, backupDir = path.resolve('.launcher', 'phase1-backups'), ownerEmail = process.env.MIGRATION_OWNER_EMAIL, ownerPassword = process.env.MIGRATION_OWNER_PASSWORD } = {}) {
  const connection = await mysql.createConnection(databaseConfig());
  let locked = false;
  try {
    const [lock] = await connection.query("SELECT GET_LOCK('stock-phase1-migration', 0) acquired");
    if (!lock[0].acquired) throw new Error('另一个迁移正在运行');
    locked = true;
    const [rows] = await connection.query('SHOW TABLES');
    const tables = rows.map(row => Object.values(row)[0]);
    const missing = [...BUSINESS_TABLES].filter(table => !tables.includes(table));
    if (missing.length) throw new Error(`缺少旧版业务表: ${missing.join(', ')}。请先在独立环境初始化旧版数据库。`);
    const [owners] = tables.includes('users') ? await connection.query("SELECT id, email FROM users WHERE role = 'owner'") : [[]];
    const existingOwner = owners[0];
    console.log(`数据库 ${databaseConfig().database}：${BUSINESS_TABLES.size} 张业务表，${apply ? '执行迁移' : '仅预检，不改数据'}`);
    if (!apply) return { tables: [...BUSINESS_TABLES], owner: existingOwner || null };
    if (!existingOwner && (!ownerEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(ownerEmail) || !ownerPassword || ownerPassword.length < 12 || Buffer.byteLength(ownerPassword) > 72)) throw new Error('首次迁移必须设置 MIGRATION_OWNER_EMAIL 和至少 12 字符的 MIGRATION_OWNER_PASSWORD');
    if (Buffer.from(process.env.KEY_ENCRYPTION_KEY || '', 'base64').length !== 32) throw new Error('先配置 KEY_ENCRYPTION_KEY');
    const backupFile = await backup(connection, backupDir, tables);
    await connection.query(`CREATE TABLE IF NOT EXISTS users (
      id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
      email VARCHAR(254) NOT NULL UNIQUE,
      password_hash VARCHAR(255) NOT NULL,
      role VARCHAR(20) NOT NULL DEFAULT 'user',
      disabled TINYINT NOT NULL DEFAULT 0,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`);
    await connection.query(`CREATE TABLE IF NOT EXISTS user_sessions (
      token_hash CHAR(64) PRIMARY KEY, user_id INT UNSIGNED NOT NULL,
      csrf_token CHAR(64) NOT NULL, expires_at DATETIME NOT NULL,
      INDEX idx_user_session (user_id), INDEX idx_session_expiry (expires_at),
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    )`);
    await connection.query(`CREATE TABLE IF NOT EXISTS schema_migrations (
      name VARCHAR(100) PRIMARY KEY, completed_at DATETIME NULL, details JSON NULL
    )`);
    let ownerId = existingOwner?.id;
    if (!ownerId) {
      const [result] = await connection.execute('INSERT INTO users (email, password_hash, role) VALUES (?, ?, ?)', [ownerEmail.toLowerCase(), await bcrypt.hash(ownerPassword, 12), 'owner']);
      ownerId = result.insertId;
    }
    const [foreignKeys] = await connection.query(`SELECT k.TABLE_NAME, k.COLUMN_NAME, k.REFERENCED_TABLE_NAME, k.REFERENCED_COLUMN_NAME, k.CONSTRAINT_NAME, r.DELETE_RULE, r.UPDATE_RULE
      FROM information_schema.KEY_COLUMN_USAGE k JOIN information_schema.REFERENTIAL_CONSTRAINTS r ON r.CONSTRAINT_SCHEMA=k.CONSTRAINT_SCHEMA AND r.CONSTRAINT_NAME=k.CONSTRAINT_NAME AND r.TABLE_NAME=k.TABLE_NAME
      WHERE k.TABLE_SCHEMA=DATABASE() AND k.REFERENCED_TABLE_NAME IS NOT NULL AND k.COLUMN_NAME <> 'user_id'`);
    const legacyKeys = foreignKeys.filter(key => BUSINESS_TABLES.has(key.TABLE_NAME) && BUSINESS_TABLES.has(key.REFERENCED_TABLE_NAME));
    const [state] = await connection.query("SELECT details FROM schema_migrations WHERE name='phase1'");
    const saved = state[0]?.details;
    const details = saved ? (typeof saved === 'string' ? JSON.parse(saved) : saved) : { ownerId, foreignKeys: legacyKeys, backupFile };
    if (!saved) await connection.execute("INSERT INTO schema_migrations (name, details) VALUES ('phase1', ?)", [JSON.stringify(details)]);
    await connection.query("UPDATE schema_migrations SET completed_at=NULL WHERE name='phase1'");
    for (const key of legacyKeys) await connection.query(`ALTER TABLE ${quote(key.TABLE_NAME)} DROP FOREIGN KEY ${quote(key.CONSTRAINT_NAME)}`);
    for (const table of BUSINESS_TABLES) {
      const [columns] = await connection.query(`SHOW COLUMNS FROM ${quote(table)} LIKE 'user_id'`);
      if (!columns.length) await connection.query(`ALTER TABLE ${quote(table)} ADD COLUMN user_id INT UNSIGNED NULL`);
      await connection.execute(`UPDATE ${quote(table)} SET user_id = ? WHERE user_id IS NULL`, [ownerId]);
      await connection.query(`ALTER TABLE ${quote(table)} MODIFY user_id INT UNSIGNED NOT NULL`);
      const [indexes] = await connection.query(`SHOW INDEX FROM ${quote(table)}`);
      const grouped = new Map();
      for (const index of indexes) {
        if (!grouped.has(index.Key_name)) grouped.set(index.Key_name, []);
        grouped.get(index.Key_name).push(index);
      }
      for (const [name, parts] of grouped) {
        if (parts[0].Non_unique || parts.some(part => part.Column_name === 'user_id')) continue;
        const indexed = parts.sort((left, right) => left.Seq_in_index - right.Seq_in_index).map(part => `${quote(part.Column_name)}${part.Sub_part ? `(${part.Sub_part})` : ''}`);
        await connection.query(`ALTER TABLE ${quote(table)} ${name === 'PRIMARY' ? 'DROP PRIMARY KEY, ADD PRIMARY KEY' : `DROP INDEX ${quote(name)}, ADD UNIQUE INDEX ${quote(name)}`} (${indexed.join(',')}, user_id)`);
      }
      if (!grouped.has('idx_tenant')) await connection.query(`ALTER TABLE ${quote(table)} ADD INDEX idx_tenant (user_id)`);
      console.log(`已隔离 ${table}`);
    }
    for (const key of details.foreignKeys) {
      const [present] = await connection.query('SELECT 1 FROM information_schema.TABLE_CONSTRAINTS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME=? AND CONSTRAINT_NAME=?', [key.TABLE_NAME, key.CONSTRAINT_NAME]);
      if (!present.length) await connection.query(`ALTER TABLE ${quote(key.TABLE_NAME)} ADD CONSTRAINT ${quote(key.CONSTRAINT_NAME)} FOREIGN KEY (${quote(key.COLUMN_NAME)}, user_id) REFERENCES ${quote(key.REFERENCED_TABLE_NAME)} (${quote(key.REFERENCED_COLUMN_NAME)}, user_id) ON DELETE ${key.DELETE_RULE} ON UPDATE ${key.UPDATE_RULE}`);
    }
    const [settings] = await connection.query('SELECT user_id, setting_key, setting_value FROM ai_settings');
    for (const setting of settings) {
      if (!isSecret(setting.setting_key) || !setting.setting_value || setting.setting_value.startsWith('enc:v1:')) continue;
      await connection.execute('UPDATE ai_settings SET setting_value=? WHERE user_id=? AND setting_key=?', [encryptSecret(setting.setting_value, setting.user_id, setting.setting_key), setting.user_id, setting.setting_key]);
    }
    const uploadRoot = process.env.UPLOAD_ROOT ? path.resolve(process.env.UPLOAD_ROOT) : path.resolve(__dirname, '..', 'uploads');
    for (const category of ['icons', 'wool', 'quiz', 'movie', 'stock', 'board', 'photo']) {
      const source = path.join(uploadRoot, category);
      const target = path.join(uploadRoot, 'users', String(ownerId), category);
      if (fs.existsSync(source)) {
        await copyLegacyFiles(source, target);
        console.log(`旧文件已复制: ${category}`);
      }
    }
    await connection.query("UPDATE schema_migrations SET completed_at=NOW() WHERE name='phase1'");
    console.log('Phase 1 迁移完成。旧文件保留，旧数据全部归迁移所有者，平台环境 AI Key 不会共享。');
    return { ownerId, backupFile };
  } finally {
    if (locked) await connection.query("SELECT RELEASE_LOCK('stock-phase1-migration')").catch(() => {});
    await connection.end();
  }
}

async function cli() {
  const apply = process.argv.includes('--apply');
  if (apply) {
    const active = await new Promise(resolve => {
      const socket = net.connect({ host: '127.0.0.1', port: Number(process.env.PORT) || 3300 });
      socket.setTimeout(1500);
      socket.once('connect', () => { socket.destroy(); resolve(true); });
      socket.once('error', () => resolve(false));
      socket.once('timeout', () => { socket.destroy(); resolve(false); });
    });
    if (active) throw new Error('项目服务仍在运行。请先关闭服务再迁移，防止旧版并发写入；预检不受影响。');
  }
  await migratePhase1({ apply });
}

if (require.main === module) cli().catch(error => { console.error(error.message); process.exitCode = 1; });

module.exports = { migratePhase1 };
