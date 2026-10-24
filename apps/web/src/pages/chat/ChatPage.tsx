import { useChat } from '@ai-sdk/react'
import { Bubble, Prompts, Sender, Welcome, type BubbleListProps } from '@ant-design/x'
import { RobotOutlined, UserOutlined } from '@ant-design/icons'
import { DefaultChatTransport } from 'ai'
import { Alert, Avatar, Button, Flex } from 'antd'
import { useState } from 'react'
import type { InsightMessage } from '../../types'
import { AssistantMessage, hasVisibleContent } from './AssistantMessage'

const transport = new DefaultChatTransport<InsightMessage>({ api: '/api/chat' })

const EXAMPLES = [
  '9 月最后一周各渠道新增用户和下单转化率，按天看趋势',
  '8 月哪个类目的退款率最高？',
  '开学季数码类目卖得怎么样？',
]

const roles: BubbleListProps['role'] = {
  // 助手消息里有轨迹和表格，去掉气泡背景并占满宽度
  ai: {
    placement: 'start',
    variant: 'borderless',
    avatar: <Avatar icon={<RobotOutlined />} />,
    styles: { root: { width: '100%' }, body: { flex: 1, minWidth: 0 }, content: { width: '100%' } },
  },
  user: { placement: 'end', variant: 'outlined', avatar: <Avatar icon={<UserOutlined />} /> },
}

const textOf = (message: InsightMessage) => message.parts.map((part) => (part.type === 'text' ? part.text : '')).join('')

export function ChatPage() {
  const [input, setInput] = useState('')
  // throttle：流式过程中最多每 50ms 触发一次重渲染，长回答不卡顿
  const { messages, sendMessage, status, stop, error, regenerate } = useChat<InsightMessage>({ transport, throttle: 50 })
  const busy = status === 'submitted' || status === 'streaming'

  const send = (text: string) => {
    if (!text.trim() || busy) return
    void sendMessage({ text })
    setInput('')
  }

  const items: BubbleListProps['items'] = messages.map((message, index) => {
    const isLast = index === messages.length - 1
    return message.role === 'user'
      ? { key: message.id, role: 'user', content: textOf(message) }
      : {
          key: message.id,
          role: 'ai',
          content: <AssistantMessage message={message} />,
          // 助手消息已创建、但还没有任何文字或工具调用时显示加载动画
          loading: busy && isLast && !hasVisibleContent(message),
        }
  })
  // 请求已发出、助手消息还没创建时，先放一个占位气泡
  if (status === 'submitted' && messages.at(-1)?.role === 'user') {
    items.push({ key: 'pending', role: 'ai', content: '', loading: true })
  }

  return (
    <Flex vertical gap={16} style={{ height: '100%', maxWidth: 960, margin: '0 auto', padding: '16px 24px' }}>
      {messages.length === 0 ? (
        <Flex vertical gap={24} style={{ flex: 1, paddingTop: 48 }}>
          <Welcome
            variant="borderless"
            icon={<Avatar size={48} icon={<RobotOutlined />} />}
            title="你好，我是 InsightPilot"
            description="用自然语言提问，我会查表结构、写 SQL、查数据，并把结果整理给你。"
          />
          <Prompts
            title="试试这样问"
            items={EXAMPLES.map((label) => ({ key: label, label }))}
            onItemClick={({ data }) => send(String(data.label))}
            wrap
          />
        </Flex>
      ) : (
        <Bubble.List items={items} role={roles} style={{ flex: 1, minHeight: 0 }} />
      )}

      {error && (
        <Alert
          type="error"
          showIcon
          message="回答失败"
          description={error.message}
          action={
            <Button size="small" onClick={() => void regenerate()}>
              重试
            </Button>
          }
        />
      )}

      <Sender
        value={input}
        onChange={(value) => setInput(value)}
        onSubmit={send}
        onCancel={() => void stop()}
        loading={busy}
        placeholder="用自然语言提问，例如：上周各渠道的新增用户有多少？"
        autoSize={{ minRows: 1, maxRows: 6 }}
      />
    </Flex>
  )
}
