const KEY = 'tributary-viewports';

export interface SavedViewport {
  x: number;
  y: number;
  zoom: number;
}

function readAll(): Record<string, SavedViewport> {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Record<string, SavedViewport>;
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

export function readViewport(conversationId: string): SavedViewport | null {
  const saved = readAll()[conversationId];
  if (!saved || !Number.isFinite(saved.x) || !Number.isFinite(saved.y) || !Number.isFinite(saved.zoom)) return null;
  return { x: saved.x, y: saved.y, zoom: saved.zoom };
}

export function writeViewport(conversationId: string, viewport: SavedViewport): void {
  if (!Number.isFinite(viewport.x) || !Number.isFinite(viewport.y) || !Number.isFinite(viewport.zoom)) return;
  try {
    const all = readAll();
    all[conversationId] = viewport;
    localStorage.setItem(KEY, JSON.stringify(all));
  } catch {
    /* 忽略持久化失败 */
  }
}
