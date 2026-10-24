import { CodeHighlighter, ThoughtChain, type ThoughtChainItemType } from '@ant-design/x'
import { Typography } from 'antd'
import type { InsightToolPart } from '../../types'

const STATUS: Record<InsightToolPart['state'], ThoughtChainItemType['status']> = {
  'input-streaming': 'loading',
  'input-available': 'loading',
  'approval-requested': 'loading',
  'approval-responded': 'loading',
  'output-available': 'success',
  'output-error': 'error',
  'output-denied': 'abort',
}

/**
 * 把一段连续的工具调用渲染成可展开的步骤列表：查表 → 看结构 → 读口径 → 执行 SQL → 画图。
 * active 为 false 表示这条消息已经结束（正常完成或被用户停止），还没跑完的步骤显示为中止。
 */
export function ToolTrace({ parts, active }: { parts: InsightToolPart[]; active: boolean }) {
  return <ThoughtChain items={parts.map((part) => toItem(part, active))} line="dashed" />
}

function toItem(part: InsightToolPart, active: boolean): ThoughtChainItemType {
  const status = STATUS[part.state] === 'loading' && !active ? 'abort' : STATUS[part.state]
  const base = { key: part.toolCallId, status }
  const error = part.state === 'output-error' ? part.errorText : undefined

  switch (part.type) {
    case 'tool-list_tables':
      return {
        ...base,
        title: '查看有哪些表',
        description: part.state === 'output-available' ? `${part.output.tables.length} 张表` : error,
      }

    case 'tool-describe_table':
      return {
        ...base,
        title: '查看表结构',
        description: error ?? part.input?.tables?.join('、'),
      }

    case 'tool-get_metric_definitions':
      return {
        ...base,
        title: '读取指标口径',
        description:
          error ??
          (part.state === 'output-available'
            ? part.output.metrics.map((m) => m.name).join('、')
            : part.input?.keywords?.join('、')),
      }

    case 'tool-run_sql': {
      const sql = part.input?.sql
      const description =
        status === 'abort'
          ? '已停止'
          : part.state === 'input-streaming'
            ? '正在编写 SQL…'
            : part.state === 'input-available'
              ? '执行中…'
              : part.state === 'output-available'
                ? `${part.output.rowCount} 行 · ${part.output.durationMs} ms`
                : error?.split('。')[0]
      return {
        ...base,
        title: part.input?.purpose || '执行 SQL',
        description,
        collapsible: Boolean(sql),
        content: sql ? (
          <>
            {error && <Typography.Paragraph type="danger">{error}</Typography.Paragraph>}
            {/* 长 SQL 自动换行，过高时在块内滚动，不撑破消息宽度 */}
            <CodeHighlighter
              lang="sql"
              highlightProps={{ wrapLongLines: true }}
              styles={{ root: { maxWidth: '100%' }, code: { maxHeight: 360, overflow: 'auto' } }}
            >
              {sql}
            </CodeHighlighter>
          </>
        ) : undefined,
      }
    }

    case 'tool-render_chart': {
      const chartName = { line: '折线图', bar: '柱状图', table: '表格' }[part.input?.type ?? 'line']
      return {
        ...base,
        title: `绘制${chartName}`,
        description: status === 'abort' ? '已停止' : (error?.split('。可用的列')[0] ?? part.input?.title),
        collapsible: Boolean(error),
        content: error ? <Typography.Paragraph type="danger">{error}</Typography.Paragraph> : undefined,
      }
    }
  }
}
