import { describe, expect, it } from 'vitest';
import { SHORTCUTS, shortcutForKey, shortcutHints } from './shortcuts.js';

describe('shortcuts', () => {
  it('uses mind-map standard bindings matched on event.key', () => {
    expect(SHORTCUTS.map((shortcut) => [shortcut.id, shortcut.key])).toEqual([
      ['indent', 'Tab'],
      ['sibling', 'Enter'],
      ['toggle', ' '],
      ['collapse', '.'],
      ['up', 'ArrowUp'],
      ['down', 'ArrowDown'],
      ['left', 'ArrowLeft'],
      ['right', 'ArrowRight'],
      ['deselect', 'Escape'],
      ['help', '?'],
    ]);
    expect(shortcutForKey('Tab')?.id).toBe('indent');
    expect(shortcutForKey('Enter')?.id).toBe('sibling');
    expect(shortcutForKey(' ')?.id).toBe('toggle');
    expect(shortcutForKey('.')?.id).toBe('collapse');
    expect(shortcutForKey('ArrowLeft')?.id).toBe('left');
    expect(shortcutForKey('Escape')?.id).toBe('deselect');
    expect(shortcutForKey('?')?.id).toBe('help');
    expect(shortcutForKey('c')).toBeUndefined();
  });

  it('renders hints for the visible bindings', () => {
    expect(shortcutHints()).toContain('Tab 收到上一同级下');
    expect(shortcutHints()).toContain('? 快捷键帮助');
  });
});
