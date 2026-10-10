import { describe, expect, it } from 'vitest';
import { layoutTree } from './layout.js';

describe('layout', () => {
  it('places a child to the right of its parent without stacking siblings', () => {
    const points = layoutTree([
      { id: 'root', parentId: null },
      { id: 'a', parentId: 'root' },
      { id: 'b', parentId: 'root' },
    ]);
    const byId = new Map(points.map((point) => [point.id, point]));
    expect(byId.get('a')!.x - byId.get('root')!.x).toBeGreaterThanOrEqual(280);
    expect(Math.abs(byId.get('a')!.y - byId.get('b')!.y)).toBeGreaterThanOrEqual(120);
  });
});
