require('dotenv').config();
const express = require('express');
const { getPool, getRawPool } = require('./backend/tenant-db');
const { context } = require('./backend/context');
const { installAuth, allowedOrigins } = require('./backend/auth');
const { getUserSecret, getCustomModels, saveSettings, PROVIDERS } = require('./backend/ai-settings');
const { webSearch, formatSearchContext, resetSearchSession, setSourceOrder, getSourceOrder } = require('./backend/web-search');
const { startSearchStack } = require('./backend/search-env');
const { isSecret } = require('./backend/secrets');
const { tenantUploadDir, tenantUploadPath } = require('./backend/uploads');
const cors = require('cors');
const path = require('path');
const multer = require('multer');
const fs = require('fs');
const {
  extractWechatStocks,
  javaAvailable,
  startWechatMonitor,
  stopWechatMonitor,
  getWechatMonitorStatus,
  deleteWechatEvent,
  clearWechatEvents,
  initEventsFromDb,
  isBlacklisted,
  clearBlacklistCache,
  cleanSender,
  normalizeInvestorKey,
  resolveCanonicalInvestorName,
  updateWechatEventCategoryInMemory,
  setCategoryClassifierHook,
  setAutoFillLogicHook,
  EVENTS_LIMIT,
  monitorState,
} = require('./wechat-extractor');

const app = express();
const port = Number(process.env.PORT) || 3300;

const iconsDir = path.join(__dirname, 'uploads', 'icons');
if (!fs.existsSync(iconsDir)) fs.mkdirSync(iconsDir, { recursive: true });

const woolDir = path.join(__dirname, 'uploads', 'wool');
if (!fs.existsSync(woolDir)) fs.mkdirSync(woolDir, { recursive: true });

const quizDir = path.join(__dirname, 'uploads', 'quiz');
if (!fs.existsSync(quizDir)) fs.mkdirSync(quizDir, { recursive: true });

const movieDir = path.join(__dirname, 'uploads', 'movie');
if (!fs.existsSync(movieDir)) fs.mkdirSync(movieDir, { recursive: true });

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, tenantUploadDir('icons')),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    const name = Date.now() + '-' + Math.random().toString(36).slice(2, 8) + ext;
    cb(null, name);
  }
});
const upload = multer({ storage, limits: { fileSize: 10 * 1024 * 1024 }, fileFilter: (req, file, cb) => {
  if (/^image\//.test(file.mimetype)) cb(null, true);
  else cb(new Error('仅支持图片文件'));
}});

const woolStorage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, tenantUploadDir('wool')),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    const d = new Date();
    const dateStr = d.getFullYear() + (d.getMonth()+1+'').padStart(2,'0') + (d.getDate()+'').padStart(2,'0');
    const rand = Math.random().toString(36).slice(2, 8);
    cb(null, '薅羊毛' + dateStr + rand + ext);
  }
});
const woolUpload = multer({ storage: woolStorage, limits: { fileSize: 10 * 1024 * 1024 }, fileFilter: (req, file, cb) => {
  if (/^image\//.test(file.mimetype)) cb(null, true);
  else cb(new Error('仅支持图片文件'));
}});

const quizStorage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, tenantUploadDir('quiz')),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    const d = new Date();
    const dateStr = d.getFullYear() + (d.getMonth()+1+'').padStart(2,'0') + (d.getDate()+'').padStart(2,'0');
    const rand = Math.random().toString(36).slice(2, 8);
    cb(null, 'quiz' + dateStr + rand + ext);
  }
});
const quizUpload = multer({ storage: quizStorage, limits: { fileSize: 10 * 1024 * 1024 }, fileFilter: (req, file, cb) => {
  if (/^image\//.test(file.mimetype)) cb(null, true);
  else cb(new Error('仅支持图片文件'));
}});

app.use(cors({ origin: allowedOrigins(), credentials: true }));
app.use(express.json({ limit: '15mb' }));
app.get('/healthz', (req, res) => res.json({ ok: true }));
installAuth(app);
app.get('/favicon.ico', (req, res) => res.status(204).end());
app.use('/uploads', (req, res) => {
  try {
    if (!req.path.startsWith(`/users/${req.user.id}/`)) return res.status(404).end();
    const filename = tenantUploadPath(`uploads${decodeURIComponent(req.path)}`);
    res.setHeader('Cache-Control', 'private, no-store');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Content-Security-Policy', "default-src 'none'; sandbox");
    res.sendFile(filename, { dotfiles: 'allow' }, error => { if (error && !res.headersSent) res.status(404).end(); });
  } catch (error) { res.status(404).end(); }
});

const pool = getPool();
const { initTaskTables, installTaskRoutes } = require('./backend/daily-tasks');
installTaskRoutes(app, pool);

function genId() {
  return Date.now() + Math.random().toString(36).slice(2);
}

function formatDate(date) {
  if (!date) return '';
  if (typeof date === 'string') return date.substring(0, 10);
  if (date instanceof Date) {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }
  return '';
}

async function getSellRecords(stockId) {
  const [rows] = await pool.query(
    `SELECT id, stock_id, sell_date, sell_price, sell_count, position,
            sell_commission, sell_transfer_fee, stamp_tax, handling_fee, regulatory_fee, other_fee, net_profit, t_type, t_profit, t_pending, t_group_id, created_at,
            DATE_FORMAT(sell_date, '%Y-%m-%d') AS sell_date_str
     FROM sell_records WHERE stock_id = ? ORDER BY sell_date ASC, created_at ASC`, [stockId]);
  return rows.map(r => ({
    id: r.id,
    sellDate: r.sell_date_str || '',
    sellPrice: parseFloat(r.sell_price),
    sellCount: parseFloat(r.sell_count),
    position: r.position,
    sellCommission: parseFloat(r.sell_commission),
    sellTransferFee: parseFloat(r.sell_transfer_fee),
    stampTax: parseFloat(r.stamp_tax),
    handlingFee: parseFloat(r.handling_fee),
    regulatoryFee: parseFloat(r.regulatory_fee),
    otherFee: parseFloat(r.other_fee),
    netProfit: parseFloat(r.net_profit),
    tType: r.t_type || '',
    tPending: r.t_pending === 1,
    tProfit: r.t_profit != null ? parseFloat(r.t_profit) : null,
    tGroupId: r.t_group_id || null,
    createdAt: r.created_at ? new Date(r.created_at).getTime() : 0
  }));
}

async function getBuyRecords(stockId) {
  const [rows] = await pool.query(
    `SELECT id, stock_id, buy_date, buy_price, buy_count, commission, 
            transfer_fee, handling_fee, regulatory_fee, t_type, t_profit, cost_change, t_group_id, created_at,
            DATE_FORMAT(buy_date, '%Y-%m-%d') AS buy_date_str
     FROM buy_records WHERE stock_id = ? ORDER BY buy_date ASC, created_at ASC`, [stockId]);
  return rows.map(r => ({
    id: r.id,
    buyDate: r.buy_date_str || '',
    buyPrice: parseFloat(r.buy_price),
    buyCount: parseFloat(r.buy_count),
    commission: parseFloat(r.commission),
    transferFee: parseFloat(r.transfer_fee),
    handlingFee: parseFloat(r.handling_fee),
    regulatoryFee: parseFloat(r.regulatory_fee),
    tType: r.t_type || '',
    tProfit: r.t_profit != null ? parseFloat(r.t_profit) : null,
    costChange: r.cost_change != null ? parseFloat(r.cost_change) : 0,
    tGroupId: r.t_group_id || null,
    createdAt: r.created_at ? new Date(r.created_at).getTime() : 0
  }));
}

function calculateStockCostBasis(buyRecords, sellRecords, fallbackCost = 0, fallbackCount = 0) {
  const numberOrZero = value => Number.isFinite(Number(value)) ? Number(value) : 0;
  const buyFeeFor = record => numberOrZero(record.commission) + numberOrZero(record.transferFee) + numberOrZero(record.handlingFee) + numberOrZero(record.regulatoryFee);
  const sellFeeFor = record => numberOrZero(record.sellCommission) + numberOrZero(record.sellTransferFee) + numberOrZero(record.stampTax) + numberOrZero(record.handlingFee) + numberOrZero(record.regulatoryFee) + numberOrZero(record.otherFee);
  const totalBuyCount = buyRecords.reduce((sum, record) => sum + numberOrZero(record.buyCount), 0);
  const totalSellCount = sellRecords.reduce((sum, record) => sum + numberOrZero(record.sellCount), 0);
  const totalBuyAmount = buyRecords.reduce((sum, record) => sum + numberOrZero(record.buyPrice) * numberOrZero(record.buyCount), 0);
  const totalBuyGross = totalBuyAmount + buyRecords.reduce((sum, record) => sum + buyFeeFor(record), 0);
  const totalSellNet = sellRecords.reduce((sum, record) => sum + numberOrZero(record.sellPrice) * numberOrZero(record.sellCount) - sellFeeFor(record), 0);
  const remainingCount = Math.max(0, totalBuyCount - totalSellCount);
  const fallbackAverageCost = numberOrZero(fallbackCost);
  const averageBuyPrice = totalBuyCount > 0 ? totalBuyAmount / totalBuyCount : fallbackAverageCost;
  const averageBuyCost = totalBuyCount > 0 ? totalBuyGross / totalBuyCount : fallbackAverageCost;

  // Remaining basis equals total buy cash outflow minus net sale proceeds.
  const remainingCostTotal = totalBuyGross - totalSellNet;
  return {
    averageBuyPrice,
    averageCost: remainingCount > 0 ? remainingCostTotal / remainingCount : averageBuyCost,
    remainingCount: buyRecords.length > 0 ? remainingCount : Math.max(0, numberOrZero(fallbackCount)),
    remainingCostTotal: remainingCount > 0 ? remainingCostTotal : 0
  };
}

async function migrateOldTGroups() {
  try {
    const [stocks] = await pool.query(`SELECT id FROM stocks WHERE board = 'stock'`);
    for (const stock of stocks) {
      const buyRecords = await getBuyRecords(stock.id);
      const sellRecords = await getSellRecords(stock.id);
      
      const hasUngrouped = buyRecords.some(b => !b.tGroupId) || sellRecords.some(s => !s.tGroupId);
      if (!hasUngrouped) continue;
      
      const allTx = [];
      buyRecords.forEach(b => allTx.push({ type: 'buy', record: b, date: b.buyDate, count: b.buyCount, price: b.buyPrice }));
      sellRecords.forEach(s => allTx.push({ type: 'sell', record: s, date: s.sellDate, count: s.sellCount, price: s.sellPrice }));
      allTx.sort((a, b) => {
        const d = a.date.localeCompare(b.date);
        if (d !== 0) return d;
        return (a.record.createdAt || 0) - (b.record.createdAt || 0);
      });
      
      const pendingBuys = [];
      const pendingSells = [];
      let firstBuyProcessed = false;
      
      for (const tx of allTx) {
        if (tx.record.tGroupId) continue;
        
        if (tx.type === 'buy') {
          if (!firstBuyProcessed) {
            firstBuyProcessed = true;
            continue;
          }
          
          let matched = false;
          for (let i = 0; i < pendingSells.length; i++) {
            if (pendingSells[i].count === tx.count) {
              const sellTx = pendingSells.splice(i, 1)[0];
              const groupId = 'mig_' + Date.now().toString(36) + Math.random().toString(36).substr(2, 6);
              const profit = (sellTx.price - tx.price) * tx.count 
                - (sellTx.record.sellCommission || 0) - (sellTx.record.sellTransferFee || 0) - (sellTx.record.stampTax || 0)
                - tx.record.commission - tx.record.transferFee;
              
              await pool.execute(`UPDATE buy_records SET t_group_id = ?, t_type = 'T入', t_profit = ?, cost_change = ? WHERE id = ?`, 
                [groupId, profit, profit, tx.record.id]);
              await pool.execute(`UPDATE sell_records SET t_group_id = ?, t_type = 'T出' WHERE id = ?`, 
                [groupId, sellTx.record.id]);
              
              matched = true;
              break;
            }
          }
          
          if (!matched) {
            pendingBuys.push(tx);
          }
        } else {
          let matched = false;
          for (let i = 0; i < pendingBuys.length; i++) {
            if (pendingBuys[i].count === tx.count) {
              const buyTx = pendingBuys.splice(i, 1)[0];
              const groupId = 'mig_' + Date.now().toString(36) + Math.random().toString(36).substr(2, 6);
              const profit = (tx.price - buyTx.price) * tx.count 
                - tx.record.sellCommission - tx.record.sellTransferFee - tx.record.stampTax
                - buyTx.record.commission - buyTx.record.transferFee;
              
              await pool.execute(`UPDATE buy_records SET t_group_id = ?, t_type = 'T入', t_profit = ?, cost_change = ? WHERE id = ?`, 
                [groupId, profit, profit, buyTx.record.id]);
              await pool.execute(`UPDATE sell_records SET t_group_id = ?, t_type = 'T出' WHERE id = ?`, 
                [groupId, tx.record.id]);
              
              matched = true;
              break;
            }
          }
          
          if (!matched) {
            pendingSells.push(tx);
          }
        }
      }
    }
    console.log('旧数据T组配对完成');
  } catch (err) {
    console.error('旧数据T组配对失败:', err.message);
  }
}

app.get('/api/stocks', async (req, res) => {
  try {
    const board = req.query.board || 'stock';
    const [rows] = await pool.query(
      `SELECT id, name, code, cost, count, sell_price, position, target_profit,
              profit_loss_ratio, ratio_price, base_price, price_change_percent,
              is_cleared, created_at, buy_price, board, notes, frozen_holding_days, top_ten_float_ratio,
              DATE_FORMAT(buy_date, '%Y-%m-%d') AS buy_date_str,
              DATE_FORMAT(sell_date, '%Y-%m-%d') AS sell_date_str
       FROM stocks WHERE board = ? ORDER BY is_cleared, created_at`, [board]);

    const stockIds = rows.map(r => r.id);
    const buyMap = new Map();
    const sellMap = new Map();
    if (stockIds.length > 0) {
      const [buyRows] = await pool.query(
        `SELECT id, stock_id, buy_date, buy_price, buy_count, commission,
                transfer_fee, handling_fee, regulatory_fee, t_type, t_profit, cost_change, t_group_id, created_at,
                DATE_FORMAT(buy_date, '%Y-%m-%d') AS buy_date_str
         FROM buy_records WHERE stock_id IN (?) ORDER BY buy_date ASC, created_at ASC`, [stockIds]);
      for (const r of buyRows) {
        const m = {
          id: r.id,
          buyDate: r.buy_date_str || '',
          buyPrice: parseFloat(r.buy_price),
          buyCount: parseFloat(r.buy_count),
          commission: parseFloat(r.commission),
          transferFee: parseFloat(r.transfer_fee),
          handlingFee: parseFloat(r.handling_fee),
          regulatoryFee: parseFloat(r.regulatory_fee),
          tType: r.t_type || '',
          tProfit: r.t_profit != null ? parseFloat(r.t_profit) : null,
          costChange: r.cost_change != null ? parseFloat(r.cost_change) : 0,
          tGroupId: r.t_group_id || null,
          createdAt: r.created_at ? new Date(r.created_at).getTime() : 0
        };
        if (!buyMap.has(r.stock_id)) buyMap.set(r.stock_id, []);
        buyMap.get(r.stock_id).push(m);
      }

      const [sellRows] = await pool.query(
        `SELECT id, stock_id, sell_date, sell_price, sell_count, position,
                sell_commission, sell_transfer_fee, stamp_tax, handling_fee, regulatory_fee, other_fee, net_profit, t_type, t_profit, t_pending, t_group_id, created_at,
                DATE_FORMAT(sell_date, '%Y-%m-%d') AS sell_date_str
         FROM sell_records WHERE stock_id IN (?) ORDER BY sell_date ASC, created_at ASC`, [stockIds]);
      for (const r of sellRows) {
        const m = {
          id: r.id,
          sellDate: r.sell_date_str || '',
          sellPrice: parseFloat(r.sell_price),
          sellCount: parseFloat(r.sell_count),
          position: r.position,
          sellCommission: parseFloat(r.sell_commission),
          sellTransferFee: parseFloat(r.sell_transfer_fee),
          stampTax: parseFloat(r.stamp_tax),
          handlingFee: parseFloat(r.handling_fee),
          regulatoryFee: parseFloat(r.regulatory_fee),
          otherFee: parseFloat(r.other_fee),
          netProfit: parseFloat(r.net_profit),
          tType: r.t_type || '',
          tPending: r.t_pending === 1,
          tProfit: r.t_profit != null ? parseFloat(r.t_profit) : null,
          tGroupId: r.t_group_id || null,
          createdAt: r.created_at ? new Date(r.created_at).getTime() : 0
        };
        if (!sellMap.has(r.stock_id)) sellMap.set(r.stock_id, []);
        sellMap.get(r.stock_id).push(m);
      }
    }

    const result = [];
    for (const r of rows) {
      const sellRecords = sellMap.get(r.id) || [];
      const buyRecords = buyMap.get(r.id) || [];
      const stockBuyDate = buyRecords.length > 0 ? buyRecords[0].buyDate : (r.buy_date_str || '');

      let stockBuyPrice = r.buy_price ? parseFloat(r.buy_price) : null;
      let stockCost = parseFloat(r.cost);
      let stockCount = parseFloat(r.count);

      if (buyRecords.length > 0) {
        const costBasis = calculateStockCostBasis(buyRecords, sellRecords, stockCost, stockCount);
        stockBuyPrice = parseFloat(costBasis.averageBuyPrice.toFixed(3));
        stockCost = parseFloat(costBasis.averageCost.toFixed(3));
        stockCount = parseFloat(costBasis.remainingCount.toFixed(4));
      } else {
        stockCount = parseFloat(r.count);
      }

      // 清仓记录若无 sell_date，用最后一条卖出记录日期作为 fallback
      let stockSellDate = r.sell_date_str || '';
      if (r.is_cleared === 1 && !stockSellDate && sellRecords.length > 0) {
        stockSellDate = sellRecords[sellRecords.length - 1].sellDate || '';
      }

      result.push({
        id: r.id,
        name: r.name,
        code: r.code,
        board: r.board || 'stock',
        buyDate: stockBuyDate,
        sellDate: stockSellDate,
        buyPrice: stockBuyPrice,
        cost: stockCost,
        count: stockCount,
        sellPrice: parseFloat(r.sell_price),
        position: r.position,
        targetProfit: r.target_profit ? parseFloat(r.target_profit) : null,
        profitLossRatio: r.profit_loss_ratio != null ? parseFloat(r.profit_loss_ratio) : null,
        ratioPrice: r.ratio_price != null ? parseFloat(r.ratio_price) : null,
        basePrice: r.base_price != null ? parseFloat(r.base_price) : null,
        priceChangePercent: r.price_change_percent != null ? parseFloat(r.price_change_percent) : null,
        isCleared: r.is_cleared === 1,
        notes: r.notes || '',
        frozenHoldingDays: r.is_cleared === 1 ? (r.frozen_holding_days || 0) : 0,
        topTenFloatRatio: r.top_ten_float_ratio != null ? parseFloat(r.top_ten_float_ratio) : null,
        sellRecords: sellRecords,
        buyRecords: buyRecords
      });
    }
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/stocks/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const [rows] = await pool.query(
      `SELECT id, name, code, cost, count, sell_price, position, target_profit,
              profit_loss_ratio, ratio_price, base_price, price_change_percent,
              is_cleared, created_at, buy_price, board, notes, frozen_holding_days, top_ten_float_ratio,
              DATE_FORMAT(buy_date, '%Y-%m-%d') AS buy_date_str,
              DATE_FORMAT(sell_date, '%Y-%m-%d') AS sell_date_str
       FROM stocks WHERE id = ? LIMIT 1`, [id]);
    if (rows.length === 0) {
      return res.status(404).json({ error: 'Stock not found' });
    }
    const r = rows[0];
    const sellRecords = await getSellRecords(r.id);
    const buyRecords = await getBuyRecords(r.id);
    const stockBuyDate = buyRecords.length > 0 ? buyRecords[0].buyDate : (r.buy_date_str || '');
    
    let stockBuyPrice = r.buy_price ? parseFloat(r.buy_price) : null;
    let stockCost = parseFloat(r.cost);
    let stockCount = parseFloat(r.count);
    
    if (buyRecords.length > 0) {
      const costBasis = calculateStockCostBasis(buyRecords, sellRecords, stockCost, stockCount);
      stockBuyPrice = parseFloat(costBasis.averageBuyPrice.toFixed(3));
      stockCost = parseFloat(costBasis.averageCost.toFixed(3));
      stockCount = parseFloat(costBasis.remainingCount.toFixed(4));
    } else {
      stockCount = parseFloat(r.count);
    }
    
    // 清仓记录若无 sell_date，用最后一条卖出记录日期作为 fallback
    let stockSellDate = r.sell_date_str || '';
    if (r.is_cleared === 1 && !stockSellDate && sellRecords.length > 0) {
      stockSellDate = sellRecords[sellRecords.length - 1].sellDate || '';
    }
    
    res.json({
      id: r.id,
      name: r.name,
      code: r.code,
      board: r.board || 'stock',
      buyDate: stockBuyDate,
      sellDate: stockSellDate,
      buyPrice: stockBuyPrice,
      cost: stockCost,
      count: stockCount,
      sellPrice: parseFloat(r.sell_price),
      position: r.position,
      targetProfit: r.target_profit ? parseFloat(r.target_profit) : null,
      profitLossRatio: r.profit_loss_ratio != null ? parseFloat(r.profit_loss_ratio) : null,
      ratioPrice: r.ratio_price != null ? parseFloat(r.ratio_price) : null,
      basePrice: r.base_price != null ? parseFloat(r.base_price) : null,
      priceChangePercent: r.price_change_percent != null ? parseFloat(r.price_change_percent) : null,
      isCleared: r.is_cleared === 1,
      notes: r.notes || '',
        frozenHoldingDays: r.is_cleared === 1 ? (r.frozen_holding_days || 0) : 0,
      topTenFloatRatio: r.top_ten_float_ratio != null ? parseFloat(r.top_ten_float_ratio) : null,
      sellRecords: sellRecords,
      buyRecords: buyRecords
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/stocks/:id/sell-records', async (req, res) => {
  try {
    const { id } = req.params;
    const sellRecords = await getSellRecords(id);
    res.json(sellRecords);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/stocks/:id/sell-record', async (req, res) => {
  try {
    const { id } = req.params;
    const body = req.body || {};
    const sellPrice = Number(body.sellPrice);
    const sellCount = Number(body.sellCount);
    const sellCommission = Number(body.sellCommission ?? 0);
    if (!Number.isFinite(sellPrice) || sellPrice <= 0) return res.status(400).json({ error: '\u4e70\u5165\u5355\u4ef7\u5fc5\u987b\u5927\u4e8e 0' });
    if (!Number.isFinite(sellCount) || sellCount <= 0) return res.status(400).json({ error: '\u4e70\u5165\u514b\u6570\u5fc5\u987b\u5927\u4e8e 0' });
    if (!Number.isFinite(sellCommission) || sellCommission < 0) return res.status(400).json({ error: '????????? 0' });

    const [stocks] = await pool.query('SELECT id FROM stocks WHERE id = ? LIMIT 1', [id]);
    if (stocks.length === 0) return res.status(404).json({ error: '??????????????????' });

    const recordId = genId();
    await pool.execute(
      'INSERT INTO sell_records (id, stock_id, sell_date, sell_price, sell_count, position, sell_commission, sell_transfer_fee, stamp_tax, handling_fee, regulatory_fee, other_fee, net_profit, t_type, t_profit, t_pending, t_group_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
      [recordId, id, body.sellDate || null, sellPrice, sellCount, body.position || '', sellCommission, Number(body.sellTransferFee ?? 0), Number(body.stampTax ?? 0), Number(body.handlingFee ?? 0), Number(body.regulatoryFee ?? 0), Number(body.otherFee ?? 0), Number(body.netProfit ?? 0), body.tType || '', body.tProfit != null ? Number(body.tProfit) : null, body.tPending ? 1 : 0, body.tGroupId || null]
    );
    res.json({ id: recordId });
  } catch (err) {
    console.error('Sell record error:', err);
    res.status(500).json({ error: err.sqlMessage || err.message || '????????' });
  }
});

app.delete('/api/stocks/:id/sell-record/:recordId', async (req, res) => {
  try {
    const { recordId } = req.params;
    await pool.execute('DELETE FROM sell_records WHERE id=?', [recordId]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/stocks/:id/sell-record/:recordId', async (req, res) => {
  try {
    const { recordId } = req.params;
    const body = req.body;
    const allowedFields = ['sellDate', 'sellPrice', 'sellCount', 'sellCommission', 'sellTransferFee', 'stampTax', 'netProfit', 'tType', 'tProfit', 'tPending', 'tGroupId'];
    const updates = [];
    const values = [];
    for (const [key, value] of Object.entries(body)) {
      if (allowedFields.includes(key)) {
        const dbKey = key.replace(/([A-Z])/g, '_$1').toLowerCase();
        if ((key === 'sellDate') && value === '') {
          updates.push(`${dbKey} = ?`);
          values.push(null);
        } else if (key === 'tPending') {
          updates.push(`${dbKey} = ?`);
          values.push(value ? 1 : 0);
        } else {
          updates.push(`${dbKey} = ?`);
          values.push(value);
        }
      }
    }
    if (updates.length === 0) return res.json({ success: true });
    values.push(recordId);
    await pool.execute(`UPDATE sell_records SET ${updates.join(', ')} WHERE id = ?`, values);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/stocks/:id/buy-records', async (req, res) => {
  try {
    const { id } = req.params;
    const buyRecords = await getBuyRecords(id);
    res.json(buyRecords);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/stocks/:id/buy-record', async (req, res) => {
  const connection = await pool.getConnection();
  try {
    const { id } = req.params;
    const body = req.body || {};
    const buyDate = typeof body.buyDate === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(body.buyDate) ? body.buyDate : null;
    const toNumber = (value, fallback = 0) => {
      const number = Number(value);
      return Number.isFinite(number) ? number : fallback;
    };
    const buyPrice = toNumber(body.buyPrice);
    const buyCount = toNumber(body.buyCount);
    const commission = toNumber(body.commission);
    const transferFee = toNumber(body.transferFee);
    const handlingFee = toNumber(body.handlingFee);
    const regulatoryFee = toNumber(body.regulatoryFee);
    const tProfit = body.tProfit == null || body.tProfit === '' ? null : toNumber(body.tProfit);
    const costChange = toNumber(body.costChange);
    const tType = typeof body.tType === 'string' ? body.tType : '';
    const tGroupId = body.tGroupId == null || body.tGroupId === '' ? null : String(body.tGroupId);

    if (!buyDate) return res.status(400).json({ error: '\u8bf7\u9009\u62e9\u6709\u6548\u7684\u4e70\u5165\u65e5\u671f' });
    if (buyPrice <= 0) return res.status(400).json({ error: '???????? 0' });
    if (buyCount <= 0) return res.status(400).json({ error: '???????? 0' });

    await connection.beginTransaction();
    const [stocks] = await connection.query('SELECT id FROM stocks WHERE id = ? FOR UPDATE', [id]);
    if (stocks.length === 0) {
      await connection.rollback();
      return res.status(404).json({ error: '\u9ec4\u91d1\u9879\u76ee\u4e0d\u5b58\u5728' });
    }

    const recordId = genId();
    await connection.execute('UPDATE stocks SET is_cleared = 0, sell_date = NULL WHERE id = ? AND is_cleared = 1', [id]);
    await connection.execute(
      'INSERT INTO buy_records (id, stock_id, buy_date, buy_price, buy_count, commission, transfer_fee, handling_fee, regulatory_fee, t_type, t_profit, cost_change, t_group_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
      [recordId, id, buyDate, buyPrice, buyCount, commission, transferFee, handlingFee, regulatoryFee, tType, tProfit, costChange, tGroupId]
    );
    await connection.commit();
    res.json({ id: recordId });
  } catch (err) {
    await connection.rollback();
    console.error('[BuyRecord] save failed:', err);
    res.status(500).json({ error: err.message });
  } finally {
    connection.release();
  }
});

app.delete('/api/stocks/:id/buy-record/:recordId', async (req, res) => {
  try {
    const { recordId } = req.params;
    await pool.execute('DELETE FROM buy_records WHERE id=?', [recordId]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/stocks/:id/buy-record/:recordId', async (req, res) => {
  try {
    const { recordId } = req.params;
    const body = req.body;
    const allowedFields = ['buyDate', 'buyPrice', 'buyCount', 'commission', 'transferFee', 'handlingFee', 'regulatoryFee', 'tType', 'tProfit', 'costChange', 'tGroupId'];
    const updates = [];
    const values = [];
    for (const [key, value] of Object.entries(body)) {
      if (allowedFields.includes(key)) {
        const dbKey = key.replace(/([A-Z])/g, '_$1').toLowerCase();
        if ((key === 'buyDate') && value === '') {
          updates.push(`${dbKey} = ?`);
          values.push(null);
        } else {
          updates.push(`${dbKey} = ?`);
          values.push(value);
        }
      }
    }
    if (updates.length === 0) {
      return res.json({ success: true });
    }
    values.push(recordId);
    await pool.execute(`UPDATE buy_records SET ${updates.join(', ')} WHERE id = ?`, values);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/stocks', async (req, res) => {
  try {
    const { name, code, cost, count, sellPrice, position, buyDate, buyPrice, board, targetProfit } = req.body;
    const finalBoard = board || 'stock';
    const finalCode = (code || '').trim();

    // 做T支持：检查是否已存在相同代码+板块的股票，自动归类
    if (finalCode) {
      const [existing] = await pool.query(
        'SELECT id, name, code, is_cleared FROM stocks WHERE code = ? AND board = ? ORDER BY created_at DESC LIMIT 1',
        [finalCode, finalBoard]
      );
      if (existing.length > 0) {
        const stock = existing[0];
        // 如果已清仓，重新激活
        if (stock.is_cleared === 1) {
          await pool.execute('UPDATE stocks SET is_cleared = 0, position = ?, sell_date = NULL WHERE id = ?', [position || 'full', stock.id]);
        }
        // 更新名称（如果用户改了名称）
        if (name && name !== stock.name) {
          await pool.execute('UPDATE stocks SET name = ? WHERE id = ?', [name, stock.id]);
        }
        return res.json({ id: stock.id, reused: true, name: name || stock.name });
      }
    }

    const id = genId();
    await pool.execute(
      'INSERT INTO stocks (id, name, code, cost, count, sell_price, position, buy_date, buy_price, board, target_profit) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
      [id, name, code, cost, count, sellPrice || null, position || 'full', buyDate || null, buyPrice || null, finalBoard, targetProfit || null]
    );
    res.json({ id, reused: false });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/stocks/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const body = req.body;
    const fields = [];
    const values = [];
    const allowed = ['name', 'code', 'buyDate', 'sellDate', 'buyPrice', 'cost', 'count', 'sellPrice', 'position', 'targetProfit', 'profitLossRatio', 'ratioPrice', 'basePrice', 'priceChangePercent', 'isCleared', 'notes', 'frozenHoldingDays', 'topTenFloatRatio'];
    const fieldMap = {
      name: 'name', code: 'code',
      buyDate: 'buy_date', sellDate: 'sell_date',
      buyPrice: 'buy_price', cost: 'cost', count: 'count',
      sellPrice: 'sell_price', position: 'position',
      targetProfit: 'target_profit', profitLossRatio: 'profit_loss_ratio',
      ratioPrice: 'ratio_price', basePrice: 'base_price',
      priceChangePercent: 'price_change_percent', isCleared: 'is_cleared',
      notes: 'notes',
      frozenHoldingDays: 'frozen_holding_days',
      topTenFloatRatio: 'top_ten_float_ratio'
    };
    for (const key of allowed) {
      if (body[key] !== undefined) {
        fields.push(`${fieldMap[key]} = ?`);
        if (key === 'isCleared') {
          values.push(body.isCleared ? 1 : 0);
        } else if ((key === 'buyDate' || key === 'sellDate') && body[key] === '') {
          values.push(null);
        } else {
          values.push(body[key]);
        }
      }
    }
    if (fields.length === 0) return res.json({ success: true });
    values.push(id);
    await pool.execute(`UPDATE stocks SET ${fields.join(', ')} WHERE id = ?`, values);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/stocks/:id/clear', async (req, res) => {
  try {
    const { id } = req.params;
    await pool.execute(
      'UPDATE stocks SET is_cleared=1, position="full", sell_date=NOW() WHERE id=?',
      [id]
    );
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/stocks/:id', async (req, res) => {
  try {
    const { id } = req.params;
    await pool.execute('DELETE FROM stocks WHERE id=?', [id]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ========== AI 创作工作台 API ==========
// 免费热榜聚合（优先走 DailyHotApi 开源部署域名，失败降级 TenAPI 等公开接口）
const HOT_SOURCES = [
  // 1. DailyHotApi (imsyy/DailyHotApi, MIT, 可自部署)
  {
    id: 'dailyhotapi',
    name: 'DailyHotApi',
    // 用户可在 .env 配自己部署的域名，否则走官方演示站
    baseUrl: process.env.DAILY_HOT_API_BASE || 'https://hot.banned.icu/api',
    platforms: {
      weibo:     { key: 'weibo',   fullName: '微博热搜' },
      zhihu:     { key: 'zhihu',   fullName: '知乎热榜' },
      toutiao:   { key: 'toutiao', fullName: '今日头条' },
      bilibili:  { key: 'bilibili',fullName: 'B站热搜' },
      baidu:     { key: 'baidu',   fullName: '百度热搜' },
      douyin:    { key: 'douyin',  fullName: '抖音热点' },
      '36kr':    { key: '36kr',    fullName: '36氪' },
      itHome:    { key: 'ithome',  fullName: 'IT之家' },
      thepaper:  { key: 'thepaper',fullName: '澎湃新闻' },
      newsqq:    { key: 'newsqq',  fullName: '腾讯新闻' },
    },
    async fetch(platformKey) {
      const u = `${this.baseUrl}/${platformKey}`;
      const r = await fetch(u, { signal: AbortSignal.timeout(8000), headers: { 'User-Agent': 'StockWorkbench/1.0' } });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const j = await r.json();
      // DailyHotApi 返回: { code:200, data:[{id,title,url,hot,mobileUrl,...}] }
      const arr = Array.isArray(j.data) ? j.data : [];
      return arr.map((it, i) => ({
        rank: it.rank ?? i + 1,
        title: String(it.title ?? '').trim(),
        url: it.url || it.mobileUrl || '',
        hot: it.hot ?? null,
        source: this.platforms[platformKey]?.fullName || platformKey,
        category: categorizeTitle(String(it.title ?? '')),
        createdAt: Date.now(),
      })).filter(it => it.title && it.title.length > 0);
    },
  },
];

// 简单关键词分类（中文热点标题粗分）
const CATEGORY_RULES = [
  { cat: '科技',   keywords: ['芯片','AI','人工智能','大模型','GPT','AI','苹果','华为','小米','OPPO','手机','特斯拉','新能源','电动车','电动汽车','互联网','腾讯','阿里','字节','百度','元宇宙','VR','AR','机器人','半导体','光刻机','5G','卫星'] },
  { cat: '财经',   keywords: ['股票','A股','大盘','沪指','深成指','创业板','基金','理财','央行','利率','降息','加息','楼市','房价','房产','地产','GDP','通胀','CPI','汇率','人民币','美元','黄金','原油','油价','上市公司','业绩','财报','IPO','融资'] },
  { cat: '社会',   keywords: ['车祸','事故','救援','火灾','暴雨','地震','台风','灾害','坠亡','跳楼','溺水','失联','抓获','抓获','通报','警方','公安','法院','判决','案件','报警','城管','学校','校园','家长','老师','学生','医院','医生','医疗'] },
  { cat: '娱乐',   keywords: ['明星','艺人','歌手','演员','演唱会','电影','票房','综艺','节目','剧集','电视剧','CP','粉丝','热搜','娱乐','八卦','爆料','博主','网红','主播','直播','游戏','电竞','LPL','Uzi','S赛'] },
  { cat: '体育',   keywords: ['CBA','NBA','国足','中超','亚冠','欧冠','英超','西甲','意甲','德甲','世界杯','奥运会','亚运会','马拉松','梅西','C罗','詹姆斯','库里','足球','篮球','排球','比赛','冠军','亚军','决赛','半决赛','教练','裁判'] },
  { cat: '时政',   keywords: ['国务院','总书记','主席','总理','部长','省委','市委','外交部','国防部','发布会','台湾','香港','澳门','中美','中俄','北约','欧盟','联合国','普京','拜登','特朗普','马克龙','政策','通知','规定'] },
];
function categorizeTitle(title) {
  for (const { cat, keywords } of CATEGORY_RULES) {
    if (keywords.some(k => title.includes(k))) return cat;
  }
  return '综合';
}

// 热点平台列表（/api/ai/hot/platforms）
app.get('/api/ai/hot/platforms', async (req, res) => {
  try {
    const platforms = Object.values(HOT_SOURCES[0].platforms).map(p => ({
      key: p.key,
      name: p.fullName,
    }));
    res.json({ success: true, data: platforms });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// 单平台热点（/api/ai/hot?platform=weibo）
app.get('/api/ai/hot', async (req, res) => {
  try {
    const platform = String(req.query.platform || 'weibo');
    const src = HOT_SOURCES[0];
    if (!src.platforms[platform]) {
      return res.status(400).json({ success: false, error: `不支持的平台: ${platform}` });
    }
    const list = await src.fetch(platform);
    res.json({ success: true, data: list, platform, fetchedAt: Date.now() });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// 多平台一次性拉取（/api/ai/hot/batch?platforms=weibo,zhihu,toutiao）
app.get('/api/ai/hot/batch', async (req, res) => {
  try {
    const platforms = String(req.query.platforms || 'weibo,zhihu,toutiao')
      .split(',')
      .map(s => s.trim())
      .filter(Boolean);
    const src = HOT_SOURCES[0];
    const tasks = platforms.filter(p => src.platforms[p]).map(p =>
      src.fetch(p).then(list => ({ platform: p, list })).catch(e => ({ platform: p, list: [], error: e.message }))
    );
    const results = await Promise.allSettled(tasks);
    const data = {};
    for (const r of results) {
      if (r.status === 'fulfilled') {
        const it = r.value;
        data[it.platform] = { list: it.list || [], error: it.error || null };
      }
    }
    res.json({ success: true, data, fetchedAt: Date.now() });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// 网页正文解析（/api/ai/article-parse?url=xxx）
// ⚠️版权提醒：只建议提取网页结构用于选题参考，直接搬运全文有侵权风险
app.get('/api/ai/article-parse', async (req, res) => {
  try {
    let url = String(req.query.url || '').trim();
    if (!url) return res.status(400).json({ success: false, error: '缺少 url 参数' });
    if (!/^https?:\/\//i.test(url)) url = 'https://' + url;

    const r = await fetch(url, {
      signal: AbortSignal.timeout(15000),
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'zh-CN,zh;q=0.9',
      },
      redirect: 'follow',
    });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    const buf = await r.arrayBuffer();
    // 处理字符集
    const contentType = r.headers.get('content-type') || '';
    let charset = 'utf-8';
    const cs = contentType.match(/charset=([\w-]+)/i);
    if (cs) charset = cs[1];
    let html = new TextDecoder(charset, { fatal: false }).decode(new Uint8Array(buf));

    // 去掉脚本/样式/头部/导航
    html = html
      .replace(/<script[\s\S]*?<\/script>/gi, '')
      .replace(/<style[\s\S]*?<\/style>/gi, '')
      .replace(/<head[\s\S]*?<\/head>/i, '')
      .replace(/<nav[\s\S]*?<\/nav>/gi, '')
      .replace(/<header[\s\S]*?<\/header>/gi, '')
      .replace(/<footer[\s\S]*?<\/footer>/gi, '')
      .replace(/<aside[\s\S]*?<\/aside>/gi, '')
      .replace(/<iframe[\s\S]*?<\/iframe>/gi, '');

    // 提取 title
    const titleMatch = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
    const title = titleMatch ? titleMatch[1].replace(/[\r\n\t]+/g, ' ').trim() : '';

    // 找正文：优先 <article>，否则找最长连续 <p> 段的容器
    let articleHtml = '';
    const articleMatch = html.match(/<article[^>]*>([\s\S]*?)<\/article>/i);
    if (articleMatch) {
      articleHtml = articleMatch[1];
    } else {
      // 选 <p> 段落最多的 div
      const divs = [...html.matchAll(/<div[^>]*>([\s\S]*?)<\/div>/gi)];
      let best = '';
      for (const m of divs) {
        const pCount = (m[1].match(/<p\b/gi) || []).length;
        if (pCount >= 3 && m[1].length > best.length) best = m[1];
      }
      articleHtml = best;
    }
    // 转纯文本：按段落分块
    const blocks = [];
    const pRegex = /<p[^>]*>([\s\S]*?)<\/p>|<h([1-6])[^>]*>([\s\S]*?)<\/h\2>/gi;
    let m;
    while ((m = pRegex.exec(articleHtml)) !== null) {
      if (m[1] != null) {
        blocks.push({ type: 'p', text: stripTags(m[1]).replace(/\s+/g, ' ').trim() });
      } else {
        blocks.push({ type: 'h' + m[2], text: stripTags(m[3]).replace(/\s+/g, ' ').trim() });
      }
    }
    const paragraphs = blocks
      .filter(b => b.text && b.text.length > 0)
      .filter(b => {
        // 过滤掉过于明显的广告/版权/导航链接文字
        const t = b.text;
        if (/^(版权|免责声明|来源|编辑|转载|原标题|作者|Copyright|©|上一篇|下一篇|推荐阅读|相关推荐|点击.*看|关注.*公众号)/i.test(t)) return false;
        if (t.length < 5) return false;
        return true;
      });

    const plainText = paragraphs.map(p => p.text).join('\n\n');

    res.json({
      success: true,
      url,
      title,
      wordCount: plainText.length,
      paragraphCount: paragraphs.length,
      paragraphs,
      plainText,
      riskNotice: '⚠️ 本接口仅用于结构分析/选题参考。直接搬运全文用于发布，存在著作权侵权风险。',
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

function stripTags(s) {
  return String(s).replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'");
}

// AI 生成记录 CRUD（数据库表 + 接口）
async function ensureAiArticlesTable() {
  try {
    await pool.execute(`
      CREATE TABLE IF NOT EXISTS ai_articles (
        id VARCHAR(64) PRIMARY KEY,
        category VARCHAR(32) DEFAULT '',
        title VARCHAR(500) DEFAULT '',
        content LONGTEXT,
        plain_text LONGTEXT,
        word_count INT DEFAULT 0,
        source VARCHAR(100) DEFAULT '',
        source_url VARCHAR(1000) DEFAULT '',
        tags VARCHAR(500) DEFAULT '',
        status VARCHAR(20) DEFAULT 'draft',
        platform VARCHAR(50) DEFAULT '',
        created_at BIGINT DEFAULT 0,
        updated_at BIGINT DEFAULT 0
      )
    `);
    // 动态补列（旧表已存在时）
    const addCols = [
      ['plain_text', 'LONGTEXT'],
    ];
    for (const [name, def] of addCols) {
      try { await pool.execute(`ALTER TABLE ai_articles ADD COLUMN ${name} ${def}`); }
      catch (e) { if (e.code !== 'ER_DUP_FIELDNAME') console.warn('[alter ai_articles]', name, e.message); }
    }
  } catch (err) {
    if (err.code !== 'ER_TABLE_EXISTS_ERROR') console.warn('[ai_articles]', err.message);
  }
}

// 新增文章
app.post('/api/ai/articles', async (req, res) => {
  try {
    const body = req.body || {};
    const id = 'aia_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8);
    const now = Date.now();
    const cat = body.category || '综合';
    const title = body.title || '无标题';
    const content = body.content || '';
    const plainText = body.plain_text || '';
    const rawForCount = plainText || content || '';
    const wordCount = (body.word_count && Number(body.word_count) > 0)
      ? Number(body.word_count)
      : Array.from(String(rawForCount).replace(/\s/g, '')).length;
    const tagsVal = (body.tags && Array.isArray(body.tags)) ? body.tags.join(',') : String(body.tags || '');
    const [info] = await pool.execute(
      `INSERT INTO ai_articles (id, category, title, content, plain_text, word_count, source, source_url, tags, status, platform, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        id, cat, title, content, plainText, wordCount,
        body.source || '', body.source_url || body.sourceUrl || '',
        tagsVal,
        body.status || 'draft',
        body.platform || '',
        now, now,
      ]
    );
    res.json({ success: true, id, data: { id, category: cat, title, word_count: wordCount, wordCount, created_at: now, createdAt: now } });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// 文章列表
app.get('/api/ai/articles', async (req, res) => {
  try {
    const q = req.query.q || req.query.keyword || '';
    const { category = '', status = '', page = 1, pageSize = 20, sort = '-created_at' } = req.query;
    const where = [];
    const args = [];
    if (category) { where.push('category = ?'); args.push(category); }
    if (status)   { where.push('status = ?'); args.push(status); }
    if (q) {
      where.push('(title LIKE ? OR IFNULL(plain_text, "") LIKE ? OR tags LIKE ?)');
      const k = `%${q}%`;
      args.push(k, k, k);
    }
    const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
    const [[{ total }]] = await pool.query(`SELECT COUNT(*) as total FROM ai_articles ${whereSql}`, args);

    // 排序映射（安全白名单）
    const sortMap = {
      '-created_at': 'created_at DESC',
      'created_at':  'created_at ASC',
      '-updated_at': 'updated_at DESC',
      'updated_at':  'updated_at ASC',
      '-word_count': 'word_count DESC',
      'word_count':  'word_count ASC',
      'title':       'title ASC',
    };
    const orderBy = sortMap[String(sort)] || sortMap['-created_at'];

    const offset = (parseInt(page) - 1) * parseInt(pageSize);
    const [rows] = await pool.query(
      `SELECT id, category, title, word_count, source, tags, status, platform, created_at, updated_at,
              LEFT(IFNULL(plain_text, ""), 140) AS summary
       FROM ai_articles ${whereSql}
       ORDER BY ${orderBy} LIMIT ? OFFSET ?`,
      [...args, parseInt(pageSize), offset]
    );
    const [catRows] = await pool.query('SELECT DISTINCT category FROM ai_articles ORDER BY category');
    const categories = catRows.map(r => r.category).filter(Boolean);
    res.json({
      success: true,
      data: rows,
      total,
      categories,
      page: parseInt(page),
      pageSize: parseInt(pageSize),
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// 文章详情
app.get('/api/ai/articles/:id', async (req, res) => {
  try {
    const [rows] = await pool.query('SELECT * FROM ai_articles WHERE id = ? LIMIT 1', [req.params.id]);
    if (rows.length === 0) return res.status(404).json({ success: false, error: '未找到' });
    const r = rows[0];
    res.json({
      success: true,
      id: r.id,
      data: r,           // 兼容 r.data?.id
      // 平铺，避免再包一层：也直接返回 r 本身字段
      ...r,
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// 更新文章
app.put('/api/ai/articles/:id', async (req, res) => {
  try {
    const body = req.body || {};
    const allowed = ['category', 'title', 'content', 'plain_text', 'word_count',
                     'source', 'source_url', 'sourceUrl', 'tags', 'status', 'platform'];
    const fields = [];
    const values = [];
    const colMap = {
      category: 'category', title: 'title', content: 'content', plain_text: 'plain_text', word_count: 'word_count',
      source: 'source', source_url: 'source_url', sourceUrl: 'source_url',
      tags: 'tags', status: 'status', platform: 'platform',
    };
    for (const k of allowed) {
      if (body[k] === undefined) continue;
      let v = body[k];
      if (k === 'tags' && Array.isArray(v)) v = v.join(',');
      fields.push(`${colMap[k]} = ?`);
      values.push(v);
    }
    // 如果提供了 plain_text / content，但未显式指定 word_count，重算
    const wcExplicit = (body.word_count !== undefined);
    if (!wcExplicit && (body.plain_text !== undefined || body.content !== undefined)) {
      const raw = (body.plain_text !== undefined ? body.plain_text : body.content) || '';
      const wc = Array.from(String(raw).replace(/\s/g, '')).length;
      fields.push('word_count = ?');
      values.push(wc);
    }
    if (fields.length === 0) return res.json({ success: true });
    fields.push('updated_at = ?');
    values.push(Date.now(), req.params.id);
    await pool.execute(`UPDATE ai_articles SET ${fields.join(', ')} WHERE id = ?`, values);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// 删除文章
app.delete('/api/ai/articles/:id', async (req, res) => {
  try {
    const [r] = await pool.execute('DELETE FROM ai_articles WHERE id = ?', [req.params.id]);
    res.json({ success: true, affectedRows: r && r.affectedRows });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.use(express.static(path.join(__dirname, 'frontend', 'dist')));
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'frontend', 'dist', 'index.html'));
});

// ========== 量化回测引擎代理 ==========
// 转发到独立 Python quant 服务（FastAPI），业务逻辑在 Python 侧，Node 只做端口转发。
const http = require('http');
// 从 /api/backtest/* 转发到 Python quant 服务（默认 http://localhost:8000）
function quantProxy(req, res) {
  const target = process.env.QUANT_SERVICE_URL || 'http://localhost:8000';
  // 兼容两种入径：/quant/ping 与 /api/quant/ping 均转发为 /api/ping
  const strip = /^\/(?:api\/)?quant\b/.test(req.originalUrl)
    ? req.originalUrl.replace(/^\/(?:api\/)?quant\b/, '/api')
    : req.originalUrl;
  const url = target + strip;
  const headers = { ...req.headers, host: new URL(target).host };
  delete headers.cookie;
  delete headers.authorization;
  delete headers['x-csrf-token'];
  const hasBody = req.body && Object.keys(req.body).length > 0;
  let body = Buffer.alloc(0);
  if (hasBody && (req.method === 'POST' || req.method === 'PUT' || req.method === 'PATCH')) {
    body = Buffer.from(JSON.stringify(req.body), 'utf-8');
    headers['content-length'] = body.length;
    headers['content-type'] = 'application/json';
  } else {
    delete headers['content-length'];
    delete headers['transfer-encoding'];
  }
  const proxyReq = http.request(url, {
    method: req.method,
    headers,
    timeout: 120000,
  }, (proxyRes) => {
    res.status(proxyRes.statusCode);
    res.setHeader('Content-Type', proxyRes.headers['content-type'] || 'application/json');
    proxyRes.pipe(res);
  });
  proxyReq.on('error', (err) => {
    if (!res.headersSent) {
      res.status(502).json({
        success: false,
        error: '量化服务未启动（python quant/ 目录下运行 uvicorn quant.api:app --port 8000）',
        detail: err.message,
      });
    } else {
      res.end();
    }
  });
  proxyReq.on('timeout', () => proxyReq.destroy(new Error('quant 服务超时')));
  proxyReq.end(body);
}

app.use('/quant', quantProxy);
app.use('/api/quant', quantProxy);

// ========== 量化服务（Python/FastAPI）启停控制 ==========
// 前端「开关」直接控制 8000 端口服务，免去手动敲命令。
// 注意：路径用 /api/quant-service（连字符），不会命中上面的 /api/quant 代理。
const { spawn, execFile } = require('child_process');
const QUANT_DIR = path.join(__dirname, 'quant');
const QUANT_PY = path.join(QUANT_DIR, '.venv', 'Scripts', 'python.exe');
const QUANT_PORT = Number(process.env.QUANT_PORT) || 8000;
let quantProc = null;
const quantLogs = [];

function pushQuantLog(buf) {
  for (const line of String(buf || '').split(/\r?\n/)) {
    if (!line.trim()) continue;
    quantLogs.push(line.trim());
    if (quantLogs.length > 200) quantLogs.shift();
  }
}

function pingQuant(timeoutMs = 1500) {
  return new Promise((resolve) => {
    const req = http.get(`http://127.0.0.1:${QUANT_PORT}/api/ping`, { timeout: timeoutMs }, (res) => {
      res.resume();
      resolve(res.statusCode >= 200 && res.statusCode < 500);
    });
    req.on('error', () => resolve(false));
    req.on('timeout', () => { req.destroy(); resolve(false); });
  });
}

function quantPortPids() {
  return new Promise((resolve) => {
    execFile('powershell', ['-NoProfile', '-Command',
      `Get-NetTCPConnection -State Listen -LocalPort ${QUANT_PORT} -ErrorAction SilentlyContinue | Select-Object -ExpandProperty OwningProcess -Unique`],
      { windowsHide: true, timeout: 8000 },
      (err, stdout) => {
        if (err) return resolve([]);
        resolve([...new Set(String(stdout).split(/\s+/).filter((s) => /^\d+$/.test(s)))]);
      });
  });
}

function killPid(pid) {
  return new Promise((resolve) => {
    execFile('taskkill', ['/PID', String(pid), '/T', '/F'], { windowsHide: true, timeout: 8000 }, () => resolve());
  });
}

app.get('/api/quant-service/status', async (req, res) => {
  const running = await pingQuant();
  let aiReady = false;
  try { aiReady = Boolean(await getGlmApiKey()); } catch (e) { aiReady = false; }
  res.json({ success: true, running, port: QUANT_PORT, managed: !!(quantProc && quantProc.exitCode === null), aiReady });
});

app.post('/api/quant-service/start', async (req, res) => {
  if (await pingQuant()) return res.json({ success: true, running: true, message: '量化服务已在运行' });
  if (!fs.existsSync(QUANT_PY)) {
    return res.status(400).json({ success: false, error: `未找到虚拟环境：${QUANT_PY}` });
  }
  // 注入 GLM Key，让量化服务里的 AI 策略生成/改进无需手动配环境变量
  let glmKey = '';
  try { glmKey = (await getGlmApiKey()) || ''; } catch (e) { glmKey = ''; }
  try {
    quantProc = spawn(QUANT_PY, ['-m', 'uvicorn', 'quant.api:app', '--port', String(QUANT_PORT)], {
      cwd: QUANT_DIR,
      windowsHide: true,
      env: {
        ...process.env,
        GLM_API_KEY: glmKey,
        AGNES_API_KEY: '',
        ALAPI_TOKEN: '',
        // 量化服务里的 AI 调用（策略生成/改进）回传日志到本服务，写入 ai_logs
        AI_LOG_URL: `http://127.0.0.1:${port}/api/ai/logs`,
      },
    });
  } catch (e) {
    return res.status(500).json({ success: false, error: '启动失败：' + e.message });
  }
  quantProc.stdout.on('data', pushQuantLog);
  quantProc.stderr.on('data', pushQuantLog);
  quantProc.on('exit', () => { quantProc = null; });

  const deadline = Date.now() + 20000;
  while (Date.now() < deadline) {
    if (await pingQuant(1000)) return res.json({ success: true, running: true, message: '量化服务已启动' });
    if (!quantProc) break;
    await new Promise((r) => setTimeout(r, 500));
  }
  res.status(504).json({ success: false, error: '启动超时', log: quantLogs.slice(-20) });
});

app.post('/api/quant-service/stop', async (req, res) => {
  let killed = false;
  if (quantProc && quantProc.exitCode === null) { await killPid(quantProc.pid); killed = true; }
  for (const pid of await quantPortPids()) { await killPid(pid); killed = true; }
  quantProc = null;
  const stillUp = await pingQuant(1000);
  res.json({ success: true, running: stillUp, killed, message: stillUp ? '仍有进程占用端口' : '量化服务已停止' });
});

// ========== 存款 API ==========
app.get('/api/deposits', async (req, res) => {
  try {
    // 先自动处理到期账单
    await autoPayBills();
    const [rows] = await pool.query(
      `SELECT d.id, d.group_name, d.name, d.amount, d.rate, d.note, d.sort_order, d.created_at, d.icon, d.bind_type, d.exclude_total, d.item_type, d.repayment_day, d.payment_account_id, d.repayment_mode,
              p.id as plan_id, p.total_principal, p.total_interest, p.installments, p.monthly_day, p.start_date,
              COALESCE((SELECT SUM(ib.total) FROM installment_bills ib WHERE ib.plan_id = p.id AND ib.status = 'pending'), 0) as installment_remaining
       FROM deposit_items d
       LEFT JOIN installment_plans p ON d.id = p.deposit_item_id
       ORDER BY d.group_name, d.sort_order, d.created_at`
    );
    res.json(rows.map(r => ({
      id: r.id,
      groupName: r.group_name,
      name: r.name,
      amount: r.item_type === 'installment' ? -parseFloat(r.installment_remaining || 0) : parseFloat(r.amount),
      rate: r.rate != null ? parseFloat(r.rate) : null,
      note: r.note || '',
      sortOrder: r.sort_order,
      createdAt: r.created_at,
      icon: r.icon || '',
      bindType: r.bind_type || '',
      excludeTotal: r.exclude_total === 1,
      itemType: r.item_type || 'normal',
      repaymentDay: r.repayment_day,
      paymentAccountId: r.payment_account_id || '',
      repaymentMode: r.repayment_mode || 'auto',
      totalPrincipal: r.total_principal != null ? parseFloat(r.total_principal) : 0,
      totalInterest: r.total_interest != null ? parseFloat(r.total_interest) : 0,
      installments: r.installments || 0,
      monthlyDay: r.monthly_day || 1,
      startDate: r.start_date || '',
      planId: r.plan_id || ''
    })));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/deposits', async (req, res) => {
  try {
    const { groupName, name, amount, rate, note, sortOrder, icon, bindType, excludeTotal, itemType, repaymentDay, paymentAccountId, repaymentMode } = req.body;
    const id = genId();
    const validTypes = ['normal', 'debt', 'installment'];
    const finalItemType = validTypes.includes(itemType) ? itemType : 'normal';
    const validModes = ['auto', 'manual'];
    const finalRepaymentMode = validModes.includes(repaymentMode) ? repaymentMode : 'auto';
    await pool.execute(
      'INSERT INTO deposit_items (id, group_name, name, amount, rate, note, sort_order, created_at, icon, bind_type, exclude_total, item_type, repayment_day, payment_account_id, repayment_mode) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
      [id, groupName || '默认分组', name || '', amount || 0, rate || null, note || '', sortOrder || 0, Date.now(), icon || '', bindType || '', excludeTotal ? 1 : 0, finalItemType, repaymentDay || null, paymentAccountId || null, finalRepaymentMode]
    );
    res.json({ id });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/deposits/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const body = req.body;
    // 仅更新请求中实际提供的字段
    const fields = [];
    const values = [];
    if (body.groupName !== undefined) { fields.push('group_name=?'); values.push(body.groupName); }
    if (body.name !== undefined) { fields.push('name=?'); values.push(body.name); }
    if (body.amount !== undefined) { fields.push('amount=?'); values.push(body.amount); }
    if (body.rate !== undefined) { fields.push('rate=?'); values.push(body.rate); }
    if (body.note !== undefined) { fields.push('note=?'); values.push(body.note); }
    if (body.sortOrder !== undefined) { fields.push('sort_order=?'); values.push(body.sortOrder); }
    if (body.icon !== undefined) { fields.push('icon=?'); values.push(body.icon); }
    if (body.bindType !== undefined) { fields.push('bind_type=?'); values.push(body.bindType); }
    if (body.excludeTotal !== undefined) { fields.push('exclude_total=?'); values.push(body.excludeTotal ? 1 : 0); }
    if (body.itemType !== undefined) { 
      fields.push('item_type=?'); 
      const validTypes = ['normal', 'debt', 'installment'];
      values.push(validTypes.includes(body.itemType) ? body.itemType : 'normal'); 
    }
    if (body.repaymentDay !== undefined) { fields.push('repayment_day=?'); values.push(body.repaymentDay || null); }
    if (body.paymentAccountId !== undefined) { fields.push('payment_account_id=?'); values.push(body.paymentAccountId || null); }
    if (body.repaymentMode !== undefined) {
      fields.push('repayment_mode=?');
      const validModes = ['auto', 'manual'];
      values.push(validModes.includes(body.repaymentMode) ? body.repaymentMode : 'auto');
    }
    if (fields.length === 0) return res.json({ success: true });
    values.push(id);
    await pool.execute(`UPDATE deposit_items SET ${fields.join(', ')} WHERE id=?`, values);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/deposits/:id', async (req, res) => {
  try {
    const { id } = req.params;
    await pool.execute('DELETE FROM deposit_items WHERE id=?', [id]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/deposits/:id/move', async (req, res) => {
  try {
    const { id } = req.params;
    const { groupName, sortOrder } = req.body;
    await pool.execute(
      'UPDATE deposit_items SET group_name=?, sort_order=? WHERE id=?',
      [groupName, sortOrder || 0, id]
    );
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 上传图标
app.post('/api/deposits/upload-icon', (req, res) => {
  upload.single('icon')(req, res, (err) => {
    if (err) {
      console.error('上传图标错误:', err);
      return res.status(400).json({ error: err.message || '上传失败' });
    }
    if (!req.file) return res.status(400).json({ error: '未上传文件' });
    let filename = req.file.filename;
    if (req.body.name) {
      const ext = path.extname(req.file.originalname);
      const safeName = req.body.name.replace(/[\\/:*?"<>|]/g, '_');
      const newName = safeName + '-' + Date.now() + ext;
      const newPath = path.join(tenantUploadDir('icons'), newName);
      try {
        fs.renameSync(req.file.path, newPath);
        filename = newName;
      } catch (e) {
        console.error('重命名文件失败:', e);
        return res.status(500).json({ error: '保存文件失败' });
      }
    }
    res.json({ iconPath: 'uploads/icons/' + filename });
  });
});

// 列出已有图标
app.get('/api/deposits/icons', (req, res) => {
  try {
    const files = fs.readdirSync(tenantUploadDir('icons'));
    const icons = files
      .filter(f => /\.(png|jpg|jpeg|gif|webp|svg|ico)$/i.test(f))
      .map(f => ({ name: f, path: 'uploads/icons/' + f }));
    res.json(icons);
  } catch (err) {
    res.json([]);
  }
});

// AI 生成图标
app.post('/api/deposits/generate-icon', async (req, res) => {
  try {
    const { prompt, title } = req.body;
    let finalPrompt = (prompt || '').trim();
    
    if (!finalPrompt && title) {
      finalPrompt = `扁平可爱动画图标，${title}，圆角造型，圆润软乎乎轮廓，低饱和度马卡龙配色，柔和渐变，细腻柔和阴影，极简干净背景，卡通Q版质感，2D矢量插画，高细节，干净线条，治愈童趣，柔和柔光，无多余杂物，UI图标，高清，禁止尖锐棱角，禁止深色暗沉色调，禁止写实照片质感，禁止复杂杂乱背景，禁止粗糙噪点，禁止立体厚重浮雕，禁止暗黑风格`;
    }
    
    if (!finalPrompt) {
      return res.status(400).json({ error: '请提供提示词或存款项标题' });
    }
    
    const apiKey = await getUserSecret('glm_api_key');
    if (!apiKey) {
      return res.status(400).json({ error: '未配置智谱 API Key，请在 AI 设置中配置' });
    }

    const response = await fetch('https://open.bigmodel.cn/api/paas/v4/images/generations', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: 'cogview-3-flash',
        prompt: finalPrompt,
        size: '1024x1024',
        quality: 'standard',
        watermark_enabled: true
      }),
      signal: AbortSignal.timeout(180000)
    });
    
    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`AI Image API 请求失败 (${response.status}): ${errText}`);
    }
    
    const data = await response.json();
    const imageUrl = data.data?.[0]?.url;
    
    if (!imageUrl) {
      return res.status(500).json({ error: 'AI 未返回图像URL' });
    }
    
    // 只返回URL，不保存到本地（用户确认使用后才保存）
    res.json({ iconUrl: imageUrl, prompt: finalPrompt });
  } catch (err) {
    console.error('AI生成图标失败:', err);
    res.status(500).json({ error: '生成失败: ' + err.message });
  }
});

// 保存AI生成的图标到本地
app.post('/api/deposits/save-icon', async (req, res) => {
  try {
    const { imageUrl, title } = req.body;
    if (!imageUrl) return res.status(400).json({ error: '缺少图片URL' });

    const imgRes = await fetch(imageUrl, { signal: AbortSignal.timeout(30000) });
    if (!imgRes.ok) throw new Error(`下载图片失败 (${imgRes.status})`);

    const buf = Buffer.from(await imgRes.arrayBuffer());
    const safeName = (title || 'ai-icon').replace(/[\\/:*?"<>|]/g, '_').substring(0, 30);
    const filename = safeName + '-' + Date.now() + '.png';
    const filePath = path.join(tenantUploadDir('icons'), filename);
    fs.writeFileSync(filePath, buf);

    const localPath = 'uploads/icons/' + filename;
    console.log('AI图标已保存到本地:', localPath);
    res.json({ iconPath: localPath });
  } catch (err) {
    console.error('保存AI图标失败:', err);
    res.status(500).json({ error: '保存失败: ' + err.message });
  }
});

// ========== 存款资金明细 API ==========

// 获取某存款项的资金明细
app.get('/api/deposits/:id/transactions', async (req, res) => {
  try {
    const [rows] = await pool.query(
      'SELECT * FROM deposit_transactions WHERE deposit_item_id = ? ORDER BY created_at DESC',
      [req.params.id]
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 修改存款余额（支持三种模式）
app.post('/api/deposits/:id/transactions', async (req, res) => {
  try {
    const { mode, amount, note } = req.body; // mode: 'add'|'deduct'|'set'|'init'
    const depositId = req.params.id;
    const now = Date.now();

    // 获取当前余额
    const [items] = await pool.query('SELECT id, amount FROM deposit_items WHERE id = ?', [depositId]);
    if (items.length === 0) return res.status(404).json({ error: '存款项不存在' });
    const currentBalance = parseFloat(items[0].amount);
    const numAmount = parseFloat(amount) || 0;

    let newBalance, type, txAmount;

    if (mode === 'add') {
      newBalance = currentBalance + numAmount;
      type = 'add';
      txAmount = numAmount;
    } else if (mode === 'deduct') {
      newBalance = currentBalance - numAmount;
      type = 'deduct';
      txAmount = -numAmount;
    } else if (mode === 'set') {
      // 差额补记：记录差额
      const diff = numAmount - currentBalance;
      type = diff >= 0 ? 'add' : 'deduct';
      txAmount = diff;
      newBalance = numAmount;
    } else if (mode === 'init') {
      newBalance = numAmount;
      type = 'init';
      txAmount = numAmount;
    } else {
      return res.status(400).json({ error: '无效模式' });
    }

    // 更新余额
    await pool.execute('UPDATE deposit_items SET amount = ? WHERE id = ?', [newBalance, depositId]);

    // 记录交易
    const txId = genId();
    await pool.execute(
      'INSERT INTO deposit_transactions (id, deposit_item_id, type, amount, balance_before, balance_after, note, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
      [txId, depositId, type, txAmount, currentBalance, newBalance, note || '', now]
    );

    res.json({ id: txId, balanceBefore: currentBalance, balanceAfter: newBalance, type, amount: txAmount });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 手动还款（普通欠款类型，从绑定账户扣款并减少负债）
app.post('/api/deposits/:id/repay', async (req, res) => {
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const { amount, note } = req.body;
    const debtId = req.params.id;
    const now = Date.now();
    const repayAmount = parseFloat(amount) || 0;
    if (repayAmount <= 0) {
      await connection.rollback();
      return res.status(400).json({ error: '还款金额必须大于0' });
    }
    const [debtItems] = await connection.query('SELECT id, name, amount, payment_account_id, item_type FROM deposit_items WHERE id = ? FOR UPDATE', [debtId]);
    if (debtItems.length === 0) {
      await connection.rollback();
      return res.status(404).json({ error: '欠款项不存在' });
    }
    const debt = debtItems[0];
    if (debt.item_type !== 'debt') {
      await connection.rollback();
      return res.status(400).json({ error: '仅普通欠款支持手动还款' });
    }
    const currentDebt = parseFloat(debt.amount);
    if (currentDebt >= 0) {
      await connection.rollback();
      return res.status(400).json({ error: '无待还欠款' });
    }
    const actualRepay = Math.min(repayAmount, Math.abs(currentDebt));
    const newDebtAmount = currentDebt + actualRepay;
    const accountId = debt.payment_account_id;
    if (!accountId) {
      await connection.rollback();
      return res.status(400).json({ error: '未绑定还款账户' });
    }
    const [accounts] = await connection.query('SELECT id, name, amount FROM deposit_items WHERE id = ? FOR UPDATE', [accountId]);
    if (accounts.length === 0) {
      await connection.rollback();
      return res.status(404).json({ error: '还款账户不存在' });
    }
    const account = accounts[0];
    const accountBefore = parseFloat(account.amount);
    // 不校验余额，允许账户计负
    const newAccountBalance = accountBefore - actualRepay;
    await connection.execute('UPDATE deposit_items SET amount = ? WHERE id = ?', [newAccountBalance, accountId]);
    await connection.execute(
      'INSERT INTO deposit_transactions (id, deposit_item_id, type, amount, balance_before, balance_after, note, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
      [genId(), accountId, 'deduct', -actualRepay, accountBefore, newAccountBalance, note || `还款-${debt.name}`, now]
    );
    await connection.execute('UPDATE deposit_items SET amount = ? WHERE id = ?', [newDebtAmount, debtId]);
    await connection.execute(
      'INSERT INTO deposit_transactions (id, deposit_item_id, type, amount, balance_before, balance_after, note, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
      [genId(), debtId, 'add', actualRepay, currentDebt, newDebtAmount, note || '手动还款', now]
    );
    await connection.commit();
    res.json({
      success: true,
      repaidAmount: actualRepay,
      debtBefore: currentDebt,
      debtAfter: newDebtAmount,
      accountBefore,
      accountAfter: newAccountBalance
    });
  } catch (err) {
    await connection.rollback();
    res.status(500).json({ error: err.message });
  } finally {
    connection.release();
  }
});

// ========== 分期还款 API ==========

// 自动处理到期账单（在加载存款时调用）
async function autoPayBills() {
  const today = new Date().toISOString().slice(0, 10);
  const todayDay = new Date().getDate();
  const now = Date.now();
  // 查找所有到期未付账单
  const [bills] = await pool.query(
    `SELECT b.id as bill_id, b.plan_id, b.period, b.total as bill_total,
            p.payment_account_id, p.deposit_item_id, d.name as item_name
     FROM installment_bills b
     JOIN installment_plans p ON b.plan_id = p.id
     JOIN deposit_items d ON p.deposit_item_id = d.id
     WHERE b.status = 'pending' AND b.due_date <= ?`, [today]
  );
  for (const bill of bills) {
    // 标记为已付
    await pool.execute(
      'UPDATE installment_bills SET status = ?, paid_at = ? WHERE id = ?',
      ['paid', now, bill.bill_id]
    );
    // 从付款账户扣款
    if (bill.payment_account_id) {
      const [accts] = await pool.query('SELECT amount FROM deposit_items WHERE id = ?', [bill.payment_account_id]);
      if (accts.length > 0) {
        const acctBefore = parseFloat(accts[0].amount);
        const acctAfter = acctBefore - bill.bill_total;
        await pool.execute(
          'UPDATE deposit_items SET amount = ? WHERE id = ?',
          [acctAfter, bill.payment_account_id]
        );
        // 付款账户扣款记录
        await pool.execute(
          'INSERT INTO deposit_transactions (id, deposit_item_id, type, amount, balance_before, balance_after, note, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
          [genId(), bill.payment_account_id, 'deduct', -bill.bill_total, acctBefore, acctAfter, `分期还款（${bill.item_name}）-第${bill.period}期`, now]
        );
      }
    }
    // 还款入账记录（存款项本身）
    const [items] = await pool.query('SELECT amount FROM deposit_items WHERE id = ?', [bill.deposit_item_id]);
    if (items.length > 0) {
      const itemBefore = parseFloat(items[0].amount);
      const remaining = await syncInstallmentRemainingAmount(pool, bill.deposit_item_id, bill.plan_id);
      const itemAfter = -remaining;
      await pool.execute(
        'INSERT INTO deposit_transactions (id, deposit_item_id, type, amount, balance_before, balance_after, note, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
        [genId(), bill.deposit_item_id, 'add', bill.bill_total, itemBefore, itemAfter, `分期还款-第${bill.period}期`, now]
      );
    }
  }
  
  // 2. 处理普通欠债自动还款（花呗、美团月付等，仅 debt 类型且 repayment_mode=auto）
  const [depositItems] = await pool.query(
    "SELECT id, name, amount, payment_account_id FROM deposit_items WHERE item_type = 'debt' AND repayment_mode = 'auto' AND repayment_day = ? AND payment_account_id IS NOT NULL AND payment_account_id != ''",
    [todayDay]
  );
  
  for (const item of depositItems) {
    const currentBalance = parseFloat(item.amount);
    if (currentBalance >= 0) continue;
    
    const repayAmount = Math.abs(currentBalance);
    
    // 检查今天是否已自动还款过
    const [existing] = await pool.query(
      "SELECT id FROM deposit_transactions WHERE deposit_item_id = ? AND note = '自动还款' AND created_at > ?",
      [item.id, new Date(today).getTime()]
    );
    if (existing.length > 0) continue;
    
    // 从付款账户扣款
    const [accounts] = await pool.query('SELECT id, amount FROM deposit_items WHERE id = ?', [item.payment_account_id]);
    if (accounts.length === 0) continue;
    const accountBalance = parseFloat(accounts[0].amount);
    
    const newAccountBalance = accountBalance - repayAmount;
    await pool.execute('UPDATE deposit_items SET amount = ? WHERE id = ?', [newAccountBalance, item.payment_account_id]);
    const txId1 = genId();
    await pool.execute(
      'INSERT INTO deposit_transactions (id, deposit_item_id, type, amount, balance_before, balance_after, note, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
      [txId1, item.payment_account_id, 'deduct', -repayAmount, accountBalance, newAccountBalance, `自动还款-${item.name}`, now]
    );
    
    // 清零负债项
    await pool.execute('UPDATE deposit_items SET amount = 0 WHERE id = ?', [item.id]);
    const txId2 = genId();
    await pool.execute(
      'INSERT INTO deposit_transactions (id, deposit_item_id, type, amount, balance_before, balance_after, note, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
      [txId2, item.id, 'add', repayAmount, currentBalance, 0, '自动还款', now]
    );
  }
  
  return bills.length + depositItems.length;
}

// 获取某存款项的分期计划
app.get('/api/installments/:depositItemId', async (req, res) => {
  try {
    const [rows] = await pool.query(
      'SELECT * FROM installment_plans WHERE deposit_item_id = ?',
      [req.params.depositItemId]
    );
    if (rows.length === 0) return res.json(null);
    const plan = rows[0];
    plan.total_principal = parseFloat(plan.total_principal);
    plan.total_interest = parseFloat(plan.total_interest);
    res.json(plan);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

function validateInstallmentPayload(body) {
  const totalPrincipal = Number(body.totalPrincipal);
  const totalInterest = Number(body.totalInterest || 0);
  const installments = Number.parseInt(body.installments, 10);
  const monthlyDay = Number.parseInt(body.monthlyDay, 10);
  const startDate = String(body.startDate || '');
  if (!Number.isFinite(totalPrincipal) || totalPrincipal <= 0) throw new Error('总金额必须大于 0');
  if (!Number.isFinite(totalInterest) || totalInterest < 0) throw new Error('总利息不能小于 0');
  if (!Number.isInteger(installments) || installments < 1 || installments > 360) throw new Error('分期数必须在 1 到 360 之间');
  if (!Number.isInteger(monthlyDay) || monthlyDay < 1 || monthlyDay > 28) throw new Error('每月还款日必须在 1 到 28 之间');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(startDate)) throw new Error('请选择有效的开始日期');
  return { totalPrincipal, totalInterest, installments, monthlyDay, startDate, paymentAccountId: body.paymentAccountId || '' };
}

function buildInstallmentSchedule(plan) {
  const perPrincipal = Math.floor((plan.totalPrincipal / plan.installments) * 100) / 100;
  const perInterest = Math.floor((plan.totalInterest / plan.installments) * 100) / 100;
  const lastPrincipal = Math.round((plan.totalPrincipal - perPrincipal * (plan.installments - 1)) * 100) / 100;
  const lastInterest = Math.round((plan.totalInterest - perInterest * (plan.installments - 1)) * 100) / 100;
  const [startYear, startMonth, startDay] = plan.startDate.split('-').map(Number);
  let firstMonth = startMonth;
  let firstYear = startYear;
  if (startDay > plan.monthlyDay) {
    firstMonth++;
    if (firstMonth > 12) { firstMonth = 1; firstYear++; }
  }
  return Array.from({ length: plan.installments }, (_, index) => {
    let month = firstMonth + index;
    let year = firstYear;
    while (month > 12) { month -= 12; year++; }
    const day = Math.min(plan.monthlyDay, new Date(year, month, 0).getDate());
    const dueDate = year + '-' + String(month).padStart(2, '0') + '-' + String(day).padStart(2, '0');
    const isLast = index === plan.installments - 1;
    const principal = isLast ? lastPrincipal : perPrincipal;
    const interest = isLast ? lastInterest : perInterest;
    return { period: index + 1, dueDate, principal, interest, total: Math.round((principal + interest) * 100) / 100 };
  });
}

async function insertInstallmentBills(connection, planId, plan, paidBills = new Map()) {
  for (const bill of buildInstallmentSchedule(plan)) {
    const previousPaid = paidBills.get(bill.dueDate);
    await connection.execute(
      `INSERT INTO installment_bills (id, plan_id, period, due_date, principal, interest, total, status, paid_at, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [genId(), planId, bill.period, bill.dueDate, bill.principal, bill.interest, bill.total, previousPaid ? 'paid' : 'pending', previousPaid?.paid_at || 0, Date.now()]
    );
  }
}

async function syncInstallmentRemainingAmount(connection, depositItemId, planId) {
  const [rows] = await connection.query("SELECT COALESCE(SUM(total), 0) AS remaining FROM installment_bills WHERE plan_id = ? AND status = 'pending'", [planId]);
  const remaining = Math.round(parseFloat(rows[0]?.remaining || 0) * 100) / 100;
  await connection.execute("UPDATE deposit_items SET item_type = 'installment', amount = ? WHERE id = ?", [-remaining, depositItemId]);
  return remaining;
}

async function reconcileInstallmentSchedules() {
  const [plans] = await pool.query('SELECT * FROM installment_plans');
  for (const row of plans) {
    const plan = { totalPrincipal: parseFloat(row.total_principal), totalInterest: parseFloat(row.total_interest), installments: Number(row.installments), monthlyDay: Number(row.monthly_day), startDate: row.start_date };
    const expected = buildInstallmentSchedule(plan);
    const [current] = await pool.query('SELECT period, due_date, status, paid_at FROM installment_bills WHERE plan_id = ? ORDER BY period', [row.id]);
    const changed = current.length !== expected.length || expected.some((bill, index) => current[index]?.due_date !== bill.dueDate);
    const connection = await pool.getConnection();
    try {
      await connection.beginTransaction();
      if (changed) {
        const paidByDueDate = new Map(current.filter(bill => bill.status === 'paid').map(bill => [bill.due_date, bill]));
        await connection.execute('DELETE FROM installment_bills WHERE plan_id = ?', [row.id]);
        await insertInstallmentBills(connection, row.id, plan, paidByDueDate);
        console.log('Installment schedule repaired: ' + row.deposit_item_id);
      }
      await syncInstallmentRemainingAmount(connection, row.deposit_item_id, row.id);
      await connection.commit();
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally { connection.release(); }
  }
}

app.post('/api/installments', async (req, res) => {
  const connection = await pool.getConnection();
  try {
    const depositItemId = String(req.body.depositItemId || '');
    const plan = validateInstallmentPayload(req.body);
    if (!depositItemId) return res.status(400).json({ error: '缺少存款项 ID' });

    await connection.beginTransaction();
    const [items] = await connection.query('SELECT id FROM deposit_items WHERE id = ? FOR UPDATE', [depositItemId]);
    if (items.length === 0) {
      await connection.rollback();
      return res.status(404).json({ error: '存款项不存在' });
    }
    const [existing] = await connection.query('SELECT id FROM installment_plans WHERE deposit_item_id = ?', [depositItemId]);
    if (existing.length > 0) {
      await connection.rollback();
      return res.status(409).json({ error: '该存款项已存在分期计划' });
    }

    const planId = genId();
    await connection.execute(
      `INSERT INTO installment_plans (id, deposit_item_id, total_principal, total_interest, installments, monthly_day, start_date, payment_account_id, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [planId, depositItemId, plan.totalPrincipal, plan.totalInterest, plan.installments, plan.monthlyDay, plan.startDate, plan.paymentAccountId, Date.now()]
    );
    await insertInstallmentBills(connection, planId, plan);
    await syncInstallmentRemainingAmount(connection, depositItemId, planId);
    await connection.commit();
    res.json({ id: planId });
  } catch (err) {
    await connection.rollback();
    res.status(400).json({ error: err.message });
  } finally {
    connection.release();
  }
});

// 更新分期计划
app.put('/api/installments/:id', async (req, res) => {
  const connection = await pool.getConnection();
  try {
    const { id } = req.params;
    const plan = validateInstallmentPayload(req.body);
    await connection.beginTransaction();

    const [plans] = await connection.query('SELECT deposit_item_id FROM installment_plans WHERE id = ? FOR UPDATE', [id]);
    if (plans.length === 0) {
      await connection.rollback();
      return res.status(404).json({ error: '分期计划不存在' });
    }
    const [oldBills] = await connection.query("SELECT period, due_date, paid_at FROM installment_bills WHERE plan_id = ? AND status = 'paid'", [id]);
    const paidBills = new Map(oldBills.map(bill => [bill.due_date, bill]));

    await connection.execute('DELETE FROM installment_bills WHERE plan_id = ?', [id]);
    await connection.execute(
      `UPDATE installment_plans SET total_principal=?, total_interest=?, installments=?, monthly_day=?, start_date=?, payment_account_id=? WHERE id=?`,
      [plan.totalPrincipal, plan.totalInterest, plan.installments, plan.monthlyDay, plan.startDate, plan.paymentAccountId, id]
    );
    await insertInstallmentBills(connection, id, plan, paidBills);
    await syncInstallmentRemainingAmount(connection, plans[0].deposit_item_id, id);
    await connection.commit();
    res.json({ success: true });
  } catch (err) {
    await connection.rollback();
    res.status(400).json({ error: err.message });
  } finally {
    connection.release();
  }
});
// 删除分期计划
app.delete('/api/installments/:id', async (req, res) => {
  try {
    const { id } = req.params;
    await pool.execute('DELETE FROM installment_bills WHERE plan_id = ?', [id]);
    await pool.execute('DELETE FROM installment_plans WHERE id = ?', [id]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 获取账单列表
app.get('/api/installments/:planId/bills', async (req, res) => {
  try {
    const [rows] = await pool.query(
      'SELECT * FROM installment_bills WHERE plan_id = ? ORDER BY period',
      [req.params.planId]
    );
    res.json(rows.map(r => ({
      id: r.id,
      planId: r.plan_id,
      period: r.period,
      dueDate: r.due_date,
      principal: parseFloat(r.principal),
      interest: parseFloat(r.interest),
      total: parseFloat(r.total),
      status: r.status,
      paidAt: r.paid_at
    })));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 手动标记账单为已付
app.put('/api/installments/bills/:id/pay', async (req, res) => {
  const connection = await pool.getConnection();
  try {
    const { id } = req.params;
    const now = Date.now();
    await connection.beginTransaction();
    const [bills] = await connection.query(
      `SELECT b.id, b.plan_id, b.period, b.total, b.status, p.payment_account_id, p.deposit_item_id, d.name AS item_name
       FROM installment_bills b JOIN installment_plans p ON b.plan_id = p.id JOIN deposit_items d ON p.deposit_item_id = d.id
       WHERE b.id = ? FOR UPDATE`, [id]
    );
    if (bills.length === 0) { await connection.rollback(); return res.status(404).json({ error: '\u8d26\u5355\u4e0d\u5b58\u5728' }); }
    const bill = bills[0];
    if (bill.status === 'paid') { await connection.rollback(); return res.json({ success: true, alreadyPaid: true }); }
    await connection.execute('UPDATE installment_bills SET status = ?, paid_at = ? WHERE id = ?', ['paid', now, id]);
    if (bill.payment_account_id) {
      const [accounts] = await connection.query('SELECT amount FROM deposit_items WHERE id = ? FOR UPDATE', [bill.payment_account_id]);
      if (accounts.length > 0) {
        const accountBefore = parseFloat(accounts[0].amount);
        const accountAfter = accountBefore - parseFloat(bill.total);
        await connection.execute('UPDATE deposit_items SET amount = ? WHERE id = ?', [accountAfter, bill.payment_account_id]);
        await connection.execute('INSERT INTO deposit_transactions (id, deposit_item_id, type, amount, balance_before, balance_after, note, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)', [genId(), bill.payment_account_id, 'deduct', -parseFloat(bill.total), accountBefore, accountAfter, `\u5206\u671f\u8fd8\u6b3e（${bill.item_name}）-\u7b2c${bill.period}\u671f`, now]);
      }
    }
    const [items] = await connection.query('SELECT amount FROM deposit_items WHERE id = ? FOR UPDATE', [bill.deposit_item_id]);
    const itemBefore = parseFloat(items[0]?.amount || 0);
    const remaining = await syncInstallmentRemainingAmount(connection, bill.deposit_item_id, bill.plan_id);
    await connection.execute('INSERT INTO deposit_transactions (id, deposit_item_id, type, amount, balance_before, balance_after, note, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)', [genId(), bill.deposit_item_id, 'add', parseFloat(bill.total), itemBefore, -remaining, `\u5206\u671f\u8fd8\u6b3e-\u7b2c${bill.period}\u671f`, now]);
    await connection.commit();
    res.json({ success: true, remaining });
  } catch (err) {
    await connection.rollback();
    res.status(500).json({ error: err.message });
  } finally { connection.release(); }
});

// ========== 消息分类/过滤工具（顶层，供各接口使用）==========

// 消息智能过滤：判断是否为营销类消息（返回 true 表示应过滤掉）
function isMarketingMessage(text) {
  if (!text || typeof text !== 'string') return true;
  const t = text.replace(/\s+/g, '');

  const marketingKeywords = [
    '办一个', '518元', '2980元', '合作后', '加入前', '加入后',
    '报喜', '学员', '回放课', '直播回放', '领取福利', '尾声福利',
    '办理链接', '优惠券', '新客户特惠', '官方指导价',
    '回复【', '回【', '回复8', '回复1', '回复2', '回复6',
    '少走很多弯路', '大胆尝试一次', '被套亏损严重',
    '特惠', '办一个试试', '试试吧', '也不贵',
    '给您申请', '课程', '教学软件',
  ];
  const marketKeywords = [
    '放量', '反弹', '量能', '涨停', '跌停', '板块', '科技股', '消费',
    '仓位', '短线', '超短', '快进快出', '行情', '大盘', '走势', '趋势',
    '支撑', '压力', '均线', 'K线', 'MACD', '布林', '创业板', '科创板',
    '沪深', '上证', '深证', '北证', '熔断', '跌停板', '涨停板',
    '主力', '资金流入', '资金流出', '北向资金', '融资融券',
    '洗盘', '出货', '吸筹', '拉升', '打压', '诱多', '诱空',
    '突破', '回踩', '企稳', '调整', '震荡', '反包', '打板',
    '早盘', '尾盘', '集合竞价', '盘后', '盘中',
    '牛市', '熊市', '猴市', '结构性行情',
  ];

  let score = 0;
  for (const kw of marketingKeywords) {
    if (t.includes(kw)) score -= 2;
  }
  for (const kw of marketKeywords) {
    if (t.includes(kw)) score += 3;
  }
  const stockCount = (t.match(/\d{6}/g) || []).length;
  if (stockCount > 0) score += 1;

  const hasTestimonial = t.includes('案例为个别客户') || t.includes('历史收益') || t.includes('历史特定时间');
  if (hasTestimonial && score < 3) return true;

  return score < 0;
}

// ========== 系统分类规则缓存 ==========
let _systemRulesCache = null;
let _systemRulesCacheTime = 0;
const SYSTEM_RULES_CACHE_TTL = 30000; // 30秒缓存
let _learnedRulesCache = null;
let _learnedRulesCacheTime = 0;
let _feedbackExamplesCache = null;
let _feedbackExamplesCacheTime = 0;
let _categoryRulesSnapshotCache = null;
let _categoryRulesSnapshotCacheTime = 0;
const LEARNING_CACHE_TTL = 60000;

async function loadSystemRules() {
  const now = Date.now();
  if (_systemRulesCache && now - _systemRulesCacheTime < SYSTEM_RULES_CACHE_TTL) {
    return _systemRulesCache;
  }
  try {
    const [rows] = await pool.query('SELECT * FROM wechat_category_system_rules WHERE enabled = 1');
    _systemRulesCache = rows;
    _systemRulesCacheTime = now;
    return rows;
  } catch (e) {
    return [];
  }
}

function invalidateSystemRulesCache() {
  _systemRulesCache = null;
  _systemRulesCacheTime = 0;
  _categoryRulesSnapshotCache = null;
  _categoryRulesSnapshotCacheTime = 0;
}

function invalidateLearningCaches() {
  _learnedRulesCache = null;
  _learnedRulesCacheTime = 0;
  _feedbackExamplesCache = null;
  _feedbackExamplesCacheTime = 0;
  _categoryRulesSnapshotCache = null;
  _categoryRulesSnapshotCacheTime = 0;
  _learnedRulesCountCache = null;
  _learnedRulesCountCacheTime = 0;
}

// 清理无效学习规则：删除噪音规则、截断极端权重
// 改为按新增条数触发，不再使用5分钟轮询
let _rulesAddedSinceCleanup = 0;
let _totalCleanedRules = 0;  // 累计清理规则数（启动时从 ai_settings 加载）
const CLEANUP_THRESHOLD = 20; // 每新增20条规则触发一次清理
async function cleanupLearnedRules(force = false) {
  if (!force) {
    _rulesAddedSinceCleanup++;
    if (_rulesAddedSinceCleanup < CLEANUP_THRESHOLD) return;
    _rulesAddedSinceCleanup = 0;
  }
  try {
    // 1. 删除 correct_count=0 AND wrong_count>3 的规则（从未正确过且连续错了3次以上）
    const [delNoise] = await pool.execute(
      'DELETE FROM wechat_category_rules WHERE correct_count = 0 AND wrong_count > 3'
    );
    // 2. 删除正确率 < 20% 且总样本 >= 5 的规则（比瞎猜还差）
    const [delBad] = await pool.execute(
      'DELETE FROM wechat_category_rules WHERE (correct_count + wrong_count) >= 5 AND correct_count * 5 < (correct_count + wrong_count)'
    );
    // 3. 删除 total=0 的空壳规则（从未被反馈过）
    const [delEmpty] = await pool.execute(
      'DELETE FROM wechat_category_rules WHERE (correct_count + wrong_count) = 0 AND created_at < DATE_SUB(NOW(), INTERVAL 7 DAY)'
    );
    // 4. 截断权重到 ±10，避免极端值绑架判断
    const [capWeights] = await pool.execute(
      'UPDATE wechat_category_rules SET weight = 10 WHERE weight > 10'
    );
    const [capWeightsNeg] = await pool.execute(
      'UPDATE wechat_category_rules SET weight = -10 WHERE weight < -10'
    );
    const totalDeleted = (delNoise.affectedRows || 0) + (delBad.affectedRows || 0) + (delEmpty.affectedRows || 0);
    const totalCapped = (capWeights.affectedRows || 0) + (capWeightsNeg.affectedRows || 0);
    if (totalDeleted > 0 || totalCapped > 0) {
      _totalCleanedRules += totalDeleted;
      // 持久化累计值到 ai_settings，防止 server 重启丢失
      await pool.execute(
        'INSERT INTO ai_settings (setting_key, setting_value, updated_at) VALUES (?, ?, ?) ON DUPLICATE KEY UPDATE setting_value = ?, updated_at = ?',
        ['total_cleaned_rules', String(_totalCleanedRules), Date.now(), String(_totalCleanedRules), Date.now()]
      ).catch(() => {});
      console.log(`[规则清理] 删除 ${totalDeleted} 条无效规则（噪音${delNoise.affectedRows||0} / 低正确率${delBad.affectedRows||0} / 空壳${delEmpty.affectedRows||0}），截断 ${totalCapped} 条极端权重（累计清理 ${_totalCleanedRules} 条）`);
      invalidateLearningCaches();
    }
  } catch (e) {
    console.error('[规则清理] 失败:', e.message);
  }
}

async function loadLearnedRules() {
  const now = Date.now();
  if (_learnedRulesCache && now - _learnedRulesCacheTime < LEARNING_CACHE_TTL) return _learnedRulesCache;
  const [rows] = await pool.query(
    'SELECT id, category, keyword, weight, correct_count, wrong_count, created_at, updated_at FROM wechat_category_rules ORDER BY category, weight DESC'
  );
  _learnedRulesCache = rows;
  _learnedRulesCacheTime = now;
  return rows;
}

// 学习进度因子缓存
let _learnedRulesCountCache = null;
let _learnedRulesCountCacheTime = 0;
const LEARNED_RULES_COUNT_TTL = 60000;

// 获取学习进度因子（0~1）：学习规则越多，自动分类权重越低
// 0条规则 = 0（不减权），10条以上 = 1（最大减权）
async function getLearningProgressFactor() {
  const now = Date.now();
  if (_learnedRulesCountCache !== null && now - _learnedRulesCountCacheTime < LEARNED_RULES_COUNT_TTL) {
    return _learnedRulesCountCache;
  }
  try {
    const [rows] = await pool.query('SELECT COUNT(*) as cnt FROM wechat_category_rules');
    const count = rows[0]?.cnt || 0;
    // 0~10条规则线性映射到0~1
    const factor = Math.min(1, count / 10);
    _learnedRulesCountCache = factor;
    _learnedRulesCountCacheTime = now;
    return factor;
  } catch (e) {
    return 0;
  }
}

// 硬编码分类模式（当系统规则不可用时作为兜底）
// 强营销信号（几乎只出现在营销消息里）
const HARDCODED_MARKETING_STRONG = [
  /元\/(月|年|个月|季度|周期)/,
  /\d{3,4}元/,
  /添加|加微信|添加微信|扫码|二维码/,
  /名额|限量|限时|优惠|折扣|涨价/,
  /回复.*数字|回复\[\d+\]/,
  /新客户特惠|官方指导价|领取福利/,
];

// 弱营销信号（行情复盘、推票消息也可能包含，不能单独作为分类依据）
const HARDCODED_MARKETING_WEAK = [
  /合作|加入|办一个|办理|会员|服务/,
  /老师|投顾|助理|客服|顾问/,
];

// 免责声明 / 风险提示：财经内容标配，极弱信号，不能作为营销依据
const HARDCODED_MARKETING_DISCLAIMER = [
  /不是荐股|不构成投资建议|仅供.*参考/,
  /投资有风险.*入市须谨慎|入市有风险/,
];

const HARDCODED_MARKETING_KEYWORDS_STRONG = [
  '办一个', '518元', '2980元', '课程', '学员', '直播回放',
  '操作建议', '仅供参考',
];

const HARDCODED_MARKETING_KEYWORDS_WEAK = [
  '风险提示', '不构成', '投资建议',
];

const HARDCODED_NEWS_PATTERNS = [
  /大盘|走势|趋势|板块|行情|市场|指数|沪指|深成指|创业板指/,
  /放量|反弹|回调|震荡|调整|突破|回踩|企稳|反包/,
  /资金流入|资金流出|北向资金|融资融券|主力|机构/,
  /早盘|尾盘|盘后|盘中|集合竞价/,
  /牛股|妖股|龙头|热点|题材|概念/,
];

// === A股股票代码有效性验证 ===
// 编码规律：
//   600/601/603/605 沪主板(10%) | 68x 科创板(20%) | 900 沪B股
//   000/001/002 深主板(10%)   | 30x 创业板(20%)
//   8xx/92x 北交所(30%)
//   11/12 开头：可转债
//   730/780/787 等：新股申购代码（需排除）
//   5/15/16 开头：基金/REITs（需排除）
//
// strict 模式说明：
//   strict=false (默认) — 宽泛匹配：普通股 + 可转债 + B股 + 北交所
//   strict=true        — 严格匹配：只算A股普通股，排除可转债/B股/基金/申购代码
function isValidStockCode(code, strict = false) {
  if (!code || typeof code !== 'string') return false;
  const c = code.trim();
  if (!/^\d{6}$/.test(c)) return false;
  const prefix3 = c.slice(0, 3);
  const prefix2 = c.slice(0, 2);
  const prefix1 = c.slice(0, 1);

  // 先排除新股申购代码（7开头）
  if (isSubscriptionCode(c)) return false;

  // 排除基金代码（5/15/16开头等）
  if (prefix1 === '5') return false;
  if (prefix2 === '15' || prefix2 === '16') return false;

  // 沪市主板
  if (['600', '601', '603', '605'].includes(prefix3)) return true;
  // 科创板
  if (prefix2 === '68') return true;

  // 深市主板/原中小板
  if (['000', '001', '002'].includes(prefix3)) return true;
  // 创业板
  if (prefix2 === '30') return true;

  // 北交所（8开头、92开头）
  if (prefix2 === '92' || prefix1 === '8') return true;

  // 沪B股 — 严格模式排除
  if (prefix3 === '900') return !strict;

  // 可转债 — 严格模式排除
  if (prefix2 === '11' || prefix2 === '12') return !strict;

  return false;
}

// 判断是否为新股申购代码（7开头）
function isSubscriptionCode(code) {
  if (!code || typeof code !== 'string') return false;
  const c = code.trim();
  if (!/^\d{6}$/.test(c)) return false;
  const prefix1 = c.slice(0, 1);
  return prefix1 === '7'; // 所有7开头都视为申购/配号类代码
}

// 从文本中提取所有符合A股编码规律的6位股票代码
function extractValidStockCodes(text, strict = false) {
  if (!text || typeof text !== 'string') return [];
  const codes = new Set();
  const matches = text.match(/(?:^|[^\d])(\d{6})(?:$|[^\d])/g) || [];
  for (const m of matches) {
    const code = m.replace(/[^\d]/g, '');
    if (isValidStockCode(code, strict)) codes.add(code);
  }
  return [...codes];
}

// 基于系统规则的分类函数（替代旧的硬编码 MARKETING_PATTERNS）
async function categorizeMessage(text, stocksJson) {
  try {
    if (!text || typeof text !== 'string' || !text.trim()) return 'market_news';
    const cleanText = text.replace(/\s+/g, '');
    let rules = [];
    try {
      rules = await loadSystemRules();
    } catch (e) {
      console.warn('[分类] 加载系统规则失败，使用硬编码兜底:', e.message);
    }

  // 获取学习进度因子：学习规则越多，自动分类的硬编码权重越低
  const learningFactor = await getLearningProgressFactor();
  // 硬编码权重衰减系数：0条规则时=1.0（满权重），10条以上=0.5（减半）
  const hardcodeWeight = 1 - learningFactor * 0.5;

  // 分类得分初始化
  const categoryScores = { stock_pick: 0, market_news: 0, marketing: 0 };

  // 1. stocksJson 中有有效股票代码 → 强推票信号（直接判推票）
  try {
    const stocks = JSON.parse(stocksJson || '[]');
    const hasValidStock = stocks.some(s => s && s.code && isValidStockCode(String(s.code).trim()));
    if (hasValidStock) categoryScores.stock_pick += 6 * hardcodeWeight;
  } catch {}

  // 2. 文本中【股票名 6位代码】格式 → 强推票信号
  // 提取所有【... ...】中的代码并验证有效性
  const bracketCodeMatches = text.match(/【\s*[^】]*?\s+(\d{6})\s*】/g) || [];
  let validBracketCodeCount = 0;
  for (const m of bracketCodeMatches) {
    const codeMatch = m.match(/\d{6}/);
    if (codeMatch && isValidStockCode(codeMatch[0])) validBracketCodeCount++;
  }
  if (validBracketCodeCount > 0) categoryScores.stock_pick += 5 * hardcodeWeight;

  // 3. 文本中包含6位有效A股代码（前后非数字，避免身份证/电话号误判）
  const validCodesInText = extractValidStockCodes(cleanText);
  if (validCodesInText.length > 0) categoryScores.stock_pick += 4 * hardcodeWeight;

  // 4. 推票回顾模式：涨停/连板/T+1 等关键词 + 股票名/代码 → 判推票
  const pickReviewKeywords = ['涨停', '跌停', 'T+1', 'T+0', '累计涨', '连板', '强势涨停', '两连板', '2连板', '3连板', '封板', '打板', '首板', '二板', '三板', '断板'];
  const hasPickReviewKeyword = pickReviewKeywords.some(k => text.includes(k));
  const stockNameInBrackets = /【[#⭕🔥]?\s*[^】]{2,10}\s*】/.test(text);
  if (hasPickReviewKeyword && (stockNameInBrackets || validCodesInText.length > 0 || categoryScores.stock_pick > 0)) {
    categoryScores.stock_pick += 3 * hardcodeWeight;
  }

  // 5. 【股票名】 + 推荐关键词 → 判推票
  const recommendKeywords = ['关注', '低吸', '买入', '建仓', '加仓', '推荐', '目标价', '看涨', '看好', '机会', '潜力', '布局', '抄底', '上车', '埋伏'];
  const hasRecommendKeyword = recommendKeywords.some(k => text.includes(k));
  if (stockNameInBrackets && hasRecommendKeyword) {
    categoryScores.stock_pick += 3 * hardcodeWeight;
  }

  // 5. 基于系统规则 + 硬编码兜底打分分类
  let systemRuleMatched = false;
  if (rules.length > 0) {
    for (const rule of rules) {
      if (!rule.enabled) continue;
      let matched = false;
      if (rule.rule_type === 'regex') {
        try {
          const regex = new RegExp(rule.pattern, 'g');
          matched = regex.test(text);
        } catch { continue; }
      } else if (rule.rule_type === 'keyword') {
        matched = text.includes(rule.pattern);
      }
      if (matched) {
        categoryScores[rule.category] = (categoryScores[rule.category] || 0) + rule.weight * hardcodeWeight;
        systemRuleMatched = true;
      }
    }
  }
  // 硬编码兜底（权重减半，因为系统规则已覆盖大部分）
  const hcW = 0.5 * hardcodeWeight;

  // 强营销信号：只加 3 分 / 条
  for (const p of HARDCODED_MARKETING_STRONG) {
    try { if (p.test(text)) categoryScores.marketing += 3 * hcW; } catch {}
  }
  // 弱营销信号：只加 1 分 / 条
  for (const p of HARDCODED_MARKETING_WEAK) {
    try { if (p.test(text)) categoryScores.marketing += 1 * hcW; } catch {}
  }
  // 免责声明：只加 0.3 分 / 条（极弱信号，避免把正常行情复盘误判为营销）
  for (const p of HARDCODED_MARKETING_DISCLAIMER) {
    try { if (p.test(text)) categoryScores.marketing += 0.3 * hcW; } catch {}
  }
  // 强营销关键词
  for (const kw of HARDCODED_MARKETING_KEYWORDS_STRONG) {
    if (text.includes(kw)) categoryScores.marketing += 1.5 * hcW;
  }
  // 弱营销关键词：免责类的只加 0.2 分
  for (const kw of HARDCODED_MARKETING_KEYWORDS_WEAK) {
    if (text.includes(kw)) categoryScores.marketing += 0.2 * hcW;
  }

  // 行情模式检查（硬编码兜底，权重减半）
  for (const p of HARDCODED_NEWS_PATTERNS) {
    try { if (p.test(text)) categoryScores.market_news += 1.5 * hcW; } catch {}
  }

  // 【股票名】括号信号（兜底，仅当其他信号不强时生效）
  const hasStockBracket = /【[#⭕🔥\s]*[^】]{2,10}[#⭕🔥\s]*】/.test(text);
  if (hasStockBracket && categoryScores.stock_pick < 3) {
    categoryScores.stock_pick += 1.5 * hcW;
  }

  // 营销强信号覆盖：只有 marketing 得分不仅达到阈值，而且**明显高于** market_news 时才优先返回 marketing
  // 有股票代码时阈值更高，避免把真推票误判为营销
  const hasStockSignal = categoryScores.stock_pick >= 3;
  const marketingThreshold = hasStockSignal ? 6 : 3;
  if (categoryScores.marketing >= marketingThreshold &&
      categoryScores.marketing >= categoryScores.market_news + 2) {
    return 'marketing';
  }

  // 股票优先：推票得分达到阈值（>=3），且营销信号不强，归类为 stock_pick
  if (categoryScores.stock_pick >= 3) {
    return 'stock_pick';
  }

  // 营销消息：只有在没有推票信号时才检查
  if (categoryScores.marketing > 0 &&
      categoryScores.marketing >= categoryScores.market_news) {
    return 'marketing';
  }

  // 【股票名】括号兜底：有括号且无明显行情覆盖词时，倾向推票
  if (hasStockBracket && categoryScores.stock_pick > 0) {
    const newsOverrideKeywords = ['大盘', '走势', '板块', '行情', '市场', '指数', '沪指', '深成指', '创业板指'];
    const hasNewsOverride = newsOverrideKeywords.some(k => text.includes(k));
    if (!hasNewsOverride && categoryScores.marketing < 3) {
      return 'stock_pick';
    }
  }

  // 返回得分最高的类别
  const maxCategory = Object.entries(categoryScores).reduce((a, b) => a[1] >= b[1] ? a : b);
  if (maxCategory[1] > 0) return maxCategory[0];

  // 最后兜底：检查是否有明显的行情关键词
  const newsFallbackKeywords = ['大盘', '走势', '板块', '行情', '放量', '反弹', '回调', '震荡', '突破', '回踩', '企稳'];
  const hasNewsFallback = newsFallbackKeywords.some(k => text.includes(k));
  if (hasNewsFallback) return 'market_news';

  return 'market_news';
  } catch (err) {
    console.error('[分类] categorizeMessage 异常:', err.message);
    return 'market_news';
  }
}

async function migrate() {
  const columns = [
    { name: 'profit_loss_ratio', sql: 'DECIMAL(10,4) NULL' },
    { name: 'ratio_price', sql: 'DECIMAL(10,4) NULL' },
    { name: 'base_price', sql: 'DECIMAL(10,4) NULL' },
    { name: 'price_change_percent', sql: 'DECIMAL(10,4) NULL' },
    { name: 'board', sql: "VARCHAR(20) DEFAULT 'stock'" }
  ];
  for (const col of columns) {
    try {
      await pool.execute(`ALTER TABLE stocks ADD COLUMN ${col.name} ${col.sql}`);
      console.log(`字段 ${col.name} 添加成功`);
    } catch (err) {
      if (err.code !== 'ER_DUP_FIELDNAME') throw err;
    }
  }
  // 修复已有数据的 board 字段（ALTER TABLE 后旧行可能为 NULL）
  await pool.execute(`UPDATE stocks SET board = 'stock' WHERE board IS NULL OR board = ''`);

  // 买入记录表添加 t_type 字段（T入）
  try {
    await pool.execute(`ALTER TABLE buy_records ADD COLUMN t_type VARCHAR(10) DEFAULT ''`);
  } catch (err) {
    if (err.code !== 'ER_DUP_FIELDNAME') throw err;
  }

  // 卖出记录表添加 t_type 字段（T出）
  try {
    await pool.execute(`ALTER TABLE sell_records ADD COLUMN t_type VARCHAR(10) DEFAULT ''`);
  } catch (err) {
    if (err.code !== 'ER_DUP_FIELDNAME') throw err;
  }

  // 股票表添加备注字段
  try {
    await pool.execute(`ALTER TABLE stocks ADD COLUMN notes TEXT`);
  } catch (err) {
    if (err.code !== 'ER_DUP_FIELDNAME') throw err;
  }

  // 买入/卖出记录表添加 t_profit 字段（做T目标盈利）
  try {
    await pool.execute(`ALTER TABLE buy_records ADD COLUMN t_profit DECIMAL(12,2) DEFAULT NULL`);
  } catch (err) {
    if (err.code !== 'ER_DUP_FIELDNAME') throw err;
  }
  try {
    await pool.execute(`ALTER TABLE sell_records ADD COLUMN t_profit DECIMAL(12,2) DEFAULT NULL`);
  } catch (err) {
    if (err.code !== 'ER_DUP_FIELDNAME') throw err;
  }

  // 卖出记录表添加 t_pending 字段（T出欠着标记，历史字段，配对方向改由组内腿推导）
  try {
    await pool.execute(`ALTER TABLE sell_records ADD COLUMN t_pending TINYINT(1) DEFAULT 0`);
  } catch (err) {
    if (err.code !== 'ER_DUP_FIELDNAME') throw err;
  }

  // 买入记录表添加 cost_change 字段（成本变化）
  try {
    await pool.execute(`ALTER TABLE buy_records ADD COLUMN cost_change DECIMAL(12,2) DEFAULT 0`);
  } catch (err) {
    if (err.code !== 'ER_DUP_FIELDNAME') throw err;
  }

  // 买入/卖出记录表添加 t_group_id 字段（T组ID）
  try {
    await pool.execute(`ALTER TABLE buy_records ADD COLUMN t_group_id VARCHAR(64) DEFAULT NULL`);
  } catch (err) {
    if (err.code !== 'ER_DUP_FIELDNAME') throw err;
  }
  try {
    await pool.execute(`ALTER TABLE sell_records ADD COLUMN t_group_id VARCHAR(64) DEFAULT NULL`);
  } catch (err) {
    if (err.code !== 'ER_DUP_FIELDNAME') throw err;
  }

  // 旧数据适配：为没有 t_group_id 的旧交易记录自动配对
  await migrateOldTGroups();

  // 做T记录统一成「T入 / T出」两个标签（不再区分正T/反T），旧标签一次性迁移
  try {
    await pool.execute(`UPDATE buy_records SET t_type = 'T入' WHERE t_type IN ('正T', '反T承接')`);
    await pool.execute(`UPDATE sell_records SET t_type = 'T出' WHERE t_type IN ('正T卖出', '反T')`);
  } catch (err) {
    console.error('做T标签迁移失败:', err.message);
  }

  // 股票表添加冻结持仓天数字段
  try {
    await pool.execute(`ALTER TABLE stocks ADD COLUMN frozen_holding_days INT DEFAULT 0`);
  } catch (err) {
    if (err.code !== 'ER_DUP_FIELDNAME') throw err;
  }

  // 股票表添加前十大流通股东占比字段（历史换手衰减系数 = 1 / (1 - 占比)）
  try {
    await pool.execute(`ALTER TABLE stocks ADD COLUMN top_ten_float_ratio DECIMAL(8,4) NULL`);
  } catch (err) {
    if (err.code !== 'ER_DUP_FIELDNAME') throw err;
  }
  // 修正已有清仓记录的冻结持仓天数
  await pool.execute(`
    UPDATE stocks
    SET frozen_holding_days = DATEDIFF(sell_date, buy_date) + 1
    WHERE is_cleared = 1
      AND buy_date IS NOT NULL
      AND sell_date IS NOT NULL
      AND frozen_holding_days = 0
  `);

  // 创建存款表
  await pool.execute(`
    CREATE TABLE IF NOT EXISTS deposit_items (
      id VARCHAR(64) PRIMARY KEY,
      group_name VARCHAR(100) NOT NULL DEFAULT '默认分组',
      name VARCHAR(200) NOT NULL DEFAULT '',
      amount DECIMAL(12,2) NOT NULL DEFAULT 0,
      rate DECIMAL(8,4) NULL,
      note VARCHAR(500) DEFAULT '',
      sort_order INT DEFAULT 0,
      created_at BIGINT DEFAULT 0,
      icon VARCHAR(500) DEFAULT ''
    )
  `);
  // 存款表 icon 字段迁移
  try {
    await pool.execute(`ALTER TABLE deposit_items ADD COLUMN icon VARCHAR(500) DEFAULT ''`);
  } catch (err) {
    if (err.code !== 'ER_DUP_FIELDNAME') throw err;
  }
  // 存款表 bind_type 字段迁移
  try {
    await pool.execute(`ALTER TABLE deposit_items ADD COLUMN bind_type VARCHAR(50) DEFAULT ''`);
  } catch (err) {
    if (err.code !== 'ER_DUP_FIELDNAME') throw err;
  }
  // 存款表 exclude_total 字段迁移
  try {
    await pool.execute(`ALTER TABLE deposit_items ADD COLUMN exclude_total TINYINT DEFAULT 0`);
  } catch (err) {
    if (err.code !== 'ER_DUP_FIELDNAME') throw err;
  }

  // 存款类型字段迁移
  try {
    await pool.execute(`ALTER TABLE deposit_items ADD COLUMN item_type VARCHAR(20) NOT NULL DEFAULT 'normal'`);
  } catch (err) {
    if (err.code !== 'ER_DUP_FIELDNAME') throw err;
  }

  // 还款模式字段迁移：auto=自动还款，manual=手动还款
  try {
    await pool.execute(`ALTER TABLE deposit_items ADD COLUMN repayment_mode VARCHAR(10) DEFAULT 'auto'`);
  } catch (err) {
    if (err.code !== 'ER_DUP_FIELDNAME') throw err;
  }

  // 分期还款计划表
  await pool.execute(`
    CREATE TABLE IF NOT EXISTS installment_plans (
      id VARCHAR(64) PRIMARY KEY,
      deposit_item_id VARCHAR(64) NOT NULL,
      total_principal DECIMAL(12,2) NOT NULL DEFAULT 0,
      total_interest DECIMAL(12,2) NOT NULL DEFAULT 0,
      installments INT NOT NULL DEFAULT 12,
      monthly_day INT NOT NULL DEFAULT 1,
      start_date VARCHAR(10) NOT NULL,
      payment_account_id VARCHAR(64) DEFAULT '',
      created_at BIGINT DEFAULT 0
    )
  `);

  // 每个存款项只允许存在一个分期计划
  try {
    await pool.execute(`ALTER TABLE installment_plans ADD UNIQUE INDEX uk_installment_deposit_item (deposit_item_id)`);
  } catch (err) {
    if (err.code !== 'ER_DUP_KEYNAME') throw err;
  }

  // 分期还款账单表
  await pool.execute(`
    CREATE TABLE IF NOT EXISTS installment_bills (
      id VARCHAR(64) PRIMARY KEY,
      plan_id VARCHAR(64) NOT NULL,
      period INT NOT NULL,
      due_date VARCHAR(10) NOT NULL,
      principal DECIMAL(12,2) NOT NULL DEFAULT 0,
      interest DECIMAL(12,2) NOT NULL DEFAULT 0,
      total DECIMAL(12,2) NOT NULL DEFAULT 0,
      status VARCHAR(20) NOT NULL DEFAULT 'pending',
      paid_at BIGINT DEFAULT 0,
      created_at BIGINT DEFAULT 0
    )
  `);

  // 存款资金明细表
  await pool.execute(`
    CREATE TABLE IF NOT EXISTS deposit_transactions (
      id VARCHAR(64) PRIMARY KEY,
      deposit_item_id VARCHAR(64) NOT NULL,
      type VARCHAR(20) NOT NULL COMMENT 'adjust/add/deduct/init',
      amount DECIMAL(12,2) NOT NULL DEFAULT 0,
      balance_before DECIMAL(12,2) NOT NULL DEFAULT 0,
      balance_after DECIMAL(12,2) NOT NULL DEFAULT 0,
      note VARCHAR(200) DEFAULT '',
      created_at BIGINT DEFAULT 0
    )
  `);

  // 给 deposit_transactions 添加 wool_item_id 关联字段（羊毛记录联动）
  try {
    const [cols] = await pool.execute("SHOW COLUMNS FROM deposit_transactions LIKE 'wool_item_id'");
    if (cols.length === 0) {
      await pool.execute('ALTER TABLE deposit_transactions ADD COLUMN wool_item_id VARCHAR(64) NULL AFTER deposit_item_id');
    }
  } catch (e) { console.log('检查 deposit_transactions wool_item_id 列:', e.message); }

  // 薅羊毛记录表
  await pool.execute(`
    CREATE TABLE IF NOT EXISTS wool_items (
      id VARCHAR(64) PRIMARY KEY,
      name VARCHAR(200) NOT NULL DEFAULT '',
      amount DECIMAL(12,2) NOT NULL DEFAULT 0,
      wool_date VARCHAR(10) NOT NULL,
      icon VARCHAR(500) DEFAULT '',
      image VARCHAR(500) DEFAULT '',
      images TEXT,
      note VARCHAR(500) DEFAULT '',
      created_at BIGINT DEFAULT 0
    )
  `);

  // 检查表是否已有 images 列，没有则添加（兼容旧数据）
  try {
    const [cols] = await pool.execute("SHOW COLUMNS FROM wool_items LIKE 'images'");
    if (cols.length === 0) {
      await pool.execute('ALTER TABLE wool_items ADD COLUMN images TEXT AFTER image');
    }
  } catch (e) { console.log('检查 wool_items images 列:', e.message); }

  // Consumption fields keep legacy wool records as reward entries.
  const woolColumns = [
    ['record_type', "VARCHAR(16) NOT NULL DEFAULT 'reward' AFTER note"],
    ['category', "VARCHAR(64) NOT NULL DEFAULT '' AFTER record_type"],
    ['merchant', "VARCHAR(120) NOT NULL DEFAULT '' AFTER category"],
    ['payment_method', "VARCHAR(64) NOT NULL DEFAULT '' AFTER merchant"],
    ['deposit_item_id', "VARCHAR(64) NULL AFTER payment_method"],
    ['deposit_transaction_id', "VARCHAR(64) NULL AFTER deposit_item_id"]
  ];
  for (const [column, definition] of woolColumns) {
    try {
      const [cols] = await pool.execute(`SHOW COLUMNS FROM wool_items LIKE '${column}'`);
      if (cols.length === 0) {
        await pool.execute(`ALTER TABLE wool_items ADD COLUMN ${column} ${definition}`);
      }
    } catch (e) { console.log(`Check wool_items ${column} column:`, e.message); }
  }

  // 每日计划表
  await pool.execute(`
    CREATE TABLE IF NOT EXISTS daily_plans (
      id VARCHAR(64) PRIMARY KEY,
      title VARCHAR(200) NOT NULL DEFAULT '',
      period_type VARCHAR(10) NOT NULL DEFAULT 'daily',
      period_value INT DEFAULT 0,
      icon VARCHAR(500) DEFAULT '',
      sort_order INT DEFAULT 0,
      created_at BIGINT DEFAULT 0
    )
  `);

  // 计划完成记录表
  await pool.execute(`
    CREATE TABLE IF NOT EXISTS plan_completions (
      id VARCHAR(64) PRIMARY KEY,
      plan_id VARCHAR(64) NOT NULL,
      complete_date VARCHAR(10) NOT NULL,
      completed TINYINT DEFAULT 1,
      created_at BIGINT DEFAULT 0,
      INDEX idx_plan_date (plan_id, complete_date)
    )
  `);

  // 每日备注表
  await pool.execute(`
    CREATE TABLE IF NOT EXISTS daily_notes (
      id VARCHAR(64) PRIMARY KEY,
      note_date VARCHAR(10) NOT NULL UNIQUE,
      content TEXT,
      created_at BIGINT DEFAULT 0,
      updated_at BIGINT DEFAULT 0
    )
  `);

  // 薅羊毛每日快速录入表
  await pool.execute(`
    CREATE TABLE IF NOT EXISTS wool_daily_amounts (
      id VARCHAR(64) PRIMARY KEY,
      wool_date VARCHAR(10) NOT NULL UNIQUE,
      quick_amount DECIMAL(12,2) NOT NULL DEFAULT 0,
      created_at BIGINT DEFAULT 0,
      updated_at BIGINT DEFAULT 0
    )
  `);

  // 薅羊毛笔记/链接收藏表（支持多条笔记）
  await pool.execute(`
    CREATE TABLE IF NOT EXISTS wool_notes (
      id VARCHAR(64) PRIMARY KEY,
      note_type VARCHAR(32) NOT NULL,
      title VARCHAR(200) NOT NULL DEFAULT '',
      content TEXT,
      created_at BIGINT DEFAULT 0,
      updated_at BIGINT DEFAULT 0
    )
  `);

  // 练题题库表
  await pool.execute(`
    CREATE TABLE IF NOT EXISTS quiz_questions (
      id VARCHAR(64) PRIMARY KEY,
      stock_name VARCHAR(200) NOT NULL DEFAULT '',
      stock_code VARCHAR(20) NOT NULL DEFAULT '',
      quiz_date VARCHAR(10) NOT NULL,
      image VARCHAR(500) NOT NULL DEFAULT '',
      correct_answer TEXT,
      note VARCHAR(500) DEFAULT '',
      created_at BIGINT DEFAULT 0
    )
  `);

  // 练题答题记录表
  await pool.execute(`
    CREATE TABLE IF NOT EXISTS quiz_answers (
      id VARCHAR(64) PRIMARY KEY,
      question_id VARCHAR(64) NOT NULL,
      user_answer TEXT,
      ai_evaluation TEXT,
      created_at BIGINT DEFAULT 0,
      INDEX idx_question_id (question_id)
    )
  `);

  // AI 设置表（存储各模型 API Key）
  await pool.execute(`
    CREATE TABLE IF NOT EXISTS ai_settings (
      setting_key VARCHAR(64) PRIMARY KEY,
      setting_value TEXT,
      updated_at BIGINT DEFAULT 0
    )
  `);

  // AI 调用统计表
  await pool.execute(`
    CREATE TABLE IF NOT EXISTS ai_usage (
      id INT AUTO_INCREMENT PRIMARY KEY,
      date DATE NOT NULL,
      model VARCHAR(64) NOT NULL DEFAULT '',
      count INT NOT NULL DEFAULT 1,
      UNIQUE KEY uk_date_model (date, model)
    )
  `);

  // AI 调用日志表
  await pool.execute(`
    CREATE TABLE IF NOT EXISTS ai_logs (
      id INT AUTO_INCREMENT PRIMARY KEY,
      created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
      model VARCHAR(64) NOT NULL DEFAULT '',
      provider VARCHAR(32) NOT NULL DEFAULT '',
      system_prompt_len INT NOT NULL DEFAULT 0,
      user_prompt_len INT NOT NULL DEFAULT 0,
      response_len INT NOT NULL DEFAULT 0,
      duration_ms INT NOT NULL DEFAULT 0,
      success TINYINT(1) NOT NULL DEFAULT 1,
      error_msg TEXT,
      request_content TEXT,
      response_content TEXT
    )
  `);
  // 兼容旧表：添加缺失的字段
  for (const col of ['request_content TEXT', 'response_content TEXT']) {
    try { await pool.execute(`ALTER TABLE ai_logs ADD COLUMN ${col}`); } catch (_) {}
  }

  // 人生规划节点表（AI 与用户共同维护的规划网络）
  await pool.execute(`
    CREATE TABLE IF NOT EXISTS life_plan_nodes (
      id VARCHAR(64) NOT NULL,
      user_id INT UNSIGNED NOT NULL,
      parent_id VARCHAR(64) NOT NULL DEFAULT '',
      kind VARCHAR(16) NOT NULL DEFAULT 'goal',
      domain VARCHAR(32) NOT NULL DEFAULT '成长',
      title VARCHAR(200) NOT NULL DEFAULT '',
      detail TEXT,
      status VARCHAR(16) NOT NULL DEFAULT 'todo',
      horizon VARCHAR(32) NOT NULL DEFAULT '',
      weight INT NOT NULL DEFAULT 50,
      source VARCHAR(8) NOT NULL DEFAULT 'ai',
      sort_order INT NOT NULL DEFAULT 0,
      created_at BIGINT NOT NULL DEFAULT 0,
      updated_at BIGINT NOT NULL DEFAULT 0,
      PRIMARY KEY (id),
      INDEX idx_life_nodes_user (user_id, created_at)
    )
  `);
  // 兼容旧表：补 time_group（时序分组）、deps（前置依赖节点 id 列表）、step_no（时序步骤序号）、risk（任务表「风险提示」列）、priority（P0-P3 优先级）、series（所属主线，横向条带分组）
  // content_type：节点内容载体类型，前端据此渲染对应 UI（text/table/link/checklist/progress/branch/calc/doc）
  // reference_ids：横向网状关联（跨赛道联动、时间冲突、精力冲突、任务互相影响），存 JSON 数组
  // is_shared：公共节点标记（复盘 / 方法 / 资料 / 模板只生成一次，全网络复用，不重复冗余）
  // progress_note：任务「部分完成」的完成情况 —— 用户写清哪些做完了、哪些还没做，用于刻画大脑（执行力按进度折算）
  // start_date：节点开始日期（YYYY-MM-DD），与 horizon（截止日期）分开存，用户可以各自修改
  for (const col of ["time_group VARCHAR(16) NOT NULL DEFAULT ''", 'deps TEXT', 'step_no INT NOT NULL DEFAULT 0', "risk VARCHAR(200) NOT NULL DEFAULT ''", "priority VARCHAR(4) NOT NULL DEFAULT ''", "series VARCHAR(64) NOT NULL DEFAULT ''", "content_type VARCHAR(24) NOT NULL DEFAULT ''", 'content_body TEXT', 'reference_ids TEXT', 'is_shared TINYINT NOT NULL DEFAULT 0', 'progress_note TEXT', "start_date VARCHAR(10) NOT NULL DEFAULT ''"]) {
    try { await pool.execute(`ALTER TABLE life_plan_nodes ADD COLUMN ${col}`); }
    catch (err) { if (err.code !== 'ER_DUP_FIELDNAME') console.warn('[alter life_plan_nodes]', col, err.message); }
  }

  // 人生规划对话记录表
  await pool.execute(`
    CREATE TABLE IF NOT EXISTS life_chat_messages (
      id VARCHAR(64) NOT NULL,
      user_id INT UNSIGNED NOT NULL,
      role VARCHAR(16) NOT NULL DEFAULT 'user',
      content TEXT,
      created_at BIGINT NOT NULL DEFAULT 0,
      PRIMARY KEY (id),
      INDEX idx_life_chat_user (user_id, created_at)
    )
  `);

  // 人生规划 · 模块2 每日细分任务表
  await pool.execute(`
    CREATE TABLE IF NOT EXISTS life_daily_tasks (
      id VARCHAR(64) NOT NULL,
      user_id INT UNSIGNED NOT NULL,
      task_date VARCHAR(10) NOT NULL DEFAULT '',
      title VARCHAR(200) NOT NULL DEFAULT '',
      est_minutes INT NOT NULL DEFAULT 0,
      priority VARCHAR(4) NOT NULL DEFAULT 'P1',
      status VARCHAR(8) NOT NULL DEFAULT 'todo',
      pre_task VARCHAR(120) NOT NULL DEFAULT '',
      blocker VARCHAR(200) NOT NULL DEFAULT '',
      support VARCHAR(200) NOT NULL DEFAULT '',
      node_id VARCHAR(64) NOT NULL DEFAULT '',
      repeat_type VARCHAR(10) NOT NULL DEFAULT '',
      sort_order INT NOT NULL DEFAULT 0,
      created_at BIGINT NOT NULL DEFAULT 0,
      updated_at BIGINT NOT NULL DEFAULT 0,
      PRIMARY KEY (id),
      INDEX idx_life_daily_date (task_date)
    )
  `);

  // 人生规划 · 模块15 任务进度快照
  await pool.execute(`
    CREATE TABLE IF NOT EXISTS life_plan_snapshots (
      id VARCHAR(64) NOT NULL,
      user_id INT UNSIGNED NOT NULL,
      snap_date VARCHAR(10) NOT NULL DEFAULT '',
      progress INT NOT NULL DEFAULT 0,
      payload MEDIUMTEXT,
      diff_note TEXT,
      created_at BIGINT NOT NULL DEFAULT 0,
      PRIMARY KEY (id),
      INDEX idx_life_snap_date (snap_date)
    )
  `);

  // 人生规划 · 模块16 精力负荷评估表
  await pool.execute(`
    CREATE TABLE IF NOT EXISTS life_energy_logs (
      id VARCHAR(64) NOT NULL,
      user_id INT UNSIGNED NOT NULL,
      log_date VARCHAR(10) NOT NULL DEFAULT '',
      planned_minutes INT NOT NULL DEFAULT 0,
      capacity_minutes INT NOT NULL DEFAULT 0,
      overload TINYINT NOT NULL DEFAULT 0,
      distractions VARCHAR(200) NOT NULL DEFAULT '',
      sleep_hours DECIMAL(4,1) NOT NULL DEFAULT 0,
      health VARCHAR(100) NOT NULL DEFAULT '',
      note TEXT,
      created_at BIGINT NOT NULL DEFAULT 0,
      PRIMARY KEY (id),
      INDEX idx_life_energy_date (log_date)
    )
  `);

  // 人生规划 · 模块3 个人技能档案表
  await pool.execute(`
    CREATE TABLE IF NOT EXISTS life_skill_profile (
      id VARCHAR(64) NOT NULL,
      user_id INT UNSIGNED NOT NULL,
      category VARCHAR(8) NOT NULL DEFAULT 'own',
      name VARCHAR(120) NOT NULL DEFAULT '',
      level VARCHAR(32) NOT NULL DEFAULT '',
      note VARCHAR(200) NOT NULL DEFAULT '',
      sort_order INT NOT NULL DEFAULT 0,
      created_at BIGINT NOT NULL DEFAULT 0,
      updated_at BIGINT NOT NULL DEFAULT 0,
      PRIMARY KEY (id),
      INDEX idx_life_skill_cat (category)
    )
  `);

  // 人生规划 · 模块18 个人学习知识库
  await pool.execute(`
    CREATE TABLE IF NOT EXISTS life_knowledge (
      id VARCHAR(64) NOT NULL,
      user_id INT UNSIGNED NOT NULL,
      subject VARCHAR(32) NOT NULL DEFAULT '',
      topic VARCHAR(120) NOT NULL DEFAULT '',
      content TEXT,
      wrong_questions TEXT,
      tags VARCHAR(120) NOT NULL DEFAULT '',
      review_stage INT NOT NULL DEFAULT 0,
      next_review_date VARCHAR(10) NOT NULL DEFAULT '',
      source VARCHAR(16) NOT NULL DEFAULT 'ai',
      created_at BIGINT NOT NULL DEFAULT 0,
      updated_at BIGINT NOT NULL DEFAULT 0,
      PRIMARY KEY (id),
      INDEX idx_life_knowledge_next (next_review_date)
    )
  `);

  // 人生规划 · 模块19 外部事件日历
  await pool.execute(`
    CREATE TABLE IF NOT EXISTS life_calendar_events (
      id VARCHAR(64) NOT NULL,
      user_id INT UNSIGNED NOT NULL,
      title VARCHAR(120) NOT NULL DEFAULT '',
      event_date VARCHAR(10) NOT NULL DEFAULT '',
      category VARCHAR(32) NOT NULL DEFAULT '',
      level VARCHAR(8) NOT NULL DEFAULT 'mid',
      remind_days VARCHAR(32) NOT NULL DEFAULT '30,7,1',
      status VARCHAR(16) NOT NULL DEFAULT 'pending',
      note TEXT,
      created_at BIGINT NOT NULL DEFAULT 0,
      updated_at BIGINT NOT NULL DEFAULT 0,
      PRIMARY KEY (id),
      INDEX idx_life_event_date (event_date)
    )
  `);

  // 人生规划 · 模块17 变更日志
  await pool.execute(`
    CREATE TABLE IF NOT EXISTS life_change_logs (
      id VARCHAR(64) NOT NULL,
      user_id INT UNSIGNED NOT NULL,
      module VARCHAR(32) NOT NULL DEFAULT '',
      content VARCHAR(400) NOT NULL DEFAULT '',
      reason VARCHAR(200) NOT NULL DEFAULT '',
      affected VARCHAR(200) NOT NULL DEFAULT '',
      snapshot_id VARCHAR(64) NOT NULL DEFAULT '',
      created_at BIGINT NOT NULL DEFAULT 0,
      PRIMARY KEY (id),
      INDEX idx_life_change_time (created_at)
    )
  `);
  // 人生规划 · 「不要了」清单：用户手动删掉的节点标题记在这里。
  // 之后 AI 更新或重新生成规划时，这些标题不再自动加回；除非用户明确点名要它，或自己手动再新增回来
  await pool.execute(`
    CREATE TABLE IF NOT EXISTS life_plan_rejects (
      title VARCHAR(200) NOT NULL,
      kind VARCHAR(32) NOT NULL DEFAULT '',
      created_at BIGINT NOT NULL DEFAULT 0,
      user_id INT UNSIGNED NOT NULL DEFAULT 0,
      PRIMARY KEY (user_id, title)
    )
  `);
  // 人生规划 · 全局人物画像（用户模型）：跨所有根目标的统一画像，AI 生成计划 / 判断短板 / 推演未来分支的数据源。
  // 6 大维度各占一列，存「标签｜内容」逐行文本（TEXT），前端按行渲染、按行编辑，避免复杂 JSON UI
  await pool.execute(`
    CREATE TABLE IF NOT EXISTS life_persona (
      id VARCHAR(64) NOT NULL,
      user_id INT UNSIGNED NOT NULL,
      hard_skills TEXT,
      time_habits TEXT,
      traits TEXT,
      resources TEXT,
      values_pref TEXT,
      risks TEXT,
      source VARCHAR(8) NOT NULL DEFAULT 'user',
      created_at BIGINT NOT NULL DEFAULT 0,
      updated_at BIGINT NOT NULL DEFAULT 0,
      PRIMARY KEY (id)
    )
  `);
  // 人生规划 · 未来可选发展路径库（画像的衍生模块）：每条路径带适配得分、优势、代价、前置条件与长期推演
  await pool.execute(`
    CREATE TABLE IF NOT EXISTS life_future_paths (
      id VARCHAR(64) NOT NULL,
      user_id INT UNSIGNED NOT NULL,
      name VARCHAR(120) NOT NULL DEFAULT '',
      advantages TEXT,
      risks TEXT,
      prerequisites TEXT,
      evolution TEXT,
      score INT NOT NULL DEFAULT 0,
      node_id VARCHAR(64) NOT NULL DEFAULT '',
      source VARCHAR(8) NOT NULL DEFAULT 'user',
      sort_order INT NOT NULL DEFAULT 0,
      created_at BIGINT NOT NULL DEFAULT 0,
      updated_at BIGINT NOT NULL DEFAULT 0,
      PRIMARY KEY (id)
    )
  `);

  // 动态人物画像：由右侧规划网络的完成度反推（状态 / 能力 / 习惯 / 性格 / 资源 / 未来可做的事 / 相对优势）
  // signature 存完成度指纹，规划没实质变化时直接复用上一版，不重复调模型
  await pool.execute(`
    CREATE TABLE IF NOT EXISTS life_persona_derived (
      id VARCHAR(64) NOT NULL,
      user_id INT UNSIGNED NOT NULL DEFAULT 0,
      state TEXT,
      abilities TEXT,
      habits TEXT,
      traits TEXT,
      resources TEXT,
      future TEXT,
      advantage TEXT,
      progress_json MEDIUMTEXT,
      signature VARCHAR(64) NOT NULL DEFAULT '',
      updated_at BIGINT NOT NULL DEFAULT 0,
      PRIMARY KEY (id)
    )
  `);

  // 逻辑推演缺资料时只写 pending 条目，绝不自动调用付费检索；人工审批后才批量执行，结果永久缓存
  await pool.execute(`
    CREATE TABLE IF NOT EXISTS life_retrieval_queue (
      id VARCHAR(64) NOT NULL,
      user_id INT UNSIGNED NOT NULL DEFAULT 0,
      batch_id VARCHAR(64) NOT NULL DEFAULT '',
      node_id VARCHAR(64) NOT NULL DEFAULT '',
      series VARCHAR(64) NOT NULL DEFAULT '',
      title VARCHAR(200) NOT NULL DEFAULT '',
      query VARCHAR(400) NOT NULL DEFAULT '',
      priority VARCHAR(4) NOT NULL DEFAULT '',
      est_cost DECIMAL(8,4) NOT NULL DEFAULT 0,
      status VARCHAR(16) NOT NULL DEFAULT 'pending',
      result TEXT,
      from_cache TINYINT NOT NULL DEFAULT 0,
      created_at BIGINT NOT NULL DEFAULT 0,
      decided_at BIGINT NOT NULL DEFAULT 0,
      updated_at BIGINT NOT NULL DEFAULT 0,
      PRIMARY KEY (id),
      INDEX idx_life_rq_status (status, created_at)
    )
  `);

  // 归集批次：每 30 分钟把 pending 条目打成一包，产出「检索清单 + 预估账单」，等待人工三种审批
  await pool.execute(`
    CREATE TABLE IF NOT EXISTS life_retrieval_batches (
      id VARCHAR(64) NOT NULL,
      user_id INT UNSIGNED NOT NULL DEFAULT 0,
      batch_no VARCHAR(32) NOT NULL DEFAULT '',
      task_count INT NOT NULL DEFAULT 0,
      est_cost DECIMAL(10,4) NOT NULL DEFAULT 0,
      actual_cost DECIMAL(10,4) NOT NULL DEFAULT 0,
      status VARCHAR(16) NOT NULL DEFAULT 'pending',
      created_at BIGINT NOT NULL DEFAULT 0,
      decided_at BIGINT NOT NULL DEFAULT 0,
      PRIMARY KEY (id),
      INDEX idx_life_rb_status (status, created_at)
    )
  `);

  // 检索结果永久缓存：重复需求直接读缓存，不重复扣费
  await pool.execute(`
    CREATE TABLE IF NOT EXISTS life_retrieval_cache (
      query_key VARCHAR(64) NOT NULL,
      user_id INT UNSIGNED NOT NULL DEFAULT 0,
      query VARCHAR(400) NOT NULL DEFAULT '',
      result TEXT,
      hit_count INT NOT NULL DEFAULT 0,
      created_at BIGINT NOT NULL DEFAULT 0,
      updated_at BIGINT NOT NULL DEFAULT 0,
      PRIMARY KEY (query_key)
    )
  `);

  // 检索日志：留存审批记录、检索日志与账单流水
  await pool.execute(`
    CREATE TABLE IF NOT EXISTS life_retrieval_logs (
      id VARCHAR(64) NOT NULL,
      user_id INT UNSIGNED NOT NULL DEFAULT 0,
      batch_id VARCHAR(64) NOT NULL DEFAULT '',
      action VARCHAR(24) NOT NULL DEFAULT '',
      detail VARCHAR(400) NOT NULL DEFAULT '',
      cost DECIMAL(10,4) NOT NULL DEFAULT 0,
      created_at BIGINT NOT NULL DEFAULT 0,
      PRIMARY KEY (id),
      INDEX idx_life_rl_time (created_at)
    )
  `);

  // 兼容旧表：结构化模块表统一要求租户列（tenant-db 会对每条 SQL 追加 user_id 条件），change_logs 另补 affected（本次受影响的模块清单）
  for (const table of ['life_daily_tasks', 'life_plan_snapshots', 'life_energy_logs', 'life_skill_profile', 'life_knowledge', 'life_calendar_events', 'life_change_logs', 'life_retrieval_queue', 'life_retrieval_batches', 'life_retrieval_cache', 'life_retrieval_logs', 'life_plan_rejects']) {
    try { await pool.execute(`ALTER TABLE ${table} ADD COLUMN user_id INT UNSIGNED NOT NULL DEFAULT 0`); }
    catch (err) { if (err.code !== 'ER_DUP_FIELDNAME') console.warn(`[alter ${table}]`, err.message); }
  }
  try { await pool.execute("ALTER TABLE life_change_logs ADD COLUMN affected VARCHAR(200) NOT NULL DEFAULT ''"); }
  catch (err) { if (err.code !== 'ER_DUP_FIELDNAME') console.warn('[alter life_change_logs.affected]', err.message); }
  // 每日任务的重复类型：daily 每日 / weekday 工作日 / weekly 每周 / once 单次，'' 表示未设置（按标题关键词推断）
  try { await pool.execute("ALTER TABLE life_daily_tasks ADD COLUMN repeat_type VARCHAR(10) NOT NULL DEFAULT ''"); }
  catch (err) { if (err.code !== 'ER_DUP_FIELDNAME') console.warn('[alter life_daily_tasks.repeat_type]', err.message); }
  // 该列最初上线时默认值是 'once'，会把「每日背 50 个单词」这类标题也存成「用户主动选的单次」。
  // 这里做一次幂等的数据修正：标题里明确带每日 / 每周 / 工作日字样的，不允许停留在 'once'，一律清空让标题推断接管。
  // 不查 information_schema（本服务禁止访问非业务表），用 UPDATE 自身的幂等性保证重复执行无副作用。
  try {
    await pool.execute(`UPDATE life_daily_tasks SET repeat_type = ''
      WHERE repeat_type = 'once' AND (title LIKE '%每天%' OR title LIKE '%每日%' OR title LIKE '%天天%' OR title LIKE '%日常%'
        OR title LIKE '%每周%' OR title LIKE '%工作日%')`);
    await pool.execute("ALTER TABLE life_daily_tasks MODIFY COLUMN repeat_type VARCHAR(10) NOT NULL DEFAULT ''");
  } catch (err) { console.warn('[alter life_daily_tasks.repeat_type default]', err.message); }
  // 快照 payload 要装下整份节点 + 每日任务 JSON，TEXT 上限 64KB 会溢出（报 Data too long 并连带整轮同步失败）
  try { await pool.execute('ALTER TABLE life_plan_snapshots MODIFY COLUMN payload MEDIUMTEXT'); }
  catch (err) { console.warn('[alter life_plan_snapshots.payload]', err.message); }

  // 交易记录日志表（持仓股数变动审计）
  await pool.execute(`
    CREATE TABLE IF NOT EXISTS tx_logs (
      id INT AUTO_INCREMENT PRIMARY KEY,
      created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
      stock_id VARCHAR(64) NOT NULL DEFAULT '',
      stock_code VARCHAR(32) NOT NULL DEFAULT '',
      action VARCHAR(32) NOT NULL DEFAULT '',
      before_count DOUBLE NOT NULL DEFAULT 0,
      after_count DOUBLE NOT NULL DEFAULT 0,
      total_buy DOUBLE NOT NULL DEFAULT 0,
      total_sell DOUBLE NOT NULL DEFAULT 0,
      trade_count DOUBLE NOT NULL DEFAULT 0,
      detail TEXT
    )
  `);

  // 股票笔记表
  await pool.execute(`
    CREATE TABLE IF NOT EXISTS stock_notes (
      id VARCHAR(64) PRIMARY KEY,
      title VARCHAR(200) NOT NULL DEFAULT '',
      content TEXT,
      created_at BIGINT DEFAULT 0,
      updated_at BIGINT DEFAULT 0
    )
  `);

  // 股票每日观察/分析表
  await pool.execute(`
    CREATE TABLE IF NOT EXISTS stock_watchlist (
      id VARCHAR(64) PRIMARY KEY,
      code VARCHAR(10) NOT NULL DEFAULT '',
      name VARCHAR(50) NOT NULL DEFAULT '',
      is_holding TINYINT DEFAULT 0,
      pinned TINYINT DEFAULT 0,
      sort_order INT DEFAULT 0,
      created_at BIGINT DEFAULT 0,
      updated_at BIGINT DEFAULT 0
    )
  `);

  // 股票每日分析记录表（一只股票每天一条）
  await pool.execute(`
    CREATE TABLE IF NOT EXISTS stock_daily_analysis (
      id VARCHAR(64) PRIMARY KEY,
      watch_id VARCHAR(64) NOT NULL DEFAULT '',
      code VARCHAR(10) NOT NULL DEFAULT '',
      date VARCHAR(20) NOT NULL DEFAULT '',
      action_type VARCHAR(20) DEFAULT '',
      sentiment VARCHAR(20) DEFAULT '',
      target_buy_price VARCHAR(24) DEFAULT NULL,
      target_buy_price_high VARCHAR(24) DEFAULT NULL,
      target_sell_price VARCHAR(24) DEFAULT NULL,
      target_sell_price_high VARCHAR(24) DEFAULT NULL,
      stop_loss_price VARCHAR(24) DEFAULT NULL,
      stop_loss_price_high VARCHAR(24) DEFAULT NULL,
      buy_share_count INT DEFAULT NULL,
      sell_share_count INT DEFAULT NULL,
      loss_share_count INT DEFAULT NULL,
      note TEXT,
      next_day_note TEXT,
      review_result VARCHAR(20) DEFAULT '',
      review_note VARCHAR(500) DEFAULT '',
      created_at BIGINT DEFAULT 0,
      updated_at BIGINT DEFAULT 0,
      UNIQUE KEY uk_watch_date (watch_id, date)
    )
  `);

  // 价格计划支持区间（如 6.40~6.50），列类型放宽为字符串
  for (const col of ['target_buy_price', 'target_sell_price', 'stop_loss_price']) {
    try { await pool.execute(`ALTER TABLE stock_daily_analysis MODIFY ${col} VARCHAR(24) DEFAULT NULL`); } catch (e) {}
  }
  // 旧的单一 share_count 迁移为「目标买入股数」，保留历史数据
  try { await pool.execute('ALTER TABLE stock_daily_analysis CHANGE COLUMN share_count buy_share_count INT DEFAULT NULL'); } catch (e) {}
  // 价格计划三项各自附带股数
  for (const col of ['buy_share_count', 'sell_share_count', 'loss_share_count']) {
    try { await pool.execute(`ALTER TABLE stock_daily_analysis ADD COLUMN ${col} INT DEFAULT NULL`); } catch (e) {}
  }
  // 价格计划支持区间上限价
  for (const col of ['target_buy_price_high', 'target_sell_price_high', 'stop_loss_price_high']) {
    try { await pool.execute(`ALTER TABLE stock_daily_analysis ADD COLUMN ${col} VARCHAR(24) DEFAULT NULL`); } catch (e) {}
  }
  // 「明日看法」字段：T 日盘后写给 T+1 看的备注
  try { await pool.execute('ALTER TABLE stock_daily_analysis ADD COLUMN next_day_note TEXT'); } catch (e) {}

  // 每日盘后总结表（每个交易日一条）
  await pool.execute(`
    CREATE TABLE IF NOT EXISTS stock_daily_summary (
      id VARCHAR(64) PRIMARY KEY,
      date VARCHAR(20) NOT NULL DEFAULT '',
      content TEXT,
      auto_content TEXT,
      created_at BIGINT DEFAULT 0,
      updated_at BIGINT DEFAULT 0,
      UNIQUE KEY uk_summary_date (date)
    )
  `);

  // 小工具表
  await pool.execute(`
    CREATE TABLE IF NOT EXISTS tools (
      id VARCHAR(64) PRIMARY KEY,
      name VARCHAR(200) NOT NULL DEFAULT '',
      url VARCHAR(1000) NOT NULL DEFAULT '',
      icon VARCHAR(200) DEFAULT '',
      note VARCHAR(500) DEFAULT '',
      category VARCHAR(100) DEFAULT '',
      sort_order INT DEFAULT 0,
      created_at BIGINT DEFAULT 0,
      updated_at BIGINT DEFAULT 0
    )
  `);

  // tools 表 category 字段迁移
  try {
    await pool.execute(`ALTER TABLE tools ADD COLUMN category VARCHAR(100) DEFAULT ''`);
  } catch (err) {
    if (err.code !== 'ER_DUP_FIELDNAME') throw err;
  }

  // 初始化默认小工具
  const [toolCount] = await pool.query('SELECT COUNT(*) as cnt FROM tools');
  if (toolCount[0].cnt === 0) {
    const now = Date.now();
    await pool.execute(
      'INSERT INTO tools (id, name, url, icon, note, category, sort_order, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
      [genId(), '查名下电话卡', 'https://getsimnum.caict.ac.cn/m/#/', 'Phone', '工信部一证通查，查询本人名下电话卡数量', '', 1, now, now]
    );
    await pool.execute(
      'INSERT INTO tools (id, name, url, icon, note, category, sort_order, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
      [genId(), '办理流量卡', 'https://my.86hk.vip/#/pages/micro_store/index?agent_id=d91b00521b8ebd31b967e505d8255dd7', 'Smartphone', '正规流量卡办理入口', '', 2, now, now]
    );
  }

  await reconcileInstallmentSchedules();

  // 微信选股消息表
  await pool.execute(`
    CREATE TABLE IF NOT EXISTS wechat_events (
      id VARCHAR(64) PRIMARY KEY,
      chat_name VARCHAR(200) NOT NULL DEFAULT '',
      sender VARCHAR(200) NOT NULL DEFAULT '',
      message_text TEXT,
      message_time VARCHAR(50) DEFAULT '',
      captured_at VARCHAR(50) DEFAULT '',
      stocks_json TEXT,
      created_at BIGINT DEFAULT 0,
      INDEX idx_wechat_events_created (created_at),
      INDEX idx_wechat_events_sender (sender(100))
    )
  `);
  // 新增 category 列（已有表则 ALTER）
  try {
    await pool.execute(`ALTER TABLE wechat_events ADD COLUMN category VARCHAR(20) NOT NULL DEFAULT 'stock_pick'`);
    console.log('已添加 wechat_events.category 列');
  } catch (e) {
    // 列已存在则忽略
  }
  // 新增 updated_at 列（已有表则 ALTER）
  try {
    await pool.execute(`ALTER TABLE wechat_events ADD COLUMN updated_at BIGINT NOT NULL DEFAULT 0`);
    console.log('已添加 wechat_events.updated_at 列');
  } catch (e) {
    // 列已存在则忽略
  }
  try {
    await pool.execute(`ALTER TABLE wechat_events ADD INDEX idx_wechat_events_updated (updated_at)`);
  } catch (_) { /* 忽略 */ }
  // 新增 is_manual 列：标记用户手动分类的消息
  try {
    await pool.execute(`ALTER TABLE wechat_events ADD COLUMN is_manual TINYINT DEFAULT 0`);
    console.log('已添加 wechat_events.is_manual 列');
  } catch (e) { /* 列已存在则忽略 */ }
  // 新增 urls_json 列：存储消息中的链接
  try {
    await pool.execute(`ALTER TABLE wechat_events ADD COLUMN urls_json TEXT`);
    console.log('已添加 wechat_events.urls_json 列');
  } catch (e) { /* 列已存在则忽略 */ }

  // 投资人追踪表：从推票日开始追踪，记录发布日开/收盘价、累计涨跌幅
  await pool.execute(`
    CREATE TABLE IF NOT EXISTS wechat_tracking (
      id VARCHAR(64) PRIMARY KEY,
      event_id VARCHAR(64) NOT NULL,
      chat_name VARCHAR(200) DEFAULT '',
      sender VARCHAR(200) NOT NULL DEFAULT '',
      stock_code VARCHAR(20) NOT NULL,
      stock_name VARCHAR(100) NOT NULL DEFAULT '',
      pick_date DATE NOT NULL,
      pick_open_price DECIMAL(10,3),
      pick_close_price DECIMAL(10,3),
      pick_change_percent DECIMAL(6,2),
      entry_type TINYINT(1) NOT NULL DEFAULT 0 COMMENT '0=开盘买入 1=尾盘买入',
      latest_date DATE,
      latest_close_price DECIMAL(10,3),
      total_change_percent DECIMAL(6,2),
      total_change_amount DECIMAL(10,3),
      pick_message TEXT,
      created_at BIGINT NOT NULL DEFAULT 0,
      updated_at BIGINT NOT NULL DEFAULT 0,
      UNIQUE KEY uk_event_stock (event_id, stock_code),
      INDEX idx_tracking_sender (sender(100)),
      INDEX idx_tracking_pick_date (pick_date)
    )
  `);
  // 旧表结构升级：补齐新字段
  for (const col of [
    'pick_open_price DECIMAL(10,3)',
    'pick_change_percent DECIMAL(6,2)',
    'latest_date DATE',
    'latest_close_price DECIMAL(10,3)',
    'total_change_percent DECIMAL(6,2)',
    'total_change_amount DECIMAL(10,3)'
  ]) {
    try { await pool.execute(`ALTER TABLE wechat_tracking ADD COLUMN ${col}`); } catch (e) {}
  }
  // 锁定标记：锁定后不再刷新股价
  try { await pool.execute('ALTER TABLE wechat_tracking ADD COLUMN locked TINYINT(1) NOT NULL DEFAULT 0'); } catch (e) {}
  // 止盈点数：达到该涨幅后自动锁定
  try { await pool.execute('ALTER TABLE wechat_tracking ADD COLUMN target_profit_percent DECIMAL(6,2) DEFAULT 5.00'); } catch (e) {}
  // 有效止盈相关字段（T+1规则：D0涨幅>5%时需D1开盘仍保持>=5%才算有效止盈）
  try { await pool.execute('ALTER TABLE wechat_tracking ADD COLUMN d1_open_change_percent DECIMAL(6,2)'); } catch (e) {}
  try { await pool.execute('ALTER TABLE wechat_tracking ADD COLUMN entry_type TINYINT(1) NOT NULL DEFAULT 0'); } catch (e) {}
  try { await pool.execute('ALTER TABLE wechat_tracking ADD COLUMN is_effective_profit TINYINT(1) NOT NULL DEFAULT 0'); } catch (e) {}
  try { await pool.execute('ALTER TABLE wechat_tracking ADD COLUMN effective_profit_day_index INT'); } catch (e) {}
  try { await pool.execute('ALTER TABLE wechat_tracking ADD COLUMN effective_profit_percent DECIMAL(6,2)'); } catch (e) {}
  try { await pool.execute('ALTER TABLE wechat_tracking ADD COLUMN deleted_at BIGINT NULL DEFAULT NULL'); } catch (e) {}
  // 废弃旧字段（不删，保留兼容）

  // 每日股价追踪表：记录推票后每个交易日的开/收盘价、当日涨跌幅、累计涨跌幅
  await pool.execute(`
    CREATE TABLE IF NOT EXISTS wechat_tracking_daily (
      id VARCHAR(64) PRIMARY KEY,
      tracking_id VARCHAR(64) NOT NULL,
      trade_date DATE NOT NULL,
      day_index INT NOT NULL DEFAULT 0,
      open_price DECIMAL(10,3),
      close_price DECIMAL(10,3),
      high_price DECIMAL(10,3),
      low_price DECIMAL(10,3),
      day_change_percent DECIMAL(6,2),
      total_change_percent DECIMAL(6,2),
      total_change_amount DECIMAL(10,3),
      updated_at BIGINT NOT NULL DEFAULT 0,
      UNIQUE KEY uk_tracking_date (tracking_id, trade_date),
      INDEX idx_daily_tracking (tracking_id),
      INDEX idx_daily_date (trade_date)
    )
  `);

  // 启动时仅修复非法分类（null/空/非合法值）
  // 正常已分类的消息不再重跑 categorizeMessage：
  //   硬编码权重依赖学习规则数量，规则数变→权重变→分类变，动态不稳定
  //   所以只有手动修改（is_manual=1）和"非法分类修复"两种途径改历史分类
  try {
    const [badRows] = await pool.query(
      `SELECT id, message_text, stocks_json FROM wechat_events
        WHERE is_manual = 0
          AND (category IS NULL OR category = ''
               OR (category != 'stock_pick' AND category != 'market_news' AND category != 'marketing'))`
    );
    let fixed = 0;
    for (const r of badRows) {
      const newCat = await categorizeMessage(r.message_text, r.stocks_json);
      await pool.execute('UPDATE wechat_events SET category = ? WHERE id = ?', [newCat, r.id]);
      fixed++;
    }
    if (fixed > 0) {
      console.log(`启动时修复了 ${fixed} 条非法分类的历史微信消息`);
    } else {
      console.log('启动分类检查：所有历史消息分类合法');
    }
  } catch (e) {
    console.error('启动分类修复失败:', e.message);
  }

  // 清理旧微信消息接口
  app.delete('/api/wechat/db/clear', async (req, res) => {
    try {
      const [result] = await pool.execute('DELETE FROM wechat_events');
      res.json({ cleared: result.affectedRows });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // 黑名单 CRUD
  app.get('/api/wechat/blacklist', async (req, res) => {
    try {
      const [rows] = await pool.query('SELECT * FROM wechat_blacklist ORDER BY created_at DESC');
      res.json(rows.map(r => ({
        id: r.id, type: r.type, value: r.value,
        note: r.note || '', enabled: !!r.enabled, createdAt: r.created_at
      })));
    } catch (err) { res.status(500).json({ error: err.message }); }
  });

  app.post('/api/wechat/blacklist', async (req, res) => {
    try {
      let { type, value, note = '' } = req.body || {};
      value = String(value || '').trim();
      type = ['sender', 'chat_name', 'keyword'].includes(type) ? type : 'keyword';
      if (!value) return res.status(400).json({ error: '值不能为空' });
      const id = genId();
      const now = Date.now();
      await pool.execute(
        `INSERT INTO wechat_blacklist (id, type, value, note, enabled, created_at)
         VALUES (?, ?, ?, ?, 1, ?)
         ON DUPLICATE KEY UPDATE note=VALUES(note), enabled=1`,
        [id, type, value, note, now]
      );
      clearBlacklistCache();
      const [rows] = await pool.query('SELECT * FROM wechat_blacklist WHERE type = ? AND value = ?', [type, value]);
      res.json(rows[0] || { id, type, value });
    } catch (err) { res.status(500).json({ error: err.message }); }
  });

  app.delete('/api/wechat/blacklist/:id', async (req, res) => {
    try {
      await pool.execute('DELETE FROM wechat_blacklist WHERE id = ?', [req.params.id]);
      clearBlacklistCache();
      res.json({ ok: true });
    } catch (err) { res.status(500).json({ error: err.message }); }
  });

  app.put('/api/wechat/blacklist/:id', async (req, res) => {
    try {
      const { note, enabled } = req.body || {};
      if (note !== undefined) await pool.execute('UPDATE wechat_blacklist SET note = ? WHERE id = ?', [note, req.params.id]);
      if (enabled !== undefined) await pool.execute('UPDATE wechat_blacklist SET enabled = ? WHERE id = ?', [enabled ? 1 : 0, req.params.id]);
      clearBlacklistCache();
      res.json({ ok: true });
    } catch (err) { res.status(500).json({ error: err.message }); }
  });

  // 会话跳过规则（给 Python monitor 用，同时也给前端面板展示）
  // 从 wechat_blacklist 表读取 type='session_keyword' 的记录
  app.get('/api/wechat/session-skip-rules', async (req, res) => {
    try {
      const [rows] = await pool.query(
        `SELECT id, value, note, enabled FROM wechat_blacklist
         WHERE type = 'session_keyword' AND enabled = 1`
      );
      res.json({
        keywords: rows.map(r => r.value),
        rules: rows.map(r => ({ id: r.id, value: r.value, note: r.note, enabled: !!r.enabled })),
      });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });
  app.get('/api/wechat/whitelist', async (req, res) => {
    try {
      const [rows] = await pool.query('SELECT * FROM wechat_whitelist ORDER BY created_at DESC');
      res.json(rows.map(r => ({ id: r.id, nickname: r.nickname, note: r.note, enabled: !!r.enabled, createdAt: r.created_at })));
    } catch (err) { res.status(500).json({ error: err.message }); }
  });

  app.post('/api/wechat/whitelist', async (req, res) => {
    try {
      const { nickname, note = '' } = req.body || {};
      if (!nickname?.trim()) return res.status(400).json({ error: '昵称不能为空' });
      const id = genId();
      const now = Date.now();
      await pool.execute('INSERT INTO wechat_whitelist (id, nickname, note, enabled, created_at) VALUES (?, ?, ?, 1, ?) ON DUPLICATE KEY UPDATE note=VALUES(note), enabled=1',
        [id, nickname.trim(), note, now]);
      const [rows] = await pool.query('SELECT * FROM wechat_whitelist WHERE nickname = ?', [nickname.trim()]);
      res.json({ id: rows[0].id, nickname: rows[0].nickname, note: rows[0].note, enabled: !!rows[0].enabled });
    } catch (err) { res.status(500).json({ error: err.message }); }
  });

  app.delete('/api/wechat/whitelist/:id', async (req, res) => {
    try {
      await pool.execute('DELETE FROM wechat_whitelist WHERE id = ?', [req.params.id]);
      res.json({ ok: true });
    } catch (err) { res.status(500).json({ error: err.message }); }
  });

  app.put('/api/wechat/whitelist/:id', async (req, res) => {
    try {
      const { note, enabled } = req.body || {};
      if (note !== undefined) await pool.execute('UPDATE wechat_whitelist SET note = ? WHERE id = ?', [note, req.params.id]);
      if (enabled !== undefined) await pool.execute('UPDATE wechat_whitelist SET enabled = ? WHERE id = ?', [enabled ? 1 : 0, req.params.id]);
      res.json({ ok: true });
    } catch (err) { res.status(500).json({ error: err.message }); }
  });

  // 白名单消息 AI 汇总
  app.post('/api/wechat/whitelist/summarize', async (req, res) => {
    try {
      const { nickname, days = 7, category } = req.body || {};
      const daysNum = Math.max(1, Math.min(30, Number(days) || 7));
      const since = Date.now() - daysNum * 86400000;

      let rows;
      if (nickname) {
        [rows] = await pool.query(
          'SELECT * FROM wechat_events WHERE sender = ? AND created_at >= ? ORDER BY created_at DESC',
          [nickname, since]
        );
      } else {
        const [wl] = await pool.query('SELECT nickname FROM wechat_whitelist WHERE enabled = 1');
        const names = wl.map(w => w.nickname);
        if (!names.length) return res.status(400).json({ error: '白名单为空，请先添加昵称' });
        const placeholders = names.map(() => '?').join(',');
        [rows] = await pool.query(
          `SELECT * FROM wechat_events WHERE sender IN (${placeholders}) AND created_at >= ? ORDER BY created_at DESC`,
          [...names, since]
        );
      }

      if (!rows.length) return res.json({ summary: '', totalMessages: 0, periodDays: daysNum, filteredOut: 0 });

      // 智能过滤：分离行情分析消息和营销消息
      let marketRows = rows.filter(r => !isMarketingMessage(r.message_text));
      let filteredOut = rows.length - marketRows.length;

      // 如果指定了 category，进一步过滤
      if (category && category !== 'all') {
        const beforeCategoryFilter = marketRows.length;
        const filtered = [];
        for (const r of marketRows) {
          const cat = await categorizeMessage(r.message_text, r.stocks_json);
          if (cat === category) filtered.push(r);
        }
        marketRows = filtered;
        filteredOut += beforeCategoryFilter - marketRows.length;
      }

      if (!marketRows.length) {
        return res.json({
          summary: category && category !== 'all'
            ? `⚠️ 所选时间范围内没有${category === 'stock_pick' ? '推票' : '行情资讯'}类消息。`
            : '⚠️ 所选时间范围内的消息均为营销推广类内容，未检测到有价值的行情分析消息。',
          totalMessages: rows.length,
          filteredOut,
          periodDays: daysNum,
          sources: [...new Set(rows.map(r => r.sender))]
        });
      }

      const messages = marketRows.map(r => ({
        sender: r.sender,
        time: r.created_at,
        message: r.message_text,
        stocks: JSON.parse(r.stocks_json || '[]').map(s => s.name + ' ' + s.code),
      }));

      const systemPrompt = `你是一个A股市场分析助手。请根据以下白名单用户在过去${daysNum}天内发送的消息，生成一份结构化分析报告，包含：
1. 【消息摘要】他们主要讨论了什么内容（2-3句话）
2. 【行情判断】对未来行情的看法（看涨/看跌/震荡，以及理由）
3. 【热门股票】统计提到最多的股票，列出前10只，包含代码和提及次数

输出使用markdown格式。严格基于提供的消息内容进行分析，不要编造信息。`;

      const text = JSON.stringify(messages, null, 2);
      const userPrompt = `以下是过去${daysNum}天白名单用户的行情分析类消息（已自动过滤营销推广内容）：\n\n${text}\n\n请生成分析报告。`;

      const [routeRows] = await pool.query("SELECT setting_value FROM ai_settings WHERE setting_key = 'ai_model_routes' AND user_id = ?", [req.user.id]);
      let marketModel = 'agnes-2.0-flash';
      try { marketModel = JSON.parse(routeRows[0]?.setting_value || '{}').market || marketModel; } catch (_) {}
      const summary = await callAI(systemPrompt, userPrompt, null, marketModel, 60000, 2000);
      res.json({
        summary,
        totalMessages: rows.length,
        analyzedMessages: marketRows.length,
        filteredOut,
        periodDays: daysNum,
        sources: [...new Set(marketRows.map(r => r.sender))]
      });
    } catch (err) {
      console.error('AI汇总失败:', err);
      res.status(500).json({ error: err.message });
    }
  });

  // 自定义行情分析：用户选择多条消息 → AI + 联网搜索综合分析
  app.post('/api/wechat/ai/market-analysis', async (req, res) => {
    try {
      const { events: pickedEvents = [], days = 7 } = req.body || {};
      if (!Array.isArray(pickedEvents) || !pickedEvents.length) {
        return res.status(400).json({ error: '请先选择至少一条消息' });
      }
      const daysNum = Math.max(1, Math.min(30, Number(days) || 7));

      // 从所选消息中提取关键词，用于联网搜索补充上下文
      const keywords = new Set();
      for (const e of pickedEvents) {
        const text = String(e.message || '');
        // 提取6位股票代码
        const codes = text.match(/\d{6}/g) || [];
        codes.forEach(c => keywords.add(c));
        // 提取【】里的内容
        const brackets = text.match(/【([^】]{2,20})】/g) || [];
        brackets.forEach(b => {
          const name = b.replace(/[【】\s]/g, '').replace(/\d{6}/g, '').trim();
          if (name && name.length >= 2) keywords.add(name);
        });
        // 提取发送人/聊天名
        if (e.sender) keywords.add(String(e.sender));
      }

      // 联网搜索（基于关键词，最多搜索5次）
      let searchContext = '';
      try {
        const searchList = [...keywords].slice(0, 5);
        const allResults = [];
        for (const kw of searchList) {
          if (!kw || kw.length < 2) continue;
          try {
            const query = /^\d{6}$/.test(kw)
              ? `${kw} 股票 最新行情 分析`
              : `${kw} A股 最新行情 今日`;
            const searchResult = await WebSearchFn(query, 3);
            if (searchResult && searchResult.length) {
              for (const r of searchResult) {
                if (r && (r.title || r.snippet || r.content)) {
                  allResults.push(`[搜索"${kw}"] ${r.title || ''}\n${r.snippet || r.content || ''}`.trim());
                }
              }
            }
          } catch (_) { /* 单次搜索失败不影响整体 */ }
        }
        if (allResults.length) {
          searchContext = `\n\n========== 联网搜索补充信息（最近 ${daysNum} 天相关）==========\n${allResults.join('\n------\n')}\n====================`;
        }
      } catch (searchErr) {
        console.warn('[market-analysis] 联网搜索失败，使用本地消息:', searchErr.message);
      }

      const messages = pickedEvents.map((e, i) => `--- 第${i+1}条 [${_catLabel(e.category)}] ${e.sender || e.chatName || '匿名'} ${e.time || ''} ---\n${e.message || ''}${Array.isArray(e.stocks) && e.stocks.length ? '\n涉及股票: ' + e.stocks.join('、') : ''}`).join('\n\n');

      const kwList = [...keywords].slice(0, 10).join('、');
      const systemPrompt = `你是一个专业的A股市场分析顾问，擅长结合消息面+基本面+技术面+市场情绪进行综合分析。

分析要求：
1. 先对用户选择的消息做结构化摘要：谁在什么时候说了什么、核心观点是什么
2. 提取消息中涉及的所有股票/板块/概念，分类列出来（推票类/行情类）
3. 结合联网搜索补充的实时公开数据，对消息中的股票/板块进行验证：近期走势、资金面、重要公告/新闻
4. 给出整体行情判断：短期情绪、方向（看涨/看跌/震荡）、理由
5. 给出风险提示和操作建议（保守/中性/激进）
6. 输出Markdown格式，分章节，条理清晰，不编造信息。搜索上下文仅供参考，不要当作消息发送者的原话。`;

      const userPrompt = `以下是用户选择的微信消息（共${pickedEvents.length}条，时间范围约最近${daysNum}天）：\n\n${messages}${searchContext}\n\n${kwList ? `消息涉及关键词：${kwList}` : ''}\n\n请根据以上内容，结合联网搜索到的最新公开数据，生成一份详细的结构化A股行情分析报告。`;

      const [routeRows] = await pool.query("SELECT setting_value FROM ai_settings WHERE setting_key = 'ai_model_routes' AND user_id = ?", [req.user.id]);
      let marketModel = 'agnes-2.0-flash';
      try { marketModel = JSON.parse(routeRows[0]?.setting_value || '{}').market || marketModel; } catch (_) {}
      const summary = await callAI(systemPrompt, userPrompt, null, marketModel, 120000, 4000);
      res.json({
        summary,
        totalMessages: pickedEvents.length,
        searchedKeywords: [...keywords],
        hasSearch: Boolean(searchContext),
      });
    } catch (err) {
      console.error('[market-analysis] 分析失败:', err);
      res.status(500).json({ error: err.message });
    }
  });

  function _catLabel(cat) {
    return { stock_pick: '推票消息', market_news: '行情消息', marketing: '营销消息', refund: '退票消息', other: '其他消息' }[cat] || (cat || '未知');
  }

  // 简单的联网搜索：基于公开API或搜索抓取，失败时返回空数组
  async function WebSearchFn(query, num = 3) {
    const results = [];
    if (!query) return results;
    try {
      // 方案1：使用 trae-api-cn 搜索代理（如可用）
      try {
        const enc = encodeURIComponent(query);
        const res = await fetch(
          `https://trae-api-cn.mchost.guru/api/ide/v1/web_search?query=${enc}&num=${Math.min(10, num)}`,
          { signal: AbortSignal.timeout(10000), headers: { 'Accept': 'application/json' } }
        );
        if (res.ok) {
          const data = await res.json();
          const arr = Array.isArray(data) ? data : (data?.results || data?.data || []);
          for (const r of arr) {
            if (r && (r.title || r.snippet || r.content || r.desc)) {
              results.push({
                title: r.title || '',
                snippet: r.snippet || r.content || r.desc || '',
                url: r.url || r.link || ''
              });
            }
          }
          if (results.length) return results.slice(0, num);
        }
      } catch (_) {}

      // 方案2：使用 DuckDuckGo Instant Answer API（轻量级）
      try {
        const enc = encodeURIComponent(query);
        const res = await fetch(
          `https://api.duckduckgo.com/?q=${enc}&format=json&no_html=1&skip_disambig=1`,
          { signal: AbortSignal.timeout(8000) }
        );
        if (res.ok) {
          const data = await res.json();
          if (data?.AbstractText) {
            results.push({ title: data.AbstractSource || 'DuckDuckGo', snippet: data.AbstractText, url: data.AbstractURL || '' });
          }
          if (Array.isArray(data?.RelatedTopics)) {
            for (const t of data.RelatedTopics.slice(0, num)) {
              if (t?.Text) results.push({ title: t.FirstURL || '', snippet: t.Text, url: t.FirstURL || '' });
            }
          }
          if (results.length) return results.slice(0, num);
        }
      } catch (_) {}
    } catch (e) {
      console.warn('[WebSearchFn] 搜索失败:', e.message);
    }
    return results;
  }

  // 黑名单表：命中则跳过（不入库、不提取、不追踪）
  await pool.execute(`
    CREATE TABLE IF NOT EXISTS wechat_blacklist (
      id VARCHAR(64) PRIMARY KEY,
      type VARCHAR(20) NOT NULL DEFAULT 'keyword',  -- sender / chat_name / keyword
      value VARCHAR(500) NOT NULL DEFAULT '',
      note VARCHAR(500) DEFAULT '',
      enabled TINYINT DEFAULT 1,
      created_at BIGINT DEFAULT 0,
      UNIQUE KEY uk_type_value (type, value)
    )
  `);
  console.log('微信黑名单表初始化完成');

  // 白名单表
  await pool.execute(`
    CREATE TABLE IF NOT EXISTS wechat_whitelist (
      id VARCHAR(64) PRIMARY KEY,
      nickname VARCHAR(200) NOT NULL DEFAULT '',
      note VARCHAR(500) DEFAULT '',
      enabled TINYINT DEFAULT 1,
      created_at BIGINT DEFAULT 0,
      UNIQUE KEY uk_nickname (nickname)
    )
  `);

  console.log('微信白名单表初始化完成');
  
  // 分类反馈表（记录用户对分类是否正确的反馈，用于规则优化）
  await pool.execute(`
    CREATE TABLE IF NOT EXISTS wechat_category_feedback (
      id BIGINT PRIMARY KEY AUTO_INCREMENT,
      event_id VARCHAR(64) DEFAULT '',
      message_text TEXT,
      predicted_category VARCHAR(32) NOT NULL,
      user_correct TINYINT DEFAULT NULL,  -- 1=分类正确, 0=分类错误
      user_corrected_category VARCHAR(32) DEFAULT '',
      created_at BIGINT DEFAULT 0,
      INDEX idx_predicted (predicted_category),
      INDEX idx_created (created_at)
    )
  `);
  console.log('微信分类反馈表初始化完成');
  
  // 分类规则学习表（根据反馈动态调整关键词权重）
  await pool.execute(`
    CREATE TABLE IF NOT EXISTS wechat_category_rules (
      id BIGINT PRIMARY KEY AUTO_INCREMENT,
      category VARCHAR(32) NOT NULL,
      keyword VARCHAR(200) NOT NULL,
      weight INT DEFAULT 1,          -- 正=加分, 负=减分
      correct_count INT DEFAULT 0,   -- 正确命中次数
      wrong_count INT DEFAULT 0,     -- 误判次数
      created_at BIGINT DEFAULT 0,
      updated_at BIGINT DEFAULT 0,
      UNIQUE KEY uk_category_keyword (category, keyword)
    )
  `);
  console.log('微信分类规则学习表初始化完成');

  // 系统分类规则表（内置规则，可启用/禁用，可调整权重）
  await pool.execute(`
    CREATE TABLE IF NOT EXISTS wechat_category_system_rules (
      id INT PRIMARY KEY AUTO_INCREMENT,
      category VARCHAR(32) NOT NULL,
      rule_type VARCHAR(32) NOT NULL,
      pattern TEXT NOT NULL,
      enabled TINYINT DEFAULT 1,
      weight INT DEFAULT 1,
      description VARCHAR(255) DEFAULT '',
      created_at BIGINT DEFAULT 0,
      updated_at BIGINT DEFAULT 0,
      INDEX idx_category (category)
    )
  `);
  console.log('微信系统分类规则表初始化完成');

  // 推荐逻辑训练样本表
  await pool.execute(`
    CREATE TABLE IF NOT EXISTS wechat_logic_training (
      event_id VARCHAR(64) PRIMARY KEY,
      original_text TEXT,
      stocks_json TEXT,
      sender VARCHAR(200) DEFAULT '',
      created_at BIGINT DEFAULT 0
    )
  `);
  console.log('推荐逻辑训练样本表初始化完成');

  // 初始化系统规则（确保所有默认规则都存在，不覆盖用户已修改的）
  const [existingSystemRules] = await pool.query('SELECT COUNT(*) AS cnt FROM wechat_category_system_rules');
  if (existingSystemRules[0].cnt === 0) {
    const now = Date.now();
    const systemRules = [
      // 营销消息识别规则
      ['marketing', 'regex', '合作|加入|办一个|办理|会员|服务|咨询', 1, 3, '营销：合作/加入/办理等关键词'],
      ['marketing', 'regex', '元/(月|年|个月|季度|周期)', 1, 3, '营销：费用模式'],
      ['marketing', 'regex', '\\d{3,4}元', 1, 2, '营销：3-4位金额'],
      ['marketing', 'regex', '不是荐股|不构成投资建议|仅供.*参考', 1, 2, '营销：免责声明'],
      ['marketing', 'regex', '投资有风险.*入市须谨慎|入市有风险', 1, 2, '营销：风险提示'],
      ['marketing', 'regex', '老师|投顾|助理|客服|顾问', 1, 2, '营销：角色称谓'],
      ['marketing', 'regex', '添加|加微信|添加微信|扫码|二维码', 1, 2, '营销：联系方式'],
      ['marketing', 'regex', '名额|限量|限时|优惠|折扣|涨价', 1, 2, '营销：促销词汇'],
      ['marketing', 'regex', '回复.*数字|回复\\[\\d+\\]', 1, 2, '营销：回复指令'],
      ['marketing', 'keyword', '办一个', 1, 3, '营销关键词：办一个'],
      ['marketing', 'keyword', '518元', 1, 3, '营销关键词：518元'],
      ['marketing', 'keyword', '2980元', 1, 3, '营销关键词：2980元'],
      ['marketing', 'keyword', '课程', 1, 2, '营销关键词：课程'],
      ['marketing', 'keyword', '学员', 1, 2, '营销关键词：学员'],
      ['marketing', 'keyword', '直播回放', 1, 2, '营销关键词：直播回放'],
      ['marketing', 'keyword', '领取福利', 1, 2, '营销关键词：领取福利'],
      ['marketing', 'keyword', '新客户特惠', 1, 2, '营销关键词：新客户特惠'],
      ['marketing', 'keyword', '官方指导价', 1, 2, '营销关键词：官方指导价'],
      // 推票消息识别规则
      ['stock_pick', 'regex', '\\d{6}', 1, 2, '推票：6位股票代码'],
      ['stock_pick', 'regex', '【[^】]+\\s+\\d{6}\\s*】', 1, 3, '推票：【名称 代码】格式'],
      ['stock_pick', 'regex', '【[#⭕🔥]?\\s*[^】]{2,10}\\s*】', 1, 1, '推票：括号内股票名'],
      ['stock_pick', 'keyword', '涨停', 1, 2, '推票回顾：涨停'],
      ['stock_pick', 'keyword', '跌停', 1, 2, '推票回顾：跌停'],
      ['stock_pick', 'keyword', 'T+1', 1, 2, '推票回顾：T+1'],
      ['stock_pick', 'keyword', '连板', 1, 2, '推票回顾：连板'],
      ['stock_pick', 'keyword', '封板', 1, 2, '推票回顾：封板'],
      ['stock_pick', 'keyword', '打板', 1, 2, '推票回顾：打板'],
      ['stock_pick', 'keyword', '强势涨停', 1, 2, '推票回顾：强势涨停'],
      ['stock_pick', 'keyword', '两连板', 1, 2, '推票回顾：两连板'],
      ['stock_pick', 'keyword', '2连板', 1, 2, '推票回顾：2连板'],
      ['stock_pick', 'keyword', '3连板', 1, 2, '推票回顾：3连板'],
      ['stock_pick', 'keyword', '累计涨', 1, 2, '推票回顾：累计涨'],
      ['stock_pick', 'keyword', 'T+0', 1, 2, '推票回顾：T+0'],
      ['stock_pick', 'keyword', '今日早盘观察', 1, 2, '推票：今日早盘观察'],
      ['stock_pick', 'keyword', '短线优选', 1, 2, '推票：短线优选'],
      ['stock_pick', 'keyword', '每日推荐', 1, 2, '推票：每日推荐'],
      ['stock_pick', 'keyword', '每日掘金', 1, 2, '推票：每日掘金'],
      ['stock_pick', 'keyword', '票来了', 1, 2, '推票：票来了'],
      // 行情消息识别规则
      ['market_news', 'keyword', '放量', 1, 1, '行情：放量'],
      ['market_news', 'keyword', '反弹', 1, 1, '行情：反弹'],
      ['market_news', 'keyword', '量能', 1, 1, '行情：量能'],
      ['market_news', 'keyword', '板块', 1, 1, '行情：板块'],
      ['market_news', 'keyword', '大盘', 1, 1, '行情：大盘'],
      ['market_news', 'keyword', '走势', 1, 1, '行情：走势'],
      ['market_news', 'keyword', '趋势', 1, 1, '行情：趋势'],
      ['market_news', 'keyword', '主力', 1, 1, '行情：主力'],
      ['market_news', 'keyword', '资金流入', 1, 1, '行情：资金流入'],
      ['market_news', 'keyword', '资金流出', 1, 1, '行情：资金流出'],
      ['market_news', 'keyword', '拉升', 1, 1, '行情：拉升'],
      ['market_news', 'keyword', '洗盘', 1, 1, '行情：洗盘'],
      ['market_news', 'keyword', '早盘', 1, 1, '行情：早盘'],
      ['market_news', 'keyword', '尾盘', 1, 1, '行情：尾盘'],
      ['market_news', 'keyword', '震荡', 1, 1, '行情：震荡'],
      ['market_news', 'keyword', '回调', 1, 1, '行情：回调'],
      ['market_news', 'keyword', '突破', 1, 1, '行情：突破'],
      ['market_news', 'keyword', '回踩', 1, 1, '行情：回踩'],
      ['market_news', 'keyword', '企稳', 1, 1, '行情：企稳'],
      ['market_news', 'keyword', '反包', 1, 1, '行情：反包'],
      ['market_news', 'keyword', '沪指', 1, 1, '行情：沪指'],
      ['market_news', 'keyword', '深成指', 1, 1, '行情：深成指'],
      ['market_news', 'keyword', '创业板指', 1, 1, '行情：创业板指'],
      ['market_news', 'keyword', '北向资金', 1, 1, '行情：北向资金'],
      ['market_news', 'keyword', '融资融券', 1, 1, '行情：融资融券'],
      ['market_news', 'keyword', '集合竞价', 1, 1, '行情：集合竞价'],
      ['market_news', 'keyword', '牛股', 1, 1, '行情：牛股'],
      ['market_news', 'keyword', '妖股', 1, 1, '行情：妖股'],
      ['market_news', 'keyword', '龙头', 1, 1, '行情：龙头'],
      ['market_news', 'keyword', '热点', 1, 1, '行情：热点'],
      ['market_news', 'keyword', '题材', 1, 1, '行情：题材'],
    ];
    for (const [cat, type, pattern, enabled, weight, desc] of systemRules) {
      await pool.execute(
        'INSERT INTO wechat_category_system_rules (category, rule_type, pattern, enabled, weight, description, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
        [cat, type, pattern, enabled, weight, desc, now, now]
      );
    }
    console.log(`已初始化 ${systemRules.length} 条系统分类规则`);
  } else {
    // 检查并补充缺失的默认规则（不会覆盖已存在的）
    const defaultRules = [
      ['stock_pick', 'keyword', '涨停', 2, '推票回顾：涨停'],
      ['stock_pick', 'keyword', '跌停', 2, '推票回顾：跌停'],
      ['stock_pick', 'keyword', 'T+1', 2, '推票回顾：T+1'],
      ['stock_pick', 'keyword', '连板', 2, '推票回顾：连板'],
      ['marketing', 'keyword', '办一个', 3, '营销关键词：办一个'],
      ['marketing', 'keyword', '518元', 3, '营销关键词：518元'],
      ['marketing', 'keyword', '课程', 2, '营销关键词：课程'],
      ['market_news', 'keyword', '放量', 1, '行情：放量'],
      ['market_news', 'keyword', '大盘', 1, '行情：大盘'],
      ['market_news', 'keyword', '北向资金', 1, '行情：北向资金'],
    ];
    for (const [cat, type, pattern, weight, desc] of defaultRules) {
      try {
        const [existing] = await pool.query(
          'SELECT id FROM wechat_category_system_rules WHERE category = ? AND rule_type = ? AND pattern = ? LIMIT 1',
          [cat, type, pattern]
        );
        if (!existing.length) {
          await pool.execute(
            'INSERT INTO wechat_category_system_rules (category, rule_type, pattern, enabled, weight, description, created_at, updated_at) VALUES (?, ?, ?, 1, ?, ?, ?, ?)',
            [cat, type, pattern, weight, desc, Date.now(), Date.now()]
          );
        }
      } catch (e) {}
    }
  }
}

// ========== AI 设置 API ==========
app.post('/api/ai/ask', async (req, res) => {
  try {
    const question = String(req.body?.question || '').trim();
    if (!question || question.length > 4000) return res.status(400).json({ error: '问题不能为空且不能超过 4000 字' });
    const [settings] = await pool.query("SELECT setting_value FROM ai_settings WHERE setting_key = 'ai_model_routes' AND user_id = ?", [req.user.id]);
    let model = 'agnes-2.5-flash';
    try { const routes = JSON.parse(settings[0]?.setting_value || '{}'); model = routes.assistant || model; } catch (_) {}
    const answer = await callAI('你是一个耐心、谨慎的投研软件助手。解释功能和概念时使用通俗中文；涉及个股和交易时明确说明不构成投资建议，不预测确定收益。', question, null, model, 45000, 1200);
    res.json({ answer, model });
  } catch (error) { res.status(500).json({ error: error.message || 'AI 暂时不可用' }); }
});

function parseIpoCalendarHtml(html) {
  const table = html.match(/<table[^>]+id=[\"']maintable[\"'][\s\S]*?<tbody[^>]*>([\s\S]*?)<\/tbody>/i)?.[1] || '';
  const decode = value => String(value || '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;|&#160;/gi, ' ')
    .replace(/&amp;/gi, '&').replace(/&lt;/gi, '<').replace(/&gt;/gi, '>')
    .replace(/\s+/g, ' ').trim();
  const rows = [];
  for (const rowHtml of table.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/gi)) {
    const cells = [...rowHtml[1].matchAll(/<td[^>]*>([\s\S]*?)<\/td>/gi)].map(match => decode(match[1]));
    if (cells.length < 11 || !/^\d{6}$/.test(cells[0])) continue;
    rows.push({
      code: cells[0], name: cells[1], applyCode: cells[2],
      marketValue: cells[6], price: cells[7], date: cells[10],
      lotteryDate: cells[13] || '', listingDate: cells[14] || '', limit: cells[5]
    });
  }
  return rows;
}

async function fetchIpoCalendarFromThs() {
  const response = await fetch('https://data.10jqka.com.cn/ipo/xgsgyzq/', {
    headers: { 'User-Agent': 'Mozilla/5.0', Accept: 'text/html,application/xhtml+xml', Referer: 'https://data.10jqka.com.cn/' },
    signal: AbortSignal.timeout(15000)
  });
  if (!response.ok) throw new Error(`同花顺返回 HTTP ${response.status}`);
  const buf = await response.arrayBuffer();
  // 同花顺 GB2312/GBK 编码页面不能直接 response.text()，需要显式解码
  const contentType = response.headers.get('content-type') || '';
  let charset = 'utf-8';
  const cs = contentType.match(/charset=([\w-]+)/i);
  if (cs) charset = cs[1];
  let html = new TextDecoder(charset, { fatal: false }).decode(new Uint8Array(buf));
  // 如果解码后仍有大量乱码，回退到 GBK（同花顺常见编码）
  if ((html.match(/�/g) || []).length > 5) {
    html = new TextDecoder('gbk', { fatal: false }).decode(new Uint8Array(buf));
  }
  return parseIpoCalendarHtml(html);
}

// akshare 兜底：spawn 独立进程（pandas/akshare 导入较慢，仅在前端直连失败时用）
function fetchIpoCalendarFromAkshare() {
  return new Promise((resolve, reject) => {
    const { spawn } = require('node:child_process');
    const script = path.join(__dirname, 'quant', 'newstock_calendar.py');
    // 优先 quant 自带 venv（已装 akshare），其次 PYTHON_BIN，最后全局 python
    const pythonBin = process.env.PYTHON_BIN
      || (require('fs').existsSync(path.join(__dirname, 'quant', '.venv', 'Scripts', 'python.exe')) ? path.join(__dirname, 'quant', '.venv', 'Scripts', 'python.exe') : 'python');
    const child = spawn(pythonBin, [script], { cwd: __dirname, windowsHide: true });
    let output = ''; let error = ''; let done = false;
    const timer = setTimeout(() => { child.kill(); if (!done) { done = true; reject(new Error('akshare 超时')); } }, 30000);
    child.stdout.on('data', chunk => { output += chunk; });
    child.stderr.on('data', chunk => { error += chunk; });
    child.on('error', err => { clearTimeout(timer); if (!done) { done = true; reject(err); } });
    child.on('close', code => {
      clearTimeout(timer); if (done) return; done = true;
      if (code !== 0) return reject(new Error((error.trim() || '').split('\n').pop() || `akshare 退出码 ${code}`));
      try {
        const sourceMatch = error.match(/CALENDAR_SOURCE:(\S+)/);
        resolve({ rows: JSON.parse(output), source: sourceMatch ? sourceMatch[1] : 'akshare' });
      } catch (parseError) { reject(parseError); }
    });
  });
}

// 打新日历内存缓存：命中直接返回，后台按 TTL 静默刷新，避免每次请求都等 16 秒的 akshare
const IPO_CALENDAR_TTL = 10 * 60 * 1000; // 10 分钟
let _ipoCalendarCache = null;      // { rows, source, at }
let _ipoCalendarInflight = null;   // 并发请求合并为一次刷新

function refreshIpoCalendar() {
  if (_ipoCalendarInflight) return _ipoCalendarInflight;
  _ipoCalendarInflight = (async () => {
    try {
      const { rows, source } = await fetchIpoCalendarFromAkshare();
      if (!Array.isArray(rows) || !rows.length) throw new Error('akshare 无数据');
      _ipoCalendarCache = { rows, source, at: Date.now() };
    } catch (akshareError) {
      console.warn('[IpoCalendar] akshare 不可用，改用同花顺直连：', akshareError.message);
      const rows = await fetchIpoCalendarFromThs();
      _ipoCalendarCache = { rows, source: '10jqka', at: Date.now() };
    }
    return _ipoCalendarCache;
  })();
  // 用 .finally().catch() 收尾：即使刷新失败也不会产生未处理的 Promise 拒绝（否则会拖垮整个进程）
  _ipoCalendarInflight.finally(() => { _ipoCalendarInflight = null; }).catch(() => {});
  return _ipoCalendarInflight;
}

app.get('/api/newstock-calendar', async (req, res) => {
  // 有缓存立即返回（即使过期也先给旧数据），过期时后台静默刷新
  if (_ipoCalendarCache) {
    res.json({ rows: _ipoCalendarCache.rows, source: _ipoCalendarCache.source, cached: true, ageMs: Date.now() - _ipoCalendarCache.at });
    if (Date.now() - _ipoCalendarCache.at >= IPO_CALENDAR_TTL) refreshIpoCalendar().catch(() => {});
    return;
  }
  try {
    const cache = await refreshIpoCalendar();
    res.json({ rows: cache.rows, source: cache.source });
  } catch (error) {
    res.status(503).json({ error: '打新日历暂不可用', detail: error.message });
  }
});

// ===== 联网检索降级链顺序（系统设置里手动排序，设置优先于开机自检结论）=====
// 存的是搜索引擎 id 数组（JSON 字符串），如 ["searxng","bing","tavily"]；
// 未设置的引擎自动补在末尾，保证不会因为少写一个 id 就彻底丢掉某个搜索源。
function parseSearchSourceOrder(value) {
  if (Array.isArray(value)) return value;
  try {
    const parsed = JSON.parse(String(value || ''));
    return Array.isArray(parsed) ? parsed : [];
  } catch (_) {
    return [];
  }
}

// 前端设置面板据此渲染「可排序的搜索引擎清单」
app.get('/api/search/sources', (req, res) => {
  res.json({ sources: getSourceOrder() });
});

app.get('/api/ai/settings', async (req, res) => {
  try {
    const [rows] = await pool.query('SELECT setting_key, setting_value FROM ai_settings');
    const map = {};
    rows.forEach(r => {
      if (isSecret(r.setting_key)) {
        map[`${r.setting_key}_configured`] = Boolean(r.setting_value);
      } else {
        map[r.setting_key] = r.setting_value || '';
      }
    });
    // 默认模型
    if (!map.default_model) map.default_model = 'agnes-2.5-flash';
    res.json(map);
  } catch (err) {
    console.error('获取AI设置失败:', err);
    res.status(500).json({ error: '获取失败' });
  }
});

// 模型测试接口
app.post('/api/ai/test-model', async (req, res) => {
  try {
    const { model } = req.body || {};
    if (!model) return res.status(400).json({ error: '请指定模型' });
    await saveSettings(Object.fromEntries(['glm_api_key', 'agnes_api_key'].filter(key => req.body[key] !== undefined).map(key => [key, req.body[key]])));
    const result = await callAI('你是一个测试助手。', '请回复"模型测试成功"四个字。', null, model, 30000, 500);
    res.json({ result, model });
  } catch (err) {
    console.error('模型测试失败:', err);
    res.status(500).json({ error: err.message });
  }
});

// ===== 粘贴模型文档自动接入 =====
// 确定性规则解析：即使一个 Key 都没配也能用（这是该功能的主要使用场景）
function parseModelDocByRules(text) {
  const notes = [];
  let baseUrl = '';
  const baseMatch = text.match(/Base\s*URL[^\n]{0,80}?(https?:\/\/[^\s`"'<>|\])]+)/i);
  if (baseMatch) baseUrl = baseMatch[1];
  if (!baseUrl) {
    const first = text.match(/https?:\/\/[^\s`"'<>|\])]+/);
    if (first) baseUrl = first[0];
  }
  baseUrl = baseUrl.replace(/[`"'<>|\])]+$/, '').replace(/\/+$/, '');
  if (!baseUrl) notes.push('未识别到 Base URL，请手动填写');

  let modelName = '';
  const byLabel = text.match(/模型名称[\s\S]{0,120}?`([a-zA-Z0-9][a-zA-Z0-9._-]{1,60})`/);
  if (byLabel) modelName = byLabel[1];
  const models = [];
  if (modelName) models.push(modelName);
  for (const item of text.matchAll(/["']model["']\s*:\s*["']([^"']{2,60})["']/g)) {
    if (!models.includes(item[1])) models.push(item[1]);
  }
  if (!models.length) notes.push('未识别到模型名称，请手动填写');

  const titleMatch = text.match(/^\s*#\s+(.+)$/m);
  const name = (titleMatch ? titleMatch[1].trim() : '') || modelName || '';

  const hasChat = /chat\/completions/i.test(text);
  const apiStyle = hasChat ? 'openai' : (/\/v1\/messages/i.test(text) || /anthropic-version/i.test(text) ? 'anthropic' : '');
  if (!hasChat && apiStyle === 'anthropic') notes.push('文档仅提供 Anthropic Messages 接口，已按该风格接入');
  const authStyle = (/x-api-key/i.test(text) && !/Authorization\s*:\s*Bearer/i.test(text)) ? 'x-api-key' : 'bearer';

  return { partial: { name, baseUrl, authStyle, apiStyle, models }, notes };
}

// 归一化为可持久化的接入配置（缺失字段补默认值）
function buildModelConfig(input) {
  const cleanStr = value => typeof value === 'string' ? value.trim() : '';
  const models = Array.isArray(input.models) ? input.models.map(cleanStr).filter(Boolean) : [];
  const name = cleanStr(input.name) || models[0] || '自定义模型';
  const slug = (models[0] || name).toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 24).replace(/_+$/g, '') || 'model';
  const baseUrl = cleanStr(input.baseUrl).replace(/\/+$/, '');
  const apiStyle = cleanStr(input.apiStyle) === 'anthropic' ? 'anthropic' : 'openai';
  let path = cleanStr(input.path);
  if (!path.startsWith('/')) {
    const baseHasV1 = /\/v1\/?$/.test(baseUrl);
    path = apiStyle === 'anthropic'
      ? (baseHasV1 ? '/messages' : '/v1/messages')
      : (baseHasV1 ? '/chat/completions' : '/v1/chat/completions');
  }
  return {
    id: `custom-${slug}`,
    name,
    baseUrl,
    path,
    authStyle: cleanStr(input.authStyle) === 'x-api-key' ? 'x-api-key' : 'bearer',
    apiStyle,
    models,
    keyField: `custom_${slug}_api_key`
  };
}

// 让 AI 从文档里精确抽取接入配置；失败则回退到规则解析
async function extractModelConfigByAI(text, model) {
  const system = `你是大模型 API 接入配置解析器。用户会粘贴某厂商的官方 API 文档文本，请阅读后只输出一个 JSON 对象，不要 markdown 代码块、不要任何解释文字。
JSON 字段：
{"name":"模型展示名称","baseUrl":"API Base URL（例如 https://apihub.agnes-ai.com/v1）","path":"对话补全接口路径（以 / 开头，例如 /chat/completions）","authStyle":"bearer 或 x-api-key","apiStyle":"openai 或 anthropic","models":["模型ID数组"],"notes":"一句话中文说明"}
优先采用文档中的 Chat Completions（OpenAI 兼容）接口；若文档只有 Messages（Anthropic 兼容）接口，则 apiStyle 填 anthropic、path 填 /messages 或 /v1/messages。无法确定的字段填空字符串或空数组。`;
  const content = await callAI(system, `文档内容：\n${text}`, null, model, 45000, 1500);
  const start = content.indexOf('{');
  const end = content.lastIndexOf('}');
  if (start < 0 || end <= start) throw new Error('AI 未返回有效 JSON');
  const guess = JSON.parse(content.slice(start, end + 1));
  if (!guess || typeof guess !== 'object' || Array.isArray(guess)) throw new Error('AI 返回结构无效');
  return guess;
}

app.post('/api/ai/parse-model-doc', async (req, res) => {
  try {
    const text = typeof req.body?.text === 'string' ? req.body.text.slice(0, 60000).trim() : '';
    if (!text) return res.status(400).json({ error: '请粘贴模型文档内容' });

    const { partial: rulePartial, notes } = parseModelDocByRules(text);
    let source = 'rule';
    try {
      const [rows] = await pool.query("SELECT setting_value FROM ai_settings WHERE setting_key = 'default_model'");
      const aiModel = rows[0]?.setting_value || 'agnes-2.5-flash';
      const guess = await extractModelConfigByAI(text, aiModel);
      const pick = (preferred, fallback) => {
        if (Array.isArray(preferred)) return preferred.length ? preferred : fallback;
        return typeof preferred === 'string' && preferred.trim() ? preferred : fallback;
      };
      const merged = {
        name: pick(guess.name, rulePartial.name),
        baseUrl: pick(guess.baseUrl, rulePartial.baseUrl),
        path: pick(guess.path, ''),
        authStyle: pick(guess.authStyle, rulePartial.authStyle),
        apiStyle: pick(guess.apiStyle, rulePartial.apiStyle),
        models: pick(guess.models, rulePartial.models)
      };
      if (typeof guess.notes === 'string' && guess.notes.trim()) notes.push(guess.notes.trim());
      source = 'ai';
      return res.json({ ok: true, source, config: buildModelConfig(merged), notes });
    } catch (err) {
      // 未配置任何 Key 或 AI 解析失败时静默回退到规则解析
      notes.push(`AI 解析不可用，已使用规则解析（${err.message}）`);
    }
    res.json({ ok: true, source, config: buildModelConfig(rulePartial), notes });
  } catch (err) {
    console.error('解析模型文档失败:', err);
    res.status(500).json({ error: err.message });
  }
});

// 内置厂商的接口地址（与 callAI 中内置分支保持一致），供模型清单获取复用
const AI_BUILTIN_ENDPOINTS = {
  glm: { name: '智谱 GLM', keyField: 'glm_api_key', baseUrl: 'https://open.bigmodel.cn/api/paas/v4', path: '/chat/completions', authStyle: 'bearer', apiStyle: 'openai' },
  agnes: { name: 'Agnes', keyField: 'agnes_api_key', baseUrl: 'https://apihub.agnes-ai.com/v1', path: '/chat/completions', authStyle: 'bearer', apiStyle: 'openai' }
};

// 由对话补全路径推导模型清单路径：末段 chat/completions 换成 models，保留版本前缀
function deriveModelsPath(chatPath) {
  const derived = String(chatPath || '')
    .replace(/\/chat\/completions?$/i, '/models')
    .replace(/\/completions?$/i, '/models');
  if (derived && derived !== chatPath) return derived;
  // Gemini / Anthropic 等风格：/v1beta/models/xxx:generateContent 或 /v1/messages → /v1beta/models、/v1/models
  const versionMatch = String(chatPath || '').match(/^\/(v\d+[a-z]*)\//i);
  return versionMatch ? `/${versionMatch[1]}/models` : '/models';
}

// 拉取单个厂商的模型清单；返回 { ok, models } 或 { ok: false, error }
async function fetchVendorModels(vendor) {
  const baseUrl = String(vendor.baseUrl || '').trim().replace(/\/+$/, '');
  if (!/^https?:\/\//i.test(baseUrl)) return { ok: false, error: '未配置有效的 Base URL' };
  const authStyle = vendor.authStyle === 'x-api-key' ? 'x-api-key' : 'bearer';
  const apiStyle = vendor.apiStyle === 'anthropic' ? 'anthropic' : 'openai';
  const modelsPath = String(vendor.modelsPath || '').trim() || deriveModelsPath(vendor.path || '/chat/completions');
  const key = String(vendor.apiKey || '').trim();
  if (!key) return { ok: false, error: '未配置 API Key' };

  const headers = {};
  if (authStyle === 'x-api-key') headers['x-api-key'] = key;
  else headers['Authorization'] = `Bearer ${key}`;
  if (apiStyle === 'anthropic') headers['anthropic-version'] = '2023-06-01';

  const url = baseUrl + (modelsPath.startsWith('/') ? modelsPath : `/${modelsPath}`);
  try {
    const response = await fetch(url, { headers, signal: AbortSignal.timeout(20000) });
    if (!response.ok) {
      const errText = await response.text();
      const hint = response.status === 401 || response.status === 403 ? '（API Key 无效或已过期）' : '';
      return { ok: false, error: `接口返回 ${response.status}${hint}${errText ? '：' + errText.slice(0, 160) : ''}`, url };
    }
    const data = await response.json();
    const raw = Array.isArray(data) ? data
      : (Array.isArray(data?.data) ? data.data
        : (Array.isArray(data?.models) ? data.models : []));
    const models = [...new Set(raw.map(item => {
      if (typeof item === 'string') return item.trim();
      return String(item?.id || item?.name || item?.model || '').trim();
    }).filter(Boolean))];
    if (!models.length) return { ok: false, error: '接口未返回可识别的模型列表', url };
    return { ok: true, models, url };
  } catch (err) {
    return { ok: false, error: err.name === 'TimeoutError' ? '请求超时，请检查 Base URL 是否可达' : (err.message || '请求失败'), url };
  }
}

// 从接口自动获取模型列表：支持内置厂商（provider）或自定义接入配置
app.post('/api/ai/models/fetch', async (req, res) => {
  try {
    const body = req.body || {};
    const builtin = AI_BUILTIN_ENDPOINTS[String(body.provider || '')];
    const vendor = builtin
      ? { ...builtin, apiKey: await getUserSecret(builtin.keyField) }
      : {
        baseUrl: body.baseUrl,
        path: body.path,
        modelsPath: body.modelsPath,
        authStyle: body.authStyle,
        apiStyle: body.apiStyle,
        apiKey: typeof body.apiKey === 'string' ? body.apiKey.trim() : ''
      };
    if (!builtin) {
      const keyField = String(body.keyField || '');
      if (!vendor.apiKey && /^custom_[a-z0-9_]{1,48}_api_key$/.test(keyField)) vendor.apiKey = await getUserSecret(keyField);
      if (!vendor.apiKey) return res.status(400).json({ error: '请先填写该厂商的 API Key' });
    }
    const result = await fetchVendorModels(vendor);
    if (!result.ok) return res.status(502).json({ error: `获取模型列表失败：${result.error}`, url: result.url });
    res.json({ ok: true, url: result.url, models: result.models });
  } catch (err) {
    console.error('获取模型列表失败:', err);
    res.status(500).json({ error: err.message || '获取失败' });
  }
});

// 一次性获取所有已配置厂商的模型清单：内置厂商 + 全部自定义接入，按厂商分组返回
app.post('/api/ai/models/fetch-all', async (req, res) => {
  try {
    const groups = [];
    for (const [id, endpoint] of Object.entries(AI_BUILTIN_ENDPOINTS)) {
      if (id === 'alapi') continue;
      const apiKey = await getUserSecret(endpoint.keyField);
      const configured = Boolean(apiKey);
      const result = configured
        ? await fetchVendorModels({ ...endpoint, apiKey })
        : { ok: false, error: '未配置 API Key' };
      groups.push({
        id, name: endpoint.name, kind: 'builtin', keyField: endpoint.keyField, configured,
        ok: result.ok, models: result.ok ? result.models : [], error: result.ok ? '' : result.error
      });
    }
    for (const item of await getCustomModels()) {
      const apiKey = item.keyField ? await getUserSecret(item.keyField) : '';
      const configured = Boolean(apiKey);
      const result = configured
        ? await fetchVendorModels({ ...item, apiKey })
        : { ok: false, error: '未配置 API Key' };
      groups.push({
        id: item.id, name: item.name || item.id, kind: 'custom', keyField: item.keyField || '', configured,
        ok: result.ok, models: result.ok ? result.models : [], error: result.ok ? '' : result.error
      });
    }
    const totalModels = groups.reduce((sum, group) => sum + group.models.length, 0);
    res.json({ ok: true, groups, totalModels });
  } catch (err) {
    console.error('批量获取模型列表失败:', err);
    res.status(500).json({ error: err.message || '获取失败' });
  }
});

// AI 调用统计（累计 + 今日 + 近 7 天趋势 + 按模型分布）
app.get('/api/ai/usage', async (req, res) => {
  try {
    const today = new Date().toISOString().split('T')[0];
    // 累计总数
    const [totalRows] = await pool.query('SELECT COUNT(*) as total FROM ai_logs WHERE success = 1');
    const total = totalRows[0].total || 0;
    // 今日
    const [todayRows] = await pool.query(
      'SELECT COUNT(*) as count FROM ai_logs WHERE success = 1 AND DATE(created_at) = ?',
      [today]
    );
    const todayCount = todayRows[0].count || 0;
    // 今日按模型分布
    const [modelRows] = await pool.query(
      'SELECT model, COUNT(*) as count FROM ai_logs WHERE success = 1 AND DATE(created_at) = ? GROUP BY model ORDER BY count DESC',
      [today]
    );
    const byModel = modelRows.map(r => ({ model: r.model, count: r.count }));
    // 近 7 天趋势（含今天）
    const [trendRows] = await pool.query(
      "SELECT DATE(created_at) as date, COUNT(*) as count FROM ai_logs " +
      "WHERE success = 1 AND created_at >= DATE_SUB(CURDATE(), INTERVAL 6 DAY) " +
      "GROUP BY DATE(created_at) ORDER BY date ASC"
    );
    // 补齐最近 7 天，没有的天补 0
    const trend = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const dateStr = d.toISOString().split('T')[0];
      const found = trendRows.find(r => r.date === dateStr);
      trend.push({ date: dateStr, count: found ? found.count : 0 });
    }
    res.json({
      date: today,
      total,           // 累计调用
      today: todayCount, // 今日调用
      byModel,
      trend,            // 近 7 天 [{date, count}]
    });
  } catch (err) {
    console.error('获取AI使用统计失败:', err);
    res.status(500).json({ error: err.message });
  }
});

// AI 调用日志
app.get('/api/ai/logs', async (req, res) => {
  try {
    const limit = Math.min(parseInt(req.query.limit) || 50, 200);
    const offset = Math.max(parseInt(req.query.offset) || 0, 0);
    const [rows] = await pool.query(
      'SELECT id, created_at, model, provider, system_prompt_len, user_prompt_len, response_len, duration_ms, success, error_msg, request_content, response_content FROM ai_logs ORDER BY id DESC LIMIT ? OFFSET ?',
      [limit, offset]
    );
    const [countResult] = await pool.query('SELECT COUNT(*) as total FROM ai_logs');
    res.json({ logs: rows, total: countResult[0].total });
  } catch (err) {
    console.error('获取AI调用日志失败:', err);
    res.status(500).json({ error: err.message });
  }
});

// AI 调用日志：写入（内部服务回传，如量化 Python 服务的 AI 策略生成）
app.post('/api/ai/logs', async (req, res) => {
  try {
    const b = req.body || {};
    const truncate = (str, maxLen) => {
      const s = str == null ? '' : String(str);
      return !s ? '' : s.length > maxLen ? s.slice(0, maxLen) + `\n...(已截断, 共${s.length}字符)` : s;
    };
    const model = String(b.model || '').slice(0, 64);
    const provider = String(b.provider || 'quant').slice(0, 32);
    const success = b.success === false ? 0 : 1;
    await pool.execute(
      'INSERT INTO ai_logs (model, provider, system_prompt_len, user_prompt_len, response_len, duration_ms, success, error_msg, request_content, response_content) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
      [model, provider, Number(b.system_prompt_len) || 0, Number(b.user_prompt_len) || 0,
       Number(b.response_len) || 0, Number(b.duration_ms) || 0, success,
       String(b.error_msg || ''), truncate(b.request_content, 2000), truncate(b.response_content, 2000)]
    );
    if (success) {
      const today = new Date().toISOString().split('T')[0];
      await pool.execute(
        'INSERT INTO ai_usage (date, model, count) VALUES (?, ?, 1) ON DUPLICATE KEY UPDATE count = count + 1',
        [today, model]
      );
    }
    res.json({ success: true });
  } catch (err) {
    console.error('写入AI调用日志失败:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// 交易记录日志：写入（前端 useStock 调用，fire-and-forget）
app.post('/api/stocks/tx-log', async (req, res) => {
  try {
    const b = req.body || {};
    const stockId = String(b.stockId || '').slice(0, 64);
    const stockCode = String(b.stockCode || '').slice(0, 32);
    const action = String(b.action || '').slice(0, 32);
    const num = v => Number.isFinite(Number(v)) ? Number(v) : 0;
    await pool.execute(
      'INSERT INTO tx_logs (stock_id, stock_code, action, before_count, after_count, total_buy, total_sell, trade_count, detail) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
      [stockId, stockCode, action, num(b.beforeCount), num(b.afterCount), num(b.totalBuy), num(b.totalSell), num(b.tradeCount), JSON.stringify(b.detail || {})]
    );
    res.json({ ok: true });
  } catch (err) {
    console.error('写入交易日志失败:', err);
    res.status(500).json({ error: err.message });
  }
});

// 交易记录日志：查询
app.get('/api/stocks/tx-logs', async (req, res) => {
  try {
    const limit = Math.min(parseInt(req.query.limit) || 50, 200);
    const offset = Math.max(parseInt(req.query.offset) || 0, 0);
    const [rows] = await pool.query(
      'SELECT id, created_at, stock_id, stock_code, action, before_count, after_count, total_buy, total_sell, trade_count, detail FROM tx_logs ORDER BY id DESC LIMIT ? OFFSET ?',
      [limit, offset]
    );
    const [countResult] = await pool.query('SELECT COUNT(*) as total FROM tx_logs');
    res.json({ logs: rows, total: countResult[0].total });
  } catch (err) {
    console.error('获取交易日志失败:', err);
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/ai/settings', async (req, res) => {
  try {
    await saveSettings(req.body);
    // 搜索降级链顺序改完立即生效，不用重启服务
    if (req.body?.search_source_order !== undefined) setSourceOrder(parseSearchSourceOrder(req.body.search_source_order));
    res.json({ ok: true });
  } catch (err) {
    console.error('保存AI设置失败:', err);
    res.status(500).json({ error: '保存失败' });
  }
});

async function getGlmApiKey() {
  return getUserSecret('glm_api_key');
}

app.get('/api/ai/providers', (req, res) => res.json(PROVIDERS));

app.post('/api/ai/videos/generate', async (req, res) => {
  try {
    const { prompt, level } = req.body;
    const allowedLevels = ['警戒', '危险', '危机'];
    if (!prompt || !prompt.trim()) return res.status(400).json({ error: '请输入视频描述' });
    if (!allowedLevels.includes(level)) return res.status(400).json({ error: '视频档位无效' });
    const apiKey = await getGlmApiKey();
    if (!apiKey) return res.status(400).json({ error: '未配置智谱 API Key' });

    const response = await fetch('https://open.bigmodel.cn/api/paas/v4/videos/generations', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: 'cogvideox-flash',
        prompt: prompt.trim().slice(0, 512),
        size: '1024x1024',
        fps: 30
      }),
      signal: AbortSignal.timeout(60000)
    });
    if (!response.ok) throw new Error(`视频 API 请求失败 (${response.status}): ${await response.text()}`);
    const data = await response.json();
    const taskId = data.id || data.request_id;
    if (!taskId) throw new Error('视频 API 未返回任务 ID');
    res.json({ taskId, level });
  } catch (err) {
    console.error('创建AI视频失败:', err);
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/ai/videos/status/:id', async (req, res) => {
  try {
    const level = req.query.level;
    if (!['警戒', '危险', '危机'].includes(level)) return res.status(400).json({ error: '视频档位无效' });
    const apiKey = await getGlmApiKey();
    if (!apiKey) return res.status(400).json({ error: '未配置智谱 API Key' });
    const response = await fetch(`https://open.bigmodel.cn/api/paas/v4/async-result/${encodeURIComponent(req.params.id)}`, {
      headers: { 'Authorization': `Bearer ${apiKey}` },
      signal: AbortSignal.timeout(30000)
    });
    if (!response.ok) throw new Error(`查询视频任务失败 (${response.status}): ${await response.text()}`);
    const data = await response.json();
    const status = data.task_status || 'PROCESSING';
    if (status !== 'SUCCESS') return res.json({ status });

    const videoUrl = data.video_result?.[0]?.url;
    if (!videoUrl || !videoUrl.startsWith('https://')) throw new Error('视频任务未返回有效地址');
    const videoResponse = await fetch(videoUrl, { signal: AbortSignal.timeout(120000) });
    if (!videoResponse.ok) throw new Error('下载生成视频失败');
    const buffer = Buffer.from(await videoResponse.arrayBuffer());
    if (buffer.length > 100 * 1024 * 1024) throw new Error('生成视频文件过大');
    const levelFileMap = { '警戒': '1.mp4', '危险': '2.mp4', '危机': '3.mp4' };
    const filename = levelFileMap[level];
    await fs.promises.writeFile(path.join(tenantUploadDir('movie'), filename), buffer);
    res.json({ status: 'SUCCESS', videoPath: `uploads/movie/${filename}` });
  } catch (err) {
    console.error('查询AI视频失败:', err);
    res.status(500).json({ error: err.message });
  }
});

// ========== 薅羊毛 API ==========
const crypto = require('crypto');

function woolBalanceDelta(recordType, amount) {
  const value = Math.max(0, Number(amount) || 0);
  return recordType === 'spend' ? -value : value;
}

function sanitizeWoolPayload(input = {}) {
  const safeImages = Array.isArray(input.images) ? input.images.filter(item => typeof item === 'string').slice(0, 9) : [];
  return {
    name: String(input.name || '').trim().slice(0, 200),
    amount: Math.max(0, Number(input.amount) || 0),
    woolDate: String(input.woolDate || '').slice(0, 10),
    icon: String(input.icon || '').slice(0, 500),
    images: safeImages,
    note: String(input.note || '').slice(0, 500),
    recordType: input.recordType === 'spend' ? 'spend' : 'reward',
    category: String(input.category || '').trim().slice(0, 64),
    merchant: String(input.merchant || '').trim().slice(0, 120),
    paymentMethod: String(input.paymentMethod || '').trim().slice(0, 64),
    depositItemId: input.depositItemId ? String(input.depositItemId).slice(0, 64) : ''
  };
}

async function applyWoolDepositDelta(connection, depositItemId, delta, note, now, woolItemId) {
  if (!depositItemId || Math.abs(delta) < 0.005) return { transactionId: '', depositName: '', balanceAfter: null };
  const [items] = await connection.query('SELECT id, name, amount FROM deposit_items WHERE id = ? FOR UPDATE', [depositItemId]);
  if (items.length === 0) {
    const error = new Error('选择的存款小项不存在或已被删除');
    error.statusCode = 400;
    throw error;
  }
  const currentBalance = Number(items[0].amount) || 0;
  const nextBalance = currentBalance + delta;
  const transactionId = genId();
  await connection.execute('UPDATE deposit_items SET amount = ? WHERE id = ?', [nextBalance, depositItemId]);
  await connection.execute(
    'INSERT INTO deposit_transactions (id, deposit_item_id, wool_item_id, type, amount, balance_before, balance_after, note, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
    [transactionId, depositItemId, woolItemId || null, delta >= 0 ? 'add' : 'deduct', delta, currentBalance, nextBalance, String(note || '').slice(0, 200), now]
  );
  return { transactionId, depositName: items[0].name || '', balanceAfter: nextBalance };
}

async function updateWoolDepositTransaction(connection, depositItemId, transactionId, newDelta, note, now) {
  if (!depositItemId || !transactionId) return { success: false };
  const [txs] = await connection.query('SELECT * FROM deposit_transactions WHERE id = ? AND deposit_item_id = ? FOR UPDATE', [transactionId, depositItemId]);
  if (txs.length === 0) return { success: false };
  const oldDelta = Number(txs[0].amount) || 0;
  const diff = newDelta - oldDelta;
  if (Math.abs(diff) < 0.005) return { success: true, balanceAfter: Number(txs[0].balance_after) };
  const [items] = await connection.query('SELECT id, name, amount FROM deposit_items WHERE id = ? FOR UPDATE', [depositItemId]);
  if (items.length === 0) return { success: false };
  const currentBalance = Number(items[0].amount) || 0;
  const nextBalance = currentBalance + diff;
  const newBalanceBefore = Number(txs[0].balance_before) || 0;
  const newBalanceAfter = newBalanceBefore + newDelta;
  await connection.execute('UPDATE deposit_items SET amount = ? WHERE id = ?', [nextBalance, depositItemId]);
  await connection.execute(
    'UPDATE deposit_transactions SET amount = ?, type = ?, balance_after = ?, note = ? WHERE id = ?',
    [newDelta, newDelta >= 0 ? 'add' : 'deduct', newBalanceAfter, String(note || '').slice(0, 200), transactionId]
  );
  return { success: true, depositName: items[0].name || '', balanceAfter: nextBalance };
}

// 获取所有薅羊毛记录
app.get('/api/wool', async (req, res) => {
  try {
    const [rows] = await pool.query('SELECT * FROM wool_items ORDER BY wool_date DESC, created_at DESC');
    const result = rows.map(r => {
      let images = [];
      try {
        if (r.images) images = JSON.parse(r.images);
      } catch (e) { images = []; }
      // 兼容旧的单图字段
      if (r.image && images.length === 0) images = [r.image];
      return {
        id: r.id,
        name: r.name,
        amount: Number(r.amount),
        woolDate: r.wool_date,
        icon: r.icon,
        image: r.image,
        images,
        note: r.note,
        recordType: r.record_type || 'reward',
        category: r.category || '',
        merchant: r.merchant || '',
        paymentMethod: r.payment_method || '',
        depositItemId: r.deposit_item_id || '',
        depositTransactionId: r.deposit_transaction_id || '',
        createdAt: r.created_at || ''
      };
    });
    res.json(result);
  } catch (err) {
    console.error('获取薅羊毛记录失败:', err);
    res.status(500).json({ error: '获取失败' });
  }
});

// 新增薅羊毛/消费记录，并原子同步存款余额
app.post('/api/wool', async (req, res) => {
  const connection = await pool.getConnection();
  try {
    const payload = sanitizeWoolPayload(req.body);
    if (!payload.name || !payload.woolDate || payload.amount <= 0) return res.status(400).json({ error: '名称、日期和金额不能为空' });
    await connection.beginTransaction();
    const id = crypto.randomUUID();
    const now = Date.now();
    const balanceResult = await applyWoolDepositDelta(connection, payload.depositItemId, woolBalanceDelta(payload.recordType, payload.amount), (payload.recordType === 'spend' ? '消费：' : '羊毛到账：') + payload.name, now, id);
    if (balanceResult.depositName) payload.paymentMethod = balanceResult.depositName;
    await connection.execute(
      'INSERT INTO wool_items (id, name, amount, wool_date, icon, image, images, note, record_type, category, merchant, payment_method, deposit_item_id, deposit_transaction_id, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
      [id, payload.name, payload.amount, payload.woolDate, payload.icon, payload.images[0] || '', JSON.stringify(payload.images), payload.note, payload.recordType, payload.category, payload.merchant, payload.paymentMethod, payload.depositItemId || null, balanceResult.transactionId || null, now]
    );
    await connection.commit();
    res.json({ id, ...payload, depositTransactionId: balanceResult.transactionId || '', createdAt: now });
  } catch (err) {
    await connection.rollback();
    console.error('新增薅羊毛/消费记录失败:', err);
    res.status(err.statusCode || 500).json({ error: err.statusCode ? err.message : '新增失败: ' + err.message });
  } finally { connection.release(); }
});

// 薅羊毛笔记/链接 API（必须在 :id 路由之前）
// 获取笔记列表（按类型筛选）
app.get('/api/wool/notes', async (req, res) => {
  try {
    const { type } = req.query;
    let rows;
    if (type) {
      [rows] = await pool.query('SELECT * FROM wool_notes WHERE note_type = ? ORDER BY created_at DESC', [type]);
    } else {
      [rows] = await pool.query('SELECT * FROM wool_notes ORDER BY created_at DESC');
    }
    res.json(rows.map(r => ({
      id: r.id,
      noteType: r.note_type,
      title: r.title,
      content: r.content,
      createdAt: r.created_at,
      updatedAt: r.updated_at
    })));
  } catch (err) {
    console.error('获取羊毛笔记失败:', err);
    res.status(500).json({ error: '获取失败' });
  }
});

// 新增笔记
app.post('/api/wool/notes', async (req, res) => {
  try {
    const { noteType, title, content } = req.body;
    if (!noteType) return res.status(400).json({ error: '缺少noteType' });
    const id = crypto.randomUUID();
    const now = Date.now();
    await pool.execute(
      'INSERT INTO wool_notes (id, note_type, title, content, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)',
      [id, noteType, title || '', content || '', now, now]
    );
    res.json({ id, noteType, title: title || '', content: content || '', createdAt: now, updatedAt: now });
  } catch (err) {
    console.error('新增羊毛笔记失败:', err);
    res.status(500).json({ error: '新增失败' });
  }
});

// 更新笔记
app.put('/api/wool/notes/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { title, content } = req.body;
    const now = Date.now();
    const fields = [];
    const values = [];
    if (title !== undefined) { fields.push('title = ?'); values.push(title); }
    if (content !== undefined) { fields.push('content = ?'); values.push(content); }
    if (fields.length === 0) return res.json({ ok: true });
    fields.push('updated_at = ?');
    values.push(now);
    values.push(id);
    await pool.execute(`UPDATE wool_notes SET ${fields.join(', ')} WHERE id = ?`, values);
    res.json({ ok: true });
  } catch (err) {
    console.error('更新羊毛笔记失败:', err);
    res.status(500).json({ error: '更新失败' });
  }
});

// 删除笔记
app.delete('/api/wool/notes/:id', async (req, res) => {
  try {
    const { id } = req.params;
    await pool.execute('DELETE FROM wool_notes WHERE id = ?', [id]);
    res.json({ ok: true });
  } catch (err) {
    console.error('删除羊毛笔记失败:', err);
    res.status(500).json({ error: '删除失败' });
  }
});

// AI 整理笔记
app.post('/api/wool/notes/organize', async (req, res) => {
  try {
    const { content, model } = req.body;
    if (!content || !content.trim()) return res.status(400).json({ error: '内容为空' });

    const systemPrompt = `## 硬性强制要求（必须全部遵守，缺一不可）
1. 完整保留原文里每一条链接，mp://、http、https全部一字不差，严禁遗漏、删减、篡改任意链接；
2. 先剔除重复重复的整段酒店复制文案，只保留一份完整酒店资源，去除冗余重复开场白；
3. 统一划分4大板块，板块分割线统一用-------------------：
【🏨酒店专区】、【🍜外卖专区】、【🚕打车专区】、【🎞电影票专区】
4. 每个板块内按平台归类：酒店顺序美团→同程→飞猪；外卖顺序美团→饿了么→淘宝外卖；打车滴滴/花小猪/T3依次排列；
5. 同平台内区分酒店券、民宿券分开罗列，每条格式统一：emoji 【优惠名称】👉链接；多链接用数字1/2/3编号分行；
6. 原文附带的提示语（酒店更新、全国5折、每日可领、全部领取比价、领不了备用券说明）全部整合到对应板块末尾或全文最后，不零散穿插在链接中间；
7. 删除重复堆砌的相同引导句，只保留一次通用提醒，排版分行留白均匀，无杂乱挤堆文字；
8. 原文末尾备用链接与领取失败说明完整保留，放在全文最底部，不丢失；
9. 禁止合并、省略任何一条优惠入口，逐条单独分行展示，清晰不混淆。
10. 优惠券链接必须完整保留，不能被修改或删除；
11.删除与链接不相关文字，例如：“都领一下 哪个便宜用哪个”不是针对具体链接进行说明的，“⭐全部领一遍，哪个大用哪个”“备用链接与领取失败说明：
如领取不了上面两个券
可以领取下面三个优惠卷”，只需保留每个链接和对每个链接的说明`;

    const userPrompt = `以下是需要整理的优惠券原文，请严格按照系统要求整理：\n\n${content.trim()}`;

    const aiResponse = await callAI(systemPrompt, userPrompt, null, model || 'glm-4-flash-250414', 60000, 4000);
    res.json({ organized: aiResponse });
  } catch (err) {
    console.error('AI整理笔记失败:', err);
    res.status(500).json({ error: '整理失败: ' + err.message });
  }
});

// ========== 股票笔记 API ==========

// 获取股票笔记列表
app.get('/api/stock/notes', async (req, res) => {
  try {
    const [rows] = await pool.query('SELECT * FROM stock_notes ORDER BY created_at DESC');
    res.json(rows.map(r => ({
      id: r.id,
      title: r.title,
      content: r.content,
      createdAt: r.created_at,
      updatedAt: r.updated_at
    })));
  } catch (err) {
    console.error('获取股票笔记失败:', err);
    res.status(500).json({ error: '获取失败' });
  }
});

// 新增股票笔记
app.post('/api/stock/notes', async (req, res) => {
  try {
    const { title, content } = req.body;
    const id = crypto.randomUUID();
    const now = Date.now();
    await pool.execute(
      'INSERT INTO stock_notes (id, title, content, created_at, updated_at) VALUES (?, ?, ?, ?, ?)',
      [id, title || '', content || '', now, now]
    );
    res.json({ id, title: title || '', content: content || '', createdAt: now, updatedAt: now });
  } catch (err) {
    console.error('新增股票笔记失败:', err);
    res.status(500).json({ error: '新增失败' });
  }
});

// 更新股票笔记
app.put('/api/stock/notes/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { title, content } = req.body;
    const now = Date.now();
    const fields = [];
    const values = [];
    if (title !== undefined) { fields.push('title = ?'); values.push(title); }
    if (content !== undefined) { fields.push('content = ?'); values.push(content); }
    if (fields.length === 0) return res.json({ ok: true });
    fields.push('updated_at = ?');
    values.push(now);
    values.push(id);
    await pool.execute(`UPDATE stock_notes SET ${fields.join(', ')} WHERE id = ?`, values);
    res.json({ ok: true });
  } catch (err) {
    console.error('更新股票笔记失败:', err);
    res.status(500).json({ error: '更新失败' });
  }
});

// 删除股票笔记
app.delete('/api/stock/notes/:id', async (req, res) => {
  try {
    const { id } = req.params;
    await pool.execute('DELETE FROM stock_notes WHERE id = ?', [id]);
    res.json({ ok: true });
  } catch (err) {
    console.error('删除股票笔记失败:', err);
    res.status(500).json({ error: '删除失败' });
  }
});

// ========== 股票观察/每日分析 ==========

// 获取观察列表（含今日分析）
app.get('/api/stock/watchlist', async (req, res) => {
  try {
    const [rows] = await pool.query(
      'SELECT * FROM stock_watchlist ORDER BY pinned DESC, sort_order ASC, created_at DESC'
    );
    const today = new Date().toISOString().slice(0, 10);
    const watchIds = rows.map(r => r.id);
    let analysisMap = {};
    if (watchIds.length > 0) {
      const placeholders = watchIds.map(() => '?').join(',');
      const [analyses] = await pool.query(
        `SELECT * FROM stock_daily_analysis WHERE watch_id IN (${placeholders}) ORDER BY date DESC`,
        watchIds
      );
      for (const a of analyses) {
        if (!analysisMap[a.watch_id]) analysisMap[a.watch_id] = [];
        analysisMap[a.watch_id].push({
          id: a.id,
          date: a.date,
          actionType: a.action_type || '',
          sentiment: a.sentiment || '',
          targetBuyPrice: a.target_buy_price != null ? String(a.target_buy_price) : null,
          targetBuyPriceHigh: a.target_buy_price_high != null ? String(a.target_buy_price_high) : null,
          targetSellPrice: a.target_sell_price != null ? String(a.target_sell_price) : null,
          targetSellPriceHigh: a.target_sell_price_high != null ? String(a.target_sell_price_high) : null,
          stopLossPrice: a.stop_loss_price != null ? String(a.stop_loss_price) : null,
          stopLossPriceHigh: a.stop_loss_price_high != null ? String(a.stop_loss_price_high) : null,
          buyShareCount: a.buy_share_count != null ? Number(a.buy_share_count) : null,
          sellShareCount: a.sell_share_count != null ? Number(a.sell_share_count) : null,
          lossShareCount: a.loss_share_count != null ? Number(a.loss_share_count) : null,
          note: a.note || '',
          nextDayNote: a.next_day_note || '',
          reviewResult: a.review_result || '',
          reviewNote: a.review_note || '',
          createdAt: a.created_at,
          updatedAt: a.updated_at
        });
      }
    }
    res.json(rows.map(r => ({
      id: r.id,
      code: r.code,
      name: r.name,
      isHolding: !!r.is_holding,
      pinned: !!r.pinned,
      sortOrder: r.sort_order || 0,
      createdAt: r.created_at,
      updatedAt: r.updated_at,
      analyses: analysisMap[r.id] || []
    })));
  } catch (err) {
    console.error('获取观察列表失败:', err);
    res.status(500).json({ error: '获取失败' });
  }
});

// 添加观察股票
app.post('/api/stock/watchlist', async (req, res) => {
  try {
    const { code, name, isHolding } = req.body;
    if (!code) return res.status(400).json({ error: '代码不能为空' });
    const id = crypto.randomUUID();
    const now = Date.now();
    await pool.execute(
      'INSERT INTO stock_watchlist (id, code, name, is_holding, pinned, sort_order, created_at, updated_at) VALUES (?, ?, ?, ?, 0, 0, ?, ?)',
      [id, code, name || code, isHolding ? 1 : 0, now, now]
    );
    res.json({ id, code, name: name || code, isHolding: !!isHolding, pinned: false, sortOrder: 0, createdAt: now, updatedAt: now, analyses: [] });
  } catch (err) {
    console.error('添加观察股票失败:', err);
    res.status(500).json({ error: '添加失败' });
  }
});

// 更新观察股票（置顶、排序、名称等）
app.put('/api/stock/watchlist/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { pinned, sortOrder, name, isHolding } = req.body;
    const now = Date.now();
    const fields = [];
    const values = [];
    if (pinned !== undefined) { fields.push('pinned = ?'); values.push(pinned ? 1 : 0); }
    if (sortOrder !== undefined) { fields.push('sort_order = ?'); values.push(sortOrder); }
    if (name !== undefined) { fields.push('name = ?'); values.push(name); }
    if (isHolding !== undefined) { fields.push('is_holding = ?'); values.push(isHolding ? 1 : 0); }
    if (fields.length === 0) return res.json({ ok: true });
    fields.push('updated_at = ?');
    values.push(now, id);
    await pool.execute(`UPDATE stock_watchlist SET ${fields.join(', ')} WHERE id = ?`, values);
    res.json({ ok: true });
  } catch (err) {
    console.error('更新观察股票失败:', err);
    res.status(500).json({ error: '更新失败' });
  }
});

// 删除观察股票
app.delete('/api/stock/watchlist/:id', async (req, res) => {
  try {
    const { id } = req.params;
    await pool.execute('DELETE FROM stock_watchlist WHERE id = ?', [id]);
    await pool.execute('DELETE FROM stock_daily_analysis WHERE watch_id = ?', [id]);
    res.json({ ok: true });
  } catch (err) {
    console.error('删除观察股票失败:', err);
    res.status(500).json({ error: '删除失败' });
  }
});

// 保存/更新每日分析
app.put('/api/stock/watchlist/:id/analysis', async (req, res) => {
  try {
    const { id } = req.params;
    const { date, actionType, sentiment, targetBuyPrice, targetBuyPriceHigh, targetSellPrice, targetSellPriceHigh, stopLossPrice, stopLossPriceHigh, buyShareCount, sellShareCount, lossShareCount, note, nextDayNote, reviewResult, reviewNote } = req.body;
    if (!date) return res.status(400).json({ error: '日期不能为空' });

    const shareCols = [['buyShareCount', 'buy_share_count'], ['sellShareCount', 'sell_share_count'], ['lossShareCount', 'loss_share_count']];

    // 先查有没有
    const [existing] = await pool.query(
      'SELECT id FROM stock_daily_analysis WHERE watch_id = ? AND date = ?',
      [id, date]
    );

    const now = Date.now();
    if (existing.length > 0) {
      const fields = [];
      const values = [];
      if (actionType !== undefined) { fields.push('action_type = ?'); values.push(actionType || ''); }
      if (sentiment !== undefined) { fields.push('sentiment = ?'); values.push(sentiment || ''); }
      if (targetBuyPrice !== undefined) { fields.push('target_buy_price = ?'); values.push(targetBuyPrice || null); }
      if (targetBuyPriceHigh !== undefined) { fields.push('target_buy_price_high = ?'); values.push(targetBuyPriceHigh || null); }
      if (targetSellPrice !== undefined) { fields.push('target_sell_price = ?'); values.push(targetSellPrice || null); }
      if (targetSellPriceHigh !== undefined) { fields.push('target_sell_price_high = ?'); values.push(targetSellPriceHigh || null); }
      if (stopLossPrice !== undefined) { fields.push('stop_loss_price = ?'); values.push(stopLossPrice || null); }
      if (stopLossPriceHigh !== undefined) { fields.push('stop_loss_price_high = ?'); values.push(stopLossPriceHigh || null); }
      for (const [key, col] of shareCols) {
        if (req.body[key] === undefined) continue;
        const n = Number(req.body[key]);
        fields.push(`${col} = ?`);
        values.push(Number.isFinite(n) && n > 0 ? Math.floor(n) : null);
      }
      if (note !== undefined) { fields.push('note = ?'); values.push(note || ''); }
      if (nextDayNote !== undefined) { fields.push('next_day_note = ?'); values.push(nextDayNote || ''); }
      if (reviewResult !== undefined) { fields.push('review_result = ?'); values.push(reviewResult || ''); }
      if (reviewNote !== undefined) { fields.push('review_note = ?'); values.push(reviewNote || ''); }
      if (fields.length === 0) return res.json({ ok: true });
      fields.push('updated_at = ?');
      values.push(now, existing[0].id);
      await pool.execute(`UPDATE stock_daily_analysis SET ${fields.join(', ')} WHERE id = ?`, values);
      res.json({ ok: true, id: existing[0].id });
    } else {
      const aid = crypto.randomUUID();
      const shareVal = v => {
        const n = Number(v);
        return Number.isFinite(n) && n > 0 ? Math.floor(n) : null;
      };
      await pool.execute(
        `INSERT INTO stock_daily_analysis (id, watch_id, code, date, action_type, sentiment, target_buy_price, target_buy_price_high, target_sell_price, target_sell_price_high, stop_loss_price, stop_loss_price_high, buy_share_count, sell_share_count, loss_share_count, note, next_day_note, review_result, review_note, created_at, updated_at)
         VALUES (?, ?, (SELECT code FROM stock_watchlist WHERE id = ?), ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [aid, id, id, date, actionType || '', sentiment || '', targetBuyPrice || null, targetBuyPriceHigh || null, targetSellPrice || null, targetSellPriceHigh || null, stopLossPrice || null, stopLossPriceHigh || null, shareVal(buyShareCount), shareVal(sellShareCount), shareVal(lossShareCount), note || '', nextDayNote || '', reviewResult || '', reviewNote || '', now, now]
      );
      res.json({ ok: true, id: aid });
    }
  } catch (err) {
    console.error('保存每日分析失败:', err);
    res.status(500).json({ error: '保存失败' });
  }
});

// 删除某日分析
app.delete('/api/stock/watchlist/:id/analysis/:date', async (req, res) => {
  try {
    const { id, date } = req.params;
    await pool.execute('DELETE FROM stock_daily_analysis WHERE watch_id = ? AND date = ?', [id, date]);
    res.json({ ok: true });
  } catch (err) {
    console.error('删除分析失败:', err);
    res.status(500).json({ error: '删除失败' });
  }
});

// ===== 看图分析（K 线形态 + 指标）→ 信号 + 操作意见 =====

// 简易指标工具
function _ma(arr, n, i) {
  if (i + 1 < n) return null;
  let s = 0;
  for (let j = i - n + 1; j <= i; j++) s += arr[j];
  return s / n;
}
function _emaSeries(arr, n) {
  const k = 2 / (n + 1);
  const out = [];
  let prev = arr[0];
  for (let i = 0; i < arr.length; i++) {
    prev = i === 0 ? arr[0] : arr[i] * k + prev * (1 - k);
    out.push(prev);
  }
  return out;
}
function _r14(closes) {
  let g = 0, l = 0;
  for (let i = closes.length - 14; i < closes.length; i++) {
    const d = closes[i] - closes[i - 1];
    if (d > 0) g += d; else l -= d;
  }
  return l === 0 ? 100 : 100 - 100 / (1 + g / l);
}
function _macd(closes) {
  const e12 = _emaSeries(closes, 12);
  const e26 = _emaSeries(closes, 26);
  const dif = e12.map((v, i) => v - e26[i]);
  const dea = _emaSeries(dif, 9);
  return { dif, dea, hist: dif.map((v, i) => (v - dea[i]) * 2) };
}
function _boll(closes) {
  const n = 20;
  const i = closes.length - 1;
  if (i + 1 < n) return null;
  const slice = closes.slice(i - n + 1, i + 1);
  const mid = slice.reduce((a, b) => a + b, 0) / n;
  const sd = Math.sqrt(slice.reduce((a, b) => a + (b - mid) ** 2, 0) / n);
  return { mid, up: mid + 2 * sd, dn: mid - 2 * sd, price: closes[i] };
}

// 看图分析：K 线形态 + 指标 → 信号列表 + 明确的操作意见
app.get('/api/ai/charts', async (req, res) => {
  try {
    const code = String(req.query.code || '').trim();
    if (!code) return res.json({ ok: false, error: '缺少股票代码' });
    const bars = await fetchStockDailyHistory(code, 90).catch(() => []);
    if (bars.length < 30) return res.json({ ok: false, error: `本地无 ${code} 足够行情（需 ≥30 根日 K）` });

    const closes = bars.map(b => b.close);
    const highs = bars.map(b => b.high);
    const lows = bars.map(b => b.low);
    const vols = bars.map(b => Number(b.volume) || 0);
    const price = closes[closes.length - 1];
    const ma5 = _ma(closes, 5, closes.length - 1);
    const ma10 = _ma(closes, 10, closes.length - 1);
    const ma20 = _ma(closes, 20, closes.length - 1);
    const ma60 = _ma(closes, 60, closes.length - 1);
    const rsi = _r14(closes);
    const macd = _macd(closes);
    const dif = Number(macd.dif[macd.dif.length - 1]) || 0;
    const dea = Number(macd.dea[macd.dea.length - 1]) || 0;
    const prevDif = Number(macd.dif[macd.dif.length - 2]) || dif;
    const prevDea = Number(macd.dea[macd.dea.length - 2]) || dea;
    const boll = _boll(closes);
    const recentHigh = Math.max(...highs.slice(-20));
    const recentLow = Math.min(...lows.slice(-20));
    const trendBase = closes.slice(-21, -1)[0] || price;
    const trendPct = trendBase > 0 ? Number((((price - trendBase) / trendBase) * 100).toFixed(2)) : 0;

    // 近 20 日 量比（当日 vs 均值）
    const volAvg = vols.slice(-21, -1).reduce((a, b) => a + b, 0) / Math.max(1, Math.min(20, vols.length - 1));
    const volRatio = volAvg > 0 ? Number((vols[vols.length - 1] / volAvg).toFixed(2)) : 1;

    const signals = [];
    let score = 0;      // 正=偏多，负=偏空
    const add = (title, detail, s, group = 'trend') => {
      score += s;
      signals.push({ id: signals.length + 1, group, title, detail, score: s });
    };

    // 趋势
    const maAlign = ma5 && ma20 && ma5 > ma20;
    if (maAlign) add('均线多头排列', `MA5(${ma5.toFixed(2)}) > MA10(${ma10?.toFixed(2)}) > MA20(${ma20.toFixed(2)})，短期趋势向上`, 2, 'ma');
    else if (ma5 && ma20 && ma5 < ma20) add('均线空头排列', `MA5 下穿 MA20，短期趋势偏弱`, -2, 'ma');

    // 支撑/压力
    const sup = Math.min(lows.slice(-10));
    const resistance = Math.max(highs.slice(-10));
    add('支撑与压力', `近 10 日支撑 ¥${sup.toFixed(2)} / 压力 ¥${resistance.toFixed(2)}，现价 ${price > (sup + resistance) / 2 ? '偏上轨' : '偏下轨'}`, price > (sup + resistance) / 2 ? 1 : -1, 'level');

    // RSI
    if (rsi >= 70) add('RSI 超买', `RSI14 = ${rsi.toFixed(1)} ≥ 70，短线过热`, -2, 'kdj');
    else if (rsi <= 30) add('RSI 超卖', `RSI14 = ${rsi.toFixed(1)} ≤ 30，短线超跌`, 2, 'kdj');

    // MACD
    if (prevDif <= prevDea && dif > dea) add('MACD 金叉', `DIF(${dif.toFixed(2)}) 上穿 DEA(${dea.toFixed(2)})，动能转多`, 2, 'macd');
    else if (prevDif >= prevDea && dif < dea) add('MACD 死叉', `DIF 下穿 DEA，动能转弱`, -2, 'macd');
    else if (dif > dea) add('MACD 多头', `DIF 持续位于 DEA 上方`, 1, 'macd');
    else add('MACD 空头', 'DIF 位于 DEA 下方', -1, 'macd');

    // 量能
    if (volRatio > 1.5) add('放量', `量比 ${volRatio}（>1.5），关注是否有效突破/跌破`, price > ma5 ? 1 : -1, 'volume');
    else if (volRatio < 0.6) add('缩量', `量比 ${volRatio}（<0.6），观望情绪浓`, 0, 'volume');

    // 布林
    if (boll) {
      if (price <= boll.dn) add('触及布林下轨', `现价 ¥${price.toFixed(2)} ≤ 下轨 ¥${boll.dn.toFixed(2)}，短线超跌`, 1, 'boll');
      else if (price >= boll.up) add('触及布林上轨', `现价 ¥${price.toFixed(2)} ≥ 上轨 ¥${boll.up.toFixed(2)}，短线超涨`, -1, 'boll');
    }

    // 高点/低点
    add('近 20 日高低', `区间 ¥${recentLow.toFixed(2)} – ¥${recentHigh.toFixed(2)}，现价距高点 ${(((price - recentHigh) / recentHigh) * 100).toFixed(1)}%`, 0, 'swing');

    // 趋势
    add('近 20 日趋势', trendPct >= 0
      ? `区间 ${trendPct >= 0 ? '+' : ''}${trendPct}%，趋势偏多`
      : `区间 ${trendPct}%，趋势偏空`, trendPct >= 0 ? 1 : -1, 'trend');

    // 操作意见（基于分数）
    let advice, adviceClass;
    if (score >= 5) { advice = '建议：偏多。趋势与动能共振，可考虑逢低加仓 / 持有，止盈位参考布林上轨。'; adviceClass = 'bull'; }
    else if (score >= 2) { advice = '建议：偏多观望。多头信号占优，但尚未形成共振，可持有观察放量确认。'; adviceClass = 'bull'; }
    else if (score <= -5) { advice = '建议：偏空。空头信号共振，可考虑逢高减仓 / 落袋，止损位参考布林下轨。'; adviceClass = 'bear'; }
    else if (score <= -2) { advice = '建议：偏空观望。空头信号占优，等待止跌信号再行动。'; adviceClass = 'bear'; }
    else { advice = '建议：震荡观望。多空信号交织，等待方向选择，可围绕支撑/压力高抛低吸。'; adviceClass = 'neutral'; }

    res.json({
      ok: true,
      code,
      fetchedAt: Date.now(),
      metrics: { price: Number(price.toFixed(3)), ma5: ma5 == null ? null : Number(ma5.toFixed(3)), ma10: ma10 == null ? null : Number(ma10.toFixed(3)), ma20: ma20 == null ? null : Number(ma20.toFixed(3)), ma60: ma60 == null ? null : Number(ma60.toFixed(3)), rsi: Number((rsi || 50).toFixed(1)), dif: Number(dif.toFixed(3)), dea: Number(dea.toFixed(3)), volRatio, trendPct },
      signals,
      advice,
      adviceClass,
      candles: bars.slice(-60).map(b => ({ date: b.date, o: b.open, c: b.close, h: b.high, l: b.low, v: b.amount }))
    });
  } catch (err) {
    console.error('看图分析失败:', err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ===== 个股资讯（东财新闻 + 巨潮公告）带缓存 =====
const NEWS_CACHE = {};
const NEWS_TTL = 3600 * 1000;   // 1h，防东财封 IP

async function fetchNewsFromAkshare(code) {
  // 走 Python（quant/.venv），与打新接口同一套技术栈，避免 Node 直接爬被封
  const { spawn } = require('node:child_process');
  const script = path.join(__dirname, 'quant', 'stock_news.py');
  const pythonBin = process.env.PYTHON_BIN
    || (require('fs').existsSync(path.join(__dirname, 'quant', '.venv', 'Scripts', 'python.exe'))
        ? path.join(__dirname, 'quant', '.venv', 'Scripts', 'python.exe')
        : 'python');
  return new Promise((resolve, reject) => {
    const child = spawn(pythonBin, [script, code], { cwd: __dirname, windowsHide: true });
    let out = '', err = '';
    child.stdout.on('data', d => { out += d; });
    child.stderr.on('data', d => { err += d; });
    child.on('close', code2 => {
      if (code2 !== 0 && !out) return reject(new Error(err || `stock_news.py exit ${code2}`));
      try { resolve(JSON.parse(out || '{}')); } catch (e) { reject(e); }
    });
    setTimeout(() => { child.kill(); reject(new Error('timeout')); }, 60000);
  });
}

app.get('/api/stock/news/:code', async (req, res) => {
  try {
    const code = req.params.code;
    const now = Date.now();
    if (NEWS_CACHE[code] && now - NEWS_CACHE[code].t < NEWS_TTL) {
      return res.json({ code: 200, cached: true, data: NEWS_CACHE[code].data });
    }
    const news = await fetchNewsFromAkshare(code);
    NEWS_CACHE[code] = { data: news, t: now };
    res.json({ code: 200, cached: false, data: news });
  } catch (e) {
    // 失败降级：有缓存就返回旧数据，明确标注
    if (NEWS_CACHE[code]) {
      return res.json({ code: 200, cached: true, stale: true, data: NEWS_CACHE[code].data });
    }
    console.error('个股资讯失败:', e);
    res.status(503).json({ code: 503, error: e.message });
  }
});

// ===== 情绪打分（利好/利空）：给前端资讯卡片标红绿 =====
const POS_WORDS = ['增长', '上涨', '利好', '中标', '签约', '回购', '增持', '突破', '新高', '超预期', '盈利', '分红', '涨停', '放量', '机构买入', '北向加仓', '业绩预增', '订单', '合作'];
const NEG_WORDS = ['下跌', '利空', '亏损', '违规', '处罚', '减持', '退市', '新低', '跌停', '缩量', '业绩预减', '质押', '立案', '调查', '退市风险', '商誉减值', '股东户数增加'];

app.get('/api/stock/sentiment/:code', async (req, res) => {
  try {
    const code = req.params.code;
    let items = [];
    try {
      const cached = NEWS_CACHE[code];
      if (!cached || Date.now() - cached.t >= NEWS_TTL) {
        const fresh = await fetchNewsFromAkshare(code);
        NEWS_CACHE[code] = { data: fresh, t: Date.now() };
        items = fresh.items || fresh;
      } else items = cached.data.items || cached.data;
    } catch (_) { items = NEWS_CACHE[code]?.data?.items || []; }

    const scored = (items || []).slice(0, 20).map(it => {
      const text = `${it.title || ''} ${it.summary || ''}`;
      let pos = 0, neg = 0;
      POS_WORDS.forEach(w => { if (text.includes(w)) pos++; });
      NEG_WORDS.forEach(w => { if (text.includes(w)) neg++; });
      const tone = pos > neg ? 'bull' : neg > pos ? 'bear' : 'neutral';
      const score = pos - neg;
      return { ...it, tone, score, hitPos: pos, hitNeg: neg };
    });

    res.json({ code, items: scored, at: Date.now() });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// 批量获取个股近 N 日日涨跌幅（用于每日分析的复盘验证 / 盘后总结）
app.post('/api/stock/daily-changes', async (req, res) => {
  try {
    const rawCodes = Array.isArray(req.body?.codes) ? req.body.codes : [];
    const codes = [...new Set(rawCodes.map(c => String(c || '').trim()).filter(Boolean))].slice(0, 60);
    const days = Math.min(Math.max(Number(req.body?.days) || 90, 10), 250);
    if (!codes.length) return res.json({ data: {}, fetchedAt: Date.now() });

    const data = {};
    for (const code of codes) {
      try {
        const history = await fetchStockDailyHistory(code, days);
        data[code] = history.map((k, i) => {
          const base = i > 0 ? history[i - 1].close : k.open;
          return {
            date: k.date,
            open: k.open,
            close: k.close,
            pct: base > 0 ? Number((((k.close - base) / base) * 100).toFixed(2)) : null
          };
        });
      } catch (e) {
        data[code] = [];
      }
    }
    res.json({ data, fetchedAt: Date.now() });
  } catch (err) {
    console.error('获取日涨跌失败:', err);
    res.status(500).json({ error: '获取失败' });
  }
});

// A股打新底仓市值：T-2 前 20 个交易日日均市值（沪深分开）
app.get('/api/stock/ipo-market-value', async (req, res) => {
  try {
    // 1. 取所有未清仓股票及交易记录
    const [rows] = await pool.query(
      `SELECT id, code, name, is_cleared FROM stocks WHERE board = 'stock' AND is_cleared = 0 ORDER BY created_at`
    );
    if (!rows.length) {
      return res.json({ sh: 0, sz: 0, bj: 0, shDaily: [], szDaily: [], bjDaily: [], avgDays: 0, t2Date: '', fetchedAt: Date.now() });
    }
    const stockIds = rows.map(r => r.id);
    const [buyRows] = await pool.query(
      `SELECT stock_id, buy_count, DATE_FORMAT(buy_date, '%Y-%m-%d') AS buy_date
       FROM buy_records WHERE stock_id IN (?) ORDER BY buy_date ASC, created_at ASC`, [stockIds]);
    const [sellRows] = await pool.query(
      `SELECT stock_id, sell_count, DATE_FORMAT(sell_date, '%Y-%m-%d') AS sell_date
       FROM sell_records WHERE stock_id IN (?) ORDER BY sell_date ASC, created_at ASC`, [stockIds]);

    const buyMap = new Map(), sellMap = new Map();
    for (const r of buyRows) {
      if (!buyMap.has(r.stock_id)) buyMap.set(r.stock_id, []);
      buyMap.get(r.stock_id).push({ date: r.buy_date, count: Number(r.buy_count) || 0 });
    }
    for (const r of sellRows) {
      if (!sellMap.has(r.stock_id)) sellMap.set(r.stock_id, []);
      sellMap.get(r.stock_id).push({ date: r.sell_date, count: Number(r.sell_count) || 0 });
    }

    // 板块归属（仅A股：沪60/68、深00/30、北4/8）
    function ipoExchange(code) {
      const c = String(code).trim();
      if (/^60/.test(c) || /^68/.test(c)) return 'sh';
      if (/^00/.test(c) || /^30/.test(c)) return 'sz';
      if (/^[48]/.test(c)) return 'bj';
      return null;
    }

    // 2. 并发拉取每只股票近 60 天日线（足够覆盖 20+2 个交易日）
    const stockHistory = {};
    const concurrency = 6;
    let idx = 0;
    async function worker() {
      while (idx < rows.length) {
        const i = idx++;
        const stock = rows[i];
        const ex = ipoExchange(stock.code);
        if (!ex) continue;
        try {
          const history = await fetchStockDailyHistory(stock.code, 60);
          stockHistory[stock.id] = { ex, history, buys: buyMap.get(stock.id) || [], sells: sellMap.get(stock.id) || [] };
        } catch (e) {
          console.error(`[IPO] 获取 ${stock.code} 日线失败:`, e.message);
        }
      }
    }
    await Promise.all(Array.from({ length: concurrency }, () => worker()));

    // 3. 以第一只有数据的股票的交易日历为基准（所有A股交易日历一致）
    let tradeDays = [];
    for (const id of Object.keys(stockHistory)) {
      const h = stockHistory[id].history;
      if (h && h.length > 0) { tradeDays = h.map(k => k.date); break; }
    }
    if (!tradeDays.length) {
      return res.json({ sh: 0, sz: 0, bj: 0, shDaily: [], szDaily: [], bjDaily: [], avgDays: 0, t2Date: '', fetchedAt: Date.now() });
    }

    // T-2：取倒数第 3 个交易日（最后一个=T，倒数第二=T-1，倒数第三=T-2）
    // 若交易日不足 22 天，用全部
    const totalDays = tradeDays.length;
    const t2Index = Math.max(0, totalDays - 3);
    const t2Date = tradeDays[t2Index] || '';
    // 20 日窗口：[t2Index - 19, t2Index]
    const windowStart = Math.max(0, t2Index - 19);
    const windowDays = tradeDays.slice(windowStart, t2Index + 1);

    // 4. 对每个交易日，按交易所汇总当日持仓市值
    const daily = {};
    for (const id of Object.keys(stockHistory)) {
      const { ex, history, buys, sells } = stockHistory[id];
      const closeMap = new Map(history.map(k => [k.date, k.close]));
      // 预处理买卖：按日期累计
      let cumBuy = 0, cumSell = 0;
      let bi = 0, si = 0;
      const sortedBuys = [...buys].sort((a, b) => a.date.localeCompare(b.date));
      const sortedSells = [...sells].sort((a, b) => a.date.localeCompare(b.date));
      for (const day of windowDays) {
        while (bi < sortedBuys.length && sortedBuys[bi].date <= day) { cumBuy += sortedBuys[bi].count; bi++; }
        while (si < sortedSells.length && sortedSells[si].date <= day) { cumSell += sortedSells[si].count; si++; }
        const shares = Math.max(0, cumBuy - cumSell);
        const close = closeMap.get(day);
        if (shares > 0 && close && close > 0) {
          if (!daily[day]) daily[day] = { sh: 0, sz: 0, bj: 0 };
          daily[day][ex] += shares * close;
        }
      }
    }

    // 5. 计算 20 日日均
    let shSum = 0, szSum = 0, bjSum = 0;
    const shDaily = [], szDaily = [], bjDaily = [];
    for (const day of windowDays) {
      const d = daily[day] || { sh: 0, sz: 0, bj: 0 };
      shSum += d.sh; szSum += d.sz; bjSum += d.bj;
      shDaily.push({ date: day, value: d.sh });
      szDaily.push({ date: day, value: d.sz });
      bjDaily.push({ date: day, value: d.bj });
    }
    const n = windowDays.length || 1;
    res.json({
      sh: Math.round(shSum / n * 100) / 100,
      sz: Math.round(szSum / n * 100) / 100,
      bj: Math.round(bjSum / n * 100) / 100,
      shDaily, szDaily, bjDaily,
      avgDays: windowDays.length,
      t2Date,
      fetchedAt: Date.now()
    });
  } catch (err) {
    console.error('[IPO] 底仓市值计算失败:', err);
    res.status(500).json({ error: err.message });
  }
});

// 获取某日盘后总结
app.get('/api/stock/daily-summary', async (req, res) => {
  try {
    const date = String(req.query.date || '').trim();
    if (!date) return res.status(400).json({ error: '日期不能为空' });
    const [rows] = await pool.query('SELECT * FROM stock_daily_summary WHERE date = ?', [date]);
    if (!rows.length) return res.json({ date, content: '', autoContent: '', createdAt: 0, updatedAt: 0 });
    const r = rows[0];
    res.json({
      date: r.date,
      content: r.content || '',
      autoContent: r.auto_content || '',
      createdAt: r.created_at,
      updatedAt: r.updated_at
    });
  } catch (err) {
    console.error('获取盘后总结失败:', err);
    res.status(500).json({ error: '获取失败' });
  }
});

// 保存某日盘后总结
app.put('/api/stock/daily-summary', async (req, res) => {
  try {
    const date = String(req.body?.date || '').trim();
    if (!date) return res.status(400).json({ error: '日期不能为空' });
    const content = String(req.body?.content ?? '');
    const autoContent = String(req.body?.autoContent ?? '');
    const now = Date.now();
    const [existing] = await pool.query('SELECT id FROM stock_daily_summary WHERE date = ?', [date]);
    if (existing.length) {
      await pool.execute(
        'UPDATE stock_daily_summary SET content = ?, auto_content = ?, updated_at = ? WHERE id = ?',
        [content, autoContent, now, existing[0].id]
      );
      return res.json({ ok: true, id: existing[0].id });
    }
    const id = crypto.randomUUID();
    await pool.execute(
      'INSERT INTO stock_daily_summary (id, date, content, auto_content, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)',
      [id, date, content, autoContent, now, now]
    );
    res.json({ ok: true, id });
  } catch (err) {
    console.error('保存盘后总结失败:', err);
    res.status(500).json({ error: '保存失败' });
  }
});

// ========== 小工具 API ==========
app.get('/api/tools/categories', async (req, res) => {
  try {
    const [rows] = await pool.query("SELECT DISTINCT category FROM tools WHERE category != '' ORDER BY category ASC");
    res.json(rows.map(r => r.category));
  } catch (err) {
    console.error('获取工具分类失败:', err);
    res.status(500).json({ error: '获取失败' });
  }
});

app.get('/api/tools', async (req, res) => {
  try {
    const [rows] = await pool.query('SELECT * FROM tools ORDER BY category ASC, sort_order ASC, created_at DESC');
    res.json(rows.map(r => ({
      id: r.id,
      name: r.name,
      url: r.url,
      icon: r.icon || '',
      note: r.note || '',
      category: r.category || '',
      sortOrder: r.sort_order,
      createdAt: r.created_at,
      updatedAt: r.updated_at
    })));
  } catch (err) {
    console.error('获取小工具列表失败:', err);
    res.status(500).json({ error: '获取失败' });
  }
});

app.post('/api/tools', async (req, res) => {
  try {
    const { name, url, icon, note, category, sortOrder } = req.body;
    if (!name || !url) return res.status(400).json({ error: '名称和链接不能为空' });
    const id = genId();
    const now = Date.now();
    await pool.execute(
      'INSERT INTO tools (id, name, url, icon, note, category, sort_order, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
      [id, name, url, icon || '', note || '', category || '', sortOrder || 0, now, now]
    );
    res.json({ id, name, url, icon: icon || '', note: note || '', category: category || '', sortOrder: sortOrder || 0, createdAt: now, updatedAt: now });
  } catch (err) {
    console.error('新增小工具失败:', err);
    res.status(500).json({ error: '新增失败' });
  }
});

app.put('/api/tools/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { name, url, icon, note, category, sortOrder } = req.body;
    const now = Date.now();
    const fields = [];
    const values = [];
    if (name !== undefined) { fields.push('name = ?'); values.push(name); }
    if (url !== undefined) { fields.push('url = ?'); values.push(url); }
    if (icon !== undefined) { fields.push('icon = ?'); values.push(icon); }
    if (note !== undefined) { fields.push('note = ?'); values.push(note); }
    if (category !== undefined) { fields.push('category = ?'); values.push(category); }
    if (sortOrder !== undefined) { fields.push('sort_order = ?'); values.push(sortOrder); }
    if (fields.length === 0) return res.json({ ok: true });
    fields.push('updated_at = ?');
    values.push(now);
    values.push(id);
    await pool.execute(`UPDATE tools SET ${fields.join(', ')} WHERE id = ?`, values);
    res.json({ ok: true });
  } catch (err) {
    console.error('更新小工具失败:', err);
    res.status(500).json({ error: '更新失败' });
  }
});

app.delete('/api/tools/:id', async (req, res) => {
  try {
    const { id } = req.params;
    await pool.execute('DELETE FROM tools WHERE id = ?', [id]);
    res.json({ ok: true });
  } catch (err) {
    console.error('删除小工具失败:', err);
    res.status(500).json({ error: '删除失败' });
  }
});

// 重新排序小工具
app.post('/api/tools/reorder', async (req, res) => {
  try {
    const { order } = req.body; // [{id, sortOrder}]
    if (!Array.isArray(order)) return res.status(400).json({ error: '参数错误' });
    for (const item of order) {
      await pool.execute('UPDATE tools SET sort_order = ? WHERE id = ?', [item.sortOrder || 0, item.id]);
    }
    res.json({ ok: true });
  } catch (err) {
    console.error('重排小工具失败:', err);
    res.status(500).json({ error: '操作失败' });
  }
});

// 更新薅羊毛/消费记录，同步账户资金明细
app.put('/api/wool/:id', async (req, res) => {
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const [rows] = await connection.query('SELECT * FROM wool_items WHERE id = ? FOR UPDATE', [req.params.id]);
    if (rows.length === 0) { await connection.rollback(); return res.status(404).json({ error: '记录不存在' }); }
    const old = rows[0];
    let oldImages = [];
    try { oldImages = old.images ? JSON.parse(old.images) : []; } catch (e) {}
    if (!oldImages.length && old.image) oldImages = [old.image];
    const payload = sanitizeWoolPayload({ name: old.name, amount: old.amount, woolDate: old.wool_date, icon: old.icon, images: oldImages, note: old.note, recordType: old.record_type, category: old.category, merchant: old.merchant, paymentMethod: old.payment_method, depositItemId: old.deposit_item_id, ...req.body });
    if (!payload.name || !payload.woolDate || payload.amount <= 0) { await connection.rollback(); return res.status(400).json({ error: '名称、日期和金额不能为空' }); }
    const oldDepositId = old.deposit_item_id || '';
    const newDelta = woolBalanceDelta(payload.recordType, payload.amount);
    const now = Date.now();
    let latestTransactionId = '';
    let resolvedPaymentMethod = payload.paymentMethod;
    const notePrefix = payload.recordType === 'spend' ? '消费：' : '羊毛到账：';
    if (oldDepositId) {
      const [txs] = await connection.query('SELECT SUM(amount) as total FROM deposit_transactions WHERE wool_item_id = ?', [req.params.id]);
      const totalImpact = Number(txs[0].total) || 0;
      await connection.execute('DELETE FROM deposit_transactions WHERE wool_item_id = ?', [req.params.id]);
      const [items] = await connection.query('SELECT id, amount FROM deposit_items WHERE id = ? FOR UPDATE', [oldDepositId]);
      if (items.length > 0) {
        const reverted = Number(items[0].amount) - totalImpact;
        await connection.execute('UPDATE deposit_items SET amount = ? WHERE id = ?', [reverted, oldDepositId]);
      }
    }
    if (payload.depositItemId) {
      const result = await applyWoolDepositDelta(connection, payload.depositItemId, newDelta, notePrefix + payload.name, now, req.params.id);
      latestTransactionId = result.transactionId || '';
      resolvedPaymentMethod = result.depositName || resolvedPaymentMethod;
    }
    await connection.execute(
      'UPDATE wool_items SET name=?, amount=?, wool_date=?, icon=?, image=?, images=?, note=?, record_type=?, category=?, merchant=?, payment_method=?, deposit_item_id=?, deposit_transaction_id=?, created_at=? WHERE id=?',
      [payload.name, payload.amount, payload.woolDate, payload.icon, payload.images[0] || '', JSON.stringify(payload.images), payload.note, payload.recordType, payload.category, payload.merchant, resolvedPaymentMethod, payload.depositItemId || null, latestTransactionId || null, now, req.params.id]
    );
    await connection.commit();
    res.json({ ok: true, ...payload, paymentMethod: resolvedPaymentMethod, depositTransactionId: latestTransactionId, createdAt: now });
  } catch (err) {
    await connection.rollback();
    console.error('更新薅羊毛/消费记录失败:', err);
    res.status(err.statusCode || 500).json({ error: err.statusCode ? err.message : '更新失败: ' + err.message });
  } finally { connection.release(); }
});

// 删除记录时直接删除对应的资金明细记录并回滚余额
app.delete('/api/wool/:id', async (req, res) => {
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const [rows] = await connection.query('SELECT * FROM wool_items WHERE id = ? FOR UPDATE', [req.params.id]);
    if (rows.length === 0) { await connection.rollback(); return res.status(404).json({ error: '记录不存在' }); }
    const item = rows[0];
    if (item.deposit_item_id) {
      // 删除该羊毛记录关联的所有资金明细
      await connection.execute('DELETE FROM deposit_transactions WHERE wool_item_id = ?', [req.params.id]);
      // 回滚余额：扣除原来的影响
      const delta = -woolBalanceDelta(item.record_type || 'reward', item.amount);
      if (Math.abs(delta) >= 0.005) {
        const [items] = await connection.query('SELECT id, amount FROM deposit_items WHERE id = ? FOR UPDATE', [item.deposit_item_id]);
        if (items.length > 0) {
          const currentBalance = Number(items[0].amount) || 0;
          await connection.execute('UPDATE deposit_items SET amount = ? WHERE id = ?', [currentBalance + delta, item.deposit_item_id]);
        }
      }
    }
    await connection.execute('DELETE FROM wool_items WHERE id = ?', [req.params.id]);
    await connection.commit();
    res.json({ ok: true });
  } catch (err) {
    await connection.rollback();
    console.error('删除薅羊毛/消费记录失败:', err);
    res.status(err.statusCode || 500).json({ error: err.statusCode ? err.message : '删除失败: ' + err.message });
  } finally { connection.release(); }
});

// 上传薅羊毛图片
app.post('/api/wool/upload-image', (req, res) => {
  woolUpload.single('image')(req, res, (err) => {
    if (err) {
      console.error('上传薅羊毛图片错误:', err);
      return res.status(400).json({ error: err.message || '上传失败' });
    }
    if (!req.file) return res.status(400).json({ error: '未上传文件' });
    res.json({ imagePath: 'uploads/wool/' + req.file.filename });
  });
});

function parseAIJson(content) {
  const text = String(content || '').replace(/```(?:json)?/gi, '').trim();
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start < 0 || end <= start) throw new Error('AI未返回可解析的结构化结果');
  return JSON.parse(text.slice(start, end + 1));
}

// 使用 GLM-4.6V 自动识别消费/收益凭证
app.post('/api/wool/recognize', async (req, res) => {
  try {
    const imagePath = String(req.body.imagePath || '');
    const fullPath = tenantUploadPath(imagePath);
    if (path.dirname(fullPath) !== tenantUploadDir('wool')) return res.status(400).json({ error: '无效的凭证图片路径' });
    if (!fs.existsSync(fullPath)) return res.status(404).json({ error: '凭证图片不存在' });
    const now = new Date();
    const currentDate = now.getFullYear() + '-' + String(now.getMonth() + 1).padStart(2, '0') + '-' + String(now.getDate()).padStart(2, '0');
    const systemPrompt = '你是严谨的中文消费票据识别助手。识别支付截图、订单、发票、小票、转账或返现凭证，只输出一个合法JSON对象，不要Markdown、解释或代码块。无法确认的文本字段返回空字符串，金额无法确认返回0。';
    const userPrompt = '今天是' + currentDate + '。请从图片提取以下字段：recordType只能是spend或reward，普通付款/购买为spend，返现/红包/退款到账为reward；name为简洁的商品或消费名称；amount为最终实付或实际到账金额数字，不要原价；woolDate为YYYY-MM-DD；category为最贴切的中文分类且允许自定义；merchant为商户、平台或资金去向；note补充订单号、商品明细、优惠和识别不确定项；confidence为0到1。严格返回：{"recordType":"spend","name":"","amount":0,"woolDate":"","category":"","merchant":"","note":"","confidence":0}';
    const model = process.env.GLM_VISION_MODEL || 'glm-4.6v';
    const raw = await callAI(systemPrompt, userPrompt, imagePath, model, 65000, 1200);
    if (String(raw).includes('未配置') && String(raw).includes('API Key')) return res.status(400).json({ error: String(raw) });
    const parsed = parseAIJson(raw);
    const result = {
      recordType: parsed.recordType === 'reward' ? 'reward' : 'spend',
      name: String(parsed.name || '').trim().slice(0, 200),
      amount: Math.max(0, Number(parsed.amount) || 0),
      woolDate: /^\d{4}-\d{2}-\d{2}$/.test(String(parsed.woolDate || '')) ? String(parsed.woolDate) : '',
      category: String(parsed.category || '').trim().slice(0, 64),
      merchant: String(parsed.merchant || '').trim().slice(0, 120),
      note: String(parsed.note || '').trim().slice(0, 500),
      confidence: Math.max(0, Math.min(1, Number(parsed.confidence) || 0)),
      model
    };
    res.json(result);
  } catch (err) {
    console.error('GLM凭证识别失败:', err);
    res.status(500).json({ error: 'AI识别失败: ' + err.message });
  }
});

// 获取薅羊毛日历统计
app.get('/api/wool/calendar', async (req, res) => {
  try {
    const { month } = req.query; // 格式: 2026-07
    if (!month) return res.json([]);
    const [rows] = await pool.query(
      `SELECT wool_date as woolDate,
              SUM(CASE WHEN record_type = 'spend' THEN 0 ELSE amount END) as rewardTotal,
              SUM(CASE WHEN record_type = 'spend' THEN amount ELSE 0 END) as spendTotal,
              COUNT(*) as count
         FROM wool_items WHERE wool_date LIKE ? GROUP BY wool_date ORDER BY wool_date`,
      [month + '%']
    );
    const [quickRows] = await pool.query(
      `SELECT wool_date as woolDate, quick_amount as quickAmount FROM wool_daily_amounts WHERE wool_date LIKE ?`,
      [month + '%']
    );
    const quickMap = {};
    quickRows.forEach(r => { quickMap[r.woolDate] = Number(r.quickAmount); });
    res.json(rows.map(r => ({
      woolDate: r.woolDate,
      total: Number(r.rewardTotal) + (quickMap[r.woolDate] || 0) - Number(r.spendTotal),
      rewardTotal: Number(r.rewardTotal) + (quickMap[r.woolDate] || 0),
      spendTotal: Number(r.spendTotal),
      itemsTotal: Number(r.rewardTotal) - Number(r.spendTotal),
      quickAmount: quickMap[r.woolDate] || 0,
      count: r.count
    })).concat(
      quickRows.filter(r => !rows.find(x => x.woolDate === r.woolDate)).map(r => ({
        woolDate: r.woolDate,
        total: Number(r.quickAmount),
        rewardTotal: Number(r.quickAmount),
        spendTotal: 0,
        itemsTotal: 0,
        quickAmount: Number(r.quickAmount),
        count: 0
      }))
    ));
  } catch (err) {
    console.error('获取薅羊毛日历统计失败:', err);
    res.status(500).json({ error: '获取失败' });
  }
});

// 获取指定日期快速录入金额
app.get('/api/wool/daily/:date', async (req, res) => {
  try {
    const { date } = req.params;
    const [rows] = await pool.query('SELECT * FROM wool_daily_amounts WHERE wool_date = ?', [date]);
    if (rows.length === 0) {
      res.json({ woolDate: date, quickAmount: 0 });
    } else {
      const r = rows[0];
      res.json({ woolDate: r.wool_date, quickAmount: Number(r.quick_amount) });
    }
  } catch (err) {
    console.error('获取每日快速金额失败:', err);
    res.status(500).json({ error: '获取失败' });
  }
});

// 设置/更新指定日期快速录入金额
app.put('/api/wool/daily/:date', async (req, res) => {
  try {
    const { date } = req.params;
    const { quickAmount } = req.body;
    const amount = parseFloat(quickAmount) || 0;
    const now = Date.now();
    const id = 'wda_' + date.replace(/-/g, '');
    const [existing] = await pool.query('SELECT id FROM wool_daily_amounts WHERE wool_date = ?', [date]);
    if (existing.length > 0) {
      await pool.execute('UPDATE wool_daily_amounts SET quick_amount = ?, updated_at = ? WHERE wool_date = ?', [amount, now, date]);
    } else {
      await pool.execute(
        'INSERT INTO wool_daily_amounts (id, wool_date, quick_amount, created_at, updated_at) VALUES (?, ?, ?, ?, ?)',
        [id, date, amount, now, now]
      );
    }
    res.json({ woolDate: date, quickAmount: amount });
  } catch (err) {
    console.error('保存每日快速金额失败:', err);
    res.status(500).json({ error: '保存失败' });
  }
});

// ========== 每日计划 API ==========

// 获取所有计划
app.get('/api/plans', async (req, res) => {
  try {
    const [rows] = await pool.query('SELECT * FROM daily_plans ORDER BY sort_order ASC, created_at ASC');
    res.json(rows.map(r => ({
      id: r.id,
      title: r.title,
      periodType: r.period_type,
      periodValue: r.period_value,
      icon: r.icon,
      sortOrder: r.sort_order
    })));
  } catch (err) {
    console.error('获取计划失败:', err);
    res.status(500).json({ error: '获取失败' });
  }
});

// 新增计划
app.post('/api/plans', async (req, res) => {
  try {
    const { title, periodType, periodValue, icon, sortOrder } = req.body;
    const id = crypto.randomUUID();
    const now = Date.now();
    await pool.execute(
      'INSERT INTO daily_plans (id, title, period_type, period_value, icon, sort_order, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [id, title || '', periodType || 'daily', periodValue || 0, icon || '', sortOrder || 0, now]
    );
    res.json({ id, title, periodType: periodType || 'daily', periodValue: periodValue || 0, icon: icon || '', sortOrder: sortOrder || 0 });
  } catch (err) {
    console.error('新增计划失败:', err);
    res.status(500).json({ error: '新增失败' });
  }
});

// 更新计划
app.put('/api/plans/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const fields = [];
    const values = [];
    const allowed = ['title', 'periodType', 'periodValue', 'icon', 'sortOrder'];
    const fieldMap = { periodType: 'period_type', periodValue: 'period_value', sortOrder: 'sort_order' };
    for (const key of allowed) {
      if (req.body[key] !== undefined) {
        fields.push(`${fieldMap[key] || key} = ?`);
        values.push(req.body[key]);
      }
    }
    if (fields.length === 0) return res.json({ ok: true });
    values.push(id);
    await pool.execute(`UPDATE daily_plans SET ${fields.join(', ')} WHERE id = ?`, values);
    res.json({ ok: true });
  } catch (err) {
    console.error('更新计划失败:', err);
    res.status(500).json({ error: '更新失败' });
  }
});

// 删除计划
app.delete('/api/plans/:id', async (req, res) => {
  try {
    const { id } = req.params;
    await pool.execute('DELETE FROM daily_plans WHERE id = ?', [id]);
    await pool.execute('DELETE FROM plan_completions WHERE plan_id = ?', [id]);
    res.json({ ok: true });
  } catch (err) {
    console.error('删除计划失败:', err);
    res.status(500).json({ error: '删除失败' });
  }
});

// 获取某天的计划完成状态
app.get('/api/plans/completions/:date', async (req, res) => {
  try {
    const { date } = req.params;
    const [rows] = await pool.query('SELECT plan_id, completed FROM plan_completions WHERE complete_date = ?', [date]);
    const map = {};
    rows.forEach(r => { map[r.plan_id] = r.completed === 1; });
    res.json(map);
  } catch (err) {
    console.error('获取计划完成状态失败:', err);
    res.status(500).json({ error: '获取失败' });
  }
});

// 切换某天某计划的完成状态
app.post('/api/plans/:id/toggle', async (req, res) => {
  try {
    const { id } = req.params;
    const { date } = req.body;
    if (!date) return res.status(400).json({ error: '缺少日期' });
    const [existing] = await pool.execute('SELECT id, completed FROM plan_completions WHERE plan_id = ? AND complete_date = ?', [id, date]);
    let newCompleted = true;
    if (existing.length > 0) {
      newCompleted = existing[0].completed !== 1;
      await pool.execute('UPDATE plan_completions SET completed = ? WHERE id = ?', [newCompleted ? 1 : 0, existing[0].id]);
    } else {
      const recordId = crypto.randomUUID();
      const now = Date.now();
      await pool.execute(
        'INSERT INTO plan_completions (id, plan_id, complete_date, completed, created_at) VALUES (?, ?, ?, 1, ?)',
        [recordId, id, date, now]
      );
      newCompleted = true;
    }
    res.json({ completed: newCompleted });
  } catch (err) {
    console.error('切换计划完成状态失败:', err);
    res.status(500).json({ error: '操作失败' });
  }
});

// 重新排序计划
app.post('/api/plans/reorder', async (req, res) => {
  try {
    const { order } = req.body; // [{id, sortOrder}]
    if (!Array.isArray(order)) return res.status(400).json({ error: '参数错误' });
    for (const item of order) {
      await pool.execute('UPDATE daily_plans SET sort_order = ? WHERE id = ?', [item.sortOrder || 0, item.id]);
    }
    res.json({ ok: true });
  } catch (err) {
    console.error('重排计划失败:', err);
    res.status(500).json({ error: '操作失败' });
  }
});

// ========== 人生规划器 API ==========
const LIFE_DOMAINS = ['学业', '职业', '财务', '健康', '家庭', '成长'];
const LIFE_KINDS = ['self', 'domain', 'goal', 'action', 'milestone'];
// 时序分组：紧急（30 天内）/ 中期（30~90 天）/ 远期储备（90 天以上），前端据此把节点按时间线聚拢
const LIFE_TIME_GROUPS = ['urgent', 'mid', 'future'];

// 时序分组一律由日期反推，不信模型自己填的值：
//   有截止日期 / 开始日期的，按距【今天】的天数重算（≤30 紧急、≤90 中期、其余远期）；
//   没有日期的赛道节点（domain / goal），继承同一条 series 里最早的截止日期 ——
//   否则国考这种一个月后就笔试的赛道会被模型随手填成「中期 / 远期」，跟真实紧迫程度不符。
// series='人生推演' 的结局分支固定留作远期，不参与重算。
function normalizeLifeTimeGroups(items) {
  if (!Array.isArray(items) || !items.length) return items;
  const today = new Date();
  const todayTs = new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime();
  const dayMs = 86400000;
  const parseDate = value => {
    const hit = String(value || '').match(/(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/);
    if (!hit) return null;
    return new Date(Number(hit[1]), Number(hit[2]) - 1, Number(hit[3])).getTime();
  };
  const daysOf = item => {
    const due = parseDate(item.horizon ?? item.dueDate);
    if (due !== null) return Math.round((due - todayTs) / dayMs);
    const start = parseDate(item.startDate ?? item.start_date);
    return start === null ? null : Math.round((start - todayTs) / dayMs);
  };
  const toGroup = days => (days <= 30 ? 'urgent' : days <= 90 ? 'mid' : 'future');
  const earliestBySeries = new Map();
  for (const item of items) {
    const days = daysOf(item);
    if (days === null) continue;
    const key = String(item.series || '').trim();
    if (!key) continue;
    const best = earliestBySeries.get(key);
    if (best === undefined || days < best) earliestBySeries.set(key, days);
  }
  for (const item of items) {
    if (String(item.series || '').trim() === '人生推演') continue;
    const days = daysOf(item);
    if (days !== null) { item.timeGroup = toGroup(days); continue; }
    const key = String(item.series || '').trim();
    const inherited = key ? earliestBySeries.get(key) : undefined;
    if (inherited !== undefined) item.timeGroup = toGroup(inherited);
  }
  return items;
}

// deps 存 JSON 字符串，读取时容错解析
function lifeParseDeps(value) {
  if (!value) return [];
  try {
    const list = JSON.parse(value);
    return Array.isArray(list) ? list.map(String).filter(Boolean) : [];
  } catch (_) { return []; }
}

// 节点内容载体类型：同一个思维导图里不同节点自动匹配最合适的展示形式
const LIFE_CONTENT_TYPES = ['text', 'table', 'link', 'checklist', 'progress', 'branch', 'calc', 'doc'];

// AI 没显式给 content_type 时按节点内容推断，保证旧数据也能正常渲染
function lifeContentType(row) {
  const given = String(row.content_type || '').trim().toLowerCase();
  if (LIFE_CONTENT_TYPES.includes(given)) return given;
  const kind = String(row.kind || '');
  if (kind === 'milestone') return 'branch';
  const text = `${String(row.title || '')} ${String(row.detail || '')}`;
  if (/对比表|汇总表|任务表|清单表|时间节点表/.test(text)) return 'table';
  if (/完成率|进度|快照/.test(text)) return 'progress';
  if (/正确率|测算|仓位|资金|时长统计|得分/.test(text)) return 'calc';
  if (/简历|模板|范文|论文|自我介绍/.test(text)) return 'doc';
  if (/官网|报名网址|题库链接|视频教程|资料链接/.test(text)) return 'link';
  if (kind === 'action') return 'checklist';
  return 'text';
}

// content_body：载体需要的结构化内容（表格行列、链接列表、分支条件等），存 JSON 字符串
function lifeParseBody(value) {
  const text = String(value || '').trim();
  if (!text) return null;
  try {
    const parsed = JSON.parse(text);
    return parsed && typeof parsed === 'object' ? parsed : null;
  } catch (_) { return null; }
}

// 标题归一化：忽略空白与常见中英文标点差异，用于「同名节点就地更新」的去重匹配，
// 否则 AI 每轮措辞略有出入（多一个逗号、少一个空格）就会把同一件事重复建成新节点。
function lifeTitleKey(value) {
  return String(value || '')
    .replace(/\s+/g, '')
    .replace(/[，。、；：""''（）()【】\[\]…·,.;:!?~\-_/\\|]/g, '')
    .toLowerCase();
}

// 从 AI 原文里直接抠 summary：即使 JSON 被 token 上限截断（nodes 数组断在中途），
// 排在 JSON 最前面的 summary 字段依然完整，正则兜底取出，避免自然语言解读整段丢失。
function extractLifeSummary(raw) {
  const match = /"summary"\s*:\s*"((?:[^"\\]|\\.)*)"/.exec(String(raw || ''));
  if (!match) return '';
  try { return JSON.parse(`"${match[1]}"`); } catch (_) { return match[1]; }
}

function lifeNodeOut(row) {
  return {
    id: row.id,
    parentId: row.parent_id || '',
    kind: row.kind || 'goal',
    domain: row.domain || '成长',
    title: row.title || '',
    detail: row.detail || '',
    risk: row.risk || '',
    priority: row.priority || '',
    series: row.series || '',
    status: row.status || 'todo',
    horizon: row.horizon || '',
    // 开始日期与截止日期分开展示：horizon＝截止日期，startDate＝开始日期
    startDate: row.start_date || '',
    weight: Number(row.weight) || 50,
    timeGroup: LIFE_TIME_GROUPS.includes(row.time_group) ? row.time_group : '',
    deps: lifeParseDeps(row.deps),
    // 横向网状关联：跨赛道联动 / 时间冲突 / 精力冲突 / 任务互相影响
    referenceIds: lifeParseDeps(row.reference_ids),
    // 公共节点：复盘 / 方法 / 资料 / 模板只生成一次，全网络复用
    shared: Number(row.is_shared) === 1,
    stepNo: Number(row.step_no) || 0,
    contentType: lifeContentType(row),
    contentBody: lifeParseBody(row.content_body),
    progressNote: row.progress_note || '',
    source: row.source || 'ai',
    sortOrder: Number(row.sort_order) || 0,
    createdAt: Number(row.created_at) || 0,
    updatedAt: Number(row.updated_at) || 0
  };
}

async function listLifeNodes() {
  const [rows] = await pool.query('SELECT * FROM life_plan_nodes ORDER BY sort_order ASC, created_at ASC');
  return rows.map(lifeNodeOut);
}

// 「大脑」中心节点（kind=self）兜底：它必须永远存在，是整张规划网络的起点锚。
// 任何一次读取规划前都先确保它存在 —— 历史数据被清掉 / 误删时自动补回，用户永远能看到根节点
async function ensureLifeSelfNode() {
  const [rows] = await pool.query("SELECT id FROM life_plan_nodes WHERE kind = 'self' ORDER BY created_at ASC LIMIT 1");
  if (rows.length) {
    // 「大脑」只能有一个：模型某轮把中心节点改叫「我」（而不是「我的人生画像」）时，按标题匹配会再插一个 self，
    // 画布上就散出两个根、赛道挂在哪个根上全看运气。这里在每次读取规划前收口：
    // 保留最早的那个当大脑，把重复大脑下面的子节点改挂回来，再清掉重复节点。
    const keep = String(rows[0].id);
    const [dupes] = await pool.query("SELECT id FROM life_plan_nodes WHERE kind = 'self' AND id <> ?", [keep]);
    for (const dupe of dupes) {
      await pool.execute('UPDATE life_plan_nodes SET parent_id = ? WHERE parent_id = ?', [keep, String(dupe.id)]);
      await pool.execute('DELETE FROM life_plan_nodes WHERE id = ?', [String(dupe.id)]);
      console.log(`[life-self] 发现重复的大脑节点 ${dupe.id}（子节点已改挂到 ${keep}），已清理`);
    }
    return keep;
  }
  const id = crypto.randomUUID();
  const now = Date.now();
  await pool.execute(
    'INSERT INTO life_plan_nodes (id, parent_id, kind, domain, title, detail, status, horizon, weight, content_type, source, sort_order, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
    [id, '', 'self', '成长', '我的人生画像', '方法：把所有赛道挂在它下面统一推进；验收：各条赛道闭环；资源：', 'doing', '', 100, 'text', 'ai', 0, now, now]
  );
  return id;
}

async function resolveLifeModel() {
  const [rows] = await pool.query("SELECT setting_key, setting_value FROM ai_settings WHERE setting_key IN ('ai_model_routes', 'default_model')");
  const map = new Map(rows.map(row => [row.setting_key, row.setting_value]));
  let model = '';
  try {
    const routes = JSON.parse(map.get('ai_model_routes') || '{}');
    model = routes.life || routes.assistant || '';
  } catch (_) { /* 路由配置异常时退回默认模型 */ }
  // 优先用板块分配的模型，其次用设置里的默认模型，最后才退回内置默认
  return model || map.get('default_model') || 'agnes-2.5-flash';
}

// 节点清单分两层喂给 AI，解决「节点一多模型就看不全、越规划越乱」：
//   ① detail：真正需要完整字段的节点（骨架 / 未来 60 天 / 高权重），最多 80 条 —— 供模型决定改哪个字段
//   ② index：其余节点只给 id + 标题 + 状态（三列，很便宜）—— 判重靠它，
//      保证「同一件事已有节点时一律 update」，所以节点长到几百条也不会再重复长出来
function lifePlanBrief(nodes) {
  const list = Array.isArray(nodes) ? nodes : [];
  const brief = node => ({ id: node.id, kind: node.kind, domain: node.domain, title: node.title, status: node.status, startDate: node.startDate, horizon: node.horizon, weight: node.weight, priority: node.priority, series: node.series, timeGroup: node.timeGroup, deps: node.deps, stepNo: node.stepNo });
  const soon = lifeDateShift(todayStr(), 60);
  const needsDetail = node => node.kind === 'self' || node.kind === 'domain'
    || (/^\d{4}-\d{2}-\d{2}$/.test(String(node.horizon || '')) && node.horizon <= soon)
    || Number(node.weight) >= 70;
  const detail = [];
  const index = [];
  for (const node of list) {
    if (needsDetail(node)) detail.push(node);
    else index.push({ id: node.id, title: node.title, status: node.status });
  }
  detail.sort((a, b) => String(a.horizon || '9999').localeCompare(String(b.horizon || '9999')) || Number(b.weight || 0) - Number(a.weight || 0));
  return {
    total: list.length,
    note: 'detail 是可改字段的节点（骨架 / 未来 60 天 / 高权重）；index 是其余节点的标题索引，只用于判断「这件事是否已有节点」——同一件事在 detail 或 index 里出现过，就必须用 update，禁止再新增。',
    detail: detail.slice(0, 80).map(brief),
    index
  };
}

// 全局人物画像 + 未来发展路径库的现有内容，供 AI 增量更新（没放进去的话 AI 会重复生成或覆盖错内容）
async function lifePersonaContext() {
  try {
    const [personaRow] = await pool.query('SELECT * FROM life_persona ORDER BY updated_at DESC LIMIT 1');
    const [pathRows] = await pool.query('SELECT * FROM life_future_paths ORDER BY sort_order ASC LIMIT 40');
    return [
      '【当前全局人物画像】',
      JSON.stringify(lifePersonaOut(personaRow[0] || null)),
      '',
      '【当前未来发展路径库】',
      JSON.stringify(pathRows.map(lifePathOut))
    ].join('\n');
  } catch (err) {
    return '【当前全局人物画像】（暂无）\n\n【当前未来发展路径库】（暂无）';
  }
}

// ===== 动态人物画像：不是手填的静态文本，而是由右侧规划网络的真实完成度反推 =====
// 用户要求：画像要说明「我现在的状态 / 能力 / 行为习惯 / 性格 / 资源」，并据此推断
// 「未来能做什么、做这些事的优势」，而且要随右侧规划持续变化。
// 实现：① 先把节点与每日任务压成一份「完成度事实清单」（全是数字与标题，不让模型凭空想象）
//      ② 再让模型据事实清单反推七维画像 ③ 结果落库，右侧规划一变就重算，前端挂在画像树最上面一层。
const LIFE_PERSONA_DERIVED_DIMS = [
  { key: 'state', label: '当前状态', hint: '整体推进节奏与压力水位' },
  { key: 'abilities', label: '能力基线', hint: '从已完成部分看已经具备的能力' },
  { key: 'habits', label: '行为习惯', hint: '执行节奏、打卡稳定性、延期情况' },
  { key: 'traits', label: '性格特质', hint: '从完成与放弃的取舍反推的倾向' },
  { key: 'resources', label: '资源盘点', hint: '已掌握的资料、工具、渠道、证书' },
  { key: 'future', label: '未来可做的事', hint: '按当前状态未来 1~3 年能承接的事' },
  { key: 'advantage', label: '相对优势', hint: '做这些事时强在哪里、代价是什么' }
];

// 距今天的天数：正数表示还没到，负数表示已过期
function lifeDaysUntil(date) {
  if (!LIFE_DATE_RE.test(String(date || ''))) return null;
  const target = new Date(`${date}T00:00:00`);
  if (Number.isNaN(target.getTime())) return null;
  const today = new Date(`${todayStr()}T00:00:00`);
  return Math.round((target - today) / 86400000);
}

// 把规划网络与每日任务压成事实清单：只保留数字、标题、日期，情绪与评价一律交给模型
function computePersonaStats(nodes, tasks) {
  const alive = (nodes || []).filter(n => String(n.status) !== 'drop');
  const seriesMap = new Map();
  for (const node of alive) {
    const key = String(node.series || node.domain || '未分组').trim() || '未分组';
    if (!seriesMap.has(key)) seriesMap.set(key, { series: key, total: 0, done: 0, doing: 0, delay: 0, overdue: 0, next: '', titles: [] });
    const item = seriesMap.get(key);
    item.total += 1;
    const status = String(node.status || 'todo');
    if (status === 'done') item.done += 1;
    else if (status === 'doing') item.doing += 1;
    else if (status === 'delay') item.delay += 1;
    const days = lifeDaysUntil(node.horizon);
    if (status !== 'done' && days !== null && days < 0) item.overdue += 1;
    if (node.horizon && (!item.next || String(node.horizon) < item.next)) item.next = String(node.horizon);
    if (['action', 'goal', 'milestone'].includes(String(node.kind)) && item.titles.length < 6) {
      item.titles.push(`${node.title}（${status}${node.horizon ? ` · ${node.horizon}` : ''}）`);
    }
  }
  const taskList = tasks || [];
  const repeatCount = { daily: 0, weekday: 0, weekly: 0, once: 0, '': 0 };
  for (const task of taskList) {
    const key = String(task.repeat || '');
    repeatCount[repeatCount[key] === undefined ? '' : key] += 1;
  }
  // 最近 14 天：逐日完成条数，用来判断节奏是稳定、爆发还是断档
  const recent = [];
  for (let i = 13; i >= 0; i -= 1) {
    const date = lifeDateShift(todayStr(), -i);
    const dayTasks = taskList.filter(t => String(t.date || '').slice(0, 10) === date);
    recent.push({ date, total: dayTasks.length, done: dayTasks.filter(t => String(t.status) === 'done').length });
  }
  // 资源类节点：标题或 detail 里带官方入口 / 资料特征的（kind=goal 或标题含 资料 / 模板 / 方法 / 入口 / 网站 / 课程）
  const resourceNodes = alive.filter(node => node.kind !== 'action' && /资料|模板|方法|入口|网站|课程|书|题库|平台|官网/.test(`${node.title} ${node.detail || ''}`));
  const allLinks = new Set();
  for (const node of alive) for (const url of lifeUrlsIn(`${node.detail || ''} ${node.risk || ''}`)) allLinks.add(url);
  const doneNodes = alive.filter(n => String(n.status) === 'done');
  const total = alive.length;
  return {
    today: todayStr(),
    nodeTotal: total,
    nodeDone: doneNodes.length,
    nodeDoing: alive.filter(n => String(n.status) === 'doing').length,
    nodeDelay: alive.filter(n => String(n.status) === 'delay').length,
    nodeDrop: (nodes || []).length - total,
    completionRate: total ? Math.round((doneNodes.length / total) * 100) : 0,
    taskTotal: taskList.length,
    taskDone: taskList.filter(t => String(t.status) === 'done').length,
    taskDelay: taskList.filter(t => String(t.status) === 'delay').length,
    repeatCount,
    recent,
    series: [...seriesMap.values()].sort((a, b) => b.total - a.total).slice(0, 8),
    doneSample: doneNodes.slice(0, 20).map(n => n.title),
    blockedSample: alive.filter(n => String(n.status) === 'delay').slice(0, 10).map(n => `${n.title}（截止 ${n.horizon || '未定'}）`),
    urgent: alive.filter(n => { const d = lifeDaysUntil(n.horizon); return d !== null && d >= 0 && d <= 30 && String(n.status) !== 'done'; }).length,
    upcoming: alive
      .filter(n => { const d = lifeDaysUntil(n.horizon); return d !== null && d >= 0 && d <= 90 && String(n.status) === 'todo'; })
      .sort((a, b) => String(a.horizon).localeCompare(String(b.horizon)))
      .slice(0, 10)
      .map(n => `${n.horizon}｜${n.title}｜P${String(n.priority || '').replace(/^P/, '') || '-'}`),
    resources: resourceNodes.slice(0, 15).map(n => n.title),
    linkCount: allLinks.size,
    examNodes: alive.filter(n => /考试|准考证|报名|笔试|面试/.test(`${n.title}`)).slice(0, 10).map(n => `${n.title}（${n.status} · ${n.horizon || '未定'}）`)
  };
}

async function readLifeDerivedRow() {
  const [rows] = await pool.query('SELECT * FROM life_persona_derived ORDER BY updated_at DESC LIMIT 1');
  return rows[0] || null;
}

function lifeDerivedOut(row) {
  const out = { updatedAt: Number(row?.updated_at) || 0, progress: null };
  for (const dim of LIFE_PERSONA_DERIVED_DIMS) out[dim.key] = String(row?.[dim.key] || '');
  try { out.progress = row?.progress_json ? JSON.parse(row.progress_json) : null; } catch (_) { out.progress = null; }
  return out;
}

const LIFE_PERSONA_DERIVE_SYSTEM = `你是人生规划分析师。用户会给你一份「规划完成度事实清单」，全部来自他规划网络与每日任务里的真实数据。

请据此反推他此刻的人物画像。只依据清单里的数字与标题，不要凭空想象，不要夸奖或批评，不要灌鸡汤。
输出一个 JSON 对象，7 个维度各给 2 到 4 条短句，每条 12 到 30 字，口语化、具体、能一眼看懂：
{"state":[],"abilities":[],"habits":[],"traits":[],"resources":[],"future":[],"advantage":[]}

要求：
1. 每条结论都必须能对上清单里的数字或标题（例如「已完成 14 / 51 项」「4 条延期里有 3 条是英语」），禁止「你很努力」「继续保持」这类没有依据的空话。
2. resources 是统计口径，不是网址列表：写「已收集 N 个官方入口 / 已有 X 资料与题库」，不要把节点标题里的网址原样抄成一条。
3. future 写「按他现在的实际状态，未来 1 到 3 年能承接的具体事情」（结合各赛道的完成率与剩余时间），例如「按当前节奏可在 2027 年报考软考高级」。依据不足时直接写「数据太少，暂不足以推断」。
4. advantage 至少写 1 条优势与 1 条代价/短板，都要能对上清单依据。
5. 只输出 JSON，不要任何解释文字或代码块标记。`;

// 完成度指纹：用来判断「右侧规划有没有真的变」，没变就不重复花钱调模型
function lifePersonaSignature(stats) {
  const basis = {
    n: [stats.nodeTotal, stats.nodeDone, stats.nodeDoing, stats.nodeDelay, stats.nodeDrop],
    t: [stats.taskTotal, stats.taskDone, stats.taskDelay],
    r: stats.repeatCount,
    s: stats.series.map(item => [item.series, item.total, item.done, item.delay]),
    d: stats.doneSample,
    b: stats.blockedSample
  };
  return crypto.createHash('sha1').update(JSON.stringify(basis)).digest('hex');
}

// 重算动态画像：先在库外算好事实清单，再交给模型推理，失败时保留上一版（宁可旧也不能空）
async function deriveLifePersona(reason) {
  const nodes = await listLifeNodes();
  const tasks = await listLifeTasks();
  const stats = computePersonaStats(nodes, tasks);
  if (!stats.nodeTotal && !stats.taskTotal) return null;
  const signature = lifePersonaSignature(stats);
  const row = await readLifeDerivedRow();
  // 指纹一致说明规划没有实质变化，直接复用上一版，避免每次刷新都调一次模型
  if (row && String(row.signature || '') === signature) {
    const cached = lifeDerivedOut(row);
    cached.changed = false;
    return cached;
  }
  const facts = JSON.stringify(stats, null, 1).slice(0, 12000);
  const model = await resolveLifeModel();
  const raw = await callAI(
    LIFE_PERSONA_DERIVE_SYSTEM,
    `【今天】${lifeTodayText()}\n【规划完成度事实清单】\n${facts}\n\n请据此输出画像 JSON。`,
    null, model, 120000, 4096
  ).catch(err => { console.warn('[life-persona] 动态画像推理失败：', err.message); return ''; });
  const parsed = parseLifeJson(raw);
  if (!parsed || typeof parsed !== 'object') {
    const fallback = lifeDerivedOut(row);
    fallback.changed = false;
    return fallback;
  }
  const now = Date.now();
  const values = LIFE_PERSONA_DERIVED_DIMS.map(dim => (Array.isArray(parsed[dim.key]) ? parsed[dim.key] : [])
    .map(line => lifeText(line, 120)).filter(Boolean).join('\n'));
  if (row) {
    await pool.execute(
      `UPDATE life_persona_derived SET ${LIFE_PERSONA_DERIVED_DIMS.map(d => `${d.key} = ?`).join(', ')}, progress_json = ?, signature = ?, updated_at = ? WHERE id = ?`,
      [...values, JSON.stringify(stats).slice(0, 60000), signature, now, row.id]
    );
  } else {
    await pool.execute(
      `INSERT INTO life_persona_derived (id, ${LIFE_PERSONA_DERIVED_DIMS.map(d => d.key).join(', ')}, progress_json, signature, updated_at) VALUES (?, ${LIFE_PERSONA_DERIVED_DIMS.map(() => '?').join(', ')}, ?, ?, ?)`,
      [crypto.randomUUID(), ...values, JSON.stringify(stats).slice(0, 60000), signature, now]
    );
  }
  console.log(`[life-persona] 动态画像已重算（${reason || '手动'}）：完成度 ${stats.completionRate}%（节点 ${stats.nodeDone}/${stats.nodeTotal}，任务 ${stats.taskDone}/${stats.taskTotal}）`);
  const out = lifeDerivedOut(await readLifeDerivedRow());
  out.changed = true;
  return out;
}

// 增量路径（对话 / 一键提取）与全量重生成走的是不同代码路径：前者只拿到 ops，没有完整节点数组，
// 所以这里做一次「库上的收口」——直接改库里那几条关键行，效果与全量路径一致。
// 先从已有节点里认出「考试当天」的日期，再把落在那一天的其它备考节点提前一日。
// 只依赖规划自身的一致性，不需要预先写死任何考试的日期。
async function enforceStoredExamAnchors() {
  const [rows] = await pool.query("SELECT id, title, horizon FROM life_plan_nodes WHERE horizon <> ''");
  const examDays = new Set(rows
    .filter(row => LIFE_DATE_RE.test(String(row.horizon)) && LIFE_EXAM_DAY_RE.test(String(row.title || '')))
    .map(row => String(row.horizon)));
  if (!examDays.size) return 0;
  let changed = 0;
  for (const row of rows) {
    const day = String(row.horizon);
    if (!examDays.has(day)) continue;
    if (LIFE_EXAM_DAY_RE.test(String(row.title || ''))) continue;
    if (!LIFE_PREP_RE.test(String(row.title || ''))) continue;
    await pool.execute('UPDATE life_plan_nodes SET horizon = ?, time_group = ?, updated_at = ? WHERE id = ?',
      [lifeDateShift(day, -1), 'urgent', Date.now(), row.id]);
    console.log(`[life-anchor] 增量路径前移截止日期：「${row.title}」${day} → ${lifeDateShift(day, -1)}`);
    changed += 1;
  }
  return changed;
}

// 【时间骨架收口】赛道 / 目标这类中间层节点以前不带任何日期，画布上就只剩「近期」两个字，
// 用户看不出「什么时候开始、什么时候结束、时间长了怎么办」。这里在库上按子树推算落地日期：
//   开始日期 = 子树里最早的计划日期；截止日期 = 子树里最晚的计划日期（不含人生推演远期分支）
// 只补空值，绝不覆盖节点自己已有的真实日期。
function lifeTimeGroupOf(date) {
  const days = lifeDaysUntil(date);
  if (days === null) return '';
  return days <= 30 ? 'urgent' : days <= 90 ? 'mid' : 'future';
}

// 模型有时把日期写进标题、日期字段却空着（「2026年11月30日 国考笔试」），
// 这里按标题里的完整年月日兜底，避免里程碑在画布上没有日期、用户看不到终点
function lifeDateFromText(text) {
  const hit = String(text || '').match(/(20\d{2})\s*年\s*(\d{1,2})\s*月\s*(\d{1,2})\s*日/);
  if (!hit) return '';
  return `${hit[1]}-${String(hit[2]).padStart(2, '0')}-${String(hit[3]).padStart(2, '0')}`;
}

// 占着日期字段的模糊刻度 / 临时说法（「近期 / 中期 / short / 即时」这类）都不是日期，
// 从日期字段里清掉，交给下面按子树推算真实起止日期
const LIFE_SCALE_WORD_RE = /^(short|mid|long|urgent|future|近期|中期|远期|长期|短期|近期内|中期内|远期内|即时|立刻|马上|尽快|待定|待安排|tbd|now|asap)$/i;

// 远期「结局推演」节点（上岸 / 失利 / 兜底线）本身没有确定日期，不参与日期域推算，也不给它硬塞日期
const LIFE_OUTCOME_RE = /(上岸|失利|失败|兜底|成功人生|人生状态|结局)/;

async function fillLifeContainerDates() {
  const [rows] = await pool.query('SELECT id, parent_id, kind, title, series, horizon, start_date FROM life_plan_nodes');
  if (!rows.length) return 0;
  const byId = new Map(rows.map(row => [String(row.id), row]));
  const isOutcome = row => String(row.kind) === 'milestone' && LIFE_OUTCOME_RE.test(String(row.title || ''));
  const isDate = value => LIFE_DATE_RE.test(String(value || ''));
  let changed = 0;
  // ① 清掉非法的模糊刻度（远期结局推演节点允许保留「1年内」这类刻度，不动它们）
  for (const row of rows) {
    const raw = String(row.horizon || '').trim();
    if (!raw || isDate(raw) || isOutcome(row)) continue;
    if (!LIFE_SCALE_WORD_RE.test(raw)) continue;
    row.horizon = '';
    await pool.execute('UPDATE life_plan_nodes SET horizon = ?, updated_at = ? WHERE id = ?', ['', Date.now(), String(row.id)]);
    changed += 1;
  }
  const children = new Map();
  for (const row of rows) {
    const pid = String(row.parent_id || '');
    if (!pid || !byId.has(pid) || isOutcome(row)) continue;
    if (!children.has(pid)) children.set(pid, []);
    children.get(pid).push(row);
  }
  // ② 递归求子树日期范围（记忆化，depth 上限兜住环形父子关系）
  const rangeCache = new Map();
  function rangeOf(row, depth = 0) {
    const key = String(row.id);
    if (rangeCache.has(key)) return rangeCache.get(key);
    let min = '';
    let max = '';
    const take = value => {
      if (!isDate(value)) return;
      const day = String(value).slice(0, 10);
      if (!min || day < min) min = day;
      if (!max || day > max) max = day;
    };
    take(row.horizon);
    take(row.start_date);
    take(lifeDateFromText(row.title));
    if (depth < 20) for (const child of children.get(key) || []) {
      const inner = rangeOf(child, depth + 1);
      take(inner.min);
      take(inner.max);
    }
    const range = { min, max };
    rangeCache.set(key, range);
    return range;
  }
  // ③ 补日期：截止日期取子树最晚日，开始日期取子树最早日（只有真跨了日子才写，避免单点节点显示成「11-30 → 11-30」）
  //    赛道（domain）的日期天然就是「这条赛道从哪天开始、到哪天结束」，每次都按子树重算；
  //    其他层级只在字段为空时补，不覆盖 AI 明确写下的日期
  for (const row of rows) {
    if (String(row.kind) === 'self' || isOutcome(row)) continue;
    const { min, max } = rangeOf(row);
    if (!max) continue;
    const isTrack = String(row.kind) === 'domain';
    const wantStart = min && min < max;
    const sets = [];
    const values = [];
    if (isTrack || !isDate(row.horizon)) { sets.push('horizon = ?'); values.push(max); }
    if (wantStart && (isTrack || !isDate(row.start_date))) { sets.push('start_date = ?'); values.push(min); }
    if (!sets.length) continue;
    sets.push('time_group = ?', 'updated_at = ?');
    values.push(lifeTimeGroupOf(max), Date.now(), String(row.id));
    await pool.execute(`UPDATE life_plan_nodes SET ${sets.join(', ')} WHERE id = ?`, values);
    // 同步到内存快照，方便下面的叶子继承拿到父节点刚补好的日期
    if (isTrack || !isDate(row.horizon)) row.horizon = max;
    if (wantStart && (isTrack || !isDate(row.start_date))) row.start_date = min;
    changed += 1;
  }
  // ④ 叶子任务没有任何日期时继承父节点的截止日：它们是父任务的具体步骤，不该在画布上显示成「未设置」
  for (const row of rows) {
    if (String(row.kind) === 'self' || isOutcome(row)) continue;
    if (String(row.horizon || '').trim()) continue;
    if (isDate(row.start_date)) continue;
    if ((children.get(String(row.id)) || []).length) continue;
    const parent = byId.get(String(row.parent_id || ''));
    if (!parent || !isDate(parent.horizon)) continue;
    const day = String(parent.horizon).slice(0, 10);
    await pool.execute('UPDATE life_plan_nodes SET horizon = ?, time_group = ?, updated_at = ? WHERE id = ?', [day, lifeTimeGroupOf(day), Date.now(), String(row.id)]);
    changed += 1;
  }
  return changed;
}

// 提示词需要绝对日期：模型自己推算不出现实日期，统一在这里给出
const LIFE_WEEKDAYS = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];
function lifeTodayText() {
  return `${todayStr()} ${LIFE_WEEKDAYS[new Date().getDay()]}`;
}

function lifeTranscript(messages) {
  return messages
    .map(m => `${m.role === 'user' ? '我' : '导师'}：${String(m.content || '').slice(0, 800)}`)
    .join('\n');
}

function lifeText(value, max) {
  return String(value == null ? '' : value).trim().slice(0, max);
}

function lifeClampWeight(value) {
  const num = Number(value);
  if (!Number.isFinite(num)) return 50;
  return Math.max(1, Math.min(100, Math.round(num)));
}

// 【日期锚定铁律】最高优先级公共规则：所有规划类 system prompt 都必须带上它。
// 起因：AI 以前把备考任务的 horizon 写成「中期」这类模糊刻度，结果排布出来的时间点落到了
// 真实考试日期之后（等于规划出来就已经错过了考试），所以这里强制一切日期必须是绝对公历日期。
const LIFE_DATE_ANCHOR_RULES = `【日期锚定铁律（最高优先级，优先于其它一切排版与拆解规则）】
1. 提问上下文里的【今天】是唯一时间基准。所有任务节点、每日任务、里程碑与外部事件的日期，一律写成绝对公历日期 YYYY-MM-DD；
   禁止用「近期 / 中期 / 远期 / 一个月内 / 下个月 / 年底 / 备考期」这类相对刻度或模糊词当作 horizon（时间刻度只允许保留给「几年后」的远期人生推演 milestone）。
2. 备考 / 考试 / 考证 / 报名 / 截止 / 面试 / 答辩类目标（四级、考研、国考、软考、论文答辩、招聘截止…）必须先把该事项的**真实举办日期**确定下来（联网查实，或用用户已明确给出的日期），再以它为锚点向前倒排：
   · 该赛道末端【正式考试日 / 截止日】milestone 的 horizon ＝ 真实日期，标题写「日期 + 时间 + 名称」；
   · 这条赛道上所有报名、复习、刷题、模拟、打印准考证等任务的 horizon 必须**早于**真实考试日，并且必须由「考试日 − 备考周期」倒推成具体日期；
   · 严禁把这些任务的 horizon 写成「中期」这类模糊刻度；严禁把任何备考任务排到考试日**之后**（那等于规划出来就已经错过考试，属于严重错误）。
3. 真实日期暂时查不到时：horizon 留空，改为写一条待检索（op="queue_search"，字段 query / nodeId / priority / estCost），并把这些任务先排在「未知考试日」之前的合理区间，绝不允许拿一个模糊刻度顶替真实日期。
4. 禁止把任何任务 / 事件的日期排在【今天】之前的过去时间（复盘已发生的事除外）；如果按备考周期倒推出来是过去的日期，说明该事项已经过期，必须改为「已错过，需重新规划」并在 detail 里说明，不要硬排一个过期日期。
5. 每次输出前自查一遍：这条赛道的正式考试日是哪天？我排的每个任务是不是都在它之前？有没有出现「中期 / 远期」这种没落到具体日期的写法？
6. 赛道节点与目标节点必须自带 startDate（开始日期）与 horizon（截止日期）：赛道 / 目标本身没有天然日期时，取它下面最早任务日作为 startDate、最晚里程碑日作为 horizon，
   画布要能显示成「开始日期 → 结束日期」；只给「近期 / 中期」这种刻度标签就等于没排期，用户看不出这条赛道什么时候开始、什么时候结束。
7. 时间必须铺满整条时间线，禁止把整张图全压在一周内：每条赛道至少要有 近期（本周内）、中期（1~3 个月）、远期（3 个月以上，例如出成绩、面试、上岸、副业变现）三档各 1 条可执行任务或里程碑，
   时间跨度长的赛道要把「远期」拆成阶段里程碑，让用户能看出这条路要走多久、在哪里收尾。
8. 周期性任务（刷题 / 背单词 / 练听力 / 复盘 / 打卡）必须写清「从哪天开始、重复到哪天结束」（一般到考试前一日为止），不能只出现在某一天：startDate 写起始日，horizon 写结束日，repeat 写「每日重复」。`;

// 联网判断用的轻量提示（只负责意图识别与是否检索，不负责最终排版）
const LIFE_CHAT_SYSTEM = `你是全维度人生规划智能助手，拥有 web_search 联网检索工具，冷静、务实、不灌鸡汤、不画饼。
先判断用户这句话属于哪一类意图：查询信息 / 修改计划 / 记录任务完成情况 / 学习方法咨询 / 复盘本周进度 / 推演未来路线 / 调整赛道目标。
若涉及实时数据（行业就业与薪资、考试报名与考试时间、报考政策、物价汇率、营养标准等），按需调用 web_search；纯粹的个人推演、计划排期、风险预判、概念解释不要联网。
用户只是在**修改他自己的规划**时（例：「我不考听力」「这步不做了」「改成每周一次」「把这条删掉」「换一个目标」），属于「改规划」不是「查资料」：直接按新意图增删改规划网络里的节点与任务，不要联网检索，更不要去核实或质疑他的决定是否成立 —— 他说不考就是不考，不需要你查资料证明这个决定对不对。只有他自己明确要查实时信息（报名时间、政策、官网、价格等）时才检索。
检索次数是按需的：同一个问题最多可检索 3 次。一次并列提出最关键的 1~3 个关键词，拿到结果后如果还缺关键资料（例如只搜到考试科目、没搜到报名时间），再用新关键词补搜一次；禁止重复检索同一关键词。超过 3 次的检索需求会被系统转入待审批队列（不付费、当时拿不到结果），所以优先把最关键的查询一次提全。
生成 query 时只锁定「核心实体 + 目标时间 + 问题领域」，一轮最多 1~2 条，不把多年份、多实体、无关宽泛词（日历 / calendar 之类）塞进同一条 query；涉及招考 / 考试时必须区分「招考届次」与「自然年份」（2027 届国考 ≠ 2027 自然年），同一条 query 不混多届名称。`;

// 节点内容载体（通用，所有层级节点按需自动匹配）+ 通用递归拆解逻辑 + 增量更新约束
// 前端读取 content_type 渲染对应 UI，content_body 存放载体所需的结构化内容
const LIFE_CONTENT_CARRIER_RULES = `【节点内容载体（通用，所有层级节点都可选用，按需自动匹配，不是写死）】
节点支持多种内容载体，AI 自动根据节点内容匹配合适的展示形式，同一个父节点下可以混合多种子节点类型；载体类型写进节点的 content_type 字段，前端据此渲染对应 UI：
1. text：纯文本 / 有序 / 无序列表 —— 知识点、说明、注意事项、流程描述
2. table：表格 —— 任务计划表、对比表、信息汇总表
3. link：链接卡片 —— 可直接点击跳转的资料官网
4. checklist：打卡勾选清单 —— 最小可执行任务，带前置锁定
5. progress：进度快照卡片 —— 完成率、延期统计
6. branch：条件分支卡片 —— 多路径推演（上岸 / 失利等双向结局）
7. calc：计算卡片 —— 时长、正确率、资金测算
8. doc：文档模板卡片 —— 简历、填报模板、范文
content_body 只在载体需要结构化内容时给出（JSON 字符串）：table 用 {"head":[],"rows":[[...]]}；link 用 [{"text":"","href":""}]；checklist 用 [{"text":"","done":false}]；branch 用 [{"cond":"","then":""}]；progress 用 {"done":0,"total":0}；calc 用 {"label":"","expr":"","result":""}；doc 用 {"title":"","body":""}；text 类正文直接写在 detail 里、可省略 content_body。
同一父节点下按内容自动混用：例如【行测备考】父节点下同时挂 table（刷题任务表）、link（题库网址）、text（做题注意事项）、checklist（每日任务）；最小执行任务统一用 checklist，汇总统计用 table，政策说明用 text，多结局推演用 branch。

【通用递归拆解逻辑（适用全部赛道，不限层级、不限分支数量，逐层向外扩散）】
1. L0 全局根节点，下面分出 L1 一级主线赛道。
2. 任意 L=N 节点自动生成 4 个子分支：事件时间节点｜基础信息环境｜风险注意事项｜待完成任务项。
3. 【待完成任务项】继续向下拆解：任务清单、阶段计划、复盘机制、执行方法。
4. 【阶段计划】继续向下拆解：各模块分项任务、进度记录表。
5. 【各模块分项任务】继续拆解细分条目，附带工作量、验收标准、资源链接。
6. 最小可执行任务作为递归终点，不再继续拆分。

【硬性约束】
1. 禁止生成「制定 XX 计划 / 规划 XX 方案 / 整理 XX 清单 / 构思 XX 思路」这类元任务，全部拆成能直接动手的原子动作。
2. 每个节点字段固定包含：节点标识（新增 tempId / 已有 id）、父节点（parentId，重建时用 parentRef）、截止日期 horizon、优先级 priority、前置依赖 deps、资料链接（detail 的「资源：」段与 content_type=link 的 content_body）、风险提示 risk、载体类型 content_type。
3. 泳道视图看时间线；思维导图视图读 parent_id 渲染放射式父子树；子节点与父节点之间用箭头连接（箭头由前端按 parent_id 自动绘制）。
4. 远期双向结局推演挂载在 L0 根节点下，由【显示远期推演节点】开关控制显隐（series 固定填「人生推演」）。
5. 个人档案增量维护，每次对话更新信息，不清空历史档案。
6. 每次对话只新增 / 修改 / 删除受影响的节点，同名节点就地 update，禁止一次性清空重写整张思维导图；只有确实不存在时才新建。
7. 资料入口优先放可直接访问的官方网址（http 开头、点击即开）。
8. 每个节点可带 reference_ids：横向网状关联（跨赛道联动、时间冲突、精力冲突、任务互相影响），与纵向父子树是两个独立维度；引用填本轮 tempId 或已有节点 id，重建时用 referenceRef（数组下标）。
9. 公共节点全局复用：复盘模板、执行方法、资料入口、文档模板这四类只生成一次，全网络共享（用 is_shared 标记），禁止每条赛道各复制一份冗余节点；修改一次全局同步。
10. 缺资料不编造：没有把握的时间、官网、政策数据一律不写死，改为生成「待检索」条目（查询内容 / 关联节点 / 优先级 / 预估费用），绝不调用付费检索接口，等人工审批后回填。

【后台持续自主增量生长模式（最关键）】
系统不是在对话时一次性生成完整网络，而是靠多轮对话 + 后台间歇推理，全自动逐层扩图、越用越完整。所以每轮只对当前最该展开的少数节点做增量下拆、产出追加节点；剩余未展开的叶节点留给后台继续生长，禁止试图一轮铺满整张图，也禁止因为图不完整就重来一遍。

【两套扩充机制（完全隔离）】
1. 纯逻辑推演：免费、无限制、全自动后台生长，靠推理与常识完成拆解，不做外网检索、不产生任何费用。
2. 外部资料检索：不自动扣费，全部攒批后由人工审批才批量执行；检索结果永久缓存，重复需求直接读缓存，不重复扣费。

【任务状态驱动推演（状态变更自动触发局部增量推理）】
最小可执行任务只有三种状态：未开始 / 已完成 / 未完成（延期）。状态变更只更新关联子树，不重绘整张网络：
1. 任务【已完成】：衍生子节点「验收结果」「复盘记录」；解锁以它为前置的后续任务；评估进度盈余，可生成拔高拓展任务；向上更新父目标完成概率。
2. 任务【未完成（延期）】：衍生子节点「未完成原因」「风险评估」「补救备选方案」；向上逐层评估对上级模块、主线赛道、跨关联赛道的连锁负面影响；给出减量 / 延后 / 裁剪低优先级任务的方案。
3. 同一任务的两种分支路径在思维导图视图里都可展开查看；复盘模板、补救方案作为公共节点跨分支复用。

【输出固定格式（六段，按顺序）】
1. 现状总结
2. 今日任务表：标题必须写明日期，形如【今日任务表（YYYY-MM-DD）】；表格列固定为「日期 | 当日任务 | 重复类型 | 预估耗时 | 优先级 | 前置依赖 | 资源链接 | 验收标准 | 风险提示 | 状态」，
   其中「重复类型」列每条都必须填，只取 每日重复 / 每周重复 / 工作日重复 / 单次 四种说法（习惯型任务一律标「每日重复」，一次性动作标「单次」），禁止留空或写「—」。
3. 中长期布局：短 / 中 / 远期每一段都必须给到能直接动手的步骤（做什么、做多少、用多久、先做哪个），
   禁止只写「完成报名、刷完 2 套真题」这类结论句充数；每个阶段至少 2~3 条可执行条目，并标明它落在哪个日期区间。
4. 重点提醒区 + 双向远期推演（成功人生状态 / 失利兜底方案）
5. 结构化增量节点数据（供画布渲染）
6. 本轮待检索账单清单：凡是任务表 / 节点里写了「待检索：…」的，这里必须逐条给出对应检索 query（一行一条，格式「- 待检索｜〈query〉」），
   写完系统会立刻自动联网检索并把真实网址回填到对应任务与节点，不需要人工审批；一条都没有才写「无」，凡是写了「待检索」就不许写「无」。
第 5、6 段是给系统解析画布更新与检索账单用的内部数据块，界面会自动隐藏它们、用户看不到，
因此统一放在回复最末尾，不要在它们中间插入任何给人看的正文。`;

// 通用版检索 + 资料解析规则：不限国考，适用于全部人生规划场景。
// 文案与《人生规划系统-终极总提示词.md》第十节保持一致；后端已按同一套规则做过结果过滤（见 backend/web-search.js）。
const LIFE_SEARCH_RULES = `【通用检索与资料解析规则（不限国考，适用于全部规划场景）】
■ 一、Query 生成
1. 先解析需求，锁定核心实体、目标时间、问题领域，再生成精准查询；禁止把过多年份、多个无关实体一次性塞进同一条 query，避免搜索引擎歧义。
2. 涉及招考 / 考试时，先区分「招考届次」和「自然年份」（例如 2027 届国考 ≠ 2027 自然年），关键词只聚焦目标届次，不要在同一条 query 里混多届考试名称。
3. 禁止在一条 query 里塞大量无关宽泛词（只问考试，就不要附带 日历 / calendar 这类无关词）。
4. 一轮最多生成 1~2 条 query，不批量生成重复检索，节省额度。
■ 二、检索结果解读（后端已先过滤：外文无关站点已丢弃、按 政府官网 > 权威官媒 > 行业正规平台 > 自媒体 排序、去重、最多保留前 8 条并标注发布时间；你看到的就是过滤后的结果）
1. 时效性强的内容（考试时间、政策、岗位、报名窗口）优先采信发布时间最新且来源权威的页面；
2. 发布时间较早的旧资料只当「历史参考，仅用于规律推演」，不能当作现行有效规则；
3. 每条结果都带发布时间标签，先看标签再判断新旧。
■ 三、资料解读约束
1. 资料分两类，输出时必须明确标注：【✅官方官宣信息】来自官网权威页面、确定有效；【⚠️基于历史规律预估】官方暂未发布、仅参考往年经验、存在变动风险。
2. 禁止把旧年份 / 往届的政策、时间、数据直接当成当前目标事件的现行标准。例：上一届已经考完的考试时间，只能用来总结历年规律，不能当下一届的确定时间。
3. 信息冲突时优先级：政府官网原文 > 权威官媒 > 行业正规平台 > 自媒体；冲突点必须在【重点提醒区】写明矛盾点。
4. 引用链接只保留当前事件对应的官方入口，不使用往届旧专题链接。
■ 四、规划输出约束
1. 所有时间节点、政策、岗位、费用等时效性内容必须溯源到检索资料；没有权威资料确认的一律标「预估，以官方后续公告为准」，不编造确定日期。
2. 【重点提醒区】固定提炼高风险时间窗口、截止节点、信息不确定性，并提示用户复核官网。
3. 生成任务表、阶段性规划前先校验时间逻辑：截止日期、报名窗口期不得出现届次 / 年份混淆。
■ 五、故障兜底
1. 过滤后没有权威有效资料：直接写明「暂未检索到官方最新信息，请前往官方渠道核实」，不强行编造时间与数据。
2. 检索噪音过多、有效信息不足：不继续强行多轮搜索，在文档内提示本次信息局限性。`;

// 公共规则：角色定位、联网规则、任务规则、提醒与约束、可视化规则、输出模式
const LIFE_CHAT_RULES = `【角色定位】你是个人长期规划助手。先识别用户意图，再动态产出对应的全套规划材料；同时承担督促角色：每次输出后给一句简短督促，任务过载或目标冲突时主动提示取舍，防止多目标并行导致行动瘫痪。
【通用目标处理流程（适用于所有目标，不限于考试）】用户提出任意目标、计划、事项（考公、考证、毕设、找实习、项目开发、自媒体发帖、理财规划、求职面试……）时，一律走下面这套流程，禁止只对考试生效、禁止硬编码固定信息：
1. 识别已知信息，判断缺哪些关键条件（是否已启动 / 截止时间 / 验收标准 / 前置条件 / 资源与阻碍），缺则主动提问确认；只要涉及时间类事项（报名、考试、公示、截止日、面试窗口），必须先联网查实时日期与规则，禁止写死时间或凭记忆作答。
2. 按截止时间向前倒推拆出子任务与里程碑；每个节点都分配 series 系列字段（同一件大事归同一个 series），送入【短期横向时间线】画布，同 series 的节点落在同一条横向条带、带内从左到右即时间先后。
3. 主动推演这个目标的多种结局分支（不止成功 / 失败两种；复杂目标可以有 3~4 条），逐条推演连锁影响：该分支会新增或删除哪些任务、对其他主线（国考、求职、毕设）产生什么影响、会衍生出哪些新目标 / 补救方案 / 机会收益。分支统一写入【人生推演】树状图（series 固定填「人生推演」）。
4. 输出固定版式文本：【重点提醒区】+ 任务表格 + 阶段任务摘要 + 进度快照，同时给出画布更新指令，增量更新右侧规划节点，不全量重绘整张图。
5. 后续对话持续联动：用户更新状态（任务做完、计划变更、结果落地）时，更新对应节点状态、自动刷新进度快照、评估精力负荷，并动态调整【人生推演】各分支的可行性、增删衍生任务。
【用户背景】软件工程大四学生；优势为专业对口、计算机设计大赛省级一等奖、速度轮滑中级教练员证与二级裁判员证、具备项目开发能力；短板为英语基础薄弱四级待考、容易多目标并行而精力分散；主赛道国考计算机类岗位，备选国企软件岗，软考中级兜底，暂时压缩炒股与副业投入。

【用户个人档案｜全局生效】自动整理并维护一份个人档案，持续更新，用户每次新增个人信息就追加或修正，不要重复询问已记录的内容。档案条目分 7 类：
1. 基础信息（专业、年级、绩点、项目经历、竞赛荣誉）；2. 已掌握技能；3. 待学习技能；4. 证书资质（已取得、备考中、时间节点）；5. 爱好特长；6. 短板风险；7. 偏好与约束（学习时段偏好、适合的任务时长、经济与硬件限制、技术栈与工具偏好）。
每次生成规划、拆解任务、筛选岗位、设计毕设、安排备考或技能学习时，先读取这份档案作为约束条件，所有方案必须贴合用户现有能力、证书、短板与特长，不能脱离现状生成不切实际的计划；任务拆解时给短板项目多留练习时间、给擅长部分适当提高目标；筛选岗位时按专业与证书匹配并过滤无法胜任的方向。档案单独管理，不混入任务节点；不在每次输出里完整粘贴全部档案，只在必要时按需调取，用户询问时再完整展示并支持查看、修改、删除。

【自动连锁更新】出现下列任一情况，整套模块全部重算并同步更新：任务完成/延期/放弃；技能变化；存款收入资产变动；赛道变更；考试时间等外部信息更新；个人精力或身体状态变化。
【任务未完成的连锁修正】任务延期时禁止全盘推翻整套规划：先评估连锁影响（高/中/低），再做局部修正——轻微影响只顺延本任务并小幅平移后续；中等影响删减 P2/P3 腾时间、调整里程碑、同步更新每日任务；重大影响评估主赛道可行性并给出备选方案与代价。所有关联模块同步修正，沟通时客观说明影响、给出可落地方案并正向鼓励。
【任务优先级与颗粒度】每条任务标优先级：P0（不做直接废掉主赛道）、P1 重要、P2 次要、P3 可舍弃；过载时优先删 P2/P3，保 P0/P1。任务必须拆到单次 15~90 分钟能做完的最小可执行单元，禁止「学行测」「准备面试」这类模糊大任务。
【全局·递归深度拆解规则（所有目标统一生效，不限考试与求职）】用户新增任何目标或事项（考证、求职、毕设、项目开发、自媒体、理财、副业、日常习惯……），禁止只输出粗粒度大任务，必须递归向下拆分子任务，一直拆到最小可执行单元：
1. 最小子任务标准：单次执行 15~90 分钟，动作明确、能直接动手做，不允许停留在「刷题」「复习」「准备」这种粗粒度。
2. 每条最小子任务强制附带 4 项信息，内容支持用户自由编辑增删：① 执行操作方法（一步一步怎么做）② 参考资源（优先写 http 开头、点击就能打开的真实网址：报名官网、刷题 / 真题网站、教学视频链接；文字只作链接备注；暂时找不到网址时写「待检索：〈要查什么〉」，并同步写进回复末尾【本轮待检索账单清单】，系统会自动联网检索并把真实网址回填进来；禁止写「搜索关键词」这类点不开的死占位）③ 验收标准（做到什么程度算完成）④ 风险提示（容易踩坑的问题）。
3. 自动识别任务先后逻辑，设置前置依赖：前置任务未完成，后续子任务不可启动；依赖只填直接前置，前后串成链，禁止把一批孤立的大任务平铺。
4. 同一条主线下的全部父子任务归属同一个 series，前端自动放到同一条横向条带。
5. 涉及招聘、报名、考试、活动等有时间窗口的目标：必须先联网查真实起止时间，按真实窗口倒排任务，禁止写死时间或滞后错过窗口期（例如秋招岗位集中在 9~11 月开放，投递类任务必须从当前日期即刻启动，不能排到窗口期之后）。
6. 拆解完成后，自动推演该目标的多条结局分支；每条分支内部继续递归拆分子任务，形成链式长期推演，全部写入【人生推演】。
7. 双向联动更新：用户完成 / 修改任意子任务，自动向上更新所有父任务进度，向下重新推算后续全部关联任务、时间线与推演分支，连锁更新整张规划网络。
8. 展示：每条最小子任务必须同时给出「核心要点（把方法与验收压缩成一句，40 字内）+ 执行方法（一步步怎么做）+ 参考资源（优先写 http 开头、点击即开的真实网址，如报名官网 / 刷题真题网站 / 教学视频链接；暂时没有网址时写「待检索：〈要查什么〉」并同步写进末尾【本轮待检索账单清单】，由系统自动检索回填；禁止写「资料名 + 搜索关键词」这种点不开的占位）+ 验收标准（做到什么程度算完成）+ 风险提示」，一并写入每日任务表格对应列并同步到规划网络画布节点；核心信息要平铺在每日任务表格里一眼可见，不能只藏在悬浮浮窗。
【计划由 AI 一次性做完，禁止把「做计划」当成用户任务】推演任何目标时，禁止生成「制定 XX 计划」「规划 XX 方案」「整理 XX 清单」「构思 XX 思路」这类把计划工作甩给用户的元任务，节点和每日任务都不要；计划本身必须由 AI 一次拆到位，直接产出已经拆好的可执行任务（写清具体动作、预估耗时、资料链接、验收标准），用户只负责执行。标题里出现「制定 / 规划 / 整理 / 构思 + 计划 / 方案 / 清单 / 思路」又没写清具体动作时，必须改写成能直接动手做的动作——例如「制定四级备考极简计划」改成「背四级核心词 List 1-3，30 分钟」「做 2023 年 12 月四级真题阅读，40 分钟」「在 xx 网站刷听力短对话 20 题，25 分钟」。
9. 拆解深度硬性要求：同一个目标必须拆出至少 4 个可执行子任务，形成「目标 → 阶段 → 动作」至少 3 层的父子链（每个细分节点都要挂 parentId）；一个赛道只给 1 个顶层节点视为拆解失败，必须继续往下拆到「做什么 + 做多少 + 用多久」的最小单元；一天装不下就分散到多天。
10. 个人档案自动回填：对话里出现用户的个人事实（学历专业年级、绩点、项目与竞赛、已会技能、想学的技能、证书、爱好、短板、时间与经济约束、学习与工具偏好）时，直接写入个人档案对应分类，不要等用户单独开口；用户说「填充档案 / 录入个人信息 / 同步个人资料」时，七个分类一次性各写至少一条。
【思维导图式发散推演规则（核心能力，所有想法 / 目标 / 爱好 / 项目通用）】用户给出任意一个想法、目标、爱好或项目构思（例如「想学钢琴」）时，禁止只给一条直线任务清单，必须把该想法当作思维导图主节点向外发散拆解，逐层推演关联内容并递归生成完整体系：
1. 主节点确立后至少从 6 个方向发散：①学习 / 执行路线 ②知识点清单 ③学习渠道与资源（具体平台、博主、免费站点）④工具与物料 ⑤分阶段任务 ⑥风险与卡点；每个方向继续向下递归到最小可执行单元。
2. 推演必须覆盖完整价值链，不能只停在「学会」：学成后继续推演 ①可选择的兼职 / 变现方向（线上陪练、代做、接单、内容创作等）与对应接单渠道、定价与获客方法；②可报考的相关证书（报考条件、考试科目、报名时间、含金量、备考建议）；③职场与个人增益（公司团建才艺展示、简历素材、社交加分）；④结合用户已有技能的组合机会（跨技能组合产生的新方向）。这部分必须联网核实报名时间、渠道与门槛，禁止凭记忆编造。
3. 一切发散结果都要归类落地：子目标 / 知识点 / 资源 / 物料 / 风险节点归入规划画布对应 series，可执行动作同步转成每日任务清单；画布是宏观总图、每日任务表是执行清单，两者一一对应，禁止只输出一堆节点却没有可执行任务。
4. 发散不等于全部铺开：每个分支都要先经过下面的可行性过滤与里程碑准入，低收益分支只保留一个提示节点、不生成大批任务。
【可行性评估与成本校验】发散出的每个分支在铺开前，先读取【用户个人档案】与当前主线优先级，评估三项成本再决定是否生成任务：①金钱成本（要不要花钱、大概多少）②时间成本（多久入门、多久达到目标水平）③机会成本（是否挤占主赛道，如国考、软考、毕设、求职）。
高投入低收益的分支一律标为低优先级（weight ≤ 30、priority 填 P3），并在 detail 末尾追加一句「可行性：〈取舍理由〉」说明为什么暂缓，禁止为它生成大批任务占用日程；若与主赛道冲突，只安排碎片时间、优先自学、暂缓付费投入，并明确提示用户取舍。
【里程碑准入机制】每个阶段设置里程碑验收，前置阶段验收未通过前不得解锁后续衍生分支：低层级任务用「前置依赖」只指向直接前置一步；考级、兼职、登台、变现等后续分支节点必须挂在对应里程碑之下，只有前置里程碑达成（状态=已完成）才解锁；未解锁的节点与任务在画布和每日任务表上统一标注「待解锁」，禁止一次性把全部远期任务堆给用户。
【风险前置推演】推演任意分支时同步带出风险：学习类写方法与自律风险；兼职变现类写接单坑、中介收费骗局、版权与时间占用风险；考证类写证书含金量、是否与主赛道相关、报名陷阱与信息滞后风险。例如线上陪练要提示「警惕中介收费、零基础不建议直接接单」。风险同时写入节点的风险字段与每日任务表「风险提示」列。
【双向动态剪枝】规划网络支持双向更新：正向由想法推演出学习任务与学成价值分支；反向在任务推进受阻或目标变更时自动裁剪分支——某分支连续两周未推进、或与主赛道冲突时，自动下调其目标、把该分支衍生的节点状态置为「已剪枝」、同步删减其每日任务，并说明剪枝理由；主线紧张时自动把兴趣类分支整体降级，优先保障主线。
【后台自动推送规则】系统持续扫描画布与任务状态，主动汇总推送，不等用户开口问：①今日 / 明日待办任务到期预警；②里程碑进度提醒（距下一个里程碑还有多久、当前完成情况）；③对应考证的报名时间与考试资讯；④技能到达阶段后对应的兼职渠道与机会；⑤任务过载预警（计划总时长超过单日上限立即提示减负）；⑥每周定期复盘提醒。这些推送统一汇总到「提醒汇总」看板与【重点提醒区】。
【规划快照与版本回退】新增目标、调整方向等大改动时自动留存一份规划快照存档，支持随时回看并回退到历史版本、对比前后方案差异；回退前先说明会被改动的节点与任务，避免误操作。
【画布自适应规则】规划画布的条带容器不是固定尺寸：一条 series 主线内节点变多时，条带容器自动加高并把节点分行排布，节点圆圈与文字标签自动错开、不重叠；画布整体高度随条带数量与内容自适应，节点越多容器越大。节点少时一行平铺，放不下就标签上下交错，仍放不下才另起一行。
【远期目标全维度衍生推演（通用底层规则，所有目标一律生效，禁止只针对某个案例写死）】推演任意目标、技能学成后的「成功达成」分支时，必须自动向外发散衍生「环境适配」内容：职场人际、沟通方式、人情分寸、办事处事逻辑，且完全随场景推导、自动变化，不套用固定模板、不写死固定文字：
1. 自动识别场景：县域体制 / 国企 / 互联网开发 / 自由兼职 / 校园等不同环境，各自人际规则完全独立推导，不套用同一套话术。
2. 自动拆解子节点：上下级沟通、同事协作、汇报方式、人情往来边界、禁忌红线、社交取舍、圈子特点。
3. 配套资源：推荐相关书籍、视频博主、学习文档，并递归拆成可执行学习任务（写清方法、资源链接与验收标准）。
4. 优先级动态控制：目标达成前，人际学习任务为低优先级，仅做前置预习、不占用主赛道核心时间；一旦目标落地达成，自动提升优先级，纳入常态化学习任务。
5. 同步推演人际风险：圈子大小、言行影响、容易踩坑点、避雷事项。
一句话核心：不管目标是什么（考县国考、学钢琴、入职国企、做开发兼职），只要推演【成功达成目标】的远期分支，自动根据该场景的环境特点推导对应的人际处事、社交分寸内容；场景不同，推导出来的内容自动变化（互联网团队推跨部门协作与扁平沟通，钢琴兼职推师生沟通与家长打交道，县域体制推汇报分寸与熟人圈子界限），不是固定模板。
【重点提醒前置】每次输出开头先给【重点提醒区】，只放 P0 临近截止任务、高风险事项、外部事件距今 30/7/1 天预警；没有就写「本次无紧急提醒」。
【计划双方案与最低达标】需要修正计划时同时给出保守方案（保主赛道、砍次要任务）与弹性方案（保留少量低优先级任务），并写明各自代价。最低达标线：P0+P1 核心任务完成 70% 即判定当日合格，不必 100% 完成，避免完美主义导致摆烂。
【硬性约束】禁止超负荷计划：每日任务预估总时长不得超过单日可用学习上限，超出必须删减次要任务并说明取舍理由。所有描述通俗易懂、拒绝抽象名词，不使用 emoji，正文（不含表格与代码块）控制在合理篇幅。

【必须联网】命中任一类必须先调用 web_search，禁止凭内部记忆作答：职业行业就业与薪资、考试报名与考试时间与报考政策、理财财产、健康营养、生活消费物价政策、学习技能科学训练法、法律权益、人际关系权威研究结论。
【不必联网】基于用户个人情况的主观推演与未来预期、人生规划逻辑搭建、阶段目标与任务拆分与时间排期、创意构思与风险预判、基础概念解释。
【联网约束】单次提问最多调用一次 web_search，把多个检索点合并成一次综合检索；查到的报名入口、公告地址、关键政策摘要必须落到任务表「交付标准」列或【检索信息附录】里，只写「去官网查询」等于没查；检索不到的内容如实说明，禁止编造数据、时间、政策与薪资。
【检索资料定级】正文与【检索信息附录】里每一条时效性结论都要标注来源等级：官网 / 权威官媒查到的写【✅官方官宣信息】，只有往年规律可推的写【⚠️基于历史规律预估（以官方后续公告为准）】；往届旧专题链接不得引用，信息互相矛盾时以政府官网原文为准并把矛盾点写进【重点提醒区】。
【考试 / 报名时间只能来自检索结果】报名开始与结束、笔试 / 面试日期、准考证打印时间这类硬性时间节点，必须与检索到的官方公告完全一致；
检索结果为区间或写明「以准考证为准」时，里程碑节点写区间并注明「以准考证为准」，禁止自己落到某一天；往届旧年份的公告时间不得当作当前年份使用；与官网冲突时一律以官网为准。

【可视化视图强制规则】图表必须拆成两张独立视图，严禁合并到一张图：视图A 短期任务时序图放在「模块7」，视图B 长期链式递归画像树状图放在「模块9」。禁止使用大量气泡圆点网状图。两张 Mermaid 代码块分别放在各自模块下方，不要堆在最后。
【主赛道锁定保护】主赛道默认锁定；用户提出更换主赛道时，先完整展示更换带来的全部代价与长期链式画像变化，需用户明确确认后才重算整套规划。
【增量输出】任何一处变更（面板勾选完成/延期、对话里改目标、新增知识点、外部事件时间变动）都只增量刷新受影响的模块，未受影响的模块保留原有结论、不要重复输出。禁止每次对话无条件完整重绘全部模块；只有用户手动点「重新生成规划」才全量重算。
【系列规则】每个节点必须给出 series（所属主线，12 字内，例如 国考备考 / 英语四级 / 个人资产）；同一条业务主线的全部节点（如国考报名→笔试→面试）必须使用同一个 series 值；远期人生链式推演的分支统一使用 series='人生推演'。前端按 series 把节点分到同一条横向条带里，series 值必须稳定，允许自动新增、合并、拆分主线，但不要每轮都改名。
【复盘固定问题】每周复盘固定问：1 本周 P0 任务是否完成、卡点在哪；2 哪些任务精力消耗超出预期；3 本周新增哪些知识点需要存入学习知识库；4 下周是否调整优先级、删减任务；5 有没有新增潜在风险。
【对话开场】每次对话开头询问：请说明你本次需求——查询信息 / 修改计划 / 记录任务完成情况 / 学习方法咨询 / 复盘本周进度 / 推演未来路线 / 调整赛道目标？`;

// 完整全套模式：固定 20 段，顺序不可调换
const LIFE_CHAT_OUTPUT_FULL = `【输出结构｜固定 20 段，顺序不可调换】
0.【重点提醒区】只放 P0 临近截止、高风险、外部事件 30/7/1 天预警，高风险内容加粗。
1. 现状总结：2~4 句概括处境、赛道关系、约束、优势、风险与时间窗口，不用表格。
2. 模块1 阶段性总任务表：分「当前紧急 30 天｜中期 30~90 天｜远期 90 天以上」三阶段，每阶段写阶段目标、里程碑、验收标准，用 Markdown 表格。
3. 模块2 每日细分任务表：必须递归拆到单日可执行的最小单元（单次 15~90 分钟），列固定为「日期｜当日任务｜预估耗时｜优先级｜前置依赖｜操作方法｜资源链接｜验收标准｜风险提示｜状态」；日期一律公历真实日期 YYYY-MM-DD，严格以【今天】为基准推算，禁止相对天数；优先级填 P0~P3；前置依赖写「前置：#序号任务」；操作方法写一步到位的具体步骤；资源链接必须优先写 http 开头、点击就能打开的真实网址（报名官网、刷题 / 真题网站、教学视频链接），网址后面可跟一句文字备注，暂时找不到网址时写「待检索：〈要查什么〉」并在末尾【本轮待检索账单清单】逐条给出检索 query（系统会自动联网检索并把真实网址回填回来），禁止只写「真题网站」这类没有地址的纯文字，也禁止写「搜索关键词」这类点不开的死占位；验收标准写做到什么程度算完成；风险提示写容易踩的坑；状态取 未开始/进行中/已完成/延期/放弃；未完成自动顺延到下一个可执行日。
4. 模块15 任务进度快照：统计各状态数量、已完成数、延期数与整体完成率，说明延期原因与受牵连的后续任务，并对比上一次快照展示变化；父任务完成率由其子任务完成比例联动计算，子任务做完要向上刷新父任务进度。
5. 模块16 精力负荷评估表：统计所有任务每日所需总时长，与单日可承受上限对比；超出时给出超负荷红色预警并强制删减次要任务、写明取舍理由；记录熬夜/身体不适/情绪/琐事等干扰与睡眠、身体状态。
6. 模块3 个人档案表：分【基础信息】【已掌握技能】【待学习技能】【证书资质】【爱好特长】【短板风险】【偏好与约束】七栏，整理专业年级绩点、项目与竞赛经历、能力证书、爱好特长、薄弱项与现实约束。
7. 模块4 赛道取舍清单：分【主赛道｜备选赛道｜暂时放弃赛道】，写明各赛道精力分配比例，并给每条赛道打收益分(1~10)与成本分(1~10)。
8. 模块5 风险预案表：每条任务列潜在风险与应对方案，并标注风险分级——高风险（会直接废掉主赛道，优先高亮）、中风险、低风险。
9. 模块6 资源清单：集中存放官网链接、报名入口、资料清单、证件清单、费用与截止提醒链接。
10. 模块7 视图A 短期任务时序图：Mermaid graph TD 自上而下线性时序，主线单链，节点文字为「#序号｜日期｜直白动作」，按阶段分组，只保留直接前置依赖连线，禁止交叉与网状发散。同时说明每个任务所属的 series 主线（同一主线的任务归属同一个 series，前端会据此放进同一条横向条带）。
11. 模块19 外部事件日历：列出考试、报名、资格审核、准考证打印、面试窗口、证件到期等外部硬性时间节点，并说明提前 30/7/1 天的预警安排。
12. 检索信息附录：本次联网查到的官方网址、公告链接、关键时间节点与政策摘要，必须用无序列表，禁止用表格；每条结论前标注【✅官方官宣信息】或【⚠️基于历史规律预估（以官方后续公告为准）】，往届旧专题链接一律不引，矛盾点写进【重点提醒区】；本次未联网写「本次未联网检索」。
13. 中长期布局：90 天~数年，用自然文字分段说明目标、里程碑与阶段成果，不用表格。
14. 模块9 多结局分支推演：因果链式推演，不是简单描述。按目标推演**多条**结局分支（至少两条，复杂目标可以有 3~4 条，例如「一次答辩通过 / 需要二次答辩」「拿到 offer / 投递无回音需扩投」「持续出流量 / 流量低迷需换方向」），每条分支分别递归推导；每达成一个阶段性结果就生成下层子节点继续向后推演；每层同步更新收入、存款、固定开支、可支配时间、技能水平、风险等级；每个分支都要写连锁影响——新增或删除哪些任务、对其他主线（国考/求职/毕设）有什么影响、衍生了哪些新目标或补救方案；每个节点同步推演潜在负面结果；节点用箭头串成多层级树状链路，逻辑闭环。分支节点统一 series='人生推演'。**成功分支必须包含「环境适配」维度**：按该目标的真实所属环境（县域体制 / 国企 / 互联网开发 / 自由兼职 / 校园等）自动推导对应的人际处事、沟通方式、汇报分寸、人情边界与圈子特点，并同步写人际风险（容易踩坑点与避雷事项）；换一个目标就换一套内容，禁止所有目标都套同一段话。输出独立 Mermaid graph TD 树状图（允许分叉，但仍禁止大面积交叉）。
15. 模块10 个人能力匹配发展建议：依据技能档案，区分【优先推荐方向】【备选可行方向】【不推荐方向】；每条写清匹配原因、优势、短板与门槛，并给出需补齐的能力清单。
16. 模块11 科学记忆与学习方法论：说明神经突触需要「主动提取 + 间隔重复」才能加固；给出精简输入、主动回忆、按学完当天与第 2/4/7/14 天间隔重复、费曼输出、只攻薄弱错题的流程；针对英语薄弱与易分心给出单次专注时长与休息周期；提醒不要长时间硬啃与反复默读；给出可直接套用的每日学习模板并嵌入模块2。
17. 模块8 每周复盘模板：用固定 5 问组织（P0 完成情况与卡点、超预期消耗的任务、需入库知识点、下周优先级调整、新增风险）。
18. 模块17 变更日志：记录本次修改内容、修改原因与时间；**必须标注本次被更新的模块清单**（例如「受影响模块：每日任务、进度快照、精力负荷、变更日志」），支持「查看第 N 次快照」回看历史版本计划。
19. 模块18 个人学习知识库：列出本次新增或需要复习的知识点、错题与结论，标注下次复习日期。

【排版规则】模块标题加粗，模块之间空行分隔；表格简洁、只放结构化信息；推演与分析用文字或列表表达，不要全塞进表格；不使用 emoji。

【Mermaid 输出格式（两张图各自独立代码块，严禁合并）】
视图A 短期任务时序图（放模块7 下方）：
\`\`\`mermaid
graph TD
  N1["#1｜2026-10-15｜书面放弃副业"] --> N2["#2｜2026-10-16｜冻结股票账户"]
  N2 --> N3["#3｜2026-10-23｜国考岗位筛选报名"]
\`\`\`
视图B 链式递归未来画像树状图（放模块9 下方）：
\`\`\`mermaid
graph TD
  A1["上岸入职"] --> A2["稳定收入加公积金"]
  A2 --> A3["持续存款达标买房"]
  A3 --> A4["房贷物业维修等固定开支上升"]
  A4 --> A5["结余资金稳健投资"]
  A5 --> A6["资产再增购置车辆"]
\`\`\`
要求：图形类型固定 graph TD，自上而下依次是第一步、第二步……禁止网状发散；节点 id 用 N1/N2/A1/A2 这种字母加数字写法，禁止纯数字；视图A 每个节点文字固定「#序号｜日期｜任务名」三段，分隔符必须是全角竖线 ｜，日期写 YYYY-MM-DD 或 MM.DD，任务名不超过 14 字且必须写具体动作，序号与任务表行首的 #N 完全对应；视图A 链条走到最后必须接两个结局节点，文字写成「结局｜目标达成｜〈目标〉上岸后的生活画像」与「结局｜目标失利｜兜底备选路线」，只在这一处允许二选一分支；禁止重复节点，同一任务全图只出现一次，节点总数 4~12 个；两张图都不要加样式类、不要使用 emoji。图例、左中右三栏含义、节点尺寸与悬浮提示格式都由界面负责，正文不要写这些说明。`;

// 精简输出：只输出重点提醒 + 今日任务 + 阶段摘要 + 进度快照
const LIFE_CHAT_OUTPUT_SIMPLE = `【输出结构｜精简输出，固定 4 段，顺序不可调换】
0.【重点提醒区】只放 P0 临近截止、高风险、外部事件 30/7/1 天预警，高风险内容加粗，没有就写「本次无紧急提醒」。
1. 今日任务（模块2 当日部分）：用 Markdown 表格，列固定为「日期｜当日任务｜预估耗时｜优先级｜前置依赖｜操作方法｜资源链接｜验收标准｜风险提示｜状态」，只列最近 3 天待执行的任务；优先级填 P0~P3；日期一律公历真实日期 YYYY-MM-DD；最小子任务必须是单次 15~90 分钟能做完的具体动作。
2. 阶段任务摘要：用 3 行文字列出「当前紧急 30 天｜中期 30~90 天｜远期 90 天以上」三阶段的阶段目标与最近里程碑，不用表格。
3. 进度快照：一句话给出已完成数 / 总数、完成率、延期任务数与最需要优先处理的一件事。

本模式只输出本次**发生变更**的模块；未受影响的模块不要重复输出，用一行「其余模块无变化」带过。
不输出赛道取舍、风险预案、资源清单、知识库、变更日志等长内容；用户明确要求完整全套或重新生成整套规划时，再输出全部 20 段。正文控制在 300 字以内。`;

function buildLifeChatSystem(mode) {
  return [LIFE_CHAT_SYSTEM, LIFE_CHAT_RULES, LIFE_SEARCH_RULES, LIFE_CONTENT_CARRIER_RULES, LIFE_DATE_ANCHOR_RULES, mode === 'full' ? LIFE_CHAT_OUTPUT_FULL : LIFE_CHAT_OUTPUT_SIMPLE].join('\n\n');
}

// 输出详略由系统判定，不需要用户选模式：
// 首轮对话（没有任何历史）直接给整套 20 段；用户明确要完整/整套/重新生成也给整套；其余一律精简增量输出
const LIFE_FULL_REQUEST = /(完整全套|完整模式|完整规划|全部模块|整套规划|全量(?:规划|输出)|重新生成(?:规划|整套|全部)?)/;
function resolveLifeMode(requestedMode, message, historyCount) {
  if (requestedMode === 'full' || requestedMode === 'simple') return requestedMode;
  if (!Number(historyCount)) return 'full';
  return LIFE_FULL_REQUEST.test(String(message || '')) ? 'full' : 'simple';
}

// 本轮之前已有多少条对话（含用户与助手），用于判断是不是首轮
async function countLifeChatMessages() {
  const [rows] = await pool.query('SELECT COUNT(*) AS total FROM life_chat_messages');
  return Number(rows[0]?.total) || 0;
}

const LIFE_EXTRACT_SYSTEM = `你是一个人生规划结构化助手。请根据最近对话，输出对「人生规划节点」的增量操作。
只输出一个 JSON 对象，不要任何解释文字或代码块标记。结构如下：
{"ops":[ ... ]}
每个元素属于以下之一：
{"op":"upsert_self","title":"用户本人姓名或称呼(如 王文林)","detail":"这个人的发展方向总述(120字内，如 大四多赛道并行：国考 / 国企 / 英语四级 / 资产与副业)","domain":"学业|职业|财务|健康|家庭|成长"}
{"op":"persona","hardSkills":"硬能力维度：语言能力(如四级历次分数/词汇量/听力阅读短板)、专业技术(技能栈/开发能力/证书)、其他技能、证明材料(证书清单/竞赛获奖/项目成果)、能力成长曲线；分号分隔多条","timeHabits":"时间与行为习惯维度：可用时段(什么时段精力高)、任务履约特征(完成率/拖延频率/常完不成的类型)、耐力指标(单次专注时长/并行上限)、拖延模式、任务偏好；由打卡数据自动统计","traits":"性格与心智特质维度：风险偏好、目标倾向性(多线并行还是单线)、抗压能力、决策特点、执行力(启动难度)；由对话与任务行为客观推断","resources":"资源维度：资金状况(收入/贷款/每月可支配/资产/负债)、硬件资源、人脉资源、地域约束","valuesPref":"目标价值偏好维度：优先级排序(如 稳定编制>高薪开发>个人兴趣>副业)、取舍倾向(能不能接受5年服务期/异地县城)、生活诉求","risks":"风险与短板维度：薄弱能力项、行为短板、外部风险及互相抢占精力"}
{"op":"path","name":"发展路径名称，如 国考县级调查队","advantages":"基于画像自动提取的✅个人优势，分号分隔多条","risks":"⚠️劣势与代价","prerequisites":"📋前置要求(证书/考试/学历/应届生身份)，没有留空","evolution":"📈发展推演：走通后长期的能力/资产/生活变化(买车买房/收支推演)","score":0到100的整数适配得分,"nodeId":"右侧规划网络里该路径推演子图对应的根节点 id，没有留空"}
{"op":"add","tempId":"t1","parentId":"已有节点id或空","kind":"domain|goal|action|milestone","domain":"学业|职业|财务|健康|家庭|成长","series":"所属主线，12字内，如 国考备考/英语四级/个人资产；远期推演分支统一填 人生推演","title":"14字内，写清具体动作不要只写单词","detail":"120字内","risk":"任务表「风险提示」列原文，60字内，没有就留空","priority":"P0|P1|P2|P3，非任务节点留空","status":"todo|doing|done|drop，drop 表示该分支已被动态剪枝","horizon":"截止日期 YYYY-MM-DD，其他写时间刻度，例如 现在 / 1年内 / 2028 / 5年后","startDate":"开始日期 YYYY-MM-DD，没有明确开始日就留空（留空按创建日期起算）","weight":1到100的整数,"timeGroup":"urgent|mid|future","stepNo":任务表里该任务的步骤序号整数,"deps":["前置任务节点id","或本轮 tempId"],"content_type":"text|table|link|checklist|progress|branch|calc|doc，按内容自动匹配","content_body":载体结构化内容，可选，见下方载体规则}
{"op":"update","id":"已有节点id","title":"可选","detail":"可选","risk":"可选","priority":"可选","series":"可选","status":"可选","horizon":"截止日期，可选","startDate":"开始日期，可选","parentId":"可选，改挂到这条赛道 / 节点下面（合并重复赛道时用）","weight":可选数值,"timeGroup":"可选","stepNo":可选整数,"deps":可选数组}
{"op":"remove","id":"已有节点id"}
{"op":"upsert_daily","date":"YYYY-MM-DD","title":"单次1~3小时能做完的具体任务，60字内","estMinutes":预估耗时分钟数,"priority":"P0|P1|P2|P3","status":"todo|doing|done|delay|drop","repeat":"daily|weekday|weekly|once，见规则 11a","preTask":"前置依赖，如 #3任务名，没有留空","blocker":"当前卡点，没有留空","support":"需要的资料或工具，没有留空"}
{"op":"upsert_skill","category":"info|own|learn|cert|hobby|weak|pref","name":"档案条目名称，60字内","level":"水平或状态描述，如 熟练/待考/薄弱，30字内","note":"补充说明，没有留空"}
{"op":"upsert_energy","date":"YYYY-MM-DD","plannedMinutes":当日计划总分钟数,"capacityMinutes":单日可承受上限分钟数,"distractions":"熬夜/身体不适/情绪/琐事等干扰","sleepHours":睡眠小时数,"health":"身体状态简述","note":"其他说明"}
{"op":"upsert_knowledge","subject":"科目，如 行测/申论/软考/编程/交易","topic":"知识点或错题标题，60字内","content":"核心内容或结论，300字内","wrongQuestions":"错题要点，没有留空","tags":"标签，逗号分隔"}
{"op":"upsert_event","title":"外部事件名称，如 国考报名截止","date":"YYYY-MM-DD","category":"考试|报名|审核|证件|其他","level":"high|mid|low","remindDays":"提醒提前量，如 30,7,1","note":"补充说明"}
{"op":"log_change","module":"所属模块，如 每日任务/赛道取舍","content":"本次改动内容，200字内","reason":"改动原因，100字内"}
规则：
1. 只输出确实由本轮对话推导出的变化；若本轮没有新信息，ops 输出空数组。
2. 增量维护，禁止重建：判重必须同时查「当前规划节点」的 detail 与 index 两处（index 就是其余节点的 id + 标题索引），
   同一件事已有节点时一律输出 update（改截止时间、改交付标准、改状态），
   不要新增重复节点；同一件事只要含义相同就算重复（例如「四级报名」与「英语四级报名」），detail 或 index 里已有就必须 update，禁止再 add；
   确实作废的节点才用 remove。任何情况下都不要一次性清空或替换全部旧节点。
3. 从本轮回复的模块2 每日细分任务表逐行提取：title 取「当日任务」并去掉行首的 #N 序号（序号只放进 stepNo），horizon 取「日期」列的 YYYY-MM-DD 原文，
   weight 由「优先级」换算（P0=95、P1=75、P2=50、P3=25），priority 取该列的 P0~P3 原文，
   detail 按固定三行拼接「方法：<操作方法>；验收：<验收标准>；资源：<资源链接>」，risk 取「风险提示」列，
   任务统一用 kind=action、status=todo；同时为同一行生成一条 upsert_daily（preTask 取「前置依赖」列原文、blocker 取「风险提示」、support 取「资源链接」）。
3a. stepNo 取任务表该行行首的 #N 序号（1 起递增，行序就是执行先后顺序）；非任务类节点（goal / milestone）留空不填。
3b. risk 取任务表「风险提示」列的坑点描述；没有写或写「无」时留空。title 必须直白口语化、写清具体动作，禁止「投资行为风控」这类抽象名词。
4. timeGroup 由截止日期距【今天】的天数换算：30 天以内（含）为 urgent，31 到 90 天为 mid，90 天以上为 future；
   没有具体日期时按 horizon 文本判断（「现在」归 urgent，「1年内」归 mid，「几年后 / 2028」归 future）。每个 action 节点都必须给出 timeGroup。
5. deps 表示「这件事必须先完成哪些事」：只填直接前置任务，不要串联间接依赖，最多 2 个；只能引用「当前规划节点」里已有的 id 或本轮先出现的 tempId。
   任务表「前置依赖」列若写了「前置：xxx」，把它对应到已有节点的 id 填进 deps，找不到对应节点时留空数组；同时把这段文字原样填进 upsert_daily 的 preTask。
6. 单轮最多新增 60 个节点、更新不限；upsert_daily 单轮最多 40 条；不要为凑数新增。
6a. 严禁因为「条数多」而少提：模块2 每日细分任务表里有几行就必须产出几条 upsert_daily + 对应的 action 节点，一行都不许省略、不许合并、不许只提前几行；
   模块3 个人档案、模块16 精力、模块18 知识库、模块19 事件日历同理，逐行全部输出。
6b. 一轮输出必须完整：宁可每条 detail 写短一点，也绝对不能因为写不下而丢掉后面的行（输出被截断会导致后面的任务全部丢失）。
7. parentId 必须填（只有 self 与顶层 domain 可以为空）：action / milestone 要挂到同 series 的上级目标节点下，形成「目标→阶段→动作」至少 3 层的父子链；禁止把所有子任务平铺挂在同一个顶层节点下。绝不能出现 parentId 为空又非 domain 的游离节点。
7a. 一级赛道必须显式建出来：根节点（self）的直接子节点只能是一级赛道节点，kind=domain，title 直接用赛道名（如「四级备考」「国考备考」「软考中级」「毕业设计」），禁止写成「四级应试补救」「四级结局推演」这类事件名。
    一条赛道只有一个一级 domain 节点；同一赛道的全部下级节点（含阶段目标、每日任务、里程碑）必须挂在它下面，且 series 与它完全一致。
7a2. 禁止把同一条赛道拆成多个 series 或多个一级节点：四级相关的词汇、真题、听力、作文、报名、准考证等内容，series 一律用「四级备考」，全部挂在同一个「四级备考」domain 节点下。
    「人生推演」（远期结局）与「多线让位机制」（赛道优先级调度）不是赛道，禁止作为根节点的一级 domain 子节点，一律挂到它们所属赛道的节点下面。
7b. 每个 series 至少 4 个 kind=action 的最小动作节点；一个目标只给 1 个节点视为拆解失败，必须继续往下拆到「做什么 + 做多少 + 用多久」的最小单元（例如四级应试要拆成：背核心词 List 1-3、刷真题阅读、打印准考证、核对考场）。
8. 表示「几年后你会变成什么样」的内容用 kind=milestone，并写清 horizon；模块9 的**每一条结局分支各提取为 1 个 milestone 节点**（至少 2 条，复杂目标可以有 3~4 条），
   这些分支节点 timeGroup 一律填 future、series 一律填「人生推演」、parentId 挂到该赛道的一级 domain 节点（如「四级备考」）下面，deps 指向任务表最后一步（stepNo 最大的那个任务的 tempId 或已有 id），让时序箭头收口到分支；
   每条分支下的递归子节点也一并提取为 milestone，deps 指向同一条分支的上一层节点，形成多层级树状链路。
9. domain 只能取给定值之一；kind 只能取给定值之一；timeGroup 只能取给定值之一。
10. 不要 remove 用户手动创建的节点。
11. upsert_daily 按「title + date」去重（同名同日期视为同一条，输出 update 语义即可，后端会自动覆盖）；upsert_skill 按「name」去重；
   upsert_knowledge 按「topic」去重；upsert_event 按「title」去重。已存在的条目也照常输出，后端会覆盖更新，不要因为已存在就省略。
11a. 每条 upsert_daily 必须填 repeat（重复类型）：每天都要做的习惯型任务填 daily（如「每日背 50 个单词」「每日刷行测 40 题」），
   只在工作日做的填 weekday（如「工作日每天刷 1 套真题」），每周固定一次的填 weekly（如「每周日复盘一周错题」），
   一次性做完就结束的填 once（如「登录报名网站核对初审状态」「打印准考证」）。判断不出来时填 once，不要留空。
11b. 【考试类硬规则】对话里出现正式考试（软考 / 国考 / 四级 / 考研 / 教资等）时，除该赛道本身，必须额外产出这四类节点，缺一不可：
   ① 「考试当天」milestone：title 写「日期 + 时间 + 名称」（形如「〈YYYY年M月D日〉 〈考试名称〉（〈上午/下午〉开考）」，日期必须来自检索结果，不许照抄任何示例），horizon=真实考试日；
   ② 「打印准考证」action：标题「打印〈考试名〉准考证，20 分钟」，startDate=打印窗口开启日，horizon=窗口最后一天（必须早于考试日）；
   ③ 「考过 → 走向」milestone 与 ④「未考过 → 兜底走向」milestone（series='人生推演'），detail 里写清对未来 1~3 年的具体影响；
   该赛道所有备考类任务（模拟 / 冲刺 / 复盘 / 押题）的 horizon 必须早于考试日，最晚到考试前一日 —— 考试当天一早就要进考场，排在当天的任务一律无效。
11c. 禁止生成让用户自己去推演的元任务：「识别考试窗口期」「倒推备考周期」「锁定时间节点」「盘点可用资源」「梳理优先级」「制定学习计划」这类标题一律不许出现；
   推演是 AI 的职责，你必须直接产出用户当天能动手做的具体动作，并把日期算好写进 horizon，禁止写「30天内」「待排期」这类模糊或兜底文案。所有网址只能写检索结果里真实出现过的官方入口，禁止拼接、猜测或沿用记忆里的老网址（记忆里的域名可能早已下线）。
12. 个人档案必须自动回填：只要对话里出现用户的个人事实（学历专业年级、绩点、项目与竞赛、已会技能、想学的技能、证书、爱好、短板、时间与经济约束、学习与工具偏好），本轮就要输出对应 upsert_skill 落库，不要等用户单独下指令；用户说「填充档案 / 录入个人信息 / 同步个人资料」时，info/own/learn/cert/hobby/weak/pref 七个分类各至少输出 1 条。
   模块3 个人档案逐条输出 upsert_skill（基础信息=info、已掌握技能=own、待学习技能=learn、证书资质=cert、爱好特长=hobby、短板风险=weak、偏好与约束=pref）；
   用户提到的专业年级绩点、项目与竞赛经历、证书、爱好特长、英语等短板、时间与经济约束、学习与工具偏好，都要归类收录进对应 category；弱相关信息优先归 own/learn，明确是短板或限制的归 weak/pref；
   模块16 精力负荷输出 1 条 upsert_energy；模块19 外部事件日历逐条输出 upsert_event；模块18 学习知识库逐条输出 upsert_knowledge；模块17 变更日志逐条输出 log_change。
13. series 是节点的必填归属字段：先看「当前规划节点」里同一件事已有节点的 series，保持一致不要改名；
   同一条业务主线的全部节点（例如国考报名、国考笔试、国考面试）必须用同一个 series 值；模块9 的远期人生推演分支统一用 series='人生推演'；
   全新的主线可以新增 series；两条主线合并或拆分时统一改成新值，同一轮内不要出现同义不同名（如「国考」与「国考备考」）。
14. 递归深度：提取时必须保留完整父子层级与前置依赖链，action 节点要用 deps 串成「前置任务 → 后续任务」的有向链，禁止只提取一批彼此孤立的大任务；
   单条任务若单次执行超过 90 分钟，说明拆解不到位，应继续拆成更小的子任务并补全前置依赖。
15. 思维导图式发散与价值链：用户给出想法 / 爱好 / 项目构思时，除了学习路线、知识点、渠道资源、工具物料、分阶段任务、风险节点，还必须提取「学成后的价值」节点——兼职变现方向（含接单渠道、定价、获客）、可报考证书（报名时间、科目、含金量）、职场与个人增益（团建才艺、简历素材、社交加分）、以及与用户已有技能的组合机会；
   这些价值节点 kind 用 goal 或 milestone，series 与主想法同一条主线（远期价值可单独成一条 series），并把可执行的动作同时转成 upsert_daily。
16. 可行性过滤：高投入低收益的分支 weight 填 ≤30、priority 填 P3，并在 detail 末尾追加「可行性：〈取舍理由〉」，且不为它生成 upsert_daily，避免占用日程。
17. 里程碑准入：考级、兼职、登台、变现等后续分支节点的 deps 必须指向对应前置里程碑节点（已有 id 或本轮 tempId），前置里程碑未完成时这些节点 status 保持 todo，前端会显示「待解锁」。
18. 动态剪枝：判断某分支已连续受阻、或与主赛道冲突时，对该分支节点输出 update 把 status 置为 drop（前端显示「已剪枝」），且不再为其生成 upsert_daily；在 log_change 里写明剪枝理由。
19. 远期成功分支的环境适配衍生：目标「成功达成」分支必须衍生职场人际 / 沟通方式 / 人情分寸 / 办事处事逻辑节点，按该目标真实所属环境（县域体制 / 国企 / 互联网开发 / 自由兼职 / 校园等）独立推导，禁止套用同一套话术；拆出上下级沟通、同事协作、汇报方式、人情边界、禁忌红线、社交取舍、圈子特点等子节点（kind 用 goal 或 action，series 与主目标同主线，远期人际分支可用 series='人生推演'），并把配套书籍 / 视频博主 / 文档转成 upsert_daily 学习任务；
   优先级动态控制：目标达成前这些人际学习任务 priority 填 P3、weight ≤ 30，detail 写「目标达成前仅作前置预习」；在 log_change 里注明「目标落地后需自动提升优先级、纳入常态化学习」，不要为它生成大批高优先级任务。
20. 人际风险同步提取：远期分支的 risk 字段必须写人际风险（圈子大小、言行影响、容易踩坑点、避雷事项），例如县域熟人圈子小、言行影响口碑；兼职接单要提防中介与版权坑。
21. 禁止把「做计划」甩给用户：不要生成「制定 XX 计划 / 规划 XX 方案 / 整理 XX 清单 / 构思 XX 思路」这类元任务，节点和 upsert_daily 都不要；计划必须由 AI 一次拆到位，直接产出具
    体可执行的动作，标题写清「做什么 + 做多少 + 用多久」（例如「背四级核心词 List 1-3，30 分钟」「做 2023 年 12 月四级真题阅读，40 分钟」）；发现这类元任务时改写为可直接动手的动作。
22. 资源必须是可点开的真实网址，并且必须写清「这个资料是干嘛用的」：detail 的「资源：」段与 upsert_daily 的 support 统一写成「用途描述｜网址」（如「行测刷题网站｜https://www.fenbi.com/」「官方报名入口｜https://bm.scs.gov.cn/」「视频课程｜https://www.icourse163.org/」），用途描述要具体到能不能一眼看出用途（刷题/真题、视频课程、官方入口、技术文档、资料下载…），禁止只写域名或「资料」「相关网站」这类看不出用途的词；暂时找不到网址时写「待检索：〈要查什么〉」，并在末尾【本轮待检索账单清单】给出对应检索 query 交由系统自动检索回填。
23. 节点内容载体：每个节点按内容自动匹配 content_type（见下方载体规则），最小执行任务用 checklist、汇总统计用 table、资料官网用 link、多结局推演用 branch，同一父节点下可混用多种载体；载体需要结构化内容时补 content_body。
24. 通用递归拆解：任意节点都按「事件时间节点｜基础信息环境｜风险注意事项｜待完成任务项」4 个子分支继续向外扩散，待完成任务项再拆任务清单 / 阶段计划 / 复盘机制 / 执行方法，一直拆到最小可执行任务为终点；不限层级、不限分支数量，禁止停在粗粒度大任务。
25. 增量更新：只新增 / 修改 / 删除受影响的节点，禁止一次性清空重写整张思维导图；同名节点就地 update，只有确实不存在时才新建。
26. 横向关联：节点除了 parentId 纵向挂树，还可用 referenceIds 写横向关联（跨赛道联动、时间冲突、精力冲突、任务互相影响），填本轮 tempId 或已有节点 id。
27. 公共节点复用：复盘模板、执行方法、资料入口、文档模板只生成一次（加 "shared":true），全网络共享，禁止每条赛道各建一份。
28. 缺资料不编造：时间、官网、政策数据没把握就不要写死，也不要自己另开检索；改为写入待检索队列（用 op="queue_search"，字段 query / nodeId / priority / estCost），后端会立刻自动联网检索并回填真实网址。
29. 「本人」中心节点（大脑）：必须有且只有 1 个 kind=self 的中心节点，title 写用户本人的姓名或称呼（如「王文林」，不知道姓名时写「我」），不写某个具体目标或任务，
    detail 写这个人的发展方向总述（如「大四多赛道并行发展：国考 / 国企 / 英语四级 / 资产与副业四线并行」），series 固定填「核心画像」，parentId 留空；
    它是整张图顶部的「大脑」，各条赛道 / 目标（kind=domain）全部挂在它下面，并且它永远不能被 remove 或改名成别的目标。首次输出时创建，后续增量按同一标题就地沿用，禁止重复新增。
30. 正式考试 / 截止日节点：凡是考试、考证、报名、截止类目标（四级、考研、国考、软考、论文答辩…），必须在对应赛道分支的最末端补 1 个 kind=milestone 的「正式考试日 / 截止日」节点，horizon 写真实日期（如 2026-12-12），标题写清「日期 + 时间 + 名称」（如「2026年12月12日 英语四级笔试（9:00-11:20）」）；备考类任务节点的 horizon 必须早于它。这个节点是整条赛道的终点，必须存在，不能省略。
31. 「部分完成」：DL 任务允许只做一部分。用户说「做完一部分」时，把已做的写进对应节点的 progress_note（如「真题已下载；听力只听了 1 套」），节点 status 置为 doing；不要把没做完的整条任务标成 done。
32. 层级铁律：一级节点＝赛道 / 目标（kind=domain），直接挂在「本人」中心节点（kind=self）下面；赛道下面的计划、安排、阶段、动作（kind=goal / action / milestone）一律挂在这条赛道节点下面，形成「大脑 → 赛道 → 计划 → 动作」的链条。禁止把计划 / 安排越过赛道直接挂到大脑上，禁止让某一级节点自成一条并行根。
   例：用户说「我要考四级」→ 大脑下面新增一级节点「英语四级备考」（domain，parentId=大脑 id），四级下的计划 / 安排（报名、背单词、刷真题、听力训练…）全部 parentId=四级节点 id。
33. 合并重复赛道：同一件事只能有一条赛道节点。若「当前规划节点」里已存在语义相同的赛道（如「四级英语过线」与「英语四级备考」），必须输出 update 把二者统一到同一条（保留一条、把另一条与其子节点改挂到保留的那条下面），禁止在大脑下并存两条同义赛道。
34. 全局人物画像（op="persona"）：这是跨所有根目标的统一人物画像，不是单个目标的档案；只要本轮对话里出现用户的个人事实、行为特征、资源约束、价值取向或短板风险，就要输出 1 条 persona 增量更新，只填本轮新获得 / 有变化的维度，没变化的维度不要写（不要用空字符串覆盖）。produce 时内容分号分隔，写清具体事实（例如四级历次分数、词汇量、每天精力高的时段、常完不成的任务类型）。
35. 未来发展路径库（op="path"）：依托画像数据生成 / 更新用户可选的发展方向清单，每条路径必须给出适配得分 score（0~100，按画像自动计算）、advantages（个人优势）、risks（劣势与代价）、prerequisites（前置条件）、evolution（长期推演：能力 / 资产 / 生活变化）。用户四级通过、技能提升等画像变化后，要重新评估并 update 相关路径的 score；用户自己新增的自定义路径（source=user）不要删除，只更新得分。
36. 路径与规划网络联动：每条 path 的 nodeId 填右侧规划网络里该路径推演子图对应的根节点 id（通常是同 series 的赛道节点或它的远景分支节点），没有对应子图就留空。

${LIFE_DATE_ANCHOR_RULES}

${LIFE_CONTENT_CARRIER_RULES}

【必须输出 JSON】输出只能是一个 JSON 对象，禁止用 Markdown 表格或纯文字代替；漏掉 JSON 会导致本轮内容全部无法入库。

【正确示例】（仅为演示结构与深度，实际按用户真实情况重新推导，禁止照抄文字）
用户输入「我想考公务员」，输出：
{"ops":[
{"op":"add","tempId":"t0","kind":"self","domain":"成长","series":"核心画像","title":"王文林","detail":"方法：四条主线并行推进；验收：各主线闭环；资源：https://bm.scs.gov.cn/","status":"todo","weight":100,"timeGroup":"urgent","parentId":""},
{"op":"add","tempId":"t1","kind":"domain","domain":"职业","series":"国考备考","title":"国考备考","detail":"方法：按报名—笔试—面试推进；验收：任一阶段闭环；资源：https://bm.scs.gov.cn/","status":"todo","weight":70,"timeGroup":"mid","parentId":"t0"},
{"op":"add","tempId":"t2","kind":"goal","domain":"职业","series":"国考备考","title":"报名与资格审核通过","detail":"方法：核对岗位条件后报名；验收：初审状态通过；资源：https://bm.scs.gov.cn/","priority":"P1","status":"todo","horizon":"2026-10-24","weight":75,"timeGroup":"urgent","stepNo":1,"parentId":"t1"},
{"op":"add","tempId":"t3","kind":"action","domain":"职业","series":"国考备考","title":"登录报名网站核对初审状态，10 分钟","detail":"方法：登录账号查看审核状态；验收：状态显示通过；资源：https://bm.scs.gov.cn/","priority":"P1","status":"todo","horizon":"2026-10-16","weight":75,"timeGroup":"urgent","stepNo":1,"parentId":"t2"},
{"op":"add","tempId":"t4","kind":"action","domain":"职业","series":"国考备考","title":"筛选本县可报岗位并标记限制条件，40 分钟","detail":"方法：按专业学历筛职位表；验收：产出候选清单；资源：https://bm.scs.gov.cn/","priority":"P1","status":"todo","horizon":"2026-10-20","weight":75,"timeGroup":"urgent","stepNo":2,"parentId":"t2","deps":["t3"]},
{"op":"upsert_daily","date":"2026-10-16","title":"登录报名网站核对初审状态，10 分钟","estMinutes":10,"priority":"P1","status":"todo","preTask":"","blocker":"岗位数量少","support":"https://bm.scs.gov.cn/"}
]}
注意：parentId 与 deps 可以引用本轮先出现的 tempId（如 t1/t2）；每个 series 至少 4 个 action 叶子；每个 action 都要带可点开的网址、stepNo 与 deps；禁止「制定 XX 计划」类元任务。`;

const LIFE_REGENERATE_SYSTEM = `你是一个人生规划结构化助手。请基于全部对话，重新构建一份完整的人生规划节点列表。
输出两部分：① 自然语言规划解读（summary，一段话讲清整体思路、赛道关系与本次调整）② 结构化节点数组（nodes，携带 id / parent_id 供规划网络提取渲染）。两部分合并成同一个 JSON 对象输出，不要任何解释文字或代码块标记。结构如下：
{"summary":"自然语言规划解读，一段话，200字内","nodes":[{"kind":"self|domain|goal|action|milestone","domain":"学业|职业|财务|健康|家庭|成长","series":"所属主线，12字内，如 国考备考/英语四级/个人资产；远期推演分支统一填 人生推演","title":"20字内，写清具体动作不要只写单词","detail":"160字内，按「方法：…；验收：…；资源：…」写清操作方法、验收标准与资源链接","risk":"风险提示，40字内，没有就留空","priority":"任务类节点填 P0|P1|P2|P3，其余留空","status":"todo|doing|done|drop，drop 表示该分支已被动态剪枝","horizon":"任务写截止日期 YYYY-MM-DD，其他写时间刻度，例如 现在 / 1年内 / 2028 / 5年后","weight":1到100的整数,"timeGroup":"urgent|mid|future","stepNo":任务类节点写执行序号整数，其余留空,"parentRef":指向本数组的元素下标，空表示挂在中心节点,"depsRef":[前置节点在本数组的下标],"referenceRef":[横向关联节点在本数组的下标，跨赛道联动 / 冲突],"shared":是否公共复用节点（复盘 / 方法 / 资料 / 模板填 true，全网络只生成一次）,"content_type":"text|table|link|checklist|progress|branch|calc|doc，按内容自动匹配","content_body":载体结构化内容，可选，见下方载体规则}],"examAnchors":[{"subject":"考试全称","examDate":"YYYY-MM-DD 真实考试首日","examTitle":"日期+时间+考试名称","ticketStart":"准考证打印窗口开启日 YYYY-MM-DD","ticketEnd":"准考证打印窗口最后一天 YYYY-MM-DD（必须早于考试日）","officialUrl":"已核实可打开的官方主站","printUrl":"已核实可打开的准考证打印/报名系统入口"}]}
要求：
1. 必须有且只有 1 个 kind=self 的中心画像节点（大脑），parentRef 留空，title 写用户本人的姓名或称呼（如「王文林」，不知道姓名写「我」），series 固定填「核心画像」。
2. 3 到 6 个 kind=domain 领域节点（＝赛道 / 目标），parentRef 全部指向中心节点下标（即 0），一定要挂在「大脑」下面，禁止让赛道自成一条并列根。
3. 每条赛道（domain）下面挂 2 到 4 个 goal 计划节点，parentRef 指向所属赛道下标；每个 goal 下必须再拆 2 到 5 个 kind=action 的最小任务，parentRef 指向所属 goal 下标，形成「大脑→赛道→计划→动作」至少 4 层的父子链；禁止一个赛道只挂 1 个节点、禁止把计划 / 安排越过赛道直接挂到中心节点上。
3b. 同一件事只能有一条赛道：语义相同的赛道必须合并成一条（例如「四级英语过线」与「英语四级备考」只能留一条，另一条及其子节点改挂到保留的那条下面），禁止在中心节点下并存两条同义赛道。
4. 至少 2 个（复杂目标 3~4 个）kind=milestone 分支节点，各代表一条结局分支，horizon 写清「几年后」的具体状态。
4b. 考试 / 考证 / 报名 / 截止类赛道，必须在该赛道分支末端补 1 个 kind=milestone 的「正式考试日 / 截止日」节点：horizon 写真实日期（如 2026-12-12），标题写「日期 + 时间 + 名称」（如「2026年12月12日 英语四级笔试（9:00-11:20）」）；同赛道备考任务的 horizon 必须早于它。
5. 节点总数控制在 24 到 60 个之间（宁可多拆也不要把大目标留成一整块）；每个 series 至少 4 个 action 叶子节点；信息不足的部分可留待后续对话补充。
6. 任务类节点（kind=action）必须给出 timeGroup 与 stepNo：stepNo 按执行先后从 1 开始递增，最早要做的排最小号；
   timeGroup 由截止日期距【今天】的天数换算：30 天以内为 urgent，31 到 90 天为 mid，90 天以上为 future。
7. depsRef 只填直接前置任务（最多 2 个），表示「这件事必须先完成哪些事」，序号小的排前面。
8. 任务名必须直白口语化、写清具体动作，禁止「投资行为风控」这类抽象名词；同一个任务只能出现一次。
9. 结局分支至少两条（复杂目标可 3~4 条）：kind=milestone、timeGroup=future、series='人生推演'，标题用「〈分支结果〉-〈后续走向〉」这类直白写法；
   horizon 写时间刻度，depsRef 指向最后一步任务的下标；每条分支的递归子节点也要写，depsRef 指向同一条分支的上一层节点。
10. 每个节点都要给 series（所属主线，12 字内，如 国考备考/英语四级/个人资产），整份规划控制在 3~6 条主线；
   同一条主线的全部节点必须用同一个 series 值；模块9 的远期人生推演节点统一用 series='人生推演'。
10b. 覆盖度：对话中用户提到的每一条赛道 / 目标（例如国考、省考、软考、四级、秋招、财务风控、考研）都必须各自建一条 kind=domain 分支，一条都不能漏；即使用户只提了一句、信息很少，也要为该赛道拆出至少 3 个可执行 action，禁止因为「信息不足」整条省略。
11. 递归深度：任务类节点必须拆到单次 15~90 分钟的最小可执行单元，并用 depsRef 串成前置依赖链，禁止只给一批粗粒度大任务；
   detail 按「方法：…；验收：…；资源：…」写清操作方法、验收标准与资源链接，risk 写风险提示；涉及时间窗口的目标按真实窗口倒排，禁止滞后错过窗口期；
   资源段优先写 http 开头、点击就能打开的真实网址（报名官网 / 刷题真题网站 / 教学视频链接），文字只作链接备注，暂时没有网址时写「待检索：〈要查什么〉」并在末尾【本轮待检索账单清单】给出对应检索 query，由系统自动检索回填真实网址。
18. 节点内容载体：每个节点按内容自动匹配 content_type（见下方载体规则），最小执行任务用 checklist、汇总统计用 table、资料官网用 link、多结局推演用 branch，同一父节点下可混用多种载体；载体需要结构化内容时补 content_body。
19. 通用递归拆解：任意节点都按「事件时间节点｜基础信息环境｜风险注意事项｜待完成任务项」4 个子分支继续向外扩散，待完成任务项再拆任务清单 / 阶段计划 / 复盘机制 / 执行方法，一直拆到最小可执行任务为终点；不限层级、不限分支数量，禁止停在粗粒度大任务。
20. 首次构建要产出一份完整的放射式父子树：L0 中心节点 → L1 各赛道 → 逐层向外扩散；同名节点只出现一次，parentRef / depsRef 必须成链。
21. 增量维护、禁止整体重写：提问里给了【当前已有节点】清单，凡是同一件事（含义相同即算同一件，例如「国考报名」与「国考报名与资格审核」），标题必须原样沿用清单里的写法、不要改写措辞，后端会据此就地更新；只有清单里确实没有的全新内容才新建节点，作废的节点通过减少对应条目来删除；禁止把标题全部换个说法重写一遍。
22. 时间锚定：所有任务类节点的 horizon 必须是绝对公历日期 YYYY-MM-DD（按【今天】推算），禁止写「近期 / 中期 / 远期」这类模糊刻度；考试 / 报名 / 截止类赛道必须先确定真实日期，再把该赛道所有备考任务倒排到真实日期**之前**，严禁排到考试日之后（见下方日期锚定铁律）。
23. 考试 / 报名 / 审核 / 面试这类「有官方时间窗口」的赛道，落库前必须先确认真实日期：先在对话上下文与联网检索结果里找官方公告（考试院、招录机关官网、报名系统），拿到确切日期后再倒排；把「岗位初筛截止、报名截止、资格审核、准考证打印、笔试、面试」这些关键节点逐条建出来并各自写上真实日期，禁止只写一个笼统的赛道节点却没有关键日期。
24. 日期无法确认时必须显式说明，禁止编造：如果联网检索与你掌握的公开信息都无法确定确切日期，就在该节点 horizon 里写「待核实：〈要找的官方入口〉」，同时在 summary 里用一句话点明「哪几个日期需要用户去官网确认」，绝不能留空或者拿一个看起来合理的日期糊弄过去。
25. timeGroup 只是给前端分组的辅助字段，后端会在落库前按 horizon 距【今天】的天数统一重算（≤30 紧急 / ≤90 中期 / 其余远期，无日期的赛道节点继承本 series 最早日期）。所以请把精力全部放在「horizon 日期是否真实」上，不要为 timeGroup 是否好看纠结。
26. 【考试类赛道硬规则】凡是含正式考试（软考 / 国考 / 四级 / 考研 / 教资等）的赛道，必须做到这五件事，缺一即视为不合格：
   ① 单独建一个「考试当天」节点：kind=milestone，title 写「日期 + 时间 + 名称」（形如「〈YYYY年M月D日〉 〈考试名称〉（〈上午/下午〉开考）」，日期只能来自检索结果），horizon 就是真实考试日；
   ② 该赛道**所有备考类任务**（模拟考、套题、冲刺、复盘、押题、错题回看）的 horizon 必须**早于考试日**，最晚只能到考试**前一日**——考试当天一早就进考场，任何排在当天或当天的模拟都是无效安排；
   ③ 必须单独立一条「打印准考证」动作（kind=action）：标题写「打印〈考试名〉准考证，20 分钟」，startDate 写准考证打印窗口开启日，horizon 写窗口最后一天（且必须早于考试日）；窗口日期查不到时用「考试前 7 天开放打印」这一通用规律推算，写进 summary 提示用户核对；
   ④ 必须在该赛道末端推演「考过」与「没考过」两条结局（kind=milestone，series='人生推演'）：标题写「〈考试名〉考过 → 〈走向〉」「〈考试名〉未考过 → 〈兜底走向〉」，detail 里明确写清这两条路对**未来 1~3 年**的具体影响（哪些机会拿到 / 失去、时间与金钱代价、要不要重考、主赛道是否受影响），depsRef 指向考试日节点；
   ⑤ 在 examAnchors 里把上面这些日期与官方入口结构化输出，后端会据此做最终校验。
27. examAnchors 只填「在这轮检索结果里查到确切日期」的考试；日期没查到就不要填，禁止凭印象编一个看起来合理的日期。officialUrl / printUrl 必须是检索结果里出现过的真实官方入口，一个字都不许来自记忆或拼接。
28. 链接必须是「已经存在且能打开」的官方入口：只写检索结果里出现过的网址，禁止拼接、猜测或沿用记忆里的老网址；不确定是否还有效时，宁可不写网址、只写「〈官网名〉官网」。
29. 时间字段禁止兜底文案：horizon / startDate 只允许真实日期 YYYY-MM-DD 或「现在 / 1年内 / 3年后」这类明确刻度；禁止出现「30天内」「未设置」「待排期」「近期」这类模糊表述，禁止让用户自己去推算窗口期。
30. 禁止生成让用户自己去推演的元任务：以下这类标题一律不许出现 ——「识别未来 90 天内的考试节点」「倒推备考周期」「锁定考试窗口期」「盘点可用资源」「梳理目标优先级」「制定学习计划」。这些推演是 AI 的活，你的职责是直接产出用户当天就能动手的具体动作（做什么 + 做多少 + 用多久），并把日期直接算好写进去。
31. 每条赛道必须给出「这件事成了会怎样」与「没成会怎样」两种走向：结局节点不能只写「目标达成-稳定发展」这种空话，要写清具体结果（拿到什么资格 / 进什么单位 / 收入变化 / 时间自由度的变化），以及没成之后转向哪条兜底线、需要多久恢复。

${LIFE_DATE_ANCHOR_RULES}

${LIFE_CONTENT_CARRIER_RULES}

【必须输出 JSON】无论用户在对话里看到的是表格还是文字，你的输出必须是且只能是一个 JSON 对象（含 summary 与 nodes 两个字段），禁止用 Markdown 表格代替 JSON；漏掉 JSON 会导致整轮内容无法入库。

【正确示例】（内容仅为演示结构与深度，实际必须按用户真实情况重新推导，禁止照抄文字）
用户输入：「我想考公务员」
输出：
{"summary":"以国考为主线，按报名—笔试—面试三阶段推进，同步用软考兜底；远期分两条结局推演，成功走体制内稳定路线、失利走国企软件岗兜底，本份规划聚焦把报名环节拆到可直接执行的原子动作。","nodes":[
{"kind":"self","domain":"成长","series":"核心画像","title":"王文林","detail":"方法：四条主线并行推进；验收：各主线闭环；资源：https://bm.scs.gov.cn/","status":"todo","weight":100,"timeGroup":"urgent","parentRef":null,"content_type":"text"},
{"kind":"domain","domain":"职业","series":"国考备考","title":"国考备考","detail":"方法：按报名—笔试—面试推进；验收：任一阶段闭环；资源：https://bm.scs.gov.cn/","status":"todo","weight":70,"timeGroup":"mid","parentRef":0,"content_type":"text"},
{"kind":"goal","domain":"职业","series":"国考备考","title":"报名与资格审核通过","detail":"方法：核对岗位条件后报名；验收：初审状态通过；资源：https://bm.scs.gov.cn/","priority":"P1","status":"todo","horizon":"2026-10-24","weight":75,"timeGroup":"urgent","stepNo":1,"parentRef":1,"depsRef":[],"content_type":"progress","content_body":{"done":0,"total":3}},
{"kind":"action","domain":"职业","series":"国考备考","title":"登录报名网站核对初审状态，10 分钟","detail":"方法：登录个人账号查看审核状态；验收：状态显示通过或列出待办；资源：https://bm.scs.gov.cn/","priority":"P1","status":"todo","horizon":"2026-10-16","weight":75,"timeGroup":"urgent","stepNo":1,"parentRef":2,"depsRef":[],"content_type":"checklist","content_body":[{"text":"打开报名官网并登录","done":false},{"text":"查看审核状态结论","done":false}]},
{"kind":"action","domain":"职业","series":"国考备考","title":"筛选本县可报岗位并标记限制条件，40 分钟","detail":"方法：按专业学历筛选职位表；验收：产出候选岗位清单；资源：https://bm.scs.gov.cn/","priority":"P1","status":"todo","horizon":"2026-10-20","weight":75,"timeGroup":"urgent","stepNo":2,"parentRef":2,"depsRef":[3],"content_type":"table","content_body":{"head":["岗位","学历要求","专业限制","是否可报"],"rows":[["示例岗位 A","本科","计算机类","可报"]]}},
{"kind":"action","domain":"职业","series":"国考备考","title":"行测资料分析专项刷题 20 道，40 分钟","detail":"方法：掐时间刷题并记录错因；验收：正确率≥75%；资源：https://www.fenbi.com/","priority":"P1","status":"todo","horizon":"2026-11-28","weight":75,"timeGroup":"mid","stepNo":3,"parentRef":2,"depsRef":[4],"content_type":"calc","content_body":{"label":"正确率","expr":"正确题数 / 总题数","result":"待统计"}},
{"kind":"milestone","domain":"职业","series":"人生推演","title":"目标达成-稳定发展","detail":"方法：主线任务逐项达成；验收：主目标完成；资源：https://bm.scs.gov.cn/","status":"todo","weight":80,"timeGroup":"future","parentRef":1,"depsRef":[5],"content_type":"branch","content_body":[{"cond":"主线任务全部达成","then":"进入体制内稳定路线"},{"cond":"主赛道受阻","then":"转向国企软件岗兜底"}]}
]}
注意示例体现的四点：① 先给 summary 自然语言解读，再给 nodes 结构化数组；② parentRef / depsRef 填的是【上面这个数组里元素的下标】（从 0 开始），不是字符串 id；self 是下标 0；③ 同一个 series 下有 domain→goal→action 至少 3 层，且每个 series 至少 4 个 action 叶子；④ 每个节点都带 content_type（最小任务 checklist、汇总 progress/table、分支 branch、测算 calc），每个 action 都带可点开的真实网址与 stepNo、depsRef，计划已拆到最小动作，没有「制定 XX 计划」这类元任务。

【禁止示例】（出现即成失败）
✗ 生成「制定国考备考计划」「整理选岗思路」「规划软考学习方案」——把做计划甩给用户，必须改写成「背核心词 List 1-3，30 分钟」这类可直接动手的动作。
✗ 一个 series 下只挂 1 个节点，不往下拆。
✗ 用 Markdown 表格或纯文字代替 JSON 输出。
12. 思维导图式发散：以用户的想法 / 爱好 / 项目为主节点向外发散，除学习路线、知识点、渠道资源、工具物料、分阶段任务、风险节点外，还要有「学成后的价值」节点——兼职变现方向与接单渠道、可报考证书与报名时间、职场与个人增益（团建才艺、简历素材、社交加分）、跨技能组合机会；全部归入对应 series。
13. 可行性过滤：高投入低收益的分支 weight 填 ≤30、priority 填 P3，并在 detail 末尾写「可行性：〈取舍理由〉」。
14. 里程碑准入：考级、兼职、登台、变现等后续分支节点的 depsRef 指向对应前置里程碑下标，前置里程碑未完成时这些节点 status 填 todo（前端显示「待解锁」）。
15. 动态剪枝：与主赛道冲突或已明确放弃的分支，其节点 status 填 drop，并在 detail 里写明剪枝理由，不为其生成每日任务。
16. 远期成功分支的环境适配衍生：目标「成功达成」分支必须衍生职场人际、沟通方式、人情分寸、办事处事逻辑节点，按该目标真实所属环境（县域体制 / 国企 / 互联网开发 / 自由兼职 / 校园等）独立推导，禁止所有目标套同一段文字；拆出上下级沟通、同事协作、汇报方式、人情边界、禁忌红线、社交取舍、圈子特点等子节点，risk 写人际风险（圈子大小、言行影响、容易踩坑点、避雷事项）。
   优先级动态控制：这类人际学习节点的 priority 填 P3、weight 填 ≤30、timeGroup 填 future，detail 里注明「目标达成前仅作前置预习，达成后自动提升优先级、纳入常态化学习」。
17. 禁止把「做计划」甩给用户：不要生成「制定 XX 计划 / 规划 XX 方案 / 整理 XX 清单」这类元任务，计划由 AI 一次拆到位，直接产出具
    体可执行的动作，标题写清「做什么 + 做多少 + 用多久」，例如「背四级核心词 List 1-3，30 分钟」「做 2023 年 12 月四级真题阅读，40 分钟」。`;

function parseLifeJson(raw) {
  const text = String(raw || '');
  const match = text.match(/\{[\s\S]*\}/);
  if (!match) return null;
  try { return JSON.parse(match[0]); } catch (_) { return null; }
}

// 抢救被截断的 JSON：输出超出上限时数组会断在中途，这里逐个截出「完整」的对象，
// 尽量保住已经生成好的节点，而不是整轮丢弃。
function salvageJsonObjects(raw) {
  const text = String(raw || '');
  const start = text.indexOf('[');
  if (start < 0) return null;
  const objs = [];
  let depth = 0;
  let buf = '';
  let inStr = false;
  let esc = false;
  for (let i = start + 1; i < text.length; i += 1) {
    const ch = text[i];
    if (inStr) {
      buf += ch;
      if (esc) esc = false;
      else if (ch === '\\') esc = true;
      else if (ch === '"') inStr = false;
      continue;
    }
    if (ch === '"') { inStr = true; buf += ch; continue; }
    if (ch === '{') { depth += 1; buf += ch; continue; }
    if (ch === '}') {
      depth -= 1;
      buf += ch;
      if (depth === 0) { try { objs.push(JSON.parse(buf)); } catch (_) { /* 单条坏对象跳过 */ } buf = ''; }
      continue;
    }
    if (depth > 0) buf += ch;
  }
  return objs.length ? objs : null;
}

// AI 有时只回 Markdown 文本（表格 + mermaid）不带 JSON 块，此时把表格兜底解析成入库操作，
// 避免出现「AI 表格里明明写了任务、系统里啥也没落」的断链。
function planLifeOpsFromMarkdown(raw, nodes = []) {
  const text = String(raw || '');
  if (!/[|｜]/.test(text)) return [];
  const existingSeries = [...new Set(nodes.map(node => String(node.series || '').trim()).filter(Boolean))];
  // 该系列已有领域 / 目标节点时直接挂上去，没有就在本轮补一个领域节点，保证父子层级成立
  const parentOf = new Map();
  for (const node of nodes) {
    const key = String(node.series || '').trim();
    if (key && !parentOf.has(key) && (node.kind === 'domain' || node.kind === 'goal')) parentOf.set(key, String(node.id));
  }
  const clean = value => String(value || '').replace(/\*\*/g, '').replace(/[`「」]/g, '').trim();
  const KEYS = {
    title: ['任务名称', '任务', '事项', '标题', '名称'],
    date: ['截止时间', '截止日期', '截止', '日期', '时间'],
    priority: ['优先级', '优先'],
    deliver: ['交付标准', '验收标准', '交付', '验收'],
    risk: ['风险提示', '风险'],
    resource: ['资料入口', '资料', '资源', '链接', '网址'],
    pre: ['前置任务', '前置']
  };
  const cellOf = (cells, header, keys) => {
    const index = keys.map(key => header.findIndex(item => item.includes(key))).find(value => value >= 0);
    return index === undefined || index < 0 ? '' : clean(cells[index]);
  };
  // 「制定 XX 计划」这类把计划工作甩给用户的元任务不入库
  const metaTask = /^(制定|规划|整理|构思|梳理|策划|设计)[^，,]{0,8}(计划|方案|清单|思路|策略|路线)$/;
  const today = todayStr();
  const ops = [];
  const draftSeries = new Set();
  let header = null;
  let section = '';
  let step = 0;
  for (const line of text.split(/\r?\n/)) {
    const row = line.trim();
    if (!row) continue;
    if (!/[|｜]/.test(row)) {
      const plain = clean(row.replace(/^#+\s*/, ''));
      if (plain && plain.length <= 24 && !plain.startsWith('-')) {
        section = plain.replace(/^[①②③④⑤⑥⑦⑧⑨⑩\d.、）)]+\s*/, '').trim() || section;
      }
      continue;
    }
    const cells = row.replace(/^[|｜]/, '').replace(/[|｜]$/, '').split(/[|｜]/).map(clean);
    if (!cells.length || cells.every(cell => !cell || /^:?-{2,}:?$/.test(cell))) continue;
    const joined = cells.join('');
    if (/任务|事项|名称/.test(joined) && /截止|日期|时间|优先级|交付/.test(joined)) { header = cells; continue; }
    if (!header || cells.length < 2) continue;
    const title = cellOf(cells, header, KEYS.title);
    if (!title || metaTask.test(title)) continue;

    const dateText = cellOf(cells, header, KEYS.date);
    const dateParts = dateText.match(/(\d{4})-(\d{1,2})-(\d{1,2})/);
    const date = dateParts ? `${dateParts[1]}-${String(dateParts[2]).padStart(2, '0')}-${String(dateParts[3]).padStart(2, '0')}` : today;
    const rawPriority = cellOf(cells, header, KEYS.priority);
    const priority = /^P[0-3]$/i.test(rawPriority) ? rawPriority.toUpperCase()
      : rawPriority.includes('高') ? 'P1' : rawPriority.includes('中') ? 'P2' : rawPriority.includes('低') ? 'P3' : 'P1';
    // 系列归属：优先套用库里已有的主线（含前两个字的关键词命中），否则用所在小节
    const scope = `${title} ${section}`;
    let series = existingSeries.find(item => scope.includes(item))
      || existingSeries.find(item => item.length >= 2 && scope.includes(item.slice(0, 2)))
      || (section || '对话新增').slice(0, 20);
    const days = Math.round((Date.parse(`${date}T00:00:00`) - Date.parse(`${today}T00:00:00`)) / 86400000);
    const timeGroup = Number.isFinite(days) && days <= 30 ? 'urgent' : Number.isFinite(days) && days <= 90 ? 'mid' : 'future';

    if (!parentOf.has(series) && !draftSeries.has(series)) {
      draftSeries.add(series);
      const tempId = `md-series-${series}`;
      ops.push({
        op: 'add', tempId, kind: 'domain', domain: '成长', title: series, series,
        status: 'todo', weight: 60, horizon: '1年内', timeGroup: 'mid',
        detail: `方法：按这条主线逐项推进；验收：该主线下的子任务全部完成；资源：待补充可点开的网址`
      });
      parentOf.set(series, tempId);
    }

    const deliver = cellOf(cells, header, KEYS.deliver);
    const risk = cellOf(cells, header, KEYS.risk);
    const resource = cellOf(cells, header, KEYS.resource);
    const preTask = cellOf(cells, header, KEYS.pre);
    step += 1;
    ops.push({
      op: 'add', kind: 'action', domain: '成长', title, series, priority,
      detail: `方法：${deliver || '按交付标准一步步执行'}；验收：${deliver || '完成该任务并记录结果'}；资源：${resource || '待补充可点开的网址'}`,
      risk, status: 'todo', horizon: date, weight: 60, timeGroup, stepNo: step,
      parentId: parentOf.get(series)
    });
    ops.push({
      op: 'upsert_daily', title, date, priority, estMinutes: 0, status: 'todo',
      preTask, blocker: risk, support: resource || deliver
    });
  }
  return ops;
}

// 重建时只喂最近若干轮真实对话：全量历史会让提示词过长直接超时；
// 同时剔除 role=system 的面板变更通知，否则会被当成「导师」的话混进上下文。
function recentLifeTranscript(messages, limit = 24) {
  const list = (messages || [])
    .filter(m => m.role === 'user' || m.role === 'assistant')
    .slice(-limit);
  return lifeTranscript(list);
}

// 规划重建 / 增量更新这两条路径都不走对话工具链（callAI 的 tools 传 null），以前完全不联网，
// 于是「国考报名截止、笔试时间」这类必须有官方出处的日期只能靠模型编或者留空。
// 这里在生成前做一次定向检索：从对话里认出用户在追的关键考试 / 招录窗口，逐个查真实时间并注入提示词。
const LIFE_DATE_SUBJECTS = [
  { name: '国家公务员考试', keys: ['国考', '国家公务员'] },
  { name: '省公务员考试', keys: ['省考', '省级公务员'] },
  { name: '全国大学英语四级考试', keys: ['四级', 'CET4'] },
  { name: '计算机软件水平考试', keys: ['软考', '软件水平考试', '软件设计师'] },
  { name: '全国硕士研究生招生考试', keys: ['考研', '研究生考试'] },
  { name: '教师资格证考试', keys: ['教资', '教师资格'] }
];
async function buildLifeDateContext(messages) {
  const text = (messages || []).map(m => String(m.content || '')).join('\n');
  const subjects = LIFE_DATE_SUBJECTS.filter(item => item.keys.some(key => text.includes(key)));
  if (!subjects.length) return '';
  const year = new Date().getFullYear();
  const blocks = [];
  for (const item of subjects.slice(0, 3)) {
    try {
      const result = await webSearch(`${item.name} ${year} 报名时间 笔试时间 官方公告`);
      // 单次检索现在能拿到 20+ 条，全塞进提示词会把上下文撑爆，只取前 10 条最相关的
      const trimmed = { provider: result?.provider, cached: result?.cached, results: (result?.results || []).slice(0, 10) };
      const formatted = formatSearchContext(trimmed);
      if (formatted) blocks.push(`【${item.name} · 联网检索到的官方时间信息（以此为准，不要凭印象改写）】\n${formatted}`);
    } catch (err) {
      console.log(`[life-date] ${item.name} 检索失败：${err.message}`);
      blocks.push(`【${item.name}】本次未能联网检索到官方时间，相关日期一律写「待核实：请到官方报名系统确认」，不得编造。`);
    }
  }
  if (!blocks.length) return '';
  return ['【时间锚定铁律】下列日期来自实时联网检索，优先级高于你的记忆；与记忆冲突时一律采用检索结果。',
    '其中明确出现的报名截止 / 笔试 / 面试日期，必须逐条建成独立节点并写进 horizon（YYYY-MM-DD）。',
    blocks.join('\n\n')].join('\n');
}

// ===== 考试锚点：只做「通用校验与补齐」，日期与入口一律来自联网检索 =====
// 这里不预置任何考试的具体日期 / 网址 —— 那是模型凭「记忆」编造的温床。
// 日期与官方入口的唯一来源是两条：① buildLifeDateContext() 生成前注入的实时检索结果
// ② 模型据检索结果整理出的 examAnchors 结构化字段；本模块只负责校验它、并补齐它没做的事。
function lifeDateShift(date, days) {
  const d = new Date(`${date}T00:00:00`);
  if (Number.isNaN(d.getTime())) return date;
  d.setDate(d.getDate() + days);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

const LIFE_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

// 锚点只认模型从检索结果整理出来的 examAnchors。
// 日期没通过格式校验的一律丢弃 —— 宁可没有锚点，也不能用假日期去改用户的规划。
function lifeExamAnchors(text, declared) {
  const merged = [];
  const seen = new Set();
  const push = item => {
    if (!item || !item.examDate || !LIFE_DATE_RE.test(String(item.examDate))) return;
    const key = lifeTitleKey(item.subject || '');
    if (!key || seen.has(key)) return;
    seen.add(key);
    merged.push(item);
  };
  for (const item of Array.isArray(declared) ? declared : []) {
    const subject = lifeText(item?.subject, 60);
    if (!subject) continue;
    const examDate = lifeText(item?.examDate || item?.date, 10);
    push({
      subject,
      keys: [subject],
      examDate,
      examTitle: lifeText(item?.examTitle, 200) || `${examDate} ${subject}`,
      ticketStart: LIFE_DATE_RE.test(String(item?.ticketStart || '')) ? String(item.ticketStart) : lifeDateShift(examDate, -7),
      ticketEnd: LIFE_DATE_RE.test(String(item?.ticketEnd || '')) ? String(item.ticketEnd) : lifeDateShift(examDate, -1),
      officialUrl: lifeText(item?.officialUrl, 300),
      printUrl: lifeText(item?.printUrl, 300)
    });
  }
  return merged;
}

function lifeAnchorMatches(anchor, text) {
  const haystack = String(text || '');
  return [anchor.subject, ...(anchor.keys || [])].filter(Boolean).some(key => key.length >= 2 && haystack.includes(key));
}

// 「考试当天节点」与「备考节点」的识别口径，全局共用：前者是里程碑本体，后者是围绕它的准备动作
const LIFE_EXAM_DAY_RE = /考试|笔试|开考|面试|机考|考场|准考证/;
const LIFE_PREP_RE = /模拟|模考|冲刺|刷题|真题|复习|复盘|背诵|练习|押题|串讲/;

// 备考类任务一律不得排到考试当天或之后：当天一早就要进考场，写「模拟 / 冲刺 / 复盘」都是无效安排。
// 模型很爱把模拟考的截止日期直接写成考试日，这里按锚点统一提前到考试前一日。
function anchorExamDeadlines(items, anchors) {
  let fixed = 0;
  for (const item of items) {
    const horizon = lifeText(item?.horizon, 32);
    if (!LIFE_DATE_RE.test(horizon)) continue;
    const anchor = anchors.find(a => a.examDate === horizon);
    if (!anchor) continue;
    // 真正「考试日 / 准考证 / 面试」这类节点本身就该落在考试日，不能前移
    if (LIFE_EXAM_DAY_RE.test(String(item.title || ''))) continue;
    item.horizon = lifeDateShift(anchor.examDate, -1);
    fixed += 1;
  }
  if (fixed) console.log(`[life-anchor] ${fixed} 个备考任务的截止日期被从考试日前移到考试前一日`);
  return fixed;
}

// 不依赖任何预置日期的自纠正：只扫规划本身 —— 同一天里既有「考试当天」的节点、
// 又有「模拟 / 刷题 / 复盘」这类备考节点时，后者一定是排错了，统一提前一日。
// 这条规则靠规划内部的一致性推理，换任何考试都成立，不需要在代码里写死日期。
function shiftDeadlinesOffExamDay(items) {
  const examDays = new Set();
  for (const item of items) {
    const horizon = lifeText(item?.horizon, 32);
    if (LIFE_DATE_RE.test(horizon) && LIFE_EXAM_DAY_RE.test(String(item?.title || ''))) examDays.add(horizon);
  }
  if (!examDays.size) return 0;
  let fixed = 0;
  for (const item of items) {
    const horizon = lifeText(item?.horizon, 32);
    if (!examDays.has(horizon)) continue;
    if (LIFE_EXAM_DAY_RE.test(String(item?.title || ''))) continue;
    if (!LIFE_PREP_RE.test(String(item?.title || ''))) continue;
    item.horizon = lifeDateShift(horizon, -1);
    fixed += 1;
  }
  if (fixed) console.log(`[life-anchor] ${fixed} 个备考任务的截止日期与「考试当天」撞车，已自动提前到前一日`);
  return fixed;
}

// 联网锚点缺席时的兜底推理：直接从规划自身认出考试节点，用它的赛道名当考试名、它的截止日当考试日，
// 准考证窗口按「考前一周开放、考前一日关闭」的通用惯例推算，官方入口沿用该节点里已有的网址。
// 全程没有任何写死的日期或域名，换任何考试都适用。
function lifeDerivedAnchors(items, existing) {
  const covered = new Set((existing || []).map(anchor => lifeTitleKey(anchor.subject || '')));
  const derived = [];
  for (const item of items) {
    const horizon = lifeText(item?.horizon, 32);
    if (!LIFE_DATE_RE.test(horizon)) continue;
    const title = String(item?.title || '').trim();
    if (!LIFE_EXAM_DAY_RE.test(title) || /准考证/.test(title)) continue;
    if ((existing || []).some(anchor => lifeAnchorMatches(anchor, `${title} ${item?.series}`))) continue;
    // 赛道名通常就是考试的正名（如「软考中级软件设计师」），比带日期前缀的节点标题更适合当考试名
    const series = String(item?.series || '').trim();
    const subject = lifeText((!series || /推演|总览|全局/.test(series) ? title : series).replace(/\d{4}\s*年|\d{1,2}\s*月|\d{1,2}\s*日/g, '').trim(), 60);
    const key = lifeTitleKey(subject);
    if (!key || covered.has(key)) continue;
    covered.add(key);
    const urls = lifeUrlsIn(`${item?.detail} ${item?.risk}`);
    derived.push({
      subject,
      keys: [subject],
      examDate: horizon,
      examTitle: `${horizon} ${subject}`,
      ticketStart: lifeDateShift(horizon, -7),
      ticketEnd: lifeDateShift(horizon, -1),
      officialUrl: urls[0] || '',
      printUrl: urls[1] || urls[0] || ''
    });
  }
  if (derived.length) console.log(`[life-anchor] 联网锚点之外，从规划自身认出 ${derived.length} 场考试：${derived.map(a => `${a.subject}@${a.examDate}`).join(' / ')}`);
  return derived;
}

// 锚点对应节点的下标：优先取「截止日期＝考试日」的那个节点，其次按标题命中，最后退回同 series 的赛道节点
function lifeAnchorIndex(items, anchor) {
  let index = items.findIndex(item => lifeText(item?.horizon, 32) === anchor.examDate && lifeAnchorMatches(anchor, item?.title));
  if (index >= 0) return index;
  index = items.findIndex(item => /考试|笔试|开考/.test(String(item?.title || '')) && lifeAnchorMatches(anchor, `${item?.title} ${item?.series}`));
  if (index >= 0) return index;
  index = items.findIndex(item => String(item?.kind) === 'domain' && lifeAnchorMatches(anchor, `${item?.title} ${item?.series}`));
  if (index >= 0) return index;
  return -1;
}

// 准考证打印必须是一条独立动作：官方窗口一关就打不出来，没有准考证当天进不了考场。
// 模型经常只写「考试日」而漏掉打印这一步，这里按锚点补一条，并把已有那条的日期纠正到真实窗口。
function ensureExamTicketNodes(items, anchors) {
  let added = 0;
  for (const anchor of anchors) {
    const node = items.find(item => /准考证/.test(String(item?.title || '')) && lifeAnchorMatches(anchor, `${item?.title} ${item?.detail} ${item?.series}`));
    const start = anchor.ticketStart || lifeDateShift(anchor.examDate, -7);
    const end = anchor.ticketEnd && anchor.ticketEnd < anchor.examDate ? anchor.ticketEnd : lifeDateShift(anchor.examDate, -1);
    const url = anchor.printUrl || anchor.officialUrl;
    const detail = `方法：窗口开放当天登录官方打印系统，下载 PDF 后 A4 双面打印 2 份并核对考点 / 场次；验收：手里有纸质准考证且考场信息无错；资源：${url || `待核实：从 ${anchor.officialUrl || '官网首页'} 进入打印入口`}`;
    if (node) {
      node.startDate = start;
      node.horizon = end;
      if (!/准考证/.test(String(node.title || ''))) node.title = `打印${anchor.subject}准考证`;
      if (!lifeUrlsIn(node.detail).length && url) node.detail = `${String(node.detail || '').replace(/资源：.*$/, '')}资源：${url}`;
      continue;
    }
    const anchorIndex = lifeAnchorIndex(items, anchor);
    const fallback = items.find(item => lifeAnchorMatches(anchor, `${item?.series} ${item?.title}`));
    items.push({
      kind: 'action',
      domain: fallback?.domain || '职业',
      series: fallback?.series || anchor.subject,
      title: `打印${anchor.subject}准考证，20 分钟`,
      detail,
      risk: '错过打印窗口就进不了考场，务必在窗口首日就打好',
      priority: 'P0',
      status: 'todo',
      horizon: end,
      startDate: start,
      weight: 90,
      timeGroup: 'urgent',
      stepNo: 1,
      parentRef: anchorIndex,
      depsRef: [],
      content_type: 'link',
      content_body: url ? [{ text: '官方打印入口', url }] : undefined
    });
    added += 1;
  }
  if (added) console.log(`[life-anchor] 补齐 ${added} 条准考证打印任务`);
  return added;
}

// 每个考试都必须推演「考过 / 没考过」两条结局：用户明确要求看到这件事对未来的影响。
// 模型偶尔会漏，这里按锚点补两条 milestone，detail 里写清未来 1~3 年的影响与兜底动作。
function ensureExamOutcomeNodes(items, anchors) {
  let added = 0;
  for (const anchor of anchors) {
    const hit = kind => items.some(item => {
      const text = `${item?.title || ''}${item?.detail || ''}`;
      return kind.test(text) && lifeAnchorMatches(anchor, text);
    });
    const anchorIndex = lifeAnchorIndex(items, anchor);
    const fallback = items.find(item => lifeAnchorMatches(anchor, `${item?.series} ${item?.title}`));
    const common = {
      kind: 'milestone',
      domain: fallback?.domain || '职业',
      series: '人生推演',
      status: 'todo',
      weight: 70,
      timeGroup: 'future',
      parentRef: anchorIndex,
      content_type: 'branch'
    };
    if (!hit(/考过|通过|上岸|拿到证书|拿到资格|顺利合格/)) {
      items.push({
        ...common,
        title: `${anchor.subject}考过 → 多一条硬门槛通行证`,
        detail: `方法：把证书 / 资格写进简历与报名材料并留档编号；验收：能出示证书编号；资源：${anchor.officialUrl || '待核实：从官网首页进入'}。影响：未来 1 年内多一条可投递的岗位 / 报考通道，可以优先投对这张证有硬要求的岗位；3 年内它是简历上的稳定加分项，但不是主线进度的替代品。`,
        horizon: '1年内',
        depsRef: anchorIndex >= 0 ? [anchorIndex] : [],
        content_body: [{ cond: `${anchor.subject}成绩合格`, then: '优先投递把该证列为硬门槛的岗位 / 招录，同步把证书写进长期简历' }]
      });
      added += 1;
    }
    if (!hit(/没考过|未通过|没过|失败|失利|落榜/)) {
      items.push({
        ...common,
        title: `${anchor.subject}未考过 → 复盘一次后择机重考或走兜底线`,
        detail: `方法：出分 3 天内复盘错因，评估下个报名窗口是否值得重考；验收：产出一页复盘并给出「重考 / 转兜底」的结论；资源：${anchor.officialUrl || '待核实：从官网首页进入'}。影响：这次失败消耗掉本次备考时间（约 1~2 个月）与一次机会，但主赛道（另一条并行线）不受影响；未来 1 年内按结论执行 —— 值得补就等下一个考试窗口重考，不值得就把这条线降为可选加分项，把时间压到别的主线上。`,
        horizon: '1年内',
        depsRef: anchorIndex >= 0 ? [anchorIndex] : [],
        content_body: [{ cond: `${anchor.subject}成绩不合格`, then: '3 天内复盘，决定下一个窗口重考或把该线降为可选加分项' }]
      });
      added += 1;
    }
  }
  if (added) console.log(`[life-anchor] 补齐 ${added} 条「考过 / 没考过」结局节点`);
  return added;
}

function lifeUrlsIn(text) {
  const found = String(text || '').match(/https?:\/\/[^\s；;，,、）)【】"'<>]+/g) || [];
  return [...new Set(found.map(url => url.replace(/[.。]$/, '')))];
}

// 落库前实测每个唯一网址：打不开的死链不能写进规划（用户点开就是「无法访问」）。
// 最多测 12 个、并发 4、单个 6 秒，测不通的在原文里降级成「请从官网首页进入」的文字提示。
const LIFE_LINK_TIMEOUT = 6000;
const LIFE_LINK_MAX = 12;

async function lifeLinkAlive(url) {
  const attempt = method => fetch(url, {
    method,
    redirect: 'follow',
    signal: AbortSignal.timeout(LIFE_LINK_TIMEOUT),
    headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122 Safari/537.36' }
  });
  try {
    const head = await attempt('HEAD');
    if (head.status < 400) return true;
    if (![403, 405, 501].includes(head.status)) return false;
  } catch (_) { /* HEAD 被拒或超时，再用 GET 复核一次 */ }
  try { return (await attempt('GET')).status < 400; } catch (_) { return false; }
}

async function verifyPlanLinks(items) {
  const urls = [];
  for (const item of items) {
    for (const field of ['detail', 'risk']) {
      for (const url of lifeUrlsIn(item?.[field])) if (!urls.includes(url)) urls.push(url);
    }
  }
  const list = urls.slice(0, LIFE_LINK_MAX);
  if (!list.length) return { checked: 0, dropped: 0 };
  const dead = new Set();
  for (let i = 0; i < list.length; i += 4) {
    const batch = list.slice(i, i + 4);
    const results = await Promise.all(batch.map(async url => [url, await lifeLinkAlive(url)]));
    for (const [url, ok] of results) if (!ok) dead.add(url);
  }
  if (!dead.size) {
    console.log(`[life-link] 实测 ${list.length} 个链接全部可达`);
    return { checked: list.length, dropped: 0 };
  }
  for (const item of items) {
    for (const field of ['detail', 'risk']) {
      let text = String(item?.[field] || '');
      if (!text) continue;
      for (const url of dead) if (text.includes(url)) text = text.split(url).join('（原链接已失效，请从该官网首页进入）');
      item[field] = text;
    }
  }
  console.log(`[life-link] 实测 ${list.length} 个链接，剔除失效 ${dead.size} 个：${[...dead].join(', ')}`);
  return { checked: list.length, dropped: dead.size };
}

// 落库前的统一收口：校验锚点 → 钉死考试类硬时间点 → 补齐准考证任务 → 补齐双向结局 → 实测链接可达性
async function injectLifeExamAnchors(items, text, declaredAnchors) {
  // 锚点＝联网检索得到的（模型整理的 examAnchors）＋ 从规划自身认出来的；后者在检索没命中时兜底
  const seeded = lifeExamAnchors(text, declaredAnchors);
  const anchors = [...seeded, ...lifeDerivedAnchors(items, seeded)];
  const report = { anchors: anchors.map(a => `${a.subject}@${a.examDate}`), shifted: 0, selfShifted: 0, tickets: 0, outcomes: 0, checked: 0, dropped: 0 };
  report.shifted = anchorExamDeadlines(items, anchors);
  // 没命中任何锚点时也照样纠正：同一截止日上既有「考试当天」节点、又有备考节点，后者必须提前
  report.selfShifted = shiftDeadlinesOffExamDay(items);
  report.tickets = ensureExamTicketNodes(items, anchors);
  report.outcomes = ensureExamOutcomeNodes(items, anchors);
  Object.assign(report, await verifyPlanLinks(items).catch(() => ({ checked: 0, dropped: 0 })));
  return report;
}

// 元规划任务过滤：「识别 / 倒推 / 锁定 / 盘点 XX 窗口」这类节点是让用户自己去推演，
// 不是用户能直接动手做的事，一律剔除；剔除后按下标重映射 parentRef / depsRef / referenceRef，
// 否则父子链会因为数组下标错位而整体挂错位置。
const LIFE_META_TASK_RE = /^(识别|倒推|锁定|盘点|梳理|整理|制定|规划|构思|策划|设计|汇总|评估|确认)[^，,]{0,14}(窗口期|窗口|周期|节点|清单|思路|策略|路线|方案|框架|体系)$/;

function pruneLifeMetaTasks(items) {
  if (!Array.isArray(items) || !items.length) return items;
  const keep = items.map((item, index) => (LIFE_META_TASK_RE.test(String(item?.title || '').trim()) ? -1 : index));
  const removed = keep.filter(index => index === -1).length;
  if (!removed) return items;
  const remap = new Map();
  const kept = [];
  keep.forEach((index, position) => {
    if (index === -1) return;
    remap.set(position, kept.length);
    kept.push(items[position]);
  });
  const fixRef = ref => {
    const index = Number(ref);
    if (!Number.isInteger(index)) return ref;
    return remap.has(index) ? remap.get(index) : null;
  };
  for (let i = 0; i < kept.length; i++) {
    const source = items[keep.filter(index => index !== -1)[i]];
    if (source?.parentRef !== undefined && source?.parentRef !== null) source.parentRef = fixRef(source.parentRef);
    if (Array.isArray(source?.depsRef)) source.depsRef = source.depsRef.map(fixRef).filter(value => value !== null);
    if (Array.isArray(source?.referenceRef)) source.referenceRef = source.referenceRef.map(fixRef).filter(value => value !== null);
  }
  console.log(`[life-meta] 剔除 ${removed} 个「让用户自己去推」的元规划任务：${items.filter(item => LIFE_META_TASK_RE.test(String(item?.title || '').trim())).map(item => item.title).join(' / ')}`);
  return kept;
}

// 增量路径的同类收口：AI 通过 ops 新增节点时也可能带进「让用户自己去推」的元任务，
// 这里按同一个正则先过滤掉，避免它们被写进库
function pruneMetaOps(ops) {
  if (!Array.isArray(ops) || !ops.length) return ops;
  const kept = ops.filter(op => !LIFE_META_TASK_RE.test(String(op?.title || '').trim()));
  const removed = ops.length - kept.length;
  if (removed) console.log(`[life-meta] 增量剔除 ${removed} 个元规划任务：${ops.filter(op => LIFE_META_TASK_RE.test(String(op?.title || '').trim())).map(op => op.title).join(' / ')}`);
  return kept;
}

// 整轮重建兜底：AI 没给 JSON 块、只回了 Markdown 表格时，直接拼出「根 → 领域 → 动作 + 远期双向结局」的完整节点树。
// 返回 {nodes:[...]}，结构与 /api/life/plan/regenerate 期望的 result 一致（parentRef 用下标引用本轮节点）。
function planLifeNodesFromMarkdown(raw) {
  const text = String(raw || '');
  if (!/[|｜]/.test(text)) return { nodes: [] };
  const clean = value => String(value || '').replace(/\*\*/g, '').replace(/[`「」]/g, '').trim();
  const KEYS = {
    title: ['任务名称', '任务', '事项', '标题', '名称'],
    date: ['截止时间', '截止日期', '截止', '日期', '时间'],
    priority: ['优先级', '优先'],
    deliver: ['交付标准', '验收标准', '交付', '验收'],
    risk: ['风险提示', '风险'],
    resource: ['资料入口', '资料', '资源', '链接', '网址']
  };
  const cellOf = (cells, header, keys) => {
    const index = keys.map(key => header.findIndex(item => item.includes(key))).find(value => value >= 0);
    return index === undefined || index < 0 ? '' : clean(cells[index]);
  };
  // 「制定 XX 计划」这类把计划工作甩给用户的元任务不入库，计划由 AI 直接拆成可执行动作
  const metaTask = /^(制定|规划|整理|构思|梳理|策划|设计)[^，,]{0,8}(计划|方案|清单|思路|策略|路线)$/;
  const SERIES_HINTS = ['国考', '省考', '秋招', '四级', '软考', '财务', '考研', '实习'];
  const today = todayStr();
  const nodes = [];
  const rootIndex = 0;
  nodes.push({
    kind: 'self', domain: '成长', title: '大四多赛道并行发展', series: '核心画像',
    detail: '方法：四条赛道并行推进；验收：四条主线各自跑通一个闭环；资源：待补充可点开的网址',
    status: 'todo', horizon: '1年内', timeGroup: 'urgent', weight: 100, stepNo: 0, parentRef: null
  });
  const domainIndex = new Map();
  let header = null;
  let section = '';
  let step = 0;
  for (const line of text.split(/\r?\n/)) {
    const row = line.trim();
    if (!row) continue;
    if (!/[|｜]/.test(row)) {
      const plain = clean(row.replace(/^#+\s*/, ''));
      if (plain && plain.length <= 24 && !plain.startsWith('-')) {
        section = plain.replace(/^[①②③④⑤⑥⑦⑧⑨⑩\d.、）)]+\s*/, '').trim() || section;
      }
      continue;
    }
    const cells = row.replace(/^[|｜]/, '').replace(/[|｜]$/, '').split(/[|｜]/).map(clean);
    if (!cells.length || cells.every(cell => !cell || /^:?-{2,}:?$/.test(cell))) continue;
    const joined = cells.join('');
    if (/任务|事项|名称/.test(joined) && /截止|日期|时间|优先级|交付/.test(joined)) { header = cells; continue; }
    if (!header || cells.length < 2) continue;
    const title = cellOf(cells, header, KEYS.title);
    if (!title || metaTask.test(title)) continue;

    const dateText = cellOf(cells, header, KEYS.date);
    const dateParts = dateText.match(/(\d{4})-(\d{1,2})-(\d{1,2})/);
    const date = dateParts ? `${dateParts[1]}-${String(dateParts[2]).padStart(2, '0')}-${String(dateParts[3]).padStart(2, '0')}` : today;
    const rawPriority = cellOf(cells, header, KEYS.priority);
    const priority = /^P[0-3]$/i.test(rawPriority) ? rawPriority.toUpperCase()
      : rawPriority.includes('高') ? 'P1' : rawPriority.includes('中') ? 'P2' : rawPriority.includes('低') ? 'P3' : 'P1';
    const deliver = cellOf(cells, header, KEYS.deliver);
    const risk = cellOf(cells, header, KEYS.risk);
    const resource = cellOf(cells, header, KEYS.resource);
    // 赛道归属：优先从标题里识别关键词，识别不到再用所在小节名
    const scope = `${title} ${section}`;
    const series = SERIES_HINTS.find(key => scope.includes(key)) || (section || '行动规划').slice(0, 20);
    if (!domainIndex.has(series)) {
      domainIndex.set(series, nodes.length);
      nodes.push({
        kind: 'domain', domain: '成长', title: series, series, status: 'todo',
        detail: '方法：按这条主线逐项推进；验收：该主线下的子任务全部完成；资源：待补充可点开的网址',
        weight: 60, horizon: '1年内', timeGroup: 'mid', stepNo: 0, parentRef: rootIndex
      });
    }
    const days = Math.round((Date.parse(`${date}T00:00:00`) - Date.parse(`${today}T00:00:00`)) / 86400000);
    const timeGroup = Number.isFinite(days) && days <= 30 ? 'urgent' : Number.isFinite(days) && days <= 90 ? 'mid' : 'future';
    step += 1;
    nodes.push({
      kind: 'action', domain: '成长', title, series, priority,
      detail: `方法：${deliver || '按交付标准一步步执行'}；验收：${deliver || '完成该任务并记录结果'}；资源：${resource || '待补充可点开的网址'}`,
      risk, status: 'todo', horizon: date, weight: 60, timeGroup, stepNo: step,
      parentRef: domainIndex.get(series)
    });
  }
  if (nodes.length <= 1) return { nodes: [] };
  // 远期双向结局：无论表格里写没写，重建时都补上「目标达成 / 目标失利兜底」两条推演分支
  nodes.push({
    kind: 'milestone', domain: '成长', title: '目标达成-稳定发展', series: '人生推演',
    detail: '方法：按各条主线任务逐项达成；验收：主目标节点全部完成；资源：待补充可点开的网址',
    status: 'todo', horizon: '', timeGroup: 'future', weight: 80, stepNo: 0, parentRef: rootIndex
  });
  nodes.push({
    kind: 'milestone', domain: '成长', title: '目标失利-兜底备选路线', series: '人生推演',
    detail: '方法：切换到备选主线；验收：兜底方案落地；资源：待补充可点开的网址',
    status: 'todo', horizon: '', timeGroup: 'future', weight: 80, stepNo: 0, parentRef: rootIndex
  });
  return { nodes };
}

// ── 资料检索队列 / 批量审批 / 永久缓存（付费管控核心）──
// 单条检索预估费用（元）：仅用于生成「预估账单」，可随实际单价调整
const LIFE_RETRIEVAL_EST_COST = 0.02;
const LIFE_RETRIEVAL_STATUS = ['pending', 'approved', 'rejected', 'done', 'failed'];

function lifeQueryKey(query) {
  return crypto.createHash('sha1').update(String(query || '').trim().toLowerCase()).digest('hex');
}

// 缓存命中直接返回结果并累加命中次数，重复需求不重复扣费
async function lifeCacheLookup(query) {
  const key = lifeQueryKey(query);
  const [rows] = await pool.query('SELECT result FROM life_retrieval_cache WHERE query_key = ? LIMIT 1', [key]);
  if (!rows.length) return null;
  await pool.execute('UPDATE life_retrieval_cache SET hit_count = hit_count + 1, updated_at = ? WHERE query_key = ?', [Date.now(), key]);
  return String(rows[0].result || '');
}

async function lifeCacheStore(query, result) {
  const key = lifeQueryKey(query);
  const now = Date.now();
  await pool.execute(
    'INSERT INTO life_retrieval_cache (query_key, query, result, hit_count, created_at, updated_at) VALUES (?, ?, ?, 0, ?, ?) ON DUPLICATE KEY UPDATE result = VALUES(result), updated_at = VALUES(updated_at)',
    [key, lifeText(query, 400), String(result || ''), now, now]
  );
}

async function logLifeRetrieval(batchId, action, detail, cost = 0) {
  await pool.execute(
    'INSERT INTO life_retrieval_logs (id, batch_id, action, detail, cost, created_at) VALUES (?, ?, ?, ?, ?, ?)',
    [crypto.randomUUID(), batchId || '', lifeText(action, 24), lifeText(detail, 400), Number(cost) || 0, Date.now()]
  );
}

// 逻辑推演缺资料时只写队列，绝不调用付费检索；命中缓存则直接回填、不进审批队列
async function queueLifeRetrieval(item) {
  const query = lifeText(item?.query, 400);
  if (!query) return '';
  const cached = await lifeCacheLookup(query);
  const now = Date.now();
  const id = crypto.randomUUID();
  await pool.execute(
    'INSERT INTO life_retrieval_queue (id, batch_id, node_id, series, title, query, priority, est_cost, status, result, from_cache, created_at, decided_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
    [
      id, '', lifeText(item.nodeId, 64), lifeText(item.series, 64), lifeText(item.title, 200), query,
      LIFE_TASK_PRIORITY.includes(item.priority) ? item.priority : 'P2',
      cached ? 0 : LIFE_RETRIEVAL_EST_COST, cached ? 'done' : 'pending',
      cached || null, cached ? 1 : 0, now, cached ? now : 0, now
    ]
  );
  return id;
}

// ===== 方案A：AI 交回的检索需求不再等人工审批，落库后立刻自动执行一次，并把真实网址回填进规划 =====

// AI 拿不到网址时被要求写成「待检索：〈要查什么〉」，历史数据里还留着「资料名｜搜索关键词」这类点不开的死占位；
// 自动检索成功后，用真实网址把这些占位原地替换掉
function replaceResourcePlaceholder(text, url) {
  const raw = String(text || '');
  if (!raw || !url) return raw;
  return raw
    // 「速度轮滑教学 | 搜索关键词」「个人简历模板｜搜索关键词」→ 保留用途标签，只把占位换成网址（对齐「用途描述｜网址」格式）
    // 标签字符集排除引号，避免把「资料：」连同左引号一起吃进去、替换后引号落单
    .replace(/([^；;｜|\n「『]{0,40})[｜|]\s*搜索关键词/g, (match, label) => `${String(label).trim()}｜${url}`)
    // 搜索关键词「国考行测言语真题」→ 没有用途标签可留，直接换成网址
    .replace(/搜索关键词[：:]?\s*[「『][^」』]*[」』]/g, url)
    // 待检索：国考行测历年真题网站
    .replace(/待检索[：:]\s*[^；;｜|）)\n]*/g, url);
}

// 从检索结果里挑最值得回填的一条网址：政府官网 > 权威官媒 > 第一条（结果在 multiSearch 阶段已按权威度排过序）
function pickBestResourceUrl(results) {
  const list = (Array.isArray(results) ? results : []).filter(item => /^https?:\/\//i.test(String(item?.url || '')));
  if (!list.length) return '';
  const official = list.find(item => /(^|\.)gov\.cn(\/|$|:)|(^|\.)gov(\/|$|:)/i.test(item.url));
  const media = list.find(item => /(xinhuanet|people\.com\.cn|news\.cn|chinanews|chinadaily|cctv|gmw\.cn|moe\.gov)/i.test(item.url));
  return String((official || media || list[0]).url || '').trim();
}

// 缓存里存的是格式化文本（没有结构化 result.url），从文本里兜底抓第一条链接，优先 gov.cn
function pickUrlFromText(text) {
  const urls = String(text || '').match(/https?:\/\/[^\s）)"'，。]+/g) || [];
  const official = urls.find(url => /(^|\.)gov\.cn(\/|$|:)/i.test(url));
  return String(official || urls[0] || '');
}

// 回填：优先按队列记录的 nodeId 改节点 detail，其次按标题归一化找节点，再退到每日任务的 support 字段
async function backfillLifeResource(nodeId, title, url) {
  const now = Date.now();
  let filled = 0;
  const candidates = [];
  if (nodeId) {
    const [rows] = await pool.query('SELECT id, detail FROM life_plan_nodes WHERE id = ? LIMIT 1', [String(nodeId)]);
    candidates.push(...rows);
  }
  if (!candidates.length && title) {
    const key = lifeTitleKey(title);
    const [rows] = await pool.query('SELECT id, title, detail FROM life_plan_nodes');
    candidates.push(...rows.filter(row => lifeTitleKey(row.title) === key));
  }
  for (const row of candidates) {
    const next = replaceResourcePlaceholder(row.detail, url);
    if (next === row.detail) continue;
    await pool.execute('UPDATE life_plan_nodes SET detail = ?, updated_at = ? WHERE id = ?', [next, now, String(row.id)]);
    filled++;
  }
  if (!filled && title) {
    const [tasks] = await pool.query('SELECT id, support FROM life_daily_tasks WHERE title = ? LIMIT 10', [title]);
    for (const task of tasks) {
      const next = replaceResourcePlaceholder(task.support, url);
      if (next === task.support) continue;
      await pool.execute('UPDATE life_daily_tasks SET support = ?, updated_at = ? WHERE id = ?', [next, now, String(task.id)]);
      filled++;
    }
  }
  return filled;
}

// 自动执行一批检索需求：逐条联网 → 结果永久写回缓存与队列 → 把最权威的网址回填到对应节点 / 任务。
// 单条失败只标记该条，不影响其他条目，也不抛给调用方（画布同步不能因为某个检索源挂了就整轮失败）。
async function autoRunLifeRetrieval(entries, userId = 'life-auto') {
  // id 只有「本轮 AI 刚入队」的条目才有；历史遗留占位是直接补的，没有队列行
  const list = (Array.isArray(entries) ? entries : []).filter(item => item && item.query);
  if (!list.length) return 0;
  // 自动检索走独立配额，不与用户对话的搜索会话互相挤占
  resetSearchSession(userId);
  let filled = 0;
  for (const item of list) {
    try {
      // 同一问法之前查过就直接复用缓存，不再打一次上游
      const cachedResult = await lifeCacheLookup(item.query);
      if (cachedResult) {
        if (item.id) await pool.execute("UPDATE life_retrieval_queue SET result = ?, status = 'done', from_cache = 1, updated_at = ? WHERE id = ?", [cachedResult, Date.now(), item.id]);
        const cachedUrl = pickUrlFromText(cachedResult);
        if (cachedUrl) filled += await backfillLifeResource(item.nodeId, item.title, cachedUrl);
        continue;
      }
      const found = await webSearch(item.query, { userId, getSecret: getUserSecret });
      const results = Array.isArray(found?.results) ? found.results : [];
      const text = lifeText(typeof found === 'string' ? found : formatSearchContext(found), 4000);
      await lifeCacheStore(item.query, text);
      if (item.id) await pool.execute("UPDATE life_retrieval_queue SET result = ?, status = 'done', from_cache = 0, updated_at = ? WHERE id = ?", [text, Date.now(), item.id]);
      const url = pickBestResourceUrl(results);
      if (url) filled += await backfillLifeResource(item.nodeId, item.title, url);
    } catch (err) {
      if (item.id) await pool.execute("UPDATE life_retrieval_queue SET status = 'failed', result = ?, updated_at = ? WHERE id = ?", [lifeText(`自动检索失败：${err.message}`, 300), Date.now(), item.id]);
      console.warn(`[Life检索] 自动执行失败 query=${item.query}：${err.message}`);
    }
  }
  await logLifeRetrieval('', 'auto', `自动检索 ${list.length} 条，回填真实网址 ${filled} 处`);
  return filled;
}

// 单轮最多顺手补几处历史遗留占位（避免一次对话把检索额度全烧光）
const LIFE_LEGACY_SWEEP_LIMIT = 6;

// 从历史遗留的占位文本里推一个检索意图：优先取「待检索：」后的原文，其次用「资料名 + 任务标题」
function legacySearchIntent(text, title) {
  const raw = String(text || '');
  const pending = /待检索[：:]\s*([^；;｜|）)\n]{2,60})/.exec(raw);
  if (pending) return pending[1].trim();
  const label = /([^；;｜|\n「『]{2,30})[｜|]\s*搜索关键词/.exec(raw);
  const name = label ? label[1].replace(/^.*[：:]\s*/, '').trim() : '';
  const cleanTitle = String(title || '').replace(/[，,].*$/, '').trim();
  return [name, cleanTitle].filter(Boolean).join(' ');
}

// 扫一遍库里还留着「资料名｜搜索关键词」「待检索：…」的节点与任务，产出待补齐清单
async function collectLegacyResourceIntents(limit = LIFE_LEGACY_SWEEP_LIMIT) {
  const entries = [];
  const [nodes] = await pool.query("SELECT id, title, detail FROM life_plan_nodes WHERE detail LIKE '%搜索关键词%' OR detail LIKE '%待检索%'");
  for (const row of nodes) {
    const query = legacySearchIntent(row.detail, row.title);
    if (query) entries.push({ id: '', query, nodeId: String(row.id), title: row.title });
    if (entries.length >= limit) return entries;
  }
  const [tasks] = await pool.query("SELECT id, title, support FROM life_daily_tasks WHERE support LIKE '%搜索关键词%' OR support LIKE '%待检索%'");
  for (const row of tasks) {
    const query = legacySearchIntent(row.support, row.title);
    if (query) entries.push({ id: '', query, nodeId: '', title: row.title });
    if (entries.length >= limit) break;
  }
  return entries;
}

// 检索账单载荷（形如 {"query":"…","nodeId":"…"} 的 JSON）曾被当成任务节点落库，用户看到的就是一句机器话。
// 统一在这里拦下：凡 contentBody 里带 "query" 字段的，一律降级成本轮检索需求，不再建节点。
function demoteLifeBillNodes(ops) {
  const ADD_ACTIONS = new Set(['add', 'upsert', 'update']);
  for (const op of ops) {
    if (!op || typeof op !== 'object') continue;
    if (!ADD_ACTIONS.has(String(op.op || ''))) continue;
    const rawBody = op.contentBody || op.content_body || '';
    const body = typeof rawBody === 'string' ? rawBody : JSON.stringify(rawBody || '');
    if (!/"query"\s*:/.test(body)) continue;
    let parsed = {};
    try { parsed = JSON.parse(body) || {}; } catch (err) { parsed = {}; }
    const query = lifeText(parsed.query || parsed.keyword || op.title, 400);
    // 丢掉节点字段，改成本轮检索需求
    delete op.contentBody;
    delete op.content_body;
    delete op.kind;
    delete op.risk;
    if (!query) { op.op = 'skip'; continue; }
    op.op = 'queue_search';
    op.query = query;
    op.nodeId = parsed.nodeId || op.nodeId || '';
  }
}

// 每 30 分钟归集一次：把 pending 条目打成一包，产出「检索清单 + 预估账单」，等待三种人工审批
// （自动检索已把 AI 主动提出的需求直接消化，人工审批只留给用户在面板里手动追加的检索）
async function collectLifeRetrievalBatch() {
  const now = Date.now();
  const [pending] = await pool.query("SELECT id, est_cost FROM life_retrieval_queue WHERE status = 'pending' AND (batch_id IS NULL OR batch_id = '') ORDER BY created_at ASC");
  if (!pending.length) return null;
  const batchId = crypto.randomUUID();
  const est = pending.reduce((sum, row) => sum + Number(row.est_cost || 0), 0);
  const [seq] = await pool.query('SELECT COUNT(*) AS n FROM life_retrieval_batches');
  const stamp = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  const batchNo = `B${stamp}-${String(Number(seq[0].n) + 1).padStart(3, '0')}`;
  await pool.execute(
    'INSERT INTO life_retrieval_batches (id, batch_no, task_count, est_cost, actual_cost, status, created_at, decided_at) VALUES (?, ?, ?, ?, 0, ?, ?, 0)',
    [batchId, batchNo, pending.length, est, 'pending', now]
  );
  const ids = pending.map(row => String(row.id));
  await pool.execute(`UPDATE life_retrieval_queue SET batch_id = ?, updated_at = ? WHERE id IN (${ids.map(() => '?').join(',')})`, [batchId, now, ...ids]);
  await logLifeRetrieval(batchId, 'collect', `归集 ${pending.length} 条待检索，预估费用 ${est.toFixed(2)} 元`, est);
  return batchId;
}

// 执行单个已批准的检索：先查缓存，未命中才真正联网，结果永久写回缓存
async function executeLifeRetrieval(task, userId) {
  const cached = await lifeCacheLookup(task.query);
  if (cached) {
    await pool.execute("UPDATE life_retrieval_queue SET result = ?, status = 'done', from_cache = 1, updated_at = ? WHERE id = ?", [cached, Date.now(), task.id]);
    return { cost: 0, fromCache: true };
  }
  const found = await webSearch(task.query, { userId, getSecret: getUserSecret });
  const text = typeof found === 'string' ? found : formatSearchContext(found);
  const result = lifeText(text, 4000);
  await lifeCacheStore(task.query, result);
  await pool.execute("UPDATE life_retrieval_queue SET result = ?, status = 'done', from_cache = 0, updated_at = ? WHERE id = ?", [result, Date.now(), task.id]);
  return { cost: Number(task.est_cost) || LIFE_RETRIEVAL_EST_COST, fromCache: false };
}

// 应用 AI 给出的增量操作；返回实际生效的条数
async function applyLifeOps(ops) {
  if (!Array.isArray(ops) || !ops.length) return 0;
  // 先按日期把本轮 op 的时序分组纠一遍（含 upsert/add/update 三类），落库值一律以真实日期为准
  normalizeLifeTimeGroups(ops.filter(op => op && typeof op === 'object'));
  // 检索账单载荷不得落成节点：统一降级成本轮检索需求（否则用户会看到「获取XX真题源」这种机器话节点）
  demoteLifeBillNodes(ops);
  const now = Date.now();
  const tempMap = new Map();
  const created = [];
  // 本轮新产生的检索需求，收尾时统一自动联网执行并把真实网址回填回规划
  const pendingSearch = [];
  let applied = 0;
  // deps 只能指向真实存在的节点：收集现有 id，新增的边在第二轮用 tempMap 换算后补齐
  const [knownRows] = await pool.query('SELECT id, title FROM life_plan_nodes');
  const knownIds = new Set(knownRows.map(row => String(row.id)));
  // 归一化标题 → 节点 id：AI 措辞略有出入（多一个逗号 / 少一个空格）时也原地更新，不重复建节点
  const titleIndex = new Map();
  for (const row of knownRows) {
    const key = lifeTitleKey(row.title);
    if (key && !titleIndex.has(key)) titleIndex.set(key, String(row.id));
  }

  for (const op of ops) {
    if (!op || typeof op !== 'object') continue;
    const action = String(op.op || '');

    if (action === 'upsert_self') {
      const title = lifeText(op.title, 60) || '我的人生画像';
      const detail = lifeText(op.detail, 1200);
      const domain = LIFE_DOMAINS.includes(op.domain) ? op.domain : '成长';
      const [existing] = await pool.query("SELECT id FROM life_plan_nodes WHERE kind = 'self' ORDER BY created_at ASC LIMIT 1");
      if (existing.length) {
        await pool.execute('UPDATE life_plan_nodes SET title = ?, detail = ?, domain = ?, updated_at = ? WHERE id = ?', [title, detail, domain, now, existing[0].id]);
      } else {
        await pool.execute(
          'INSERT INTO life_plan_nodes (id, parent_id, kind, domain, title, detail, status, horizon, weight, content_type, source, sort_order, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
          [crypto.randomUUID(), '', 'self', domain, title, detail, 'doing', '', 100, 'text', 'ai', 0, now, now]
        );
      }
      applied++;
    } else if (action === 'add') {
      const id = crypto.randomUUID();
      const kind = LIFE_KINDS.includes(op.kind) ? op.kind : 'goal';
      const domain = LIFE_DOMAINS.includes(op.domain) ? op.domain : '成长';
      const title = lifeText(op.title, 200);
      const detail = lifeText(op.detail, 1200);
      const risk = lifeText(op.risk, 200);
      const status = ['todo', 'doing', 'done'].includes(op.status) ? op.status : 'todo';
      const horizon = lifeText(op.horizon, 32);
      // 开始日期：与截止日期分开，AI 有明确开始日时才写，否则留空（不覆盖用户已填的值）
      const startDate = lifeText(op.startDate || op.start_date, 10);
      const weight = lifeClampWeight(op.weight);
      const priority = LIFE_TASK_PRIORITY.includes(op.priority) ? op.priority : '';
      const series = lifeText(op.series, 64);
      const timeGroup = LIFE_TIME_GROUPS.includes(op.timeGroup) ? op.timeGroup : '';
      const stepNo = Math.max(0, Math.min(999, Math.round(Number(op.stepNo) || 0)));
      // 同一件事已有节点时不再新建，改为就地更新，避免同一个任务衍生出多个重复节点
      // 载体类型：AI 显式给的优先，没给就留空由 lifeContentType() 按内容推断
      const givenType = String(op.contentType || op.content_type || '').trim().toLowerCase();
      const contentType = LIFE_CONTENT_TYPES.includes(givenType) ? givenType : '';
      const contentBody = op.contentBody || op.content_body
        ? (typeof (op.contentBody || op.content_body) === 'string' ? String(op.contentBody || op.content_body) : JSON.stringify(op.contentBody || op.content_body))
        : '';
      // 部分完成：AI 替用户记下「哪些做完了、哪些还没做」；只有本轮明确给了才写，避免覆盖用户已有记录
      const progressNote = lifeText(op.progressNote || op.progress_note, 1200);
      // 横向关联与本轮 tempId 列表；公共节点标记（复盘 / 方法 / 资料 / 模板全网络复用）
      const refs = Array.isArray(op.referenceIds) ? op.referenceIds.map(String).filter(Boolean) : [];
      const shared = op.shared === true || op.isShared === true || op.is_shared === true ? 1 : 0;
      // 大脑（kind=self）全网只能有一个：不管标题是否相同，一律就地更新已有的那个，避免长出第二个根节点
      const [selfRow] = kind === 'self' ? await pool.query("SELECT id FROM life_plan_nodes WHERE kind = 'self' LIMIT 1") : [[]];
      const [dupe] = !selfRow.length && title ? await pool.query('SELECT id FROM life_plan_nodes WHERE title = ? LIMIT 1', [title]) : [[]];
      const reuseId = selfRow.length ? String(selfRow[0].id) : (dupe.length ? String(dupe[0].id) : (title ? (titleIndex.get(lifeTitleKey(title)) || '') : ''));
      if (reuseId) {
        if (op.tempId) tempMap.set(String(op.tempId), reuseId);
        const sets = ['detail = ?', 'risk = ?', 'priority = ?', 'series = ?', 'status = ?', 'horizon = ?', 'weight = ?', 'time_group = ?', 'step_no = ?', 'content_type = ?', 'content_body = ?', 'is_shared = ?'];
        const vals = [detail, risk, priority, series, status, horizon, weight, timeGroup, stepNo, contentType, contentBody, shared];
        if (progressNote) { sets.push('progress_note = ?'); vals.push(progressNote); }
        if (startDate) { sets.push('start_date = ?'); vals.push(startDate); }
        sets.push('updated_at = ?'); vals.push(now, reuseId);
        await pool.execute(`UPDATE life_plan_nodes SET ${sets.join(', ')} WHERE id = ?`, vals);
        if (Array.isArray(op.deps) || refs.length) created.push({ id: reuseId, ref: op.parentId ? String(op.parentId) : '', deps: Array.isArray(op.deps) ? op.deps : [], refs });
        applied++;
        continue;
      }
      await pool.execute(
        'INSERT INTO life_plan_nodes (id, parent_id, kind, domain, title, detail, risk, priority, series, status, horizon, start_date, weight, time_group, step_no, content_type, content_body, progress_note, is_shared, source, sort_order, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
        [id, '', kind, domain, title, detail, risk, priority, series, status, horizon, startDate, weight, timeGroup, stepNo, contentType, contentBody, progressNote, shared, 'ai', applied + 1, now, now]
      );
      // parentId 与 deps 都可能引用本轮其他节点的 tempId，统一放到第二轮换算
      created.push({ id, ref: op.parentId ? String(op.parentId) : '', deps: Array.isArray(op.deps) ? op.deps : [], refs });
      // 关键：本轮新建节点的 tempId 必须登记，否则同批节点的 parentId 引用会落空、父子链整条断掉
      if (op.tempId) tempMap.set(String(op.tempId), id);
      if (title) titleIndex.set(lifeTitleKey(title), id);
      knownIds.add(id);
      applied++;
    } else if (action === 'upsert_daily') {
      // 模块2 每日细分任务表：按「title + date」去重覆盖
      const title = lifeText(op.title, 200);
      const date = lifeText(op.date, 10) || todayStr();
      if (!title) continue;
      const priority = LIFE_TASK_PRIORITY.includes(op.priority) ? op.priority : 'P1';
      const status = LIFE_TASK_STATUS.includes(op.status) ? op.status : 'todo';
      const estMinutes = Math.max(0, Number(op.estMinutes) || 0);
      const repeatType = lifeRepeatType(op.repeat || op.repeatType, title);
      // 同日去重用「归一化标题」而不是精确匹配：AI 多轮提取时会在标题里随手加空格
      //（「完成20道逻辑推理真题练习」与「完成 20 道逻辑推理真题练习」），精确匹配会把同一条任务存两遍
      const [sameDay] = await pool.query('SELECT id, title FROM life_daily_tasks WHERE task_date = ?', [date]);
      const titleKey = lifeTitleKey(title);
      const dupe = sameDay.filter(row => lifeTitleKey(row.title) === titleKey);
      if (dupe.length) {
        await pool.execute(
          'UPDATE life_daily_tasks SET est_minutes = ?, priority = ?, status = ?, pre_task = ?, blocker = ?, support = ?, repeat_type = ?, updated_at = ? WHERE id = ?',
          [estMinutes, priority, status, lifeText(op.preTask, 120), lifeText(op.blocker, 200), lifeText(op.support, 200), repeatType, now, dupe[0].id]
        );
      } else {
        await pool.execute(
          'INSERT INTO life_daily_tasks (id, task_date, title, est_minutes, priority, status, pre_task, blocker, support, node_id, repeat_type, sort_order, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
          [crypto.randomUUID(), date, title, estMinutes, priority, status, lifeText(op.preTask, 120), lifeText(op.blocker, 200), lifeText(op.support, 200), '', repeatType, applied + 1, now, now]
        );
      }
      applied++;
    } else if (action === 'upsert_skill') {
      // 模块3 个人技能档案
      const name = lifeText(op.name, 120);
      if (!name) continue;
      const category = LIFE_SKILL_CATEGORY.includes(op.category) ? op.category : 'own';
      const [dupe] = await pool.query('SELECT id FROM life_skill_profile WHERE name = ? LIMIT 1', [name]);
      if (dupe.length) {
        await pool.execute('UPDATE life_skill_profile SET category = ?, level = ?, note = ?, updated_at = ? WHERE id = ?',
          [category, lifeText(op.level, 32), lifeText(op.note, 200), now, dupe[0].id]);
      } else {
        await pool.execute('INSERT INTO life_skill_profile (id, category, name, level, note, sort_order, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
          [crypto.randomUUID(), category, name, lifeText(op.level, 32), lifeText(op.note, 200), applied + 1, now, now]);
      }
      applied++;
    } else if (action === 'upsert_energy') {
      // 模块16 精力负荷评估表：按日期覆盖
      const logDate = lifeText(op.date, 10) || todayStr();
      const planned = Math.max(0, Number(op.plannedMinutes) || 0);
      const capacity = Math.max(0, Number(op.capacityMinutes) || 0);
      const overload = planned > capacity && capacity > 0 ? 1 : 0;
      const [dupe] = await pool.query('SELECT id FROM life_energy_logs WHERE log_date = ? LIMIT 1', [logDate]);
      if (dupe.length) {
        await pool.execute('UPDATE life_energy_logs SET planned_minutes = ?, capacity_minutes = ?, overload = ?, distractions = ?, sleep_hours = ?, health = ?, note = ? WHERE id = ?',
          [planned, capacity, overload, lifeText(op.distractions, 200), Number(op.sleepHours) || 0, lifeText(op.health, 100), lifeText(op.note, 1000), dupe[0].id]);
      } else {
        await pool.execute('INSERT INTO life_energy_logs (id, log_date, planned_minutes, capacity_minutes, overload, distractions, sleep_hours, health, note, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
          [crypto.randomUUID(), logDate, planned, capacity, overload, lifeText(op.distractions, 200), Number(op.sleepHours) || 0, lifeText(op.health, 100), lifeText(op.note, 1000), now]);
      }
      applied++;
    } else if (action === 'upsert_knowledge') {
      // 模块18 个人学习知识库：按 topic 去重
      const topic = lifeText(op.topic, 120);
      if (!topic) continue;
      const [dupe] = await pool.query('SELECT id FROM life_knowledge WHERE topic = ? LIMIT 1', [topic]);
      if (dupe.length) {
        await pool.execute('UPDATE life_knowledge SET subject = ?, content = ?, wrong_questions = ?, tags = ?, updated_at = ? WHERE id = ?',
          [lifeText(op.subject, 32), lifeText(op.content, 4000), lifeText(op.wrongQuestions, 4000), lifeText(op.tags, 120), now, dupe[0].id]);
      } else {
        await pool.execute('INSERT INTO life_knowledge (id, subject, topic, content, wrong_questions, tags, review_stage, next_review_date, source, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
          [crypto.randomUUID(), lifeText(op.subject, 32), topic, lifeText(op.content, 4000), lifeText(op.wrongQuestions, 4000), lifeText(op.tags, 120), 0, lifeNextReviewDate(todayStr(), 0), 'ai', now, now]);
      }
      applied++;
    } else if (action === 'upsert_event') {
      // 模块19 外部事件日历：按 title 去重
      const title = lifeText(op.title, 120);
      if (!title) continue;
      const level = ['high', 'mid', 'low'].includes(op.level) ? op.level : 'mid';
      const [dupe] = await pool.query('SELECT id FROM life_calendar_events WHERE title = ? LIMIT 1', [title]);
      if (dupe.length) {
        await pool.execute('UPDATE life_calendar_events SET event_date = ?, category = ?, level = ?, remind_days = ?, note = ?, updated_at = ? WHERE id = ?',
          [lifeText(op.date, 10), lifeText(op.category, 32), level, lifeText(op.remindDays, 32) || '30,7,1', lifeText(op.note, 1000), now, dupe[0].id]);
      } else {
        await pool.execute('INSERT INTO life_calendar_events (id, title, event_date, category, level, remind_days, status, note, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
          [crypto.randomUUID(), title, lifeText(op.date, 10), lifeText(op.category, 32), level, lifeText(op.remindDays, 32) || '30,7,1', 'pending', lifeText(op.note, 1000), now, now]);
      }
      applied++;
    } else if (action === 'persona') {
      // 全局人物画像：AI 按 6 大维度累积更新。只写 AI 明确给出的维度，其余维度保留原内容
      let personaRow = await readLifePersonaRow();
      if (!personaRow) {
        await pool.execute(
          `INSERT INTO life_persona (id, hard_skills, time_habits, traits, resources, values_pref, risks, source, created_at, updated_at) VALUES (?, '', '', '', '', '', '', 'ai', ?, ?)`,
          [crypto.randomUUID(), now, now]
        );
        personaRow = await readLifePersonaRow();
      }
      if (personaRow) {
        const fields = [];
        const values = [];
        for (const dim of LIFE_PERSONA_DIMS) {
          const raw = op[dim.key] !== undefined ? op[dim.key] : op[dim.col];
          if (raw === undefined) continue;
          const text = lifeText(raw, 6000);
          if (!text) continue;
          fields.push(`${dim.col} = ?`);
          values.push(text);
        }
        if (fields.length) {
          fields.push('source = ?'); values.push('ai');
          fields.push('updated_at = ?'); values.push(now);
          values.push(personaRow.id);
          await pool.execute(`UPDATE life_persona SET ${fields.join(', ')} WHERE id = ?`, values);
        }
      }
      applied++;
    } else if (action === 'path') {
      // 未来可选发展路径库（画像的衍生模块）：按 name 去重覆盖
      const pathName = lifeText(op.name, 120);
      if (!pathName) continue;
      const pathPayload = [
        lifeText(op.advantages, 4000),
        lifeText(op.risks, 4000),
        lifeText(op.prerequisites, 2000),
        lifeText(op.evolution, 4000),
        Math.max(0, Math.min(100, Math.round(Number(op.score) || 0))),
        lifeText(op.nodeId, 64)
      ];
      const [pathDupe] = await pool.query('SELECT id FROM life_future_paths WHERE name = ? LIMIT 1', [pathName]);
      if (pathDupe.length) {
        await pool.execute(
          'UPDATE life_future_paths SET advantages = ?, risks = ?, prerequisites = ?, evolution = ?, score = ?, node_id = ?, updated_at = ? WHERE id = ?',
          [...pathPayload, now, pathDupe[0].id]
        );
      } else {
        await pool.execute(
          'INSERT INTO life_future_paths (id, name, advantages, risks, prerequisites, evolution, score, node_id, source, sort_order, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
          [crypto.randomUUID(), pathName, ...pathPayload, 'ai', applied + 1, now, now]
        );
      }
      applied++;
    } else if (action === 'log_change') {
      // 模块17 变更日志
      const content = lifeText(op.content, 400);
      if (!content) continue;
      await pool.execute('INSERT INTO life_change_logs (id, module, content, reason, snapshot_id, created_at) VALUES (?, ?, ?, ?, ?, ?)',
        [crypto.randomUUID(), lifeText(op.module, 32), content, lifeText(op.reason, 200), '', now]);
      applied++;
    }
  }

  // 第二轮：挂载父节点与前置依赖，随后处理更新与删除
  for (const item of created) {
    const parentId = item.ref ? (tempMap.get(item.ref) || item.ref) : '';
    if (parentId) {
      const [parent] = await pool.query('SELECT id FROM life_plan_nodes WHERE id = ? LIMIT 1', [parentId]);
      if (parent.length) await pool.execute('UPDATE life_plan_nodes SET parent_id = ? WHERE id = ?', [parent[0].id, item.id]);
    }
    // deps 引用本轮新节点时同样要用 tempMap 换算，并剔除不存在的 id，避免前端画出悬空连线
    const deps = item.deps
      .map(ref => tempMap.get(String(ref)) || String(ref))
      .filter(ref => ref && ref !== item.id && knownIds.has(ref));
    if (deps.length) await pool.execute('UPDATE life_plan_nodes SET deps = ? WHERE id = ?', [JSON.stringify([...new Set(deps)]), item.id]);
    // 横向关联 referenceIds 与纵向 deps 同理，先换算 tempId 再剔除悬空引用
    const refs = (item.refs || [])
      .map(ref => tempMap.get(String(ref)) || String(ref))
      .filter(ref => ref && ref !== item.id && knownIds.has(ref));
    if (refs.length) await pool.execute('UPDATE life_plan_nodes SET reference_ids = ? WHERE id = ?', [JSON.stringify([...new Set(refs)]), item.id]);
  }

  for (const op of ops) {
    if (!op || typeof op !== 'object') continue;
    const action = String(op.op || '');
    if (action === 'update' && op.id) {
      const fields = [];
      const values = [];
      if (op.title !== undefined) { fields.push('title = ?'); values.push(lifeText(op.title, 200)); }
      if (op.detail !== undefined) { fields.push('detail = ?'); values.push(lifeText(op.detail, 1200)); }
      if (op.risk !== undefined) { fields.push('risk = ?'); values.push(lifeText(op.risk, 200)); }
      if (op.priority !== undefined) { fields.push('priority = ?'); values.push(LIFE_TASK_PRIORITY.includes(op.priority) ? op.priority : ''); }
      if (op.series !== undefined) { fields.push('series = ?'); values.push(lifeText(op.series, 64)); }
      if (op.horizon !== undefined) { fields.push('horizon = ?'); values.push(lifeText(op.horizon, 32)); }
      // 开始日期：与截止日期分开更新
      if (op.startDate !== undefined || op.start_date !== undefined) { fields.push('start_date = ?'); values.push(lifeText(op.startDate || op.start_date, 10)); }
      // 改挂父节点：用于合并重复赛道（把重复节点及其子树改挂到保留的那条下面）
      if (op.parentId !== undefined || op.parent_id !== undefined) {
        const target = tempMap.get(String(op.parentId || op.parent_id)) || String(op.parentId || op.parent_id || '');
        const parentId = target && target !== String(op.id) && (target === '' || knownIds.has(target)) ? target : null;
        if (parentId !== null) { fields.push('parent_id = ?'); values.push(parentId); }
      }
      if (op.weight !== undefined) { fields.push('weight = ?'); values.push(lifeClampWeight(op.weight)); }
      if (op.status !== undefined && ['todo', 'doing', 'done'].includes(op.status)) { fields.push('status = ?'); values.push(op.status); }
      if (op.domain !== undefined && LIFE_DOMAINS.includes(op.domain)) { fields.push('domain = ?'); values.push(op.domain); }
      if (op.timeGroup !== undefined && LIFE_TIME_GROUPS.includes(op.timeGroup)) { fields.push('time_group = ?'); values.push(op.timeGroup); }
      if (op.stepNo !== undefined) { fields.push('step_no = ?'); values.push(Math.max(0, Math.min(999, Math.round(Number(op.stepNo) || 0)))); }
      if (Array.isArray(op.deps)) {
        const deps = op.deps
          .map(ref => tempMap.get(String(ref)) || String(ref))
          .filter(ref => ref && ref !== String(op.id) && knownIds.has(ref));
        fields.push('deps = ?');
        values.push(JSON.stringify([...new Set(deps)]));
      }
      if (Array.isArray(op.referenceIds)) {
        const refs = op.referenceIds
          .map(ref => tempMap.get(String(ref)) || String(ref))
          .filter(ref => ref && ref !== String(op.id) && knownIds.has(ref));
        fields.push('reference_ids = ?');
        values.push(JSON.stringify([...new Set(refs)]));
      }
      if (op.shared !== undefined) { fields.push('is_shared = ?'); values.push(op.shared ? 1 : 0); }
      if (op.progressNote !== undefined) { fields.push('progress_note = ?'); values.push(lifeText(op.progressNote, 1200)); }
      if (!fields.length) continue;
      fields.push('updated_at = ?');
      values.push(now, String(op.id));
      await pool.execute(`UPDATE life_plan_nodes SET ${fields.join(', ')} WHERE id = ?`, values);
      applied++;
    } else if (action === 'queue_search') {
      // AI 缺资料时主动提出的检索需求：先入队留痕，本轮结束时统一自动执行并把真实网址回填回规划
      const query = lifeText(op.query, 400);
      if (query) {
        const nodeId = op.nodeId ? (tempMap.get(String(op.nodeId)) || String(op.nodeId)) : '';
        const title = lifeText(op.title, 200);
        const queueId = await queueLifeRetrieval({
          query,
          nodeId,
          title,
          series: lifeText(op.series, 64),
          priority: op.priority,
          estCost: op.estCost
        });
        if (queueId) pendingSearch.push({ id: queueId, query, nodeId, title });
        applied++;
      }
    } else if (action === 'remove' && op.id) {
      // 只允许 AI 移除自己生成的节点，避免误删用户手动维护的内容
      const [rows] = await pool.query("SELECT id FROM life_plan_nodes WHERE id = ? AND source = 'ai' LIMIT 1", [String(op.id)]);
      if (!rows.length) continue;
      // 「大脑」中心节点永远不能移除，否则整张规划网络就没了起点
      const [selfRows] = await pool.query("SELECT id FROM life_plan_nodes WHERE id = ? AND kind = 'self' LIMIT 1", [rows[0].id]);
      if (selfRows.length) continue;
      await pool.execute('DELETE FROM life_plan_nodes WHERE id = ?', [rows[0].id]);
      applied++;
    }
  }

  // 单根兜底：非「大脑」节点不能成为顶层根，parent_id 为空的统一挂到「大脑」下面。
  // 防止 AI 漏填 parentId 时图里散出多个并列根（用户要求：四级这类一级节点必须挂在大脑下面）
  {
    const [selfNodes] = await pool.query("SELECT id FROM life_plan_nodes WHERE kind = 'self' ORDER BY created_at ASC LIMIT 1");
    if (selfNodes.length) {
      // 只收本来就该有父节点的类型：赛道 / 计划 / 动作 / 里程碑，全都要收进大脑这棵树
      await pool.execute("UPDATE life_plan_nodes SET parent_id = ?, updated_at = ? WHERE kind <> 'self' AND (parent_id IS NULL OR parent_id = '')", [String(selfNodes[0].id), now]);
    }
  }

  // 每日任务与规划节点挂钩：upsert_daily 本身不带节点 id，这里按标题回填；
  // 挂上之后任务行才能显示「方法 / 验收 / 资源 / 风险」，前置锁才有依据
  const [orphanTasks] = await pool.query("SELECT id, title FROM life_daily_tasks WHERE node_id IS NULL OR node_id = ''");
  if (orphanTasks.length) {
    const [allNodes] = await pool.query('SELECT id, title FROM life_plan_nodes');
    const exactTitle = new Map();
    for (const node of allNodes) exactTitle.set(String(node.title || '').trim(), String(node.id));
    for (const task of orphanTasks) {
      const title = String(task.title || '').trim();
      let nodeId = exactTitle.get(title) || '';
      if (!nodeId && title.length >= 4) {
        const hit = allNodes.find(node => {
          const nodeTitle = String(node.title || '').trim();
          return nodeTitle.length >= 4 && (nodeTitle.includes(title) || title.includes(nodeTitle));
        });
        if (hit) nodeId = String(hit.id);
      }
      if (nodeId) await pool.execute('UPDATE life_daily_tasks SET node_id = ? WHERE id = ?', [nodeId, task.id]);
    }
  }

  // 本轮若调整了每日任务 / 精力负荷 / 外部事件，追加一次增量联动（含当日快照与精力汇总）；
  // 只做 log_change 时不触发，避免与 AI 自己记的变更日志重复
  const touchedModules = new Set(ops.map(op => String(op?.op || '')));
  if (touchedModules.has('upsert_daily') || touchedModules.has('upsert_energy') || touchedModules.has('upsert_event')) {
    await refreshLifeDerived('AI 对话同步', ['每日任务', '进度快照', '精力负荷', '重点提醒', '变更日志'], 'AI 对话调整计划', 'AI 本轮对话调整了任务 / 负荷 / 外部事件');
  }

  // 方案A：本轮 AI 提出的检索需求立刻自动执行一次，把真实网址回填到对应任务与节点，
  // 用户不必再去「检索审批」页签点一遍；单条失败只影响该条，不让整轮同步失败
  if (pendingSearch.length) {
    await autoRunLifeRetrieval(pendingSearch).catch(err => console.warn('[Life检索] 自动执行批次失败：', err.message));
  }
  // 顺手补历史遗留的死占位（旧数据里的「资料名｜搜索关键词」「待检索：…」等不到 AI 再改一次也不会自己变好）
  try {
    const legacy = await collectLegacyResourceIntents(LIFE_LEGACY_SWEEP_LIMIT - Math.min(pendingSearch.length, LIFE_LEGACY_SWEEP_LIMIT));
    if (legacy.length) await autoRunLifeRetrieval(legacy);
  } catch (err) {
    console.warn('[Life检索] 历史占位补齐失败：', err.message);
  }

  // 时间骨架收口：赛道 / 目标按子树补上「开始日期 → 截止日期」，只落在「近期」标签上就等于没排期
  await fillLifeContainerDates().catch(err => console.warn('[life-time] 容器时间收口失败：', err.message));

  return applied;
}

// 获取人生规划节点
app.get('/api/life/plan', async (req, res) => {
  try {
    await ensureLifeSelfNode();
    res.json({ nodes: await listLifeNodes() });
  } catch (err) {
    console.error('获取人生规划失败:', err);
    res.status(500).json({ error: err.message || '获取失败' });
  }
});

// 获取对话记录
app.get('/api/life/chat', async (req, res) => {
  try {
    const [rows] = await pool.query('SELECT id, role, content, created_at FROM life_chat_messages ORDER BY created_at ASC LIMIT 500');
    res.json({ messages: rows.map(r => ({ id: r.id, role: r.role, content: r.content || '', createdAt: Number(r.created_at) || 0 })) });
  } catch (err) {
    console.error('获取规划对话失败:', err);
    res.status(500).json({ error: err.message || '获取失败' });
  }
});

// 结构化模块上下文（库 → 文本）：面板里的执行数据回灌给 AI，保证文本输出与面板一致
async function lifeStructuredContext() {
  const today = todayStr();
  const tasks = await listLifeTasks({ from: lifeDateShift(today, -7), to: lifeDateShift(today, 7) });
  const [snapRows] = await pool.query('SELECT * FROM life_plan_snapshots ORDER BY created_at DESC LIMIT 1');
  const [energyRows] = await pool.query('SELECT * FROM life_energy_logs ORDER BY log_date DESC LIMIT 1');
  const [skillRows] = await pool.query('SELECT * FROM life_skill_profile ORDER BY sort_order ASC');
  const [eventRows] = await pool.query('SELECT * FROM life_calendar_events ORDER BY event_date ASC LIMIT 20');
  const [knowledgeRows] = await pool.query('SELECT * FROM life_knowledge ORDER BY created_at DESC LIMIT 60');
  const stats = await lifeProgressStats();
  const snapshot = snapRows.length ? lifeSnapshotOut(snapRows[0]) : null;
  const energy = energyRows.length ? lifeEnergyOut(energyRows[0]) : null;
  const skills = skillRows.map(lifeSkillOut);
  const events = eventRows.map(lifeEventOut);
  const due = knowledgeRows.map(lifeKnowledgeOut).filter(k => k.nextReviewDate && k.nextReviewDate <= today);
  return [
    '【结构化执行数据（来自前端面板，与下面任务表必须一致，不要编造冲突内容）】',
    `任务进度：共 ${stats.total} 项，已完成 ${stats.counts.done}，进行中 ${stats.counts.doing}，未开始 ${stats.counts.todo}，延期 ${stats.counts.delay}，放弃 ${stats.counts.drop}，完成率 ${stats.progress}%`,
    snapshot ? `最近快照：${snapshot.date} 完成率 ${snapshot.progress}%｜${snapshot.diffNote}` : '最近快照：暂无',
    `每日任务（前后 7 天）：${tasks.length ? tasks.map(t => `${t.date} ${t.priority} ${t.title}（${t.status}${t.estMinutes ? `，${t.estMinutes} 分钟` : ''}${t.preTask ? `，前置：${t.preTask}` : ''}）`).join('；') : '（暂无，需在每日细分任务表中补齐）'}`,
    energy ? `最近精力负荷：${energy.date} 计划 ${energy.plannedMinutes} 分钟 / 上限 ${energy.capacityMinutes} 分钟${energy.overload ? '（超负荷，必须删减次要任务）' : ''}` : '最近精力负荷：暂无',
    `技能档案：${skills.length ? skills.map(s => `${s.category === 'own' ? '已掌握' : s.category === 'learn' ? '待学习' : '短板'}·${s.name}${s.level ? `（${s.level}）` : ''}`).join('；') : '（暂无，需在个人技能档案表中补齐）'}`,
    `外部事件：${events.length ? events.map(e => `${e.date} ${e.title}${e.daysLeft != null ? `（距今 ${e.daysLeft} 天）` : ''}`).join('；') : '（暂无，需在外部事件日历中补齐）'}`,
    `待复习知识点：${due.length ? due.map(k => `${k.topic}（${k.subject}，复习阶段 ${k.reviewStage}）`).join('；') : '（暂无到期的复习任务）'}`
  ].join('\n');
}

// 拼装本轮提问上下文：当前规划节点 + 结构化执行数据 + 此前对话 + 用户最新一句
async function buildLifeUserPrompt(message) {
  const [rows] = await pool.query('SELECT role, content FROM life_chat_messages ORDER BY created_at DESC LIMIT 20');
  const history = rows.reverse();
  const nodes = await listLifeNodes();
  return [
    `【今天】${lifeTodayText()}（所有日期一律以此为准，禁止使用相对天数）`,
    '',
    '【当前规划节点】（detail=可改字段的节点，index=其余节点的标题索引；判重两处都要查）',
    JSON.stringify(lifePlanBrief(nodes)),
    '',
    await lifePersonaContext(),
    '',
    await lifeStructuredContext(),
    '',
    '【此前对话】',
    lifeTranscript(history.slice(0, -1)) || '（暂无）',
    '',
    '【我最新说】',
    message
  ].join('\n');
}

// 文本 → 库：把 AI 本轮回复（或最近对话）交给结构化解析，写入各模块
async function runLifeExtract(historyText) {
  const nodes = await listLifeNodes();
  // 同样补上时间检索：这条路径也不走工具链，涉及考试 / 报名窗口时必须拿真实日期，不能靠模型印象
  const dateContext = await buildLifeDateContext([{ content: historyText }]).catch(() => '');
  const userPrompt = [
    `【今天】${lifeTodayText()}`,
    '',
    dateContext,
    '',
    '【当前规划节点】（detail=可改字段的节点，index=其余节点的标题索引；判重两处都要查）',
    JSON.stringify(lifePlanBrief(nodes)),
    '',
    await lifePersonaContext(),
    '',
    await lifeStructuredContext(),
    '',
    '【最近的对话】',
    historyText,
    '',
    '请输出本轮需要的新增或调整操作。'
  ].join('\n');
  // 提示词加了 few-shot 后更长，45 秒容易超时，放宽到 90 秒并多留出输出空间
  // 输出体量很大（模块2 每日任务逐行提取 + 节点 + 档案/知识/事件/日志），token 给足，
  // 否则 JSON 被截断会导致靠后的任务全部丢失（表现为「规划网络只长出来几个节点」）；
  // 8192 是主流模型都支持的安全上限，再高部分接口会直接报 400
  const raw = await callAI(LIFE_EXTRACT_SYSTEM, userPrompt, null, await resolveLifeModel(), 90000, 8192);
  const parsed = parseLifeJson(raw);
  // 落库后再做一次考试锚点收口：ops 里带不出完整节点数组，只能改库里那几条关键行
  const finish = async count => { await enforceStoredExamAnchors().catch(err => console.warn('[life-anchor] 增量收口失败：', err.message)); return count; };
  if (Array.isArray(parsed?.ops) && parsed.ops.length) return finish(await applyLifeOps(pruneMetaOps(parsed.ops)));
  // JSON 被截断时抢救出完整条目
  const salvaged = salvageJsonObjects(raw);
  if (salvaged && salvaged.some(item => item && (item.op || item.title))) return finish(await applyLifeOps(pruneMetaOps(salvaged)));
  // AI 只回了 Markdown 表格（没带 JSON 块）时兜底解析，否则整轮对话一个字都进不了库
  return finish(await applyLifeOps(planLifeOpsFromMarkdown(raw, nodes)));
}

// 每轮对话结束后自动把回复同步进结构化模块
// 【关键】不能只喂「导师这一条回复」：抽取模型看不到用户本轮说了什么，只能对着自己的话空转，
// 实测多数轮次返回 0 条 op —— 表现就是「对话结束提示正在同步规划，但画布什么都没变，
// 必须手动点『重新生成规划』才有数据」。这里改成喂最近几轮真实对话（本轮用户消息与回复此时都已入库），
// 只对本轮回复放宽长度上限（规划正文常超过 800 字，截断会丢掉后半段的任务与时间）。
async function syncLifePlanFromChat(reply) {
  const text = String(reply || '').trim();
  if (!text) return 0;
  let historyText = `导师：${text.slice(0, 6000)}`;
  try {
    const [rows] = await pool.query('SELECT role, content FROM life_chat_messages ORDER BY created_at DESC LIMIT 8');
    const history = rows.reverse();
    // 历史里每条只留 800 字，取尾部 2000 字即可覆盖本轮的「用户提问 → 导师回复」；
    // 再单独补一条完整的本轮回复，保证规划正文不被截断
    const tail = lifeTranscript(history).slice(-2000);
    historyText = [tail, `导师：${text.slice(0, 6000)}`].filter(Boolean).join('\n');
  } catch (_) { /* 取不到历史就退回单条回复，与改动前表现一致 */ }
  const applied = await runLifeExtract(historyText);
  await purgeRejectedLifeNodes();
  return applied;
}

// 清掉用户标记为「不要了」的节点：每次 AI 更新完规划都执行一遍，
// 保证「我不做」的任务不会因为 AI 重新生成又被加回来
async function purgeRejectedLifeNodes() {
  try {
    const [rows] = await pool.query('SELECT title FROM life_plan_rejects');
    for (const row of rows) {
      const title = String(row.title || '').trim();
      if (title) await pool.execute('DELETE FROM life_plan_nodes WHERE title = ?', [title]);
    }
  } catch (err) {
    console.error('清理已删节点失败:', err.message);
  }
}

// 检索结果转成前端可用的精简结构
function toSearchPayload(search) {
  if (!search) return null;
  return {
    provider: search.provider,
    cached: Boolean(search.cached),
    count: search.results.length,
    query: search.query || '',
    queries: Array.isArray(search.queries) ? search.queries : (search.query ? [search.query] : []),
    sources: search.results.map(item => ({ title: item.title, url: item.url, snippet: item.snippet }))
  };
}

// 单次提问允许的联网检索次数上限；超出上限的检索需求不直接执行，转入待审批队列
const LIFE_CHAT_MAX_SEARCH = 3;

// 合并本轮全部检索结果：多关键词并成一份，URL 去重，供前端展示与最终生成使用
function mergeLifeSearches(items) {
  const list = Array.isArray(items) ? items : [];
  if (!list.length) return null;
  const results = [];
  const seen = new Set();
  let provider = '';
  let allCached = true;
  for (const item of list) {
    const found = item?.search || {};
    if (!provider && found.provider) provider = found.provider;
    if (!found.cached) allCached = false;
    for (const row of (found.results || [])) {
      const url = String(row.url || '');
      if (url && seen.has(url)) continue;
      if (url) seen.add(url);
      results.push(row);
    }
  }
  return {
    provider,
    cached: allCached,
    query: list.map(item => item.query).join(' / '),
    queries: list.map(item => item.query),
    count: results.length,
    results
  };
}

// 对话流水线：判断是否联网 → 按需检索（最多 LIFE_CHAT_MAX_SEARCH 次）→ 生成规划建议
// 检索是按需的：先把最关键的 1~3 个关键词一次提全；拿到结果后模型仍缺资料，可以用新关键词补搜；
// 超过上限的检索需求不直接付费执行，写入待检索队列等人工审批后再回填（复用 queueLifeRetrieval）
// emit(event) 让调用方实时拿到过程事件（阶段 / 思考 / 检索结果）；非流式调用方传空函数即可
async function runLifeChat({ userPrompt, model, userId, mode = 'simple', emit = () => {} }) {
  let searchError = '';
  let reasoning = '';
  const searched = [];
  const usedQueries = new Set();
  const queuedQueries = [];
  // 每轮用户提问重置搜索会话计数：单会话总上限 12 次（命中缓存不计），单轮推理最多连续 3 次
  resetSearchSession(userId);

  // 已用满次数的检索需求统一转入待审批队列，避免静默丢弃
  const queueOverflow = async (query) => {
    usedQueries.add(query);
    queuedQueries.push(query);
    await queueLifeRetrieval({ query, priority: 'P2' }).catch(() => '');
  };

  // 用户在这句话里点名要的东西＝重新要回来：把它从「不要了」清单移除，这样它就能被正常加回
  try {
    const [rejects] = await pool.query('SELECT title FROM life_plan_rejects');
    const wanted = rejects.map(row => String(row.title || '')).filter(t => t && userPrompt.includes(t));
    if (wanted.length) await pool.execute(`DELETE FROM life_plan_rejects WHERE title IN (${wanted.map(() => '?').join(',')})`, wanted);
  } catch (err) {
    console.error('解除已删节点失败:', err.message);
  }

  emit({ type: 'stage', key: 'analyze', label: '正在理解你的问题与规划节点' });
  emit({ type: 'stage', key: 'decide', label: '正在判断是否需要联网检索' });
  // 修改类指令直接改规划，不给检索工具：用户只是在改自己的计划（我不考听力 / 这步不做了 / 改成每周一次），
  // 不需要核实他的决定是否成立。只有他自己明确要查实时信息（含检索类词、报名、政策、官网、价格等）时才允许检索
  const wantsLookup = /查|搜|检索|报名|考试时间|政策|官网|网址|链接|价格|费用|薪资|就业|标准|多少|几天|什么时候/.test(userPrompt);
  const isEditOnly = !wantsLookup && /不(考|学|要|做|用|练|参加|再)|取消|去掉|删[除掉]|改成|改为|换成|调整|放弃|暂停|别再|停止/.test(userPrompt);
  if (isEditOnly) emit({ type: 'stage', key: 'search', status: 'skipped', label: '这是修改规划的指令，直接调整规划网络，不联网检索' });
  try {
    // 每轮都把已拿到的检索结果带上，让模型自己决定「资料够了」还是「换个关键词再搜一次」
    let convoPrompt = userPrompt;
    for (let round = 0; round <= LIFE_CHAT_MAX_SEARCH; round += 1) {
      const turn = await callAIChatWithTools(model, [
        { role: 'system', content: LIFE_CHAT_SYSTEM },
        { role: 'user', content: convoPrompt }
      ], isEditOnly ? undefined : WEB_SEARCH_TOOL, 40000, 800);
      if (turn?.error) throw new Error(turn.error);
      if (turn?.unsupported) {
        searchError = '当前所选模型不支持工具调用，本次未联网检索';
        emit({ type: 'stage', key: 'search', status: 'failed', label: searchError });
        break;
      }
      // 推理模型返回的思考内容，有则展示
      const thought = String(turn?.message?.reasoning_content || '').trim();
      if (thought && !reasoning) {
        reasoning = thought;
        emit({ type: 'thinking', text: thought });
      }
      const calls = Array.isArray(turn?.message?.tool_calls) ? turn.message.tool_calls : [];
      const asked = [];
      for (const call of calls) {
        let query = '';
        try { query = String(JSON.parse(call?.function?.arguments || '{}')?.q || '').trim(); } catch (_) { query = ''; }
        if (query && !asked.includes(query)) asked.push(query);
      }
      // 模型不再要求检索：资料够了，交给生成阶段
      if (!asked.length) {
        if (!round) emit({ type: 'stage', key: 'search', status: 'skipped', label: '本次问题不需要联网，直接作答' });
        break;
      }
      // 已用满上限：剩余关键词全部转审批队列，本轮到此为止
      if (searched.length >= LIFE_CHAT_MAX_SEARCH) {
        for (const query of asked) if (!usedQueries.has(query)) await queueOverflow(query);
        break;
      }
      // 过滤掉已经检索过的关键词，避免同一关键词反复付费检索
      const fresh = asked.filter(query => !usedQueries.has(query));
      if (!fresh.length) break;
      const allow = fresh.slice(0, LIFE_CHAT_MAX_SEARCH - searched.length);
      const overflow = fresh.slice(allow.length);
      for (const query of allow) {
        usedQueries.add(query);
        emit({ type: 'stage', key: 'searching', label: `正在联网检索：${query}`, query });
        const found = await webSearch(query, { userId, getSecret: getUserSecret });
        searched.push({ query, search: found });
        emit({
          type: 'search',
          query,
          provider: found.provider,
          cached: Boolean(found.cached),
          count: found.results.length,
          sources: found.results.map(item => ({ title: item.title, url: item.url, snippet: item.snippet }))
        });
      }
      for (const query of overflow) if (!usedQueries.has(query)) await queueOverflow(query);
      // 回灌结果 + 已检索关键词清单，下一轮由模型决定是否补搜新关键词
      const merged = mergeLifeSearches(searched);
      convoPrompt = `${userPrompt}\n\n${formatSearchContext(merged)}\n\n【已检索过的关键词（禁止重复检索，需要补充资料请换新关键词）】${[...usedQueries].join('；')}`;
      if (searched.length >= LIFE_CHAT_MAX_SEARCH) break;
    }
    if (queuedQueries.length) {
      emit({
        type: 'stage',
        key: 'search',
        status: 'queued',
        label: `另有 ${queuedQueries.length} 条检索需求已超出本轮 ${LIFE_CHAT_MAX_SEARCH} 次上限，已转入待审批队列，不影响本次作答`
      });
    }
  } catch (err) {
    searchError = err.message || '联网检索失败';
    emit({ type: 'stage', key: 'search', status: 'failed', label: searchError });
  }

  const search = mergeLifeSearches(searched);
  emit({ type: 'stage', key: 'compose', label: search ? '正在整合检索资料，生成规划建议' : '正在生成规划建议' });
  const finalPrompt = search ? `${userPrompt}\n\n${formatSearchContext(search)}` : userPrompt;
  const reply = await callAI(buildLifeChatSystem(mode), finalPrompt, null, model, 60000, 2000);
  return { reply, search, searchError, reasoning, queuedSearch: queuedQueries, editOnly: isEditOnly };
}

// 发送一条消息，AI 回复（一次性返回，不展示过程）
app.post('/api/life/chat', async (req, res) => {
  try {
    const message = lifeText(req.body?.message, 2000);
    if (!message) return res.status(400).json({ error: '内容不能为空' });
    const mode = resolveLifeMode(req.body?.mode, message, await countLifeChatMessages());
    await pool.execute('INSERT INTO life_chat_messages (id, role, content, created_at) VALUES (?, ?, ?, ?)', [crypto.randomUUID(), 'user', message, Date.now()]);
    const userPrompt = await buildLifeUserPrompt(message);
    const model = await resolveLifeModel();
    const userId = context.getStore()?.user?.id || '';
    const result = await runLifeChat({ userPrompt, model, userId, mode });
    await pool.execute('INSERT INTO life_chat_messages (id, role, content, created_at) VALUES (?, ?, ?, ?)', [crypto.randomUUID(), 'assistant', result.reply, Date.now()]);
    await syncLifePlanFromChat(result.reply);
    res.json({ reply: result.reply, search: toSearchPayload(result.search), searchError: result.searchError, queuedSearch: Array.isArray(result.queuedSearch) ? result.queuedSearch : [] });
  } catch (err) {
    console.error('人生规划对话失败:', err);
    res.status(500).json({ error: err.message || 'AI 暂时不可用' });
  }
});

// 发送一条消息，流式返回过程：阶段进度、模型思考、检索关键词与检索到的资料（NDJSON，一行一个事件）
app.post('/api/life/chat/stream', async (req, res) => {
  let streaming = false;
  // 用户中途关闭页面时不再往已断开的连接写数据，避免未捕获的 socket 错误
  let clientGone = false;
  let emit = () => {};
  try {
    const message = lifeText(req.body?.message, 2000);
    if (!message) return res.status(400).json({ error: '内容不能为空' });
    const mode = resolveLifeMode(req.body?.mode, message, await countLifeChatMessages());
    await pool.execute('INSERT INTO life_chat_messages (id, role, content, created_at) VALUES (?, ?, ?, ?)', [crypto.randomUUID(), 'user', message, Date.now()]);
    const userPrompt = await buildLifeUserPrompt(message);
    const model = await resolveLifeModel();
    const userId = context.getStore()?.user?.id || '';

    res.setHeader('Content-Type', 'application/x-ndjson; charset=utf-8');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('X-Accel-Buffering', 'no');
    res.flushHeaders();
    streaming = true;
    req.on('close', () => { clientGone = true; });
    emit = (event) => {
      if (clientGone) return;
      try { res.write(`${JSON.stringify(event)}\n`); } catch (_) { clientGone = true; }
    };

    const result = await runLifeChat({ userPrompt, model, userId, mode, emit });
    await pool.execute('INSERT INTO life_chat_messages (id, role, content, created_at) VALUES (?, ?, ?, ?)', [crypto.randomUUID(), 'assistant', result.reply, Date.now()]);
    emit({
      type: 'done',
      reply: result.reply,
      search: toSearchPayload(result.search),
      searchError: result.searchError,
      reasoning: result.reasoning,
      queuedSearch: Array.isArray(result.queuedSearch) ? result.queuedSearch : [],
      editOnly: !!result.editOnly
    });
    // 文本 → 库：本轮回复自动同步进结构化模块。
    // 这一步耗时较长（最多 90 秒），所以不提前断开连接：同步完成后再推一个 plan 事件，
    // 前端收到后才刷新画布，避免「刷新太早、看不到规划变化」。
    if (!clientGone) emit({ type: 'stage', key: 'sync', label: '正在把本轮回复同步进规划网络' });
    let applied = 0;
    try { applied = await syncLifePlanFromChat(result.reply); }
    catch (err) { console.error('文本同步规划失败:', err.message); }
    emit({ type: 'plan', applied });
    if (!clientGone) res.end();
  } catch (err) {
    console.error('人生规划对话失败:', err);
    if (streaming) {
      emit({ type: 'error', error: err.message || 'AI 暂时不可用' });
      if (!clientGone) res.end();
    } else {
      res.status(500).json({ error: err.message || 'AI 暂时不可用' });
    }
  }
});

// 根据最近对话增量更新规划节点
app.post('/api/life/plan/extract', async (req, res) => {
  try {
    const [rows] = await pool.query('SELECT role, content FROM life_chat_messages ORDER BY created_at DESC LIMIT 10');
    const history = rows.reverse();
    if (!history.length) return res.json({ nodes: await listLifeNodes(), applied: 0 });

    const applied = await runLifeExtract(lifeTranscript(history));
    res.json({ nodes: await listLifeNodes(), applied });
  } catch (err) {
    console.error('人生规划增量更新失败:', err);
    res.status(500).json({ error: err.message || '更新失败' });
  }
});

// 基于全部对话重新生成完整规划
app.post('/api/life/plan/regenerate', async (req, res) => {
  try {
    const [rows] = await pool.query('SELECT role, content FROM life_chat_messages ORDER BY created_at ASC LIMIT 200');
    if (!rows.length) return res.status(400).json({ error: '还没有对话内容，无法生成规划' });

    const model = await resolveLifeModel();
    // 只喂最近对话，并把超时放宽到 3 分钟；否则历史一长 AI 直接超时（报 operation aborted）
    // 同时带上「当前已有节点」清单：让 AI 沿用同名标题，做到只增改删、不整体重写（避免措辞一换就重复建节点）
    // 只喂「最近的」节点清单：节点攒到几百个时，全量塞进提示词会把上下文撑爆、AI 直接超时。
    // 取最近 120 个（按创建时间倒序，再翻回正序展示），已经足够让 AI 沿用同名标题做增改，
    // 本轮没出现的旧节点交给下面的「清理作废节点」统一收尾，所以总量不会越滚越大。
    const [recentNodes] = await pool.query('SELECT id, kind, series, title FROM life_plan_nodes ORDER BY created_at DESC LIMIT 120');
    const existingNodes = recentNodes.reverse();
    // 节点攒多了不能只喂最近 120 个：模型看不到的那部分会被当成「本轮没输出」而在下面被清理掉。
    // 所以除了 120 个明细，再把其余节点的标题压成一份索引一起喂进去（只要标题，很便宜），
    // 判重和「沿用同名标题」都靠它；同时记下节点总数，用不完备的清单绝不允许触发兜底清理。
    const [allTitleRows] = await pool.query('SELECT id, title FROM life_plan_nodes ORDER BY created_at ASC');
    const shownIds = new Set(existingNodes.map(n => String(n.id)));
    const restTitles = allTitleRows.filter(row => !shownIds.has(String(row.id))).map(row => row.title).filter(Boolean);
    const fullyFed = allTitleRows.length <= existingNodes.length;
    // 【关键修复】这条路径以前完全没联网：callAI 的 tools 传的是 null，也没做任何检索，
    // 所以国考这类「有官方时间窗口」的赛道拿不到真实日期，模型只能编或干脆留空。
    // 这里在生成前先按对话里出现的目标做一次定向检索，把真实日期作为权威事实喂给模型，
    // 并在提示词里声明「以检索结果为准，与自己印象冲突时用检索结果」。
    const searchContext = await buildLifeDateContext(rows);
    const existingBlock = existingNodes.length
      ? [
          `【当前已有节点明细（共 ${allTitleRows.length} 个，这里给出最近 ${existingNodes.length} 个的完整信息；同一件事必须原样沿用这里的标题，只有全新内容才新建）】`,
          existingNodes.map(n => `${n.id}｜${n.kind}｜${n.series || '无主线'}｜${n.title}`).join('\n'),
          restTitles.length
            ? `【其余已有节点的标题索引（${restTitles.length} 条，同样禁止重复新建；要改就沿用同名标题）】\n${restTitles.join(' / ')}`
            : ''
        ].filter(Boolean).join('\n')
      : '';
    const userPrompt = [existingBlock, searchContext, '【最近对话】', recentLifeTranscript(rows)].filter(Boolean).join('\n');
    // 三段兜底：正常 JSON → 抢救被截断的 JSON → Markdown 表格；输出上限放宽到 8000 token 减少截断
    const readPlan = text => {
      const parsed = parseLifeJson(text);
      // 输出分两部分：①自然语言规划解读(summary) ②结构化节点数组(nodes)
      // complete=true 只在这一轮拿到完整 JSON 时成立：此时 nodes 才是「这一版规划的全集」，
      // 没出现在里面的旧节点才算作废，可以安全清理；截断/兜底解析出来的残缺列表不算全集，绝不能据此删节点
      if (Array.isArray(parsed?.nodes) && parsed.nodes.length) {
        // examAnchors 是模型从联网检索结果里整理出的考试硬时间点（考试日 / 准考证窗口 / 官方入口），
        // 后端据此钉死备考截止日期并补准考证与双向结局节点，不再完全依赖模型自觉
        const anchors = Array.isArray(parsed.examAnchors) ? parsed.examAnchors : [];
        return { nodes: parsed.nodes, anchors, summary: String(parsed.summary || parsed.reading || parsed.解读 || ''), complete: true };
      }
      // JSON 被 token 上限截断时 nodes 数组断在中途，但排在最前面的 summary 仍完整，正则抠出来
      const salvaged = salvageJsonObjects(text);
      if (salvaged && salvaged.some(item => item && item.title)) return { nodes: salvaged, summary: extractLifeSummary(text), complete: false };
      const fromMd = planLifeNodesFromMarkdown(text);
      return Array.isArray(fromMd?.nodes) && fromMd.nodes.length ? { nodes: fromMd.nodes, summary: extractLifeSummary(text), complete: false } : null;
    };

    // 8192 是主流模型都支持的安全上限（再高部分接口直接 400），所以这里不靠「加大 token」，
    // 而是靠下面那次「精简重出」——把每条文字压短，让完整的四层结构塞进同一个上限里
    let raw = await callAI(LIFE_REGENERATE_SYSTEM, userPrompt, null, model, 180000, 8192);
    let result = readPlan(raw);
    // 输出被 token 上限截断时只会抢救出数组的前缀（例如首轮只留下 4 个节点），层级并不完整。
    // 这时补一次「精简重出」：把每条文字压短，换取一份完整的层级；两次里节点更多的那次胜出，
    // 避免为了排版好看反而丢掉内容。complete=true 的那次同时决定了能不能清理作废节点。
    if (result && !result.complete) {
      try {
        const compactRaw = await callAI(
          LIFE_REGENERATE_SYSTEM,
          `${userPrompt}\n\n【输出上限提醒】每个节点的 detail 压到 60 字以内、risk 压到 20 字以内，优先保证「大脑→赛道→计划→动作」四层完整、所有赛道都出现、节点总数不少于 24 个，只输出 JSON。`,
          null, model, 180000, 8192
        );
        const compact = readPlan(compactRaw);
        if (compact && (compact.complete || compact.nodes.length > result.nodes.length)) result = compact;
      } catch (_) { /* 精简重出失败就沿用第一次抢救出来的结果 */ }
    }
    // 仍失败时补一次「只要 JSON」的修复重试，抗住模型偶发的不守格式
    if (!result) {
      raw = await callAI(
        '你只输出 JSON，不要任何解释文字、不要 Markdown 代码块、不要表格。',
        `${userPrompt}\n\n请严格按系统提示里的 nodes 数组结构，只输出一个 JSON 对象。`,
        null,
        model,
        180000,
        8192
      );
      result = readPlan(raw);
    }
    if (!result) {
      console.warn('[life-regen] 未能解析 AI 输出，原文前 500 字:', String(raw || '').slice(0, 500));
      return res.status(502).json({ error: 'AI 未返回有效的规划结构，请稍后重试' });
    }

    // 增量更新：同名节点就地更新、缺失节点才新增，全程不清空整张图；
    // 这样用户在图上手动调整过的位置/状态与已有父子链都不会被一次重写冲掉。
    const [existingRows] = await pool.query("SELECT id, title FROM life_plan_nodes WHERE source = 'ai'");
    const byTitle = new Map();
    // 用归一化标题做键，避免 AI 每轮措辞微调就重复建出同名节点
    for (const row of existingRows) {
      const key = lifeTitleKey(row.title);
      if (key && !byTitle.has(key)) byTitle.set(key, String(row.id));
    }
    // 「大脑」中心节点的 id：兜底把漏挂父节点的节点收回它下面，保证单根结构
    const [selfNodes] = await pool.query("SELECT id, title FROM life_plan_nodes WHERE kind = 'self' ORDER BY created_at ASC LIMIT 1");
    const selfId = selfNodes.length ? String(selfNodes[0].id) : '';
    // 大脑的显示名沿用库里已有的那个（默认「我的人生画像」），不被模型每轮改称呼带着跑
    const selfTitle = selfNodes.length ? String(selfNodes[0].title || '') : '';

    const now = Date.now();
    // 落库前先按日期把时序分组纠一遍，避免「一个月后就考试」的赛道被模型标成中期 / 远期
    // 顺序很关键：① 先剔除「让用户自己去推」的元规划任务（要看下标重映射，必须在裁之前做）
    //             ② 再按 80 个上限裁剪 ③ 最后注入锚点类节点（准考证 / 双向结局），
    //           反过来做的话，注入的节点会被上限截掉，等于没补
    const pruned = normalizeLifeTimeGroups(pruneLifeMetaTasks(result.nodes));
    const list = pruned.slice(0, 80);
    if (pruned.length > list.length) console.warn(`[life-regen] 模型输出 ${pruned.length} 个节点，超出 80 个落地上限，本次只写前 80 个，其余旧节点保持原样不动`);
    const anchorReport = await injectLifeExamAnchors(list, `${rows.map(r => r.content).join('\n')}\n${userPrompt}`, result.anchors)
      .catch(err => { console.warn('[life-anchor] 锚点收口失败：', err.message); return null; });
    if (anchorReport?.anchors?.length) console.log(`[life-anchor] 本次锚点：${anchorReport.anchors.join(' / ')}（前移 ${anchorReport.shifted} / 撞车自纠 ${anchorReport.selfShifted}，准考证 ${anchorReport.tickets}，结局 ${anchorReport.outcomes}，链接实测 ${anchorReport.checked}/失效 ${anchorReport.dropped}）`);
    const idList = [];
    let inserted = 0;
    let updated = 0;
    for (let i = 0; i < list.length; i++) {
      const item = list[i] || {};
      const title = lifeText(item.title, 200);
      if (!title) { idList.push(''); continue; }
      const givenType = String(item.contentType || item.content_type || '').trim().toLowerCase();
      // 「大脑」只有一个：模型某轮把中心节点改叫「我」，按标题匹配会再插一个新大脑，图上散出两个根。
      // 这里强制 self 类型一律复用已有那个大脑节点，只更新它的字段。
      const isSelfItem = String(item.kind || '').trim() === 'self';
      const cols = [
        LIFE_KINDS.includes(item.kind) ? item.kind : 'goal',
        LIFE_DOMAINS.includes(item.domain) ? item.domain : '成长',
        isSelfItem && selfTitle ? selfTitle : title,
        lifeText(item.detail, 1200), lifeText(item.risk, 200),
        LIFE_TASK_PRIORITY.includes(item.priority) ? item.priority : '',
        lifeText(item.series, 64),
        ['todo', 'doing', 'done'].includes(item.status) ? item.status : 'todo',
        lifeText(item.horizon, 32), lifeClampWeight(item.weight),
        LIFE_TIME_GROUPS.includes(item.timeGroup) ? item.timeGroup : '',
        Math.max(0, Math.min(999, Math.round(Number(item.stepNo) || 0))),
        LIFE_CONTENT_TYPES.includes(givenType) ? givenType : '',
        item.contentBody || item.content_body
          ? (typeof (item.contentBody || item.content_body) === 'string' ? String(item.contentBody || item.content_body) : JSON.stringify(item.contentBody || item.content_body))
          : '',
        // 开始日期：与截止日期（horizon）分开存，AI 有明确开始日时才给
        lifeText(item.startDate || item.start_date, 10),
        item.shared === true || item.isShared === true ? 1 : 0
      ];
      const reuse = isSelfItem && selfId ? selfId : byTitle.get(lifeTitleKey(title));
      if (reuse) {
        await pool.execute(
          'UPDATE life_plan_nodes SET kind = ?, domain = ?, title = ?, detail = ?, risk = ?, priority = ?, series = ?, status = IF(status IN (\'done\', \'doing\'), status, ?), horizon = ?, weight = ?, time_group = ?, step_no = ?, content_type = ?, content_body = ?, start_date = IF(? = \'\', start_date, ?), is_shared = ?, updated_at = ? WHERE id = ?',
          [...cols.slice(0, 14), cols[14], cols[14], cols[15], now, reuse]
        );
        idList.push(reuse);
        updated += 1;
        continue;
      }
      const id = crypto.randomUUID();
      await pool.execute(
        'INSERT INTO life_plan_nodes (id, parent_id, kind, domain, title, detail, risk, priority, series, status, horizon, weight, time_group, step_no, content_type, content_body, start_date, is_shared, source, sort_order, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
        [id, '', ...cols, 'ai', inserted, now, now]
      );
      byTitle.set(lifeTitleKey(title), id);
      idList.push(id);
      inserted += 1;
    }
    for (let i = 0; i < list.length; i++) {
      const ref = list[i]?.parentRef;
      if (ref === null || ref === undefined || ref === '') continue;
      const parentIndex = Number(ref);
      if (!Number.isInteger(parentIndex) || parentIndex < 0 || parentIndex >= idList.length || parentIndex === i) continue;
      await pool.execute('UPDATE life_plan_nodes SET parent_id = ? WHERE id = ?', [idList[parentIndex], idList[i]]);
    }
    // 兜底：非「大脑」节点不能成为顶层根，parent_id 为空的统一挂到「大脑」下面；
    // 保证「大脑 → 赛道 → 计划 → 动作」的单根结构，AI 漏填 parentRef 时也不会散出多个并列根
    if (selfId) {
      await pool.execute("UPDATE life_plan_nodes SET parent_id = ? WHERE kind <> 'self' AND (parent_id IS NULL OR parent_id = '')", [selfId]);
    }
    // depsRef 用下标引用本轮其他节点，插入完成后统一换算成真实 id
    for (let i = 0; i < list.length; i++) {
      const refs = Array.isArray(list[i]?.depsRef) ? list[i].depsRef : [];
      const deps = refs
        .map(ref => Number(ref))
        .filter(index => Number.isInteger(index) && index >= 0 && index < idList.length && index !== i)
        .map(index => idList[index]);
      if (deps.length) await pool.execute('UPDATE life_plan_nodes SET deps = ? WHERE id = ?', [JSON.stringify([...new Set(deps)]), idList[i]]);
    }
    // referenceRef 同样用下标引用本轮节点，换算成真实 id 写入横向关联，剔除悬空引用
    for (let i = 0; i < list.length; i++) {
      if (!idList[i]) continue;
      const refs = Array.isArray(list[i]?.referenceRef) ? list[i].referenceRef : [];
      const linked = refs
        .map(ref => Number(ref))
        .filter(index => Number.isInteger(index) && index >= 0 && index < idList.length && index !== i && idList[index])
        .map(index => idList[index]);
      if (linked.length) await pool.execute('UPDATE life_plan_nodes SET reference_ids = ? WHERE id = ?', [JSON.stringify([...new Set(linked)]), idList[i]]);
    }

    // ===== 清理作废节点：兑现系统提示里「作废的节点通过减少对应条目来删除」的约定 =====
    // 之前这里只做「同名就地更新 + 缺失才新增」，AI 这轮不再输出的旧节点会一直赖在图上，
    // 于是「重新规划」之后新旧两版规划混在一起（用户看到的「跟这四个也没多大关系」就是这么来的）。
    // 只有三个条件同时满足才清理，避免误删：① 这一轮拿到完整全集 ② 数量正常 ③ 已有节点全都喂给过模型
    //   —— 节点超过 120 个时模型没见过全部节点，它「没输出」只代表没看到，不代表作废。
    let removed = 0;
    if (result.complete && list.length >= 12 && fullyFed) {
      const keep = new Set(list.map(item => lifeTitleKey(lifeText(item.title, 200))).filter(Boolean));
      const [candidates] = await pool.query('SELECT id, title, status, source, kind FROM life_plan_nodes');
      for (const row of candidates) {
        if (String(row.kind) === 'self') continue                          // 「大脑」常驻，永远不删
        if (String(row.source) !== 'ai') continue                          // 用户手动建的节点不动
        if (['done', 'doing'].includes(String(row.status))) continue       // 已经做起来 / 做完的，保住进度
        const key = lifeTitleKey(row.title)
        if (!key || keep.has(key)) continue                                // 这一轮还在输出 → 保留
        await pool.execute('DELETE FROM life_plan_nodes WHERE id = ?', [row.id])
        removed += 1
      }
      if (removed) console.log(`[life-regen] 本轮清理作废节点 ${removed} 个（未出现在新一版规划里）`)
    } else if (result.complete && !fullyFed) {
      console.log(`[life-regen] 已有节点 ${allTitleRows.length} 个、本次只喂了 ${existingNodes.length} 个，跳过作废清理（避免误删模型没看到的节点）`)
    }

    // 时间骨架收口：赛道 / 目标这类容器节点按子树补上「开始日期 → 截止日期」，
    // 画布才能显示时间区间；否则用户看到的只是一堆「近期」标签，不知道什么时候开始、什么时候结束
    const datedNodes = await fillLifeContainerDates().catch(err => { console.warn('[life-time] 容器时间收口失败：', err.message); return 0; });
    if (datedNodes) console.log(`[life-time] 本轮为 ${datedNodes} 个节点补齐了起止日期`);

    // 输出两部分：①自然语言规划解读 落进对话流，用户刷新后在会话里能看到本次解读
    if (result.summary) {
      await pool.execute('INSERT INTO life_chat_messages (id, role, content, created_at) VALUES (?, ?, ?, ?)',
        [crypto.randomUUID(), 'assistant', `【规划解读】${result.summary}`, Date.now()]);
    }
    res.json({ nodes: await listLifeNodes(), summary: result.summary || '', inserted, updated, removed, anchors: anchorReport });
    // 规划一变，人物画像就跟着重算（动态画像的输入就是右侧这份规划的完成度）。
    // 这里刻意放在 res.json 之后异步跑：画像推理要几十秒，不能让用户干等这一轮规划返回
    deriveLifePersona('规划重生成').catch(err => console.warn('[life-persona] 重生成后重算画像失败：', err.message));
  } catch (err) {
    console.error('重新生成人生规划失败:', err);
    res.status(500).json({ error: err.message || '生成失败' });
  }
});

// 新增规划节点（手动维护）
app.post('/api/life/plan/nodes', async (req, res) => {
  try {
    const body = req.body || {};
    const title = lifeText(body.title, 200);
    if (!title) return res.status(400).json({ error: '节点标题不能为空' });
    // 手动新增＝用户明确要它：从「不要了」清单里移除，否则之后会被自动清理掉
    await pool.execute('DELETE FROM life_plan_rejects WHERE title = ?', [title]).catch(() => '');
    const id = crypto.randomUUID();
    const now = Date.now();
    const givenType = String(body.contentType || body.content_type || '').trim().toLowerCase();
    const contentBody = body.contentBody || body.content_body
      ? (typeof (body.contentBody || body.content_body) === 'string' ? String(body.contentBody || body.content_body) : JSON.stringify(body.contentBody || body.content_body))
      : '';
    const kind = LIFE_KINDS.includes(body.kind) ? body.kind : 'goal';
    // 新增的赛道 / 计划 / 动作必须有父节点：没指定就默认挂到「大脑」下面，避免散出并列根
    let parentId = lifeText(body.parentId, 64);
    if (kind !== 'self' && !parentId) {
      const [selfNodes] = await pool.query("SELECT id FROM life_plan_nodes WHERE kind = 'self' ORDER BY created_at ASC LIMIT 1");
      if (selfNodes.length) parentId = String(selfNodes[0].id);
    }
    await pool.execute(
      'INSERT INTO life_plan_nodes (id, parent_id, kind, domain, title, detail, risk, status, horizon, start_date, weight, content_type, content_body, progress_note, reference_ids, is_shared, source, sort_order, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
      [
        id, kind === 'self' ? '' : parentId, kind,
        LIFE_DOMAINS.includes(body.domain) ? body.domain : '成长', title, lifeText(body.detail, 1200), lifeText(body.risk, 200),
        ['todo', 'doing', 'done', 'drop'].includes(body.status) ? body.status : 'todo',
        lifeText(body.horizon, 32), lifeText(body.startDate, 10), lifeClampWeight(body.weight),
        LIFE_CONTENT_TYPES.includes(givenType) ? givenType : '', contentBody, lifeText(body.progressNote, 1200),
        JSON.stringify(Array.isArray(body.referenceIds) ? body.referenceIds.map(String).filter(Boolean) : []),
        body.shared ? 1 : 0,
        'user', Number(body.sortOrder) || 0, now, now
      ]
    );
    res.json({ nodes: await listLifeNodes() });
  } catch (err) {
    console.error('新增规划节点失败:', err);
    res.status(500).json({ error: err.message || '新增失败' });
  }
});

// 更新规划节点（手动维护）
app.put('/api/life/plan/nodes/:id', async (req, res) => {
  try {
    const body = req.body || {};
    const fields = [];
    const values = [];
    if (body.title !== undefined) { fields.push('title = ?'); values.push(lifeText(body.title, 200)); }
    if (body.detail !== undefined) { fields.push('detail = ?'); values.push(lifeText(body.detail, 1200)); }
    if (body.risk !== undefined) { fields.push('risk = ?'); values.push(lifeText(body.risk, 200)); }
    if (body.horizon !== undefined) { fields.push('horizon = ?'); values.push(lifeText(body.horizon, 32)); }
    // 开始日期：与截止日期分开字段，用户可各自修改
    if (body.startDate !== undefined) { fields.push('start_date = ?'); values.push(lifeText(body.startDate, 10)); }
    if (body.weight !== undefined) { fields.push('weight = ?'); values.push(lifeClampWeight(body.weight)); }
    if (body.status !== undefined && ['todo', 'doing', 'done', 'drop'].includes(body.status)) { fields.push('status = ?'); values.push(body.status); }
    if (body.domain !== undefined && LIFE_DOMAINS.includes(body.domain)) { fields.push('domain = ?'); values.push(body.domain); }
    if (body.kind !== undefined && LIFE_KINDS.includes(body.kind)) {
      // 「大脑」中心节点（kind=self）必须常驻：不允许把它改成别的类型，否则根节点会消失
      const [selfRows] = await pool.query("SELECT id FROM life_plan_nodes WHERE id = ? AND kind = 'self' LIMIT 1", [String(req.params.id)]);
      if (!selfRows.length || body.kind === 'self') { fields.push('kind = ?'); values.push(body.kind); }
    }
    if (body.parentId !== undefined) { fields.push('parent_id = ?'); values.push(lifeText(body.parentId, 64)); }
    if (body.series !== undefined) { fields.push('series = ?'); values.push(lifeText(body.series, 64)); }
    if (body.priority !== undefined) { fields.push('priority = ?'); values.push(LIFE_TASK_PRIORITY.includes(body.priority) ? body.priority : ''); }
    if (body.stepNo !== undefined) { fields.push('step_no = ?'); values.push(Math.max(0, Math.min(999, Math.round(Number(body.stepNo) || 0)))); }
    if (body.timeGroup !== undefined && LIFE_TIME_GROUPS.includes(body.timeGroup)) { fields.push('time_group = ?'); values.push(body.timeGroup); }
    if (body.contentType !== undefined) {
      const type = String(body.contentType || '').trim().toLowerCase();
      fields.push('content_type = ?'); values.push(LIFE_CONTENT_TYPES.includes(type) ? type : '');
    }
    if (body.contentBody !== undefined) {
      fields.push('content_body = ?');
      values.push(body.contentBody ? (typeof body.contentBody === 'string' ? body.contentBody : JSON.stringify(body.contentBody)) : '');
    }
    // 部分完成：用户写下「哪些做完了、哪些还没做」，作为刻画大脑的依据
    if (body.progressNote !== undefined) { fields.push('progress_note = ?'); values.push(lifeText(body.progressNote, 1200)); }
    if (body.referenceIds !== undefined) {
      fields.push('reference_ids = ?');
      values.push(JSON.stringify(Array.isArray(body.referenceIds) ? body.referenceIds.map(String).filter(Boolean) : []));
    }
    if (body.shared !== undefined) { fields.push('is_shared = ?'); values.push(body.shared ? 1 : 0); }
    if (!fields.length) return res.json({ nodes: await listLifeNodes() });
    fields.push('updated_at = ?');
    values.push(Date.now(), req.params.id);
    await pool.execute(`UPDATE life_plan_nodes SET ${fields.join(', ')} WHERE id = ?`, values);
    // 任务类节点状态与「每日任务」板块双向同步：在思维导图里勾完成/放弃，对应每日任务也同步，
    // 反过来在每日任务面板打卡也会回写节点状态（见 /api/life/tasks/:id/state）
    if (body.status !== undefined && ['todo', 'doing', 'done', 'drop'].includes(body.status)) {
      const taskStatus = body.status === 'drop' ? 'drop' : body.status;
      await pool.execute('UPDATE life_daily_tasks SET status = ?, updated_at = ? WHERE node_id = ?', [taskStatus, Date.now(), String(req.params.id)]);
    }
    res.json({ nodes: await listLifeNodes() });
  } catch (err) {
    console.error('更新规划节点失败:', err);
    res.status(500).json({ error: err.message || '更新失败' });
  }
});

// 删除规划节点（同时清理指向它的子节点关联）
// 关键：删掉的节点与它的全部后代标题都记进「不要了」清单 —— 用户点一下减号就是「我不做」，
// 后续 AI 更新规划时不能再把它自动加回来；只有用户明确点名要它、或手动再新增，才会重新出现
app.delete('/api/life/plan/nodes/:id', async (req, res) => {
  try {
    const id = String(req.params.id || '');
    // 「大脑」中心节点（kind=self）必须常驻：它是整张规划网络的起点锚，不允许被删掉
    const [selfRows] = await pool.query("SELECT id FROM life_plan_nodes WHERE id = ? AND kind = 'self' LIMIT 1", [id]);
    if (selfRows.length) return res.status(400).json({ error: '「大脑」根节点不能删除，它是整张规划网络的起点' });
    const all = await listLifeNodes();
    const kids = new Map();
    for (const node of all) {
      const pid = String(node.parentId || '');
      if (!kids.has(pid)) kids.set(pid, []);
      kids.get(pid).push(node);
    }
    const doomed = [];
    const queue = all.filter(node => String(node.id) === id);
    while (queue.length) {
      const node = queue.shift();
      doomed.push(node);
      queue.push(...(kids.get(String(node.id)) || []));
    }
    const now = Date.now();
    for (const node of doomed) {
      const title = String(node.title || '').trim();
      if (!title) continue;
      await pool.execute(
        'INSERT INTO life_plan_rejects (title, kind, created_at) VALUES (?, ?, ?) ON DUPLICATE KEY UPDATE created_at = VALUES(created_at)',
        [title.slice(0, 200), String(node.kind || '').slice(0, 32), now]
      ).catch(() => '');
    }
    await pool.execute('DELETE FROM life_plan_nodes WHERE id = ?', [id]);
    await pool.execute('UPDATE life_plan_nodes SET parent_id = ? WHERE parent_id = ?', ['', id]);
    res.json({ nodes: await listLifeNodes(), rejected: doomed.map(node => String(node.title || '')).filter(Boolean) });
  } catch (err) {
    console.error('删除规划节点失败:', err);
    res.status(500).json({ error: err.message || '删除失败' });
  }
});

// 一键清除：把规划网络相关数据全部清掉（做测试用），个人档案 life_skill_profile 与对话记录保留
app.delete('/api/life/plan', async (req, res) => {
  try {
    // 保留「大脑」中心节点（kind=self）：它是整张规划网络的起点锚，清除规划数据时也必须留下
    await pool.execute("DELETE FROM life_plan_nodes WHERE kind <> 'self'").catch(() => '');
    const tables = [
      'life_daily_tasks',
      'life_plan_snapshots',
      'life_energy_logs',
      'life_calendar_events',
      'life_change_logs',
      'life_plan_rejects'
    ];
    for (const table of tables) await pool.execute(`DELETE FROM ${table}`).catch(() => '');
    await ensureLifeSelfNode();
    res.json({ ok: true, nodes: await listLifeNodes() });
  } catch (err) {
    console.error('清空人生规划失败:', err);
    res.status(500).json({ error: err.message || '清空失败' });
  }
});

// 「不要了」清单：查看 / 加回（加回＝从清单移除，之后 AI 可以重新生成它）
app.get('/api/life/plan/rejects', async (req, res) => {
  try {
    const [rows] = await pool.query('SELECT title, kind, created_at FROM life_plan_rejects ORDER BY created_at DESC');
    res.json({ items: rows.map(row => ({ title: row.title, kind: row.kind, createdAt: Number(row.created_at) || 0 })) });
  } catch (err) {
    res.status(500).json({ error: err.message || '读取失败' });
  }
});
app.delete('/api/life/plan/rejects', async (req, res) => {
  try {
    const title = lifeText(req.body?.title, 200);
    if (title) await pool.execute('DELETE FROM life_plan_rejects WHERE title = ?', [title]);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message || '加回失败' });
  }
});

// 清空对话记录
app.delete('/api/life/chat', async (req, res) => {
  try {
    await pool.execute('DELETE FROM life_chat_messages');
    res.json({ ok: true });
  } catch (err) {
    console.error('清空规划对话失败:', err);
    res.status(500).json({ error: err.message || '清空失败' });
  }
});

// 彻底重置人生规划模块：连对话记录、人物画像（含动态画像）、路径库、技能 / 知识 / 事件、
// 快照 / 变更日志 / 检索记录一起清空，用于「清干净之后重新对话输入训练」。清完自动补回「大脑」锚点节点。
const LIFE_WIPE_TABLES = [
  'life_retrieval_logs', 'life_retrieval_cache', 'life_retrieval_queue', 'life_retrieval_batches',
  'life_plan_snapshots', 'life_change_logs', 'life_plan_rejects', 'life_persona_derived', 'life_future_paths',
  'life_persona', 'life_skill_profile', 'life_knowledge', 'life_calendar_events', 'life_energy_logs',
  'life_daily_tasks', 'life_chat_messages', 'life_plan_nodes'
];
app.delete('/api/life/data', async (req, res) => {
  try {
    let cleared = 0;
    for (const table of LIFE_WIPE_TABLES) {
      try { await pool.execute(`DELETE FROM ${table}`); cleared += 1; }
      catch (err) { console.warn(`[life-reset] 清空 ${table} 失败：${err.message}`); }
    }
    await ensureLifeSelfNode();
    console.log(`[life-reset] 已重置人生规划模块：${cleared}/${LIFE_WIPE_TABLES.length} 张表清空`);
    res.json({ ok: true, cleared, total: LIFE_WIPE_TABLES.length, nodes: await listLifeNodes() });
  } catch (err) {
    console.error('重置人生规划失败:', err);
    res.status(500).json({ error: err.message || '重置失败' });
  }
});

// ========== 人生规划 · 结构化模块（模块2/3/15/16/17/18/19） ==========
const LIFE_TASK_STATUS = ['todo', 'doing', 'done', 'delay', 'drop'];
const LIFE_TASK_PRIORITY = ['P0', 'P1', 'P2', 'P3'];
// 每日任务的重复类型：daily 每日 / weekday 工作日 / weekly 每周 / once 单次
const LIFE_REPEAT_TYPES = ['daily', 'weekday', 'weekly', 'once'];
// 由标题自动判定重复类型：'' = 从未设置，按关键词推断；明确给出 once 表示用户/AI 就是选了单次，直接尊重。
// 这样「每日背单词」不会被标成单次，而「今天做一套真题」也不会被硬说成每日重复。
function lifeRepeatType(raw, title) {
  const value = String(raw || '').trim().toLowerCase();
  if (value === 'once') return 'once';
  if (LIFE_REPEAT_TYPES.includes(value)) return value;
  const text = String(title || '');
  if (/工作日|周一至周五|周一~周五|周一到周五/.test(text)) return 'weekday';
  if (/每天|每日|天天|日常/.test(text)) return 'daily';
  if (/每周|周[一二三四五六日天]|一周一次|每周一次/.test(text)) return 'weekly';
  // 备考类功夫活（刷题 / 背单词 / 错题复盘 / 模拟考）本该天天做，模型却常忘填 repeat 或误填 once，
  // 结果「每日刷行测 40 题」只排了一天 —— 这里按标题兜底成每日重复（每周类规则在前，不会被这条吞掉）
  if (/刷题|刷\d+|背单词|背诵|精读|每日一练|错题|复盘|模拟考|真题|单词|打卡|练字|听力|阅读理解/.test(text)) return 'daily';
  return 'once';
}
// 个人档案分类：基础信息 / 已掌握 / 待学习 / 证书资质 / 爱好特长 / 短板 / 偏好与约束
const LIFE_SKILL_CATEGORY = ['info', 'own', 'learn', 'cert', 'hobby', 'weak', 'pref'];
// 间隔重复复习节点：学完当天 / 第2天 / 第4天 / 第7天 / 第14天 / 已掌握
const LIFE_REVIEW_OFFSETS = [0, 2, 4, 7, 14, -1];

function lifeDateShift(iso, days) {
  const [y, m, d] = String(iso || '').split('-').map(Number);
  if (!y || !m || !d) return iso;
  const dt = new Date(y, m - 1, d);
  dt.setDate(dt.getDate() + days);
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`;
}

function lifeDaysUntil(iso) {
  const [y, m, d] = String(iso || '').split('-').map(Number);
  if (!y || !m || !d) return null;
  const target = new Date(y, m - 1, d);
  const [ty, tm, td] = todayStr().split('-').map(Number);
  const base = new Date(ty, tm - 1, td);
  return Math.round((target - base) / 86400000);
}

// 间隔重复：由入库日与当前复习阶段推算下次复习日期
function lifeNextReviewDate(baseDate, stage) {
  const offset = LIFE_REVIEW_OFFSETS[Math.max(0, Math.min(LIFE_REVIEW_OFFSETS.length - 1, Number(stage) || 0))];
  if (offset < 0) return '';
  return lifeDateShift(baseDate || todayStr(), offset);
}

// 时间戳按本地日期转 YYYY-MM-DD
function lifeDateOf(ts) {
  const d = new Date(Number(ts) || Date.now());
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

// 面板改动落库后，写一条系统消息进对话流并记变更日志，让下一轮 AI 上下文自动带上
async function logLifePanelChange(moduleName, content, reason = '', affectedModules = []) {
  const now = Date.now();
  const affected = Array.isArray(affectedModules) ? affectedModules.filter(Boolean).join(',') : String(affectedModules || '');
  await pool.execute('INSERT INTO life_change_logs (id, module, content, reason, affected, snapshot_id, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
    [crypto.randomUUID(), lifeText(moduleName, 32), lifeText(content, 400), lifeText(reason, 200), lifeText(affected, 200), '', now]);
  const affectedText = affected ? `，受影响模块：${affected}` : '';
  await pool.execute('INSERT INTO life_chat_messages (id, role, content, created_at) VALUES (?, ?, ?, ?)',
    [crypto.randomUUID(), 'system', `【面板变更】${lifeText(moduleName, 32)}：${lifeText(content, 400)}${affectedText}`, now]);
}

// 增量联动：只重算被牵连的模块（当日进度快照 + 当日精力负荷），并记一条带「受影响模块」的变更日志
async function refreshLifeDerived(trigger, changedModules, reason, changeContent) {
  const today = todayStr();
  const modules = Array.isArray(changedModules) ? changedModules : [];
  const stats = await lifeProgressStats();
  const now = Date.now();

  // 1) 当日进度快照：同一天只保留一条，存在即覆盖（仅当该模块被牵连时重算）
  // 快照只是存档，写失败（例如历史 TEXT 列溢出）绝不能连带整轮同步失败，这里单独兜异常
  if (modules.includes('进度快照')) {
    try {
      const [snapRows] = await pool.query('SELECT id, progress FROM life_plan_snapshots WHERE snap_date = ? LIMIT 1', [today]);
      const prevNote = snapRows.length
        ? `对比上次快照：完成率 ${Number(snapRows[0].progress) || 0}% → ${stats.progress}%`
        : '当日首次快照';
      const diffNote = `${prevNote}，延期 ${stats.counts.delay}，共 ${stats.total} 项任务`;
      // 快照同时存档当时的规划节点与每日任务，供后续「回退到历史版本」使用（额外字段，不影响原有统计读取）
      const payload = JSON.stringify({ ...stats, nodes: await listLifeNodes(), tasks: await listLifeTasks() });
      if (snapRows.length) {
        await pool.execute('UPDATE life_plan_snapshots SET progress = ?, payload = ?, diff_note = ? WHERE id = ?',
          [stats.progress, payload, lifeText(diffNote, 500), snapRows[0].id]);
      } else {
        await pool.execute('INSERT INTO life_plan_snapshots (id, snap_date, progress, payload, diff_note, created_at) VALUES (?, ?, ?, ?, ?, ?)',
          [crypto.randomUUID(), today, stats.progress, payload, lifeText(diffNote, 500), now]);
      }
    } catch (err) {
      console.warn('[life snapshot] 存档失败，已跳过（不影响规划同步）：', err.message);
    }
  }

  // 2) 当日精力负荷：只更新计划总时长，保留用户填写的上限、干扰与身体状态（仅当该模块被牵连时重算）
  if (modules.includes('精力负荷')) {
    const planned = await lifePlannedMinutes(today);
    const [energyRows] = await pool.query('SELECT id, capacity_minutes FROM life_energy_logs WHERE log_date = ? LIMIT 1', [today]);
    if (energyRows.length) {
      const capacity = Number(energyRows[0].capacity_minutes) || 0;
      const overload = planned > capacity && capacity > 0 ? 1 : 0;
      await pool.execute('UPDATE life_energy_logs SET planned_minutes = ?, overload = ? WHERE id = ?', [planned, overload, energyRows[0].id]);
    } else {
      await pool.execute("INSERT INTO life_energy_logs (id, log_date, planned_minutes, capacity_minutes, overload, distractions, sleep_hours, health, note, created_at) VALUES (?, ?, ?, 0, 0, '', 0, '', ?, ?)",
        [crypto.randomUUID(), today, planned, '由任务变更自动汇总', now]);
    }
  }

  // 3) 变更日志 + 系统消息（把受影响模块写进内容，供 AI 与变更日志面板展示）
  await logLifePanelChange(
    lifeText(trigger, 32),
    changeContent || `${lifeText(trigger, 32)}发生变更，已联动刷新：${modules.join('、') || '无'}`,
    reason || '自动增量联动',
    modules
  );
}

function lifeTaskOut(row) {
  return {
    id: row.id,
    date: row.task_date || '',
    title: row.title || '',
    estMinutes: Number(row.est_minutes) || 0,
    priority: LIFE_TASK_PRIORITY.includes(row.priority) ? row.priority : 'P1',
    status: LIFE_TASK_STATUS.includes(row.status) ? row.status : 'todo',
    preTask: row.pre_task || '',
    blocker: row.blocker || '',
    support: row.support || '',
    nodeId: row.node_id || '',
    // 重复类型：daily 每日 / weekday 工作日 / weekly 每周 / once 单次（旧数据缺列时按标题兜底推断）
    repeat: lifeRepeatType(row.repeat_type, row.title),
    sortOrder: Number(row.sort_order) || 0,
    createdAt: Number(row.created_at) || 0,
    updatedAt: Number(row.updated_at) || 0
  };
}

function lifeSnapshotOut(row) {
  let payload = null;
  try { payload = row.payload ? JSON.parse(row.payload) : null; } catch (_) { payload = null; }
  return {
    id: row.id,
    date: row.snap_date || '',
    progress: Number(row.progress) || 0,
    payload,
    diffNote: row.diff_note || '',
    createdAt: Number(row.created_at) || 0
  };
}

function lifeEnergyOut(row) {
  return {
    id: row.id,
    date: row.log_date || '',
    plannedMinutes: Number(row.planned_minutes) || 0,
    capacityMinutes: Number(row.capacity_minutes) || 0,
    overload: row.overload === 1,
    distractions: row.distractions || '',
    sleepHours: Number(row.sleep_hours) || 0,
    health: row.health || '',
    note: row.note || '',
    createdAt: Number(row.created_at) || 0
  };
}

function lifeSkillOut(row) {
  return {
    id: row.id,
    category: LIFE_SKILL_CATEGORY.includes(row.category) ? row.category : 'own',
    name: row.name || '',
    level: row.level || '',
    note: row.note || '',
    sortOrder: Number(row.sort_order) || 0
  };
}

function lifeKnowledgeOut(row) {
  return {
    id: row.id,
    subject: row.subject || '',
    topic: row.topic || '',
    content: row.content || '',
    wrongQuestions: row.wrong_questions || '',
    tags: row.tags || '',
    reviewStage: Number(row.review_stage) || 0,
    nextReviewDate: row.next_review_date || '',
    source: row.source || 'ai',
    createdAt: Number(row.created_at) || 0
  };
}

function lifeEventOut(row) {
  const days = lifeDaysUntil(row.event_date);
  return {
    id: row.id,
    title: row.title || '',
    date: row.event_date || '',
    category: row.category || '',
    level: ['high', 'mid', 'low'].includes(row.level) ? row.level : 'mid',
    remindDays: row.remind_days || '30,7,1',
    status: row.status || 'pending',
    note: row.note || '',
    daysLeft: days
  };
}

function lifeChangeOut(row) {
  return {
    id: row.id,
    module: row.module || '',
    content: row.content || '',
    reason: row.reason || '',
    affected: String(row.affected || '').split(',').map(s => s.trim()).filter(Boolean),
    snapshotId: row.snapshot_id || '',
    createdAt: Number(row.created_at) || 0
  };
}

async function listLifeTasks(range = {}) {
  const where = [];
  const params = [];
  if (range.date) { where.push('task_date = ?'); params.push(range.date); }
  if (range.from) { where.push('task_date >= ?'); params.push(range.from); }
  if (range.to) { where.push('task_date <= ?'); params.push(range.to); }
  const sql = `SELECT * FROM life_daily_tasks ${where.length ? `WHERE ${where.join(' AND ')}` : ''} ORDER BY task_date ASC, sort_order ASC, created_at ASC`;
  const [rows] = await pool.query(sql, params);
  return rows.map(lifeTaskOut);
}

// 某日待执行任务的预估总时长（精力负荷的数据源）
async function lifePlannedMinutes(date) {
  const tasks = await listLifeTasks({ date });
  return tasks.filter(t => t.status !== 'done' && t.status !== 'drop').reduce((sum, t) => sum + (t.estMinutes || 0), 0);
}

// 进度统计（模块15 快照的数据源）
async function lifeProgressStats() {
  const tasks = await listLifeTasks();
  const counts = { todo: 0, doing: 0, done: 0, delay: 0, drop: 0 };
  for (const task of tasks) counts[task.status] = (counts[task.status] || 0) + 1;
  const active = tasks.length - counts.drop;
  const progress = active > 0 ? Math.round((counts.done / active) * 100) : 0;
  return { total: tasks.length, active, progress, counts };
}

// 重点提醒区聚合：P0 三日临近 + 高风险 + 外部事件 30/7/1 天
async function lifeAlerts() {
  const alerts = [];
  const today = todayStr();
  const tasks = await listLifeTasks({ to: lifeDateShift(today, 3) });
  for (const task of tasks) {
    if (task.status === 'done' || task.status === 'drop') continue;
    if (task.priority !== 'P0') continue;
    const days = lifeDaysUntil(task.date);
    alerts.push({ kind: 'task', level: 'high', title: task.title, date: task.date, daysLeft: days, note: `P0 任务${days != null && days >= 0 ? `${days} 天内到期` : '已逾期'}` });
  }
  const nodes = await listLifeNodes();
  for (const node of nodes) {
    if (node.status === 'done' || !node.risk) continue;
    if (!/高/.test(String(node.risk))) continue;
    alerts.push({ kind: 'risk', level: 'high', title: node.title, date: node.horizon || '', daysLeft: null, note: `高风险：${node.risk}` });
  }
  const [eventRows] = await pool.query('SELECT * FROM life_calendar_events ORDER BY event_date ASC');
  for (const row of eventRows.map(lifeEventOut)) {
    if (row.status === 'done') continue;
    const marks = String(row.remindDays || '30,7,1').split(',').map(Number).filter(n => Number.isFinite(n));
    if (row.daysLeft == null || row.daysLeft < 0) continue;
    if (!marks.includes(row.daysLeft)) continue;
    alerts.push({ kind: 'event', level: row.level === 'high' ? 'high' : 'mid', title: row.title, date: row.date, daysLeft: row.daysLeft, note: `外部事件距今 ${row.daysLeft} 天` });
  }
  return alerts;
}

// 每日任务：按优先级与日期排序（P0 在前）
app.get('/api/life/tasks', async (req, res) => {
  try {
    res.json({ tasks: await listLifeTasks({ date: req.query.date || '', from: req.query.from || '', to: req.query.to || '' }) });
  } catch (err) {
    console.error('获取每日任务失败:', err);
    res.status(500).json({ error: err.message || '获取失败' });
  }
});

app.post('/api/life/tasks', async (req, res) => {
  try {
    const body = req.body || {};
    const id = crypto.randomUUID();
    const now = Date.now();
    const priority = LIFE_TASK_PRIORITY.includes(body.priority) ? body.priority : 'P1';
    const status = LIFE_TASK_STATUS.includes(body.status) ? body.status : 'todo';
    const title = lifeText(body.title, 200);
    const repeatType = lifeRepeatType(body.repeat, title);
    await pool.execute(
      'INSERT INTO life_daily_tasks (id, task_date, title, est_minutes, priority, status, pre_task, blocker, support, node_id, repeat_type, sort_order, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
      [id, lifeText(body.date, 10) || todayStr(), title, Math.max(0, Number(body.estMinutes) || 0), priority, status,
        lifeText(body.preTask, 120), lifeText(body.blocker, 200), lifeText(body.support, 200), lifeText(body.nodeId, 64),
        repeatType, Math.max(0, Number(body.sortOrder) || 0), now, now]
    );
    await refreshLifeDerived('每日任务', ['每日任务', '进度快照', '精力负荷', '重点提醒', '变更日志'], '面板手动新增', `新增任务「${lifeText(body.title, 60)}」`);
    res.json({ id, tasks: await listLifeTasks() });
  } catch (err) {
    console.error('新增每日任务失败:', err);
    res.status(500).json({ error: err.message || '新增失败' });
  }
});

app.put('/api/life/tasks/:id', async (req, res) => {
  try {
    const map = { date: 'task_date', title: 'title', estMinutes: 'est_minutes', priority: 'priority', preTask: 'pre_task', blocker: 'blocker', support: 'support', nodeId: 'node_id', repeat: 'repeat_type', sortOrder: 'sort_order' };
    const fields = [];
    const values = [];
    for (const key of Object.keys(map)) {
      if (req.body[key] === undefined) continue;
      fields.push(`${map[key]} = ?`);
      if (key === 'priority') values.push(LIFE_TASK_PRIORITY.includes(req.body[key]) ? req.body[key] : 'P1');
      else if (key === 'repeat') values.push(lifeRepeatType(req.body[key], req.body.title));
      else if (key === 'estMinutes' || key === 'sortOrder') values.push(Math.max(0, Number(req.body[key]) || 0));
      else values.push(lifeText(req.body[key], key === 'date' ? 10 : 200));
    }
    if (fields.length) {
      fields.push('updated_at = ?');
      values.push(Date.now(), req.params.id);
      await pool.execute(`UPDATE life_daily_tasks SET ${fields.join(', ')} WHERE id = ?`, values);
      await refreshLifeDerived('每日任务', ['每日任务', '进度快照', '精力负荷', '重点提醒', '变更日志'], '面板手动修改', `修改任务「${lifeText(req.body.title || req.params.id, 60)}」`);
    }
    res.json({ tasks: await listLifeTasks() });
  } catch (err) {
    console.error('修改每日任务失败:', err);
    res.status(500).json({ error: err.message || '修改失败' });
  }
});

// 改状态：delay 时本任务顺延一天，且同日及之后的未完成任务整体后移一天
// 任务状态驱动推演：状态变更只重绘该任务的关联子树，不重绘整张网络
const LIFE_STATUS_INFERENCE_SYSTEM = `你是人生规划的状态推演引擎。某个最小可执行任务的状态刚刚发生变化，你只针对这个任务的关联子树做局部增量推演，禁止重绘整张网络。
输出一个 JSON 对象 {"summary":"一句话说明这次推演做了什么","ops":[ ... ]}，ops 规范与主规划一致，只允许三种操作：
- op="add"：新增衍生子节点，必须带 tempId、parentId（指向该任务对应的规划节点 id，或本轮其他 tempId）、kind、domain、series、title、detail、risk、priority、status、horizon、weight、timeGroup、stepNo、content_type、content_body
- op="update"：更新既有节点（例如向上更新父目标完成概率、调整后续任务优先级），必须带 id
- op="queue_search"：需要真实外网资料时只写待检索条目（query / nodeId / priority），禁止自行编造时间、官网、政策
推演规则：
1. 新状态 = done（已完成）：新增「验收结果」「复盘记录」两个子节点；把以它为前置的后续任务解锁（这些任务的 status 由 todo 改为 doing）；评估进度盈余，必要时新增一个拔高拓展任务；用 op="update" 向上更新父目标的完成概率（写进父节点 detail 的「完成概率：x%」）。
2. 新状态 = delay（未完成 / 延期）：新增「未完成原因」「风险评估」「补救备选方案」三个子节点；向上逐层评估对上级模块、主线赛道、横向关联赛道带来的连锁负面影响（写进 risk 与 detail）；并明确给出任务减量 / 延后 / 裁剪低优先级任务的方案。
3. 复盘模板、补救方案属于公共节点，加 "shared":true 跨分支复用，禁止重复建节点。
4. 只输出 JSON，不要任何解释文字；本轮最多 8 个节点；每个节点仍按通用规则自动匹配 content_type。`;

// 状态变更后异步跑一次局部推演：生成「完成 / 延期」两套分支，写回增量节点
async function runLifeStatusInference(task, nextStatus) {
  const nodeId = String(task.node_id || '');
  const [all] = await pool.query('SELECT id, parent_id, kind, series, title, detail, status FROM life_plan_nodes');
  const byId = new Map(all.map(row => [String(row.id), row]));
  const node = nodeId ? byId.get(nodeId) : null;
  // 沿 parent_id 向上收集父链（最多 4 层），让 AI 看清这次变更会影响哪条主线
  const chain = [];
  let cursor = node;
  let depth = 0;
  while (cursor && depth < 4) {
    chain.unshift(`${cursor.kind}｜${cursor.title}`);
    cursor = cursor.parent_id ? byId.get(String(cursor.parent_id)) : null;
    depth += 1;
  }
  const siblings = node
    ? all.filter(row => String(row.parent_id) === String(node.parent_id || '') && String(row.id) !== nodeId).slice(0, 8).map(row => row.title)
    : [];
  const userPrompt = [
    `【任务】${lifeText(task.title, 200)}`,
    node && node.detail ? `【任务细节】${lifeText(node.detail, 600)}` : '',
    `【原状态】${task.status}　【新状态】${nextStatus}`,
    `【所属主线】${node?.series || '未标注'}`,
    `【父节点链】${chain.join(' → ') || '无'}`,
    `【同层兄弟节点】${siblings.join('、') || '无'}`,
    nodeId ? `【该任务对应的规划节点 id】${nodeId}` : '',
    `【前置任务】${lifeText(task.pre_task, 120) || '无'}　【阻碍】${lifeText(task.blocker, 200) || '无'}`,
    `【最近对话】\n${recentLifeTranscript(await (async () => {
      const [rows] = await pool.query('SELECT role, content FROM life_chat_messages ORDER BY created_at DESC LIMIT 12');
      return rows.reverse();
    })())}`
  ].filter(Boolean).join('\n');
  const model = await resolveLifeModel();
  const raw = await callAI(LIFE_STATUS_INFERENCE_SYSTEM, userPrompt, null, model, 120000, 3000);
  const parsed = parseLifeJson(raw) || { ops: salvageJsonObjects(raw) };
  const ops = Array.isArray(parsed?.ops) ? parsed.ops : (Array.isArray(parsed) ? parsed : []);
  if (!ops.length) return 0;
  const applied = await applyLifeOps(ops);
  if (applied) {
    await logLifePanelChange('每日任务', `任务「${lifeText(task.title, 60)}」状态变为 ${nextStatus}，自动推演关联子树（${applied} 项）`, '任务状态变更触发局部增量推理', ['规划网络', '每日任务', '进度快照']);
  }
  return applied;
}

// 后台自主生长：挑几个「还没往下拆」的叶节点，让 AI 按通用递归规则继续下拆一层
// 只做纯逻辑推演（免费），不做外网检索；每轮增量追加，禁止清空重写
const LIFE_GROW_SYSTEM = `你是人生规划的后台生长引擎。系统靠多轮对话 + 后台间歇推理逐层扩图，你这一轮只做一件事：把下面列出的「待展开叶节点」各自再向下拆一层。
【通用递归拆解规则】任意节点都自动生成 4 个子分支：事件时间节点｜基础信息环境｜风险注意事项｜待完成任务项；其中【待完成任务项】继续拆：任务清单 → 阶段计划 → 每日计划 → 执行方法 → 复盘机制；【每日计划】再拆：各模块细分任务 → 工作量量化 → 验收标准 → 进度表。一直拆到「最小可执行任务」为止，不再继续拆。不限层级、不限分支数量。
【严禁】
1. 禁止生成「制定 XX 计划」「整理 XX 规划」这类无效顶层任务，全部拆成可直接动手的动作。
2. 永远增量更新：只新增受影响的子节点，禁止清空或重写任何现有节点，禁止改动本轮没列出的节点。
3. 禁止编造时间、官网、政策数据；没把握就不要写具体日期与网址，改为 op="queue_search" 入待检索队列，绝不自行联网。
【输出】只输出一个 JSON 对象 {"summary":"一句话说明本轮扩了哪些节点","ops":[...]}：
- op="add"：新增子节点，必须带 tempId、parentId（= 本轮列出的那个叶节点的 id，或本轮其他 tempId）、kind（子层用 goal / action）、domain、series（与该叶节点一致）、title（14 字内、写清动作）、detail、risk、priority、status、horizon、weight、timeGroup、stepNo、content_type（按内容自动匹配）、content_body
- op="queue_search"：缺真实资料时写查询（query / nodeId / priority）
每个叶节点本轮产出 2~4 个子节点；最小可执行任务用 content_type="checklist" 并带具体动作步骤。`;

async function backgroundLifeGrow() {
  const [rows] = await pool.query('SELECT id, parent_id, kind, series, title, detail, content_type, step_no FROM life_plan_nodes');
  if (!rows.length) return 0;
  const childCount = new Map();
  for (const row of rows) {
    const parent = String(row.parent_id || '');
    if (parent) childCount.set(parent, (childCount.get(parent) || 0) + 1);
  }
  // 叶节点 = 没有任何子节点；再排除前瞻推演分支与已到终点的最小可执行任务（checklist）
  const leaves = rows.filter(row => {
    if (childCount.has(String(row.id))) return false;
    if (String(row.kind) === 'milestone') return false;
    return lifeContentType(row) !== 'checklist';
  });
  // 按创建顺序推进，保证后台长期运行能把整棵树逐层覆盖到；单轮只取 3 个，避免一次暴涨
  const targets = leaves.slice(0, 3);
  if (!targets.length) return 0;
  const block = ['【待展开叶节点（只拆这几个，其他节点一律不许动）】',
    targets.map(row => `${row.id}｜${row.kind}｜${row.series || '无主线'}｜${row.title}｜${String(row.detail || '').slice(0, 120)}`).join('\n')].join('\n');
  const model = await resolveLifeModel();
  const raw = await callAI(LIFE_GROW_SYSTEM, block, null, model, 150000, 3200);
  const parsed = parseLifeJson(raw) || { ops: salvageJsonObjects(raw) };
  const ops = Array.isArray(parsed?.ops) ? parsed.ops : (Array.isArray(parsed) ? parsed : []);
  if (!ops.length) return 0;
  const applied = await applyLifeOps(ops);
  if (applied) await logLifePanelChange('规划网络', `后台自主生长：向下展开 ${targets.length} 个叶节点（新增 ${applied} 项）`, '后台间歇推理免费扩图', ['规划网络']);
  return applied;
}

// ── 资料检索审批工作流 API（付费管控：攒批 → 人工审批 → 批量执行 → 缓存 → 账单）──
app.get('/api/life/retrieval/queue', async (req, res) => {
  try {
    const [rows] = await pool.query('SELECT * FROM life_retrieval_queue ORDER BY created_at DESC LIMIT 120');
    res.json({
      tasks: rows.map(row => ({
        id: row.id, batchId: row.batch_id, nodeId: row.node_id, series: row.series, title: row.title,
        query: row.query, priority: row.priority, estCost: Number(row.est_cost || 0), status: row.status,
        result: row.result || '', fromCache: Number(row.from_cache) === 1,
        createdAt: Number(row.created_at), decidedAt: Number(row.decided_at)
      })),
      pendingCount: rows.filter(row => row.status === 'pending').length
    });
  } catch (err) { res.status(500).json({ error: err.message || '读取待检索队列失败' }); }
});

// 手动归集：立即把 pending 打成一批，产出检索清单 + 预估账单
app.post('/api/life/retrieval/collect', async (req, res) => {
  try {
    const batchId = await collectLifeRetrievalBatch();
    if (!batchId) return res.json({ batch: null, message: '当前没有待归集的检索需求' });
    const [rows] = await pool.query('SELECT * FROM life_retrieval_batches WHERE id = ? LIMIT 1', [batchId]);
    const row = rows[0];
    res.json({
      batch: { id: row.id, batchNo: row.batch_no, taskCount: Number(row.task_count), estCost: Number(row.est_cost), status: row.status, createdAt: Number(row.created_at) },
      message: `已归集 ${row.task_count} 条待检索，预估费用 ${Number(row.est_cost).toFixed(2)} 元，等待审批`
    });
  } catch (err) { res.status(500).json({ error: err.message || '归集失败' }); }
});

app.get('/api/life/retrieval/batches', async (req, res) => {
  try {
    const [rows] = await pool.query('SELECT * FROM life_retrieval_batches ORDER BY created_at DESC LIMIT 40');
    const [items] = await pool.query("SELECT id, batch_id FROM life_retrieval_queue WHERE batch_id <> ''");
    const byBatch = new Map();
    for (const item of items) {
      if (!byBatch.has(item.batch_id)) byBatch.set(item.batch_id, []);
      byBatch.get(item.batch_id).push(item.id);
    }
    res.json({
      batches: rows.map(row => ({
        id: row.id, batchNo: row.batch_no, taskCount: Number(row.task_count), estCost: Number(row.est_cost),
        actualCost: Number(row.actual_cost), status: row.status, createdAt: Number(row.created_at),
        decidedAt: Number(row.decided_at), taskIds: byBatch.get(row.id) || []
      }))
    });
  } catch (err) { res.status(500).json({ error: err.message || '读取批次失败' }); }
});

// 三种人工审批：全部同意 / 部分同意（带 ids 勾选）/ 全部驳回
app.post('/api/life/retrieval/batches/:id/decide', async (req, res) => {
  try {
    const mode = ['all', 'partial', 'reject'].includes(req.body?.mode) ? req.body.mode : 'reject';
    const [batches] = await pool.query('SELECT * FROM life_retrieval_batches WHERE id = ? LIMIT 1', [req.params.id]);
    if (!batches.length) return res.status(404).json({ error: '批次不存在' });
    const batch = batches[0];
    const [pendingRows] = await pool.query("SELECT * FROM life_retrieval_queue WHERE batch_id = ? AND status = 'pending'", [batch.id]);
    const now = Date.now();

    if (mode === 'reject') {
      // 全部驳回：本次一律不检索，任务保留在队列里，后续可再审
      for (const row of pendingRows) await pool.execute("UPDATE life_retrieval_queue SET status = 'rejected', updated_at = ? WHERE id = ?", [now, row.id]);
      await pool.execute("UPDATE life_retrieval_batches SET status = 'rejected', actual_cost = 0, decided_at = ? WHERE id = ?", [now, batch.id]);
      await logLifeRetrieval(batch.id, 'reject', `驳回 ${pendingRows.length} 条检索需求，费用 0 元`, 0);
      return res.json({ batch: { id: batch.id, batchNo: batch.batch_no, status: 'rejected' }, executed: 0, cost: 0, message: `已驳回 ${pendingRows.length} 条，任务保留在队列中可再审` });
    }

    // partial：只执行勾选的条目，其余退回待定状态（脱离本批次，留待下次审批）
    const picked = mode === 'partial' ? new Set((Array.isArray(req.body?.ids) ? req.body.ids : []).map(String)) : null;
    if (picked && !picked.size) return res.status(400).json({ error: '请至少勾选一条需要检索的条目' });
    const selected = pendingRows.filter(row => !picked || picked.has(String(row.id)));
    const rest = pendingRows.filter(row => picked && !picked.has(String(row.id)));
    for (const row of rest) await pool.execute("UPDATE life_retrieval_queue SET batch_id = '', updated_at = ? WHERE id = ?", [now, row.id]);

    // 批量执行：逐条先查缓存，未命中才联网；任一失败不影响其余
    let cost = 0;
    let cachedHits = 0;
    for (const row of selected) {
      try {
        const outcome = await executeLifeRetrieval(row, req.user.id);
        cost += outcome.cost;
        if (outcome.fromCache) cachedHits += 1;
      } catch (err) {
        await pool.execute("UPDATE life_retrieval_queue SET status = 'failed', result = ?, updated_at = ? WHERE id = ?", [lifeText(err.message, 400), Date.now(), row.id]);
      }
    }
    const status = mode === 'partial' && rest.length ? 'partial' : 'done';
    await pool.execute('UPDATE life_retrieval_batches SET status = ?, actual_cost = ?, decided_at = ? WHERE id = ?', [status, cost, now, batch.id]);
    await logLifeRetrieval(batch.id, mode === 'all' ? 'approve_all' : 'approve_partial', `执行 ${selected.length} 条检索（缓存命中 ${cachedHits} 条），实际费用 ${cost.toFixed(2)} 元`, cost);
    res.json({
      batch: { id: batch.id, batchNo: batch.batch_no, status },
      executed: selected.length, cachedHits, cost,
      message: `已执行 ${selected.length} 条检索${cachedHits ? `（${cachedHits} 条命中缓存，未扣费）` : ''}，实际费用 ${cost.toFixed(2)} 元`
    });
  } catch (err) { res.status(500).json({ error: err.message || '审批失败' }); }
});

// 账单 + 审批记录 + 检索日志
app.get('/api/life/retrieval/bill', async (req, res) => {
  try {
    const [logs] = await pool.query('SELECT * FROM life_retrieval_logs ORDER BY created_at DESC LIMIT 80');
    const [totals] = await pool.query("SELECT COUNT(*) AS n, COALESCE(SUM(actual_cost), 0) AS cost FROM life_retrieval_batches WHERE status IN ('done','partial')");
    const [cache] = await pool.query('SELECT COUNT(*) AS n, COALESCE(SUM(hit_count), 0) AS hits FROM life_retrieval_cache');
    const [pending] = await pool.query("SELECT COUNT(*) AS n FROM life_retrieval_queue WHERE status = 'pending'");
    res.json({
      logs: logs.map(row => ({ id: row.id, batchId: row.batch_id, action: row.action, detail: row.detail, cost: Number(row.cost || 0), createdAt: Number(row.created_at) })),
      totalBatches: Number(totals[0].n), totalCost: Number(totals[0].cost || 0),
      cacheEntries: Number(cache[0].n), cacheHits: Number(cache[0].hits || 0),
      pendingCount: Number(pending[0].n)
    });
  } catch (err) { res.status(500).json({ error: err.message || '读取账单失败' }); }
});

app.post('/api/life/tasks/:id/state', async (req, res) => {
  try {
    const status = LIFE_TASK_STATUS.includes(req.body?.status) ? req.body.status : 'todo';
    const [rows] = await pool.query('SELECT * FROM life_daily_tasks WHERE id = ? LIMIT 1', [req.params.id]);
    if (!rows.length) return res.status(404).json({ error: '任务不存在' });
    const task = rows[0];
    const now = Date.now();
    if (status === 'delay') {
      const base = task.task_date || todayStr();
      const [later] = await pool.query('SELECT id, task_date FROM life_daily_tasks WHERE task_date >= ? AND id <> ?', [base, task.id]);
      for (const item of later) {
        await pool.execute('UPDATE life_daily_tasks SET task_date = ?, updated_at = ? WHERE id = ?', [lifeDateShift(item.task_date, 1), now, item.id]);
      }
      await pool.execute('UPDATE life_daily_tasks SET status = ?, task_date = ?, updated_at = ? WHERE id = ?', [status, lifeDateShift(base, 1), now, task.id]);
      await refreshLifeDerived('每日任务', ['每日任务', '进度快照', '精力负荷', '重点提醒', '变更日志'], '任务未按时完成', `任务「${lifeText(task.title, 60)}」延期，同日及之后任务整体顺延一天`);
    } else {
      await pool.execute('UPDATE life_daily_tasks SET status = ?, updated_at = ? WHERE id = ?', [status, now, task.id]);
      await refreshLifeDerived('每日任务', ['每日任务', '进度快照', '精力负荷', '重点提醒', '变更日志'], '面板手动更新', `任务「${lifeText(task.title, 60)}」状态改为 ${status}`);
    }
    // 状态驱动推演：done / delay 时异步触发局部增量推理，只更新该任务关联子树，不阻塞响应
    if (status !== task.status && (status === 'done' || status === 'delay')) {
      runLifeStatusInference(task, status).catch(err => console.warn('[life-status-infer]', err.message));
    }
    // 反向同步：每日任务绑定过规划节点时，把状态回写到对应节点，思维导图上的前置依赖随之解锁/锁定
    if (status !== task.status && task.node_id) {
      const nodeStatus = ['done', 'doing', 'todo', 'drop'].includes(status) ? status : 'doing';
      pool.execute('UPDATE life_plan_nodes SET status = ?, updated_at = ? WHERE id = ?', [nodeStatus, now, String(task.node_id)])
        .catch(err => console.warn('[life-node-sync]', err.message));
    }
    res.json({ tasks: await listLifeTasks() });
  } catch (err) {
    console.error('更新任务状态失败:', err);
    res.status(500).json({ error: err.message || '更新失败' });
  }
});

app.delete('/api/life/tasks/:id', async (req, res) => {
  try {
    const [rows] = await pool.query('SELECT title FROM life_daily_tasks WHERE id = ? LIMIT 1', [req.params.id]);
    await pool.execute('DELETE FROM life_daily_tasks WHERE id = ?', [req.params.id]);
    await refreshLifeDerived('每日任务', ['每日任务', '进度快照', '精力负荷', '重点提醒', '变更日志'], '面板手动删除', `删除任务「${lifeText(rows[0]?.title || req.params.id, 60)}」`);
    res.json({ tasks: await listLifeTasks() });
  } catch (err) {
    console.error('删除每日任务失败:', err);
    res.status(500).json({ error: err.message || '删除失败' });
  }
});

// 进度快照
app.get('/api/life/snapshots', async (req, res) => {
  try {
    const [rows] = await pool.query('SELECT * FROM life_plan_snapshots ORDER BY created_at DESC LIMIT 60');
    res.json({ snapshots: rows.map(lifeSnapshotBrief), stats: await lifeProgressStats() });
  } catch (err) {
    console.error('获取进度快照失败:', err);
    res.status(500).json({ error: err.message || '获取失败' });
  }
});

app.post('/api/life/snapshots', async (req, res) => {
  try {
    // 同一自然日只保留一条快照：由 refreshLifeDerived 按 snap_date 覆盖更新
    await refreshLifeDerived('任务进度快照', ['进度快照', '变更日志'], lifeText(req.body?.reason, 200) || '面板手动生成，覆盖当天记录', '生成今日进度快照（覆盖同一天记录）');
    const [rows] = await pool.query('SELECT * FROM life_plan_snapshots ORDER BY created_at DESC LIMIT 60');
    res.json({ snapshot: rows.length ? lifeSnapshotBrief(rows[0]) : null, snapshots: rows.map(lifeSnapshotBrief) });
  } catch (err) {
    console.error('生成进度快照失败:', err);
    res.status(500).json({ error: err.message || '生成失败' });
  }
});

// 列表接口只回传统计信息，节点存档仅在详情接口返回，避免响应过大
function lifeSnapshotBrief(row) {
  const out = lifeSnapshotOut(row);
  if (out.payload) out.payload = { ...out.payload, nodes: undefined };
  return out;
}

// 回看第 N 次快照
app.get('/api/life/snapshots/:id', async (req, res) => {
  try {
    const [rows] = await pool.query('SELECT * FROM life_plan_snapshots WHERE id = ? LIMIT 1', [req.params.id]);
    if (!rows.length) return res.status(404).json({ error: '快照不存在' });
    res.json({ snapshot: lifeSnapshotOut(rows[0]) });
  } catch (err) {
    console.error('回看快照失败:', err);
    res.status(500).json({ error: err.message || '获取失败' });
  }
});

// 回退到某个历史快照：把快照里存档的规划节点整体还原（不改动数据库结构，只覆盖节点数据）
app.post('/api/life/snapshots/:id/restore', async (req, res) => {
  try {
    const [rows] = await pool.query('SELECT * FROM life_plan_snapshots WHERE id = ? LIMIT 1', [req.params.id]);
    if (!rows.length) return res.status(404).json({ error: '快照不存在' });
    let payload = {};
    try { payload = JSON.parse(rows[0].payload || '{}'); } catch (_) { payload = {}; }
    const nodes = Array.isArray(payload.nodes) ? payload.nodes : [];
    if (!nodes.length) return res.status(400).json({ error: '该快照没有存档规划节点，无法回退' });
    const now = Date.now();
    // 回退只重建非「大脑」节点：中心节点（kind=self）必须常驻，不被快照覆盖或删除
    await pool.execute("DELETE FROM life_plan_nodes WHERE kind <> 'self'");
    for (const node of nodes) {
      if (String(node.kind || '') === 'self') continue;
      await pool.execute(
        'INSERT INTO life_plan_nodes (id, parent_id, kind, domain, title, detail, risk, status, horizon, weight, source, sort_order, time_group, deps, step_no, priority, series, content_type, content_body, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
        [
          lifeText(node.id, 64) || crypto.randomUUID(), lifeText(node.parentId, 64),
          LIFE_KINDS.includes(node.kind) ? node.kind : 'goal', LIFE_DOMAINS.includes(node.domain) ? node.domain : '成长',
          lifeText(node.title, 200), lifeText(node.detail, 1200), lifeText(node.risk, 200),
          ['todo', 'doing', 'done', 'drop'].includes(node.status) ? node.status : 'todo',
          lifeText(node.horizon, 32), lifeClampWeight(node.weight), 'ai', Number(node.sortOrder) || 0,
          LIFE_TIME_GROUPS.includes(node.timeGroup) ? node.timeGroup : '',
          JSON.stringify(Array.isArray(node.deps) ? [...new Set(node.deps.map(v => String(v)))] : []),
          Number(node.stepNo) || 0, LIFE_TASK_PRIORITY.includes(node.priority) ? node.priority : '',
          lifeText(node.series, 64),
          LIFE_CONTENT_TYPES.includes(String(node.contentType || '').toLowerCase()) ? String(node.contentType).toLowerCase() : '',
          node.contentBody ? (typeof node.contentBody === 'string' ? node.contentBody : JSON.stringify(node.contentBody)) : '',
          Number(node.createdAt) || now, now
        ]
      );
    }
    await logLifePanelChange('规划快照', `回退到 ${rows[0].snap_date} 的历史规划版本（${nodes.length} 个节点）`, '用户手动回退历史版本', ['规划网络']);
    res.json({ restored: nodes.length, nodes: await listLifeNodes() });
  } catch (err) {
    console.error('回退快照失败:', err);
    res.status(500).json({ error: err.message || '回退失败' });
  }
});

// 精力负荷
app.get('/api/life/energy', async (req, res) => {
  try {
    const [rows] = await pool.query('SELECT * FROM life_energy_logs ORDER BY log_date DESC LIMIT 60');
    res.json({ logs: rows.map(lifeEnergyOut), planned: await lifePlannedMinutes(todayStr()) });
  } catch (err) {
    console.error('获取精力负荷失败:', err);
    res.status(500).json({ error: err.message || '获取失败' });
  }
});

app.post('/api/life/energy', async (req, res) => {
  try {
    const body = req.body || {};
    const logDate = lifeText(body.date, 10) || todayStr();
    const planned = body.plannedMinutes != null ? Math.max(0, Number(body.plannedMinutes) || 0) : await lifePlannedMinutes(logDate);
    const capacity = Math.max(0, Number(body.capacityMinutes) || 0);
    const overload = planned > capacity && capacity > 0 ? 1 : 0;
    const distractions = lifeText(body.distractions, 200);
    const sleepHours = Number(body.sleepHours) || 0;
    const health = lifeText(body.health, 100);
    const note = lifeText(body.note, 1000);
    // 一天只保留一条记录：与 refreshLifeDerived 的自动汇总对称，避免同一天出现两行
    const [exist] = await pool.query('SELECT id FROM life_energy_logs WHERE log_date = ? LIMIT 1', [logDate]);
    if (exist.length) {
      await pool.execute(
        'UPDATE life_energy_logs SET planned_minutes = ?, capacity_minutes = ?, overload = ?, distractions = ?, sleep_hours = ?, health = ?, note = ? WHERE id = ?',
        [planned, capacity, overload, distractions, sleepHours, health, note, exist[0].id]
      );
    } else {
      await pool.execute(
        'INSERT INTO life_energy_logs (id, log_date, planned_minutes, capacity_minutes, overload, distractions, sleep_hours, health, note, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
        [crypto.randomUUID(), logDate, planned, capacity, overload, distractions, sleepHours, health, note, Date.now()]
      );
    }
    await refreshLifeDerived('精力负荷评估', ['精力负荷', '变更日志'], distractions || '面板手动记录', `记录 ${logDate}：计划 ${planned} 分钟 / 上限 ${capacity} 分钟${overload ? '（超负荷）' : ''}`);
    const [rows] = await pool.query('SELECT * FROM life_energy_logs ORDER BY log_date DESC LIMIT 60');
    res.json({ logs: rows.map(lifeEnergyOut), planned: await lifePlannedMinutes(todayStr()) });
  } catch (err) {
    console.error('记录精力负荷失败:', err);
    res.status(500).json({ error: err.message || '记录失败' });
  }
});

// 技能档案
app.get('/api/life/skills', async (req, res) => {
  try {
    const [rows] = await pool.query('SELECT * FROM life_skill_profile ORDER BY sort_order ASC, created_at ASC');
    res.json({ skills: rows.map(lifeSkillOut) });
  } catch (err) {
    console.error('获取技能档案失败:', err);
    res.status(500).json({ error: err.message || '获取失败' });
  }
});

app.post('/api/life/skills', async (req, res) => {
  try {
    const body = req.body || {};
    const id = crypto.randomUUID();
    const now = Date.now();
    await pool.execute('INSERT INTO life_skill_profile (id, category, name, level, note, sort_order, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
      [id, LIFE_SKILL_CATEGORY.includes(body.category) ? body.category : 'own', lifeText(body.name, 120), lifeText(body.level, 32), lifeText(body.note, 200), Math.max(0, Number(body.sortOrder) || 0), now, now]);
    await logLifePanelChange('个人技能档案', `新增技能「${lifeText(body.name, 60)}」`, '面板手动新增');
    const [rows] = await pool.query('SELECT * FROM life_skill_profile ORDER BY sort_order ASC, created_at ASC');
    res.json({ skills: rows.map(lifeSkillOut) });
  } catch (err) {
    console.error('新增技能失败:', err);
    res.status(500).json({ error: err.message || '新增失败' });
  }
});

app.put('/api/life/skills/:id', async (req, res) => {
  try {
    const map = { category: 'category', name: 'name', level: 'level', note: 'note', sortOrder: 'sort_order' };
    const fields = [];
    const values = [];
    for (const key of Object.keys(map)) {
      if (req.body[key] === undefined) continue;
      fields.push(`${map[key]} = ?`);
      if (key === 'category') values.push(LIFE_SKILL_CATEGORY.includes(req.body[key]) ? req.body[key] : 'own');
      else if (key === 'sortOrder') values.push(Math.max(0, Number(req.body[key]) || 0));
      else values.push(lifeText(req.body[key], 200));
    }
    if (fields.length) {
      fields.push('updated_at = ?');
      values.push(Date.now(), req.params.id);
      await pool.execute(`UPDATE life_skill_profile SET ${fields.join(', ')} WHERE id = ?`, values);
      await logLifePanelChange('个人技能档案', `修改技能「${lifeText(req.body.name || req.params.id, 60)}」`, '面板手动修改');
    }
    const [rows] = await pool.query('SELECT * FROM life_skill_profile ORDER BY sort_order ASC, created_at ASC');
    res.json({ skills: rows.map(lifeSkillOut) });
  } catch (err) {
    console.error('修改技能失败:', err);
    res.status(500).json({ error: err.message || '修改失败' });
  }
});

app.delete('/api/life/skills/:id', async (req, res) => {
  try {
    await pool.execute('DELETE FROM life_skill_profile WHERE id = ?', [req.params.id]);
    const [rows] = await pool.query('SELECT * FROM life_skill_profile ORDER BY sort_order ASC, created_at ASC');
    res.json({ skills: rows.map(lifeSkillOut) });
  } catch (err) {
    console.error('删除技能失败:', err);
    res.status(500).json({ error: err.message || '删除失败' });
  }
});

// ===== 全局人物画像（用户模型）：跨所有根目标的统一画像，AI 生成计划 / 判断短板 / 推演未来分支的数据源 =====
// 6 大维度固定：硬能力 / 时间与行为习惯 / 性格与心智特质 / 资源 / 目标价值偏好 / 风险与短板
const LIFE_PERSONA_DIMS = [
  { key: 'hardSkills', col: 'hard_skills', label: '硬能力', hint: '语言能力、专业技术、其他技能、证明材料、能力成长曲线（有客观依据、可量化）' },
  { key: 'timeHabits', col: 'time_habits', label: '时间与行为习惯', hint: '可用时段、任务履约特征、耐力指标、拖延模式、偏好（由打卡数据自动统计）' },
  { key: 'traits', col: 'traits', label: '性格与心智特质', hint: '风险偏好、目标倾向性、抗压能力、决策特点、执行力（由对话 + 行为客观推断）' },
  { key: 'resources', col: 'resources', label: '资源', hint: '资金状况、硬件资源、人脉资源、地域约束' },
  { key: 'valuesPref', col: 'values_pref', label: '目标价值偏好', hint: '优先级排序、取舍倾向、生活诉求' },
  { key: 'risks', col: 'risks', label: '风险与短板', hint: '薄弱能力项、行为短板、外部风险（预警用）' }
];

function lifePersonaOut(row) {
  const out = { id: row?.id || '', source: row?.source || 'user', updatedAt: Number(row?.updated_at) || 0 };
  for (const dim of LIFE_PERSONA_DIMS) out[dim.key] = String(row?.[dim.col] || '');
  return out;
}

async function readLifePersonaRow() {
  const [rows] = await pool.query('SELECT * FROM life_persona ORDER BY updated_at DESC LIMIT 1');
  return rows[0] || null;
}

app.get('/api/life/persona', async (req, res) => {
  try {
    const row = await readLifePersonaRow();
    res.json({
      persona: lifePersonaOut(row),
      dims: LIFE_PERSONA_DIMS.map(({ key, label, hint }) => ({ key, label, hint })),
      // 动态画像（由右侧规划完成度反推）：与手填的 6 维并列返回，前端挂在画像树的最外层
      derived: lifeDerivedOut(await readLifeDerivedRow()),
      derivedDims: LIFE_PERSONA_DERIVED_DIMS.map(({ key, label, hint }) => ({ key, label, hint }))
    });
  } catch (err) {
    console.error('获取人物画像失败:', err);
    res.status(500).json({ error: err.message || '获取失败' });
  }
});

app.put('/api/life/persona', async (req, res) => {
  try {
    const body = req.body || {};
    const now = Date.now();
    let row = await readLifePersonaRow();
    if (!row) {
      const id = crypto.randomUUID();
      await pool.execute(
        `INSERT INTO life_persona (id, hard_skills, time_habits, traits, resources, values_pref, risks, source, created_at, updated_at) VALUES (?, '', '', '', '', '', '', 'user', ?, ?)`,
        [id, now, now]
      );
      row = await readLifePersonaRow();
    }
    const fields = [];
    const values = [];
    for (const dim of LIFE_PERSONA_DIMS) {
      if (body[dim.key] === undefined) continue;
      fields.push(`${dim.col} = ?`);
      values.push(lifeText(body[dim.key], 6000));
    }
    if (!fields.length) return res.json({ persona: lifePersonaOut(row) });
    fields.push('source = ?'); values.push('user');
    fields.push('updated_at = ?'); values.push(now);
    values.push(row.id);
    await pool.execute(`UPDATE life_persona SET ${fields.join(', ')} WHERE id = ?`, values);
    const updated = await readLifePersonaRow();
    res.json({ persona: lifePersonaOut(updated) });
  } catch (err) {
    console.error('保存人物画像失败:', err);
    res.status(500).json({ error: err.message || '保存失败' });
  }
});

// 动态画像重算：前端每次刷新完规划就调一次，指纹没变会直接复用缓存（几乎零成本）
app.post('/api/life/persona/derived/refresh', async (req, res) => {
  try {
    const derived = await deriveLifePersona(lifeText(req.body?.reason, 40) || '面板刷新');
    res.json({ derived: derived || lifeDerivedOut(await readLifeDerivedRow()), derivedDims: LIFE_PERSONA_DERIVED_DIMS.map(({ key, label, hint }) => ({ key, label, hint })) });
  } catch (err) {
    console.error('重算动态画像失败:', err);
    res.status(500).json({ error: err.message || '重算失败' });
  }
});

// ===== 未来可选发展路径库：画像的衍生模块，每条路径带适配得分 / 优势 / 代价 / 前置 / 长期推演 =====
function lifePathOut(row) {
  return {
    id: row.id,
    name: row.name || '',
    advantages: row.advantages || '',
    risks: row.risks || '',
    prerequisites: row.prerequisites || '',
    evolution: row.evolution || '',
    score: Number(row.score) || 0,
    nodeId: row.node_id || '',
    source: row.source || 'user',
    sortOrder: Number(row.sort_order) || 0
  };
}

async function listLifePaths() {
  const [rows] = await pool.query('SELECT * FROM life_future_paths ORDER BY sort_order ASC, created_at ASC');
  return rows.map(lifePathOut);
}

app.get('/api/life/paths', async (req, res) => {
  try {
    res.json({ items: await listLifePaths() });
  } catch (err) {
    console.error('获取发展路径库失败:', err);
    res.status(500).json({ error: err.message || '获取失败' });
  }
});

app.post('/api/life/paths', async (req, res) => {
  try {
    const body = req.body || {};
    const now = Date.now();
    const id = crypto.randomUUID();
    await pool.execute(
      'INSERT INTO life_future_paths (id, name, advantages, risks, prerequisites, evolution, score, node_id, source, sort_order, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
      [id, lifeText(body.name, 120), lifeText(body.advantages, 4000), lifeText(body.risks, 4000), lifeText(body.prerequisites, 2000), lifeText(body.evolution, 4000), Math.max(0, Math.min(100, Math.round(Number(body.score) || 0))), lifeText(body.nodeId, 64), lifeText(body.source, 8) || 'user', Math.max(0, Math.round(Number(body.sortOrder) || 0)), now, now]
    );
    res.json({ items: await listLifePaths() });
  } catch (err) {
    console.error('新增发展路径失败:', err);
    res.status(500).json({ error: err.message || '新增失败' });
  }
});

app.put('/api/life/paths/:id', async (req, res) => {
  try {
    const body = req.body || {};
    const fields = [];
    const values = [];
    const map = { name: 'name', advantages: 'advantages', risks: 'risks', prerequisites: 'prerequisites', evolution: 'evolution', nodeId: 'node_id' };
    for (const [key, col] of Object.entries(map)) {
      if (body[key] === undefined) continue;
      fields.push(`${col} = ?`);
      values.push(lifeText(body[key], key === 'name' ? 120 : 4000));
    }
    if (body.score !== undefined) { fields.push('score = ?'); values.push(Math.max(0, Math.min(100, Math.round(Number(body.score) || 0)))); }
    if (body.sortOrder !== undefined) { fields.push('sort_order = ?'); values.push(Math.max(0, Math.round(Number(body.sortOrder) || 0))); }
    if (!fields.length) return res.json({ items: await listLifePaths() });
    fields.push('updated_at = ?'); values.push(Date.now());
    values.push(String(req.params.id));
    await pool.execute(`UPDATE life_future_paths SET ${fields.join(', ')} WHERE id = ?`, values);
    res.json({ items: await listLifePaths() });
  } catch (err) {
    console.error('更新发展路径失败:', err);
    res.status(500).json({ error: err.message || '更新失败' });
  }
});

app.delete('/api/life/paths/:id', async (req, res) => {
  try {
    await pool.execute('DELETE FROM life_future_paths WHERE id = ?', [String(req.params.id)]);
    res.json({ items: await listLifePaths() });
  } catch (err) {
    console.error('删除发展路径失败:', err);
    res.status(500).json({ error: err.message || '删除失败' });
  }
});

// 学习知识库
app.get('/api/life/knowledge', async (req, res) => {
  try {
    const [rows] = await pool.query('SELECT * FROM life_knowledge ORDER BY created_at DESC LIMIT 300');
    const items = rows.map(lifeKnowledgeOut);
    const today = todayStr();
    res.json({ items, due: items.filter(item => item.nextReviewDate && item.nextReviewDate <= today) });
  } catch (err) {
    console.error('获取学习知识库失败:', err);
    res.status(500).json({ error: err.message || '获取失败' });
  }
});

app.post('/api/life/knowledge', async (req, res) => {
  try {
    const body = req.body || {};
    const id = crypto.randomUUID();
    const now = Date.now();
    const baseDate = todayStr();
    await pool.execute(
      'INSERT INTO life_knowledge (id, subject, topic, content, wrong_questions, tags, review_stage, next_review_date, source, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
      [id, lifeText(body.subject, 32), lifeText(body.topic, 120), lifeText(body.content, 4000), lifeText(body.wrongQuestions, 4000), lifeText(body.tags, 120), 0, lifeNextReviewDate(baseDate, 0), lifeText(body.source, 16) || 'user', now, now]
    );
    await refreshLifeDerived('个人学习知识库', ['知识库', '变更日志', '重点提醒'], '面板手动新增', `新增知识点「${lifeText(body.topic, 60)}」`);
    const [rows] = await pool.query('SELECT * FROM life_knowledge ORDER BY created_at DESC LIMIT 300');
    res.json({ items: rows.map(lifeKnowledgeOut) });
  } catch (err) {
    console.error('新增知识点失败:', err);
    res.status(500).json({ error: err.message || '新增失败' });
  }
});

app.put('/api/life/knowledge/:id', async (req, res) => {
  try {
    const map = { subject: 'subject', topic: 'topic', content: 'content', wrongQuestions: 'wrong_questions', tags: 'tags' };
    const fields = [];
    const values = [];
    for (const key of Object.keys(map)) {
      if (req.body[key] === undefined) continue;
      fields.push(`${map[key]} = ?`);
      values.push(lifeText(req.body[key], key === 'subject' || key === 'tags' ? 120 : 4000));
    }
    if (fields.length) {
      fields.push('updated_at = ?');
      values.push(Date.now(), req.params.id);
      await pool.execute(`UPDATE life_knowledge SET ${fields.join(', ')} WHERE id = ?`, values);
      await refreshLifeDerived('个人学习知识库', ['知识库', '变更日志', '重点提醒'], '面板手动修改', `修改知识点「${lifeText(req.body.topic || req.params.id, 60)}」`);
    }
    const [rows] = await pool.query('SELECT * FROM life_knowledge ORDER BY created_at DESC LIMIT 300');
    res.json({ items: rows.map(lifeKnowledgeOut) });
  } catch (err) {
    console.error('修改知识点失败:', err);
    res.status(500).json({ error: err.message || '修改失败' });
  }
});

app.delete('/api/life/knowledge/:id', async (req, res) => {
  try {
    const [rows] = await pool.query('SELECT topic FROM life_knowledge WHERE id = ? LIMIT 1', [req.params.id]);
    await pool.execute('DELETE FROM life_knowledge WHERE id = ?', [req.params.id]);
    await refreshLifeDerived('个人学习知识库', ['知识库', '变更日志', '重点提醒'], '面板手动删除', `删除知识点「${lifeText(rows[0]?.topic || req.params.id, 60)}」`);
    const [list] = await pool.query('SELECT * FROM life_knowledge ORDER BY created_at DESC LIMIT 300');
    res.json({ items: list.map(lifeKnowledgeOut) });
  } catch (err) {
    console.error('删除知识点失败:', err);
    res.status(500).json({ error: err.message || '删除失败' });
  }
});

// 间隔重复：推进复习阶段并重算下次复习日
app.post('/api/life/knowledge/:id/review', async (req, res) => {
  try {
    const [rows] = await pool.query('SELECT * FROM life_knowledge WHERE id = ? LIMIT 1', [req.params.id]);
    if (!rows.length) return res.status(404).json({ error: '知识点不存在' });
    const item = rows[0];
    const stage = Math.min(LIFE_REVIEW_OFFSETS.length - 1, (Number(item.review_stage) || 0) + 1);
    const baseDate = lifeDateOf(item.created_at);
    const next = lifeNextReviewDate(baseDate, stage);
    await pool.execute('UPDATE life_knowledge SET review_stage = ?, next_review_date = ?, updated_at = ? WHERE id = ?', [stage, next, Date.now(), item.id]);
    await refreshLifeDerived('个人学习知识库', ['知识库', '变更日志', '重点提醒'], next ? `下次复习 ${next}` : '已掌握，退出复习队列', `推进复习「${lifeText(item.topic, 60)}」至第 ${stage} 阶段`);
    const [list] = await pool.query('SELECT * FROM life_knowledge ORDER BY created_at DESC LIMIT 300');
    res.json({ items: list.map(lifeKnowledgeOut) });
  } catch (err) {
    console.error('推进复习失败:', err);
    res.status(500).json({ error: err.message || '操作失败' });
  }
});

// 外部事件日历
app.get('/api/life/events', async (req, res) => {
  try {
    const [rows] = await pool.query('SELECT * FROM life_calendar_events ORDER BY event_date ASC LIMIT 200');
    res.json({ events: rows.map(lifeEventOut) });
  } catch (err) {
    console.error('获取外部事件失败:', err);
    res.status(500).json({ error: err.message || '获取失败' });
  }
});

app.post('/api/life/events', async (req, res) => {
  try {
    const body = req.body || {};
    const id = crypto.randomUUID();
    const now = Date.now();
    await pool.execute(
      'INSERT INTO life_calendar_events (id, title, event_date, category, level, remind_days, status, note, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
      [id, lifeText(body.title, 120), lifeText(body.date, 10), lifeText(body.category, 32), ['high', 'mid', 'low'].includes(body.level) ? body.level : 'mid', lifeText(body.remindDays, 32) || '30,7,1', lifeText(body.status, 16) || 'pending', lifeText(body.note, 1000), now, now]
    );
    await refreshLifeDerived('外部事件日历', ['外部事件', '变更日志', '重点提醒'], '面板手动新增', `新增事件「${lifeText(body.title, 60)}」${lifeText(body.date, 10) ? `，${lifeText(body.date, 10)}` : ''}`);
    const [rows] = await pool.query('SELECT * FROM life_calendar_events ORDER BY event_date ASC LIMIT 200');
    res.json({ events: rows.map(lifeEventOut) });
  } catch (err) {
    console.error('新增外部事件失败:', err);
    res.status(500).json({ error: err.message || '新增失败' });
  }
});

app.put('/api/life/events/:id', async (req, res) => {
  try {
    const map = { title: 'title', date: 'event_date', category: 'category', level: 'level', remindDays: 'remind_days', status: 'status', note: 'note' };
    const fields = [];
    const values = [];
    for (const key of Object.keys(map)) {
      if (req.body[key] === undefined) continue;
      fields.push(`${map[key]} = ?`);
      if (key === 'level') values.push(['high', 'mid', 'low'].includes(req.body[key]) ? req.body[key] : 'mid');
      else values.push(lifeText(req.body[key], key === 'note' ? 1000 : 120));
    }
    if (fields.length) {
      fields.push('updated_at = ?');
      values.push(Date.now(), req.params.id);
      await pool.execute(`UPDATE life_calendar_events SET ${fields.join(', ')} WHERE id = ?`, values);
      await refreshLifeDerived('外部事件日历', ['外部事件', '变更日志', '重点提醒'], '面板手动修改', `修改事件「${lifeText(req.body.title || req.params.id, 60)}」`);
    }
    const [rows] = await pool.query('SELECT * FROM life_calendar_events ORDER BY event_date ASC LIMIT 200');
    res.json({ events: rows.map(lifeEventOut) });
  } catch (err) {
    console.error('修改外部事件失败:', err);
    res.status(500).json({ error: err.message || '修改失败' });
  }
});

app.delete('/api/life/events/:id', async (req, res) => {
  try {
    const [rows] = await pool.query('SELECT title FROM life_calendar_events WHERE id = ? LIMIT 1', [req.params.id]);
    await pool.execute('DELETE FROM life_calendar_events WHERE id = ?', [req.params.id]);
    await refreshLifeDerived('外部事件日历', ['外部事件', '变更日志', '重点提醒'], '面板手动删除', `删除事件「${lifeText(rows[0]?.title || req.params.id, 60)}」`);
    const [list] = await pool.query('SELECT * FROM life_calendar_events ORDER BY event_date ASC LIMIT 200');
    res.json({ events: list.map(lifeEventOut) });
  } catch (err) {
    console.error('删除外部事件失败:', err);
    res.status(500).json({ error: err.message || '删除失败' });
  }
});

// 变更日志
app.get('/api/life/changes', async (req, res) => {
  try {
    const [rows] = await pool.query('SELECT * FROM life_change_logs ORDER BY created_at DESC LIMIT 200');
    res.json({ changes: rows.map(lifeChangeOut) });
  } catch (err) {
    console.error('获取变更日志失败:', err);
    res.status(500).json({ error: err.message || '获取失败' });
  }
});

// 重点提醒区
app.get('/api/life/alerts', async (req, res) => {
  try {
    res.json({ alerts: await lifeAlerts(), stats: await lifeProgressStats() });
  } catch (err) {
    console.error('获取重点提醒失败:', err);
    res.status(500).json({ error: err.message || '获取失败' });
  }
});

// ========== 每日备注 API ==========

// 获取某天的备注
app.get('/api/notes/:date', async (req, res) => {
  try {
    const { date } = req.params;
    const [rows] = await pool.execute('SELECT * FROM daily_notes WHERE note_date = ? LIMIT 1', [date]);
    if (rows.length === 0) {
      res.json({ date, content: '' });
    } else {
      res.json({ date, content: rows[0].content || '' });
    }
  } catch (err) {
    console.error('获取备注失败:', err);
    res.status(500).json({ error: '获取失败' });
  }
});

// 保存某天的备注
app.put('/api/notes/:date', async (req, res) => {
  try {
    const { date } = req.params;
    const { content } = req.body;
    const now = Date.now();
    const [existing] = await pool.execute('SELECT id FROM daily_notes WHERE note_date = ? LIMIT 1', [date]);
    if (existing.length > 0) {
      await pool.execute('UPDATE daily_notes SET content = ?, updated_at = ? WHERE id = ?', [content || '', now, existing[0].id]);
    } else {
      const id = crypto.randomUUID();
      await pool.execute(
        'INSERT INTO daily_notes (id, note_date, content, created_at, updated_at) VALUES (?, ?, ?, ?, ?)',
        [id, date, content || '', now, now]
      );
    }
    res.json({ ok: true });
  } catch (err) {
    console.error('保存备注失败:', err);
    res.status(500).json({ error: '保存失败' });
  }
});

// ========== 练题 API ==========

// 获取所有题目
app.get('/api/quiz', async (req, res) => {
  try {
    const [rows] = await pool.query('SELECT * FROM quiz_questions ORDER BY created_at DESC');
    res.json(rows.map(r => ({
      id: r.id,
      stockName: r.stock_name,
      stockCode: r.stock_code,
      quizDate: r.quiz_date,
      image: r.image,
      correctAnswer: r.correct_answer || '',
      note: r.note || '',
      createdAt: r.created_at
    })));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 上传练题图片
app.post('/api/quiz/upload-image', (req, res) => {
  quizUpload.single('image')(req, res, (err) => {
    if (err) {
      console.error('上传练题图片错误:', err);
      return res.status(400).json({ error: err.message || '上传失败' });
    }
    if (!req.file) return res.status(400).json({ error: '未上传文件' });
    res.json({ imagePath: 'uploads/quiz/' + req.file.filename });
  });
});

// 新增题目
app.post('/api/quiz', async (req, res) => {
  try {
    const { stockName, stockCode, quizDate, image, correctAnswer, note } = req.body;
    const id = genId();
    const now = Date.now();
    await pool.execute(
      'INSERT INTO quiz_questions (id, stock_name, stock_code, quiz_date, image, correct_answer, note, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
      [id, stockName || '', stockCode || '', quizDate || '', image || '', correctAnswer || '', note || '', now]
    );
    res.json({ id, stockName, stockCode, quizDate, image, correctAnswer, note });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 更新题目
app.put('/api/quiz/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const fields = [];
    const values = [];
    const allowed = { stockName: 'stock_name', stockCode: 'stock_code', quizDate: 'quiz_date', image: 'image', correctAnswer: 'correct_answer', note: 'note' };
    for (const [key, col] of Object.entries(allowed)) {
      if (req.body[key] !== undefined) {
        fields.push(`${col} = ?`);
        values.push(req.body[key]);
      }
    }
    if (fields.length === 0) return res.json({ ok: true });
    values.push(id);
    await pool.execute(`UPDATE quiz_questions SET ${fields.join(', ')} WHERE id = ?`, values);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 删除题目
app.delete('/api/quiz/:id', async (req, res) => {
  try {
    const { id } = req.params;
    await pool.execute('DELETE FROM quiz_answers WHERE question_id = ?', [id]);
    await pool.execute('DELETE FROM quiz_questions WHERE id = ?', [id]);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 保存答题记录
app.post('/api/quiz/answer', async (req, res) => {
  try {
    const { questionId, userAnswer, aiEvaluation } = req.body;
    if (!questionId) return res.status(400).json({ error: '缺少题目ID' });
    const id = genId();
    const now = Date.now();
    await pool.execute(
      'INSERT INTO quiz_answers (id, question_id, user_answer, ai_evaluation, created_at) VALUES (?, ?, ?, ?, ?)',
      [id, questionId, userAnswer || '', aiEvaluation || '', now]
    );
    res.json({ id });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 获取某题目的答题记录
app.get('/api/quiz/answers/:questionId', async (req, res) => {
  try {
    const [rows] = await pool.query(
      'SELECT * FROM quiz_answers WHERE question_id = ? ORDER BY created_at DESC',
      [req.params.questionId]
    );
    res.json(rows.map(r => ({
      id: r.id,
      questionId: r.question_id,
      userAnswer: r.user_answer || '',
      aiEvaluation: r.ai_evaluation || '',
      createdAt: r.created_at
    })));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// AI 答题评价
app.post('/api/quiz/evaluate', async (req, res) => {
  try {
    const { questionId, userAnswer, model } = req.body;
    if (!questionId || !userAnswer || !userAnswer.trim()) {
      return res.status(400).json({ error: '缺少题目ID或用户答案' });
    }

    const [rows] = await pool.query('SELECT * FROM quiz_questions WHERE id = ?', [questionId]);
    if (rows.length === 0) return res.status(404).json({ error: '题目不存在' });
    const question = rows[0];

    const userAnswerTrimmed = userAnswer.trim();
    const correctAnswer = question.correct_answer ? question.correct_answer.trim() : '';

    let systemPrompt, userPrompt;

    if (correctAnswer) {
      // 有正确答案：严格对比评价
      systemPrompt = `你是严格的股票集合竞价分析评分专家。你必须严格对比用户的答案与正确答案，核心判断（如趋势方向：上涨/下跌/震荡/洗盘/出货等）必须一致才能给高匹配度。

评分标准：
- 核心判断完全相反（如正确答案是"震荡洗盘"，用户答"超级下跌"）：匹配度 0-15%，必须明确指出核心判断错误。
- 核心判断方向相反（如正确答案是"洗盘"，用户答"出货"）：匹配度 20-40%，指出方向性错误。
- 核心判断大致接近但有偏差：匹配度 50-70%。
- 核心判断基本正确，细节有遗漏：匹配度 75-90%。
- 核心判断完全正确，分析全面：匹配度 90-100%。

请按以下格式输出：
1. 匹配度：X%
2. 核心判断对比（明确指出是否一致）
3. 亮点
4. 不足
5. 改进建议
6. 鼓励语`;
      userPrompt = `题目：${question.stock_name}（${question.stock_code}）${question.quiz_date} 集合竞价分析

正确答案：${correctAnswer}

用户答案：${userAnswerTrimmed}

请严格对比评价。重点检查：用户的核心趋势判断（上涨/下跌/震荡/洗盘/出货等）是否与正确答案一致。如果不一致，必须明确指出来，不能给面子分。`;
    } else {
      // 无正确答案：AI自行分析图片
      systemPrompt = `你是股票集合竞价分析专家。评价用户的分析是否合理，给出专业补充。用中文回复，简洁明了。`;

      const hasImage = question.image && question.image.startsWith('uploads/');

      userPrompt = `题目：${question.stock_name}（${question.stock_code}）${question.quiz_date} 集合竞价分析

${question.note ? '备注：' + question.note : ''}

用户答案：${userAnswerTrimmed}

${hasImage ? '请根据图片和用户答案进行评价。' : '（该题目暂无图片）'}`;
    }

    // 调用 Agnes AI
    const aiResponse = await callAI(systemPrompt, userPrompt, question.image, model || 'agnes');
    res.json({ evaluation: aiResponse });
  } catch (err) {
    console.error('AI评价失败:', err);
    res.status(500).json({ error: 'AI评价失败: ' + err.message });
  }
});

// AI提取推荐逻辑：给定原文和股票列表，AI从原文中提取每只股票对应的推荐逻辑
app.post('/api/wechat/ai/extract-logic', async (req, res) => {
  try {
    const { originalText, stocks } = req.body || {}
    if (!originalText || !Array.isArray(stocks) || !stocks.length) {
      return res.status(400).json({ error: '需要原文和股票列表' })
    }
    
    // 过滤掉没有代码的股票
    const validStocks = stocks.filter(s => s && s.code)
    if (!validStocks.length) {
      return res.json({ results: stocks.map(s => ({ name: s.name, code: s.code || '', logic: '', matched: false })) })
    }
    
    const stockList = validStocks.map(s => `${s.name}(${s.code})`).join('、')
    const systemPrompt = `你是一个股票推荐逻辑提取助手。你的任务是从一段文本中，为每只股票提取其对应的推荐逻辑/理由。

要求：
1. 从原文中提取每只股票对应的推荐逻辑，逻辑必须是原文中出现的短语或关键词的组合
2. 如果原文中没有明确提到某只股票，则返回空字符串
3. 输出JSON数组格式：[{"name": "股票名", "code": "代码", "logic": "提取的逻辑", "matched": true/false}]
4. 推荐逻辑应简洁，提取原文中的关键短语，用"+"连接
5. 只输出JSON数组，不要其他文字说明
6. 如果某只股票找不到匹配的逻辑，logic设为空字符串，matched设为false`;
    
    const userPrompt = `原文：${originalText}\n\n需要提取的股票列表：${stockList}\n\n请从原文中为每只股票提取对应的推荐逻辑。`;
    
    let results = []
    try {
      const aiResult = await callAI(systemPrompt, userPrompt, null, 'agnes-2.0-flash', 30000, 2000)
      if (aiResult && !aiResult.startsWith('⚠️')) {
        const jsonMatch = aiResult.match(/\[[\s\S]*?\]/)
        if (jsonMatch) {
          results = JSON.parse(jsonMatch[0])
        }
      }
    } catch (aiErr) {
      console.warn('[ai-extract-logic] AI 调用失败，返回空结果:', aiErr.message)
    }
    
    // 确保结果格式正确
    if (!Array.isArray(results) || !results.length) {
      results = validStocks.map(s => ({ name: s.name, code: s.code, logic: '', matched: false }))
    }
    
    res.json({ results })
  } catch (err) {
    console.error('[ai-extract-logic] 失败:', err.message)
    // 降级：返回空结果而不是 500，避免前端控制台噪音
    res.json({ results: (req.body?.stocks || []).map(s => ({ name: s.name, code: s.code || '', logic: '', matched: false })) })
  }
})

// 保存推荐逻辑训练样本
app.post('/api/wechat/logic/train', async (req, res) => {
  try {
    const { eventId, originalText, stocks, sender } = req.body || {}
    if (!eventId || !originalText || !Array.isArray(stocks)) {
      return res.status(400).json({ error: '参数不完整' })
    }
    
    // 保存到训练样本表
    await pool.execute(`
      INSERT INTO wechat_logic_training (event_id, original_text, stocks_json, sender, created_at)
      VALUES (?, ?, ?, ?, ?)
      ON DUPLICATE KEY UPDATE stocks_json=VALUES(stocks_json)
    `, [
      eventId,
      originalText,
      JSON.stringify(stocks),
      sender || '',
      Date.now()
    ])
    
    res.json({ success: true })
  } catch (err) {
    console.error('[logic-train] 失败:', err.message)
    res.status(500).json({ error: err.message })
  }
})

// 获取所有训练数据（推荐逻辑训练样本 + 分类反馈 + 追踪数据），支持分页
app.get('/api/wechat/training-data', async (req, res) => {
  try {
    const page = Math.max(1, parseInt(req.query.page) || 1)
    const pageSize = Math.min(200, Math.max(10, parseInt(req.query.pageSize) || 50))
    const offset = (page - 1) * pageSize

    // 推荐逻辑样本
    const [logicSamples] = await pool.query(`
      SELECT event_id, original_text, stocks_json, sender, created_at
      FROM wechat_logic_training
      ORDER BY created_at DESC
      LIMIT ? OFFSET ?
    `, [pageSize, offset])
    const [[{ logicTotal }]] = await pool.query(`SELECT COUNT(*) AS logicTotal FROM wechat_logic_training`)

    // 分类反馈
    const [feedbackSamples] = await pool.query(`
      SELECT id, event_id, message_text, predicted_category, user_correct, user_corrected_category, learned_keywords, created_at
      FROM wechat_category_feedback
      ORDER BY created_at DESC
      LIMIT ? OFFSET ?
    `, [pageSize, offset])
    const [[{ fbTotal }]] = await pool.query(`SELECT COUNT(*) AS fbTotal FROM wechat_category_feedback`)

    // 学习规则
    const [learnedRules] = await pool.query(`
      SELECT id, category, keyword, weight, correct_count, wrong_count, created_at
      FROM wechat_category_rules
      ORDER BY created_at DESC
      LIMIT ? OFFSET ?
    `, [pageSize, offset])
    const [[{ lrTotal }]] = await pool.query(`SELECT COUNT(*) AS lrTotal FROM wechat_category_rules`)

    // 系统规则
    const [systemRules] = await pool.query(`
      SELECT id, category, rule_type, pattern, enabled, weight, description, created_at
      FROM wechat_category_system_rules
      ORDER BY created_at DESC
      LIMIT ? OFFSET ?
    `, [pageSize, offset])
    const [[{ srTotal }]] = await pool.query(`SELECT COUNT(*) AS srTotal FROM wechat_category_system_rules`)

    // 追踪数据（推票追踪记录）
    const [trackingData] = await pool.query(`
      SELECT id, event_id, sender, stock_code, stock_name, pick_date, pick_open_price, pick_close_price,
             pick_change_percent, latest_date, latest_close_price, total_change_percent, total_change_amount,
             locked, pick_message
      FROM wechat_tracking
      ORDER BY pick_date DESC
      LIMIT ? OFFSET ?
    `, [pageSize, offset])
    const [[{ trTotal }]] = await pool.query(`SELECT COUNT(*) AS trTotal FROM wechat_tracking`)

    res.json({
      logicSamples: logicSamples.map(s => ({
        ...s,
        stocks: s.stocks_json ? JSON.parse(s.stocks_json) : []
      })),
      feedbackSamples: feedbackSamples.map(f => ({
        ...f,
        learned_keywords: f.learned_keywords ? (typeof f.learned_keywords === 'string' ? JSON.parse(f.learned_keywords) : f.learned_keywords) : []
      })),
      learnedRules,
      systemRules,
      trackingData,
      pagination: { page, pageSize, logicTotal, fbTotal, lrTotal, srTotal, trTotal },
    })
  } catch (err) {
    console.error('[training-data] 获取失败:', err.message)
    res.status(500).json({ error: err.message })
  }
})

// 通用 AI 调用函数（支持多模型）
// 在用户自助接入的自定义模型里查找模型名对应的配置
async function findCustomModel(model) {
  const list = await getCustomModels();
  return list.find(item => item && (item.id === model || (Array.isArray(item.models) && item.models.includes(model)))) || null;
}

// 解析模型配置：内置模型走官方地址与官方密钥，自定义模型走用户接入的地址与密钥
async function prepareModel(model) {
  if (typeof model !== 'string' || !model || model.length > 200) throw new Error('不支持的模型，请选择官网模型');
  // 用户显式接入的模型优先于内置前缀猜测：避免同名模型被错误路由到官方地址与官方 Key
  const custom = await findCustomModel(model);
  const isBuiltin = !custom && /^(?:agnes$|agnes-|glm-)/.test(model);
  if (!custom && !isBuiltin) throw new Error('不支持的模型，请在设置中接入该模型');

  const isGlm = !custom && model.startsWith('glm-');
  const isAgnes = !custom && (model === 'agnes' || model.startsWith('agnes-'));
  const provider = custom ? (custom.id || 'custom') : (isGlm ? 'glm' : 'agnes');
  const providerName = custom ? (custom.name || model) : ({ agnes: 'Agnes', glm: '智谱GLM' }[provider] || provider);
  const apiKey = await getUserSecret(custom ? custom.keyField : `${provider}_api_key`);
  const resolvedModel = model === 'agnes' ? 'agnes-2.5-flash' : model;
  const config = custom
    ? {
      url: String(custom.baseUrl || '').replace(/\/+$/, '') + (String(custom.path || '/chat/completions').startsWith('/') ? String(custom.path || '/chat/completions') : `/${custom.path}`),
      model: resolvedModel,
      authStyle: custom.authStyle === 'x-api-key' ? 'x-api-key' : 'bearer',
      apiStyle: custom.apiStyle === 'anthropic' ? 'anthropic' : 'openai'
    }
    : {
      url: isAgnes ? 'https://apihub.agnes-ai.com/v1/chat/completions' : 'https://open.bigmodel.cn/api/paas/v4/chat/completions',
      model: resolvedModel,
      authStyle: 'bearer',
      apiStyle: 'openai'
    };
  return { custom, isGlm, isAgnes, provider, providerName, apiKey, resolvedModel, config };
}

// 联网检索工具定义（OpenAI Function Calling 协议）
const WEB_SEARCH_TOOL = [{
  type: 'function',
  function: {
    name: 'web_search',
    description: '联网查询实时资料：行业就业与薪资、考试升学政策与时间、理财资产、健康营养、生活消费与政策、技能学习方案、法律法规、人际关系研究结论。可并列提出多个关键词；同一问题最多检索 3 次，超出上限的需求会转入待审批队列，因此优先把最关键的查询一次提全',
    parameters: { type: 'object', properties: { q: { type: 'string', description: '搜索关键词' } }, required: ['q'] }
  }
}];

// 带工具调用的单轮请求：仅 OpenAI 兼容协议可用，返回模型原始消息对象供调用方判断是否发起检索
async function callAIChatWithTools(model, messages, tools, timeoutMs = 40000, maxTokens = 800) {
  const { apiKey, providerName, isGlm, config } = await prepareModel(model);
  if (!apiKey) return { error: `未配置 ${providerName} API Key` };
  // Anthropic 协议请求体结构不同，此处只走 OpenAI 兼容协议；不支持时由调用方记录提示，本次不联网
  if (config.apiStyle !== 'openai') return { unsupported: true };

  const headers = { 'Content-Type': 'application/json' };
  if (config.authStyle === 'x-api-key') headers['x-api-key'] = apiKey;
  else headers['Authorization'] = `Bearer ${apiKey}`;

  const response = await fetch(config.url, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      model: config.model,
      messages,
      tools,
      tool_choice: 'auto',
      temperature: 0.2,
      max_tokens: maxTokens,
      ...(isGlm ? { thinking: { type: 'disabled' } } : {})
    }),
    signal: AbortSignal.timeout(timeoutMs)
  });
  if (!response.ok) {
    const errText = await response.text().catch(() => '');
    throw new Error(`AI API 请求失败 (${response.status}): ${errText.slice(0, 200)}`);
  }
  const data = await response.json();
  return { message: data.choices?.[0]?.message || {} };
}

async function callAI(systemPrompt, userPrompt, imagePath, model = 'agnes', timeoutMs = 30000, maxTokens = 800) {
  const startTime = Date.now();
  const { isGlm, provider, providerName, apiKey, resolvedModel, config } = await prepareModel(model);
  if (!apiKey) {
    const msg = `⚠️ 未配置 ${providerName} API Key，请在设置中配置。`;
    // 记录无 Key 日志
    try {
      await pool.execute(
        'INSERT INTO ai_logs (model, provider, system_prompt_len, user_prompt_len, response_len, duration_ms, success, error_msg, request_content) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
        [model, provider, systemPrompt.length, userPrompt.length, 0, Date.now() - startTime, 0, msg, `[系统提示] ${systemPrompt}\n\n[用户输入] ${userPrompt}`]
      );
    } catch (_) {}
    return msg;
  }

  // 图像场景下 GLM 需要切到视觉模型
  if (imagePath && isGlm && !/v(?:-|$)/.test(model) && !model.includes('thinking-flash')) {
    config.model = 'glm-4.6v-flash';
  }

  const messages = [
    { role: 'system', content: systemPrompt }
  ];

  // 构建用户消息
  if (imagePath && imagePath.startsWith('uploads/')) {
    const fullPath = tenantUploadPath(imagePath);
    if (fs.existsSync(fullPath)) {
      const imageBuffer = fs.readFileSync(fullPath);
      const ext = path.extname(imagePath).toLowerCase();
      const mimeMap = { '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.gif': 'image/gif', '.webp': 'image/webp' };
      const mimeType = mimeMap[ext] || 'image/jpeg';
      const base64 = imageBuffer.toString('base64');
      const dataUrl = `data:${mimeType};base64,${base64}`;
      messages.push({
        role: 'user',
        content: [
          { type: 'text', text: userPrompt },
          { type: 'image_url', image_url: { url: dataUrl } }
        ]
      });
    } else {
      messages.push({ role: 'user', content: userPrompt });
    }
  } else {
    messages.push({ role: 'user', content: userPrompt });
  }

  let content = '';
  let success = true;
  let errorMsg = '';
  let requestContent = '';
  try {
    // 构建请求内容文本（用于日志）
    requestContent = `[系统提示] ${systemPrompt}\n\n[用户输入] ${userPrompt}`;
    if (imagePath && imagePath.startsWith('uploads/')) {
      requestContent += `\n[图片] ${imagePath}`;
    }
    const isAnthropic = config.apiStyle === 'anthropic';
    const headers = { 'Content-Type': 'application/json' };
    if (config.authStyle === 'x-api-key') headers['x-api-key'] = apiKey;
    else headers['Authorization'] = `Bearer ${apiKey}`;
    if (isAnthropic) headers['anthropic-version'] = '2023-06-01';

    const response = await fetch(config.url, {
      method: 'POST',
      headers,
      body: JSON.stringify(isAnthropic
        ? { model: config.model, system: systemPrompt, messages: messages.filter(item => item.role !== 'system'), max_tokens: maxTokens }
        : {
          model: config.model,
          messages,
          temperature: 0.2,
          max_tokens: maxTokens,
          ...(isGlm ? { thinking: { type: 'disabled' } } : {})
        }),
      signal: AbortSignal.timeout(timeoutMs)
    });

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`AI API 请求失败 (${response.status}): ${errText}`);
    }

    const data = await response.json();
    if (isAnthropic) {
      // Anthropic 兼容响应：content 为内容块数组
      content = Array.isArray(data.content)
        ? (data.content.map(item => item?.text || '').join('') || 'AI 未返回有效结果')
        : (data.content || 'AI 未返回有效结果');
    } else {
      const msg = data.choices?.[0]?.message;
      content = msg?.content;
      // 推理模型可能 content 为空但 reasoning_content 有值
      if ((!content || (typeof content === 'string' && !content.trim())) && msg?.reasoning_content) {
        content = msg.reasoning_content;
      }
      if (Array.isArray(content)) {
        content = content.map(item => item?.text || '').join('') || 'AI 未返回有效结果';
      } else {
        content = content || 'AI 未返回有效结果';
      }
    }
  } catch (err) {
    success = false;
    errorMsg = err.message || String(err);
    throw err;
  } finally {
    const duration = Date.now() - startTime;
    // 截断内容，避免数据库过大
    const truncate = (str, maxLen) => !str ? '' : str.length > maxLen ? str.slice(0, maxLen) + `\n...(已截断, 共${str.length}字符)` : str;
    // 记录 AI 调用日志
    try {
      await pool.execute(
        'INSERT INTO ai_logs (model, provider, system_prompt_len, user_prompt_len, response_len, duration_ms, success, error_msg, request_content, response_content) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
        [resolvedModel, provider, systemPrompt.length, userPrompt.length, (content || '').length, duration, success ? 1 : 0, errorMsg, truncate(requestContent, 2000), truncate(content, 2000)]
      );
    } catch (_) { /* 日志记录失败不影响主流程 */ }

    // 统计 AI 调用次数（成功才统计）
    if (success) {
      try {
        const today = new Date().toISOString().split('T')[0];
        await pool.execute(
          'INSERT INTO ai_usage (date, model, count) VALUES (?, ?, 1) ON DUPLICATE KEY UPDATE count = count + 1',
          [today, resolvedModel]
        );
      } catch (_) { /* 统计失败不影响主流程 */ }
    }
  }

  return content;
}

// AI 自动补全推荐逻辑：当推票消息的股票没有 logic 时，异步调用 AI 从原文提取
async function autoFillStockLogic(eventId, messageText, stocks) {
  try {
    if (!eventId || !messageText || !Array.isArray(stocks) || !stocks.length) return;
    // 只处理有股票但 logic 为空的
    const needFill = stocks.filter(s => s && s.code && !s.logic);
    if (!needFill.length) return;

    const stockList = stocks.map(s => `${s.name}(${s.code})`).join('、');
    const systemPrompt = `你是一个股票推荐逻辑提取助手。你的任务是从一段文本中，为每只股票提取其对应的推荐逻辑/理由。

要求：
1. 从原文中提取每只股票对应的推荐逻辑，逻辑必须是原文中出现的短语或关键词的组合
2. 如果原文中没有明确提到某只股票的推荐逻辑，则返回空字符串
3. 输出JSON数组格式：[{"name": "股票名", "code": "代码", "logic": "提取的逻辑", "matched": true/false}]
4. 推荐逻辑应简洁，提取原文中的关键短语，用"+"连接
5. 只输出JSON数组，不要其他文字说明
6. 如果某只股票找不到匹配的逻辑，logic设为空字符串，matched设为false
7. 不要编造或臆测逻辑，只从原文中提取真实存在的内容`;
    const userPrompt = `原文：${messageText}\n\n需要提取的股票列表：${stockList}\n\n请从原文中为每只股票提取对应的推荐逻辑。`;
    const result = await callAI(systemPrompt, userPrompt, null, 'agnes-2.0-flash', 30000, 2000);

    let aiResults = [];
    try {
      const jsonMatch = result.match(/\[[\s\S]*?\]/);
      if (jsonMatch) aiResults = JSON.parse(jsonMatch[0]);
    } catch (_) {}

    if (!Array.isArray(aiResults) || !aiResults.length) return;

    // 合并 AI 提取的逻辑到 stocks
    let updated = false;
    for (const ai of aiResults) {
      if (!ai.code || !ai.logic) continue;
      const stock = stocks.find(s => String(s.code) === String(ai.code));
      if (stock && !stock.logic) {
        stock.logic = ai.logic;
        updated = true;
      }
    }

    if (updated) {
      const db = pool;
      await db.execute('UPDATE wechat_events SET stocks_json = ? WHERE id = ?', [JSON.stringify(stocks), eventId]);
      // 同步更新内存
      const idx = monitorState.events.findIndex(e => e.id === eventId);
      if (idx >= 0) {
        monitorState.events[idx].stocks = stocks;
        monitorState.events[idx].lastUpdated = Date.now();
      }
      console.log(`[AI补全逻辑] 消息 ${eventId} 已自动补全推荐逻辑`);
    }
  } catch (err) {
    console.error('[AI补全逻辑] 失败:', err.message);
  }
}

// 多图 AI 调用
async function callAIMultiImage(systemPrompt, userPrompt, imagePaths, model = 'glm-4.6v', timeoutMs = 60000, maxTokens = 2000) {
  if (typeof model !== 'string' || !/^(?:agnes$|agnes-|glm-)/.test(model) || model.length > 100) throw new Error('不支持的模型，请选择官网模型');
  const startTime = Date.now();
  const isGlm = model.startsWith('glm-');
  const provider = isGlm ? 'glm' : 'agnes';
  const apiKey = await getUserSecret(`${provider}_api_key`);
  if (!apiKey) {
    const msg = `⚠️ 未配置 ${isGlm ? '智谱GLM' : 'Agnes'} API Key，请在设置中配置。`;
    try {
      await pool.execute(
        'INSERT INTO ai_logs (model, provider, system_prompt_len, user_prompt_len, response_len, duration_ms, success, error_msg, request_content) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
        [model, provider, systemPrompt.length, userPrompt.length, 0, Date.now() - startTime, 0, msg, `[系统提示] ${systemPrompt}\n\n[用户输入] ${userPrompt}\n[图片数] ${imagePaths.length}`]
      );
    } catch (_) {}
    return msg;
  }

  let resolvedModel = model;
  if (model === 'agnes') resolvedModel = 'agnes-2.5-flash';
  const isAgnes = model === 'agnes' || model.startsWith('agnes-');
  const config = isAgnes
    ? { url: 'https://apihub.agnes-ai.com/v1/chat/completions', model: resolvedModel }
    : { url: 'https://open.bigmodel.cn/api/paas/v4/chat/completions', model: resolvedModel };

  // 构建多图消息
  const contentParts = [{ type: 'text', text: userPrompt }];
  for (const imgPath of imagePaths) {
    const fullPath = tenantUploadPath(imgPath);
    if (fs.existsSync(fullPath)) {
      const imageBuffer = fs.readFileSync(fullPath);
      const ext = path.extname(imgPath).toLowerCase();
      const mimeMap = { '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.gif': 'image/gif', '.webp': 'image/webp' };
      const mimeType = mimeMap[ext] || 'image/jpeg';
      const base64 = imageBuffer.toString('base64');
      contentParts.push({ type: 'image_url', image_url: { url: `data:${mimeType};base64,${base64}` } });
    }
  }

  const messages = [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: contentParts }
  ];

  const requestContent = `[系统提示] ${systemPrompt}\n\n[用户输入] ${userPrompt}\n[图片数] ${imagePaths.length}`;

  let content = '';
  let success = true;
  let errorMsg = '';
  try {
    const response = await fetch(config.url, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: config.model,
        messages,
        temperature: 0.2,
        max_tokens: maxTokens,
        ...(isGlm ? { thinking: { type: 'disabled' } } : {})
      }),
      signal: AbortSignal.timeout(timeoutMs)
    });

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`AI API 请求失败 (${response.status}): ${errText}`);
    }

    const data = await response.json();
    const msg = data.choices?.[0]?.message;
    content = msg?.content;
    // 推理模型可能 content 为空但 reasoning_content 有值
    if ((!content || (typeof content === 'string' && !content.trim())) && msg?.reasoning_content) {
      content = msg.reasoning_content;
    }
    if (Array.isArray(content)) {
      content = content.map(item => item?.text || '').join('') || 'AI 未返回有效结果';
    } else {
      content = content || 'AI 未返回有效结果';
    }
  } catch (err) {
    success = false;
    errorMsg = err.message || String(err);
    throw err;
  } finally {
    const duration = Date.now() - startTime;
    const truncate = (str, maxLen) => !str ? '' : str.length > maxLen ? str.slice(0, maxLen) + `\n...(已截断, 共${str.length}字符)` : str;
    try {
      await pool.execute(
        'INSERT INTO ai_logs (model, provider, system_prompt_len, user_prompt_len, response_len, duration_ms, success, error_msg, request_content, response_content) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
        [resolvedModel, provider, systemPrompt.length, userPrompt.length, (content || '').length, duration, success ? 1 : 0, errorMsg, truncate(requestContent, 2000), truncate(content, 2000)]
      );
    } catch (_) {}

    if (success) {
      try {
        const today = new Date().toISOString().split('T')[0];
        await pool.execute(
          'INSERT INTO ai_usage (date, model, count) VALUES (?, ?, 1) ON DUPLICATE KEY UPDATE count = count + 1',
          [today, resolvedModel]
        );
      } catch (_) {}
    }
  }

  return content;
}

// 向后兼容
async function callAgnesAI(systemPrompt, userPrompt, imagePath, timeoutMs = 30000, maxTokens = 800) {
  return callAI(systemPrompt, userPrompt, imagePath, 'agnes', timeoutMs, maxTokens);
}

const SERVER_START_TIME = Date.now();

app.get('/api/heartbeat', (req, res) => {
  res.json({ startTime: SERVER_START_TIME });
});

// 黄金价格缓存（同一轮询周期内复用，避免重复消耗 ALAPI 配额）
const goldCaches = new Map();

app.get('/api/gold-price', async (req, res) => {
  let goldCache = goldCaches.get(req.user.id) || { price: null, lastFetchAt: 0 };
  const forceRefresh = req.query.force === '1' || req.query.force === 'true';
  const CACHE_TTL = 60 * 1000; // 1分钟内复用缓存（防止前端短时多次刷新）
  const now = Date.now();
  if (!forceRefresh && goldCache.price && (now - goldCache.lastFetchAt) < CACHE_TTL) {
    console.log('[GoldPrice] Cache hit, price =', goldCache.price, 'age =', Math.round((now - goldCache.lastFetchAt) / 1000), 's');
    return res.json({
      price: goldCache.price,
      source: goldCache.source,
      market: goldCache.market,
      updatedAt: goldCache.updatedAt,
      fetchedAt: goldCache.fetchedAt,
      internationalPriceUsd: goldCache.internationalPriceUsd,
      cached: true
    });
  }

  const cacheBuster = `_t=${now}`;
  const alapiToken = await getUserSecret('alapi_token');
  let international = null;
  try {
    const response = await fetch(`https://api.gold-api.com/price/XAU?${cacheBuster}`, { signal: AbortSignal.timeout(8000), headers: { 'Cache-Control': 'no-cache' } });
    if (response.ok) {
      const data = await response.json();
      const price = Number(data?.price);
      if (Number.isFinite(price) && price > 0) international = { price, updatedAt: data.updatedAt || '' };
    }
  } catch (error) {
    console.warn('gold-api.com detail failed:', error.message);
  }

  const sendPrice = (price, source, market = 'AU9999', internationalPriceUsd = 0) => {
    const payload = {
      price: Number(Number(price).toFixed(2)),
      source,
      market,
      updatedAt: new Date().toISOString(),
      fetchedAt: new Date().toISOString(),
      internationalPriceUsd: Number(internationalPriceUsd || international?.price || 0)
    };
    goldCache = { ...payload, lastFetchAt: Date.now() };
    if (goldCaches.size > 1000) goldCaches.delete(goldCaches.keys().next().value);
    goldCaches.set(req.user.id, goldCache);
    return res.json(payload);
  };

  if (alapiToken) {
    try {
      const response = await fetch('https://v3.alapi.cn/api/gold', {
        method: 'POST',
        signal: AbortSignal.timeout(8000),
        headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-cache' },
        body: JSON.stringify({ token: alapiToken, market: 'LF' })
      });
      const data = await response.json();
      if (data?.success && data?.data && Array.isArray(data.data)) {
        const gold = data.data.find(d => d.symbol === 'Au') || data.data[0];
        const price = Number(gold.sell_price || gold.buy_price);
        if (Number.isFinite(price) && price > 0) {
          return sendPrice(price, 'ALAPI', 'LF', 0);
        }
      }
    } catch (error) {
      console.warn('ALAPI LF failed:', error.message);
    }
    try {
      const response = await fetch('https://v3.alapi.cn/api/gold', {
        method: 'POST',
        signal: AbortSignal.timeout(8000),
        headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-cache' },
        body: JSON.stringify({ token: alapiToken, market: 'SH' })
      });
      const data = await response.json();
      if (data?.success && data?.data && Array.isArray(data.data)) {
        const gold = data.data.find(d => d.symbol === 'Au') || data.data.find(d => d.name?.includes('黄金')) || data.data[0];
        const price = Number(gold.sell_price || gold.buy_price);
        if (Number.isFinite(price) && price > 0) {
          return sendPrice(price, 'ALAPI-SH', 'SH', 0);
        }
      }
    } catch (error) {
      console.warn('ALAPI SH failed:', error.message);
    }
  }

  try {
    const response = await fetch(`https://api.freejk.com/shuju/jinjia/?${cacheBuster}`, { signal: AbortSignal.timeout(8000), headers: { 'Cache-Control': 'no-cache' } });
    const data = await response.json();
    const row = data?.data || data || {};
    const price = Number(row.price || row.AU9999 || row.au9999);
    const london = Number(row.london_gold || row.xauusd || row.international_price || row.usd || 0);
    if (Number.isFinite(price) && price > 0) return sendPrice(price, 'freejk', 'AU9999', london);
  } catch (error) {
    console.warn('freejk failed:', error.message);
  }

  try {
    const response = await fetch(`https://xaus.com/api/v1/spot?currency=CNY&unit=gram&${cacheBuster}`, { signal: AbortSignal.timeout(8000), headers: { 'Cache-Control': 'no-cache' } });
    const data = await response.json();
    const price = Number(data?.xau?.price || data?.price_gram_24k || data?.price);
    const london = Number(data?.xau?.usd_ounce || data?.price_usd_ounce || 0);
    if (Number.isFinite(price) && price > 0) return sendPrice(price, 'xaus', 'XAU/CNY', london);
  } catch (error) {
    console.warn('xaus failed:', error.message);
  }

  try {
    const response = await fetch(`https://metalmetric.com/api/gpt?action=spot_prices&${cacheBuster}`, { signal: AbortSignal.timeout(8000), headers: { 'Cache-Control': 'no-cache' } });
    const data = await response.json();
    const usdOunce = Number(data?.gold || data?.XAU || data?.price);
    if (Number.isFinite(usdOunce) && usdOunce > 0) {
      const cnyGram = usdOunce * 7.25 / 31.1034768;
      return sendPrice(cnyGram, 'metalmetric', 'XAU/CNY', usdOunce);
    }
  } catch (error) {
    console.warn('metalmetric failed:', error.message);
  }

  // 所有源失败：返回缓存（如果有）
  if (goldCache.price) {
    console.log('[GoldPrice] All sources failed, return cached price =', goldCache.price);
    return res.json({
      price: goldCache.price,
      source: goldCache.source + '-cached',
      market: goldCache.market,
      updatedAt: goldCache.updatedAt,
      fetchedAt: goldCache.fetchedAt,
      internationalPriceUsd: goldCache.internationalPriceUsd,
      cached: true
    });
  }

  res.status(503).json({ error: 'gold_price_unavailable' });
});

// 股票现价接口（腾讯财经，国内极速、无key、无403）
// 腾讯行情接口统一返回 GBK 编码，用这个函数解码而不是 response.text()
async function fetchGbkText(resp) {
  if (typeof resp.arrayBuffer === 'function') {
    const buf = Buffer.from(await resp.arrayBuffer());
    return new TextDecoder('gbk').decode(buf);
  }
  const chunks = [];
  for await (const chunk of resp) chunks.push(Buffer.from(chunk));
  const buf = Buffer.concat(chunks);
  return new TextDecoder('gbk').decode(buf);
}

function stockCodeToTencent(code) {
  if (!code) return '';
  const c = String(code).trim();
  if (/^(6|5|9)/.test(c)) return 'sh' + c;
  if (/^(0|3|1)/.test(c)) return 'sz' + c;
  if (/^[48]/.test(c)) return 'bj' + c;
  return 'sh' + c;
}

app.get('/api/stock-price', async (req, res) => {
  try {
    const codes = String(req.query.codes || '').split(',').map(s => s.trim()).filter(Boolean);
    if (!codes.length) return res.json({ data: {}, source: 'tencent', fetchedAt: new Date().toISOString() });
    if (codes.length > 50) return res.status(400).json({ error: '单次最多50只' });

    const tencentCodes = codes.map(stockCodeToTencent).filter(Boolean).join(',');
    let text = '';
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const response = await fetch(`https://qt.gtimg.cn/q=${tencentCodes}`, {
          signal: AbortSignal.timeout(8000),
          headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' }
        });
        text = await fetchGbkText(response);
        if (text && text.includes('v_')) break;
      } catch (e) {
        if (attempt === 1) throw e;
      }
    }
    const result = {};
    const lines = text.split('\n').filter(Boolean);
    for (const line of lines) {
      const m = line.match(/v_(\w+)="([^"]*)"/);
      if (!m) continue;
      const fields = m[2].split('~');
      if (fields.length < 35) continue;
      const code = fields[2].replace(/^(sh|sz|bj)/, '');
      const price = Number(fields[3]);
      const prevClose = Number(fields[4]);
      const changePercent = Number(fields[32]);
      if (!Number.isFinite(price) || price <= 0) continue;
      result[code] = {
        price,
        prevClose,
        change: Number(fields[31]),
        changePercent,
        high: Number(fields[33]),
        low: Number(fields[34]),
        open: Number(fields[5]),
        name: fields[1],
        updatedAt: fields[30] || ''
      };
    }
    res.json({ data: result, source: 'tencent', fetchedAt: new Date().toISOString() });
  } catch (err) {
    console.error('stock-price failed:', err.message);
    res.json({ data: {}, source: 'tencent', error: 'unavailable', message: err.message, fetchedAt: new Date().toISOString() });
  }
});

// 根据股票代码查询名称
app.get('/api/stock/name/:code', async (req, res) => {
  try {
    const code = String(req.params.code || '').trim();
    if (!/^\d{6}$/.test(code)) return res.status(400).json({ error: '股票代码必须为6位数字' });
    const tencentCode = stockCodeToTencent(code);
    if (!tencentCode) return res.status(400).json({ error: '无效的股票代码' });
    const response = await fetch(`https://qt.gtimg.cn/q=${tencentCode}`, {
      signal: AbortSignal.timeout(5000),
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' }
    });
    // 腾讯接口返回 GBK 编码
    const text = await fetchGbkText(response);
    const m = text.match(/v_(\w+)="([^"]*)"/);
    if (!m) return res.json({ code, name: '' });
    const fields = m[2].split('~');
    const name = fields[1] || '';
    res.json({ code, name });
  } catch (err) {
    console.error('stock name lookup failed:', err.message);
    res.status(503).json({ error: '查询失败', message: err.message });
  }
});

// 根据股票名称搜索代码
app.get('/api/stock/search', async (req, res) => {
  try {
    const name = String(req.query.name || '').trim();
    if (!name || name.length < 2) return res.status(400).json({ error: '名称至少2个字符' });
    const url = `https://searchapi.eastmoney.com/api/suggest/get?input=${encodeURIComponent(name)}&type=14&token=D43BF722C8E33BDC906FB84D85E326E8&count=5`;
    const response = await fetch(url, {
      signal: AbortSignal.timeout(5000),
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' }
    });
    const data = await response.json();
    const results = (data?.QuotationCodeTable?.Data || []).map(item => ({
      code: item.Code || '',
      name: item.Name || '',
      market: item.Market || '',
    })).filter(item => item.code && /^\d{6}$/.test(item.code));
    res.json({ results });
  } catch (err) {
    console.error('stock search failed:', err.message);
    res.status(503).json({ error: '查询失败', message: err.message });
  }
});

// 获取股票日K线历史（腾讯日线接口，前复权）
// 返回数组：[{ date, open, close, high, low, volume }, ...]
// days: 至少需要的交易日天数（会自动放大count避免被截断）
// 判断给定日期是否A股交易日（简易版：周末不算，节假日不精准但能覆盖绝大多数情况）
function isWeekend(date) {
  const d = typeof date === 'string' ? new Date(date + 'T00:00:00+08:00') : new Date(date);
  const w = d.getDay();
  return w === 0 || w === 6;
}
function todayStr() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
function hkNow() {
  const d = new Date();
  // 转北京时间
  return new Date(d.toLocaleString('en-US', { timeZone: 'Asia/Shanghai' }));
}
// 9:30 之后可以请求到今日开盘价；15:00 之后今日收盘价基本锁定
function todayTradingStatus() {
  const now = hkNow();
  const dateStr = todayStr();
  if (isWeekend(dateStr)) return { isTradingDay: false, openAvailable: false, closeFinal: false };
  const h = now.getHours();
  const m = now.getMinutes();
  const mins = h * 60 + m;
  return {
    isTradingDay: true,
    openAvailable: mins >= 9 * 60 + 30,   // 9:30 后开盘价就有了
    closeFinal: mins >= 15 * 60,          // 15:00 后收盘基本确定（尾盘竞价到15:00）
  };
}

// 计算两个日期之间的自然天数差（b - a，不足1天的向上取整到1）
function dateDiffDays(dateA, dateB) {
  if (!dateA || !dateB) return null;
  const a = new Date(dateA + 'T00:00:00+08:00').getTime();
  const b = new Date(dateB + 'T00:00:00+08:00').getTime();
  const days = Math.round((b - a) / (24 * 3600 * 1000));
  return days >= 0 ? days : null;
}
// 计算持仓天数（交易日口径，基于 wechat_tracking_daily 的 day_index）
// 但列表接口不查 daily 表，退而求其次用 latest_date - pick_date 的自然日差
function computeHoldingDays(r, today) {
  // 有效止盈优先：effective_profit_day_index 就是交易日口径的持仓天数
  if (r.is_effective_profit && r.effective_profit_day_index !== null && r.effective_profit_day_index !== undefined) {
    return Number(r.effective_profit_day_index);
  }
  const pickDate = r.pick_date;
  const refDate = r.latest_date && r.latest_date > pickDate ? r.latest_date : today;
  const days = dateDiffDays(pickDate, refDate);
  // 尾盘买入(entry_type=1)：D0 尾盘才买，当天不算持仓，减 1
  const entryType = r.entry_type ?? 0;
  return entryType === 1 ? Math.max(0, days - 1) : days;
}

// ===== 日K本地缓存：从外部 API 拉取后落盘，避免每次重复请求，并支持离线回退 =====
const klineCacheDir = path.join(__dirname, '.cache', 'kline');
if (!fs.existsSync(klineCacheDir)) fs.mkdirSync(klineCacheDir, { recursive: true });
const KLINE_CACHE_TTL = 10 * 60 * 1000; // 10 分钟内视为新鲜，直接读本地缓存

function klineCachePath(stockCode) {
  return path.join(klineCacheDir, `${String(stockCode).replace(/[^0-9A-Za-z._-]/g, '')}.json`);
}
function readKlineCache(stockCode) {
  try {
    const obj = JSON.parse(fs.readFileSync(klineCachePath(stockCode), 'utf8'));
    return Array.isArray(obj?.bars) && obj.bars.length ? obj : null;
  } catch { return null; }
}
function writeKlineCache(stockCode, bars) {
  try { fs.writeFileSync(klineCachePath(stockCode), JSON.stringify({ savedAt: Date.now(), bars })); } catch {}
}

// 优先读本地缓存；缺失或过期则从外部 API 拉取并落盘；网络异常时退回旧缓存
async function fetchStockDailyHistory(stockCode, days = 30) {
  const cached = readKlineCache(stockCode);
  if (cached && Date.now() - cached.savedAt < KLINE_CACHE_TTL) return cached.bars;
  try {
    const bars = await fetchStockDailyHistoryRemote(stockCode, days);
    if (bars && bars.length) { writeKlineCache(stockCode, bars); return bars; }
    return cached ? cached.bars : [];
  } catch (error) {
    if (cached) return cached.bars;
    throw error;
  }
}

// ===== 汇率缓存：无 KEY 公共接口 fawazahmed0 =====
const forexCachePath = path.join(__dirname, '.cache', 'forex.json');
const FOREX_CACHE_TTL = 24 * 60 * 60 * 1000; // 1 天缓存，该接口每日更新一次

function readForexCache() {
  try { return JSON.parse(fs.readFileSync(forexCachePath, 'utf8')); } catch { return null; }
}
function writeForexCache(obj) {
  try { fs.writeFileSync(forexCachePath, JSON.stringify(obj)); } catch {}
}
// 受支持的计价货币，与前端 CURRENCY_META 保持一致
const FOREX_SUPPORTED = ['CNY', 'USD', 'EUR', 'JPY', 'HKD', 'GBP'];

// 上游 fawazahmed0 以 CNY 为基准返回小写币种键（usd/eur/...）：
// 这里统一转大写、只保留受支持币种、过滤非法值，缓存文件与接口返回格式保持一致
function normalizeForexRates(src) {
  const out = { CNY: 1 };
  for (const code of FOREX_SUPPORTED) {
    if (code === 'CNY') continue;
    const v = Number(src?.[code.toLowerCase()] ?? src?.[code]);
    if (Number.isFinite(v) && v > 0) out[code] = v;
  }
  return out;
}

async function fetchForexRates() {
  const cached = readForexCache();
  if (cached?.rates && Date.now() - cached.savedAt < FOREX_CACHE_TTL) {
    return { ...cached, rates: normalizeForexRates(cached.rates) };
  }
  try {
    const res = await fetch('https://cdn.jsdelivr.net/npm/@fawazahmed0/currency-api@latest/v1/currencies/cny.json', {
      signal: AbortSignal.timeout(10000),
      headers: { 'User-Agent': 'Mozilla/5.0' }
    });
    if (!res.ok) throw new Error('upstream ' + res.status);
    const json = await res.json();
    const saved = { savedAt: Date.now(), rates: normalizeForexRates(json?.cny) }; // 1 CNY = x 目标币
    writeForexCache(saved);
    return saved;
  } catch (e) {
    // 网络异常时退回旧缓存，确保离线可用
    return cached
      ? { ...cached, rates: normalizeForexRates(cached.rates) }
      : { savedAt: 0, rates: { CNY: 1 } };
  }
}

app.get('/api/forex/rates', async (req, res) => {
  try {
    const data = await fetchForexRates(); // 键名归一化已在 fetchForexRates 内完成
    res.json({ ok: true, savedAt: data.savedAt, rates: data.rates });
  } catch (e) {
    res.status(502).json({ ok: false, error: e.message });
  }
});

async function fetchStockDailyHistoryRemote(stockCode, days = 30) {
  const tencentCode = stockCodeToTencent(stockCode);
  if (!tencentCode) return [];
  // 日期范围放宽到 days*2 个日历日
  const end = new Date();
  const start = new Date(end.getTime() - days * 2 * 24 * 3600 * 1000);
  const fmt = d => `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`;
  const count = Math.max(days * 2, 320);
  const url = `https://web.ifzq.gtimg.cn/appstock/app/fqkline/get?param=${tencentCode},day,,,${count},qfq`;
  let response, text, json;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      response = await fetch(url, {
        signal: AbortSignal.timeout(8000),
        headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' }
      });
      text = await fetchGbkText(response);
      json = JSON.parse(text);
      break;
    } catch (e) {
      if (attempt === 1) throw e;
    }
  }
  const dataNode = json?.data?.[tencentCode];
  if (json?.code && json.code !== 0) return [];
  if (!dataNode) return [];
  const klines = dataNode.qfqday || dataNode.day || [];
  const history = klines.map(k => ({
    date: k[0],
    open: Number(k[1]),
    close: Number(k[2]),
    high: Number(k[3]),
    low: Number(k[4]),
    volume: Number(k[5]) || 0,
  })).filter(k => Number.isFinite(k.close) && k.close > 0);

  // ===== 补今日实时行情（K线接口只返回到上一个已收盘交易日）=====
  const today = todayStr();
  const last = history[history.length - 1];
  const status = todayTradingStatus();

  if (status.openAvailable && (!last || last.date < today)) {
    // K线里没有今天，用实时行情接口补上
    const rt = dataNode.qt?.[tencentCode];
    if (rt && rt.length >= 46) {
      // 腾讯 qt 字段映射：
      // [3]=现价 [4]=昨收 [5]=今开 [33]=最高 [34]=最低
      // [32]=涨跌幅(%) [30]=更新时间
      const nowPrice = Number(rt[3]);
      const open = Number(rt[5]);
      const high = Number(rt[33]);
      const low = Number(rt[34]);
      const updatedAt = String(rt[30] || '');
      if (Number.isFinite(open) && open > 0) {
        // 9:30 后开盘价就有了。15:00 之前"收盘"用现价，15:00 之后也可以用现价（已锁定）
        const todayClose = Number.isFinite(nowPrice) && nowPrice > 0 ? nowPrice : open;
        const highFinal = Number.isFinite(high) && high > 0 ? high : Math.max(open, todayClose);
        const lowFinal = Number.isFinite(low) && low > 0 ? low : Math.min(open, todayClose);
        history.push({
          date: today,
          open,
          close: todayClose,
          high: highFinal,
          low: lowFinal,
          volume: Number(rt[36]) || 0,
          isRealTime: true,
          updatedAt,
        });
      }
    }
  }

  return history;
}

// 根据发布日找到发布日收盘价和次日开盘价
// pickDate: 'YYYY-MM-DD' 或 'YYYY-M-D' 或时间戳
function findPickAndNextDay(history, pickDate) {
  if (!history || !history.length) return null;
  const target = normalizeDateStr(pickDate);
  if (!target) return null;
  // 找发布日：若当天停牌则取最近的下一个交易日
  let pickIndex = history.findIndex(k => k.date === target);
  if (pickIndex === -1) {
    // 取目标日之后的第一个交易日（目标日可能是非交易日）
    const after = history.findIndex(k => k.date > target);
    if (after === -1) return null;
    pickIndex = after;
  }
  const pick = history[pickIndex];
  const next = history[pickIndex + 1];
  if (!next) {
    return { pick, next: null, changePercent: null };
  }
  const changePercent = pick.close > 0
    ? Number((((next.open - pick.close) / pick.close) * 100).toFixed(2))
    : null;
  return { pick, next, changePercent };
}

function normalizeDateStr(input) {
  if (!input) return '';
  if (typeof input === 'number') {
    const d = new Date(input);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }
  const s = String(input).trim();
  // YYYY-MM-DD or YYYY-M-D
  const m = s.match(/(\d{4})[-./](\d{1,2})[-./](\d{1,2})/);
  if (m) {
    return `${m[1]}-${String(m[2]).padStart(2, '0')}-${String(m[3]).padStart(2, '0')}`;
  }
  // 时间戳
  if (/^\d+$/.test(s)) {
    const d = new Date(Number(s));
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }
  return '';
}

// 同步推票消息到追踪表（按 event + 股票 去重）
async function syncTrackingFromEvent(eventRow) {
  if (!eventRow || !eventRow.id) return;
  if (eventRow.category !== 'stock_pick') return;
  let stocks = [];
  try { stocks = JSON.parse(eventRow.stocks_json || '[]'); } catch {}
  if (!stocks.length) return;
  // sender 为空/未识别的先不同步追踪表，等识别到 sender 后再补（避免投资人分析里出现"未识别发送人"）
  if (!eventRow.sender || eventRow.sender === '未识别发送人') return;
  // message_time 通常只有时间(如 "10:30")，优先用 captured_at(ISO时间戳) 或 created_at(毫秒)
  const pickDate = normalizeDateStr(eventRow.captured_at) || normalizeDateStr(eventRow.created_at) || normalizeDateStr(eventRow.message_time);
  if (!pickDate) return;
  const now = Date.now();
  const db = pool;
  for (const stock of stocks) {
    if (!stock.code) continue;
    const trackingId = `${eventRow.id}_${stock.code}`;
    try {
      await db.execute(
        `INSERT IGNORE INTO wechat_tracking
          (id, event_id, chat_name, sender, stock_code, stock_name, pick_date, pick_message, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [trackingId, eventRow.id, eventRow.chat_name || '', eventRow.sender || '',
         stock.code, stock.name || '', pickDate, eventRow.message_text || '', now, now]
      );
    } catch (err) {
      console.error('sync tracking insert failed:', stock.code, err.message);
    }
  }
}

// 自动刷新指定事件关联的追踪股票价格（异步，不阻塞响应）
async function autoRefreshTrackingPrices(eventId) {
  try {
    const [trackings] = await pool.query(
      'SELECT id FROM wechat_tracking WHERE event_id = ?',
      [eventId]
    );
    for (const t of trackings) {
      try {
        await refreshTrackingPrices(t.id);
      } catch (e) {
        console.error(`auto refresh tracking ${t.id} failed:`, e.message);
      }
    }
  } catch (e) {
    console.error('autoRefreshTrackingPrices failed:', e.message);
  }
}

// 启动时同步所有含股票的消息到追踪表（确保历史消息中的股票被追踪）
// 注意：此函数需在 syncTrackingFromEvent 定义后调用
async function syncExistingTracking() {
  try {
    const [allEvents] = await pool.query(
      `SELECT * FROM wechat_events WHERE category = 'stock_pick' AND stocks_json != '[]' AND stocks_json IS NOT NULL ORDER BY created_at DESC`
    );
    let synced = 0;
    for (const ev of allEvents) {
      await syncTrackingFromEvent(ev);
      synced++;
    }
    if (synced > 0) {
      console.log(`启动同步追踪：已处理 ${synced} 条含股票的消息`);
    }
  } catch (e) {
    console.error('启动同步追踪失败:', e.message);
  }
}

// 刷新单条追踪记录：从推票日起每日股价 + 累计涨跌幅
async function refreshTrackingPrices(trackingId) {
  const [rows] = await pool.query('SELECT * FROM wechat_tracking WHERE id = ?', [trackingId]);
  if (!rows.length) throw new Error('追踪记录不存在');
  const t = rows[0];
  const isLocked = !!t.locked;
  // 已锁定的记录：不再跑 T+1 止盈判定，也不更新主表的 profit 字段，
  // 但仍需要 upsert daily 表的 close/high/low（收盘后官方K线数据要显示）
  // 取推票日之后 90 天的日K（足够覆盖长线追踪）
  const history = await fetchStockDailyHistory(t.stock_code, 120);
  if (!history.length) throw new Error(`无法获取 ${t.stock_code} 的历史K线`);

  const targetDate = normalizeDateStr(t.pick_date);
  let startIndex = history.findIndex(k => k.date === targetDate);
  if (startIndex === -1) {
    // 推票日非交易日，取推票日之后的第一个交易日作为推票日基准
    startIndex = history.findIndex(k => k.date > targetDate);
    if (startIndex === -1) throw new Error(`${t.stock_code} 推票日 ${targetDate} 之后无交易日数据`);
  }

  const entryType = t.entry_type ?? 0; // 0=开盘买入 1=尾盘买入
  const pickK = history[startIndex];
  const pickOpen = pickK.open;
  const pickClose = pickK.close;
  // 买入基准价：entry_type 决定
  const entryPrice = entryType === 1 ? pickClose : pickOpen;
  // 推票日涨跌（用户早盘买入按收盘 vs 开盘；尾盘买入按 D0 内部涨幅）
  const pickChangePercent = entryType === 1
    ? (pickOpen && pickOpen > 0 ? Number((((pickClose - pickOpen) / pickOpen) * 100).toFixed(2)) : null)
    : (pickOpen && pickOpen > 0 ? Number((((pickClose - pickOpen) / pickOpen) * 100).toFixed(2)) : null);

  // D1 开盘累计涨幅（用于 T+1 有效止盈判断）
  let d1OpenChangePercent = null;
  const hasD1 = startIndex + 1 < history.length;
  if (hasD1 && entryPrice > 0) {
    const d1Open = history[startIndex + 1].open;
    d1OpenChangePercent = Number((((d1Open - entryPrice) / entryPrice) * 100).toFixed(2));
  }

  // 写入每日记录（推票日及之后所有交易日）
  // 累计涨跌 = 当日收盘 vs 买入价 (entryPrice，统一基准)
  const now = Date.now();
  let latestClose = pickClose;
  let latestDate = pickK.date;
  for (let i = startIndex; i < history.length; i++) {
    const k = history[i];
    const dayIndex = i - startIndex;
    const dayChangeBase = dayIndex === 0
      ? k.open
      : (i > 0 ? history[i - 1].close : k.open);
    const dayChangePercent = dayChangeBase && dayChangeBase > 0
      ? Number((((k.close - dayChangeBase) / dayChangeBase) * 100).toFixed(2))
      : null;
    const totalChangePercent = entryPrice > 0
      ? Number((((k.close - entryPrice) / entryPrice) * 100).toFixed(2))
      : null;
    const totalChangeAmount = entryPrice > 0
      ? Number((k.close - entryPrice).toFixed(3))
      : null;
    const dailyId = `${trackingId}_${k.date}`;
    await pool.execute(
      `INSERT INTO wechat_tracking_daily
        (id, tracking_id, trade_date, day_index, open_price, close_price, high_price, low_price,
         day_change_percent, total_change_percent, total_change_amount, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE
        day_index=VALUES(day_index), open_price=VALUES(open_price), close_price=VALUES(close_price),
        high_price=VALUES(high_price), low_price=VALUES(low_price),
        day_change_percent=VALUES(day_change_percent), total_change_percent=VALUES(total_change_percent),
        total_change_amount=VALUES(total_change_amount), updated_at=VALUES(updated_at)`,
      [dailyId, trackingId, k.date, dayIndex, k.open, k.close, k.high, k.low,
       dayChangePercent, totalChangePercent, totalChangeAmount, now]
    );
    latestClose = k.close;
    latestDate = k.date;
  }

  // 累计涨跌幅（最新收盘 vs 买入价）
  const totalChangePercent = entryPrice > 0
    ? Number((((latestClose - entryPrice) / entryPrice) * 100).toFixed(2))
    : null;
  const totalChangeAmount = entryPrice > 0
    ? Number((latestClose - entryPrice).toFixed(3))
    : null;

  // ===== T+1 有效止盈判断（已锁定的不再重算） =====
  let isEffectiveProfit = 0;
  let effectiveProfitDayIndex = null;
  let effectiveProfitPercent = null;

  if (!isLocked) {
  const targetProfit = t.target_profit_percent || 5.00;

  // 计算第一次"有效止盈"的 day_index
  // 开盘买入(entry_type=0)：D0 涨幅 > target% 时，T+1 卖不出，需 D1 开盘仍 >= target% 才算有效
  // 尾盘买入(entry_type=1)：买入价=D0收盘，D0 涨幅永远 0，直接从 D1 起算
  let startSearchDay = 1; // 开盘买入：T+1 从 D1 起；尾盘买入：从 D1 起
  if (entryType === 0) {
    // 开盘买入才需要判断 D0 大涨
    const d0TotalPercent = pickOpen > 0
      ? Number((((pickClose - pickOpen) / pickOpen) * 100).toFixed(2))
    : null;
    if (d0TotalPercent !== null && d0TotalPercent > targetProfit) {
      if (hasD1 && d1OpenChangePercent !== null && d1OpenChangePercent >= targetProfit) {
        isEffectiveProfit = 1;
        effectiveProfitDayIndex = 1;
        effectiveProfitPercent = d1OpenChangePercent;
        startSearchDay = 2;
      }
    }
  }

  if (!isEffectiveProfit) {
    const [dailyRows] = await pool.query(
      'SELECT day_index, total_change_percent, high_price FROM wechat_tracking_daily WHERE tracking_id = ? AND day_index >= ? ORDER BY day_index ASC',
      [trackingId, startSearchDay]
    );
    for (const dr of dailyRows) {
      const closePct = Number(dr.total_change_percent);
      let highPct = null;
      const highPrice = Number(dr.high_price);
      if (highPrice && highPrice > 0 && entryPrice > 0) {
        highPct = Number((((highPrice - entryPrice) / entryPrice) * 100).toFixed(2));
      }
      const bestPct = highPct !== null && closePct !== null
        ? Math.max(highPct, closePct)
        : (highPct !== null ? highPct : closePct);
      if (bestPct !== null && bestPct >= targetProfit) {
        isEffectiveProfit = 1;
        effectiveProfitDayIndex = Number(dr.day_index);
        effectiveProfitPercent = Number(bestPct.toFixed(2));
        break;
      }
    }
  }
  } // end if (!isLocked)

  // 已锁定：daily upsert 照常（写收盘后 K 线 close/high/low），
  // 但主表不再更新任何字段（profit 冻结，累计涨跌保持盘中锁定时的值）
  if (!isLocked) {
  // 构建 UPDATE 语句
  await pool.execute(
    `UPDATE wechat_tracking
     SET pick_open_price = ?, pick_close_price = ?, pick_change_percent = ?,
         latest_date = ?, latest_close_price = ?,
         total_change_percent = ?, total_change_amount = ?,
         d1_open_change_percent = ?,
         is_effective_profit = ?,
         effective_profit_day_index = ?,
         effective_profit_percent = ?,
         updated_at = ?
     WHERE id = ?`,
    [pickOpen, pickClose, pickChangePercent, latestDate, latestClose,
     totalChangePercent, totalChangeAmount, d1OpenChangePercent,
     isEffectiveProfit, effectiveProfitDayIndex, effectiveProfitPercent,
     now, trackingId]
  );
  }

  // 交易时段（含竞价 9:15 起）：用腾讯实时行情覆盖 DB 的收盘价为实时价
  if (!isLocked && isTradingTime()) {
    try {
      const qtCode = stockCodeToTencent(t.stock_code);
      const qtResp = await fetch(`https://qt.gtimg.cn/q=${qtCode}`, {
        signal: AbortSignal.timeout(4000),
        headers: { 'User-Agent': 'Mozilla/5.0' }
      });
      const qtText = await fetchGbkText(qtResp);
      const qtMatch = qtText.match(/v_\w+="([^"]+)"/);
      if (qtMatch) {
        const qtFields = qtMatch[1].split('~');
        const p = Number(qtFields[3]);
        if (p > 0) {
          const rtTotalChangePercent = pickOpen > 0
            ? Number((((p - pickOpen) / pickOpen) * 100).toFixed(2))
            : null;
          const rtTotalChangeAmount = pickOpen > 0
            ? Number((p - pickOpen).toFixed(3))
            : null;
          await pool.execute(
            `UPDATE wechat_tracking
             SET latest_close_price = ?,
                 total_change_percent = ?,
                 total_change_amount = ?,
                 updated_at = ?
             WHERE id = ?`,
            [p, rtTotalChangePercent, rtTotalChangeAmount, Date.now(), trackingId]
          );
          latestClose = p;
          totalChangePercent = rtTotalChangePercent;
          totalChangeAmount = rtTotalChangeAmount;
        }
      }
    } catch (_) { /* 实时价失败就用日K数据 */ }
  }

  // 判断"今日是否盘中"（影响前端显示"现价"vs"收盘"）
  const status = todayTradingStatus();
  const pickIsToday = pickK.date === todayStr();
  const latestIsToday = latestDate === todayStr();
  const is盘中 = !status.closeFinal;  // 15:00 前都算盘中
  const pickCloseIsRealTime = pickIsToday && is盘中;
  const latestCloseIsRealTime = latestIsToday && is盘中;

  return {
    id: t.id,
    stockCode: t.stock_code,
    stockName: t.stock_name,
    pickDate: t.pick_date,
    pickOpenPrice: pickOpen,
    pickClosePrice: pickClose,
    pickCloseIsRealTime,
    pickChangePercent,
    d1OpenChangePercent,
    latestDate,
    latestClosePrice: latestClose,
    latestCloseIsRealTime,
    totalChangePercent,
    totalChangeAmount,
    isEffectiveProfit,
    effectiveProfitDayIndex,
    effectiveProfitPercent,
    locked: t.locked ? true : false,
    refreshedAt: new Date().toISOString(),
  };
}

// 投资人追踪：获取追踪列表（自动从最近的推票消息同步）
app.get('/api/wechat/tracking', async (req, res) => {
  try {
    const db = pool;
    const sender = String(req.query.sender || '').trim();
    const limit = Math.min(Number(req.query.limit) || 100, 500);

    // 自动同步：只把最近归类为推票且包含股票的消息补进追踪表。
    try {
      const [recentPicks] = await db.query(
        `SELECT * FROM wechat_events WHERE category = 'stock_pick' AND stocks_json != '[]' AND stocks_json IS NOT NULL ORDER BY created_at DESC LIMIT 200`
      );
      for (const ev of recentPicks) {
        await syncTrackingFromEvent(ev);
      }
    } catch (e) {
      console.error('auto sync tracking failed:', e.message);
    }

    let rows;
    if (sender) {
      [rows] = await db.query(
        `SELECT t.* FROM wechat_tracking t
         INNER JOIN (
           SELECT sender, stock_code, MIN(created_at) AS min_created
           FROM wechat_tracking WHERE sender = ? AND deleted_at IS NULL
           GROUP BY sender, stock_code
         ) g ON t.sender = g.sender AND t.stock_code = g.stock_code AND t.created_at = g.min_created AND t.deleted_at IS NULL
         ORDER BY t.pick_date DESC, t.created_at DESC LIMIT ?`,
        [sender, limit]
      );
    } else {
      [rows] = await db.query(
        `SELECT t.* FROM wechat_tracking t
         INNER JOIN (
           SELECT sender, stock_code, MIN(created_at) AS min_created
           FROM wechat_tracking WHERE deleted_at IS NULL
           GROUP BY sender, stock_code
         ) g ON t.sender = g.sender AND t.stock_code = g.stock_code AND t.created_at = g.min_created AND t.deleted_at IS NULL
         ORDER BY t.pick_date DESC, t.created_at DESC LIMIT ?`,
        [limit]
      );
    }
    const status = todayTradingStatus();
    const today = todayStr();
    const is盘中 = !status.closeFinal;

    // 交易时段：批量拉腾讯实时价，覆盖返回字段（让前端每次 load 都是最新数据）
    let rtPriceMap = {};
    if (isTradingTime() && rows.length) {
      const codes = rows.map(r => r.stock_code).filter(Boolean);
      rtPriceMap = await batchFetchRealtimePrices(codes);
    }

    const data = rows.map(r => {
      const pickCloseIsRealTime = r.pick_date === today && is盘中;
      const latestCloseIsRealTime = (r.latest_date || '') === today && is盘中;

      let latestClosePrice = r.latest_close_price !== null ? Number(r.latest_close_price) : null;
      let totalChangePercent = r.total_change_percent !== null ? Number(r.total_change_percent) : null;
      let totalChangeAmount = r.total_change_amount !== null ? Number(r.total_change_amount) : null;

      // 用实时价覆盖（如果拉到了的话）——已锁定的不覆盖，显示固化值
      const rtPrice = rtPriceMap[r.stock_code];
      const entryType = r.entry_type ?? 0;
      if (rtPrice && !r.locked) {
        const pickOpen = Number(r.pick_open_price);
        const pickClose = Number(r.pick_close_price);
        const entryPrice = entryType === 1 ? pickClose : pickOpen;
        if (entryPrice && entryPrice > 0) {
          latestClosePrice = rtPrice;
          totalChangePercent = Number((((rtPrice - entryPrice) / entryPrice) * 100).toFixed(2));
          totalChangeAmount = Number((rtPrice - entryPrice).toFixed(3));
        }
      }

      return {
        id: r.id,
        eventId: r.event_id,
        chatName: r.chat_name,
        sender: r.sender,
        stockCode: r.stock_code,
        stockName: r.stock_name,
        pickDate: r.pick_date,
        pickOpenPrice: r.pick_open_price !== null ? Number(r.pick_open_price) : null,
        pickClosePrice: r.pick_close_price !== null ? Number(r.pick_close_price) : null,
        pickCloseIsRealTime,
        pickChangePercent: r.pick_change_percent !== null ? Number(r.pick_change_percent) : null,
        d1OpenChangePercent: r.d1_open_change_percent !== null ? Number(r.d1_open_change_percent) : null,
        latestDate: r.latest_date || '',
        latestClosePrice,
        latestCloseIsRealTime: !r.locked && (latestCloseIsRealTime || !!rtPrice),
        totalChangePercent,
        totalChangeAmount,
        holdingDays: computeHoldingDays(r, today),
        isEffectiveProfit: !!r.is_effective_profit,
        effectiveProfitDayIndex: r.effective_profit_day_index !== null ? Number(r.effective_profit_day_index) : null,
        effectiveProfitPercent: r.effective_profit_percent !== null ? Number(r.effective_profit_percent) : null,
        pickMessage: r.pick_message || '',
        entryType: r.entry_type ?? 0,
        locked: !!r.locked,
        createdAt: r.created_at,
        updatedAt: r.updated_at,
      };
    });
    // 上涨/下跌统计（已锁定止盈的单独列出，不计入涨跌）
    let upCount = 0, downCount = 0, flatCount = 0, pendingCount = 0, lockedCount = 0;
    for (const d of data) {
      if (d.locked) { lockedCount++; continue; }
      if (d.totalChangePercent === null || d.totalChangePercent === undefined) pendingCount++;
      else if (d.totalChangePercent > 0.01) upCount++;
      else if (d.totalChangePercent < -0.01) downCount++;
      else flatCount++;
    }
    res.json({ data, summary: { total: data.length, lockedCount, upCount, downCount, flatCount, pendingCount } });
  } catch (err) {
    console.error('GET /api/wechat/tracking failed:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// 手动添加推票追踪记录（不依赖微信消息，直接为投资人添加推荐记录）
app.post('/api/wechat/tracking/manual', async (req, res) => {
  try {
    const { sender, stockCode, stockName, pickDate, pickMessage = '', entryType = 0 } = req.body || {};
    const senderTrim = String(sender || '').trim();
    const codeTrim = String(stockCode || '').trim();
    const nameTrim = String(stockName || '').trim();
    const dateTrim = String(pickDate || '').trim();
    if (!senderTrim) return res.status(400).json({ error: '投资人不能为空' });
    if (!/^\d{6}$/.test(codeTrim)) return res.status(400).json({ error: '股票代码必须为6位数字' });
    if (!dateTrim || !/^\d{4}-\d{2}-\d{2}$/.test(dateTrim)) return res.status(400).json({ error: '推荐日期格式不正确' });

    const db = pool;
    const now = Date.now();
    const eventId = `manual_${now}`;
    const trackingId = `${eventId}_${codeTrim}`;
    await db.execute(
      `INSERT IGNORE INTO wechat_tracking
        (id, event_id, chat_name, sender, stock_code, stock_name, pick_date, pick_message, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [trackingId, eventId, '', senderTrim, codeTrim, nameTrim, dateTrim, String(pickMessage || '').trim(), now, now]
    );

    // 自动同步股价（异步，不阻塞响应；失败不影响添加结果）
    refreshTrackingPrices(trackingId).catch(e => {
      console.error('manual tracking refresh prices failed:', e.message);
    });

    res.json({ ok: true, id: trackingId, eventId });
  } catch (err) {
    console.error('POST /api/wechat/tracking/manual failed:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// 删除单条追踪股票记录
app.delete('/api/wechat/tracking/:id', async (req, res) => {
  try {
    const id = req.params.id;
    if (!id) return res.status(400).json({ error: '追踪记录ID不能为空' });
    
    const [trackingRows] = await pool.query('SELECT id FROM wechat_tracking WHERE id = ?', [id]);
    if (!trackingRows.length) {
      return res.json({ ok: true, id, alreadyDeleted: true });
    }
    
    // 软删除：标记 deleted_at，不真正删数据
    // 这样 syncTrackingFromEvent 的 INSERT IGNORE 会因为唯一键冲突而跳过，不会再被加回来
    await pool.execute('UPDATE wechat_tracking SET deleted_at = ? WHERE id = ?', [Date.now(), id]);
    // daily 明细也软删（保持一致）
    await pool.execute('DELETE FROM wechat_tracking_daily WHERE tracking_id = ?', [id]);
    
    res.json({ ok: true, id });
  } catch (err) {
    console.error('delete tracking failed:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// 按推荐日期范围批量删除追踪股票
app.delete('/api/wechat/tracking/delete-by-date-range', async (req, res) => {
  try {
    const { startDate, endDate, sender } = req.body || {};
    if (!startDate || !endDate) return res.status(400).json({ error: '开始和结束日期都不能为空' });
    if (!/^\d{4}-\d{2}-\d{2}$/.test(startDate) || !/^\d{4}-\d{2}-\d{2}$/.test(endDate)) {
      return res.status(400).json({ error: '日期格式必须是 YYYY-MM-DD' });
    }
    if (startDate > endDate) return res.status(400).json({ error: '开始日期不能晚于结束日期' });

    const conds = ['pick_date >= ?', 'pick_date <= ?', 'deleted_at IS NULL'];
    const params = [startDate, endDate];
    if (sender) { conds.push('sender = ?'); params.push(sender); }

    const [rows] = await pool.query(
      `SELECT id FROM wechat_tracking WHERE ${conds.join(' AND ')}`, params
    );
    if (!rows.length) {
      return res.json({ ok: true, deletedCount: 0, message: '该日期范围内没有匹配的记录' });
    }

    const ids = rows.map(r => r.id);
    await pool.execute(
      `DELETE FROM wechat_tracking_daily WHERE tracking_id IN (${ids.map(() => '?').join(',')})`,
      ids
    );
    await pool.execute(
      `UPDATE wechat_tracking SET deleted_at = ? WHERE id IN (${ids.map(() => '?').join(',')})`,
      [Date.now(), ...ids]
    );

    res.json({ ok: true, deletedCount: ids.length });
  } catch (err) {
    console.error('delete by date range failed:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// 批量更新追踪记录（支持批量修改 pick_date）
app.put('/api/wechat/tracking/batch-update', async (req, res) => {
  const conn = await pool.getConnection();
  try {
    const { ids, pickDate, delisted } = req.body || {};
    if (!Array.isArray(ids) || !ids.length) {
      return res.status(400).json({ error: '请选择要更新的记录' });
    }
    // ID 是 VARCHAR 字符串，保留原始值（如 manual_xxx_xxx 或 纯数字）
    const validIds = ids.map(id => String(id).trim()).filter(id => id && id.length > 0);
    if (!validIds.length) {
      return res.status(400).json({ error: '无效的ID列表' });
    }
    await conn.beginTransaction();
    const updates = [];
    const params = [];
    if (pickDate !== undefined && pickDate !== null && pickDate !== '') {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(String(pickDate))) {
        await conn.rollback();
        return res.status(400).json({ error: '日期格式必须是 YYYY-MM-DD' });
      }
      updates.push('pick_date = ?');
      params.push(String(pickDate));
    }
    if (delisted !== undefined) {
      updates.push('delisted = ?');
      params.push(delisted ? 1 : 0);
    }
    if (!updates.length) {
      await conn.rollback();
      return res.status(400).json({ error: '没有可更新的字段' });
    }
    const placeholders = validIds.map(() => '?').join(',');
    params.push(...validIds);
    const [result] = await conn.execute(
      `UPDATE wechat_tracking SET ${updates.join(', ')} WHERE id IN (${placeholders})`,
      params
    );
    await conn.commit();
    res.json({ ok: true, affected: result.affectedRows, updatedPickDate: !!pickDate });
  } catch (err) {
    await conn.rollback();
    console.error('batch-update tracking failed:', err.message);
    res.status(500).json({ error: err.message });
  } finally {
    conn.release();
  }
});

// 锁定/解锁追踪股票（锁定后不再刷新股价）
app.put('/api/wechat/tracking/:id/lock', async (req, res) => {
  try {
    const id = req.params.id;
    const { locked } = req.body;  // true=锁定, false=解锁
    if (!id) return res.status(400).json({ error: '追踪记录ID不能为空' });

    if (locked) {
      // 锁定瞬间：先主动刷新一次，把"当前时刻"的有效止盈状态固化进数据库
      // 之后再打 locked=1 标记，后续不再被动态重算覆盖
      try {
        await refreshTrackingPrices(id);
      } catch (e) {
        console.warn('[lock] 锁定前刷新失败，继续锁定:', e.message);
      }
    }

    await pool.execute(
      'UPDATE wechat_tracking SET locked = ?, is_effective_profit = ?, updated_at = ? WHERE id = ?',
      [locked ? 1 : 0, locked ? 1 : 0, Date.now(), id]
    );
    res.json({ ok: true, id, locked: !!locked });
  } catch (err) {
    console.error('lock tracking failed:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// 切换买入方式（开盘/尾盘）并重算
app.put('/api/wechat/tracking/:id/entry-type', async (req, res) => {
  try {
    const id = req.params.id;
    const { entryType } = req.body || {};
    if (!id) return res.status(400).json({ error: '追踪记录ID不能为空' });
    const et = Number(entryType) === 1 ? 1 : 0;
    await pool.execute(
      'UPDATE wechat_tracking SET entry_type = ?, updated_at = ? WHERE id = ?',
      [et, Date.now(), id]
    );
    await refreshTrackingPrices(id);
    const [[row]] = await pool.query('SELECT * FROM wechat_tracking WHERE id = ?', [id]);
    res.json({ ok: true, id, entryType: et });
  } catch (err) {
    console.error('switch entry-type failed:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// 投资人追踪：获取单条追踪记录的每日股价明细
// 锁定股：只返回到 effective_profit_day_index 那一天（止盈后不再显示后续）
app.get('/api/wechat/tracking/:id/daily', async (req, res) => {
  try {
    const trackingId = req.params.id;

    // 先查 tracking 主表：锁定状态 + 止盈固化值（用于反推止盈瞬间盘中价）
    const [trInfo] = await pool.query(
      'SELECT locked, effective_profit_day_index, effective_profit_percent, pick_open_price, stock_code FROM wechat_tracking WHERE id = ? LIMIT 1',
      [trackingId]
    );
    const locked = trInfo.length && trInfo[0].locked ? true : false;
    const lockDayIdx = trInfo.length && trInfo[0].effective_profit_day_index != null
      ? Number(trInfo[0].effective_profit_day_index)
      : null;
    const lockPercent = trInfo.length && trInfo[0].effective_profit_percent != null
      ? Number(trInfo[0].effective_profit_percent)
      : null;
    const pickOpen = trInfo.length && trInfo[0].pick_open_price != null
      ? Number(trInfo[0].pick_open_price)
      : null;
    // 反推止盈瞬间固化的盘中价
    const lockPrice = (locked && lockDayIdx !== null && lockPercent !== null && pickOpen !== null)
      ? Number((pickOpen * (1 + lockPercent / 100)).toFixed(2))
      : null;

    // 锁定股只返回到止盈日
    let rows;
    if (locked && lockDayIdx !== null) {
      [rows] = await pool.query(
        'SELECT * FROM wechat_tracking_daily WHERE tracking_id = ? AND day_index <= ? ORDER BY trade_date ASC',
        [trackingId, lockDayIdx]
      );
    } else {
      [rows] = await pool.query(
        'SELECT * FROM wechat_tracking_daily WHERE tracking_id = ? ORDER BY trade_date ASC',
        [trackingId]
      );
    }

    // 尝试给最后一行（最新日期）注入盘中实时价
    let livePrice = null;
    let liveIsRealTime = false;
    if (rows.length && isTradingTime() && trInfo.length) {
      try {
        const code = trInfo[0].stock_code;
        const qtCode = stockCodeToTencent(code);
        const resp = await fetch(`https://qt.gtimg.cn/q=${qtCode}`, {
          signal: AbortSignal.timeout(5000),
          headers: { 'User-Agent': 'Mozilla/5.0' }
        });
        const text = await fetchGbkText(resp);
        const m = text.match(/v_\w+="([^"]+)"/);
        if (m) {
          const fields = m[1].split('~');
          if (fields.length > 3) {
            const p = Number(fields[3]);
            if (p > 0) { livePrice = p; liveIsRealTime = true; }
          }
        }
      } catch (_) { /* 实时价失败跳过 */ }
    }

    const today = todayStr();
    const data = rows.map((r, idx) => {
      const isLastRow = idx === rows.length - 1;
      const isToday = String(r.trade_date) === today;
      const isProfitDay = locked && lockDayIdx !== null && r.day_index === lockDayIdx;
      const showLive = isLastRow && isToday && !isProfitDay && liveIsRealTime && livePrice !== null;
      const close = r.close_price !== null ? Number(r.close_price) : null;

      let intradayPrice, intradayIsRealTime, intradayLocked;
      if (isProfitDay) {
        // 止盈那天：盘中列显示锁定瞬间固化的价格
        intradayPrice = lockPrice !== null ? lockPrice : close;
        intradayIsRealTime = false;
        intradayLocked = true;
      } else if (showLive) {
        intradayPrice = livePrice;
        intradayIsRealTime = true;
        intradayLocked = false;
      } else {
        intradayPrice = close;
        intradayIsRealTime = false;
        intradayLocked = false;
      }

      return {
        id: r.id,
        trackingId: r.tracking_id,
        tradeDate: r.trade_date,
        dayIndex: r.day_index,
        openPrice: r.open_price !== null ? Number(r.open_price) : null,
        closePrice: close,
        intradayPrice,
        intradayIsRealTime,
        intradayLocked,
        isProfitDay,
        highPrice: r.high_price !== null ? Number(r.high_price) : null,
        lowPrice: r.low_price !== null ? Number(r.low_price) : null,
        dayChangePercent: r.day_change_percent !== null ? Number(r.day_change_percent) : null,
        totalChangePercent: r.total_change_percent !== null ? Number(r.total_change_percent) : null,
        totalChangeAmount: r.total_change_amount !== null ? Number(r.total_change_amount) : null,
      };
    });
    res.json({ data });
  } catch (err) {
    console.error('GET tracking daily failed:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// 投资人分析：按推荐人(sender)分组，统计胜率/平均涨幅/推荐数
// 胜率定义：
//   基础胜率 = 累计涨幅 > 0 为胜
//   有效止盈胜率 = is_effective_profit = 1 为胜（T+1规则下真正能止盈）
// 平均持仓天数：取 effective_profit_day_index 的平均值（排除 null）
app.get('/api/wechat/investor-analysis', async (req, res) => {
  try {
    const days = Math.max(1, Math.min(60, Number(req.query.days) || 7));
    const targetProfitPercent = Math.max(0.5, Math.min(50, Number(req.query.targetProfitPercent) || 5.00));
    const sinceDate = new Date(Date.now() - days * 86400000);
    const sinceStr = `${sinceDate.getFullYear()}-${String(sinceDate.getMonth() + 1).padStart(2, '0')}-${String(sinceDate.getDate()).padStart(2, '0')}`;

    // 本周一日期（周一=0，周日=6；JS getDay 是周日=0，调整一下）
    const now = new Date();
    const todayDow = (now.getDay() + 6) % 7; // 周一=0
    const weekMon = new Date(now);
    weekMon.setDate(now.getDate() - todayDow);
    weekMon.setHours(0, 0, 0, 0);
    const sinceWeekStr = `${weekMon.getFullYear()}-${String(weekMon.getMonth() + 1).padStart(2, '0')}-${String(weekMon.getDate()).padStart(2, '0')}`;

    // 查更大的范围（取 sinceStr 和 sinceWeekStr 中更早的那个，保证两套都能覆盖）
    const querySince = sinceStr < sinceWeekStr ? sinceStr : sinceWeekStr;

    const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;

    const [trackings] = await pool.query(
      `SELECT t.id, t.sender, t.stock_code, t.pick_date, t.pick_open_price, t.pick_change_percent, t.d1_open_change_percent,
              t.total_change_percent, t.is_effective_profit, t.effective_profit_day_index, t.locked
       FROM wechat_tracking t
       INNER JOIN wechat_events ev ON t.event_id = ev.id
       WHERE t.pick_date >= ? AND t.deleted_at IS NULL
         AND t.sender IS NOT NULL AND t.sender != '' AND t.sender != '未识别发送人'
         AND ev.category = 'stock_pick'`,
      [querySince]
    );

    // 标记每条记录是否属于"本周"
    for (const t of trackings) t.isThisWeek = String(t.pick_date) >= sinceWeekStr;

    // 交易时段：批量拉腾讯实时价，覆盖 total_change_percent + 实时重算有效止盈
    if (isTradingTime() && trackings.length) {
      const codes = [...new Set(trackings.map(t => t.stock_code).filter(Boolean))];
      const rtMap = await batchFetchRealtimePrices(codes);
      for (const t of trackings) {
        const rtP = rtMap[t.stock_code];
        if (rtP && t.pick_open_price) {
          const pickOpen = Number(t.pick_open_price);
          t.total_change_percent = Number((((rtP - pickOpen) / pickOpen) * 100).toFixed(2));
        }
      }
    }

    // 对未锁定的记录，实时重算有效止盈状态（盘中和阈值变动时都需要）
    // 已锁定：止盈状态固化进 DB，不再变化
    let effectiveByTracking = {};
    const toRecalc = trackings.filter(t => !t.locked);
    if (toRecalc.length > 0) {
      // 批量拿 daily 表（T+1 规则：用盘中最高价判断曾触达过止盈阈值）
      const [dailyAll] = await pool.query(
        `SELECT tracking_id, day_index, open_price, close_price, high_price, total_change_percent
         FROM wechat_tracking_daily
         WHERE tracking_id IN (${toRecalc.map(() => '?').join(',')})
         ORDER BY tracking_id, day_index`,
        toRecalc.map(t => t.id)
      );
      const dailyMap = {};
      for (const d of dailyAll) {
        if (!dailyMap[d.tracking_id]) dailyMap[d.tracking_id] = [];
        dailyMap[d.tracking_id].push(d);
      }

      const needLivePrice = isTradingTime();
      // 统一的 T+1 止盈判定（与 refreshTrackingPrices 完全一致）
      // 规则：
      //   1) D0 大涨(>target) + D1开盘>=target → 直接判定 dayIndex=1
      //   2) 否则 → 从 startSearchDay=1 开始遍历 daily 表，
      //      用 Math.max(盘中最高累计涨幅, 收盘累计涨幅) >= target 判断曾触达
      function findEffectiveDayIndex(dailies, pickOpen, startDay = 1) {
        for (const dd of dailies) {
          if (dd.day_index < startDay) continue;
          const closePct = Number(dd.total_change_percent);
          let highPct = null;
          const hp = Number(dd.high_price);
          if (hp > 0 && pickOpen > 0) highPct = (((hp - pickOpen) / pickOpen) * 100);
          const best = highPct !== null && closePct !== null
            ? Math.max(highPct, closePct)
            : (highPct !== null ? highPct : closePct);
          if (best !== null && best >= targetProfitPercent) return Number(dd.day_index);
        }
        return null;
      }

      for (const t of toRecalc) {
        const pickOpen = Number(t.pick_open_price);
        const d0Pct = Number(t.pick_change_percent);
        let isEff = 0, dayIdx = null;
        const dailies = dailyMap[t.id] || [];

        let startSearchDay = 1;
        if (d0Pct > targetProfitPercent) {
          if (t.d1_open_change_percent !== null && Number(t.d1_open_change_percent) >= targetProfitPercent) {
            isEff = 1; dayIdx = 1; startSearchDay = 2;
          }
        }

        if (!isEff) {
          const found = findEffectiveDayIndex(dailies, pickOpen, startSearchDay);
          if (found !== null) { isEff = 1; dayIdx = found; }
        }

        // 盘中兜底：daily 是历史收盘数据，今天盘中还会有新进展
        if (!isEff && needLivePrice) {
          const liveTotalChg = Number(t.total_change_percent);
          if (!isNaN(liveTotalChg) && liveTotalChg >= targetProfitPercent) { isEff = 1; dayIdx = null; }
        }

        effectiveByTracking[t.id] = { isEffective: isEff, dayIndex: dayIdx };
      }
    }

    // 按 sender 聚合（抽成函数，跑两次：全部 + 本周）
    function buildInvestorStats(subset) {
      const senderStats = {};
      for (const t of subset) {
        const s = t.sender;
        if (!senderStats[s]) senderStats[s] = { total: 0, win: 0, loss: 0, flat: 0, pending: 0, evaluated: 0, effWin: 0, effLoss: 0, effNoprize: 0, holdDays: [], sumAvgChg: 0, count: 0, todayExcluded: 0, effectiveEvaluated: 0 };
        const st = senderStats[s];
        st.total++;
        const totalChg = Number(t.total_change_percent);
        const isToday = String(t.pick_date) === todayStr;

        if (isToday) st.todayExcluded++;
        if (t.total_change_percent === null) { st.pending++; continue; }
        st.evaluated++;

        let isEff, dayIdx;
        if (t.locked) { isEff = 1; dayIdx = t.effective_profit_day_index; }
        else if (effectiveByTracking[t.id]) { isEff = effectiveByTracking[t.id].isEffective; dayIdx = effectiveByTracking[t.id].dayIndex; }
        else { isEff = Number(t.is_effective_profit) || 0; dayIdx = t.effective_profit_day_index; }

        if (isEff) st.win++;
        else if (totalChg < 0) st.loss++;
        else st.flat++;

        st.sumAvgChg += totalChg;
        st.count++;

        if (isToday) continue;
        st.effectiveEvaluated++;
        if (isEff) st.effWin++;
        else if (totalChg > 0) st.effLoss++;
        else st.effNoprize++;
        if (dayIdx !== null) st.holdDays.push(Number(dayIdx));
      }

      return Object.entries(senderStats)
        .filter(([s]) => s)
        .map(([sender, st]) => ({
          sender,
          totalPicks: st.total,
          winCount: st.win,
          lossCount: st.loss,
          flatCount: st.flat,
          pendingCount: st.pending,
          evaluatedCount: st.evaluated,
          winRate: st.evaluated > 0 ? Number(((st.win / st.evaluated) * 100).toFixed(2)) : null,
          effectiveWinRate: st.effectiveEvaluated > 0 ? Number(((st.effWin / st.effectiveEvaluated) * 100).toFixed(2)) : null,
          effectiveWinCount: st.effWin,
          effectiveLossCount: st.effLoss,
          effectiveNoprizeCount: st.effNoprize,
          effectiveEvaluatedCount: st.effectiveEvaluated,
          todayExcludedCount: st.todayExcluded,
          effectiveTestCount: st.effWin + st.effLoss,
          avgChangePercent: st.count > 0 ? Number((st.sumAvgChg / st.count).toFixed(2)) : null,
          avgHoldDays: st.holdDays.length > 0 ? Number((st.holdDays.reduce((a, b) => a + b, 0) / st.holdDays.length).toFixed(1)) : null,
          hitCount: st.holdDays.length,
        }));
    }

    const allTrackings = trackings.filter(t => String(t.pick_date) >= sinceStr);
    const weekTrackings = trackings.filter(t => t.isThisWeek);

    const allData = buildInvestorStats(allTrackings);
    const weekData = buildInvestorStats(weekTrackings);

    // 按 sender 合并：allData 是主要排序依据，weekData 按 sender 嵌入
    const weekMap = {};
    for (const w of weekData) weekMap[w.sender] = w;

    const data = allData.map(d => ({
      ...d,
      week: weekMap[d.sender] || null,
    })).sort((a, b) => (b.avgChangePercent || 0) - (a.avgChangePercent || 0));

    res.json({ data, days, sinceDate: sinceStr, sinceWeekDate: sinceWeekStr, targetProfitPercent });
  } catch (err) {
    console.error('investor-analysis failed:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// 投资人追踪：刷新单条记录的股价
app.post('/api/wechat/tracking/:id/refresh', async (req, res) => {
  try {
    const result = await refreshTrackingPrices(req.params.id);
    res.json(result);
  } catch (err) {
    console.error('refresh tracking failed:', err.message);
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/wechat/status', (req, res) => {
  res.json({ ...getWechatMonitorStatus(), source: 'java/WechatWindowMonitor.java' });
});

// 实时解盘：沪深京成交额 + 涨跌停统计 + 大小盘对比 + 昨日涨停表现
// 数据源：东方财富（指数） + 新浪财经（全A股涨跌停）
let _marketCache = { data: null, time: 0 };
let _marketPrevCloseAmountYi = null;    // 昨日收盘时的沪深京全天成交额（亿）
const DEFAULT_MARKET_CACHE_TTL = 60000; // 默认 60 秒缓存
const MIN_MARKET_CACHE_TTL = 45000;     // 最低 45 秒，保护新浪接口
let _marketIntervalSetting = { value: null, time: 0 };

async function getMarketCacheTTL() {
  const now = Date.now();
  if (_marketIntervalSetting.value !== null && now - _marketIntervalSetting.time < 60000) {
    const ttl = Math.max(Number(_marketIntervalSetting.value) || DEFAULT_MARKET_CACHE_TTL, MIN_MARKET_CACHE_TTL);
    return ttl;
  }
  try {
    const [rows] = await pool.query('SELECT setting_value FROM ai_settings WHERE setting_key = ?', ['market_fetch_interval']);
    const val = rows[0]?.setting_value || null;
    _marketIntervalSetting = { value: val, time: now };
    const ttl = Math.max(Number(val) || DEFAULT_MARKET_CACHE_TTL, MIN_MARKET_CACHE_TTL);
    return ttl;
  } catch (e) {
    return DEFAULT_MARKET_CACHE_TTL;
  }
}

// 判断当前是否处于A股交易时段（9:15-11:30, 13:00-15:00，周一至周五）
function isTradingTime() {
  const now = new Date();
  const day = now.getDay();
  if (day === 0 || day === 6) return false;
  const h = now.getHours();
  const m = now.getMinutes();
  const t = h * 60 + m;
  // 9:15-11:30 或 13:00-15:00
  return (t >= 9 * 60 + 15 && t <= 11 * 60 + 30) || (t >= 13 * 60 && t <= 15 * 60);
}

// 腾讯批量实时行情：code -> 当前价；一个请求最多 80 只，自动分批
async function batchFetchRealtimePrices(codes) {
  const map = {}; // code -> price
  if (!codes.length) return map;
  const unique = [...new Set(codes)];
  const BATCH = 60;
  for (let i = 0; i < unique.length; i += BATCH) {
    const batch = unique.slice(i, i + BATCH);
    const q = batch.map(c => stockCodeToTencent(c)).join(',');
    try {
      const resp = await fetch(`https://qt.gtimg.cn/q=${q}`, {
        signal: AbortSignal.timeout(5000),
        headers: { 'User-Agent': 'Mozilla/5.0' }
      });
      const text = await fetchGbkText(resp);
      for (const line of text.split('\n')) {
        const m = line.match(/v_\w+="([^"]+)"/);
        if (!m) continue;
        const fields = m[1].split('~');
        const price = Number(fields[3]);
        const prevClose = Number(fields[4]);
        const qtCode = line.match(/v_(\w+)=/)?.[1];
        if (!qtCode || price <= 0 || prevClose <= 0) continue;
        // 反推原始 code：腾讯格式 sh600519 -> 600519, sz000001 -> 000001
        const raw = qtCode.replace(/^(sh|sz|bj)/, '');
        map[raw] = price;
      }
    } catch (_) { /* 单批失败就跳过 */ }
  }
  return map;
}

// 纳指独立刷新：A股闭市后仍单独更新纳指（24h交易）
async function refreshNasdaqOnly() {
  if (!_marketCache.data) return;
  try {
    const fetch = (u, opt = {}) => new Promise((resolve, reject) => {
      const lib = u.startsWith('https') ? require('https') : require('http');
      const req = lib.get(u, { headers: { 'User-Agent': 'Mozilla/5.0', 'Referer': opt.referer || 'https://finance.sina.com.cn/' }, timeout: opt.timeout || 5000 }, r => {
        let d = '';
        r.on('data', c => d += c);
        r.on('end', () => resolve(d));
      });
      req.on('error', reject);
      req.on('timeout', () => { req.destroy(); reject(new Error('timeout')); });
    });
    const nasRaw = await fetch('https://hq.sinajs.cn/list=gb_$ixic', { referer: 'https://finance.sina.com.cn/' });
    const m = nasRaw.match(/="([^"]+)"/);
    if (!m) return;
    const p = m[1].split(',');
    if (p.length < 6) return;
    const price = Number(p[1]);
    const prevClose = Number(p[1]) / (1 + Number(p[2]) / 100); // 用跌幅反推昨收，防止接口返回为0
    let chgRate = Number(p[2]);
    if (!Number.isFinite(price) || price <= 0) return;
    if (!Number.isFinite(chgRate)) chgRate = Number(((price - prevClose) / prevClose * 100).toFixed(2));

    const indices = _marketCache.data.indices || [];
    const nasIdx = indices.findIndex(i => i.code === 'IXIC' || i.isUS);
    const newNas = { code: 'IXIC', price, chgRate, amount: 0, name: '纳斯达克', isUS: true };
    let newIndices;
    if (nasIdx >= 0) {
      newIndices = [...indices];
      newIndices[nasIdx] = newNas;
    } else {
      newIndices = [newNas, ...indices];
    }

    _marketCache.data = { ..._marketCache.data, indices: newIndices, updatedAt: Date.now() };
    _marketCache.time = Date.now();
    console.log('[market] nasdaq refreshed:', price, chgRate + '%');
  } catch (e) {
    console.warn('[market] nasdaq refresh failed:', e.message);
  }
}

async function fetchMarketOverview() {
  const ttl = await getMarketCacheTTL();
  const marketClosed = !isTradingTime();

  // 缓存命中：直接返回
  if (_marketCache.data && Date.now() - _marketCache.time < ttl) {
    return { ..._marketCache.data, ...(marketClosed ? { marketClosed: true } : {}) };
  }

  // 非A股交易时段且有缓存：A股数据直接用缓存，后台异步刷新纳指（24h可交易）
  if (marketClosed && _marketCache.data) {
    refreshNasdaqOnly().catch(() => {});
    return { ..._marketCache.data, marketClosed: true };
  }

  const startTime = Date.now();
  try {
    const https = require('https');
    const http = require('http');
    const fetch = (u, opt = {}) => new Promise((resolve, reject) => {
      const lib = u.startsWith('https') ? https : http;
      const req = lib.get(u, {
        headers: { 'User-Agent': 'Mozilla/5.0', 'Referer': opt.referer || 'https://finance.sina.com.cn/' },
        timeout: opt.timeout || 8000,
      }, r => {
        let d = '';
        r.on('data', c => d += c);
        r.on('end', () => resolve(d));
      });
      req.on('error', reject);
      req.on('timeout', () => { req.destroy(); reject(new Error('timeout')); });
    });

    // === 0. 纳斯达克（24h，用新浪接口） ===
    let nasdaq = null;
    try {
      const nasRaw = await fetch('https://hq.sinajs.cn/list=gb_$ixic', { referer: 'https://finance.sina.com.cn/' });
      const m = nasRaw.match(/="([^"]+)"/);
      if (m) {
        const p = m[1].split(',');
        if (p.length >= 6) {
          const price = Number(p[1]);
          const chgRate = Number(p[2]);
          if (Number.isFinite(price) && price > 0) {
            nasdaq = { code: 'IXIC', price, chgRate, amount: 0, name: '纳斯达克', isUS: true };
          }
        }
      }
    } catch (e) { console.warn('[market] nasdaq fail:', e.message); }

    // === 1. A股指数行情（名称硬编码，彻底避免 GBK 乱码） ===
    let indicesData = [];
    const idxNameMap = { '000001': '上证指数', '399001': '深证成指', '399006': '创业板指', '899050': '北证50' };
    try {
      const idxResp = await fetch('http://qt.gtimg.cn/q=sh000001,sz399001,sz399006,bj899050');
      const idxRaw = await fetchGbkText(idxResp);
      const lines = idxRaw.split('\n').map(l => l.trim()).filter(l => l.startsWith('v_'));
      for (const line of lines) {
        const m = line.match(/="([^"]+)"/);
        if (!m) continue;
        const parts = m[1].split('~');
        if (parts.length < 40) continue;
        const code = parts[2];
        const price = Number(parts[3]);
        const prevClose = Number(parts[4]);
        const chgRate = Number(parts[32]);
        const amount = Number(parts[38]) * 10000;
        indicesData.push({ code, price, chgRate, amount, name: idxNameMap[code] || code });
      }
    } catch (e) { console.warn('[market] tencent idx fail:', e.message); }

    const sh = indicesData?.find(i => i.code === '000001');
    const sz = indicesData?.find(i => i.code === '399001');
    const cy = indicesData?.find(i => i.code === '399006');
    const bj = indicesData?.find(i => i.code === '899050');

    // === 2. 全A股涨跌停 + 总成交额（新浪，分页） ===
    let riseCount = 0, fallCount = 0, flatCount = 0;
    let upLimit = 0, downLimit = 0;
    let totalAmountYuan = 0;

    try {
      const totalRaw = await fetch('http://vip.stock.finance.sina.com.cn/quotes_service/api/json_v2.php/Market_Center.getHQNodeStockCount?node=hs_a');
      const totalStocks = parseInt(totalRaw.replace(/"/g, '')) || 5500;
      const pageSize = 100;
      const totalPages = Math.ceil(totalStocks / pageSize);
      const maxPages = Math.min(totalPages, 55); // 55页×100=5500只，够了

      for (let p = 1; p <= maxPages; p++) {
        const pageUrl = 'http://vip.stock.finance.sina.com.cn/quotes_service/api/json_v2.php/Market_Center.getHQNodeData?page=' + p + '&num=' + pageSize + '&sort=amount&asc=0&node=hs_a&symbol=&_s_r_a=sort';
        try {
          const pageRaw = await fetch(pageUrl);
          const stocks = JSON.parse(pageRaw);
          if (!Array.isArray(stocks) || !stocks.length) continue;

          for (const s of stocks) {
            const pct = Number(s.changepercent);
            const amt = Number(s.amount);
            if (amt > 0) totalAmountYuan += amt;
            if (pct > 0.01) riseCount++;
            else if (pct < -0.01) fallCount++;
            else flatCount++;

            const code = s.code;
            const isGEM = code.startsWith('30') || code.startsWith('688');
            const isBJ = code.startsWith('4') || code.startsWith('8');
            const limitPct = isGEM ? 20 : (isBJ ? 30 : 10);
            if (pct >= limitPct - 0.3) upLimit++;
            if (pct <= -(limitPct - 0.3)) downLimit++;
          }
          if (p < maxPages) await new Promise(x => setTimeout(x, 80)); // 80ms 间隔，55 页总共 ~10 秒
        } catch (e) { /* 单页失败继续 */ continue; }
      }
    } catch (e) { console.warn('[market] sina fetch fail:', e.message); }

    const totalAmountYi = Math.round(totalAmountYuan / 1e8);

    // === 3. 成交额较昨日收盘的增量 ===
    let amountDiffYi = null;
    let amountDiffSign = 1;

    // 闭市时：把当前 totalAmountYi 存为下一次的"昨日基准"
    if (marketClosed) {
      if (totalAmountYi > 0) _marketPrevCloseAmountYi = totalAmountYi;
    }

    // 交易时段：用"今日累计 vs 昨日收盘基准"算差值
    if (!marketClosed && _marketPrevCloseAmountYi > 0 && totalAmountYi > 0) {
      amountDiffYi = totalAmountYi - _marketPrevCloseAmountYi;
      amountDiffSign = amountDiffYi >= 0 ? 1 : -1;
    }

    // === 4. 大小盘对比 ===
    const largeCapChg = sh ? Number(sh.chgRate) : 0;
    const smallCapChg = cy ? Number(cy.chgRate) : 0;

    const data = {
      updatedAt: Date.now(),
      totalAmountYi,
      amountDiffYi,
      amountDiffSign: amountDiffYi >= 0 ? 1 : -1,
      // 纳指排第一，然后A股四大指数
      indices: [nasdaq, ...(indicesData || [])].filter(Boolean),
      largeCapChg: Number(largeCapChg.toFixed(2)),
      smallCapChg: Number(smallCapChg.toFixed(2)),
      sizeDiff: Number((smallCapChg - largeCapChg).toFixed(2)),
      riseCount, fallCount, flatCount,
      upLimit, downLimit,
      yesterdayZtPercent: null,
      _fetchMs: Date.now() - startTime,
      ...(marketClosed ? { marketClosed: true } : {}),
    };

    // 如果拉回来的全是零（周末新浪返回空），且已有有效缓存，保留旧缓存 + 单独刷新纳指
    const allZeroA = data.totalAmountYi === 0 && data.riseCount === 0 && data.indices.filter(i => !i.isUS).every(i => !i.price || i.price <= 0);
    if (allZeroA && _marketCache.data && _marketCache.data.totalAmountYi > 0) {
      const cached = { ..._marketCache.data, marketClosed: true };
      // 把刚刚刷新的纳指合并回去
      if (nasdaq) {
        const indices = cached.indices || [];
        const idx = indices.findIndex(i => i.code === 'IXIC' || i.isUS);
        if (idx >= 0) {
          const merged = [...indices];
          merged[idx] = nasdaq;
          cached.indices = merged;
        } else {
          cached.indices = [nasdaq, ...indices];
        }
      }
      return cached;
    }

    _marketCache = { data, time: Date.now() };
    return data;
  } catch (e) {
    console.error('[market overview] fetch failed:', e.message);
    return _marketCache.data;
  }
}

app.get('/api/market/overview', async (req, res) => {
  const data = await fetchMarketOverview();
  res.json({ data });
});

app.post('/api/wechat/monitor/start', (req, res) => {
  try {
    res.json(startWechatMonitor());
  } catch (error) {
    console.error('wechat monitor start failed:', error);
    res.status(500).json({ error: '微信窗口监听启动失败', message: error.message });
  }
});

app.post('/api/wechat/monitor/stop', (req, res) => {
  res.json(stopWechatMonitor());
});

// 查询某条推票消息涉及的股票及其在其他消息中的重复次数（用于删除前确认）
app.get('/api/wechat/events/:id/stocks-usage', async (req, res) => {
  try {
    const db = pool;
    const id = req.params.id;
    const [events] = await db.query('SELECT stocks_json, category FROM wechat_events WHERE id = ?', [id]);
    if (!events.length) return res.status(404).json({ error: '消息不存在' });
    const ev = events[0];
    let stocks = [];
    try { stocks = JSON.parse(ev.stocks_json || '[]'); } catch {}
    const validStocks = stocks.filter(s => s && s.code);
    if (!validStocks.length) return res.json({ stocks: [], isStockPick: ev.category === 'stock_pick' });
    // 查每个股票在 tracking 表中总共有多少条记录（不同 event_id 视为不同来源）
    const result = [];
    for (const s of validStocks) {
      const [rows] = await db.query(
        'SELECT id FROM wechat_tracking WHERE stock_code = ?',
        [String(s.code).trim()]
      );
      result.push({
        code: String(s.code).trim(),
        name: s.name || '',
        trackingId: `${id}_${String(s.code).trim()}`,
        count: rows.length,                   // 该股票在所有消息中的总关联次数
        otherCount: rows.filter(r => r.id !== `${id}_${String(s.code).trim()}`).length,
      });
    }
    res.json({ stocks: result, isStockPick: ev.category === 'stock_pick' });
  } catch (err) {
    console.error('查询股票使用情况失败:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// 删除消息时按股票重复次数决定删除范围
// body: { stockOptions: [{ code, deleteAll }] }
//   - deleteAll=true: 删除该股票的所有 tracking + daily（重复次数=1 的情况）
//   - deleteAll=false: 只删除当前 event_id 对应的 tracking + daily（重复次数>1 的情况）
app.post('/api/wechat/events/:id/delete', async (req, res) => {
  try {
    const id = req.params.id;
    const stockOptions = req.body?.stockOptions || [];
    const db = pool;

    // 先查出该消息涉及的所有 tracking 记录
    const [trackingRows] = await db.query('SELECT id, stock_code FROM wechat_tracking WHERE event_id = ?', [id]);

    // 按 stock_code 建立选项映射
    const optMap = new Map();
    for (const opt of stockOptions) {
      optMap.set(String(opt.code).trim(), !!opt.deleteAll);
    }

    // 处理每条 tracking 记录
    // 默认安全策略：只删当前 event 关联的 tracking，除非前端明确指定 deleteAll=true
    for (const t of trackingRows) {
      const deleteAll = optMap.has(t.stock_code) ? optMap.get(t.stock_code) : false;
      if (deleteAll) {
        // 重复次数=1（或用户选删除全部）：删除该股票的所有 tracking + daily
        const [allRows] = await db.query('SELECT id FROM wechat_tracking WHERE stock_code = ?', [t.stock_code]);
        for (const r of allRows) {
          await db.execute('DELETE FROM wechat_tracking_daily WHERE tracking_id = ?', [r.id]);
        }
        await db.execute('DELETE FROM wechat_tracking WHERE stock_code = ?', [t.stock_code]);
      } else {
        // 重复次数>1：只删除当前 event_id 对应的 tracking + daily
        await db.execute('DELETE FROM wechat_tracking_daily WHERE tracking_id = ?', [t.id]);
        await db.execute('DELETE FROM wechat_tracking WHERE id = ?', [t.id]);
      }
    }

    // 删除消息本身（内存 + DB）
    const result = await deleteWechatEvent(id);
    if (!result.deleted) return res.status(404).json({ error: '消息不存在' });
    res.json({ ...result, trackingDeleted: trackingRows.length });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 兼容旧版 DELETE 接口（智能处理重复股票）
app.delete('/api/wechat/events/:id', async (req, res) => {
  try {
    const id = req.params.id;
    const db = pool;
    // 获取该消息关联的所有 tracking 记录
    const [trackingRows] = await db.query('SELECT id, stock_code FROM wechat_tracking WHERE event_id = ?', [id]);

    for (const t of trackingRows) {
      // 检查该股票代码在 tracking 表中是否还有其他事件引用
      const [otherRefs] = await db.query(
        'SELECT COUNT(*) as cnt FROM wechat_tracking WHERE stock_code = ? AND event_id != ?',
        [t.stock_code, id]
      );
      const otherCount = otherRefs[0].cnt;

      if (otherCount > 0) {
        // 该股票在其他消息中也有引用，只删除当前事件的记录
        await db.execute('DELETE FROM wechat_tracking_daily WHERE tracking_id = ?', [t.id]);
        await db.execute('DELETE FROM wechat_tracking WHERE id = ?', [t.id]);
      } else {
        // 该股票只在这条消息中出现，删除该股票的所有 tracking + daily
        const [allRows] = await db.query('SELECT id FROM wechat_tracking WHERE stock_code = ?', [t.stock_code]);
        for (const r of allRows) {
          await db.execute('DELETE FROM wechat_tracking_daily WHERE tracking_id = ?', [r.id]);
        }
        await db.execute('DELETE FROM wechat_tracking WHERE stock_code = ?', [t.stock_code]);
      }
    }

    const result = await deleteWechatEvent(id);
    if (!result.deleted) return res.status(404).json({ error: '消息不存在' });
    res.json(result);
  } catch (err) {
    console.error('delete event failed:', err.message);
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/wechat/events', async (req, res) => {
  try {
    const { category } = req.query;
    if (category) {
      // 按分类清空
      const db = pool;
      const [events] = await db.query('SELECT id FROM wechat_events WHERE category = ?', [category]);
      const ids = events.map(r => r.id);
      if (ids.length > 0) {
        // 先删 tracking_daily → tracking → events
        const [tracks] = await db.query('SELECT id FROM wechat_tracking WHERE event_id IN (' + ids.map(() => '?').join(',') + ')', ids);
        const tkIds = tracks.map(r => r.id);
        if (tkIds.length > 0) {
          await db.execute('DELETE FROM wechat_tracking_daily WHERE tracking_id IN (' + tkIds.map(() => '?').join(',') + ')', tkIds);
        }
        await db.execute('DELETE FROM wechat_tracking WHERE event_id IN (' + ids.map(() => '?').join(',') + ')', ids);
        await db.execute('DELETE FROM wechat_events WHERE id IN (' + ids.map(() => '?').join(',') + ')', ids);
      }
      // 清空内存
      const before = monitorState.events.length;
      monitorState.events = monitorState.events.filter(e => e.category !== category);
      const deleted = before - monitorState.events.length;
      res.json({ ok: true, deleted, category });
    } else {
      res.json(await clearWechatEvents());
    }
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 批量刷新全部追踪股价（并行，控制并发避免API限流，跳过已锁定记录）
app.post('/api/wechat/tracking/refresh-all', async (req, res) => {
  try {
    const db = pool;
    const [rows] = await db.query('SELECT id, stock_code, stock_name FROM wechat_tracking WHERE locked = 0 ORDER BY updated_at ASC');
    if (!rows.length) return res.json({ total: 0, success: 0, failed: 0, errors: [] });

    const concurrency = 5;  // 并发数
    const results = [];
    const errors = [];

    // 并发池
    for (let i = 0; i < rows.length; i += concurrency) {
      const batch = rows.slice(i, i + concurrency);
      const settled = await Promise.allSettled(
        batch.map(r => refreshTrackingPrices(r.id))
      );
      settled.forEach((s, idx) => {
        if (s.status === 'fulfilled') {
          results.push({ id: batch[idx].id, code: batch[idx].stock_code, name: batch[idx].stock_name, ok: true });
        } else {
          errors.push({ id: batch[idx].id, code: batch[idx].stock_code, name: batch[idx].stock_name, error: s.reason?.message || '失败' });
        }
      });
    }

    res.json({
      total: rows.length,
      success: results.length,
      failed: errors.length,
      errors,
    });
  } catch (err) {
    console.error('batch refresh failed:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// 根据目标盈利金额，计算单个投资人的平均持仓天数
// 即该投资人的每只股票第一次盈利达到目标金额的持仓天数的平均值
app.get('/api/wechat/investor/:sender/hold-days', async (req, res) => {
  try {
    const sender = decodeURIComponent(req.params.sender || '');
    const targetProfit = Number(req.query.targetProfit || 0);
    const days = Math.max(1, Math.min(60, Number(req.query.days) || 7));
    if (!sender) return res.status(400).json({ error: '投资人不能为空' });
    if (!targetProfit || isNaN(targetProfit) || targetProfit <= 0) {
      return res.json({ avgHoldDays: null, hitCount: 0, totalPicks: 0, sampleDays: [] });
    }
    const sinceDate = new Date(Date.now() - days * 86400000);
    const sinceStr = `${sinceDate.getFullYear()}-${String(sinceDate.getMonth() + 1).padStart(2, '0')}-${String(sinceDate.getDate()).padStart(2, '0')}`;
    const [tracks] = await pool.query(
      `SELECT id FROM wechat_tracking WHERE sender = ? AND pick_date >= ? AND total_change_percent IS NOT NULL`,
      [sender, sinceStr]
    );
    const totalPicks = tracks.length;
    if (totalPicks === 0) {
      return res.json({ avgHoldDays: null, hitCount: 0, totalPicks: 0, sampleDays: [] });
    }
    const trackIds = tracks.map(r => r.id);
    const placeholders = trackIds.map(() => '?').join(',');
    const [dailyRows] = await pool.query(
      `SELECT tracking_id, day_index, total_change_amount
       FROM wechat_tracking_daily
       WHERE tracking_id IN (${placeholders}) AND total_change_amount >= ?
       ORDER BY tracking_id, day_index ASC`,
      [...trackIds, targetProfit]
    );
    const firstHitDays = {};
    for (const dr of dailyRows) {
      const tid = dr.tracking_id;
      const di = Number(dr.day_index);
      if (firstHitDays[tid] === undefined || di < firstHitDays[tid]) {
        firstHitDays[tid] = di;
      }
    }
    const sampleDays = Object.values(firstHitDays);
    const hitCount = sampleDays.length;
    const avgHoldDays = hitCount > 0
      ? Number((sampleDays.reduce((a, b) => a + b, 0) / hitCount).toFixed(1))
      : null;
    res.json({ avgHoldDays, hitCount, totalPicks, sampleDays });
  } catch (err) {
    console.error('get investor hold days failed:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// 删除投资人：删除该投资人的所有推票消息+追踪记录+每日明细
// 注意：其他人推荐过的相同股票会保留（因为tracking按event_id+stock_code维度，不同投资人的记录互相独立）
app.delete('/api/wechat/investor/:sender', async (req, res) => {
  try {
    const db = pool;
    const sender = decodeURIComponent(req.params.sender || '');
    if (!sender) return res.status(400).json({ error: '投资人不能为空' });

    // 1. 查出该投资人的所有 tracking id（用于删 daily）
    const [trackingRows] = await db.query(
      'SELECT id FROM wechat_tracking WHERE sender = ?', [sender]
    );
    const trackingIds = trackingRows.map(r => r.id);

    // 2. 查出该投资人的所有 event id（用于删 event）
    const [eventRows] = await db.query(
      'SELECT id FROM wechat_events WHERE sender = ?', [sender]
    );
    const eventIds = eventRows.map(r => r.id);

    // 3. 删除每日明细
    if (trackingIds.length) {
      await db.execute(
        `DELETE FROM wechat_tracking_daily WHERE tracking_id IN (${trackingIds.map(() => '?').join(',')})`,
        trackingIds
      );
    }
    // 4. 删除追踪记录
    const [tkResult] = await db.execute('DELETE FROM wechat_tracking WHERE sender = ?', [sender]);
    // 5. 删除消息事件
    const [evResult] = await db.execute('DELETE FROM wechat_events WHERE sender = ?', [sender]);

    res.json({
      ok: true,
      sender,
      deletedTracking: tkResult.affectedRows,
      deletedEvents: evResult.affectedRows,
      deletedDaily: trackingIds.length,
    });
  } catch (err) {
    console.error('delete investor failed:', err.message);
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/wechat/extract', async (req, res) => {
  try {
    const text = String(req.body?.text || '');
    const sender = String(req.body?.sender || '');
    const chatName = String(req.body?.chatName || '');
    if (!text.trim()) return res.status(400).json({ error: '请先粘贴微信聊天消息' });
    if (text.length > 500000) return res.status(400).json({ error: '单次消息不能超过 50 万字符' });
    if (await isBlacklisted({ sender, chatName, text })) {
      return res.status(403).json({ error: '命中黑名单，已跳过提取', blocked: true });
    }
    const memHit = await queryExtractLearn(text);
    const result = extractWechatStocks(text, sender, memHit);
    const stocksJson = JSON.stringify(result.stocks || []);
    const category = await categorizeMessageWithLearn(text, stocksJson, memHit);
    res.json({
      ...result,
      category,
      memoryHit: memHit ? { hit_count: memHit.hit_count, correct_label: memHit.correct_label, correct_code: memHit.correct_code } : null,
    });
  } catch (error) {
    console.error('wechat extract failed:', error);
    res.status(500).json({ error: '消息提取失败', message: error.message });
  }
});

// ============ 带反馈学习的识别：记忆（extract_learn）相关 API ============
// 从 extract_learn 表查原文片段是否命中记忆（子串包含），用于识别时"记忆命中优先"强覆盖。
// 未命中返回 null；命中返回单条（按精确匹配优先、命中次数多者优先）。
async function queryExtractLearn(text) {
  try {
    if (typeof text !== 'string' || !text.trim()) return null;
    const q = String(text).trim().slice(0, 2000);
    const db = pool;
    const [rows] = await db.query(
      `SELECT id, source_text, wrong_label, correct_label, wrong_code, correct_code, hit_count
       FROM extract_learn
       WHERE ? LIKE CONCAT('%', source_text, '%')
       ORDER BY (source_text = ?) DESC, hit_count DESC, id DESC
       LIMIT 1`,
      [q, q]
    );
    return rows.length ? rows[0] : null;
  } catch (err) {
    // 表未创建或查询失败时不影响业务
    return null;
  }
}

// GET /api/extract/learn?q=<消息文本>：按子串包含返回命中记忆记录；无记忆返回 null
app.get('/api/extract/learn', async (req, res) => {
  try {
    const q = String(req.query?.q || '').trim();
    if (!q) return res.status(400).json({ error: '缺少 q 参数' });
    const db = pool;
    const [rows] = await db.query(
      `SELECT id, source_text, wrong_label, correct_label, wrong_code, correct_code, hit_count
       FROM extract_learn
       WHERE ? LIKE CONCAT('%', source_text, '%')
       ORDER BY (source_text = ?) DESC, hit_count DESC, id DESC`,
      [q, q]
    );
    res.json(rows.length ? rows : null);
  } catch (error) {
    console.error('extract learn query failed:', error.message);
    res.status(500).json({ error: error.message });
  }
});

// POST /api/extract/learn：记录/更新一条用户纠正的记忆
// body: { source_text, wrong_label, correct_label, wrong_code, correct_code }
app.post('/api/extract/learn', async (req, res) => {
  try {
    const db = pool;
    const {
      source_text = '',
      wrong_label = '',
      correct_label = '',
      wrong_code = '',
      correct_code = '',
    } = req.body || {};
    if (!source_text || typeof source_text !== 'string') {
      return res.status(400).json({ error: 'source_text 不能为空' });
    }
    if (!['marketing', 'stock_pick', 'market_news'].includes(correct_label)) {
      return res.status(400).json({ error: 'correct_label 无效，可选：marketing / stock_pick / market_news' });
    }
    const src = String(source_text).slice(0, 500);
    const wrongL = wrong_label && ['marketing', 'stock_pick', 'market_news'].includes(wrong_label) ? wrong_label : null;
    const correctC = /^\d{6}$/.test(String(correct_code || '').trim()) ? String(correct_code).trim() : null;
    const wrongC = /^\d{6}$/.test(String(wrong_code || '').trim()) ? String(wrong_code).trim() : null;
    const now = Date.now();

    // 同 source_text 已存在 → 更新正确分类/代码并 hit_count+1；否则插入
    const [rows] = await db.query('SELECT id, hit_count FROM extract_learn WHERE source_text = ?', [src]);
    if (rows.length) {
      await db.execute(
        `UPDATE extract_learn SET correct_label = ?, correct_code = ?, wrong_label = ?, wrong_code = ?, updated_at = ? WHERE id = ?`,
        [correct_label, correctC, wrongL, wrongC, now, rows[0].id]
      );
      await db.execute('UPDATE extract_learn SET hit_count = hit_count + 1 WHERE id = ?', [rows[0].id]);
      return res.json({ ok: true, learned: false, hit_count: (rows[0].hit_count || 0) + 1 });
    }

    await db.execute(
      `INSERT INTO extract_learn (source_text, wrong_label, correct_label, wrong_code, correct_code, hit_count, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, 1, ?, ?)`,
      [src, wrongL, correct_label, wrongC, correctC, now, now]
    );
    res.json({ ok: true, learned: true, hit_count: 1 });
  } catch (error) {
    console.error('extract learn save failed:', error.message);
    res.status(500).json({ error: error.message });
  }
});

// 图片/文字上传，AI 自动提取股票代码
const stockUploadDir = path.join(__dirname, 'uploads', 'stock');
if (!fs.existsSync(stockUploadDir)) fs.mkdirSync(stockUploadDir, { recursive: true });
const stockUpload = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => cb(null, tenantUploadDir('stock')),
    filename: (req, file, cb) => {
      const ext = path.extname(file.originalname) || '.png';
      cb(null, Date.now() + '-' + Math.random().toString(36).slice(2, 8) + ext);
    }
  }),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (/^image\//.test(file.mimetype)) cb(null, true);
    else cb(new Error('仅支持图片文件'));
  }
});

app.post('/api/wechat/extract-image', stockUpload.array('image', 10), async (req, res) => {
  try {
    const textInput = String(req.body?.text || '').trim();
    const hasImages = req.files && req.files.length > 0;
    const sender = String(req.body?.sender || '');
    const chatName = String(req.body?.chatName || '');

    if (!hasImages && !textInput) {
      return res.status(400).json({ error: '请上传图片或输入文字' });
    }

    // 黑名单检查（只对有文字输入的情况做关键词匹配；纯图片则跳过）
    if (textInput && await isBlacklisted({ sender, chatName, text: textInput })) {
      return res.status(403).json({ error: '命中黑名单，已跳过提取', blocked: true });
    }

    let imagePaths = [];
    if (hasImages) {
      imagePaths = req.files.map(f => path.relative(__dirname, f.path).replace(/\\/g, '/'));
    }

    // 如果只有文字，直接用 Java 提取
    if (!hasImages && textInput) {
      const result = extractWechatStocks(textInput, '');
      const stocksJson = JSON.stringify(result.stocks || []);
      const category = await categorizeMessageWithLearn(textInput, stocksJson);
      return res.json({ ...result, source: 'text', category });
    }

    // 有图片时，用 AI 提取股票代码
    const systemPrompt = `你是A股股票识别助手。请分析${hasImages ? '图片' : '文字'}中的内容，提取所有提到的股票名称和代码。
输出格式为JSON数组，每个元素包含 name（股票名称）和 code（6位股票代码）。
例如：[{"name":"华神科技","code":"000790"},{"name":"双环传动","code":"002470"}]
如果没有识别到股票，返回空数组 []。只输出JSON，不要其他内容。`;

    let userPrompt;
    if (hasImages && textInput) {
      userPrompt = `请分析图片中的内容，并结合以下文字说明，提取所有股票名称和代码：\n\n${textInput}`;
    } else if (hasImages) {
      userPrompt = '请分析图片中的内容，提取所有股票名称和代码。';
    } else {
      userPrompt = `请分析以下文字内容，提取所有股票名称和代码：\n\n${textInput}`;
    }

    // 有图片时用 GLM 视觉模型，仅文字用 Agnes
    const model = hasImages ? 'glm-4.6v' : 'agnes-2.0-flash';
    // 多图时传第一个图给 callAI（它支持单图），多图分析直接构建多图消息
    let raw;
    if (hasImages && imagePaths.length > 1) {
      // 多图：直接构建请求
      raw = await callAIMultiImage(systemPrompt, userPrompt, imagePaths, model, 60000, 2000);
    } else {
      const singleImage = imagePaths[0] || null;
      raw = await callAI(systemPrompt, userPrompt, singleImage, model, 60000, 2000);
    }

    if (String(raw).includes('未配置') && String(raw).includes('API Key')) {
      return res.status(400).json({ error: String(raw) });
    }

    // 解析 AI 返回的 JSON
    let stocks = [];
    try {
      const jsonMatch = raw.match(/\[[\s\S]*\]/);
      if (jsonMatch) {
        stocks = JSON.parse(jsonMatch[0]);
      }
    } catch (e) {
      console.error('解析AI返回JSON失败:', e.message, 'raw:', raw.substring(0, 200));
    }

    const stocksJson = JSON.stringify(stocks || []);
    const category = await categorizeMessageWithLearn(textInput + (raw || ''), stocksJson);

    // 尝试从文字说明中识别发送人
    let detectedSender = '';
    if (textInput) {
      const textExtract = extractWechatStocks(textInput, '');
      if (textExtract.sender && textExtract.sender !== '未识别发送人') {
        detectedSender = textExtract.sender;
      }
    }

    res.json({
      stocks,
      rawText: raw,
      imagePaths,
      source: hasImages ? 'image' : 'text',
      category,
      sender: detectedSender || '未识别发送人',
    });
  } catch (err) {
    console.error('图片提取股票失败:', err);
    res.status(500).json({ error: '提取失败: ' + err.message });
  }
});

// ==================== 画板图片上传 ====================
const boardUploadDir = path.join(__dirname, 'uploads', 'board');
if (!fs.existsSync(boardUploadDir)) fs.mkdirSync(boardUploadDir, { recursive: true });
const boardUpload = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => cb(null, tenantUploadDir('board')),
    filename: (req, file, cb) => {
      const ext = path.extname(file.originalname) || '.png';
      cb(null, 'board-' + Date.now() + '-' + Math.random().toString(36).slice(2, 8) + ext);
    }
  }),
  limits: { fileSize: 20 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (/^image\//.test(file.mimetype)) cb(null, true);
    else cb(new Error('仅支持图片文件'));
  }
});

app.post('/api/board/upload-image', boardUpload.single('image'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: '请选择图片文件' });
  const imagePath = path.relative(__dirname, req.file.path).replace(/\\/g, '/');
  res.json({ imagePath });
});

// 保存提取结果为一条事件（支持用户手动绑定投资人/sender，保存后自动同步到追踪表）
app.post('/api/wechat/extract/save', async (req, res) => {
  try {
    const db = pool;
    const {
      text = '',       // 消息原文
      sender = '',     // 用户手动绑定的投资人/发送人
      chatName = '',   // 群聊名（可选）
      stocks = [],     // 提取到的股票数组 [{name,code,logic}]
      recommendationDate = '', // 推荐日期 yyyy-mm-dd
      category = '',   // 可选：stock_pick / market_news，不传则自动分类
      forceSave = false, // 手动强制保存（即使命中黑名单也保存，用户确认后）
    } = req.body || {};
    if (!text || !String(text).trim()) {
      return res.status(400).json({ error: '消息内容不能为空' });
    }
    // 对发送人和聊天名都做清洗，过滤"微信""文件传输助手"等无效值
    // 如果用户没有提供 sender，尝试从消息文本中自动识别
    let senderCleanRaw = cleanSender(sender || '');
    if (!senderCleanRaw || senderCleanRaw === '未识别发送人') {
      const autoExtract = extractWechatStocks(String(text), '');
      if (autoExtract.sender && autoExtract.sender !== '未识别发送人') {
        senderCleanRaw = cleanSender(autoExtract.sender);
      }
    }
    const senderClean = await resolveCanonicalInvestorName(senderCleanRaw) || '未识别发送人';
    const chatNameClean = cleanSender(chatName || '');
    // 黑名单过滤（非强制保存时生效）
    if (!forceSave && await isBlacklisted({ sender: senderClean, chatName: chatNameClean, text: String(text) })) {
      return res.status(403).json({ error: '命中黑名单，请从黑名单移除后再保存或开启强制保存', blocked: true });
    }
    const stocksJson = JSON.stringify(Array.isArray(stocks) ? stocks : []);
    const finalCategory = category && ['stock_pick', 'market_news', 'marketing'].includes(category)
      ? category
      : await categorizeMessageWithLearn(text, stocksJson);
    const now = Date.now();
    const id = `manual-${now}-${Math.random().toString(36).slice(2, 8)}`;
    const messageTime = recommendationDate && /^\d{4}-\d{1,2}-\d{1,2}$/.test(String(recommendationDate).trim())
      ? String(recommendationDate).trim()
      : (new Date().toISOString().slice(0, 10));
    const capturedAt = messageTime;
    await db.execute(
      `INSERT INTO wechat_events (id, chat_name, sender, message_text, message_time, captured_at, stocks_json, created_at, category)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [id, chatNameClean, senderClean, String(text), messageTime, capturedAt, stocksJson, now, finalCategory]
    );
    // 推票消息自动同步到追踪表
    if (finalCategory === 'stock_pick') {
      const [rows] = await db.query('SELECT * FROM wechat_events WHERE id = ?', [id]);
      if (rows.length) await syncTrackingFromEvent(rows[0]);
      // 自动刷新新追踪股票的股价
      autoRefreshTrackingPrices(id).catch(() => {});
    }
    res.json({ ok: true, id, category: finalCategory });

    // 推票消息且存在 logic 为空的股票时，异步 AI 补全
    if (finalCategory === 'stock_pick' && Array.isArray(stocks) && stocks.some(s => s && s.code && !s.logic)) {
      autoFillStockLogic(id, String(text), stocks).catch(() => {});
    }
  } catch (err) {
    console.error('extract save failed:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// 手动修改一条消息的分类（保存后立即学习规则，相当于修正反馈）
app.put('/api/wechat/events/:id/category', async (req, res) => {
  try {
    const db = pool;
    const { id } = req.params;
    const {
      category = '',            // 新分类：stock_pick / market_news / marketing
      oldCategory = '',         // 原分类（用于规则学习时的修正对）
      triggerLearn = true,      // 是否触发规则学习，默认 true
    } = req.body || {};
    if (!['stock_pick', 'market_news', 'marketing'].includes(category)) {
      return res.status(400).json({ error: 'category 无效，可选：stock_pick / market_news / marketing' });
    }
    const [rows] = await db.query('SELECT * FROM wechat_events WHERE id = ?', [id]);
    if (!rows.length) {
      return res.status(404).json({ error: '消息不存在' });
    }
    const before = rows[0];
    const previousCategory = oldCategory || before.category || '';
    const messageText = before.message_text || '';
    const now = Date.now();

    await db.execute(
      `UPDATE wechat_events SET category = ?, is_manual = 1 WHERE id = ?`,
      [category, id]
    );

    // 同步更新内存中 monitorState.events 的分类，避免轮询 refreshStatus 时用旧分类覆盖前端
    updateWechatEventCategoryInMemory(id, category);

    // 如果分类有变化，需要同步调整追踪表（tracking）：
    // 1) 改回 stock_pick 且有 valid stocks → 确保 tracking 记录存在
    // 2) 从 stock_pick 改为非 stock_pick → 删除相关 tracking（避免误导）
    let wasStockPick = previousCategory === 'stock_pick';
    try {
      const stocks = JSON.parse(before.stocks_json || '[]');
      const validStocks = stocks.filter(s => s && s.code && /^\d{6}$/.test(String(s.code).trim()));
      const nowStockPick = category === 'stock_pick';
      if (!wasStockPick && nowStockPick && validStocks.length) {
        // 需要同步插入 tracking
        const pickDate = before.captured_at || before.message_time || '';
        for (const stock of validStocks) {
          const trackingId = `${id}_${stock.code}`;
          await db.execute(
            `INSERT IGNORE INTO wechat_tracking
              (id, event_id, chat_name, sender, stock_code, stock_name, pick_date, pick_message, created_at, updated_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
             ON DUPLICATE KEY UPDATE updated_at = ?`,
            [trackingId, id, before.chat_name || '', before.sender || '未识别发送人',
             stock.code, stock.name || '', pickDate, messageText, now, now, now]
          );
        }
      } else if (wasStockPick && !nowStockPick) {
        // 删除该 event 对应的 tracking（级联删除 daily）
        const [tracks] = await db.query('SELECT id FROM wechat_tracking WHERE event_id = ?', [id]);
        for (const t of tracks) {
          await db.execute('DELETE FROM wechat_tracking_daily WHERE tracking_id = ?', [t.id]);
        }
        await db.execute('DELETE FROM wechat_tracking WHERE event_id = ?', [id]);
      }
    } catch (syncErr) {
      console.error('更新分类后同步追踪表失败:', syncErr.message);
    }

    // 触发规则学习 + 写入反馈表（把"用户手动修正"当作一次 userCorrect=0 的反馈处理）
    if (triggerLearn && previousCategory && previousCategory !== category && messageText) {
      const { learned } = await updateRulesFromFeedback({
        messageText,
        predictedCategory: previousCategory,
        userCorrect: 0,
        userCorrectedCategory: category,
      });
      // 同步写入分类反馈表，带上学到的关键词详情
      try {
        await db.execute(
          `INSERT INTO wechat_category_feedback (event_id, message_text, predicted_category, user_correct, user_corrected_category, learned_keywords, created_at)
           VALUES (?, ?, ?, 0, ?, ?, ?)`,
          [id, messageText, previousCategory, category, JSON.stringify(learned), now]
        );
      } catch (fbErr) {
        console.error('写入分类反馈表失败:', fbErr.message);
      }
    }

    res.json({ ok: true, category, learned: triggerLearn && previousCategory !== category });

    // 分类改为 stock_pick 时自动刷新股价
    if (!wasStockPick && category === 'stock_pick') {
      autoRefreshTrackingPrices(id).catch(() => {});
    }
  } catch (err) {
    console.error('update event category failed:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// 更新消息文本并重新提取股票和分类
app.put('/api/wechat/events/:id/text', async (req, res) => {
  try {
    const db = pool;
    const id = req.params.id;
    const { messageText } = req.body;
    if (!messageText) return res.status(400).json({ error: '消息文本不能为空' });

    const [events] = await db.query('SELECT id, chat_name, sender, message_text, category, is_manual, created_at, captured_at, message_time, stocks_json FROM wechat_events WHERE id = ?', [id]);
    if (!events.length) return res.status(404).json({ error: '消息不存在' });
    const ev = events[0];

    // 读取已有的 stocks_json，保留手动设置的逻辑
    let oldStocks = [];
    try { oldStocks = JSON.parse(ev.stocks_json || '[]'); } catch {}
    const oldLogicMap = {};
    for (const s of oldStocks) {
      if (s.code && s.logic) oldLogicMap[String(s.code)] = s.logic;
    }

    // 使用统一的提取函数，同时识别股票和发送人
    const extractResult = extractWechatStocks(messageText, ev.sender || '');
    const stocks = extractResult.stocks || [];
    // 合并已有的推荐逻辑（手动设置的逻辑不丢失）
    for (const s of stocks) {
      const code = String(s.code);
      if (!s.logic && oldLogicMap[code]) {
        s.logic = oldLogicMap[code];
      }
    }
    const detectedSender = cleanSender(extractResult.sender || '');
    
    // 如果识别到了新的 sender 且不同于原来的，使用新的
    const finalSender = (detectedSender && detectedSender !== '未识别发送人') ? detectedSender : (ev.sender || '');

    // 自动分类：如果已手动分类，保留手动分类
    const stocksJson = JSON.stringify(stocks);
    const category = ev.is_manual ? ev.category : await categorizeMessage(messageText, stocksJson);
    const now = Date.now();

    // 更新数据库（包含 sender）
    await db.execute(
      'UPDATE wechat_events SET message_text = ?, stocks_json = ?, category = ?, sender = ?, updated_at = ? WHERE id = ?',
      [messageText, stocksJson, category, finalSender, now, id]
    );

    // 更新追踪表
    if (stocks.length > 0) {
      const chatName = ev.chat_name || '';
      const now = Date.now();
      const pickDate = ev.captured_at || ev.message_time || new Date(ev.created_at).toISOString().split('T')[0] || '';
      await db.execute('DELETE FROM wechat_tracking WHERE event_id = ?', [id]);
      for (const s of stocks) {
        await db.execute(
          `INSERT INTO wechat_tracking
            (id, event_id, chat_name, sender, stock_code, stock_name, pick_date, pick_message, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
           ON DUPLICATE KEY UPDATE stock_name=VALUES(stock_name), updated_at=VALUES(updated_at), sender=VALUES(sender)`,
          [`${id}_${s.code}`, id, chatName, finalSender, s.code, s.name, pickDate, messageText, now, now]
        );
      }
    } else {
      await db.execute('DELETE FROM wechat_tracking WHERE event_id = ?', [id]);
    }

    // 更新内存
    const idx = monitorState.events.findIndex(e => e.id === id);
    if (idx >= 0) {
      monitorState.events[idx].usefulMessage = messageText;
      monitorState.events[idx].messageText = messageText;
      monitorState.events[idx].stocks = stocks;
      monitorState.events[idx].category = category;
      monitorState.events[idx].sender = finalSender;
      monitorState.events[idx].lastUpdated = Date.now();
    }

    // 学习反馈：如果分类有变化，学习规则；如果已手动分类，用新文本强化手动分类的规则
    if (category !== ev.category) {
      await updateRulesFromFeedback({
        messageText,
        predictedCategory: ev.category,
        userCorrect: 0,
        userCorrectedCategory: category,
      });
    } else if (ev.is_manual && messageText !== ev.message_text) {
      // 手动分类的消息编辑了文本，用新文本强化手动分类的规则
      await updateRulesFromFeedback({
        messageText,
        predictedCategory: category === 'stock_pick' ? 'market_news' : 'stock_pick',
        userCorrect: 0,
        userCorrectedCategory: category,
      });
    }

    res.json({ ok: true, stocks, category, sender: finalSender });

    // 推票消息且存在 logic 为空的股票时，异步 AI 补全
    if (category === 'stock_pick' && Array.isArray(stocks) && stocks.some(s => s && s.code && !s.logic)) {
      autoFillStockLogic(id, messageText, stocks).catch(() => {});
    }
  } catch (err) {
    console.error('update event text failed:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// 更新某条消息中某只股票的推荐逻辑
app.put('/api/wechat/events/:id/stock-logic', async (req, res) => {
  try {
    const db = pool;
    const { id } = req.params;
    const { stockCode, logic } = req.body || {};
    if (!stockCode) return res.status(400).json({ error: 'stockCode 不能为空' });

    const [events] = await db.query('SELECT stocks_json FROM wechat_events WHERE id = ?', [id]);
    if (!events.length) return res.status(404).json({ error: '消息不存在' });

    let stocks = [];
    try { stocks = JSON.parse(events[0].stocks_json || '[]'); } catch {}

    const stock = stocks.find(s => String(s.code) === String(stockCode));
    if (!stock) return res.status(404).json({ error: '股票不存在于该消息中' });

    stock.logic = String(logic || '');
    await db.execute('UPDATE wechat_events SET stocks_json = ? WHERE id = ?', [JSON.stringify(stocks), id]);

    res.json({ ok: true, stocks });
  } catch (err) {
    console.error('update stock logic failed:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// 为消息绑定股票（用户手动输入股票代码和名称，替换脱敏的股票信息）
app.put('/api/wechat/events/:id/stocks', async (req, res) => {
  try {
    const db = pool;
    const { id } = req.params;
    const { stocks: inputStocks } = req.body || {};
    if (!Array.isArray(inputStocks) || !inputStocks.length) {
      return res.status(400).json({ error: '股票列表不能为空' });
    }

    // 校验并规范化股票数据
    const stocks = inputStocks
      .filter(s => s && s.code && /^\d{6}$/.test(String(s.code).trim()))
      .map(s => ({
        code: String(s.code).trim(),
        name: String(s.name || '').trim(),
        logic: String(s.logic || '').trim(),
      }));
    if (!stocks.length) {
      return res.status(400).json({ error: '未识别到有效的6位股票代码' });
    }

    const [events] = await db.query(
      'SELECT id, chat_name, sender, message_text, category, is_manual, created_at, captured_at, message_time FROM wechat_events WHERE id = ?',
      [id]
    );
    if (!events.length) return res.status(404).json({ error: '消息不存在' });
    const ev = events[0];

    const stocksJson = JSON.stringify(stocks);
    const now = Date.now();

    // 如果消息原来不是 stock_pick，改为 stock_pick
    const category = ev.category === 'stock_pick' ? ev.category : 'stock_pick';

    await db.execute(
      'UPDATE wechat_events SET stocks_json = ?, category = ?, updated_at = ? WHERE id = ?',
      [stocksJson, category, now, id]
    );

    // 同步追踪表：先删旧的，再插新的
    await db.execute('DELETE FROM wechat_tracking WHERE event_id = ?', [id]);
    if (category === 'stock_pick' && ev.sender) {
      const pickDate = normalizeDateStr(ev.captured_at) || normalizeDateStr(ev.created_at) || normalizeDateStr(ev.message_time);
      if (pickDate) {
        for (const s of stocks) {
          const trackingId = `${id}_${s.code}`;
          await db.execute(
            `INSERT IGNORE INTO wechat_tracking
              (id, event_id, chat_name, sender, stock_code, stock_name, pick_date, pick_message, created_at, updated_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [trackingId, id, ev.chat_name || '', ev.sender, s.code, s.name, pickDate, ev.message_text || '', now, now]
          );
        }
      }
    }

    // 更新内存
    const idx = monitorState.events.findIndex(e => e.id === id);
    if (idx >= 0) {
      monitorState.events[idx].stocks = stocks;
      monitorState.events[idx].category = category;
      monitorState.events[idx].lastUpdated = now;
    }

    res.json({ ok: true, stocks, category });

    // 自动刷新新追踪股票的股价
    autoRefreshTrackingPrices(id).catch(() => {});
  } catch (err) {
    console.error('bind stocks failed:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ===== 分类反馈与规则学习 =====

const LEARNING_STOP_WORDS = new Set([
  '今天', '今日', '现在', '已经', '这个', '那个', '我们', '你们', '他们', '可以', '需要',
  '就是', '还是', '一个', '一下', '进行', '目前', '后续', '大家', '消息', '内容', '注意',
]);

function normalizeLearningText(text) {
  return String(text || '').normalize('NFKC').toLocaleLowerCase('zh-CN').replace(/\s+/g, '');
}

// 同时保留短语与 2-5 字片段；短语提高精度，短片段保证相似文案稍作改写后仍能命中。
function extractKeywords(text, minLen = 2) {
  if (!text) return [];
  const tokens = new Set();
  const normalized = String(text).normalize('NFKC').toLocaleLowerCase('zh-CN');
  const chunks = normalized.match(/[\u4e00-\u9fa5]{2,}|[a-z]{2,}/g) || [];
  for (const chunk of chunks) {
    if (chunk.length >= minLen && chunk.length <= 16 && !LEARNING_STOP_WORDS.has(chunk)) tokens.add(chunk);
    if (/^[a-z]+$/.test(chunk)) continue;
    for (const size of [2, 3, 4, 5]) {
      if (chunk.length < size) continue;
      for (let i = 0; i <= chunk.length - size; i++) {
        const token = chunk.slice(i, i + size);
        if (!LEARNING_STOP_WORDS.has(token)) tokens.add(token);
      }
    }
  }
  return [...tokens].slice(0, 160);
}

async function computeLearnedCategoryScores(text) {
  const scores = { stock_pick: 0, market_news: 0, marketing: 0 };
  try {
    const rows = await loadLearnedRules();
    if (!rows.length) return scores;
    const features = new Set(extractKeywords(text));
    const normalizedText = normalizeLearningText(text);
    const positiveCategoriesByKeyword = new Map();
    for (const rule of rows) {
      if (Number(rule.weight) <= 0) continue;
      if (!positiveCategoriesByKeyword.has(rule.keyword)) positiveCategoriesByKeyword.set(rule.keyword, new Set());
      positiveCategoriesByKeyword.get(rule.keyword).add(rule.category);
    }

    for (const rule of rows) {
      const keyword = String(rule.keyword || '').normalize('NFKC').toLocaleLowerCase('zh-CN');
      if (!keyword) continue;
      const matched = features.has(keyword) || (keyword.length >= 4 && normalizedText.includes(keyword.replace(/\s+/g, '')));
      if (!matched) continue;
      const correct = Number(rule.correct_count || 0);
      const wrong = Number(rule.wrong_count || 0);
      const weight = Math.max(-10, Math.min(10, Number(rule.weight || 0)));
      if (weight >= 0 && correct === 0) continue;
      if (weight >= 0 && wrong > correct + 3) continue;
      const reliability = (correct + 1) / (correct + wrong + 2);
      const support = 1 + Math.log2(correct + wrong + 2) * 0.18;
      const specificity = keyword.length >= 5 ? 1.35 : keyword.length === 4 ? 1.1 : keyword.length === 3 ? 0.78 : 0.5;
      const ambiguity = positiveCategoriesByKeyword.get(rule.keyword)?.size || 1;
      const ambiguityFactor = ambiguity > 1 ? 0.45 : 1;
      scores[rule.category] += weight * reliability * support * specificity * ambiguityFactor;
    }
  } catch (err) {
    console.error('[分类学习] 规则评分失败:', err.message);
  }
  return scores;
}

async function loadFeedbackExamples() {
  const now = Date.now();
  if (_feedbackExamplesCache && now - _feedbackExamplesCacheTime < LEARNING_CACHE_TTL) return _feedbackExamplesCache;
  const [rows] = await pool.query(
    `SELECT message_text,
            CASE WHEN user_correct = 1 THEN predicted_category ELSE user_corrected_category END AS category
       FROM wechat_category_feedback
      WHERE user_correct IN (0, 1) AND message_text IS NOT NULL AND message_text != ''
      ORDER BY created_at DESC LIMIT 600`
  );
  _feedbackExamplesCache = rows
    .filter(row => ['stock_pick', 'market_news', 'marketing'].includes(row.category))
    .map(row => ({ category: row.category, features: new Set(extractKeywords(row.message_text).slice(0, 120)) }))
    .filter(row => row.features.size > 0);
  _feedbackExamplesCacheTime = now;
  return _feedbackExamplesCache;
}

async function computeFeedbackSimilarityScores(text) {
  const scores = { stock_pick: 0, market_news: 0, marketing: 0 };
  try {
    const target = new Set(extractKeywords(text).slice(0, 120));
    if (!target.size) return scores;
    const examples = await loadFeedbackExamples();
    const matches = { stock_pick: [], market_news: [], marketing: [] };
    for (const example of examples) {
      let intersection = 0;
      for (const feature of target) if (example.features.has(feature)) intersection++;
      if (!intersection) continue;
      const coverage = intersection / Math.min(target.size, example.features.size);
      const jaccard = intersection / (target.size + example.features.size - intersection);
      const similarity = coverage * 0.72 + jaccard * 0.28;
      if (similarity >= 0.16) matches[example.category].push(similarity);
    }
    for (const category of Object.keys(matches)) {
      const top = matches[category].sort((a, b) => b - a).slice(0, 8);
      const repetitionBoost = 1 + Math.log2(top.length + 1) * 0.18;
      scores[category] = top.reduce((sum, value) => sum + value * value * 4, 0) * repetitionBoost;
    }
  } catch (err) {
    console.error('[分类学习] 相似样本评分失败:', err.message);
  }
  return scores;
}

// 根据反馈更新规则
async function updateRulesFromFeedback({ messageText, predictedCategory, userCorrect, userCorrectedCategory }) {
  if (!messageText) return { learned: [] };
  const now = Date.now();
  const db = pool;
  const keywords = extractKeywords(messageText);
  if (!keywords.length) return { learned: [] };

  // 记录这次反馈学到的每个关键词的变化，供前端展示 "我到底学到了啥"
  const learned = [];

  // 正确反馈持续强化；修正反馈对正确类别给予更高权重，重复相似样本会快速形成稳定偏好。
  // 步长以 ±1 为基本单位，修正反馈权重×2（因为用户亲自纠正过，可信度更高）
  const updates = [];
  for (const kw of keywords) {
    if (userCorrect === 1) {
      updates.push([predictedCategory, kw, 1, 1, 0]);
      learned.push({ keyword: kw, category: predictedCategory, action: 'strengthen', delta: 1, label: '强化正确' });
    } else if (userCorrect === 0) {
      updates.push([predictedCategory, kw, -1, 0, 1]);
      learned.push({ keyword: kw, category: predictedCategory, action: 'weaken', delta: -1, label: '削弱错误' });
      if (userCorrectedCategory && userCorrectedCategory !== predictedCategory) {
        updates.push([userCorrectedCategory, kw, 2, 1, 0]);
        learned.push({ keyword: kw, category: userCorrectedCategory, action: 'strengthen', delta: 2, label: '强化修正' });
      }
    }
  }

  const sql = `INSERT INTO wechat_category_rules (category, keyword, weight, correct_count, wrong_count, created_at, updated_at)
               VALUES (?, ?, ?, ?, ?, ${now}, ${now})
               ON DUPLICATE KEY UPDATE
                 weight = weight + VALUES(weight),
                 correct_count = correct_count + VALUES(correct_count),
                 wrong_count = wrong_count + VALUES(wrong_count),
                 updated_at = ${now}`;

  try {
    for (const row of updates) {
      await db.execute(sql, row);
    }
    // 防止权重超出 ±10，截断极端值
    await pool.execute(
      'UPDATE wechat_category_rules SET weight = 10 WHERE weight > 10'
    );
    await pool.execute(
      'UPDATE wechat_category_rules SET weight = -10 WHERE weight < -10'
    );
    invalidateLearningCaches();
    // 按新增条数触发清理（每新增20条规则触发一次）
    cleanupLearnedRules().catch(() => {});
    return { learned };
  } catch (e) {
    console.error('update category rules failed:', e.message);
    return { learned };
  }
}

// 提交分类反馈
app.post('/api/wechat/category-feedback', async (req, res) => {
  try {
    const db = pool;
    const now = Date.now();
    const {
      eventId = '',
      messageText = '',
      predictedCategory = '',
      userCorrect = null,
      userCorrectedCategory = '',
    } = req.body || {};

    if (!predictedCategory) return res.status(400).json({ error: 'predictedCategory 必填' });

    // 1. 先跑规则学习，拿到 learned 详情
    let learnedArr = [];
    if (userCorrect === 0 || userCorrect === 1) {
      const { learned } = await updateRulesFromFeedback({
        messageText, predictedCategory, userCorrect,
        userCorrectedCategory: userCorrect === 0 ? userCorrectedCategory : ''
      });
      learnedArr = learned;
    }
    invalidateLearningCaches();

    // 2. 写入反馈表（带上学到的关键词详情）
    const [r] = await db.execute(
      `INSERT INTO wechat_category_feedback (event_id, message_text, predicted_category, user_correct, user_corrected_category, learned_keywords, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [eventId, messageText, predictedCategory,
       userCorrect === 1 ? 1 : userCorrect === 0 ? 0 : null,
       userCorrectedCategory || '',
       JSON.stringify(learnedArr),
       now]
    );

    res.json({ ok: true, id: r.insertId, rulesApplied: (userCorrect === 0 || userCorrect === 1) });
  } catch (err) {
    console.error('category feedback failed:', err.message);
    res.status(500).json({ error: err.message });
  }
});

async function loadCategoryRulesSnapshot() {
  const now = Date.now();
  if (_categoryRulesSnapshotCache && now - _categoryRulesSnapshotCacheTime < LEARNING_CACHE_TTL) {
    return _categoryRulesSnapshotCache;
  }
  const [[systemRules], learnedRules] = await Promise.all([
    pool.query('SELECT id, category, rule_type, pattern, enabled, weight, description, created_at, updated_at FROM wechat_category_system_rules ORDER BY category, id'),
    loadLearnedRules(),
  ]);
  const counts = { stock_pick: 0, market_news: 0, marketing: 0 };
  for (const rule of [...systemRules, ...learnedRules]) {
    if (rule.category) counts[rule.category] = (counts[rule.category] || 0) + 1;
  }
  _categoryRulesSnapshotCache = { systemRules, learnedRules, counts, cleanedCount: _totalCleanedRules };
  _categoryRulesSnapshotCacheTime = now;
  return _categoryRulesSnapshotCache;
}

// 获取所有分类规则（系统规则 + 学习规则），结果已提前计算并缓存。
app.get('/api/wechat/category-rules', async (req, res) => {
  try {
    const snapshot = await loadCategoryRulesSnapshot();
    const category = String(req.query.category || '').trim();
    const defaultLimit = 80;
    const requestedLimit = Number.parseInt(req.query.learnedLimit ?? req.query.pageSize, 10);
    const limit = Math.min(Math.max(Number.isFinite(requestedLimit) ? requestedLimit : defaultLimit, 20), 200);
    const requestedOffset = Number.parseInt(req.query.learnedOffset ?? req.query.offset, 10);
    const offset = Math.max(Number.isFinite(requestedOffset) ? requestedOffset : 0, 0);
    const categories = Object.keys(snapshot.counts);
    const systemCounts = Object.fromEntries(categories.map(name => [name, 0]));
    const learnedCounts = Object.fromEntries(categories.map(name => [name, 0]));
    for (const rule of snapshot.systemRules) {
      if (rule.category) systemCounts[rule.category] = (systemCounts[rule.category] || 0) + 1;
    }
    for (const rule of snapshot.learnedRules) {
      if (rule.category) learnedCounts[rule.category] = (learnedCounts[rule.category] || 0) + 1;
    }
    const systemRules = category
      ? snapshot.systemRules.filter(rule => rule.category === category)
      : snapshot.systemRules;
    const learnedRules = category
      ? snapshot.learnedRules.filter(rule => rule.category === category).slice(offset, offset + limit)
      : categories.flatMap(name => snapshot.learnedRules
        .filter(rule => rule.category === name)
        .slice(0, limit));
    res.json({
      systemRules,
      learnedRules,
      counts: snapshot.counts,
      systemCounts,
      learnedCounts,
      loadedCounts: category
        ? { [category]: learnedRules.length + offset }
        : Object.fromEntries(categories.map(name => [name, Math.min(learnedCounts[name], limit)])),
      hasMore: category ? offset + learnedRules.length < (learnedCounts[category] || 0) : undefined,
      cleanedCount: _totalCleanedRules,
    });
  } catch (err) {
    console.error('获取分类规则失败:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// 更新系统规则（启用/禁用/调整权重）
app.put('/api/wechat/category-rules/system/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { enabled, weight, description } = req.body || {};
    const updates = [];
    const values = [];
    if (enabled !== undefined) { updates.push('enabled = ?'); values.push(enabled ? 1 : 0); }
    if (weight !== undefined) { updates.push('weight = ?'); values.push(Number(weight)); }
    if (description !== undefined) { updates.push('description = ?'); values.push(description); }
    if (updates.length === 0) return res.json({ success: true });
    values.push(id);
    await pool.execute(`UPDATE wechat_category_system_rules SET ${updates.join(', ')}, updated_at = ? WHERE id = ?`, [...values, Date.now()]);
    invalidateSystemRulesCache();
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 删除学习规则
app.delete('/api/wechat/category-rules/learned/:id', async (req, res) => {
  try {
    const { id } = req.params;
    await pool.execute('DELETE FROM wechat_category_rules WHERE id = ?', [id]);
    invalidateLearningCaches();
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 重置系统规则（恢复到默认状态，清除所有用户修改）
app.post('/api/wechat/category-rules/system/reset', async (req, res) => {
  try {
    await pool.execute('DELETE FROM wechat_category_system_rules');
    const now = Date.now();
    const defaultRules = [
      ['marketing', 'regex', '合作|加入|办一个|办理|会员|服务|咨询', 1, 3, '营销：合作/加入/办理等关键词'],
      ['marketing', 'regex', '元/(月|年|个月|季度|周期)', 1, 3, '营销：费用模式'],
      ['marketing', 'regex', '\\d{3,4}元', 1, 2, '营销：3-4位金额'],
      ['marketing', 'regex', '不是荐股|不构成投资建议|仅供.*参考', 1, 2, '营销：免责声明'],
      ['marketing', 'regex', '投资有风险.*入市须谨慎|入市有风险', 1, 2, '营销：风险提示'],
      ['marketing', 'regex', '老师|投顾|助理|客服|顾问', 1, 2, '营销：角色称谓'],
      ['marketing', 'regex', '添加|加微信|添加微信|扫码|二维码', 1, 2, '营销：联系方式'],
      ['marketing', 'regex', '名额|限量|限时|优惠|折扣|涨价', 1, 2, '营销：促销词汇'],
      ['marketing', 'regex', '回复.*数字|回复\\[\\d+\\]', 1, 2, '营销：回复指令'],
      ['marketing', 'keyword', '办一个', 1, 3, '营销关键词：办一个'],
      ['marketing', 'keyword', '518元', 1, 3, '营销关键词：518元'],
      ['marketing', 'keyword', '2980元', 1, 3, '营销关键词：2980元'],
      ['marketing', 'keyword', '课程', 1, 2, '营销关键词：课程'],
      ['marketing', 'keyword', '学员', 1, 2, '营销关键词：学员'],
      ['marketing', 'keyword', '直播回放', 1, 2, '营销关键词：直播回放'],
      ['marketing', 'keyword', '领取福利', 1, 2, '营销关键词：领取福利'],
      ['marketing', 'keyword', '新客户特惠', 1, 2, '营销关键词：新客户特惠'],
      ['marketing', 'keyword', '官方指导价', 1, 2, '营销关键词：官方指导价'],
      ['stock_pick', 'regex', '\\d{6}', 1, 2, '推票：6位股票代码'],
      ['stock_pick', 'regex', '【[^】]+\\s+\\d{6}\\s*】', 1, 3, '推票：【名称 代码】格式'],
      ['stock_pick', 'regex', '【[#⭕🔥]?\\s*[^】]{2,10}\\s*】', 1, 1, '推票：括号内股票名'],
      ['stock_pick', 'keyword', '涨停', 1, 2, '推票回顾：涨停'],
      ['stock_pick', 'keyword', '跌停', 1, 2, '推票回顾：跌停'],
      ['stock_pick', 'keyword', 'T+1', 1, 2, '推票回顾：T+1'],
      ['stock_pick', 'keyword', '连板', 1, 2, '推票回顾：连板'],
      ['stock_pick', 'keyword', '封板', 1, 2, '推票回顾：封板'],
      ['stock_pick', 'keyword', '打板', 1, 2, '推票回顾：打板'],
      ['stock_pick', 'keyword', '强势涨停', 1, 2, '推票回顾：强势涨停'],
      ['stock_pick', 'keyword', '两连板', 1, 2, '推票回顾：两连板'],
      ['stock_pick', 'keyword', '2连板', 1, 2, '推票回顾：2连板'],
      ['stock_pick', 'keyword', '3连板', 1, 2, '推票回顾：3连板'],
      ['stock_pick', 'keyword', '累计涨', 1, 2, '推票回顾：累计涨'],
      ['stock_pick', 'keyword', 'T+0', 1, 2, '推票回顾：T+0'],
      ['stock_pick', 'keyword', '今日早盘观察', 1, 2, '推票：今日早盘观察'],
      ['stock_pick', 'keyword', '短线优选', 1, 2, '推票：短线优选'],
      ['stock_pick', 'keyword', '每日推荐', 1, 2, '推票：每日推荐'],
      ['stock_pick', 'keyword', '每日掘金', 1, 2, '推票：每日掘金'],
      ['stock_pick', 'keyword', '票来了', 1, 2, '推票：票来了'],
      ['market_news', 'keyword', '放量', 1, 1, '行情：放量'],
      ['market_news', 'keyword', '反弹', 1, 1, '行情：反弹'],
      ['market_news', 'keyword', '量能', 1, 1, '行情：量能'],
      ['market_news', 'keyword', '板块', 1, 1, '行情：板块'],
      ['market_news', 'keyword', '大盘', 1, 1, '行情：大盘'],
      ['market_news', 'keyword', '走势', 1, 1, '行情：走势'],
      ['market_news', 'keyword', '趋势', 1, 1, '行情：趋势'],
      ['market_news', 'keyword', '主力', 1, 1, '行情：主力'],
      ['market_news', 'keyword', '资金流入', 1, 1, '行情：资金流入'],
      ['market_news', 'keyword', '资金流出', 1, 1, '行情：资金流出'],
      ['market_news', 'keyword', '拉升', 1, 1, '行情：拉升'],
      ['market_news', 'keyword', '洗盘', 1, 1, '行情：洗盘'],
      ['market_news', 'keyword', '早盘', 1, 1, '行情：早盘'],
      ['market_news', 'keyword', '尾盘', 1, 1, '行情：尾盘'],
      ['market_news', 'keyword', '震荡', 1, 1, '行情：震荡'],
      ['market_news', 'keyword', '回调', 1, 1, '行情：回调'],
      ['market_news', 'keyword', '突破', 1, 1, '行情：突破'],
      ['market_news', 'keyword', '回踩', 1, 1, '行情：回踩'],
      ['market_news', 'keyword', '企稳', 1, 1, '行情：企稳'],
      ['market_news', 'keyword', '反包', 1, 1, '行情：反包'],
      ['market_news', 'keyword', '沪指', 1, 1, '行情：沪指'],
      ['market_news', 'keyword', '深成指', 1, 1, '行情：深成指'],
      ['market_news', 'keyword', '创业板指', 1, 1, '行情：创业板指'],
      ['market_news', 'keyword', '北向资金', 1, 1, '行情：北向资金'],
      ['market_news', 'keyword', '融资融券', 1, 1, '行情：融资融券'],
      ['market_news', 'keyword', '集合竞价', 1, 1, '行情：集合竞价'],
      ['market_news', 'keyword', '牛股', 1, 1, '行情：牛股'],
      ['market_news', 'keyword', '妖股', 1, 1, '行情：妖股'],
      ['market_news', 'keyword', '龙头', 1, 1, '行情：龙头'],
      ['market_news', 'keyword', '热点', 1, 1, '行情：热点'],
      ['market_news', 'keyword', '题材', 1, 1, '行情：题材'],
    ];
    for (const [cat, type, pattern, enabled, weight, desc] of defaultRules) {
      await pool.execute(
        'INSERT INTO wechat_category_system_rules (category, rule_type, pattern, enabled, weight, description, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
        [cat, type, pattern, enabled, weight, desc, now, now]
      );
    }
    invalidateSystemRulesCache();
    res.json({ success: true, count: defaultRules.length });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 新增学习规则（自定义关键词规则）
app.post('/api/wechat/category-rules/learned', async (req, res) => {
  try {
    const { category, keyword, weight = 1, description = '' } = req.body || {};
    if (!category || !['stock_pick', 'market_news', 'marketing'].includes(category)) {
      return res.status(400).json({ error: 'category 无效' });
    }
    if (!keyword || !keyword.trim()) {
      return res.status(400).json({ error: 'keyword 必填' });
    }
    const now = Date.now();
    await pool.execute(
      `INSERT INTO wechat_category_rules (category, keyword, weight, correct_count, wrong_count, created_at, updated_at)
       VALUES (?, ?, ?, 0, 0, ?, ?)
       ON DUPLICATE KEY UPDATE weight = VALUES(weight), updated_at = ?`,
      [category, keyword.trim(), Number(weight) || 1, now, now, now]
    );
    invalidateLearningCaches();
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 重新分类历史消息
app.post('/api/wechat/reclassify', async (req, res) => {
  try {
    const { category } = req.body || {};
    const db = pool;
    const [rows] = await db.query(
      'SELECT id, message_text, stocks_json, category, is_manual FROM wechat_events ORDER BY created_at DESC'
    );
    let recategorized = 0;
    let skipped = 0;
    const results = [];
    for (const r of rows) {
      // 跳过手动分类的消息
      if (r.is_manual) {
        skipped++;
        continue;
      }
      const newCat = await categorizeMessageWithLearn(r.message_text, r.stocks_json);
      if (newCat !== r.category) {
        await db.execute('UPDATE wechat_events SET category = ? WHERE id = ?', [newCat, r.id]);
        recategorized++;
        results.push({ id: r.id, old: r.category, new: newCat });
      }
    }
    res.json({ total: rows.length, recategorized, skipped, results });
  } catch (err) {
    console.error('重新分类失败:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// 在 server.js 的 categorizeMessage 函数基础上，加入学习规则重新计算（用新的包裹函数）
async function categorizeMessageWithLearn(text, stocksJson, memHit) {
  // 记忆命中优先：用户纠正过该原文片段 → 直接采用纠正后的分类，不再走规则/学习误判
  if (!memHit) memHit = await queryExtractLearn(text);
  if (memHit && memHit.correct_label && ['marketing', 'stock_pick', 'market_news'].includes(memHit.correct_label)) {
    return memHit.correct_label;
  }
  let base = 'market_news';
  try {
    base = await categorizeMessage(text, stocksJson);
  } catch (e) {
    console.error('[分类学习] 基础分类异常:', e.message);
    base = 'market_news';
  }
  if (!text) return base;
  if (!base || !['stock_pick', 'market_news', 'marketing'].includes(base)) {
    base = 'market_news';
  }

  // 如果基础分类是 stock_pick，且有有效股票代码，直接返回，不被学习规则覆盖
  // 因为有股票代码的消息一定是推票消息
  try {
    const stocks = JSON.parse(stocksJson || '[]');
    const hasValidStock = stocks.some(s => s && s.code && /^\d{6}$/.test(String(s.code).trim()));
    if (hasValidStock && base === 'stock_pick') {
      return 'stock_pick';
    }
  } catch {}

  const categories = ['stock_pick', 'market_news', 'marketing'];
  const [ruleScores, similarityScores] = await Promise.all([
    computeLearnedCategoryScores(text),
    computeFeedbackSimilarityScores(text),
  ]);
  const combined = { stock_pick: 0, market_news: 0, marketing: 0 };
  for (const category of categories) {
    combined[category] = Number(ruleScores[category] || 0) + Number(similarityScores[category] || 0);
  }

  let hasValidStock = false;
  try {
    const stocks = JSON.parse(stocksJson || '[]');
    hasValidStock = stocks.some(stock => /^\d{6}$/.test(String(stock?.code || '').trim()));
  } catch {}
  if (!hasValidStock) hasValidStock = /(?:^|\D)\d{6}(?:\D|$)/.test(String(text));

  // 基础分类保留先验分；有效股票代码是强信号，避免少量营销样本把真实推票覆盖掉。
  combined[base] += hasValidStock && base === 'stock_pick' ? 6 : 1.35;
  const ranked = categories.sort((a, b) => combined[b] - combined[a]);
  const winner = ranked[0];
  if (winner === base) return base;

  const learnedEvidence = Number(ruleScores[winner] || 0) + Number(similarityScores[winner] || 0);
  const margin = combined[winner] - combined[base];
  const requiredEvidence = hasValidStock ? 5.5 : 1.8;
  const requiredMargin = hasValidStock ? 2.5 : 0.8;
  if (learnedEvidence >= requiredEvidence && margin >= requiredMargin) return winner;
  return base;
}

// 让所有保存/分类的地方统一走带学习的分类（在 /extract 和 /extract-image 和 /extract/save 与 saveEventToDb 中使用）
// 但为了不影响其他地方，先在主要入口处替换使用：saveEventToDb 与 /extract/save，两个 extract 接口返回的分类也带学习
// 把带学习的分类器注册到 wechat-extractor，让自动捕获的消息也走带学习的分类
setCategoryClassifierHook(categorizeMessageWithLearn);

app.use('/api', (req, res) => res.status(404).json({ error: '接口不存在' }));
app.use((error, req, res, next) => {
  console.error('请求失败:', error.code || error.name);
  if (!res.headersSent) res.status(500).json({ error: '请求处理失败' });
});

// 初始化分类相关表（幂等，可重复调用）
async function initCategoryTables() {
  try {
    // 分类反馈表
    await pool.execute(`
      CREATE TABLE IF NOT EXISTS wechat_category_feedback (
        id BIGINT PRIMARY KEY AUTO_INCREMENT,
        event_id VARCHAR(64) DEFAULT '',
        message_text TEXT,
        predicted_category VARCHAR(32) NOT NULL,
        user_correct TINYINT DEFAULT NULL,
        user_corrected_category VARCHAR(32) DEFAULT '',
        created_at BIGINT DEFAULT 0,
        INDEX idx_predicted (predicted_category),
        INDEX idx_created (created_at)
      )
    `);
    // 分类规则学习表
    await pool.execute(`
      CREATE TABLE IF NOT EXISTS wechat_category_rules (
        id BIGINT PRIMARY KEY AUTO_INCREMENT,
        category VARCHAR(32) NOT NULL,
        keyword VARCHAR(200) NOT NULL,
        weight INT DEFAULT 1,
        correct_count INT DEFAULT 0,
        wrong_count INT DEFAULT 0,
        created_at BIGINT DEFAULT 0,
        updated_at BIGINT DEFAULT 0,
        UNIQUE KEY uk_category_keyword (category, keyword)
      )
    `);
    // 系统分类规则表
    await pool.execute(`
      CREATE TABLE IF NOT EXISTS wechat_category_system_rules (
        id INT PRIMARY KEY AUTO_INCREMENT,
        category VARCHAR(32) NOT NULL,
        rule_type VARCHAR(32) NOT NULL,
        pattern TEXT NOT NULL,
        enabled TINYINT DEFAULT 1,
        weight INT DEFAULT 1,
        description VARCHAR(255) DEFAULT '',
        created_at BIGINT DEFAULT 0,
        updated_at BIGINT DEFAULT 0,
        INDEX idx_category (category)
      )
    `);

    // 记忆学习表：用户纠正过一次的原文片段（记忆式学习，非大模型推理）
    await pool.execute(`
      CREATE TABLE IF NOT EXISTS extract_learn (
        id INT PRIMARY KEY AUTO_INCREMENT,
        source_text VARCHAR(500) NOT NULL,
        wrong_label VARCHAR(30),
        correct_label VARCHAR(30) NOT NULL,
        wrong_code VARCHAR(10),
        correct_code VARCHAR(10),
        hit_count INT DEFAULT 0,
        created_at BIGINT DEFAULT 0,
        updated_at BIGINT DEFAULT 0,
        INDEX idx_source_text (source_text),
        INDEX idx_correct_label (correct_label)
      )
    `);
    console.log('识别记忆学习表初始化完成');

    // 初始化系统规则
    const [existing] = await pool.query('SELECT COUNT(*) AS cnt FROM wechat_category_system_rules');
    if (existing[0].cnt === 0) {
      const now = Date.now();
      const systemRules = [
        ['marketing', 'regex', '合作|加入|办一个|办理|会员|服务|咨询', 1, 3, '营销：合作/加入/办理等关键词'],
        ['marketing', 'regex', '元/(月|年|个月|季度|周期)', 1, 3, '营销：费用模式'],
        ['marketing', 'regex', '\\d{3,4}元', 1, 2, '营销：3-4位金额'],
        ['marketing', 'regex', '不是荐股|不构成投资建议|仅供.*参考', 1, 2, '营销：免责声明'],
        ['marketing', 'regex', '投资有风险.*入市须谨慎|入市有风险', 1, 2, '营销：风险提示'],
        ['marketing', 'regex', '老师|投顾|助理|客服|顾问', 1, 2, '营销：角色称谓'],
        ['marketing', 'regex', '添加|加微信|添加微信|扫码|二维码', 1, 2, '营销：联系方式'],
        ['marketing', 'regex', '名额|限量|限时|优惠|折扣|涨价', 1, 2, '营销：促销词汇'],
        ['marketing', 'regex', '回复.*数字|回复\\[\\d+\\]', 1, 2, '营销：回复指令'],
        ['marketing', 'keyword', '办一个', 1, 3, '营销关键词：办一个'],
        ['marketing', 'keyword', '518元', 1, 3, '营销关键词：518元'],
        ['marketing', 'keyword', '2980元', 1, 3, '营销关键词：2980元'],
        ['marketing', 'keyword', '课程', 1, 2, '营销关键词：课程'],
        ['marketing', 'keyword', '学员', 1, 2, '营销关键词：学员'],
        ['marketing', 'keyword', '直播回放', 1, 2, '营销关键词：直播回放'],
        ['marketing', 'keyword', '领取福利', 1, 2, '营销关键词：领取福利'],
        ['marketing', 'keyword', '新客户特惠', 1, 2, '营销关键词：新客户特惠'],
        ['marketing', 'keyword', '官方指导价', 1, 2, '营销关键词：官方指导价'],
        ['stock_pick', 'regex', '\\d{6}', 1, 2, '推票：6位股票代码'],
        ['stock_pick', 'regex', '【[^】]+\\s+\\d{6}\\s*】', 1, 3, '推票：【名称 代码】格式'],
        ['stock_pick', 'regex', '【[#⭕🔥]?\\s*[^】]{2,10}\\s*】', 1, 1, '推票：括号内股票名'],
        ['stock_pick', 'keyword', '涨停', 1, 2, '推票回顾：涨停'],
        ['stock_pick', 'keyword', '跌停', 1, 2, '推票回顾：跌停'],
        ['stock_pick', 'keyword', 'T+1', 1, 2, '推票回顾：T+1'],
        ['stock_pick', 'keyword', '连板', 1, 2, '推票回顾：连板'],
        ['stock_pick', 'keyword', '封板', 1, 2, '推票回顾：封板'],
        ['stock_pick', 'keyword', '打板', 1, 2, '推票回顾：打板'],
        ['stock_pick', 'keyword', '强势涨停', 1, 2, '推票回顾：强势涨停'],
        ['stock_pick', 'keyword', '两连板', 1, 2, '推票回顾：两连板'],
        ['stock_pick', 'keyword', '2连板', 1, 2, '推票回顾：2连板'],
        ['stock_pick', 'keyword', '3连板', 1, 2, '推票回顾：3连板'],
        ['stock_pick', 'keyword', '累计涨', 1, 2, '推票回顾：累计涨'],
        ['stock_pick', 'keyword', 'T+0', 1, 2, '推票回顾：T+0'],
        ['stock_pick', 'keyword', '今日早盘观察', 1, 2, '推票：今日早盘观察'],
        ['stock_pick', 'keyword', '短线优选', 1, 2, '推票：短线优选'],
        ['stock_pick', 'keyword', '每日推荐', 1, 2, '推票：每日推荐'],
        ['stock_pick', 'keyword', '每日掘金', 1, 2, '推票：每日掘金'],
        ['stock_pick', 'keyword', '票来了', 1, 2, '推票：票来了'],
        ['market_news', 'keyword', '放量', 1, 1, '行情：放量'],
        ['market_news', 'keyword', '反弹', 1, 1, '行情：反弹'],
        ['market_news', 'keyword', '量能', 1, 1, '行情：量能'],
        ['market_news', 'keyword', '板块', 1, 1, '行情：板块'],
        ['market_news', 'keyword', '大盘', 1, 1, '行情：大盘'],
        ['market_news', 'keyword', '走势', 1, 1, '行情：走势'],
        ['market_news', 'keyword', '趋势', 1, 1, '行情：趋势'],
        ['market_news', 'keyword', '主力', 1, 1, '行情：主力'],
        ['market_news', 'keyword', '资金流入', 1, 1, '行情：资金流入'],
        ['market_news', 'keyword', '资金流出', 1, 1, '行情：资金流出'],
        ['market_news', 'keyword', '拉升', 1, 1, '行情：拉升'],
        ['market_news', 'keyword', '洗盘', 1, 1, '行情：洗盘'],
        ['market_news', 'keyword', '早盘', 1, 1, '行情：早盘'],
        ['market_news', 'keyword', '尾盘', 1, 1, '行情：尾盘'],
        ['market_news', 'keyword', '震荡', 1, 1, '行情：震荡'],
        ['market_news', 'keyword', '回调', 1, 1, '行情：回调'],
        ['market_news', 'keyword', '突破', 1, 1, '行情：突破'],
        ['market_news', 'keyword', '回踩', 1, 1, '行情：回踩'],
        ['market_news', 'keyword', '企稳', 1, 1, '行情：企稳'],
        ['market_news', 'keyword', '反包', 1, 1, '行情：反包'],
        ['market_news', 'keyword', '沪指', 1, 1, '行情：沪指'],
        ['market_news', 'keyword', '深成指', 1, 1, '行情：深成指'],
        ['market_news', 'keyword', '创业板指', 1, 1, '行情：创业板指'],
        ['market_news', 'keyword', '北向资金', 1, 1, '行情：北向资金'],
        ['market_news', 'keyword', '融资融券', 1, 1, '行情：融资融券'],
        ['market_news', 'keyword', '集合竞价', 1, 1, '行情：集合竞价'],
        ['market_news', 'keyword', '牛股', 1, 1, '行情：牛股'],
        ['market_news', 'keyword', '妖股', 1, 1, '行情：妖股'],
        ['market_news', 'keyword', '龙头', 1, 1, '行情：龙头'],
        ['market_news', 'keyword', '热点', 1, 1, '行情：热点'],
        ['market_news', 'keyword', '题材', 1, 1, '行情：题材'],
      ];
      for (const [cat, type, pattern, enabled, weight, desc] of systemRules) {
        await pool.execute(
          'INSERT INTO wechat_category_system_rules (category, rule_type, pattern, enabled, weight, description, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
          [cat, type, pattern, enabled, weight, desc, now, now]
        );
      }
      console.log(`已初始化 ${systemRules.length} 条系统分类规则`);
    }
  } catch (e) {
    console.error('初始化分类表失败:', e.message);
  }
}

// 修复 NULL 或非法分类的历史消息
async function fixNullCategories() {
  try {
    const [rows] = await pool.query(
      `SELECT id, message_text, stocks_json, category, is_manual FROM wechat_events 
       WHERE (category IS NULL OR category = '' OR (category != 'stock_pick' AND category != 'market_news' AND category != 'marketing'))
       AND (is_manual IS NULL OR is_manual = 0)
       ORDER BY created_at DESC LIMIT 200`
    );
    if (rows.length === 0) {
      console.log('分类检查：所有消息分类正常');
      return;
    }
    console.log(`发现 ${rows.length} 条分类异常消息，正在重新分类...`);
    let fixed = 0;
    for (const r of rows) {
      const newCat = await categorizeMessage(r.message_text || '', r.stocks_json || '[]');
      await pool.execute('UPDATE wechat_events SET category = ? WHERE id = ?', [newCat, r.id]);
      fixed++;
    }
    // 清除系统规则缓存以确保新规则生效
    invalidateSystemRulesCache();
    console.log(`分类修复完成：${fixed} 条消息已重新分类`);
  } catch (e) {
    console.error('分类修复失败:', e.message);
  }
}

async function mergeExistingInvestorAliases() {
  try {
    const [rows] = await pool.query(
      `SELECT sender, SUM(item_count) AS item_count FROM (
         SELECT sender, COUNT(*) AS item_count FROM wechat_events
          WHERE sender IS NOT NULL AND sender != '' AND sender != '未识别发送人' GROUP BY sender
         UNION ALL
         SELECT sender, COUNT(*) AS item_count FROM wechat_tracking
          WHERE sender IS NOT NULL AND sender != '' AND sender != '未识别发送人' GROUP BY sender
       ) investor_names GROUP BY sender ORDER BY item_count DESC, sender ASC`
    );
    const canonicalByKey = new Map();
    const aliases = [];
    for (const row of rows) {
      const sender = cleanSender(row.sender || '');
      const key = normalizeInvestorKey(sender);
      if (!key) continue;
      if (!canonicalByKey.has(key)) canonicalByKey.set(key, sender);
      else if (canonicalByKey.get(key) !== sender) aliases.push([sender, canonicalByKey.get(key)]);
    }
    if (!aliases.length) return;

    const connection = await pool.getConnection();
    try {
      await connection.beginTransaction();
      for (const [alias, canonical] of aliases) {
        await connection.execute('UPDATE wechat_events SET sender = ? WHERE sender = ?', [canonical, alias]);
        await connection.execute('UPDATE wechat_tracking SET sender = ? WHERE sender = ?', [canonical, alias]);
      }
      await connection.commit();
      console.log(`投资人归并完成：合并 ${aliases.length} 个名称别名`);
    } catch (err) {
      await connection.rollback();
      throw err;
    } finally {
      connection.release();
    }
  } catch (err) {
    console.error('投资人归并失败:', err.message);
  }
}

let server = null;

async function startServer() {
  await initTaskTables(getRawPool());
  try {
    await ensureAiArticlesTable();
    await migrate();
    // 初始化系统分类规则表和学习规则表
    await initCategoryTables();
    await Promise.all([loadSystemRules(), loadLearnedRules(), loadFeedbackExamples(), loadCategoryRulesSnapshot()]);
    // 从 ai_settings 加载历史累计清理数，避免重启归零
    try {
      const [cleanRows] = await pool.query('SELECT setting_value FROM ai_settings WHERE setting_key = ?', ['total_cleaned_rules']);
      if (cleanRows.length) _totalCleanedRules = Math.max(0, parseInt(cleanRows[0].setting_value) || 0);
    } catch (e) {}
    // 启动时清理历史无效规则（强制执行）
    cleanupLearnedRules(true).catch(() => {});
    await mergeExistingInvestorAliases();
    // 注册带学习的分类器钩子（必须在 initCategoryTables 之后）
    setCategoryClassifierHook(categorizeMessageWithLearn);
    setAutoFillLogicHook(autoFillStockLogic);
    await initEventsFromDb();
    if (process.env.ENABLE_LOCAL_FEATURES === 'true' && process.env.BACKGROUND_JOBS_ENABLED !== 'false') setImmediate(syncExistingTracking);
    // 启动时自动修复分类为 NULL 或非法的历史消息
    await fixNullCategories();
    server = app.listen(port, () => {
      console.log(`服务器运行在 http://localhost:${port}`);
      // 搜索链路开机自启 + 真实可用性自检：拉起 Docker Desktop → SearXNG 容器 → 端到端探测
      // （缺 Docker / 引擎起不来时自动降级到 Bing，全程不阻塞 Express 启动）
      if (process.env.BACKGROUND_JOBS_ENABLED !== 'false') {
        setImmediate(async () => {
          // 先按系统设置恢复降级链顺序，再跑自检：用户手动排过顺序时，自检不再覆盖它
          try {
            const [orderRows] = await pool.query("SELECT setting_value FROM ai_settings WHERE setting_key = 'search_source_order'");
            const order = parseSearchSourceOrder(orderRows[0]?.setting_value);
            if (order.length) setSourceOrder(order);
          } catch (e) { console.warn('[搜索顺序] 读取设置失败:', e.message); }
          startSearchStack()
            .then(({ searxng, health }) => {
              console.log('[SearXNG]', searxng.started ? `就绪（${searxng.reason}）` : `未启用（${searxng.reason}）`);
              console.log(`[搜索链路] 自检完成，当前主力源：${health.healthy || '无，将走 Tavily 兜底'}`);
            })
            .catch(e => console.warn('[搜索环境] 启动流程异常（已忽略，搜索自动降级）:', e.message));
        });
      }
      // 延迟 3 秒预热行情缓存（新浪 70 页要 40+ 秒，首次后台跑不阻塞）
      if (process.env.BACKGROUND_JOBS_ENABLED !== 'false') setTimeout(() => {
        fetchMarketOverview().then(d => {
          if (d) console.log('[market] 预热完成:', d.totalAmountYi, '亿, 涨' + d.riseCount + '/跌' + d.fallCount);
        }).catch(e => console.warn('[market] 预热失败:', e.message));
      }, 3000);
      // 启动即预热打新日历缓存（akshare 约 16 秒，后台跑，避免用户首次打开等待）
      if (process.env.BACKGROUND_JOBS_ENABLED !== 'false') refreshIpoCalendar()
        .then(c => console.log('[IpoCalendar] 预热完成:', c.rows.length, '行，来源', c.source))
        .catch(e => console.warn('[IpoCalendar] 预热失败:', e.message));
// ===== 盘中实时止盈检测 =====
// 每 60s 扫一次所有未止盈、未锁定的追踪股，用腾讯实时价判断：
//   现价 vs 买入价 的涨幅 >= 该条的 targetProfit% → 立刻固化并锁定
//   固化后 locked=1，后续 refreshTrackingPrices 不会覆盖
//   遵守 T+1：D0 当天触发跳过（T+1 卖不出），D1+ 才有效
//   触发止盈时同步更新 daily 表对应日期的 high_price（让累计计算用最新值），
//   但 open_price / close_price 保持原样（等收盘后正常写入）
async function checkIntradayProfit() {
  if (!isTradingTime()) return;  // 只在交易时段跑
  const today = todayStr();
  try {
    // 0. 兜底：把所有已判定有效止盈但还没锁的记录，一次性锁上
    //    （refreshTrackingPrices 会设 is_effective_profit=1 但不设 locked，
    //     这里补上，确保不会出现 is_effective_profit=1 & locked=0 的状态）
    await pool.execute(
      `UPDATE wechat_tracking SET locked = 1, updated_at = ?
       WHERE deleted_at IS NULL AND is_effective_profit = 1 AND locked = 0`,
      [Date.now()]
    );

    const [trackings] = await pool.query(
      `SELECT t.id, t.stock_code, t.pick_open_price, t.pick_close_price, t.pick_change_percent,
              t.d1_open_change_percent, t.target_profit_percent, t.pick_date
       FROM wechat_tracking t
       WHERE t.deleted_at IS NULL AND t.locked = 0
         AND t.pick_open_price > 0`
    );
    if (!trackings.length) return;

    // 预查每条 tracking 的"今天或最近交易日"对应的 day_index
    const dayIndexMap = {};
    for (const t of trackings) {
      const [diRows] = await pool.query(
        `SELECT day_index FROM wechat_tracking_daily
          WHERE tracking_id = ? AND trade_date <= ?
          ORDER BY trade_date DESC LIMIT 1`,
        [t.id, today]
      );
      if (diRows.length) {
        dayIndexMap[t.id] = Number(diRows[0].day_index);
      } else {
        dayIndexMap[t.id] = dateDiffDays(t.pick_date, today);
      }
    }

    const codes = [...new Set(trackings.map(t => t.stock_code))];
    if (!codes.length) return;

    const tencentCodes = codes.map(stockCodeToTencent).join(',');
    const resp = await fetch(`https://qt.gtimg.cn/q=${tencentCodes}`, {
      signal: AbortSignal.timeout(8000),
      headers: { 'User-Agent': 'Mozilla/5.0' }
    });
    const text = await fetchGbkText(resp);
    const priceMap = {};
    for (const line of text.split('\n').filter(Boolean)) {
      const m = line.match(/v_(\w+)="([^"]*)"/);
      if (!m) continue;
      const fields = m[2].split('~');
      if (fields.length < 35) continue;
      const code = fields[2].replace(/^(sh|sz|bj)/, '');
      const price = Number(fields[3]);
      if (price > 0) priceMap[code] = price;
    }
    if (!Object.keys(priceMap).length) return;

    const now = Date.now();
    for (const t of trackings) {
      const price = priceMap[t.stock_code];
      if (!price) continue;

      const pickOpen = Number(t.pick_open_price);
      const target = Number(t.target_profit_percent) || 5.00;
      const dayIndex = dayIndexMap[t.id] ?? -1;

      // ===== 严格遵守 T+1 规则（与 refreshTrackingPrices 完全一致） =====
      // D0 当天：无论盘中涨多高都不锁（T+1 卖不出）
      if (dayIndex < 1) continue;

      // D1+ 盘中任何时刻，实时价 >= target% 就可以止盈卖出
      // T+1 只限制 D0 不能卖，D1 起全天可卖：
      //   即使 D0 大涨 + D1 开盘没守住 target%，D1 盘中冲高到 target%+ 也能卖
      //   这与 refreshTrackingPrices 遍历 daily high 的逻辑一致
      const pct = ((price - pickOpen) / pickOpen) * 100;
      if (pct < target) continue;

      const profitPct = Number(pct.toFixed(2));

      // 1. 固化有效止盈到 tracking 主表
      await pool.execute(
        `UPDATE wechat_tracking
         SET is_effective_profit = 1,
             effective_profit_percent = ?,
             effective_profit_day_index = ?,
             locked = 1,
             updated_at = ?
         WHERE id = ?`,
        [profitPct, dayIndex, now, t.id]
      );

      // 2. 同步更新 daily 表当天的 high_price（盘中真实最高价），
      //    open/close 保持不动（等收盘后正常写入）
      const newHigh = price;
      await pool.execute(
        `UPDATE wechat_tracking_daily
         SET high_price = GREATEST(COALESCE(high_price, 0), ?),
             updated_at = ?
         WHERE tracking_id = ? AND trade_date = ?`,
        [newHigh, now, t.id, today]
      );

      console.log(`[盘中止盈] ${t.stock_code} ${price}元 +${profitPct}% >= ${target}%, D${dayIndex} 固化并锁定`);
    }
  } catch (e) {
    console.warn('[盘中止盈] 检测失败:', e.message);
  }
}


      if (process.env.BACKGROUND_JOBS_ENABLED !== 'false') setInterval(() => {
        fetchMarketOverview().catch(() => {});
        checkIntradayProfit().catch(() => {});
      }, 60000);

      // 人生规划 · 后台自主增量生长：纯逻辑推演免费扩图，每 30 分钟往下拆一层
      if (process.env.BACKGROUND_JOBS_ENABLED !== 'false') {
        setTimeout(() => backgroundLifeGrow().catch(err => console.warn('[life-grow]', err.message)), 90000);
        setInterval(() => backgroundLifeGrow().catch(err => console.warn('[life-grow]', err.message)), 30 * 60 * 1000);
        // 资料检索每 30 分钟自动归集一批 pending 需求，产出检索清单 + 预估账单，等待人工审批
        setInterval(() => collectLifeRetrievalBatch().catch(err => console.warn('[life-retrieval]', err.message)), 30 * 60 * 1000);
      }
    });
  } catch (error) {
    console.error('服务器初始化失败:', error);
    await pool.end().catch(() => {});
    process.exit(1);
  }
}

async function shutdown() {
  stopWechatMonitor();
  // 注意：不再随服务退出停掉 SearXNG 容器——容器带 --restart unless-stopped，
  // 常驻可让下次启动秒级复用，也能在 Docker 引擎重启后自动跟着起来（线上环境不会执行）
  console.log('\n正在关闭服务器...');
  if (!server) {
    await pool.end().catch(() => {});
    process.exit(0);
    return;
  }
  server.close(async () => {
    await pool.end().catch(() => {});
    console.log('服务器已关闭');
    process.exit(0);
  });
  setTimeout(() => process.exit(1), 2000).unref();
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
async function bootstrap() {
  if (Buffer.from(process.env.KEY_ENCRYPTION_KEY || '', 'base64').length !== 32) throw new Error('请配置有效的 KEY_ENCRYPTION_KEY');
  const [locks] = await getRawPool().query("SELECT IS_USED_LOCK('stock-phase1-migration') AS holder");
  if (locks[0].holder) throw new Error('数据库迁移正在运行，请等待完成后再启动');
  const [migrations] = await getRawPool().query("SELECT completed_at FROM schema_migrations WHERE name = 'phase1'");
  if (!migrations[0]?.completed_at) throw new Error('请先停旧服务并执行 npm run migrate:phase1 -- --apply');
  const [owners] = await getRawPool().query("SELECT id, email, role FROM users WHERE role = 'owner' AND disabled = 0 LIMIT 1");
  if (!owners.length) throw new Error('缺少迁移所有者');
  owners[0].id = Number(owners[0].id);
  await context.run({ user: owners[0], schema: true }, startServer);
}

bootstrap().catch(async error => {
  console.error('启动失败:', error.message);
  await getRawPool().end().catch(() => {});
  process.exitCode = 1;
});
