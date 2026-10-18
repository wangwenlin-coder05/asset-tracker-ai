"""回测引擎：轻量事件驱动，逐根 K 线推进。

撮合模型（避免未来函数）：
- 策略在某根 K 线产生的信号/指令，统一在【下一根 K 线的开盘价】成交（T+1）；
- 一字板约束：次日开盘若为「一字涨停」则买入指令作废、「一字跌停」则卖出指令作废
  （按代码前缀区分板幅：创业/科创 20%、北交所 30%、其余 10%；ST 未单独识别，按 10% 近似）；
- 当日成交按当日开盘价，隔日结算计入净值；
- 支持滑点与手续费（佣金 + 卖出印花税 + 双边过户费）。

仓位模型：
- 单标的、单仓位；空仓时 BUY 开仓，持仓时可 ADD 分批补仓（均价按加权重算）；
- 买入默认「满仓」，也可用 Order 指定股数/金额/资金比例实现分批建仓；
- 补仓次数上限由 EngineConfig.max_adds 或策略的 max_adds 属性控制（<=0 为不限）。

只做验证、不下单，完全本地计算，无网络依赖。
"""
from __future__ import annotations

import math
from dataclasses import dataclass, field

from .models import Bar, Order, Position, Signal, Trade
from .strategy import Strategy


@dataclass
class EquityPoint:
    date: str
    equity: float          # 总资产（现金 + 持仓市值）
    cash: float            # 可用现金
    position_value: float  # 持仓市值


@dataclass
class EngineConfig:
    initial_cash: float = 100_000.0
    initial_shares: int | None = None  # 首次建仓股数（None=满仓；>0 时 BUY 按指定股数买）
    commission_rate: float = 0.00023   # 佣金费率
    min_commission: float = 5.0        # 最低佣金
    stamp_duty: float = 0.001          # 卖出印花税
    transfer_fee_rate: float = 0.00001  # 过户费（买卖双边，按成交金额）
    slippage: float = 0.0              # 滑点（按成交价比例；liquidity_slippage 开启时仅作兜底）
    liquidity_slippage: bool = False   # True 时按当日成交额分档滑点（≥1亿 0.05% / ≥5000万 0.1% / ≥2000万 0.2% / 其余 0.4%）
    risk_free_rate: float = 0.0        # 无风险年利率，用于夏普（默认 0，与旧口径一致）
    execution_mode: str = "next_open"  # 成交模式：next_open=次日开盘（T+1 无前视）；signal_close=信号根收盘价（模拟盘中价，跳空日保护仍生效）
    lot_size: int = 100                # A 股一手 = 100 股
    max_adds: int | None = None        # 补仓次数上限（None 时取策略的 max_adds；<=0 表示不限）


@dataclass
class EngineResult:
    code: str
    start_date: str
    end_date: str
    initial_cash: float
    final_equity: float
    total_return: float        # 总收益率（小数）
    annualized_return: float   # 年化收益率（小数）
    max_drawdown: float        # 最大回撤（小数，正数表示）
    sharpe_ratio: float        # 夏普比率
    calmar_ratio: float        # 卡玛比率（年化 / 最大回撤）
    win_rate: float            # 胜率（小数）
    profit_loss_ratio: float   # 盈亏比（平均盈利 / 平均亏损）
    profit_factor: float       # 盈利因子（总盈利 / 总亏损）
    avg_win: float             # 平均盈利（金额）
    avg_loss: float            # 平均亏损（金额，正数）
    max_consecutive_wins: int  # 最大连续盈利交易次数
    max_consecutive_losses: int  # 最大连续亏损交易次数
    yearly_returns: dict       # 分年度收益率 { 'yyyy': 小数 }
    trade_count: int
    trades: list[Trade] = field(default_factory=list)
    equity_curve: list[EquityPoint] = field(default_factory=list)


