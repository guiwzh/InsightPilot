import type { HealthResponse, QueryResultResponse } from '@insightpilot/shared'
import { useQuery } from '@tanstack/react-query'

async function getJson<T>(url: string): Promise<T> {
  const res = await fetch(url)
  // 健康检查在数据库不可用时返回 503，但 body 结构不变，照样解析
  if (!res.ok && res.status !== 503) throw new Error(`请求失败：${res.status}`)
  return res.json() as Promise<T>
}

export function useHealth() {
  return useQuery({ queryKey: ['health'], queryFn: () => getJson<HealthResponse>('/api/health') })
}

/** 查询结果写入后不会再变，拉一次就永久缓存 */
export function useQueryResult(resultId: string) {
  return useQuery({
    queryKey: ['result', resultId],
    queryFn: () => getJson<QueryResultResponse>(`/api/results/${resultId}`),
    staleTime: Infinity,
  })
}
