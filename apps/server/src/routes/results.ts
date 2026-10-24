import type { QueryResultResponse } from '@insightpilot/shared'
import { eq } from 'drizzle-orm'
import { Hono } from 'hono'
import { z } from 'zod'
import { db } from '../db/client'
import { queryResults } from '../db/schema'

const Id = z.uuid()

// run_sql 只把 resultId 交给模型，前端按 id 来这里拿完整结果
export const results = new Hono().get('/:id', async (c) => {
  const id = Id.safeParse(c.req.param('id'))
  if (!id.success) return c.json({ error: '结果不存在' }, 404)

  const [row] = await db.select().from(queryResults).where(eq(queryResults.id, id.data)).limit(1)
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
