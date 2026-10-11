import { afterEach, describe, expect, it, vi } from 'vitest';
import { createDraftSink } from './draft-sink.js';

afterEach(() => {
  vi.useRealTimers();
});

describe('createDraftSink', () => {
  it('writes the first chunk immediately and coalesces the rest', async () => {
    vi.useFakeTimers();
    const writes: { reply: string; thinking: string }[] = [];
    const sink = createDraftSink(async (draft) => {
      writes.push(draft);
    }, 50);

    sink.push({ reply: '', thinking: '想' });
    await sink.finish();
    expect(writes).toEqual([{ reply: '', thinking: '想' }]);

    sink.push({ reply: '', thinking: '想到' });
    sink.push({ reply: '答', thinking: '想到' });
    expect(writes).toEqual([{ reply: '', thinking: '想' }]);

    await vi.advanceTimersByTimeAsync(50);
    await sink.finish();
    expect(writes).toEqual([
      { reply: '', thinking: '想' },
      { reply: '答', thinking: '想到' },
    ]);
  });

  it('finish flushes a pending chunk without waiting for the timer', async () => {
    vi.useFakeTimers();
    const writes: { reply: string; thinking: string }[] = [];
    const sink = createDraftSink(async (draft) => {
      writes.push(draft);
    }, 50);

    sink.push({ reply: 'a', thinking: '' });
    sink.push({ reply: 'ab', thinking: '' });
    await sink.finish();
    expect(writes.map((item) => item.reply)).toEqual(['a', 'ab']);
  });
});
