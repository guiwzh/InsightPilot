import { Space, Tag, Tooltip } from 'antd'
import { useHealth } from '../api/client'

/** 顶栏的服务状态：数据库、样例数据、当前模型 */
export function HealthStatus() {
  const { data: health, isError } = useHealth()

  if (isError) return <Tag color="error">server 未启动</Tag>
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
