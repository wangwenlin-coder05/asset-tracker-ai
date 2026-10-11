"""自定义策略：磁盘存储 + 动态加载 + 安全校验 + 版本回滚。

流程：
    用户自然语言想法 → AI 生成 Python 策略类（strategy_gen）
    → 静态安全校验（本模块 validate_code）→ 冒烟回测（smoke_test）
    → 落盘 custom_strategies/<key>.py + <key>.meta.json
    → 动态导入注册进回测引擎，与内置策略同等可用。

安全边界（生成的代码会被真实执行，故做三层防护）：
1. key 必须匹配 ^[a-z][a-z0-9_]{2,40}$，杜绝路径穿越；
2. AST 扫描：禁止导入 os/sys/subprocess/socket 等模块，禁止 eval/exec/open 等调用，
   禁止魔术属性访问与 `while True` 死循环；
3. 落盘前先跑一次真实回测，跑不通不保存。

版本可回滚：每次覆盖保存会把上一版快照进 versions/，支持回滚到任意历史版本。
"""
from __future__ import annotations

import ast
import importlib.util
import inspect
import json
import logging
import re
import time
import types
from pathlib import Path

from .config import CUSTOM_STRATEGY_DIR
from .models import Bar
from .strategy import Strategy

logger = logging.getLogger("quant.custom")

KEY_RE = re.compile(r"^[a-z][a-z0-9_]{2,40}$")

# 禁止导入的模块（文件/网络/进程/反射相关）
BANNED_MODULES = {
    "os", "sys", "subprocess", "socket", "shutil", "pathlib", "requests",
    "httpx", "urllib", "http", "ctypes", "importlib", "pickle", "marshal",
    "multiprocessing", "threading", "asyncio", "tempfile", "glob", "sqlite3",
    "webbrowser", "platform", "signal", "pty", "fcntl", "builtins", "gc",
}
# 禁止调用的内置函数
BANNED_NAMES = {
    "eval", "exec", "compile", "__import__", "open", "input", "breakpoint",
    "globals", "locals", "vars", "getattr", "setattr", "delattr", "exit", "quit",
}
# 禁止调用的属性方法（进程/文件操作）
BANNED_ATTRS = {
    "system", "popen", "spawn", "spawnl", "spawnv", "fork", "execv", "remove",
    "unlink", "rmtree", "chmod", "kill", "terminate", "urlopen", "run_module",
}
# 允许的魔术属性（super().__init__() 等正常写法）
ALLOWED_DUNDER = {"__init__", "__name__", "__qualname__", "__doc__", "__module__", "__annotations__"}

_CACHE: dict[str, type] | None = None


# ---------------- 路径 ----------------

def _code_path(key: str) -> Path:
    return CUSTOM_STRATEGY_DIR / f"{key}.py"


def _meta_path(key: str) -> Path:
    return CUSTOM_STRATEGY_DIR / f"{key}.meta.json"


def _version_path(key: str, version: int) -> Path:
    return CUSTOM_STRATEGY_DIR / "versions" / f"{key}.v{version}.py"


def _check_key(key: str) -> str:
    k = (key or "").strip()
    if not KEY_RE.match(k):
        raise ValueError("策略标识只能是 3~41 位小写字母/数字/下划线，且以字母开头")
    return k


# ---------------- 静态校验 ----------------

def _base_name(node: ast.expr) -> str:
    if isinstance(node, ast.Name):
        return node.id
    if isinstance(node, ast.Attribute):
        return node.attr
    return ""


def _scan_ast(tree: ast.AST) -> list[str]:
    errs: list[str] = []
    for node in ast.walk(tree):
        if isinstance(node, ast.Import):
            for a in node.names:
                if a.name.split(".")[0] in BANNED_MODULES:
                    errs.append(f"禁止导入模块 `{a.name}`")
        elif isinstance(node, ast.ImportFrom):
            if node.level:
                errs.append("禁止相对导入")
            root = (node.module or "").split(".")[0]
            if root in BANNED_MODULES:
                errs.append(f"禁止导入模块 `{node.module}`")
        elif isinstance(node, ast.Call):
            f = node.func
            if isinstance(f, ast.Name) and f.id in BANNED_NAMES:
                errs.append(f"禁止调用 `{f.id}()`")
            elif isinstance(f, ast.Attribute) and f.attr in BANNED_ATTRS:
                errs.append(f"禁止调用 `.{f.attr}()`")
        elif isinstance(node, ast.Attribute):
            if node.attr.startswith("__") and node.attr.endswith("__") and node.attr not in ALLOWED_DUNDER:
                errs.append(f"禁止访问魔术属性 `{node.attr}`")
        elif isinstance(node, ast.While):
            if isinstance(node.test, ast.Constant) and node.test.value is True:
                errs.append("禁止 `while True` 死循环")
    return errs


