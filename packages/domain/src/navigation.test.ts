import { describe, expect, it } from 'vitest';
import { layoutTree } from './layout.js';
import { navigate } from './navigation.js';

const nodes = [
  { id: 'root', parentId: null },
  { id: 'a', parentId: 'root' },
  { id: 'b', parentId: 'root' },
  { id: 'a1', parentId: 'a' },
];

const points = layoutTree(nodes);

describe('navigate', () => {
  it('returns the first root when nothing is selected', () => {
    expect(navigate(points, nodes, null, 'down')).toBe('root');
  });

  it('moves up and down within the same column', () => {
    expect(navigate(points, nodes, 'a', 'down')).toBe('b');
    expect(navigate(points, nodes, 'b', 'up')).toBe('a');
    // 边界处停留在原地
    expect(navigate(points, nodes, 'a', 'up')).toBe('a');
  });

  it('moves left to the parent and right to the first child', () => {
    expect(navigate(points, nodes, 'a1', 'left')).toBe('a');
    expect(navigate(points, nodes, 'a', 'left')).toBe('root');
    expect(navigate(points, nodes, 'a', 'right')).toBe('a1');
    // 没有子节点时停留
    expect(navigate(points, nodes, 'a1', 'right')).toBe('a1');
    // 根节点没有父节点时停留
    expect(navigate(points, nodes, 'root', 'left')).toBe('root');
  });

  it('returns null for an empty canvas', () => {
    expect(navigate([], [], null, 'down')).toBeNull();
  });

  describe('tb（上下布局）', () => {
    const tbPoints = layoutTree(nodes, { direction: 'tb' });

    it('moves left and right within the same row', () => {
      expect(navigate(tbPoints, nodes, 'a', 'right', 'tb')).toBe('b');
      expect(navigate(tbPoints, nodes, 'b', 'left', 'tb')).toBe('a');
      expect(navigate(tbPoints, nodes, 'a', 'left', 'tb')).toBe('a');
    });

    it('moves up to the parent and down to the first child', () => {
      expect(navigate(tbPoints, nodes, 'a1', 'up', 'tb')).toBe('a');
      expect(navigate(tbPoints, nodes, 'a', 'up', 'tb')).toBe('root');
      expect(navigate(tbPoints, nodes, 'a', 'down', 'tb')).toBe('a1');
      expect(navigate(tbPoints, nodes, 'a1', 'down', 'tb')).toBe('a1');
      expect(navigate(tbPoints, nodes, 'root', 'up', 'tb')).toBe('root');
    });
  });
});
