# Phase 1 逐接口改造清单

此文件由 `npm run docs:phase1` 按当前 server.js 自动生成；接口表中的业务表包含静态可识别的 helper 调用，动态 SQL 仍由统一数据库边界强制隔离。

当前登记：166 个业务路由条目（含 2 个量化代理），另有 6 个账号接口。实际业务表 35 张；不沿用旧方案中的 31 张/165 个估计。

## 新账号接口

| 方法 | 接口 | 权限 | 实际改法 |
| --- | --- | --- | --- |
| POST | `/api/auth/register` | 公开（受注册开关/来源/限流约束） | 创建普通用户，bcrypt 哈希密码，建立 HttpOnly 会话及 CSRF Token |
| POST | `/api/auth/login` | 公开（来源/限流） | 校验密码，返回 user + csrfToken，原始会话 Token 只在 Cookie 中 |
| GET | `/api/auth/me` | 已登录 | 返回当前用户、角色、能力和 CSRF Token |
| POST | `/api/auth/account` | 已登录 + CSRF + 当前密码 | 只修改自己的邮箱，保留用户 ID，事务撤销全部旧会话并换发当前会话 |
| POST | `/api/auth/password` | 已登录 + CSRF + 当前密码 | 校验新密码后更新 bcrypt 哈希，事务撤销全部旧会话并换发当前会话 |
| POST | `/api/auth/logout` | 已登录 + CSRF | 删除当前会话，清除 Cookie |

## 所有业务接口

