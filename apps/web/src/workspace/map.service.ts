import { Service } from '@rabjs/react';
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
  outdentTarget,
  resolveParentId,
  setAllCollapsed,
  siblingIndex,
  subtreeIds,
  withSiblingPositions,
  type Direction,
  type OutlineItem,
  type StickerId,
} from '@tributary/domain';
import {
  cancelNode as apiCancelNode,
  copyNode as apiCopyNode,
  createLink as apiCreateLink,
  createNode,
  deleteLink as apiDeleteLink,
  deleteNode as apiDeleteNode,
  insertOutline as apiInsertOutline,
  moveNode as apiMoveNode,
  regenerateNode as apiRegenerateNode,
  renameNode as apiRenameNode,
  restoreNodes as apiRestoreNodes,
  setCollapsed,
  setCollapsedMany,
  setNote as apiSetNote,
  setSticker as apiSetSticker,
  type ConversationNode,
  type NodeLink,
} from '../api/client.js';
import { CanvasPrefsService } from '../services/canvas-prefs.service.js';
import type { HistoryEntry, MapOp } from './history.js';
import { pushHistory } from './history.js';
import {
  DEFAULT_NODE_HEIGHT,
  errorMessage,
  forestGroups,
  mergeServer,
  nodeList,
  pack,
  slideIds,
  splitModelChoice,
  toTree,
  visibleTreeOf,
  withCollapsed,
  type CanvasMenuState,
  type ConfirmRequest,
  type DragState,
  type DraftNode,
} from './map-model.js';
import { ConversationService } from './conversation.service.js';
import { ModelCatalogService } from './model-catalog.service.js';
import { SearchService } from './search.service.js';
import { StreamService } from './stream.service.js';

/** 当前打开的这张图：选择、草稿、撤销、菜单、查找、演示。 */
export class MapService extends Service {
  nodes: Record<string, ConversationNode> = {};
  nodeOrder: string[] = [];
  selectedId: string | null = null;
  selectionEpoch = 0;
  expandedReplies: Record<string, boolean> = {};
  drafts: DraftNode[] = [];
  heights: Record<string, number> = {};
  focusRequest: { id: string; at: number } | null = null;
  focusId: string | null = null;
  outlineOpen = false;
  findOpen = false;
  findQuery = '';
  findCursor = 0;
  findCurrentId: string | null = null;
  editingId: string | null = null;
  editingNoteId: string | null = null;
  links: NodeLink[] = [];
  linkFrom: string | null = null;
  presentId: string | null = null;
  drag: DragState | null = null;
  undoStack: HistoryEntry[] = [];
  redoStack: HistoryEntry[] = [];
  menu: CanvasMenuState | null = null;
  helpOpen = false;
  confirm: ConfirmRequest | null = null;
  notice = '';

  get conversation(): ConversationService {
    return this.resolve(ConversationService);
  }

  get catalog(): ModelCatalogService {
    return this.resolve(ModelCatalogService);
  }

  get search(): SearchService {
    return this.resolve(SearchService);
  }

  get streams(): StreamService {
    return this.resolve(StreamService);
  }

  get canvasPrefs(): CanvasPrefsService {
    return this.resolve(CanvasPrefsService);
  }

  showConversation(list: ConversationNode[], links: NodeLink[], picked: string | null, keepHistory: boolean): void {
    this.closeLeavingStreams(new Set(list.map((node) => node.id)));
    const tree = list.map(toTree);
    const expanded = picked ? expandAncestors(tree, picked) : tree;
    const changes = collapsedChanges(tree, expanded);
    const collapsedOf = new Map(expanded.map((node) => [node.id, node.collapsed]));
    const nodes: Record<string, ConversationNode> = {};
    for (const node of list) nodes[node.id] = { ...node, collapsed: collapsedOf.get(node.id) ?? node.collapsed };
    this.nodes = nodes;
    this.nodeOrder = list.map((node) => node.id);
    this.drafts = [];
    this.menu = null;
    this.selectedId = picked;
    this.focusRequest = picked ? { id: picked, at: Date.now() } : null;
    this.focusId = null;
    this.editingId = null;
    this.editingNoteId = null;
    this.links = links;
    this.linkFrom = null;
    this.presentId = null;
    this.drag = null;
    if (!keepHistory) {
      this.undoStack = [];
      this.redoStack = [];
    }
    const activeId = this.conversation.activeId;
    if (changes.length > 0 && activeId) void setCollapsedMany(activeId, changes).catch(() => undefined);
  }

