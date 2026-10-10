export const SHORTCUTS = [
  { id: 'child', key: 'c', label: '添加子问题', hint: 'C' },
  { id: 'sibling', key: 's', label: '添加同级问题', hint: 'S' },
  { id: 'toggle', key: 'e', label: '展开/收起', hint: 'E' },
] as const;

export type ShortcutId = (typeof SHORTCUTS)[number]['id'];

export function shortcutHints(shortcuts: readonly { hint: string; label: string }[] = SHORTCUTS): string[] {
  return shortcuts.map((shortcut) => `${shortcut.hint} ${shortcut.label}`);
}

export function shortcutForKey(key: string): (typeof SHORTCUTS)[number] | undefined {
  const normalized = key.toLowerCase();
  return SHORTCUTS.find((shortcut) => shortcut.key === normalized);
}
