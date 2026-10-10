import { randomUUID } from 'node:crypto';
import { afterAll, expect, it } from 'vitest';
import { config } from '../config.js';
import { createMeiliClient } from './meili.js';
import { activeIndexUid, ensureSearchIndex, indexNode, removeNode, searchNodes, setSearchClient } from './index-nodes.js';

const PROD_INDEX_UID = 'tributary_nodes_prod';
const PHRASE = '青柠河湾的渡口灯';
const nodeId = randomUUID();
const conversationId = randomUUID();
const host = new URL(config.meiliHost);

async function stats(uid: string): Promise<{ status: number; documents: number | null }> {
  const response = await fetch(`${config.meiliHost}/indexes/${uid}/stats`, {
    headers: { authorization: `Bearer ${config.meiliApiKey}` },
  });
  if (response.status === 404) return { status: 404, documents: null };
  const body = (await response.json()) as { numberOfDocuments?: number };
  return { status: response.status, documents: body.numberOfDocuments ?? null };
}

afterAll(async () => {
  await removeNode(nodeId);
});

it('indexes a Chinese phrase on the test uid and finds it by a word inside the phrase', async () => {
  expect(activeIndexUid()).toBe('tributary_nodes_test');
  expect(activeIndexUid()).not.toBe(PROD_INDEX_UID);
  const prodBefore = await stats(PROD_INDEX_UID);

  const seen: string[] = [];
  const original = globalThis.fetch.bind(globalThis);
  setSearchClient(
    createMeiliClient({
      host: config.meiliHost,
      apiKey: config.meiliApiKey,
      indexUid: config.meiliIndexUid,
      fetchImpl: async (input, init) => {
        const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
        seen.push(url);
        return original(input, init);
      },
    }),
  );
  await ensureSearchIndex();
  const userId = randomUUID();
  await indexNode({ id: nodeId, conversationId, userId, question: PHRASE, reply: '河边的回答' });
  const hit = await searchNodes('渡口', userId);
  const miss = await searchNodes('绝无此词zzz', userId);
  const other = await searchNodes('渡口', randomUUID());
  expect(hit.some((item) => item.nodeId === nodeId && item.question === PHRASE)).toBe(true);
  expect(miss.some((item) => item.nodeId === nodeId)).toBe(false);
  expect(other.some((item) => item.nodeId === nodeId)).toBe(false);

  expect(seen.length).toBeGreaterThan(0);
  for (const url of seen) {
    const parsed = new URL(url);
    expect(parsed.hostname).toBe(host.hostname);
    expect(parsed.port).toBe(host.port || '7700');
    expect(url.includes(PROD_INDEX_UID)).toBe(false);
  }

  const health = await fetch(`${config.meiliHost}/health`);
  expect(health.status).toBe(200);
  const denied = await fetch(`${config.meiliHost}/indexes/${activeIndexUid()}/search`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ q: '渡口' }),
  });
  expect(denied.status).toBe(401);

  const prodAfter = await stats(PROD_INDEX_UID);
  expect(prodAfter).toEqual(prodBefore);
});
