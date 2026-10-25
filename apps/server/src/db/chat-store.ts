// 会话持久化：conversations + messages。消息直接存 AI SDK 的 UIMessage，读出来原样还给 useChat。
import type { ConversationDetail, ConversationSummary } from '@insightpilot/shared'
import type { UIMessage } from 'ai'
import { and, asc, desc, eq, sql } from 'drizzle-orm'
import { db } from './client'
import { conversations, messages as messagesTable } from './schema'

const TITLE_LENGTH = 30

function titleOf(messages: UIMessage[]) {
  const first = messages.find((m) => m.role === 'user')
  const text = first?.parts.map((p) => (p.type === 'text' ? p.text : '')).join('').trim() ?? ''
  return text.slice(0, TITLE_LENGTH) || '新对话'
}

/**
 * 保存整段会话（新建或更新）。会话属于别的访客时不写入，返回 false。
 * 每次请求开始时存一次（模型调用失败也不丢用户的问题），回答结束时再存一次完整消息。
 */
export async function saveConversation(visitorId: string, conversationId: string, messages: UIMessage[]) {
  return db.transaction(async (tx) => {
    const [existing] = await tx
      .select({ visitorId: conversations.visitorId })
      .from(conversations)
      .where(eq(conversations.id, conversationId))
      .for('update')
    if (existing && existing.visitorId !== visitorId) return false

    if (existing) {
      await tx.update(conversations).set({ updatedAt: new Date() }).where(eq(conversations.id, conversationId))
    } else {
      await tx.insert(conversations).values({ id: conversationId, visitorId, title: titleOf(messages) })
    }

    if (messages.length > 0) {
      await tx
        .insert(messagesTable)
        .values(messages.map((m, seq) => ({ id: m.id, conversationId, role: m.role, parts: m.parts, seq })))
        .onConflictDoUpdate({
          target: messagesTable.id,
          set: { parts: sql`excluded.parts`, seq: sql`excluded.seq` },
          // 消息 id 由客户端生成；只允许更新本会话里的消息，防止伪造 id 改写别人的会话
          setWhere: sql`${messagesTable.conversationId} = excluded.conversation_id`,
        })
    }
    return true
  })
}

export async function listConversations(visitorId: string): Promise<ConversationSummary[]> {
  const rows = await db
    .select({ id: conversations.id, title: conversations.title, updatedAt: conversations.updatedAt })
    .from(conversations)
    .where(eq(conversations.visitorId, visitorId))
    .orderBy(desc(conversations.updatedAt))
    .limit(50)
  return rows.map((row) => ({ ...row, updatedAt: row.updatedAt.toISOString() }))
}

export async function getConversation(visitorId: string, conversationId: string): Promise<ConversationDetail | undefined> {
  const [conversation] = await db
    .select()
    .from(conversations)
    .where(and(eq(conversations.id, conversationId), eq(conversations.visitorId, visitorId)))
  if (!conversation) return undefined

  const rows = await db
    .select({ id: messagesTable.id, role: messagesTable.role, parts: messagesTable.parts })
    .from(messagesTable)
    .where(eq(messagesTable.conversationId, conversationId))
    .orderBy(asc(messagesTable.seq))
  return {
    id: conversation.id,
    title: conversation.title,
    updatedAt: conversation.updatedAt.toISOString(),
    messages: rows,
  }
}

export async function deleteConversation(visitorId: string, conversationId: string) {
  const deleted = await db
    .delete(conversations)
    .where(and(eq(conversations.id, conversationId), eq(conversations.visitorId, visitorId)))
    .returning({ id: conversations.id })
  return deleted.length > 0
}
