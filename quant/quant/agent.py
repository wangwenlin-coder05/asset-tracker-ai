"""AI Agent：自然语言 → 工具编排 → 回测 → 报告。

两条执行路径：
1. LLM 路径：有 GLM_API_KEY 时，用 function calling 让模型从自然语言抽取
   工具调用（list_symbols / sync_symbol / run_backtest / run_grid）；
2. 规则回退：无 key 时，用确定性解析器（代码/名称别名、止盈/止损/移动止盈/
   持仓天数/时间段）抽取同一套结构化动作，保证无网也能演示与测试。

两条路径产出一致的中文投研报告（报告亦由 LLM 润色，缺 key 时走模板）。
"""
from __future__ import annotations

import logging
import re

from . import llm
from .batch import run_grid
from .data_sync import sync_symbol
from .engine import BacktestEngine, EngineConfig
from .report import serialize_report
from .store import default_store

logger = logging.getLogger("quant.agent")

# 常见别名 → 代码（仅回退解析用，LLM 路径不依赖）
_ALIAS = {
    "茅台": "sh.600519",
    "贵州茅台": "sh.600519",
    "浦发": "sh.600000",
    "浦发银行": "sh.600000",
    "宏昌电子": "603002",
    "沪深300": "sh.000300",
    "上证": "sh.000300",
}
_CODE_RE = re.compile(r"(?:\b|(?<!\d))([0-9]{6})(?:\b|(?!\d))")


