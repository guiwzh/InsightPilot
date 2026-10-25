// MCP server（stdio 传输）：把查数能力开放给 Claude Desktop、Cursor 等 MCP 客户端。
// 直接复用 src/core 的工具函数，安全防线和 Web 端完全一致：只读角色、AST 校验、5 秒超时、最多 1000 行。
// 注意：stdio 模式下 stdout 是协议通道，这个进程里不能 console.log，日志只能写 stderr。
import { DescribeTableInput, GetMetricDefinitionsInput } from '@insightpilot/shared'
import { McpServer } from '@modelcontextprotocol/server'
import { serveStdio } from '@modelcontextprotocol/server/stdio'
import { z } from 'zod'
import { runSql } from './core/run-sql'
import { describeTables, listTablesFor } from './core/schema-info'
import { findMetrics } from './core/semantic/metrics'

const json = (value: unknown) => ({ content: [{ type: 'text' as const, text: JSON.stringify(value, null, 2) }] })
const failure = (error: unknown) => ({
  isError: true,
  content: [{ type: 'text' as const, text: error instanceof Error ? error.message : String(error) }],
})
const readOnly = { readOnlyHint: true, openWorldHint: false }

function createServer() {
  const server = new McpServer({ name: 'insightpilot', version: '0.1.0' })

  server.registerTool(
    'list_tables',
    {
      title: '列出可查询的表',
      description: '列出 shop 电商样例库中可查询的表、中文说明和大致行数。',
      inputSchema: z.object({}),
      annotations: readOnly,
    },
    async () => json(await listTablesFor()),
  )

  server.registerTool(
    'describe_table',
    {
      title: '查看表结构',
      description: '查看表的列名、类型、中文注释、主外键、常见取值和取值范围。写 SQL 前先看涉及的表。',
      inputSchema: DescribeTableInput,
      annotations: readOnly,
    },
    async ({ tables }) => json(await describeTables(tables)),
  )

  server.registerTool(
    'get_metric_definitions',
    {
      title: '读取指标口径',
      description: '读取 GMV、下单转化率、退款率、复购率等指标的标准口径和参考 SQL。',
      inputSchema: GetMetricDefinitionsInput,
      annotations: readOnly,
    },
    async ({ keywords }) => json(findMetrics(keywords)),
  )

  server.registerTool(
    'run_readonly_sql',
    {
      title: '执行只读 SQL',
      description:
        '执行一条只读的 PostgreSQL SELECT 查询（可以用 WITH），只能查询 shop 下的表，最多返回 1000 行、超时 5 秒。返回列信息和前 100 行。出错时返回错误码和修复建议。',
      inputSchema: z.object({ sql: z.string().describe('一条 PostgreSQL SELECT 语句') }),
      annotations: readOnly,
    },
    async ({ sql }) => {
      try {
        // resultId 指向 Web 端的结果缓存，对 MCP 客户端没有意义，不返回
        const { resultId: _resultId, ...result } = await runSql(sql)
        return json(result)
      } catch (error) {
        return failure(error)
      }
    },
  )

  return server
}

serveStdio(() => createServer())
