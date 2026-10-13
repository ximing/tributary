import { describe, expect, it } from 'vitest';
import { layoutTree, topLeft } from './layout.js';

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

  it('centers a parent on the interval of its children', () => {
    const points = layoutTree([
      { id: 'root', parentId: null },
      { id: 'a', parentId: 'root' },
      { id: 'b', parentId: 'root' },
      { id: 'c', parentId: 'root' },
    ]);
    const byId = new Map(points.map((point) => [point.id, point]));
    const root = byId.get('root')!;
    expect(root.y).toBeCloseTo((byId.get('a')!.y + byId.get('c')!.y) / 2);
  });

  it('gives taller leaves more vertical room', () => {
    const heightOf = (id: string) => (id === 'tall' ? 400 : 96);
    const points = layoutTree(
      [
        { id: 'tall', parentId: null },
        { id: 'short', parentId: null },
      ],
      { heightOf, gapY: 40 },
    );
    const byId = new Map(points.map((point) => [point.id, point]));
    // short 的中心应当位于 tall 的中心 + tall 半高 + gap + short 半高
    expect(byId.get('short')!.y - byId.get('tall')!.y).toBeCloseTo(200 + 40 + 48);
  });

  it('respects gapY between siblings', () => {
    const points = layoutTree(
      [
        { id: 'a', parentId: null },
        { id: 'b', parentId: null },
      ],
      { heightOf: () => 100, gapY: 60 },
    );
    const byId = new Map(points.map((point) => [point.id, point]));
    expect(byId.get('b')!.y - byId.get('a')!.y).toBeCloseTo(160);
  });

  it('converts center y to the top-left React Flow position', () => {
    const height = 88;
    const points = layoutTree(
      [
        { id: 'root', parentId: null },
        { id: 'a', parentId: 'root' },
        { id: 'b', parentId: 'root' },
      ],
      { heightOf: () => height },
    );
    const byId = new Map(points.map((point) => [point.id, point]));
    const root = byId.get('root')!;
    const placed = topLeft(root, height);
    const midpoint = (byId.get('a')!.y + byId.get('b')!.y) / 2;
    expect(placed.x).toBe(root.x);
    expect(placed.y).toBeCloseTo(midpoint - height / 2);
    expect(placed.y).toBeLessThan(midpoint);
  });

  it('pushes the next column past the widest card in this column', () => {
    const points = layoutTree(
      [
        { id: 'wide', parentId: null },
        { id: 'narrow', parentId: null },
        { id: 'child', parentId: 'narrow' },
      ],
      { widthOf: (id) => (id === 'wide' ? 420 : 200) },
    );
    const byId = new Map(points.map((point) => [point.id, point]));
    // 列距余量是默认层距 320 减去默认宽度 280。下一列看这一列最宽的卡片。
    expect(byId.get('child')!.x - byId.get('narrow')!.x).toBeCloseTo(420 + 40);
    expect(byId.get('wide')!.x).toBe(0);
    expect(byId.get('narrow')!.x).toBe(0);
  });

  describe('tb（上下布局）', () => {
    it('places children below the parent and spreads siblings horizontally', () => {
      const points = layoutTree(
        [
          { id: 'root', parentId: null },
          { id: 'a', parentId: 'root' },
          { id: 'b', parentId: 'root' },
        ],
        { heightOf: () => 96, widthOf: () => 280, direction: 'tb' },
      );
      const byId = new Map(points.map((point) => [point.id, point]));
      expect(byId.get('a')!.y).toBeGreaterThan(byId.get('root')!.y);
      expect(Math.abs(byId.get('a')!.x - byId.get('b')!.x)).toBeGreaterThanOrEqual(280);
    });

    it('centers a parent horizontally over its children', () => {
      const points = layoutTree(
        [
          { id: 'root', parentId: null },
          { id: 'a', parentId: 'root' },
          { id: 'b', parentId: 'root' },
          { id: 'c', parentId: 'root' },
        ],
        { widthOf: () => 200, direction: 'tb' },
      );
      const byId = new Map(points.map((point) => [point.id, point]));
      const rootCenter = byId.get('root')!.x + 100;
      const aCenter = byId.get('a')!.x + 100;
      const cCenter = byId.get('c')!.x + 100;
      expect(rootCenter).toBeCloseTo((aCenter + cCenter) / 2);
    });

    it('uses a tighter vertical rhythm than the horizontal layout', () => {
      const points = layoutTree(
        [
          { id: 'root', parentId: null },
          { id: 'a', parentId: 'root' },
        ],
        { direction: 'tb' },
      );
      const byId = new Map(points.map((point) => [point.id, point]));
      expect(byId.get('a')!.y - byId.get('root')!.y).toBe(256);
    });

    it('stacks layers with gapX as the vertical rhythm', () => {
      const points = layoutTree(
        [
          { id: 'root', parentId: null },
          { id: 'a', parentId: 'root' },
        ],
        { heightOf: () => 100, gapX: 300, direction: 'tb' },
      );
      const byId = new Map(points.map((point) => [point.id, point]));
      expect(byId.get('a')!.y - byId.get('root')!.y).toBeCloseTo(300);
    });
  });
});
