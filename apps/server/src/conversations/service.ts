import { randomUUID } from 'node:crypto';
import { and, asc, desc, eq, inArray, sql } from 'drizzle-orm';
import {
  isSamePlace,
  isStickerId,
  linkOutline,
  moveNode,
  planCopy,
  resolveParentId,
  restoreOrder,
  siblingIndex,
  subtreeIds,
  withSiblingPositions,
  type NodeRelation,
  type StickerId,
} from '@tributary/domain';
import { db } from '../db/client.js';
import { conversations, jobs, links, nodes, usageCalls } from '../db/schema.js';
import { enqueueJob } from '../jobs/enqueue.js';
import { getModelForUser } from '../providers/service.js';
import { indexNode, removeNode } from '../search/index-nodes.js';

export interface NodeRecord {
  id: string;
  parentId: string | null;
  question: string;
  reply: string | null;
  status: string;
  providerId: string | null;
  model: string | null;
  collapsed: boolean;
  position: number;
  note: string | null;
  sticker: string | null;
}

export interface LinkRecord {
  id: string;
  sourceId: string;
  targetId: string;
}

export interface ConversationRecord {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
}

function toNode(row: typeof nodes.$inferSelect): NodeRecord {
  return {
    id: row.id,
    parentId: row.parentId,
    question: row.question,
    reply: row.reply,
    status: row.status,
    providerId: row.providerId,
    model: row.model,
    collapsed: row.collapsed,
    position: row.position,
    note: row.note,
    sticker: row.sticker,
  };
}

function toLink(row: typeof links.$inferSelect): LinkRecord {
  return { id: row.id, sourceId: row.sourceId, targetId: row.targetId };
}

