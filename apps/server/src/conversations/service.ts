import { randomUUID } from 'node:crypto';
import { and, asc, desc, eq, inArray } from 'drizzle-orm';
import { resolveParentId, type NodeRelation } from '@tributary/domain';
import { db } from '../db/client.js';
import { conversations, nodes, usageCalls } from '../db/schema.js';
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
  };
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
): Promise<{ conversation: ConversationRecord; nodes: NodeRecord[] } | null> {
  const [conversation] = await db
    .select()
    .from(conversations)
    .where(and(eq(conversations.id, id), eq(conversations.userId, userId)))
    .limit(1);
  if (!conversation) return null;
  const rows = await db.select().from(nodes).where(eq(nodes.conversationId, id)).orderBy(asc(nodes.position), asc(nodes.createdAt));
  return { conversation: toConversation(conversation), nodes: rows.map(toNode) };
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
    .where(eq(nodes.id, nodeId))
    .returning();
  if (!row) throw new Error('节点不存在');
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
