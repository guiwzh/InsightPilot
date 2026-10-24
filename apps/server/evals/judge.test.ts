import { describe, expect, it } from 'vitest'
import { cellEquals, judge } from './judge'

describe('cellEquals', () => {
  it('整数要求完全相等', () => {
    expect(cellEquals(1347, 1347)).toBe(true)
    expect(cellEquals(1347, 1346)).toBe(false)
    expect(cellEquals(1347, '1347')).toBe(true)
  })

  it('小数允许四舍五入的误差', () => {
    expect(cellEquals(8.56, 8.6)).toBe(true)
    expect(cellEquals(354801.49, 354801.5)).toBe(true)
    expect(cellEquals(8.56, 0.0856)).toBe(false)
  })

  it('日期按标准值的精度比较', () => {
    expect(cellEquals('2026-07', '2026-07-01')).toBe(true)
    expect(cellEquals('2026-09-24', '2026-09-24 00:00:00+08')).toBe(true)
    expect(cellEquals('2026-09-24', '2026-09-25')).toBe(false)
  })
})

describe('judge', () => {
  const gold = { rows: [['母婴', 8.56], ['家居', 5.66]] }

  it('忽略列名、列顺序和行顺序，多出来的列不影响', () => {
    const candidate = { rows: [[2351, 133, '家居', 5.66], [2138, 183, '母婴', 8.56]] }
    expect(judge(gold, [candidate])).toMatchObject({ strict: true, how: 'strict' })
  })

  it('同一行里的值必须对得上，不能各列分别对上', () => {
    const swapped = { rows: [['母婴', 5.66], ['家居', 8.56]] }
    expect(judge(gold, [swapped]).lenient).toBe(false)
  })

  it('多一行合计算宽松通过', () => {
    const withTotal = { rows: [['母婴', 8.56], ['家居', 5.66], ['合计', 7.1]] }
    expect(judge(gold, [withTotal])).toMatchObject({ strict: false, lenient: true, how: 'superset' })
  })

  it('模型结果比标准结果多太多行，不算包含', () => {
    const huge = { rows: [['母婴', 8.56], ['家居', 5.66], ...Array.from({ length: 20 }, (_, i) => [`x${i}`, i])] }
    expect(judge(gold, [huge]).lenient).toBe(false)
  })

  it('宽表和长表互换：标准结果只有一行时按数值是否都出现来判断', () => {
    const wide = { rows: [[119, 1347, 1031.93]] }
    const long = { rows: [['前一周', 119], ['直播周', 1347], ['增长(%)', 1031.93]] }
    expect(judge(wide, [long])).toMatchObject({ lenient: true, how: 'values' })
  })

  it('多次查询里任意一次对上就算对', () => {
    const total = { rows: [[367]] }
    const daily = { rows: Array.from({ length: 30 }, (_, i) => [`2026-09-${String(i + 1).padStart(2, '0')}`, 12]) }
    expect(judge(total, [{ rows: [[5713, 367, 6.42]] }, daily])).toMatchObject({ lenient: true, candidate: 0 })
  })

  it('没有查询结果时判错', () => {
    expect(judge(gold, [])).toEqual({ strict: false, lenient: false })
  })
})
