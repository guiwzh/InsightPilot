import { existsSync } from 'node:fs'
import { z } from 'zod'

// 本地开发读取仓库根目录的 .env；容器里直接用环境变量，文件不存在就跳过
const envFile = new URL('../../../.env', import.meta.url)
if (existsSync(envFile)) process.loadEnvFile(envFile)

const EnvSchema = z.object({
  DATABASE_URL: z.string().min(1),
  DATABASE_URL_READONLY: z.string().min(1),
  // 空字符串视为未配置，对话接口会进入演示模式
  DEEPSEEK_API_KEY: z
    .string()
    .trim()
    .optional()
    .transform((v) => v || undefined),
  MODEL_FAST: z.string().default('deepseek-flash'),
  MODEL_STRONG: z.string().default('deepseek-v4-pro'),
  // 不用通用的 PORT：很多工具和平台会自动注入 PORT，容易和前端端口撞车
  SERVER_PORT: z.coerce.number().int().positive().default(8787),
})

const parsed = EnvSchema.safeParse(process.env)
if (!parsed.success) {
  console.error('环境变量配置有误（参考 .env.example）：\n' + z.prettifyError(parsed.error))
  process.exit(1)
}

export const env = parsed.data
