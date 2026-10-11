"""AI 策略生成：自然语言想法 → 可执行的策略代码。

与 agent.py 的区别：agent 只做「编排已有工具」，这里生成的是**新代码**——
用户描述自己的交易想法，模型产出符合 Strategy 接口的 Python 类，经静态校验
与真实回测冒烟后落盘，成为回测工作台里可选的自定义策略。

质量保障（三关，任一不过就把错误回灌给模型重写）：
1. JSON 可解析；
2. validate_code 静态校验（语法 / 危险调用 / 接口完整性）；
3. smoke_test 在本地真实行情上跑一次回测。
"""
from __future__ import annotations

import logging
import re

from . import llm
from .custom import get_custom_registry, smoke_test, validate_code, zero_trade_error

logger = logging.getLogger("quant.strategy_gen")

MAX_ATTEMPTS = 3

SYSTEM_PROMPT = """你是一名 A 股量化策略工程师。用户会用自然语言描述一个交易想法，
你要把它翻译成一个可直接回测的 Python 策略类。

【必须遵守的接口契约】
1. 策略类必须继承 `HistoryStrategy`（从 quant.strategy 导入），并实现 `on_bar`。
2. `on_bar(self, bar, position) -> Signal` 每根日线调用一次。**第一行必须调用
   `super().on_bar(bar, position)`**，它会把当前 K 线追加进 self._hist。
3. `bar` 字段：code, date, open, high, low, close, volume(手), amount(元)。
4. `position` 字段：code(None 表示空仓), entry_date, shares(股数), avg_cost(持仓均价)。
5. 返回值可以是 **Signal**（简单）或 **Order**（要指定股数/分批建仓时用），引擎两者都认。
   Signal（从 quant.models 导入）：
   - `Signal.BUY`   空仓时开仓（默认满仓，引擎在**次日开盘**成交）
   - `Signal.ADD`   持仓时加仓「与当前持仓相同股数」，即**仓位翻倍**（次日开盘成交）
   - `Signal.SELL`  持仓时平仓（次日开盘成交）
   - `Signal.HOLD`  持仓时继续持有
   - `Signal.NO_ACTION` 空仓时继续等待
   Order（精确控制数量，从 quant.models 导入 `Order`）：
   - `Order("BUY", size=200, size_type="shares")`   首仓 200 股
   - `Order("BUY", size=0.3, size_type="pct")`      用 30% 现金建仓
   - `Order("BUY", size=10000, size_type="amount")` 用 1 万元建仓
   - `Order("ADD")` 等价于 Signal.ADD（补一倍仓）；也可 `Order("ADD", size=100, size_type="shares")`
   - `Order("SELL")` 全部平仓
   空仓就返回 BUY/NO_ACTION；持仓就返回 ADD/SELL/HOLD。不要返回无意义的组合。
6. `position` 额外字段：`add_count`（本仓位已补仓次数）、`last_price`（最近一次买入成交价）。
7. **严禁未来函数**：只能用 self._hist（已含当前 bar）及 bar 本身的信息，
   不许用 self._hist 之后的数据。
8. **每次返回 BUY / ADD / SELL 前，必须先设置 `self.signal_reason = "中文原因"`**，
   用一句话说清「为什么买/卖」（如「均线金叉」「放量突破前高」「止盈 +8%」「跌破20日线止损」）。
   引擎会把这句话原样记录到交易明细里，用户据此看懂每笔买卖的触发依据。
   例：
   ```python
   if bar.close < self._sma("close", self.exit_ma):
       self.signal_reason = f"跌破{self.exit_ma}日线止损"
       return Signal.SELL
   ```

【分批建仓 / 补仓（马丁格尔、网格、金字塔）】
- 引擎**支持持仓时加仓**：`ADD` 会在原持仓上继续买入并自动重算持仓均价，可反复补仓。
- 「补一倍仓」直接用 `Signal.ADD` / `Order("ADD")`；要指定股数用
  `Order("ADD", size=..., size_type="shares")`。
- **必须给补仓封顶**：在 PARAMS 里声明 `max_adds`（中文名「最大补仓次数」，默认 5），
  并在 `__init__` 里 `self.max_adds = max_adds`。引擎会按它强制封顶；
  用户把 `max_adds` 设为 **0 或 -1 表示不限**（无限子弹）。策略内也应判断
  `position.add_count >= self.max_adds`（max_adds > 0 时）避免继续补仓。
- **首仓规则不可缺**：任何策略都必须在**空仓时**给出首次开仓条件，否则整段回测 0 笔交易。
  严禁把「补仓/加仓」当成首次买入条件！若用户只说「跌了补仓」，首仓就用
  「空仓时首个交易日直接建仓」或「首次满足某条件时建仓」。
- **首仓数量由用户输入**：建仓买多少是用户自己决定的，必须做成可调参数，不要写死比例。
  在 PARAMS 里声明 `first_shares`（中文名「建仓股数」，默认取用户描述里的股数：
  用户说「底仓买入 100 股」就默认 100，没说则默认 100），并在 `__init__` 里
  `self.first_shares = first_shares`；空仓时用
  `Order("BUY", size=self.first_shares, size_type="shares")` 精确建仓。
  若用户按金额描述（如「建仓 1 万元」），改用 `first_amount` + `size_type="amount"`。
- **资金是有限的**：回测本金固定（默认 10 万），`Signal.BUY` 是**满仓**买入，满仓后就没钱补仓。
  用户指定了建仓股数/金额时就按它精确建仓，剩余现金自然留作补仓弹药；
  只有用户明确要「一次性满仓且不补仓」时才用 `Signal.BUY`。
- 补仓触发价参考 `position.last_price`（上次买入价）或 `position.avg_cost`（持仓均价），
  按用户描述选择，并在注释里写清用的是哪个。

【可直接调用的指标助手（都用它们，别自己写循环）】
- `self._sma(key, n)`            最近 n 根的均值，key 可为 "close"/"volume"/"high"...
- `self._stdev(key, n)`          最近 n 根的标准差
- `self._highest(n, key="high")` 最近 n 根（含当前）最大值
- `self._lowest(n, key="low")`   最近 n 根（含当前）最小值
- `self._avg_volume(n)`          最近 n 根平均成交量（不含当前）
- `self._pct_change(n)`          当前收盘相对 n 根前的涨跌幅（0.03 = 3%）
- `self._is_holding(position)`   是否持仓
- `len(self._hist)`              已见 K 线数量，用来判断数据是否够用

【必须声明 PARAMS —— 所有可调数值都要暴露成参数】
在类里用 `PARAMS = [...]` 声明可调参数，前端会据此渲染输入框：
`{"key": 参数名(与 __init__ 形参同名), "label": "中文名", "type": "number",
  "default": 默认值, "step": 步长, "min": 最小值}`
`__init__` 的形参必须与 PARAMS 的 key 一一对应，并设置相同默认值。

**严禁在逻辑里写死任何阈值 / 比例 / 周期 / 数量**——凡是用户可能想调整的数值，
都必须声明为 PARAMS 参数，并在 `on_bar` 里通过 `self.xxx` 引用。至少包括：
止盈比例、止损比例、补仓跌幅、补仓倍数、均线周期、突破窗口、放量倍数、
持仓天数上限、各类触发阈值、各类数量。
- ✗ 错误：`if bar.close >= position.avg_cost * 1.05:`（5% 写死，用户改不了）
- ✓ 正确：PARAMS 里声明 `{"key": "take_profit_pct", "label": "止盈比例(%)", "type": "number", "default": 5, "step": 0.5, "min": 0.5}`，
  逻辑写 `if bar.close >= position.avg_cost * (1 + self.take_profit_pct / 100.0):`
- ✗ 错误：`add_size = position.shares * 2`（倍数写死）
- ✓ 正确：`add_size = self.first_shares * (self.add_multiplier ** position.add_count)`
- ✗ 错误：`if bar.close < self._sma("close", 20):`（周期 20 写死）
- ✓ 正确：`if bar.close < self._sma("close", self.exit_ma):`
- ✗ 错误：`if bar.volume > self._avg_volume(20) * 1.5:`（窗口/倍数写死）
- ✓ 正确：`if bar.volume > self._avg_volume(self.vol_window) * self.vol_mult:`
只有 `0`、`1`、`2`、`100`（百分比换算、整手取整）这类结构性常量可以写死。
原因文案里的数值也要用参数，例如 `f"涨{self.take_profit_pct:g}%止盈"`。

【代码红线（违反会被系统拒绝，直接白干）】
- 只允许导入：`from quant.strategy import HistoryStrategy`、
  `from quant.models import Signal, Order`，以及 `math`、`statistics`。
  **只要代码里用到 `Order`，就必须在文件顶部写 `from quant.models import Signal, Order`，
  否则会报 NameError: name 'Order' is not defined。**
- 禁止导入 os / sys / subprocess / socket / pathlib / requests 等；
- 禁止调用 open / eval / exec / compile / __import__ / getattr 等；
- 禁止访问 `__class__` 之类的魔术属性（`super().__init__()` 可以）；
- 禁止 `while True` 死循环；
- 数据不足时必须返回 NO_ACTION/HOLD 等待，不要报错。

【风格要求】
- 中文注释说明「买入条件」「卖出条件」；
- 逻辑扁平清晰，条件用中间变量命名，便于用户读懂；
- 阈值类参数用小数（如 0.05 表示 5%）。

【输出格式】只输出一个 JSON 对象，不要任何额外文字或 Markdown 围栏：
{
  "key": "英文小写下划线标识，3~41位，如 volume_pullback_breakout",
  "name": "中文策略名，如 缩量回调后放量突破",
  "description": "一句话说明买入和卖出条件",
  "buy_rule": "买入条件（中文，给用户看）",
  "sell_rule": "卖出条件（中文，给用户看）",
  "code": "完整的 Python 代码字符串（注意换行用 \\n 转义）",
  "notes": "给用户的风险提示与适用场景，1~2 句"
}"""


