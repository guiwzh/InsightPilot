// 图表 DSL → ECharts 配置。纯函数：不碰 DOM、不依赖 ECharts 运行时，可以直接单测。
import type { ChartSpec, QueryResultResponse } from '@insightpilot/shared'
import type { BarSeriesOption, LineSeriesOption } from 'echarts/charts'
import type { GridComponentOption, LegendComponentOption, TooltipComponentOption } from 'echarts/components'
import type { ComposeOption } from 'echarts/core'

export type ChartOption = ComposeOption<
  LineSeriesOption | BarSeriesOption | GridComponentOption | LegendComponentOption | TooltipComponentOption
>

export type ChartData = Pick<QueryResultResponse, 'columns' | 'rows'>

const EMPTY_LABEL = '（空）'
/** 横轴点数不多时显示数据点，超过就只画线，避免挤成一团 */
const MAX_POINTS_WITH_SYMBOL = 31

const label = (value: unknown) => (value === null || value === undefined ? EMPTY_LABEL : String(value))

function toNumber(value: unknown): number | null {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null
  if (typeof value === 'string' && value.trim() !== '' && Number.isFinite(Number(value))) return Number(value)
  return null
}

/** 按出现顺序去重：SQL 已经排好序，横轴和图例都沿用这个顺序 */
const uniqueInOrder = (values: string[]) => [...new Set(values)]

const round2 = (n: number) => Math.round(n * 100) / 100

/** 坐标轴用的紧凑数字：12345 → 1.23万，150000000 → 1.5亿 */
export function compactNumber(value: number): string {
  const abs = Math.abs(value)
  if (abs >= 1e8) return `${round2(value / 1e8)}亿`
  if (abs >= 1e4) return `${round2(value / 1e4)}万`
  return round2(value).toLocaleString('zh-CN')
}

/** 列名带 % 的按百分数展示（提示词要求比率列写成 "转化率(%)" 这样的别名） */
export const isPercentField = (name: string) => name.includes('%')

export function formatTooltipValue(value: unknown, percent: boolean): string {
  const n = toNumber(value)
  if (n === null) return '—'
  const text = round2(n).toLocaleString('zh-CN')
  return percent ? `${text}%` : text
}

export function specToOption(spec: ChartSpec, data: ChartData): ChartOption {
  if (spec.type === 'table' || !spec.x || !spec.y?.length) {
    throw new Error('只有 line、bar 图需要 ECharts 配置，且必须有 x 和 y')
  }

  const indexOf = (name: string) => {
    const index = data.columns.findIndex((column) => column.name === name)
    if (index < 0) throw new Error(`字段"${name}"不在查询结果中`)
    return index
  }
  const xIndex = indexOf(spec.x)
  const yFields = spec.y.map((name) => ({ name, index: indexOf(name) }))
  const seriesIndex = spec.series ? indexOf(spec.series) : undefined

  const categories = uniqueInOrder(data.rows.map((row) => label(row[xIndex])))

  /** 把一组行按横轴对齐成数组，缺失的点留 null（折线会断开，而不是被当成 0） */
  const align = (rows: unknown[][], valueIndex: number) => {
    const byX = new Map<string, number | null>()
    for (const row of rows) {
      const key = label(row[xIndex])
      // 同一个横轴值出现多次说明 SQL 没聚合干净，只取第一次，不擅自求和
      if (!byX.has(key)) byX.set(key, toNumber(row[valueIndex]))
    }
    return categories.map((category) => byX.get(category) ?? null)
  }

  const lines: { name: string; data: (number | null)[] }[] = []
  if (seriesIndex === undefined) {
    for (const y of yFields) lines.push({ name: y.name, data: align(data.rows, y.index) })
  } else {
    const groups = uniqueInOrder(data.rows.map((row) => label(row[seriesIndex])))
    for (const group of groups) {
      const rows = data.rows.filter((row) => label(row[seriesIndex]) === group)
      for (const y of yFields) {
        lines.push({ name: yFields.length > 1 ? `${group} · ${y.name}` : group, data: align(rows, y.index) })
      }
    }
  }

  const isBar = spec.type === 'bar'
  const horizontal = isBar && spec.horizontal === true
  const percent = spec.y.every(isPercentField)
  const hasLegend = lines.length > 1

  const valueAxis = {
    type: 'value' as const,
    axisLabel: { formatter: (value: number) => (percent ? `${round2(value)}%` : compactNumber(value)) },
  }
  const categoryAxis = {
    type: 'category' as const,
    data: categories,
    boundaryGap: isBar,
    axisLabel: { hideOverlap: true },
  }

  return {
    tooltip: {
      trigger: 'axis',
      axisPointer: { type: isBar ? 'shadow' : 'line' },
      valueFormatter: (value) => formatTooltipValue(value, percent),
    },
    ...(hasLegend && { legend: { type: 'scroll', top: 0 } }),
    grid: { left: 8, right: 16, top: hasLegend ? 40 : 16, bottom: 8, containLabel: true },
    xAxis: horizontal ? valueAxis : categoryAxis,
    // 横向条形图让第一个类别排在最上面，和表格顺序一致
    yAxis: horizontal ? { ...categoryAxis, inverse: true } : valueAxis,
    series: lines.map(({ name, data: values }) =>
      isBar
        ? { type: 'bar', name, data: values, barMaxWidth: 32, ...(spec.stacked && { stack: 'total' }), emphasis: { focus: 'series' } }
        : { type: 'line', name, data: values, showSymbol: categories.length <= MAX_POINTS_WITH_SYMBOL, emphasis: { focus: 'series' } },
    ),
  }
}
