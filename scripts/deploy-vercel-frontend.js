const fs = require('node:fs');
const path = require('node:path');
const dotenv = require('dotenv');
const { vercelConfig } = require('./configure-vercel');

const stateDirectory = path.resolve('.launcher', 'phase1-verify-vercel');
const stateFile = path.join(stateDirectory, 'deployment.json');

function deploymentFiles(directory) {
  const files = [];
  function collect(current) {
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      if (entry.isSymbolicLink()) throw new Error('部署产物不能包含符号链接');
      const filename = path.join(current, entry.name);
      if (entry.isDirectory()) collect(filename);
      else if (entry.isFile()) {
        if (entry.name.startsWith('.') || !/\.(?:html|js|css|svg|png|jpe?g|webp|gif|ico|woff2?|ttf|txt)$/i.test(entry.name)) throw new Error(`意外的构建文件，拒绝发布: ${entry.name}`);
        files.push({ file: path.relative(directory, filename).replace(/\\/g, '/'), data: fs.readFileSync(filename).toString('base64'), encoding: 'base64' });
      }
    }
  }
  collect(directory);
  if (!files.some(file => file.file === 'index.html')) throw new Error('请先构建前端');
  return files;
}

async function deploy({ pendingBackend = false, backendOrigin, verifyCurrent = false } = {}) {
  if (pendingBackend === Boolean(backendOrigin)) throw new Error('必须选择真实后端域名，或明确使用 --pending-backend 发布未开放登录的前端');
  const environment = dotenv.parse(fs.readFileSync('.env.cloud.local'));
  if (!environment.VERCEL_TOKEN) throw new Error('缺少 VERCEL_TOKEN');
  const state = JSON.parse(fs.readFileSync(stateFile, 'utf8'));
  const files = deploymentFiles(path.resolve('frontend', 'dist'));
  for (const file of files) {
    const contents = Buffer.from(file.data, 'base64').toString('utf8');
    for (const name of ['VERCEL_TOKEN', 'DB_PASSWORD', 'KEY_ENCRYPTION_KEY']) {
      if (environment[name] && contents.includes(environment[name])) throw new Error(`部署产物含秘密: ${file.file}`);
    }
  }
  const routes = pendingBackend ? {
    headers: [{ source: '/api/:path*', headers: [{ key: 'Cache-Control', value: 'private, no-store' }] }],
    rewrites: [
      { source: '/api/:path*', destination: '/api/gateway' },
      { source: '/uploads/:path*', destination: '/api/gateway' },
      { source: '/healthz', destination: '/api/gateway' },
      { source: '/:path*', destination: '/index.html' },
    ],
  } : vercelConfig(backendOrigin);
  const configuration = {
    version: 2, buildCommand: '', installCommand: '',
    headers: routes.headers, rewrites: routes.rewrites,
  };
  if (verifyCurrent) {
    if (!pendingBackend || !state.aliases?.length) throw new Error('云端预览核验必须有已发布的待接后端版本');
    const expected = files.map(file => ({ file: file.file, hash: require('node:crypto').createHash('sha256').update(Buffer.from(file.data, 'base64')).digest('hex') }));
    const verifier = `const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const base = ${JSON.stringify('https://' + state.aliases[0])};
const expected = ${JSON.stringify(expected)};
async function main() {
  for (const artifact of expected) {
    const response = await fetch(base + '/' + artifact.file, { signal: AbortSignal.timeout(30000) });
    const data = Buffer.from(await response.arrayBuffer());
    if (response.status !== 200 || crypto.createHash('sha256').update(data).digest('hex') !== artifact.hash) throw new Error('线上构建文件不一致: ' + artifact.file + ' HTTP ' + response.status);
    console.log('ONLINE_CHECK ' + artifact.file + ' HTTP 200 SHA256_MATCH');
  }
  for (const endpoint of ['/api/auth/me', '/api/stocks', '/healthz']) {
    const response = await fetch(base + endpoint, { signal: AbortSignal.timeout(30000) });
    const body = await response.json();
    if (response.status !== 503 || body.code !== 'BACKEND_NOT_CONFIGURED') throw new Error('待接后端状态不正确: ' + endpoint);
    console.log('ONLINE_CHECK ' + endpoint + ' HTTP 503 BACKEND_NOT_CONFIGURED');
  }
  fs.mkdirSync('public', { recursive: true });
  for (const artifact of expected) {
    const destination = path.join('public', artifact.file);
    fs.mkdirSync(path.dirname(destination), { recursive: true });
    fs.copyFileSync(artifact.file, destination);
  }
  console.log('ONLINE_CHECK COMPLETE: frontend public assets verified; backend remains unavailable');
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });
`;
    configuration.buildCommand = 'node verify-online.js';
    configuration.outputDirectory = 'public';
    files.push({ file: 'verify-online.js', data: Buffer.from(verifier).toString('base64'), encoding: 'base64' });
    files.push({ file: 'package.json', data: Buffer.from(JSON.stringify({ private: true })).toString('base64'), encoding: 'base64' });
  }
  if (pendingBackend) {
    configuration.functions = { 'api/gateway.js': { maxDuration: 10 } };
    const gateway = "module.exports = function (req, res) { res.setHeader('Cache-Control', 'private, no-store'); res.setHeader('Retry-After', '3600'); res.status(503).json({ error: '后端尚未部署，暂未开放登录、注册及数据操作。管理员正在配置后端服务。', code: 'BACKEND_NOT_CONFIGURED' }); };\n";
    files.push({ file: 'api/gateway.js', data: Buffer.from(gateway).toString('base64'), encoding: 'base64' });
  }
  files.push({ file: 'vercel.json', data: Buffer.from(JSON.stringify(configuration)).toString('base64'), encoding: 'base64' });
  const teamQuery = state.accountId?.startsWith('team_') ? `?teamId=${encodeURIComponent(state.accountId)}` : '';
  async function request(route, options = {}) {
    const response = await fetch(`https://api.vercel.com${route}${teamQuery}`, {
      ...options,
      headers: { Authorization: `Bearer ${environment.VERCEL_TOKEN}`, 'Content-Type': 'application/json' },
    });
    const data = await response.json();
    if (!response.ok) throw new Error(`Vercel ${response.status}: ${data.error?.message || 'API 请求失败'}`);
    return data;
  }
  console.log(`上传 ${files.length} 个构建文件；不上传 .env、源码目录、备份或用户文件`);
  const created = await request('/v13/deployments', {
    method: 'POST',
    body: JSON.stringify({ name: state.projectName, project: state.projectId, target: 'production', files, projectSettings: { framework: null, buildCommand: configuration.buildCommand, installCommand: '', outputDirectory: configuration.outputDirectory || null, rootDirectory: null } }),
  });
  Object.assign(state, { deploymentId: created.id, deploymentUrl: created.url, status: created.readyState, backendConfigured: !pendingBackend, deployedAt: new Date().toISOString() });
  fs.writeFileSync(stateFile, JSON.stringify(state, null, 2));
  for (let attempt = 0; attempt < 120; attempt++) {
    const current = await request(`/v13/deployments/${created.id}`);
    if (state.status !== current.readyState) console.log(`Vercel 状态: ${current.readyState}`);
    Object.assign(state, { status: current.readyState, aliases: current.alias || [], deploymentUrl: current.url });
    fs.writeFileSync(stateFile, JSON.stringify(state, null, 2));
    if (current.readyState === 'READY') { console.log(JSON.stringify(state, null, 2)); return state; }
    if (['ERROR', 'CANCELED'].includes(current.readyState)) throw new Error(`部署失败: ${current.errorMessage || current.errorCode || current.readyState}`);
    await new Promise(resolve => setTimeout(resolve, 3000));
  }
  throw new Error('部署仍在构建中；请根据已保存的 deploymentId 检查，不重复创建部署');
}

if (require.main === module) {
  const argumentsList = process.argv.slice(2);
  const verifyCurrent = argumentsList.includes('--verify-current');
  const deploymentArguments = argumentsList.filter(argument => argument !== '--verify-current');
  const pendingBackend = deploymentArguments.length === 1 && deploymentArguments[0] === '--pending-backend';
  const backendOrigin = deploymentArguments.length === 1 && !deploymentArguments[0].startsWith('--') ? deploymentArguments[0] : undefined;
  deploy({ pendingBackend, backendOrigin, verifyCurrent }).catch(error => { console.error(error.message); process.exitCode = 1; });
}

module.exports = { deploymentFiles, deploy };
