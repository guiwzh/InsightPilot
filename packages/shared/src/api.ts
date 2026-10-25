// 前后端共用的接口类型。server 按它返回，web 按它读取，改一处两边都能在类型检查时发现
import type { ResultColumn } from './tools'

/** GET /api/results/:id。rows 按 columns 顺序存成数组，列名重复（如两个 id）也不会互相覆盖 */
export type QueryResultResponse = {
  id: string
  sql: string
  columns: ResultColumn[]
  rows: unknown[][]
  rowCount: number
  truncated: boolean
}

/** GET /api/conversations：当前访客的会话列表，按最近更新排序 */
export type ConversationSummary = {
  id: string
  title: string
  updatedAt: string
}

/** GET /api/conversations/:id。messages 是 AI SDK 的 UIMessage，原样还给 useChat */
export type ConversationDetail = ConversationSummary & {
  messages: unknown[]
}

/** GET /api/stats?days=7：看板数据，来自 agent_runs */
export type StatsResponse = {
  days: number
  summary: {
    runs: number
    successRate: number
    totalCostCny: number
    avgCostCny: number
    p50LatencyMs: number
    p95LatencyMs: number
    avgTtftMs: number
    cacheHitRate: number
    toolErrorRate: number
    /** 导出审批里"允许"的比例；没有审批记录时为 null */
    approvalRate: number | null
  }
  daily: { day: string; runs: number; costCny: number; p50LatencyMs: number; p95LatencyMs: number; cacheHitRate: number }[]
  tools: { name: string; calls: number; errors: number; avgMs: number }[]
}

export type HealthResponse = {
  ok: boolean
  db: {
    /** 管理员连接（app schema）是否可用 */
    admin: boolean
    /** 只读连接（analyst_ro）是否可用 */
    readonly: boolean
    /** shop 样例数据是否已经造好 */
    seeded: boolean
  }
  llm: {
    /** 未配置 DEEPSEEK_API_KEY 时为 demo，对话返回固定文本 */
    mode: 'deepseek' | 'demo'
    model: string
  }
}