  clearCanvas(): void {
    this.closeLeavingStreams(new Set());
    this.nodes = {};
    this.nodeOrder = [];
    this.selectedId = null;
    this.drafts = [];
    this.focusId = null;
    this.editingId = null;
    this.editingNoteId = null;
    this.links = [];
    this.linkFrom = null;
    this.presentId = null;
    this.drag = null;
    this.undoStack = [];
    this.redoStack = [];
  }

  select(id: string | null): void {
    this.selectedId = id;
    this.selectionEpoch += 1;
    this.menu = null;
  }

  clickNode(id: string): void {
    if (this.linkFrom) {
      void this.finishLink(id);
      return;
    }
    this.selectedId = id;
    this.selectionEpoch += 1;
    this.menu = null;
    this.toggleReply(id);
  }

  navigateSelection(direction: Direction): void {
    const draftIds = new Set(this.drafts.map((draft) => draft.tempId));
    const tree = visibleTreeOf(this).filter((node) => !draftIds.has(node.id));
    const layout = this.canvasPrefs.settings.layout;
    const points = layoutTree(tree, {
      heightOf: (id) => this.heights[id] ?? DEFAULT_NODE_HEIGHT,
      direction: layout,
    });
    const next = navigate(points, tree, this.selectedId, direction, layout);
    if (next) {
      this.selectedId = next;
      this.selectionEpoch += 1;
      this.focusRequest = { id: next, at: Date.now() };
    }
  }

  toggleReply(id: string): void {
    this.expandedReplies = { ...this.expandedReplies, [id]: !this.expandedReplies[id] };
  }

  async toggleCollapse(id: string): Promise<void> {
    const current = this.nodes[id];
    if (!current) return;
    await this.applyCollapse([{ id, collapsed: !current.collapsed }]);
  }

  async collapseScope(mode: 'all' | 'none' | number): Promise<void> {
    const list = nodeList(this);
    const scope = this.focusId;
    const next = mode === 'all' ? setAllCollapsed(list, true, scope) : mode === 'none' ? setAllCollapsed(list, false, scope) : collapseToLevel(list, mode, scope);
    await this.applyCollapse(collapsedChanges(list, next));
  }

  async revealNode(id: string): Promise<void> {
    if (!this.nodes[id]) return;
    const list = nodeList(this);
    const changes = collapsedChanges(list, expandAncestors(list, id));
    const focusId = this.focusId && subtreeIds(list, this.focusId).includes(id) ? this.focusId : null;
    if (changes.length > 0 && this.conversation.activeId) {
      this.nodes = withCollapsed(this.nodes, changes);
      this.menu = null;
      this.focusId = focusId;
      void setCollapsedMany(this.conversation.activeId, changes).catch(() => undefined);
    }
    this.selectedId = id;
    this.selectionEpoch += 1;
    this.menu = null;
    this.focusId = focusId;
    this.focusRequest = { id, at: Date.now() };
  }

  toggleFocus(): void {
    const focusId = this.focusId;
    const selectedId = this.selectedId;
    if (focusId) {
      this.focusId = null;
      void this.revealNode(focusId);
      return;
    }
    if (!selectedId || !this.nodes[selectedId]) return;
    this.focusId = selectedId;
    this.focusRequest = { id: selectedId, at: Date.now() };
    this.menu = null;
  }

  focusBranch(id: string): void {
    const node = this.nodes[id];
    if (!node) return;
    this.focusId = id;
    this.selectedId = id;
    this.focusRequest = { id, at: Date.now() };
    this.menu = null;
    if (node.collapsed && this.nodes[id]) {
      this.nodes = { ...this.nodes, [id]: { ...this.nodes[id]!, collapsed: false } };
      void setCollapsed(id, false);
    }
  }

  async renameQuestion(id: string, question: string): Promise<void> {
    const text = question.trim();
    const current = this.nodes[id];
    if (!current) return;
    if (!text || text === current.question) {
      this.editingId = null;
      return;
    }
    const previous = current.question;
    this.nodes = { ...this.nodes, [id]: { ...current, question: text } };
    this.editingId = null;
    try {
      await apiRenameNode(id, text);
      this.record({ undo: { type: 'rename', id, question: previous }, redo: { type: 'rename', id, question: text } });
      void this.conversation.refresh();
    } catch (error) {
      if (this.nodes[id]) this.nodes = { ...this.nodes, [id]: { ...this.nodes[id]!, question: previous } };
      this.notice = errorMessage(error, '修改失败');
    }
  }

