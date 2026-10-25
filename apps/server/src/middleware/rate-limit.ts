import { getConnInfo } from '@hono/node-server/conninfo'
import type { Context } from 'hono'
import { createMiddleware } from 'hono/factory'
import { env } from '../env'
import { clientIpFrom } from './client-ip'
import { createFixedWindow } from './fixed-window'

/** 客户端 IP。部署在代理后面（TRUST_PROXY=true）时从 X-Forwarded-For 里找，规则见 client-ip.ts */
export function clientIp(c: Context) {
  const remote = getConnInfo(c).remote.address
  return env.TRUST_PROXY ? clientIpFrom(c.req.header('x-forwarded-for'), remote) : (remote ?? 'unknown')
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
