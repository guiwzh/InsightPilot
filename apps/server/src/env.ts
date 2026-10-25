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
  // 防刷三道闸：同一 IP 每分钟的对话请求数、每个访客每天的 token 数、全站每天的花费（元）
  CHAT_RATE_LIMIT_PER_MINUTE: z.coerce.number().int().positive().default(10),
  // 部署在 Caddy 后面时设为 true，限流按 X-Forwarded-For 识别真实 IP；直接暴露在公网时不要打开，否则 IP 可以伪造
  TRUST_PROXY: z
    .enum(['true', 'false'])
    .default('false')
    .transform((v) => v === 'true'),
  VISITOR_DAILY_TOKENS: z.coerce.number().int().positive().default(400_000),
  SITE_DAILY_BUDGET_CNY: z.coerce.number().positive().default(10),
})

const parsed = EnvSchema.safeParse(process.env)
if (!parsed.success) {
  console.error('环境变量配置有误（参考 .env.example）：\n' + z.prettifyError(parsed.error))
  process.exit(1)
}

export const env = parsed.data
