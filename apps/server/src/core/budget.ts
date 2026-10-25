// 每日预算：每个访客每天的 token 上限 + 全站每天的花费上限（对应 OWASP LLM10 无界消耗）。
// 都从 agent_runs 实时汇总，按北京时间的自然日计算。
import { gte, sql } from 'drizzle-orm'
import { db } from '../db/client'
import { agentRuns } from '../db/schema'
import { env } from '../env'
import { USD_TO_CNY } from './pricing'

/** 北京时间今天 0 点 */
export function startOfTodayInBeijing(now = new Date()) {
  const day = now.toLocaleDateString('sv-SE', { timeZone: 'Asia/Shanghai' })
  return new Date(`${day}T00:00:00+08:00`)
}

export type BudgetCheck = { ok: true } | { ok: false; status: 429 | 503; message: string }

export async function checkDailyBudget(visitorId: string): Promise<BudgetCheck> {
  const [usage] = await db
    .select({
      visitorTokens: sql`coalesce(sum(${agentRuns.inputTokens} + ${agentRuns.outputTokens}) filter (where ${agentRuns.visitorId} = ${visitorId}), 0)`.mapWith(Number),
      siteCostUsd: sql`coalesce(sum(${agentRuns.costUsd}), 0)`.mapWith(Number),
    })
    .from(agentRuns)
    .where(gte(agentRuns.createdAt, startOfTodayInBeijing()))

  if (usage.siteCostUsd * USD_TO_CNY >= env.SITE_DAILY_BUDGET_CNY) {
    return { ok: false, status: 503, message: '今天的体验额度已经用完了，明天再来试试吧' }
  }
  if (usage.visitorTokens >= env.VISITOR_DAILY_TOKENS) {
    return { ok: false, status: 429, message: '你今天的提问次数已经用完了，明天再来试试吧' }
  }
  return { ok: true }
}
