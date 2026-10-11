import { Agent, type AgentMessage } from '@earendil-works/pi-agent-core';
import { contentText, createModels, createProvider, type AssistantMessage, type Model } from '@earendil-works/pi-ai';
import { openAICompletionsApi } from '@earendil-works/pi-ai/api/openai-completions.lazy';
import { MOONSHOTAI_CN_MODELS } from '@earendil-works/pi-ai/providers/moonshotai-cn.models';
import type { ModelProvider } from '@tributary/domain';
import type { ModelMessage } from './context.js';
import { absorbPiDelta, visibleDraft, type DraftText } from './draft-text.js';

export interface AskInput {
  apiKey: string;
  baseUrl: string;
  modelId: string;
  systemPrompt: string;
  messages: ModelMessage[];
}

export interface AskResult {
  text: string;
  thinking: string;
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

export { DEFAULT_SYSTEM_PROMPT } from './prompt.js';

type CompletionModel = Model<'openai-completions'>;

function openaiModel(modelId: string, baseUrl: string): CompletionModel {
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

/**
 * Kimi 走 Moonshot 中国区的 OpenAI Chat Completions。
 * 注册进运行时的 provider id 仍是 openai，这样现有的密钥注入不用分叉；
 * 已知模型则套用 pi-ai 目录里的 moonshotai-cn 兼容参数（max_tokens、思考字段）。
 */
export function completionModel(provider: ModelProvider, modelId: string, baseUrl: string): CompletionModel {
  if (provider !== 'kimi') return openaiModel(modelId, baseUrl);
  const known = (MOONSHOTAI_CN_MODELS as Record<string, CompletionModel | undefined>)[modelId];
  if (known?.api === 'openai-completions') {
    return {
      ...known,
      provider: 'openai',
      baseUrl,
      compat: {
        ...known.compat,
        supportsStore: false,
        supportsDeveloperRole: false,
        supportsUsageInStreaming: true,
      },
    };
  }
  return {
    ...openaiModel(modelId, baseUrl),
    contextWindow: 262_144,
    compat: {
      supportsStore: false,
      supportsDeveloperRole: false,
      supportsReasoningEffort: false,
      supportsUsageInStreaming: true,
      maxTokensField: 'max_tokens',
      supportsStrictMode: false,
    },
  };
}

const EMPTY_USAGE = {
  input: 0,
  output: 0,
  cacheRead: 0,
  cacheWrite: 0,
  totalTokens: 0,
  cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
} as const;

/** 历史回复只作为文本放进对话。新回复仍由这一次调用生成。 */
function toAgentMessages(messages: ModelMessage[]): AgentMessage[] {
  const timestamp = Date.now();
  return messages.map((message) =>
    message.role === 'user'
      ? { role: 'user', content: message.content, timestamp }
      : {
          role: 'assistant',
          content: [{ type: 'text', text: message.content }],
          api: 'openai-completions',
          provider: 'openai',
          model: 'history',
          usage: EMPTY_USAGE,
          stopReason: 'stop',
          timestamp,
        },
  );
}

export interface StreamAskHandlers {
  /** 累计正文。思考标签还没剥掉，调用方用 visibleDraft 再分一次。 */
  onDelta?: (fullText: string) => void;
  /** 累计思考。来自 reasoning / thinking_delta，不含正文里的标签。 */
  onThinking?: (fullThinking: string) => void;
  signal?: AbortSignal;
}

function thinkingFrom(message: AssistantMessage): string {
  return message.content
    .flatMap((block) => (block.type === 'thinking' && !block.redacted && block.thinking.trim() ? [block.thinking.trim()] : []))
    .join('\n\n');
}

function publishDraft(state: DraftText, handlers: StreamAskHandlers, sent: DraftText): DraftText {
  if (state.reply !== sent.reply) handlers.onDelta?.(state.reply);
  if (state.thinking !== sent.thinking) handlers.onThinking?.(state.thinking);
  return state;
}

export async function streamAsk(input: AskInput & { provider?: ModelProvider }, handlers: StreamAskHandlers = {}): Promise<AskResult> {
  if (input.provider === 'claude') return streamClaude(input, handlers);
  const model = completionModel(input.provider ?? 'openai', input.modelId, input.baseUrl);
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
    finishTurn: () => ({ action: 'end' }),
  });

  let streamed: DraftText = { reply: '', thinking: '' };
  const unsubscribe = agent.subscribe((event) => {
    if (event.type !== 'message_update') return;
    const next = absorbPiDelta(streamed, event.assistantMessageEvent);
    if (next === streamed) return;
    streamed = publishDraft(next, handlers, streamed);
  });
  const abort = () => agent.abort();
  handlers.signal?.addEventListener('abort', abort, { once: true });

