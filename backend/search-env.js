// 搜索环境自检 + SearXNG（Docker 自托管）生命周期管理
//
// 目标：Node 后端启动时自动把本地搜索链路拉起来并验证真的可用：
//   ① 检查 Docker 引擎，没就绪就先拉起 Docker Desktop，再轮询等待引擎 ready（最多 90s）
//   ② 确保 searxng-local 容器存在且带 --restart unless-stopped（存在则 start，缺失/配置不对则重建）
//   ③ 等容器 HTTP 服务真正可响应，再做端到端探测，打印各搜索源健康状态与最终 provider
//
// 失败一律「打日志 + 降级」，绝不阻塞 Express 启动；线上（NODE_ENV=production）禁用自动 docker 管理。
const { execFile, spawn } = require('node:child_process');
const { promisify } = require('node:util');
const net = require('node:net');
const crypto = require('node:crypto');
const path = require('node:path');
const fs = require('node:fs');

const run = promisify(execFile);

const CONTAINER = process.env.SEARXNG_CONTAINER || 'searxng-local';
const PORT = Number(process.env.SEARXNG_PORT || 8080);
// 国内网络下官方 registry 基本拉不动，这里按顺序尝试多个镜像源（已有的直接用，都没才逐个拉）
const IMAGE_CANDIDATES = [...new Set([
  process.env.SEARXNG_IMAGE,
  'searxng/searxng',
  'docker.1ms.run/searxng/searxng',
  'docker.xuanyuan.me/searxng/searxng'
].filter(Boolean))];
const SEARXNG_URL = process.env.SEARXNG_URL || `http://127.0.0.1:${PORT}`;
const DOCKER_TIMEOUT = 20000;
const PULL_TIMEOUT = 300000;

// Docker Desktop 从点击启动到引擎可用通常要 15~30s，最多等 90s
const ENGINE_WAIT_MS = Number(process.env.DOCKER_ENGINE_WAIT_MS || 90000);
const ENGINE_POLL_MS = 5000;
// 容器进程起来后，里面的 SearXNG 服务真正能响应还要几秒，最多等 60s
const HTTP_WAIT_MS = Number(process.env.SEARXNG_HTTP_WAIT_MS || 60000);

// 本地 SearXNG 配置目录（关键：开放 json 格式，否则 /search?format=json 会被拒）
const SETTINGS_DIR = path.join(__dirname, 'searxng');
const SETTINGS_FILE = path.join(SETTINGS_DIR, 'settings.yml');
// 记录「当前这份 settings.yml 是否已被容器读取过」，用于判断配置变更后要不要重建容器
const SETTINGS_HASH_FILE = path.join(SETTINGS_DIR, '.settings.sha');

// Docker Desktop 可执行文件候选路径（装了但没开机自启时，由后端顺手拉起）
const DESKTOP_CANDIDATES = [
  process.env.DOCKER_DESKTOP_EXE,
  process.env.LOCALAPPDATA ? path.join(process.env.LOCALAPPDATA, 'Programs', 'DockerDesktop', 'Docker Desktop.exe') : '',
  'C:\\Program Files\\Docker\\Docker\\Docker Desktop.exe'
].filter(Boolean);

