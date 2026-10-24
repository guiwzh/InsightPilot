import { z } from 'zod'

// 图表 DSL：模型只决定"结果里的哪些字段映射到图表的哪个位置"，数据本身按 resultId 从后端拉取。
// 第 3 周接入 render_chart 工具时使用；先做 line / bar / table，pie、kpi 有余力再加。
export const ChartSpec = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('line'),
    resultId: z.string(),
    title: z.string(),
    x: z.string(),
    y: z.array(z.string()).min(1),
    series: z.string().optional(),
  }),
  z.object({
    type: z.literal('bar'),
    resultId: z.string(),
    title: z.string(),
    x: z.string(),
    y: z.array(z.string()).min(1),
    stacked: z.boolean().optional(),
    horizontal: z.boolean().optional(),
  }),
  z.object({
    type: z.literal('table'),
    resultId: z.string(),
    title: z.string(),
  }),
])

export type ChartSpec = z.infer<typeof ChartSpec>
