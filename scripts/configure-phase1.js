const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const dotenv = require('dotenv');

const envFile = path.resolve('.env');
let content = fs.existsSync(envFile) ? fs.readFileSync(envFile, 'utf8') : '';
const existing = dotenv.parse(content);
const credentials = {
  email: existing.MIGRATION_OWNER_EMAIL || 'owner@example.local',
  password: existing.MIGRATION_OWNER_PASSWORD || crypto.randomBytes(18).toString('base64url'),
};
const defaults = {
  DB_HOST: 'localhost', DB_USER: process.env.DB_USER || 'stock_app',
  DB_PASSWORD: process.env.DB_PASSWORD, DB_NAME: 'stock_calculator',
  KEY_ENCRYPTION_KEY: crypto.randomBytes(32).toString('base64'),
  MIGRATION_OWNER_EMAIL: credentials.email, MIGRATION_OWNER_PASSWORD: credentials.password,
  REGISTRATION_OPEN: 'true', ENABLE_LOCAL_FEATURES: 'true', COOKIE_SECURE: 'false',
  ALLOWED_ORIGINS: 'http://localhost:3300,http://127.0.0.1:3300,http://localhost:5173,http://127.0.0.1:5173,http://localhost:5273,http://127.0.0.1:5273',
};
if (!existing.DB_PASSWORD && !defaults.DB_PASSWORD) throw new Error('请先通过环境变量 DB_PASSWORD 提供本机数据库密码');
for (const [name, value] of Object.entries(defaults)) if (!(name in existing) && value !== undefined) content += `\n${name}=${JSON.stringify(value)}`;
fs.writeFileSync(envFile, content + '\n', { mode: 0o600 });
const credentialFile = path.resolve('.launcher', 'phase1-credentials.json');
fs.mkdirSync(path.dirname(credentialFile), { recursive: true });
if (!fs.existsSync(credentialFile)) fs.writeFileSync(credentialFile, JSON.stringify(credentials, null, 2), { mode: 0o600 });
console.log(`本机环境已配置，所有者登录信息保存在 ${credentialFile}。请停旧服务后执行 npm run migrate:phase1 -- --apply。`);
