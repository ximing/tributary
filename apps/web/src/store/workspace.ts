import { create } from 'zustand';
import {
  collapsedChanges,
  collapseToLevel,
  expandAncestors,
  findInTree,
  indentTarget,
  isStickerId,
  isSamePlace,
  layoutTree,
  moveNode as rearrangeNode,
  navigate,
  nodesInFocus,
  outdentTarget,
  resolveParentId,
  selectionAfterLoad,
  setAllCollapsed,
  siblingIndex,
  subtreeIds,
  visibleNodes,
  withSiblingPositions,
  type Direction,
  type DropTarget,
  type OutlineItem,
  type StickerId,
  type TreeNode,
} from '@tributary/domain';
import {
  cancelNode as apiCancelNode,
  copyNode as apiCopyNode,
  createConversation,
  createLink as apiCreateLink,
  createNode,
  deleteConversation,
  deleteLink as apiDeleteLink,
  deleteNode as apiDeleteNode,
  insertOutline as apiInsertOutline,
  listConversations,
  listModelConfigs,
  loadConversation,
  moveNode as apiMoveNode,
  regenerateNode as apiRegenerateNode,
  renameNode as apiRenameNode,
  restoreNodes as apiRestoreNodes,
  search,
  setCollapsed,
  setCollapsedMany,
  setNote as apiSetNote,
  setSticker as apiSetSticker,
  type Conversation,
  type ConversationNode,
  type ModelConfig,
  type NodeLink,
  type SearchHit,
} from '../api/client.js';

import { getCanvasSettings } from '../lib/canvasSettings.js';
import { pushHistory, type HistoryEntry, type MapOp } from './history.js';

export interface DraftNode {
  tempId: string;
  parentId: string | null;
  relation: 'root' | 'child' | 'sibling';
  anchorId: string | null;
  seed: string;
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
    note: node.note,
  };
}

