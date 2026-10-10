import { describe, expect, it } from 'vitest';
import { sumUsage } from './usage.js';

describe('usage', () => {
  it('sums prompt, completion, and total tokens', () => {
    expect(
      sumUsage([
        { promptTokens: 10, completionTokens: 4, totalTokens: 14 },
        { promptTokens: 3, completionTokens: 8, totalTokens: 11 },
      ]),
    ).toEqual({ promptTokens: 13, completionTokens: 12, totalTokens: 25 });
  });
});
