import type { QueryResultResponse } from '@insightpilot/shared'
import { eq } from 'drizzle-orm'
import { Hono } from 'hono'
import { z } from 'zod'
import { safeFilename, toCsv } from '../core/csv'
import { db } from '../db/client'
import { queryResults } from '../db/schema'

const Id = z.uuid()

async function findResult(rawId: string) {
  const id = Id.safeParse(rawId)
  if (!id.success) return undefined
  const [row] = await db.select().from(queryResults).where(eq(queryResults.id, id.data)).limit(1)
  return row
}

// run_sql 只把 resultId 交给模型，前端按 id 来这里拿完整结果
export const results = new Hono()
  .get('/:id', async (c) => {
    const row = await findResult(c.req.param('id'))
    if (!row) return c.json({ error: '结果不存在' }, 404)

    const body: QueryResultResponse = {
      id: row.id,
      sql: row.sql,
      columns: row.columns,
      rows: row.rows,
      rowCount: row.rowCount,
      truncated: row.truncated,
    }
    return c.json(body)
  })
  // export_csv 经用户确认后返回的下载地址
  .get('/:id/csv', async (c) => {
    const row = await findResult(c.req.param('id'))
    if (!row) return c.text('结果不存在', 404)

    const filename = `${safeFilename(c.req.query('name'))}.csv`
    const csv = toCsv(
      row.columns.map((column) => column.name),
      row.rows,
    )
    return c.body(csv, 200, {
      'Content-Type': 'text/csv; charset=utf-8',
      // filename* 按 RFC 5987 编码，中文文件名在各浏览器都能正确显示
      'Content-Disposition': `attachment; filename="export.csv"; filename*=UTF-8''${encodeURIComponent(filename)}`,
    })
  })
