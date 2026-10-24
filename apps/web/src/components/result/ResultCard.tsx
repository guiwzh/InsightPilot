import { BarChartOutlined, CodeOutlined, DownloadOutlined, LineChartOutlined, TableOutlined } from '@ant-design/icons'
import { CodeHighlighter } from '@ant-design/x'
import { validateChartSpec, type ChartSpec, type ChartType } from '@insightpilot/shared'
import { Alert, Button, Card, Flex, Popover, Segmented, Skeleton, Space, Tag, Tooltip } from 'antd'
import { memo, useEffect, useMemo, useRef, useState } from 'react'
import { useQueryResult } from '../../api/client'
import { ChartView, type ChartViewHandle } from '../chart/ChartView'
import { specToOption } from '../chart/specToOption'
import { DataTable } from './DataTable'

type Props = {
  resultId: string
  title: string
  /** 模型通过 render_chart 给出的图表配置；没有时只展示表格 */
  spec?: ChartSpec
  /** 模型正在为这份结果生成图表配置 */
  charting?: boolean
}

const VIEW_OPTIONS = [
  { value: 'line', icon: <LineChartOutlined />, label: '折线' },
  { value: 'bar', icon: <BarChartOutlined />, label: '柱状' },
  { value: 'table', icon: <TableOutlined />, label: '表格' },
] satisfies { value: ChartType; icon: React.ReactNode; label: string }[]

/** 一份查询结果的展示卡片：图表和表格可以切换，可以查看 SQL、下载图片 */
function ResultCardInner({ resultId, title, spec, charting }: Props) {
  const { data, isLoading, error } = useQueryResult(resultId)
  const chartable = spec !== undefined && spec.type !== 'table'
  const [view, setView] = useState<ChartType>(spec?.type ?? 'table')
  const chartRef = useRef<ChartViewHandle>(null)

  // 先拿到查询结果时只有表格；之后模型调用 render_chart，同一张卡片原地切换成图表
  const specType = spec?.type
  useEffect(() => {
    if (specType) setView(specType)
  }, [specType])

  const chart = useMemo(() => {
    if (!data || !chartable || view === 'table') return undefined
    const effective = { ...spec, type: view }
    // server 已经校验过，这里再用同一份规则兜底，出问题就退回表格而不是白屏
    const errors = validateChartSpec(effective, data.columns, data.rowCount)
    if (errors.length > 0) return { error: errors.join('；') }
    return { option: specToOption(effective, data) }
  }, [data, chartable, spec, view])

  if (error) return <Alert type="error" showIcon message="结果加载失败" description={error.message} />

  const extra = (
    <Space size={4}>
      {charting && <Tag color="processing">正在生成图表…</Tag>}
      {chartable && (
        <Segmented<ChartType> size="small" value={view} onChange={setView} options={VIEW_OPTIONS} />
      )}
      {data && (
        <Popover
          trigger="click"
          placement="bottomRight"
          content={
            <div style={{ width: 520, maxWidth: '80vw' }}>
              <CodeHighlighter lang="sql" highlightProps={{ wrapLongLines: true }}>
                {data.sql}
              </CodeHighlighter>
            </div>
          }
        >
          <Tooltip title="查看 SQL">
            <Button type="text" size="small" icon={<CodeOutlined />} />
          </Tooltip>
        </Popover>
      )}
      {chart?.option && (
        <Tooltip title="下载图片">
          <Button type="text" size="small" icon={<DownloadOutlined />} onClick={() => chartRef.current?.download(title)} />
        </Tooltip>
      )}
    </Space>
  )

  return (
    <Card size="small" title={title} extra={extra} styles={{ body: { padding: view === 'table' ? 0 : 12 } }}>
      {isLoading || !data ? (
        <Skeleton active paragraph={{ rows: 5 }} style={{ padding: 16 }} />
      ) : chart?.option ? (
        <ChartView ref={chartRef} option={chart.option} />
      ) : (
        <Flex vertical>
          {chart?.error && <Alert type="warning" banner message={`图表无法渲染，已改为表格：${chart.error}`} />}
          <DataTable data={data} />
        </Flex>
      )}
    </Card>
  )
}

// 流式输出时消息对象每 50ms 就会换一个新的，图表配置内容不变就不重渲染
export const ResultCard = memo(
  ResultCardInner,
  (prev, next) =>
    prev.resultId === next.resultId &&
    prev.title === next.title &&
    prev.charting === next.charting &&
    JSON.stringify(prev.spec) === JSON.stringify(next.spec),
)
