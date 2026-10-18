"""回测引擎与策略的单元测试（pytest）。

覆盖关键边界：空仓、首次建仓、T+1 持仓判定、有效止盈、止损、回测结束强平、
以及指标计算的正确性。全部使用内置 sample_data，不依赖网络。
"""
from __future__ import annotations

import csv
from pathlib import Path

import pytest

from quant.engine import BacktestEngine, EngineConfig
from quant.models import Bar, Position, Signal
from quant.store import MarketStore
from quant.strategy import BuyAndHoldStrategy, T1TakeProfitStrategy

SAMPLE_CSV = Path(__file__).resolve().parent / ".." / "quant" / "sample_data.csv"


def load_bars(path=SAMPLE_CSV) -> list[Bar]:
    bars = []
    with open(path, newline="", encoding="utf-8") as f:
        for row in csv.DictReader(f):
            bars.append(Bar(
                code=row["code"],
                date=row["date"],
                open=float(row["open"]),
                high=float(row["high"]),
                low=float(row["low"]),
                close=float(row["close"]),
                volume=float(row["volume"]),
                amount=float(row["amount"]),
                adjust_factor=float(row["adjust_factor"]),
            ))
    return bars


@pytest.fixture
def tmp_store(tmp_path):
    return MarketStore(tmp_path / "test.db")


@pytest.fixture
def bars():
    return load_bars()


# ---------- 策略单元测试 ----------

def test_buy_and_hold_enters_once(bars):
    s = BuyAndHoldStrategy()
    pos = Position(code=None, entry_date=None, shares=0, avg_cost=0.0)
    assert s.on_bar(bars[0], pos) == Signal.BUY
    held = Position(code="x", entry_date=bars[1].date, shares=100, avg_cost=10.0)
    assert s.on_bar(bars[1], held) == Signal.HOLD


def test_t1_zero_position_returns_buy(bars):
    s = T1TakeProfitStrategy(take_profit=0.05)
    pos = Position(code=None, entry_date=None, shares=0, avg_cost=0.0)
    assert s.on_bar(bars[0], pos) == Signal.BUY


def test_t1_d0_blocks_same_day_profit(bars):
    """D0（建仓当日）即使盘中涨超阈值也不许止盈。"""
    s = T1TakeProfitStrategy(take_profit=0.05)
    # 构造 D0 当日即大涨的 bar，position.entry_date 与之相同
    pos = Position(code="x", entry_date=bars[2].date, shares=100,
                   avg_cost=bars[2].open * 0.95)  # 成本低的离谱，保证 D0 大赚
    bar_d0 = bars[2]  # high 明显 > 5% 但当日即建仓
    # D0 应返回 HOLD（不允许止盈），而非 SELL
    sig = s.on_bar(bar_d0, pos)
    assert sig != Signal.SELL
    assert sig == Signal.HOLD


def test_t1_valid_take_profit_d1_or_later(bars):
    """D1 及以后盘中到阈值 => SELL。"""
    s = T1TakeProfitStrategy(take_profit=0.05)
    # D0=bars[1]，成本取 D0 收盘价；bars[2] 为 D1,high 11.20 > 10.5*1.05
    entry = bars[1].close
    pos = Position(code="x", entry_date=bars[1].date, shares=100, avg_cost=entry)
    assert s.on_bar(bars[2], pos) == Signal.SELL


def test_t1_stop_loss(bars):
    s = T1TakeProfitStrategy(take_profit=0.10, stop_loss=-0.05)
    entry = bars[0].close
    pos = Position(code="x", entry_date=bars[6].date, shares=100, avg_cost=entry)
    # bars[6].low 相对 entry 下跌超过 5%
    if (bars[6].low - entry) / entry <= -0.05:
        assert s.on_bar(bars[6], pos) == Signal.SELL


# ---------- 引擎单元测试 ----------

def test_engine_no_side_effect_reuse(bars):
    """同一个策略对象可在多只/多次回测复用，状态会重置。"""
    s = T1TakeProfitStrategy(take_profit=0.05)
    eng = BacktestEngine(s, EngineConfig(initial_cash=100_000))
    r1 = eng.run(bars)
    r2 = eng.run(bars)
    assert r1.final_equity == r2.final_equity


def test_engine_trades_recorded(bars):
    s = T1TakeProfitStrategy(take_profit=0.05)
    r = BacktestEngine(s, EngineConfig(initial_cash=100_000)).run(bars)
    assert r.trade_count >= 0
    assert len(r.trades) == r.trade_count
    assert r.equity_curve  # 至少一根