| 方法 | 接口 | 关联业务表 | 权限及具体改法 |
| --- | --- | --- | --- |
| GET | `/api/stocks` | `buy_records`、`sell_records`、`stocks` | 原请求/响应结构保留；查询/子查询/JOIN/事务强制 user_id；写入自动归当前账号 |
| GET | `/api/stocks/:id` | `buy_records`、`sell_records`、`stocks` | 原请求/响应结构保留；查询/子查询/JOIN/事务强制 user_id；写入自动归当前账号 |
| GET | `/api/stocks/:id/sell-records` | `sell_records` | 原请求/响应结构保留；查询/子查询/JOIN/事务强制 user_id；写入自动归当前账号 |
| POST | `/api/stocks/:id/sell-record` | `sell_records`、`stocks` | 原请求/响应结构保留；查询/子查询/JOIN/事务强制 user_id；写入自动归当前账号；写请求校验 X-CSRF-Token |
| DELETE | `/api/stocks/:id/sell-record/:recordId` | `sell_records` | 原请求/响应结构保留；查询/子查询/JOIN/事务强制 user_id；写入自动归当前账号；写请求校验 X-CSRF-Token |
| PUT | `/api/stocks/:id/sell-record/:recordId` | `sell_records` | 原请求/响应结构保留；查询/子查询/JOIN/事务强制 user_id；写入自动归当前账号；写请求校验 X-CSRF-Token |
| GET | `/api/stocks/:id/buy-records` | `buy_records` | 原请求/响应结构保留；查询/子查询/JOIN/事务强制 user_id；写入自动归当前账号 |
| POST | `/api/stocks/:id/buy-record` | `buy_records`、`stocks` | 原请求/响应结构保留；查询/子查询/JOIN/事务强制 user_id；写入自动归当前账号；写请求校验 X-CSRF-Token |
| DELETE | `/api/stocks/:id/buy-record/:recordId` | `buy_records` | 原请求/响应结构保留；查询/子查询/JOIN/事务强制 user_id；写入自动归当前账号；写请求校验 X-CSRF-Token |
| PUT | `/api/stocks/:id/buy-record/:recordId` | `buy_records` | 原请求/响应结构保留；查询/子查询/JOIN/事务强制 user_id；写入自动归当前账号；写请求校验 X-CSRF-Token |
| POST | `/api/stocks` | `stocks` | 原请求/响应结构保留；查询/子查询/JOIN/事务强制 user_id；写入自动归当前账号；写请求校验 X-CSRF-Token |
| PUT | `/api/stocks/:id` | `stocks` | 原请求/响应结构保留；查询/子查询/JOIN/事务强制 user_id；写入自动归当前账号；写请求校验 X-CSRF-Token |
| PUT | `/api/stocks/:id/clear` | `stocks` | 原请求/响应结构保留；查询/子查询/JOIN/事务强制 user_id；写入自动归当前账号；写请求校验 X-CSRF-Token |
| DELETE | `/api/stocks/:id` | `stocks` | 原请求/响应结构保留；查询/子查询/JOIN/事务强制 user_id；写入自动归当前账号；写请求校验 X-CSRF-Token |
| GET | `/api/ai/hot/platforms` | 无 / 外部服务 | 新增会话鉴权；不读其他用户数据库数据 |
| GET | `/api/ai/hot` | 无 / 外部服务 | 新增会话鉴权；不读其他用户数据库数据 |
| GET | `/api/ai/hot/batch` | 无 / 外部服务 | 新增会话鉴权；不读其他用户数据库数据 |
| GET | `/api/ai/article-parse` | 无 / 外部服务 | 本机所有者 + 直接回环访问；云端禁用；SQL 仍限当前 user_id |
| POST | `/api/ai/articles` | `ai_articles` | 原请求/响应结构保留；查询/子查询/JOIN/事务强制 user_id；写入自动归当前账号；写请求校验 X-CSRF-Token |
| GET | `/api/ai/articles` | `ai_articles` | 原请求/响应结构保留；查询/子查询/JOIN/事务强制 user_id；写入自动归当前账号 |
| GET | `/api/ai/articles/:id` | `ai_articles` | 原请求/响应结构保留；查询/子查询/JOIN/事务强制 user_id；写入自动归当前账号 |
| PUT | `/api/ai/articles/:id` | `ai_articles` | 原请求/响应结构保留；查询/子查询/JOIN/事务强制 user_id；写入自动归当前账号；写请求校验 X-CSRF-Token |
| DELETE | `/api/ai/articles/:id` | `ai_articles` | 原请求/响应结构保留；查询/子查询/JOIN/事务强制 user_id；写入自动归当前账号；写请求校验 X-CSRF-Token |
| ALL | `/quant` | 无 / 外部服务 | 本机所有者 + 直接回环访问；云端禁用；SQL 仍限当前 user_id |
| ALL | `/api/quant` | 无 / 外部服务 | 本机所有者 + 直接回环访问；云端禁用；SQL 仍限当前 user_id |
| GET | `/api/quant-service/status` | 无 / 外部服务 | 本机所有者 + 直接回环访问；云端禁用；SQL 仍限当前 user_id |
| POST | `/api/quant-service/start` | 无 / 外部服务 | 本机所有者 + 直接回环访问；云端禁用；SQL 仍限当前 user_id；写请求校验 X-CSRF-Token |
| POST | `/api/quant-service/stop` | 无 / 外部服务 | 本机所有者 + 直接回环访问；云端禁用；SQL 仍限当前 user_id；写请求校验 X-CSRF-Token |
| GET | `/api/deposits` | `deposit_items`、`deposit_transactions`、`installment_bills`、`installment_plans` | 原请求/响应结构保留；查询/子查询/JOIN/事务强制 user_id；写入自动归当前账号 |
| POST | `/api/deposits` | `deposit_items` | 原请求/响应结构保留；查询/子查询/JOIN/事务强制 user_id；写入自动归当前账号；写请求校验 X-CSRF-Token |
| PUT | `/api/deposits/:id` | `deposit_items` | 原请求/响应结构保留；查询/子查询/JOIN/事务强制 user_id；写入自动归当前账号；写请求校验 X-CSRF-Token |
| DELETE | `/api/deposits/:id` | `deposit_items` | 原请求/响应结构保留；查询/子查询/JOIN/事务强制 user_id；写入自动归当前账号；写请求校验 X-CSRF-Token |
| PUT | `/api/deposits/:id/move` | `deposit_items` | 原请求/响应结构保留；查询/子查询/JOIN/事务强制 user_id；写入自动归当前账号；写请求校验 X-CSRF-Token |
| POST | `/api/deposits/upload-icon` | 无 / 外部服务 | 新增会话鉴权；不读其他用户数据库数据；写请求校验 X-CSRF-Token |
| GET | `/api/deposits/icons` | 无 / 外部服务 | 新增会话鉴权；不读其他用户数据库数据 |
| POST | `/api/deposits/generate-icon` | 无 / 外部服务 | 新增会话鉴权；不读其他用户数据库数据；写请求校验 X-CSRF-Token |
| POST | `/api/deposits/save-icon` | 无 / 外部服务 | 本机所有者 + 直接回环访问；云端禁用；SQL 仍限当前 user_id；写请求校验 X-CSRF-Token |
| GET | `/api/deposits/:id/transactions` | `deposit_transactions` | 原请求/响应结构保留；查询/子查询/JOIN/事务强制 user_id；写入自动归当前账号 |
| POST | `/api/deposits/:id/transactions` | `deposit_items`、`deposit_transactions` | 原请求/响应结构保留；查询/子查询/JOIN/事务强制 user_id；写入自动归当前账号；写请求校验 X-CSRF-Token |
| POST | `/api/deposits/:id/repay` | `deposit_items`、`deposit_transactions` | 原请求/响应结构保留；查询/子查询/JOIN/事务强制 user_id；写入自动归当前账号；写请求校验 X-CSRF-Token |
| GET | `/api/installments/:depositItemId` | `installment_plans` | 原请求/响应结构保留；查询/子查询/JOIN/事务强制 user_id；写入自动归当前账号 |
| POST | `/api/installments` | `deposit_items`、`installment_bills`、`installment_plans` | 原请求/响应结构保留；查询/子查询/JOIN/事务强制 user_id；写入自动归当前账号；写请求校验 X-CSRF-Token |
| PUT | `/api/installments/:id` | `deposit_items`、`installment_bills`、`installment_plans` | 原请求/响应结构保留；查询/子查询/JOIN/事务强制 user_id；写入自动归当前账号；写请求校验 X-CSRF-Token |
| DELETE | `/api/installments/:id` | `installment_bills`、`installment_plans` | 原请求/响应结构保留；查询/子查询/JOIN/事务强制 user_id；写入自动归当前账号；写请求校验 X-CSRF-Token |
| GET | `/api/installments/:planId/bills` | `installment_bills` | 原请求/响应结构保留；查询/子查询/JOIN/事务强制 user_id；写入自动归当前账号 |
| PUT | `/api/installments/bills/:id/pay` | `deposit_items`、`deposit_transactions`、`installment_bills`、`installment_plans` | 原请求/响应结构保留；查询/子查询/JOIN/事务强制 user_id；写入自动归当前账号；写请求校验 X-CSRF-Token |
| DELETE | `/api/wechat/db/clear` | `wechat_events` | 本机所有者 + 直接回环访问；云端禁用；SQL 仍限当前 user_id；写请求校验 X-CSRF-Token |
| GET | `/api/wechat/blacklist` | `wechat_blacklist` | 本机所有者 + 直接回环访问；云端禁用；SQL 仍限当前 user_id |
| POST | `/api/wechat/blacklist` | `wechat_blacklist` | 本机所有者 + 直接回环访问；云端禁用；SQL 仍限当前 user_id；写请求校验 X-CSRF-Token |
| DELETE | `/api/wechat/blacklist/:id` | `wechat_blacklist` | 本机所有者 + 直接回环访问；云端禁用；SQL 仍限当前 user_id；写请求校验 X-CSRF-Token |
| PUT | `/api/wechat/blacklist/:id` | `wechat_blacklist` | 本机所有者 + 直接回环访问；云端禁用；SQL 仍限当前 user_id；写请求校验 X-CSRF-Token |
| GET | `/api/wechat/session-skip-rules` | `wechat_blacklist` | 本机所有者 + 直接回环访问；云端禁用；SQL 仍限当前 user_id |
| GET | `/api/wechat/whitelist` | `wechat_whitelist` | 本机所有者 + 直接回环访问；云端禁用；SQL 仍限当前 user_id |
| POST | `/api/wechat/whitelist` | `wechat_whitelist` | 本机所有者 + 直接回环访问；云端禁用；SQL 仍限当前 user_id；写请求校验 X-CSRF-Token |
| DELETE | `/api/wechat/whitelist/:id` | `wechat_whitelist` | 本机所有者 + 直接回环访问；云端禁用；SQL 仍限当前 user_id；写请求校验 X-CSRF-Token |
| PUT | `/api/wechat/whitelist/:id` | `wechat_whitelist` | 本机所有者 + 直接回环访问；云端禁用；SQL 仍限当前 user_id；写请求校验 X-CSRF-Token |
| POST | `/api/wechat/whitelist/summarize` | `ai_logs`、`ai_usage`、`wechat_category_rules`、`wechat_category_system_rules`、`wechat_events`、`wechat_whitelist` | 本机所有者 + 直接回环访问；云端禁用；SQL 仍限当前 user_id；写请求校验 X-CSRF-Token |
| POST | `/api/wechat/ai/market-analysis` | `ai_logs`、`ai_usage` | 本机所有者 + 直接回环访问；云端禁用；SQL 仍限当前 user_id；写请求校验 X-CSRF-Token |
| GET | `/api/ai/settings` | `ai_settings` | 原请求/响应结构保留；查询/子查询/JOIN/事务强制 user_id；写入自动归当前账号 |
| POST | `/api/ai/test-model` | `ai_logs`、`ai_usage` | 原请求/响应结构保留；查询/子查询/JOIN/事务强制 user_id；写入自动归当前账号；写请求校验 X-CSRF-Token |
| GET | `/api/ai/usage` | `ai_logs` | 原请求/响应结构保留；查询/子查询/JOIN/事务强制 user_id；写入自动归当前账号 |
| GET | `/api/ai/logs` | `ai_logs` | 原请求/响应结构保留；查询/子查询/JOIN/事务强制 user_id；写入自动归当前账号 |
| POST | `/api/ai/logs` | `ai_logs`、`ai_usage` | 原请求/响应结构保留；查询/子查询/JOIN/事务强制 user_id；写入自动归当前账号；写请求校验 X-CSRF-Token |
| POST | `/api/stocks/tx-log` | `tx_logs` | 原请求/响应结构保留；查询/子查询/JOIN/事务强制 user_id；写入自动归当前账号；写请求校验 X-CSRF-Token |
| GET | `/api/stocks/tx-logs` | `tx_logs` | 原请求/响应结构保留；查询/子查询/JOIN/事务强制 user_id；写入自动归当前账号 |
| PUT | `/api/ai/settings` | 无 / 外部服务 | 新增会话鉴权；不读其他用户数据库数据；写请求校验 X-CSRF-Token |
| GET | `/api/ai/providers` | 无 / 外部服务 | 新增会话鉴权；不读其他用户数据库数据 |
| POST | `/api/ai/videos/generate` | 无 / 外部服务 | 新增会话鉴权；不读其他用户数据库数据；写请求校验 X-CSRF-Token |
| GET | `/api/ai/videos/status/:id` | 无 / 外部服务 | 新增会话鉴权；不读其他用户数据库数据 |
| GET | `/api/wool` | `wool_items` | 原请求/响应结构保留；查询/子查询/JOIN/事务强制 user_id；写入自动归当前账号 |
| POST | `/api/wool` | `deposit_items`、`deposit_transactions`、`wool_items` | 原请求/响应结构保留；查询/子查询/JOIN/事务强制 user_id；写入自动归当前账号；写请求校验 X-CSRF-Token |
| GET | `/api/wool/notes` | `wool_notes` | 原请求/响应结构保留；查询/子查询/JOIN/事务强制 user_id；写入自动归当前账号 |
| POST | `/api/wool/notes` | `wool_notes` | 原请求/响应结构保留；查询/子查询/JOIN/事务强制 user_id；写入自动归当前账号；写请求校验 X-CSRF-Token |
| PUT | `/api/wool/notes/:id` | `wool_notes` | 原请求/响应结构保留；查询/子查询/JOIN/事务强制 user_id；写入自动归当前账号；写请求校验 X-CSRF-Token |
| DELETE | `/api/wool/notes/:id` | `wool_notes` | 原请求/响应结构保留；查询/子查询/JOIN/事务强制 user_id；写入自动归当前账号；写请求校验 X-CSRF-Token |
| POST | `/api/wool/notes/organize` | `ai_logs`、`ai_usage` | 原请求/响应结构保留；查询/子查询/JOIN/事务强制 user_id；写入自动归当前账号；写请求校验 X-CSRF-Token |
| GET | `/api/stock/notes` | `stock_notes` | 原请求/响应结构保留；查询/子查询/JOIN/事务强制 user_id；写入自动归当前账号 |
| POST | `/api/stock/notes` | `stock_notes` | 原请求/响应结构保留；查询/子查询/JOIN/事务强制 user_id；写入自动归当前账号；写请求校验 X-CSRF-Token |
| PUT | `/api/stock/notes/:id` | `stock_notes` | 原请求/响应结构保留；查询/子查询/JOIN/事务强制 user_id；写入自动归当前账号；写请求校验 X-CSRF-Token |
| DELETE | `/api/stock/notes/:id` | `stock_notes` | 原请求/响应结构保留；查询/子查询/JOIN/事务强制 user_id；写入自动归当前账号；写请求校验 X-CSRF-Token |
| GET | `/api/stock/watchlist` | `stock_daily_analysis`、`stock_watchlist` | 原请求/响应结构保留；查询/子查询/JOIN/事务强制 user_id；写入自动归当前账号 |
| POST | `/api/stock/watchlist` | `stock_watchlist` | 原请求/响应结构保留；查询/子查询/JOIN/事务强制 user_id；写入自动归当前账号；写请求校验 X-CSRF-Token |
| PUT | `/api/stock/watchlist/:id` | `stock_watchlist` | 原请求/响应结构保留；查询/子查询/JOIN/事务强制 user_id；写入自动归当前账号；写请求校验 X-CSRF-Token |
| DELETE | `/api/stock/watchlist/:id` | `stock_daily_analysis`、`stock_watchlist` | 原请求/响应结构保留；查询/子查询/JOIN/事务强制 user_id；写入自动归当前账号；写请求校验 X-CSRF-Token |
| PUT | `/api/stock/watchlist/:id/analysis` | `stock_daily_analysis`、`stock_watchlist` | 原请求/响应结构保留；查询/子查询/JOIN/事务强制 user_id；写入自动归当前账号；写请求校验 X-CSRF-Token |
| DELETE | `/api/stock/watchlist/:id/analysis/:date` | `stock_daily_analysis` | 原请求/响应结构保留；查询/子查询/JOIN/事务强制 user_id；写入自动归当前账号；写请求校验 X-CSRF-Token |
| POST | `/api/stock/daily-changes` | 无 / 外部服务 | 新增会话鉴权；不读其他用户数据库数据；写请求校验 X-CSRF-Token |
| GET | `/api/stock/ipo-market-value` | `buy_records`、`sell_records`、`stocks` | 原请求/响应结构保留；查询/子查询/JOIN/事务强制 user_id；写入自动归当前账号 |
| GET | `/api/stock/daily-summary` | `stock_daily_summary` | 原请求/响应结构保留；查询/子查询/JOIN/事务强制 user_id；写入自动归当前账号 |
| PUT | `/api/stock/daily-summary` | `stock_daily_summary` | 原请求/响应结构保留；查询/子查询/JOIN/事务强制 user_id；写入自动归当前账号；写请求校验 X-CSRF-Token |
| GET | `/api/tools/categories` | `tools` | 原请求/响应结构保留；查询/子查询/JOIN/事务强制 user_id；写入自动归当前账号 |
| GET | `/api/tools` | `tools` | 原请求/响应结构保留；查询/子查询/JOIN/事务强制 user_id；写入自动归当前账号 |
| POST | `/api/tools` | `tools` | 原请求/响应结构保留；查询/子查询/JOIN/事务强制 user_id；写入自动归当前账号；写请求校验 X-CSRF-Token |
| PUT | `/api/tools/:id` | `tools` | 原请求/响应结构保留；查询/子查询/JOIN/事务强制 user_id；写入自动归当前账号；写请求校验 X-CSRF-Token |
| DELETE | `/api/tools/:id` | `tools` | 原请求/响应结构保留；查询/子查询/JOIN/事务强制 user_id；写入自动归当前账号；写请求校验 X-CSRF-Token |
| POST | `/api/tools/reorder` | `tools` | 原请求/响应结构保留；查询/子查询/JOIN/事务强制 user_id；写入自动归当前账号；写请求校验 X-CSRF-Token |
| PUT | `/api/wool/:id` | `deposit_items`、`deposit_transactions`、`wool_items` | 原请求/响应结构保留；查询/子查询/JOIN/事务强制 user_id；写入自动归当前账号；写请求校验 X-CSRF-Token |
| DELETE | `/api/wool/:id` | `deposit_items`、`deposit_transactions`、`wool_items` | 原请求/响应结构保留；查询/子查询/JOIN/事务强制 user_id；写入自动归当前账号；写请求校验 X-CSRF-Token |
| POST | `/api/wool/upload-image` | 无 / 外部服务 | 新增会话鉴权；不读其他用户数据库数据；写请求校验 X-CSRF-Token |
| POST | `/api/wool/recognize` | `ai_logs`、`ai_usage` | 原请求/响应结构保留；查询/子查询/JOIN/事务强制 user_id；写入自动归当前账号；写请求校验 X-CSRF-Token |
| GET | `/api/wool/calendar` | `wool_daily_amounts`、`wool_items` | 原请求/响应结构保留；查询/子查询/JOIN/事务强制 user_id；写入自动归当前账号 |
| GET | `/api/wool/daily/:date` | `wool_daily_amounts` | 原请求/响应结构保留；查询/子查询/JOIN/事务强制 user_id；写入自动归当前账号 |
| PUT | `/api/wool/daily/:date` | `wool_daily_amounts` | 原请求/响应结构保留；查询/子查询/JOIN/事务强制 user_id；写入自动归当前账号；写请求校验 X-CSRF-Token |
| GET | `/api/plans` | `daily_plans` | 原请求/响应结构保留；查询/子查询/JOIN/事务强制 user_id；写入自动归当前账号 |
| POST | `/api/plans` | `daily_plans` | 原请求/响应结构保留；查询/子查询/JOIN/事务强制 user_id；写入自动归当前账号；写请求校验 X-CSRF-Token |
| PUT | `/api/plans/:id` | `daily_plans` | 原请求/响应结构保留；查询/子查询/JOIN/事务强制 user_id；写入自动归当前账号；写请求校验 X-CSRF-Token |
| DELETE | `/api/plans/:id` | `daily_plans`、`plan_completions` | 原请求/响应结构保留；查询/子查询/JOIN/事务强制 user_id；写入自动归当前账号；写请求校验 X-CSRF-Token |
| GET | `/api/plans/completions/:date` | `plan_completions` | 原请求/响应结构保留；查询/子查询/JOIN/事务强制 user_id；写入自动归当前账号 |
| POST | `/api/plans/:id/toggle` | `plan_completions` | 原请求/响应结构保留；查询/子查询/JOIN/事务强制 user_id；写入自动归当前账号；写请求校验 X-CSRF-Token |
| POST | `/api/plans/reorder` | `daily_plans` | 原请求/响应结构保留；查询/子查询/JOIN/事务强制 user_id；写入自动归当前账号；写请求校验 X-CSRF-Token |
| GET | `/api/notes/:date` | `daily_notes` | 原请求/响应结构保留；查询/子查询/JOIN/事务强制 user_id；写入自动归当前账号 |
| PUT | `/api/notes/:date` | `daily_notes` | 原请求/响应结构保留；查询/子查询/JOIN/事务强制 user_id；写入自动归当前账号；写请求校验 X-CSRF-Token |
| GET | `/api/quiz` | `quiz_questions` | 原请求/响应结构保留；查询/子查询/JOIN/事务强制 user_id；写入自动归当前账号 |
| POST | `/api/quiz/upload-image` | 无 / 外部服务 | 新增会话鉴权；不读其他用户数据库数据；写请求校验 X-CSRF-Token |
| POST | `/api/quiz` | `quiz_questions` | 原请求/响应结构保留；查询/子查询/JOIN/事务强制 user_id；写入自动归当前账号；写请求校验 X-CSRF-Token |
| PUT | `/api/quiz/:id` | `quiz_questions` | 原请求/响应结构保留；查询/子查询/JOIN/事务强制 user_id；写入自动归当前账号；写请求校验 X-CSRF-Token |
| DELETE | `/api/quiz/:id` | `quiz_answers`、`quiz_questions` | 原请求/响应结构保留；查询/子查询/JOIN/事务强制 user_id；写入自动归当前账号；写请求校验 X-CSRF-Token |
| POST | `/api/quiz/answer` | `quiz_answers` | 原请求/响应结构保留；查询/子查询/JOIN/事务强制 user_id；写入自动归当前账号；写请求校验 X-CSRF-Token |
| GET | `/api/quiz/answers/:questionId` | `quiz_answers` | 原请求/响应结构保留；查询/子查询/JOIN/事务强制 user_id；写入自动归当前账号 |
| POST | `/api/quiz/evaluate` | `ai_logs`、`ai_usage`、`quiz_questions` | 原请求/响应结构保留；查询/子查询/JOIN/事务强制 user_id；写入自动归当前账号；写请求校验 X-CSRF-Token |
| POST | `/api/wechat/ai/extract-logic` | `ai_logs`、`ai_usage` | 本机所有者 + 直接回环访问；云端禁用；SQL 仍限当前 user_id；写请求校验 X-CSRF-Token |
| POST | `/api/wechat/logic/train` | `wechat_logic_training` | 本机所有者 + 直接回环访问；云端禁用；SQL 仍限当前 user_id；写请求校验 X-CSRF-Token |
| GET | `/api/wechat/training-data` | `wechat_category_feedback`、`wechat_category_rules`、`wechat_category_system_rules`、`wechat_logic_training`、`wechat_tracking` | 本机所有者 + 直接回环访问；云端禁用；SQL 仍限当前 user_id |
| GET | `/api/heartbeat` | 无 / 外部服务 | 新增会话鉴权；不读其他用户数据库数据 |
| GET | `/api/gold-price` | 无 / 外部服务 | 新增会话鉴权；不读其他用户数据库数据 |
| GET | `/api/stock-price` | 无 / 外部服务 | 新增会话鉴权；不读其他用户数据库数据 |
| GET | `/api/stock/name/:code` | 无 / 外部服务 | 新增会话鉴权；不读其他用户数据库数据 |
| GET | `/api/stock/search` | 无 / 外部服务 | 新增会话鉴权；不读其他用户数据库数据 |
| GET | `/api/wechat/tracking` | `wechat_events`、`wechat_tracking` | 本机所有者 + 直接回环访问；云端禁用；SQL 仍限当前 user_id |
| POST | `/api/wechat/tracking/manual` | `wechat_tracking`、`wechat_tracking_daily` | 本机所有者 + 直接回环访问；云端禁用；SQL 仍限当前 user_id；写请求校验 X-CSRF-Token |
| DELETE | `/api/wechat/tracking/:id` | `wechat_tracking`、`wechat_tracking_daily` | 本机所有者 + 直接回环访问；云端禁用；SQL 仍限当前 user_id；写请求校验 X-CSRF-Token |
| DELETE | `/api/wechat/tracking/delete-by-date-range` | `wechat_tracking`、`wechat_tracking_daily` | 本机所有者 + 直接回环访问；云端禁用；SQL 仍限当前 user_id；写请求校验 X-CSRF-Token |
| PUT | `/api/wechat/tracking/batch-update` | `wechat_tracking` | 本机所有者 + 直接回环访问；云端禁用；SQL 仍限当前 user_id；写请求校验 X-CSRF-Token |
| PUT | `/api/wechat/tracking/:id/lock` | `wechat_tracking`、`wechat_tracking_daily` | 本机所有者 + 直接回环访问；云端禁用；SQL 仍限当前 user_id；写请求校验 X-CSRF-Token |
| PUT | `/api/wechat/tracking/:id/entry-type` | `wechat_tracking`、`wechat_tracking_daily` | 本机所有者 + 直接回环访问；云端禁用；SQL 仍限当前 user_id；写请求校验 X-CSRF-Token |
| GET | `/api/wechat/tracking/:id/daily` | `wechat_tracking`、`wechat_tracking_daily` | 本机所有者 + 直接回环访问；云端禁用；SQL 仍限当前 user_id |
| GET | `/api/wechat/investor-analysis` | `wechat_events`、`wechat_tracking`、`wechat_tracking_daily` | 本机所有者 + 直接回环访问；云端禁用；SQL 仍限当前 user_id |
| POST | `/api/wechat/tracking/:id/refresh` | `wechat_tracking`、`wechat_tracking_daily` | 本机所有者 + 直接回环访问；云端禁用；SQL 仍限当前 user_id；写请求校验 X-CSRF-Token |
| GET | `/api/wechat/status` | 无 / 外部服务 | 本机所有者 + 直接回环访问；云端禁用；SQL 仍限当前 user_id |
| GET | `/api/market/overview` | `ai_settings` | 原请求/响应结构保留；查询/子查询/JOIN/事务强制 user_id；写入自动归当前账号 |
| POST | `/api/wechat/monitor/start` | 无 / 外部服务 | 本机所有者 + 直接回环访问；云端禁用；SQL 仍限当前 user_id；写请求校验 X-CSRF-Token |
| POST | `/api/wechat/monitor/stop` | 无 / 外部服务 | 本机所有者 + 直接回环访问；云端禁用；SQL 仍限当前 user_id；写请求校验 X-CSRF-Token |
| GET | `/api/wechat/events/:id/stocks-usage` | `wechat_events`、`wechat_tracking` | 本机所有者 + 直接回环访问；云端禁用；SQL 仍限当前 user_id |
| POST | `/api/wechat/events/:id/delete` | `wechat_tracking`、`wechat_tracking_daily` | 本机所有者 + 直接回环访问；云端禁用；SQL 仍限当前 user_id；写请求校验 X-CSRF-Token |
| DELETE | `/api/wechat/events/:id` | `wechat_tracking`、`wechat_tracking_daily` | 本机所有者 + 直接回环访问；云端禁用；SQL 仍限当前 user_id；写请求校验 X-CSRF-Token |
| DELETE | `/api/wechat/events` | `wechat_events`、`wechat_tracking`、`wechat_tracking_daily` | 本机所有者 + 直接回环访问；云端禁用；SQL 仍限当前 user_id；写请求校验 X-CSRF-Token |
| POST | `/api/wechat/tracking/refresh-all` | `wechat_tracking`、`wechat_tracking_daily` | 本机所有者 + 直接回环访问；云端禁用；SQL 仍限当前 user_id；写请求校验 X-CSRF-Token |
| GET | `/api/wechat/investor/:sender/hold-days` | `wechat_tracking`、`wechat_tracking_daily` | 本机所有者 + 直接回环访问；云端禁用；SQL 仍限当前 user_id |
| DELETE | `/api/wechat/investor/:sender` | `wechat_events`、`wechat_tracking`、`wechat_tracking_daily` | 本机所有者 + 直接回环访问；云端禁用；SQL 仍限当前 user_id；写请求校验 X-CSRF-Token |
| POST | `/api/wechat/extract` | `extract_learn`、`wechat_category_feedback`、`wechat_category_rules`、`wechat_category_system_rules` | 本机所有者 + 直接回环访问；云端禁用；SQL 仍限当前 user_id；写请求校验 X-CSRF-Token |
| GET | `/api/extract/learn` | `extract_learn` | 本机所有者 + 直接回环访问；云端禁用；SQL 仍限当前 user_id |
| POST | `/api/extract/learn` | `extract_learn` | 本机所有者 + 直接回环访问；云端禁用；SQL 仍限当前 user_id；写请求校验 X-CSRF-Token |
| POST | `/api/wechat/extract-image` | `ai_logs`、`ai_usage`、`extract_learn`、`wechat_category_feedback`、`wechat_category_rules`、`wechat_category_system_rules` | 本机所有者 + 直接回环访问；云端禁用；SQL 仍限当前 user_id；写请求校验 X-CSRF-Token |
| POST | `/api/board/upload-image` | 无 / 外部服务 | 新增会话鉴权；不读其他用户数据库数据；写请求校验 X-CSRF-Token |
| POST | `/api/wechat/extract/save` | `ai_logs`、`ai_usage`、`extract_learn`、`wechat_category_feedback`、`wechat_category_rules`、`wechat_category_system_rules`、`wechat_events`、`wechat_tracking`、`wechat_tracking_daily` | 本机所有者 + 直接回环访问；云端禁用；SQL 仍限当前 user_id；写请求校验 X-CSRF-Token |
| PUT | `/api/wechat/events/:id/category` | `ai_settings`、`wechat_category_feedback`、`wechat_category_rules`、`wechat_events`、`wechat_tracking`、`wechat_tracking_daily` | 本机所有者 + 直接回环访问；云端禁用；SQL 仍限当前 user_id；写请求校验 X-CSRF-Token |
| PUT | `/api/wechat/events/:id/text` | `ai_logs`、`ai_settings`、`ai_usage`、`wechat_category_rules`、`wechat_category_system_rules`、`wechat_events`、`wechat_tracking` | 本机所有者 + 直接回环访问；云端禁用；SQL 仍限当前 user_id；写请求校验 X-CSRF-Token |
| PUT | `/api/wechat/events/:id/stock-logic` | `wechat_events` | 本机所有者 + 直接回环访问；云端禁用；SQL 仍限当前 user_id；写请求校验 X-CSRF-Token |
| PUT | `/api/wechat/events/:id/stocks` | `wechat_events`、`wechat_tracking`、`wechat_tracking_daily` | 本机所有者 + 直接回环访问；云端禁用；SQL 仍限当前 user_id；写请求校验 X-CSRF-Token |
| POST | `/api/wechat/category-feedback` | `ai_settings`、`wechat_category_feedback`、`wechat_category_rules` | 本机所有者 + 直接回环访问；云端禁用；SQL 仍限当前 user_id；写请求校验 X-CSRF-Token |
| GET | `/api/wechat/category-rules` | `wechat_category_rules`、`wechat_category_system_rules` | 本机所有者 + 直接回环访问；云端禁用；SQL 仍限当前 user_id |
| PUT | `/api/wechat/category-rules/system/:id` | `wechat_category_system_rules` | 本机所有者 + 直接回环访问；云端禁用；SQL 仍限当前 user_id；写请求校验 X-CSRF-Token |
| DELETE | `/api/wechat/category-rules/learned/:id` | `wechat_category_rules` | 本机所有者 + 直接回环访问；云端禁用；SQL 仍限当前 user_id；写请求校验 X-CSRF-Token |
| POST | `/api/wechat/category-rules/system/reset` | `wechat_category_system_rules` | 本机所有者 + 直接回环访问；云端禁用；SQL 仍限当前 user_id；写请求校验 X-CSRF-Token |
| POST | `/api/wechat/category-rules/learned` | `wechat_category_rules` | 本机所有者 + 直接回环访问；云端禁用；SQL 仍限当前 user_id；写请求校验 X-CSRF-Token |
| POST | `/api/wechat/reclassify` | `extract_learn`、`wechat_category_feedback`、`wechat_category_rules`、`wechat_category_system_rules`、`wechat_events` | 本机所有者 + 直接回环访问；云端禁用；SQL 仍限当前 user_id；写请求校验 X-CSRF-Token |