  try {
    if (handlers.signal?.aborted) throw new AskError('模型调用已中断');
    await agent.prompt(toAgentMessages(input.messages));
  } catch (error) {
    const message = error instanceof Error ? error.message : '模型调用失败';
    throw new AskError(message);
  } finally {
    handlers.signal?.removeEventListener('abort', abort);
    unsubscribe();
  }

  const assistant = agent.state.messages.at(-1);
  if (!assistant || assistant.role !== 'assistant') throw new AskError('模型没有返回');
  if (assistant.stopReason === 'error' || assistant.stopReason === 'aborted') {
    throw new AskError(assistant.errorMessage || '模型调用失败');
  }
  const visible = visibleDraft({ reply: contentText(assistant.content), thinking: thinkingFrom(assistant) || streamed.thinking });
  const text = visible.reply.trim();
  if (!text) throw new AskError('模型返回了空回复');
  const promptTokens = assistant.usage.input;
  const completionTokens = assistant.usage.output;
  const totalTokens = assistant.usage.totalTokens || promptTokens + completionTokens;
  return { text, thinking: visible.thinking.trim(), promptTokens, completionTokens, totalTokens };
}

export async function ask(input: AskInput): Promise<AskResult> {
  return streamAsk(input);
}

export async function streamModel(input: AskInput & { provider: ModelProvider }, handlers: StreamAskHandlers = {}): Promise<AskResult> {
  return streamAsk(input, handlers);
}

function claudeError(body: string): string {
  try {
    const parsed = JSON.parse(body) as { error?: { message?: unknown } };
    if (typeof parsed.error?.message === 'string' && parsed.error.message.length > 0) return parsed.error.message;
  } catch {
    // 非 JSON 错误页，截断原文
  }
  const text = body.replace(/\s+/g, ' ').trim();
  return text.slice(0, 180) || '模型调用失败';
}

/** Claude 走 Anthropic Messages，其余供应商走 OpenAI 兼容接口。 */
async function streamClaude(input: AskInput, handlers: StreamAskHandlers): Promise<AskResult> {
  const response = await fetch(`${input.baseUrl.replace(/\/$/, '')}/v1/messages`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-api-key': input.apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: input.modelId,
      max_tokens: 4096,
      system: input.systemPrompt,
      messages: input.messages,
      stream: true,
    }),
    ...(handlers.signal ? { signal: handlers.signal } : {}),
  });
  if (!response.ok || !response.body) {
    throw new AskError(claudeError(await response.text().catch(() => '')));
  }

  let streamed: DraftText = { reply: '', thinking: '' };
  let promptTokens = 0;
  let completionTokens = 0;
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  const consume = (block: string) => {
    const data = block
      .split('\n')
      .filter((line) => line.startsWith('data:'))
      .map((line) => line.slice(5).trim())
      .join('\n');
    if (!data || data === '[DONE]') return;
    let payload: {
      type?: string;
      delta?: { type?: string; text?: string; thinking?: string };
      message?: { usage?: { input_tokens?: number; output_tokens?: number } };
      usage?: { output_tokens?: number };
      error?: { message?: string };
    };
    try {
      payload = JSON.parse(data) as typeof payload;
    } catch {
      return;
    }
    if (payload.type === 'error') throw new AskError(payload.error?.message || '模型调用失败');
    if (payload.type === 'message_start') {
      promptTokens = payload.message?.usage?.input_tokens ?? promptTokens;
      completionTokens = payload.message?.usage?.output_tokens ?? completionTokens;
    }
    if (payload.type === 'content_block_delta' && payload.delta?.type === 'thinking_delta' && payload.delta.thinking) {
      streamed = publishDraft({ reply: streamed.reply, thinking: streamed.thinking + payload.delta.thinking }, handlers, streamed);
    }
    if (payload.type === 'content_block_delta' && payload.delta?.type === 'text_delta' && payload.delta.text) {
      streamed = publishDraft({ reply: streamed.reply + payload.delta.text, thinking: streamed.thinking }, handlers, streamed);
    }
    if (payload.type === 'message_delta' && typeof payload.usage?.output_tokens === 'number') {
      completionTokens = payload.usage.output_tokens;
    }
  };

  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const blocks = buffer.split('\n\n');
    buffer = blocks.pop() ?? '';
    for (const block of blocks) consume(block);
  }
  if (buffer.trim()) consume(buffer);

  if (handlers.signal?.aborted) throw new AskError('模型调用已中断');
  const visible = visibleDraft(streamed);
  const reply = visible.reply.trim();
  if (!reply) throw new AskError('模型返回了空回复');
  return {
    text: reply,
    thinking: visible.thinking.trim(),
    promptTokens,
    completionTokens,
    totalTokens: promptTokens + completionTokens,
  };
}
