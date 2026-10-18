const fs = require('node:fs');
const acorn = require('acorn');
const { BUSINESS_TABLES } = require('../backend/tenant-db');

const source = fs.readFileSync('server.js', 'utf8');
const ast = acorn.parse(source, { ecmaVersion: 'latest', locations: true });
const functions = new Map();

function visit(node, callback) {
  if (!node || typeof node !== 'object') return;
  callback(node);
  for (const value of Object.values(node)) if (Array.isArray(value)) value.forEach(item => visit(item, callback)); else if (value && typeof value === 'object') visit(value, callback);
}

visit(ast, node => {
  if (node.type === 'FunctionDeclaration') functions.set(node.id.name, node);
});

function relatedTables(node, seen = new Set()) {
  const tables = new Set();
  visit(node, item => {
    if (item.type === 'Literal' && typeof item.value === 'string' || item.type === 'TemplateLiteral') {
      const sql = item.type === 'Literal' ? item.value : item.quasis.map(part => part.value.cooked).join(' ');
      if (/\b(?:SELECT|INSERT|UPDATE|DELETE|REPLACE)\b/i.test(sql)) for (const table of BUSINESS_TABLES) if (new RegExp(`\\b${table}\\b`, 'i').test(sql)) tables.add(table);
    }
    if (item.type === 'CallExpression' && item.callee.type === 'Identifier' && functions.has(item.callee.name) && !seen.has(item.callee.name)) {
      seen.add(item.callee.name);
      for (const table of relatedTables(functions.get(item.callee.name), seen)) tables.add(table);
    }
  });
  return [...tables].sort();
}

const routes = [];
visit(ast, node => {
  if (node.type !== 'CallExpression' || node.callee.type !== 'MemberExpression' || node.callee.object.name !== 'app') return;
  const method = node.callee.property.name;
  const endpoint = node.arguments[0]?.value;
  if (!['get', 'post', 'put', 'delete', 'patch', 'use'].includes(method) || typeof endpoint !== 'string' || !endpoint.startsWith('/api') && endpoint !== '/quant') return;
  if (method === 'use' && !['/quant', '/api/quant'].includes(endpoint)) return;
  const tables = node.arguments.slice(1).flatMap(handler => relatedTables(handler));
  const local = /^\/(?:api\/)?(?:wechat|extract|quant)(?:[-/]|$)/.test(endpoint) || ['/api/ai/article-parse', '/api/deposits/save-icon'].includes(endpoint);
  routes.push({ method: method === 'use' ? 'ALL' : method.toUpperCase(), path: endpoint, sourceLine: node.loc.start.line, tables: [...new Set(tables)].sort(), access: local ? 'local-owner-only' : 'authenticated-user', csrf: !['get', 'use'].includes(method), change: local ? '本机所有者 + 直接回环访问；云端禁用；SQL 仍限当前 user_id' : tables.length ? '原请求/响应结构保留；查询/子查询/JOIN/事务强制 user_id；写入自动归当前账号' : '新增会话鉴权；不读其他用户数据库数据' });
});

const authRoutes = [
  ['POST', '/api/auth/register', '公开（受注册开关/来源/限流约束）', '创建普通用户，bcrypt 哈希密码，建立 HttpOnly 会话及 CSRF Token'],
  ['POST', '/api/auth/login', '公开（来源/限流）', '校验密码，返回 user + csrfToken，原始会话 Token 只在 Cookie 中'],
  ['GET', '/api/auth/me', '已登录', '返回当前用户、角色、能力和 CSRF Token'],
  ['POST', '/api/auth/account', '已登录 + CSRF + 当前密码', '只修改自己的邮箱，保留用户 ID，事务撤销全部旧会话并换发当前会话'],
  ['POST', '/api/auth/password', '已登录 + CSRF + 当前密码', '校验新密码后更新 bcrypt 哈希，事务撤销全部旧会话并换发当前会话'],
  ['POST', '/api/auth/logout', '已登录 + CSRF', '删除当前会话，清除 Cookie'],
];
const lines = [
  '# Phase 1 逐接口改造清单', '',
  '此文件由 `npm run docs:phase1` 按当前 server.js 自动生成；接口表中的业务表包含静态可识别的 helper 调用，动态 SQL 仍由统一数据库边界强制隔离。', '',
  `当前登记：${routes.length} 个业务路由条目（含 2 个量化代理），另有 ${authRoutes.length} 个账号接口。实际业务表 ${BUSINESS_TABLES.size} 张；不沿用旧方案中的 31 张/165 个估计。`, '',
  '## 新账号接口', '', '| 方法 | 接口 | 权限 | 实际改法 |', '| --- | --- | --- | --- |',
  ...authRoutes.map(([method, endpoint, access, change]) => `| ${method} | \`${endpoint}\` | ${access} | ${change} |`), '',
  '## 所有业务接口', '', '| 方法 | 接口 | 关联业务表 | 权限及具体改法 |', '| --- | --- | --- | --- |',
  ...routes.map(route => `| ${route.method} | \`${route.path}\` | ${route.tables.map(table => `\`${table}\``).join('、') || '无 / 外部服务'} | ${route.change}${route.csrf ? '；写请求校验 X-CSRF-Token' : ''} |`), '',
  '## 特殊契约', '',
  '- `GET /api/ai/settings`：只返回本人设置，所有 `_api_key` 和 `alapi_token` 只返回 `<字段>_configured`。不返回明文或密文。',
  '- `PUT /api/ai/settings`：白名单字段；密钥非空字符串替换并加密，空字符串保持，`null` 删除。不接受用户提供的 `user_id`。',
  '- `POST /api/ai/test-model`：可先保存当前输入的 GLM/Agnes Key，再调用本人 Key；无 Key 不回退平台环境变量。',
  '- `GET /api/ai/providers`：官网申请入口及用户付费归属。不可传任意提供商 API URL。',
  '- 上传相关接口：鉴权/CSRF 在 multer 前执行；上传目录按用户隔离，返回 `uploads/users/<userId>/<分类>/<文件>`。',
  '- `GET /uploads/users/:userId/*`：使用登录 Cookie 验证文件归属，跨用户返回 404，禁止公共缓存；旧公共 `/uploads/<分类>` 入口关闭。',
  '- 原业务接口中的跨账号详情查询返回 404/空集合；部分历史 UPDATE/DELETE 返回 ok 但影响行数为零，不能改动他人的数据。',
  '- 微信及学习规则：Phase 1 不开放给普通用户，避免进程内监控缓存泄露；手工输入股票仍可走普通股票接口。',
  '- 共享量化 Python 服务：Phase 1 不开放给普通用户，避免共享任务/文件/进程密钥；Phase 2 再做独立任务隔离。',
  '- 文章抓取与远程图标保存：因为旧实现支持任意 URL，暂仅本机所有者可用，生产环境禁用；开放前须完成 SSRF 防护。',
];
fs.mkdirSync('docs', { recursive: true });
fs.writeFileSync('docs/phase1-api-inventory.md', lines.join('\n') + '\n');
fs.writeFileSync('docs/phase1-api-inventory.json', JSON.stringify(routes, null, 2) + '\n');
console.log(`生成 ${routes.length} 个业务路由条目的改造清单。`);
