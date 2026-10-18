# 方案 B：Vercel + Railway + TiDB

## 当前状态（2026-10-11）

- 本机已经完成 Phase 1，38 张表包括 35 张业务表和账号/会话/迁移记录表；无需再次把本机恢复为旧版再迁移。
- TiDB 的 TLS 连接和只读预检成功：目标 stock_calculator 为空，源快照 26,264 行，其中业务数据 26,262 行；两个非空加密 Key 验证成功。
- 尚未执行云端写入，尚未创建后端部署。前端已发布到 asset-tracker-ai.vercel.app，Vercel 状态 READY；缺少 Railway 授权和后端公网域名，因此还不是完整可登录的应用。
- 云连接信息和 Vercel Token 放在被 Git 忽略的 `.env.cloud.local`，不修改本机 `.env`，不写入部署配置或源码。

## 1. 导入已经迁移的数据库

预检：

```powershell
npm run import:cloud
```

明确确认正式写入后：

```powershell
npm run import:cloud -- --apply
```

脚本执行顺序：

1. 校验源库和目标库不同、目标 TLS 开启、主加密密钥相同；拒绝非空目标库。
2. 源库只读一致性快照；检查 38 张表、Phase 1 完成标记、有效 owner、所有业务主键/唯一索引含 user_id、数据有主、目标支持原排序规则。
3. 检查已有 Key 能解密，不输出 Key；保留账号 ID、密码哈希和加密值。不复制本机登录会话。
4. 正式执行时取得目标命名锁，在 `.launcher/phase1-backups/cloud-source-*.json` 保存敏感源快照，再创建所有表；外键延迟添加。
5. 分批导入数据，恢复复合外键，逐表比较行数及规范化 SHA-256；最后在事务中写入迁移完成标记。
6. 关闭连接、释放锁；本机只读取，不修改。云端登录仍使用原 owner 邮箱/密码，但要重新登录。

默认预检不执行任何目标 DDL/DML。`--apply` 尚未在真实 TiDB 执行，因此预检通过不代表所有 CREATE/INSERT/ALTER 已在云端验证。DDL 不能整体回滚；失败会留下部分目标表，脚本拒绝盲目重跑，不会自动 DROP。人工核对后，在明确授权下清理专用空目标库再导入。不要在导入期间启动云端后端、执行其他迁移或改动本机结构。

正式导入前暂停本机业务写入，避免快照之后新增的数据没有上云；上云后本机与云端是独立库，不会自动双向同步。

源快照含私人数据及密码哈希，不能提交/发送给其他人。数据库导入不包含上传文件；需要另行把 `uploads/users/` 安全复制到后端持久化存储。

## 2. Railway 后端

从 GitHub 仓库根目录创建服务，使用根目录 `Dockerfile` 和 `railway.json`。启动命令由镜像提供，健康检查 `/healthz`；平台注入 PORT，不要把本机 .env 上传到镜像。

配置变量：

| 变量 | 设置 |
| --- | --- |
| NODE_ENV | production |
| DB_HOST / DB_PORT / DB_USER / DB_PASSWORD / DB_NAME | 云库信息，TLS 实际连接已预检 |
| DB_SSL | true |
| KEY_ENCRYPTION_KEY | 与本机完全相同，不能重新生成 |
| COOKIE_SECURE | true |
| REGISTRATION_OPEN | true（验收完成前建议先 false） |
| ALLOWED_ORIGINS | 精确填写最终 Vercel HTTPS origin，不加末尾斜杠；预览域名需单独允许 |
| ENABLE_LOCAL_FEATURES | false |
| BACKGROUND_JOBS_ENABLED | false |
| UPLOAD_ROOT | /app/uploads |

镜像采用白名单 COPY，不包含环境文件、Token、本机备份、上传文件或量化环境。业务进程以 node 用户运行（UID/GID 1000），持久化卷挂载 `/app/uploads` 时必须确保该用户可写；否则上传会失败。没有卷时不能把容器本地上传称为持久化。卷不会自动把本机旧图片复制上云。

后端起不来时查看 Railway 部署日志；不要把含秘密的全部变量截图公开发出。容器配置仍需在 Railway 实际构建/挂卷验收。

## 3. Vercel 前端与同源代理

取得真实后端 HTTPS 域名后执行：

```powershell
node scripts/configure-vercel.js https://真实后端域名
```