const SETTINGS_TEMPLATE = `# 由本服务自动生成的 SearXNG 配置：本文件是「快照」，启动时会按 search-env.js 里的 SETTINGS_TEMPLATE 重写，
# 想永久改引擎请改 SETTINGS_TEMPLATE，直接改本文件只在本次运行内有效。
# 只保留国内可直连的中文引擎：SearXNG 默认那批（Google/Brave/DuckDuckGo/Wikipedia）在国内全部超时，
# 而国际版 Bing 又会混入大量外文日历类垃圾页；keep_only 只留下面这套中文组合。
# baidu + sogou + 360search + quark 覆盖全网网页，chinaso（中国搜索）gov 内容权重高、专补政务类检索。
# 注意：知乎引擎（zhihu）在 SearXNG 当前版本里并不存在，想要知乎经验类内容只能靠网页链里的其他源带回。
use_default_settings:
  engines:
    keep_only:
      - baidu
      - sogou
      - 360search
      - quark
      - chinaso

server:
  secret_key: "life-planner-local-searxng"
  limiter: false
  public_instance: false
  image_proxy: false

search:
  safe_search: 0
  formats:
    - html
    - json

engines:
  - name: baidu
    disabled: false
    page_size: 20
    paging: true
    max_page: 3
  - name: sogou
    engine: sogou
    disabled: false
    page_size: 20
    paging: true
    max_page: 3
  - name: 360search
    engine: 360search
    disabled: false
    page_size: 20
    paging: true
    max_page: 3
  # quark / chinaso 引擎自带 results_per_page=10，这里如实按 10 配置，避免向上游多要
  - name: quark
    engine: quark
    disabled: false
    page_size: 10
    paging: true
    max_page: 3
  - name: chinaso
    engine: chinaso
    disabled: false
    page_size: 10
    paging: true
    max_page: 3
`;

// 环境探测结果缓存，避免重复 spawn docker/python 造成启动变慢
let envCache = null;

function isProduction() {
  return process.env.NODE_ENV === 'production';
}

