import { useSyncExternalStore } from 'react';

/** 侧栏折叠状态，持久化到 localStorage。快捷键 [ / ] 切换。 */
const STORAGE_KEY = 'tributary-rail';
const listeners = new Set<() => void>();

function load(): boolean {
  try {
    return localStorage.getItem(STORAGE_KEY) === 'collapsed';
  } catch {
    return false;
  }
}

let collapsed = load();

export function setRailCollapsed(next: boolean): void {
  collapsed = next;
  try {
    localStorage.setItem(STORAGE_KEY, next ? 'collapsed' : 'expanded');
  } catch {
    /* 忽略持久化失败 */
  }
  for (const listener of listeners) listener();
}

export function toggleRail(): void {
  setRailCollapsed(!collapsed);
}

export function useRailCollapsed(): boolean {
  return useSyncExternalStore(
    (onChange) => {
      listeners.add(onChange);
      return () => listeners.delete(onChange);
    },
    () => collapsed,
  );
}
