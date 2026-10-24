import { Flex, Typography } from 'antd'
import { ResultTable } from '../../components/ResultTable'
import { isToolPart, type InsightMessage, type InsightToolPart } from '../../types'
import { ToolTrace } from './ToolTrace'

type Block = { kind: 'text'; key: string; text: string } | { kind: 'tools'; key: string; parts: InsightToolPart[] }

/** 按原始顺序把 parts 分组：相邻的工具调用合成一组轨迹，文本单独成段 */
function toBlocks(message: InsightMessage): Block[] {
  const blocks: Block[] = []
  message.parts.forEach((part, index) => {
    if (part.type === 'text') {
      if (part.text.trim()) blocks.push({ kind: 'text', key: `text-${index}`, text: part.text })
    } else if (isToolPart(part)) {
      const last = blocks.at(-1)
      if (last?.kind === 'tools') last.parts.push(part)
      else blocks.push({ kind: 'tools', key: `tools-${index}`, parts: [part] })
    }
  })
  return blocks
}

/** 一组轨迹里最后一次成功的查询，作为这组的主结果展示 */
function lastSuccessfulQuery(parts: InsightToolPart[]) {
  for (let i = parts.length - 1; i >= 0; i--) {
    const part = parts[i]
    if (part.type === 'tool-run_sql' && part.state === 'output-available') {
      return { resultId: part.output.resultId, title: part.input.purpose }
    }
  }
}

export function hasVisibleContent(message: InsightMessage) {
  return message.parts.some((part) => (part.type === 'text' ? part.text.trim() : isToolPart(part)))
}

// 第 3 周会把文本换成流式 Markdown 渲染，并让 render_chart 的结果渲染成图表
export function AssistantMessage({ message }: { message: InsightMessage }) {
  return (
    <Flex vertical gap={12} style={{ width: '100%' }}>
      {toBlocks(message).map((block) => {
        if (block.kind === 'text') {
          return (
            <Typography.Paragraph key={block.key} style={{ whiteSpace: 'pre-wrap', margin: 0 }}>
              {block.text}
            </Typography.Paragraph>
          )
        }
        const result = lastSuccessfulQuery(block.parts)
        return (
          <Flex key={block.key} vertical gap={12}>
            <ToolTrace parts={block.parts} />
            {result && <ResultTable resultId={result.resultId} title={result.title} />}
          </Flex>
        )
      })}
    </Flex>
  )
}
