// SQL 防线的 AST 层：在执行前把模型写的 SQL 解析成语法树，只放行"单条、只读、只查 shop 白名单表"的查询。
// 这一层挡住的是"模型写出了不该写的 SQL"；即使这里漏了，数据库的只读角色（db/init.sql）还会再挡一次。
// node-sql-parser 是 CommonJS 包，Node 的原生 ESM 不能按名字导入，只能先拿默认导出
import nodeSqlParser from 'node-sql-parser'

const { Parser } = nodeSqlParser

export const SHOP_TABLES = ['channels', 'users', 'products', 'orders', 'order_items', 'user_events', 'reviews'] as const

/** 单次查询最多返回的行数。执行时多取 1 行，用来判断结果是否被截断 */
export const MAX_ROWS = 1000

/** 包在原 SQL 外面的前缀。PostgreSQL 报错位置要减掉它的长度，才能对应到原 SQL */
export const WRAP_PREFIX = 'SELECT * FROM (\n'

export type GuardErrorCode =
  | 'EMPTY'
  | 'PARSE_ERROR'
  | 'NOT_SINGLE_STATEMENT'
  | 'NOT_SELECT'
  | 'TABLE_NOT_ALLOWED'
  | 'FUNCTION_NOT_ALLOWED'

export type GuardResult =
  | {
      ok: true
      /** 去掉末尾分号后的原 SQL，用于展示和保存 */
      sql: string
      /** 实际执行的 SQL：外面包一层，限制最多返回 MAX_ROWS + 1 行 */
      executableSql: string
      tables: string[]
    }
  | { ok: false; code: GuardErrorCode; message: string; hint: string }

const parser = new Parser()
const PARSE_OPTIONS = { database: 'PostgreSQL' }
const ALLOWED_TABLES = new Set<string>(SHOP_TABLES)

// 能读文件、睡眠、改配置、连外部库、操作大对象的函数一律禁止
const BLOCKED_FUNCTION_PREFIXES = ['pg_', 'dblink', 'lo_']
const BLOCKED_FUNCTIONS = new Set([
  'set_config',
  'current_setting',
  'query_to_xml',
  'query_to_xml_and_xmlschema',
  'table_to_xml',
  'cursor_to_xml',
  'schema_to_xml',
  'database_to_xml',
])

const fail = (code: GuardErrorCode, message: string, hint: string): GuardResult => ({ ok: false, code, message, hint })