def _find_strategy_class(tree: ast.Module) -> ast.ClassDef | None:
    for node in tree.body:
        if not isinstance(node, ast.ClassDef):
            continue
        bases = [_base_name(b) for b in node.bases]
        if not any(b in ("Strategy", "HistoryStrategy", "_HistoryStrategy") or b.endswith("Strategy") for b in bases):
            continue
        if any(isinstance(n, ast.FunctionDef) and n.name == "on_bar" for n in node.body):
            return node
    return None


def _extract_params(cls_node: ast.ClassDef) -> list[dict]:
    """从策略类的 PARAMS 字面量声明里提取参数定义（供前端渲染输入框）。"""
    raw = None
    for n in cls_node.body:
        if isinstance(n, ast.Assign) and any(
            isinstance(t, ast.Name) and t.id == "PARAMS" for t in n.targets
        ):
            try:
                raw = ast.literal_eval(n.value)
            except Exception:
                return []
            break
    if not isinstance(raw, list):
        return []
    out = []
    for item in raw:
        if not isinstance(item, dict) or not item.get("key"):
            continue
        out.append({
            "key": str(item["key"]),
            "label": str(item.get("label") or item["key"]),
            "type": str(item.get("type") or "number"),
            "default": item.get("default"),
            "step": item.get("step"),
            "min": item.get("min"),
            "max": item.get("max"),
            "options": item.get("options") or [],
        })
    return out


# 允许出现在逻辑里的结构性常量（百分比换算、整手、布尔式 0/1/2）
_HARDCODE_ALLOW = {0, 1, 2, 100}


def _scan_hardcoded_numbers(ob_node: ast.FunctionDef) -> list[str]:
    """找出 on_bar 里写死的数值阈值，提示改成可调参数。"""
    found: list = []
    for node in ast.walk(ob_node):
        if not isinstance(node, ast.Constant) or isinstance(node.value, bool):
            continue
        v = node.value
        if not isinstance(v, (int, float)) or v in _HARDCODE_ALLOW:
            continue
        if v not in found:
            found.append(v)
    if not found:
        return []
    nums = "、".join(str(v) for v in found[:8])
    return [f"逻辑里写死了数值 {nums}，建议改成可调参数（PARAMS）让用户自己调"]


def validate_code(code: str) -> dict:
    """静态校验策略代码。返回 {ok, errors, warnings, class_name, params}。"""
    empty = {"ok": False, "errors": [], "warnings": [], "class_name": None, "params": []}
    if not code or not code.strip():
        return {**empty, "errors": ["代码为空"]}
    try:
        tree = ast.parse(code)
    except SyntaxError as e:
        return {**empty, "errors": [f"语法错误：第 {e.lineno} 行 {e.msg}"]}

    errors = _scan_ast(tree)
    warnings: list[str] = []
    cls_node = _find_strategy_class(tree)
    params: list[dict] = []
    if cls_node is None:
        errors.append("未找到继承 Strategy/HistoryStrategy 且实现了 on_bar 的策略类")
    else:
        ob = next(n for n in cls_node.body if isinstance(n, ast.FunctionDef) and n.name == "on_bar")
        if len(ob.args.args) < 3:
            errors.append("on_bar 签名应为 on_bar(self, bar, position)")
        params = _extract_params(cls_node)
        if not any(isinstance(n, ast.FunctionDef) and n.name == "reset" for n in cls_node.body):
            warnings.append("未实现 reset()：若策略有内部状态，跨回测可能残留（建议用 self._hist 之外的变量时补上）")
        warnings.extend(_scan_hardcoded_numbers(ob))
    return {
        "ok": not errors,
        "errors": errors,
        "warnings": warnings,
        "class_name": cls_node.name if cls_node else None,
        "params": params,
    }


# ---------------- 动态导入 ----------------

def _build_class_from_code(key: str, code: str) -> type[Strategy] | None:
    """把代码字符串编译成模块并取出策略类（用于保存前的冒烟测试）。"""
    from .models import Order, Signal

    mod_name = f"quant_custom_draft_{key}"
    mod = types.ModuleType(mod_name)
    # 预注入常用符号：生成代码若漏写 `from quant.models import ...` 也不会 NameError
    mod.__dict__.setdefault("Signal", Signal)
    mod.__dict__.setdefault("Order", Order)
    exec(compile(code, f"<{key}>", "exec"), mod.__dict__)
    return _pick_class(mod, mod_name)


