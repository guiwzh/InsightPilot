import { DeleteOutlined, PlusOutlined } from '@ant-design/icons'
import { Conversations } from '@ant-design/x'
import { useQueryClient } from '@tanstack/react-query'
import { App, Flex, Layout, Spin, theme } from 'antd'
import { useCallback, useEffect, useState } from 'react'
import { useConversation, useConversations, useDeleteConversation } from '../../api/client'
import type { InsightMessage } from '../../types'
import { ChatPage } from './ChatPage'

/** 当前会话放在地址栏 ?c=<id>，刷新页面后还能回到同一个会话 */
function readConversationFromUrl() {
  return new URLSearchParams(window.location.search).get('c')
}

function writeConversationToUrl(id: string) {
  const url = new URL(window.location.href)
  url.searchParams.set('c', id)
  window.history.replaceState(null, '', url)
}

type Current = { id: string; isNew: boolean }

export function ChatLayout() {
  const { token } = theme.useToken()
  const { message } = App.useApp()
  const queryClient = useQueryClient()
  const conversations = useConversations()
  const deleteConversation = useDeleteConversation()

  const [current, setCurrent] = useState<Current>(() => {
    const fromUrl = readConversationFromUrl()
    return fromUrl ? { id: fromUrl, isNew: false } : { id: crypto.randomUUID(), isNew: true }
  })
  const detail = useConversation(current.id, !current.isNew)

  useEffect(() => writeConversationToUrl(current.id), [current.id])

  // 地址栏里的会话不存在（被删了、换了浏览器）时，开一个新会话
  useEffect(() => {
    if (detail.isError) setCurrent({ id: crypto.randomUUID(), isNew: true })
  }, [detail.isError])

  const startNew = () => setCurrent({ id: crypto.randomUUID(), isNew: true })

  // 新会话发出第一条消息后，服务端就建好了这条会话；回答结束时刷新侧栏
  const handleFinished = useCallback(() => {
    void queryClient.invalidateQueries({ queryKey: ['conversations'] })
  }, [queryClient])

  const items = (conversations.data ?? []).map((c) => ({ key: c.id, label: c.title }))

  return (
    <Layout style={{ height: '100%' }}>
      <Layout.Sider
        width={240}
        style={{ background: token.colorBgContainer, borderRight: `1px solid ${token.colorBorderSecondary}` }}
      >
        <Conversations
          style={{ height: '100%', overflow: 'auto' }}
          items={items}
          activeKey={current.id}
          onActiveChange={(key) => setCurrent({ id: String(key), isNew: false })}
          creation={{ label: '新对话', icon: <PlusOutlined />, onClick: startNew }}
          menu={(item) => ({
            items: [{ key: 'delete', label: '删除', icon: <DeleteOutlined />, danger: true }],
            onClick: () =>
              deleteConversation.mutate(String(item.key), {
                onSuccess: () => {
                  message.success('已删除')
                  if (item.key === current.id) startNew()
                },
              }),
          })}
        />
      </Layout.Sider>
      <Layout.Content style={{ minHeight: 0 }}>
        {current.isNew ? (
          <ChatPage key={current.id} conversationId={current.id} initialMessages={[]} onFinished={handleFinished} />
        ) : detail.data ? (
          <ChatPage
            key={current.id}
            conversationId={current.id}
            initialMessages={detail.data.messages as InsightMessage[]}
            onFinished={handleFinished}
          />
        ) : (
          <Flex justify="center" align="center" style={{ height: '100%' }}>
            <Spin />
          </Flex>
        )}
      </Layout.Content>
    </Layout>
  )
}
