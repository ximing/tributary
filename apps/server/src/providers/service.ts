import { randomUUID } from 'node:crypto';
import { asc, eq } from 'drizzle-orm';
import { db } from '../db/client.js';
import { providerModels, providers } from '../db/schema.js';

export interface ProviderView {
  id: string;
  name: string;
  baseUrl: string;
  models: string[];
  apiKeyMask: string;
}

export interface SavedModel {
  providerId: string;
  providerName: string;
  model: string;
}

async function modelsFor(providerId: string): Promise<string[]> {
  const rows = await db
    .select()
    .from(providerModels)
    .where(eq(providerModels.providerId, providerId))
    .orderBy(asc(providerModels.modelId));
  return rows.map((row) => row.modelId);
}

export async function listProviders(): Promise<ProviderView[]> {
  const rows = await db.select().from(providers).orderBy(asc(providers.createdAt));
  const views: ProviderView[] = [];
  for (const row of rows) {
    views.push({
      id: row.id,
      name: row.name,
      baseUrl: row.baseUrl,
      models: await modelsFor(row.id),
      apiKeyMask: '已保存',
    });
  }
  return views;
}

export async function listSavedModels(): Promise<SavedModel[]> {
  const rows = await listProviders();
  return rows.flatMap((provider) =>
    provider.models.map((model) => ({
      providerId: provider.id,
      providerName: provider.name,
      model,
    })),
  );
}

export async function createProvider(input: {
  name: string;
  baseUrl: string;
  apiKey: string;
  models: string[];
}): Promise<ProviderView> {
  const id = randomUUID();
  await db.insert(providers).values({
    id,
    name: input.name,
    baseUrl: input.baseUrl.replace(/\/$/, ''),
    apiKey: input.apiKey,
  });
  const uniqueModels = [...new Set(input.models.map((model) => model.trim()).filter(Boolean))];
  if (uniqueModels.length > 0) {
    await db.insert(providerModels).values(
      uniqueModels.map((modelId) => ({
        id: randomUUID(),
        providerId: id,
        modelId,
      })),
    );
  }
  return { id, name: input.name, baseUrl: input.baseUrl.replace(/\/$/, ''), models: uniqueModels, apiKeyMask: '已保存' };
}

export async function deleteProvider(id: string): Promise<boolean> {
  const removed = await db.delete(providers).where(eq(providers.id, id)).returning({ id: providers.id });
  return removed.length > 0;
}

export async function getProviderSecret(id: string): Promise<{ name: string; baseUrl: string; apiKey: string } | null> {
  const [row] = await db.select().from(providers).where(eq(providers.id, id)).limit(1);
  if (!row) return null;
  return { name: row.name, baseUrl: row.baseUrl, apiKey: row.apiKey };
}