此命令生成 `frontend/vercel.json`：`/api/*`、`/uploads/*`、`/healthz` 代理至后端，其他前端路由回退 index.html；API/私有上传禁止缓存。不允许占位域名、HTTP、凭据或 IP。

Vercel 项目 Root Directory 选 frontend，Build 为 npm run build，输出 dist。浏览器请求始终保持相对路径，不配置跨站 API URL，不把 Cookie 改成不安全配置。上线后回填 Railway 的 ALLOWED_ORIGINS 并重启。未拿到后端域名前不生成假地址配置、不发布声称可登录的站点。

### 已发布的前端预览版本

本轮通过 Vercel REST 直接上传已构建的 frontend/dist，不依赖尚未提交的 Git 改动；当前项目采用预构建产物而不是 GitHub 自动构建，Root Directory 为空。项目名称 asset-tracker-ai，公开入口 asset-tracker-ai.vercel.app。部署状态和项目 ID 存在被忽略的 `.launcher/phase1-verify-vercel/deployment.json`。

这个版本保留真实前端，但 `/api/*`、`/uploads/*` 和 `/healthz` 明确返回 503 与 BACKEND_NOT_CONFIGURED，不伪造登录成功、不把 API 错误回退成 HTML、不访问本机数据库。没有上传 `.env`、数据库备份、原始源码目录或用户文件。

已通过 Vercel 云端构建环境对公开入口进行核验：六个静态文件 HTTP 200 且 SHA-256 与本次产物一致；账号、股票和健康接口均返回预期 503。构建日志保存在被忽略的 `.launcher/phase1-verify-vercel/build-events.json`。本机直接访问 vercel.app 超时，且 DNS 返回异常地址，故不宣称本机已完成公网页面浏览器验收。

重新发布未接后端的版本：

```powershell
npm --prefix frontend run build
node scripts/deploy-vercel-frontend.js --pending-backend
```

接入真实后端后发布：

```powershell
npm --prefix frontend run build
node scripts/deploy-vercel-frontend.js https://真实后端域名
```

后者移除待配置网关，采用同源外部代理；必须先完成后端部署、云库导入和 ALLOWED_ORIGINS 配置，再做真实登录/双租户验收。脚本仅从忽略的环境文件读取部署授权，不把 Token 上传到网页。

前文「Vercel 不能运行 Express」并非准确的平台限制；官网目前支持 Express 作为 Vercel Function。这里继续沿用已选的方案 B，不能把常驻任务、可写文件系统和函数运行时等价看待。若改成前后端都在 Vercel，需要另行适配启动过程、文件持久化与函数时限，而非直接换一个启动命令。

Vercel Token 仅用于部署授权，不是网站登录密码；部署完成后轮换已在聊天/截图中暴露的 Token 和云库密码，并更新部署变量。本机 owner 初始凭据在被忽略的 `.launcher/phase1-credentials.json`；如果已在设置中修改，文件不代表新密码，数据库只保存 bcrypt 哈希。

## 4. 验收和限制

- npm run test:phase1；npm run test:phase1:integration；npm run test:cloud；npm --prefix frontend run build。
- 集成验收使用临时数据库和合成账号，不修改真实 owner；验证改邮箱/密码、重复邮箱回滚、错误密码、CSRF、会话撤销、双租户隔离。
- 云端经 Vercel 域名验收注册 A/B、登录、修改账号/密码、退出、私有图片、跨账号不可见；未登录 /api/stocks 应 401。
- 查看 Vercel 响应 Set-Cookie 和后续 Cookie 是否保持同源；健康检查成功不等于上述端到端验收成功。
- 微信和本机量化在 production 禁用。长请求/大文件还需遵守实际平台限制；Phase 1 不含邮件验证、找回密码、备份自动化和对象存储。
- `.github/workflows/phase1-ci.yml` 验证单元测试和前端构建，不连接私人本机库或云库，也不会自动上线。
- 未经用户明确要求不提交/推送本轮改动；GitHub 部署前必须单独确认所需文件已提交，勿包含无关工作文件。
- 本轮账号集成验收和真实浏览器操作均已通过，包含移动端设置布局；本轮启动的临时浏览器、前后端和测试库已关闭/删除。
- 本机 Docker 引擎未运行，未验证镜像实际构建；上线时仍需检查镜像、卷权限和同源 Cookie。IP 限流在多层代理后的实际行为也要验收，不盲目启用 trust proxy=true。
