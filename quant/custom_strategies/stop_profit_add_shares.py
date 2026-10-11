from quant.strategy import HistoryStrategy
from quant.models import Signal, Order


class StopProfitAddSharesStrategy(HistoryStrategy):
    """止盈加仓策略：建仓后涨到止盈比例就全部卖出；
    下跌每达到补仓跌幅就补仓，补仓数量按「建仓股数 × 倍数^已补次数」递增
    （建仓 100 股时依次为 100 / 200 / 400 …），不止损，直到止盈。

    所有阈值均为可调参数（PARAMS），可在回测设置面板里直接改。
    """

    PARAMS = [
        {"key": "first_shares", "label": "建仓股数", "type": "number", "default": 100, "step": 100, "min": 100},
        {"key": "take_profit_pct", "label": "止盈比例(%)", "type": "number", "default": 5, "step": 0.5, "min": 0.5},
        {"key": "add_drop_pct", "label": "补仓跌幅(%)", "type": "number", "default": 10, "step": 1, "min": 1},
        {"key": "add_multiplier", "label": "补仓倍数", "type": "number", "default": 2, "step": 0.5, "min": 1},
        {"key": "max_adds", "label": "最大补仓次数", "type": "number", "default": -1, "step": 1, "min": -1},
    ]

    def __init__(self, first_shares=100, take_profit_pct=5, add_drop_pct=10,
                 add_multiplier=2, max_adds=-1):
        super().__init__()
        self.first_shares = int(first_shares)
        self.take_profit_pct = float(take_profit_pct)
        self.add_drop_pct = float(add_drop_pct)
        self.add_multiplier = float(add_multiplier)
        self.max_adds = int(max_adds)

    def on_bar(self, bar, position):
        super().on_bar(bar, position)

        # 空仓：首次建仓
        if not self._is_holding(position):
            self.signal_reason = "空仓时建仓"
            return Order("BUY", size=self.first_shares, size_type="shares")

        entry = position.avg_cost
        if not entry or entry <= 0:
            return Signal.HOLD

        # 止盈：现价相对持仓均价涨幅达到止盈比例
        if bar.close >= entry * (1 + self.take_profit_pct / 100.0):
            self.signal_reason = f"涨{self.take_profit_pct:g}%止盈"
            return Signal.SELL

        # 补仓：现价相对持仓均价跌幅达到补仓跌幅
        if bar.close <= entry * (1 - self.add_drop_pct / 100.0):
            # 补仓次数封顶（max_adds <= 0 表示不限）
            if self.max_adds > 0 and position.add_count >= self.max_adds:
                return Signal.HOLD
            # 补仓数量：建仓股数 × 倍数^已补次数，并按 100 股整手向下取整
            raw = self.first_shares * (self.add_multiplier ** position.add_count)
            add_size = max(100, int(raw) // 100 * 100)
            self.signal_reason = f"跌{self.add_drop_pct:g}%补仓{add_size}股"
            return Order("ADD", size=add_size, size_type="shares")

        return Signal.HOLD