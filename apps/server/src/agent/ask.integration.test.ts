import { createServer, type Server } from 'node:http';
import { randomUUID } from 'node:crypto';
import { inArray } from 'drizzle-orm';
import { afterAll, expect, it } from 'vitest';
import { buildApp } from '../app.js';
import { sessionCookie } from '../auth/cookies.js';
import { DEFAULT_SYSTEM_PROMPT } from './ask.js';
import { registerUser } from '../auth/service.js';
import { closeDb, db } from '../db/client.js';
import { ensureSchema } from '../db/ensure.js';
import { users } from '../db/schema.js';
import { createConversation, createQuestionNode, getNode, loadConversation } from '../conversations/service.js';
import { runDueJobs } from '../jobs/queue.js';
import { createModelConfig } from '../providers/service.js';
import { readUsage } from '../usage/service.js';

const USAGE = { prompt_tokens: 17, completion_tokens: 9, total_tokens: 26 };
const userIds: string[] = [];

function sseChunk(payload: unknown): string {
  return `data: ${JSON.stringify(payload)}\n\n`;
}

function messageText(content: unknown): string {
  if (typeof content === 'string') return content;
  if (!Array.isArray(content)) return '';
  return content
    .map((part) => (part && typeof part === 'object' && 'text' in part && typeof part.text === 'string' ? part.text : ''))
    .join('');
}

