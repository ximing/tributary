import { describe, expect, it } from 'vitest';
import { selectionAfterLoad } from './selection.js';

describe('selection', () => {
  it('a click that moved the epoch keeps the clicked node when a load finishes', () => {
    expect(selectionAfterLoad(1, 2, 'new-child', 'clicked-parent')).toBe('clicked-parent');
  });

  it('a load selects its node when the user has not clicked since it started', () => {
    expect(selectionAfterLoad(3, 3, 'new-child', 'previous')).toBe('new-child');
  });
});
