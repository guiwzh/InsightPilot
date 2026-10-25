// run_sql 结果的大小控制。纯函数，不依赖数据库，方便单测。
// 交给模型的预览会进入对话历史，之后每一轮都会重复发送：一个 string_agg 拼出来的长文本、
// 一个 json_agg 的大对象，或者几十列的明细，都可能让一次工具结果就占掉上万 token，所以行数、单元格、总长度都要有上限。

/** 预览里单个单元格最多保留的字符数，超出的部分截掉并注明原长度 */
export const PREVIEW_CELL_CHARS = 200

/** 整个预览大致的字符数上限，超出时少给几行（至少给 1 行） */
export const PREVIEW_MAX_CHARS = 30_000

/** 长文本和大的 JSON 值截断成字符串，其余原样返回 */
export function clipCell(value: unknown): unknown {
  const text = typeof value === 'string' ? value : value !== null && typeof value === 'object' ? JSON.stringify(value) : undefined
  if (text === undefined || text.length <= PREVIEW_CELL_CHARS) return value
  return `${text.slice(0, PREVIEW_CELL_CHARS)}…（共 ${text.length} 个字符，已截断）`
}

/** 交给模型的预览：最多 maxRows 行，单元格截断，总长度超过 PREVIEW_MAX_CHARS 时提前停下 */
export function buildPreview(rows: unknown[][], maxRows: number): unknown[][] {
  const preview: unknown[][] = []
  let chars = 0
  for (const row of rows.slice(0, maxRows)) {
    const clipped = row.map(clipCell)
    chars += JSON.stringify(clipped).length
    if (preview.length > 0 && chars > PREVIEW_MAX_CHARS) break
    preview.push(clipped)
  }
  return preview
}

/** 结果的大致字符数是否超过 limit：字符串按长度、JSON 值按序列化后的长度、其余按 8 估算，超过就提前返回 */
export function exceedsChars(rows: unknown[][], limit: number): boolean {
  let chars = 0
  for (const row of rows) {
    for (const value of row) {
      chars += typeof value === 'string' ? value.length : value !== null && typeof value === 'object' ? JSON.stringify(value).length : 8
      if (chars > limit) return true
    }
  }
  return false
}
