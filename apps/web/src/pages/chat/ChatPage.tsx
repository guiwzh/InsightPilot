import { useChat } from '@ai-sdk/react'
import { Bubble, Prompts, Sender, Welcome, type BubbleListProps } from '@ant-design/x'
import { RobotOutlined, UserOutlined } from '@ant-design/icons'
import { DefaultChatTransport, type UIMessage } from 'ai'
import { Alert, Avatar, Button, Flex } from 'antd'
import { useState } from 'react'

const transport = new DefaultChatTransport({ api: '/api/chat' })

const EXAMPLES = [
  '9 月最后一周各渠道新增用户和下单转化率，按天看趋势',
  '8 月哪个类目的退款率最高？',
  '开学季数码类目卖得怎么样？',
]

const roles: BubbleListProps['role'] = {
  ai: { placement: 'start', avatar: <Avatar icon={<RobotOutlined />} /> },
  user: { placement: 'end', variant: 'outlined', avatar: <Avatar icon={<UserOutlined />} /> },
}

/** 第 1 周只渲染文本；第 2 周起按 part.type 渲染工具轨迹，第 3 周渲染图表 */
const textOf = (message: UIMessage) => message.parts.map((part) => (part.type === 'text' ? part.text : '')).join('')

export function ChatPage() {
  const [input, setInput] = useState('')
  // throttle：流式过程中最多每 50ms 触发一次重渲染，长回答不卡顿
  const { messages, sendMessage, status, stop, error, regenerate } = useChat({ transport, throttle: 50 })
  const busy = status === 'submitted' || status === 'streaming'

  const send = (text: string) => {
    if (!text.trim() || busy) return
    void sendMessage({ text })
    setInput('')
  }

  const items = messages.map((message, index) => {
    const content = textOf(message)
    const isLast = index === messages.length - 1
    return {
      key: message.id,
      role: message.role === 'user' ? 'user' : 'ai',
      content,
      // 助手消息已创建、但第一个字还没到时显示加载动画
      loading: busy && isLast && message.role === 'assistant' && !content,
    }
  })
  // 请求已发出、助手消息还没创建时，先放一个占位气泡
  if (status === 'submitted' && messages.at(-1)?.role === 'user') {
    items.push({ key: 'pending', role: 'ai', content: '', loading: true })
  }

  return (
    <Flex vertical gap={16} style={{ height: '100%', maxWidth: 880, margin: '0 auto', padding: '16px 24px' }}>
      {messages.length === 0 ? (
        <Flex vertical gap={24} style={{ flex: 1, paddingTop: 48 }}>
          <Welcome
            variant="borderless"
            icon={<Avatar size={48} icon={<RobotOutlined />} />}
            title="你好，我是 InsightPilot"
            description="用自然语言提问，我来查数、画图。数据查询工具正在接入，目前只能聊天。"
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
