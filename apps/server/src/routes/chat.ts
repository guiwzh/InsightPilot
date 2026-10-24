import { Hono } from 'hono'
import {
  convertToModelMessages,
  createUIMessageStreamResponse,
  streamText,
  toUIMessageStream,
  type UIMessage,
} from 'ai'
import { agentSettings } from '../core/agent'

export const chat = new Hono().post('/', async (c) => {
  const { messages } = await c.req.json<{ messages: UIMessage[] }>()

  const result = streamText({
    // 和评测脚本用的是同一份配置
    ...agentSettings(),
    messages: await convertToModelMessages(messages),
    // 前端点"停止"会断开请求，这里随之中断对模型的调用，不再继续计费
    abortSignal: c.req.raw.signal,
  })

  return createUIMessageStreamResponse({
    stream: toUIMessageStream({
      stream: result.stream,
      onError: (error) => {
        console.error('[chat]', error)
        return error instanceof Error ? error.message : '模型调用失败'
      },
    }),
  })
})
