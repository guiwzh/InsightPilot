import { CheckOutlined, CloseOutlined, DownloadOutlined, ExportOutlined } from '@ant-design/icons'
import { Button, Card, Flex, Space, Tag, Typography } from 'antd'
import { useQueryResult } from '../../api/client'
import type { InsightToolPart } from '../../types'
import type { ApprovalHandler } from './AssistantMessage'

type ExportPart = Extract<InsightToolPart, { type: 'tool-export_csv' }>

/**
 * 导出 CSV 的审批卡片（Human-in-the-loop）：模型想把数据带出系统时，先停下来等用户确认。
 * resultId：模型指定的结果，没指定时是本条消息里最近一次查询的结果，用来展示要导出多少行
 */
export function ExportCard({ part, resultId, onApproval }: { part: ExportPart; resultId?: string; onApproval: ApprovalHandler }) {
  const result = useQueryResult(part.input?.resultId ?? resultId)
  const filename = `${part.input?.filename || '查询结果'}.csv`
  const rows = result.data ? `，共 ${result.data.rowCount} 行` : ''

  if (part.state === 'approval-requested') {
    return (
      <Card size="small" style={{ borderColor: '#faad14' }}>
        <Flex vertical gap={8}>
          <Typography.Text strong>
            <ExportOutlined /> 导出数据需要你确认
          </Typography.Text>
          <Typography.Text type="secondary">
            将导出 {filename}
            {rows}。数据会以文件形式下载到你的电脑上。
          </Typography.Text>
          {result.data && (
            <Typography.Paragraph type="secondary" ellipsis={{ rows: 2, expandable: true, symbol: '展开 SQL' }} code style={{ margin: 0 }}>
              {result.data.sql}
            </Typography.Paragraph>
          )}
          <Space>
            <Button type="primary" icon={<CheckOutlined />} onClick={() => onApproval(part.approval.id, true)}>
              允许导出
            </Button>
            <Button icon={<CloseOutlined />} onClick={() => onApproval(part.approval.id, false)}>
              拒绝
            </Button>
          </Space>
        </Flex>
      </Card>
    )
  }

  if (part.state === 'approval-responded') {
    return <Tag color={part.approval.approved ? 'processing' : 'default'}>{part.approval.approved ? '已允许，正在导出…' : '已拒绝导出'}</Tag>
  }
  if (part.state === 'output-denied') return <Tag>已拒绝导出</Tag>
  if (part.state === 'output-error') return <Tag color="error">导出失败：{part.errorText}</Tag>
  if (part.state === 'output-available') {
    return (
      <Button icon={<DownloadOutlined />} href={part.output.url} download={part.output.filename}>
        下载 {part.output.filename}（{part.output.rowCount} 行）
      </Button>
    )
  }
  return null
}
