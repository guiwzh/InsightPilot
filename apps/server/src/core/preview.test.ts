import { describe, expect, it } from 'vitest'
import { buildPreview, clipCell, exceedsChars, PREVIEW_CELL_CHARS, PREVIEW_MAX_CHARS } from './preview'

describe('clipCell', () => {
  it('短文本、数字、空值原样返回', () => {
    expect(clipCell('直播间')).toBe('直播间')
    expect(clipCell(765)).toBe(765)
    expect(clipCell(null)).toBe(null)
    expect(clipCell(['a', 'b'])).toEqual(['a', 'b'])
  })

  it('长文本截断，并注明原长度', () => {
    const clipped = clipCell('好'.repeat(5000)) as string
    expect(clipped.startsWith('好'.repeat(PREVIEW_CELL_CHARS) + '…')).toBe(true)
    expect(clipped).toContain('共 5000 个字符，已截断')
  })

  it('大的 JSON 值（如 json_agg）序列化后截断', () => {
    const clipped = clipCell(Array.from({ length: 1000 }, (_, i) => ({ id: i })))
    expect(typeof clipped).toBe('string')
    expect((clipped as string).length).toBeLessThan(PREVIEW_CELL_CHARS + 30)
  })
})

describe('buildPreview', () => {
  it('最多取 maxRows 行', () => {
    const rows = Array.from({ length: 300 }, (_, i) => [i, `渠道${i}`])
    expect(buildPreview(rows, 100)).toHaveLength(100)
  })

  it('总长度超过上限时少给几行', () => {
    const rows = Array.from({ length: 100 }, () => Array.from({ length: 10 }, () => 'x'.repeat(PREVIEW_CELL_CHARS)))
    const preview = buildPreview(rows, 100)
    expect(preview.length).toBeLessThan(100)
    expect(JSON.stringify(preview).length).toBeLessThanOrEqual(PREVIEW_MAX_CHARS)
  })

  it('至少给 1 行', () => {
    const wide = [Array.from({ length: 500 }, () => 'x'.repeat(PREVIEW_CELL_CHARS))]
    expect(buildPreview(wide, 100)).toHaveLength(1)
  })
})

describe('exceedsChars', () => {
  it('按字符串长度、JSON 长度估算', () => {
    expect(exceedsChars([['a'.repeat(10)]], 10)).toBe(false)
    expect(exceedsChars([['a'.repeat(11)]], 10)).toBe(true)
    expect(exceedsChars([[{ text: 'a'.repeat(20) }]], 10)).toBe(true)
  })

  it('很多行的小结果累计起来也会超', () => {
    const rows = Array.from({ length: 1000 }, () => ['x'.repeat(100), 1])
    expect(exceedsChars(rows, 50_000)).toBe(true)
    expect(exceedsChars(rows, 200_000)).toBe(false)
  })
})
