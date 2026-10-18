const { getPool } = require('./tenant-db');
const { currentUser } = require('./context');
const { encryptSecret, decryptSecret, isSecret } = require('./secrets');

const PROVIDERS = [
  { id: 'glm', name: '智谱 GLM', keyField: 'glm_api_key', website: 'https://open.bigmodel.cn', docs: 'https://docs.bigmodel.cn', billing: 'user' },
  { id: 'agnes', name: 'Agnes', keyField: 'agnes_api_key', website: 'https://platform.agnes-ai.com', docs: 'https://agnes-ai.com/en/docs/overview', billing: 'user' },
  { id: 'alapi', name: 'ALAPI 行情', keyField: 'alapi_token', website: 'https://www.alapi.cn', billing: 'user' },
];
// 只允许写入真正会被读取的设置项：bing / firecrawl / serper 三个密钥后端从未使用，已随「以真实运行为准」清理掉；
// metaso_api_key（秘塔，默认首选）与 volcengine_api_key（豆包搜索，备用）是新增的真实密钥项，均以 _api_key 结尾会自动加密落库
const FIELDS = new Set(['glm_api_key', 'agnes_api_key', 'alapi_token', 'metaso_api_key', 'volcengine_api_key', 'tavily_api_key', 'default_model', 'ai_model_routes', 'ai_custom_models', 'ai_model_catalog', 'gold_daily_count', 'market_fetch_interval', 'gold_config', 'fee_settings', 'stock_fee_presets', 'stock_metric_tips', 'stock_commission_rate', 'stock_min_commission', 'search_source_order']);
// 用户自助接入的模型，密钥字段形如 custom_<slug>_api_key
const CUSTOM_KEY_FIELD = /^custom_[a-z0-9_]{1,48}_api_key$/;

async function getUserSecret(field) {
  const [rows] = await getPool().query('SELECT setting_value FROM ai_settings WHERE setting_key = ?', [field]);
  return decryptSecret(rows[0]?.setting_value || '', currentUser().id, field);
}

async function getCustomModels() {
  const [rows] = await getPool().query('SELECT setting_value FROM ai_settings WHERE setting_key = ?', ['ai_custom_models']);
  const raw = rows[0]?.setting_value || '';
  if (!raw) return [];
  try {
    const list = JSON.parse(raw);
    return Array.isArray(list) ? list.filter(item => item && typeof item === 'object') : [];
  } catch (_) { return []; }
}

async function saveSettings(settings) {
  if (!settings || typeof settings !== 'object' || Array.isArray(settings)) throw new Error('设置必须是对象');
  for (const [field, value] of Object.entries(settings)) {
    if (!FIELDS.has(field) && !CUSTOM_KEY_FIELD.test(field)) throw new Error(`不支持的设置: ${field}`);
    if (value !== null && typeof value !== 'string' && typeof value !== 'number') throw new Error('设置值必须是字符串或数字');
    if (String(value || '').length > 16384) throw new Error('设置值过长');
  }
  for (const [field, value] of Object.entries(settings)) {
    if (isSecret(field) && value === '') continue;
    const stored = isSecret(field) ? encryptSecret(value, currentUser().id, field) : String(value ?? '');
    await getPool().execute('INSERT INTO ai_settings (setting_key, setting_value, updated_at) VALUES (?, ?, ?) ON DUPLICATE KEY UPDATE setting_value = ?, updated_at = ?', [field, stored, Date.now(), stored, Date.now()]);
  }
}

module.exports = { PROVIDERS, getUserSecret, getCustomModels, saveSettings };
