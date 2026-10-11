const crypto = require('node:crypto');

function key() {
  const value = Buffer.from(process.env.KEY_ENCRYPTION_KEY || '', 'base64');
  if (value.length !== 32) throw new Error('KEY_ENCRYPTION_KEY 必须是 32 字节随机密钥的 base64');
  return value;
}

function encryptSecret(value, userId, settingKey) {
  if (!value) return '';
  const nonce = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key(), nonce);
  cipher.setAAD(Buffer.from(`${userId}:${settingKey}`));
  const encrypted = Buffer.concat([cipher.update(String(value), 'utf8'), cipher.final()]);
  return `enc:v1:${nonce.toString('base64')}:${cipher.getAuthTag().toString('base64')}:${encrypted.toString('base64')}`;
}

function decryptSecret(value, userId, settingKey) {
  if (!value) return '';
  if (!value.startsWith('enc:v1:')) throw new Error('密钥尚未加密，请先执行 Phase 1 迁移');
  const [, , nonce, tag, ciphertext] = value.split(':');
  const cipher = crypto.createDecipheriv('aes-256-gcm', key(), Buffer.from(nonce, 'base64'));
  cipher.setAAD(Buffer.from(`${userId}:${settingKey}`));
  cipher.setAuthTag(Buffer.from(tag, 'base64'));
  return Buffer.concat([cipher.update(Buffer.from(ciphertext, 'base64')), cipher.final()]).toString('utf8');
}

function isSecret(settingKey) { return settingKey.endsWith('_api_key') || settingKey === 'alapi_token'; }

module.exports = { encryptSecret, decryptSecret, isSecret };
