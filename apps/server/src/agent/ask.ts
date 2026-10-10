import { Agent } from '@earendil-works/pi-agent-core';
import { contentText, createModels, createProvider, type Model } from '@earendil-works/pi-ai';
import { openAICompletionsApi } from '@earendil-works/pi-ai/api/openai-completions.lazy';

export interface AskInput {
  apiKey: string;
  baseUrl: string;
  modelId: string;
  systemPrompt: string;
  question: string;
}

export interface AskResult {
  text: string;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
}

export class AskError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AskError';
  }
}

export const DEFAULT_SYSTEM_PROMPT = '你是支流里的对话助手。只回答当前这个问题，不要调用工具。';

function openaiModel(modelId: string, baseUrl: string): Model<'openai-completions'> {
  return {
    id: modelId,
    name: modelId,
    api: 'openai-completions',
    provider: 'openai',
    baseUrl,
    reasoning: false,
    input: ['text'],
    cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
    contextWindow: 128_000,
    maxTokens: 4_096,
    compat: {
      supportsStore: false,
      supportsDeveloperRole: false,
      supportsReasoningEffort: false,
      supportsUsageInStreaming: true,
    },
  };
}

export async function ask(input: AskInput): Promise<AskResult> {
  const model = openaiModel(input.modelId, input.baseUrl);
  const provider = createProvider({
    id: 'openai',
    name: 'openai',
    baseUrl: input.baseUrl,
    auth: {
      apiKey: {
        name: 'API key',
        resolve: () => Promise.resolve({ auth: {}, source: 'request' }),
      },
    },
    models: [model],
    api: openAICompletionsApi(),
  });
  const models = createModels();
  models.setProvider(provider);
  const resolved = models.getModel('openai', input.modelId);
  if (!resolved) throw new AskError('模型不可用');

  const agent = new Agent({
    streamFn: (activeModel, context, options) =>
      models.streamSimple(activeModel, context, { ...options, apiKey: input.apiKey }),
    getApiKey: () => input.apiKey,
    initialState: {
      systemPrompt: input.systemPrompt,
      model: resolved,
      tools: [],
    },
    shouldStopAfterTurn: () => true,
  });

  try {
    await agent.prompt(input.question);
  } catch (error) {
    const message = error instanceof Error ? error.message : '模型调用失败';
    throw new AskError(message);
  }

  const assistant = [...agent.state.messages].reverse().find((message) => message.role === 'assistant');
  if (!assistant || assistant.role !== 'assistant') throw new AskError('模型没有返回');
  if (assistant.stopReason === 'error' || assistant.stopReason === 'aborted') {
    throw new AskError(assistant.errorMessage || '模型调用失败');
  }
  const text = contentText(assistant.content).trim();
  if (!text) throw new AskError('模型返回了空回复');
  const promptTokens = assistant.usage.input;
  const completionTokens = assistant.usage.output;
  const totalTokens = assistant.usage.totalTokens || promptTokens + completionTokens;
  return { text, promptTokens, completionTokens, totalTokens };
}
