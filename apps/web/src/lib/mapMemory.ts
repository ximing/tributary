const KEY = 'tributary-map';

/** 上次打开的脑图。直接打开 / 时，用它回到 /mind?id=。 */
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
