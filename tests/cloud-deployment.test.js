const test = require('node:test');
const assert = require('node:assert/strict');
const { rowDigest, splitConstraints } = require('../scripts/import-cloud');
const { vercelConfig } = require('../scripts/configure-vercel');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { deploymentFiles } = require('../scripts/deploy-vercel-frontend');

test('云库内容校验统一 JSON 和数字，检测篡改和行序变化', () => {
  const columns = [{ COLUMN_NAME: 'id', DATA_TYPE: 'bigint' }, { COLUMN_NAME: 'details', DATA_TYPE: 'json' }];
  const source = [{ id: 1, details: { b: 2, a: 1 } }];
  assert.equal(rowDigest(source, columns), rowDigest([{ id: '1', details: '{"a":1,"b":2}' }], columns));
  assert.notEqual(rowDigest(source, columns), rowDigest([{ id: 2, details: { a: 1, b: 2 } }], columns));
  const rows = [...source, { id: 2, details: null }];
  assert.notEqual(rowDigest(rows, columns), rowDigest([...rows].reverse(), columns));
});

test('外键延迟创建且保留复合键及删除规则', () => {
  const schema = 'CREATE TABLE `child` (\n  `id` int NOT NULL,\n  `user_id` int NOT NULL,\n  KEY `tenant` (`user_id`),\n  CONSTRAINT `fk` FOREIGN KEY (`id`, `user_id`) REFERENCES `parent` (`id`, `user_id`) ON DELETE CASCADE\n) ENGINE=InnoDB';
  const result = splitConstraints(schema);
  assert.equal(result.constraints.length, 1);
  assert.match(result.constraints[0], /ON DELETE CASCADE$/);
  assert.ok(!result.ddl.includes('FOREIGN KEY'));
  assert.ok(!result.ddl.includes(',\n)'));
  assert.match(result.ddl, /KEY `tenant`/);
});

test('Vercel 使用同源代理，API 和私有上传禁止缓存', () => {
  const config = vercelConfig('https://stock-production.up.railway.app');
  assert.equal(config.rewrites[0].destination, 'https://stock-production.up.railway.app/api/:path*');
  assert.equal(config.rewrites[1].destination, 'https://stock-production.up.railway.app/uploads/:path*');
  assert.equal(config.rewrites.at(-1).destination, '/index.html');
  assert.equal(config.headers.length, 2);
  assert.ok(config.headers.every(route => route.headers[0].value.includes('no-store')));
});

test('部署配置拒绝凭据、HTTP、IP、占位域名及路径', () => {
  for (const origin of ['http://real.railway.app', 'https://name:secret@real.railway.app', 'https://127.0.0.1', 'https://backend.invalid', 'https://localhost', 'https://real.railway.app/api', 'https://real.railway.app?token=secret', 'https://real.railway.app:8443']) {
    assert.throws(() => vercelConfig(origin));
  }
});

test('只上传构建文件，拒绝环境文件和未构建目录', () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'stock-vercel-artifacts-'));
  try {
    assert.throws(() => deploymentFiles(directory), /构建前端/);
    fs.writeFileSync(path.join(directory, 'index.html'), '<html>test</html>');
    fs.mkdirSync(path.join(directory, 'assets'));
    fs.writeFileSync(path.join(directory, 'assets', 'app.js'), 'console.log("test")');
    const files = deploymentFiles(directory);
    assert.deepEqual(files.map(file => file.file).sort(), ['assets/app.js', 'index.html']);
    assert.ok(files.every(file => file.encoding === 'base64'));
    fs.writeFileSync(path.join(directory, '.env'), 'SECRET=must-not-upload');
    assert.throws(() => deploymentFiles(directory), /拒绝发布/);
  } finally {
    fs.unlinkSync(path.join(directory, 'index.html'));
    fs.unlinkSync(path.join(directory, 'assets', 'app.js'));
    fs.unlinkSync(path.join(directory, '.env'));
    fs.rmdirSync(path.join(directory, 'assets'));
    fs.rmdirSync(directory);
  }
});
