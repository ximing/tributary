import { describe, expect, it } from 'vitest';
import { IME_GHOST_ENTER_MS, imeOwnsKey, initialImeState, type ImeKey, type ImeState } from './ime.js';

const enter = (extra: Partial<ImeKey> = {}): ImeKey => ({
  key: 'Enter',
  isComposing: false,
  keyCode: 13,
  timeStamp: 1_000,
  ...extra,
});

const composing: ImeState = { composing: true, compositionEndedAt: -1 };

describe('imeOwnsKey', () => {
  it('leaves a normal Enter to the editor', () => {
    expect(imeOwnsKey(enter(), initialImeState())).toEqual({ owns: false, state: initialImeState() });
  });

  it('keeps Enter while the IME is still composing', () => {
    expect(imeOwnsKey(enter(), composing).owns).toBe(true);
    expect(imeOwnsKey(enter({ isComposing: true }), initialImeState()).owns).toBe(true);
    expect(imeOwnsKey(enter({ keyCode: 229 }), initialImeState()).owns).toBe(true);
    expect(imeOwnsKey({ key: 'Process', isComposing: false, keyCode: 229, timeStamp: 1_000 }, initialImeState()).owns).toBe(true);
  });

  it('does not treat Escape as submit while composing', () => {
    const event: ImeKey = { key: 'Escape', isComposing: false, keyCode: 27, timeStamp: 1_000 };
    expect(imeOwnsKey(event, composing).owns).toBe(true);
  });

  it('swallows only the Enter that follows compositionend', () => {
    const ended: ImeState = { composing: false, compositionEndedAt: 1_000 };
    const ghost = imeOwnsKey(enter({ timeStamp: 1_000 + IME_GHOST_ENTER_MS - 1 }), ended);
    expect(ghost.owns).toBe(true);
    expect(ghost.state.compositionEndedAt).toBe(-1);

    const later = imeOwnsKey(enter({ timeStamp: 1_000 + IME_GHOST_ENTER_MS }), ended);
    expect(later.owns).toBe(false);
    expect(later.state).toBe(ended);
  });

  it('does not swallow a later Enter after another key already followed compositionend', () => {
    const ended: ImeState = { composing: false, compositionEndedAt: 1_000 };
    const letter = imeOwnsKey(
      { key: 'a', isComposing: false, keyCode: 65, timeStamp: 1_020 },
      ended,
    );
    expect(letter.owns).toBe(false);
    expect(letter.state.compositionEndedAt).toBe(-1);
    expect(imeOwnsKey(enter({ timeStamp: 1_040 }), letter.state).owns).toBe(false);
  });
});
