const mysql = require('mysql2/promise');
const { Parser } = require('node-sql-parser');
const { currentUser, context } = require('./context');
const { databaseConfig } = require('./config');
const parser = new Parser();
const BUSINESS_TABLES = new Set([
  'ai_articles', 'ai_logs', 'ai_settings', 'ai_usage', 'buy_records', 'daily_notes',
  'daily_plans', 'deposit_items', 'deposit_transactions', 'extract_learn',
  'installment_bills', 'installment_plans', 'plan_completions', 'quiz_answers',
  'quiz_questions', 'sell_records', 'stock_daily_analysis', 'stock_daily_summary',
  'stock_notes', 'stock_watchlist', 'stocks', 'tools', 'tx_logs', 'wechat_blacklist',
  'wechat_category_feedback', 'wechat_category_rules', 'wechat_category_system_rules',
  'wechat_events', 'wechat_logic_training', 'wechat_tracking', 'wechat_tracking_daily',
  'wechat_whitelist', 'wool_daily_amounts', 'wool_items', 'wool_notes',
]);
const RELATIONS = {
  deposit_items: { payment_account_id: 'deposit_items' },
  wool_items: { deposit_item_id: 'deposit_items', deposit_transaction_id: 'deposit_transactions' },
  buy_records: { stock_id: 'stocks' }, sell_records: { stock_id: 'stocks' },
  tx_logs: { stock_id: 'stocks' }, deposit_transactions: { deposit_item_id: 'deposit_items' },
  installment_plans: { deposit_item_id: 'deposit_items' }, installment_bills: { plan_id: 'installment_plans' },
  plan_completions: { plan_id: 'daily_plans' }, quiz_answers: { question_id: 'quiz_questions' },
  stock_daily_analysis: { watch_id: 'stock_watchlist' },
};

function tenantCondition(table, userId) {
  return { type: 'binary_expr', operator: '=', left: { type: 'column_ref', table, column: 'user_id' }, right: { type: 'number', value: userId } };
}

function and(left, right) {
  if (!left) return right;
  return { type: 'binary_expr', operator: 'AND', left: { ...left, parentheses: true }, right };
}

function scopeSql(sql, userId) {
  if (!Number.isSafeInteger(userId) || userId <= 0) throw new Error('INVALID_TENANT');
  const ast = parser.astify(sql, { database: 'MySQL' });
  if (Array.isArray(ast)) throw new Error('禁止多语句查询');
  function visit(node) {
    if (!node || typeof node !== 'object') return;
    if (Array.isArray(node)) { node.forEach(visit); return; }
    if (['select', 'update', 'delete', 'insert', 'replace'].includes(node.type)) {
      const refs = node.type === 'select' || node.type === 'delete' ? node.from : node.table;
      for (const ref of refs || []) {
        if (!ref.table) continue;
        if (ref.db || !BUSINESS_TABLES.has(ref.table.toLowerCase())) throw new Error(`禁止访问非业务表: ${ref.table}`);
        if (node.type === 'insert' || node.type === 'replace') {
          if (!Array.isArray(node.columns) || node.columns.includes('user_id') || node.values?.type !== 'values') throw new Error('禁止未声明字段或自定义租户的写入');
          node.columns.push('user_id');
          node.values.values.forEach(row => row.value.push({ type: 'number', value: userId }));
          if (node.on_duplicate_update?.set.some(item => item.column === 'user_id')) throw new Error('禁止修改租户');
        } else {
          if (node.set?.some(item => item.column === 'user_id')) throw new Error('禁止修改租户');
          const condition = tenantCondition(ref.as || ref.table, userId);
          if (ref.join) {
            if (!ref.on || /RIGHT|FULL|NATURAL/i.test(ref.join)) throw new Error('不支持的租户 JOIN');
            ref.on = and(ref.on, condition);
          } else node.where = and(node.where, condition);
        }
      }
    }
    Object.values(node).forEach(visit);
  }
  if (!['select', 'update', 'delete', 'insert', 'replace'].includes(ast.type)) throw new Error('请求期间禁止执行 DDL 或管理 SQL');
  visit(ast);
  return parser.sqlify(ast, { database: 'MySQL' });
}

async function validateRelations(connection, sql, values, userId) {
  if (!/^\s*(INSERT|UPDATE|REPLACE)\b/i.test(sql)) return;
  const ast = parser.astify(mysql.format(sql, values), { database: 'MySQL' });
  const relations = RELATIONS[ast.table?.[0]?.table];
  if (!relations) return;
  const rows = ast.type === 'update'
    ? [Object.fromEntries(ast.set.map(item => [item.column, item.value]))]
    : (ast.values?.values || []).map(row => Object.fromEntries(ast.columns.map((column, index) => [column, row.value[index]])));
  for (const row of rows) {
    for (const [column, table] of Object.entries(relations)) {
      if (!row[column] || row[column].type === 'null' || row[column].value === '') continue;
      if (!['single_quote_string', 'double_quote_string', 'number'].includes(row[column].type)) throw new Error('不支持的关联字段表达式');
      const [parent] = await connection.query(`SELECT id FROM \`${table}\` WHERE id = ? AND user_id = ? LIMIT 1`, [row[column].value, userId]);
      if (!parent.length) {
        const error = new Error('关联记录不存在或不属于当前账号');
        error.statusCode = 404;
        throw error;
      }
    }
  }
}

let rawPool;
function getRawPool() {
  if (!rawPool) rawPool = mysql.createPool(databaseConfig());
  return rawPool;
}

function wrap(connection) {
  return new Proxy(connection, {
    get(target, property) {
      if (property === 'query' || property === 'execute') return async (sql, values = []) => {
        if (typeof sql !== 'string') throw new Error('必须使用字符串 SQL');
        if (context.getStore()?.schema && /^\s*(CREATE|ALTER|SHOW)\b/i.test(sql)) return target[property](sql, values);
        const { id } = currentUser();
        await validateRelations(target, sql, values, id);
        return target[property](scopeSql(sql, id), values);
      };
      if (property === 'getConnection') return async () => wrap(await target.getConnection());
      const value = Reflect.get(target, property);
      return typeof value === 'function' ? value.bind(target) : value;
    },
  });
}

function getPool() { return wrap(getRawPool()); }

module.exports = { getPool, getRawPool, scopeSql, BUSINESS_TABLES, RELATIONS };