class BacktestEngine:
    def __init__(self, strategy: Strategy, config: EngineConfig | None = None):
        self.strategy = strategy
        self.config = config or EngineConfig()

    def _entry_price(self, price: float, is_buy: bool, bar: Bar | None = None) -> float:
        """应用滑点后的成交价。

        滑点分两种：
        - 固定比例（config.slippage）：旧行为，所有成交统一滑点
        - 流动性分档（config.liquidity_slippage=True）：按当日成交额分档
          ≥1亿 0.05% / ≥5000万 0.10% / ≥2000万 0.20% / 其余 0.40%
          （小盘/冷门股冲击成本高，滑点自动放大）
        """
        slip = self.config.slippage
        if self.config.liquidity_slippage and bar is not None and price > 0:
            amount = float(bar.amount or 0.0)
            if amount >= 1e8:
                slip = 0.0005
            elif amount >= 5e7:
                slip = 0.001
            elif amount >= 2e7:
                slip = 0.002
            else:
                slip = 0.004
        if slip:
            return price * (1 + slip) if is_buy else price * (1 - slip)
        return price

    def _commission(self, amount: float) -> float:
        return max(amount * self.config.commission_rate, self.config.min_commission)

    def _transfer_fee(self, amount: float) -> float:
        """过户费：买卖双边，按成交金额收取。"""
        return amount * self.config.transfer_fee_rate

    def _shares_for(self, cash: float, price: float) -> int:
        lot = self.config.lot_size
        if price <= 0 or cash <= 0:
            return 0
        # 预留印花税/佣金不影响买入，仅在买入金额内按手取整
        n_lots = math.floor(cash / (price * lot))
        return n_lots * lot

    # ---------- 下单指令解析与仓位计算 ----------

    def _resolve_order(self, sig) -> Order | None:
        """把策略返回值统一成 Order；HOLD/NO_ACTION/None/非法值 表示不下单。"""
        if sig is None:
            return None
        if isinstance(sig, Order):
            act = str(sig.action or "").upper()
            return sig if act in ("BUY", "ADD", "SELL") else None
        val = str(getattr(sig, "value", sig)).upper()
        if val in ("BUY", "ADD", "SELL"):
            return Order(val)
        return None

    def _add_cap(self) -> int | None:
        """补仓次数上限：EngineConfig 优先，其次策略的 max_adds 属性；<=0 视为不限。"""
        cap = self.config.max_adds
        if cap is None:
            cap = getattr(self.strategy, "max_adds", None)
        try:
            cap = int(cap)
        except (TypeError, ValueError):
            return None
        return cap if cap > 0 else None

    def _want_shares(self, order: Order, cash: float, price: float, cur_shares: int) -> int:
        """按指令计算「想要」的股数（未考虑现金是否够）。"""
        lot = self.config.lot_size
        if price <= 0:
            return 0
        if order.size is None:
            raw = cur_shares if order.action == "ADD" else cash / price
        else:
            try:
                v = float(order.size)
            except (TypeError, ValueError):
                return 0
            st = (order.size_type or "shares").lower()
            if st == "amount":
                raw = v / price
            elif st == "pct":
                raw = cash * v / price
            else:
                raw = v
        if raw <= 0:
            return 0
        return int(math.floor(raw / lot)) * lot

    def _affordable(self, cash: float, price: float, want: int) -> int:
        """在现金约束下把「想要」的股数缩到能买得起的最大手数（含佣金与过户费）。"""
        lot = self.config.lot_size
        if price <= 0 or want <= 0:
            return 0
        n = want
        while n > 0:
            amount = n * price
            if amount + self._commission(amount) + self._transfer_fee(amount) <= cash:
                break
            n -= lot
        return max(n, 0)

    # ---------- A 股涨跌停约束 ----------

    def _limit_pct(self, code: str) -> float:
        """按代码前缀近似涨跌停板幅：创业/科创 20%、北交所 30%、其余 10%（ST 未单独识别）。"""
        num = (code or "").split(".")[-1]
        if num.startswith(("300", "301", "688", "689")):
            return 0.20
        if len(num) == 6 and num.startswith(("43", "83", "87", "88", "92")):
            return 0.30
        return 0.10

    def _is_one_word_board(self, bar: Bar, prev_close, is_buy: bool) -> bool:
        """「一字板」= 全天无波（high==low）且开盘触及涨/跌停价，此时对手单缺失，指令作废。
        prev_close 为上一根收盘价（None=首根，无从判断）。"""
        if prev_close is None or prev_close <= 0:
            return False
        if bar.high != bar.low:
            return False
        limit = self._limit_pct(bar.code)
        tol = 1e-6
        if is_buy:
            return bar.open >= prev_close * (1 + limit) - tol
        return bar.open <= prev_close * (1 - limit) + tol

    def run(self, bars: list[Bar]) -> EngineResult:
        if not bars:
            raise ValueError("无行情数据，无法回测")

        self.strategy.reset()
        config = self.config
        cash = config.initial_cash

        # 持仓用列表复用，避免逐 K 线分配 dataclass（大回测的主要开销之一）
        # [code, entry_date, shares, avg_cost, add_count, last_price]
        pos = [None, None, 0, 0.0, 0, 0.0]
        add_cap = self._add_cap()
        lot = config.lot_size
        # 权益曲线以元组累积，末尾一次性物化为 EquityPoint
        equity_raw: list[tuple] = []
        eq_append = equity_raw.append
        trades: list[Trade] = []
        trade_append = trades.append
        pending: Order | None = None
        pending_reason = ""     # 上一根 K 线产生该指令时策略给出的原因说明
        entry_reason = ""       # 当前持仓的建仓原因（首次买入时记录，补仓不覆盖）
        prev_close = None       # 上一根收盘价（一字板判定用）
        prev_prev_close = None  # 上两根收盘价
        signal_bar = None       # signal_close 模式下「信号根」= 成交根
        def _try_fill(bar: Bar, prev_close_for_bar, exec_price_base: float, action: str, order: Order, reason: str) -> None:
            """在指定价格基础与一字板判定下执行一笔订单（原地修改 cash/pos/trades）。"""
            nonlocal cash, entry_reason
            if action == "SELL" and pos[2] > 0 and not self._is_one_word_board(bar, prev_close_for_bar, is_buy=False):
                shares, avg_cost = pos[2], pos[3]
                price = self._entry_price(exec_price_base, is_buy=False, bar=bar)
                amount = shares * price
                comm = self._commission(amount)
                duty = amount * config.stamp_duty
                tfee = self._transfer_fee(amount)
                net = amount - comm - duty - tfee
                cash += net
                entry_cost = avg_cost * shares
                net_pnl = net - entry_cost
                trade_append(
                    Trade(
                        code=bar.code, entry_date=pos[1] or "", exit_date=bar.date,
                        entry_price=avg_cost, exit_price=price, shares=shares,
                        gross_pnl=shares * price - entry_cost,
                        commission=comm, stamp_duty=duty, transfer_fee=tfee,
                        net_pnl=net_pnl,
                        return_pct=net_pnl / max(entry_cost, 1e-9),
                        reason=reason or "规则触发",
                        add_count=pos[4],
                        entry_reason=entry_reason or "规则触发",
                    )
                )
                pos[0] = pos[1] = None
                pos[2] = 0
                pos[3] = 0.0
                pos[4] = 0
                pos[5] = 0.0
                entry_reason = ""
            elif action == "BUY" and pos[2] == 0 and not self._is_one_word_board(bar, prev_close_for_bar, is_buy=True):
                price = self._entry_price(exec_price_base, is_buy=True, bar=bar)
                if order.size is None and config.initial_shares and config.initial_shares > 0:
                    want = int(math.floor(config.initial_shares / lot)) * lot
                else:
                    want = self._want_shares(order, cash, price, 0)
                shares = self._affordable(cash, price, want)
                if shares > 0:
                    amount = shares * price
                    comm = self._commission(amount)
                    tfee = self._transfer_fee(amount)
                    cash -= amount + comm + tfee
                    pos[0] = bar.code
                    pos[1] = bar.date
                    pos[2] = shares
                    pos[3] = price + (comm + tfee) / shares
                    pos[4] = 0
                    pos[5] = price
                    entry_reason = reason or "规则触发"
            elif action == "ADD" and pos[2] > 0:
                if add_cap is None or pos[4] < add_cap:
                    price = self._entry_price(exec_price_base, is_buy=True, bar=bar)
                    shares = self._affordable(
                        cash, price, self._want_shares(order, cash, price, pos[2])
                    )
                    if shares > 0:
                        amount = shares * price
                        comm = self._commission(amount)
                        tfee = self._transfer_fee(amount)
                        cash -= amount + comm + tfee
                        new_shares = pos[2] + shares
                        pos[3] = (pos[3] * pos[2] + amount + comm + tfee) / new_shares
                        pos[2] = new_shares
                        pos[4] += 1
                        pos[5] = price

        for bar in bars:
            # --- 成交阶段 ---
            if pending is not None:
                action = pending.action
                if config.execution_mode == "next_open":
                    # 默认：次日开盘成交（T+1 无前视）
                    _try_fill(bar, prev_close, bar.open, action, pending, pending_reason)
                else:
                    # signal_close：在信号根（上一根 bar）的收盘价成交
                    _try_fill(signal_bar, prev_prev_close, signal_bar.close, action, pending, pending_reason)
                pending = None
                pending_reason = ""

            # --- 决策阶段：策略看当前 K 线产出指令 ---
            h_pos = Position(code=pos[0], entry_date=pos[1], shares=pos[2], avg_cost=pos[3],
                             add_count=pos[4], last_price=pos[5])
            order = self._resolve_order(self.strategy.on_bar(bar, h_pos))
            if order is not None:
                if config.execution_mode == "next_open":
                    pending = order
                    pending_reason = getattr(self.strategy, "signal_reason", "") or ""
                else:
                    # signal_close：下一根立即在「信号根」的收盘价成交，无需再等
                    signal_bar = bar
                    # 直接把 order 当作 pending，下一轮循环开头会消费它（此时 prev_prev_close 仍指向信号根的前一根）
                    pending = order
                    pending_reason = getattr(self.strategy, "signal_reason", "") or ""

            hold = pos[2] > 0
            pos_value = pos[2] * bar.close if hold else 0.0
            eq_append((bar.date, cash + pos_value, cash, pos_value))
            prev_prev_close = prev_close
            prev_close = bar.close

        # 回测结束，强制平仓（按最后收盘价）
        if pos[2] > 0:
            last = bars[-1]
            price = last.close
            shares = pos[2]
            avg_cost = pos[3]
            amount = shares * price
            comm = self._commission(amount)
            duty = amount * config.stamp_duty
            tfee = self._transfer_fee(amount)
            net = amount - comm - duty - tfee
            entry_cost = avg_cost * shares
            net_pnl = net - entry_cost
            trade_append(
                Trade(
                    code=last.code, entry_date=pos[1] or "",
                    exit_date=last.date, entry_price=avg_cost,
                    exit_price=price, shares=shares,
                    gross_pnl=shares * price - entry_cost,
                    commission=comm, stamp_duty=duty, transfer_fee=tfee,
                    net_pnl=net_pnl,
                    return_pct=net_pnl / max(entry_cost, 1e-9), reason="回测结束平仓",
                    add_count=pos[4],
                    entry_reason=entry_reason or "规则触发",
                )
            )
            cash += net

        equity_curve = [
            EquityPoint(date=row[0], equity=row[1], cash=row[2], position_value=row[3])
            for row in equity_raw
        ]
        metrics = compute_metrics(equity_curve, cash, config.initial_cash, trades,
                                  risk_free_rate=config.risk_free_rate)

        return EngineResult(
            code=bars[0].code,
            start_date=bars[0].date,
            end_date=bars[-1].date,
            initial_cash=config.initial_cash,
            final_equity=cash,
            trades=trades,
            equity_curve=equity_curve,
            **metrics,
        )


