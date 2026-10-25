import { Alert, Card, Col, Empty, Flex, Row, Segmented, Skeleton, Statistic, Typography } from 'antd'
import { useMemo, useState } from 'react'
import { useStats } from '../../api/client'
import { ChartView } from '../../components/chart/ChartView'
import { dailyOption, latencyOption, toolsOption } from './options'

const RANGES = [
  { value: 1, label: '今天' },
  { value: 7, label: '近 7 天' },
  { value: 30, label: '近 30 天' },
]

const pct = (x: number) => `${(x * 100).toFixed(1)}%`
const seconds = (ms: number) => `${(ms / 1000).toFixed(1)}s`

/** 运营看板：全站的提问量、成本、延迟、缓存命中和工具出错情况，数据来自 agent_runs */
export function DashboardPage() {
  const [days, setDays] = useState(7)
  const { data, isLoading, error } = useStats(days)

  const charts = useMemo(
    () => data && { daily: dailyOption(data.daily), latency: latencyOption(data.daily), tools: toolsOption(data.tools) },
    [data],
  )

  return (
    <Flex vertical gap={16} style={{ height: '100%', overflow: 'auto', padding: 24, maxWidth: 1200, margin: '0 auto' }}>
      <Flex justify="space-between" align="center">
        <Typography.Title level={4} style={{ margin: 0 }}>
          运营看板
        </Typography.Title>
        <Segmented value={days} onChange={setDays} options={RANGES} />
      </Flex>

      {error && <Alert type="error" showIcon title="看板数据加载失败" description={error.message} />}
      {isLoading || !data || !charts ? (
        <Skeleton active paragraph={{ rows: 8 }} />
      ) : data.summary.runs === 0 ? (
        <Empty description="这段时间还没有对话记录，去对话页问几个问题再回来看看" style={{ marginTop: 64 }} />
      ) : (
        <>
          <Row gutter={[16, 16]}>
            {[
              { title: '提问次数', value: String(data.summary.runs) },
              { title: '成功率', value: pct(data.summary.successRate) },
              { title: '单次平均成本', value: `¥${data.summary.avgCostCny.toFixed(4)}` },
              { title: '累计花费', value: `¥${data.summary.totalCostCny.toFixed(2)}` },
              { title: '延迟 P50 / P95', value: `${seconds(data.summary.p50LatencyMs)} / ${seconds(data.summary.p95LatencyMs)}` },
              { title: '平均首字时间', value: seconds(data.summary.avgTtftMs) },
              { title: '缓存命中率', value: pct(data.summary.cacheHitRate) },
              { title: '工具出错率', value: pct(data.summary.toolErrorRate) },
              { title: '导出审批通过率', value: data.summary.approvalRate === null ? '—' : pct(data.summary.approvalRate) },
            ].map((item) => (
              <Col key={item.title} xs={12} md={8} lg={6} xl={8}>
                <Card size="small">
                  <Statistic title={item.title} value={item.value} />
                </Card>
              </Col>
            ))}
          </Row>
          <Row gutter={[16, 16]}>
            <Col xs={24} lg={12}>
              <Card size="small" title="每日提问数与花费">
                <ChartView option={charts.daily} height={260} />
              </Card>
            </Col>
            <Col xs={24} lg={12}>
              <Card size="small" title="每日延迟">
                <ChartView option={charts.latency} height={260} />
              </Card>
            </Col>
            <Col xs={24}>
              <Card size="small" title="工具调用与出错">
                <ChartView option={charts.tools} height={Math.max(160, data.tools.length * 44 + 60)} />
              </Card>
            </Col>
          </Row>
        </>
      )}
    </Flex>
  )
}
