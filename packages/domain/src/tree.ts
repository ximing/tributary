export interface TreeNode {
  id: string;
  parentId: string | null;
  question: string;
  reply: string | null;
  collapsed: boolean;
  note?: string | null;
}

export type NodeRelation = 'root' | 'child' | 'sibling';

export function addNode(
  nodes: readonly TreeNode[],
  input: { id: string; parentId: string | null; question: string },
): TreeNode[] {
  return [
    ...nodes,
    {
      id: input.id,
      parentId: input.parentId,
      question: input.question,
      reply: null,
      collapsed: false,
    },
  ];
}

export function setReply(nodes: readonly TreeNode[], id: string, reply: string): TreeNode[] {
  return nodes.map((node) => (node.id === id ? { ...node, reply } : node));
}

export function resolveParentId(
  nodes: readonly TreeNode[],
  relation: NodeRelation,
  selectedId: string | null,
): string | null {
  if (relation === 'root' || selectedId === null) return null;
  const selected = nodes.find((node) => node.id === selectedId);
  if (!selected) throw new Error('节点不存在');
  if (relation === 'child') return selected.id;
  return selected.parentId;
}

export function toggleCollapsed(nodes: readonly TreeNode[], id: string): TreeNode[] {
  return nodes.map((node) => (node.id === id ? { ...node, collapsed: !node.collapsed } : node));
}

export function visibleNodes(nodes: readonly TreeNode[]): TreeNode[] {
  const byId = new Map(nodes.map((node) => [node.id, node]));
  const hiddenByAncestor = (node: TreeNode): boolean => {
    const seen = new Set<string>();
    let parentId = node.parentId;
    while (parentId) {
      if (seen.has(parentId)) return false;
      seen.add(parentId);
      const parent = byId.get(parentId);
      if (!parent) return false;
      if (parent.collapsed) return true;
      parentId = parent.parentId;
    }
    return false;
  };
  return nodes.filter((node) => !hiddenByAncestor(node));
}

type Linked = { id: string; parentId: string | null };

/** 前序：根在前，兄弟按数组里的现有顺序。 */
export function subtreeIds(nodes: readonly Linked[], id: string): string[] {
  const children = childrenByParent(nodes);
  if (!nodes.some((node) => node.id === id)) return [];
  const ids: string[] = [];
  const walk = (current: string) => {
    ids.push(current);
    for (const child of children.get(current) ?? []) walk(child);
  };
  walk(id);
  return ids;
}

export function siblingIndex(nodes: readonly Linked[], id: string): number {
  const node = nodes.find((item) => item.id === id);
  if (!node) return -1;
  return nodes.filter((item) => item.parentId === node.parentId).findIndex((item) => item.id === id);
}

export interface StructureMove {
  parentId: string | null;
  index: number;
}

/** Tab：收到上一个同级下面，作为它的最后一个子节点。没有上一个同级时返回 null。 */
export function indentTarget(nodes: readonly Linked[], id: string): StructureMove | null {
  const node = nodes.find((item) => item.id === id);
  if (!node) return null;
  const siblings = nodes.filter((item) => item.parentId === node.parentId);
  const at = siblings.findIndex((item) => item.id === id);
  if (at <= 0) return null;
  const previous = siblings[at - 1];
  if (!previous) return null;
  const childCount = nodes.filter((item) => item.parentId === previous.id).length;
  return { parentId: previous.id, index: childCount };
}

/** Shift+Tab：升成父节点的下一个兄弟。已经是根时返回 null。index 按移走之后计算。 */
export function outdentTarget(nodes: readonly Linked[], id: string): StructureMove | null {
  const node = nodes.find((item) => item.id === id);
  if (!node?.parentId) return null;
  const parent = nodes.find((item) => item.id === node.parentId);
  if (!parent) return null;
  const parentAt = siblingIndex(nodes, parent.id);
  if (parentAt < 0) return null;
  return { parentId: parent.parentId, index: parentAt + 1 };
}

