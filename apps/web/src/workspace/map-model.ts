import { nodesInFocus, subtreeIds, visibleNodes, type DropTarget, type TreeNode } from '@tributary/domain';
import type { ConversationNode, NodeLink } from '../api/client.js';

export interface DraftNode {
  tempId: string;
  parentId: string | null;
  relation: 'root' | 'child' | 'sibling';
  anchorId: string | null;
  seed: string;
}

export interface DragState {
  id: string;
  x: number;
  y: number;
  drop: DropTarget | null;
}

/** 右键菜单。target 缺省是节点；pane 为画布空白；edge 为关系线。 */
export interface CanvasMenuState {
  x: number;
  y: number;
  target?: 'node' | 'pane' | 'edge';
  linkId?: string;
}

export interface ConfirmRequest {
  title: string;
  detail?: string;
  confirmLabel: string;
  danger?: boolean;
  onConfirm: () => void;
}

export const DEFAULT_NODE_HEIGHT = 96;
export const DRAFT_NODE_HEIGHT = 132;
export const NODE_WIDTH = 280;

export function modelValue(providerId: string, model: string): string {
  return `${providerId}::${model}`;
}

export function splitModelChoice(choice: string): { providerId: string | null; model: string | null } {
  const split = choice.split('::');
  if (split.length < 2 || !split[0] || !split[1]) return { providerId: null, model: null };
  return { providerId: split[0], model: split.slice(1).join('::') };
}

export function preferredChoice(configs: { id: string; model: string; isDefault: boolean }[], current: string): string {
  if (current && configs.some((config) => modelValue(config.id, config.model) === current)) return current;
  const picked = configs.find((config) => config.isDefault) ?? configs[0];
  return picked ? modelValue(picked.id, picked.model) : '';
}

export function toTree(node: ConversationNode): TreeNode {
  return {
    id: node.id,
    parentId: node.parentId,
    question: node.question,
    reply: node.reply,
    collapsed: node.collapsed,
    note: node.note,
  };
}

export interface MapSlice {
  nodes: Record<string, ConversationNode>;
  nodeOrder: string[];
  drafts: DraftNode[];
  focusId?: string | null;
}

export function nodeList(state: { nodes: Record<string, ConversationNode>; nodeOrder: string[] }): ConversationNode[] {
  return state.nodeOrder.map((id) => state.nodes[id]).filter((node): node is ConversationNode => Boolean(node));
}

/** 由地图切片组装当前可见树（含 draft 占位节点）。focusId 只留下那一枝。 */
export function visibleTreeOf(state: MapSlice): TreeNode[] {
  const real = nodeList(state).map(toTree);
  const focusId = state.focusId ?? null;
  const scoped = nodesInFocus(real, focusId);
  const visible = visibleNodes(scoped);
  const visibleIds = new Set(visible.map((node) => node.id));
  const scopedIds = new Set(scoped.map((node) => node.id));
  const drafts = state.drafts
    .filter((draft) => {
      if (draft.parentId === null) return focusId === null;
      return scopedIds.has(draft.parentId) && visibleIds.has(draft.parentId);
    })
    .map((draft) => ({
      id: draft.tempId,
      parentId: draft.parentId,
      question: '',
      reply: null,
      collapsed: false,
    }));
  return [...visible, ...drafts];
}

export function slideIds(state: { nodes: Record<string, ConversationNode>; nodeOrder: string[]; focusId: string | null }): string[] {
  const scoped = nodesInFocus(nodeList(state), state.focusId);
  const children = new Map<string | null, string[]>();
  const ids = new Set(scoped.map((node) => node.id));
  for (const node of scoped) {
    const parentId = node.parentId !== null && ids.has(node.parentId) ? node.parentId : null;
    const list = children.get(parentId) ?? [];
    list.push(node.id);
    children.set(parentId, list);
  }
  const order: string[] = [];
  const walk = (id: string) => {
    order.push(id);
    for (const child of children.get(id) ?? []) walk(child);
  };
  for (const root of children.get(null) ?? []) walk(root);
  return order;
}

export function pack(list: readonly ConversationNode[]): { nodes: Record<string, ConversationNode>; nodeOrder: string[] } {
  const nodes: Record<string, ConversationNode> = {};
  const nodeOrder: string[] = [];
  for (const node of list) {
    nodes[node.id] = node;
    nodeOrder.push(node.id);
  }
  return { nodes, nodeOrder };
}

export function mergeServer(local: Record<string, ConversationNode>, list: readonly ConversationNode[]) {
  const nodes: Record<string, ConversationNode> = {};
  for (const node of list) {
    const current = local[node.id];
    nodes[node.id] = current && current.status === 'pending' && node.status === 'pending' ? { ...node, reply: current.reply } : node;
  }
  return { nodes, nodeOrder: list.map((node) => node.id) };
}

export function withCollapsed(nodes: Record<string, ConversationNode>, changes: readonly { id: string; collapsed: boolean }[]) {
  const next = { ...nodes };
  for (const change of changes) {
    const node = next[change.id];
    if (node) next[change.id] = { ...node, collapsed: change.collapsed };
  }
  return next;
}

export function forestGroups(created: readonly ConversationNode[]): ConversationNode[][] {
  const ids = new Set(created.map((node) => node.id));
  const roots = created.filter((node) => node.parentId === null || !ids.has(node.parentId));
  return roots.map((root) => {
    const keep = new Set(subtreeIds(created, root.id));
    return created.filter((node) => keep.has(node.id));
  });
}

export function errorMessage(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback;
}

export type { NodeLink };