def compute_metrics(
    equity_curve: list[EquityPoint],
    final_cash: float,
    initial_cash: float,
    trades: list[Trade],
    risk_free_rate: float = 0.0,
) -> dict:
    """计算绩效指标。equity_curve 传入仅用于最大回撤/夏普的计算。
    risk_free_rate：无风险年利率（夏普扣减用，默认 0 与旧口径一致）。"""
    _numpy = _lazy_numpy()
    if _numpy is not None:
        _max_dd, _sharpe = _metrics_numpy(_numpy, equity_curve, risk_free_rate)
    else:
        _max_dd, _sharpe = _metrics_python(equity_curve, risk_free_rate)

    n_days = max(len(equity_curve), 1)
    total_return = (final_cash / initial_cash - 1.0) if initial_cash else 0.0

    # 年化（按 252 交易日）
    years = max(n_days / 252.0, 1e-9)
    annualized = (1 + total_return) ** (1 / years) - 1 if total_return > -1 else -1.0

    # 胜率 / 盈亏比
    wins = [t for t in trades if t.net_pnl > 0]
    losses = [t for t in trades if t.net_pnl <= 0]
    win_rate = len(wins) / len(trades) if trades else 0.0
    avg_win = sum(t.net_pnl for t in wins) / len(wins) if wins else 0.0
    avg_loss = abs(sum(t.net_pnl for t in losses) / len(losses)) if losses else 0.0
    pf_ratio = (avg_win / avg_loss) if avg_loss > 1e-9 else (float("inf") if avg_win > 0 else 0.0)

    # 盈利因子（总盈利 / 总亏损）
    gross_profit = sum(t.net_pnl for t in wins)
    gross_loss = abs(sum(t.net_pnl for t in losses))
    profit_factor = (gross_profit / gross_loss) if gross_loss > 1e-9 \
        else (float("inf") if gross_profit > 0 else 0.0)

    # 最大连续盈利 / 亏损交易次数
    max_win_run = max_loss_run = cur_run = 0
    cur_sign = 0
    for t in trades:
        s = 1 if t.net_pnl > 0 else -1
        if s == cur_sign:
            cur_run += 1
        else:
            cur_run = 1
            cur_sign = s
        if s > 0:
            max_win_run = max(max_win_run, cur_run)
        else:
            max_loss_run = max(max_loss_run, cur_run)

    # 卡玛比率（年化 / 最大回撤）
    calmar = (annualized / _max_dd) if _max_dd > 1e-9 else (
        float("inf") if annualized > 0 else 0.0
    )

    # 分年度收益（每年末净值相对前一年末 / 期初）
    yearly = {}
    if equity_curve:
        base = initial_cash
        year_last: dict[str, float] = {}
        for p in equity_curve:
            y = p.date[:4] if len(p.date) >= 4 else "?"
            year_last[y] = p.equity
        for y in sorted(year_last.keys()):
            e = year_last[y]
            if base > 0:
                yearly[y] = round(e / base - 1.0, 6)
            base = e

    return {
        "total_return": round(total_return, 6),
        "annualized_return": round(annualized, 6),
        "max_drawdown": round(_max_dd, 6),
        "sharpe_ratio": round(_sharpe, 4),
        "calmar_ratio": (round(calmar, 4)
                         if calmar != float("inf") else None),
        "win_rate": round(win_rate, 4),
        "profit_loss_ratio": (round(pf_ratio, 4)
                              if pf_ratio != float("inf") else None),
        "profit_factor": (round(profit_factor, 4)
                          if profit_factor != float("inf") else None),
        "avg_win": round(avg_win, 2),
        "avg_loss": round(avg_loss, 2),
        "max_consecutive_wins": max_win_run,
        "max_consecutive_losses": max_loss_run,
        "yearly_returns": yearly,
        "trade_count": len(trades),
    }


