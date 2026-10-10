export interface UsageCall {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
}

export function sumUsage(calls: readonly UsageCall[]): UsageCall {
  return calls.reduce(
    (total, call) => ({
      promptTokens: total.promptTokens + call.promptTokens,
      completionTokens: total.completionTokens + call.completionTokens,
      totalTokens: total.totalTokens + call.totalTokens,
    }),
    { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
  );
}
