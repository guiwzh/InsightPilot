// 执行结果比对：把模型查出来的结果和标准 SQL 的结果比，忽略列名和行序。
// 第 2、3 周的经验是"形状不同但数值都对"很常见（多了一行合计、多带一个月做对比、宽表和长表互换），
// 所以分两档：
// - strict：行数相同，每个标准列都能对应到模型结果的某一列，逐行完全一致；
// - lenient（主指标）：strict，或者标准结果的行被模型结果包含（模型最多多出约 3 倍的行），
//   或者标准结果只有 1 行时，它的所有数值都能在模型结果里找到（应对宽表和长表互换）。
//   这条规则不看行内对应关系，所以只用于单行结果；两行以上时会把"数值对调"误判为正确。
// 一次对话里可能有多次查询（比如先查合计、再按天拆开画图），任意一次对上就算对。

export type Table = { rows: unknown[][] }
export type Verdict = { strict: boolean; lenient: boolean; how?: 'strict' | 'superset' | 'values'; candidate?: number }

const DATE_LIKE = /^\d{4}-\d{2}(-\d{2})?/

function toNumber(value: unknown): number | null {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null
  if (typeof value === 'string' && /^-?\d+(\.\d+)?$/.test(value.trim())) return Number(value)
  return null
}

/** 单元格是否相等：数值有容差（整数要求完全相等），日期按标准值的精度比较（月 / 日） */
export function cellEquals(gold: unknown, candidate: unknown): boolean {
  if (gold === null || gold === undefined) return candidate === null || candidate === undefined
  const g = toNumber(gold)
  const c = toNumber(candidate)
  if (g !== null && c !== null) {
    if (Number.isInteger(g) && Math.abs(g) >= 1) return g === c
    return Math.abs(g - c) <= Math.max(0.051, Math.abs(g) * 0.001)
  }
  if (typeof gold === 'string' && typeof candidate === 'string') {
    const gs = gold.trim()
    const cs = candidate.trim()
    const match = gs.match(DATE_LIKE)
    if (match && match[0].length === gs.length) return cs.slice(0, gs.length) === gs
    return gs === cs
  }
  return false
}

/** 多重集合包含：gold 的每个值都能在 candidate 里找到一个还没被用掉的相等值 */
function multisetContains(candidate: unknown[], gold: unknown[]): boolean {
  if (gold.length > candidate.length) return false
  const used = new Array<boolean>(candidate.length).fill(false)
  outer: for (const g of gold) {
    for (let i = 0; i < candidate.length; i++) {
      if (!used[i] && cellEquals(g, candidate[i])) {
        used[i] = true
        continue outer
      }
    }
    return false
  }
  return true
}

const column = (table: Table, index: number) => table.rows.map((row) => row[index])
const width = (table: Table) => table.rows[0]?.length ?? 0

/** 列映射的所有组合（每个标准列最多保留 3 个候选列，避免组合爆炸） */
function* mappings(options: number[][], index = 0, current: number[] = []): Generator<number[]> {
  if (index === options.length) {
    yield current
    return
  }
  for (const choice of options[index].slice(0, 3)) yield* mappings(options, index + 1, [...current, choice])
}

function matchRows(gold: Table, candidate: Table, exact: boolean): boolean {
  if (gold.rows.length === 0) return candidate.rows.length === 0
  if (exact ? candidate.rows.length !== gold.rows.length : candidate.rows.length < gold.rows.length) return false

  // 先为每个标准列找到值能对上的模型列
  const options = Array.from({ length: width(gold) }, (_, g) =>
    Array.from({ length: width(candidate) }, (_, c) => c).filter((c) => multisetContains(column(candidate, c), column(gold, g))),
  )
  if (options.some((list) => list.length === 0)) return false

  // 再按列映射逐行比较，保证"同一行里的值"也对得上，而不只是每列各自对得上
  for (const mapping of mappings(options)) {
    const projected = candidate.rows.map((row) => mapping.map((c) => row[c]))
    const used = new Array<boolean>(projected.length).fill(false)
    const ok = gold.rows.every((goldRow) => {
      const index = projected.findIndex((row, i) => !used[i] && row.every((cell, j) => cellEquals(goldRow[j], cell)))
      if (index < 0) return false
      used[index] = true
      return true
    })
    if (ok) return true
  }
  return false
}

export function judge(gold: Table, candidates: Table[]): Verdict {
  for (const [index, candidate] of candidates.entries()) {
    if (matchRows(gold, candidate, true)) return { strict: true, lenient: true, how: 'strict', candidate: index }
  }
  for (const [index, candidate] of candidates.entries()) {
    if (candidate.rows.length <= gold.rows.length * 3 + 2 && matchRows(gold, candidate, false)) {
      return { strict: false, lenient: true, how: 'superset', candidate: index }
    }
  }
  if (gold.rows.length === 1) {
    const goldCells = gold.rows.flat()
    for (const [index, candidate] of candidates.entries()) {
      const cells = candidate.rows.flat()
      if (cells.length <= goldCells.length * 4 + 12 && multisetContains(cells, goldCells)) {
        return { strict: false, lenient: true, how: 'values', candidate: index }
      }
    }
  }
  return { strict: false, lenient: false }
}
