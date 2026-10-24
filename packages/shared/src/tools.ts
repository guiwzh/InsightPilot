import { z } from 'zod'

// Agent 工具的输入（Zod）和输出（TS 类型）。server 定义工具时用，web 渲染工具轨迹时用，
// 两边共用一份定义，工具改了字段，前端在类型检查时就能发现。

export const ListTablesInput = z.object({})

export const DescribeTableInput = z.object({
  tables: z.array(z.string()).min(1).max(7).describe('要查看的表名，如 ["orders", "users"]，可以不带 shop. 前缀'),
})

export const GetMetricDefinitionsInput = z.object({
  keywords: z
    .array(z.string())
    .optional()
    .describe('指标关键词，如 ["转化率", "GMV"]；不传则返回全部指标'),
})

// purpose 放在 sql 前面：流式生成时先出 purpose，界面可以先显示"正在查什么"
export const RunSqlInput = z.object({
  purpose: z.string().describe('一句话说明这条 SQL 查什么，会展示给用户，如"按天统计各渠道新增用户"'),
  sql: z.string().describe('一条 PostgreSQL SELECT 语句（可以用 WITH），只能查询 shop 下的表'),
})

export type TableSummary = {
  name: string
  comment: string
  rowEstimate: number
}

export type ColumnInfo = {
  name: string
  type: string
  comment: string
  nullable: boolean
  primaryKey?: boolean
  /** 外键指向，如 "users.id" */
  references?: string
  /** 低基数列的常见取值（来自 pg_stats） */
  commonValues?: string[]
  /** 数值、时间列的大致范围（来自 pg_stats 直方图） */
  range?: [string, string]
}

export type TableDetail = TableSummary & { columns: ColumnInfo[] }

export type MetricDefinition = {
  name: string
  aliases: string[]
  definition: string
  sql: string
  notes?: string
}

/** 结果列的展示类型，前端据此决定对齐方式和格式化，图表据此选择坐标轴 */
export type ResultColumnType = 'number' | 'string' | 'date' | 'datetime' | 'boolean' | 'other'

export type ResultColumn = {
  name: string
  type: ResultColumnType
}

export type ListTablesOutput = { tables: TableSummary[] }

export type DescribeTableOutput = { tables: TableDetail[]; notFound?: string[] }

export type GetMetricDefinitionsOutput = { metrics: MetricDefinition[]; note?: string }

export type RunSqlOutput = {
  /** 完整结果存在 app.query_results，前端按 id 拉取 */
  resultId: string
  rowCount: number
  /** 超过 1000 行时被截断 */
  truncated: boolean
  durationMs: number
  columns: ResultColumn[]
  /** 给模型看的前几十行，按 columns 的顺序排列 */
  preview: unknown[][]
  note: string
}

/** 与 AI SDK 的 UITools 结构一致，web 端用它给 UIMessage 的工具 part 加类型 */
export type InsightUITools = {
  list_tables: { input: z.infer<typeof ListTablesInput>; output: ListTablesOutput }
  describe_table: { input: z.infer<typeof DescribeTableInput>; output: DescribeTableOutput }
  get_metric_definitions: { input: z.infer<typeof GetMetricDefinitionsInput>; output: GetMetricDefinitionsOutput }
  run_sql: { input: z.infer<typeof RunSqlInput>; output: RunSqlOutput }
}
