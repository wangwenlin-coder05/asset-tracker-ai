const fs = require('node:fs');
const path = require('node:path');
const net = require('node:net');

function vercelConfig(backendOrigin) {
  const url = new URL(backendOrigin);
  if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash || url.pathname !== '/' || url.port) throw new Error('后端地址必须是无路径、无凭据的 HTTPS 域名');
  if (net.isIP(url.hostname) || !url.hostname.includes('.') || /(^|\.)(localhost|local|internal|invalid|test|example)$/.test(url.hostname)) throw new Error('后端必须使用真实公网域名，不能填写 IP 或占位域名');
  return {
    "$schema": 'https://openapi.vercel.sh/vercel.json',
    framework: 'vite', buildCommand: 'npm run build', outputDirectory: 'dist',
    headers: [
      { source: '/api/:path*', headers: [{ key: 'Cache-Control', value: 'private, no-store' }] },
      { source: '/uploads/:path*', headers: [{ key: 'Cache-Control', value: 'private, no-store' }] },
    ],
    rewrites: [
      { source: '/api/:path*', destination: `${url.origin}/api/:path*` },
      { source: '/uploads/:path*', destination: `${url.origin}/uploads/:path*` },
      { source: '/healthz', destination: `${url.origin}/healthz` },
      { source: '/:path*', destination: '/index.html' },
    ],
  };
}

if (require.main === module) {
  try {
    const origin = process.argv[2] || process.env.BACKEND_PUBLIC_URL;
    if (!origin || process.argv.length > 3) throw new Error('用法: node scripts/configure-vercel.js https://真实后端域名');
    const config = vercelConfig(origin);
    const filename = path.resolve('frontend', 'vercel.json');
    fs.writeFileSync(filename, JSON.stringify(config, null, 2) + '\n');
    console.log('已生成 frontend/vercel.json；请从 frontend 目录部署，不包含任何 Token');
  } catch (error) { console.error(error.message); process.exitCode = 1; }
}

module.exports = { vercelConfig };
