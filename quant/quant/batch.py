"""批量回测与参数网格扫描。

支持：
- 多标的 × 策略参数组合（笛卡尔积）批量执行回测；
- 输出对比表（逐组合一行）与最优参数（按目标指标排序）。

纯本地计算，复用 BacktestEngine，不新增交易语义。
"""
from __future__ import annotations

from itertools import product

from .engine import BacktestEngine, EngineConfig
from .models import Bar
from .store import default_store
from .strategy import STRATEGY_REGISTRY

# 允许被网格扫描的参数白名单（避免任意注入）
# t1 系策略共有的退出/持仓参数
_T1_COMMON = {"take_profit", "stop_loss", "require_d1_hold", "trailing_stop", "max_hold_days"}
_T1_PARAMS = set(_T1_COMMON)
# 买入端确认策略额外参数
_T1_CONFIRMED_PARAMS = _T1_COMMON | {
    "entry_mode", "ma_short", "ma_long", "vol_window", "vol_mult",
}


def _build_strategy(name: str, params: dict):
    cls = STRATEGY_REGISTRY[name]
    if name == "t1_take_profit":
        return cls(
            take_profit=params.get("take_profit", 0.05),
            stop_loss=params.get("stop_loss", -0.05),
            require_d1_hold=params.get("require_d1_hold", True),
            trailing_stop=params.get("trailing_stop"),
            max_hold_days=params.get("max_hold_days"),
        )
    if name == "t1_confirmed":
        return cls(
            take_profit=params.get("take_profit", 0.05),
            stop_loss=params.get("stop_loss", -0.05),
            require_d1_hold=params.get("require_d1_hold", True),
            trailing_stop=params.get("trailing_stop"),
            max_hold_days=params.get("max_hold_days"),
            entry_mode=params.get("entry_mode", "volume_break"),
            ma_short=params.get("ma_short", 5),
            ma_long=params.get("ma_long", 20),
            vol_window=params.get("vol_window", 20),
            vol_mult=params.get("vol_mult", 1.5),
        )
    return cls()


def _to_bars(rows) -> list[Bar]:
    return [
        Bar(
            code=r["code"], date=r["date"], open=r["open"], high=r["high"],
            low=r["low"], close=r["close"], volume=r["volume"],
            amount=r["amount"], adjust_factor=r.get("adjust_factor"),
        )
        for r in rows
    ]


def expand_grid(param_ranges: dict) -> list[dict]:
    """把 {param: [v1, v2, ...]} 展开为参数点列表（笛卡尔积）。"""
    if not param_ranges:
        return [{}]
    keys = list(param_ranges)
    return [dict(zip(keys, combo)) for combo in product(*(param_ranges[k] for k in keys))]


def run_grid(
    codes: list[str],
    strategy: str = "t1_take_profit",
    param_ranges: dict | None = None,
    start: str | None = None,
    end: str | None = None,
    initial_cash: float = 100_000.0,
    store=None,
) -> dict:
    """批量回测。

    返回 {"rows": [...], "best": {...}, "skipped": [code 列表]}。
    rows 每行 = 参数点 + code + name + 核心指标。
    """
    if strategy not in STRATEGY_REGISTRY:
        raise ValueError(f"未知策略: {strategy}")

    store = store or default_store
    grid_points = expand_grid(param_ranges or {})

    rows: list[dict] = []
    skipped: list[str] = []
    seen_params = {
        "t1_take_profit": _T1_PARAMS,
        "t1_confirmed": _T1_CONFIRMED_PARAMS,
    }.get(strategy, set())

    for code in codes:
        bars_rows = store.get_bars(code, start, end)
        if not bars_rows:
            skipped.append(code)
            continue
        bars = _to_bars(bars_rows)
        base = {"code": code, "name": store.symbol_name(code)}

        for params in grid_points:
            # 只透传该策略认识的参数，忽略无关项
            known = {k: v for k, v in params.items() if k in seen_params}
            strat = _build_strategy(strategy, known)
            engine = BacktestEngine(strat, EngineConfig(initial_cash=initial_cash))
            try:
                r = engine.run(bars)
            except ValueError:
                continue
            rows.append({
                **base, **params,
                "total_return": r.total_return,
                "annualized_return": r.annualized_return,
                "max_drawdown": r.max_drawdown,
                "sharpe_ratio": r.sharpe_ratio,
                "win_rate": r.win_rate,
                "profit_loss_ratio": r.profit_loss_ratio,
                "trade_count": r.trade_count,
                "final_equity": r.final_equity,
            })

    return {"rows": rows, "best": best_row(rows), "skipped": skipped}


def best_row(rows: list[dict], key: str = "sharpe_ratio", minimize: bool = False) -> dict | None:
    """按目标指标返回最优一行。指标缺失（None）的组合不参与排序。"""
    valid = [r for r in rows if r.get(key) is not None]
    if not valid:
        return None
    return (min if minimize else max)(valid, key=lambda r: r[key])