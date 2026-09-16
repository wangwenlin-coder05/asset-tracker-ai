# quant · 策略回测工作台

轻量级 **AI 辅助投研 + 可复测的事件驱动回测引擎**。

本模块是对「微信选股提取」板块的自然延伸：把散落在业务脚本里的 **T+1 有效止盈** 逻辑，抽象成一套**可复测、可对比、可量化**的正式引擎。**只做验证、不下单**，不涉及任何实盘交易与券商接口。

> ⚠️ **投资免责声明**：本项目所有数据与结果仅供参考，不构成任何投资建议。股市有风险，入市需谨慎。

---

## 架构

```
微信选股提取(现有) ─▶ 标的池 ─▶ 策略定义 ─▶ 回测引擎 ─▶ 回测报告 ─▶ 前端"策略回测"板块
                                   ▲
                    baostock 真实历史行情
```

- **数据层**：默认 `baostock`（官方证券数据，含复权因子），同步到本地 SQLite，支持增量与 `source`/`sync_version` 追溯。
- **策略层**：`strategy.Strategy` 抽象接口，策略可与引擎解耦、可配置、可替换。
- **引擎层**：`engine.BacktestEngine` 自研轻量事件驱动引擎（不依赖 backtrader，原理清晰可讲），T+1 次日开盘成交，支持滑点/手续费。
- **服务层**：FastAPI 提供回测 REST API；Node 后端 `server.js` 转发 `/quant` → 8000 端口；前端 Vue3 新开「策略回测」板块。

## 技术栈

- Python 3.10+、FastAPI、baostock、pydantic
- SQLite（零外部依赖，开箱即用）
- pytest（含引擎/策略边界用例）
- Node.js / Express（仅端口转发）、Vue3（前端看板）

---

## 快速开始

### 1. 启动量化服务

```bash
cd quant
python -m venv .venv
# Windows: .venv\Scripts\activate     macOS/Linux: source .venv/bin/activate
pip install -r requirements.txt

# 启动 API（默认 8000 端口）
python -m uvicorn quant.api:app --port 8000
# 或开发模式热重载
python -m quant.api
```

> Node 后端默认转发到 `http://localhost:8000`，可通过环境变量 `QUANT_SERVICE_URL` 覆盖。

### 2. 同步真实行情（baostock）

```bash
# 命令行工具
python -m quant.cli sync 600000 --name 浦发银行 --start 2018-01-01
python -m quant.cli symbols
python -m quant.cli coverage 600000
```

### 3. 运行一次回测

```bash
curl -X POST http://localhost:8000/api/backtest/run \
  -H "Content-Type: application/json" \
  -d '{"code":"600000","strategy":"t1_take_profit","take_profit":0.05,"start":"2020-01-01"}'
```

### 4. 前端

前端「策略回测」板块通过 Node 代理调用上述接口，输入股票代码→同步行情→运行回测，即可查看净值曲线（叠加基准、买卖点、持仓区间）、回撤曲线、指标卡与交易明细。

「批量回测」板块支持**多标的 × 参数网格**扫描：勾选已同步标的，输入止盈/止损扫描范围，一键批量执行并给出最优参数组合与对比表。

### 4.1 批量回测 · 参数网格（API）

```bash
curl -X POST http://localhost:8000/api/backtest/grid \
  -H "Content-Type: application/json" \
  -d '{
    "codes": ["600000", "000001"],
    "strategy": "t1_take_profit",
    "params": {"take_profit": [0.05, 0.10], "stop_loss": [-0.03, -0.05]},
    "best_key": "sharpe_ratio"
  }'
```

返回：`rows`（逐组合一行：标的 + 参数 + 收益/年化/回撤/夏普/胜率/盈亏比/交易次数）、`best`（最优组合）、`skipped`（无数据跳过的代码）。

### 5. 离线演示（不使用网络）

内置一份示例行情 `quant/sample_data.csv`，导入后即可在无网环境跑通全流程：

```bash
python -m quant.seed_csv quant/sample_data.csv
curl -X POST http://localhost:8000/api/backtest/run \
  -H "Content-Type: application/json" \
  -d '{"code":"600000.SAMPLE","strategy":"t1_take_profit","take_profit":0.05}'
```

---

## 如何编写一个新策略

```python
from quant.models import Bar, Position, Signal
from quant.strategy import Strategy

class MyStrategy(Strategy):
    def __init__(self, take_profit=0.05):
        self.take_profit = take_profit

    def on_bar(self, bar: Bar, position: Position) -> Signal:
        if position.code is None or position.shares == 0:
            return Signal.BUY                  # 空仓时建仓
        if (bar.close - position.avg_cost) / position.avg_cost >= self.take_profit:
            return Signal.SELL                 # 达标卖出
        return Signal.HOLD                     # 否则持有
```

注册到 `quant/strategy.py` 的 `STRATEGY_REGISTRY` 后，即可在 API / 前端下拉框直接使用。

> 注意：为避免**未来函数（look-ahead bias）**，策略内只能访问当前 K 线及之前的信息；引擎会统一在信号的**下一根 K 线开盘**成交（T+1）。

---

## 内置策略

| 策略 | 说明 |
|------|------|
| `t1_take_profit` | T+1 有效止盈。D0 建仓当日不计盘中止盈；仅 D1 及以后涨到阈值才算有效；若 D0 已达标，须 D1 开盘守住阈值（防虚涨）。支持参数 `take_profit`、`stop_loss`、`require_d1_hold`。 |
| `buy_and_hold` | 买入持有（常作基准对照）。 |

---

## 数据可靠性说明

- 主数据源 `baostock` 为官方证券数据库，含复权因子；`adjustflag=2` 直接返回**前复权**价格，引擎直接使用，避免二次复权。
- 增量同步：每只标的记录 `last_sync_date`，只拉增量，避免重复与漏拉。
- 指数退避重试：接口失败按 1/2/4 秒递增重试，超限告警并抛错，**不静默吞错**。
- **禁止伪造数据**：任一行情字段缺失即剔除该行；量额缺失记为 0，复权因子缺失置 `None`。报告不声明实际覆盖区间之外的数据。

## 测试

```bash
cd quant
python -m pytest tests -v
```

覆盖：空仓建仓、D0 禁止当日止盈、D1 有效止盈、止损、回测结束强平、状态复用、空数据校验、SQLite 增量幂等、参数网格展开/过滤/跳过、批量最优选择、API 路由与参数校验。

## 开源合规

- [LICENSE](./LICENSE) — MIT
- 数据源使用须遵守 baostock 服务条款；本仓库不含任何付费/私有数据
- 本模块不接入券商、不下单，仅供研究学习

## 更新日志

见 [CHANGELOG.md](./CHANGELOG.md)。