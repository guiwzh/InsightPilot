import { serve } from '@hono/node-server'
import { Hono } from 'hono'
import { logger } from 'hono/logger'
import { env } from './env'
import { llmMode } from './core/model'
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

serve({ fetch: app.fetch, port: env.SERVER_PORT }, (info) => {
  console.log(`InsightPilot server: http://localhost:${info.port}/api（模型：${llmMode}）`)
})
