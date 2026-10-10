import { describe, expect, it } from 'vitest';
import {
  KIMI_MODELS,
  MODEL_PROVIDERS,
  PROVIDER_BASE_URLS,
  PROVIDER_MODEL_OPTIONS,
  PROVIDER_MODELS,
  isModelProvider,
  providerFromLabel,
  resolveBaseUrl,
} from './providers.js';

describe('model providers', () => {
  it('recognises the supported providers', () => {
    expect(isModelProvider('dashscope')).toBe(true);
    expect(isModelProvider('kimi')).toBe(true);
    expect(isModelProvider('gemini')).toBe(true);
    expect(isModelProvider('custom')).toBe(false);
  });

  it('uses the official base URL unless the user set one', () => {
    expect(resolveBaseUrl('openai', null)).toBe(PROVIDER_BASE_URLS.openai);
    expect(resolveBaseUrl('openai', '  ')).toBe(PROVIDER_BASE_URLS.openai);
    expect(resolveBaseUrl('deepseek', 'http://127.0.0.1:9/v1/')).toBe('http://127.0.0.1:9/v1');
    expect(resolveBaseUrl('kimi', null)).toBe('https://api.moonshot.cn/v1');
    expect(resolveBaseUrl('kimi', 'https://api.moonshot.ai/v1/')).toBe('https://api.moonshot.ai/v1');
    expect(resolveBaseUrl('gemini', null)).toBe('https://generativelanguage.googleapis.com/v1beta/openai');
    expect(resolveBaseUrl('doubao', null)).toBe('https://ark.cn-beijing.volces.com/api/v3');
  });

  it('offers the current Kimi models and maps labels back to providers', () => {
    expect(PROVIDER_MODELS.kimi).toBe('kimi-k3');
    expect(KIMI_MODELS).toEqual(['kimi-k3', 'kimi-k2.7-code', 'kimi-k2.7-code-highspeed', 'kimi-k2.6']);
    expect(providerFromLabel('Kimi')).toBe('kimi');
    expect(providerFromLabel('通义百炼')).toBe('dashscope');
    expect(providerFromLabel('豆包')).toBe('doubao');
    expect(providerFromLabel('未知')).toBeNull();
  });

  it('gives every provider a default model that is also a suggestion', () => {
    expect(PROVIDER_MODELS.xai).toBe('grok-4.7');
    expect(PROVIDER_MODEL_OPTIONS.gemini).toContain('gemini-2.5-flash');
    for (const provider of MODEL_PROVIDERS) {
      expect(PROVIDER_MODEL_OPTIONS[provider]).toContain(PROVIDER_MODELS[provider]);
      expect(PROVIDER_BASE_URLS[provider].length).toBeGreaterThan(0);
    }
  });
});
