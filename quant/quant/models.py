"""数据模型定义。"""
from __future__ import annotations

from dataclasses import dataclass
from enum import Enum


class Signal(str, Enum):
    """策略输出的交易信号（简单策略用 Signal 即可）。"""

    BUY = "BUY"        # 买入（开仓，默认满仓）
    HOLD = "HOLD"      # 持有（空仓则等待；持仓则继续）
    SELL = "SELL"      # 卖出（平仓）
    ADD = "ADD"        # 加仓/补仓：在现有持仓上再加「与当前持仓相同股数」（即仓位翻倍）
    NO_ACTION = "NO_ACTION"


@dataclass
class Order:
    """精确下单指令：需要「分批建仓 / 指定股数」时用 Order 代替裸 Signal。

    策略的 on_bar 可以返回 Signal（简单）或 Order（精确），引擎两者都认。
    - action: "BUY"(开仓) / "ADD"(加仓) / "SELL"(平仓)
    - size=None 时取引擎默认：BUY=满仓、ADD=仓位翻倍、SELL=全部平仓
    - size_type:
        "shares" 直接给股数（会按 100 股/手向下取整）
        "amount" 给买入金额（元）
        "pct"    给可用现金比例（0~1）
    """

    action: str
    size: float | None = None
    size_type: str = "shares"


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
    """一笔已平仓的交易（含分批建仓的合并结果）。"""

    code: str
    entry_date: str
    exit_date: str
    entry_price: float     # 建仓+补仓后的持仓均价
    exit_price: float
    shares: int
    gross_pnl: float       # 毛利（不含交易成本）
    commission: float      # 本次交易佣金
    stamp_duty: float      # 卖出印花税
    net_pnl: float         # 净利（扣除成本后）
    return_pct: float      # 单笔收益率（基于成交额）
    reason: str            # 平仓原因（如「有效止盈」「止损」「均线死叉」「回测结束平仓」）
    add_count: int = 0     # 期间补仓次数（0 = 一次性建仓）
    entry_reason: str = "" # 建仓原因（如「空仓建仓」「均线金叉」「放量突破建仓」）


@dataclass
class Position:
    """当前持仓状态（策略只读）。"""

    code: str | None
    entry_date: str | None
    shares: int
    avg_cost: float
    add_count: int = 0     # 本仓位已补仓次数
    last_price: float = 0.0  # 最近一次买入（建仓或补仓）的成交价