"""策略抽象。

策略是可配置、可替换的规则单元：同一接口既用于历史回测，也用于对当前行情出信号。
回测引擎只依赖本接口，与具体规则解耦。
"""
from __future__ import annotations

from abc import ABC, abstractmethod

from .models import Bar, Position, Signal


class Strategy(ABC):
    """策略接口。on_bar 在每根 K 线（按日期升序推进）被调用一次并返回信号。

    为避免未来函数（look-ahead bias），策略只能使用当前 K 线及之前的信息。
    """

    @abstractmethod
    def on_bar(self, bar: Bar, position: Position) -> Signal:
        """根据当前 K 线与已有持仓，产生一次交易信号。"""

    def reset(self) -> None:
        """每次回测开始时重置策略内部状态（可覆盖）。"""

    @property
    def name(self) -> str:
        return type(self).__name__


class T1TakeProfitStrategy(Strategy):
    """T+1 有效止盈策略。

    业务规则（编码自现项目 wechat_tracking 的 T+1 判定模型）：
    - D0 为推荐/买入日，当日计入持仓天数；D0 当日盘中涨超阈值【不算】有效止盈；
    - 唯一有效止盈窗口在 D1 及以后：盘中价 >= 阈值才算"有效止盈"；
    - 若 D0 已涨超阈值，仍须 D1 开盘继续 >= 阈值（未跌破）才判定有效（防守 D0 虚涨）；
    - 达到有效止盈即卖出；否则持有直至触发止损或回测结束。
    """

    def __init__(
        self,
        take_profit: float = 0.05,     # 有效止盈阈值（默认 5%，可配 10%/20%）
        stop_loss: float = -0.05,      # 止损阈值（负值；None 表示不止损）
        require_d1_hold: bool = True,  # D0 已达标时，校验 D1 开盘守住阈值
        trailing_stop: float | None = None,  # 移动止盈：盈利曾达阈值后的回撤比例（None 关闭）
        max_hold_days: int | None = None,    # 持仓天数上限（含 D0；None 不限）
    ):
        self.take_profit = take_profit
        self.stop_loss = stop_loss
        self.require_d1_hold = require_d1_hold
        self.trailing_stop = trailing_stop
        self.max_hold_days = max_hold_days
        self.d0_pnl_close = None   # D0 日收盘相对建仓价收益
        self.d1_open_pnl = None    # D1 日开盘相对建仓价收益
        self.armed_from = None     # 有效止盈可触发的起始日期
        self.running_high = None   # 建仓以来最高价（移动止盈用）
        self.hold_days = 0         # 持仓天数（含 D0）

    def reset(self) -> None:
        self.d0_pnl_close = None
        self.d1_open_pnl = None
        self.armed_from = None
        self.running_high = None
        self.hold_days = 0

    @staticmethod
    def _pnl(price: float, entry: float) -> float:
        return (price - entry) / entry

    def on_bar(self, bar: Bar, position: Position) -> Signal:
        # 空仓：建仓日为 D0，最早在下一根 K 线（D1）才允许有效止盈
        if position.code is None or position.shares == 0:
            if bar.close > 0:
                self.d0_pnl_close = None
                self.d1_open_pnl = None
                self.armed_from = None
                self.running_high = None
                self.hold_days = 1  # D0 算第 1 天
                return Signal.BUY
            return Signal.NO_ACTION

        entry = position.avg_cost
        if not entry or entry <= 0:
            return Signal.HOLD

        # 建仓以来最高价（含当日 high），供移动止盈回撤判定
        if self.running_high is None or bar.high > self.running_high:
            self.running_high = bar.high
        # 持仓天数递增（建仓当天由上方置 1）
        if position.entry_date != bar.date:
            self.hold_days += 1

        # 持仓天数上限（含 D0）：达到上限仍未止盈止损则强制卖出
        if self.max_hold_days is not None and self.hold_days >= self.max_hold_days:
            return Signal.SELL

        # 是建仓当日（D0）：记录收盘收益，屏蔽当日盘中止盈
        if position.entry_date == bar.date:
            self.d0_pnl_close = self._pnl(bar.close, entry)
            self.d1_open_pnl = None
            self.armed_from = None
            # D0 也允许止损（防暴跌），但不允许止盈
            if self.stop_loss is not None and self._pnl(bar.low, entry) <= self.stop_loss:
                return Signal.SELL
            return Signal.HOLD

        # D1 及以后
        open_pnl = self._pnl(bar.open, entry)
        if self.d1_open_pnl is None:
            self.d1_open_pnl = open_pnl

        # 有效止盈起算窗口：仅在 D1 且满足约束
        if self.armed_from is None:
            entry_key = position.entry_date
            if bar.date > entry_key:  # D1
                # 若 D0 已放电（>=阈值）但要求 D1 开盘守住，则守卫 D1 开盘
                if self.require_d1_hold and self.d0_pnl_close is not None \
                        and self.d0_pnl_close >= self.take_profit:
                    if open_pnl < self.take_profit:
                        # D0 虚涨、D1 开盘跌破阈值 -> 本日不可止盈（继续持有观察）
                        pass
                    else:
                        self.armed_from = bar.date
                else:
                    self.armed_from = bar.date

        # 达到阈值即有效止盈（盘中使用 high 判断）
        if self.armed_from and self._pnl(bar.high, entry) >= self.take_profit:
            return Signal.SELL

        # 移动止盈：盈利曾触达阈值后，从最高价回撤超过 trailing_stop 即止盈
        if self.armed_from and self.trailing_stop is not None:
            if self.running_high and self.running_high > 0:
                drawdown = (self.running_high - bar.low) / self.running_high
                if drawdown >= self.trailing_stop:
                    return Signal.SELL

        # 止损
        if self.stop_loss is not None and self._pnl(bar.low, entry) <= self.stop_loss:
            return Signal.SELL

        return Signal.HOLD