export function guardSql(input: string): GuardResult {
  const sql = input.trim().replace(/;+\s*$/, '').trim()
  if (!sql) return fail('EMPTY', 'SQL 为空', '请提供一条 SELECT 语句')

  let ast: unknown
  let tableRefs: string[]
  try {
    ast = parser.astify(sql, PARSE_OPTIONS)
    tableRefs = parser.tableList(sql, PARSE_OPTIONS)
  } catch (error) {
    // 解析不了就拒绝（fail closed），不冒险执行看不懂的语句
    const detail = error instanceof Error ? error.message.split('\n')[0] : String(error)
    return fail('PARSE_ERROR', `SQL 无法解析：${detail.slice(0, 200)}`, '检查语法，只使用标准 PostgreSQL 的 SELECT 写法')
  }

  const statements = Array.isArray(ast) ? ast : [ast]
  if (statements.length !== 1) {
    return fail('NOT_SINGLE_STATEMENT', `检测到 ${statements.length} 条语句`, '一次只能执行一条 SELECT 语句，不要用分号拼接多条')
  }

  const statement = statements[0] as { type?: string; into?: { expr?: unknown } }
  if (statement.type !== 'select') {
    return fail('NOT_SELECT', `只允许 SELECT 查询，收到的是 ${String(statement.type).toUpperCase()}`, '只能读取数据，不能增删改表或数据')
  }
  if (statement.into?.expr) {
    return fail('NOT_SELECT', '不允许 SELECT ... INTO', '去掉 INTO 子句，只返回查询结果')
  }

  const cteNames = collectCteNames(statement)
  const tables = new Set<string>()
  for (const ref of tableRefs) {
    // tableList 的格式是 "操作::schema::表名"，没写 schema 时为 "null"
    const [operation, schema, table] = ref.split('::').map((s) => s.toLowerCase())
    if (operation !== 'select') {
      return fail('NOT_SELECT', `语句中包含 ${operation.toUpperCase()} 操作`, '只能读取数据，不能增删改表或数据')
    }
    // CTE 名是从整棵语法树收集的，不分作用域：子查询里定义一个 pg_roles，外层再引用 pg_roles，指向的其实是系统表。
    // 不写 schema 的名字会先在 pg_catalog 里找，而系统表都以 pg_ 开头，所以 pg_ 开头的名字一律不当作 CTE
    const isCte = cteNames.has(table) && !table.startsWith('pg_')
    const allowed = schema === 'shop' ? ALLOWED_TABLES.has(table) : schema === 'null' && (ALLOWED_TABLES.has(table) || isCte)
    if (!allowed) {
      const name = schema === 'null' ? table : `${schema}.${table}`
      return fail('TABLE_NOT_ALLOWED', `不能查询 ${name}`, `只能查询 shop 下的表：${SHOP_TABLES.join('、')}`)
    }
    if (!cteNames.has(table)) tables.add(table)
  }

  for (const name of collectFunctionNames(statement)) {
    const [schema, fn] = name.includes('.') ? name.split('.', 2) : [undefined, name]
    if (
      (schema && schema !== 'pg_catalog') ||
      BLOCKED_FUNCTIONS.has(fn) ||
      BLOCKED_FUNCTION_PREFIXES.some((prefix) => fn.startsWith(prefix))
    ) {
      return fail('FUNCTION_NOT_ALLOWED', `不允许调用函数 ${name}`, '只使用常规的聚合、日期、字符串和数学函数')
    }
  }

  // 外面包一层子查询来限制行数：不管原 SQL 有没有 LIMIT、是不是 UNION，都统一生效。
  // 换行是为了防止原 SQL 末尾的 -- 注释把右括号注释掉
  const executableSql = `${WRAP_PREFIX}${sql}\n) AS _guarded LIMIT ${MAX_ROWS + 1}`
  return { ok: true, sql, executableSql, tables: [...tables] }
}

/** 遍历语法树，收集所有 WITH 定义的名字（包括子查询里的） */
function collectCteNames(root: unknown): Set<string> {
  const names = new Set<string>()
  walk(root, (node) => {
    if (Array.isArray(node.with)) {
      for (const cte of node.with as { name?: { value?: string } | string }[]) {
        const name = typeof cte.name === 'string' ? cte.name : cte.name?.value
        if (name) names.add(name.toLowerCase())
      }
    }
  })
  return names
}

/** 遍历语法树，收集所有函数调用的名字，带 schema 的写成 "schema.name" */
function collectFunctionNames(root: unknown): string[] {
  const names: string[] = []
  walk(root, (node) => {
    if (node.type !== 'function' && node.type !== 'aggr_func') return
    const raw = node.name as string | { name?: { value: string }[]; schema?: { value: string } } | undefined
    if (typeof raw === 'string') {
      names.push(raw.toLowerCase())
    } else if (raw?.name) {
      const fn = raw.name.map((part) => part.value).join('.')
      names.push((raw.schema ? `${raw.schema.value}.${fn}` : fn).toLowerCase())
    }
  })
  return names
}

function walk(node: unknown, visit: (node: Record<string, unknown>) => void) {
  if (Array.isArray(node)) {
    for (const child of node) walk(child, visit)
  } else if (node && typeof node === 'object') {
    visit(node as Record<string, unknown>)
    for (const child of Object.values(node)) walk(child, visit)
  }
}
