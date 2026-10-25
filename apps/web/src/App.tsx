import { DashboardOutlined, MessageOutlined } from '@ant-design/icons'
import { Flex, Layout, Segmented, Typography, theme } from 'antd'
import { HealthStatus } from './components/HealthStatus'
import { useHashRoute, type Route } from './hooks/useHashRoute'
import { ChatLayout } from './pages/chat/ChatLayout'
import { DashboardPage } from './pages/dashboard/DashboardPage'

export function App() {
  const { token } = theme.useToken()
  const [route, navigate] = useHashRoute()

  return (
    <Layout style={{ height: '100%' }}>
      <Layout.Header
        style={{
          background: token.colorBgContainer,
          borderBottom: `1px solid ${token.colorBorderSecondary}`,
          paddingInline: 24,
        }}
      >
        <Flex align="center" justify="space-between" gap={16} style={{ height: '100%' }}>
          <Flex align="center" gap={24}>
            <Typography.Title level={4} style={{ margin: 0 }}>
              InsightPilot
            </Typography.Title>
            <Segmented<Route>
              value={route}
              onChange={navigate}
              options={[
                { value: 'chat', label: '对话', icon: <MessageOutlined /> },
                { value: 'dashboard', label: '看板', icon: <DashboardOutlined /> },
              ]}
            />
          </Flex>
          <HealthStatus />
        </Flex>
      </Layout.Header>
      <Layout.Content style={{ minHeight: 0 }}>{route === 'dashboard' ? <DashboardPage /> : <ChatLayout />}</Layout.Content>
    </Layout>
  )
}
