# Phase 1：账号、多租户与用户自带 Key

## 1. 已确定的边界

- 开放注册，普通用户只能访问自己的资产、笔记、练题、AI 内容、调用日志和设置。
- 用户自行在提供商官网申请 Token 并支付调用费用，平台不代付、不共享环境变量 Key。
- 不重写现有 Express/Vue 业务，集中收口鉴权与数据库边界，避免数百条 SQL 漏加 `user_id`。
- 微信提取、监控、进程内学习缓存，以及尚未隔离的 Python 量化服务，仅限本机所有者；`NODE_ENV=production` 强制关闭这些接口。
- Phase 1 完成开发地基，不等于已完成公网发布。对象存储、量化任务队列、邮件验证/找回密码、账号注销/导出、正式备份运维仍需后续阶段。

## 2. 文件与执行顺序

| 文件 | 职责 |
| --- | --- |
| `backend/auth.js` | 注册、登录、退出、HttpOnly 服务端会话、CSRF、来源限制、登录限流、本机能力门禁 |
| `backend/context.js` | AsyncLocalStorage 绑定当前账号，缺少账号上下文立即失败 |
| `backend/tenant-db.js` | SQL AST 隔离、子查询/JOIN/UNION、事务连接、关联记录归属校验 |
| `backend/secrets.js` | AES-256-GCM，密钥绑定用户及设置字段，拒绝明文回退 |
| `backend/ai-settings.js` | 本人 BYOK 设置、字段白名单、官网目录 |
| `backend/uploads.js` | 私有用户目录、路径穿越和跨用户文件检查 |
| `scripts/configure-phase1.js` | 初始化本机环境和随机所有者密码，不修改数据库 |
| `scripts/migrate-phase1.js` | 默认只预检；显式执行才备份、归属回填、索引迁移、密钥加密 |
| `frontend/src/AuthGate.vue` | 登录/注册页，验证会话后才加载业务模块，避免未登录请求 |
| `frontend/src/auth.js` | axios/fetch Cookie/CSRF、退出刷新、本地缓存按账号命名空间 |
| `docs/phase1-api-inventory.md` | 每个实际接口的权限、表及改造方式 |

请求链路：来源检查 → 服务端会话查询 → 写操作 CSRF → 本机能力门禁（如需要）→ 当前账号上下文 → SQL 解析/关联归属检查 → 原业务处理器。

## 3. 账号接口契约

### 注册 / 登录

`POST /api/auth/register`、`POST /api/auth/login`：

```json
{"email":"you@example.com","password":"a-long-private-password"}
```

成功返回：

```json
{"user":{"id":2,"email":"you@example.com","role":"user","capabilities":{"localFeatures":false}},"csrfToken":"..."}
```

浏览器收到 `stock_session` HttpOnly Cookie。服务端仅保存会话 Token 的 SHA-256 哈希；7 天到期，退出立即撤销。客户端不把登录 Token 放到 localStorage。注册只创建 `user`，不能通过请求指定 owner/user_id。密码使用 bcrypt 12 轮；注册至少 12 字符、不超过 72 字节。

`GET /api/auth/me` 恢复当前会话；`POST /api/auth/logout` 必须带 `X-CSRF-Token`。

设置面板默认显示「账号安全」，支持修改邮箱账号、修改密码及退出登录。

`POST /api/auth/account` 请求：`{"email":"new@example.com","currentPassword":"当前密码"}`。

`POST /api/auth/password` 请求：`{"currentPassword":"当前密码","newPassword":"至少12字符的新密码"}`。

两者均要求当前会话、允许的 Origin 和 `X-CSRF-Token`。成功返回与登录相同的用户和新 CSRF Token，并设置新 Cookie；同账号所有旧会话撤销。修改账号不改变用户 ID、角色或数据归属。密码错误返回 401、邮箱冲突返回 409、格式错误返回 400、CSRF 缺失返回 403。账号更新和会话轮换处于同一事务，失败不改变账号。请求中的 `user_id`/`role` 不受理。

原业务 API 保留原 URL 和 DTO。所有 `/api`、`/quant`、`/uploads` 除显式公开账号接口外，统一鉴权。没有会话为 401，CSRF/本机门禁失败为 403。未知 API 返回 404。移除原来的仓库根目录静态服务，防止下载 `.env`、源码及 Git 文件。

## 4. 35 张表与 SQL 隔离方案

迁移脚本中的 `BUSINESS_TABLES` 为明确允许名单；账号表、会话表、迁移记录不允许普通业务 SQL 访问。

每张业务表：

```sql
ALTER TABLE <table> ADD COLUMN user_id INT UNSIGNED NULL;
UPDATE <table> SET user_id = <owner_id> WHERE user_id IS NULL;
ALTER TABLE <table> MODIFY user_id INT UNSIGNED NOT NULL;
ALTER TABLE <table> ADD INDEX idx_tenant (user_id);
```

旧主键和所有 UNIQUE 索引均追加 `user_id`。例如：

