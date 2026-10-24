// 前后端共用的接口类型。server 按它返回，web 按它读取，改一处两边都能在类型检查时发现

export type HealthResponse = {
  ok: boolean
  db: {
    /** 管理员连接（app schema）是否可用 */
    admin: boolean
    /** 只读连接（analyst_ro）是否可用 */
    readonly: boolean
    /** shop 样例数据是否已经造好 */
    seeded: boolean
  }
  llm: {
    /** 未配置 DEEPSEEK_API_KEY 时为 demo，对话返回固定文本 */
    mode: 'deepseek' | 'demo'
    model: string
  }
}
