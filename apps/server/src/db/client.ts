import { drizzle } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'
import { env } from '../env'
import * as schema from './schema'

// 管理员连接：读写 app schema（会话、日志、查询结果）
export const db = drizzle({ client: postgres(env.DATABASE_URL, { max: 10 }), schema })

// 只读连接：Agent 生成的 SQL 只能走这里。analyst_ro 只有 shop 的 SELECT 权限，见 db/init.sql
export const readonlySql = postgres(env.DATABASE_URL_READONLY, { max: 5 })
