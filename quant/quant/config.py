"""全局配置。

所有配置都可通过环境变量覆盖，默认值保证开箱即用。
"""
from __future__ import annotations

import os
from pathlib import Path

# quant 数据库文件位置（默认在当前项目 quant/data 目录下）
QUANT_DIR = Path(os.environ.get("QUANT_DIR", Path(__file__).resolve().parent.parent))
DATA_DIR = Path(os.environ.get("QUANT_DATA_DIR", QUANT_DIR / "data"))
DATA_DIR.mkdir(parents=True, exist_ok=True)

# SQLite 行情存储
DB_PATH = Path(os.environ.get("QUANT_DB_PATH", DATA_DIR / "market.db"))

# baostock 登录退避参数（指数退避重试）
BAOSTOCK_RETRIES = 3
BAOSTOCK_BACKOFF_BASE_S = 1.0

# 交易成本默认参数（万2.3 佣金买最低5元；卖出印花税 0.1%）
DEFAULT_COMMISSION_RATE = 0.00023   # 买入佣金费率
MIN_COMMISSION = 5.0                # 最低佣金
DEFAULT_STAMP_DUTY = 0.001          # 卖出印花税
DEFAULT_SLIPPAGE = 0.0              # 滑点（按价格比例）

# 有效止盈阈值默认（用户可配置，5% / 10% / 20%）
DEFAULT_TAKE_PROFIT = 0.05

# 同步版本标记，写入每条记录以便追溯
SYNC_VERSION = "baostock-v1"