require('dotenv').config();
const express = require('express');
const mysql = require('mysql2/promise');
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
const port = Number(process.env.PORT) || 3000;

const iconsDir = path.join(__dirname, 'uploads', 'icons');
if (!fs.existsSync(iconsDir)) fs.mkdirSync(iconsDir, { recursive: true });

const woolDir = path.join(__dirname, 'uploads', 'wool');
if (!fs.existsSync(woolDir)) fs.mkdirSync(woolDir, { recursive: true });

const quizDir = path.join(__dirname, 'uploads', 'quiz');
if (!fs.existsSync(quizDir)) fs.mkdirSync(quizDir, { recursive: true });

const movieDir = path.join(__dirname, 'uploads', 'movie');
if (!fs.existsSync(movieDir)) fs.mkdirSync(movieDir, { recursive: true });

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, iconsDir),
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
  destination: (req, file, cb) => cb(null, woolDir),
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
  destination: (req, file, cb) => cb(null, quizDir),
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

app.use(cors());
app.use(express.json({ limit: '15mb' }));
app.get('/favicon.ico', (req, res) => res.status(204).end());
app.use('/uploads', express.static(path.join(__dirname, 'uploads'), {
  maxAge: '7d',
  immutable: true
}));

const pool = mysql.createPool({
  host: 'localhost',
  user: 'root',
  password: '1234',
  database: 'stock_calculator',
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
  dateStrings: true,
  timezone: '+08:00'
});

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
              
              await pool.execute(`UPDATE buy_records SET t_group_id = ?, t_type = '正T', t_profit = ?, cost_change = ? WHERE id = ?`, 
                [groupId, profit, profit, tx.record.id]);
              await pool.execute(`UPDATE sell_records SET t_group_id = ?, t_type = '反T' WHERE id = ?`, 
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
              
              await pool.execute(`UPDATE buy_records SET t_group_id = ?, t_type = '正T', t_profit = ?, cost_change = ? WHERE id = ?`, 
                [groupId, profit, profit, buyTx.record.id]);
              await pool.execute(`UPDATE sell_records SET t_group_id = ?, t_type = ? WHERE id = ?`, 
                [groupId, '', tx.record.id]);
              
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
ensureAiArticlesTable();

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
      const newPath = path.join(iconsDir, newName);
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
    const files = fs.readdirSync(iconsDir);
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
    
    let apiKey = '';
    try {
      const [rows] = await pool.query('SELECT setting_value FROM ai_settings WHERE setting_key = ?', ['glm_api_key']);
      apiKey = rows[0]?.setting_value || '';
    } catch (e) {}
    apiKey = apiKey || process.env.GLM_API_KEY || '';
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
    const filePath = path.join(iconsDir, filename);
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

  // 1. 从 stocksJson 判断：有股票代码 → 给 stock_pick 加高分（但不立即返回，让营销信号也能竞争）
  const categoryScores = { stock_pick: 0, market_news: 0, marketing: 0 };
  try {
    const stocks = JSON.parse(stocksJson || '[]');
    const hasValidStock = stocks.some(s => s && s.code && /^\d{6}$/.test(String(s.code).trim()));
    if (hasValidStock) categoryScores.stock_pick += 5 * hardcodeWeight;
  } catch {}

  // 2. 文本中包含【股票名 6位代码】格式（强推票信号）
  if (/【\s*[^】]*?\s+\d{6}\s*】/.test(text)) categoryScores.stock_pick += 4 * hardcodeWeight;

  // 3. 文本中包含6位数字股票代码且前后非数字（避免身份证/电话号误判）
  const codeMatches = cleanText.match(/(?:^|[^\d])(\d{6})(?:$|[^\d])/g) || [];
  if (codeMatches.length > 0) categoryScores.stock_pick += 3 * hardcodeWeight;
  if (/^\d{6}$/.test(cleanText)) categoryScores.stock_pick += 3 * hardcodeWeight;

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
  // 推票模式检查
  const hasStockBracket = /【[#⭕🔥\s]*[^】]{2,10}[#⭕🔥\s]*】/.test(text);
  if (hasStockBracket) categoryScores.stock_pick += 2 * hcW;
  const pickReviewKws = ['涨停', '跌停', 'T+1', 'T+0', '累计涨', '连板', '强势涨停', '封板', '打板', '两连板', '2连板', '3连板'];
  for (const kw of pickReviewKws) {
    if (text.includes(kw)) categoryScores.stock_pick += 1 * hcW;
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

  // 推票回顾模式：【股票名】+ 涨停/连板/T+1 等关键词（即使没有代码也算）
  const stockNameInBrackets = /【[#⭕🔥]?\s*[^】]{2,10}\s*】/.test(text);
  const pickReviewKeywords = ['涨停', '跌停', 'T+1', 'T+0', '累计涨', '连板', '强势涨停', '两连板', '2连板', '3连板', '封板', '打板'];
  const hasPickReviewKeyword = pickReviewKeywords.some(k => text.includes(k));
  if (stockNameInBrackets && hasPickReviewKeyword) return 'stock_pick';

  // 有【】括号且无其他强信号时，倾向推票（因为很少有其他类型消息用【】）
  if (stockNameInBrackets) {
    // 检查是否有行情关键词（大盘/走势/板块等）覆盖
    const newsOverrideKeywords = ['大盘', '走势', '板块', '行情', '市场', '指数', '沪指', '深成指', '创业板指'];
    const hasNewsOverride = newsOverrideKeywords.some(k => text.includes(k));
    if (!hasNewsOverride) return 'stock_pick';
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

  // 买入记录表添加 t_type 字段（正T/反T）
  try {
    await pool.execute(`ALTER TABLE buy_records ADD COLUMN t_type VARCHAR(10) DEFAULT ''`);
  } catch (err) {
    if (err.code !== 'ER_DUP_FIELDNAME') throw err;
  }

  // 卖出记录表添加 t_type 字段（反T）
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

  // 卖出记录表添加 t_pending 字段（反T欠着标记）
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

      // 调用 Agnes AI 进行汇总分析
      const summary = await callAI(systemPrompt, userPrompt, null, 'agnes-2.0-flash', 60000, 2000);
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

      const summary = await callAI(systemPrompt, userPrompt, null, 'agnes-2.0-flash', 120000, 4000);
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
app.get('/api/ai/settings', async (req, res) => {
  try {
    const [rows] = await pool.query('SELECT setting_key, setting_value FROM ai_settings');
    const map = {};
    rows.forEach(r => {
      if (r.setting_key.endsWith('_api_key')) {
        map[`${r.setting_key}_configured`] = Boolean(r.setting_value);
      } else {
        map[r.setting_key] = r.setting_value || '';
      }
    });
    // 默认模型
    if (!map.default_model) map.default_model = 'agnes-2.0-flash';
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
    const result = await callAI('你是一个测试助手。', '请回复"模型测试成功"四个字。', null, model, 30000, 500);
    res.json({ result, model });
  } catch (err) {
    console.error('模型测试失败:', err);
    res.status(500).json({ error: err.message });
  }
});

// AI 调用统计（从日志表统计，确保与日志一致）
app.get('/api/ai/usage', async (req, res) => {
  try {
    const today = new Date().toISOString().split('T')[0];
    const [rows] = await pool.query(
      'SELECT model, COUNT(*) as count FROM ai_logs WHERE success = 1 AND DATE(created_at) = ? GROUP BY model',
      [today]
    );
    const total = rows.reduce((sum, r) => sum + r.count, 0);
    const byModel = rows.map(r => ({ model: r.model, count: r.count }));
    res.json({ date: today, total, byModel });
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
    const settings = req.body; // { agnes_api_key: 'xxx', glm_api_key: 'xxx' }
    const now = Date.now();
    for (const [key, value] of Object.entries(settings)) {
      await pool.execute(
        'INSERT INTO ai_settings (setting_key, setting_value, updated_at) VALUES (?, ?, ?) ON DUPLICATE KEY UPDATE setting_value = ?, updated_at = ?',
        [key, value || '', now, value || '', now]
      );
    }
    res.json({ ok: true });
  } catch (err) {
    console.error('保存AI设置失败:', err);
    res.status(500).json({ error: '保存失败' });
  }
});

async function getGlmApiKey() {
  const [rows] = await pool.query('SELECT setting_value FROM ai_settings WHERE setting_key = ?', ['glm_api_key']);
  return rows[0]?.setting_value || process.env.GLM_API_KEY || '';
}

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
    await fs.promises.writeFile(path.join(movieDir, filename), buffer);
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
    if (!imagePath.startsWith('uploads/wool/')) return res.status(400).json({ error: '无效的凭证图片路径' });
    const fullPath = path.join(__dirname, imagePath);
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
async function callAI(systemPrompt, userPrompt, imagePath, model = 'agnes', timeoutMs = 30000, maxTokens = 800) {
  const startTime = Date.now();
  const isGlm = model.startsWith('glm-');
  const provider = isGlm ? 'glm' : 'agnes';
  // 数据库优先（用户通过设置页面管理 API Key），环境变量作为回退
  const envMap = { agnes: 'AGNES_API_KEY', glm: 'GLM_API_KEY' };
  let apiKey = '';
  try {
    const [rows] = await pool.query('SELECT setting_value FROM ai_settings WHERE setting_key = ?', [`${provider}_api_key`]);
    apiKey = rows[0]?.setting_value || '';
  } catch (e) {}
  if (!apiKey) {
    apiKey = process.env[envMap[provider] || 'AGNES_API_KEY'] || '';
  }
  if (!apiKey) {
    const nameMap = { agnes: 'Agnes', glm: '智谱GLM' };
    const msg = `⚠️ 未配置 ${nameMap[provider] || provider} API Key，请在设置中配置。`;
    // 记录无 Key 日志
    try {
      await pool.execute(
        'INSERT INTO ai_logs (model, provider, system_prompt_len, user_prompt_len, response_len, duration_ms, success, error_msg, request_content) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
        [resolvedModel || model, provider, systemPrompt.length, userPrompt.length, 0, Date.now() - startTime, 0, msg, `[系统提示] ${systemPrompt}\n\n[用户输入] ${userPrompt}`]
      );
    } catch (_) {}
    return msg;
  }

  // 模型配置
  const isAgnes = model === 'agnes' || model.startsWith('agnes-');
  let resolvedModel = model;
  if (model === 'agnes') resolvedModel = 'agnes-2.0-flash';
  if (imagePath && isGlm && !/v(?:-|$)/.test(model) && !model.includes('thinking-flash')) {
    resolvedModel = 'glm-4.6v-flash';
  }
  const config = isAgnes
    ? { url: 'https://api.agnes-ai.cn/v1/chat/completions', model: resolvedModel }
    : { url: 'https://open.bigmodel.cn/api/paas/v4/chat/completions', model: resolvedModel };

  const messages = [
    { role: 'system', content: systemPrompt }
  ];

  // 构建用户消息
  if (imagePath && imagePath.startsWith('uploads/')) {
    const fullPath = path.join(__dirname, imagePath);
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
    const response = await fetch(config.url, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      },
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
  const startTime = Date.now();
  const isGlm = model.startsWith('glm-');
  const provider = isGlm ? 'glm' : 'agnes';
  let apiKey = '';
  try {
    const [rows] = await pool.query('SELECT setting_value FROM ai_settings WHERE setting_key = ?', [`${provider}_api_key`]);
    apiKey = rows[0]?.setting_value || '';
  } catch (e) {}
  if (!apiKey) apiKey = process.env[isGlm ? 'GLM_API_KEY' : 'AGNES_API_KEY'] || '';
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
  if (model === 'agnes') resolvedModel = 'agnes-2.0-flash';
  const isAgnes = model === 'agnes' || model.startsWith('agnes-');
  const config = isAgnes
    ? { url: 'https://api.agnes-ai.cn/v1/chat/completions', model: resolvedModel }
    : { url: 'https://open.bigmodel.cn/api/paas/v4/chat/completions', model: resolvedModel };

  // 构建多图消息
  const contentParts = [{ type: 'text', text: userPrompt }];
  for (const imgPath of imagePaths) {
    const fullPath = path.join(__dirname, imgPath);
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
let goldCache = { price: null, source: '', market: '', updatedAt: '', fetchedAt: '', internationalPriceUsd: 0, lastFetchAt: 0 };

app.get('/api/gold-price', async (req, res) => {
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
  const alapiToken = process.env.ALAPI_TOKEN || '';
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
  const buf = Buffer.from(await resp.arrayBuffer());
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

async function fetchStockDailyHistory(stockCode, days = 30) {
  const tencentCode = stockCodeToTencent(stockCode);
  if (!tencentCode) return [];
  // 日期范围放宽到 days*2 个日历日
  const end = new Date();
  const start = new Date(end.getTime() - days * 2 * 24 * 3600 * 1000);
  const fmt = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  const count = Math.max(days * 2, 320);
  const url = `https://web.ifzq.gtimg.cn/appstock/app/fqkline/get?param=${tencentCode},day,${fmt(start)},${fmt(end)},${count},qfq`;
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
setImmediate(async () => {
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
});

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
    const result = extractWechatStocks(text, sender);
    const stocksJson = JSON.stringify(result.stocks || []);
    const category = await categorizeMessageWithLearn(text, stocksJson);
    res.json({ ...result, category });
  } catch (error) {
    console.error('wechat extract failed:', error);
    res.status(500).json({ error: '消息提取失败', message: error.message });
  }
});

// 图片/文字上传，AI 自动提取股票代码
const stockUploadDir = path.join(__dirname, 'uploads', 'stock');
if (!fs.existsSync(stockUploadDir)) fs.mkdirSync(stockUploadDir, { recursive: true });
const stockUpload = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => cb(null, stockUploadDir),
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
    destination: (req, file, cb) => cb(null, boardUploadDir),
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
async function categorizeMessageWithLearn(text, stocksJson) {
  // 清理逻辑已移至 updateRulesFromFeedback，按新增条数触发
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

app.use(express.static(__dirname));

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
  try {
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
    // 启动时自动修复分类为 NULL 或非法的历史消息
    await fixNullCategories();
    server = app.listen(port, () => {
      console.log(`服务器运行在 http://localhost:${port}`);
      // 延迟 3 秒预热行情缓存（新浪 70 页要 40+ 秒，首次后台跑不阻塞）
      setTimeout(() => {
        fetchMarketOverview().then(d => {
          if (d) console.log('[market] 预热完成:', d.totalAmountYi, '亿, 涨' + d.riseCount + '/跌' + d.fallCount);
        }).catch(e => console.warn('[market] 预热失败:', e.message));
      }, 3000);
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


      setInterval(() => {
        fetchMarketOverview().catch(() => {});
        checkIntradayProfit().catch(() => {});
      }, 60000);
    });
  } catch (error) {
    console.error('服务器初始化失败:', error);
    await pool.end().catch(() => {});
    process.exit(1);
  }
}

async function shutdown() {
  stopWechatMonitor();
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
startServer();

