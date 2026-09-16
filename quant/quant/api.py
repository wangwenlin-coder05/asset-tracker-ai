"""quant FastAPI 服务入口。

运行方式（在 quant/ 目录下）：
    uvicorn quant.api:app --port 8000
开发模式：
    python -m quant.api
"""
from __future__ import annotations

import logging
from datetime import datetime

from fastapi import FastAPI, HTTPException
from pydantic import BaseModel, Field

from .engine import BacktestEngine, EngineConfig
from .models import Bar
from .report import serialize_report
from .store import default_store
from .strategy import STRATEGY_REGISTRY

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")

app = FastAPI(
    title="股票回测工作台 · Quant Engine",
    version="0.1.0",
    description="轻量级 AI 辅助投研 + 可复测的事件驱动回测引擎（仅验证，不含实盘下单）",
)


class BacktestRequest(BaseModel):
    code: str = Field(..., description="股票代码，如 600000 / 000001")
    strategy: str = "t1_take_profit"
    take_profit: float = 0.05
    stop_loss: float = -0.05
    require_d1_hold: bool = True
    trailing_stop: float | None = None   # 移动止盈：盈利触达阈值后的回撤比例（None 关闭）
    max_hold_days: int | None = None     # 持仓天数上限（含 D0；None 不限）
    # 买入端技术确认（t1_confirmed 策略）
    entry_mode: str = "volume_break"     # none / ma_bull / volume_break
    ma_short: int = 5
    ma_long: int = 20
    vol_window: int = 20
    vol_mult: float = 1.5
    start: str | None = None
    end: str | None = None
    initial_cash: float = 100_000.0
    compare_benchmark: bool = False
    benchmark_code: str = "sh.000300"


class SyncRequest(BaseModel):
    code: str
    name: str | None = None
    start: str = "2020-01-01"
    end: str | None = None


class GridRequest(BaseModel):
    codes: list[str] = Field(..., description="股票代码列表，如 [\"sh.600000\", \"sz.000001\"]")
    strategy: str = "t1_take_profit"
    params: dict = Field(
        default_factory=dict,
        description="参数扫描范围（笛卡尔积），如 {\"take_profit\": [0.05, 0.10], \"stop_loss\": [-0.03, -0.05]}",
    )
    start: str | None = None
    end: str | None = None
    initial_cash: float = 100_000.0
    best_key: str = "sharpe_ratio"


@app.get("/api/ping")
def ping():
    return {"status": "ok", "time": datetime.now().astimezone().isoformat()}


@app.get("/api/symbols")
def symbols():
    return {"symbols": default_store.list_symbols()}


@app.post("/api/symbols/sync")
def sync(req: SyncRequest):
    """同步某只股票的历史日线（baostock）。"""
    from .data_sync import sync_symbol

    end = req.end or datetime.now().astimezone().date().isoformat()
    stats = sync_symbol(req.code, req.start, end, name=req.name, store=default_store)
    return {
        "code": stats.code,
        "name": stats.name,
        "fetched": stats.fetched,
        "written": stats.written,
        "first_date": stats.new_start,
        "last_date": stats.new_end,
    }


@app.get("/api/symbols/{code}/coverage")
def coverage(code: str):
    return default_store.coverage(code)


@app.post("/api/backtest/run")
def run_backtest(req: BacktestRequest):
    """执行一次回测，返回报告。"""
    params = req.model_dump(
        exclude={"code", "strategy"},
    )
    return _backtest_impl(req.code, params)


