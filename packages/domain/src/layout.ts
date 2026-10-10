export interface LayoutNode {
  id: string;
  parentId: string | null;
}

export interface LayoutPoint {
  id: string;
  x: number;
  /** 节点中心纵坐标。交给 React Flow 前要用 topLeft 换成左上角。 */
  y: number;
}

/** 布局方向：lr 左右（逻辑图）/ tb 上下（树形图）。结构上可继续扩展鱼骨、放射等。 */
export type LayoutDirection = 'lr' | 'tb';

export interface LayoutOptions {
  /** 节点高度（px），缺省按固定高度估算 */
  heightOf?: (id: string) => number;
  /** 节点宽度（px），tb 布局下用于兄弟排列与父节点居中 */
  widthOf?: (id: string) => number;
  /** 层与层之间的间距（lr 为水平间距，tb 为垂直间距） */
  gapX?: number;
  /** 兄弟节点之间的间距（lr 为垂直间距，tb 为水平间距） */
  gapY?: number;
  /** 布局方向，缺省 lr */
  direction?: LayoutDirection;
}

const DEFAULT_HEIGHT = 96;
const DEFAULT_WIDTH = 280;
const DEFAULT_GAP_X = 320;
const DEFAULT_GAP_Y = 40;

/**
 * 可变高度 tidy tree：自底向上为每棵子树分配连续的交叉轴区间，
 * 父节点在交叉轴上居中于其子节点区间。
 * lr：x = 深度 × gapX（左边缘），y 为节点中心；
 * tb：y = 深度 × gapX（中心），x 为左边缘。
 * 两种方向都保持「y 为中心、x 为左边缘」的约定，topLeft 换算一致。
 */
export function layoutTree(nodes: readonly LayoutNode[], options: LayoutOptions = {}): LayoutPoint[] {
  const heightOf = options.heightOf ?? (() => DEFAULT_HEIGHT);
  const widthOf = options.widthOf ?? (() => DEFAULT_WIDTH);
  const gapX = options.gapX ?? DEFAULT_GAP_X;
  const gapY = options.gapY ?? DEFAULT_GAP_Y;
  const direction = options.direction ?? 'lr';

  const children = new Map<string | null, string[]>();
  const ids = new Set(nodes.map((node) => node.id));
  for (const node of nodes) {
    const parentId = node.parentId !== null && ids.has(node.parentId) ? node.parentId : null;
    const list = children.get(parentId) ?? [];
    list.push(node.id);
    children.set(parentId, list);
  }

  const points: LayoutPoint[] = [];
  let cursor = 0;

  const walkLR = (id: string, depth: number): number => {
    const kids = children.get(id) ?? [];
    let center: number;
    if (kids.length === 0) {
      center = cursor + heightOf(id) / 2;
      cursor += heightOf(id) + gapY;
    } else {
      let first = 0;
      let last = 0;
      kids.forEach((childId, index) => {
        const childCenter = walkLR(childId, depth + 1);
        if (index === 0) first = childCenter;
        last = childCenter;
      });
      center = (first + last) / 2;
    }
    points.push({ id, x: depth * gapX, y: center });
    return center;
  };

  const walkTB = (id: string, depth: number): number => {
    const kids = children.get(id) ?? [];
    let center: number;
    if (kids.length === 0) {
      center = cursor + widthOf(id) / 2;
      cursor += widthOf(id) + gapY;
    } else {
      let first = 0;
      let last = 0;
      kids.forEach((childId, index) => {
        const childCenter = walkTB(childId, depth + 1);
        if (index === 0) first = childCenter;
        last = childCenter;
      });
      center = (first + last) / 2;
    }
    points.push({ id, x: center - widthOf(id) / 2, y: depth * gapX + heightOf(id) / 2 });
    return center;
  };

  const walk = direction === 'tb' ? walkTB : walkLR;
  for (const rootId of children.get(null) ?? []) walk(rootId, 0);
  return points;
}

/** React Flow 的 position 是节点左上角，layoutTree 的 y 是中心。 */
export function topLeft(point: LayoutPoint, height: number): { x: number; y: number } {
  return { x: point.x, y: point.y - height / 2 };
}