  async moveNodeTo(id: string, parentId: string | null, index: number): Promise<void> {
    const list = nodeList(this);
    const current = list.find((node) => node.id === id);
    if (!current || isSamePlace(list, id, parentId, index)) return;
    const oldIndex = siblingIndex(list, id);
    const snapshot = pack(list);
    try {
      const next = withSiblingPositions(rearrangeNode(list, id, parentId, index));
      const moved = pack(next);
      this.nodes = moved.nodes;
      this.nodeOrder = moved.nodeOrder;
      this.menu = null;
      this.drag = null;
      const body = await apiMoveNode(id, parentId, index);
      const merged = mergeServer(this.nodes, body.nodes);
      this.nodes = merged.nodes;
      this.nodeOrder = merged.nodeOrder;
      this.record({
        undo: { type: 'move', id, parentId: current.parentId, index: oldIndex },
        redo: { type: 'move', id, parentId, index },
      });
    } catch (error) {
      this.nodes = snapshot.nodes;
      this.nodeOrder = snapshot.nodeOrder;
      this.drag = null;
      this.notice = errorMessage(error, '移动失败');
    }
  }

  async reorderSelected(delta: number): Promise<void> {
    const id = this.selectedId;
    if (!id) return;
    const list = nodeList(this);
    const current = list.find((node) => node.id === id);
    if (!current) return;
    await this.moveNodeTo(id, current.parentId, siblingIndex(list, id) + delta);
  }

  async relevelSelected(direction: 'indent' | 'outdent'): Promise<void> {
    const id = this.selectedId;
    if (!id) return;
    const list = nodeList(this);
    const target = direction === 'indent' ? indentTarget(list, id) : outdentTarget(list, id);
    if (!target) {
      this.notice = direction === 'indent' ? '没有上一个同级，没法再缩进' : '已经是最上层';
      return;
    }
    await this.moveNodeTo(id, target.parentId, target.index);
    const moved = this.nodes[id];
    if (!moved || moved.parentId !== target.parentId) return;
    if (direction === 'indent' && target.parentId) {
      const parent = this.nodes[target.parentId];
      if (parent?.collapsed) {
        this.nodes = { ...this.nodes, [parent.id]: { ...parent, collapsed: false } };
        void setCollapsed(parent.id, false);
      }
    }
    const focusId = this.focusId;
    if (focusId && !subtreeIds(nodeList(this), focusId).includes(id)) {
      this.focusId = null;
      void this.revealNode(id);
    }
  }

  async copyBranch(id: string): Promise<void> {
    const before = new Set(this.nodeOrder);
    try {
      const body = await apiCopyNode(id);
      const merged = mergeServer(this.nodes, body.nodes);
      this.nodes = merged.nodes;
      this.nodeOrder = merged.nodeOrder;
      this.selectedId = body.rootId;
      this.focusRequest = { id: body.rootId, at: Date.now() };
      this.menu = null;
      const created = body.nodes.filter((node) => !before.has(node.id));
      this.record({ undo: { type: 'remove', id: body.rootId }, redo: { type: 'restore', nodes: created } });
      void this.conversation.refresh();
    } catch (error) {
      this.notice = errorMessage(error, '复制失败');
    }
  }

  async copyPlainText(text: string): Promise<void> {
    const value = text.trim();
    if (!value) {
      this.notice = '没有可复制的文字';
      return;
    }
    try {
      await navigator.clipboard.writeText(value);
      this.notice = '已复制';
    } catch {
      this.notice = '复制失败';
    }
  }

  async answerWithAnotherModel(id: string, providerId: string, model: string): Promise<void> {
    const previous = this.selectedId;
    await this.copyBranch(id);
    const rootId = this.selectedId;
    if (!rootId || rootId === previous) return;
    await this.regenerateNode(rootId, { providerId, model });
  }

  async pasteOutline(items: OutlineItem[]): Promise<void> {
    const activeId = this.conversation.activeId;
    if (!activeId) {
      this.notice = '先新建一个对话';
      return;
    }
    if (items.length === 0) return;
    const parentId = this.selectedId ?? this.focusId;
    try {
      const body = await apiInsertOutline(activeId, parentId, items);
      const groups = forestGroups(body.created);
      const firstId = body.created[0]?.id ?? null;
      const merged = mergeServer(this.nodes, body.nodes);
      this.nodes = merged.nodes;
      this.nodeOrder = merged.nodeOrder;
      this.selectedId = firstId;
      if (firstId) this.focusRequest = { id: firstId, at: Date.now() };
      this.menu = null;
      if (parentId && this.nodes[parentId]?.collapsed) {
        const parent = this.nodes[parentId];
        if (parent) {
          this.nodes = { ...this.nodes, [parentId]: { ...parent, collapsed: false } };
          void setCollapsed(parentId, false);
        }
      }
      if (firstId) void this.revealNode(firstId);
      if (groups.length > 0) {
        this.record({
          undo: { type: 'removeMany', ids: groups.map((group) => group[0]!.id) },
          redo: { type: 'restoreMany', groups },
        });
      }
      this.notice = `已放入 ${String(body.created.length)} 个问题，还没有向模型提问`;
      void this.conversation.refresh();
    } catch (error) {
      this.notice = errorMessage(error, '放入失败');
    }
  }

