export interface LayoutNode {
  id: string;
  parentId: string | null;
}

export interface LayoutPoint {
  id: string;
  x: number;
  y: number;
}

const X_STEP = 320;
const Y_STEP = 150;

export function layoutTree(nodes: readonly LayoutNode[]): LayoutPoint[] {
  const children = new Map<string | null, string[]>();
  const ids = new Set(nodes.map((node) => node.id));
  for (const node of nodes) {
    const parentId = node.parentId !== null && ids.has(node.parentId) ? node.parentId : null;
    const list = children.get(parentId) ?? [];
    list.push(node.id);
    children.set(parentId, list);
  }

  const points: LayoutPoint[] = [];
  let row = 0;

  const walk = (id: string, depth: number): void => {
    const kids = children.get(id) ?? [];
    if (kids.length === 0) {
      points.push({ id, x: depth * X_STEP, y: row * Y_STEP });
      row += 1;
      return;
    }
    for (const childId of kids) walk(childId, depth + 1);
    const placed = points.filter((point) => kids.includes(point.id));
    const y = placed.length === 0 ? row * Y_STEP : (placed[0]!.y + placed[placed.length - 1]!.y) / 2;
    points.push({ id, x: depth * X_STEP, y });
  };

  for (const rootId of children.get(null) ?? []) walk(rootId, 0);
  return points;
}
