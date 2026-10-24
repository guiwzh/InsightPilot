import react from '@vitejs/plugin-react'
import { defineConfig, loadEnv } from 'vite'

export default defineConfig(({ mode }) => {
  // 和 server 读同一个根目录 .env，端口只在一处配置
  const env = loadEnv(mode, '../..', '')

  return {
    plugins: [react()],
    server: {
      port: 5173,
      // 端口被占用时直接报错，而不是悄悄换端口导致代理和书签对不上
      strictPort: true,
      // 开发时 /api 转发给 Hono server，前端不用处理跨域
      proxy: { '/api': `http://localhost:${env.SERVER_PORT || 8787}` },
    },
  }
})
