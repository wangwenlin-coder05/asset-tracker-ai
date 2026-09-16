"""数据模型定义。"""
from __future__ import annotations

from dataclasses import dataclass
from enum import Enum


class Signal(str, Enum):
    """策略输出的交易信号。"""

    BUY = "BUY"        # 买入（开仓）
    HOLD = "HOLD"      # 持有（空仓则等待；持仓则继续）
    SELL = "SELL"      # 卖出（平仓）
    NO_ACTION = "NO_ACTION"


@dataclass
class Bar:
    """单根 K 线（日线）。"""

    code: str
    date: str          # YYYY-MM-DD
    open: float
    high: float
    low: float
    close: float
    volume: float      # 成交量（手）
    amount: float      # 成交额（元）
    adjust_factor: float = None  # 复权因子


@dataclass
class Trade:
    """一笔已平仓的交易。"""

    code: str
    entry_date: str
    exit_date: str
    entry_price: float
    exit_price: float
    shares: int
    gross_pnl: float       # 毛利（不含交易成本）
    commission: float      # 本次交易佣金
    stamp_duty: float      # 卖出印花税
    net_pnl: float         # 净利（扣除成本后）
    return_pct: float      # 单笔收益率（基于成交额）
    reason: str            # 平仓原因（TARGET / STOP_LOSS / RULE / END）


@dataclass
class Position:
    """当前持仓状态。"""

    code: str | None
    entry_date: str | None
    shares: int
    avg_cost: float