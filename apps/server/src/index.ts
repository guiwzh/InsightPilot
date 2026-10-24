import { serve } from '@hono/node-server'
import { Hono } from 'hono'
import { logger } from 'hono/logger'
import { env } from './env'
import { llmMode } from './core/model'
import { chat } from './routes/chat'
import { health } from './routes/health'
import { results } from './routes/results'

const app = new Hono().basePath('/api')

app.use(logger())
app.route('/health', health)
app.route('/chat', chat)
app.route('/results', results)

serve({ fetch: app.fetch, port: env.SERVER_PORT }, (info) => {
  console.log(`InsightPilot server: http://localhost:${info.port}/api（模型：${llmMode}）`)
})
