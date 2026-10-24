// DeepSeek 单价（美元 / 百万 token），核对自官方定价页 2026-10-25。价格会变，以官方为准。
// 峰时价格是平时的两倍：UTC 周一到周五 01:00–04:00、06:00–10:00（即北京时间工作日 9–12 点、14–18 点）。
import type { LanguageModelUsage } from 'ai'

type Price = { cacheHit: number; cacheMiss: number; output: number }

const OFF_PEAK: Record<string, Price> = {
  'deepseek-flash': { cacheHit: 0.003, cacheMiss: 0.15, output: 0.6 },
  'deepseek-v4-pro': { cacheHit: 0.022, cacheMiss: 0.66, output: 1.98 },
}

export const USD_TO_CNY = 7.1

export function isPeak(at: Date) {
  const day = at.getUTCDay()
  const hour = at.getUTCHours()
  // 未考虑中国法定节假日（节假日全天按平时价）
  return day >= 1 && day <= 5 && ((hour >= 1 && hour < 4) || (hour >= 6 && hour < 10))
}

/** 一次模型调用的费用（美元）。未知模型返回 0 */
export function costUsd(modelId: string, usage: LanguageModelUsage, at = new Date()) {
  const price = OFF_PEAK[modelId]
  if (!price) return 0
  const multiplier = isPeak(at) ? 2 : 1
  const input = usage.inputTokens ?? 0
  const cached = usage.inputTokenDetails.cacheReadTokens ?? 0
  const output = usage.outputTokens ?? 0
  return ((cached * price.cacheHit + (input - cached) * price.cacheMiss + output * price.output) * multiplier) / 1e6
}
