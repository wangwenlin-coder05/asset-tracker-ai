import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

export default defineConfig({
  plugins: [vue()],
  server: {
    host: '127.0.0.1',
    port: 5273,
    strictPort: true,
    proxy: {
      '/api': {
        target: 'http://localhost:3300',
        changeOrigin: true,
        secure: false
      },
      '/uploads': {
        target: 'http://localhost:3300',
        changeOrigin: true,
        secure: false
      }
    }
  }
})