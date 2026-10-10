import { describe, expect, it } from 'vitest';
import { completionModel } from './ask.js';

describe('kimi completion model', () => {
  it('uses the moonshot catalog compat for kimi-k3', () => {
    const model = completionModel('kimi', 'kimi-k3', 'https://api.moonshot.cn/v1');
    expect(model.api).toBe('openai-completions');
    expect(model.provider).toBe('openai');
    expect(model.baseUrl).toBe('https://api.moonshot.cn/v1');
    expect(model.reasoning).toBe(true);
    expect(model.compat?.maxTokensField).toBe('max_tokens');
    expect(model.compat?.supportsReasoningEffort).toBe(true);
    expect(model.compat?.requiresReasoningContentOnAssistantMessages).toBe(true);
    expect(model.contextWindow).toBe(1_048_576);
  });

  it('keeps moonshot max_tokens for a kimi model id outside the catalog', () => {
    const model = completionModel('kimi', 'kimi-custom', 'https://proxy.example/v1');
    expect(model.id).toBe('kimi-custom');
    expect(model.baseUrl).toBe('https://proxy.example/v1');
    expect(model.compat?.maxTokensField).toBe('max_tokens');
    expect(model.compat?.supportsDeveloperRole).toBe(false);
  });

  it('leaves other providers on the generic completions model', () => {
    const model = completionModel('dashscope', 'qwen-plus', 'https://dashscope.aliyuncs.com/compatible-mode/v1');
    expect(model.compat?.maxTokensField).toBeUndefined();
    expect(model.reasoning).toBe(false);
  });
});
