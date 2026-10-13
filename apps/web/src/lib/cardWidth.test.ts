import { afterEach, describe, expect, it, vi } from 'vitest';
import { NODE_WIDTH } from '../workspace/map-model.js';
import { clampCardWidth, readCardWidths, writeCardWidths } from './cardWidth.js';

describe('card width', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('keeps a dragged width inside the allowed range', () => {
    expect(clampCardWidth(10)).toBe(200);
    expect(clampCardWidth(900)).toBe(560);
    expect(clampCardWidth(333.4)).toBe(333);
    expect(clampCardWidth(Number.NaN)).toBe(NODE_WIDTH);
  });

  it('remembers widths that differ from the default', () => {
    const memory = new Map<string, string>();
    vi.stubGlobal('localStorage', {
      getItem: (key: string) => memory.get(key) ?? null,
      setItem: (key: string, value: string) => {
        memory.set(key, value);
      },
      removeItem: (key: string) => {
        memory.delete(key);
      },
    });
    writeCardWidths({ 'node-a': 420, 'node-b': 900 });
    expect(readCardWidths()).toEqual({ 'node-a': 420, 'node-b': 560 });
  });
});
