import { Hono } from 'hono'
import {
  convertToModelMessages,
  createUIMessageStreamResponse,
  streamText,
  toUIMessageStream,
  type UIMessage,
} from 'ai'
import { INSTRUCTIONS } from '../core/instructions'
import { fastModel } from '../core/model'

// 第 1 周：纯流式对话，不带工具。第 2 周起在这里接入 tools、stopWhen、toolApproval
export const chat = new Hono().post('/', async (c) => {
  const { messages } = await c.req.json<{ messages: UIMessage[] }>()

  const result = streamText({
    model: fastModel(),
    instructions: INSTRUCTIONS,
    messages: await convertToModelMessages(messages),
    // 先关闭思考模式，首字更快；接入工具后再评测开关思考对准确率和延迟的影响
    providerOptions: { deepseek: { thinking: { type: 'disabled' } } },
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