def _import_module(key: str, path: Path):
    from .models import Order, Signal

    mod_name = f"quant_custom_{key}"
    spec = importlib.util.spec_from_file_location(mod_name, path)
    if spec is None or spec.loader is None:
        raise ImportError(f"无法为 {path} 创建加载器")
    mod = importlib.util.module_from_spec(spec)
    # 预注入常用符号：历史保存的策略若漏写 import 也能正常加载
    mod.__dict__.setdefault("Signal", Signal)
    mod.__dict__.setdefault("Order", Order)
    spec.loader.exec_module(mod)
    return mod


def _pick_class(mod, mod_name: str) -> type[Strategy] | None:
    for obj in vars(mod).values():
        if not isinstance(obj, type) or obj is Strategy:
            continue
        if getattr(obj, "__module__", None) != mod_name:
            continue
        if issubclass(obj, Strategy) and "on_bar" in obj.__dict__:
            return obj
    return None


def _load_all() -> dict[str, type[Strategy]]:
    registry: dict[str, type[Strategy]] = {}
    if not CUSTOM_STRATEGY_DIR.exists():
        return registry
    for py in sorted(CUSTOM_STRATEGY_DIR.glob("*.py")):
        key = py.stem
        if key.startswith("_"):
            continue
        try:
            code = py.read_text(encoding="utf-8")
        except Exception as e:
            logger.warning("读取自定义策略 %s 失败: %s", key, e)
            continue
        verdict = validate_code(code)
        if not verdict["ok"]:
            logger.warning("跳过不合规的自定义策略 %s: %s", key, verdict["errors"])
            continue
        try:
            mod = _import_module(key, py)
        except Exception as e:
            logger.warning("导入自定义策略 %s 失败: %s", key, e)
            continue
        cls = _pick_class(mod, f"quant_custom_{key}")
        if cls is None:
            logger.warning("自定义策略 %s 中未找到策略类", key)
            continue
        registry[key] = cls
    return registry


def get_custom_registry(force: bool = False) -> dict[str, type[Strategy]]:
    global _CACHE
    if _CACHE is None or force:
        _CACHE = _load_all()
    return _CACHE


def reload_custom_strategies() -> dict[str, type[Strategy]]:
    return get_custom_registry(force=True)


def instantiate_strategy(cls: type[Strategy], params: dict | None = None) -> Strategy:
    """按类签名过滤参数后实例化（多余参数忽略，缺失走默认值）。"""
    try:
        sig = inspect.signature(cls.__init__)
        allowed = {k for k in sig.parameters if k != "self"}
    except (TypeError, ValueError):
        allowed = set()
    kwargs = {k: v for k, v in (params or {}).items() if k in allowed and v is not None}
    return cls(**kwargs)


# ---------------- 冒烟测试 ----------------

def smoke_test(key: str, code: str, params: dict | None = None, sample_code: str | None = None) -> dict:
    """在本地已有行情上真实跑一次回测，验证策略跑得通。"""
    from .engine import BacktestEngine, EngineConfig
    from .store import default_store

    verdict = validate_code(code)
    if not verdict["ok"]:
        return {"ok": False, "error": "静态校验未通过：" + "；".join(verdict["errors"])}

    try:
        cls = _build_class_from_code(key, code)
    except Exception as e:
        return {"ok": False, "error": f"代码编译失败：{e}"}
    if cls is None:
        return {"ok": False, "error": "未能从代码中解析出策略类"}

    symbols = [s for s in default_store.list_symbols() if int(s.get("bar_count") or 0) >= 60]
    if not symbols:
        return {"ok": True, "skipped": True, "note": "本地没有足够的行情数据，已跳过冒烟测试"}

    target = None
    if sample_code:
        target = next((s for s in symbols if s["code"] == sample_code), None)
    target = target or symbols[0]

    rows = default_store.get_bars(target["code"], None, None)
    bars = [
        Bar(code=r["code"], date=r["date"], open=r["open"], high=r["high"], low=r["low"],
            close=r["close"], volume=r["volume"], amount=r["amount"],
            adjust_factor=r.get("adjust_factor"))
        for r in rows
    ]
    try:
        strat = instantiate_strategy(cls, params)
        result = engine_run(strat, bars)
    except Exception as e:
        return {"ok": False, "error": f"回测执行失败：{type(e).__name__}: {e}", "sample": target["code"]}

    zero = int(result.get("trade_count") or 0) == 0
    return {
        "ok": True,
        "sample": target["code"],
        "sample_name": target.get("name"),
        "bars": len(bars),
        "zero_trades": zero,
        "metrics": {
            "total_return_pct": result["total_return_pct"],
            "max_drawdown_pct": result["max_drawdown_pct"],
            "trade_count": result["trade_count"],
        },
    }


