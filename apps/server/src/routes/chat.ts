import { Hono } from 'hono'
import { bodyLimit } from 'hono/body-limit'
import {
  convertToModelMessages,
  createIdGenerator,
  createUIMessageStreamResponse,
  streamText,
  toUIMessageStream,
  type StepResult,
  type UIMessage,
} from 'ai'
import { z } from 'zod'
import { agentSettings, FULL_AGENT } from '../core/agent'
import { checkDailyBudget } from '../core/budget'
import { lastResultIdIn, startRun } from '../core/run-log'
import type { InsightTools } from '../core/tools'
import { saveConversation } from '../db/chat-store'
import { env } from '../env'
import { rateLimit } from '../middleware/rate-limit'
import type { AppEnv } from '../middleware/visitor'

// useChat 发来的请求体：id 是会话 id（前端用 crypto.randomUUID 生成），messages 是完整的消息列表
const ChatRequest = z.object({
  id: z.uuid(),
  messages: z.array(z.looseObject({ id: z.string(), role: z.enum(['system', 'user', 'assistant']), parts: z.array(z.unknown()) })).min(1),
})

const generateMessageId = createIdGenerator({ prefix: 'msg', size: 16 })

/**
 * 请求体上限。请求里是整段对话（含每次工具调用的结果），正常一轮问答只有几十 KB；
 * 不设上限时一个请求就能把几百 MB 读进内存，消息还会原样存库
 */
const MAX_BODY_BYTES = 2 * 1024 * 1024

/** 首字时间按这些片段计：用户能看到的第一个文字，或者第一个工具调用（界面上会出现步骤） */
const MODEL_OUTPUT_CHUNKS = new Set(['text-delta', 'reasoning-delta', 'tool-input-start', 'tool-call'])

export const chat = new Hono<AppEnv>()
  // 同一 IP 每分钟最多 N 次（含导出审批后的续跑请求）
  .use(rateLimit({ windowMs: 60_000, limit: env.CHAT_RATE_LIMIT_PER_MINUTE }))
  .use(bodyLimit({ maxSize: MAX_BODY_BYTES, onError: (c) => c.text('这段对话太长了，请新建一个对话再问', 413) }))
  .post('/', async (c) => {
    const visitorId = c.get('visitorId')
    const parsed = ChatRequest.safeParse(await c.req.json().catch(() => null))
    if (!parsed.success) return c.text('请求格式不正确', 400)
    const conversationId = parsed.data.id
    const messages = parsed.data.messages as unknown as UIMessage[]

    const budget = await checkDailyBudget(visitorId)
    if (!budget.ok) return c.text(budget.message, budget.status)

    // 先存一次：即使后面模型调用失败，用户的问题也不会丢
    if (!(await saveConversation(visitorId, conversationId, messages))) return c.text('会话不存在', 404)

    const run = startRun({ visitorId, conversationId, messages })
    // onError 拿不到 steps：中途出错时，前面已经完成（已经计费）的步骤也要记进成本，否则每日预算会漏算
    const finishedSteps: StepResult<InsightTools>[] = []
    const result = streamText({
      // 和评测脚本用的是同一份配置
      ...agentSettings(FULL_AGENT, { lastResultId: lastResultIdIn(messages) }),
      messages: await convertToModelMessages(messages),
      // 前端点"停止"会断开请求，这里随之中断对模型的调用，不再继续计费
      abortSignal: c.req.raw.signal,
      // 只算模型真正吐出的内容；start、start-step 这类控制片段在请求一开始就会出现
      onChunk: ({ chunk }) => {
        if (MODEL_OUTPUT_CHUNKS.has(chunk.type)) run.markFirstChunk()
      },
      onToolExecutionEnd: ({ toolCall, toolExecutionMs, toolOutput }) =>
        run.recordTool({
          toolCallId: toolCall.toolCallId,
          name: toolCall.toolName,
          durationMs: toolExecutionMs,
          error: toolOutput.type === 'tool-error' ? toolOutput.error : undefined,
        }),
      onStepEnd: (step) => void finishedSteps.push(step),
      onEnd: ({ steps }) => run.finish('success', steps),
      onAbort: ({ steps }) => run.finish('aborted', steps),
      onError: ({ error }) => run.finish('error', finishedSteps, error),
    })

    return createUIMessageStreamResponse({
      stream: toUIMessageStream({
        stream: result.stream,
        originalMessages: messages,
        // 助手消息的 id 由服务端生成，和数据库里存的一致
        generateMessageId,
        onEnd: ({ messages: finalMessages }) =>
          saveConversation(visitorId, conversationId, finalMessages).then(
            () => undefined,
            (error) => console.error('[chat] 保存会话失败', error),
          ),
        onError: (error) => {
          console.error('[chat]', error)
          return error instanceof Error ? error.message : '模型调用失败'
        },
      }),
    })
  })