  async askNode(id: string): Promise<void> {
    const choice = splitModelChoice(this.catalog.modelChoice);
    if (!choice.providerId || !choice.model) {
      this.notice = '先选择模型';
      return;
    }
    await this.regenerateNode(id, { providerId: choice.providerId, model: choice.model });
  }

  openFind(): void {
    const selected = window.getSelection()?.toString().replace(/\s+/g, ' ').trim() ?? '';
    const query = selected.length > 0 && selected.length <= 80 ? selected : this.findQuery;
    this.findOpen = true;
    this.findQuery = query;
    this.findCursor = 0;
    this.menu = null;
    this.helpOpen = false;
    window.setTimeout(() => document.getElementById('map-find-input')?.focus(), 0);
  }

  setFindQuery(query: string): void {
    this.findQuery = query;
    this.findCursor = 0;
    this.findOpen = true;
  }

  stepFind(delta: number): void {
    const hits = findInTree(nodeList(this).map(toTree), this.findQuery);
    if (hits.length === 0) {
      this.notice = '没有匹配';
      this.findCurrentId = null;
      return;
    }
    this.findOpen = true;
    this.findCursor = (this.findCursor + delta + hits.length) % hits.length;
  }

  closeFind(): void {
    this.findOpen = false;
    this.findCurrentId = null;
  }

  /** 查找条把当前命中写回地图，命中在回答里时展开那一张卡片。 */
  syncFindHit(id: string | null, expandReply: boolean): void {
    this.findCurrentId = id;
    if (id && expandReply) this.expandedReplies = { ...this.expandedReplies, [id]: true };
  }

  async stopNode(id: string): Promise<void> {
    const current = this.nodes[id];
    if (!current || current.status !== 'pending') return;
    const seen = (this.streams.streaming[id] ?? current.reply ?? '').trim();
    try {
      const node = await apiCancelNode(id, seen || undefined);
      this.streams.clearNode(id);
      this.nodes = { ...this.nodes, [id]: node };
      this.notice = node.status === 'error' ? '已停止' : '已停止，留下了已经写出的回答';
    } catch (error) {
      this.notice = errorMessage(error, '停止失败');
    }
  }

  async answerAgain(id: string): Promise<void> {
    const node = this.nodes[id];
    if (!node) return;
    if (node.providerId && node.model) {
      await this.answerWithAnotherModel(id, node.providerId, node.model);
      return;
    }
    const choice = splitModelChoice(this.catalog.modelChoice);
    if (!choice.providerId || !choice.model) {
      this.notice = '先选择模型';
      return;
    }
    await this.answerWithAnotherModel(id, choice.providerId, choice.model);
  }

  async saveNote(id: string, note: string): Promise<void> {
    const current = this.nodes[id];
    if (!current) return;
    const next = note.trim() ? note.trim() : null;
    const previous = current.note ?? null;
    if ((previous ?? null) === next) {
      this.editingNoteId = null;
      return;
    }
    this.nodes = { ...this.nodes, [id]: { ...current, note: next } };
    this.editingNoteId = null;
    try {
      const node = await apiSetNote(id, next);
      if (this.nodes[node.id]) this.nodes = { ...this.nodes, [node.id]: node };
      this.record({ undo: { type: 'note', id, note: previous }, redo: { type: 'note', id, note: next } });
    } catch (error) {
      if (this.nodes[id]) this.nodes = { ...this.nodes, [id]: { ...this.nodes[id]!, note: previous } };
      this.notice = errorMessage(error, '笔记没能保存');
    }
  }

  setEditingNote(id: string | null): void {
    this.editingNoteId = id;
    this.menu = null;
    this.editingId = null;
  }