/** 由 store 切片组装当前可见树（含 draft 占位节点）。focusId 只留下那一枝。 */
export function visibleTreeOf(state: {
  nodes: Record<string, ConversationNode>;
  nodeOrder: string[];
  drafts: DraftNode[];
  focusId?: string | null;
}): TreeNode[] {
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

export interface DragState {
  id: string;
  x: number;
  y: number;
  drop: DropTarget | null;
}

function nodeList(state: { nodes: Record<string, ConversationNode>; nodeOrder: string[] }): ConversationNode[] {
  return state.nodeOrder.map((id) => state.nodes[id]).filter((node): node is ConversationNode => Boolean(node));
}

function pack(list: readonly ConversationNode[]): { nodes: Record<string, ConversationNode>; nodeOrder: string[] } {
  const nodes: Record<string, ConversationNode> = {};
  const nodeOrder: string[] = [];
  for (const node of list) {
    nodes[node.id] = node;
    nodeOrder.push(node.id);
  }
  return { nodes, nodeOrder };
}

function mergeServer(local: Record<string, ConversationNode>, list: readonly ConversationNode[]) {
  const nodes: Record<string, ConversationNode> = {};
  for (const node of list) {
    const current = local[node.id];
    nodes[node.id] = current && current.status === 'pending' && node.status === 'pending' ? { ...node, reply: current.reply } : node;
  }
  return { nodes, nodeOrder: list.map((node) => node.id) };
}

function withCollapsed(nodes: Record<string, ConversationNode>, changes: readonly { id: string; collapsed: boolean }[]) {
  const next = { ...nodes };
  for (const change of changes) {
    const node = next[change.id];
    if (node) next[change.id] = { ...node, collapsed: change.collapsed };
  }
  return next;
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

/** 右键菜单。target 缺省是节点；pane 为画布空白；edge 为关系线。 */
export interface CanvasMenuState {
  x: number;
  y: number;
  target?: 'node' | 'pane' | 'edge';
  linkId?: string;
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
  focusId: string | null;
  outlineOpen: boolean;
  findOpen: boolean;
  findQuery: string;
  findCursor: number;
  findCurrentId: string | null;
  editingId: string | null;
  editingNoteId: string | null;
  links: NodeLink[];
  linkFrom: string | null;
  presentId: string | null;
  drag: DragState | null;
  undoStack: HistoryEntry[];
  redoStack: HistoryEntry[];
  modelChoice: string;
  menu: CanvasMenuState | null;
  helpOpen: boolean;
  searchOpen: boolean;
  confirm: ConfirmRequest | null;
  notice: string;
  hits: SearchHit[];

  init: () => Promise<void>;
  refreshConversations: () => Promise<void>;
  refreshConfigs: () => Promise<void>;
  openConversation: (id: string, selectId?: string | null, keepHistory?: boolean) => Promise<void>;
  newConversation: () => Promise<void>;
  removeConversation: (id: string) => Promise<void>;
  select: (id: string | null) => void;
  clickNode: (id: string) => void;
  navigateSelection: (direction: Direction) => void;
  toggleReply: (id: string) => void;
  toggleCollapse: (id: string) => Promise<void>;
  collapseScope: (mode: 'all' | 'none' | number) => Promise<void>;
  revealNode: (id: string) => Promise<void>;
  toggleFocus: () => void;
  focusBranch: (id: string) => void;
  renameQuestion: (id: string, question: string) => Promise<void>;
  moveNodeTo: (id: string, parentId: string | null, index: number) => Promise<void>;
  reorderSelected: (delta: number) => Promise<void>;
  relevelSelected: (direction: 'indent' | 'outdent') => Promise<void>;
  copyBranch: (id: string) => Promise<void>;
  copyPlainText: (text: string) => Promise<void>;
  answerWithAnotherModel: (id: string, providerId: string, model: string) => Promise<void>;
  pasteOutline: (items: OutlineItem[]) => Promise<void>;
  askNode: (id: string) => Promise<void>;
  stopNode: (id: string) => Promise<void>;
  answerAgain: (id: string) => Promise<void>;
  saveNote: (id: string, note: string) => Promise<void>;
  setEditingNote: (id: string | null) => void;
  chooseSticker: (id: string, sticker: StickerId | null) => Promise<void>;
  startLink: (id: string) => void;
  cancelLink: () => void;
  finishLink: (targetId: string) => Promise<void>;
  removeLink: (id: string) => Promise<void>;
  openPresent: (id?: string | null) => void;
  closePresent: () => void;
  stepPresent: (delta: number) => void;
  openFind: () => void;
  setFindQuery: (query: string) => void;
  stepFind: (delta: number) => void;
  closeFind: () => void;
  undo: () => Promise<void>;
  redo: () => Promise<void>;
  setDrag: (drag: DragState | null) => void;
  setEditing: (id: string | null) => void;
  setOutlineOpen: (open: boolean) => void;
  openDraft: (relation: 'root' | 'child' | 'sibling', anchorId?: string, seed?: string) => void;
  commitDraft: (tempId: string, text: string) => Promise<void>;
  cancelDraft: (tempId: string) => void;
  detachDraft: (tempId: string) => void;
  submit: (text: string) => Promise<void>;
  retryNode: (id: string) => void;
  regenerateNode: (id: string, override?: { providerId: string; model: string }) => Promise<void>;
  removeNode: (id: string) => Promise<void>;
  applyDelta: (id: string, text: string) => void;
  applyDone: (id: string, node: ConversationNode) => void;
  applyStreamError: (id: string, message: string) => void;
  reportHeight: (id: string, height: number) => void;
  runSearch: (q: string) => Promise<void>;
  clearHits: () => void;
  setModelChoice: (choice: string) => void;
  setMenu: (menu: CanvasMenuState | null) => void;
  setHelpOpen: (open: boolean) => void;
  setSearchOpen: (open: boolean) => void;
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
  focusId: null,
  outlineOpen: false,
  findOpen: false,
  findQuery: '',
  findCursor: 0,
  findCurrentId: null,
  editingId: null,
  editingNoteId: null,
  links: [],
  linkFrom: null,
  presentId: null,
  drag: null,
  undoStack: [],
  redoStack: [],
  modelChoice: '',
  menu: null,
  helpOpen: false,
  searchOpen: false,
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

  openConversation: async (id, selectId = null, keepHistory = false) => {
    const epochAtStart = get().selectionEpoch;
    try {
      const body = await loadConversation(id);
      const current = get();
      const picked = selectionAfterLoad(epochAtStart, current.selectionEpoch, selectId, current.selectedId);
      const tree = body.nodes.map(toTree);
      const expanded = picked ? expandAncestors(tree, picked) : tree;
      const changes = collapsedChanges(tree, expanded);
      const collapsedOf = new Map(expanded.map((node) => [node.id, node.collapsed]));
      const nodes: Record<string, ConversationNode> = {};
      for (const node of body.nodes) nodes[node.id] = { ...node, collapsed: collapsedOf.get(node.id) ?? node.collapsed };
      set({
        activeId: id,
        nodes,
        nodeOrder: body.nodes.map((node) => node.id),
        drafts: [],
        menu: null,
        selectedId: picked,
        focusRequest: picked ? { id: picked, at: Date.now() } : null,
        focusId: null,
        editingId: null,
        editingNoteId: null,
        links: body.links ?? [],
        linkFrom: null,
        presentId: null,
        drag: null,
        ...(keepHistory ? {} : { undoStack: [], redoStack: [] }),
      });
      if (changes.length > 0) void setCollapsedMany(id, changes).catch(() => undefined);
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
        ...(wasActive
          ? {
              activeId: null,
              nodes: {},
              nodeOrder: [],
              selectedId: null,
              drafts: [],
              focusId: null,
              editingId: null,
              editingNoteId: null,
              links: [],
              linkFrom: null,
              presentId: null,
              drag: null,
              undoStack: [],
              redoStack: [],
            }
          : {}),
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
    if (state.linkFrom) {
      void state.finishLink(id);
      return;
    }
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
    await applyCollapse(get, set, [{ id, collapsed: !current.collapsed }]);
  },

  collapseScope: async (mode) => {
    const state = get();
    const list = nodeList(state);
    const scope = state.focusId;
    const next = mode === 'all' ? setAllCollapsed(list, true, scope) : mode === 'none' ? setAllCollapsed(list, false, scope) : collapseToLevel(list, mode, scope);
    await applyCollapse(get, set, collapsedChanges(list, next));
  },

  revealNode: async (id) => {
    const state = get();
    if (!state.nodes[id]) return;
    const list = nodeList(state);
    const changes = collapsedChanges(list, expandAncestors(list, id));
    const focusId = state.focusId && subtreeIds(list, state.focusId).includes(id) ? state.focusId : null;
    if (changes.length > 0 && state.activeId) {
      set({ nodes: withCollapsed(state.nodes, changes), menu: null, focusId });
      void setCollapsedMany(state.activeId, changes).catch(() => undefined);
    }
    set((current) => ({
      selectedId: id,
      selectionEpoch: current.selectionEpoch + 1,
      menu: null,
      focusId,
      focusRequest: { id, at: Date.now() },
    }));
  },

  toggleFocus: () => {
    const { focusId, selectedId } = get();
    if (focusId) {
      set({ focusId: null });
      void get().revealNode(focusId);
      return;
    }
    if (!selectedId || !get().nodes[selectedId]) return;
    set({ focusId: selectedId, focusRequest: { id: selectedId, at: Date.now() }, menu: null });
  },

  focusBranch: (id) => {
    const node = get().nodes[id];
    if (!node) return;
    set((state) => ({
      focusId: id,
      selectedId: id,
      focusRequest: { id, at: Date.now() },
      menu: null,
      nodes: node.collapsed && state.nodes[id] ? { ...state.nodes, [id]: { ...state.nodes[id]!, collapsed: false } } : state.nodes,
    }));
    if (node.collapsed) void setCollapsed(id, false);
  },

  renameQuestion: async (id, question) => {
    const text = question.trim();
    const current = get().nodes[id];
    if (!current) return;
    if (!text || text === current.question) {
      set({ editingId: null });
      return;
    }
    const previous = current.question;
    set({ nodes: { ...get().nodes, [id]: { ...current, question: text } }, editingId: null });
    try {
      await apiRenameNode(id, text);
      record(set, { undo: { type: 'rename', id, question: previous }, redo: { type: 'rename', id, question: text } });
      void get().refreshConversations();
    } catch (error) {
      set((state) => ({
        nodes: state.nodes[id] ? { ...state.nodes, [id]: { ...state.nodes[id]!, question: previous } } : state.nodes,
        notice: errorMessage(error, '修改失败'),
      }));
    }
  },

  moveNodeTo: async (id, parentId, index) => {
    const state = get();
    const list = nodeList(state);
    const current = list.find((node) => node.id === id);
    if (!current || isSamePlace(list, id, parentId, index)) return;
    const oldIndex = siblingIndex(list, id);
    const snapshot = pack(list);
    try {
      const next = withSiblingPositions(rearrangeNode(list, id, parentId, index));
      set({ ...pack(next), menu: null, drag: null });
      const body = await apiMoveNode(id, parentId, index);
      set((latest) => mergeServer(latest.nodes, body.nodes));
      record(set, {
        undo: { type: 'move', id, parentId: current.parentId, index: oldIndex },
        redo: { type: 'move', id, parentId, index },
      });
    } catch (error) {
      set({ ...snapshot, drag: null, notice: errorMessage(error, '移动失败') });
    }
  },

  reorderSelected: async (delta) => {
    const state = get();
    const id = state.selectedId;
    if (!id) return;
    const list = nodeList(state);
    const current = list.find((node) => node.id === id);
    if (!current) return;
    await get().moveNodeTo(id, current.parentId, siblingIndex(list, id) + delta);
  },

  relevelSelected: async (direction) => {
    const state = get();
    const id = state.selectedId;
    if (!id) return;
    const list = nodeList(state);
    const target = direction === 'indent' ? indentTarget(list, id) : outdentTarget(list, id);
    if (!target) {
      set({ notice: direction === 'indent' ? '没有上一个同级，没法再缩进' : '已经是最上层' });
      return;
    }
    await get().moveNodeTo(id, target.parentId, target.index);
    const moved = get().nodes[id];
    if (!moved || moved.parentId !== target.parentId) return;
    if (direction === 'indent' && target.parentId) {
      const parent = get().nodes[target.parentId];
      if (parent?.collapsed) {
        set({ nodes: { ...get().nodes, [parent.id]: { ...parent, collapsed: false } } });
        void setCollapsed(parent.id, false);
      }
    }
    const focusId = get().focusId;
    if (focusId && !subtreeIds(nodeList(get()), focusId).includes(id)) {
      set({ focusId: null });
      void get().revealNode(id);
    }
  },

  copyBranch: async (id) => {
    const before = new Set(get().nodeOrder);
    try {
      const body = await apiCopyNode(id);
      set((state) => ({
        ...mergeServer(state.nodes, body.nodes),
        selectedId: body.rootId,
        focusRequest: { id: body.rootId, at: Date.now() },
        menu: null,
      }));
      const created = body.nodes.filter((node) => !before.has(node.id));
      record(set, { undo: { type: 'remove', id: body.rootId }, redo: { type: 'restore', nodes: created } });
      void get().refreshConversations();
    } catch (error) {
      set({ notice: errorMessage(error, '复制失败') });
    }
  },

  copyPlainText: async (text) => {
    const value = text.trim();
    if (!value) {
      set({ notice: '没有可复制的文字' });
      return;
    }
    try {
      await navigator.clipboard.writeText(value);
      set({ notice: '已复制' });
    } catch {
      set({ notice: '复制失败' });
    }
  },

  answerWithAnotherModel: async (id, providerId, model) => {
    const previous = get().selectedId;
    await get().copyBranch(id);
    const rootId = get().selectedId;
    if (!rootId || rootId === previous) return;
    await get().regenerateNode(rootId, { providerId, model });
  },

  pasteOutline: async (items) => {
    const state = get();
    if (!state.activeId) {
      set({ notice: '先新建一个对话' });
      return;
    }
    if (items.length === 0) return;
    const parentId = state.selectedId ?? state.focusId;
    try {
      const body = await apiInsertOutline(state.activeId, parentId, items);
      const groups = forestGroups(body.created);
      const firstId = body.created[0]?.id ?? null;
      set((latest) => ({
        ...mergeServer(latest.nodes, body.nodes),
        selectedId: firstId,
        focusRequest: firstId ? { id: firstId, at: Date.now() } : latest.focusRequest,
        menu: null,
      }));
      if (parentId && get().nodes[parentId]?.collapsed) {
        const parent = get().nodes[parentId];
        if (parent) {
          set({ nodes: { ...get().nodes, [parentId]: { ...parent, collapsed: false } } });
          void setCollapsed(parentId, false);
        }
      }
      if (firstId) void get().revealNode(firstId);
      if (groups.length > 0) {
        record(set, {
          undo: { type: 'removeMany', ids: groups.map((group) => group[0]!.id) },
          redo: { type: 'restoreMany', groups },
        });
      }
      const count = body.created.length;
      set({ notice: `已放入 ${String(count)} 个问题，还没有向模型提问` });
      void get().refreshConversations();
    } catch (error) {
      set({ notice: errorMessage(error, '放入失败') });
    }
  },

  askNode: async (id) => {
    const { providerId, model } = splitModelChoice(get().modelChoice);
    if (!providerId || !model) {
      set({ notice: '先选择模型' });
      return;
    }
    await get().regenerateNode(id, { providerId, model });
  },

  openFind: () => {
    const selected = window.getSelection()?.toString().replace(/\s+/g, ' ').trim() ?? '';
    const query = selected.length > 0 && selected.length <= 80 ? selected : get().findQuery;
    set({ findOpen: true, findQuery: query, findCursor: 0, menu: null, helpOpen: false });
    window.setTimeout(() => document.getElementById('map-find-input')?.focus(), 0);
  },

  setFindQuery: (query) => set({ findQuery: query, findCursor: 0, findOpen: true }),

  stepFind: (delta) => {
    const hits = findInTree(nodeList(get()).map(toTree), get().findQuery);
    if (hits.length === 0) {
      set({ notice: '没有匹配', findCurrentId: null });
      return;
    }
    const next = (get().findCursor + delta + hits.length) % hits.length;
    set({ findOpen: true, findCursor: next });
  },

  closeFind: () => set({ findOpen: false, findCurrentId: null }),

  stopNode: async (id) => {
    const current = get().nodes[id];
    if (!current || current.status !== 'pending') return;
    const seen = (get().streaming[id] ?? current.reply ?? '').trim();
    try {
      const node = await apiCancelNode(id, seen || undefined);
      set((state) => {
        const streaming = { ...state.streaming };
        const streamErrors = { ...state.streamErrors };
        delete streaming[id];
        delete streamErrors[id];
        return {
          nodes: { ...state.nodes, [id]: node },
          streaming,
          streamErrors,
          notice: node.status === 'error' ? '已停止' : '已停止，留下了已经写出的回答',
        };
      });
    } catch (error) {
      set({ notice: errorMessage(error, '停止失败') });
    }
  },

  answerAgain: async (id) => {
    const node = get().nodes[id];
    if (!node) return;
    if (node.providerId && node.model) {
      await get().answerWithAnotherModel(id, node.providerId, node.model);
      return;
    }
    const choice = splitModelChoice(get().modelChoice);
    if (!choice.providerId || !choice.model) {
      set({ notice: '先选择模型' });
      return;
    }
    await get().answerWithAnotherModel(id, choice.providerId, choice.model);
  },

  saveNote: async (id, note) => {
    const current = get().nodes[id];
    if (!current) return;
    const next = note.trim() ? note.trim() : null;
    const previous = current.note ?? null;
    if ((previous ?? null) === next) {
      set({ editingNoteId: null });
      return;
    }
    set({ nodes: { ...get().nodes, [id]: { ...current, note: next } }, editingNoteId: null });
    try {
      const node = await apiSetNote(id, next);
      set((state) => ({ nodes: state.nodes[node.id] ? { ...state.nodes, [node.id]: node } : state.nodes }));
      record(set, { undo: { type: 'note', id, note: previous }, redo: { type: 'note', id, note: next } });
    } catch (error) {
      set((state) => ({
        nodes: state.nodes[id] ? { ...state.nodes, [id]: { ...state.nodes[id]!, note: previous } } : state.nodes,
        notice: errorMessage(error, '笔记没能保存'),
      }));
    }
  },

  setEditingNote: (id) => set({ editingNoteId: id, menu: null, editingId: null }),

  chooseSticker: async (id, sticker) => {
    const current = get().nodes[id];
    if (!current) return;
    const next = current.sticker === sticker ? null : sticker;
    const previous = current.sticker ?? null;
    set({ nodes: { ...get().nodes, [id]: { ...current, sticker: next } }, menu: null });
    try {
      const node = await apiSetSticker(id, next);
      set((state) => ({ nodes: state.nodes[node.id] ? { ...state.nodes, [node.id]: node } : state.nodes }));
      record(set, { undo: { type: 'sticker', id, sticker: previous }, redo: { type: 'sticker', id, sticker: next } });
    } catch (error) {
      set((state) => ({
        nodes: state.nodes[id] ? { ...state.nodes, [id]: { ...state.nodes[id]!, sticker: previous } } : state.nodes,
        notice: errorMessage(error, '贴纸没能保存'),
      }));
    }
  },

  startLink: (id) => {
    const node = get().nodes[id];
    if (!node) return;
    set({ linkFrom: id, menu: null, notice: '点另一个节点，连一条关系线' });
  },

  cancelLink: () => set({ linkFrom: null, notice: '' }),

  finishLink: async (targetId) => {
    const sourceId = get().linkFrom;
    const activeId = get().activeId;
    if (!sourceId || !activeId) return;
    if (sourceId === targetId) {
      set({ notice: '不能连到自己' });
      return;
    }
    try {
      const body = await apiCreateLink(activeId, sourceId, targetId);
      set((state) => ({
        links: state.links.some((link) => link.id === body.link.id) ? state.links : [...state.links, body.link],
        linkFrom: null,
        selectedId: targetId,
        selectionEpoch: state.selectionEpoch + 1,
        menu: null,
        notice: body.created ? '已连上' : '已经连过了',
      }));
      if (body.created) {
        record(set, {
          undo: { type: 'link', sourceId, targetId, present: false },
          redo: { type: 'link', sourceId, targetId, present: true },
        });
      }
    } catch (error) {
      set({ notice: errorMessage(error, '没能连上') });
    }
  },

  removeLink: async (id) => {
    const link = get().links.find((item) => item.id === id);
    if (!link) return;
    set({ links: get().links.filter((item) => item.id !== id), menu: null });
    try {
      await apiDeleteLink(id);
      record(set, {
        undo: { type: 'link', sourceId: link.sourceId, targetId: link.targetId, present: true },
        redo: { type: 'link', sourceId: link.sourceId, targetId: link.targetId, present: false },
      });
    } catch (error) {
      set((state) => ({
        links: state.links.some((item) => item.id === id) ? state.links : [...state.links, link],
        notice: errorMessage(error, '没能断开'),
      }));
    }
  },

  openPresent: (id) => {
    const order = slideIds(get());
    const start = id && order.includes(id) ? id : order[0];
    if (!start) {
      set({ notice: '还没有可以演示的节点' });
      return;
    }
    set({ presentId: start, menu: null, linkFrom: null });
  },

  closePresent: () => set({ presentId: null }),

  stepPresent: (delta) => {
    const order = slideIds(get());
    if (order.length === 0) {
      set({ presentId: null });
      return;
    }
    const at = Math.max(0, order.indexOf(get().presentId ?? ''));
    const next = order[Math.max(0, Math.min(order.length - 1, at + delta))];
    if (next) set({ presentId: next });
  },

  undo: async () => {
    const entry = get().undoStack.at(-1);
    if (!entry) return;
    set((state) => ({ undoStack: state.undoStack.slice(0, -1) }));
    try {
      await runOp(get, set, entry.undo);
      set((state) => ({ redoStack: [...state.redoStack, entry] }));
    } catch (error) {
      set((state) => ({ undoStack: [...state.undoStack, entry], notice: errorMessage(error, '撤回失败') }));
      const activeId = get().activeId;
      if (activeId) await get().openConversation(activeId, get().selectedId, true);
    }
  },

  redo: async () => {
    const entry = get().redoStack.at(-1);
    if (!entry) return;
    set((state) => ({ redoStack: state.redoStack.slice(0, -1) }));
    try {
      await runOp(get, set, entry.redo);
      set((state) => ({ undoStack: pushHistory(state.undoStack, entry) }));
    } catch (error) {
      set((state) => ({ redoStack: [...state.redoStack, entry], notice: errorMessage(error, '重做失败') }));
      const activeId = get().activeId;
      if (activeId) await get().openConversation(activeId, get().selectedId, true);
    }
  },

  setDrag: (drag) => set({ drag }),
  setEditing: (id) => set({ editingId: id, menu: null }),
  setOutlineOpen: (open) => set({ outlineOpen: open }),

  openDraft: (relation, anchorId, seed = '') => {
    const state = get();
    if (!state.activeId) {
      set({ notice: '先新建一个对话' });
      return;
    }
    if (state.drafts.length > 0) {
      if (seed) set({ notice: '先完成或取消当前问题' });
      return;
    }
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
          seed,
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
  regenerateNode: async (id, override) => {
    try {
      const node = await apiRegenerateNode(id, override);
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
      menu: null,
      confirm: {
        title: `删除「${question}」？`,
        detail: childCount > 0 ? `将同时删除其 ${String(childCount)} 个子分支。可按 ⌘Z 撤回。` : '可按 ⌘Z 撤回。',
        confirmLabel: '删除',
        danger: true,
        onConfirm: () => {
          const snapshots = nodeList(get()).filter((node) => removed.has(node.id));
          const related = get()
            .links.filter((link) => removed.has(link.sourceId) || removed.has(link.targetId))
            .map((link) => ({ sourceId: link.sourceId, targetId: link.targetId }));
          forgetNodes(set, removed, parentId);
          void apiDeleteNode(id)
            .then(() => {
              record(set, { undo: { type: 'restore', nodes: snapshots, links: related }, redo: { type: 'remove', id } });
              return get().refreshConversations();
            })
            .catch(async (error: unknown) => {
              set({ notice: errorMessage(error, '删除失败') });
              const activeId = get().activeId;
              if (activeId) await get().openConversation(activeId, null, true);
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
  setHelpOpen: (open) => set(open ? { helpOpen: true, searchOpen: false } : { helpOpen: false }),
  setSearchOpen: (open) => set(open ? { searchOpen: true, helpOpen: false } : { searchOpen: false }),
  setConfirm: (confirm) => set({ confirm }),
  setNotice: (notice) => set({ notice }),
}));

function forestGroups(created: readonly ConversationNode[]): ConversationNode[][] {
  const ids = new Set(created.map((node) => node.id));
  const roots = created.filter((node) => node.parentId === null || !ids.has(node.parentId));
  return roots.map((root) => {
    const keep = new Set(subtreeIds(created, root.id));
    return created.filter((node) => keep.has(node.id));
  });
}

function record(set: (partial: Partial<WorkspaceStore> | ((state: WorkspaceStore) => Partial<WorkspaceStore>)) => void, entry: HistoryEntry) {
  set((state) => ({ undoStack: pushHistory(state.undoStack, entry), redoStack: [] }));
}

function forgetNodes(
  set: (partial: Partial<WorkspaceStore> | ((state: WorkspaceStore) => Partial<WorkspaceStore>)) => void,
  removed: Set<string>,
  parentId: string | null,
) {
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
      editingId: current.editingId && removed.has(current.editingId) ? null : current.editingId,
      focusId: current.focusId && removed.has(current.focusId) ? null : current.focusId,
      editingNoteId: current.editingNoteId && removed.has(current.editingNoteId) ? null : current.editingNoteId,
      links: current.links.filter((link) => !removed.has(link.sourceId) && !removed.has(link.targetId)),
      linkFrom: current.linkFrom && removed.has(current.linkFrom) ? null : current.linkFrom,
      presentId: current.presentId && removed.has(current.presentId) ? null : current.presentId,
      menu: null,
    };
  });
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

async function applyCollapse(
  get: () => WorkspaceStore,
  set: (partial: Partial<WorkspaceStore> | ((state: WorkspaceStore) => Partial<WorkspaceStore>)) => void,
  changes: { id: string; collapsed: boolean }[],
) {
  if (changes.length === 0) return;
  const activeId = get().activeId;
  if (!activeId) return;
  const previous = changes.map((change) => ({ id: change.id, collapsed: !change.collapsed }));
  const snapshot = get().nodes;
  set({ nodes: withCollapsed(snapshot, changes), menu: null });
  try {
    if (changes.length === 1) await setCollapsed(changes[0]!.id, changes[0]!.collapsed);
    else await setCollapsedMany(activeId, changes);
    record(set, { undo: { type: 'collapse', changes: previous }, redo: { type: 'collapse', changes } });
  } catch (error) {
    set({ nodes: snapshot, notice: errorMessage(error, '折叠失败') });
  }
}

async function runOp(get: () => WorkspaceStore, set: (partial: Partial<WorkspaceStore> | ((state: WorkspaceStore) => Partial<WorkspaceStore>)) => void, op: MapOp) {
  const state = get();
  const activeId = state.activeId;
  if (!activeId) throw new Error('没有打开的对话');
  if (op.type === 'rename') {
    const current = state.nodes[op.id];
    if (!current) throw new Error('节点不存在');
    set({ nodes: { ...state.nodes, [op.id]: { ...current, question: op.question } }, editingId: null });
    const node = await apiRenameNode(op.id, op.question);
    set((latest) => ({
      nodes: latest.nodes[node.id] ? { ...latest.nodes, [node.id]: { ...latest.nodes[node.id]!, ...node } } : latest.nodes,
    }));
    void get().refreshConversations();
    return;
  }
  if (op.type === 'move') {
    const list = nodeList(get());
    const next = withSiblingPositions(rearrangeNode(list, op.id, op.parentId, op.index));
    set({ ...pack(next), menu: null, drag: null });
    const body = await apiMoveNode(op.id, op.parentId, op.index);
    set((latest) => mergeServer(latest.nodes, body.nodes));
    return;
  }
  if (op.type === 'remove') {
    const list = nodeList(get());
    const ids = subtreeIds(list, op.id);
    if (ids.length === 0) return;
    const parentId = get().nodes[op.id]?.parentId ?? null;
    forgetNodes(set, new Set(ids), parentId);
    await apiDeleteNode(op.id);
    void get().refreshConversations();
    return;
  }
  if (op.type === 'removeMany') {
    for (const id of op.ids) {
      if (!get().nodes[id]) continue;
      const ids = subtreeIds(nodeList(get()), id);
      const parentId = get().nodes[id]?.parentId ?? null;
      forgetNodes(set, new Set(ids), parentId);
      await apiDeleteNode(id);
    }
    void get().refreshConversations();
    return;
  }
  if (op.type === 'restore') {
    const body = await apiRestoreNodes(activeId, op.nodes);
    const rootId = op.nodes[0]?.id ?? null;
    set((latest) => ({
      ...mergeServer(latest.nodes, body.nodes),
      selectedId: rootId,
      focusRequest: rootId ? { id: rootId, at: Date.now() } : latest.focusRequest,
    }));
    for (const link of op.links ?? []) {
      const created = await apiCreateLink(activeId, link.sourceId, link.targetId);
      set((latest) => ({
        links: latest.links.some((item) => item.id === created.link.id) ? latest.links : [...latest.links, created.link],
      }));
    }
    void get().refreshConversations();
    return;
  }
  if (op.type === 'restoreMany') {
    let lastRoot: string | null = null;
    for (const group of op.groups) {
      const body = await apiRestoreNodes(activeId, group);
      lastRoot = group[0]?.id ?? lastRoot;
      set((latest) => mergeServer(latest.nodes, body.nodes));
    }
    if (lastRoot) set({ selectedId: lastRoot, focusRequest: { id: lastRoot, at: Date.now() } });
    void get().refreshConversations();
    return;
  }
  if (op.type === 'note') {
    const node = await apiSetNote(op.id, op.note);
    set((state) => ({
      nodes: state.nodes[node.id] ? { ...state.nodes, [node.id]: node } : state.nodes,
      editingNoteId: null,
    }));
    return;
  }
  if (op.type === 'sticker') {
    const node = await apiSetSticker(op.id, op.sticker && isStickerId(op.sticker) ? op.sticker : null);
    set((state) => ({ nodes: state.nodes[node.id] ? { ...state.nodes, [node.id]: node } : state.nodes, menu: null }));
    return;
  }
  if (op.type === 'link') {
    if (op.present) {
      const created = await apiCreateLink(activeId, op.sourceId, op.targetId);
      set((state) => ({
        links: state.links.some((link) => link.id === created.link.id) ? state.links : [...state.links, created.link],
      }));
      return;
    }
    const current = get().links.find((link) => link.sourceId === op.sourceId && link.targetId === op.targetId);
    if (!current) return;
    await apiDeleteLink(current.id);
    set({ links: get().links.filter((link) => link.id !== current.id) });
    return;
  }
  const snapshot = get().nodes;
  set({ nodes: withCollapsed(snapshot, op.changes), menu: null });
  try {
    if (op.changes.length === 1) await setCollapsed(op.changes[0]!.id, op.changes[0]!.collapsed);
    else if (op.changes.length > 0) await setCollapsedMany(activeId, op.changes);
  } catch (error) {
    set({ nodes: snapshot });
    throw error;
  }
}