// 本地环境才允许自动启停容器（用户可再用 SEARXNG_AUTOSTART=false 关掉）
function autoManageEnabled() {
  return !isProduction() && process.env.SEARXNG_AUTOSTART !== 'false';
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function docker(args, timeout = DOCKER_TIMEOUT) {
  const { stdout } = await run('docker', args, { timeout, windowsHide: true, maxBuffer: 8 * 1024 * 1024 });
  return String(stdout || '').trim();
}

// 端口是否已被占用：已有人在 8080 上跑 SearXNG（用户自己启动的）时就不用再拉容器
function portOpen(port, timeoutMs = 700) {
  return new Promise(resolve => {
    const socket = net.connect({ host: '127.0.0.1', port });
    const done = value => {
      socket.destroy();
      resolve(value);
    };
    socket.setTimeout(timeoutMs);
    socket.once('connect', () => done(true));
    socket.once('timeout', () => done(false));
    socket.once('error', () => done(false));
  });
}

// 检查本机搜索相关环境：Docker（SearXNG 依赖）、Python + akshare（财经分支依赖）
// 缺失时只提示 + 给官方下载地址，不做静默安装（Docker Desktop 是桌面软件，无法纯代码安装）
async function checkSearchEnvironment() {
  if (envCache) return envCache;
  const result = { docker: false, dockerVersion: '', python: false, akshare: false, akshareInstalling: false };

  try {
    result.dockerVersion = (await run('docker', ['--version'], { timeout: 8000, windowsHide: true })).stdout.trim();
    result.docker = true;
    console.log(`[搜索环境] Docker 可用：${result.dockerVersion}`);
  } catch (err) {
    console.warn('[搜索环境] 未检测到 Docker Desktop，SearXNG 无法启动，搜索链路自动降级到 Bing。');
    console.warn('[搜索环境] Docker Desktop 属系统级软件，代码无法静默安装，请手动下载安装：https://www.docker.com/products/docker-desktop/');
    console.warn('[搜索环境] 安装后请务必先打开 Docker Desktop 等引擎就绪，再启动本服务，否则 docker 命令会报错。');
  }

  // Python 解释器：优先项目自带的 quant venv（已装 akshare），其次 PYTHON_BIN，最后全局 python
  const venvPython = path.join(__dirname, '..', 'quant', '.venv', 'Scripts', 'python.exe');
  const candidates = [process.env.PYTHON_BIN, venvPython, 'python'].filter(Boolean);
  for (const bin of candidates) {
    try {
      await run(bin, ['--version'], { timeout: 8000, windowsHide: true });
      result.python = true;
      result.pythonBin = bin;
      break;
    } catch (err) { /* 换下一个候选解释器 */ }
  }

  if (!result.python) {
    console.warn('[搜索环境] 未检测到 Python，财经结构化数据（akshare 分支）已禁用。');
    return (envCache = result);
  }

  try {
    await run(result.pythonBin, ['-c', 'import akshare'], { timeout: 30000, windowsHide: true });
    result.akshare = true;
    console.log('[搜索环境] akshare 已就绪（财经查询走结构化数据分支）');
  } catch (err) {
    console.warn('[搜索环境] 缺少 akshare，正在自动安装（pip install akshare）…');
    try {
      await run(result.pythonBin, ['-m', 'pip', 'install', 'akshare', '-q'], { timeout: 600000, windowsHide: true, maxBuffer: 32 * 1024 * 1024 });
      result.akshare = true;
      console.log('[搜索环境] akshare 安装完成');
    } catch (installError) {
      console.warn('[搜索环境] akshare 自动安装失败，财经分支暂时禁用：', installError.message.split('\n').pop());
    }
  }
  return (envCache = result);
}

// 生成 SearXNG 最小覆盖配置（只有存在配置目录才能用 json 接口，因此必须确保它写好）
// 返回 { ok, changed, hash }：changed=true 表示模板内容变了，必须重建容器才会被读进去 ——
// 原来只在「文件不存在」时写一次，改过的引擎 page_size 永远进不了容器
function ensureSettingsFile() {
  try {
    fs.mkdirSync(SETTINGS_DIR, { recursive: true });
    const hash = crypto.createHash('sha1').update(SETTINGS_TEMPLATE).digest('hex');
    let current = '';
    try { current = fs.readFileSync(SETTINGS_FILE, 'utf8'); } catch (err) { /* 首次运行，文件还不存在 */ }
    if (current !== SETTINGS_TEMPLATE) fs.writeFileSync(SETTINGS_FILE, SETTINGS_TEMPLATE, 'utf8');
    let applied = '';
    try { applied = fs.readFileSync(SETTINGS_HASH_FILE, 'utf8').trim(); } catch (err) { /* 还没标记过 */ }
    return { ok: true, changed: applied !== hash, hash };
  } catch (err) {
    console.warn('[SearXNG] 写入本地配置失败（改用容器默认配置，json 接口可能不可用）：', err.message);
    return { ok: false, changed: false, hash: '' };
  }
}

// 记录「这份配置已经被容器读过」，下次只有真的改了才重建
function markSettingsApplied(hash) {
  if (!hash) return;
  try { fs.writeFileSync(SETTINGS_HASH_FILE, hash, 'utf8'); } catch (err) { /* 标记失败只会导致下次多重建一次 */ }
}

// 引擎没起时把 Docker Desktop 桌面端拉起来（它是图形程序，必须真实启动进程）
function launchDockerDesktop() {
  for (const exe of DESKTOP_CANDIDATES) {
    try {
      if (!fs.existsSync(exe)) continue;
      const child = spawn(exe, [], { detached: true, stdio: 'ignore', windowsHide: true });
      child.unref();
      console.log(`[SearXNG] Docker 引擎未就绪，已尝试拉起 Docker Desktop：${exe}`);
      return true;
    } catch (err) { /* 换下一个候选路径 */ }
  }
  console.warn('[SearXNG] 未找到 Docker Desktop 可执行文件，无法自动拉起引擎');
  return false;
}

// 确保 Docker 引擎可用：已就绪直接返回；否则先拉起 Docker Desktop 再轮询等待
async function ensureDockerEngine() {
  try {
    await docker(['info']);
    return true;
  } catch (err) { /* 引擎没起来，走下面的等待流程 */ }

  const launched = launchDockerDesktop();
  const deadline = Date.now() + ENGINE_WAIT_MS;
  while (Date.now() < deadline) {
    await sleep(ENGINE_POLL_MS);
    try {
      await docker(['info']);
      console.log('[SearXNG] Docker 引擎已就绪');
      return true;
    } catch (err) { /* 继续等 */ }
  }
  console.warn(`[SearXNG] 等待 Docker 引擎就绪超时（${Math.round(ENGINE_WAIT_MS / 1000)}s）${launched ? '' : '，且未能自动拉起 Docker Desktop'}`);
  return false;
}

// 确保本地有可用的 SearXNG 镜像：先用已有镜像，全都没有才按候选镜像源逐个拉取，返回最终可 run 的镜像名
async function ensureImage() {
  for (const ref of IMAGE_CANDIDATES) {
    try {
      await docker(['image', 'inspect', ref]);
      console.log(`[SearXNG] 复用本地镜像 ${ref}`);
      return ref;
    } catch (err) { /* 本地没有，试下一个 */ }
  }
  for (const ref of IMAGE_CANDIDATES) {
    try {
      console.log(`[SearXNG] 本地无镜像，正在拉取 ${ref}（可能要几分钟）…`);
      await docker(['pull', ref], PULL_TIMEOUT);
      return ref;
    } catch (err) {
      console.warn(`[SearXNG] 拉取 ${ref} 失败：${String(err.message || err).split('\n').find(line => line.trim()) || '未知错误'}`);
    }
  }
  throw new Error('所有镜像源均拉取失败，请检查网络或配置 Docker registry-mirrors');
}

// 拉起（或复用）SearXNG 容器：已占用端口 → 复用；容器缺自启策略 → 重建；存在且合规 → start
async function startSearXNG() {
  if (!autoManageEnabled()) return { started: false, reason: '本环境不自动管理 Docker' };

  // 先把配置写好并判断有没有变更：变更了就必须重建容器，否则新的引擎 page_size 永远读不进去
  const settings = ensureSettingsFile();

  // 端口已被占用：说明已有 SearXNG 在跑（用户自建或上次残留）
  if (await portOpen(PORT)) {
    if (!settings.changed) {
      console.log(`[SearXNG] ${PORT} 端口已有服务在跑，直接复用`);
      return { started: true, reason: '端口已就绪' };
    }
    // 配置有更新：只有「本服务自己建的容器」才敢重建；用户自建的不动
    const ours = await docker(['ps', '-a', '--filter', `name=^${CONTAINER}$`, '--format', '{{.Names}}']).catch(() => '');
    if (!ours || !(await ensureDockerEngine())) {
      console.log(`[SearXNG] 配置已更新，但容器非本服务创建或引擎不可用，保持复用（新配置暂不生效）`);
      return { started: true, reason: '端口已就绪（新配置未同步）' };
    }
    console.log(`[SearXNG] 本地配置已更新，重建容器以让新配置生效`);
    await docker(['rm', '-f', CONTAINER]).catch(() => '');
    // 放开端口后继续走下面的创建流程
  }

  const env = await checkSearchEnvironment();
  if (!env.docker) return { started: false, reason: '本机无 Docker' };

  const engineReady = await ensureDockerEngine();
  if (!engineReady) {
    console.warn('[SearXNG] Docker 引擎不可用，搜索链路降级到 Bing（免 key 网页搜索）');
    return { started: false, reason: 'docker 引擎未就绪' };
  }

  try {
    const exists = await docker(['ps', '-a', '--filter', `name=^${CONTAINER}$`, '--format', '{{.Names}}']);
    if (exists) {
      const policy = (await docker(['inspect', '--format', '{{.HostConfig.RestartPolicy.Name}}', CONTAINER]).catch(() => '')).trim();
      // 配置有更新时同样要重建，否则容器还挂在旧配置上
      if (policy === 'unless-stopped' && !settings.changed) {
        const running = await docker(['ps', '--filter', `name=^${CONTAINER}$`, '--format', '{{.Names}}']);
        if (!running) {
          await docker(['start', CONTAINER]);
          console.log(`[SearXNG] 已启动既有容器 ${CONTAINER}`);
        } else {
          console.log(`[SearXNG] 容器 ${CONTAINER} 已在运行`);
        }
        return { started: true, reason: '容器已就绪' };
      }
      // 旧容器没有随引擎自启的策略、或本地配置有更新：重建一次
      console.log(settings.changed
        ? '[SearXNG] 本地配置已更新，重建容器以让新配置生效'
        : `[SearXNG] 既有容器缺少自启策略（${policy || 'none'}），重建为 --restart unless-stopped`);
      await docker(['rm', '-f', CONTAINER]).catch(() => '');
    }

    // 拿到可用镜像（本地已有就直接用，否则按镜像源逐个拉取）
    const imageRef = await ensureImage();

    const args = ['run', '-d', '--name', CONTAINER, '--restart', 'unless-stopped',
      '-p', `${PORT}:8080`, '-e', `SEARXNG_BASE_URL=http://localhost:${PORT}/`,
      // 容器默认继承 Docker Desktop 内置 DNS（192.168.65.7），实测解析 www.baidu.com 直接 DNSError，
      // 导致百度引擎整条不可用；显式指定国内公共 DNS 兜底
      '--dns', '223.5.5.5', '--dns', '119.29.29.29'];
    if (settings.ok) args.push('-v', `${SETTINGS_DIR}:/etc/searxng`);
    args.push(imageRef);
    await docker(args);
    markSettingsApplied(settings.hash);
    console.log(`[SearXNG] 容器已创建并启动（随 Docker 引擎自动重启）：${CONTAINER}（${PORT}）`);
    return { started: true, reason: '容器已创建' };
  } catch (err) {
    console.warn('[SearXNG] 容器启动失败，搜索链路降级到 Bing：', String(err.message || err).split('\n').pop());
    return { started: false, reason: err.message };
  }
}

// 等容器里的 HTTP 服务真正可响应（进程起来 ≠ 服务可用）
async function waitForSearchHttp() {
  const deadline = Date.now() + HTTP_WAIT_MS;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(`${SEARXNG_URL}/search?q=test&format=json`, {
        headers: { Accept: 'application/json' }, signal: AbortSignal.timeout(5000)
      });
      if (response.ok) return true;
    } catch (err) { /* 服务还没起来，继续等 */ }
    await sleep(3000);
  }
  return false;
}

