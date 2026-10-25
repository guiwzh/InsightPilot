// 应用自己的表，全部放在 app schema。
// 用 `pnpm db:push` 同步到数据库；drizzle.config.ts 里的 schemaFilter 保证 push 不会碰 shop 样例数据。
import type { ResultColumn } from '@insightpilot/shared'
import { boolean, index, integer, jsonb, numeric, pgSchema, text, timestamp, uuid } from 'drizzle-orm/pg-core'

export const app = pgSchema('app')

const createdAt = () => timestamp('created_at', { withTimezone: true }).notNull().defaultNow()

export const conversations = app.table(
  'conversations',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    visitorId: text('visitor_id').notNull(),
    title: text('title').notNull().default('新对话'),
    createdAt: createdAt(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('conversations_visitor_idx').on(t.visitorId, t.updatedAt)],
)

export const messages = app.table(
  'messages',
  {
    // 直接使用 AI SDK UIMessage 的 id
    id: text('id').primaryKey(),
    conversationId: uuid('conversation_id')
      .notNull()
      .references(() => conversations.id, { onDelete: 'cascade' }),
    role: text('role', { enum: ['system', 'user', 'assistant'] }).notNull(),
    // UIMessage.parts 原样存储，读出来就能还给 useChat
    parts: jsonb('parts').$type<unknown[]>().notNull(),
    // 消息在会话里的顺序。同一事务写入的多条消息 created_at 相同，不能靠它排序
    seq: integer('seq').notNull().default(0),
    createdAt: createdAt(),
  },
  (t) => [index('messages_conversation_idx').on(t.conversationId, t.seq)],
)

export type ToolCallLog = {
  name: string
  durationMs: number
  ok: boolean
  /** 需要用户确认的工具（export_csv）的确认结果 */
  approval?: 'approved' | 'denied'
  error?: string
}

// 每次对话请求一行：成本、延迟、工具调用都在这里，看板页从这张表聚合
export const agentRuns = app.table(
  'agent_runs',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    conversationId: uuid('conversation_id').references(() => conversations.id, { onDelete: 'set null' }),
    visitorId: text('visitor_id').notNull(),
    models: text('models').array().notNull(),
    steps: integer('steps').notNull().default(0),
    inputTokens: integer('input_tokens').notNull().default(0),
    cachedInputTokens: integer('cached_input_tokens').notNull().default(0),
    outputTokens: integer('output_tokens').notNull().default(0),
    costUsd: numeric('cost_usd', { precision: 12, scale: 6 }).notNull().default('0'),
    ttftMs: integer('ttft_ms'),
    latencyMs: integer('latency_ms'),
    status: text('status', { enum: ['success', 'error', 'aborted'] }).notNull(),
    error: text('error'),
    toolCalls: jsonb('tool_calls').$type<ToolCallLog[]>().notNull().default([]),
    createdAt: createdAt(),
  },
  (t) => [index('agent_runs_created_idx').on(t.createdAt), index('agent_runs_visitor_idx').on(t.visitorId, t.createdAt)],
)

// run_sql 的完整结果存这里，只把 id 交给模型；前端按 id 拉数据渲染表格和图表
export const queryResults = app.table('query_results', {
  id: uuid('id').primaryKey().defaultRandom(),
  runId: uuid('run_id').references(() => agentRuns.id, { onDelete: 'set null' }),
  sql: text('sql').notNull(),
  columns: jsonb('columns').$type<ResultColumn[]>().notNull(),
  // 每行是按 columns 顺序排列的数组，列名重复时也不会互相覆盖
  rows: jsonb('rows').$type<unknown[][]>().notNull(),
  rowCount: integer('row_count').notNull(),
  truncated: boolean('truncated').notNull().default(false),
  createdAt: createdAt(),
})
