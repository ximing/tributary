import { create } from 'zustand';
import {
  layoutTree,
  navigate,
  resolveParentId,
  selectionAfterLoad,
  visibleNodes,
  type Direction,
  type TreeNode,
} from '@tributary/domain';
import {
  createConversation,
  createNode,
  deleteConversation,
  deleteNode as apiDeleteNode,
  listConversations,
  listModelConfigs,
  loadConversation,
  regenerateNode as apiRegenerateNode,
  search,
  setCollapsed,
  type Conversation,
  type ConversationNode,
  type ModelConfig,
  type SearchHit,
} from '../api/client.js';
import { getCanvasSettings } from '../lib/canvasSettings.js';

export interface DraftNode {
  tempId: string;
  parentId: string | null;
  relation: 'root' | 'child' | 'sibling';
  anchorId: string | null;
}

export function preferredChoice(configs: ModelConfig[], current: string): string {
  if (current && configs.some((config) => modelValue(config.id, config.model) === current)) return current;
  const picked = configs.find((config) => config.isDefault) ?? configs[0];
  return picked ? modelValue(picked.id, picked.model) : '';
}

export const DEFAULT_NODE_HEIGHT = 96;
export const DRAFT_NODE_HEIGHT = 132;
export const NODE_WIDTH = 280;

function toTree(node: ConversationNode): TreeNode {
  return {
    id: node.id,
    parentId: node.parentId,
    question: node.question,
    reply: node.reply,
    collapsed: node.collapsed,
  };
}

/** 由 store 切片组装当前可见树（含 draft 占位节点） */
export function visibleTreeOf(state: {
  nodes: Record<string, ConversationNode>;
  nodeOrder: string[];
  drafts: DraftNode[];
}): TreeNode[] {
  const real = state.nodeOrder
    .map((id) => state.nodes[id])
    .filter((node): node is ConversationNode => Boolean(node))
    .map(toTree);
  const visible = visibleNodes(real);
  const visibleIds = new Set(visible.map((node) => node.id));
  const drafts = state.drafts
    .filter((draft) => draft.parentId === null || visibleIds.has(draft.parentId))
    .map((draft) => ({
      id: draft.tempId,
      parentId: draft.parentId,
      question: '',
      reply: null,
      collapsed: false,
    }));
  return [...visible, ...drafts];
}

function errorMessage(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback;
}

export function modelValue(providerId: string, model: string): string {
  return `${providerId}::${model}`;
}

export function splitModelChoice(choice: string): { providerId: string | null; model: string | null } {
  const split = choice.split('::');
  if (split.length < 2 || !split[0] || !split[1]) return { providerId: null, model: null };
  return { providerId: split[0], model: split.slice(1).join('::') };
}

interface ConfirmRequest {
  title: string;
  detail?: string;
  confirmLabel: string;
  danger?: boolean;
  onConfirm: () => void;
}

interface WorkspaceStore {
  conversations: Conversation[];
  configs: ModelConfig[];
  activeId: string | null;
  nodes: Record<string, ConversationNode>;
  nodeOrder: string[];
  selectedId: string | null;
  selectionEpoch: number;
  expandedReplies: Record<string, boolean>;
  drafts: DraftNode[];
  streaming: Record<string, string>;
  streamErrors: Record<string, string>;
  heights: Record<string, number>;
  focusRequest: { id: string; at: number } | null;
  modelChoice: string;
  menu: { x: number; y: number } | null;
  helpOpen: boolean;
  confirm: ConfirmRequest | null;
  notice: string;
  hits: SearchHit[];

  init: () => Promise<void>;
  refreshConversations: () => Promise<void>;
  refreshConfigs: () => Promise<void>;
  openConversation: (id: string, selectId?: string | null) => Promise<void>;
  newConversation: () => Promise<void>;
  removeConversation: (id: string) => Promise<void>;
  select: (id: string | null) => void;
  clickNode: (id: string) => void;
  navigateSelection: (direction: Direction) => void;
  toggleReply: (id: string) => void;
  toggleCollapse: (id: string) => Promise<void>;
  openDraft: (relation: 'root' | 'child' | 'sibling', anchorId?: string) => void;
  commitDraft: (tempId: string, text: string) => Promise<void>;
  cancelDraft: (tempId: string) => void;
  detachDraft: (tempId: string) => void;
  submit: (text: string) => Promise<void>;
  retryNode: (id: string) => void;
  regenerateNode: (id: string) => Promise<void>;
  removeNode: (id: string) => Promise<void>;
  applyDelta: (id: string, text: string) => void;
  applyDone: (id: string, node: ConversationNode) => void;
  applyStreamError: (id: string, message: string) => void;
  reportHeight: (id: string, height: number) => void;
  runSearch: (q: string) => Promise<void>;
  clearHits: () => void;
  setModelChoice: (choice: string) => void;
  setMenu: (menu: { x: number; y: number } | null) => void;
  setHelpOpen: (open: boolean) => void;
  setConfirm: (confirm: ConfirmRequest | null) => void;
  setNotice: (notice: string) => void;
}

