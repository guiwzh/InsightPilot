import {
  DescribeTableInput,
  GetMetricDefinitionsInput,
  ListTablesInput,
  RunSqlInput,
} from '@insightpilot/shared'
import { tool, type StopCondition, type ToolSet } from 'ai'
import { PREVIEW_ROWS, runSql, ToolError } from './run-sql'
import { describeTables, listTables } from './schema-info'
import { findMetrics } from './semantic/metrics'

const normalizeSql = (sql: string) => sql.replace(/\s+/g, ' ').replace(/;+\s*$/, '').trim().toLowerCase()

/**
 * 每次对话请求创建一套新的工具：run_sql 需要记住本轮上一次执行的 SQL，用来拦截重复调用。
 * Web 接口、MCP、评测脚本都从这里拿工具，行为完全一致。
 */
export function buildTools() {
  let lastSql: string | undefined

  return {
    list_tables: tool({
      description: '列出 shop 数据库中所有可查询的表、中文说明和大致行数。不确定该查哪张表时先调用。',
      inputSchema: ListTablesInput,
      execute: () => listTables(),
    }),

    describe_table: tool({
      description:
        '查看表的列名、类型、中文注释、主外键，以及常见取值（如订单状态的枚举值）和取值范围。写 SQL 前必须先查看涉及的表，不要猜列名。',
      inputSchema: DescribeTableInput,
      execute: ({ tables }) => describeTables(tables),
    }),

    get_metric_definitions: tool({
      description:
        '读取业务指标的标准口径和参考 SQL，如 GMV、下单转化率、退款率、复购率、客单价。问题涉及这些指标时，先读口径再写 SQL。',
      inputSchema: GetMetricDefinitionsInput,
      execute: async ({ keywords }) => findMetrics(keywords),
    }),

    run_sql: tool({
      description:
        `执行一条只读的 PostgreSQL SELECT 查询，返回结果的列、行数和前 ${PREVIEW_ROWS} 行预览；完整结果会以表格展示给用户。出错时返回错误码和修复建议，请据此修改后重试。`,
      inputSchema: RunSqlInput,
      execute: async ({ sql }) => {
        const normalized = normalizeSql(sql)
        if (normalized === lastSql) {
          throw new ToolError('[DUPLICATE] 这条 SQL 和上一次执行的完全相同，结果不会有变化。请修改 SQL，或者基于已有结果直接回答。')
        }
        lastSql = normalized
        return runSql(sql)
      },
    }),
  } satisfies ToolSet
}

export type InsightTools = ReturnType<typeof buildTools>

/** 兜底：同一条 SQL 在本轮被提交 3 次（模型无视了重复提示），直接结束这一轮 */
export const repeatedSqlStop: StopCondition<InsightTools> = ({ steps }) => {
  const counts = new Map<string, number>()
  for (const call of steps.flatMap((step) => step.toolCalls)) {
    if (call.toolName !== 'run_sql' || call.dynamic) continue
    const sql = normalizeSql(call.input.sql)
    const count = (counts.get(sql) ?? 0) + 1
    if (count >= 3) return true
    counts.set(sql, count)
  }
  return false
}