def _backtest_impl(code: str, params: dict) -> dict:
    """回测核心（API 路由与 AI Agent 共用）。

    params 覆盖 BacktestRequest 各字段；缺失则取默认值。
    """
    req = BacktestRequest(code=code, **params)

    rows = default_store.get_bars(req.code, req.start, req.end)
    if not rows:
        raise HTTPException(
            status_code=404,
            detail=f"本地无 {req.code} 的行情数据，请先通过 /api/symbols/sync 同步。",
        )

    # baostock adjustflag=2 已返回前复权价格，直接使用，避免二次复权。
    bars = [
        Bar(
            code=r["code"], date=r["date"], open=r["open"], high=r["high"],
            low=r["low"], close=r["close"], volume=r["volume"],
            amount=r["amount"], adjust_factor=r.get("adjust_factor"),
        )
        for r in rows
    ]

    if req.strategy not in STRATEGY_REGISTRY:
        raise HTTPException(status_code=400, detail=f"未知策略: {req.strategy}")

    cls = STRATEGY_REGISTRY[req.strategy]
    if req.strategy == "t1_take_profit":
        strat = cls(
            take_profit=req.take_profit,
            stop_loss=req.stop_loss,
            require_d1_hold=req.require_d1_hold,
            trailing_stop=req.trailing_stop,
            max_hold_days=req.max_hold_days,
        )
    elif req.strategy == "t1_confirmed":
        strat = cls(
            take_profit=req.take_profit,
            stop_loss=req.stop_loss,
            require_d1_hold=req.require_d1_hold,
            trailing_stop=req.trailing_stop,
            max_hold_days=req.max_hold_days,
            entry_mode=req.entry_mode,
            ma_short=req.ma_short,
            ma_long=req.ma_long,
            vol_window=req.vol_window,
            vol_mult=req.vol_mult,
        )
    else:
        strat = cls()

    config = EngineConfig(initial_cash=req.initial_cash)
    engine = BacktestEngine(strat, config)
    try:
        result = engine.run(bars)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

    report = serialize_report(
        result,
        req.strategy,
        req.model_dump(exclude={"code", "strategy"}),
    )

    if req.compare_benchmark:
        report["benchmark"] = _run_benchmark(
            req.benchmark_code, req.start, req.end, req.initial_cash, default_store
        )

    return report


@app.post("/api/backtest/grid")
def run_grid_endpoint(req: GridRequest):
    """批量回测 + 参数网格：多标的 × 参数组合，返回对比表与最优参数。"""
    from .batch import best_row, run_grid

    try:
        out = run_grid(
            codes=req.codes,
            strategy=req.strategy,
            param_ranges=req.params,
            start=req.start,
            end=req.end,
            initial_cash=req.initial_cash,
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

    out["best"] = best_row(out["rows"], key=req.best_key)
    return out


def _run_benchmark(code: str, start, end, initial_cash, store):
    """基准净值：按指数收盘累计收益从 initial_cash 起步，不约束手数（指数基准不能按股票一手撮合）。"""
    rows = store.get_bars(code, start, end)
    if len(rows) < 2:
        return None
    closes = [float(r["close"]) for r in rows]
    dates = [r["date"] for r in rows]
    base = closes[0]
    if base <= 0:
        return None
    equity = [initial_cash * c / base for c in closes]

    total_return = equity[-1] / initial_cash - 1.0
    peak = -1e18
    mdd = 0.0
    for e in equity:
        peak = max(peak, e)
        if peak > 0:
            dd = (peak - e) / peak
            mdd = max(mdd, dd)
    years = max(len(equity) / 252.0, 1e-9)
    annualized = (1 + total_return) ** (1 / years) - 1 if total_return > -1 else -1.0

    return {
        "code": code,
        "total_return_pct": round(total_return * 100, 4),
        "max_drawdown_pct": round(mdd * 100, 4),
        "annualized_pct": round(annualized * 100, 4),
        "final_equity": round(equity[-1], 2),
        "equity_curve": [
            {"date": d, "equity": round(e, 2)}
            for d, e in zip(dates, equity)
        ],
    }


class AgentRequest(BaseModel):
    text: str = Field(..., description="自然语言指令，如：回测茅台，止盈5%，止损5%")
    api_key: str | None = Field(default=None, description="LLM API Key（可选，缺省走环境变量或规则回退）")


@app.post("/api/agent/chat")
def agent_chat(req: AgentRequest):
    """AI Agent：自然语言驱动同步→回测→报告多步工具链。"""
    from .agent import run_agent

    return run_agent(req.text, api_key=req.api_key)


if __name__ == "__main__":
    import uvicorn

    uvicorn.run("quant.api:app", host="0.0.0.0", port=8000, reload=True)