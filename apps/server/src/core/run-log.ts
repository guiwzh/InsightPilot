// 每次对话请求写一行 agent_runs：模型、步数、token、成本、首字时间、总耗时、每次工具调用。看板页从这里聚合。
import type { StepResult, UIMessage } from 'ai'
import { db } from '../db/client'
import { agentRuns, type ToolCallLog } from '../db/schema'
import { costUsd } from './pricing'
import type { InsightTools } from './tools'

type Status = 'success' | 'error' | 'aborted'

/** 从请求带来的消息里找出用户刚刚做出的审批决定（toolCallId → 是否允许） */
function approvalDecisions(messages: UIMessage[]) {
  const decisions = new Map<string, { name: string; approved: boolean }>()
  const last = messages.at(-1)
  if (last?.role !== 'assistant') return decisions
  for (const part of last.parts as { type: string; state?: string; toolCallId?: string; approval?: { approved?: boolean } }[]) {
    if (part.state === 'approval-responded' && part.toolCallId && part.type.startsWith('tool-')) {
      decisions.set(part.toolCallId, { name: part.type.slice('tool-'.length), approved: part.approval?.approved === true })
    }
  }
  return decisions
}

export function startRun({ visitorId, conversationId, messages }: { visitorId: string; conversationId: string; messages: UIMessage[] }) {
  const startedAt = performance.now()
  let firstChunkAt: number | undefined
  let finished = false
  const toolCalls: ToolCallLog[] = []
  const approvals = approvalDecisions(messages)

  return {
    /** 首字时间：从收到请求到模型吐出第一个片段（文字或工具调用） */
    markFirstChunk() {
      firstChunkAt ??= performance.now()
    },

    recordTool({ toolCallId, name, durationMs, error }: { toolCallId: string; name: string; durationMs: number; error?: unknown }) {
      const approval = approvals.get(toolCallId)
      approvals.delete(toolCallId)
      toolCalls.push({
        name,
        durationMs: Math.round(durationMs),
        ok: error === undefined,
        ...(approval && { approval: 'approved' as const }),
        ...(error !== undefined && { error: (error instanceof Error ? error.message : String(error)).slice(0, 300) }),
      })
    },

    /** 只记一次：中断、出错、正常结束三个回调可能先后触发 */
    async finish(status: Status, steps: StepResult<InsightTools>[], error?: unknown) {
      if (finished) return
      finished = true
      // 被用户拒绝的工具不会执行，单独补一条记录
      for (const { name, approved } of approvals.values()) {
        if (!approved) toolCalls.push({ name, durationMs: 0, ok: false, approval: 'denied' })
      }
      const sum = (pick: (step: StepResult<InsightTools>) => number | undefined) => steps.reduce((total, step) => total + (pick(step) ?? 0), 0)
      try {
        await db.insert(agentRuns).values({
          conversationId,
          visitorId,
          models: [...new Set(steps.map((step) => step.model.modelId))],
          steps: steps.length,
          inputTokens: sum((s) => s.usage.inputTokens),
          cachedInputTokens: sum((s) => s.usage.inputTokenDetails.cacheReadTokens),
          outputTokens: sum((s) => s.usage.outputTokens),
          costUsd: sum((s) => costUsd(s.model.modelId, s.usage)).toFixed(6),
          ttftMs: firstChunkAt === undefined ? null : Math.round(firstChunkAt - startedAt),
          latencyMs: Math.round(performance.now() - startedAt),
          status,
          error: error === undefined ? null : (error instanceof Error ? error.message : String(error)).slice(0, 500),
          toolCalls,
        })
      } catch (insertError) {
        // 日志写失败不影响用户拿到回答
        console.error('[run-log]', insertError)
      }
    },
  }
}

/** 对话历史里最近一次成功查询的 resultId，供"把刚才的结果画图 / 导出"这类追问使用 */
export function lastResultIdIn(messages: UIMessage[]): string | undefined {
  for (const message of [...messages].reverse()) {
    for (const part of [...message.parts].reverse() as { type: string; state?: string; output?: { resultId?: string } }[]) {
      if (part.type === 'tool-run_sql' && part.state === 'output-available' && part.output?.resultId) return part.output.resultId
    }
  }
  return undefined
}
