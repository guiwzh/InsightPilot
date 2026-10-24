import { existsSync } from 'node:fs'
import { defineConfig } from 'drizzle-kit'

// drizzle-kit 在 apps/server 目录下运行，.env 在仓库根目录
if (existsSync('../../.env')) process.loadEnvFile('../../.env')

export default defineConfig({
  dialect: 'postgresql',
  schema: './src/db/schema.ts',
  // 只管理 app schema，push 永远不会改动或删除 shop 里的样例数据
  schemaFilter: ['app'],
  // 必须用管理员账号，只读账号没有建表权限
  dbCredentials: { url: process.env.DATABASE_URL! },
  // 打印将要执行的 SQL。删列、改类型等可能丢数据的变更，push 会单独弹出确认
  verbose: true,
})