## 特殊契约

- `GET /api/ai/settings`：只返回本人设置，所有 `_api_key` 和 `alapi_token` 只返回 `<字段>_configured`。不返回明文或密文。
- `PUT /api/ai/settings`：白名单字段；密钥非空字符串替换并加密，空字符串保持，`null` 删除。不接受用户提供的 `user_id`。
- `POST /api/ai/test-model`：可先保存当前输入的 GLM/Agnes Key，再调用本人 Key；无 Key 不回退平台环境变量。
- `GET /api/ai/providers`：官网申请入口及用户付费归属。不可传任意提供商 API URL。
- 上传相关接口：鉴权/CSRF 在 multer 前执行；上传目录按用户隔离，返回 `uploads/users/<userId>/<分类>/<文件>`。
- `GET /uploads/users/:userId/*`：使用登录 Cookie 验证文件归属，跨用户返回 404，禁止公共缓存；旧公共 `/uploads/<分类>` 入口关闭。
- 原业务接口中的跨账号详情查询返回 404/空集合；部分历史 UPDATE/DELETE 返回 ok 但影响行数为零，不能改动他人的数据。
- 微信及学习规则：Phase 1 不开放给普通用户，避免进程内监控缓存泄露；手工输入股票仍可走普通股票接口。
- 共享量化 Python 服务：Phase 1 不开放给普通用户，避免共享任务/文件/进程密钥；Phase 2 再做独立任务隔离。
- 文章抓取与远程图标保存：因为旧实现支持任意 URL，暂仅本机所有者可用，生产环境禁用；开放前须完成 SSRF 防护。
