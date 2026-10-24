import type { HealthResponse } from '@insightpilot/shared'
import { Space, Tag, Tooltip } from 'antd'
import { useEffect, useState } from 'react'

/** 顶栏的服务状态：数据库、样例数据、当前模型。第 3 周引入 TanStack Query 后改用 useQuery */
export function HealthStatus() {
  const [health, setHealth] = useState<HealthResponse>()
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    // 数据库不可用时接口返回 503，但 body 结构不变，照样展示
    fetch('/api/health')
      .then((res) => res.json() as Promise<HealthResponse>)
      .then(setHealth, () => setFailed(true))
  }, [])

  if (failed) return <Tag color="error">server 未启动</Tag>
  if (!health) return null

  return (
    <Space size={4}>
      <Tag color={health.ok ? 'success' : 'error'}>数据库{health.ok ? '已连接' : '不可用'}</Tag>
      <Tooltip title={health.db.seeded ? undefined : '运行 pnpm db:seed 生成样例数据'}>
        <Tag color={health.db.seeded ? 'success' : 'warning'}>样例数据{health.db.seeded ? '已就绪' : '未生成'}</Tag>
      </Tooltip>
      {health.llm.mode === 'demo' ? (
        <Tooltip title="在 .env 中填写 DEEPSEEK_API_KEY 后重启 server">
          <Tag color="warning">演示模式</Tag>
        </Tooltip>
      ) : (
        <Tag color="processing">{health.llm.model}</Tag>
      )}
    </Space>
  )
}
