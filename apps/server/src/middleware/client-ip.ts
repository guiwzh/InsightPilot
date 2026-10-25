// 从代理链里找出真实客户端 IP。纯函数，不依赖环境变量，方便单测。
//
// 线上的链路是：浏览器 → Nginx Proxy Manager → Caddy → Node，每一层代理都会把上一跳的地址追加到 X-Forwarded-For 的右边。
// 所以从右往左看：我们自己的代理都在内网（Docker 网络），跳过它们，遇到的第一个公网地址就是真实客户端。
// 更左边的部分来自客户端自己的请求头，可以随意伪造，不能用。

/** 内网、回环、链路本地、运营商级 NAT 地址 */
export function isPrivateIp(raw: string) {
  const ip = raw.trim().replace(/^::ffff:/i, '')
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(ip)) {
    const [a, b] = ip.split('.').map(Number)
    return (
      a === 10 ||
      a === 127 ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) ||
      (a === 169 && b === 254) ||
      (a === 100 && b >= 64 && b <= 127)
    )
  }
  const lower = ip.toLowerCase()
  return lower === '::1' || lower.startsWith('fc') || lower.startsWith('fd') || lower.startsWith('fe80')
}

/**
 * forwardedFor：X-Forwarded-For 请求头；remote：直接连上来的地址（离我们最近的一跳）。
 * 整条链都是内网地址时（比如本机测试），返回直接连上来的地址。
 */
export function clientIpFrom(forwardedFor: string | undefined, remote: string | undefined): string {
  const hops = [...(forwardedFor?.split(',') ?? []), remote ?? ''].map((hop) => hop.trim()).filter(Boolean)
  for (let i = hops.length - 1; i >= 0; i--) {
    if (!isPrivateIp(hops[i])) return hops[i]
  }
  return remote || 'unknown'
}
