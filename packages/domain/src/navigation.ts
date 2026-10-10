import type { LayoutDirection, LayoutPoint } from './layout.js';

export type Direction = 'up' | 'down' | 'left' | 'right';

export interface NavigableNode {
  id: string;
  parentId: string | null;
}

/**
 * 脑图方向键导航：
 * - lr（左右布局）：up/down 在同一列（相同 x）内按 y 找最近邻；left 移到父节点，right 移到第一个可见子节点
 * - tb（上下布局）：left/right 在同一行（相同 y）内按 x 找最近邻；up 移到父节点，down 移到第一个可见子节点
 * - currentId 为空或不可见时返回第一个根节点
 */
export function navigate(
  points: readonly LayoutPoint[],
  nodes: readonly NavigableNode[],
  currentId: string | null,
  direction: Direction,
  layout: LayoutDirection = 'lr',
): string | null {
  // tb 通过交换坐标轴与方向语义复用 lr 的实现
  const vertical = layout === 'tb' ? (direction === 'left' ? 'up' : direction === 'right' ? 'down' : direction) : direction;
  const move: Direction =
    layout === 'tb' ? (direction === 'up' ? 'left' : direction === 'down' ? 'right' : vertical) : direction;
  const oriented =
    layout === 'tb' ? points.map((point) => ({ id: point.id, x: point.y, y: point.x })) : points;

  if (oriented.length === 0) return null;
  const byId = new Map(oriented.map((point) => [point.id, point]));
  const visibleIds = new Set(oriented.map((point) => point.id));

  const current = currentId !== null ? byId.get(currentId) : undefined;
  if (!current) {
    const firstRoot = nodes.find((node) => node.parentId === null && visibleIds.has(node.id));
    return firstRoot?.id ?? oriented[0]!.id;
  }

  if (move === 'up' || move === 'down') {
    let best: LayoutPoint | null = null;
    for (const point of oriented) {
      if (point.id === current.id || point.x !== current.x) continue;
      const before = point.y < current.y;
      if (move === 'up' && !before) continue;
      if (move === 'down' && before) continue;
      if (!best || Math.abs(point.y - current.y) < Math.abs(best.y - current.y)) best = point;
    }
    return best?.id ?? current.id;
  }

  const nodeById = new Map(nodes.map((node) => [node.id, node]));
  if (move === 'left') {
    const parentId = nodeById.get(current.id)?.parentId ?? null;
    return parentId !== null && visibleIds.has(parentId) ? parentId : current.id;
  }

  const kids = oriented
    .filter((point) => nodeById.get(point.id)?.parentId === current.id)
    .sort((a, b) => a.y - b.y);
  return kids[0]?.id ?? current.id;
}
