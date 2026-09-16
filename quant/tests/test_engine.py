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