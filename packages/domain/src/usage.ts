export interface UsageCall {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
}

export interface UsageGroup {
  providerName: string;
  model: string;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  calls: number;
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

/** 按供应商和模型汇总，调用量高的在前。 */
export function groupUsage(calls: readonly (UsageCall & { providerName: string; model: string })[]): UsageGroup[] {
  const groups = new Map<string, UsageGroup>();
  for (const call of calls) {
    const key = `${call.providerName}\0${call.model}`;
    const current = groups.get(key) ?? {
      providerName: call.providerName,
      model: call.model,
      promptTokens: 0,
      completionTokens: 0,
      totalTokens: 0,
      calls: 0,
    };
    current.promptTokens += call.promptTokens;
    current.completionTokens += call.completionTokens;
    current.totalTokens += call.totalTokens;
    current.calls += 1;
    groups.set(key, current);
  }
  return [...groups.values()].sort((a, b) => b.totalTokens - a.totalTokens || a.model.localeCompare(b.model));
}
