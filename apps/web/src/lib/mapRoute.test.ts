import { describe, expect, it } from 'vitest';
import { initialMapRoute, mapIdFromLocation, nextMapRoute, searchWithId, type MapRouteSeen } from './mapRoute.js';

const at = (mapId: string | null, activeId: string | null, extra: Partial<MapRouteSeen> = {}): MapRouteSeen => ({
  mapId,
  activeId,
  pendingPath: null,
  pendingOpen: null,
  ...extra,
});

describe('mapIdFromLocation', () => {
  it('reads id only from /mind', () => {
    expect(mapIdFromLocation('/', '')).toBeNull();
    expect(mapIdFromLocation('/mind', '')).toBeNull();
    expect(mapIdFromLocation('/mind', '?id=abc-123')).toBe('abc-123');
    expect(mapIdFromLocation('/mind', '?settings=account&id=abc-123')).toBe('abc-123');
    expect(mapIdFromLocation('/', '?id=abc-123')).toBeNull();
    expect(mapIdFromLocation('/settings', '')).toBeNull();
  });
});

describe('searchWithId', () => {
  it('sets or clears id and keeps the other params', () => {
    expect(searchWithId('?settings=account', 'c1')).toBe('?settings=account&id=c1');
    expect(searchWithId('?id=c1&settings=account', null)).toBe('?settings=account');
    expect(searchWithId('', null)).toBe('');
  });
});

describe('nextMapRoute', () => {
  it('replaces the lobby with the restored mind map', () => {
    const result = nextMapRoute(initialMapRoute, null, 'c1');
    expect(result.action).toEqual({ type: 'navigate', id: 'c1', replace: true });
  });

  it('pushes when the selection changes and waits until the address catches up', () => {
    const first = nextMapRoute(at('a', 'a'), 'a', 'b');
    expect(first.action).toEqual({ type: 'navigate', id: 'b', replace: false });
    const waiting = nextMapRoute(first.seen, 'a', 'b');
    expect(waiting.action).toEqual({ type: 'idle' });
    const arrived = nextMapRoute(waiting.seen, 'b', 'b');
    expect(arrived.action).toEqual({ type: 'idle' });
  });

  it('opens the mind map when the address moves first', () => {
    const back = nextMapRoute(at('b', 'b'), 'a', 'b');
    expect(back.action).toEqual({ type: 'open', id: 'a' });
    const waiting = nextMapRoute(back.seen, 'a', 'b');
    expect(waiting.action).toEqual({ type: 'idle' });
    const opened = nextMapRoute(waiting.seen, 'a', 'a');
    expect(opened.action).toEqual({ type: 'idle' });
  });

  it('leaves the canvas when the address returns to the lobby', () => {
    const result = nextMapRoute(at('a', 'a'), null, 'a');
    expect(result.action).toEqual({ type: 'leave' });
    expect(nextMapRoute(result.seen, null, null).action).toEqual({ type: 'idle' });
  });

  it('replaces back to the lobby after the open mind map is removed', () => {
    const removed = nextMapRoute(at('a', 'a'), 'a', null);
    expect(removed.action).toEqual({ type: 'navigate', id: null, replace: true });
    const waiting = nextMapRoute(removed.seen, 'a', null);
    expect(waiting.action).toEqual({ type: 'idle' });
    expect(nextMapRoute(waiting.seen, null, null).action).toEqual({ type: 'idle' });
  });

  it('replaces an unknown address with the lobby', () => {
    const result = nextMapRoute(initialMapRoute, 'missing', null);
    expect(result.action).toEqual({ type: 'navigate', id: null, replace: true });
    expect(nextMapRoute(result.seen, 'missing', null).action).toEqual({ type: 'idle' });
  });
});
