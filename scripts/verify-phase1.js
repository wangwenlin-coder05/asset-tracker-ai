require('dotenv').config({ quiet: true });
const mysql = require('mysql2/promise');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const net = require('node:net');
const { spawn } = require('node:child_process');
const assert = require('node:assert/strict');
const { databaseConfig } = require('../backend/config');
const { BUSINESS_TABLES } = require('../backend/tenant-db');

async function verify() {
  const sourceDatabase = databaseConfig().database;
  const testDatabase = `stock_phase1_verify_${Date.now()}`;
  const directory = path.resolve('.launcher', `phase1-verify-${Date.now()}`);
  fs.mkdirSync(directory, { recursive: true });
  const admin = await mysql.createConnection(databaseConfig());
  let child;
  let logs = '';
  try {
    await admin.query(`CREATE DATABASE ${mysql.escapeId(testDatabase)} CHARACTER SET utf8mb4`);
    for (const table of BUSINESS_TABLES) await admin.query(`CREATE TABLE ${mysql.escapeId(testDatabase)}.${mysql.escapeId(table)} LIKE ${mysql.escapeId(sourceDatabase)}.${mysql.escapeId(table)}`);
    await admin.query(`USE ${mysql.escapeId(testDatabase)}`);
    for (const table of BUSINESS_TABLES) {
      const [columns] = await admin.query(`SHOW COLUMNS FROM ${mysql.escapeId(table)} LIKE 'user_id'`);
      if (!columns.length) continue;
      const [indexes] = await admin.query(`SHOW INDEX FROM ${mysql.escapeId(table)}`);
      const grouped = new Map();
      for (const index of indexes) {
        if (!grouped.has(index.Key_name)) grouped.set(index.Key_name, []);
        grouped.get(index.Key_name).push(index);
      }
      for (const [name, parts] of grouped) {
        if (!parts.some(part => part.Column_name === 'user_id')) continue;
        const retained = parts.filter(part => part.Column_name !== 'user_id').sort((left, right) => left.Seq_in_index - right.Seq_in_index).map(part => mysql.escapeId(part.Column_name));
        const drop = name === 'PRIMARY' ? 'DROP PRIMARY KEY' : `DROP INDEX ${mysql.escapeId(name)}`;
        const add = retained.length ? `, ADD ${name === 'PRIMARY' ? 'PRIMARY KEY' : `${parts[0].Non_unique ? 'INDEX' : 'UNIQUE INDEX'} ${mysql.escapeId(name)}`} (${retained.join(',')})` : '';
        await admin.query(`ALTER TABLE ${mysql.escapeId(table)} ${drop}${add}`);
      }
      await admin.query(`ALTER TABLE ${mysql.escapeId(table)} DROP COLUMN user_id`);
    }
    await admin.query('ALTER TABLE buy_records ADD CONSTRAINT test_buy_fk FOREIGN KEY (stock_id) REFERENCES stocks(id) ON DELETE CASCADE');
    await admin.query('ALTER TABLE sell_records ADD CONSTRAINT test_sell_fk FOREIGN KEY (stock_id) REFERENCES stocks(id) ON DELETE CASCADE');
    await admin.execute("INSERT INTO ai_settings (setting_key, setting_value) VALUES ('glm_api_key', 'legacy-owner-test-token')");
    await admin.execute("INSERT INTO wool_daily_amounts (id, wool_date, quick_amount) VALUES ('legacy', '2026-10-01', 123)");
    process.env.DB_NAME = testDatabase;
    process.env.UPLOAD_ROOT = path.join(directory, 'uploads');
    fs.mkdirSync(path.join(process.env.UPLOAD_ROOT, 'quiz'), { recursive: true });
    fs.writeFileSync(path.join(process.env.UPLOAD_ROOT, 'quiz', 'legacy.png'), 'synthetic-legacy-file');
    process.env.KEY_ENCRYPTION_KEY = crypto.randomBytes(32).toString('base64');
    const { migratePhase1 } = require('./migrate-phase1');
    await migratePhase1({ apply: true, backupDir: directory, ownerEmail: 'owner@test.example', ownerPassword: 'owner-test-password-123' });
    await migratePhase1({ apply: true, backupDir: directory });
    assert.equal(fs.readFileSync(path.join(process.env.UPLOAD_ROOT, 'users', '1', 'quiz', 'legacy.png'), 'utf8'), 'synthetic-legacy-file');
    assert.equal(fs.readFileSync(path.join(process.env.UPLOAD_ROOT, 'quiz', 'legacy.png'), 'utf8'), 'synthetic-legacy-file');
    const [legacy] = await admin.query("SELECT user_id, quick_amount FROM wool_daily_amounts WHERE id='legacy'");
    assert.equal(Number(legacy[0].quick_amount), 123);
    assert.equal(legacy.length, 1);
    const [encrypted] = await admin.query("SELECT setting_value FROM ai_settings WHERE setting_key='glm_api_key'");
    assert.ok(encrypted[0].setting_value.startsWith('enc:v1:'));
    const [keys] = await admin.query("SELECT COLUMN_NAME FROM information_schema.KEY_COLUMN_USAGE WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='buy_records' AND CONSTRAINT_NAME='test_buy_fk'");
    assert.equal(keys.length, 2);
    const port = await new Promise(resolve => {
      const listener = net.createServer();
      listener.listen(0, '127.0.0.1', () => { const selected = listener.address().port; listener.close(() => resolve(selected)); });
    });
    const base = `http://127.0.0.1:${port}`;
    child = spawn(process.execPath, ['server.js'], {
      cwd: path.resolve(__dirname, '..'), windowsHide: true,
      env: { ...process.env, PORT: String(port), REGISTRATION_OPEN: 'true', ENABLE_LOCAL_FEATURES: 'false', COOKIE_SECURE: 'false', NODE_ENV: 'test', BACKGROUND_JOBS_ENABLED: 'false', ALLOWED_ORIGINS: base, GLM_API_KEY: 'must-never-be-used', AGNES_API_KEY: 'must-never-be-used', ALAPI_TOKEN: 'must-never-be-used' },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    child.stdout.on('data', value => { logs += value.toString(); });
    child.stderr.on('data', value => { logs += value.toString(); });
    let ready = false;
    for (let attempt = 0; attempt < 120; attempt++) {
      try { const response = await fetch(`${base}/api/auth/me`); if (response.status === 401) { ready = true; break; } } catch {}
      if (child.exitCode !== null) throw new Error(`测试服务启动失败：${logs}`);
      await new Promise(resolve => setTimeout(resolve, 250));
    }
    if (!ready) throw new Error(`测试服务启动超时：${logs}`);
    async function request(endpoint, session, method = 'GET', body, extra = {}) {
      const response = await fetch(`${base}${endpoint}`, {
        method,
        headers: { ...(body ? { 'Content-Type': 'application/json' } : {}), ...(session ? { Cookie: session.cookie, 'X-CSRF-Token': session.csrfToken } : {}), ...extra },
        ...(body ? { body: JSON.stringify(body) } : {}),
      });
      const text = await response.text();
      return { status: response.status, data: (() => { try { return JSON.parse(text); } catch { return text; } })(), response };
    }
    async function register(email) {
      const result = await request('/api/auth/register', null, 'POST', { email, password: 'phase1-test-password-123' });
      assert.equal(result.status, 201, JSON.stringify(result.data));
      return { cookie: result.response.headers.get('set-cookie').split(';')[0], csrfToken: result.data.csrfToken, id: result.data.user.id };
    }
    let first = await register('a@test.example');
    const second = await register('b@test.example');
    assert.equal((await request('/api/stocks')).status, 401);
    assert.equal((await request('/api/stocks', first, 'POST', {}, { 'X-CSRF-Token': '' })).status, 403);
    assert.equal((await request('/api/auth/register', null, 'POST', { email: 'c@test.example', password: 'phase1-test-password-123' }, { Origin: 'https://attacker.invalid' })).status, 403);
    const stock = await request('/api/stocks', first, 'POST', { name: '租户A', code: '600000', cost: 10, count: 100 });
    assert.equal(stock.status, 200, JSON.stringify(stock.data));
    const secondStock = await request('/api/stocks', second, 'POST', { name: '租户B', code: '600000', cost: 20, count: 200 });
    assert.equal(secondStock.status, 200, JSON.stringify(secondStock.data));
    assert.notEqual(stock.data.id, secondStock.data.id);
    assert.equal((await request('/api/stocks', first)).data.length, 1);
    assert.equal((await request(`/api/stocks/${stock.data.id}`, second)).status, 404);
    await request(`/api/stocks/${stock.data.id}`, second, 'PUT', { name: '越权修改' });
    await request(`/api/stocks/${stock.data.id}`, second, 'DELETE');
    const [unchanged] = await admin.execute('SELECT name FROM stocks WHERE id=? AND user_id=?', [stock.data.id, first.id]);
    assert.equal(unchanged[0].name, '租户A');
    const illegalChild = await request(`/api/stocks/${stock.data.id}/sell-record`, second, 'POST', { sellDate: '2026-10-11', sellPrice: 12, sellCount: 10 });
    assert.notEqual(illegalChild.status, 200);
    const deposit = await request('/api/deposits', first, 'POST', { name: 'A账户', amount: 100 });
    assert.equal(deposit.status, 200, JSON.stringify(deposit.data));
    assert.equal((await request(`/api/deposits/${deposit.data.id}/transactions`, second, 'POST', { mode: 'add', amount: 99 })).status, 404);
    assert.equal((await request('/api/deposits', second)).data.length, 0);
    for (const session of [first, second]) {
      const result = await request('/api/wool/daily/2026-10-11', session, 'PUT', { quickAmount: session.id });
      assert.equal(result.status, 200, JSON.stringify(result.data));
      assert.equal((await request('/api/stock/daily-summary', session, 'PUT', { date: '2026-10-11', content: `private-${session.id}` })).status, 200);
    }
    const [sameId] = await admin.query("SELECT COUNT(*) count FROM wool_daily_amounts WHERE id='wda_20261011'");
    assert.equal(sameId[0].count, 2);
    assert.equal((await request('/api/stock/daily-summary?date=2026-10-11', first)).data.content, `private-${first.id}`);
    assert.equal((await request('/api/stock/daily-summary?date=2026-10-11', second)).data.content, `private-${second.id}`);
    assert.equal((await request('/api/ai/settings', first, 'PUT', { glm_api_key: 'user-a-private-token', alapi_token: 'user-a-alapi' })).status, 200);
    const firstSettings = await request('/api/ai/settings', first);
    const secondSettings = await request('/api/ai/settings', second);
    assert.equal(firstSettings.data.glm_api_key_configured, true);
    assert.equal(firstSettings.data.alapi_token_configured, true);
    assert.ok(!JSON.stringify(firstSettings.data).includes('private-token'));
    assert.ok(!secondSettings.data.glm_api_key_configured);
    const noKey = await request('/api/ai/test-model', second, 'POST', { model: 'glm-4-flash-250414' });
    assert.match(noKey.data.result, /未配置/);
    await request('/api/ai/settings', first, 'PUT', { glm_api_key: '' });
    assert.equal((await request('/api/ai/settings', first)).data.glm_api_key_configured, true);
    await request('/api/ai/settings', first, 'PUT', { glm_api_key: null });
    assert.equal((await request('/api/ai/settings', first)).data.glm_api_key_configured, false);
    for (const endpoint of ['/api/wechat/status', '/api/quant-service/status', '/quant/ping', '/api/extract/learn', '/api/ai/article-parse?url=http://127.0.0.1']) assert.equal((await request(endpoint, first)).status, 403);
    for (const endpoint of ['/.env', '/server.js', '/package.json', '/.git/config']) assert.equal((await request(endpoint)).status, 404);
    const form = new FormData();
    form.append('image', new Blob([Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aDe8AAAAASUVORK5CYII=', 'base64')], { type: 'image/png' }), 'test.png');
    const upload = await fetch(`${base}/api/quiz/upload-image`, { method: 'POST', headers: { Cookie: first.cookie, 'X-CSRF-Token': first.csrfToken }, body: form });
    assert.equal(upload.status, 200);
    const uploaded = await upload.json();
    assert.match(uploaded.imagePath, new RegExp(`uploads/users/${first.id}/quiz/`));
    assert.equal((await request(`/${uploaded.imagePath}`)).status, 401);
    assert.equal((await request(`/${uploaded.imagePath}`, second)).status, 404);
    assert.equal((await request(`/${uploaded.imagePath}`, first)).status, 200);
    const password = 'phase1-test-password-123';
    const siblingLogin = await request('/api/auth/login', null, 'POST', { email: 'a@test.example', password });
    assert.equal(siblingLogin.status, 200);
    const sibling = { cookie: siblingLogin.response.headers.get('set-cookie').split(';')[0], csrfToken: siblingLogin.data.csrfToken };
    assert.equal((await request('/api/auth/account', first, 'POST', { email: 'new@test.example', currentPassword: password }, { 'X-CSRF-Token': '' })).status, 403);
    assert.equal((await request('/api/auth/account', first, 'POST', { email: 'new@test.example', currentPassword: 'wrong-password' })).status, 401);
    assert.equal((await request('/api/auth/account', first, 'POST', { email: 'b@test.example', currentPassword: password })).status, 409);
    assert.equal((await request('/api/auth/me', first)).status, 200);
    const oldSession = first;
    const accountChange = await request('/api/auth/account', first, 'POST', { email: 'new@test.example', currentPassword: password, user_id: second.id, role: 'owner' });
    assert.equal(accountChange.status, 200, JSON.stringify(accountChange.data));
    assert.equal(accountChange.data.user.id, first.id);
    assert.equal(accountChange.data.user.role, 'user');
    assert.equal(accountChange.data.user.email, 'new@test.example');
    first = { id: first.id, cookie: accountChange.response.headers.get('set-cookie').split(';')[0], csrfToken: accountChange.data.csrfToken };
    assert.notEqual(first.csrfToken, oldSession.csrfToken);
    assert.equal((await request('/api/auth/me', oldSession)).status, 401);
    assert.equal((await request('/api/auth/me', sibling)).status, 401);
    assert.equal((await request('/api/auth/login', null, 'POST', { email: 'a@test.example', password })).status, 401);
    assert.equal((await request('/api/stocks', first)).data.length, 1);
    assert.equal((await request('/api/auth/me', second)).data.user.email, 'b@test.example');
    assert.equal((await request('/api/auth/password', first, 'POST', { currentPassword: password, newPassword: 'short' })).status, 400);
    assert.equal((await request('/api/auth/password', first, 'POST', { currentPassword: 'wrong-password', newPassword: 'changed-password-123' })).status, 401);
    const beforePasswordChange = first;
    const passwordChange = await request('/api/auth/password', first, 'POST', { currentPassword: password, newPassword: 'changed-password-123' });
    assert.equal(passwordChange.status, 200, JSON.stringify(passwordChange.data));
    first = { id: first.id, cookie: passwordChange.response.headers.get('set-cookie').split(';')[0], csrfToken: passwordChange.data.csrfToken };
    assert.equal((await request('/api/auth/me', beforePasswordChange)).status, 401);
    assert.equal((await request('/api/auth/login', null, 'POST', { email: 'new@test.example', password })).status, 401);
    assert.equal((await request('/api/auth/login', null, 'POST', { email: 'new@test.example', password: 'changed-password-123' })).status, 200);
    assert.equal((await request('/api/auth/logout', first, 'POST', {})).status, 200);
    assert.equal((await request('/api/stocks', first)).status, 401);
    console.log('验证通过：迁移幂等、旧数据归属、复合外键、注册登录退出、CSRF、双租户读写/关联记录/唯一索引隔离、密钥加密与不回退平台 Key、私有文件与本机能力访问控制。');
  } finally {
    if (child && child.exitCode === null) {
      const exited = new Promise(resolve => child.once('exit', resolve));
      child.kill();
      await exited;
    }
    await admin.query(`DROP DATABASE IF EXISTS ${mysql.escapeId(testDatabase)}`);
    await admin.end();
    console.log('已关闭验证服务并移除临时测试库；现用库与原有服务未改动。');
  }
}

verify().catch(error => { console.error(error); process.exitCode = 1; });
