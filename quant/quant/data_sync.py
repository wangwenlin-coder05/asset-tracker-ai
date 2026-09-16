"""数据源：腾讯公开行情（裸 A 股代码）+ baostock（指数/带前缀代码）。

负责拉取真实 A 股历史日线并落库。要点：
- 裸代码（603002 / 000001）走腾讯前复权接口，无需登录、无需 9 位前缀；
- 指数（sh.000300）等其他代码走 baostock；
- 指数退避重试，不静默吞错；
- 增量同步：从最近已同步日期继续，避免重复与漏拉；
- 数据缺失显式标注，不伪造。
"""
from __future__ import annotations

import json
import logging
import re
import time
from dataclasses import dataclass

from .config import BAOSTOCK_BACKOFF_BASE_S, BAOSTOCK_RETRIES
from .store import MarketStore

logger = logging.getLogger("quant.sync")

# 东方财富接口用到的请求头（部分接口需要浏览器 UA，避免被流量防护拦截）
_EM_HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
        "AppleWebKit/537.36 (KHTML, like Gecko) "
        "Chrome/120.0 Safari/537.36"
    ),
    "Referer": "https://quote.eastmoney.com/",
}

# 裸的 A 股代码（纯数字，5~6 位），可走东方财富；带交易所前缀（sh.600000）走 baostock
_BARE_CODE_RE = re.compile(r"^\d{5,6}$")


@dataclass
class SyncStats:
    code: str
    name: str | None
    fetched: int
    written: int
    new_start: str | None = None   # 本库中首条日期
    new_end: str | None = None     # 本库中最末日期


class BaostockSource:
    """对 baostock 的薄封装（延迟导入，防止无 baostock 时服务不可用）。"""

    @staticmethod
    def _login():
        import baostock as bs

        lg = bs.login()
        if lg.error_code != "0":
            raise RuntimeError(f"baostock 登录失败: {lg.error_code} {lg.error_msg}")
        return bs

    def fetch_daily(self, code: str, start: str, end: str) -> list[tuple]:
        """拉取日线，返回 (code,date,open,high,low,close,volume,amount,adjf) 元组列表。"""
        import baostock as bs

        rs = bs.query_history_k_data_plus(
            code,
            "date,open,high,low,close,volume,amount,preclose",
            start_date=start,
            end_date=end,
            frequency="d",
            adjustflag="2",  # 前复权
        )
        if rs.error_code != "0":
            raise RuntimeError(f"查询 {code} 失败: {rs.error_code} {rs.error_msg}")

        rows = []
        while rs.next():
            d = rs.get_row_data()
            try:
                open_ = float(d[1]) if d[1] else None
                high = float(d[2]) if d[2] else None
                low = float(d[3]) if d[3] else None
                close = float(d[4]) if d[4] else None
                volume = float(d[5]) if d[5] else 0.0
                amount = float(d[6]) if d[6] else 0.0
                preclose = float(d[7]) if d[7] else None
            except (TypeError, ValueError):
                logger.warning("%s %s 部分字段缺失，剔除该行", code, d[0])
                continue

            # 缺失显式归一化：行情价缺失视为整行无效；量额缺失记为 0
            if open_ is None or high is None or low is None or close is None:
                continue

            # 复权因子 = close / preclose（无 preclose 时置 None，不伪造）
            adjf = round(close / preclose, 6) if preclose and preclose > 0 else None
            rows.append((code, d[0], open_, high, low, close, volume, amount, adjf))
        return rows

    @staticmethod
    def query_stock_basic(code: str) -> dict | None:
        """查询个股基本信息（含中文名），供名称自动解析。失败不阻断。"""
        import baostock as bs

        rs = bs.query_stock_basic(code=code)
        if rs.error_code == "0" and rs.next():
            row = rs.get_row_data()
            if len(row) >= 2:
                return {"code": row[0], "name": row[1], "ipoDate": row[2] if len(row) > 2 else None}
        return None

    @staticmethod
    def query_stock_industry(code: str, date: str) -> str | None:
        """查询个股所属行业（用于概览展示，失败不阻断）。"""
        import baostock as bs

        rs = bs.query_stock_industry(code=code, date=date)
        if rs.error_code == "0" and rs.next():
            row = rs.get_row_data()
            return row[3]  # 行业名称
        return None


