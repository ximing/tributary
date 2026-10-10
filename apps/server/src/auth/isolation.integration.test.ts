import { randomUUID } from 'node:crypto';
import { inArray } from 'drizzle-orm';
import { afterAll, expect, it } from 'vitest';
import { buildApp } from '../app.js';
import { closeDb, db } from '../db/client.js';
import { ensureSchema } from '../db/ensure.js';
import { users } from '../db/schema.js';
import { completeQuestionNode, createConversation, createQuestionNode } from '../conversations/service.js';

const userIds: string[] = [];

function cookieOf(headers: { 'set-cookie'?: unknown }): string {
  const raw = headers['set-cookie'];
  const line = Array.isArray(raw) ? raw[0] : raw;
  return typeof line === 'string' ? (line.split(';')[0] ?? '') : '';
}

afterAll(async () => {
  if (userIds.length > 0) await db.delete(users).where(inArray(users.id, userIds));
  await closeDb();
});

it('keeps conversations, model configs, and usage inside the signed-in user', async () => {
  await ensureSchema();
  const app = await buildApp();
  try {
  const suffix = randomUUID();
  const registered = await app.inject({
    method: 'POST',
    url: '/api/auth/register',
    payload: { email: `a-${suffix}@example.com`, password: 'password-1', displayName: '甲' },
  });
  const other = await app.inject({
    method: 'POST',
    url: '/api/auth/register',
    payload: { email: `b-${suffix}@example.com`, password: 'password-1' },
  });
  expect(registered.statusCode).toBe(201);
  expect(other.statusCode).toBe(201);
  const owner = registered.json() as { user: { id: string } };
  const guest = other.json() as { user: { id: string } };
  userIds.push(owner.user.id, guest.user.id);
  const ownerCookie = cookieOf(registered.headers);
  const guestCookie = cookieOf(other.headers);

  const denied = await app.inject({ method: 'GET', url: '/api/conversations' });
  expect(denied.statusCode).toBe(401);

  const createdConfig = await app.inject({
    method: 'POST',
    url: '/api/model-configs',
    headers: { cookie: ownerCookie },
    payload: { provider: 'deepseek', model: 'deepseek-chat', apiKey: 'sk-secret-value', isDefault: true },
  });
  expect(createdConfig.statusCode).toBe(201);
  const config = createdConfig.json() as { apiKeyMask: string; provider: string; isDefault: boolean };
  expect(config.provider).toBe('deepseek');
  expect(config.isDefault).toBe(true);
  expect(config.apiKeyMask).not.toContain('secret');

  const guestConfigs = await app.inject({ method: 'GET', url: '/api/model-configs', headers: { cookie: guestCookie } });
  expect(guestConfigs.json()).toEqual({ configs: [] });

  const conversation = await createConversation(owner.user.id, '只属于甲');
  const hidden = await app.inject({
    method: 'GET',
    url: `/api/conversations/${conversation.id}`,
    headers: { cookie: guestCookie },
  });
  expect(hidden.statusCode).toBe(404);

  const node = await createQuestionNode({
    userId: owner.user.id,
    conversationId: conversation.id,
    question: '用量归谁',
    relation: 'root',
  });
  await completeQuestionNode(node.id, {
    reply: '甲的回复',
    status: 'done',
    providerName: 'DeepSeek',
    model: 'deepseek-chat',
    promptTokens: 4,
    completionTokens: 6,
    totalTokens: 10,
  });

  const ownerUsage = await app.inject({ method: 'GET', url: '/api/usage', headers: { cookie: ownerCookie } });
  const guestUsage = await app.inject({ method: 'GET', url: '/api/usage', headers: { cookie: guestCookie } });
  expect(ownerUsage.json()).toMatchObject({ totalTokens: 10, calls: [{ model: 'deepseek-chat', totalTokens: 10 }] });
  expect(guestUsage.json()).toMatchObject({ totalTokens: 0, calls: [], byModel: [] });
  } finally {
    await app.close();
  }
});