export interface OutlineItem {
  question: string;
  depth: number;
}

const OUTLINE_LIMIT = 200;
const QUESTION_LIMIT = 20_000;

/**
 * 把粘贴的文本收成大纲。
 * 有标题行时只收标题（导出的 Markdown 里，回答段落不会变成问题）。
 * 否则每一非空行是一个问题，行首缩进或列表标记决定层级。一次最多 200 条。
 */
export function parseOutline(text: string): OutlineItem[] {
  const lines = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n');
  const hasHeading = lines.some((line) => /^#{1,6}\s+\S/.test(line.trim()));
  const items: OutlineItem[] = [];
  for (const line of lines) {
    if (items.length >= OUTLINE_LIMIT) break;
    const heading = /^(#{1,6})\s+(\S.*)$/.exec(line.trim());
    if (heading) {
      items.push({ question: heading[2].trim().slice(0, QUESTION_LIMIT), depth: heading[1].length - 1 });
      continue;
    }
    if (hasHeading || !line.trim()) continue;
    const match = /^([ \t]*)(?:[-*+]|\d+[.)])?\s*(\S.*)$/.exec(line);
    if (!match) continue;
    const question = match[2]?.trim().slice(0, QUESTION_LIMIT) ?? '';
    if (!question) continue;
    items.push({ question, depth: indentDepth(match[1] ?? '') });
  }
  return clampDepth(items);
}

export interface LinkedOutline {
  question: string;
  parentIndex: number | null;
}

/** 按层级连上父下标。第一项一定是根；层级不能一次跳过两级。 */
export function linkOutline(items: readonly { question: string; depth: number }[]): LinkedOutline[] {
  const result: LinkedOutline[] = [];
  const stack: number[] = [];
  for (const item of items) {
    const question = item.question.trim().slice(0, QUESTION_LIMIT);
    if (!question || result.length >= OUTLINE_LIMIT) continue;
    let depth = Number.isFinite(item.depth) ? Math.max(0, Math.floor(item.depth)) : 0;
    if (result.length === 0 || depth > stack.length) depth = result.length === 0 ? 0 : stack.length;
    const parentIndex = depth === 0 ? null : (stack[depth - 1] ?? null);
    stack.length = depth + 1;
    stack[depth] = result.length;
    result.push({ question, parentIndex });
  }
  return result;
}

/** 当前图里按前序查找。折叠着的节点也算，调用方再负责展开。 */
export function findInTree(nodes: readonly TreeNode[], query: string): string[] {
  const needle = query.trim().toLowerCase();
  if (!needle) return [];
  const byId = new Map(nodes.map((node) => [node.id, node]));
  const children = childrenByParent(nodes);
  const hits: string[] = [];
  const walk = (id: string) => {
    const node = byId.get(id);
    if (!node) return;
    const haystack = `${node.question}\n${node.reply ?? ''}\n${node.note ?? ''}`.toLowerCase();
    if (haystack.includes(needle)) hits.push(id);
    for (const child of children.get(id) ?? []) walk(child);
  };
  for (const rootId of children.get(null) ?? []) walk(rootId);
  return hits;
}

function indentDepth(indent: string): number {
  let depth = 0;
  let spaces = 0;
  for (const char of indent) {
    if (char === '\t') {
      depth += 1 + Math.floor(spaces / 2);
      spaces = 0;
      continue;
    }
    if (char === ' ') spaces += 1;
  }
  return depth + Math.floor(spaces / 2);
}

function clampDepth(items: readonly OutlineItem[]): OutlineItem[] {
  const result: OutlineItem[] = [];
  let open = -1;
  for (const item of items) {
    let depth = Math.max(0, item.depth);
    if (result.length === 0) depth = 0;
    else if (depth > open + 1) depth = open + 1;
    result.push({ question: item.question, depth });
    open = depth;
  }
  return result;
}

/**
 * 把节点放到 parentId 的子列表第 index 位。index 按移走之后的列表计算。
 * 不能放到自己或自己的子孙下面。
 */
export function moveNode<T extends Linked>(nodes: readonly T[], id: string, parentId: string | null, index: number): T[] {
  const current = nodes.find((node) => node.id === id);
  if (!current) throw new Error('节点不存在');
  if (parentId === id || (parentId !== null && subtreeIds(nodes, id).includes(parentId))) {
    throw new Error('不能移到自己的子分支里');
  }
  if (parentId !== null && !nodes.some((node) => node.id === parentId)) throw new Error('节点不存在');

  const siblings = nodes.filter((node) => node.parentId === parentId && node.id !== id);
  const at = Math.max(0, Math.min(index, siblings.length));
  const moved = { ...current, parentId };
  const nextSiblings = [...siblings.slice(0, at), moved, ...siblings.slice(at)];
  const grouped = new Set(nextSiblings.map((node) => node.id));
  const result: T[] = [];
  let placed = false;
  for (const node of nodes) {
    if (node.id === id) continue;
    if (grouped.has(node.id)) {
      if (!placed) {
        result.push(...nextSiblings);
        placed = true;
      }
      continue;
    }
    result.push(node);
  }
  if (!placed) result.push(...nextSiblings);
  return result;
}

/** index 与当前序号相同（含夹到两端之后）时，移动不会改变结构。 */
export function isSamePlace(nodes: readonly Linked[], id: string, parentId: string | null, index: number): boolean {
  const node = nodes.find((item) => item.id === id);
  if (!node || node.parentId !== parentId) return false;
  const siblings = nodes.filter((item) => item.parentId === parentId && item.id !== id);
  const at = Math.max(0, Math.min(index, siblings.length));
  return at === siblingIndex(nodes, id);
}

export function withSiblingPositions<T extends Linked>(nodes: readonly T[]): Array<T & { position: number }> {
  const counts = new Map<string | null, number>();
  return nodes.map((node) => {
    const position = counts.get(node.parentId) ?? 0;
    counts.set(node.parentId, position + 1);
    return { ...node, position };
  });
}

export function renameQuestion(nodes: readonly TreeNode[], id: string, question: string): TreeNode[] {
  const text = question.trim();
  if (!text) throw new Error('问题不能为空');
  if (!nodes.some((node) => node.id === id)) throw new Error('节点不存在');
  return nodes.map((node) => (node.id === id ? { ...node, question: text } : node));
}

/** 从树根数起，根是第 1 层。 */
export function depthOf(nodes: readonly Linked[], id: string): number {
  const byId = new Map(nodes.map((node) => [node.id, node]));
  let depth = 1;
  let parentId = byId.get(id)?.parentId ?? null;
  const seen = new Set<string>();
  while (parentId) {
    if (seen.has(parentId)) break;
    seen.add(parentId);
    depth += 1;
    parentId = byId.get(parentId)?.parentId ?? null;
  }
  return depth;
}

/**
 * 显示到第 level 层。scopeRoot 存在时，层数从这一枝重新数，其它枝不动。
 */
export function collapseToLevel<T extends TreeNode>(nodes: readonly T[], level: number, scopeRoot: string | null = null): T[] {
  const scope = scopeRoot ? new Set(subtreeIds(nodes, scopeRoot)) : null;
  const origin = scopeRoot ? depthOf(nodes, scopeRoot) : 1;
  return nodes.map((node) => {
    if (scope && !scope.has(node.id)) return node;
    const depth = depthOf(nodes, node.id) - origin + 1;
    return { ...node, collapsed: depth >= level };
  });
}

export function setAllCollapsed<T extends TreeNode>(nodes: readonly T[], collapsed: boolean, scopeRoot: string | null = null): T[] {
  const scope = scopeRoot ? new Set(subtreeIds(nodes, scopeRoot)) : null;
  return nodes.map((node) => (scope && !scope.has(node.id) ? node : { ...node, collapsed }));
}

export function ancestorIds(nodes: readonly Linked[], id: string): string[] {
  const byId = new Map(nodes.map((node) => [node.id, node]));
  const ids: string[] = [];
  let parentId = byId.get(id)?.parentId ?? null;
  const seen = new Set<string>();
  while (parentId) {
    if (seen.has(parentId)) break;
    seen.add(parentId);
    ids.push(parentId);
    parentId = byId.get(parentId)?.parentId ?? null;
  }
  return ids;
}

export function expandAncestors<T extends TreeNode>(nodes: readonly T[], id: string): T[] {
  const open = new Set(ancestorIds(nodes, id));
  if (open.size === 0) return [...nodes];
  return nodes.map((node) => (open.has(node.id) ? { ...node, collapsed: false } : node));
}

export function collapsedChanges(
  before: readonly { id: string; collapsed: boolean }[],
  after: readonly { id: string; collapsed: boolean }[],
): { id: string; collapsed: boolean }[] {
  const previous = new Map(before.map((node) => [node.id, node.collapsed]));
  return after
    .filter((node) => previous.has(node.id) && previous.get(node.id) !== node.collapsed)
    .map((node) => ({ id: node.id, collapsed: node.collapsed }));
}

/** 只保留这一枝。focusId 不在树上时原样返回。 */
export function nodesInFocus<T extends Linked>(nodes: readonly T[], focusId: string | null): T[] {
  if (!focusId || !nodes.some((node) => node.id === focusId)) return [...nodes];
  const keep = new Set(subtreeIds(nodes, focusId));
  return nodes.filter((node) => keep.has(node.id));
}

export interface CopyLink {
  id: string;
  sourceId: string;
  parentId: string | null;
}

/** 复制一枝：新根与原节点同父，调用方再把它插到原节点后面。 */
export function planCopy(nodes: readonly Linked[], rootId: string, newIds: readonly string[]): CopyLink[] {
  const sub = subtreeIds(nodes, rootId);
  if (sub.length === 0) throw new Error('节点不存在');
  if (newIds.length < sub.length) throw new Error('缺少新编号');
  const idOf = new Map(sub.map((sourceId, index) => [sourceId, newIds[index]!]));
  const root = nodes.find((node) => node.id === rootId);
  if (!root) throw new Error('节点不存在');
  return sub.map((sourceId) => {
    const source = nodes.find((node) => node.id === sourceId);
    if (!source) throw new Error('节点不存在');
    const parentId = sourceId === rootId ? root.parentId : (idOf.get(source.parentId ?? '') ?? null);
    return { id: idOf.get(sourceId)!, sourceId, parentId };
  });
}

export interface OutlineRow {
  id: string;
  depth: number;
  question: string;
  childCount: number;
  collapsed: boolean;
}

/** 大纲行。折叠节点的子孙不列出，由折叠标记负责展开。 */
export function outlineRows(nodes: readonly TreeNode[]): OutlineRow[] {
  const byId = new Map(nodes.map((node) => [node.id, node]));
  const children = childrenByParent(nodes);
  const rows: OutlineRow[] = [];
  const walk = (id: string, depth: number) => {
    const node = byId.get(id);
    if (!node) return;
    const kids = children.get(id) ?? [];
    rows.push({ id, depth, question: node.question, childCount: kids.length, collapsed: node.collapsed });
    if (!node.collapsed) {
      for (const child of kids) walk(child, depth + 1);
    }
  };
  for (const rootId of children.get(null) ?? []) walk(rootId, 0);
  return rows;
}

export type DropPlace = 'before' | 'after' | 'child' | 'root';

export interface DropTarget {
  parentId: string | null;
  index: number;
  overId: string | null;
  place: DropPlace;
}

/**
 * 指针落点决定结构。
 * hover 为 pane 时变成最后一个根；靠近节点两端是插入兄弟，中间是收为子节点。
 */
export function resolveDrop(nodes: readonly Linked[], dragId: string, hover: { id: string; ratio: number } | 'pane' | null): DropTarget | null {
  if (!nodes.some((node) => node.id === dragId)) return null;
  if (hover === null) return null;
  if (hover === 'pane') {
    const roots = nodes.filter((node) => node.parentId === null && node.id !== dragId);
    return { parentId: null, index: roots.length, overId: null, place: 'root' };
  }
  if (hover.id === dragId || subtreeIds(nodes, dragId).includes(hover.id)) return null;
  const target = nodes.find((node) => node.id === hover.id);
  if (!target) return null;
  const siblings = nodes.filter((node) => node.parentId === target.parentId && node.id !== dragId);
  const at = siblings.findIndex((node) => node.id === hover.id);
  if (at < 0) return null;
  if (hover.ratio < 0.28) return { parentId: target.parentId, index: at, overId: hover.id, place: 'before' };
  if (hover.ratio > 0.72) return { parentId: target.parentId, index: at + 1, overId: hover.id, place: 'after' };
  const childCount = nodes.filter((node) => node.parentId === hover.id && node.id !== dragId).length;
  return { parentId: hover.id, index: childCount, overId: hover.id, place: 'child' };
}

export interface RestoreSnapshot {
  id: string;
  parentId: string | null;
  position: number;
}

/** 恢复一枝前的校验，并按原顺序排出前序。父节点不在快照里的只能有一个，就是这一枝的根。 */
export function restoreOrder<T extends RestoreSnapshot>(existing: readonly Linked[], snapshots: readonly T[]): T[] {
  const existingIds = new Set(existing.map((node) => node.id));
  const snapIds = new Set<string>();
  for (const snap of snapshots) {
    if (existingIds.has(snap.id) || snapIds.has(snap.id)) throw new Error('节点已存在');
    snapIds.add(snap.id);
  }
  for (const snap of snapshots) {
    if (snap.parentId !== null && !existingIds.has(snap.parentId) && !snapIds.has(snap.parentId)) {
      throw new Error('父节点不存在');
    }
  }
  const parentOf = new Map<string, string | null>();
  for (const node of existing) parentOf.set(node.id, node.parentId);
  for (const snap of snapshots) parentOf.set(snap.id, snap.parentId);
  for (const snap of snapshots) {
    const seen = new Set<string>();
    let current: string | null = snap.id;
    while (current) {
      if (seen.has(current)) throw new Error('结构成环');
      seen.add(current);
      current = parentOf.get(current) ?? null;
    }
  }
  const roots = snapshots.filter((snap) => snap.parentId === null || !snapIds.has(snap.parentId));
  if (roots.length !== 1) throw new Error('只能恢复一枝');
  const children = new Map<string, T[]>();
  for (const snap of snapshots) {
    if (snap.parentId === null || !snapIds.has(snap.parentId)) continue;
    const list = children.get(snap.parentId) ?? [];
    list.push(snap);
    children.set(snap.parentId, list);
  }
  for (const list of children.values()) list.sort((a, b) => a.position - b.position);
  const ordered: T[] = [];
  const walk = (snap: T) => {
    ordered.push(snap);
    for (const child of children.get(snap.id) ?? []) walk(child);
  };
  walk(roots[0]!);
  return ordered;
}

function childrenByParent(nodes: readonly Linked[]): Map<string | null, string[]> {
  const children = new Map<string | null, string[]>();
  const ids = new Set(nodes.map((node) => node.id));
  for (const node of nodes) {
    const parentId = node.parentId !== null && ids.has(node.parentId) ? node.parentId : null;
    const list = children.get(parentId) ?? [];
    list.push(node.id);
    children.set(parentId, list);
  }
  return children;
}
