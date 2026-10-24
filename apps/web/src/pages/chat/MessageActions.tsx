import { CopyOutlined, ReloadOutlined } from '@ant-design/icons'
import { App, Button, Space, Tag, Tooltip } from 'antd'

/** 助手消息下方的操作：复制回答、重新生成（只有最后一条可以），被停止的消息标出来 */
export function MessageActions({
  text,
  stopped,
  onRegenerate,
}: {
  text: string
  stopped: boolean
  onRegenerate?: () => void
}) {
  const { message } = App.useApp()

  const copy = async () => {
    await navigator.clipboard.writeText(text)
    message.success('已复制')
  }

  return (
    <Space size={0}>
      {stopped && <Tag>已停止生成</Tag>}
      {text && (
        <Tooltip title="复制回答">
          <Button type="text" size="small" icon={<CopyOutlined />} onClick={() => void copy()} />
        </Tooltip>
      )}
      {onRegenerate && (
        <Tooltip title="重新生成">
          <Button type="text" size="small" icon={<ReloadOutlined />} onClick={onRegenerate} />
        </Tooltip>
      )}
    </Space>
  )
}
