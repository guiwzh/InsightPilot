import { describe, expect, it } from 'vitest'
import { clientIpFrom, isPrivateIp } from './client-ip'

describe('isPrivateIp', () => {
  it.each(['10.1.2.3', '172.18.0.5', '192.168.1.1', '127.0.0.1', '::1', '::ffff:172.18.0.2', 'fd00::1', '100.64.0.1'])('%s 是内网地址', (ip) => {
    expect(isPrivateIp(ip)).toBe(true)
  })

  it.each(['8.136.180.80', '172.32.0.1', '1.1.1.1', '2408:8000::1'])('%s 是公网地址', (ip) => {
    expect(isPrivateIp(ip)).toBe(false)
  })
})

describe('clientIpFrom', () => {
  it('浏览器 → NPM → Caddy → Node：跳过两层内网代理，取到真实客户端', () => {
    expect(clientIpFrom('203.0.113.7, 172.18.0.2', '172.20.0.3')).toBe('203.0.113.7')
  })

  it('客户端在请求头里伪造的地址在左边，不会被采用', () => {
    expect(clientIpFrom('1.2.3.4, 203.0.113.7, 172.18.0.2', '172.20.0.3')).toBe('203.0.113.7')
    expect(clientIpFrom('10.0.0.1, 203.0.113.7, 172.18.0.2', '172.20.0.3')).toBe('203.0.113.7')
  })

  it('没有代理时直接用连接地址', () => {
    expect(clientIpFrom(undefined, '203.0.113.7')).toBe('203.0.113.7')
  })

  it('整条链都是内网地址时，用直接连上来的地址', () => {
    expect(clientIpFrom('172.18.0.2', '172.20.0.3')).toBe('172.20.0.3')
  })
})
