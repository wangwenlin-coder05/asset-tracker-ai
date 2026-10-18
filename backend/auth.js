const crypto = require('node:crypto');
const bcrypt = require('bcryptjs');
const express = require('express');
const { getRawPool } = require('./tenant-db');
const { context } = require('./context');
const { rewriteUploadUrls } = require('./uploads');

const COOKIE = 'stock_session';
const SESSION_MS = 7 * 24 * 60 * 60 * 1000;
const attempts = new Map();
const dummyHash = bcrypt.hashSync('not-a-valid-password', 12);

function allowedOrigins() {
  return (process.env.ALLOWED_ORIGINS || 'http://localhost:3300,http://127.0.0.1:3300,http://localhost:5173,http://127.0.0.1:5173,http://localhost:5273,http://127.0.0.1:5273').split(',').map(value => value.trim()).filter(Boolean);
}

function originGuard(req, res, next) {
  const origin = req.get('origin');
  if (origin && !allowedOrigins().includes(origin)) return res.status(403).json({ error: '来源不被允许' });
  next();
}

function rateLimit(req, res, next) {
  const now = Date.now();
  for (const [key, value] of attempts) if (value.until <= now) attempts.delete(key);
  const ip = req.ip;
  const entry = attempts.get(ip) || { count: 0, until: now + 15 * 60 * 1000 };
  entry.count++;
  attempts.set(ip, entry);
  if (entry.count > 30 || attempts.size > 10000) return res.status(429).json({ error: '请求过于频繁，请稍后重试' });
  next();
}

function sessionToken(req) {
  const cookie = (req.headers.cookie || '').split(';').map(value => value.trim()).find(value => value.startsWith(`${COOKIE}=`));
  const value = cookie?.slice(COOKIE.length + 1) || '';
  return /^[a-f0-9]{64}$/.test(value) ? value : '';
}

function publicUser(user) {
  const local = process.env.NODE_ENV !== 'production' && process.env.ENABLE_LOCAL_FEATURES === 'true' && user.role === 'owner';
  return { id: Number(user.id), email: user.email, role: user.role, capabilities: { localFeatures: local } };
}

async function createSessionRecord(user, database = getRawPool()) {
  const token = crypto.randomBytes(32).toString('hex');
  const csrfToken = crypto.randomBytes(32).toString('hex');
  await database.execute('INSERT INTO user_sessions (token_hash, user_id, csrf_token, expires_at) VALUES (?, ?, ?, ?)',
    [crypto.createHash('sha256').update(token).digest('hex'), user.id, csrfToken, new Date(Date.now() + SESSION_MS)]);
  return { token, user: publicUser(user), csrfToken };
}

function applySessionCookie(session, res) {
  res.cookie(COOKIE, session.token, { httpOnly: true, secure: process.env.COOKIE_SECURE === 'true' || process.env.NODE_ENV === 'production', sameSite: 'lax', path: '/', maxAge: SESSION_MS });
  return { user: session.user, csrfToken: session.csrfToken };
}

async function createSession(user, res) {
  await getRawPool().execute('DELETE FROM user_sessions WHERE expires_at < NOW()');
  return applySessionCookie(await createSessionRecord(user), res);
}

async function updateCredentials(req, res, next, kind) {
  let connection;
  try {
    const currentPassword = req.body.currentPassword;
    if (typeof currentPassword !== 'string' || !currentPassword || Buffer.byteLength(currentPassword) > 72) return res.status(400).json({ error: '请输入当前密码' });
    const email = kind === 'account' ? String(req.body.email || '').trim().toLowerCase() : null;
    const newPassword = req.body.newPassword;
    if (kind === 'account' && (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254)) return res.status(400).json({ error: '请输入有效的邮箱账号' });
    if (kind === 'password' && (typeof newPassword !== 'string' || newPassword.length < 8 || Buffer.byteLength(newPassword) > 72)) return res.status(400).json({ error: '新密码至少 8 字符且不超过 72 字节' });
    if (kind === 'password' && newPassword === currentPassword) return res.status(400).json({ error: '新密码不能与当前密码相同' });
    connection = await getRawPool().getConnection();
    await connection.beginTransaction();
    const [users] = await connection.execute('SELECT id, email, role, password_hash, disabled FROM users WHERE id = ? FOR UPDATE', [req.user.id]);
    const user = users[0];
    if (!user || user.disabled || !await bcrypt.compare(currentPassword, user.password_hash)) {
      await connection.rollback();
      return res.status(401).json({ error: '当前密码错误' });
    }
    if (kind === 'account') {
      await connection.execute('UPDATE users SET email = ? WHERE id = ?', [email, user.id]);
      user.email = email;
    } else {
      await connection.execute('UPDATE users SET password_hash = ? WHERE id = ?', [await bcrypt.hash(newPassword, 12), user.id]);
    }
    await connection.execute('DELETE FROM user_sessions WHERE user_id = ?', [user.id]);
    const session = await createSessionRecord(user, connection);
    await connection.commit();
    res.json(applySessionCookie(session, res));
  } catch (error) {
    if (connection) await connection.rollback().catch(() => {});
    if (error.code === 'ER_DUP_ENTRY') return res.status(409).json({ error: '该邮箱已被其他账号使用' });
    next(error);
  } finally { if (connection) connection.release(); }
}