export const useWorkspace = create<WorkspaceStore>()((set, get) => ({
  conversations: [],
  configs: [],
  activeId: null,
  nodes: {},
  nodeOrder: [],
  selectedId: null,
  selectionEpoch: 0,
  expandedReplies: {},
  drafts: [],
  streaming: {},
  streamErrors: {},
  heights: {},
  focusRequest: null,
  modelChoice: '',
  menu: null,
  helpOpen: false,
  confirm: null,
  notice: '',
  hits: [],

  init: async () => {
    try {
      await Promise.all([get().refreshConversations(), get().refreshConfigs()]);
    } catch (error) {
      set({ notice: errorMessage(error, '加载失败') });
    }
  },

  refreshConversations: async () => {
    const body = await listConversations();
    set({ conversations: body.conversations });
  },

  refreshConfigs: async () => {
    const body = await listModelConfigs();
    set((state) => ({
      configs: body.configs,
      modelChoice: preferredChoice(body.configs, state.modelChoice),
    }));
  },

  openConversation: async (id, selectId = null) => {
    const epochAtStart = get().selectionEpoch;
    try {
      const body = await loadConversation(id);
      const current = get();
      const nodes: Record<string, ConversationNode> = {};
      for (const node of body.nodes) nodes[node.id] = node;
      set({
        activeId: id,
        nodes,
        nodeOrder: body.nodes.map((node) => node.id),
        drafts: [],
        menu: null,
        selectedId: selectionAfterLoad(epochAtStart, current.selectionEpoch, selectId, current.selectedId),
      });
    } catch (error) {
      set({ notice: errorMessage(error, '打开失败') });
    }
  },

  newConversation: async () => {
    try {
      const conversation = await createConversation();
      await get().refreshConversations();
      await get().openConversation(conversation.id);
    } catch (error) {
      set({ notice: errorMessage(error, '创建失败') });
    }
  },

  removeConversation: async (id) => {
    try {
      await deleteConversation(id);
      const wasActive = get().activeId === id;
      set((state) => ({
        conversations: state.conversations.filter((conversation) => conversation.id !== id),
        ...(wasActive ? { activeId: null, nodes: {}, nodeOrder: [], selectedId: null, drafts: [] } : {}),
      }));
    } catch (error) {
      set({ notice: errorMessage(error, '删除失败') });
    }
  },

  select: (id) => {
    set((state) => ({ selectedId: id, selectionEpoch: state.selectionEpoch + 1, menu: null }));
  },

  clickNode: (id) => {
    const state = get();
    set({ selectedId: id, selectionEpoch: state.selectionEpoch + 1, menu: null });
    state.toggleReply(id);
  },

  navigateSelection: (direction) => {
    const state = get();
    const draftIds = new Set(state.drafts.map((draft) => draft.tempId));
    const tree = visibleTreeOf(state).filter((node) => !draftIds.has(node.id));
    const layout = getCanvasSettings().layout;
    const points = layoutTree(tree, {
      heightOf: (id) => state.heights[id] ?? DEFAULT_NODE_HEIGHT,
      direction: layout,
    });
    const next = navigate(points, tree, state.selectedId, direction, layout);
    if (next) {
      set({ selectedId: next, selectionEpoch: state.selectionEpoch + 1, focusRequest: { id: next, at: Date.now() } });
    }
  },

  toggleReply: (id) => {
    set((state) => ({
      expandedReplies: { ...state.expandedReplies, [id]: !state.expandedReplies[id] },
    }));
  },

  toggleCollapse: async (id) => {
    const current = get().nodes[id];
    if (!current) return;
    const next = !current.collapsed;
    set((state) => ({
      nodes: { ...state.nodes, [id]: { ...current, collapsed: next } },
      menu: null,
    }));
    try {
      await setCollapsed(id, next);
    } catch (error) {
      set((state) => ({
        nodes: { ...state.nodes, [id]: { ...state.nodes[id]!, collapsed: current.collapsed } },
        notice: errorMessage(error, '展开失败'),
      }));
    }
  },

  openDraft: (relation, anchorId) => {
    const state = get();
    if (!state.activeId) {
      set({ notice: '先新建一个对话' });
      return;
    }
    if (state.drafts.length > 0) return;
    const anchor = anchorId ?? state.selectedId;
    const tree = state.nodeOrder
      .map((id) => state.nodes[id])
      .filter((node): node is ConversationNode => Boolean(node))
      .map(toTree);
    const effective = relation !== 'root' && anchor ? relation : 'root';
    const parentId = resolveParentId(tree, effective, anchor);
    const tempId = `draft-${crypto.randomUUID()}`;
    set((current) => ({
      drafts: [
        {
          tempId,
          parentId,
          relation: effective,
          anchorId: effective === 'root' ? null : anchor,
        },
      ],
      menu: null,
      selectedId: anchor,
      selectionEpoch: current.selectionEpoch + 1,
      // 平移对准新草稿（保持当前缩放，不触发 fitView）
      focusRequest: { id: tempId, at: Date.now() },
    }));
  },

  commitDraft: async (tempId, text) => {
    const state = get();
    const draft = state.drafts.find((item) => item.tempId === tempId);
    if (!draft || !state.activeId) return;
    const question = text.trim();
    if (!question) return;
    set({ drafts: [] });
    const { providerId, model } = splitModelChoice(state.modelChoice);
    try {
      const node = await createNode({
        conversationId: state.activeId,
        question,
        relation: draft.relation,
        selectedNodeId: draft.anchorId,
        providerId,
        model,
      });
      set((current) => ({
        nodes: { ...current.nodes, [node.id]: node },
        nodeOrder: [...current.nodeOrder, node.id],
        selectedId: node.id,
        expandedReplies: { ...current.expandedReplies, [node.id]: true },
        focusRequest: { id: node.id, at: Date.now() },
      }));
      void get().refreshConversations();
    } catch (error) {
      set({ notice: errorMessage(error, '提问失败') });
    }
  },

  cancelDraft: (tempId) => {
    set((state) => ({ drafts: state.drafts.filter((draft) => draft.tempId !== tempId) }));
  },

  /** 摘掉草稿的上下文：从子/同级问题转为根问题 */
  detachDraft: (tempId) => {
    set((state) => ({
      drafts: state.drafts.map((draft) =>
        draft.tempId === tempId ? { ...draft, parentId: null, relation: 'root', anchorId: null } : draft,
      ),
    }));
  },

  submit: async (text) => {
    const state = get();
    if (!state.activeId) {
      set({ notice: '先新建一个对话' });
      return;
    }
    const question = text.trim();
    if (!question) return;
    const relation = state.selectedId ? 'child' : 'root';
    const { providerId, model } = splitModelChoice(state.modelChoice);
    try {
      const node = await createNode({
        conversationId: state.activeId,
        question,
        relation,
        selectedNodeId: state.selectedId,
        providerId,
        model,
      });
      set((current) => ({
        nodes: { ...current.nodes, [node.id]: node },
        nodeOrder: [...current.nodeOrder, node.id],
        selectedId: node.id,
        expandedReplies: { ...current.expandedReplies, [node.id]: true },
        focusRequest: { id: node.id, at: Date.now() },
      }));
      void get().refreshConversations();
    } catch (error) {
      set({ notice: errorMessage(error, '提问失败') });
    }
  },

  retryNode: (id) => {
    set((state) => {
      const node = state.nodes[id];
      if (!node) return state;
      const streamErrors = { ...state.streamErrors };
      delete streamErrors[id];
      return {
        nodes: { ...state.nodes, [id]: { ...node, status: 'pending', reply: null } },
        streamErrors,
        expandedReplies: { ...state.expandedReplies, [id]: true },
      };
    });
  },

  /** 重新生成回答：服务端重置为 pending 并入队，SSE 自动接管 */
  regenerateNode: async (id) => {
    try {
      const node = await apiRegenerateNode(id);
      set((state) => {
        const streamErrors = { ...state.streamErrors };
        delete streamErrors[id];
        return {
          nodes: { ...state.nodes, [id]: node },
          streamErrors,
          expandedReplies: { ...state.expandedReplies, [id]: true },
          menu: null,
        };
      });
    } catch (error) {
      set({ notice: errorMessage(error, '重新生成失败') });
    }
  },

  /** 删除节点及其整棵子树：先弹应用内确认框，确认后本地移除，失败则重新加载对话 */
  removeNode: async (id) => {
    const state = get();
    const node = state.nodes[id];
    if (!node) return;
    const childrenOf = new Map<string, string[]>();
    for (const nid of state.nodeOrder) {
      const parentId = state.nodes[nid]?.parentId;
      if (!parentId) continue;
      const list = childrenOf.get(parentId) ?? [];
      list.push(nid);
      childrenOf.set(parentId, list);
    }
    const removed = new Set<string>();
    const queue = [id];
    while (queue.length > 0) {
      const nid = queue.pop()!;
      removed.add(nid);
      queue.push(...(childrenOf.get(nid) ?? []));
    }
    const childCount = removed.size - 1;
    const question = node.question.length > 12 ? `${node.question.slice(0, 12)}…` : node.question;
    const parentId = node.parentId;
    set({
      confirm: {
        title: `删除「${question}」？`,
        detail: childCount > 0 ? `将同时删除其 ${String(childCount)} 个子分支，此操作不可撤销。` : '此操作不可撤销。',
        confirmLabel: '删除',
        danger: true,
        onConfirm: () => {
          set((current) => {
            const nodes = { ...current.nodes };
            const heights = { ...current.heights };
            const expandedReplies = { ...current.expandedReplies };
            const streaming = { ...current.streaming };
            const streamErrors = { ...current.streamErrors };
            for (const nid of removed) {
              delete nodes[nid];
              delete heights[nid];
              delete expandedReplies[nid];
              delete streaming[nid];
              delete streamErrors[nid];
            }
            return {
              nodes,
              heights,
              expandedReplies,
              streaming,
              streamErrors,
              nodeOrder: current.nodeOrder.filter((nid) => !removed.has(nid)),
              drafts: current.drafts.filter((draft) => !draft.anchorId || !removed.has(draft.anchorId)),
              selectedId: parentId && !removed.has(parentId) ? parentId : null,
              menu: null,
            };
          });
          void apiDeleteNode(id)
            .then(() => get().refreshConversations())
            .catch(async (error: unknown) => {
              set({ notice: errorMessage(error, '删除失败') });
              const activeId = get().activeId;
              if (activeId) await get().openConversation(activeId);
            });
        },
      },
    });
  },

  applyDelta: (id, text) => {
    set((state) => ({
      streaming: { ...state.streaming, [id]: text },
      expandedReplies: state.expandedReplies[id] ? state.expandedReplies : { ...state.expandedReplies, [id]: true },
    }));
  },

  applyDone: (id, node) => {
    set((state) => {
      const streaming = { ...state.streaming };
      const streamErrors = { ...state.streamErrors };
      delete streaming[id];
      delete streamErrors[id];
      return {
        nodes: { ...state.nodes, [id]: node },
        streaming,
        streamErrors,
      };
    });
    void get().refreshConversations();
  },

  applyStreamError: (id, message) => {
    set((state) => {
      const streaming = { ...state.streaming };
      delete streaming[id];
      const node = state.nodes[id];
      return {
        streaming,
        streamErrors: { ...state.streamErrors, [id]: message },
        nodes: node ? { ...state.nodes, [id]: { ...node, status: 'error', reply: message } } : state.nodes,
      };
    });
  },

  reportHeight: (id, height) => {
    const previous = get().heights[id];
    if (previous !== undefined && Math.abs(previous - height) < 2) return;
    set((state) => ({ heights: { ...state.heights, [id]: height } }));
  },

  runSearch: async (q) => {
    try {
      const body = await search(q);
      set({ hits: body.hits });
    } catch (error) {
      set({ notice: errorMessage(error, '搜索失败') });
    }
  },

  clearHits: () => set({ hits: [] }),

  setModelChoice: (choice) => set({ modelChoice: choice }),
  setMenu: (menu) => set({ menu }),
  setHelpOpen: (open) => set({ helpOpen: open }),
  setConfirm: (confirm) => set({ confirm }),
  setNotice: (notice) => set({ notice }),
}));