```sql
-- 固定日期 ID 在不同用户下不能碰撞
PRIMARY KEY (id, user_id)
-- 本人设置
PRIMARY KEY (setting_key, user_id)
-- 本人的每天模型调用数
UNIQUE KEY uk_date_model (date, model, user_id)
-- 本人的盘后总结
UNIQUE KEY uk_summary_date (date, user_id)
```

自增 `id` 保持在主键第一列，满足 MySQL 自增索引要求。原 buy_records / sell_records 外键改为 `(stock_id, user_id) → stocks(id, user_id)`，保留原 DELETE/UPDATE 规则。其他业务关联在数据库调用前检查父记录属于当前用户。

所有普通 `pool.query/execute` 与 `getConnection()` 获得的事务连接均走同一隔离层：

```sql
-- 原 SQL
SELECT * FROM stocks WHERE id = ?;
-- 实际发送
SELECT * FROM stocks WHERE (id = ?) AND stocks.user_id = 2;

INSERT INTO ai_settings (setting_key, setting_value) VALUES (?, ?);
-- 实际发送
INSERT INTO ai_settings (setting_key, setting_value, user_id) VALUES (?, ?, 2);
```

LEFT JOIN 的用户限制加到 ON，主表加到 WHERE；嵌套查询和 UNION 的每个查询都处理。SQL 参数顺序不改变；禁止客户端控制 `user_id`、禁止跨库/非业务表、禁止多语句和请求期间 DDL，解析不支持则失败关闭。启动时的旧结构迁移仅在明确的内部 `schema` 上下文允许 DDL。后台维护只在所有者上下文处理他的数据，不再全库扫描所有用户。

这不是数据库 RLS：数据库应用账号仍能访问同一数据库，隔离依赖应用边界。新增代码不能绕过 `getPool()` 使用裸连接；只有账号管理、迁移及启动校验可用 `getRawPool()`。新增表必须同时更新允许名单、迁移及测试。

## 5. BYOK：谁付费、如何存、怎样调用

- GLM：`glm_api_key` → 智谱官网 `open.bigmodel.cn`；固定官方 API 路径。
- Agnes：`agnes_api_key` → `platform.agnes-ai.com`；对接官方 `apihub.agnes-ai.com/v1/chat/completions`，保留旧模型选项，新默认为 `agnes-2.5-flash`。
- ALAPI：`alapi_token` → `www.alapi.cn`；只用于该账号的付费行情源，黄金缓存也按账号隔离。
- 用户只填写官网密钥并选择模型，不需要配置自定义服务器地址。是否开通模型/是否有额度由提供商决定。
- AI 文本/视觉/图像/视频不再回退 `GLM_API_KEY`、`AGNES_API_KEY`、`ALAPI_TOKEN` 环境变量。缺少本人 Key 时提示配置，不调用平台账单。
- 旧数据库中已有的 Key 只迁给原所有者并加密；`.env` 中的老 Key 不自动复制，所有者需要在设置页面自行填写。
- `GET /api/ai/settings` 只返回 Key 的 configured 布尔状态。`PUT` 中非空字符串替换，空字符串保持，null 清除。输入完成测试或保存后应清空表单密码框。
- 密钥用 AES-256-GCM 加密，AAD 为 `user_id:setting_key`；拿其他用户密文替换也无法解密。加密主密钥只在环境变量/生产密钥管理器，不能丢失，丢失后需所有用户重新配置。
- 用户付 AI 费不代表托管零成本：数据库、存储、出口流量及计算资源仍由部署方承担。

官网校验记录（2026-10-11）：智谱官网文档；Agnes 官方 `agnes-ai.com/en/docs/overview` 与 `agnes-ai.com/en/docs/quickstart` 明确列出 Key 申请、Bearer 认证、apihub 接口及 agnes-2.5-flash 示例；ALAPI 官网。没有执行真实付费模型请求，防止消耗用户额度。

## 6. 文件与前端状态

- 上传写入 `uploads/users/<user_id>/<category>/`。下载必须使用本人会话，不能直接通过公共 URL 获取他人的图片/视频。
- 旧文件复制到所有者目录，原目录保留作回滚备用。历史 DB 路径不批量破坏性替换；返回 DTO 时兼容映射旧 `uploads/<category>/...` 到本人命名空间，读取时验证归属。
- 关闭跨账号公共缓存；文件响应增加 nosniff/sandbox，限制上传内容在浏览器中执行。
- localStorage 名称改为 `stock:user:<id>:<旧key>`；只有所有者能首次继承原本机旧缓存。普通用户不能读到旧资产草稿或 AI 历史。
- 退出刷新页面，销毁业务模块和进程内前端状态；再次登录时只挂载新用户业务页。
- 现在仍为本地文件系统，不是对象存储。多实例/容器重启持久化应在 Phase 3 解决，不能据此直接横向扩容。

## 7. 本机启用步骤与回滚

