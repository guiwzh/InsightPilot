import { z } from 'zod'
import type { ResultColumn } from './tools'

// 图表 DSL：模型只决定"结果里的哪些列映射到图表的哪个位置"，数据本身按 resultId 从后端拉取。
// 不让模型直接写 ECharts 配置或 React 代码：结构固定才能校验、才能评测，也不会有 XSS 和任意代码执行。
//
// 这里用一个扁平对象，而不是按 type 区分的联合类型：DeepSeek 等模型要求工具参数的 JSON Schema
// 顶层必须是 type: "object"，联合类型会生成 anyOf 而被拒绝。各类型必填哪些字段，由 validateChartSpec 检查。

export const CHART_TYPES = ['line', 'bar', 'table'] as const
export type ChartType = (typeof CHART_TYPES)[number]

/** render_chart 工具的输入：resultId 可以省略 */
export const ChartSpecInput = z.object({
  type: z.enum(CHART_TYPES).describe('line：折线图，看趋势；bar：柱状图，做对比；table：只展示表格'),
  title: z.string().describe('图表标题，简短说明这张图看什么'),
  resultId: z.string().optional().describe('run_sql 返回的 resultId；不填则使用本轮最近一次成功查询的结果'),
  x: z.string().optional().describe('line、bar 必填：横轴的列名，通常是日期或类别，必须和查询结果的列名完全一致'),
  y: z.array(z.string()).optional().describe('line、bar 必填：数值列名，可以有多个；有 series 时只放一个'),
  series: z.string().optional().describe('分组列名（如渠道），每个取值画成一条线或一组柱子'),
  stacked: z.boolean().optional().describe('仅 bar：是否堆叠'),
  horizontal: z.boolean().optional().describe('仅 bar：是否横向条形图，类别名较长或类别较多时使用'),
})

export type ChartSpecInput = z.infer<typeof ChartSpecInput>

/** 校验通过、resultId 已确定的图表配置，前端按它渲染 */
export type ChartSpec = ChartSpecInput & { resultId: string }

/** 折线和柱状图最多画多少个数据点，超过说明 SQL 没有先聚合 */
export const MAX_CHART_ROWS = 500

/**
 * 检查图表字段和查询结果是否对得上，返回错误列表（空数组表示通过）。
 * server 的 render_chart 用它决定是否打回给模型重写，前端渲染前也用同一份规则兜底。
 */
export function validateChartSpec(spec: ChartSpecInput, columns: ResultColumn[], rowCount: number): string[] {
  if (spec.type === 'table') return []

  const errors: string[] = []
  const byName = new Map(columns.map((column) => [column.name, column]))
  const missing = (field: string) => !byName.has(field)

  if (rowCount === 0) errors.push('查询结果为空，不能画图')
  if (rowCount > MAX_CHART_ROWS) errors.push(`结果有 ${rowCount} 行，超过 ${MAX_CHART_ROWS} 行不适合画图，请先在 SQL 里聚合`)

  if (!spec.x) errors.push(`${spec.type} 图必须指定 x`)
  else if (missing(spec.x)) errors.push(`x 字段"${spec.x}"不在查询结果中`)

  if (!spec.y || spec.y.length === 0) errors.push(`${spec.type} 图必须指定至少一个 y`)
  for (const field of spec.y ?? []) {
    if (missing(field)) errors.push(`y 字段"${field}"不在查询结果中`)
    else if (byName.get(field)!.type !== 'number') errors.push(`y 字段"${field}"不是数值列`)
  }

  if (spec.series !== undefined) {
    if (missing(spec.series)) errors.push(`series 字段"${spec.series}"不在查询结果中`)
    if (spec.series === spec.x || spec.y?.includes(spec.series)) errors.push('series 不能和 x 或 y 是同一列')
  }
  return errors
}
