import { useEffect, useState } from 'react'

export type Route = 'chat' | 'dashboard'

const parse = (): Route => (window.location.hash === '#/dashboard' ? 'dashboard' : 'chat')

/** 只有两个页面，用 hash 区分就够了，不必引入路由库：#/ 是对话，#/dashboard 是看板 */
export function useHashRoute() {
  const [route, setRoute] = useState<Route>(parse)

  useEffect(() => {
    const onChange = () => setRoute(parse())
    window.addEventListener('hashchange', onChange)
    return () => window.removeEventListener('hashchange', onChange)
  }, [])

  const navigate = (next: Route) => {
    window.location.hash = next === 'dashboard' ? '#/dashboard' : '#/'
  }
  return [route, navigate] as const
}
