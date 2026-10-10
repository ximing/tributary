import { desc, eq } from 'drizzle-orm';
import { groupUsage, sumUsage, type UsageGroup } from '@tributary/domain';
import { db } from '../db/client.js';
import { conversations, nodes, usageCalls } from '../db/schema.js';

export interface UsageView {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  byModel: UsageGroup[];
  calls: {
    id: string;
    nodeId: string;
    providerName: string;
    model: string;
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
    createdAt: string;
  }[];
}

export async function readUsage(userId: string): Promise<UsageView> {
  const rows = await db
    .select({
      id: usageCalls.id,
      nodeId: usageCalls.nodeId,
      providerName: usageCalls.providerName,
      model: usageCalls.model,
      promptTokens: usageCalls.promptTokens,
      completionTokens: usageCalls.completionTokens,
      totalTokens: usageCalls.totalTokens,
      createdAt: usageCalls.createdAt,
    })
    .from(usageCalls)
    .innerJoin(nodes, eq(usageCalls.nodeId, nodes.id))
    .innerJoin(conversations, eq(nodes.conversationId, conversations.id))
    .where(eq(conversations.userId, userId))
    .orderBy(desc(usageCalls.createdAt));
  const calls = rows.map((row) => ({
    id: row.id,
    nodeId: row.nodeId,
    providerName: row.providerName,
    model: row.model,
    promptTokens: row.promptTokens,
    completionTokens: row.completionTokens,
    totalTokens: row.totalTokens,
    createdAt: row.createdAt.toISOString(),
  }));
  return { ...sumUsage(calls), byModel: groupUsage(calls), calls };
}
