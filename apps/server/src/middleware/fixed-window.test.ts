import { describe, expect, it } from 'vitest'
import { createFixedWindow } from './fixed-window'

describe('createFixedWindow', () => {
  it('窗口内超过上限就拒绝', () => {
    const hit = createFixedWindow({ windowMs: 60_000, limit: 2 })
    expect(hit('a', 0).allowed).toBe(true)
    expect(hit('a', 1).allowed).toBe(true)
    expect(hit('a', 2)).toEqual({ allowed: false, retryAfterMs: 59_998 })
  })

  it('不同 key 分别计数', () => {
    const hit = createFixedWindow({ windowMs: 60_000, limit: 1 })
    expect(hit('a', 0).allowed).toBe(true)
    expect(hit('b', 0).allowed).toBe(true)
    expect(hit('a', 0).allowed).toBe(false)
  })

  it('窗口过期后重新计数', () => {
    const hit = createFixedWindow({ windowMs: 1000, limit: 1 })
    expect(hit('a', 0).allowed).toBe(true)
    expect(hit('a', 999).allowed).toBe(false)
    expect(hit('a', 1000).allowed).toBe(true)
  })
})
