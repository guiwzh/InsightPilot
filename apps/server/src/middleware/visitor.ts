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
  const existing = getCookie(c, COOKIE_NAME)
  const id = existing && z.uuid().safeParse(existing).success ? existing : crypto.randomUUID()
  c.set('visitorId', id)
  await next()
  // 接口返回之后再写 cookie：对话接口直接返回 SSE 的 Response，next() 之前设置的响应头不会合并进去，
  // 新访客的第一次提问就会存到一个浏览器拿不到的 ID 名下
  if (id !== existing) setCookie(c, COOKIE_NAME, id, { httpOnly: true, sameSite: 'Lax', path: '/', maxAge: ONE_YEAR_SECONDS })
})
