import { describe, expect, it } from 'vitest';
import { SHORTCUTS, shortcutForKey, shortcutHints } from './shortcuts.js';

describe('shortcuts', () => {
  it('uses mind-map standard bindings matched on event.key', () => {
    expect(SHORTCUTS.map((shortcut) => [shortcut.id, shortcut.key])).toEqual([
      ['child', 'Tab'],
      ['sibling', 'Enter'],
      ['edit', ' '],
      ['collapse', '.'],
      ['up', 'ArrowUp'],
      ['down', 'ArrowDown'],
      ['left', 'ArrowLeft'],
      ['right', 'ArrowRight'],
      ['deselect', 'Escape'],
      ['help', '?'],
    ]);
    expect(shortcutForKey('Tab')?.id).toBe('child');
    expect(shortcutForKey('Enter')?.id).toBe('sibling');
    expect(shortcutForKey(' ')?.id).toBe('edit');
    expect(shortcutForKey('F2')?.id).toBe('edit');
    expect(shortcutForKey('.')?.id).toBe('collapse');
    expect(shortcutForKey('ArrowLeft')?.id).toBe('left');
    expect(shortcutForKey('Escape')?.id).toBe('deselect');
    expect(shortcutForKey('?')?.id).toBe('help');
    expect(shortcutForKey('c')).toBeUndefined();
  });

  it('renders hints for the visible bindings', () => {
    expect(shortcutHints()).toContain('Tab 添加子问题');
    expect(shortcutHints()).toContain('Space / F2 编辑问题');
    expect(shortcutHints()).toContain('? 快捷键帮助');
    expect(shortcutHints().some((hint) => hint.includes('缩进') || hint.includes('同级下'))).toBe(false);
  });
});