  async chooseSticker(id: string, sticker: StickerId | null): Promise<void> {
    const current = this.nodes[id];
    if (!current) return;
    const next = current.sticker === sticker ? null : sticker;
    const previous = current.sticker ?? null;
    this.nodes = { ...this.nodes, [id]: { ...current, sticker: next } };
    this.menu = null;
    try {
      const node = await apiSetSticker(id, next);
      if (this.nodes[node.id]) this.nodes = { ...this.nodes, [node.id]: node };
      this.record({ undo: { type: 'sticker', id, sticker: previous }, redo: { type: 'sticker', id, sticker: next } });
    } catch (error) {
      if (this.nodes[id]) this.nodes = { ...this.nodes, [id]: { ...this.nodes[id]!, sticker: previous } };
      this.notice = errorMessage(error, '贴纸没能保存');
    }
  }

  startLink(id: string): void {
    if (!this.nodes[id]) return;
    this.linkFrom = id;
    this.menu = null;
    this.notice = '点另一个节点，连一条关系线';
  }

  cancelLink(): void {
    this.linkFrom = null;
    this.notice = '';
  }

  async finishLink(targetId: string): Promise<void> {
    const sourceId = this.linkFrom;
    const activeId = this.conversation.activeId;
    if (!sourceId || !activeId) return;
    if (sourceId === targetId) {
      this.notice = '不能连到自己';
      return;
    }
    try {
      const body = await apiCreateLink(activeId, sourceId, targetId);
      if (!this.links.some((link) => link.id === body.link.id)) this.links = [...this.links, body.link];
      this.linkFrom = null;
      this.selectedId = targetId;
      this.selectionEpoch += 1;
      this.menu = null;
      this.notice = body.created ? '已连上' : '已经连过了';
      if (body.created) {
        this.record({
          undo: { type: 'link', sourceId, targetId, present: false },
          redo: { type: 'link', sourceId, targetId, present: true },
        });
      }
    } catch (error) {
      this.notice = errorMessage(error, '没能连上');
    }
  }

  async removeLink(id: string): Promise<void> {
    const link = this.links.find((item) => item.id === id);
    if (!link) return;
    this.links = this.links.filter((item) => item.id !== id);
    this.menu = null;
    try {
      await apiDeleteLink(id);
      this.record({
        undo: { type: 'link', sourceId: link.sourceId, targetId: link.targetId, present: true },
        redo: { type: 'link', sourceId: link.sourceId, targetId: link.targetId, present: false },
      });
    } catch (error) {
      if (!this.links.some((item) => item.id === id)) this.links = [...this.links, link];
      this.notice = errorMessage(error, '没能断开');
    }
  }

  openPresent(id?: string | null): void {
    const order = slideIds(this);
    const start = id && order.includes(id) ? id : order[0];
    if (!start) {
      this.notice = '还没有可以演示的节点';
      return;
    }
    this.presentId = start;
    this.menu = null;
    this.linkFrom = null;
  }

  closePresent(): void {
    this.presentId = null;
  }

  stepPresent(delta: number): void {
    const order = slideIds(this);
    if (order.length === 0) {
      this.presentId = null;
      return;
    }
    const at = Math.max(0, order.indexOf(this.presentId ?? ''));
    const next = order[Math.max(0, Math.min(order.length - 1, at + delta))];
    if (next) this.presentId = next;
  }

  async undo(): Promise<void> {
    const entry = this.undoStack.at(-1);
    if (!entry) return;
    this.undoStack = this.undoStack.slice(0, -1);
    try {
      await this.runOp(entry.undo);
      this.redoStack = [...this.redoStack, entry];
    } catch (error) {
      this.undoStack = [...this.undoStack, entry];
      this.notice = errorMessage(error, '撤回失败');
      const activeId = this.conversation.activeId;
      if (activeId) await this.conversation.open(activeId, this.selectedId, true);
    }
  }

  async redo(): Promise<void> {
    const entry = this.redoStack.at(-1);
    if (!entry) return;
    this.redoStack = this.redoStack.slice(0, -1);
    try {
      await this.runOp(entry.redo);
      this.undoStack = pushHistory(this.undoStack, entry);
    } catch (error) {
      this.redoStack = [...this.redoStack, entry];
      this.notice = errorMessage(error, '重做失败');
      const activeId = this.conversation.activeId;
      if (activeId) await this.conversation.open(activeId, this.selectedId, true);
    }
  }

  setDrag(drag: DragState | null): void {
    this.drag = drag;
  }

  setEditing(id: string | null): void {
    this.editingId = id;
    this.menu = null;
  }

  setOutlineOpen(open: boolean): void {
    this.outlineOpen = open;
  }

