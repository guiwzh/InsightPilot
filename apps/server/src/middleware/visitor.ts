import { getCookie, setCookie } from 'hono/cookie'
import { createMiddleware } from 'hono/factory'
import { z } from 'zod'

export type AppEnv = { Variables: { visitorId: string } }

const COOKIE_NAME = 'ip_vid'
const ONE_YEAR_SECONDS = 60 * 60 * 24 * 365

/**
 * 匿名访客 ID（代替登录系统）：第一次访问时生成 UUID 写进 cookie。
 * 会话列表、每日预算都按它区分。httpOnly 防止前端脚本读取，SameSite=Lax 防跨站请求带上它。
 */
export const visitor = createMiddleware<AppEnv>(async (c, next) => {
  let id = getCookie(c, COOKIE_NAME)
  if (!id || !z.uuid().safeParse(id).success) {
    id = crypto.randomUUID()
    setCookie(c, COOKIE_NAME, id, { httpOnly: true, sameSite: 'Lax', path: '/', maxAge: ONE_YEAR_SECONDS })
  }
  c.set('visitorId', id)
  await next()
})
