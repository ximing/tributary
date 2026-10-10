import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import {
  createConversation,
  listConversations,
  loadConversation,
  setCollapsed,
  submitQuestion,
} from './conversations/service.js';
import { createProvider, deleteProvider, listProviders } from './providers/service.js';
import { searchNodes } from './search/index-nodes.js';
import { readUsage } from './usage/service.js';

const createConversationBody = z.object({ title: z.string().optional() });
const createNodeBody = z.object({
  question: z.string().min(1),
  relation: z.enum(['root', 'child', 'sibling']),
  selectedNodeId: z.string().uuid().nullable().optional(),
  providerId: z.string().uuid().nullable().optional(),
  model: z.string().nullable().optional(),
});
const collapseBody = z.object({ collapsed: z.boolean() });
const providerBody = z.object({
  name: z.string().min(1),
  baseUrl: z.string().url(),
  apiKey: z.string().min(1),
  models: z.array(z.string().min(1)).min(1),
});

function badRequest(reply: { code: (status: number) => { send: (body: unknown) => unknown } }, message: string) {
  return reply.code(400).send({ error: message });
}

export async function registerRoutes(app: FastifyInstance): Promise<void> {
  app.get('/api/health', async () => ({ ok: true, service: 'tributary' }));

  app.get('/api/conversations', async () => ({ conversations: await listConversations() }));

  app.post('/api/conversations', async (request, reply) => {
    const parsed = createConversationBody.safeParse(request.body ?? {});
    if (!parsed.success) return badRequest(reply, '参数无效');
    return reply.code(201).send(await createConversation(parsed.data.title));
  });

  app.get('/api/conversations/:id', async (request, reply) => {
    const { id } = request.params as { id: string };
    const loaded = await loadConversation(id);
    if (!loaded) return reply.code(404).send({ error: '对话不存在' });
    return loaded;
  });

  app.post('/api/conversations/:id/nodes', async (request, reply) => {
    const { id } = request.params as { id: string };
    const parsed = createNodeBody.safeParse(request.body);
    if (!parsed.success) return badRequest(reply, '参数无效');
    try {
      const node = await submitQuestion({
        conversationId: id,
        question: parsed.data.question,
        relation: parsed.data.relation,
        selectedNodeId: parsed.data.selectedNodeId,
        providerId: parsed.data.providerId,
        model: parsed.data.model,
      });
      return reply.code(201).send(node);
    } catch (error) {
      const message = error instanceof Error ? error.message : '创建节点失败';
      return badRequest(reply, message);
    }
  });

  app.patch('/api/nodes/:id', async (request, reply) => {
    const { id } = request.params as { id: string };
    const parsed = collapseBody.safeParse(request.body);
    if (!parsed.success) return badRequest(reply, '参数无效');
    const node = await setCollapsed(id, parsed.data.collapsed);
    if (!node) return reply.code(404).send({ error: '节点不存在' });
    return node;
  });

  app.get('/api/providers', async () => ({ providers: await listProviders() }));

  app.post('/api/providers', async (request, reply) => {
    const parsed = providerBody.safeParse(request.body);
    if (!parsed.success) return badRequest(reply, '参数无效');
    return reply.code(201).send(await createProvider(parsed.data));
  });

  app.delete('/api/providers/:id', async (request, reply) => {
    const { id } = request.params as { id: string };
    const removed = await deleteProvider(id);
    if (!removed) return reply.code(404).send({ error: '模型配置不存在' });
    return reply.code(204).send();
  });

  app.get('/api/usage', async () => readUsage());

  app.get('/api/search', async (request) => {
    const query = request.query as { q?: string };
    return { hits: await searchNodes(query.q ?? '') };
  });
}