async function startStub(): Promise<{
  server: Server;
  port: number;
  models: string[];
  prompts: string[];
  transcripts: { role: string; content: string }[][];
}> {
  const models: string[] = [];
  const prompts: string[] = [];
  const transcripts: { role: string; content: string }[][] = [];
  const server = createServer((request, response) => {
    if (request.method !== 'POST' || !request.url?.includes('/chat/completions')) {
      response.writeHead(404).end('no');
      return;
    }
    const chunks: Buffer[] = [];
    request.on('data', (chunk: Buffer) => chunks.push(chunk));
    request.on('end', () => {
      const body = JSON.parse(Buffer.concat(chunks).toString('utf8')) as {
        model?: string;
        messages: { role: string; content: unknown }[];
      };
      const system = body.messages.find((message) => message.role === 'system')?.content;
      prompts.push(typeof system === 'string' ? system : '');
      transcripts.push(
        body.messages
          .filter((message) => message.role === 'user' || message.role === 'assistant')
          .map((message) => ({ role: message.role, content: messageText(message.content) })),
      );
      const model = body.model ?? '';
      models.push(model);
      const reply = model === 'model-b' ? '根节点回复-乙' : '追问回复-甲';
      response.writeHead(200, { 'content-type': 'text/event-stream' });
      response.write(
        sseChunk({
          id: 'chunk-1',
          object: 'chat.completion.chunk',
          created: 1,
          model,
          choices: [{ index: 0, delta: { role: 'assistant', content: reply }, finish_reason: null }],
        }),
      );
      response.write(
        sseChunk({
          id: 'chunk-2',
          object: 'chat.completion.chunk',
          created: 1,
          model,
          choices: [{ index: 0, delta: {}, finish_reason: 'stop' }],
          usage: USAGE,
        }),
      );
      response.write('data: [DONE]\n\n');
      response.end();
    });
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('stub failed to bind');
  return { server, port: address.port, models, prompts, transcripts };
}

afterAll(async () => {
  if (userIds.length > 0) await db.delete(users).where(inArray(users.id, userIds));
  await closeDb();
});

it('answers a root question and a follow-up with the chosen models and stores their tokens', async () => {
  await ensureSchema();
  const stub = await startStub();
  const app = await buildApp();
  try {
    const baseUrl = `http://127.0.0.1:${String(stub.port)}/v1`;
    const account = await registerUser({ email: `agent-${randomUUID()}@example.com`, password: 'password-1' });
    userIds.push(account.user.id);
    const providerA = await createModelConfig({
      userId: account.user.id,
      provider: 'openai',
      model: 'model-a',
      apiKey: 'test-key',
      baseUrl,
      isDefault: false,
    });
    const providerB = await createModelConfig({
      userId: account.user.id,
      provider: 'openai',
      model: 'model-b',
      apiKey: 'test-key',
      baseUrl,
      isDefault: true,
    });
    const conversation = await createConversation(account.user.id, 'test:agent');

    const before = await readUsage(account.user.id);
    const rootPending = await createQuestionNode({
      userId: account.user.id,
      conversationId: conversation.id,
      question: '请用乙模型回答',
      relation: 'root',
      providerId: providerB.id,
      model: 'model-b',
    });
    expect(await runDueJobs(new Date(), account.user.id)).toBe(1);
    const root = await getNode(rootPending.id);
    expect(stub.prompts).toEqual([DEFAULT_SYSTEM_PROMPT]);
    expect(stub.transcripts[0]).toEqual([{ role: 'user', content: '请用乙模型回答' }]);
    const saved = await app.inject({ method: 'PUT', url: '/api/agent-settings', headers: { cookie: sessionCookie(account.token) }, payload: { systemPrompt: '请用简洁的中文回答，并举一个例子。' } });
    expect(saved.statusCode).toBe(200);
    const followPending = await createQuestionNode({
      userId: account.user.id,
      conversationId: conversation.id,
      question: '请用甲模型继续',
      relation: 'child',
      selectedNodeId: rootPending.id,
      providerId: providerA.id,
      model: 'model-a',
    });
    expect(await runDueJobs(new Date(), account.user.id)).toBe(1);
    const follow = await getNode(followPending.id);
    if (!root || !follow) throw new Error('节点不存在');

    expect(stub.prompts).toEqual([DEFAULT_SYSTEM_PROMPT, '请用简洁的中文回答，并举一个例子。']);
    expect(stub.transcripts[1]).toEqual([
      { role: 'user', content: '请用乙模型回答' },
      { role: 'assistant', content: '根节点回复-乙' },
      { role: 'user', content: '请用甲模型继续' },
    ]);
    expect(stub.models).toEqual(['model-b', 'model-a']);
    expect(root).toMatchObject({ reply: '根节点回复-乙', status: 'done', model: 'model-b' });
    expect(follow).toMatchObject({ reply: '追问回复-甲', status: 'done', parentId: root.id, model: 'model-a' });

    const reloaded = await loadConversation(conversation.id, account.user.id);
    expect(reloaded?.nodes.find((node) => node.id === root.id)?.reply).toBe('根节点回复-乙');
    const after = await readUsage(account.user.id);
    const added = after.calls.filter((call) => !before.calls.some((existing) => existing.id === call.id));
    expect(added).toHaveLength(2);
    for (const call of added) {
      expect(call.promptTokens).toBe(USAGE.prompt_tokens);
      expect(call.completionTokens).toBe(USAGE.completion_tokens);
      expect(call.totalTokens).toBe(USAGE.total_tokens);
    }
    expect(after.promptTokens - before.promptTokens).toBe(USAGE.prompt_tokens * 2);
    expect(after.completionTokens - before.completionTokens).toBe(USAGE.completion_tokens * 2);
    expect(after.totalTokens - before.totalTokens).toBe(USAGE.total_tokens * 2);

    const reset = await app.inject({ method: 'PUT', url: '/api/agent-settings', headers: { cookie: sessionCookie(account.token) }, payload: { systemPrompt: null } });
    expect(reset.statusCode).toBe(200);
    const resetPending = await createQuestionNode({
      userId: account.user.id,
      conversationId: conversation.id,
      question: '恢复默认之后继续回答',
      relation: 'child',
      selectedNodeId: follow.id,
      providerId: providerA.id,
      model: 'model-a',
    });
    expect(await runDueJobs(new Date(), account.user.id)).toBe(1);
    expect((await getNode(resetPending.id))?.status).toBe('done');
    expect(stub.prompts).toEqual([DEFAULT_SYSTEM_PROMPT, '请用简洁的中文回答，并举一个例子。', DEFAULT_SYSTEM_PROMPT]);
    expect(stub.transcripts[2]).toEqual([
      { role: 'user', content: '请用乙模型回答' },
      { role: 'assistant', content: '根节点回复-乙' },
      { role: 'user', content: '请用甲模型继续' },
      { role: 'assistant', content: '追问回复-甲' },
      { role: 'user', content: '恢复默认之后继续回答' },
    ]);
  } finally {
    await app.close();
    await new Promise<void>((resolve, reject) => stub.server.close((error) => (error ? reject(error) : resolve())));
  }
});

// Catches missing persistence, unsafe cross-account updates, and invalid input clearing a saved prompt.
it('persists agent settings per account, validates writes, and restores defaults', async () => {
  await ensureSchema();
  const app = await buildApp();
  const account = await registerUser({ email: `settings-${randomUUID()}@example.com`, password: 'password-1' });
  const other = await registerUser({ email: `settings-${randomUUID()}@example.com`, password: 'password-1' });
  userIds.push(account.user.id, other.user.id);
  const headers = { cookie: sessionCookie(account.token) };
  const url = '/api/agent-settings';
  try {
    for (const method of ['GET', 'PUT'] as const) {
      expect((await app.inject({ method, url, ...(method === 'PUT' ? { payload: { systemPrompt: 'bad' } } : {}) })).statusCode).toBe(401);
    }
    const initial = await app.inject({ method: 'GET', url, headers });
    expect(initial.statusCode).toBe(200);
    expect(initial.json()).toMatchObject({ systemPrompt: null, defaultSystemPrompt: DEFAULT_SYSTEM_PROMPT });
    const saved = await app.inject({ method: 'PUT', url, headers, payload: { systemPrompt: '  作为数学老师，逐步讲解。\n给出例子。  ' } });
    expect(saved.statusCode).toBe(200);
    expect((await app.inject({ method: 'GET', url, headers })).json().systemPrompt).toBe('作为数学老师，逐步讲解。\n给出例子。');
    expect((await app.inject({ method: 'GET', url, headers: { cookie: sessionCookie(other.token) } })).json().systemPrompt).toBeNull();
    for (const payload of [{}, { systemPrompt: 42 }, { systemPrompt: 'a'.repeat(20001) }]) {
      expect((await app.inject({ method: 'PUT', url, headers, payload })).statusCode).toBe(400);
    }
    expect((await app.inject({ method: 'GET', url, headers })).json().systemPrompt).toBe('作为数学老师，逐步讲解。\n给出例子。');
    for (const systemPrompt of [' \n\t', null]) {
      expect((await app.inject({ method: 'PUT', url, headers, payload: { systemPrompt } })).statusCode).toBe(200);
      expect((await app.inject({ method: 'GET', url, headers })).json().systemPrompt).toBeNull();
    }
  } finally {
    await app.close();
  }
});
