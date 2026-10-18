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
from .strategy import BUILTIN_STRATEGIES, get_registry

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
    # 经典策略参数
    fast: int = 5          # ma_cross 短均线
    slow: int = 20         # ma_cross 长均线
    window: int = 20       # momentum / bollinger 窗口
    k: float = 2.0         # bollinger 标准差倍数
    entry_n: int = 20      # turtle 突破买入 N
    exit_n: int = 10       # turtle 跌破卖出 N
    # 自定义策略（AI 生成）参数：按该策略 PARAMS 声明的 key 传值
    params: dict = Field(default_factory=dict)
    start: str | None = None
    end: str | None = None
    initial_cash: float = 100_000.0
    initial_shares: int | None = None   # 首次建仓股数（None=满仓）
    max_adds: int | None = None       # 最大加仓次数（None=用策略默认；0或负数表示不限）
    slippage: float = 0.0            # 滑点比例（如 0.001 = 0.1%），默认 0 与旧行为一致
    liquidity_slippage: bool = False # True 时按当日成交额分档滑点
    risk_free_rate: float = 0.0      # 无风险年利率（夏普扣减用，默认 0 与旧口径一致）
    execution_mode: str = "next_open"  # next_open（次日开盘，T+1）/ signal_close（信号根收盘价，模拟盘中）
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
    slippage: float = 0.0            # 滑点比例（如 0.001 = 0.1%）
    execution_mode: str = "next_open"  # next_open / signal_close
    train_end: str | None = None      # 训练/验证切分日期（给定则输出训练段指标）
    survivorship: bool = False        # True 时把本地登记的退市股并入扫描池做对照


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
    # 注意：不能把 strategy 排除掉，否则 _backtest_impl 重建请求时会退回默认策略
    params = req.model_dump(exclude={"code"})
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

    registry = get_registry()
    if req.strategy not in registry:
        raise HTTPException(status_code=400, detail=f"未知策略: {req.strategy}")

    if req.strategy not in BUILTIN_STRATEGIES:
        # 自定义策略（AI 生成）：按类签名过滤 params 后实例化
        from .custom import instantiate_strategy

        strat = instantiate_strategy(registry[req.strategy], req.params)
        return _finish_backtest(strat, bars, req)

    cls = registry[req.strategy]
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
        kwargs = {}
        if req.strategy == "ma_cross":
            kwargs = {"fast": req.fast, "slow": req.slow}
        elif req.strategy == "momentum":
            kwargs = {"window": req.window}
        elif req.strategy == "bollinger":
            kwargs = {"window": req.window, "k": req.k}
        elif req.strategy == "turtle":
            kwargs = {"entry_n": req.entry_n, "exit_n": req.exit_n}
        strat = cls(**kwargs)

    return _finish_backtest(strat, bars, req)


