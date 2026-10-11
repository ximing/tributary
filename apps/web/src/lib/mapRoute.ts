/** 脑图地址是 `/mind?id=`。`/` 是还没打开脑图的大厅。 */

export const MIND_PATH = '/mind';

/** 比较用的地址身份。大厅用 `/`，避免空字符串被当成「没有在等」。 */
export function mapKey(id: string | null): string {
  return id ? `id:${id}` : '/';
}

export function mapIdFromLocation(pathname: string, search: string): string | null {
  if (pathname !== MIND_PATH) return null;
  const id = new URLSearchParams(search.startsWith('?') ? search.slice(1) : search).get('id')?.trim() ?? '';
  return id || null;
}

/** 改 id，保留 settings 等其它查询参数。 */
export function searchWithId(search: string, id: string | null): string {
  const params = new URLSearchParams(search.startsWith('?') ? search.slice(1) : search);
  if (id) params.set('id', id);
  else params.delete('id');
  const text = params.toString();
  return text ? `?${text}` : '';
}

export interface MapRouteSeen {
  mapId: string | null | undefined;
  activeId: string | null | undefined;
  /** 正在等地址变成这个身份（`mapKey`）。 */
  pendingPath: string | null;
  /** 正在等打开这个脑图，避免后退被旧选中盖住。 */
  pendingOpen: string | null;
}

export const initialMapRoute: MapRouteSeen = {
  mapId: undefined,
  activeId: undefined,
  pendingPath: null,
  pendingOpen: null,
};

export type MapRouteAction =
  | { type: 'idle' }
  | { type: 'open'; id: string }
  | { type: 'leave' }
  | { type: 'navigate'; id: string | null; replace: boolean };

/**
 * 地址和当前脑图不一致时决定下一步。
 * 地址先变（后退、前进、打开链接）就跟着打开；选中先变就改地址。
 */
export function nextMapRoute(
  seen: MapRouteSeen,
  mapId: string | null,
  activeId: string | null,
): { seen: MapRouteSeen; action: MapRouteAction } {
  const here = mapKey(mapId);

  if (seen.pendingPath && seen.pendingPath !== here) {
    const mapChanged = seen.mapId !== undefined && seen.mapId !== mapId;
    const activeChanged = seen.activeId !== undefined && seen.activeId !== activeId;
    const want = mapKey(activeId);
    if (!mapChanged && !(activeChanged && want !== seen.pendingPath)) {
      return { seen: { ...seen, mapId, activeId }, action: { type: 'idle' } };
    }
  }

  if (seen.pendingOpen && seen.pendingOpen === mapId && seen.pendingOpen !== activeId) {
    const activeChanged = seen.activeId !== undefined && seen.activeId !== activeId;
    if (!activeChanged) {
      return {
        seen: { mapId, activeId, pendingPath: null, pendingOpen: seen.pendingOpen },
        action: { type: 'idle' },
      };
    }
  }

  if (mapId === activeId) {
    return { seen: { mapId, activeId, pendingPath: null, pendingOpen: null }, action: { type: 'idle' } };
  }

  const mapChanged = seen.mapId !== undefined && seen.mapId !== mapId;
  const activeChanged = seen.activeId !== undefined && seen.activeId !== activeId;

  if (mapChanged && !activeChanged) {
    if (mapId) {
      return {
        seen: { mapId, activeId, pendingPath: null, pendingOpen: mapId },
        action: { type: 'open', id: mapId },
      };
    }
    return {
      seen: { mapId: null, activeId: null, pendingPath: null, pendingOpen: null },
      action: { type: 'leave' },
    };
  }

  const want = mapKey(activeId);
  return {
    seen: { mapId, activeId, pendingPath: want, pendingOpen: null },
    action: { type: 'navigate', id: activeId, replace: !activeChanged || !activeId },
  };
}
