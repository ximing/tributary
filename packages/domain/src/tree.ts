export interface TreeNode {
  id: string;
  parentId: string | null;
  question: string;
  reply: string | null;
  collapsed: boolean;
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