async function authenticate(req, res, next) {
  try {
    const token = sessionToken(req);
    if (!token) return res.status(401).json({ error: '请先登录' });
    const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
    const [rows] = await getRawPool().execute(`SELECT u.id, u.email, u.role, s.csrf_token FROM user_sessions s JOIN users u ON u.id = s.user_id WHERE s.token_hash = ? AND s.expires_at > NOW() AND u.disabled = 0`, [tokenHash]);
    if (!rows.length) return res.status(401).json({ error: '登录已失效，请重新登录' });
    const user = rows[0];
    user.id = Number(user.id);
    if (!['GET', 'HEAD', 'OPTIONS'].includes(req.method) && req.get('x-csrf-token') !== user.csrf_token) return res.status(403).json({ error: 'CSRF 校验失败，请刷新页面' });
    req.user = user;
    req.sessionHash = tokenHash;
    res.setHeader('Cache-Control', 'private, no-store');
    context.run({ user }, next);
  } catch (error) { next(error); }
}

function localOnly(req, res, next) {
  const address = req.socket.remoteAddress;
  const loopback = ['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(address);
  const direct = !req.get('x-forwarded-for') && !req.get('forwarded') && ['localhost', '127.0.0.1', '[::1]', '::1'].includes(req.hostname);
  if (process.env.NODE_ENV === 'production' || req.user?.role !== 'owner' || !loopback || !direct || process.env.ENABLE_LOCAL_FEATURES !== 'true') return res.status(403).json({ error: '该能力仅开放给本机所有者，云端已禁用' });
  next();
}

function installAuth(app) {
  const router = express.Router();
  router.use(originGuard);
  router.post('/register', rateLimit, async (req, res, next) => {
    try {
      if (process.env.REGISTRATION_OPEN !== 'true') return res.status(403).json({ error: '暂未开放注册' });
      const email = String(req.body.email || '').trim().toLowerCase();
      const password = req.body.password;
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254 || typeof password !== 'string' || password.length < 8 || Buffer.byteLength(password) > 72) return res.status(400).json({ error: '请输入有效邮箱，密码至少 8 字符且不超过 72 字节' });
      const hash = await bcrypt.hash(password, 12);
      let result;
      try { [result] = await getRawPool().execute('INSERT INTO users (email, password_hash, role) VALUES (?, ?, ?)', [email, hash, 'user']); }
      catch (error) { if (error.code === 'ER_DUP_ENTRY') return res.status(409).json({ error: '该邮箱已注册' }); throw error; }
      res.status(201).json(await createSession({ id: result.insertId, email, role: 'user' }, res));
    } catch (error) { next(error); }
  });
  router.post('/login', rateLimit, async (req, res, next) => {
    try {
      const email = String(req.body.email || '').trim().toLowerCase();
      const password = req.body.password;
      if (typeof password !== 'string' || Buffer.byteLength(password) > 72 || email.length > 254) return res.status(400).json({ error: '登录参数无效' });
      const [users] = await getRawPool().execute('SELECT id, email, password_hash, role, disabled FROM users WHERE email = ?', [email]);
      const user = users[0];
      const valid = await bcrypt.compare(password, user?.password_hash || dummyHash);
      if (!valid || !user || user.disabled) return res.status(401).json({ error: '邮箱或密码错误' });
      res.json(await createSession(user, res));
    } catch (error) { next(error); }
  });
  router.get('/me', authenticate, (req, res) => res.json({ user: publicUser(req.user), csrfToken: req.user.csrf_token }));
  router.post('/account', authenticate, rateLimit, (req, res, next) => updateCredentials(req, res, next, 'account'));
  router.post('/password', authenticate, rateLimit, (req, res, next) => updateCredentials(req, res, next, 'password'));
  router.post('/logout', authenticate, async (req, res, next) => {
    try {
      await getRawPool().execute('DELETE FROM user_sessions WHERE token_hash = ?', [req.sessionHash]);
      res.clearCookie(COOKIE, { path: '/' });
      res.json({ ok: true });
    } catch (error) { next(error); }
  });
  app.use('/api/auth', router);
  app.use(['/api', '/quant', '/uploads'], originGuard, authenticate);
  app.use(['/api/wechat', '/api/extract', '/api/quant', '/api/quant-service', '/quant'], localOnly);
  app.use(['/api/ai/article-parse', '/api/deposits/save-icon'], localOnly);
  app.use('/api', (req, res, next) => {
    const json = res.json.bind(res);
    res.json = value => json(rewriteUploadUrls(value));
    next();
  });
}

module.exports = { installAuth, authenticate, localOnly, allowedOrigins, originGuard };
