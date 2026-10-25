// 看板图表的 ECharts 配置。纯函数，和 specToOption 一样不碰 DOM
import type { StatsResponse } from '@insightpilot/shared'
import type { ChartOption } from '../../components/chart/specToOption'

const TOOL_LABELS: Record<string, string> = {
  list_tables: '查看表',
  describe_table: '看表结构',
  get_metric_definitions: '读口径',
  run_sql: '执行 SQL',
  render_chart: '画图',
  export_csv: '导出 CSV',
}

export const toolLabel = (name: string) => TOOL_LABELS[name] ?? name

const grid = { left: 8, right: 8, top: 40, bottom: 8, containLabel: true }

/** 每天的提问数（柱）和花费（线），双纵轴 */
export function dailyOption(daily: StatsResponse['daily']): ChartOption {
  return {
    tooltip: { trigger: 'axis' },
    legend: { top: 0 },
    grid,
    xAxis: { type: 'category', data: daily.map((d) => d.day.slice(5)) },
    yAxis: [
      { type: 'value', name: '提问数', minInterval: 1 },
      { type: 'value', name: '花费（元）', axisLabel: { formatter: (v: number) => v.toFixed(2) } },
    ],
    series: [
      { type: 'bar', name: '提问数', data: daily.map((d) => d.runs), barMaxWidth: 32 },
      { type: 'line', name: '花费（元）', yAxisIndex: 1, data: daily.map((d) => Number(d.costCny.toFixed(4))) },
    ],
  }
}

/** 每天的延迟 P50 / P95（秒） */
export function latencyOption(daily: StatsResponse['daily']): ChartOption {
  const seconds = (ms: number) => Number((ms / 1000).toFixed(2))
  return {
    tooltip: { trigger: 'axis', valueFormatter: (v) => `${v} 秒` },
    legend: { top: 0 },
    grid,
    xAxis: { type: 'category', data: daily.map((d) => d.day.slice(5)) },
    yAxis: { type: 'value', axisLabel: { formatter: '{value}s' } },
    series: [
      { type: 'line', name: 'P50', data: daily.map((d) => seconds(d.p50LatencyMs)) },
      { type: 'line', name: 'P95', data: daily.map((d) => seconds(d.p95LatencyMs)) },
    ],
  }
}

/** 各工具的调用次数和出错次数（横向条形图） */
export function toolsOption(tools: StatsResponse['tools']): ChartOption {
  return {
    tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' } },
    legend: { top: 0 },
    grid,
    xAxis: { type: 'value', minInterval: 1 },
    yAxis: { type: 'category', inverse: true, data: tools.map((t) => toolLabel(t.name)) },
    series: [
      { type: 'bar', name: '调用次数', data: tools.map((t) => t.calls), barMaxWidth: 20 },
      { type: 'bar', name: '出错次数', data: tools.map((t) => t.errors), barMaxWidth: 20 },
    ],
  }
}
