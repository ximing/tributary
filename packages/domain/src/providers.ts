export const MODEL_PROVIDERS = [
  'openai',
  'deepseek',
  'claude',
  'gemini',
  'xai',
  'mistral',
  'zhipu',
  'dashscope',
  'kimi',
  'minimax',
  'doubao',
  'groq',
  'openrouter',
] as const;

export type ModelProvider = (typeof MODEL_PROVIDERS)[number];

export const PROVIDER_LABELS: Record<ModelProvider, string> = {
  openai: 'OpenAI',
  deepseek: 'DeepSeek',
  claude: 'Claude',
  zhipu: '智谱',
  dashscope: '通义百炼',
  kimi: 'Kimi',
  gemini: 'Gemini',
  xai: 'Grok',
  mistral: 'Mistral',
  minimax: 'MiniMax',
  doubao: '豆包',
  groq: 'Groq',
  openrouter: 'OpenRouter',
};

/** 选择供应商时填入的默认模型名。 */
export const PROVIDER_MODELS: Record<ModelProvider, string> = {
  openai: 'gpt-4o-mini',
  deepseek: 'deepseek-chat',
  claude: 'claude-sonnet-4-5',
  zhipu: 'glm-4',
  dashscope: 'qwen-plus',
  kimi: 'kimi-k3',
  gemini: 'gemini-2.5-flash',
  xai: 'grok-4.7',
  mistral: 'mistral-small-latest',
  minimax: 'MiniMax-M2.7',
  doubao: 'doubao-seed-2-1-pro-260628',
  groq: 'llama-3.3-70b-versatile',
  openrouter: 'google/gemini-2.5-flash',
};

/**
 * Kimi 开放平台当前可调用的模型。
 * 接口是 OpenAI Chat Completions：POST https://api.moonshot.cn/v1/chat/completions
 */
export const KIMI_MODELS = ['kimi-k3', 'kimi-k2.7-code', 'kimi-k2.7-code-highspeed', 'kimi-k2.6'] as const;

/** 选择供应商时可以点选的模型。只有一个时不出现候选列表。 */
export const PROVIDER_MODEL_OPTIONS: Record<ModelProvider, readonly string[]> = {
  openai: ['gpt-4o-mini'],
  deepseek: ['deepseek-chat'],
  claude: ['claude-sonnet-4-5'],
  gemini: ['gemini-2.5-flash', 'gemini-2.5-pro', 'gemini-3.8-flash'],
  xai: ['grok-4.7', 'grok-4.6', 'grok-4.5', 'grok-4.3'],
  mistral: ['mistral-small-latest', 'mistral-medium-latest', 'mistral-large-latest', 'codestral-latest'],
  zhipu: ['glm-4'],
  dashscope: ['qwen-plus'],
  kimi: KIMI_MODELS,
  minimax: ['MiniMax-M2.7', 'MiniMax-M2.7-highspeed', 'MiniMax-M3'],
  doubao: ['doubao-seed-2-1-pro-260628', 'doubao-seed-1-6-251015'],
  groq: ['llama-3.3-70b-versatile', 'llama-3.1-8b-instant', 'qwen/qwen3.6-27b'],
  openrouter: ['google/gemini-2.5-flash', 'anthropic/claude-sonnet-4.5', 'deepseek/deepseek-chat'],
};

/** 未填写 Base URL 时使用的官方地址。OpenAI 兼容接口带上客户端会拼接的路径前缀。 */
export const PROVIDER_BASE_URLS: Record<ModelProvider, string> = {
  openai: 'https://api.openai.com/v1',
  deepseek: 'https://api.deepseek.com',
  claude: 'https://api.anthropic.com',
  zhipu: 'https://open.bigmodel.cn/api/paas/v4',
  dashscope: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
  kimi: 'https://api.moonshot.cn/v1',
  /** Gemini 的 OpenAI 兼容入口，SDK 会再拼 /chat/completions。 */
  gemini: 'https://generativelanguage.googleapis.com/v1beta/openai',
  xai: 'https://api.x.ai/v1',
  mistral: 'https://api.mistral.ai/v1',
  minimax: 'https://api.minimaxi.com/v1',
  doubao: 'https://ark.cn-beijing.volces.com/api/v3',
  groq: 'https://api.groq.com/openai/v1',
  openrouter: 'https://openrouter.ai/api/v1',
};

export function isModelProvider(value: string): value is ModelProvider {
  return (MODEL_PROVIDERS as readonly string[]).includes(value);
}

export function providerFromLabel(label: string): ModelProvider | null {
  for (const provider of MODEL_PROVIDERS) {
    if (PROVIDER_LABELS[provider] === label) return provider;
  }
  return null;
}

export function resolveBaseUrl(provider: ModelProvider, baseUrl: string | null | undefined): string {
  const trimmed = baseUrl?.trim().replace(/\/$/, '') ?? '';
  return trimmed.length > 0 ? trimmed : PROVIDER_BASE_URLS[provider];
}
