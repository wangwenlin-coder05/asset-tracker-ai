"""批量回测与参数网格的单元测试。使用内置 sample_data，无网络。"""
from __future__ import annotations

from pathlib import Path

from quant.batch import best_row, expand_grid, run_grid
from quant.store import MarketStore

SAMPLE_CSV = Path(__file__).resolve().parent / ".." / "quant" / "sample_data.csv"


def _seed(tmp_path):
    store = MarketStore(tmp_path / "test.db")
    with open(SAMPLE_CSV, newline="", encoding="utf-8") as f:
        import csv

        rows = []
        for row in csv.DictReader(f):
            rows.append((
                row["code"], row["date"], float(row["open"]), float(row["high"]),
                float(row["low"]), float(row["close"]), float(row["volume"]),
                float(row["amount"]), float(row["adjust_factor"]),
            ))
    store.upsert_bars(rows)
    store.update_symbol_sync(rows[0][0], "示例", rows[-1][1])
    return store, rows[0][0]


def test_expand_grid_cartesian():
    pts = expand_grid({"take_profit": [0.03, 0.05, 0.10], "stop_loss": [-0.03, -0.05]})
    assert len(pts) == 6
    assert {"take_profit": 0.05, "stop_loss": -0.03} in pts


def test_expand_grid_empty():
    assert expand_grid({}) == [{}]


def test_run_grid_basic(tmp_path):
    store, code = _seed(tmp_path)
    out = run_grid([code], "buy_and_hold", store=store)
    assert len(out["rows"]) == 1
    assert out["rows"][0]["code"] == code
    assert out["rows"][0]["name"] == "示例"
    assert out["rows"][0]["trade_count"] >= 0
    assert out["skipped"] == []


def test_run_grid_params_filtering(tmp_path):
    """无关参数不应传入策略，关联参数应生效且不报错。"""
    store, code = _seed(tmp_path)
    out = run_grid(
        [code], "t1_take_profit",
        param_ranges={"take_profit": [0.05, 0.10], "unknown_param": [1]},
        store=store,
    )
    assert len(out["rows"]) == 2
    for r in out["rows"]:
        assert r["total_return"] is not None


def test_run_grid_skips_missing_symbol(tmp_path):
    store, code = _seed(tmp_path)
    out = run_grid(["sh.999999"], "buy_and_hold", store=store)
    assert out["rows"] == []
    assert out["skipped"] == ["sh.999999"]


def test_best_row():
    rows = [
        {"code": "a", "sharpe_ratio": 0.5},
        {"code": "b", "sharpe_ratio": 2.1},
        {"code": "c", "sharpe_ratio": None},
    ]
    best = best_row(rows, key="sharpe_ratio")
    assert best["code"] == "b"
    assert best_row([], key="sharpe_ratio") is None