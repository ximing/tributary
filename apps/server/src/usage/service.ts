import { desc, eq } from 'drizzle-orm';
import { sumUsage } from '@tributary/domain';
import { db } from '../db/client.js';
import { usageCalls } from '../db/schema.js';

export interface UsageView {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  calls: {
    id: string;
    nodeId: string;
    providerName: string;
    model: string;
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  }[];
}

export async function usageForNode(nodeId: string): Promise<UsageView['calls']> {
  const rows = await db.select().from(usageCalls).where(eq(usageCalls.nodeId, nodeId));
  return rows.map(toCall);
}

export async function readUsage(): Promise<UsageView> {
  const rows = await db.select().from(usageCalls).orderBy(desc(usageCalls.createdAt));
  const calls = rows.map(toCall);
  const totals = sumUsage(calls);
  return { ...totals, calls };
}

function toCall(row: typeof usageCalls.$inferSelect): UsageView['calls'][number] {
  return {
    id: row.id,
    nodeId: row.nodeId,
    providerName: row.providerName,
    model: row.model,
    promptTokens: row.promptTokens,
    completionTokens: row.completionTokens,
    totalTokens: row.totalTokens,
  };
}