// 端到端真实可用性自检：逐个打测试查询，确认真能返回结果（不走熔断，不影响真实调用计数）
async function probeSearchHealth() {
  const { searchSearxng, searchBing, searchOpenSerp, setPrimarySource } = require('./web-search');
  const checks = [['SearXNG', searchSearxng], ['Bing', searchBing], ['OpenSERP', searchOpenSerp]];
  const report = [];
  let healthy = '';
  let best = 0;
  for (const [name, fn] of checks) {
    try {
      const results = await fn('北京天气');
      // 取「返回条数最多」的源当主力：条数少的源会让检索结果偏少，直接影响规划里的日期/链接准确性
      if (results.length > best) { best = results.length; healthy = name; }
      report.push(`${name}=${results.length ? `OK(${results.length})` : '空结果'}`);
    } catch (err) {
      report.push(`${name}=失败(${String(err.message || err).split('\n').pop().slice(0, 60)})`);
    }
  }
  console.log(`[搜索自检] ${report.join(' | ')}`);
  console.log(`[搜索自检] 主力可用源=${healthy ? `${healthy}（${best} 条）` : '无（将降级到 Tavily 兜底）'}`);
  // 自检结论直接用于调整降级链顺序：把结果最多、最稳的源提到最前，省掉每轮白等
  if (healthy) setPrimarySource(healthy);
  return { healthy, report };
}

// 启动编排：环境检查 → 起 SearXNG → 等 HTTP → 自检，全程不抛异常（失败只降级）
async function startSearchStack() {
  const logs = [];
  const env = await checkSearchEnvironment();
  const searxng = await startSearXNG();
  if (searxng.started) {
    const httpReady = await waitForSearchHttp();
    if (!httpReady) console.warn(`[SearXNG] 容器已启动但 ${Math.round(HTTP_WAIT_MS / 1000)}s 内未响应，搜索先降级到 Bing（容器稍后可自行恢复）`);
  }
  const health = await probeSearchHealth();
  return { env, searxng, health, logs };
}

module.exports = { checkSearchEnvironment, startSearXNG, startSearchStack, probeSearchHealth, autoManageEnabled, PORT, SEARXNG_URL };
