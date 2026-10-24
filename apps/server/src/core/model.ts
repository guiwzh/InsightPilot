import type { LanguageModelV4StreamPart } from '@ai-sdk/provider'
import { createDeepSeek } from '@ai-sdk/deepseek'
import { simulateReadableStream, type LanguageModel } from 'ai'
import { MockLanguageModelV4 } from 'ai/test'
import { env } from '../env'

const deepseek = env.DEEPSEEK_API_KEY ? createDeepSeek({ apiKey: env.DEEPSEEK_API_KEY }) : undefined

export const llmMode = deepseek ? 'deepseek' : 'demo'

/** 默认模型。没有 API key 时返回演示模型，前端照样能调试流式渲染 */
export function fastModel(): LanguageModel {
  return deepseek ? deepseek(env.MODEL_FAST) : demoModel()
}

export const fastModelId = deepseek ? env.MODEL_FAST : 'demo'

const DEMO_TEXT =
  '（演示模式）还没有配置 DEEPSEEK_API_KEY，这是一段模拟的流式回复。' +
  '在仓库根目录的 .env 中填入 key 并重启 server，就会接入真实模型。'

function demoModel() {
  const chunks: LanguageModelV4StreamPart[] = [
    { type: 'stream-start', warnings: [] },
    { type: 'text-start', id: 'demo' },
    ...Array.from(DEMO_TEXT, (delta): LanguageModelV4StreamPart => ({ type: 'text-delta', id: 'demo', delta })),
    { type: 'text-end', id: 'demo' },
    {
      type: 'finish',
      finishReason: { unified: 'stop', raw: 'stop' },
      usage: {
        inputTokens: { total: 0, noCache: 0, cacheRead: 0, cacheWrite: 0 },
        outputTokens: { total: 0, text: 0, reasoning: 0 },
      },
    },
  ]
  return new MockLanguageModelV4({
    provider: 'demo',
    modelId: 'demo',
    doStream: async () => ({ stream: simulateReadableStream({ chunks, initialDelayInMs: 300, chunkDelayInMs: 25 }) }),
  })
}
