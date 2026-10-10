import { describe, expect, it } from 'vitest';
import { groupUsage, sumUsage } from './usage.js';

describe('usage', () => {
  it('sums prompt, completion, and total tokens', () => {
    expect(
      sumUsage([
        { promptTokens: 10, completionTokens: 4, totalTokens: 14 },
        { promptTokens: 3, completionTokens: 8, totalTokens: 11 },
      ]),
    ).toEqual({ promptTokens: 13, completionTokens: 12, totalTokens: 25 });
  });

  it('groups calls by provider and model, highest total first', () => {
    expect(
      groupUsage([
        { providerName: 'OpenAI', model: 'gpt-4o-mini', promptTokens: 1, completionTokens: 1, totalTokens: 2 },
        { providerName: '通义百炼', model: 'qwen-plus', promptTokens: 10, completionTokens: 5, totalTokens: 15 },
        { providerName: 'OpenAI', model: 'gpt-4o-mini', promptTokens: 3, completionTokens: 1, totalTokens: 4 },
      ]),
    ).toEqual([
      { providerName: '通义百炼', model: 'qwen-plus', promptTokens: 10, completionTokens: 5, totalTokens: 15, calls: 1 },
      { providerName: 'OpenAI', model: 'gpt-4o-mini', promptTokens: 4, completionTokens: 2, totalTokens: 6, calls: 2 },
    ]);
  });
});
