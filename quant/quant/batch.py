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
    slippage: float = 0.0,
    execution_mode: str = "next_open",
    train_end: str | None = None,
    survivorship: bool = False,
) -> dict:
    """批量回测。

    返回 {"rows": [...], "best": {...}, "skipped": [...],
          "survivorship_gap"? , "train_rows"?}。
    rows 每行 = 参数点 + code + name + 核心指标。

    - train_end：给定则把回测区间按 [start~train_end] 与 [train_end~end] 切成
      训练/验证两段，输出 train_rows（训练段指标）用于防过拟合；
      「best」仍按全期给，但建议结合两段看。
    - survivorship：True 时把本地登记的退市股（survivorship_watch）拉进 codes
      当对照组，并输出 survivorship_gap（存活组收益 - 退市组收益，正数=幸存者偏差幅度）。
    """
    if strategy not in STRATEGY_REGISTRY:
        raise ValueError(f"未知策略: {strategy}")

    store = store or default_store
    grid_points = expand_grid(param_ranges or {})

    # 幸存者偏差对照：把已登记的退市股并入扫描池（仅当开启）
    survivor_codes: list[str] = []
    if survivorship and store is not None and hasattr(store, "list_survivorship_watch"):
        try:
            watch = [w for w in store.list_survivorship_watch(delisted_only=True)
                     if w["code"] not in codes]
            survivor_codes = [w["code"] for w in watch]
            codes = list(codes) + survivor_codes
        except Exception:
            survivor_codes = []

    rows: list[dict] = []
    skipped: list[str] = []
    seen_params = {
        "t1_take_profit": _T1_PARAMS,
        "t1_confirmed": _T1_CONFIRMED_PARAMS,
        "ma_cross": {"fast", "slow"},
        "momentum": {"window"},
        "bollinger": {"window", "k"},
        "turtle": {"entry_n", "exit_n"},
        "buy_and_hold": set(),
    }.get(strategy, set())

    for code in codes:
        is_surv = code in survivor_codes
        bars_rows = store.get_bars(code, start, end)
        if not bars_rows:
            skipped.append(code)
            continue
        bars = _to_bars(bars_rows)
        base = {"code": code, "name": store.symbol_name(code)}
        base["survivor"] = is_surv  # 标记对照组成员

        for params in grid_points:
            known = {k: v for k, v in params.items() if k in seen_params}
            strat = _build_strategy(strategy, known)
            cfg = EngineConfig(initial_cash=initial_cash, slippage=slippage,
                               execution_mode=execution_mode)
            engine = BacktestEngine(strat, cfg)
            try:
                r = engine.run(bars)
            except ValueError:
                continue
            row = {
                **base, **params,
                "total_return": r.total_return,
                "annualized_return": r.annualized_return,
                "max_drawdown": r.max_drawdown,
                "sharpe_ratio": r.sharpe_ratio,
                "win_rate": r.win_rate,
                "profit_loss_ratio": r.profit_loss_ratio,
                "trade_count": r.trade_count,
                "final_equity": r.final_equity,
            }

            # 训练/验证切分：同参数点在训练段 [start~train_end] 再跑一遍
            if train_end:
                try:
                    train_bars = _to_bars(store.get_bars(code, start, train_end))
                    if len(train_bars) >= 5:
                        tr = BacktestEngine(
                            _build_strategy(strategy, known), cfg
                        ).run(train_bars)
                        row["train_total_return"] = tr.total_return
                        row["train_max_drawdown"] = tr.max_drawdown
                        row["train_sharpe_ratio"] = tr.sharpe_ratio
                except ValueError:
                    pass
            rows.append(row)

    out: dict = {"rows": rows, "best": best_row(rows), "skipped": skipped}

    # 幸存者偏差对照差值
    if survivorship and survivor_codes:
        out["survivorship_gap"] = _survivorship_gap(rows)
    # 训练段指标
    if train_end:
        out["train_end"] = train_end
    return out


def _survivorship_gap(rows: list[dict]) -> dict:
    """存活组 vs 退市对照组的收益差。正数 = 只用存活股回测会高估这么多。"""
    live = [r["total_return"] for r in rows if not r.get("survivor")
            and r.get("total_return") is not None]
    dead = [r["total_return"] for r in rows if r.get("survivor")
            and r.get("total_return") is not None]
    if not live or not dead:
        return {"note": "缺少对照组数据（退市股需先同步其历史 K 线）",
                "live_mean": _mean(live), "dead_mean": _mean(dead), "gap": None}
    lm, dm = _mean(live), _mean(dead)
    return {
        "live_mean": round(lm, 6),
        "dead_mean": round(dm, 6),
        "gap": round(lm - dm, 6),
        "note": f"存活组均值 {lm*100:.1f}% vs 退市组 {dm*100:.1f}%，"
                 f"幸存者偏差约 {(lm - dm)*100:.1f} 个百分点",
    }


def _mean(xs: list[float]) -> float:
    return sum(xs) / len(xs) if xs else 0.0


def best_row(rows: list[dict], key: str = "sharpe_ratio", minimize: bool = False) -> dict | None:
    """按目标指标返回最优一行。指标缺失（None）的组合不参与排序。"""
    valid = [r for r in rows if r.get(key) is not None]
    if not valid:
        return None
    return (min if minimize else max)(valid, key=lambda r: r[key])


def pareto_frontier(rows: list[dict], keys: tuple[str, ...] = ("sharpe_ratio", "total_return", "max_drawdown")) -> list[dict]:
    """多目标帕累托前沿（最大化 sharpe/return，最小化 drawdown）。

    返回不被其他行全面支配的行；同指标并列时全部保留（稳定于输入顺序）。
    """
    valid = [r for r in rows if all(r.get(k) is not None for k in keys)]
    if not valid:
        return []

    def dominates(a: dict, b: dict) -> bool:
        """a 支配 b：所有目标 a>=b（回撤 a<=b）且至少一项严格更优。"""
        better_or_equal = all(
            (a[k] <= b[k]) if k == "max_drawdown" else (a[k] >= b[k])
            for k in keys
        )
        strictly_better = any(
            (a[k] < b[k]) if k == "max_drawdown" else (a[k] > b[k])
            for k in keys
        )
        return better_or_equal and strictly_better

    frontier: list[dict] = []
    for i, row in enumerate(valid):
        dominated = any(
            dominates(other, row)
            for j, other in enumerate(valid)
            if j != i
        )
        if not dominated:
            frontier.append(row)
    return frontier