class T1ConfirmedEntryStrategy(T1TakeProfitStrategy):
    """买入端技术确认 + T+1 有效止盈。

    在 T+1 退出逻辑基础上，额外叠加建仓前技术确认，只有出现确认信号才建仓：
    - 均线多头(ma_bull)：收盘价站上短均线，且短均线位于长均线之上；
    - 放量突破(volume_break)：当日成交量放量（>= vol_mult×近vol_window均值）且收盘突破近vol_window日最高价。
    未确认前空仓等待；确认后沿用 T+1 有效止盈/止损/移动止盈/持仓上限退出。
    """

    def __init__(
        self,
        take_profit: float = 0.05,
        stop_loss: float = -0.05,
        require_d1_hold: bool = True,
        trailing_stop: float | None = None,
        max_hold_days: int | None = None,
        entry_mode: str = "volume_break",  # none=直接建仓 / ma_bull / volume_break
        ma_short: int = 5,
        ma_long: int = 20,
        vol_window: int = 20,
        vol_mult: float = 1.5,
    ):
        super().__init__(
            take_profit=take_profit,
            stop_loss=stop_loss,
            require_d1_hold=require_d1_hold,
            trailing_stop=trailing_stop,
            max_hold_days=max_hold_days,
        )
        self.entry_mode = entry_mode
        self.ma_short = ma_short
        self.ma_long = ma_long
        self.vol_window = vol_window
        self.vol_mult = vol_mult
        self._hist: list[Bar] = []  # 建仓前累积的 K 线缓冲（避免未来函数）

    def reset(self) -> None:
        super().reset()
        self._hist = []

    def _confirms(self, bar: Bar) -> bool:
        """判断当前是否满足买入确认信号（仅用 history 及当日，无未来数据）。"""
        n = len(self._hist)
        if not self._hist:
            return False
        closes = [b.close for b in self._hist]
        if self.entry_mode == "ma_bull":
            if n < self.ma_long:
                return False
            short = sum(closes[-self.ma_short:]) / self.ma_short
            long_ = sum(closes[-self.ma_long:]) / self.ma_long
            return bar.close > short and short > long_
        if self.entry_mode == "volume_break":
            if n < self.vol_window:
                return False
            prior = self._hist[-self.vol_window:-1]  # 不含当日
            avg_vol = sum(p.volume for p in prior) / len(prior) if prior else 0.0
            prior_high_close = max(p.close for p in prior)
            volume_ok = avg_vol > 0 and bar.volume >= self.vol_mult * avg_vol
            return volume_ok and bar.close > prior_high_close
        return True  # none / 未知模式：直接建仓

    def on_bar(self, bar: Bar, position: Position) -> Signal:
        self._hist.append(bar)
        # 空仓：先做买入确认，未确认则保持等待
        if position.code is None or position.shares == 0:
            if not self._confirms(bar):
                self.d0_pnl_close = None
                self.d1_open_pnl = None
                self.armed_from = None
                self.running_high = None
                self.hold_days = 0
                return Signal.NO_ACTION
        return super().on_bar(bar, position)


class BuyAndHoldStrategy(Strategy):
    """基准策略：在首个收盘建仓并持有到回测结束。"""

    def on_bar(self, bar: Bar, position: Position) -> Signal:
        if position.code is None or position.shares == 0:
            return Signal.BUY
        return Signal.HOLD


# 策略注册表（API 据此选择）
STRATEGY_REGISTRY: dict[str, type[Strategy]] = {
    "t1_take_profit": T1TakeProfitStrategy,
    "t1_confirmed": T1ConfirmedEntryStrategy,
    "buy_and_hold": BuyAndHoldStrategy,
}