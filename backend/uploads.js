const path = require('node:path');
const fs = require('node:fs');
const { currentUser } = require('./context');
const root = process.env.UPLOAD_ROOT ? path.resolve(process.env.UPLOAD_ROOT) : path.resolve(__dirname, '..', 'uploads');

function tenantUploadDir(category) {
  if (!/^[a-z]+$/.test(category)) throw new Error('无效上传分类');
  const directory = path.join(root, 'users', String(currentUser().id), category);
  fs.mkdirSync(directory, { recursive: true });
  return directory;
}

function tenantUploadPath(value) {
  if (typeof value !== 'string') throw new Error('无效文件路径');
  const normalized = value.replace(/\\/g, '/').replace(/^\//, '');
  const prefix = `uploads/users/${currentUser().id}/`;
  const scoped = normalized.startsWith('uploads/users/') ? normalized : normalized.replace(/^uploads\//, prefix);
  if (!scoped.startsWith(prefix) || scoped.split('/').some(part => part === '..' || part === '.') || scoped.includes('\0')) throw new Error('文件不属于当前用户');
  const resolved = path.resolve(root, scoped.slice('uploads/'.length));
  if (!resolved.startsWith(path.join(root, 'users', String(currentUser().id)) + path.sep)) throw new Error('非法文件路径');
  return resolved;
}

function rewriteUploadUrls(value) {
  if (typeof value === 'string') return value.replace(/(^|["'\s(])\/?uploads\/(?!users\/)([a-z]+\/)/g, `$1uploads/users/${currentUser().id}/$2`);
  if (Array.isArray(value)) return value.map(rewriteUploadUrls);
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, rewriteUploadUrls(item)]));
  return value;
}

module.exports = { tenantUploadDir, tenantUploadPath, rewriteUploadUrls, root };
