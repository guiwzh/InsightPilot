import { describe, expect, it } from 'vitest'
import { guardSql, MAX_ROWS } from './sql-guard'

const allowed = (sql: string) => {
  const result = guardSql(sql)
  if (!result.ok) throw new Error(`应当放行，却被拒绝：${result.code} ${result.message}`)
  return result
}

const rejected = (sql: string) => {
  const result = guardSql(sql)
  if (result.ok) throw new Error(`应当拒绝，却被放行：${sql}`)
  return result
}

describe('放行：常见的分析查询', () => {
  it.each([
    ['带 schema 前缀', 'SELECT count(*) FROM shop.orders'],
    ['不带 schema（search_path 是 shop）', 'SELECT count(*) FROM orders'],
    ['大写表名', 'SELECT COUNT(*) FROM SHOP.ORDERS'],
    ['类型转换与按天分组', 'SELECT created_at::date AS d, count(*) FROM shop.orders GROUP BY 1 ORDER BY 1'],
    ['date_trunc 与 interval', "SELECT date_trunc('week', registered_at), count(*) FROM shop.users WHERE registered_at >= DATE '2026-09-30' - INTERVAL '7 days' GROUP BY 1"],
    ['FILTER 子句', "SELECT count(*) FILTER (WHERE status = 'refunded') AS r FROM shop.orders"],
    ['窗口函数', 'SELECT category_l1, sum(price) OVER (PARTITION BY category_l1) FROM shop.products'],
    ['中文别名', 'SELECT c.name AS "渠道", count(*) AS "新增用户" FROM shop.users u JOIN shop.channels c ON c.id = u.channel_id GROUP BY c.name'],
    ['CTE', "WITH v AS (SELECT user_id FROM shop.user_events WHERE event_type = 'visit') SELECT count(DISTINCT user_id) FROM v"],
    ['UNION ALL', "SELECT 'u' AS k, count(*) FROM shop.users UNION ALL SELECT 'o', count(*) FROM shop.orders"],
    ['generate_series 生成日期序列', "SELECT d::date FROM generate_series(DATE '2026-09-24', DATE '2026-09-30', INTERVAL '1 day') AS d"],
    ['percentile_cont', 'SELECT percentile_cont(0.5) WITHIN GROUP (ORDER BY pay_amount) FROM shop.orders'],
  ])('%s', (_name, sql) => {
    allowed(sql)
  })

  it('记录涉及的表，不包含 CTE 名', () => {
    const result = allowed('WITH v AS (SELECT * FROM shop.user_events) SELECT * FROM v JOIN shop.users u ON u.id = v.user_id')
    expect(result.tables.sort()).toEqual(['user_events', 'users'])
  })

  it('去掉末尾分号', () => {
    expect(allowed('SELECT 1 FROM shop.orders;;  ').sql).toBe('SELECT 1 FROM shop.orders')
  })

  it('包一层子查询，最多取 MAX_ROWS + 1 行', () => {
    const result = allowed('SELECT * FROM shop.orders')
    expect(result.executableSql).toContain(`LIMIT ${MAX_ROWS + 1}`)
    expect(result.executableSql).toContain('SELECT * FROM shop.orders')
  })

  it('原 SQL 自带更大的 LIMIT 时，外层 LIMIT 仍然生效', () => {
    expect(allowed('SELECT * FROM shop.orders LIMIT 50000').executableSql).toMatch(/\) AS _guarded LIMIT 1001$/)
  })

  it('末尾的 -- 注释不会吞掉外层右括号', () => {
    expect(allowed('SELECT 1 FROM shop.orders -- 注释').executableSql).toContain('-- 注释\n)')
  })
})

describe('拒绝：写操作和多语句', () => {
  it.each([
    ['DELETE', 'DELETE FROM shop.orders'],
    ['UPDATE', "UPDATE shop.orders SET status = 'paid'"],
    ['INSERT', "INSERT INTO shop.channels VALUES (99, 'x', 'paid')"],
    ['DROP', 'DROP TABLE shop.orders'],
    ['TRUNCATE', 'TRUNCATE shop.orders'],
    ['CREATE', 'CREATE TABLE shop.x (id int)'],
    ['GRANT', 'GRANT ALL ON shop.orders TO public'],
  ])('%s', (_name, sql) => {
    expect(['NOT_SELECT', 'PARSE_ERROR']).toContain(rejected(sql).code)
  })

  it('分号拼接的多条语句', () => {
    expect(rejected('SELECT 1 FROM shop.orders; DROP TABLE shop.orders').code).toBe('NOT_SINGLE_STATEMENT')
  })

  it('写入型 CTE', () => {
    expect(['NOT_SELECT', 'PARSE_ERROR']).toContain(rejected('WITH d AS (DELETE FROM shop.orders RETURNING *) SELECT * FROM d').code)
  })

  it('SELECT INTO', () => {
    expect(['NOT_SELECT', 'PARSE_ERROR']).toContain(rejected('SELECT * INTO shop.backup FROM shop.orders').code)
  })

  it('空 SQL 和无法解析的文本', () => {
    expect(rejected('  ;  ').code).toBe('EMPTY')
    expect(rejected('帮我查一下订单').code).toBe('PARSE_ERROR')
  })
})

describe('拒绝：越界的表', () => {
  it.each([
    ['app schema', 'SELECT * FROM app.conversations'],
    ['不带 schema 的 app 表名', 'SELECT * FROM conversations'],
    ['系统表', 'SELECT * FROM pg_catalog.pg_roles'],
    ['不带 schema 的系统视图', 'SELECT * FROM pg_user'],
    ['information_schema', 'SELECT * FROM information_schema.tables'],
    ['子查询里藏着越界表', 'SELECT * FROM shop.orders WHERE user_id IN (SELECT 1 FROM app.messages)'],
    ['子查询里的同名 CTE 掩护外层的系统表', 'SELECT * FROM (WITH pg_roles AS (SELECT 1) SELECT * FROM pg_roles) a, pg_roles'],
    ['标量子查询里的同名 CTE', 'SELECT (WITH pg_settings AS (SELECT 1) SELECT 1), * FROM pg_settings'],
    ['大小写不同的同名 CTE', 'SELECT * FROM (WITH "PG_STAT_ACTIVITY" AS (SELECT 1) SELECT 1) a, pg_stat_activity'],
  ])('%s', (_name, sql) => {
    expect(rejected(sql).code).toBe('TABLE_NOT_ALLOWED')
  })
})

describe('拒绝：危险函数', () => {
  it.each([
    ['pg_sleep', 'SELECT pg_sleep(10)'],
    ['带 schema 的 pg_read_file', "SELECT pg_catalog.pg_read_file('/etc/passwd')"],
    ['藏在 WHERE 里的 pg_sleep', 'SELECT * FROM shop.orders WHERE pg_sleep(1) IS NOT NULL'],
    ['set_config', "SELECT set_config('default_transaction_read_only', 'off', false)"],
    ['current_setting', "SELECT current_setting('data_directory')"],
    ['dblink', "SELECT * FROM shop.orders WHERE dblink_connect('x') = 'OK'"],
    ['lo_import', "SELECT lo_import('/etc/passwd')"],
    ['自定义 schema 下的函数', 'SELECT app.do_something() FROM shop.orders'],
  ])('%s', (_name, sql) => {
    expect(rejected(sql).code).toBe('FUNCTION_NOT_ALLOWED')
  })
})
