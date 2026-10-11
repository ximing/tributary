const KEY = 'tributary-map';

/** 上次打开的脑图。地址栏没有 ?map= 时，刷新用它恢复。 */
export function readMapId(): string | null {
  try {
    const raw = localStorage.getItem(KEY)?.trim() ?? '';
    if (!raw || raw.length > 80) return null;
    return raw;
  } catch {
    return null;
  }
}

export function writeMapId(id: string): void {
  try {
    localStorage.setItem(KEY, id);
  } catch {
    /* 忽略持久化失败 */
  }
}

export function clearMapId(): void {
  try {
    localStorage.removeItem(KEY);
  } catch {
    /* 忽略持久化失败 */
  }
}
