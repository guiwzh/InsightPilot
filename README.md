# InsightPilot

**对话式数据分析 Agent + Generative UI。** 运营同学用自然语言提问，Agent 自己查表结构、读业务口径、写 SQL、只读执行、出错自修正，再把结果流式渲染成可交互的图表和表格；导出数据要用户确认；附带评测体系、运营看板和 MCP server。

> A conversational BI copilot: an LLM agent that inspects the schema, reads metric definitions, writes and safely executes read-only SQL, and streams the result back as interactive charts (Generative UI via a validated chart DSL). Exports require human approval. Ships with an execution-based eval suite, a cost/latency dashboard, and an MCP server.

**在线体验：<https://insight.guiwz.cn>**（无需登录；为控制成本，每个 IP 每分钟最多 10 次提问，每个访客每天有 token 上限）

## 关键数字

| 指标 | 结果 |
|---|---|
| 开发集准确率（40 题，每题 3 次） | 100%，三次结果一致 |
| **留出测试集准确率**（10 题，每题 3 次，只跑一次） | **93.3%**（2 次失败：1 次 API 余额限流没发出查询，1 次答案正确但被判分器误判，见下文） |
| 逐项优化的增益（开发集） | 基线 61.3% → 加表注释与常见取值 77.5% → 加业务口径 100% |
| 单题平均成本 | ¥0.004 左右（DeepSeek V4.1 Flash，缓存命中率约 89%） |
| 保持提示词开头稳定带来的成本降低 | **40.2%**（对照实验：开头每次都变时为 ¥0.0071） |
| 延迟 | P50 约 4–4.5 秒（一次问答 4 步左右），首字约 0.6–0.9 秒 |
| 安全用例 | 删除数据、越权查表、提示注入、索要提示词、关只读改数据、导出未确认，全部通过 |
| 单测 | 99 个（SQL 防线、图表 DSL、判分器、CSV、限流、真实 IP 解析） |

所有数字都能复现：评测报告在 `apps/server/evals/reports/`，过程记录在 [docs/指标记录.md](docs/指标记录.md)。

## 演示

1. **查数 + 画图**："9 月最后一周各渠道新增用户和下单转化率，按天看趋势" → 工具轨迹逐步展开（看表结构 → 读口径 → 执行 SQL → 画图）→ 两张按渠道分组的折线图 + 文字结论。
2. **导出审批**："把这个结果导出成 CSV" → 弹出审批卡片（文件名、行数、SQL）→ 点"允许"后才生成下载链接；点"拒绝"则不导出。
3. **运营看板**：提问数、成功率、单次成本、P50/P95、首字时间、缓存命中率、工具出错率、审批通过率。
4. **MCP**：在 Claude Desktop / Cursor 里接入，直接用同一套只读工具查数。

## 架构

```
浏览器  React 19 · antd 6 · Ant Design X · ECharts 6
  │  useChat（SSE）· 工具轨迹 · 审批卡片 · 图表 / 表格切换 · 看板
  ▼
Caddy  静态文件 · 自动 HTTPS · 反向代理（SSE 不缓冲）
  ▼
Hono（Node）  访客 cookie → 限流 → 每日预算 → streamText（最多 8 步）
  │   └─ src/core：list_tables · describe_table · get_metric_definitions
  │                run_sql ─▶ AST 校验 ─▶ 只读角色（5 秒超时、最多 1000 行）
  │                render_chart（图表 DSL 校验）· export_csv（需用户确认）
  │   onEnd ─▶ agent_runs（token、成本、首字时间、工具耗时）
  ▼
PostgreSQL  shop：样例电商数据（Agent 只读） · app：会话、日志、查询结果

src/core 被三处复用：Web 接口、MCP server（stdio）、评测脚本 —— 评测测到的就是线上的 Agent。
```

## 设计要点