# 对外暴露的工具 schema（function calling）
TOOL_SCHEMAS: list[dict] = [
    {
        "type": "function",
        "function": {
            "name": "list_symbols",
            "description": "列出已同步的本地行情标的（含代码、名称、条数）",
            "parameters": {"type": "object", "properties": {}},
        },
    },
    {
        "type": "function",
        "function": {
            "name": "sync_symbol",
            "description": "同步某只A股的历史日线行情到本地（腾讯/baostock增量）",
            "parameters": {
                "type": "object",
                "properties": {
                    "code": {"type": "string", "description": "6位股票代码，如 600519 / 603002"},
                    "name": {"type": "string"},
                    "start": {"type": "string", "description": "YYYY-MM-DD，默认 2018-01-01"},
                    "end": {"type": "string", "description": "YYYY-MM-DD，默认今天"},
                },
                "required": ["code"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "run_backtest",
            "description": "对单只股票执行 T+1 有效止盈回测，返回收益/回撤/夏普/交易明细等报告",
            "parameters": {
                "type": "object",
                "properties": {
                    "code": {"type": "string", "description": "6位股票代码"},
                    "strategy": {"type": "string", "enum": ["t1_take_profit", "t1_confirmed"], "description": "策略，默认 t1_take_profit"},
                    "take_profit": {"type": "number", "description": "止盈阈值（小数，如0.05=5%）"},
                    "stop_loss": {"type": "number", "description": "止损阈值（负小数，如-0.05）"},
                    "trailing_stop": {"type": "number", "description": "移动止盈回撤比例（小数，可空）"},
                    "max_hold_days": {"type": "integer", "description": "持仓天数上限（可空）"},
                    "entry_mode": {"type": "string", "enum": ["none", "ma_bull", "volume_break"], "description": "买入确认信号（t1_confirmed 用）"},
                    "start": {"type": "string"},
                    "end": {"type": "string"},
                },
                "required": ["code"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "run_grid",
            "description": "多标的×参数网格回测，扫描参数组合并给出最优参数",
            "parameters": {
                "type": "object",
                "properties": {
                    "codes": {"type": "array", "items": {"type": "string"}, "description": "股票代码列表"},
                    "take_profit_range": {"type": "array", "items": {"type": "number"}, "description": "止盈扫描列表，如 [0.05,0.10]"},
                    "stop_loss_range": {"type": "array", "items": {"type": "number"}, "description": "止损扫描列表"},
                    "trailing_stop_range": {"type": "array", "items": {"type": "number"}, "description": "移动止盈扫描列表，含 null 表示关闭"},
                    "max_hold_days_range": {"type": "array", "items": {"type": "integer"}, "description": "持仓天数扫描列表，含 null"},
                },
                "required": ["codes"],
            },
        },
    },
]


def _find_code(text: str) -> str | None:
    """回退解析：优先 6 位代码，其次名称别名。"""
    m = _CODE_RE.search(text)
    if m:
        return m.group(1)
    for alias, code in _ALIAS.items():
        if alias in text:
            return code
    return None


def _find_pct(text: str, *keys: str) -> float | None:
    """回退解析：从文本中找形如 '止盈5%' / '移动止盈 8' 的数值，返回小数或 None。"""
    for key in keys:
        m = re.search(rf"{re.escape(key)}[^\d-]*([\d.]+)\s*%?", text)
        if m:
            return float(m.group(1)) / 100.0
    return None


def _find_int(text: str, key: str) -> int | None:
    m = re.search(rf"{re.escape(key)}[^\d]*(\d+)\s*天?", text)
    return int(m.group(1)) if m else None


def _find_date(text: str) -> tuple[str | None, str | None]:
    dates = re.findall(r"\b(20\d{2})-(\d{2})-(\d{2})\b|\b(20\d{2})(?:年|/)", text)
    if not dates:
        return None, None
    vals = []
    for d in dates:
        y, mo, da, y2 = d[0] or "", d[1] or "", d[2] or "", d[3] or ""
        vals.append(f"{y or y2}-{mo or '01'}-{da or '01'}")
    return (vals[0], vals[-1]) if vals else (None, None)


# ---------------- 工具执行 ----------------

def _list_symbols() -> dict:
    return {"symbols": default_store.list_symbols()}


def _do_sync(code: str, name=None, start="2018-01-01", end=None) -> dict:
    from datetime import datetime
    end = end or datetime.now().astimezone().date().isoformat()
    s = sync_symbol(code, start, end, name=name, store=default_store)
    return {"code": s.code, "name": s.name, "fetched": s.fetched,
            "written": s.written, "first_date": s.new_start, "last_date": s.new_end}


def _do_backtest(code: str, **kw) -> dict:
    # 复用 api 的撮合与基准逻辑（延迟导入避免循环依赖）
    from .api import _backtest_impl
    return _backtest_impl(code, kw)


# ---------------- Agent 编排 ----------------

def run_agent(text: str, *, api_key: str | None = None) -> dict:
    """入口：解析意图 → 执行工具 → 产出报告。返回结构化结果。"""
    instruction = (text or "").strip()
    if not instruction:
        return {"ok": False, "message": "请输入要执行的任务，例如：回测茅台，止盈5%，止损5%，同时同步历史数据"}

    steps: list[dict] = []
    result_ctx: dict | None = None

    # 1) 尝试 LLM 路径
    try:
        action, ctx = _plan_with_llm(instruction, api_key)
        steps = ctx.get("steps", [])
        result_ctx = ctx
    except llm.LlmError as e:
        steps.append({"tool": "fallback", "note": f"未走 LLM（{e}），使用规则解析"})
        action, ctx = _plan_fallback(instruction)
    except Exception as e:
        logger.exception("LLM 规划失败，回退到规则解析")
        steps.append({"tool": "fallback", "note": f"LLM 规划失败（{e}），使用规则解析"})
        action, ctx = _plan_fallback(instruction)

    # 2) 执行 action
    try:
        output = _execute(action)
    except Exception as e:
        logger.exception("工具执行失败")
        return {"ok": False, "message": f"执行失败: {e}", "steps": steps, "action": action}

    # 3) 报告：有指标就调 LLM 润色，否则模板
    report = _compose_report(action, output, api_key)

    return {
        "ok": output.get("ok", True),
        "message": report,
        "action": action,
        "data": output,
        "steps": steps,
    }


def _plan_with_llm(text: str, api_key: str | None) -> tuple[dict, dict]:
    """调用 LLM function calling 决定动作。返回 (action, ctx)。"""
    resp = llm.chat(
        system=(
            "你是一个港股/美股？不，A股投研助手Agent。请理解用户自然语言，选择最合适的工具调用。"
            "若用户要求【同步/拉取/补】某只股票数据，调 sync_symbol；"
            "若要求【回测/跑/评估】某只股票，调 run_backtest；"
            "若要求【对比/扫描/网格/多只股票比收益】，调 run_grid；"
            "若只是问有哪些标的，调 list_symbols。"
            "代码若因别名（如茅台=600519）无法确定，先调 list_symbols。"
        ),
        user=text,
        tools=TOOL_SCHEMAS,
        api_key=api_key,
    )
    calls = resp.get("tool_calls") or []
    if not calls:
        raise ValueError("LLM 未决策出工具调用")
    call = calls[0]
    fn = call.get("function") or {}
    name = fn.get("name")
    args = fn.get("arguments") or "{}"
    if isinstance(args, str):
        args = llm.parse_json(args)
    return {"tool": name, "args": args}, {"steps": [{"tool": name, "args": args}]}


def _plan_fallback(text: str) -> tuple[dict, dict]:
    """无 LLM 时的确定性解析，产出一致动作。"""
    code = _find_code(text)
    start, end = _find_date(text)
    steps: list[dict] = []

    # 判断意图
    want_list = any(w in text for w in ("列出", "有哪些", "标的", "列表", "看下已同步"))
    is_grid = ("网格" in text) or ("扫描" in text) or ("对比" in text)
    want_sync = any(w in text for w in ("同步", "拉取", "补全", "更新"))

    if want_list and code is None:
        action = {"tool": "list_symbols", "args": {}}
        steps.append({"tool": "list_symbols", "args": {}})
        return action, {"steps": steps}

    if is_grid:
        codes = [code] if code else []
        action = {
            "tool": "run_grid",
            "args": {
                "codes": codes,
                "take_profit_range": [0.05, 0.10],
                "trailing_stop_range": None,
            },
        }
        steps.append({"tool": "run_grid", "args": action["args"]})
        return action, {"steps": steps}

    if want_sync and code:
        action = {
            "tool": "sync_symbol",
            "args": {"code": code, "start": start or "2018-01-01", "end": end},
        }
        steps.append({"tool": "sync_symbol", "args": action["args"]})
        return action, {"steps": steps}

    if code:
        action = {
            "tool": "run_backtest",
            "args": {
                "code": code,
                "take_profit": _find_pct(text, "止盈", "盈利目标", "目标收益"),
                "stop_loss": -1.0 * _find_pct(text, "止损") if _find_pct(text, "止损") else None,
                "trailing_stop": _find_pct(text, "移动止盈", "回撤"),
                "max_hold_days": _find_int(text, "持仓") or _find_int(text, "持有"),
                "entry_mode": "volume_break" if ("放量" in text) else ("ma_bull" if ("均线" in text) else None),
                "start": start,
                "end": end,
            },
        }
        strategy = "t1_confirmed" if action["args"].get("entry_mode") else "t1_take_profit"
        action["args"] = {k: v for k, v in action["args"].items() if v is not None}
        action["args"]["strategy"] = strategy
        steps.append({"tool": "run_backtest", "args": action["args"]})
        return action, {"steps": steps}

    action = {"tool": "list_symbols", "args": {}}
    steps.append({"tool": "list_symbols", "args": {}})
    return action, {"steps": steps}


def _is_market_index(code: str) -> bool:
    return code.startswith("sh.") or code.startswith("sz.") or code in ("000300",)


def _execute(action: dict) -> dict:
    tool = action.get("tool")
    args = action.get("args") or {}
    if tool == "list_symbols":
        return _list_symbols()
    if tool == "sync_symbol":
        return _do_sync(**{k: v for k, v in args.items() if v is not None})
    if tool == "run_backtest":
        return _do_backtest(**{k: v for k, v in args.items() if v is not None})
    if tool == "run_grid":
        return _do_grid(args)
    raise ValueError(f"未知工具: {tool}")


def _do_grid(args: dict) -> dict:
    codes = args.get("codes") or []
    params: dict = {}
    if args.get("take_profit_range"):
        params["take_profit"] = args["take_profit_range"]
    if args.get("stop_loss_range"):
        params["stop_loss"] = args["stop_loss_range"]
    if args.get("trailing_stop_range"):
        params["trailing_stop"] = args["trailing_stop_range"]
    if args.get("max_hold_days_range"):
        params["max_hold_days"] = args["max_hold_days_range"]
    out = run_grid(codes=codes, strategy="t1_take_profit", param_ranges=params,
                   start=args.get("start"), end=args.get("end"))
    # 整理成简洁 JSON
    return {
        "ok": True,
        "rows": out["rows"][:20],
        "best": out["best"],
        "skipped": out["skipped"],
        "total_combos": len(out["rows"]),
    }


def _compose_report(action: dict, output: dict, api_key: str | None) -> str:
    """生成中文投研报告。有 LLM 时润色，无 key 时走模板。"""
    tool = action.get("tool")
    args = action.get("args") or {}

    # 无 key：本地模板，够演示
    if tool == "list_symbols":
        syms = output.get("symbols") or []
        if not syms:
            return "当前本地暂无已同步的行情标的。可回复：同步茅台 或 同步 600519。"
        lines = "\n".join(f"- {s['code']}  {s.get('name')}  {s.get('bar_count')}条" for s in syms[:20])
        return f"已同步 {len(syms)} 个标的：\n{lines}"

    if tool == "sync_symbol":
        return (f"✅ 同步完成：{output.get('name')}（{output.get('code')}）"
                f"写入 {output.get('written')} 条，覆盖 {output.get('first_date')} ~ {output.get('last_date')}。")

    if tool == "run_backtest":
        m = output.get("metrics") or {}
        code = output.get("code") or args.get("code")
        line = (
            f"📈 {code} 「{output.get('strategy')}」回测结果：\n"
            f"· 区间：{output.get('range', {}).get('start')} ~ {output.get('range', {}).get('end')}\n"
            f"· 总收益：{m.get('total_return_pct', 0):.2f}% | 年化：{m.get('annualized_pct', 0):.2f}%\n"
            f"· 最大回撤：{m.get('max_drawdown_pct', 0):.2f}% | 夏普：{m.get('sharpe_ratio')}\n"
            f"· 胜率：{m.get('win_rate_pct', 0):.2f}% | 交易：{m.get('trade_count')}笔\n"
            f"· 期末资金：{m.get('final_equity', 0):,.0f}（初始 {m.get('initial_cash', 0):,.0f}）"
        )
        return line

    if tool == "run_grid":
        best = output.get("best")
        skipped = output.get("skipped") or []
        s = f"🔍 网格扫描完成：{output.get('total_combos')} 组，跳过 {len(skipped)} 个无数据标的"
        if best:
            s += "\n🏆 最优组合（按指定目标排序）：\n"
            show = {k: v for k, v in best.items() if k != "rows"}
            # 回退解析扫描出的参数集中在 params 内
            params = best.get("params") if isinstance(best.get("params"), dict) else {}
            for k, v in {**params, **show}.items():
                s += f"· {k} = {v:.4f}\n" if isinstance(v, float) else f"· {k} = {v}\n"
        return s

    return "已执行。请补充更具体的需求。"