EXAMPLE_CODE = '''from quant.strategy import HistoryStrategy
from quant.models import Signal


class PullbackBreakoutStrategy(HistoryStrategy):
    """缩量回调后放量突破：先缩量回调，再放量突破前高时买入；跌破均线卖出。"""

    PARAMS = [
        {"key": "pullback_days", "label": "回调天数", "type": "number", "default": 3, "step": 1, "min": 2},
        {"key": "volume_ratio", "label": "放量倍数", "type": "number", "default": 1.5, "step": 0.1, "min": 1.0},
        {"key": "exit_ma", "label": "卖出均线", "type": "number", "default": 10, "step": 1, "min": 2},
    ]

    def __init__(self, pullback_days=3, volume_ratio=1.5, exit_ma=10):
        super().__init__()
        self.pullback_days = pullback_days
        self.volume_ratio = volume_ratio
        self.exit_ma = exit_ma

    def on_bar(self, bar, position):
        super().on_bar(bar, position)
        need = max(self.pullback_days + 1, self.exit_ma + 1)
        if len(self._hist) < need:
            return Signal.NO_ACTION

        # 卖出条件：跌破 exit_ma 均线
        if self._is_holding(position):
            if bar.close < self._sma("close", self.exit_ma):
                self.signal_reason = f"跌破{self.exit_ma}日线止损"
                return Signal.SELL
            return Signal.HOLD

        # 买入条件：前 pullback_days 天缩量回调，今日放量突破这些天的最高收盘价
        prior = self._hist[-self.pullback_days - 1:-1]
        prior_high_close = max(b.close for b in prior)
        pullback = self._hist[-1].close < self._hist[-2].close
        avg_vol = self._avg_volume(20)
        volume_ok = avg_vol > 0 and bar.volume >= self.volume_ratio * avg_vol
        breakout = bar.close > prior_high_close
        if pullback and volume_ok and breakout:
            self.signal_reason = f"缩量回调后放量突破{self.pullback_days}日高点"
            return Signal.BUY
        return Signal.NO_ACTION
'''


