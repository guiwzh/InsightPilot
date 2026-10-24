import { Hono } from 'hono'
import {
  convertToModelMessages,
  createUIMessageStreamResponse,
  isStepCount,
  streamText,
  toUIMessageStream,
  type UIMessage,
} from 'ai'
import { FINAL_STEP_INSTRUCTIONS, INSTRUCTIONS } from '../core/instructions'
import { fastModel } from '../core/model'
import { buildTools, repeatedSqlStop } from '../core/tools'

/** 一轮对话最多 8 步（每步 = 一次模型调用，可能带工具调用），防止死循环 */
const MAX_STEPS = 8

export const chat = new Hono().post('/', async (c) => {
  const { messages } = await c.req.json<{ messages: UIMessage[] }>()

  const result = streamText({
    model: fastModel(),
    instructions: INSTRUCTIONS,
    messages: await convertToModelMessages(messages),
    tools: buildTools(),
    stopWhen: [isStepCount(MAX_STEPS), repeatedSqlStop],
    // 最后一步不再允许调工具，保证用户总能拿到一段文字回答，而不是停在半截的工具调用上
    prepareStep: ({ stepNumber }) =>
      stepNumber === MAX_STEPS - 1 ? { toolChoice: 'none', instructions: FINAL_STEP_INSTRUCTIONS } : undefined,
    // 先关闭思考模式，首字更快；第 4 周评测时再对比开关思考对准确率和延迟的影响
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
