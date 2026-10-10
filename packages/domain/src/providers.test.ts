import { describe, expect, it } from 'vitest';
import { PROVIDER_BASE_URLS, isModelProvider, resolveBaseUrl } from './providers.js';

describe('model providers', () => {
  it('recognises the supported providers', () => {
    expect(isModelProvider('dashscope')).toBe(true);
    expect(isModelProvider('custom')).toBe(false);
  });

  it('uses the official base URL unless the user set one', () => {
    expect(resolveBaseUrl('openai', null)).toBe(PROVIDER_BASE_URLS.openai);
    expect(resolveBaseUrl('openai', '  ')).toBe(PROVIDER_BASE_URLS.openai);
    expect(resolveBaseUrl('deepseek', 'http://127.0.0.1:9/v1/')).toBe('http://127.0.0.1:9/v1');
  });
});