function toConversation(row: typeof conversations.$inferSelect): ConversationRecord {
  return {
    id: row.id,
    title: row.title,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export async function listConversations(userId: string): Promise<ConversationRecord[]> {
  const rows = await db
    .select()
    .from(conversations)
    .where(eq(conversations.userId, userId))
    .orderBy(desc(conversations.updatedAt));
  return rows.map(toConversation);
}

export async function createConversation(userId: string, title?: string): Promise<ConversationRecord> {
  const id = randomUUID();
  const now = new Date();
  const [row] = await db
    .insert(conversations)
    .values({ id, userId, title: title?.trim() || '未命名对话', createdAt: now, updatedAt: now })
    .returning();
  if (!row) throw new Error('创建对话失败');
  return toConversation(row);
}

export async function loadConversation(
  id: string,
  userId: string,
): Promise<{ conversation: ConversationRecord; nodes: NodeRecord[]; links: LinkRecord[] } | null> {
  const [conversation] = await db
    .select()
    .from(conversations)
    .where(and(eq(conversations.id, id), eq(conversations.userId, userId)))
    .limit(1);
  if (!conversation) return null;
  const rows = await db.select().from(nodes).where(eq(nodes.conversationId, id)).orderBy(asc(nodes.position), asc(nodes.createdAt));
  const linkRows = await db.select().from(links).where(eq(links.conversationId, id)).orderBy(asc(links.createdAt));
  return { conversation: toConversation(conversation), nodes: rows.map(toNode), links: linkRows.map(toLink) };
}

export async function createQuestionNode(input: {
  userId: string;
  conversationId: string;
  question: string;
  relation: NodeRelation;
  selectedNodeId?: string | null;
  providerId?: string | null;
  model?: string | null;
}): Promise<NodeRecord> {
  const loaded = await loadConversation(input.conversationId, input.userId);
  if (!loaded) throw new Error('对话不存在');
  let providerId = input.providerId ?? null;
  let model = input.model ?? null;
  if (providerId) {
    const config = await getModelForUser(providerId, input.userId);
    if (!config) throw new Error('模型配置不存在');
    if (model && model !== config.model) throw new Error('模型与配置不一致');
    model = config.model;
  } else {
    providerId = null;
    model = null;
  }
  const tree = loaded.nodes.map((node) => ({
    id: node.id,
    parentId: node.parentId,
    question: node.question,
    reply: node.reply,
    collapsed: node.collapsed,
  }));
  const parentId = resolveParentId(tree, input.relation, input.selectedNodeId ?? null);
  const siblings = loaded.nodes.filter((node) => node.parentId === parentId);
  const id = randomUUID();
  const title = parentId === null && (loaded.conversation.title === '未命名对话' || loaded.nodes.length === 0) ? input.question.slice(0, 40) : undefined;
  const row = await db.transaction(async (tx) => {
    const [created] = await tx
      .insert(nodes)
      .values({
        id,
        conversationId: input.conversationId,
        parentId,
        question: input.question,
        reply: null,
        status: 'pending',
        providerId,
        model,
        collapsed: false,
        position: siblings.length,
      })
      .returning();
    if (!created) throw new Error('创建节点失败');
    await tx
      .update(conversations)
      .set({ updatedAt: new Date(), ...(title ? { title } : {}) })
      .where(eq(conversations.id, input.conversationId));
    if (providerId && model) {
      await enqueueJob(tx, { userId: input.userId, type: 'answer', payload: { nodeId: id } });
    }
    return created;
  });
  return toNode(row);
}

/**
 * 把大纲放进对话，只建问题，不入队回答。
 * parentId 为空时作为新的根；否则作为该节点的子节点。返回整棵对话和新建的节点。
 */
export async function insertOutlineNodes(
  conversationId: string,
  userId: string,
  parentId: string | null,
  items: readonly { question: string; depth: number }[],
): Promise<{ nodes: NodeRecord[]; created: NodeRecord[] } | null> {
  const loaded = await loadConversation(conversationId, userId);
  if (!loaded) return null;
  if (parentId !== null && !loaded.nodes.some((node) => node.id === parentId)) return null;
  const linked = linkOutline(items);
  if (linked.length === 0) return null;
  const ids = linked.map(() => randomUUID());
  const existing = new Map<string | null, number>();
  for (const node of loaded.nodes) existing.set(node.parentId, (existing.get(node.parentId) ?? 0) + 1);
  const used = new Map<string | null, number>();
  const created: NodeRecord[] = linked.map((item, index) => {
    const itemParent = item.parentIndex === null ? parentId : ids[item.parentIndex]!;
    const base = item.parentIndex === null ? (existing.get(itemParent) ?? 0) : 0;
    const position = base + (used.get(itemParent) ?? 0);
    used.set(itemParent, (used.get(itemParent) ?? 0) + 1);
    return {
      id: ids[index]!,
      parentId: itemParent,
      question: item.question,
      reply: null,
      status: 'done',
      providerId: null,
      model: null,
      collapsed: false,
      position,
      note: null,
      sticker: null,
    };
  });
  const title =
    parentId === null && (loaded.conversation.title === '未命名对话' || loaded.nodes.length === 0)
      ? created[0]?.question.slice(0, 40)
      : undefined;
  await db.transaction(async (tx) => {
    for (const node of created) {
      await tx.insert(nodes).values({
        id: node.id,
        conversationId,
        parentId: node.parentId,
        question: node.question,
        reply: null,
        status: 'done',
        providerId: null,
        model: null,
        collapsed: false,
        position: node.position,
      });
    }
    await tx
      .update(conversations)
      .set({ updatedAt: new Date(), ...(title ? { title } : {}) })
      .where(eq(conversations.id, conversationId));
  });
  for (const node of created) {
    await indexSafe(userId, { id: node.id, conversationId, question: node.question, reply: null });
  }
  const reloaded = await loadConversation(conversationId, userId);
  if (!reloaded) return null;
  return { nodes: reloaded.nodes, created };
}

export async function completeQuestionNode(
  nodeId: string,
  input: {
    reply: string;
    status: 'done' | 'error';
    providerName?: string;
    model?: string;
    promptTokens?: number;
    completionTokens?: number;
    totalTokens?: number;
  },
): Promise<NodeRecord> {
  const [row] = await db
    .update(nodes)
    .set({ reply: input.reply, status: input.status })
    .where(and(eq(nodes.id, nodeId), eq(nodes.status, 'pending')))
    .returning();
  if (!row) {
    const current = await getNode(nodeId);
    if (!current) throw new Error('节点不存在');
    return current;
  }
  if (input.status === 'done' && input.model) {
    await db.insert(usageCalls).values({
      id: randomUUID(),
      nodeId,
      providerName: input.providerName ?? '',
      model: input.model,
      promptTokens: input.promptTokens ?? 0,
      completionTokens: input.completionTokens ?? 0,
      totalTokens: input.totalTokens ?? 0,
    });
  }
  try {
    const [conversation] = await db.select().from(conversations).where(eq(conversations.id, row.conversationId)).limit(1);
    if (conversation?.userId) {
      await indexNode({
        id: row.id,
        conversationId: row.conversationId,
        userId: conversation.userId,
        question: row.question,
        reply: row.reply,
        note: row.note,
      });
    }
  } catch (error) {
    console.error('search.index_failed', error instanceof Error ? error.message : error);
  }
  return toNode(row);
}

export async function getNode(nodeId: string): Promise<NodeRecord | null> {
  const [row] = await db.select().from(nodes).where(eq(nodes.id, nodeId)).limit(1);
  return row ? toNode(row) : null;
}

/** 该节点所在对话的全部节点。回答时用它沿父链组装上下文。 */
export async function listConversationNodes(nodeId: string): Promise<NodeRecord[] | null> {
  const [row] = await db.select({ conversationId: nodes.conversationId }).from(nodes).where(eq(nodes.id, nodeId)).limit(1);
  if (!row) return null;
  const rows = await db
    .select()
    .from(nodes)
    .where(eq(nodes.conversationId, row.conversationId))
    .orderBy(asc(nodes.position), asc(nodes.createdAt));
  return rows.map(toNode);
}

export async function nodeOwnedBy(nodeId: string, userId: string): Promise<boolean> {
  const [row] = await db
    .select({ id: nodes.id })
    .from(nodes)
    .innerJoin(conversations, eq(nodes.conversationId, conversations.id))
    .where(and(eq(nodes.id, nodeId), eq(conversations.userId, userId)))
    .limit(1);
  return Boolean(row);
}

export async function writePendingReply(nodeId: string, reply: string | null): Promise<void> {
  await db.update(nodes).set({ reply }).where(and(eq(nodes.id, nodeId), eq(nodes.status, 'pending')));
}

export async function markPending(nodeId: string): Promise<NodeRecord | null> {
  const [row] = await db.update(nodes).set({ status: 'pending', reply: null }).where(eq(nodes.id, nodeId)).returning();
  return row ? toNode(row) : null;
}

/** 重新生成。传入模型时改用这个模型，并校验它属于当前用户。 */
export async function regenerateQuestionNode(
  nodeId: string,
  userId: string,
  override?: { providerId: string; model: string },
): Promise<NodeRecord | null> {
  if (!(await nodeOwnedBy(nodeId, userId))) return null;
  const patch: { status: 'pending'; reply: null; providerId?: string; model?: string } = { status: 'pending', reply: null };
  if (override) {
    const config = await getModelForUser(override.providerId, userId);
    if (!config) throw new Error('模型配置不存在');
    if (override.model !== config.model) throw new Error('模型与配置不一致');
    patch.providerId = override.providerId;
    patch.model = config.model;
  }
  const [row] = await db.update(nodes).set(patch).where(eq(nodes.id, nodeId)).returning();
  return row ? toNode(row) : null;
}

export async function setCollapsed(nodeId: string, userId: string, collapsed: boolean): Promise<NodeRecord | null> {
  if (!(await nodeOwnedBy(nodeId, userId))) return null;
  const [row] = await db.update(nodes).set({ collapsed }).where(eq(nodes.id, nodeId)).returning();
  return row ? toNode(row) : null;
}

export async function deleteConversation(id: string, userId: string): Promise<void> {
  await db.delete(conversations).where(and(eq(conversations.id, id), eq(conversations.userId, userId)));
}

/** 删除节点及其整棵子树，返回被删的节点 id 列表；无权限或不存在返回 null */
export async function deleteNodeSubtree(nodeId: string, userId: string): Promise<string[] | null> {
  if (!(await nodeOwnedBy(nodeId, userId))) return null;
  const [row] = await db.select().from(nodes).where(eq(nodes.id, nodeId)).limit(1);
  if (!row) return null;
  const siblings = await db.select({ id: nodes.id, parentId: nodes.parentId }).from(nodes).where(eq(nodes.conversationId, row.conversationId));
  const childrenOf = new Map<string, string[]>();
  for (const sibling of siblings) {
    if (!sibling.parentId) continue;
    const list = childrenOf.get(sibling.parentId) ?? [];
    list.push(sibling.id);
    childrenOf.set(sibling.parentId, list);
  }
  const ids: string[] = [];
  const queue = [nodeId];
  while (queue.length > 0) {
    const id = queue.pop()!;
    ids.push(id);
    queue.push(...(childrenOf.get(id) ?? []));
  }
  await db.delete(nodes).where(inArray(nodes.id, ids));
  await db.update(conversations).set({ updatedAt: new Date() }).where(eq(conversations.id, row.conversationId));
  for (const id of ids) {
    try {
      await removeNode(id);
    } catch (error) {
      console.error('search.remove_failed', error instanceof Error ? error.message : error);
    }
  }
  return ids;
}

async function indexSafe(
  userId: string,
  node: { id: string; conversationId: string; question: string; reply: string | null; note?: string | null },
): Promise<void> {
  try {
    await indexNode({
      id: node.id,
      conversationId: node.conversationId,
      userId,
      question: node.question,
      reply: node.reply,
      note: node.note,
    });
  } catch (error) {
    console.error('search.index_failed', error instanceof Error ? error.message : error);
  }
}

async function ownedConversation(nodeId: string, userId: string): Promise<{ conversationId: string } | null> {
  const [row] = await db
    .select({ conversationId: nodes.conversationId })
    .from(nodes)
    .innerJoin(conversations, eq(nodes.conversationId, conversations.id))
    .where(and(eq(nodes.id, nodeId), eq(conversations.userId, userId)))
    .limit(1);
  return row ?? null;
}

/** 改问题文字。根问题若仍用自动标题，标题跟着改。 */
export async function renameQuestion(nodeId: string, userId: string, question: string): Promise<NodeRecord | null> {
  const text = question.trim();
  if (!text) return null;
  const owned = await ownedConversation(nodeId, userId);
  if (!owned) return null;
  const [existing] = await db.select().from(nodes).where(eq(nodes.id, nodeId)).limit(1);
  if (!existing) return null;
  const [row] = await db.update(nodes).set({ question: text }).where(eq(nodes.id, nodeId)).returning();
  if (!row) return null;
  const [conversation] = await db.select().from(conversations).where(eq(conversations.id, owned.conversationId)).limit(1);
  const oldTitle = existing.question.trim().slice(0, 40);
  const retitle = existing.parentId === null && conversation && (conversation.title === oldTitle || conversation.title === '未命名对话');
  await db
    .update(conversations)
    .set({ updatedAt: new Date(), ...(retitle ? { title: text.slice(0, 40) } : {}) })
    .where(eq(conversations.id, owned.conversationId));
  await indexSafe(userId, { id: row.id, conversationId: owned.conversationId, question: text, reply: row.reply, note: row.note });
  return toNode(row);
}

/** 换父节点或调整兄弟顺序。返回这棵对话按新顺序排好的全部节点。 */
export async function moveQuestionNode(
  nodeId: string,
  userId: string,
  parentId: string | null,
  index: number,
): Promise<NodeRecord[] | null> {
  const owned = await ownedConversation(nodeId, userId);
  if (!owned) return null;
  const loaded = await loadConversation(owned.conversationId, userId);
  if (!loaded) return null;
  if (parentId !== null && !loaded.nodes.some((node) => node.id === parentId)) return null;
  if (isSamePlace(loaded.nodes, nodeId, parentId, index)) return loaded.nodes;
  let next: NodeRecord[];
  try {
    next = moveNode(loaded.nodes, nodeId, parentId, index);
  } catch {
    return null;
  }
  const positioned = withSiblingPositions(next);
  const previous = new Map(loaded.nodes.map((node) => [node.id, node]));
  await db.transaction(async (tx) => {
    for (const node of positioned) {
      const old = previous.get(node.id);
      if (!old || (old.parentId === node.parentId && old.position === node.position)) continue;
      await tx.update(nodes).set({ parentId: node.parentId, position: node.position }).where(eq(nodes.id, node.id));
    }
    await tx.update(conversations).set({ updatedAt: new Date() }).where(eq(conversations.id, owned.conversationId));
  });
  return positioned;
}

export interface RestoreInput {
  id: string;
  parentId: string | null;
  question: string;
  reply: string | null;
  status: string;
  providerId: string | null;
  model: string | null;
  collapsed: boolean;
  position: number;
  note?: string | null;
  sticker?: string | null;
}

/** 把删掉的一枝按原 id 插回去，不重新请求模型。 */
export async function restoreQuestionSubtree(
  conversationId: string,
  userId: string,
  snapshots: readonly RestoreInput[],
): Promise<NodeRecord[] | null> {
  const loaded = await loadConversation(conversationId, userId);
  if (!loaded || snapshots.length === 0) return null;
  let ordered: RestoreInput[];
  try {
    ordered = restoreOrder(loaded.nodes, snapshots);
  } catch {
    return null;
  }
  const root = ordered[0]!;
  const prepared = [];
  for (const snap of ordered) {
    let providerId = snap.providerId;
    let model = snap.model;
    if (providerId) {
      const config = await getModelForUser(providerId, userId);
      if (!config) {
        providerId = null;
        model = null;
      } else {
        model = config.model;
      }
    }
    prepared.push({ ...snap, providerId, model, status: snap.status === 'pending' || snap.status === 'error' ? snap.status : 'done' });
  }
  const restored: NodeRecord[] = prepared.map((snap) => ({
    id: snap.id,
    parentId: snap.parentId,
    question: snap.question,
    reply: snap.reply,
    status: snap.status,
    providerId: snap.providerId,
    model: snap.model,
    collapsed: snap.collapsed,
    position: snap.position,
    note: snap.note ?? null,
    sticker: snap.sticker && isStickerId(snap.sticker) ? snap.sticker : null,
  }));
  const combined = moveNode([...loaded.nodes, ...restored], root.id, root.parentId, root.position);
  const positioned = withSiblingPositions(combined);
  const restoredIds = new Set(restored.map((node) => node.id));
  const previous = new Map(loaded.nodes.map((node) => [node.id, node]));
  await db.transaction(async (tx) => {
    for (const node of positioned) {
      if (!restoredIds.has(node.id)) continue;
      await tx.insert(nodes).values({
        id: node.id,
        conversationId,
        parentId: node.parentId,
        question: node.question,
        reply: node.reply,
        status: node.status,
        providerId: node.providerId,
        model: node.model,
        collapsed: node.collapsed,
        position: node.position,
        note: node.note,
        sticker: node.sticker,
      });
      if (node.status === 'pending' && node.providerId && node.model) {
        await enqueueJob(tx, { userId, type: 'answer', payload: { nodeId: node.id } });
      }
    }
    for (const node of positioned) {
      if (restoredIds.has(node.id)) continue;
      const old = previous.get(node.id);
      if (!old || (old.parentId === node.parentId && old.position === node.position)) continue;
      await tx.update(nodes).set({ parentId: node.parentId, position: node.position }).where(eq(nodes.id, node.id));
    }
    await tx.update(conversations).set({ updatedAt: new Date() }).where(eq(conversations.id, conversationId));
  });
  for (const node of positioned) {
    if (!restoredIds.has(node.id)) continue;
    await indexSafe(userId, { id: node.id, conversationId, question: node.question, reply: node.reply, note: node.note });
  }
  return positioned;
}

/** 复制一枝（问题和已有回答），插在原节点后面，不重新请求模型。 */
export async function copyQuestionSubtree(nodeId: string, userId: string): Promise<{ nodes: NodeRecord[]; rootId: string } | null> {
  const owned = await ownedConversation(nodeId, userId);
  if (!owned) return null;
  const loaded = await loadConversation(owned.conversationId, userId);
  if (!loaded) return null;
  const sourceIds = subtreeIds(loaded.nodes, nodeId);
  if (sourceIds.length === 0) return null;
  const plan = planCopy(loaded.nodes, nodeId, sourceIds.map(() => randomUUID()));
  const byId = new Map(loaded.nodes.map((node) => [node.id, node]));
  const copies: NodeRecord[] = [];
  for (const link of plan) {
    const source = byId.get(link.sourceId);
    if (!source) return null;
    let providerId = source.providerId;
    let model = source.model;
    if (providerId) {
      const config = await getModelForUser(providerId, userId);
      if (!config) {
        providerId = null;
        model = null;
      } else {
        model = config.model;
      }
    }
    copies.push({
      id: link.id,
      parentId: link.parentId,
      question: source.question,
      reply: source.reply,
      status: source.status === 'pending' ? 'done' : source.status,
      providerId,
      model,
      collapsed: source.collapsed,
      position: 0,
      note: source.note,
      sticker: source.sticker,
    });
  }
  const rootId = plan[0]!.id;
  const combined = moveNode([...loaded.nodes, ...copies], rootId, plan[0]!.parentId, siblingIndex(loaded.nodes, nodeId) + 1);
  const positioned = withSiblingPositions(combined);
  const copyIds = new Set(copies.map((node) => node.id));
  const previous = new Map(loaded.nodes.map((node) => [node.id, node]));
  await db.transaction(async (tx) => {
    for (const node of positioned) {
      if (!copyIds.has(node.id)) continue;
      await tx.insert(nodes).values({
        id: node.id,
        conversationId: owned.conversationId,
        parentId: node.parentId,
        question: node.question,
        reply: node.reply,
        status: node.status,
        providerId: node.providerId,
        model: node.model,
        collapsed: node.collapsed,
        position: node.position,
        note: node.note,
        sticker: node.sticker,
      });
    }
    for (const node of positioned) {
      if (copyIds.has(node.id)) continue;
      const old = previous.get(node.id);
      if (!old || (old.parentId === node.parentId && old.position === node.position)) continue;
      await tx.update(nodes).set({ parentId: node.parentId, position: node.position }).where(eq(nodes.id, node.id));
    }
    await tx.update(conversations).set({ updatedAt: new Date() }).where(eq(conversations.id, owned.conversationId));
  });
  for (const node of positioned) {
    if (!copyIds.has(node.id)) continue;
    await indexSafe(userId, { id: node.id, conversationId: owned.conversationId, question: node.question, reply: node.reply, note: node.note });
  }
  return { nodes: positioned, rootId };
}

export async function setCollapsedMany(
  conversationId: string,
  userId: string,
  changes: readonly { id: string; collapsed: boolean }[],
): Promise<NodeRecord[] | null> {
  const loaded = await loadConversation(conversationId, userId);
  if (!loaded) return null;
  const known = new Set(loaded.nodes.map((node) => node.id));
  if (changes.some((change) => !known.has(change.id))) return null;
  const next = new Map(changes.map((change) => [change.id, change.collapsed]));
  await db.transaction(async (tx) => {
    for (const change of changes) {
      const current = loaded.nodes.find((node) => node.id === change.id);
      if (!current || current.collapsed === change.collapsed) continue;
      await tx.update(nodes).set({ collapsed: change.collapsed }).where(eq(nodes.id, change.id));
    }
    await tx.update(conversations).set({ updatedAt: new Date() }).where(eq(conversations.id, conversationId));
  });
  return loaded.nodes.map((node) => (next.has(node.id) ? { ...node, collapsed: next.get(node.id)! } : node));
}

/** 停掉正在生成的回答。已经写出的文字留下，还一个字都没有就记成已停止。 */
export async function cancelQuestionNode(nodeId: string, userId: string, clientReply?: string): Promise<NodeRecord | null> {
  if (!(await nodeOwnedBy(nodeId, userId))) return null;
  const node = await getNode(nodeId);
  if (!node) return null;
  if (node.status !== 'pending') return node;
  const now = new Date();
  await db
    .update(jobs)
    .set({ status: 'failed', lastError: '已停止', finishedAt: now, updatedAt: now })
    .where(
      and(eq(jobs.type, 'answer'), inArray(jobs.status, ['pending', 'running']), sql`(${jobs.payload}->>'nodeId') = ${nodeId}`),
    );
  const saved = node.reply ?? '';
  const seen = clientReply ?? '';
  const partial = (seen.startsWith(saved) || saved.startsWith(seen) ? (seen.length >= saved.length ? seen : saved) : saved).trim();
  return completeQuestionNode(nodeId, {
    reply: partial || '已停止',
    status: partial ? 'done' : 'error',
  });
}

export async function setNodeNote(nodeId: string, userId: string, note: string | null): Promise<NodeRecord | null> {
  if (!(await nodeOwnedBy(nodeId, userId))) return null;
  const text = note?.trim() ? note.trim().slice(0, 8000) : null;
  const [row] = await db.update(nodes).set({ note: text }).where(eq(nodes.id, nodeId)).returning();
  if (!row) return null;
  const [conversation] = await db.select().from(conversations).where(eq(conversations.id, row.conversationId)).limit(1);
  if (conversation?.userId) {
    await indexSafe(userId, {
      id: row.id,
      conversationId: row.conversationId,
      question: row.question,
      reply: row.reply,
      note: row.note,
    });
    await db.update(conversations).set({ updatedAt: new Date() }).where(eq(conversations.id, row.conversationId));
  }
  return toNode(row);
}

export async function setNodeSticker(nodeId: string, userId: string, sticker: StickerId | null): Promise<NodeRecord | null> {
  if (!(await nodeOwnedBy(nodeId, userId))) return null;
  if (sticker !== null && !isStickerId(sticker)) return null;
  const [row] = await db.update(nodes).set({ sticker }).where(eq(nodes.id, nodeId)).returning();
  return row ? toNode(row) : null;
}

export async function createNodeLink(
  conversationId: string,
  userId: string,
  sourceId: string,
  targetId: string,
): Promise<{ link: LinkRecord; created: boolean } | null> {
  if (sourceId === targetId) return null;
  const loaded = await loadConversation(conversationId, userId);
  if (!loaded) return null;
  if (!loaded.nodes.some((node) => node.id === sourceId) || !loaded.nodes.some((node) => node.id === targetId)) return null;
  const [existing] = await db
    .select()
    .from(links)
    .where(and(eq(links.sourceId, sourceId), eq(links.targetId, targetId)))
    .limit(1);
  if (existing) return { link: toLink(existing), created: false };
  try {
    const [row] = await db
      .insert(links)
      .values({ id: randomUUID(), conversationId, sourceId, targetId })
      .returning();
    if (!row) return null;
    await db.update(conversations).set({ updatedAt: new Date() }).where(eq(conversations.id, conversationId));
    return { link: toLink(row), created: true };
  } catch (error) {
    const again = await db
      .select()
      .from(links)
      .where(and(eq(links.sourceId, sourceId), eq(links.targetId, targetId)))
      .limit(1);
    if (again[0]) return { link: toLink(again[0]), created: false };
    throw error;
  }
}

export async function deleteNodeLink(linkId: string, userId: string): Promise<boolean> {
  const [row] = await db
    .select({ id: links.id })
    .from(links)
    .innerJoin(conversations, eq(links.conversationId, conversations.id))
    .where(and(eq(links.id, linkId), eq(conversations.userId, userId)))
    .limit(1);
  if (!row) return false;
  await db.delete(links).where(eq(links.id, linkId));
  return true;
}