class TencentSource:
    """腾讯公开行情源，支持裸 A 股代码（如 603002 / 000001）。

    使用腾讯 ifzq 的前复权日 K 接口，无需登录、无需 9 位带前缀代码，返回股票中文名。
    """

    @staticmethod
    def seccode(code: str) -> str:
        """裸代码 → 腾讯 seccode（sh600000 / sz000001 / bj430047）。"""
        if code.startswith(("60", "68")):
            return f"sh{code}"
        if code.startswith(("40", "43", "83", "87", "92")):
            return f"bj{code}"
        return f"sz{code}"

    def fetch_daily(self, code: str, start: str, end: str) -> list[tuple]:
        import http.client

        sec = self.seccode(code)
        # 腾讯接口要求 URL 中的逗号保持字面逗号；httpx/urllib 会编码成 %2C 导致 param error。
        # 单次最多取 ~800 根日 K（约 3 年）；更早区间由增量同步多次补齐。
        path = f"/appstock/app/fqkline/get?param={sec},day,{start},{end},800,qfq"
        conn = http.client.HTTPSConnection("web.ifzq.gtimg.cn", timeout=20)
        try:
            conn.request("GET", path, headers=_EM_HEADERS)
            resp = conn.getresponse()
            payload = json.loads(resp.read().decode("utf-8"))
        finally:
            conn.close()

        node = payload.get("data", {}).get(sec, {})
        klines = node.get("qfqday") or node.get("day") or []
        if not klines:
            raise RuntimeError(f"腾讯查询 {code} 无返回数据")

        rows = []
        for k in klines:
            # [日期, 开, 收, 高, 低, 量(手), ...]
            if len(k) < 6:
                continue
            try:
                open_ = float(k[1])
                close = float(k[2])
                high = float(k[3])
                low = float(k[4])
                volume = float(k[5]) if k[5] else 0.0
            except (TypeError, ValueError):
                logger.warning("%s %s 部分字段缺失，剔除该行", code, k[0])
                continue
            if open_ <= 0 or high <= 0 or low <= 0 or close <= 0:
                continue
            rows.append((code, k[0], open_, high, low, close, volume, 0.0, None))
        return rows

    @staticmethod
    def query_stock_basic(code: str) -> dict | None:
        """查询个股中文名（失败不阻断）。qt[1]=名称。"""
        import http.client

        try:
            sec = TencentSource.seccode(code)
            path = f"/appstock/app/fqkline/get?param={sec},day,2000-01-01,2000-01-02,1,qfq"
            conn = http.client.HTTPSConnection("web.ifzq.gtimg.cn", timeout=10)
            try:
                conn.request("GET", path, headers=_EM_HEADERS)
                resp = conn.getresponse()
                payload = json.loads(resp.read().decode("utf-8"))
            finally:
                conn.close()
            qt = payload.get("data", {}).get(sec, {}).get("qt", {}).get(sec)
            if qt and qt[1]:
                return {"code": code, "name": qt[1]}
        except Exception as e:  # noqa: BLE001 名称解析失败不阻断主流程
            logger.debug("腾讯解析 %s 名称失败: %s", code, e)
        return None


def _is_bare_code(code: str) -> bool:
    """是否裸 A 股代码（纯数字 5~6 位）。"""
    return bool(_BARE_CODE_RE.fullmatch(code))


def _pick_source(code: str) -> tuple[object, str]:
    """根据代码选择数据源。裸代码走腾讯，其余（含 sh.000300 基准）走 baostock。"""
    if _is_bare_code(code):
        return TencentSource(), "tencent"
    return BaostockSource(), "baostock"


def sync_symbol(code: str, start: str, end: str,
                name: str | None = None, store: MarketStore | None = None) -> SyncStats:
    """同步单个标的的日线到本地库。

    支持增量：若历史已同步过，则从 last_sync_date+1 开始。
    start/end 为 YYYY-MM-DD。
    """
    store = store or MarketStore()

    src = _pick_source(code)[0]

    # baostock 需先登录（带指数退避重试）；东方财富无需登录
    if isinstance(src, BaostockSource):
        for attempt in range(1, BAOSTOCK_RETRIES + 1):
            try:
                BaostockSource._login()
                break
            except Exception as e:
                if attempt == BAOSTOCK_RETRIES:
                    logger.error("baostock 登录在 %d 次后失败: %s", attempt, e)
                    raise
                delay = BAOSTOCK_BACKOFF_BASE_S * (2 ** (attempt - 1))
                logger.warning("baostock 登录失败(%s)，%.1fs 后重试", e, delay)
                time.sleep(delay)

    # 名称解析：调用方未提供时自动解析中文名（不受调用端编码影响，失败不阻断）
    if not name or name in (code, "???"):
        info = src.query_stock_basic(code)
        if info and info.get("name"):
            name = info["name"]

    # 增量：last_sync_date 存在则从那天的次日开始
    last = store.get_last_sync_date(code)
    eff_start = start
    if last and last >= start:
        eff_start = _next_day(last)

    stats = SyncStats(code=code, name=name or code, fetched=0, written=0)
    # 已是最新（上次同步日已覆盖 end 或更晚）：直接返回，无需调用数据源
    cov_before = store.coverage(code)
    if eff_start > end and cov_before.get("bar_count", 0) > 0:
        stats.new_start, stats.new_end = cov_before["first_date"], cov_before["last_date"]
        # 即使无需同步数据，也更新名称（可能是修复乱码/首次自动解析）
        if name:
            store.update_symbol_sync(code, name, last or end)
        return stats

    for attempt in range(1, BAOSTOCK_RETRIES + 1):
        try:
            rows = src.fetch_daily(code, eff_start, end)
            break
        except Exception as e:
            if attempt == BAOSTOCK_RETRIES:
                logger.error("拉取 %s 在 %d 次后失败: %s", code, attempt, e)
                raise
            delay = BAOSTOCK_BACKOFF_BASE_S * (2 ** (attempt - 1))
            logger.warning("拉取 %s 失败(%s)，%.1fs 后重试", code, e, delay)
            time.sleep(delay)

    stats.fetched = len(rows)
    stats.written = store.upsert_bars(rows)

    last_date = end
    if rows:
        # 传参是按日期升序；取最后一条的日期
        last_date = rows[-1][1]
    store.update_symbol_sync(code, name, last_date)

    cov = store.coverage(code)
    stats.new_start, stats.new_end = cov["first_date"], cov["last_date"]
    return stats


def _next_day(date_str: str) -> str:
    from datetime import date, timedelta

    d = date.fromisoformat(date_str)
    return (d + timedelta(days=1)).isoformat()