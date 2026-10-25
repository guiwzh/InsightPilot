import { getConnInfo } from '@hono/node-server/conninfo'
import type { Context } from 'hono'
import { createMiddleware } from 'hono/factory'

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

/** 客户端 IP。第 6 周部署到 Caddy 后面时，改为读取 Caddy 设置的 X-Forwarded-For */
export function clientIp(c: Context) {
  return getConnInfo(c).remote.address ?? 'unknown'
}

export function rateLimit({ windowMs, limit }: { windowMs: number; limit: number }) {
  const hit = createFixedWindow({ windowMs, limit })
  return createMiddleware(async (c, next) => {
    const { allowed, retryAfterMs } = hit(clientIp(c))
    if (!allowed) {
      const seconds = Math.ceil(retryAfterMs / 1000)
      c.header('Retry-After', String(seconds))
      return c.text(`请求太频繁了，请 ${seconds} 秒后再试`, 429)
    }
    await next()
  })
}