本次已在 `.env` 配置本机数据库参数、随机加密主密钥及所有者账户参数；生成的登录信息在 `.launcher/phase1-credentials.json`，已 gitignore。没有把密码写入仓库文档。

### 本次实际执行结果（2026-10-11）

- 已停止原项目并完成现用 `stock_calculator` 数据库迁移，无需再次手工迁移即可使用新版本。
- 与迁移前备份逐表核对：35 张业务表、26,262 条原记录全部保留且归所有者；41 个旧文件与私有目录复制件 SHA-256 一致。
- 迁移前完整备份：`.launcher/phase1-backups/phase1-1791689692317.sql`。后续同目录其他备份为中途/已迁移状态，回滚须使用这份迁移前备份。
- 首次文件复制遇到 Windows 原生复制异常，已改为流式复制后幂等重跑并完成；迁移成功标记及复合外键已校验。
- 单元测试、临时库双用户集成、构建、真实浏览器所有者登录/业务页挂载/鉴权 API/退出、原启动脚本均通过；真实付费模型调用未执行。
- 本次调试启动的前后端已关闭。你直接运行原来的「启动项目.bat」即可，用凭据文件中的所有者账号登录。

**现用旧服务如果还在运行，不要并发改表。** 先关闭旧服务（你原来的停止脚本/终端），然后在项目根目录执行：

```powershell
npm run migrate:phase1
npm run migrate:phase1 -- --apply
npm start
```

迁移默认只预检。`--apply` 会检查本机项目端口，服务未停则拒绝；对云端/其他机器仍需由运维停所有写入实例。每次执行先备份 DDL+数据到 `.launcher/phase1-backups/phase1-*.sql`，获取数据库命名锁，保存外键迁移计划；逐表幂等处理，最后记录成功。数据库 DDL 会隐式提交，不能依靠一个 SQL 事务回滚整个改造，发生中断应停服后重新执行，或从迁移前备份恢复。

备份包含旧明文密钥及私人资产，严禁上传仓库/发送他人；Windows 请为备份目录和 `.env` 设置只允许账户访问的 ACL。POSIX mode 不等于 Windows ACL。

迁移完成后使用凭据文件中的所有者账号登录；普通用户可注册。已完成迁移不能直接重新启动旧版本，因为旧 SQL 不带 user_id；回滚需停服 → 将备份恢复到独立恢复库并确认数据 → 改回旧版代码与 DB 配置。可在 MySQL 客户端用 `SOURCE C:/absolute/path/phase1-before.sql;` 恢复到**独立数据库**，确认后再切库。不要边服务边覆盖。

首次在另一台本机配置：先提供 `DB_USER` 和 `DB_PASSWORD` 环境变量，执行 `npm run configure:phase1`；或按 `.env.example` 手动配置。脚本预检要求旧版 35 张业务表存在；本项目原始 stocks/buy_records/sell_records 初始化脚本缺失，因此不假装支持从完全空库一键初始化。生产数据库需从旧库备份恢复/提供基础结构再迁移。

迁移后可从 `.env` 移除 `MIGRATION_OWNER_PASSWORD`；启动只依赖数据库账号和加密主密钥。保留主密钥安全备份。不要重复生成/轮换密钥后直接启动，需先重加密现有 Key。

## 8. 验证与公开注册前条件

```powershell
npm run test:phase1
npm run test:phase1:integration
npm --prefix frontend run build
npm run docs:phase1
```

集成验证创建临时数据库，仅复制现用库结构（已迁移库会在临时库还原旧租户字段/索引），填入合成数据；执行两遍迁移，启动独立随机端口服务，验证双用户读写/唯一日期 ID/关联记录/密钥/上传/登录退出/CSRF，结束后关闭测试服务并删除测试库。验证脚本不会修改现用库或关闭用户原来运行的进程。

尚未声称每个接口都做了完整业务 E2E：静态 SQL 全覆盖解析测试及核心账户/板块跨租户验证通过；复杂量化、微信、付费模型调用没有自动跑真实外部业务。

正式公开前至少还需要：

1. HTTPS、`NODE_ENV=production`、`COOKIE_SECURE=true`、`ENABLE_LOCAL_FEATURES=false`、明确 ALLOWED_ORIGINS；生产不得使用 root DB 账号。
2. 前端和 API 走同源 `/api`、`/uploads` 反向代理（Vercel 前端可配对应 rewrites）；当前 Cookie 是 SameSite=Lax，不支持把前后端任意拆到两个跨站域名后直接 fetch。
3. 持久化/备份与恢复演练，限制每用户计算/上传资源；多进程登录限流需 Redis/网关，不可仅依赖当前进程 Map。
4. 邮箱验证、重置密码、隐私说明及用户数据导出/删除流程；账号身份邮箱当前未验证，不能对外声称已验证身份。
5. 量化 Phase 2、对象存储 Phase 3；任意 URL 抓取先完善 SSRF 防护再开放。本机门禁同时检查直接回环、Host、转发头，生产强制禁用，避免反向代理伪装成本机。
