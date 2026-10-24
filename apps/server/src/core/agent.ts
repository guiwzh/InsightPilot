// Agent 的完整配置：Web 对话接口、评测脚本（之后还有 MCP）都从这里拿，保证评测测到的就是线上的行为。
// 各项能力做成开关，评测时可以逐项关掉，量化每一项对准确率、延迟和成本的贡献。
import { isStepCount, type PrepareStepFunction, type StepResult } from 'ai'
import { buildFinalStepInstructions, buildInstructions } from './instructions'
import { fastModel, strongModel } from './model'
import { buildTools, repeatedSqlStop, type InsightTools } from './tools'

export type AgentOptions = {
  /** 业务口径：get_metric_definitions 工具 + 订单按下单时间归属的规则 */
  semanticLayer: boolean
  /** describe_table 返回中文注释、常见取值和取值范围 */
  schemaHints: boolean
  /** run_sql 报错时附带修复建议 */
  errorHints: boolean
  /** 提示词里的 SQL 示例 */
  fewShot: boolean
  /** 本轮 SQL 累计报错 2 次后，后续步骤换用更强的模型 */
  escalation: boolean
  /** DeepSeek 思考模式 */
  thinking: boolean
  /** 不设则用模型默认值 */
  temperature?: number
}

/** 线上使用的配置 */
export const FULL_AGENT: AgentOptions = {
  semanticLayer: true,
  schemaHints: true,
  errorHints: true,
  fewShot: true,
  escalation: true,
  thinking: false,
}

/** 一轮对话最多 8 步（每步 = 一次模型调用，可能带工具调用），防止死循环 */
export const MAX_STEPS = 8

/** 升级到强模型前允许的 SQL 报错次数 */
const ESCALATE_AFTER_SQL_ERRORS = 2

export function countSqlErrors(steps: StepResult<InsightTools>[]) {
  return steps.flatMap((step) => step.content).filter((part) => part.type === 'tool-error' && part.toolName === 'run_sql').length
}

export function agentSettings(options: AgentOptions = FULL_AGENT) {
  const tools = buildTools(options)

  const prepareStep: PrepareStepFunction<InsightTools> = ({ stepNumber, steps }) => {
    const escalate = options.escalation && countSqlErrors(steps) >= ESCALATE_AFTER_SQL_ERRORS
    // 最后一步不再允许调工具，保证用户总能拿到一段文字回答，而不是停在半截的工具调用上
    const lastStep = stepNumber === MAX_STEPS - 1
    if (!escalate && !lastStep) return undefined
    return {
      ...(escalate && { model: strongModel() }),
      ...(lastStep && { toolChoice: 'none' as const, instructions: buildFinalStepInstructions(options) }),
    }
  }

  return {
    model: fastModel(),
    instructions: buildInstructions(options),
    tools,
    // 关掉业务口径时，不让模型看到这个工具
    activeTools: options.semanticLayer
      ? undefined
      : (Object.keys(tools) as (keyof InsightTools)[]).filter((name) => name !== 'get_metric_definitions'),
    stopWhen: [isStepCount(MAX_STEPS), repeatedSqlStop],
    prepareStep,
    providerOptions: { deepseek: { thinking: { type: options.thinking ? ('enabled' as const) : ('disabled' as const) } } },
    ...(options.temperature !== undefined && { temperature: options.temperature }),
  }
}
