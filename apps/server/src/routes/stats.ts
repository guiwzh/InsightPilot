import type { StatsResponse } from '@insightpilot/shared'
import { sql } from 'drizzle-orm'
import { Hono } from 'hono'
import { z } from 'zod'
import { startOfTodayInBeijing } from '../core/budget'
import { USD_TO_CNY } from '../core/pricing'
import { db } from '../db/client'

const Days = z.coerce.number().int().refine((d) => [1, 7, 30].includes(d)).catch(7)

const num = (value: unknown) => (value === null || value === undefined ? 0 : Number(value))

// 看板数据：全站维度，全部来自 agent_runs。days=1 表示今天（北京时间）
export const stats = new Hono().get('/', async (c) => {
  const days = Days.parse(c.req.query('days'))
  const since = new Date(startOfTodayInBeijing().getTime() - (days - 1) * 86_400_000)

  const [summaryRows, dailyRows, toolRows] = await Promise.all([
    db.execute(sql`
      SELECT count(*) AS runs,
             count(*) FILTER (WHERE status = 'success') AS success,
             coalesce(sum(cost_usd), 0) AS cost_usd,
             avg(cost_usd) FILTER (WHERE status = 'success') AS avg_cost_usd,
             percentile_cont(0.5) WITHIN GROUP (ORDER BY latency_ms) FILTER (WHERE status = 'success') AS p50,
             percentile_cont(0.95) WITHIN GROUP (ORDER BY latency_ms) FILTER (WHERE status = 'success') AS p95,
             avg(ttft_ms) AS avg_ttft,
             sum(cached_input_tokens)::float / nullif(sum(input_tokens), 0) AS cache_hit
      FROM app.agent_runs WHERE created_at >= ${since.toISOString()}::timestamptz`),
    db.execute(sql`
      SELECT to_char(created_at, 'YYYY-MM-DD') AS day,
             count(*) AS runs,
             coalesce(sum(cost_usd), 0) AS cost_usd,
             percentile_cont(0.5) WITHIN GROUP (ORDER BY latency_ms) AS p50,
             percentile_cont(0.95) WITHIN GROUP (ORDER BY latency_ms) AS p95,
             sum(cached_input_tokens)::float / nullif(sum(input_tokens), 0) AS cache_hit
      FROM app.agent_runs WHERE created_at >= ${since.toISOString()}::timestamptz
      GROUP BY 1 ORDER BY 1`),
    // tool_calls 是 jsonb 数组，展开成一行一次调用再汇总
    db.execute(sql`
      SELECT t->>'name' AS name,
             count(*) AS calls,
             count(*) FILTER (WHERE (t->>'ok')::boolean = false AND t->>'approval' IS DISTINCT FROM 'denied') AS errors,
             avg((t->>'durationMs')::numeric) FILTER (WHERE t->>'approval' IS DISTINCT FROM 'denied') AS avg_ms,
             count(*) FILTER (WHERE t->>'approval' = 'approved') AS approved,
             count(*) FILTER (WHERE t->>'approval' = 'denied') AS denied
      FROM app.agent_runs, jsonb_array_elements(tool_calls) AS t
      WHERE created_at >= ${since.toISOString()}::timestamptz
      GROUP BY 1 ORDER BY 2 DESC`),
  ])

  const s = summaryRows[0] ?? {}
  const tools = toolRows.map((t) => ({ name: String(t.name), calls: num(t.calls), errors: num(t.errors), avgMs: Math.round(num(t.avg_ms)) }))
  const toolCalls = tools.reduce((a, t) => a + t.calls, 0)
  const approved = toolRows.reduce((a, t) => a + num(t.approved), 0)
  const denied = toolRows.reduce((a, t) => a + num(t.denied), 0)
  const runs = num(s.runs)

  const body: StatsResponse = {
    days,
    summary: {
      runs,
      successRate: runs ? num(s.success) / runs : 0,
      totalCostCny: num(s.cost_usd) * USD_TO_CNY,
      avgCostCny: num(s.avg_cost_usd) * USD_TO_CNY,
      p50LatencyMs: Math.round(num(s.p50)),
      p95LatencyMs: Math.round(num(s.p95)),
      avgTtftMs: Math.round(num(s.avg_ttft)),
      cacheHitRate: num(s.cache_hit),
      toolErrorRate: toolCalls ? tools.reduce((a, t) => a + t.errors, 0) / toolCalls : 0,
      approvalRate: approved + denied ? approved / (approved + denied) : null,
    },
    daily: dailyRows.map((d) => ({
      day: String(d.day),
      runs: num(d.runs),
      costCny: num(d.cost_usd) * USD_TO_CNY,
      p50LatencyMs: Math.round(num(d.p50)),
      p95LatencyMs: Math.round(num(d.p95)),
      cacheHitRate: num(d.cache_hit),
    })),
    tools,
  }
  return c.json(body)
})
