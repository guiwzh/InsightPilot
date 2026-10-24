import { describe, expect, it } from 'vitest'
import { MAX_CHART_ROWS, validateChartSpec, type ChartSpecInput } from './chart-spec'
import type { ResultColumn } from './tools'

const columns: ResultColumn[] = [
  { name: '日期', type: 'date' },
  { name: '渠道', type: 'string' },
  { name: '新增用户数', type: 'number' },
  { name: '转化率(%)', type: 'number' },
]
const line = (overrides: Partial<ChartSpecInput>): ChartSpecInput => ({ type: 'line', title: 't', x: '日期', y: ['新增用户数'], ...overrides })

describe('validateChartSpec', () => {
  it('字段齐全时通过', () => {
    expect(validateChartSpec(line({ series: '渠道' }), columns, 56)).toEqual([])
  })

  it('table 类型不检查字段', () => {
    expect(validateChartSpec({ type: 'table', title: 't' }, columns, 0)).toEqual([])
  })

  it('折线图缺少 x 或 y', () => {
    expect(validateChartSpec(line({ x: undefined }), columns, 7)).toContain('line 图必须指定 x')
    expect(validateChartSpec(line({ y: [] }), columns, 7)).toContain('line 图必须指定至少一个 y')
  })

  it('字段名对不上（比如漏了 "(%)"）', () => {
    expect(validateChartSpec(line({ y: ['转化率'] }), columns, 7)).toEqual(['y 字段"转化率"不在查询结果中'])
  })

  it('y 必须是数值列', () => {
    expect(validateChartSpec(line({ y: ['渠道'] }), columns, 7)).toEqual(['y 字段"渠道"不是数值列'])
  })

  it('series 不能和 x、y 重复', () => {
    expect(validateChartSpec(line({ series: '日期' }), columns, 7)).toContain('series 不能和 x 或 y 是同一列')
  })

  it('空结果和过多的行都不画图', () => {
    expect(validateChartSpec(line({}), columns, 0)).toContain('查询结果为空，不能画图')
    expect(validateChartSpec(line({}), columns, MAX_CHART_ROWS + 1)[0]).toMatch(/请先在 SQL 里聚合/)
  })
})
