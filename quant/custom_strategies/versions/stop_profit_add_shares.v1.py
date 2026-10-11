from quant.strategy import HistoryStrategy
from quant.models import Signal, Order


class StopProfitAddSharesStrategy(HistoryStrategy):
    """止盈加仓策略：买入后涨五个点止盈，下跌每10个点补一倍仓"""
    
    PARAMS = [
        {
            "key": "first_shares", "label": "建仓股数", "type": "number", "default": 100, "step": 1, "min": 1
        },
        {
            "key": "max_adds", "label": "最大补仓次数", "type": "number", "default": -1, "step": 1, "min": -1
        }
    ]
    
    def __init__(self, first_shares=100, max_adds=-1):
        super().__init__()
        self.first_shares = first_shares
        self.max_adds = max_adds
    
    def on_bar(self, bar, position):
        super().on_bar(bar, position)
        
        # 判断是否持仓
        if self._is_holding(position):
            # 止盈条件：涨5%止盈
            if bar.close >= position.avg_cost * 1.05:
                self.signal_reason = "涨5%止盈"
                return Signal.SELL
            
            # 补仓条件：下跌10%补一倍仓
            if bar.close <= position.avg_cost * 0.9:
                if position.add_count >= self.max_adds and self.max_adds > 0:
                    return Signal.HOLD
                
                # 计算补仓数量
                add_size = position.shares * (2 ** position.add_count)
                self.signal_reason = f"下跌10%补仓{add_size}股"
                return Order("ADD", size=add_size, size_type="shares")
            
            return Signal.HOLD
        
        # 首仓条件：空仓时建仓
        self.signal_reason = "空仓时建仓"
        return Order("BUY", size=self.first_shares, size_type="shares")
