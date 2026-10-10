import { createServer, type Server } from 'node:http';
import { afterAll, expect, it } from 'vitest';
import { closeDb } from '../db/client.js';
import { ensureSchema } from '../db/ensure.js';
import { createConversation, deleteConversation, loadConversation, submitQuestion } from '../conversations/service.js';
import { createProvider, deleteProvider } from '../providers/service.js';
import { readUsage } from '../usage/service.js';

const USAGE = { prompt_tokens: 17, completion_tokens: 9, total_tokens: 26 };
const createdConversations: string[] = [];
const createdProviders: string[] = [];

function sseChunk(payload: unknown): string {
  return `data: ${JSON.stringify(payload)}\n\n`;
}

async function startStub(): Promise<{ server: Server; port: number; models: string[] }> {
  const models: string[] = [];
  const server = createServer((request, response) => {
    if (request.method !== 'POST' || !request.url?.includes('/chat/completions')) {
      response.writeHead(404).end('no');
      return;
    }
    const chunks: Buffer[] = [];
    request.on('data', (chunk: Buffer) => chunks.push(chunk));
    request.on('end', () => {
      const body = JSON.parse(Buffer.concat(chunks).toString('utf8')) as { model?: string };
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
  return { server, port: address.port, models };
}

afterAll(async () => {
  for (const id of createdConversations) await deleteConversation(id);
  for (const id of createdProviders) await deleteProvider(id);
  await closeDb();
});

it('answers a root question and a follow-up with the chosen models and stores their tokens', async () => {
  await ensureSchema();
  const stub = await startStub();
  try {
    const baseUrl = `http://127.0.0.1:${String(stub.port)}/v1`;
    const providerA = await createProvider({ name: 'stub-a', baseUrl, apiKey: 'test-key', models: ['model-a'] });
    const providerB = await createProvider({ name: 'stub-b', baseUrl, apiKey: 'test-key', models: ['model-b'] });
    createdProviders.push(providerA.id, providerB.id);
    const conversation = await createConversation('test:agent');
    createdConversations.push(conversation.id);

    const before = await readUsage();
    const root = await submitQuestion({
      conversationId: conversation.id,
      question: '请用乙模型回答',
      relation: 'root',
      providerId: providerB.id,
      model: 'model-b',
    });
    const follow = await submitQuestion({
      conversationId: conversation.id,
      question: '请用甲模型继续',
      relation: 'child',
      selectedNodeId: root.id,
      providerId: providerA.id,
      model: 'model-a',
    });

    expect(stub.models).toEqual(['model-b', 'model-a']);
    expect(root).toMatchObject({ reply: '根节点回复-乙', status: 'done', model: 'model-b' });
    expect(follow).toMatchObject({ reply: '追问回复-甲', status: 'done', parentId: root.id, model: 'model-a' });

    const reloaded = await loadConversation(conversation.id);
    expect(reloaded?.nodes.find((node) => node.id === root.id)?.reply).toBe('根节点回复-乙');
    const after = await readUsage();
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
  } finally {
    await new Promise<void>((resolve, reject) => stub.server.close((error) => (error ? reject(error) : resolve())));
  }
});