def _finish_backtest(strat, bars: list[Bar], req: BacktestRequest) -> dict:
    """跑引擎 + 出报告 + 可选基准（内置与自定义策略共用）。"""
    config = EngineConfig(
        initial_cash=req.initial_cash,
        initial_shares=req.initial_shares,
        max_adds=req.max_adds,
        slippage=req.slippage,
        liquidity_slippage=req.liquidity_slippage,
        risk_free_rate=req.risk_free_rate,
        execution_mode=req.execution_mode,
    )
    engine = BacktestEngine(strat, config)
    try:
        result = engine.run(bars)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:  # 自定义策略可能有自身逻辑错误
        raise HTTPException(status_code=400, detail=f"策略执行出错: {type(e).__name__}: {e}")

    report = serialize_report(
        result,
        req.strategy,
        req.model_dump(exclude={"code", "strategy"}),
    )

    if req.compare_benchmark:
        # 基准按「回测实际覆盖区间」取数，避免与用户填的起止日期错位导致超额收益失真
        bm = _run_benchmark(
            req.benchmark_code, bars[0].date, bars[-1].date,
            req.initial_cash, default_store,
        )
        report["benchmark"] = bm
        if bm is None:
            report["benchmark_note"] = (
                f"基准 {req.benchmark_code} 本地无该区间行情，"
                "请先在左侧同步沪深300指数（代码 sh.000300）后再对比。"
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
            slippage=req.slippage,
            execution_mode=req.execution_mode,
            train_end=req.train_end,
            survivorship=req.survivorship,
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

    out["best"] = best_row(out["rows"], key=req.best_key)
    # 多目标帕累托前沿：夏普/收益/回撤不被其他组合全面支配的点
    from .batch import pareto_frontier
    out["pareto"] = pareto_frontier(out["rows"])
    return out


# ========== 幸存者偏差对照组管理 ==========

class WatchRequest(BaseModel):
    code: str
    name: str | None = None
    delisted: bool = True
    last_bar_date: str | None = None
    note: str = ""


@app.get("/api/survivorship/watch")
def survivorship_watch_list():
    """本地登记的退市/长停股（幸存者偏差对照组）。"""
    return {"watch": default_store.list_survivorship_watch()}


@app.post("/api/survivorship/watch")
def survivorship_watch_add(req: WatchRequest):
    default_store.upsert_survivorship_watch(
        req.code, req.name, delisted=req.delisted,
        last_bar_date=req.last_bar_date, note=req.note,
    )
    return {"ok": True, "code": req.code}


@app.delete("/api/survivorship/watch/{code}")
def survivorship_watch_remove(code: str):
    if not default_store.drop_survivorship_watch(code):
        raise HTTPException(404, "未登记该股票")
    return {"ok": True}


# ========== 回测报告导出（Excel / CSV） ==========

import base64
import csv as _csv
import io


@app.post("/api/backtest/export/{fmt}")
def export_report(req: GridRequest, fmt: str = "csv"):
    """把一次批量扫描导出成文件。

    - csv：UTF-8 BOM 单个 CSV，Excel 直接可开
    - xlsx：需服务端 openpyxl；缺库自动降级 csv
    返回 {filename, mime, content_base64, rows, note?}，前端下载。
    """
    from .batch import run_grid

    try:
        out = run_grid(
            codes=req.codes, strategy=req.strategy, param_ranges=req.params,
            start=req.start, end=req.end, initial_cash=req.initial_cash,
            slippage=req.slippage, execution_mode=req.execution_mode,
            train_end=req.train_end, survivorship=req.survivorship,
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

    rows = out["rows"]
    fields = ["code", "name", "survivor",
              "total_return", "annualized_return", "max_drawdown",
              "sharpe_ratio", "win_rate", "profit_loss_ratio", "trade_count",
              "final_equity",
              "train_total_return", "train_max_drawdown", "train_sharpe_ratio"]
    fields = [f for f in fields
              if f in ("code", "name") or any(f in r for r in rows)]
    pct_cols = {"total_return", "annualized_return", "max_drawdown", "win_rate",
                "train_total_return", "train_max_drawdown"}

    def row_vals(r: dict) -> list:
        return [None if r.get(f) is None
                else (round(r[f] * 100, 4) if f in pct_cols else r[f])
                for f in fields]

    note = None
    if fmt == "xlsx":
        try:
            from openpyxl import Workbook
            wb = Workbook()
            ws = wb.active
            ws.title = "backtest"
            ws.append(fields)
            for r in rows:
                ws.append(row_vals(r))
            buf = io.BytesIO()
            wb.save(buf)
            b64 = base64.b64encode(buf.getvalue()).decode("ascii")
            return {"filename": "backtest_grid.xlsx",
                    "mime": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
                    "content_base64": b64, "rows": len(rows), "note": None}
        except Exception:
            note = "服务端未装 openpyxl，已降级为 CSV"
            fmt = "csv"

    # CSV 路径
    text = io.StringIO()
    w = _csv.DictWriter(text, fieldnames=fields, extrasaction="ignore")
    w.writeheader()
    for r in rows:
        w.writerow({f: (None if r.get(f) is None
                        else (round(r[f] * 100, 4) if f in pct_cols else r[f]))
                    for f in fields})
    # UTF-8 BOM：Excel 直接打开中文不乱码
    b64 = base64.b64encode(("\ufeff" + text.getvalue()).encode("utf-8")).decode("ascii")
    return {"filename": "backtest_grid.csv", "mime": "text/csv; charset=utf-8",
            "content_base64": b64, "rows": len(rows), "note": note}


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


# ========== 策略工坊：AI 生成 / 改进自定义策略 ==========

class StrategyGenRequest(BaseModel):
    idea: str = Field(..., description="自然语言描述的交易想法")
    base_key: str | None = Field(default=None, description="以此为基底改写（内置或自定义策略 key）")
    base_code: str | None = Field(default=None, description="直接以这段代码为基底改写（用于改进未保存的草稿）")
    feedback: str | None = Field(default=None, description="对上一版的修改意见")
    sample_code: str | None = Field(default=None, description="冒烟测试指定标的")
    api_key: str | None = Field(default=None, description="LLM API Key（缺省读环境变量）")


class StrategyRefineRequest(BaseModel):
    key: str = Field(..., description="要改进的自定义策略 key")
    feedback: str = Field(..., description="改进意见")
    sample_code: str | None = None
    api_key: str | None = None


class StrategySaveRequest(BaseModel):
    key: str
    name: str
    code: str
    description: str = ""
    buy_rule: str = ""
    sell_rule: str = ""
    idea: str = ""
    params: dict = Field(default_factory=dict)
    note: str = ""


@app.post("/api/strategy/generate")
def strategy_generate(req: StrategyGenRequest):
    """自然语言想法 → 策略代码草稿（含静态校验与冒烟回测结果）。"""
    from .strategy_gen import generate_strategy

    return generate_strategy(
        req.idea, api_key=req.api_key, base_key=req.base_key,
        base_code=req.base_code, feedback=req.feedback, sample_code=req.sample_code,
    )


@app.post("/api/strategy/refine")
def strategy_refine(req: StrategyRefineRequest):
    """在已有自定义策略代码基础上按意见改进（返回新草稿，不覆盖）。"""
    from .custom import get_custom_strategy
    from .strategy_gen import generate_strategy

    meta = get_custom_strategy(req.key)
    if not meta:
        raise HTTPException(404, f"自定义策略不存在: {req.key}")
    return generate_strategy(
        meta.get("idea") or f"改进策略「{meta.get('name')}」",
        api_key=req.api_key,
        base_code=meta.get("code"),
        feedback=req.feedback,
        sample_code=req.sample_code,
    )


@app.post("/api/strategy/save")
def strategy_save(req: StrategySaveRequest):
    """校验 + 冒烟 + 落盘并注册（覆盖同名则版本 +1，旧版自动快照）。"""
    from .custom import save_custom_strategy

    out = save_custom_strategy(
        req.key, req.name, req.code,
        description=req.description, idea=req.idea,
        params=req.params, note=req.note or "AI 生成",
        buy_rule=req.buy_rule, sell_rule=req.sell_rule,
    )
    if not out.get("ok"):
        raise HTTPException(400, out.get("error") or "保存失败")
    return out


@app.get("/api/strategy/registry")
def strategy_registry():
    """全部可用策略：内置 key 列表 + 自定义策略详情（供前端渲染卡片）。"""
    from .custom import list_custom_strategies

    return {
        "builtin": sorted(BUILTIN_STRATEGIES.keys()),
        "custom": list_custom_strategies(),
    }


@app.get("/api/strategy/custom")
def strategy_custom_list():
    from .custom import list_custom_strategies

    return {"strategies": list_custom_strategies()}


@app.get("/api/strategy/custom/{key}")
def strategy_custom_detail(key: str):
    from .custom import get_custom_strategy

    meta = get_custom_strategy(key)
    if not meta:
        raise HTTPException(404, "策略不存在")
    return meta


@app.delete("/api/strategy/custom/{key}")
def strategy_custom_delete(key: str):
    from .custom import delete_custom_strategy

    if not delete_custom_strategy(key):
        raise HTTPException(404, "策略不存在")
    return {"ok": True}


@app.post("/api/strategy/custom/{key}/rollback")
def strategy_custom_rollback(key: str, version: int | None = None):
    """回滚到历史版本（默认最近一版）。"""
    from .custom import rollback_custom_strategy

    out = rollback_custom_strategy(key, version)
    if not out.get("ok"):
        raise HTTPException(400, out.get("error") or "回滚失败")
    return out


@app.post("/api/strategy/validate")
def strategy_validate(req: StrategySaveRequest):
    """只做校验 + 冒烟，不落盘（前端「试跑」用）。"""
    from .custom import smoke_test, validate_code, zero_trade_error

    verdict = validate_code(req.code)
    if not verdict["ok"]:
        return {"ok": False, "errors": verdict["errors"], "warnings": verdict["warnings"]}
    smoke = smoke_test(req.key, req.code, req.params)
    warnings = list(verdict["warnings"])
    zero_err = zero_trade_error(smoke)
    if zero_err:
        warnings.append(zero_err)
    return {"ok": smoke.get("ok", False), "errors": [] if smoke.get("ok") else [smoke.get("error")],
            "warnings": warnings, "smoke": smoke, "params": verdict["params"],
            "zero_trades": bool(smoke.get("zero_trades"))}


if __name__ == "__main__":
    import uvicorn

    uvicorn.run("quant.api:app", host="0.0.0.0", port=8000, reload=True)