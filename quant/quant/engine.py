"""回测引擎：轻量事件驱动，逐根 K 线推进。

撮合模型（避免未来函数）：
- 策略在某根 K 线产生的信号，统一在【下一根 K 线的开盘价】成交（T+1）；
- 当日成交按当日开盘价，隔日结算计入净值；
- 支持滑点与手续费（佣金 + 卖出印花税）。

只做验证、不下单，完全本地计算，无网络依赖。
"""
from __future__ import annotations

import math
from dataclasses import dataclass, field

from .models import Bar, Position, Signal, Trade
from .strategy import Strategy


@dataclass
class EquityPoint:
    date: str
    equity: float          # 总资产（现金 + 持仓市值）
    cash: float            # 可用现金
    position_value: float  # 持仓市值

    @property
    def return_pct(self) -> float:
        return 0.0


@dataclass
class EngineConfig:
    initial_cash: float = 100_000.0
    commission_rate: float = 0.00023   # 佣金费率
    min_commission: float = 5.0        # 最低佣金
    stamp_duty: float = 0.001          # 卖出印花税
    slippage: float = 0.0              # 滑点（按成交价比例）
    lot_size: int = 100                # A 股一手 = 100 股


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
    win_rate: float            # 胜率（小数）
    profit_loss_ratio: float   # 盈亏比
    trade_count: int
    trades: list[Trade] = field(default_factory=list)
    equity_curve: list[EquityPoint] = field(default_factory=list)


