"""把一个 CSV 行情文件导入本地库（用于演示/离线测试）。

    用法: python -m quant.seed_csv quant/sample_data.csv
说明: 仅用于不含新增的新数据源验证；生产数据一律通过 baostock 同步。
"""
from __future__ import annotations

import csv
import sys

from .store import MarketStore


def seed_csv(path: str, store: MarketStore | None = None) -> int:
    store = store or MarketStore()
    rows = []
    with open(path, newline="", encoding="utf-8-sig") as f:
        for r in csv.DictReader(f):
            code = r["code"]
            rows.append((
                code, r["date"], float(r["open"]), float(r["high"]),
                float(r["low"]), float(r["close"]), float(r["volume"]),
                float(r["amount"]), float(r.get("adjust_factor") or 1.0),
            ))
            store.update_symbol_sync(code, code, r["date"])
    return store.upsert_bars(rows)


if __name__ == "__main__":
    n = seed_csv(sys.argv[1])
    print(f"导入 {n} 条")