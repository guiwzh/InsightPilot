import type { ConversationDetail, ConversationSummary, HealthResponse, QueryResultResponse, StatsResponse } from '@insightpilot/shared'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

export class HttpError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message)
  }
}

async function getJson<T>(url: string): Promise<T> {
  const res = await fetch(url)
  // 健康检查在数据库不可用时返回 503，但 body 结构不变，照样解析
  if (!res.ok && res.status !== 503) throw new HttpError(res.status, `请求失败：${res.status}`)
  return res.json() as Promise<T>
}

export function useHealth() {
  return useQuery({ queryKey: ['health'], queryFn: () => getJson<HealthResponse>('/api/health') })
}

/** 查询结果写入后不会再变，拉一次就永久缓存 */
export function useQueryResult(resultId: string | undefined) {
  return useQuery({
    queryKey: ['result', resultId],
    queryFn: () => getJson<QueryResultResponse>(`/api/results/${resultId}`),
    enabled: Boolean(resultId),
    staleTime: Infinity,
  })
}

export function useConversations() {
  return useQuery({ queryKey: ['conversations'], queryFn: () => getJson<ConversationSummary[]>('/api/conversations') })
}

/** 已有会话的历史消息；新会话（还没发过消息）不请求 */
export function useConversation(id: string, enabled: boolean) {
  return useQuery({
    queryKey: ['conversation', id],
    queryFn: () => getJson<ConversationDetail>(`/api/conversations/${id}`),
    enabled,
    // 打开会话时取一次，之后的新消息都在 useChat 里；
    // 切走后立刻丢掉缓存（gcTime 0），下次切回来重新拉，避免用旧缓存初始化 useChat
    staleTime: Infinity,
    gcTime: 0,
    retry: false,
  })
}

export function useDeleteConversation() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`/api/conversations/${id}`, { method: 'DELETE' })
      if (!res.ok) throw new HttpError(res.status, '删除失败')
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['conversations'] }),
  })
}

export function useStats(days: number) {
  return useQuery({
    queryKey: ['stats', days],
    queryFn: () => getJson<StatsResponse>(`/api/stats?days=${days}`),
    // 看板打开期间每 30 秒刷新一次
    refetchInterval: 30_000,
  })
}
