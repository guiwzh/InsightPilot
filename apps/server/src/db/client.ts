import { drizzle } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'
import { env } from '../env'
import * as schema from './schema'

// 管理员连接：读写 app schema（会话、日志、查询结果）
export const db = drizzle({ client: postgres(env.DATABASE_URL, { max: 10 }), schema })

// 分析结果统一转换：bigint、numeric 转成 number，方便前端格式化和画图（分析场景不需要超过 15 位的精度）；
// 日期、时间保留数据库输出的文本（已是北京时间），避免序列化成 UTC 的 ISO 字符串
const asNumber = (oid: number) => ({ to: oid, from: [oid], serialize: (x: number) => String(x), parse: (x: string) => Number(x) })
const asText = (oid: number) => ({ to: oid, from: [oid], serialize: (x: string) => x, parse: (x: string) => x })

// 只读连接：Agent 生成的 SQL 只能走这里。analyst_ro 只有 shop 的 SELECT 权限，见 db/init.sql
export const readonlySql = postgres(env.DATABASE_URL_READONLY, {
  max: 5,
  types: {
    int8: asNumber(20),
    numeric: asNumber(1700),
    date: asText(1082),
    timestamp: asText(1114),
    timestamptz: asText(1184),
  },
})
