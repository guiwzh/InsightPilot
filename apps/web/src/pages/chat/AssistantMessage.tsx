import { XMarkdown } from '@ant-design/x-markdown'
import type { ChartSpec } from '@insightpilot/shared'
import { Flex } from 'antd'
import { memo } from 'react'
import { ResultCard } from '../../components/result/ResultCard'
import { isToolPart, type InsightMessage, type InsightPart, type InsightToolPart } from '../../types'
import { ExportCard } from './ExportCard'
import { ToolTrace } from './ToolTrace'

/** 用户在导出审批卡片上的选择：approvalId 来自 part.approval.id */
export type ApprovalHandler = (approvalId: string, approved: boolean) => void

type TextPart = Extract<InsightPart, { type: 'text' }>
type Block = { kind: 'text'; key: string; part: TextPart } | { kind: 'tools'; key: string; parts: InsightToolPart[] }

/** 按原始顺序把 parts 分组：相邻的工具调用合成一组轨迹，文本单独成段 */
function toBlocks(message: InsightMessage): Block[] {
  const blocks: Block[] = []
  message.parts.forEach((part, index) => {
    if (part.type === 'text') {
      if (part.text.trim()) blocks.push({ kind: 'text', key: `text-${index}`, part })
    } else if (isToolPart(part)) {
      const last = blocks.at(-1)
      if (last?.kind === 'tools') last.parts.push(part)
      else blocks.push({ kind: 'tools', key: `tools-${index}`, parts: [part] })
    }
  })
  return blocks
}

type CardInfo = { key: string; resultId: string; title: string; spec?: ChartSpec; charting?: boolean }

/**
 * 一组工具调用要展示哪些结果卡片：
 * - 画了图的查询，每张图一张卡片；
 * - 没画图的查询只展示最后一次（前面多半是探索性的查询，全展示太吵）；
 * - 查询先以表格出现，模型随后调用 render_chart 时，同一张卡片（key 不变）原地变成图表。
 */
function resultCards(parts: InsightToolPart[]): CardInfo[] {
  const queries: { resultId: string; title: string }[] = []
  const charts = new Map<string, ChartSpec[]>()
  let charting = false

  for (const part of parts) {
    if (part.type === 'tool-run_sql' && part.state === 'output-available') {
      queries.push({ resultId: part.output.resultId, title: part.input.purpose })
    }
    if (part.type === 'tool-render_chart') {
      if (part.state === 'output-available') {
        const { spec } = part.output
        charts.set(spec.resultId, [...(charts.get(spec.resultId) ?? []), spec])
      } else if (part.state === 'input-streaming' || part.state === 'input-available') {
        charting = true
      }
    }
  }

  const cards: CardInfo[] = []
  const lastQuery = queries.at(-1)
  for (const query of queries) {
    const specs = charts.get(query.resultId)
    if (specs) {
      specs.forEach((spec, i) => cards.push({ key: `${query.resultId}:${i}`, resultId: query.resultId, title: spec.title, spec }))
      charts.delete(query.resultId)
    } else if (query === lastQuery) {
      cards.push({ key: `${query.resultId}:0`, resultId: query.resultId, title: query.title, charting })
    }
  }
  // 引用了更早一组查询结果的图表
  for (const [resultId, specs] of charts) {
    specs.forEach((spec, i) => cards.push({ key: `${resultId}:${i}`, resultId, title: spec.title, spec }))
  }
  return cards
}

/** 本条消息里最近一次成功查询的结果，导出时模型没指定 resultId 就用它 */
function lastResultIdOf(message: InsightMessage) {
  for (const part of [...message.parts].reverse()) {
    if (part.type === 'tool-run_sql' && part.state === 'output-available') return part.output.resultId
  }
}

export function hasVisibleContent(message: InsightMessage) {
  return message.parts.some((part) => (part.type === 'text' ? part.text.trim() : isToolPart(part)))
}

/** 助手消息里的全部文字，用于"复制" */
export const textOf = (message: InsightMessage) =>
  message.parts
    .map((part) => (part.type === 'text' ? part.text.trim() : ''))
    .filter(Boolean)
    .join('\n\n')

/**
 * active：这条消息是否还在流式生成。
 * 用 memo 包起来：useChat 每次更新只替换最后一条消息对象，历史消息的引用不变，因此不会重渲染。
 */
export const AssistantMessage = memo(function AssistantMessage({
  message,
  active,
  onApproval,
}: {
  message: InsightMessage
  active: boolean
  onApproval: ApprovalHandler
}) {
  const lastResultId = lastResultIdOf(message)
  return (
    <Flex vertical gap={12} style={{ width: '100%' }}>
      {toBlocks(message).map((block) => {
        if (block.kind === 'text') {
          const streaming = active && block.part.state === 'streaming'
          return (
            <XMarkdown
              key={block.key}
              className="x-markdown-light"
              content={block.part.text}
              // 模型输出里的原始 HTML 一律当作文本显示，不解析成真实标签，防 XSS
              escapeRawHtml
              openLinksInNewTab
              streaming={{ hasNextChunk: streaming, tail: streaming }}
            />
          )
        }
        return (
          <Flex key={block.key} vertical gap={12}>
            <ToolTrace parts={block.parts} active={active} />
            {resultCards(block.parts).map(({ key, ...card }) => (
              <ResultCard key={key} {...card} />
            ))}
            {block.parts.map((part) =>
              part.type === 'tool-export_csv' ? (
                <ExportCard key={part.toolCallId} part={part} resultId={lastResultId} onApproval={onApproval} />
              ) : null,
            )}
          </Flex>
        )
      })}
    </Flex>
  )
})
