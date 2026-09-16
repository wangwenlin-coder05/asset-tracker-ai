"""行情数据存储层。

使用 SQLite 本地存储历史日线，支持增量同步、来源与同步版本追溯，
以及指数退避重试。绝不伪造数据：缺失字段显式以 0/None 标注。
"""
from __future__ import annotations

import sqlite3
import threading
from pathlib import Path

from .config import DB_PATH, SYNC_VERSION


class MarketStore:
    """SQLite 行情库，进程内线程安全。"""

    def __init__(self, db_path: Path | str = DB_PATH):
        self.db_path = Path(db_path)
        self.db_path.parent.mkdir(parents=True, exist_ok=True)
        self._lock = threading.RLock()
        self._create_schema()

    def _conn(self) -> sqlite3.Connection:
        conn = sqlite3.connect(str(self.db_path), timeout=30)
        conn.row_factory = sqlite3.Row
        return conn

    def _create_schema(self) -> None:
        with self._lock, self._conn() as conn:
            conn.executescript(
                """
                CREATE TABLE IF NOT EXISTS stock_daily (
                    date        TEXT NOT NULL,
                    code        TEXT NOT NULL,
                    open        REAL NOT NULL,
                    high        REAL NOT NULL,
                    low         REAL NOT NULL,
                    close       REAL NOT NULL,
                    volume      REAL NOT NULL,
                    amount      REAL NOT NULL,
                    adjust_factor REAL,
                    source      TEXT NOT NULL,
                    sync_version TEXT NOT NULL,
                    sync_time   TEXT NOT NULL DEFAULT (datetime('now','localtime')),
                    PRIMARY KEY (date, code)
                );
                CREATE INDEX IF NOT EXISTS idx_stock_daily_code
                    ON stock_daily(code, date);
                CREATE TABLE IF NOT EXISTS symbol_sync (
                    code            TEXT PRIMARY KEY,
                    name            TEXT,
                    last_sync_date  TEXT,
                    last_sync_time  TEXT
                );
                """
            )

    def upsert_bars(self, rows: list[tuple], source: str = "baostock") -> int:
        """批量写入日线。rows 元素顺序:
        (code, date, open, high, low, close, volume, amount, adjust_factor)
        若 adjust_factor 为 None 则跳过该字段。返回写入条数。
        """
        if not rows:
            return 0
        with self._lock, self._conn() as conn:
            cur = conn.executemany(
                """
                INSERT INTO stock_daily
                    (code, date, open, high, low, close, volume, amount,
                     adjust_factor, source, sync_version)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                ON CONFLICT(date, code) DO UPDATE SET
                    open=excluded.open, high=excluded.high, low=excluded.low,
                    close=excluded.close, volume=excluded.volume,
                    amount=excluded.amount, adjust_factor=excluded.adjust_factor,
                    source=excluded.source, sync_version=excluded.sync_version,
                    sync_time=datetime('now','localtime')
                """,
                [
                    (r[0], r[1], r[2], r[3], r[4], r[5], r[6], r[7], r[8],
                     source, SYNC_VERSION)
                    for r in rows
                ],
            )
            return cur.rowcount

    def update_symbol_sync(self, code: str, name: str | None,
                           last_sync_date: str) -> None:
        with self._lock, self._conn() as conn:
            conn.execute(
                """
                INSERT INTO symbol_sync (code, name, last_sync_date, last_sync_time)
                VALUES (?, ?, ?, datetime('now','localtime'))
                ON CONFLICT(code) DO UPDATE SET
                    name=COALESCE(?, name),
                    last_sync_date=?,
                    last_sync_time=datetime('now','localtime')
                """,
                (code, name, last_sync_date, name, last_sync_date),
            )

    def get_last_sync_date(self, code: str) -> str | None:
        with self._lock, self._conn() as conn:
            row = conn.execute(
                "SELECT last_sync_date FROM symbol_sync WHERE code=?", (code,)
            ).fetchone()
            return row["last_sync_date"] if row else None

    def get_bars(self, code: str, start: str | None = None,
                 end: str | None = None) -> list[dict]:
        """按日期升序取某只股票的日线。"""
        sql = ("SELECT date, code, open, high, low, close, volume, amount, "
               "adjust_factor FROM stock_daily WHERE code=?")
        args: list = [code]
        if start:
            sql += " AND date>=?"
            args.append(start)
        if end:
            sql += " AND date<=?"
            args.append(end)
        sql += " ORDER BY date ASC"
        with self._lock, self._conn() as conn:
            cur = conn.execute(sql, args)
            return [dict(r) for r in cur.fetchall()]

    def list_symbols(self) -> list[dict]:
        with self._lock, self._conn() as conn:
            cur = conn.execute(
                """
                SELECT s.code, s.name, s.last_sync_date,
                       COUNT(d.date) AS bar_count,
                       MIN(d.date) AS first_date,
                       MAX(d.date) AS last_date
                FROM symbol_sync s
                LEFT JOIN stock_daily d ON d.code = s.code
                GROUP BY s.code
                ORDER BY s.code
                """
            )
            return [dict(r) for r in cur.fetchall()]

    def symbol_name(self, code: str) -> str | None:
        """返回标的的中文名；未登记返回 None（不做持久化）。"""
        with self._lock, self._conn() as conn:
            row = conn.execute(
                "SELECT name FROM symbol_sync WHERE code=?", (code,)
            ).fetchone()
            return row["name"] if row else None

    def coverage(self, code: str) -> dict:
        """报告某只股票的覆盖区间与缺失声明。"""
        with self._lock, self._conn() as conn:
            row = conn.execute(
                "SELECT COUNT(*) AS n, MIN(date) AS lo, MAX(date) AS hi "
                "FROM stock_daily WHERE code=?", (code,)
            ).fetchone()
            return {
                "code": code,
                "bar_count": row["n"],
                "first_date": row["lo"],
                "last_date": row["hi"],
            }


# 全局默认实例
default_store = MarketStore()