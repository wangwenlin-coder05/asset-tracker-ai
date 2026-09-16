#!/usr/bin/env python
"""命令行同步工具：把真实历史行情同步到本地 SQLite。

用法：
    python -m quant.cli sync 600000 --name 浦发银行 --start 2018-01-01
    python -m quant.cli symbols
"""
from __future__ import annotations

import argparse
import logging
import sys
from datetime import datetime

from .store import MarketStore

logger = logging.getLogger("quant.cli")


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(prog="quant", description="量化数据同步工具")
    sub = parser.add_subparsers(dest="cmd", required=True)

    p_sync = sub.add_parser("sync", help="同步一只股票历史日线")
    p_sync.add_argument("code", help="股票代码，如 600000 或 sh.600000")
    p_sync.add_argument("--name", default=None, help="股票名称")
    p_sync.add_argument("--start", default="2018-01-01", help="起始日期")
    p_sync.add_argument("--end", default=None, help="截止日期")

    sub.add_parser("symbols", help="列出本地已同步的标")

    p_cov = sub.add_parser("coverage", help="查看某个标的的覆盖区间")
    p_cov.add_argument("code")

    args = parser.parse_args(argv)
    store = MarketStore()

    if args.cmd == "sync":
        from .data_sync import sync_symbol

        end = args.end or datetime.now().astimezone().date().isoformat()
        stats = sync_symbol(args.code, args.start, end, name=args.name, store=store)
        logger.info(
            "%s(%s): 拉取 %d 条，写入 %d 条，覆盖 %s ~ %s",
            stats.code, stats.name, stats.fetched, stats.written,
            stats.new_start or "-", stats.new_end or "-",
        )
    elif args.cmd == "symbols":
        for s in store.list_symbols():
            print(f"{s['code']:>12}  {s['name'] or '':<12} "
                  f"bars={s['bar_count']:<6} {s['first_date']} ~ {s['last_date']}")
    elif args.cmd == "coverage":
        print(store.coverage(args.code))

    return 0


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO)
    sys.exit(main())