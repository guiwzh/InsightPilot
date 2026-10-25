// 纯计数逻辑，不依赖环境变量和 Hono，方便单测

/**
 * 固定窗口计数：每个 key 每个窗口内最多 limit 次。
 * 纯内存实现，单进程部署够用；多实例部署时要换成 Redis 之类的共享存储。
 */
export function createFixedWindow({ windowMs, limit }: { windowMs: number; limit: number }) {
  const windows = new Map<string, { count: number; resetAt: number }>()

  return function hit(key: string, now = Date.now()) {
    let window = windows.get(key)
    if (!window || window.resetAt <= now) {
      window = { count: 0, resetAt: now + windowMs }
      windows.set(key, window)
    }
    window.count++
    // 顺手清理过期的 key，防止内存无限增长
    if (windows.size > 10_000) {
      for (const [k, w] of windows) if (w.resetAt <= now) windows.delete(k)
    }
    return { allowed: window.count <= limit, retryAfterMs: window.resetAt - now }
  }
}
