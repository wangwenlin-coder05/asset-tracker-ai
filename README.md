# 📈 Asset Tracker AI · 股票投研辅助系统

![Vue](https://img.shields.io/badge/Vue-3-42b883?style=for-the-badge&logo=vuedotjs)
![Tailwind](https://img.shields.io/badge/TailwindCSS-3-06B6D4?style=for-the-badge&logo=tailwindcss)
![Node.js](https://img.shields.io/badge/Node.js-20-339933?style=for-the-badge&logo=nodejs)
![Express](https://img.shields.io/badge/Express-4-000000?style=for-the-badge&logo=express)
![MySQL](https://img.shields.io/badge/MySQL-8-4479A1?style=for-the-badge&logo=mysql)
![Status](https://img.shields.io/badge/Status-个人投研-9400D3?style=for-the-badge)

> 面向个人 A 股投资者的一体化投研辅助系统，集行情看板、AI 推荐自动提取、T+1 有效止盈计算、投资人分析面板与无限画布笔记于一体。后端 Node/Express + 前端 Vue3/Vite/Tailwind，含 Python 微信监控模块。

---

## ✨ 功能全景

### 行情与分析
- **实时行情看板**：涨幅统计、昨日涨停表现、大小盘指数等核心指标可视化。
- **投资人分析面板**：按「有效止盈胜率」评估推荐质量，区分**有效止盈 / 锁定**状态。
- **T+1 有效止盈模型**：D0 计入持仓日，D0 涨幅 >5% 时需 D1 开盘仍维持 ≥5% 才判定为有效止盈，阈值可配置（5% / 10% / 20%）。

### AI 辅助
- **AI 推荐自动提取**：监控微信推送消息 → 自动分类、去重、入库，用 AI 抽取推荐逻辑并绑定股票。
- **AI 投资人画像**：跟踪各推荐源的收益表现，生成可视化分析。
- **微信监控服务**（Python）：独立进程监听推送消息，对接后端 API。

### 无限画布笔记
- 基于 Vue Flow 的**无限画布**：节点连线、便签、图片上传（本地 dataURL）、触摸交互、撤销重做。
- 平板友好：双指缩放、双击编辑文字、底部固定编辑栏（字号 / 加粗 / 斜体 / 颜色）。
- 数据持久化：localStorage 自动保存视图与元素。

---

## 🧮 核心算法：T+1 有效止盈

```
D0 (推荐日)     D1 (次日开盘)       判定
─────────────────────────────────────────────────
涨幅 > 阈值(5%)  开盘仍 ≥ 阈值       ✅ 有效止盈
涨幅 > 阈值      开盘 < 阈值          ❌ 浮盈
涨幅 ≤ 阈值      -                   ❌ 未触发
```

> 避免同一日冲高回落的"虚假止盈"，只把真正次日仍能在盘中守住涨幅的推荐算作有效业绩。

---

## 📦 技术栈

| 层 | 技术 |
| --- | --- |
| 后端 | Node.js · Express · MySQL2 · Multer · Sharp |
| 前端 | Vue 3 · Vite · Tailwind CSS · lucide-vue-next · Vue Flow |
| 监控 | Python（微信消息提取 / 监听） |
| 存储 | MySQL（数据） + 本地 dataURL（图片） |

---

## 🚀 快速开始

```bash
# 后端
npm install
# 复制 .env.example → .env，填写数据库等配置
npm start

# 前端
cd frontend && npm install && npm run dev
# 开发默认 http://localhost:5173
```

> 数据库脚本见根目录，端口默认 3000。

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