def test_engine_max_drawdown_non_negative(bars):
    s = BuyAndHoldStrategy()
    r = BacktestEngine(s, EngineConfig(initial_cash=100_000)).run(bars)
    assert r.max_drawdown >= 0.0


def test_engine_empty_bars_raises():
    s = BuyAndHoldStrategy()
    with pytest.raises(ValueError):
        BacktestEngine(s).run([])


def _mk(code, date, o, c, h=None, l=None):
    return Bar(code=code, date=date, open=o, high=h if h is not None else o,
               low=l if l is not None else o, close=c, volume=100, amount=0.0, adjust_factor=1.0)


def test_one_word_board_blocks_buy_and_sell():
    """一字涨停买单作废、一字跌停卖单作废（A 股涨跌停约束）。"""
    def mk(i, o): return Bar(code="sh.600000", date=f"d{i:02d}", open=o, high=o, low=o, close=o,
                             volume=100, amount=0.0, adjust_factor=1.0)

    # 买单作废：d01 空仓发 BUY → d02 一字涨停(+10%)作废 → d03 平开成交
    s1, s2, s3 = mk(1, 10.0), mk(2, 11.0), mk(3, 11.0)
    class _BuySeq:
        def on_bar(self, bar, pos):
            return Signal.BUY if pos.shares == 0 else Signal.HOLD
        def reset(self): pass
    r = BacktestEngine(_BuySeq(), EngineConfig(initial_cash=10_000)).run([s1, s2, s3])
    assert len(r.trades) == 1, "收盘强平应产生 1 笔"
    assert r.trades[0].entry_date == "d03", "一字涨停买单应作废，顺延到 d03"

    # 卖单作废：d04-d05 建仓后持有，d06 一字跌停(-10%) 发 SELL 作废，d07 强平
    s4, s5, s6, s7 = mk(4, 10.0), mk(5, 10.0), mk(6, 9.0), mk(7, 9.0)
    class _SellSeq:
        def on_bar(self, bar, pos):
            if pos.shares == 0:
                return Signal.BUY
            if bar.date == "d06":
                return Signal.SELL   # d06 open 9.0 相对 d05 close 10.0 一字跌停，应作废
            return Signal.HOLD
        def reset(self): pass
    r2 = BacktestEngine(_SellSeq(), EngineConfig(initial_cash=10_000)).run([s4, s5, s6, s7])
    assert len(r2.trades) == 1 and r2.trades[0].exit_date == "d07", "一字跌停卖单作废，顺延收盘强平"
    assert r2.trades[0].entry_date == "d05"  # d04 空仓发 BUY → d05 成交

def test_transfer_fee_reduces_final_equity(bars):
    """默认含过户费（双边万0.1），关掉后终值更高（旧行为兼容验证）。"""
    cfg_on = EngineConfig(initial_cash=100_000)
    cfg_off = EngineConfig(initial_cash=100_000, transfer_fee_rate=0.0)
    r_on = BacktestEngine(T1TakeProfitStrategy(take_profit=0.05), cfg_on).run(bars)
    r_off = BacktestEngine(T1TakeProfitStrategy(take_profit=0.05), cfg_off).run(bars)
    assert r_on.final_equity < r_off.final_equity

def test_sharpe_deducts_risk_free_rate(bars):
    """同曲线 rfr>0 的夏普不高于 rfr=0（扣减方向正确）。"""
    r0 = BacktestEngine(T1TakeProfitStrategy(take_profit=0.05),
                        EngineConfig(initial_cash=100_000)).run(bars)
    r1 = BacktestEngine(T1TakeProfitStrategy(take_profit=0.05),
                        EngineConfig(initial_cash=100_000, risk_free_rate=0.03)).run(bars)
    assert r1.sharpe_ratio <= r0.sharpe_ratio


def test_execution_mode_default_is_next_open(bars):
    """默认 next_open：信号根决策 → 下一根开盘成交。"""
    s = T1TakeProfitStrategy(take_profit=0.05)
    r_default = BacktestEngine(s, EngineConfig(initial_cash=100_000)).run(bars)
    r_no = BacktestEngine(T1TakeProfitStrategy(take_profit=0.05),
                          EngineConfig(initial_cash=100_000, execution_mode="next_open")).run(bars)
    assert r_default.final_equity == r_no.final_equity
    assert len(r_default.trades) == len(r_no.trades)


