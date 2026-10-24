import type { ChartSpec, ResultColumn } from '@insightpilot/shared'
import { describe, expect, it } from 'vitest'
import { compactNumber, formatTooltipValue, specToOption, type ChartData } from './specToOption'

const col = (name: string, type: ResultColumn['type']): ResultColumn => ({ name, type })

// 两天 × 两个渠道，第二天"直播间"缺数据
const byChannel: ChartData = {
  columns: [col('日期', 'date'), col('渠道', 'string'), col('新增用户数', 'number'), col('转化率(%)', 'number')],
  rows: [
    ['2026-09-24', '自然搜索', 42, 19.12],
    ['2026-09-24', '直播间', 11, 22.36],
    ['2026-09-25', '自然搜索', 37, 20.5],
  ],
}

const daily: ChartData = {
  columns: [col('日期', 'date'), col('订单数', 'number'), col('GMV', 'number')],
  rows: [
    ['2026-09-28', 370, 354801.49],
    ['2026-09-29', '356', 296479.9],
    ['2026-09-30', null, 360968.01],
  ],
}

const spec = (overrides: Partial<ChartSpec>): ChartSpec => ({ type: 'line', title: 't', resultId: 'r', ...overrides })

type AnyOption = Record<string, any>
const build = (s: ChartSpec, d: ChartData) => specToOption(s, d) as AnyOption

describe('specToOption', () => {
  it('没有 series 时，每个 y 字段是一条线，横轴沿用结果顺序', () => {
    const option = build(spec({ x: '日期', y: ['订单数', 'GMV'] }), daily)
    expect(option.xAxis.data).toEqual(['2026-09-28', '2026-09-29', '2026-09-30'])
    expect(option.series.map((s: AnyOption) => s.name)).toEqual(['订单数', 'GMV'])
  })

  it('字符串数字转成 number，空值保留为 null（折线断开而不是落到 0）', () => {
    const option = build(spec({ x: '日期', y: ['订单数'] }), daily)
    expect(option.series[0].data).toEqual([370, 356, null])
  })

  it('有 series 时按分组拆成多条线，缺失的组合补 null', () => {
    const option = build(spec({ x: '日期', y: ['新增用户数'], series: '渠道' }), byChannel)
    expect(option.series).toHaveLength(2)
    expect(option.series[0]).toMatchObject({ name: '自然搜索', data: [42, 37] })
    expect(option.series[1]).toMatchObject({ name: '直播间', data: [11, null] })
  })

  it('series 和多个 y 同时存在时，系列名是"分组 · 指标"', () => {
    const option = build(spec({ x: '日期', y: ['新增用户数', '转化率(%)'], series: '渠道' }), byChannel)
    expect(option.series.map((s: AnyOption) => s.name)).toEqual([
      '自然搜索 · 新增用户数',
      '自然搜索 · 转化率(%)',
      '直播间 · 新增用户数',
      '直播间 · 转化率(%)',
    ])
  })

  it('只有一个系列时不显示图例，多个系列时显示可滚动图例', () => {
    expect(build(spec({ x: '日期', y: ['订单数'] }), daily).legend).toBeUndefined()
    expect(build(spec({ x: '日期', y: ['订单数', 'GMV'] }), daily).legend).toMatchObject({ type: 'scroll' })
  })

  it('堆叠柱状图给每个系列设置同一个 stack', () => {
    const option = build(spec({ type: 'bar', x: '日期', y: ['新增用户数'], series: '渠道', stacked: true }), byChannel)
    expect(option.series.every((s: AnyOption) => s.type === 'bar' && s.stack === 'total')).toBe(true)
  })

  it('横向条形图交换坐标轴，类别轴倒序让第一项在最上面', () => {
    const option = build(spec({ type: 'bar', x: '日期', y: ['订单数'], horizontal: true }), daily)
    expect(option.xAxis.type).toBe('value')
    expect(option.yAxis).toMatchObject({ type: 'category', inverse: true, data: ['2026-09-28', '2026-09-29', '2026-09-30'] })
  })

  it('百分比字段的坐标轴和提示框带上 %', () => {
    const option = build(spec({ x: '日期', y: ['转化率(%)'], series: '渠道' }), byChannel)
    expect(option.yAxis.axisLabel.formatter(19.125)).toBe('19.13%')
    expect(option.tooltip.valueFormatter(22.36)).toBe('22.36%')
  })

  it('普通数值坐标轴用万、亿缩写', () => {
    const option = build(spec({ x: '日期', y: ['GMV'] }), daily)
    expect(option.yAxis.axisLabel.formatter(354801.49)).toBe('35.48万')
  })

  it('点数不多时显示数据点', () => {
    expect(build(spec({ x: '日期', y: ['订单数'] }), daily).series[0].showSymbol).toBe(true)
  })

  it('字段不在结果里、或者是 table 类型时抛错', () => {
    expect(() => specToOption(spec({ x: '日期', y: ['不存在'] }), daily)).toThrow('不存在')
    expect(() => specToOption(spec({ type: 'table' }), daily)).toThrow()
  })
})

describe('数字格式化', () => {
  it.each([
    [999, '999'],
    [12345, '1.23万'],
    [150000000, '1.5亿'],
    [-25000, '-2.5万'],
  ])('compactNumber(%s) = %s', (input, expected) => {
    expect(compactNumber(input)).toBe(expected)
  })

  it('提示框里的空值显示为破折号', () => {
    expect(formatTooltipValue(null, false)).toBe('—')
    expect(formatTooltipValue(1234.567, false)).toBe('1,234.57')
  })
})
