# 股票投研与止盈计算器（Asset Tracker AI）

面向个人投资者的一体化 A 股投研辅助系统，集行情看板、止盈计算、AI 推荐、消息监控与分析面板于一体。项目名称/仓库代号：**asset-tracker-ai**。

## 功能特性

- **行情看板**：股票列表、涨幅统计、昨日涨停表现、大小盘指数等实时指标展示。
- **止盈计算器**：基于 T+1 规则计算有效止盈（D0 计入持仓日，D0 涨幅 >5% 时按 D1 开盘判断有效止盈）与持有天数统计；有效止盈阈值可配置。
- **AI 推荐**：自动从推送消息中提取股票推荐逻辑，支持自选股绑定与推荐收益追踪，用有效止盈胜率评估投资人表现。
- **微信消息监控**：监听微信推送中的股票/推荐信息，自动分类、去重并入库（含 Python 服务端监控）。
- **可视化分析**：前端提供股票卡片、时间线、投资人分析面板、无限画布（节点连线/便签/图片）等多种视图。

## 技术栈

- **后端**：Node.js / Express / MySQL2 / Multer / Sharp（Node 服务 `server.js` + 微信提取模块）+ 独立 Java 服务模块
- **前端**：Vue 3 / Vite / Tailwind CSS / Vue Flow / lucide-vue-next / axios（`frontend/`）
- **辅助**：Python（微信监控）、数据上传与图片处理

## 快速开始

```bash
# 1. 安装后端依赖
npm install

# 2. 配置环境变量（数据库、监听端口等）
cp .env.example .env   # 若项目内提供示例；实际以你现有 .env 为准

# 3. 启动后端
npm start              # 或 npm run dev（nodemon）

# 4. 启动前端
cd frontend && npm install && npm run dev
```

> 数据库初始化脚本见根目录说明，端口默认 3000，可在 `.env` 中调整。

## 目录结构

```
├─ server.js            # Node 后端入口（Express + MySQL）
├─ wechat-extractor.js  # 微信消息提取/分类模块
├─ wechat_monitor.py    # Python 微信监控服务
├─ frontend/            # Vue3 前端
└─ java/                # Java 服务模块
```

## 说明

本项目用于个人投研与学习实践。涉及行情与推送数据仅供研究参考，不构成任何投资建议。