def test_execution_mode_signal_close_fills_same_bar(bars):
    """signal_close：信号根收盘价成交（模拟盘中）；next_open：次日开盘成交。"""
    s = T1TakeProfitStrategy(take_profit=0.05)
    r = BacktestEngine(s, EngineConfig(initial_cash=100_000, execution_mode="signal_close")).run(bars)
    # signal_close 至少能正常跑完
    assert r.final_equity > 0
    # 结构性差异：同一策略下 signal_close 成交日 = 信号根，next_open = 次一根
    r2 = BacktestEngine(T1TakeProfitStrategy(take_profit=0.05),
                        EngineConfig(initial_cash=100_000, execution_mode="next_open")).run(bars)
    assert r.trades and r2.trades
    assert r.trades[0].entry_date < r2.trades[0].entry_date, \
        f"signal_close 应早于 next_open 成交: {r.trades[0].entry_date} vs {r2.trades[0].entry_date}"

def test_liquidity_slippage_scales_with_amount(bars):
    """流动性分档滑点：成交额越大滑点越低（同日成交价越接近原始价）。"""
    s = BuyAndHoldStrategy()
    r_liq = BacktestEngine(s, EngineConfig(initial_cash=100_000, liquidity_slippage=True)).run(bars)
    r_fix = BacktestEngine(s, EngineConfig(initial_cash=100_000, slippage=0.004)).run(bars)
    # 分档滑点（多数成交 0.05%~0.2%）应优于统一 0.4% 的固定滑点
    assert r_liq.final_equity >= r_fix.final_equity


def test_survivorship_gap_shape(tmp_store):
    """run_grid 开启幸存者对照时返回 survivorship_gap 字段。"""
    from quant.batch import run_grid
    rows = [
        ("sh.600000", "2024-01-01", 10, 10.5, 9.9, 10.2, 1000, 10000, 1.0),
        ("sh.600000", "2024-01-02", 10.2, 10.7, 10.1, 10.5, 1100, 11000, 1.0),
        ("sz.000001", "2024-01-01", 12, 12.5, 11.9, 12.2, 1000, 10000, 1.0),
        ("sz.000001", "2024-01-02", 12.2, 12.7, 12.1, 12.5, 1100, 11000, 1.0),
    ]
    tmp_store.upsert_bars(rows)
    # 登记一只退市股做对照
    tmp_store.upsert_survivorship_watch("sz.000001", "平安银行-退市", delisted=True)
    out = run_grid(["sh.600000"], "buy_and_hold", store=tmp_store,
                   survivorship=True, initial_cash=100_000)
    assert "survivorship_gap" in out
    # 对照组行应被标记
    assert any(r.get("survivor") for r in out["rows"])

def test_train_end_split(tmp_store):
    """train_end 切分：输出训练段指标字段。"""
    from quant.batch import run_grid
    rows = []
    for i, d in enumerate(range(1, 15)):
        rows.append(("sh.600000", f"2024-01-{d:02d}", 10, 10 + i * 0.1, 9.9, 10 + i * 0.1, 1000, 10000, 1.0))
    tmp_store.upsert_bars(rows)
    out = run_grid(["sh.600000"], "buy_and_hold", store=tmp_store,
                   start="2024-01-01", end="2024-01-14",
                   train_end="2024-01-07", initial_cash=100_000)
    assert out.get("train_end") == "2024-01-07"
    row = out["rows"][0]
    assert "train_total_return" in row, f"缺少训练段指标: {list(row.keys())}"
    assert row["train_total_return"] is not None

def test_store_upsert_incremental(tmp_store):
    """写入后覆盖不重复，且能按 code 查询。"""
    rows = [
        ("sh.600000", "2024-01-02", 10, 10.5, 9.9, 10.2, 1000, 10000, 1.0),
        ("sh.600000", "2024-01-03", 10.2, 10.7, 10.1, 10.5, 1100, 11000, 1.0),
    ]
    tmp_store.upsert_bars(rows)
    tmp_store.update_symbol_sync("sh.600000", "浦发银行", "2024-01-03")
    bars = tmp_store.get_bars("sh.600000")
    assert len(bars) == 2
    assert bars[0]["date"] == "2024-01-02"
    cov = tmp_store.coverage("sh.600000")
    assert cov["bar_count"] == 2
    syms = tmp_store.list_symbols()
    assert len(syms) == 1
    assert syms[0]["name"] == "浦发银行"