def _sanitize_key(raw: str, fallback: str = "custom_strategy") -> str:
    k = re.sub(r"[^a-z0-9_]", "_", (raw or "").strip().lower())
    k = re.sub(r"_+", "_", k).strip("_")
    if not k or not k[0].isalpha():
        k = f"c_{k}" if k else fallback
    if len(k) < 3:
        k = f"{k}_strategy"
    return k[:41]


def _normalize(data: dict) -> dict:
    from .strategy import STRATEGY_REGISTRY

    key = _sanitize_key(str(data.get("key") or ""))
    if key in STRATEGY_REGISTRY:
        key = f"{key}_custom"
    return {
        "key": key,
        "name": str(data.get("name") or key)[:40],
        "description": str(data.get("description") or "")[:300],
        "buy_rule": str(data.get("buy_rule") or "")[:300],
        "sell_rule": str(data.get("sell_rule") or "")[:300],
        "code": str(data.get("code") or ""),
        "notes": str(data.get("notes") or "")[:300],
    }


def _source_of(key: str) -> tuple[str | None, str | None]:
    """取某个策略的源码作为改写基底：内置策略用 inspect，自定义策略读磁盘。"""
    import inspect

    from .custom import get_custom_strategy
    from .strategy import STRATEGY_REGISTRY

    if key in STRATEGY_REGISTRY:
        cls = STRATEGY_REGISTRY[key]
        try:
            return inspect.getsource(cls), cls.__name__
        except OSError:
            return None, cls.__name__
    if key in get_custom_registry():
        meta = get_custom_strategy(key)
        if meta:
            return meta.get("code"), meta.get("name")
    return None, None


