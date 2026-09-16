"""HTTP/API 层测试：验证 FastAPI 路由元数据与请求模型（不依赖网络）。"""
from __future__ import annotations

import asyncio

import httpx

from quant.api import app


def _call(method: str, path: str, **kw):
    from httpx import ASGITransport

    async def _run():
        transport = ASGITransport(app=app)
        async with httpx.AsyncClient(transport=transport, base_url="http://test") as c:
            r = await c.request(method, path, **kw)
            return r.status_code, r.json()
    return asyncio.run(_run())


def test_ping():
    code, body = _call("GET", "/api/ping")
    assert code == 200
    assert body["status"] == "ok"


def test_grid_validation_missing_codes():
    code, _ = _call("POST", "/api/backtest/grid", json={})
    assert code == 422


def test_grid_unknown_strategy():
    code, body = _call("POST", "/api/backtest/grid", json={
        "codes": ["sh.600000"], "strategy": "nope",
    })
    assert code == 400
    assert "未知策略" in body["detail"]


def test_run_backtest_missing_data():
    code, _ = _call("POST", "/api/backtest/run", json={"code": "sh.000000"})
    assert code == 404


def test_benchmark_normalizes_index_return():
    """指数基准按收盘累计收益归一化，不受一手手数限制（高价位指数也能正确给出收益）。"""
    from quant.api import _run_benchmark
    from quant.store import MarketStore
    import tempfile, os

    db = MarketStore(os.path.join(tempfile.mkdtemp(), "t.db"))
    rows = [
        ("sh.000300", f"2024-0{d + 1}-03", 4000 + d, 4000 + d + 1, 3999 + d, 4000 + d,
         100, 1000, 1.0)
        for d in range(1, 5)
    ]
    db.upsert_bars(rows)
    bm = _run_benchmark("sh.000300", None, None, 100_000.0, db)
    assert bm is not None
    assert len(bm["equity_curve"]) == 4
    # 收盘 4001→4004，+0.075%
    assert bm["total_return_pct"] > 0
    assert bm["equity_curve"][0]["equity"] == 100_000.0
    assert bm["equity_curve"][-1]["equity"] > 100_000.0