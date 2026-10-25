// 生产构建：把 server 和 MCP 入口各打成一个 ESM 文件，依赖全部打进去。
// 运行时镜像里不需要 node_modules，也和 CPU 架构无关，可以在 Mac 上构建、在 x86 服务器上运行。
import { build } from 'esbuild'

await build({
  entryPoints: { index: 'src/index.ts', mcp: 'src/mcp.ts' },
  outdir: 'dist',
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node22',
  // 不压缩代码，报错堆栈里的函数名可读；source map 有 20MB+，不放进镜像
  sourcemap: false,
  logLevel: 'info',
  // 打进 ESM 的 CommonJS 依赖会 require('fs') 这类内置模块，ESM 里没有 require，补一个
  banner: { js: "import { createRequire as __createRequire } from 'node:module'; const require = __createRequire(import.meta.url);" },
})
