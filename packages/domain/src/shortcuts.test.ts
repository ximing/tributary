import { describe, expect, it } from 'vitest';
import { SHORTCUTS, shortcutForKey, shortcutHints } from './shortcuts.js';

describe('shortcuts', () => {
  it('uses mind-map standard bindings matched on event.key', () => {
    expect(SHORTCUTS.map((shortcut) => [shortcut.id, shortcut.key])).toEqual([
      ['child', 'Tab'],
      ['sibling', 'Enter'],
      ['toggle', ' '],
      ['up', 'ArrowUp'],
      ['down', 'ArrowDown'],
      ['left', 'ArrowLeft'],
      ['right', 'ArrowRight'],
      ['deselect', 'Escape'],
      ['help', '?'],
    ]);
    expect(shortcutForKey('Tab')?.id).toBe('child');
    expect(shortcutForKey('Enter')?.id).toBe('sibling');
    expect(shortcutForKey(' ')?.id).toBe('toggle');
    expect(shortcutForKey('ArrowLeft')?.id).toBe('left');
    expect(shortcutForKey('Escape')?.id).toBe('deselect');
    expect(shortcutForKey('?')?.id).toBe('help');
    expect(shortcutForKey('c')).toBeUndefined();
  });

  it('renders hints for the visible bindings', () => {
    expect(shortcutHints()).toContain('Tab 添加子问题');
    expect(shortcutHints()).toContain('? 快捷键帮助');
  });
});
