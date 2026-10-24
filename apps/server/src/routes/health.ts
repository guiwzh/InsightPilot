import type { HealthResponse } from '@insightpilot/shared'
import { sql } from 'drizzle-orm'
import { Hono } from 'hono'
import { db, readonlySql } from '../db/client'
import { fastModelId, llmMode } from '../core/model'

const succeeds = (p: Promise<unknown>) => p.then(() => true, () => false)

export const health = new Hono().get('/', async (c) => {
  const [admin, readonly, seeded] = await Promise.all([
    succeeds(db.execute(sql`select 1`)),
    succeeds(readonlySql`select 1`),
    // 用只读账号查，顺便确认 analyst_ro 能读到 shop
    readonlySql`select exists (select 1 from shop.orders) as seeded`.then(
      ([row]) => Boolean(row?.seeded),
      () => false,
    ),
  ])

  const body: HealthResponse = {
    ok: admin && readonly,
    db: { admin, readonly, seeded },
    llm: { mode: llmMode, model: fastModelId },
  }
  return c.json(body, body.ok ? 200 : 503)
})
