"""轻量 LLM 客户端：OpenAI 兼容 chat/completions（智谱 GLM / 兼容接口）。

职责：
- 统一系统提示 + 用户输入 + 可选工具（function calling）调用；
- 从环境变量或显式 api_key 解析密钥，未配置时安全降级返回错误信息；
- 解析响应为 {content, tool_calls}，兼容流式/非流式由调用方决定。

Design notes:
- 只做「返回结构化 JSON / 工具调用参数」的载体，不耦合具体供应商，
  用 url 区分供应商（智谱 open.bigmodel.cn 或兼容端点）。
"""
from __future__ import annotations

import json
import logging
import os
import threading
import time
from typing import Any

logger = logging.getLogger("quant.llm")

# 默认智谱 GLM 兼容端点（与项目 SettingsDialog / server.js 中 glm_api_key 对齐）
DEFAULT_BASE_URL = "https://open.bigmodel.cn/api/paas/v4/chat/completions"
DEFAULT_MODEL = os.environ.get("QUANT_LLM_MODEL", "glm-4-flash-250414")

# 主服务（Node）的 AI 日志写入地址；默认本地 3300 端口，可通过环境变量覆盖
_LOG_URL_ENV = "AI_LOG_URL"
_DEFAULT_LOG_URL = "http://localhost:3300/api/ai/logs"


class LlmError(Exception):
    """LLM 调用失败（含未配置 key）。"""


def resolve_api_key(explicit: str | None = None) -> str:
    """解析 API Key：优先显式传入，其次环境变量 GLM_API_KEY。"""
    return (explicit or "").strip() or os.environ.get("GLM_API_KEY", "").strip()


def _provider_of(url: str) -> str:
    return "glm" if "bigmodel" in (url or "") else "custom"


def report_call_log(
    *,
    model: str | None,
    provider: str | None,
    system_len: int,
    user_len: int,
    response_len: int,
    duration_ms: int,
    success: bool,
    error_msg: str = "",
    request_content: str = "",
    response_content: str = "",
) -> None:
    """把一次 AI 调用回传给主服务写入 ai_logs（设置面板「AI 调用日志」可见）。

    地址由环境变量 AI_LOG_URL 指定；未配置或上报失败一律静默，
    绝不影响 AI 主流程；上报放在后台线程，不阻塞调用方。
    """
    url = os.environ.get(_LOG_URL_ENV, "").strip() or _DEFAULT_LOG_URL
    payload = {
        "model": str(model or ""),
        "provider": str(provider or ""),
        "system_prompt_len": int(system_len or 0),
        "user_prompt_len": int(user_len or 0),
        "response_len": int(response_len or 0),
        "duration_ms": int(duration_ms or 0),
        "success": bool(success),
        "error_msg": str(error_msg or "")[:2000],
        "request_content": str(request_content or "")[:2000],
        "response_content": str(response_content or "")[:2000],
    }

    def _post() -> None:
        try:
            import httpx

            httpx.post(url, json=payload, timeout=3.0)
        except Exception:
            pass

    threading.Thread(target=_post, daemon=True).start()


def chat(
    *,
    system: str,
    user: str,
    tools: list[dict] | None = None,
    api_key: str | None = None,
    model: str | None = None,
    base_url: str | None = None,
    temperature: float = 0.2,
    timeout: float = 60.0,
    max_tokens: int = 1500,
) -> dict[str, Any]:
    """调用 LLM。返回 {"content": str, "tool_calls": [...]|None}。

    未配置 key 时抛出 LlmError（信息对调用方可读，便于降级/提示）。
    """
    key = resolve_api_key(api_key)
    used_model = model or DEFAULT_MODEL
    used_url = base_url or DEFAULT_BASE_URL
    provider = _provider_of(used_url)
    request_content = f"[system]\n{system}\n\n[user]\n{user}"
    started = time.time()

    if not key:
        msg = "未配置 LLM API Key，请在环境变量 GLM_API_KEY 中设置或在请求中传入 api_key"
        report_call_log(
            model=used_model, provider=provider, system_len=len(system), user_len=len(user),
            response_len=0, duration_ms=0, success=False, error_msg=msg,
            request_content=request_content,
        )
        raise LlmError(msg)

    payload: dict[str, Any] = {
        "model": used_model,
        "messages": [
            {"role": "system", "content": system},
            {"role": "user", "content": user},
        ],
        "temperature": temperature,
        "max_tokens": max_tokens,
    }
    if tools:
        payload["tools"] = tools
        payload["tool_choice"] = "auto"

    try:
        # 惰性导入：避免无 httpx 依赖时影响回测主链路
        import httpx

        with httpx.Client(timeout=timeout) as client:
            resp = client.post(
                used_url,
                headers={
                    "Authorization": f"Bearer {key}",
                    "Content-Type": "application/json",
                },
                json=payload,
            )
            if resp.status_code != 200:
                raise LlmError(f"LLM 请求失败 ({resp.status_code}): {resp.text[:200]}")
            data = resp.json()

        choice = (data.get("choices") or [{}])[0]
        msg = choice.get("message") or {}
        content = msg.get("content") or ""
        tool_calls = msg.get("tool_calls") or None
    except Exception as e:
        report_call_log(
            model=used_model, provider=provider, system_len=len(system), user_len=len(user),
            response_len=0, duration_ms=int((time.time() - started) * 1000),
            success=False, error_msg=str(e), request_content=request_content,
        )
        raise

    report_call_log(
        model=used_model, provider=provider, system_len=len(system), user_len=len(user),
        response_len=len(content or ""), duration_ms=int((time.time() - started) * 1000),
        success=True, request_content=request_content, response_content=content,
    )
    return {"content": content, "tool_calls": tool_calls}


def parse_json(text: str) -> dict:
    """宽松解析 LLM 返回的 JSON（容忍 ```json 围栏）。失败抛 ValueError。"""
    t = (text or "").strip()
    if t.startswith("```"):
        lines = t.splitlines()
        lines = [ln for ln in lines if not ln.startswith("```")]
        t = "\n".join(lines).strip()
    start = t.find("{")
    end = t.rfind("}")
    if start == -1 or end == -1 or end <= start:
        raise ValueError(f"响应中未找到 JSON 对象: {text[:120]}")
    return json.loads(t[start : end + 1])