def _build_user_prompt(idea: str, base_code: str | None, base_name: str | None,
                       feedback: str | None) -> str:
    parts = []
    if base_code:
        parts.append(
            f"【改写基底】下面是现有策略 {base_name or ''} 的源码，请在此基础上按用户要求修改，"
            f"保留仍然合理的部分，输出**完整**的新代码（不要只给 diff）：\n```python\n{base_code}\n```"
        )
    if feedback:
        parts.append(f"【用户对上一版的修改意见】\n{feedback}")
    parts.append(f"【用户的想法 / 需求】\n{idea}")
    parts.append(
        "【参考示例】下面是一个符合规范、已通过校验的策略，请严格照它的结构与风格来写：\n"
        f"```python\n{EXAMPLE_CODE}\n```"
    )
    parts.append("现在请按要求输出 JSON。")
    return "\n\n".join(parts)


def _repair_prompt(original: str, code: str, error: str) -> str:
    return (
        f"{original}\n\n【上一次生成的代码未通过校验，请修正后重新输出完整 JSON】\n"
        f"错误信息：{error}\n"
        f"上一版代码：\n```python\n{code}\n```\n"
        "请针对上述错误修改（常见原因：忘了 super().on_bar、用了被禁的导入或调用、"
        "**用了 Order 却漏写 `from quant.models import Signal, Order` 导致 NameError**、"
        "返回了不存在的 Signal、PARAMS 与 __init__ 形参不一致、数据不足时没返回等待信号）。"
        "只输出修正后的完整 JSON。"
    )


def generate_strategy(
    idea: str,
    *,
    api_key: str | None = None,
    base_key: str | None = None,
    base_code: str | None = None,
    feedback: str | None = None,
    sample_code: str | None = None,
    max_attempts: int = MAX_ATTEMPTS,
) -> dict:
    """生成（或改写）一个策略。返回 {ok, draft?, error?, attempts, smoke?, warnings}。"""
    idea = (idea or "").strip()
    if not idea:
        return {"ok": False, "error": "请先描述你的策略想法"}

    base_name = None
    if base_key and not base_code:
        base_code, base_name = _source_of(base_key)
        if base_code is None:
            return {"ok": False, "error": f"找不到基底策略：{base_key}"}

    prompt = _build_user_prompt(idea, base_code, base_name, feedback)
    last_error = None
    last_draft = None
    last_warnings: list[str] = []
    last_good = None

    for attempt in range(1, max_attempts + 1):
        try:
            resp = llm.chat(
                system=SYSTEM_PROMPT,
                user=prompt,
                api_key=api_key,
                temperature=0.2,
                max_tokens=3600,
                timeout=120.0,
            )
        except llm.LlmError as e:
            return {"ok": False, "error": str(e), "attempts": attempt}

        try:
            data = llm.parse_json(resp.get("content") or "")
        except ValueError as e:
            last_error = f"模型返回的不是合法 JSON：{e}"
            prompt = _repair_prompt(prompt, "", last_error)
            continue

        draft = _normalize(data)
        last_draft = draft

        verdict = validate_code(draft["code"])
        last_warnings = verdict["warnings"]
        if not verdict["ok"]:
            last_error = "静态校验未通过：" + "；".join(verdict["errors"])
            prompt = _repair_prompt(prompt, draft["code"], last_error)
            continue

        smoke = smoke_test(draft["key"], draft["code"], sample_code=sample_code)
        if not smoke.get("ok"):
            last_error = smoke.get("error") or "冒烟回测失败"
            prompt = _repair_prompt(prompt, draft["code"], last_error)
            continue

        # 0 笔交易 = 可修复的失败（多半漏了首仓规则），回灌给模型重写
        zero_err = zero_trade_error(smoke)
        if zero_err:
            last_error = zero_err
            prompt = _repair_prompt(prompt, draft["code"], last_error)
            continue

        last_good = {
            "ok": True,
            "draft": {**draft, "params": verdict["params"], "class_name": verdict["class_name"]},
            "smoke": smoke,
            "attempts": attempt,
            "warnings": verdict["warnings"],
        }

        # 还有写死的数值阈值且还有重试机会 → 回灌让模型改成可调参数
        hard = [w for w in verdict["warnings"] if "写死了数值" in w]
        if hard and attempt < max_attempts:
            last_error = hard[0] + "。请把上述数值全部改成 PARAMS 参数（并在 on_bar 里用 self.xxx 引用）后重新输出完整 JSON。"
            prompt = _repair_prompt(prompt, draft["code"], last_error)
            continue

        return last_good

    # 已跑通但没来得及完全参数化：仍返回可用草稿，附带警告
    if last_good:
        return last_good

    return {
        "ok": False,
        "error": last_error or "生成失败",
        "draft": last_draft,
        "attempts": max_attempts,
        "warnings": last_warnings,
    }