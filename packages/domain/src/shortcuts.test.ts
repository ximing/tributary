import { describe, expect, it } from 'vitest';
import { SHORTCUTS, shortcutForKey, shortcutHints } from './shortcuts.js';

describe('shortcuts', () => {
  it('shortcut mapping matches the visible bindings', () => {
    expect(SHORTCUTS.map((shortcut) => [shortcut.id, shortcut.key, shortcut.label, shortcut.hint])).toEqual([
      ['child', 'c', '添加子问题', 'C'],
      ['sibling', 's', '添加同级问题', 'S'],
      ['toggle', 'e', '展开/收起', 'E'],
    ]);
    expect(shortcutHints()).toEqual(['C 添加子问题', 'S 添加同级问题', 'E 展开/收起']);
    expect(shortcutForKey('C')?.id).toBe('child');
    expect(shortcutForKey('s')?.id).toBe('sibling');
    expect(shortcutForKey('e')?.id).toBe('toggle');
  });
});
