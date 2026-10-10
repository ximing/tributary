import { describe, expect, it } from 'vitest';
import { AgentTerminalError } from '../agent/terminal-error.js';
import { backoffMs, failureDisposition } from './queue-logic.js';

describe('failureDisposition', () => {
  it('treats AgentTerminalError as terminal regardless of attempts', () => {
    expect(failureDisposition(new AgentTerminalError('未选择模型'), 1, 3)).toBe('terminal');
    expect(failureDisposition(new AgentTerminalError('未选择模型'), 3, 3)).toBe('terminal');
  });

  it('retries ordinary errors until attempts run out', () => {
    expect(failureDisposition(new Error('boom'), 1, 3)).toBe('retry');
    expect(failureDisposition(new Error('boom'), 2, 3)).toBe('retry');
  });

  it('settles ordinary errors as exhausted at max attempts', () => {
    expect(failureDisposition(new Error('boom'), 3, 3)).toBe('exhausted');
  });
});

describe('backoffMs', () => {
  const steps = [2_000, 8_000, 32_000] as const;

  it('walks the steps by attempt and then stays on the last one', () => {
    expect(backoffMs(1, steps)).toBe(2_000);
    expect(backoffMs(2, steps)).toBe(8_000);
    expect(backoffMs(3, steps)).toBe(32_000);
    expect(backoffMs(10, steps)).toBe(32_000);
    expect(backoffMs(0, steps)).toBe(2_000);
  });
});
