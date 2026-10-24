import type { InsightUITools } from '@insightpilot/shared'
import type { ToolUIPart, UIDataTypes, UIMessage } from 'ai'

/** 带工具类型的消息：part.type === 'tool-run_sql' 时，input / output 都有准确的类型 */
export type InsightMessage = UIMessage<unknown, UIDataTypes, InsightUITools>
export type InsightPart = InsightMessage['parts'][number]
export type InsightToolPart = ToolUIPart<InsightUITools>

export const isToolPart = (part: InsightPart): part is InsightToolPart => part.type.startsWith('tool-')
