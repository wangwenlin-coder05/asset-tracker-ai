# 📈 Asset Tracker AI · 股票投研辅助系统

<p align="center">
  <a href="https://github.com/wangwenlin333/asset-tracker-ai">
    <img alt="GitHub Stars" src="https://img.shields.io/github/stars/wangwenlin333/asset-tracker-ai?style=for-the-badge&logo=github&logoColor=white&color=181717">
  </a>
  <a href="https://github.com/wangwenlin333/asset-tracker-ai">
    <img alt="GitHub Forks" src="https://img.shields.io/github/forks/wangwenlin333/asset-tracker-ai?style=for-the-badge&logo=github&logoColor=white&color=394867">
  </a>
  <a href="https://github.com/wangwenlin333/asset-tracker-ai/watchers">
    <img alt="GitHub Watchers" src="https://img.shields.io/github/watchers/wangwenlin333/asset-tracker-ai?style=for-the-badge&logo=github&logoColor=white&color=4078c0">
  </a>
  <a href="https://github.com/wangwenlin333/asset-tracker-ai/releases">
    <img alt="GitHub Release" src="https://img.shields.io/github/v/release/asset-tracker-ai?style=for-the-badge&logo=github&logoColor=white&color=0a66c2">
  </a>
  <a href="https://github.com/wangwenlin333/asset-tracker-ai/issues">
    <img alt="Issues" src="https://img.shields.io/github/issues/wangwenlin333/asset-tracker-ai?style=for-the-badge&logo=github&logoColor=white&color=d73a4a">
  </a>
</p>

<p align="center">
  <img alt="Vue" src="https://img.shields.io/badge/Vue-3-42b883?style=flat-square&logo=vuedotjs&logoColor=white">
  <img alt="Tailwind" src="https://img.shields.io/badge/Tailwind_CSS-3-06B6D4?style=flat-square&logo=tailwindcss&logoColor=white">
  <img alt="Node.js" src="https://img.shields.io/badge/Node.js-20-339933?style=flat-square&logo=nodejs&logoColor=white">
  <img alt="Express" src="https://img.shields.io/badge/Express-4-000000?style=flat-square&logo=express">
  <img alt="MySQL" src="https://img.shields.io/badge/MySQL-8-4479A1?style=flat-square&logo=mysql&logoColor=white">
  <img alt="License" src="https://img.shields.io/github/license/wangwenlin333/asset-tracker-ai?style=flat-square">
</p>

> 面向个人 A 股投资者的**投研决策引擎**：行情看板 · AI 大盘情绪分析 · 智能推荐自动提取 · **T+1 有效止盈风控模型** · 无限画布复盘，让每一次交易决策都有数据与逻辑支撑。

---

## 📐 系统架构

```mermaid
flowchart TB
    subgraph Client["📱 前端 (Vue3 + Vite)"]
        D["行情看板"]
        P["投资人分析面板"]
        C["无限画布笔记"]
        M["实时涨幅监控"]
    end

    subgraph Backend["⚙️ Node.js / Express 后端"]
        API["REST API 服务"]
        WX["微信消息提取模块"]
        AI["AI 逻辑抽取"]
    end

    subgraph Monitor["🐍 Python 独立服务"]
        WM["微信监控进程"]
    end

    subgraph Backend["⚙️ Node.js / Express 后端"]
        API["REST API 服务"]
        WX["微信消息提取模块"]
        AI["AI 逻辑抽取"]
    end
    subgraph Store["🗄️ 存储"]
        DB[(MySQL)]
        LS["localStorage\ndataURL 图片"]
    end
    subgraph Ext["🌐 外部"]
        DATA["行情数据源"]
    end

    D & M --> API
    P --> API
    C --> LS
    WM --> WX --> AI --> DB
    API --> DB
    API --> DATA
    DB --> D
    DB --> P
```

---

## 🧮 核心算法：T+1 有效止盈模型

> 避免「同一日冲高回落」的虚假止盈，只把**真正次日盘中仍能守住涨幅**的推荐算作有效业绩。

```mermaid
flowchart LR
    A["D0 推荐日<br/>涨幅 > 阈值(默认5%)"] --> B{"D1 次日开盘"
    B -->|"开盘仍 ≥ 阈值"| C["✅ 有效止盈"]
    B -->|"开盘 < 阈值"| D["❌ 浮盈（无效）"]
    A2["涨幅 ≤ 阈值"] --> D
```

阈值可配置（5% / 10% / 20%），支持按推荐源评估「有效止盈胜率」排名投资人表现。

---

## ✨ 功能全景

### 行情与分析
- **实时行情看板**：涨幅统计、昨日涨停表现、大小盘指数等核心指标可视化。
- **投资人分析面板**：按「有效止盈胜率」评估推荐质量，区分**有效止盈 / 锁定**状态。

### AI 辅助
- **AI 推荐自动提取**：监控微信推送消息 → 自动分类、去重、入库，用 AI 抽取推荐逻辑并绑定股票。
- **AI 投资人画像**：跟踪各推荐源收益表现，生成可视化分析。
- **微信监控服务**（独立 Python 进程）：监听推送，对接后端 API。

### 无限画布笔记
- 基于 Vue Flow 的**无限画布**：节点连线、便签、图片上传（本地 dataURL）、触摸交互、撤销重做。
- 平板友好：双指缩放、双击编辑文字、底部固定编辑栏（字号 / 加粗 / 斜体 / 颜色）。
- 数据自动持久化。

---

## 🚀 快速开始

```bash
# 后端
git clone https://github.com/wangwenlin333/asset-tracker-ai.git
npm install
cp .env.example .env   # 配置数据库等
npm start

# 前端
cd frontend && npm install && npm run dev
# 开发默认 http://localhost:5173
```

---

## 📁 目录结构

```
asset-tracker-ai/
├─ server.js               # Node 后端入口（Express + MySQL）
├─ wechat-extractor.js     # 微信消息提取 / 分类
├─ wechat_monitor.py       # Python 微信监控服务
├─ frontend/               # Vue3 前端
│   ├─ src/components/    # 行情/面板/画布组件
│   └─ vite.config.js
└─ .env.example           # 环境变量示例
```

---

## 📜 说明

- 本项目用于个人投研与学习实践。
- 行情与推送数据仅供研究参考，**不构成任何投资建议**。
- 敏感配置（数据库、API 密钥）请放在 `.env` 中，**不要提交到仓库**。