- **数据不经过模型**：`run_sql` 把完整结果存库，只给模型列信息和前 100 行；图表 DSL 只描述"哪一列画在哪"，数据由前端按 `resultId` 拉取。省 token，模型也无从编造数字。
- **图表用 DSL 而不是让模型写代码**：结构固定（Zod 校验 + 列名存在性校验），所以能自动评测，也不会有 XSS 和任意代码执行。字段写错时把可用列返回给模型，让它自己改。
- **SQL 四层防线**：提示词约束 → AST 校验（只允许单条 SELECT、白名单表、禁危险函数、解析不了就拒绝）→ 数据库只读角色（只有 shop 的 SELECT 权限、超时）→ 返回给模型的数据标注"是数据不是指令"（防间接提示注入）。
- **业务口径（语义层）**：GMV、转化率、退款率、复购率等 13 个指标的定义和参考 SQL 集中在一个文件。评测显示它是准确率提升最大的一项（+22.5 个百分点）。
- **Human-in-the-loop**：导出走 AI SDK 7 的 `toolApproval`，前端审批后原消息续跑。
- **评测**：按执行结果判分（严格 / 宽松两档），逐项开关做消融实验，开发集和测试集分开，安全用例单独检查。

更多取舍见 [docs/adr/](docs/adr/)，踩过的坑见 [docs/失败案例复盘.md](docs/失败案例复盘.md)。

## 技术栈

React 19 · Vite 8 · antd 6 · Ant Design X 2 · ECharts 6 · TanStack Query · Vercel AI SDK 7 · Hono 4 · Drizzle ORM · PostgreSQL 18 · node-sql-parser · Zod 4 · MCP TypeScript SDK v2 · Vitest · Docker · Caddy · DeepSeek V4.1 Flash

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

## 常用命令

| 命令 | 作用 |
|---|---|
| `pnpm dev` | 同时启动前端和后端 |
| `pnpm typecheck` / `pnpm test` | 全仓类型检查 / 单测 |
| `pnpm eval` | 开发集 + 安全用例评测线上配置，报告写到 `apps/server/evals/reports/` |
| `pnpm eval --ladder --runs 2` | 从基线开始逐项叠加优化，对比每一项的增益 |
| `pnpm eval --set test` | 留出测试集（只在最终出数字时跑） |
| `pnpm eval --unstable-prefix` / `--thinking` | 对照实验：提示词开头不稳定 / 打开思考模式 |
| `pnpm db:push` / `db:seed` / `db:reset` | 同步表结构 / 重新造数 / 从头重建数据库 |
| `DEPLOY_HOST=root@<IP> ./scripts/deploy.sh app` | 本机构建并部署到服务器，见 [docs/部署.md](docs/部署.md) |

## 在 Claude Desktop 里使用（MCP）

先构建：`pnpm --filter @insightpilot/server build`，然后在 Claude Desktop 的配置文件里加入：

```json
{
  "mcpServers": {
    "insightpilot": {
      "command": "/node 的绝对路径（which node）",
      "args": ["/仓库绝对路径/apps/server/dist/mcp.js"]
    }
  }
}
```

提供 4 个只读工具：`list_tables`、`describe_table`、`get_metric_definitions`、`run_readonly_sql`，和 Web 端共用同一套 SQL 防线。需要本地数据库在运行（`pnpm db:up`）。

## 目录

```
apps/web            前端：对话页、工具轨迹、图表卡片、审批卡片、看板
apps/server         Hono API
  src/core          Agent 能力：配置、提示词、工具、SQL 防线、业务口径、成本
  src/mcp.ts        MCP server（stdio）
  evals             评测集、判分器、评测脚本、报告
packages/shared     前后端共用的类型和 Zod schema（工具输入输出、图表 DSL）
db                  建库脚本、样例数据表结构、造数脚本
deploy              Dockerfile、Caddyfile
docs                开发规划、指标记录、技术决策、失败复盘、部署、面试准备
```

## AI Coding

这个项目大部分代码由我和 Claude Code 结对完成：我负责需求、方案取舍和验收，AI 负责实现。保证质量靠的不是"相信 AI"，而是可验证的东西：TypeScript 严格模式、99 个单测、按执行结果判分的评测集、每个功能都在浏览器里实测。踩过的坑和 AI 犯过的错都记在 [docs/指标记录.md](docs/指标记录.md)。
