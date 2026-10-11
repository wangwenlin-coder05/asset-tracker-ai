const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const acorn = require('acorn');
const { scopeSql } = require('../backend/tenant-db');
const { encryptSecret, decryptSecret } = require('../backend/secrets');
const { context } = require('../backend/context');
const { tenantUploadPath } = require('../backend/uploads');

test('SELECT / JOIN / 子查询 / UNION 均携带租户限制', () => {
  const sql = scopeSql('SELECT s.id, (SELECT COUNT(*) FROM buy_records b WHERE b.stock_id=s.id) AS count FROM stocks s LEFT JOIN sell_records r ON r.stock_id=s.id WHERE s.id=? OR s.code=? UNION SELECT id, 0 FROM stocks', 42);
  assert.equal((sql.match(/`user_id` = 42/g) || []).length, 4);
  assert.match(sql, /LEFT JOIN `sell_records` AS `r` ON .*`r`\.`user_id` = 42/);
  assert.match(sql, /\(.* OR .*\) AND `s`\.`user_id` = 42/);
});

test('UPDATE / DELETE 不允许跨租户，保留参数与锁', () => {
  assert.match(scopeSql('UPDATE stocks SET name=? WHERE id=?', 7), /AND `stocks`\.`user_id` = 7/);
  assert.match(scopeSql('DELETE FROM stocks WHERE id IN (?, ?)', 7), /AND `stocks`\.`user_id` = 7/);
  assert.match(scopeSql('SELECT id FROM stocks WHERE id=? FOR UPDATE', 7), /FOR UPDATE$/);
});

test('INSERT / upsert 自动附加 user_id，不能注入或修改租户', () => {
  const sql = scopeSql('INSERT INTO ai_settings (setting_key, setting_value) VALUES (?, ?) ON DUPLICATE KEY UPDATE setting_value=?', 8);
  assert.match(sql, /user_id\) VALUES \(\?,\?,8\)/);
  assert.equal((sql.match(/\?/g) || []).length, 3);
  assert.throws(() => scopeSql('INSERT INTO stocks (id, user_id) VALUES (?, ?)', 8));
  assert.throws(() => scopeSql('UPDATE stocks SET user_id=? WHERE id=?', 8));
  assert.throws(() => scopeSql('UPDATE stocks SET name=?', NaN));
});

test('非业务表 / 多语句 / DDL / INSERT SELECT 均失败关闭', () => {
  for (const sql of ['SELECT * FROM users', 'SELECT * FROM other.stocks', 'SELECT * FROM stocks; DELETE FROM stocks', 'ALTER TABLE stocks DROP user_id', 'INSERT INTO stocks (id) SELECT id FROM stocks']) assert.throws(() => scopeSql(sql, 1));
});

test('加密密钥绑定账号及提供商，拒绝错账号及损坏数据', () => {
  process.env.KEY_ENCRYPTION_KEY = crypto.randomBytes(32).toString('base64');
  const encrypted = encryptSecret('test-private-token', 1, 'glm_api_key');
  assert.equal(decryptSecret(encrypted, 1, 'glm_api_key'), 'test-private-token');
  assert.ok(!encrypted.includes('test-private-token'));
  assert.throws(() => decryptSecret(encrypted, 2, 'glm_api_key'));
  assert.throws(() => decryptSecret(encrypted, 1, 'agnes_api_key'));
  assert.throws(() => decryptSecret('plaintext', 1, 'glm_api_key'));
});

test('上传路径拒绝跨用户及目录穿越', () => {
  context.run({ user: { id: 42 } }, () => {
    assert.match(tenantUploadPath('uploads/wool/test.png'), /users[\\/]42[\\/]wool/);
    assert.throws(() => tenantUploadPath('uploads/users/43/wool/test.png'));
    assert.throws(() => tenantUploadPath('uploads/wool/../../../.env'));
    assert.throws(() => tenantUploadPath('uploads/users/42/../43/a.png'));
    assert.throws(() => tenantUploadPath('C:\\Windows\\secret'));
  });
});

test('所有静态业务 SQL 均能转换；唯独 bootstrap 显式管理查询不走租户层', () => {
  let count = 0;
  for (const file of ['server.js', 'wechat-extractor.js']) {
    const ast = acorn.parse(fs.readFileSync(file, 'utf8'), { ecmaVersion: 'latest', locations: true });
    function visit(node) {
      if (!node || typeof node !== 'object') return;
      if (node.type === 'CallExpression' && node.callee.type === 'MemberExpression' && ['query', 'execute'].includes(node.callee.property.name)) {
        const argument = node.arguments[0];
        const sql = argument?.type === 'Literal' && typeof argument.value === 'string' ? argument.value : argument?.type === 'TemplateLiteral' && !argument.expressions.length ? argument.quasis[0].value.cooked : null;
        if (sql && /^\s*(SELECT|INSERT|UPDATE|DELETE|REPLACE)\b/i.test(sql) && !/\b(?:users|schema_migrations)\b/.test(sql)) {
          assert.doesNotThrow(() => scopeSql(sql, 17), `${file}:${node.loc.start.line}`);
          count++;
        }
      }
      for (const value of Object.values(node)) if (Array.isArray(value)) value.forEach(visit); else if (value && typeof value === 'object') visit(value);
    }
    visit(ast);
  }
  assert.ok(count > 300);
});
