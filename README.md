# InsightPilot

对话式数据分析 Agent + Generative UI：用自然语言提问，Agent 查表结构、写 SQL、只读执行，把结果渲染成表格和图表。

开发规划见 [docs/开发规划.md](docs/开发规划.md)，每周的数字和踩坑记录见 [docs/指标记录.md](docs/指标记录.md)。

## 本地启动

需要 Node 22+、pnpm、Docker Desktop。

```bash
cp .env.example .env   # 填入 DEEPSEEK_API_KEY；留空时对话进入演示模式，返回固定文本
pnpm install
pnpm db:up             # 启动 PostgreSQL 18，首次会执行 db/init.sql
pnpm db:push           # Drizzle 建 app schema 的表
pnpm db:seed           # 生成 shop 样例数据（约 6 秒）
pnpm dev               # 前端 http://localhost:5173，后端 http://localhost:8787/api
```

## 目录

```
apps/web          React 19 + Vite 8 + antd 6 + Ant Design X，对话页
apps/server       Hono + AI SDK 7 + Drizzle
  src/core        Agent 能力：提示词、模型、工具、SQL 防线、业务口径，Web / MCP / 评测共用
  src/db          app schema 表结构、管理员连接和只读连接
packages/shared   前后端共用的类型和 Zod schema（如图表 DSL）
db/init.sql       建 schema、只读角色 analyst_ro、时区
db/shop.sql       样例业务库的 7 张表和中文注释
db/seed.ts        造数脚本（固定随机种子，结果可复现）
```

## 常用命令

| 命令 | 作用 |
|---|---|
| `pnpm dev` | 同时启动前端和后端 |
| `pnpm typecheck` | 全仓类型检查 |
| `pnpm test` | 运行单测：SQL 防线、图表 DSL 校验、specToOption、评测判分器 |
| `pnpm eval` | 用开发集 + 安全用例评测线上配置，报告写到 `apps/server/evals/reports/` |
| `pnpm eval --ladder --runs 2` | 从基线开始逐项叠加优化，每题跑 2 次，对比每一项的增益 |
| `pnpm eval --unstable-prefix` | 对照实验：提示词开头每次都变，看缓存命中率和成本的变化 |
| `pnpm db:push` | 把 `apps/server/src/db/schema.ts` 的变更同步到数据库（只动 app schema） |
| `pnpm db:seed` | 重建并重新生成 shop 样例数据 |
| `pnpm db:reset` | 删除数据卷后从头来一遍：init.sql → push → seed |

## 数据库账号

- `insightpilot`：管理员，用于 push、造数和应用表读写。
- `analyst_ro`：Agent 专用，只有 `shop` schema 的 `SELECT` 权限，看不到 `app` schema；默认只读事务、5 秒语句超时、不能建临时表。
