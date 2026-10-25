# 技术决策记录（ADR）

每条记录回答四个问题：当时面对什么问题、做了什么决定、为什么、代价是什么（以及什么情况下应该推翻它）。

| 编号 | 决定 |
|---|---|
| [0001](0001-hono.md) | 后端用 Hono，不用 NestJS / Express |
| [0002](0002-chart-dsl.md) | 图表用受约束的 DSL，不让模型生成 React 或 ECharts 代码 |
| [0003](0003-no-redis.md) | 不引入 Redis，缓存、限流、日志都用 PostgreSQL 和进程内存 |
| [0004](0004-sse.md) | 流式输出用 SSE，不用 WebSocket |
| [0005](0005-drizzle-push.md) | 表结构用 drizzle-kit push 同步，不写迁移文件 |
| [0006](0006-anonymous-visitor.md) | 不做登录，用匿名访客 cookie 加三道预算闸 |
