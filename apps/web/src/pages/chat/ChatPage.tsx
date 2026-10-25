import { useChat } from '@ai-sdk/react'
import { Bubble, Prompts, Sender, Welcome, type BubbleListProps } from '@ant-design/x'
import { RobotOutlined, UserOutlined } from '@ant-design/icons'
import { DefaultChatTransport, lastAssistantMessageIsCompleteWithApprovalResponses } from 'ai'
import { Alert, Avatar, Button, Flex } from 'antd'
import { useCallback, useRef, useState } from 'react'
import type { InsightMessage } from '../../types'
import { AssistantMessage, hasVisibleContent, textOf, type ApprovalHandler } from './AssistantMessage'
import { MessageActions } from './MessageActions'

const transport = new DefaultChatTransport<InsightMessage>({ api: '/api/chat' })

const EXAMPLES = [
  '9 月最后一周各渠道新增用户和下单转化率，按天看趋势',
  '8 月哪个类目的退款率最高？',
  '开学季数码类目卖得怎么样？',
]

const roles: BubbleListProps['role'] = {
  // 助手消息里有轨迹、图表和表格，去掉气泡背景并占满宽度
  ai: {
    placement: 'start',
    variant: 'borderless',
    avatar: <Avatar icon={<RobotOutlined />} />,
    styles: { root: { width: '100%' }, body: { flex: 1, minWidth: 0 }, content: { width: '100%' } },
  },
  user: { placement: 'end', variant: 'outlined', avatar: <Avatar icon={<UserOutlined />} /> },
}

const userText = (message: InsightMessage) => message.parts.map((part) => (part.type === 'text' ? part.text : '')).join('')

type Props = {
  /** 会话 id，也是 useChat 的 id；服务端按它保存消息 */
  conversationId: string
  initialMessages: InsightMessage[]
  /** 一轮回答结束（包括出错、被停止）后调用，用来刷新会话列表 */
  onFinished: () => void
}

export function ChatPage({ conversationId, initialMessages, onFinished }: Props) {
  const [input, setInput] = useState('')
  // 被用户主动停止的消息，在下方标出"已停止生成"
  const [stoppedIds, setStoppedIds] = useState<ReadonlySet<string>>(new Set())
  const { messages, sendMessage, status, stop, error, regenerate, addToolApprovalResponse } = useChat<InsightMessage>({
    id: conversationId,
    messages: initialMessages,
    transport,
    // throttle：流式过程中最多每 50ms 触发一次重渲染，长回答不卡顿
    throttle: 50,
    // 用户在审批卡片上做出选择后，自动把结果发回服务端继续执行
    sendAutomaticallyWhen: lastAssistantMessageIsCompleteWithApprovalResponses,
    onFinish: () => onFinished(),
  })
  const busy = status === 'submitted' || status === 'streaming'

  // AssistantMessage 用 memo 包着，回调要保持引用稳定，否则所有历史消息都会跟着重渲染
  const approveRef = useRef(addToolApprovalResponse)
  approveRef.current = addToolApprovalResponse
  const handleApproval = useCallback<ApprovalHandler>((id, approved) => void approveRef.current({ id, approved }), [])

  const send = (text: string) => {
    if (!text.trim() || busy) return
    void sendMessage({ text })
    setInput('')
  }

  const handleStop = () => {
    const last = messages.at(-1)
    if (last?.role === 'assistant') setStoppedIds((ids) => new Set(ids).add(last.id))
    void stop()
  }

  const items: BubbleListProps['items'] = messages.map((message, index) => {
    const isLast = index === messages.length - 1
    if (message.role === 'user') return { key: message.id, role: 'user', content: userText(message) }

    const active = busy && isLast
    return {
      key: message.id,
      role: 'ai',
      content: <AssistantMessage message={message} active={active} onApproval={handleApproval} />,
      // 助手消息已创建、但还没有任何文字或工具调用时显示加载动画
      loading: active && !hasVisibleContent(message),
      footer: active ? undefined : (
        <MessageActions
          text={textOf(message)}
          stopped={stoppedIds.has(message.id)}
          onRegenerate={isLast ? () => void regenerate() : undefined}
        />
      ),
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
            description="用自然语言提问，我会查表结构、写 SQL、查数据，并把结果画成图表。"
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
          title="回答失败"
          // 限流、预算用完时服务端返回的是中文提示，直接展示
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
        onCancel={handleStop}
        loading={busy}
        placeholder="用自然语言提问，例如：上周各渠道的新增用户有多少？"
        autoSize={{ minRows: 1, maxRows: 6 }}
      />
    </Flex>
  )
}
