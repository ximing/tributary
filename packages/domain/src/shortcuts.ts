export const SHORTCUTS = [
  { id: 'child', key: 'Tab', label: '添加子问题', hint: 'Tab' },
  { id: 'sibling', key: 'Enter', label: '添加同级问题', hint: 'Enter' },
  { id: 'toggle', key: ' ', label: '展开/收起回复', hint: 'Space' },
  { id: 'up', key: 'ArrowUp', label: '上一个节点', hint: '↑' },
  { id: 'down', key: 'ArrowDown', label: '下一个节点', hint: '↓' },
  { id: 'left', key: 'ArrowLeft', label: '移到父节点', hint: '←' },
  { id: 'right', key: 'ArrowRight', label: '移到子节点', hint: '→' },
  { id: 'deselect', key: 'Escape', label: '取消选中', hint: 'Esc' },
  { id: 'help', key: '?', label: '快捷键帮助', hint: '?' },
] as const;

export type ShortcutId = (typeof SHORTCUTS)[number]['id'];

export function shortcutHints(shortcuts: readonly { hint: string; label: string }[] = SHORTCUTS): string[] {
  return shortcuts.map((shortcut) => `${shortcut.hint} ${shortcut.label}`);
}

export function shortcutForKey(key: string): (typeof SHORTCUTS)[number] | undefined {
  return SHORTCUTS.find((shortcut) => shortcut.key === key);
}
