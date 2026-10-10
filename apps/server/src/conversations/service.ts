import { randomUUID } from 'node:crypto';
import { asc, eq } from 'drizzle-orm';
import { resolveParentId, type NodeRelation } from '@tributary/domain';
import { ask, AskError, DEFAULT_SYSTEM_PROMPT } from '../agent/ask.js';
import { db } from '../db/client.js';
import { conversations, nodes, usageCalls } from '../db/schema.js';
import { getProviderSecret } from '../providers/service.js';
import { indexNode } from '../search/index-nodes.js';

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

export async function listConversations(): Promise<ConversationRecord[]> {
  const rows = await db.select().from(conversations).orderBy(asc(conversations.updatedAt));
  return rows
    .map((row) => ({
      id: row.id,
      title: row.title,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    }))
    .reverse();
}

export async function createConversation(title?: string): Promise<ConversationRecord> {
  const id = randomUUID();
  const now = new Date();
  const [row] = await db
    .insert(conversations)
    .values({ id, title: title?.trim() || '未命名对话', createdAt: now, updatedAt: now })
    .returning();
  if (!row) throw new Error('创建对话失败');
  return {
    id: row.id,
    title: row.title,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export async function loadConversation(id: string): Promise<{ conversation: ConversationRecord; nodes: NodeRecord[] } | null> {
  const [conversation] = await db.select().from(conversations).where(eq(conversations.id, id)).limit(1);
  if (!conversation) return null;
  const rows = await db.select().from(nodes).where(eq(nodes.conversationId, id)).orderBy(asc(nodes.position), asc(nodes.createdAt));
  return {
    conversation: {
      id: conversation.id,
      title: conversation.title,
      createdAt: conversation.createdAt.toISOString(),
      updatedAt: conversation.updatedAt.toISOString(),
    },
    nodes: rows.map(toNode),
  };
}

async function touchConversation(conversationId: string, title?: string): Promise<void> {
  await db
    .update(conversations)
    .set({ updatedAt: new Date(), ...(title ? { title } : {}) })
    .where(eq(conversations.id, conversationId));
}

export async function createQuestionNode(input: {
  conversationId: string;
  question: string;
  relation: NodeRelation;
  selectedNodeId?: string | null;
  providerId?: string | null;
  model?: string | null;
}): Promise<NodeRecord> {
  const loaded = await loadConversation(input.conversationId);
  if (!loaded) throw new Error('对话不存在');
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
  const [row] = await db
    .insert(nodes)
    .values({
      id,
      conversationId: input.conversationId,
      parentId,
      question: input.question,
      reply: null,
      status: 'pending',
      providerId: input.providerId ?? null,
      model: input.model ?? null,
      collapsed: false,
      position: siblings.length,
    })
    .returning();
  if (!row) throw new Error('创建节点失败');
  if (parentId === null && (loaded.conversation.title === '未命名对话' || loaded.nodes.length === 0)) {
    await touchConversation(input.conversationId, input.question.slice(0, 40));
  } else {
    await touchConversation(input.conversationId);
  }
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
    await indexNode({
      id: row.id,
      conversationId: row.conversationId,
      question: row.question,
      reply: row.reply,
    });
  } catch (error) {
    console.error('search.index_failed', error instanceof Error ? error.message : error);
  }
  return toNode(row);
}

export async function submitQuestion(input: {
  conversationId: string;
  question: string;
  relation: NodeRelation;
  selectedNodeId?: string | null;
  providerId?: string | null;
  model?: string | null;
}): Promise<NodeRecord> {
  const node = await createQuestionNode(input);
  if (!input.providerId || !input.model) {
    return completeQuestionNode(node.id, { reply: '未选择模型', status: 'error' });
  }
  const provider = await getProviderSecret(input.providerId);
  if (!provider) {
    return completeQuestionNode(node.id, { reply: '模型配置不存在', status: 'error' });
  }
  try {
    const answer = await ask({
      apiKey: provider.apiKey,
      baseUrl: provider.baseUrl,
      modelId: input.model,
      systemPrompt: DEFAULT_SYSTEM_PROMPT,
      question: input.question,
    });
    return completeQuestionNode(node.id, {
      reply: answer.text,
      status: 'done',
      providerName: provider.name,
      model: input.model,
      promptTokens: answer.promptTokens,
      completionTokens: answer.completionTokens,
      totalTokens: answer.totalTokens,
    });
  } catch (error) {
    const message = error instanceof AskError ? error.message : error instanceof Error ? error.message : '模型调用失败';
    return completeQuestionNode(node.id, { reply: message, status: 'error' });
  }
}

export async function setCollapsed(nodeId: string, collapsed: boolean): Promise<NodeRecord | null> {
  const [row] = await db.update(nodes).set({ collapsed }).where(eq(nodes.id, nodeId)).returning();
  return row ? toNode(row) : null;
}

export async function deleteConversation(id: string): Promise<void> {
  await db.delete(conversations).where(eq(conversations.id, id));
}
