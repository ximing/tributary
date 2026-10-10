export const MODEL_PROVIDERS = ['openai', 'deepseek', 'claude', 'zhipu', 'dashscope'] as const;

export type ModelProvider = (typeof MODEL_PROVIDERS)[number];

export const PROVIDER_LABELS: Record<ModelProvider, string> = {
  openai: 'OpenAI',
  deepseek: 'DeepSeek',
  claude: 'Claude',
  zhipu: '智谱',
  dashscope: '通义百炼',
};

/** 选择供应商时填入的默认模型名。 */
export const PROVIDER_MODELS: Record<ModelProvider, string> = {
  openai: 'gpt-4o-mini',
  deepseek: 'deepseek-chat',
  claude: 'claude-sonnet-4-5',
  zhipu: 'glm-4',
  dashscope: 'qwen-plus',
};

/** 未填写 Base URL 时使用的官方地址。OpenAI 兼容接口带上客户端会拼接的路径前缀。 */
export const PROVIDER_BASE_URLS: Record<ModelProvider, string> = {
  openai: 'https://api.openai.com/v1',
  deepseek: 'https://api.deepseek.com',
  claude: 'https://api.anthropic.com',
  zhipu: 'https://open.bigmodel.cn/api/paas/v4',
  dashscope: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
};

export function isModelProvider(value: string): value is ModelProvider {
  return (MODEL_PROVIDERS as readonly string[]).includes(value);
}

export function resolveBaseUrl(provider: ModelProvider, baseUrl: string | null | undefined): string {
  const trimmed = baseUrl?.trim().replace(/\/$/, '') ?? '';
  return trimmed.length > 0 ? trimmed : PROVIDER_BASE_URLS[provider];
}
