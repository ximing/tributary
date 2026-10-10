/**
 * 选中节点后的单键，对齐 XMind / GitMind：
 * Tab 子节点，Enter 同级，Space / F2 编辑。
 * 缩进、升降级和同级排序走修饰键，不占用这三颗键。
 */
export const SHORTCUTS = [
  { id: 'child', key: 'Tab', label: '添加子问题', hint: 'Tab' },
  { id: 'sibling', key: 'Enter', label: '添加同级问题', hint: 'Enter' },
  { id: 'edit', key: ' ', label: '编辑问题', hint: 'Space / F2' },
  { id: 'collapse', key: '.', label: '折叠/展开子树', hint: '.' },
  { id: 'up', key: 'ArrowUp', label: '上一个节点', hint: '↑' },
  { id: 'down', key: 'ArrowDown', label: '下一个节点', hint: '↓' },
  { id: 'left', key: 'ArrowLeft', label: '移到父节点', hint: '←' },
  { id: 'right', key: 'ArrowRight', label: '移到子节点', hint: '→' },
  { id: 'deselect', key: 'Escape', label: '取消选中', hint: 'Esc' },
  { id: 'help', key: '?', label: '快捷键帮助', hint: '?' },
] as const;

export type ShortcutId = (typeof SHORTCUTS)[number]['id'];

/** F2 与 Space 同一动作，帮助里合成一行。 */
const ALIAS_KEYS: Partial<Record<string, ShortcutId>> = {
  F2: 'edit',
};

export function shortcutHints(shortcuts: readonly { hint: string; label: string }[] = SHORTCUTS): string[] {
  return shortcuts.map((shortcut) => `${shortcut.hint} ${shortcut.label}`);
}

export function shortcutForKey(key: string): (typeof SHORTCUTS)[number] | undefined {
  const alias = ALIAS_KEYS[key];
  if (alias) return SHORTCUTS.find((shortcut) => shortcut.id === alias);
  return SHORTCUTS.find((shortcut) => shortcut.key === key);
}
