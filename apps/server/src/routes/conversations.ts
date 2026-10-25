import { Hono } from 'hono'
import { z } from 'zod'
import { deleteConversation, getConversation, listConversations } from '../db/chat-store'
import type { AppEnv } from '../middleware/visitor'

const Id = z.uuid()

// 只能看到、删除自己（同一访客 cookie）的会话
export const conversationsRoute = new Hono<AppEnv>()
  .get('/', async (c) => c.json(await listConversations(c.get('visitorId'))))
  .get('/:id', async (c) => {
    const id = Id.safeParse(c.req.param('id'))
    const conversation = id.success ? await getConversation(c.get('visitorId'), id.data) : undefined
    return conversation ? c.json(conversation) : c.json({ error: '会话不存在' }, 404)
  })
  .delete('/:id', async (c) => {
    const id = Id.safeParse(c.req.param('id'))
    const deleted = id.success && (await deleteConversation(c.get('visitorId'), id.data))
    return deleted ? c.body(null, 204) : c.json({ error: '会话不存在' }, 404)
  })
