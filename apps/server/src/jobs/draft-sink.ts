import type { DraftText } from '../agent/draft-text.js';

export const DRAFT_FLUSH_MS = 50;

/**
 * 第一段立刻写出去，后面按间隔合并。
 * 这样卡片不用等整段思考结束，也不会每个 token 打一次库。
 */
export function createDraftSink(
  write: (draft: DraftText) => Promise<void>,
  flushMs = DRAFT_FLUSH_MS,
): {
  push(draft: DraftText): void;
  finish(): Promise<void>;
} {
  let state: DraftText = { reply: '', thinking: '' };
  let timer: ReturnType<typeof setTimeout> | null = null;
  let chain = Promise.resolve();
  let dirty = false;
  let primed = false;

  const flush = () => {
    dirty = false;
    const snapshot = state;
    chain = chain.then(() => write(snapshot)).catch((error: unknown) => {
      console.warn('answer.draft_failed', error instanceof Error ? error.message : error);
    });
  };

  return {
    push(next) {
      if (next.reply === state.reply && next.thinking === state.thinking) return;
      state = next;
      dirty = true;
      if (!primed) {
        primed = true;
        flush();
        return;
      }
      if (timer) return;
      timer = setTimeout(() => {
        timer = null;
        if (dirty) flush();
      }, flushMs);
      timer.unref?.();
    },
    async finish() {
      if (timer) {
        clearTimeout(timer);
        timer = null;
      }
      if (dirty) flush();
      await chain;
    },
  };
}