  openDraft(relation: 'root' | 'child' | 'sibling', anchorId?: string, seed = ''): void {
    if (!this.conversation.activeId) {
      this.notice = '先新建一个对话';
      return;
    }
    if (this.drafts.length > 0) {
      if (seed) this.notice = '先完成或取消当前问题';
      return;
    }
    const anchor = anchorId ?? this.selectedId;
    const tree = nodeList(this).map(toTree);
    const effective = relation !== 'root' && anchor ? relation : 'root';
    const parentId = resolveParentId(tree, effective, anchor);
    const tempId = `draft-${crypto.randomUUID()}`;
    this.drafts = [{ tempId, parentId, relation: effective, anchorId: effective === 'root' ? null : anchor, seed }];
    this.menu = null;
    this.selectedId = anchor;
    this.selectionEpoch += 1;
    this.focusRequest = { id: tempId, at: Date.now() };
  }

  async commitDraft(tempId: string, text: string): Promise<void> {
    const draft = this.drafts.find((item) => item.tempId === tempId);
    const activeId = this.conversation.activeId;
    if (!draft || !activeId) return;
    const question = text.trim();
    if (!question) return;
    this.drafts = [];
    const choice = splitModelChoice(this.catalog.modelChoice);
    try {
      const node = await createNode({
        conversationId: activeId,
        question,
        relation: draft.relation,
        selectedNodeId: draft.anchorId,
        providerId: choice.providerId,
        model: choice.model,
      });
      this.nodes = { ...this.nodes, [node.id]: node };
      this.nodeOrder = [...this.nodeOrder, node.id];
      this.selectedId = node.id;
      this.expandedReplies = { ...this.expandedReplies, [node.id]: true };
      this.focusRequest = { id: node.id, at: Date.now() };
      void this.conversation.refresh();
    } catch (error) {
      this.notice = errorMessage(error, '提问失败');
    }
  }

  cancelDraft(tempId: string): void {
    this.drafts = this.drafts.filter((draft) => draft.tempId !== tempId);
  }

  /** 摘掉草稿的上下文：从子/同级问题转为根问题 */
  detachDraft(tempId: string): void {
    this.drafts = this.drafts.map((draft) =>
      draft.tempId === tempId ? { ...draft, parentId: null, relation: 'root', anchorId: null } : draft,
    );
  }

  async submit(text: string): Promise<void> {
    const activeId = this.conversation.activeId;
    if (!activeId) {
      this.notice = '先新建一个对话';
      return;
    }
    const question = text.trim();
    if (!question) return;
    const relation = this.selectedId ? 'child' : 'root';
    const choice = splitModelChoice(this.catalog.modelChoice);
    try {
      const node = await createNode({
        conversationId: activeId,
        question,
        relation,
        selectedNodeId: this.selectedId,
        providerId: choice.providerId,
        model: choice.model,
      });
      this.nodes = { ...this.nodes, [node.id]: node };
      this.nodeOrder = [...this.nodeOrder, node.id];
      this.selectedId = node.id;
      this.expandedReplies = { ...this.expandedReplies, [node.id]: true };
      this.focusRequest = { id: node.id, at: Date.now() };
      void this.conversation.refresh();
    } catch (error) {
      this.notice = errorMessage(error, '提问失败');
    }
  }

  retryNode(id: string): void {
    const node = this.nodes[id];
    if (!node) return;
    this.streams.dropError(id);
    this.nodes = { ...this.nodes, [id]: { ...node, status: 'pending', reply: null } };
    this.expandedReplies = { ...this.expandedReplies, [id]: true };
  }

  /** 重新生成回答：服务端重置为 pending 并入队，SSE 自动接管 */
  async regenerateNode(id: string, override?: { providerId: string; model: string }): Promise<void> {
    try {
      const node = await apiRegenerateNode(id, override);
      this.streams.dropError(id);
      this.nodes = { ...this.nodes, [id]: node };
      this.expandedReplies = { ...this.expandedReplies, [id]: true };
      this.menu = null;
    } catch (error) {
      this.notice = errorMessage(error, '重新生成失败');
    }
  }

