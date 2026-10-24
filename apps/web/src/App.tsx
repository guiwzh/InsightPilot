import { Flex, Layout, Typography, theme } from 'antd'
import { HealthStatus } from './components/HealthStatus'
import { ChatPage } from './pages/chat/ChatPage'

export function App() {
  const { token } = theme.useToken()

  return (
    <Layout style={{ height: '100%' }}>
      <Layout.Header
        style={{
          background: token.colorBgContainer,
          borderBottom: `1px solid ${token.colorBorderSecondary}`,
          paddingInline: 24,
        }}
      >
        <Flex align="center" justify="space-between" style={{ height: '100%' }}>
          <Typography.Title level={4} style={{ margin: 0 }}>
            InsightPilot
          </Typography.Title>
          <HealthStatus />
        </Flex>
      </Layout.Header>
      <Layout.Content style={{ minHeight: 0 }}>
        <ChatPage />
      </Layout.Content>
    </Layout>
  )
}
