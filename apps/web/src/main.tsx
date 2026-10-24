import { XProvider } from '@ant-design/x'
import xZhCN from '@ant-design/x/locale/zh_CN'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { App as AntdApp } from 'antd'
import antdZhCN from 'antd/locale/zh_CN'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { App } from './App'
import './index.css'

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: 1, refetchOnWindowFocus: false } },
})

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <XProvider locale={{ ...antdZhCN, ...xZhCN }}>
        {/* antd 的 App 会多包一层 div，撑满高度后页面布局才能占满视口 */}
        <AntdApp style={{ height: '100%' }}>
          <App />
        </AntdApp>
      </XProvider>
    </QueryClientProvider>
  </StrictMode>,
)
