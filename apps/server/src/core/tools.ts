import {
  ChartSpecInput,
  DescribeTableInput,
  GetMetricDefinitionsInput,
  ListTablesInput,
  RunSqlInput,
  validateChartSpec,
  type RenderChartOutput,
} from '@insightpilot/shared'
import { tool, type StopCondition, type ToolSet } from 'ai'
import { z } from 'zod'
import { loadResultMeta, PREVIEW_ROWS, runSql, ToolError } from './run-sql'
import { describeTables, listTablesFor } from './schema-info'
import { findMetrics } from './semantic/metrics'

const normalizeSql = (sql: string) => sql.replace(/\s+/g, ' ').replace(/;+\s*$/, '').trim().toLowerCase()
const isUuid = (value: string) => z.uuid().safeParse(value).success

export type ToolOptions = {
  /** describe_table / list_tables 是否带中文注释和常见取值 */
  schemaHints: boolean
  /** run_sql 报错时是否附带修复建议 */
  errorHints: boolean
}

/**
 * 每次对话请求创建一套新的工具：run_sql 要记住本轮上一次执行的 SQL（拦截重复调用），
 * render_chart 要知道本轮最近一次成功查询的 resultId（模型可以不抄那串 UUID）。
 * Web 接口、MCP、评测脚本都从这里拿工具，行为完全一致。
 */
export function buildTools({ schemaHints, errorHints }: ToolOptions = { schemaHints: true, errorHints: true }) {
  let lastSql: string | undefined
  let lastResultId: string | undefined

  return {
    list_tables: tool({
      description: '列出 shop 数据库中所有可查询的表、中文说明和大致行数。不确定该查哪张表时先调用。',
      inputSchema: ListTablesInput,
      execute: () => listTablesFor({ hints: schemaHints }),
    }),

    describe_table: tool({
      description:
        '查看表的列名、类型、中文注释、主外键，以及常见取值（如订单状态的枚举值）和取值范围。写 SQL 前必须先查看涉及的表，不要猜列名。',
      inputSchema: DescribeTableInput,
      execute: ({ tables }) => describeTables(tables, { hints: schemaHints }),
    }),

    get_metric_definitions: tool({
      description:
        '读取业务指标的标准口径和参考 SQL，如 GMV、下单转化率、退款率、复购率、客单价。问题涉及这些指标时，先读口径再写 SQL。',
      inputSchema: GetMetricDefinitionsInput,
      execute: async ({ keywords }) => findMetrics(keywords),
    }),

    run_sql: tool({
      description: `执行一条只读的 PostgreSQL SELECT 查询，返回结果的列、行数和前 ${PREVIEW_ROWS} 行预览；完整结果会以表格展示给用户。出错时返回错误码和修复建议，请据此修改后重试。`,
      inputSchema: RunSqlInput,
      execute: async ({ sql }) => {
        const normalized = normalizeSql(sql)
        if (normalized === lastSql) {
          throw new ToolError('[DUPLICATE] 这条 SQL 和上一次执行的完全相同，结果不会有变化。请修改 SQL，或者基于已有结果直接回答。')
        }
        lastSql = normalized
        const output = await runSql(sql, { errorHints })
        lastResultId = output.resultId
        return output
      },
    }),

    render_chart: tool({
      description:
        '把 run_sql 的查询结果画成图表展示给用户：趋势用 line，类别对比用 bar。x、y、series 必须和查询结果的列名完全一致。字段不对时会返回可用的列，改正后重试。画成功后图表已经展示给用户，回答里只需总结结论。',
      inputSchema: ChartSpecInput,
      execute: async (input): Promise<RenderChartOutput> => {
        const resultId = input.resultId && isUuid(input.resultId) ? input.resultId : lastResultId
        if (!resultId) throw new ToolError('[NO_RESULT] 本轮还没有成功的查询结果，请先调用 run_sql')

        const meta = await loadResultMeta(resultId)
        if (!meta) throw new ToolError(`[RESULT_NOT_FOUND] 找不到结果 ${resultId}。可以省略 resultId，自动使用最近一次查询的结果`)

        const errors = validateChartSpec(input, meta.columns, meta.rowCount)
        if (errors.length > 0) {
          const available = meta.columns.map((c) => `"${c.name}"(${c.type})`).join('、')
          throw new ToolError(`[CHART_INVALID] ${errors.join('；')}。可用的列：${available}`)
        }
        return { spec: { ...input, resultId }, rowCount: meta.rowCount }
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
