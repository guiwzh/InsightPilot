// list_tables / describe_table 的实现：从 PostgreSQL 系统目录读表结构、中文注释、主外键，
// 再从 pg_stats 读常见取值和取值范围。pg_stats 是 ANALYZE 的统计结果，不用扫表，几乎零成本。
import type { ColumnInfo, DescribeTableOutput, ListTablesOutput, TableDetail } from '@insightpilot/shared'
import { readonlySql } from '../db/client'
import { SHOP_TABLES } from './sql-guard'

// 表结构在进程运行期间不会变，缓存起来。重新造数后重启 server 即可刷新
let tableListCache: ListTablesOutput | undefined
const tableDetailCache = new Map<string, TableDetail>()

export async function listTables(): Promise<ListTablesOutput> {
  tableListCache ??= {
    tables: await readonlySql<{ name: string; comment: string; rowEstimate: number }[]>`
      SELECT c.relname AS name,
             coalesce(obj_description(c.oid, 'pg_class'), '') AS comment,
             greatest(c.reltuples, 0)::bigint AS "rowEstimate"
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'shop' AND c.relkind = 'r' AND c.relname = ANY(${[...SHOP_TABLES]})
      ORDER BY c.relname`,
  }
  return tableListCache
}

/**
 * hints：是否带上中文注释、常见取值和取值范围。
 * 关掉后只剩列名、类型和主外键，评测时用来衡量这些信息对准确率的贡献。
 */
export async function describeTables(requested: string[], { hints = true } = {}): Promise<DescribeTableOutput> {
  const names = [...new Set(requested.map((name) => name.trim().toLowerCase().replace(/^shop\./, '')))]
  const known = names.filter((name) => (SHOP_TABLES as readonly string[]).includes(name))
  const notFound = names.filter((name) => !known.includes(name))

  const missing = known.filter((name) => !tableDetailCache.has(name))
  if (missing.length > 0) {
    for (const detail of await loadTableDetails(missing)) tableDetailCache.set(detail.name, detail)
  }

  const details = known.map((name) => tableDetailCache.get(name)!)
  return {
    tables: hints ? details : details.map(withoutHints),
    ...(notFound.length > 0 && { notFound }),
  }
}

function withoutHints(table: TableDetail): TableDetail {
  return {
    ...table,
    comment: '',
    columns: table.columns.map(({ comment: _comment, commonValues: _values, range: _range, ...column }) => ({ ...column, comment: '' })),
  }
}

export async function listTablesFor({ hints = true } = {}): Promise<ListTablesOutput> {
  const list = await listTables()
  return hints ? list : { tables: list.tables.map((table) => ({ ...table, comment: '' })) }
}

async function loadTableDetails(tables: string[]): Promise<TableDetail[]> {
  const [{ tables: summaries }, columns, keys, stats] = await Promise.all([
    listTables(),
    readonlySql<{ table: string; name: string; type: string; nullable: boolean; comment: string }[]>`
      SELECT c.relname AS table, a.attname AS name, format_type(a.atttypid, a.atttypmod) AS type,
             NOT a.attnotnull AS nullable, coalesce(col_description(c.oid, a.attnum), '') AS comment
      FROM pg_attribute a
      JOIN pg_class c ON c.oid = a.attrelid
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'shop' AND c.relname = ANY(${tables}) AND a.attnum > 0 AND NOT a.attisdropped
      ORDER BY c.relname, a.attnum`,
    readonlySql<{ table: string; column: string; kind: 'p' | 'f'; refTable: string | null; refColumn: string | null }[]>`
      SELECT cl.relname AS table, att.attname AS column, con.contype AS kind,
             fcl.relname AS "refTable", fatt.attname AS "refColumn"
      FROM pg_constraint con
      JOIN pg_class cl ON cl.oid = con.conrelid
      JOIN pg_namespace n ON n.oid = cl.relnamespace
      CROSS JOIN LATERAL unnest(con.conkey) WITH ORDINALITY AS k(attnum, ord)
      JOIN pg_attribute att ON att.attrelid = con.conrelid AND att.attnum = k.attnum
      LEFT JOIN pg_class fcl ON fcl.oid = con.confrelid
      LEFT JOIN LATERAL unnest(con.confkey) WITH ORDINALITY AS fk(attnum, ord) ON fk.ord = k.ord
      LEFT JOIN pg_attribute fatt ON fatt.attrelid = con.confrelid AND fatt.attnum = fk.attnum
      WHERE n.nspname = 'shop' AND con.contype IN ('p', 'f') AND cl.relname = ANY(${tables})`,
    readonlySql<{ table: string; column: string; nDistinct: number; mcv: string | null; histogram: string | null }[]>`
      SELECT tablename AS table, attname AS column, n_distinct AS "nDistinct",
             most_common_vals::text AS mcv, histogram_bounds::text AS histogram
      FROM pg_stats
      WHERE schemaname = 'shop' AND tablename = ANY(${tables})`,
  ])

  const keyOf = (table: string, column: string) => `${table}.${column}`
  const keyByColumn = new Map(keys.map((k) => [keyOf(k.table, k.column), k]))
  const statsByColumn = new Map(stats.map((s) => [keyOf(s.table, s.column), s]))

  return tables.map((table) => {
    const summary = summaries.find((s) => s.name === table) ?? { name: table, comment: '', rowEstimate: 0 }
    const tableColumns: ColumnInfo[] = columns
      .filter((c) => c.table === table)
      .map(({ name, type, nullable, comment }) => {
        const info: ColumnInfo = { name, type, comment, nullable }
        const key = keyByColumn.get(keyOf(table, name))
        if (key?.kind === 'p') info.primaryKey = true
        if (key?.kind === 'f' && key.refTable) info.references = `${key.refTable}.${key.refColumn}`
        // 主键、外键的取值对写 SQL 没有帮助，只给普通列补充统计信息
        if (!key) Object.assign(info, describeValues(type, statsByColumn.get(keyOf(table, name))))
        return info
      })
    return { ...summary, columns: tableColumns }
  })
}

/** 低基数列给常见取值（如订单状态、渠道类型），数值和时间列给大致范围 */
function describeValues(type: string, stats?: { nDistinct: number; mcv: string | null; histogram: string | null }) {
  if (!stats) return {}
  const isNumericOrTime = /int|numeric|double|real|date|time/.test(type)
  // n_distinct 为负数表示"不同值占总行数的比例"，说明基数很高
  const lowCardinality = stats.nDistinct > 0 && stats.nDistinct <= 50

  if (lowCardinality && stats.mcv) return { commonValues: parsePgArray(stats.mcv).slice(0, 10) }
  if (isNumericOrTime && stats.histogram) {
    const bounds = parsePgArray(stats.histogram)
    if (bounds.length >= 2) return { range: [bounds[0], bounds.at(-1)!] as [string, string] }
  }
  return {}
}

/** 解析 PostgreSQL 一维数组的文本形式，如 {completed,"a b",refunded} */
export function parsePgArray(text: string): string[] {
  const body = text.trim().replace(/^\{/, '').replace(/\}$/, '')
  const values: string[] = []
  let current = ''
  let quoted = false
  for (let i = 0; i < body.length; i++) {
    const ch = body[i]
    if (quoted) {
      if (ch === '\\') current += body[++i] ?? ''
      else if (ch === '"') quoted = false
      else current += ch
    } else if (ch === '"') {
      quoted = true
    } else if (ch === ',') {
      values.push(current)
      current = ''
    } else {
      current += ch
    }
  }
  if (body.length > 0) values.push(current)
  return values
}
