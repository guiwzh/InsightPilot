import type { ResultColumnType } from '@insightpilot/shared'
import { Alert, Card, Skeleton, Table, Typography } from 'antd'
import type { ColumnsType } from 'antd/es/table'
import { useMemo } from 'react'
import { useQueryResult } from '../api/client'

type Row = Record<string, unknown> & { key: number }

const numberFormat = new Intl.NumberFormat('zh-CN', { maximumFractionDigits: 2 })

function formatCell(value: unknown, type: ResultColumnType) {
  if (value === null || value === undefined) return <Typography.Text type="secondary">—</Typography.Text>
  if (type === 'number' && typeof value === 'number') return numberFormat.format(value)
  // 数据库输出形如 2026-09-28 23:59:16.477+08，去掉毫秒和时区，界面统一按北京时间展示
  if (type === 'datetime' && typeof value === 'string') return value.replace(/\.\d+/, '').replace(/[+-]\d{2}$/, '')
  if (typeof value === 'object') return JSON.stringify(value)
  return String(value)
}

/** run_sql 的完整结果。按 resultId 从后端拉取，不经过模型 */
export function ResultTable({ resultId, title }: { resultId: string; title?: string }) {
  const { data, isLoading, error } = useQueryResult(resultId)

  const { columns, dataSource } = useMemo(() => {
    if (!data) return { columns: [], dataSource: [] }
    const columns: ColumnsType<Row> = data.columns.map((column, index) => ({
      key: index,
      dataIndex: String(index),
      title: column.name,
      align: column.type === 'number' ? 'right' : 'left',
      render: (value: unknown) => formatCell(value, column.type),
    }))
    const dataSource = data.rows.map((row, rowIndex) => {
      const record: Row = { key: rowIndex }
      row.forEach((value, index) => (record[String(index)] = value))
      return record
    })
    return { columns, dataSource }
  }, [data])

  if (error) return <Alert type="error" showIcon message="结果加载失败" description={error.message} />

  return (
    <Card size="small" title={title ?? '查询结果'} styles={{ body: { padding: 0 } }}>
      {isLoading || !data ? (
        <Skeleton active paragraph={{ rows: 4 }} style={{ padding: 16 }} />
      ) : (
        <Table<Row>
          size="small"
          columns={columns}
          dataSource={dataSource}
          scroll={{ x: 'max-content' }}
          pagination={{ pageSize: 10, hideOnSinglePage: true, showSizeChanger: false, size: 'small' }}
          footer={() => (
            <Typography.Text type="secondary">
              共 {data.rowCount} 行{data.truncated ? '（超过 1000 行，已截断）' : ''}
            </Typography.Text>
          )}
        />
      )}
    </Card>
  )
}
