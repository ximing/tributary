import { randomUUID } from 'node:crypto';
import { and, desc, eq } from 'drizzle-orm';
import { isModelProvider, PROVIDER_LABELS, resolveBaseUrl, type ModelProvider } from '@tributary/domain';
import { db } from '../db/client.js';
import { modelConfigs } from '../db/schema.js';

export interface ModelConfigView {
  id: string;
  provider: ModelProvider;
  model: string;
  baseUrl: string | null;
  isDefault: boolean;
  apiKeyMask: string;
}

export interface ModelSecret {
  id: string;
  provider: ModelProvider;
  label: string;
  model: string;
  baseUrl: string;
  apiKey: string;
}

export function maskApiKey(apiKey: string): string {
  if (apiKey.length <= 6) return '已保存';
  return `${apiKey.slice(0, 6)}****`;
}

function toView(row: typeof modelConfigs.$inferSelect): ModelConfigView | null {
  if (!isModelProvider(row.provider)) return null;
  return {
    id: row.id,
    provider: row.provider,
    model: row.model,
    baseUrl: row.baseUrl,
    isDefault: row.isDefault,
    apiKeyMask: maskApiKey(row.apiKey),
  };
}

function toSecret(row: typeof modelConfigs.$inferSelect): ModelSecret | null {
  if (!isModelProvider(row.provider)) return null;
  return {
    id: row.id,
    provider: row.provider,
    label: PROVIDER_LABELS[row.provider],
    model: row.model,
    baseUrl: resolveBaseUrl(row.provider, row.baseUrl),
    apiKey: row.apiKey,
  };
}

export async function listModelConfigs(userId: string): Promise<ModelConfigView[]> {
  const rows = await db
    .select()
    .from(modelConfigs)
    .where(eq(modelConfigs.userId, userId))
    .orderBy(desc(modelConfigs.isDefault), desc(modelConfigs.createdAt));
  return rows.flatMap((row) => {
    const view = toView(row);
    return view ? [view] : [];
  });
}

export async function createModelConfig(input: {
  userId: string;
  provider: ModelProvider;
  model: string;
  apiKey: string;
  baseUrl: string | null;
  isDefault: boolean;
}): Promise<ModelConfigView> {
  const model = input.model.trim();
  if (!model) throw new Error('请填写模型名');
  return db.transaction(async (tx) => {
    const existing = await tx.select({ id: modelConfigs.id, isDefault: modelConfigs.isDefault }).from(modelConfigs).where(eq(modelConfigs.userId, input.userId));
    const makeDefault = input.isDefault || existing.length === 0 || !existing.some((row) => row.isDefault);
    if (makeDefault) {
      await tx.update(modelConfigs).set({ isDefault: false }).where(eq(modelConfigs.userId, input.userId));
    }
    const [row] = await tx
      .insert(modelConfigs)
      .values({
        id: randomUUID(),
        userId: input.userId,
        provider: input.provider,
        model,
        baseUrl: input.baseUrl,
        apiKey: input.apiKey,
        isDefault: makeDefault,
      })
      .returning();
    if (!row) throw new Error('保存模型失败');
    const view = toView(row);
    if (!view) throw new Error('保存模型失败');
    return view;
  });
}

export async function deleteModelConfig(id: string, userId: string): Promise<boolean> {
  const [removed] = await db
    .delete(modelConfigs)
    .where(and(eq(modelConfigs.id, id), eq(modelConfigs.userId, userId)))
    .returning();
  if (!removed) return false;
  if (removed.isDefault) {
    const [next] = await db
      .select()
      .from(modelConfigs)
      .where(eq(modelConfigs.userId, userId))
      .orderBy(desc(modelConfigs.createdAt))
      .limit(1);
    if (next) {
      await db.update(modelConfigs).set({ isDefault: true }).where(eq(modelConfigs.id, next.id));
    }
  }
  return true;
}

export async function setDefaultModelConfig(id: string, userId: string): Promise<ModelConfigView | null> {
  return db.transaction(async (tx) => {
    const [current] = await tx
      .select()
      .from(modelConfigs)
      .where(and(eq(modelConfigs.id, id), eq(modelConfigs.userId, userId)))
      .limit(1);
    if (!current) return null;
    await tx.update(modelConfigs).set({ isDefault: false }).where(eq(modelConfigs.userId, userId));
    const [row] = await tx.update(modelConfigs).set({ isDefault: true }).where(eq(modelConfigs.id, id)).returning();
    return row ? toView(row) : null;
  });
}

export async function getModelForUser(id: string, userId: string): Promise<ModelSecret | null> {
  const [row] = await db
    .select()
    .from(modelConfigs)
    .where(and(eq(modelConfigs.id, id), eq(modelConfigs.userId, userId)))
    .limit(1);
  return row ? toSecret(row) : null;
}

export async function getModelSecret(id: string): Promise<ModelSecret | null> {
  const [row] = await db.select().from(modelConfigs).where(eq(modelConfigs.id, id)).limit(1);
  return row ? toSecret(row) : null;
}
