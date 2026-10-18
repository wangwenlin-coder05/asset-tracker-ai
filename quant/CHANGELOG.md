# Changelog

本文件记录 quant 模块的变更。

## [0.4.0] - 2026-10-12

### 新增
- 引擎「成交模式」可配置：`execution_mode=next_open`（默认，次日开盘 T+1）/ `signal_close`
  （信号根收盘价成交，模拟盘中挂单；一字涨跌停跳空保护在两种模式下都生效）。
- 批量回测多目标帕累托前沿：`/api/backtest/grid` 返回 `pareto`（夏普/收益/回撤不被其他组合
  全面支配的参数点），前端批量页高亮展示候选集，不只给单指标最优。
- 批量回测透传 `slippage` / `execution_mode`（默认 0 / next_open，旧行为不变）。
- 自定义策略校验新增前视偏差静态检查（`bar.next`、`self._next`、`bars[` 等高危用法给出 warning）。
- 单组回测前端新增「滑点 %」与「成交模式」设置入口。

## [0.3.0] - 2026-10-12

### 新增
- 引擎 A 股涨跌停约束：次日开盘若为「一字涨停/一字跌停」，买入/卖出指令作废
  （按代码前缀区分板幅：创业/科创 20%、北交所 30%、其余 10%；ST 按 10% 近似）。
- 引擎双边过户费（默认万 0.1，`EngineConfig.transfer_fee_rate` 可配），买卖/补仓/强平全部计入。
- API 请求新增 `slippage`（默认 0，旧行为不变）与 `risk_free_rate`（默认 0，夏普扣减无风险利率）。
- 基准对比按「回测实际覆盖区间」取数（原来用请求起止日期，数据未覆盖时会错位）；
  基准缺本地数据时返回 `benchmark_note` 提示先同步沪深300，前端净值曲线下方展示。

### 修复
- 基准区间错位：`/api/backtest/run` 勾选对比时，沪深300 按股票实际交易日区间取数，
  超额收益不再因请求区间与实际数据区间不一致而失真。
- 删除 `EquityPoint.return_pct` 恒 0 死字段；交易明细序列化含过户费。

## [0.2.0] - 2026-09-14

### 新增
- 批量回测 + 参数网格：`quant.batch` 支持多标的 × 参数组合（笛卡尔积）扫描，
  FastAPI `/api/backtest/grid` 输出对比表与最优参数（按可配指标排序，如夏普/收益/胜率）。
- 前端「批量回测」板块：代码多选、参数扫描范围输入、对比表、最优组合高亮卡。
- 净值图表增强：`EquityChartView` 叠加基准净值线（虚线）、买卖点三角标记、持仓区间条，图例自适应。
- 基准对比接口补充基准净值曲线，供前端叠加。
- 引擎性能优化：`compute_metrics` 支持 numpy 向量化（延迟导入，缺省回落纯 Python），
  主循环减少逐 K 线 dataclass 分配（权益曲线用元组累积末次物化）。

### 修复
- 中文名乱码：`query_stock_basic` 自动解析中文名，数据已最新时也刷新名称。

## [0.1.0] - 2026-09-14

### 新增
- 数据层：`baostock` 真实历史日线同步（前复权、增量、指数退避重试）→ SQLite。
  - 表：`stock_daily`、`symbol_sync`，带 `source` / `sync_version` / `sync_time` 追溯。
- 策略层：`Strategy` 抽象接口 + 内置 `T1TakeProfitStrategy`（T+1 有效止盈）、`BuyAndHoldStrategy`。
- 引擎层：`BacktestEngine` 轻量事件驱动回测，T+1 次日开盘成交，支持滑点/手续费，输出净值/回撤曲线与指标（总收益、年化、最大回撤、夏普、胜率、盈亏比、交易次数、逐笔明细）。
- 服务层：FastAPI REST API（`/api/backtest/run`、`/api/symbols/*`、`/api/ping`）+ CLI（`quant.cli sync|symbols|coverage`）。
- 前端：Vue3「策略回测」板块，支持行情同步、回测参数配置、净值/回撤 SVG 图、指标卡、交易明细表、沪深300 基准对比。
- Node：`server.js` 新增 `/quant` → 8000 端口转发代理，环境变量 `QUANT_SERVICE_URL` 可覆盖。
- 工程化：pytest 单元测试（引擎/策略边界）、示例行情 CSV、README / LICENSE（MIT）。

### 限定范围
- 仅做策略验证，不做实盘下单；不接入任何券商与支付接口。