def zero_trade_error(smoke: dict) -> str | None:
    """冒烟回测 0 笔交易时给出可修复的说明，否则返回 None。"""
    if not smoke or not smoke.get("ok"):
        return None
    if not smoke.get("zero_trades"):
        return None
    return (
        "冒烟回测 0 笔交易：策略在整段样本行情里从未开仓。最常见原因是只写了"
        "「补仓/加仓(ADD)」条件，却漏了空仓时的「首仓规则(BUY)」——ADD 在空仓时不生效。"
        "请在空仓时给出首次买入条件（如首个交易日直接建仓，或满足某条件时建仓）。"
    )


def engine_run(strat, bars) -> dict:
    from .engine import BacktestEngine, EngineConfig

    result = BacktestEngine(strat, EngineConfig(initial_cash=100_000.0)).run(bars)
    return {
        "total_return_pct": round(result.total_return * 100, 4),
        "max_drawdown_pct": round(result.max_drawdown * 100, 4),
        "trade_count": len(result.trades),
    }


# ---------------- 存储 ----------------

def _read_meta(key: str) -> dict | None:
    p = _meta_path(key)
    if not p.exists():
        return None
    try:
        return json.loads(p.read_text(encoding="utf-8"))
    except Exception:
        return None


def _save(key: str, name: str, description: str, idea: str, code: str, note: str = "",
          buy_rule: str = "", sell_rule: str = "", param_values: dict | None = None) -> dict:
    """写入策略代码与元数据；覆盖前把上一版快照进 versions/。"""
    meta = _read_meta(key) or {}
    prev_version = int(meta.get("version") or 0)
    history = list(meta.get("history") or [])
    if prev_version > 0 and _code_path(key).exists():
        vfile = f"versions/{key}.v{prev_version}.py"
        _version_path(key, prev_version).write_text(
            _code_path(key).read_text(encoding="utf-8"), encoding="utf-8"
        )
        history.append({
            "version": prev_version,
            "at": meta.get("updated_at") or time.time(),
            "note": meta.get("note") or "",
            "file": vfile,
        })

    now = time.time()
    version = prev_version + 1
    merged_values = {**(meta.get("param_values") or {}), **(param_values or {})}
    new_meta = {
        "key": key,
        "name": name or key,
        "description": description or "",
        "buy_rule": buy_rule or meta.get("buy_rule") or "",
        "sell_rule": sell_rule or meta.get("sell_rule") or "",
        "idea": idea or "",
        "version": version,
        "created_at": meta.get("created_at") or now,
        "updated_at": now,
        "note": note,
        "param_values": merged_values,
        "history": history[-20:],
    }
    _code_path(key).write_text(code, encoding="utf-8")
    _meta_path(key).write_text(json.dumps(new_meta, ensure_ascii=False, indent=2), encoding="utf-8")
    reload_custom_strategies()
    return new_meta


def save_custom_strategy(key: str, name: str, code: str, *, description: str = "",
                         idea: str = "", params: dict | None = None,
                         note: str = "", buy_rule: str = "", sell_rule: str = "",
                         run_smoke: bool = True) -> dict:
    """校验 + 冒烟 + 落盘。返回 {ok, error?, warnings, meta?, smoke?}。"""
    try:
        k = _check_key(key)
    except ValueError as e:
        return {"ok": False, "error": str(e)}

    verdict = validate_code(code)
    if not verdict["ok"]:
        return {"ok": False, "error": "静态校验未通过：" + "；".join(verdict["errors"]),
                "warnings": verdict["warnings"]}

    smoke = None
    if run_smoke:
        smoke = smoke_test(k, code, params)
        if not smoke.get("ok"):
            return {"ok": False, "error": smoke.get("error"), "warnings": verdict["warnings"]}
        if smoke.get("zero_trades"):
            verdict["warnings"].append(
                "冒烟回测 0 笔交易：策略在样本上从未开仓，多半缺少「空仓时的首仓规则」，"
                "建议检查买入条件后再保存"
            )

    meta = _save(k, name, description, idea, code, note=note,
                 buy_rule=buy_rule, sell_rule=sell_rule, param_values=params)
    return {"ok": True, "warnings": verdict["warnings"], "meta": meta, "smoke": smoke,
            "params": verdict["params"]}


