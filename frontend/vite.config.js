import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

export default defineConfig({
  plugins: [vue()],
  server: {
    host: '127.0.0.1',
    port: 5273,
    strictPort: true,
    proxy: {
      // 增量迁移分流：/api/stocks 模块已迁至 Spring Boot(3300)。
      // 必须声明在 '/api' 之前 —— Vite 按声明顺序匹配，先命中的规则生效。
      '/api/stocks': {
        target: 'http://localhost:3300',
        changeOrigin: true,
        secure: false
      },
      // /api/stock/notes、/api/stock/watchlist 模块已迁至 Spring Boot(3300)
      '/api/stock/notes': {
        target: 'http://localhost:3300',
        changeOrigin: true,
        secure: false
      },
      '/api/stock/watchlist': {
        target: 'http://localhost:3300',
        changeOrigin: true,
        secure: false
      },
      // 股票杂项 API 模块已迁至 Spring Boot(3300)
      '/api/stock/news': {
        target: 'http://localhost:3300',
        changeOrigin: true,
        secure: false
      },
      '/api/stock/sentiment': {
        target: 'http://localhost:3300',
        changeOrigin: true,
        secure: false
      },
      '/api/stock/daily-changes': {
        target: 'http://localhost:3300',
        changeOrigin: true,
        secure: false
      },
      '/api/stock/ipo-market-value': {
        target: 'http://localhost:3300',
        changeOrigin: true,
        secure: false
      },
      '/api/stock/daily-summary': {
        target: 'http://localhost:3300',
        changeOrigin: true,
        secure: false
      },
      '/api/stock-price': {
        target: 'http://localhost:3300',
        changeOrigin: true,
        secure: false
      },
      '/api/stock/name': {
        target: 'http://localhost:3300',
        changeOrigin: true,
        secure: false
      },
      '/api/stock/search': {
        target: 'http://localhost:3300',
        changeOrigin: true,
        secure: false
      },
      // AI 链路与联网检索源模块已迁至 Spring Boot(3300)
      '/api/ai': {
        target: 'http://localhost:3300',
        changeOrigin: true,
        secure: false
      },
      '/api/search': {
        target: 'http://localhost:3300',
        changeOrigin: true,
        secure: false
      },
      // 存款 / 账户 + 分期计划模块已迁至 Spring Boot(3300)
      '/api/deposits': {
        target: 'http://localhost:3300',
        changeOrigin: true,
        secure: false
      },
      '/api/installments': {
        target: 'http://localhost:3300',
        changeOrigin: true,
        secure: false
      },
      // 薅羊毛（羊毛记录 / 笔记 / 日历 / 每日快速金额 / 凭证识别）已迁至 Spring Boot(3300)
      '/api/wool': {
        target: 'http://localhost:3300',
        changeOrigin: true,
        secure: false
      },
      // 小工具收藏（tools）已迁至 Spring Boot(3300)
      '/api/tools': {
        target: 'http://localhost:3300',
        changeOrigin: true,
        secure: false
      },
      // 量化服务启停控制已迁至 Spring Boot(3300)。
      // 注意：必须排在 '/api/quant' 之前，否则会被前缀吞掉。
      '/api/quant-service': {
        target: 'http://localhost:3300',
        changeOrigin: true,
        secure: false
      },
      // 量化回测代理（/api/quant/** 转发至 Python quant 服务）已迁至 Spring Boot(3300)。
      // 注意：必须排在 '/api/quant-service' 之后、'/api' 之前。
      '/api/quant': {
        target: 'http://localhost:3300',
        changeOrigin: true,
        secure: false
      },
      // 账号与会话（register/login/me/account/password/logout）已迁至 Spring Boot(3300)。
      // 两侧共用 user_sessions 表，迁移期登录态互通，浏览器无需重新登录。
      '/api/auth': {
        target: 'http://localhost:3300',
        changeOrigin: true,
        secure: false
      },
      // 心跳 / 练题 / 画布图片上传模块已迁至 Spring Boot(3300)
      '/api/heartbeat': {
        target: 'http://localhost:3300',
        changeOrigin: true,
        secure: false
      },
      '/api/quiz': {
        target: 'http://localhost:3300',
        changeOrigin: true,
        secure: false
      },
      '/api/board': {
        target: 'http://localhost:3300',
        changeOrigin: true,
        secure: false
      },
      // 金价 / 汇率模块已迁至 Spring Boot(3300)
      '/api/gold-price': {
        target: 'http://localhost:3300',
        changeOrigin: true,
        secure: false
      },
      '/api/forex': {
        target: 'http://localhost:3300',
        changeOrigin: true,
        secure: false
      },
      // 大盘概览 / 打新日历模块已迁至 Spring Boot(3300)
      '/api/market': {
        target: 'http://localhost:3300',
        changeOrigin: true,
        secure: false
      },
      '/api/newstock-calendar': {
        target: 'http://localhost:3300',
        changeOrigin: true,
        secure: false
      },
      // 微信集成模块已迁至 Spring Boot(3300)
      '/api/wechat': {
        target: 'http://localhost:3300',
        changeOrigin: true,
        secure: false
      },
      // 学习抽取（/api/extract/learn）已迁至 Spring Boot(3300)
      '/api/extract': {
        target: 'http://localhost:3300',
        changeOrigin: true,
        secure: false
      },
      // 每日计划 / 每日备注模块已迁至 Spring Boot(3300)
      '/api/plans': {
        target: 'http://localhost:3300',
        changeOrigin: true,
        secure: false
      },
      '/api/notes': {
        target: 'http://localhost:3300',
        changeOrigin: true,
        secure: false
      },
      // 每日任务（/api/daily-tasks）模块已迁至 Spring Boot(3300)
      '/api/daily-tasks': {
        target: 'http://localhost:3300',
        changeOrigin: true,
        secure: false
      },
      // 人生规划器（/api/life/**）整块已迁至 Spring Boot(3300)
      '/api/life': {
        target: 'http://localhost:3300',
        changeOrigin: true,
        secure: false
      },
      '/api': {
        target: 'http://localhost:3300',
        changeOrigin: true,
        secure: false
      },
      // /uploads 租户文件服务已迁至 Spring Boot(3300)（两侧共用同一个 uploads/ 目录）
      '/uploads': {
        target: 'http://localhost:3300',
        changeOrigin: true,
        secure: false
      }
    }
  }
})