  /** 删除节点及其整棵子树：先弹应用内确认框，确认后本地移除，失败则重新加载对话 */
  removeNode(id: string): void {
    const node = this.nodes[id];
    if (!node) return;
    const childrenOf = new Map<string, string[]>();
    for (const nid of this.nodeOrder) {
      const parentId = this.nodes[nid]?.parentId;
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
    this.menu = null;
    this.confirm = {
      title: `删除「${question}」？`,
      detail: childCount > 0 ? `将同时删除其 ${String(childCount)} 个子分支。可按 ⌘Z 撤回。` : '可按 ⌘Z 撤回。',
      confirmLabel: '删除',
      danger: true,
      onConfirm: () => {
        const snapshots = nodeList(this).filter((item) => removed.has(item.id));
        const related = this.links
          .filter((link) => removed.has(link.sourceId) || removed.has(link.targetId))
          .map((link) => ({ sourceId: link.sourceId, targetId: link.targetId }));
        this.forgetNodes(removed, parentId);
        void apiDeleteNode(id)
          .then(() => {
            this.record({ undo: { type: 'restore', nodes: snapshots, links: related }, redo: { type: 'remove', id } });
            return this.conversation.refresh();
          })
          .catch(async (error: unknown) => {
            this.notice = errorMessage(error, '删除失败');
            const activeId = this.conversation.activeId;
            if (activeId) await this.conversation.open(activeId, null, true);
          });
      },
    };
  }

  finishStream(id: string, node: ConversationNode): void {
    if (!this.nodes[id] || !this.nodeOrder.includes(id)) return;
    this.nodes = { ...this.nodes, [id]: node };
    void this.conversation.refresh();
  }

  failStream(id: string, message: string): void {
    const node = this.nodes[id];
    if (!node) return;
    this.nodes = { ...this.nodes, [id]: { ...node, status: 'error', reply: message } };
  }

  reportHeight(id: string, height: number): void {
    const previous = this.heights[id];
    if (previous !== undefined && Math.abs(previous - height) < 2) return;
    this.heights = { ...this.heights, [id]: height };
  }

  setMenu(menu: CanvasMenuState | null): void {
    this.menu = menu;
  }

  setHelpOpen(open: boolean): void {
    this.helpOpen = open;
    if (open) this.search.searchOpen = false;
  }

  setConfirm(confirm: ConfirmRequest | null): void {
    this.confirm = confirm;
  }

  setNotice(notice: string): void {
    this.notice = notice;
  }

  private record(entry: HistoryEntry): void {
    this.undoStack = pushHistory(this.undoStack, entry);
    this.redoStack = [];
  }

  /** 先关掉不会留在下一张图上的流，再换节点。迟到的 done 不能把旧节点写进来。 */
  private closeLeavingStreams(keepIds: ReadonlySet<string>): void {
    const leaving = new Set<string>();
    for (const id of this.nodeOrder) {
      if (!keepIds.has(id)) leaving.add(id);
    }
    this.streams.forget(leaving);
  }

  private forgetNodes(removed: Set<string>, parentId: string | null): void {
    const nodes = { ...this.nodes };
    const heights = { ...this.heights };
    const expandedReplies = { ...this.expandedReplies };
    for (const nid of removed) {
      delete nodes[nid];
      delete heights[nid];
      delete expandedReplies[nid];
    }
    this.nodes = nodes;
    this.heights = heights;
    this.expandedReplies = expandedReplies;
    this.streams.forget(removed);
    this.nodeOrder = this.nodeOrder.filter((nid) => !removed.has(nid));
    this.drafts = this.drafts.filter((draft) => !draft.anchorId || !removed.has(draft.anchorId));
    this.selectedId = parentId && !removed.has(parentId) ? parentId : null;
    this.editingId = this.editingId && removed.has(this.editingId) ? null : this.editingId;
    this.focusId = this.focusId && removed.has(this.focusId) ? null : this.focusId;
    this.editingNoteId = this.editingNoteId && removed.has(this.editingNoteId) ? null : this.editingNoteId;
    this.links = this.links.filter((link) => !removed.has(link.sourceId) && !removed.has(link.targetId));
    this.linkFrom = this.linkFrom && removed.has(this.linkFrom) ? null : this.linkFrom;
    this.presentId = this.presentId && removed.has(this.presentId) ? null : this.presentId;
    this.menu = null;
  }

  private async applyCollapse(changes: { id: string; collapsed: boolean }[]): Promise<void> {
    if (changes.length === 0) return;
    const activeId = this.conversation.activeId;
    if (!activeId) return;
    const previous = changes.map((change) => ({ id: change.id, collapsed: !change.collapsed }));
    const snapshot = this.nodes;
    this.nodes = withCollapsed(snapshot, changes);
    this.menu = null;
    try {
      if (changes.length === 1) await setCollapsed(changes[0]!.id, changes[0]!.collapsed);
      else await setCollapsedMany(activeId, changes);
      this.record({ undo: { type: 'collapse', changes: previous }, redo: { type: 'collapse', changes } });
    } catch (error) {
      this.nodes = snapshot;
      this.notice = errorMessage(error, '折叠失败');
    }
  }

  private async runOp(op: MapOp): Promise<void> {
    const activeId = this.conversation.activeId;
    if (!activeId) throw new Error('没有打开的对话');
    if (op.type === 'rename') {
      const current = this.nodes[op.id];
      if (!current) throw new Error('节点不存在');
      this.nodes = { ...this.nodes, [op.id]: { ...current, question: op.question } };
      this.editingId = null;
      const node = await apiRenameNode(op.id, op.question);
      if (this.nodes[node.id]) this.nodes = { ...this.nodes, [node.id]: { ...this.nodes[node.id]!, ...node } };
      void this.conversation.refresh();
      return;
    }
    if (op.type === 'move') {
      const next = withSiblingPositions(rearrangeNode(nodeList(this), op.id, op.parentId, op.index));
      const moved = pack(next);
      this.nodes = moved.nodes;
      this.nodeOrder = moved.nodeOrder;
      this.menu = null;
      this.drag = null;
      const body = await apiMoveNode(op.id, op.parentId, op.index);
      const merged = mergeServer(this.nodes, body.nodes);
      this.nodes = merged.nodes;
      this.nodeOrder = merged.nodeOrder;
      return;
    }
    if (op.type === 'remove') {
      const ids = subtreeIds(nodeList(this), op.id);
      if (ids.length === 0) return;
      const parentId = this.nodes[op.id]?.parentId ?? null;
      this.forgetNodes(new Set(ids), parentId);
      await apiDeleteNode(op.id);
      void this.conversation.refresh();
      return;
    }
    if (op.type === 'removeMany') {
      for (const id of op.ids) {
        if (!this.nodes[id]) continue;
        const ids = subtreeIds(nodeList(this), id);
        const parentId = this.nodes[id]?.parentId ?? null;
        this.forgetNodes(new Set(ids), parentId);
        await apiDeleteNode(id);
      }
      void this.conversation.refresh();
      return;
    }
    if (op.type === 'restore') {
      const body = await apiRestoreNodes(activeId, op.nodes);
      const rootId = op.nodes[0]?.id ?? null;
      const merged = mergeServer(this.nodes, body.nodes);
      this.nodes = merged.nodes;
      this.nodeOrder = merged.nodeOrder;
      this.selectedId = rootId;
      if (rootId) this.focusRequest = { id: rootId, at: Date.now() };
      for (const link of op.links ?? []) {
        const created = await apiCreateLink(activeId, link.sourceId, link.targetId);
        if (!this.links.some((item) => item.id === created.link.id)) this.links = [...this.links, created.link];
      }
      void this.conversation.refresh();
      return;
    }
    if (op.type === 'restoreMany') {
      let lastRoot: string | null = null;
      for (const group of op.groups) {
        const body = await apiRestoreNodes(activeId, group);
        lastRoot = group[0]?.id ?? lastRoot;
        const merged = mergeServer(this.nodes, body.nodes);
        this.nodes = merged.nodes;
        this.nodeOrder = merged.nodeOrder;
      }
      if (lastRoot) {
        this.selectedId = lastRoot;
        this.focusRequest = { id: lastRoot, at: Date.now() };
      }
      void this.conversation.refresh();
      return;
    }
    if (op.type === 'note') {
      const node = await apiSetNote(op.id, op.note);
      if (this.nodes[node.id]) this.nodes = { ...this.nodes, [node.id]: node };
      this.editingNoteId = null;
      return;
    }
    if (op.type === 'sticker') {
      const node = await apiSetSticker(op.id, op.sticker && isStickerId(op.sticker) ? op.sticker : null);
      if (this.nodes[node.id]) this.nodes = { ...this.nodes, [node.id]: node };
      this.menu = null;
      return;
    }
    if (op.type === 'link') {
      if (op.present) {
        const created = await apiCreateLink(activeId, op.sourceId, op.targetId);
        if (!this.links.some((link) => link.id === created.link.id)) this.links = [...this.links, created.link];
        return;
      }
      const current = this.links.find((link) => link.sourceId === op.sourceId && link.targetId === op.targetId);
      if (!current) return;
      await apiDeleteLink(current.id);
      this.links = this.links.filter((link) => link.id !== current.id);
      return;
    }
    const snapshot = this.nodes;
    this.nodes = withCollapsed(snapshot, op.changes);
    this.menu = null;
    try {
      if (op.changes.length === 1) await setCollapsed(op.changes[0]!.id, op.changes[0]!.collapsed);
      else if (op.changes.length > 0) await setCollapsedMany(activeId, op.changes);
    } catch (error) {
      this.nodes = snapshot;
      throw error;
    }
  }
}