class BacktestEngine:
    def __init__(self, strategy: Strategy, config: EngineConfig | None = None):
        self.strategy = strategy
        self.config = config or EngineConfig()

    def _entry_price(self, price: float, is_buy: bool) -> float:
        """应用滑点后的成交价。"""
        p = price
        if self.config.slippage:
            p = price * (1 + self.config.slippage) if is_buy else price * (1 - self.config.slippage)
        return p

    def _commission(self, amount: float) -> float:
        return max(amount * self.config.commission_rate, self.config.min_commission)

    def _shares_for(self, cash: float, price: float) -> int:
        lot = self.config.lot_size
        if price <= 0 or cash <= 0:
            return 0
        # 预留印花税/佣金不影响买入，仅在买入金额内按手取整
        n_lots = math.floor(cash / (price * lot))
        return n_lots * lot

    def run(self, bars: list[Bar]) -> EngineResult:
        if not bars:
            raise ValueError("无行情数据，无法回测")

        self.strategy.reset()
        config = self.config
        cash = config.initial_cash

        # 持仓用 4 元列表复用，避免逐 K 线分配 dataclass（大回测的主要开销之一）
        pos = [None, None, 0, 0.0]  # [code, entry_date, shares, avg_cost]
        # 权益曲线以元组累积，末尾一次性物化为 EquityPoint
        equity_raw: list[tuple] = []
        eq_append = equity_raw.append
        trades: list[Trade] = []
        trade_append = trades.append
        pending: Signal = Signal.NO_ACTION

        for bar in bars:
            _, _, shares, avg_cost = pos
            # --- 成交阶段：执行上一根 K 线产生的信号（在本次开盘价成交，T+1）---
            if pending == Signal.BUY and shares == 0:
                price = self._entry_price(bar.open, is_buy=True)
                shares = self._shares_for(cash, price)
                if shares > 0:
                    amount = shares * price
                    comm = self._commission(amount)
                    total_cost = amount + comm
                    if total_cost <= cash:
                        cash -= total_cost
                        pos[0] = bar.code
                        pos[1] = bar.date
                        pos[2] = shares
                        pos[3] = price + comm / shares
            elif pending == Signal.SELL and shares > 0:
                price = self._entry_price(bar.open, is_buy=False)
                amount = shares * price
                comm = self._commission(amount)
                duty = amount * config.stamp_duty
                net = amount - comm - duty
                cash += net

                entry_cost = avg_cost * shares
                gross_pnl = shares * price - entry_cost
                net_pnl = net - entry_cost
                trade_append(
                    Trade(
                        code=bar.code,
                        entry_date=pos[1] or "",
                        exit_date=bar.date,
                        entry_price=avg_cost,
                        exit_price=price,
                        shares=shares,
                        gross_pnl=gross_pnl,
                        commission=comm,
                        stamp_duty=duty,
                        net_pnl=net_pnl,
                        return_pct=net_pnl / max(entry_cost, 1e-9),
                        reason="RULE",
                    )
                )
                pos[0] = pos[1] = None
                pos[2] = 0
                pos[3] = 0.0
            pending = Signal.NO_ACTION

            # --- 决策阶段：策略看当前 K 线产出下一根的信号 ---
            h_pos = Position(code=pos[0], entry_date=pos[1], shares=pos[2], avg_cost=pos[3])
            sig = self.strategy.on_bar(bar, h_pos)
            if sig in (Signal.BUY, Signal.SELL):
                pending = sig

            hold = pos[2] > 0
            pos_value = pos[2] * bar.close if hold else 0.0
            eq_append((bar.date, cash + pos_value, cash, pos_value))

        # 回测结束，强制平仓（按最后收盘价）
        if pos[2] > 0:
            last = bars[-1]
            price = last.close
            shares = pos[2]
            avg_cost = pos[3]
            amount = shares * price
            comm = self._commission(amount)
            duty = amount * config.stamp_duty
            net = amount - comm - duty
            entry_cost = avg_cost * shares
            gross_pnl = shares * price - entry_cost
            net_pnl = net - entry_cost
            trade_append(
                Trade(
                    code=last.code, entry_date=pos[1] or "",
                    exit_date=last.date, entry_price=avg_cost,
                    exit_price=price, shares=shares, gross_pnl=gross_pnl,
                    commission=comm, stamp_duty=duty, net_pnl=net_pnl,
                    return_pct=net_pnl / max(entry_cost, 1e-9), reason="END",
                )
            )
            cash += net

        equity_curve = [
            EquityPoint(date=row[0], equity=row[1], cash=row[2], position_value=row[3])
            for row in equity_raw
        ]
        metrics = compute_metrics(equity_curve, cash, config.initial_cash, trades)

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
) -> dict:
    """计算绩效指标。equity_curve 传入仅用于最大回撤/夏普的计算。"""
    _numpy = _lazy_numpy()
    if _numpy is not None:
        _max_dd, _sharpe = _metrics_numpy(_numpy, equity_curve)
    else:
        _max_dd, _sharpe = _metrics_python(equity_curve)

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

    return {
        "total_return": round(total_return, 6),
        "annualized_return": round(annualized, 6),
        "max_drawdown": round(_max_dd, 6),
        "sharpe_ratio": round(_sharpe, 4),
        "win_rate": round(win_rate, 4),
        "profit_loss_ratio": (round(pf_ratio, 4)
                              if pf_ratio != float("inf") else None),
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


def _metrics_python(equity_curve: list[EquityPoint]):
    """纯 Python 单趟计算最大回撤与夏普（保持原浮点行为）。"""
    peak = -math.inf
    max_dd = 0.0
    prev = None
    mean = 0.0
    m2 = 0.0  # Welford 在线方差（样本）
    count = 0
    for n, p in enumerate(e.equity for e in equity_curve):
        if n == 0:
            prev = p
            continue
        if prev > 0:
            r = p / prev - 1.0
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


def _metrics_numpy(np, equity_curve: list[EquityPoint]):
    """numpy 向量化：最大回撤与夏普，加速长序列。"""
    eq = np.fromiter((p.equity for p in equity_curve), dtype=np.float64)
    running_peak = np.maximum.accumulate(eq)
    with np.errstate(divide="ignore", invalid="ignore"):
        dd = np.where(running_peak > 0, (running_peak - eq) / running_peak, 0.0)
        max_dd = float(dd.max() if dd.size else 0.0)

    if eq.size > 1:
        prev = eq[:-1]
        valid = prev > 0
        if valid.any():
            returns = eq[1:][valid] / prev[valid] - 1.0
            mean = returns.mean(dtype=np.float64)
            std = returns.std(ddof=1)
            sharpe = (mean / std) * math.sqrt(252) if std > 1e-12 else 0.0
        else:
            sharpe = 0.0
    else:
        sharpe = 0.0
    return max_dd, sharpe