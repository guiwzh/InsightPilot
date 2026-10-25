import { serve } from '@hono/node-server'
import { Hono } from 'hono'
import { logger } from 'hono/logger'
import { env } from './env'
import { llmMode } from './core/model'
import { hasPrice } from './core/pricing'
import { visitor, type AppEnv } from './middleware/visitor'
import { chat } from './routes/chat'
import { conversationsRoute } from './routes/conversations'
import { health } from './routes/health'
import { results } from './routes/results'
import { stats } from './routes/stats'

const app = new Hono<AppEnv>().basePath('/api')

app.use(logger())
// 所有接口都先确定访客身份（没有就发一个 cookie）
app.use(visitor)
app.route('/health', health)
app.route('/chat', chat)
app.route('/conversations', conversationsRoute)
app.route('/results', results)
app.route('/stats', stats)

// 换了模型却忘了更新价格表时，成本会一直记为 0，每日预算形同虚设，启动时就提醒
for (const modelId of new Set([env.MODEL_FAST, env.MODEL_STRONG])) {
  if (llmMode === 'deepseek' && !hasPrice(modelId)) {
    console.warn(`[pricing] ${modelId} 不在 src/core/pricing.ts 的价格表里：成本会记为 0，全站每日预算不会生效`)
  }
}

serve({ fetch: app.fetch, port: env.SERVER_PORT }, (info) => {
  console.log(`InsightPilot server: http://localhost:${info.port}/api（模型：${llmMode}）`)
})
