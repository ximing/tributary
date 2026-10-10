import { config } from '../config.js';
import { createMeiliClient, type MeiliDocument, type MeiliHit } from './meili.js';

let client = createMeiliClient({
  host: config.meiliHost,
  apiKey: config.meiliApiKey,
  indexUid: config.meiliIndexUid,
});

export function setSearchClient(next: typeof client): void {
  client = next;
}

export function activeIndexUid(): string {
  return client.indexUid;
}

export async function ensureSearchIndex(): Promise<void> {
  if (!config.meiliApiKey) return;
  await client.ensureIndex();
}

export async function indexNode(doc: Omit<MeiliDocument, 'text'>): Promise<void> {
  if (!config.meiliApiKey) return;
  await client.upsert({
    ...doc,
    text: `${doc.question}\n${doc.reply ?? ''}`,
  });
}

export async function searchNodes(q: string, userId: string): Promise<MeiliHit[]> {
  if (!q.trim() || !config.meiliApiKey) return [];
  if (!/^[0-9a-f-]{36}$/i.test(userId)) return [];
  return client.search(q.trim(), `userId = "${userId}"`);
}

export async function removeNode(id: string): Promise<void> {
  if (!config.meiliApiKey) return;
  await client.remove(id);
}