_numpy_cache = None
_numpy_checked = False


def _lazy_numpy():
    """延迟尝试导入 numpy；不可用则返回 None（纯 Python 兜底，不强制依赖）。"""
    global _numpy_cache, _numpy_checked
    if not _numpy_checked:
        _numpy_checked = True
        try:
            import numpy

            _numpy_cache = numpy
        except (ImportError, OSError):
            _numpy_cache = None
    return _numpy_cache


def _metrics_python(equity_curve: list[EquityPoint], risk_free_rate: float = 0.0):
    """纯 Python 单趟计算最大回撤与夏普（保持原浮点行为）。
    夏普扣减日无风险利率 rf_daily = (1+rf)^(1/252)-1（rf=0 时与旧口径一致）。"""
    peak = -math.inf
    max_dd = 0.0
    prev = None
    mean = 0.0
    m2 = 0.0  # Welford 在线方差（样本）
    count = 0
    rf_daily = (1.0 + risk_free_rate) ** (1.0 / 252.0) - 1.0
    for n, p in enumerate(e.equity for e in equity_curve):
        if n == 0:
            prev = p
            continue
        if prev > 0:
            r = p / prev - 1.0 - rf_daily
            count += 1
            delta = r - mean
            mean += delta / count
            m2 += delta * (r - mean)
        prev = p
        peak = max(peak, p)
        if peak > 0:
            dd = (peak - p) / peak
            max_dd = max(max_dd, dd)

    sharpe = 0.0
    if count > 1:
        std = math.sqrt(m2 / (count - 1))
        if std > 1e-12:
            sharpe = (mean / std) * math.sqrt(252)
    return max_dd, sharpe


def _metrics_numpy(np, equity_curve: list[EquityPoint], risk_free_rate: float = 0.0):
    """numpy 向量化：最大回撤与夏普，加速长序列。夏普同样扣减日无风险利率。"""
    eq = np.fromiter((p.equity for p in equity_curve), dtype=np.float64)
    running_peak = np.maximum.accumulate(eq)
    with np.errstate(divide="ignore", invalid="ignore"):
        dd = np.where(running_peak > 0, (running_peak - eq) / running_peak, 0.0)
        max_dd = float(dd.max() if dd.size else 0.0)

    rf_daily = (1.0 + risk_free_rate) ** (1.0 / 252.0) - 1.0
    if eq.size > 1:
        prev = eq[:-1]
        valid = prev > 0
        if valid.any():
            returns = eq[1:][valid] / prev[valid] - 1.0 - rf_daily
            mean = returns.mean(dtype=np.float64)
            std = returns.std(ddof=1)
            sharpe = (mean / std) * math.sqrt(252) if std > 1e-12 else 0.0
        else:
            sharpe = 0.0
    else:
        sharpe = 0.0
    return max_dd, sharpe