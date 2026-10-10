import { AgentTerminalError } from '../agent/terminal-error.js';

/** 把任务放回 pending，并改到更晚的 runAt。不计失败，也不记 lastError。 */
export class RescheduleJobError extends Error {
  constructor(public readonly runAt: Date) {
    super('job rescheduled');
    this.name = 'RescheduleJobError';
  }
}

export type FailureDisposition = 'terminal' | 'exhausted' | 'retry';

export function failureDisposition(err: unknown, attempts: number, maxAttempts: number): FailureDisposition {
  if (err instanceof AgentTerminalError) return 'terminal';
  return attempts >= maxAttempts ? 'exhausted' : 'retry';
}

export function backoffMs(attempts: number, steps: readonly number[]): number {
  return steps[Math.min(Math.max(attempts - 1, 0), steps.length - 1)] ?? 32_000;
}