def list_custom_strategies() -> list[dict]:
    out = []
    registry = get_custom_registry()
    if not CUSTOM_STRATEGY_DIR.exists():
        return out
    for meta_file in sorted(CUSTOM_STRATEGY_DIR.glob("*.meta.json")):
        key = meta_file.name[: -len(".meta.json")]
        meta = _read_meta(key)
        if not meta:
            continue
        cls = registry.get(key)
        params = []
        if cls is not None:
            params = _extract_params_from_class(cls)
        params = _overlay_param_values(params, meta)
        out.append({
            "key": key,
            "name": meta.get("name") or key,
            "description": meta.get("description") or "",
            "buy_rule": meta.get("buy_rule") or "",
            "sell_rule": meta.get("sell_rule") or "",
            "idea": meta.get("idea") or "",
            "version": meta.get("version"),
            "created_at": meta.get("created_at"),
            "updated_at": meta.get("updated_at"),
            "history_count": len(meta.get("history") or []),
            "loaded": cls is not None,
            "params": params,
        })
    out.sort(key=lambda x: x.get("updated_at") or 0, reverse=True)
    return out


def _extract_params_from_class(cls) -> list[dict]:
    raw = getattr(cls, "PARAMS", None)
    if not isinstance(raw, list):
        return []
    out = []
    for item in raw:
        if not isinstance(item, dict) or not item.get("key"):
            continue
        out.append({
            "key": str(item["key"]),
            "label": str(item.get("label") or item["key"]),
            "type": str(item.get("type") or "number"),
            "default": item.get("default"),
            "step": item.get("step"),
            "min": item.get("min"),
            "max": item.get("max"),
            "options": item.get("options") or [],
        })
    return out


def _overlay_param_values(params: list[dict], meta: dict | None) -> list[dict]:
    """把用户上次保存的参数取值覆盖到默认值上（回测卡片据此预填）。"""
    values = (meta or {}).get("param_values") or {}
    if not values:
        return params
    out = []
    for p in params:
        q = dict(p)
        if q["key"] in values and values[q["key"]] is not None:
            q["default"] = values[q["key"]]
        out.append(q)
    return out


def get_custom_strategy(key: str) -> dict | None:
    try:
        k = _check_key(key)
    except ValueError:
        return None
    meta = _read_meta(k)
    if not meta or not _code_path(k).exists():
        return None
    meta = dict(meta)
    meta["code"] = _code_path(k).read_text(encoding="utf-8")
    meta["params"] = _overlay_param_values(
        _extract_params_from_class(get_custom_registry().get(k)), meta
    )
    meta["loaded"] = k in get_custom_registry()
    return meta


def delete_custom_strategy(key: str) -> bool:
    try:
        k = _check_key(key)
    except ValueError:
        return False
    existed = False
    for p in (_code_path(k), _meta_path(k)):
        if p.exists():
            p.unlink()
            existed = True
    for v in CUSTOM_STRATEGY_DIR.glob(f"versions/{k}.v*.py"):
        v.unlink()
    if existed:
        reload_custom_strategies()
    return existed


def rollback_custom_strategy(key: str, version: int | None = None) -> dict:
    """回滚到历史版本（默认最近一版）。当前版本会先快照，可再次回滚。"""
    try:
        k = _check_key(key)
    except ValueError as e:
        return {"ok": False, "error": str(e)}
    meta = _read_meta(k)
    if not meta:
        return {"ok": False, "error": "策略不存在"}
    history = meta.get("history") or []
    if not history:
        return {"ok": False, "error": "没有可回滚的历史版本"}
    target = history[-1] if version is None else next(
        (h for h in history if int(h.get("version") or -1) == int(version)), None
    )
    if target is None:
        return {"ok": False, "error": f"找不到版本 v{version}"}
    vfile = CUSTOM_STRATEGY_DIR / str(target.get("file") or "")
    if not vfile.exists():
        return {"ok": False, "error": "历史版本文件已丢失"}
    code = vfile.read_text(encoding="utf-8")
    verdict = validate_code(code)
    if not verdict["ok"]:
        return {"ok": False, "error": "历史版本已不兼容：" + "；".join(verdict["errors"])}
    new_meta = _save(k, meta.get("name") or k, meta.get("description") or "",
                     meta.get("idea") or "", code, note=f"回滚到 v{target.get('version')}",
                     buy_rule=meta.get("buy_rule") or "", sell_rule=meta.get("sell_rule") or "")
    return {"ok": True, "meta": new_meta, "rolled_back_to": target.get("version")}


def custom_strategy_keys() -> list[str]:
    return sorted(get_custom_registry().keys())