import type { QueryResultResponse, ResultColumnType } from '@insightpilot/shared'
import { Table, Typography } from 'antd'
import type { ColumnsType } from 'antd/es/table'
import { useMemo } from 'react'

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

/** 查询结果的明细表。rows 是按列顺序排列的数组，用列序号作 dataIndex，列名重复也不冲突 */
export function DataTable({ data }: { data: QueryResultResponse }) {
  const { columns, dataSource } = useMemo(() => {
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

  return (
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
  )
}
