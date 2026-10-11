import { agentSettingsBody, readAgentSettings, saveAgentSettings } from './agent/settings.js';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { isModelProvider, STICKERS, type ModelProvider, type StickerId } from '@tributary/domain';
import { z } from 'zod';
import {
  AuthError,
  changePassword,
  loginUser,
  logoutToken,
  registerUser,
  removeAvatar,
  updateProfile,
  uploadAvatar,
  userFromCookie,
  type PublicUser,
} from './auth/service.js';
import { clearSessionCookie, readSessionToken, sessionCookie } from './auth/cookies.js';
import {
  completeQuestionNode,
  copyQuestionSubtree,
  createConversation,
  createQuestionNode,
  deleteConversation,
  deleteNodeSubtree,
  getNode,
  listConversations,
  loadConversation,
  cancelQuestionNode,
  createNodeLink,
  deleteNodeLink,
  insertOutlineNodes,
  markPending,
  moveQuestionNode,
  regenerateQuestionNode,
  nodeOwnedBy,
  renameQuestion,
  restoreQuestionSubtree,
  setCollapsed,
  setCollapsedMany,
  setNodeNote,
  setNodeSticker,
  type NodeRecord,
} from './conversations/service.js';
import { enqueueAnswer } from './jobs/enqueue.js';
import { subscribeStream } from './jobs/stream-bus.js';
import { createModelConfig, deleteModelConfig, listModelConfigs, setDefaultModelConfig } from './providers/service.js';
import { searchNodes } from './search/index-nodes.js';
import { readUsage } from './usage/service.js';

const registerBody = z.object({
  email: z.string().trim().toLowerCase().email().max(200),
  password: z.string().min(8).max(200),
  displayName: z.string().trim().min(1).max(40).optional(),
});
const loginBody = z.object({
  email: z.string().trim().toLowerCase().email().max(200),
  password: z.string().min(1).max(200),
});
const createConversationBody = z.object({ title: z.string().optional() });
const createNodeBody = z.object({
  question: z.string().min(1),
  relation: z.enum(['root', 'child', 'sibling']),
  selectedNodeId: z.string().uuid().nullable().optional(),
  providerId: z.string().uuid().nullable().optional(),
  model: z.string().nullable().optional(),
});
const collapseBody = z.object({ collapsed: z.boolean() });
const noteBody = z.object({ note: z.string().max(8000).nullable() });
const stickerBody = z.object({
  sticker: z.enum(STICKERS.map((item) => item.id) as [StickerId, ...StickerId[]]).nullable(),
});
const linkBody = z.object({
  sourceId: z.string().uuid(),
  targetId: z.string().uuid(),
});
const cancelBody = z.object({ reply: z.string().max(200_000).optional() });
const renameBody = z.object({ question: z.string().trim().min(1).max(20000) });
const moveBody = z.object({
  parentId: z.string().uuid().nullable(),
  index: z.number().int().min(0).max(10000),
});
const regenerateBody = z
  .object({
    providerId: z.string().uuid().optional(),
    model: z.string().min(1).max(128).optional(),
  })
  .refine((data) => (data.providerId === undefined) === (data.model === undefined));
const outlineBody = z.object({
  parentId: z.string().uuid().nullable(),
  items: z
    .array(
      z.object({
        question: z.string().trim().min(1).max(20000),
        depth: z.number().int().min(0).max(32),
      }),
    )
    .min(1)
    .max(200),
});
const collapseManyBody = z.object({
  changes: z.array(z.object({ id: z.string().uuid(), collapsed: z.boolean() })).max(2000),
});
const restoreBody = z.object({
  nodes: z
    .array(
      z.object({
        id: z.string().uuid(),
        parentId: z.string().uuid().nullable(),
        question: z.string().trim().min(1).max(20000),
        reply: z.string().nullable(),
        status: z.enum(['pending', 'done', 'error']),
        providerId: z.string().uuid().nullable(),
        model: z.string().max(128).nullable(),
        collapsed: z.boolean(),
        position: z.number().int().min(0).max(10000),
        note: z.string().max(8000).nullable().optional(),
        sticker: z.enum(STICKERS.map((item) => item.id) as [StickerId, ...StickerId[]]).nullable().optional(),
      }),
    )
    .min(1)
    .max(500),
});
const modelConfigBody = z.object({
  provider: z.string().min(1),
  apiKey: z.string().min(1).max(512),
  model: z.string().min(1).max(128),
  isDefault: z.boolean().optional(),
  baseUrl: z.string().max(512).optional(),
});
const profileBody = z.object({
  displayName: z.string().trim().min(1).max(40).optional(),
});
const avatarBody = z.object({
  data: z
    .string()
    .max(600_000)
    .regex(/^data:image\/(png|jpeg|webp|gif);base64,/, '头像格式无效'),
});
const passwordBody = z.object({
  currentPassword: z.string().min(1).max(200),
  newPassword: z.string().min(8).max(200),
});

function badRequest(reply: FastifyReply, message: string) {
  return reply.code(400).send({ error: message });
}

function cleanBaseUrl(value: string | undefined): string | null {
  const trimmed = value?.trim() ?? '';
  if (!trimmed) return null;
  let url: URL;
  try {
    url = new URL(trimmed);
  } catch {
    throw new Error('Base URL 无效');
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') throw new Error('Base URL 无效');
  return trimmed.replace(/\/$/, '');
}

async function requireUser(request: FastifyRequest, reply: FastifyReply): Promise<PublicUser | null> {
  const user = await userFromCookie(request.headers.cookie);
  if (!user) {
    await reply.code(401).send({ error: '请先登录' });
    return null;
  }
  return user;
}

function sendUser(reply: FastifyReply, status: number, user: PublicUser, token: string) {
  return reply.code(status).header('set-cookie', sessionCookie(token)).send({ user });
}

/** error 重试、以及还没有任务的 pending，都补一条回答任务。已有任务时入队会被唯一约束挡住。 */
async function prepareStreamNode(nodeId: string, userId: string): Promise<NodeRecord | null> {
  const node = await getNode(nodeId);
  if (!node) return null;
  if (node.status === 'error') {
    const reset = await markPending(nodeId);
    if (!reset) return null;
    await enqueueAnswer(userId, nodeId);
    return reset;
  }
  if (node.status !== 'pending') return node;
  if (!node.providerId || !node.model) {
    return completeQuestionNode(nodeId, { reply: '未选择模型', status: 'error' });
  }
  await enqueueAnswer(userId, nodeId);
  return node;
}

export async function registerRoutes(app: FastifyInstance): Promise<void> {
  app.get('/api/health', async () => ({ ok: true, service: 'tributary' }));

  app.post('/api/auth/register', async (request, reply) => {
    const parsed = registerBody.safeParse(request.body ?? {});
    if (!parsed.success) return badRequest(reply, '请填写有效邮箱，密码至少 8 位');
    try {
      const result = await registerUser(parsed.data);
      return sendUser(reply, 201, result.user, result.token);
    } catch (error) {
      if (error instanceof AuthError) return reply.code(error.status).send({ error: error.message });
      throw error;
    }
  });

  app.post('/api/auth/login', async (request, reply) => {
    const parsed = loginBody.safeParse(request.body ?? {});
    if (!parsed.success) return badRequest(reply, '请填写邮箱和密码');
    try {
      const result = await loginUser(parsed.data);
      return sendUser(reply, 200, result.user, result.token);
    } catch (error) {
      if (error instanceof AuthError) return reply.code(error.status).send({ error: error.message });
      throw error;
    }
  });

  app.post('/api/auth/logout', async (request, reply) => {
    await logoutToken(readSessionToken(request.headers.cookie));
    return reply.code(204).header('set-cookie', clearSessionCookie()).send();
  });

  app.get('/api/auth/me', async (request, reply) => {
    const user = await requireUser(request, reply);
    if (!user) return;
    return { user };
  });

  app.get('/api/agent-settings', async (request, reply) => {
    const user = await requireUser(request, reply);
    if (!user) return;
    return readAgentSettings(user.id);
  });

  app.put('/api/agent-settings', async (request, reply) => {
    const user = await requireUser(request, reply);
    if (!user) return;
    const parsed = agentSettingsBody.safeParse(request.body);
    if (!parsed.success) return badRequest(reply, '提示词必须是文本或 null，且不能超过 20000 字符');
    return saveAgentSettings(user.id, parsed.data.systemPrompt);
  });

  app.patch('/api/auth/profile', async (request, reply) => {
    const user = await requireUser(request, reply);
    if (!user) return;
    const parsed = profileBody.safeParse(request.body ?? {});
    if (!parsed.success) return badRequest(reply, '参数无效');
    return { user: await updateProfile(user.id, parsed.data) };
  });

  /** 上传头像：body 为客户端压缩后的 data URL，服务端写对象存储并只存 key */
  app.put('/api/auth/avatar', async (request, reply) => {
    const user = await requireUser(request, reply);
    if (!user) return;
    const parsed = avatarBody.safeParse(request.body ?? {});
    if (!parsed.success) return badRequest(reply, '头像格式无效');
    try {
      return { user: await uploadAvatar(user.id, parsed.data.data) };
    } catch (error) {
      if (error instanceof AuthError) return reply.code(error.status).send({ error: error.message });
      throw error;
    }
  });

  app.delete('/api/auth/avatar', async (request, reply) => {
    const user = await requireUser(request, reply);
    if (!user) return;
    await removeAvatar(user.id);
    return reply.code(204).send();
  });

  app.post('/api/auth/password', async (request, reply) => {
    const user = await requireUser(request, reply);
    if (!user) return;
    const parsed = passwordBody.safeParse(request.body ?? {});
    if (!parsed.success) return badRequest(reply, '新密码至少 8 位');
    try {
      await changePassword(user.id, parsed.data.currentPassword, parsed.data.newPassword);
      return reply.code(204).send();
    } catch (error) {
      if (error instanceof AuthError) return reply.code(error.status).send({ error: error.message });
      throw error;
    }
  });

  app.get('/api/conversations', async (request, reply) => {
    const user = await requireUser(request, reply);
    if (!user) return;
    return { conversations: await listConversations(user.id) };
  });

  app.post('/api/conversations', async (request, reply) => {
    const user = await requireUser(request, reply);
    if (!user) return;
    const parsed = createConversationBody.safeParse(request.body ?? {});
    if (!parsed.success) return badRequest(reply, '参数无效');
    return reply.code(201).send(await createConversation(user.id, parsed.data.title));
  });

  app.get('/api/conversations/:id', async (request, reply) => {
    const user = await requireUser(request, reply);
    if (!user) return;
    const { id } = request.params as { id: string };
    const loaded = await loadConversation(id, user.id);
    if (!loaded) return reply.code(404).send({ error: '对话不存在' });
    return loaded;
  });

  app.post('/api/conversations/:id/nodes', async (request, reply) => {
    const user = await requireUser(request, reply);
    if (!user) return;
    const { id } = request.params as { id: string };
    const parsed = createNodeBody.safeParse(request.body);
    if (!parsed.success) return badRequest(reply, '参数无效');
    try {
      const node = await createQuestionNode({
        userId: user.id,
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
      const status = message === '对话不存在' || message === '模型配置不存在' ? 404 : 400;
      return reply.code(status).send({ error: message });
    }
  });

  app.get('/api/nodes/:id/stream', async (request, reply) => {
    const user = await requireUser(request, reply);
    if (!user) return;
    const { id } = request.params as { id: string };
    if (!(await nodeOwnedBy(id, user.id))) return reply.code(404).send({ error: '节点不存在' });
    const node = await prepareStreamNode(id, user.id);
    if (!node) return reply.code(404).send({ error: '节点不存在' });

    reply.hijack();
    reply.raw.writeHead(200, {
      'content-type': 'text/event-stream',
      'cache-control': 'no-cache',
      connection: 'keep-alive',
      'x-accel-buffering': 'no',
    });
    const send = (event: string, data: unknown) => {
      reply.raw.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
    };

    let closed = false;
    let lastReply = node.reply ?? '';
    let lastThinking = node.thinking ?? '';
    const phase = node.status === 'done' ? 'done' : node.status === 'error' ? 'error' : 'running';
    send('snapshot', { reply: lastReply, thinking: lastThinking, phase });
    if (node.status === 'done' || node.status === 'error') {
      if (node.status === 'done') send('done', { node });
      else send('error', { message: node.reply || '模型调用失败' });
      reply.raw.end();
      return;
    }

    const timers: {
      ping?: ReturnType<typeof setInterval>;
      poll?: ReturnType<typeof setInterval>;
      unsubscribe: () => void;
    } = { unsubscribe: () => {} };
    const finish = (current: NodeRecord) => {
      if (closed) return;
      closed = true;
      if (timers.ping) clearInterval(timers.ping);
      if (timers.poll) clearInterval(timers.poll);
      timers.unsubscribe();
      if (current.status === 'done') send('done', { node: current });
      else send('error', { message: current.reply || '模型调用失败' });
      reply.raw.end();
    };

    let reading = false;
    let again = false;
    const pull = () => {
      if (closed) return;
      if (reading) {
        again = true;
        return;
      }
      reading = true;
      void getNode(id)
        .then((current) => {
          if (!current || closed) return;
          const replyText = current.reply ?? '';
          const thinkingText = current.thinking ?? '';
          if (replyText !== lastReply || thinkingText !== lastThinking) {
            lastReply = replyText;
            lastThinking = thinkingText;
            send('delta', { reply: replyText, thinking: thinkingText });
          }
          if (current.status === 'done' || current.status === 'error') finish(current);
        })
        .catch((error: unknown) => {
          console.error('stream.poll_failed', error instanceof Error ? error.message : error);
        })
        .finally(() => {
          reading = false;
          if (again && !closed) {
            again = false;
            pull();
          }
        });
    };

    // NOTIFY 到了就立刻读。轮询只兜底，避免通知丢失时卡片一直空着。
    timers.unsubscribe = subscribeStream((nodeId) => {
      if (nodeId === id) pull();
    });
    timers.ping = setInterval(() => {
      if (!closed) reply.raw.write(': ping\n\n');
    }, 15_000);
    timers.poll = setInterval(() => {
      if (!closed) pull();
    }, 400);
    request.raw.on('close', () => {
      if (closed) return;
      closed = true;
      if (timers.ping) clearInterval(timers.ping);
      if (timers.poll) clearInterval(timers.poll);
      timers.unsubscribe();
    });
  });

  app.delete('/api/conversations/:id', async (request, reply) => {
    const user = await requireUser(request, reply);
    if (!user) return;
    const { id } = request.params as { id: string };
    await deleteConversation(id, user.id);
    return reply.code(204).send();
  });

  /** 重新生成：重置为 pending 并入队回答任务，客户端经 SSE 看到思考和回答。可以改用另一个模型。 */
  app.post('/api/nodes/:id/regenerate', async (request, reply) => {
    const user = await requireUser(request, reply);
    if (!user) return;
    const { id } = request.params as { id: string };
    const parsed = regenerateBody.safeParse(request.body ?? {});
    if (!parsed.success) return badRequest(reply, '参数无效');
    const override =
      parsed.data.providerId && parsed.data.model ? { providerId: parsed.data.providerId, model: parsed.data.model } : undefined;
    try {
      const node = await regenerateQuestionNode(id, user.id, override);
      if (!node) return reply.code(404).send({ error: '节点不存在' });
      if (node.providerId && node.model) await enqueueAnswer(user.id, id);
      return node;
    } catch (error) {
      const message = error instanceof Error ? error.message : '重新生成失败';
      const status = message === '模型配置不存在' ? 404 : 400;
      return reply.code(status).send({ error: message });
    }
  });

  /** 粘贴大纲：只建问题，不调用模型。 */
  app.post('/api/conversations/:id/outline', async (request, reply) => {
    const user = await requireUser(request, reply);
    if (!user) return;
    const { id } = request.params as { id: string };
    const parsed = outlineBody.safeParse(request.body);
    if (!parsed.success) return badRequest(reply, '参数无效');
    const inserted = await insertOutlineNodes(id, user.id, parsed.data.parentId, parsed.data.items);
    if (!inserted) return badRequest(reply, '不能放入这些问题');
    return reply.code(201).send(inserted);
  });

  /** 删除节点及其整棵子树 */
  app.delete('/api/nodes/:id', async (request, reply) => {
    const user = await requireUser(request, reply);
    if (!user) return;
    const { id } = request.params as { id: string };
    const removed = await deleteNodeSubtree(id, user.id);
    if (!removed) return reply.code(404).send({ error: '节点不存在' });
    return reply.code(204).send();
  });

  app.patch('/api/nodes/:id', async (request, reply) => {
    const user = await requireUser(request, reply);
    if (!user) return;
    const { id } = request.params as { id: string };
    const body = request.body;
    if (body && typeof body === 'object' && 'question' in body) {
      const parsed = renameBody.safeParse(body);
      if (!parsed.success) return badRequest(reply, '参数无效');
      const node = await renameQuestion(id, user.id, parsed.data.question);
      if (!node) return reply.code(404).send({ error: '节点不存在' });
      return node;
    }
    if (body && typeof body === 'object' && 'note' in body) {
      const parsed = noteBody.safeParse(body);
      if (!parsed.success) return badRequest(reply, '参数无效');
      const node = await setNodeNote(id, user.id, parsed.data.note);
      if (!node) return reply.code(404).send({ error: '节点不存在' });
      return node;
    }
    if (body && typeof body === 'object' && 'sticker' in body) {
      const parsed = stickerBody.safeParse(body);
      if (!parsed.success) return badRequest(reply, '参数无效');
      const node = await setNodeSticker(id, user.id, parsed.data.sticker);
      if (!node) return reply.code(404).send({ error: '节点不存在' });
      return node;
    }
    const parsed = collapseBody.safeParse(body);
    if (!parsed.success) return badRequest(reply, '参数无效');
    const node = await setCollapsed(id, user.id, parsed.data.collapsed);
    if (!node) return reply.code(404).send({ error: '节点不存在' });
    return node;
  });

  /** 停掉正在生成的回答。已经写出的留下。 */
  app.post('/api/nodes/:id/cancel', async (request, reply) => {
    const user = await requireUser(request, reply);
    if (!user) return;
    const { id } = request.params as { id: string };
    const parsed = cancelBody.safeParse(request.body ?? {});
    if (!parsed.success) return badRequest(reply, '参数无效');
    const node = await cancelQuestionNode(id, user.id, parsed.data.reply);
    if (!node) return reply.code(404).send({ error: '节点不存在' });
    return node;
  });

  app.post('/api/conversations/:id/links', async (request, reply) => {
    const user = await requireUser(request, reply);
    if (!user) return;
    const { id } = request.params as { id: string };
    const parsed = linkBody.safeParse(request.body);
    if (!parsed.success) return badRequest(reply, '参数无效');
    const created = await createNodeLink(id, user.id, parsed.data.sourceId, parsed.data.targetId);
    if (!created) return badRequest(reply, '不能这样连');
    return reply.code(created.created ? 201 : 200).send(created);
  });

  app.delete('/api/links/:id', async (request, reply) => {
    const user = await requireUser(request, reply);
    if (!user) return;
    const { id } = request.params as { id: string };
    const removed = await deleteNodeLink(id, user.id);
    if (!removed) return reply.code(404).send({ error: '关系线不存在' });
    return reply.code(204).send();
  });

  app.post('/api/nodes/:id/move', async (request, reply) => {
    const user = await requireUser(request, reply);
    if (!user) return;
    const { id } = request.params as { id: string };
    const parsed = moveBody.safeParse(request.body);
    if (!parsed.success) return badRequest(reply, '参数无效');
    const moved = await moveQuestionNode(id, user.id, parsed.data.parentId, parsed.data.index);
    if (!moved) return badRequest(reply, '不能这样移动');
    return { nodes: moved };
  });

  app.post('/api/nodes/:id/copy', async (request, reply) => {
    const user = await requireUser(request, reply);
    if (!user) return;
    const { id } = request.params as { id: string };
    const copied = await copyQuestionSubtree(id, user.id);
    if (!copied) return reply.code(404).send({ error: '节点不存在' });
    return copied;
  });

  app.post('/api/conversations/:id/collapsed', async (request, reply) => {
    const user = await requireUser(request, reply);
    if (!user) return;
    const { id } = request.params as { id: string };
    const parsed = collapseManyBody.safeParse(request.body);
    if (!parsed.success) return badRequest(reply, '参数无效');
    const updated = await setCollapsedMany(id, user.id, parsed.data.changes);
    if (!updated) return reply.code(404).send({ error: '对话不存在' });
    return { nodes: updated };
  });

  app.post('/api/conversations/:id/restore', async (request, reply) => {
    const user = await requireUser(request, reply);
    if (!user) return;
    const { id } = request.params as { id: string };
    const parsed = restoreBody.safeParse(request.body);
    if (!parsed.success) return badRequest(reply, '参数无效');
    const restored = await restoreQuestionSubtree(id, user.id, parsed.data.nodes);
    if (!restored) return badRequest(reply, '不能恢复这一枝');
    return { nodes: restored };
  });

  app.get('/api/model-configs', async (request, reply) => {
    const user = await requireUser(request, reply);
    if (!user) return;
    return { configs: await listModelConfigs(user.id) };
  });

  app.post('/api/model-configs', async (request, reply) => {
    const user = await requireUser(request, reply);
    if (!user) return;
    const parsed = modelConfigBody.safeParse(request.body);
    if (!parsed.success || !isModelProvider(parsed.data.provider)) return badRequest(reply, '参数无效');
    const provider: ModelProvider = parsed.data.provider;
    try {
      const created = await createModelConfig({
        userId: user.id,
        provider,
        model: parsed.data.model,
        apiKey: parsed.data.apiKey,
        baseUrl: cleanBaseUrl(parsed.data.baseUrl),
        isDefault: parsed.data.isDefault ?? false,
      });
      return reply.code(201).send(created);
    } catch (error) {
      const message = error instanceof Error ? error.message : '保存模型失败';
      return badRequest(reply, message);
    }
  });

  app.post('/api/model-configs/:id/default', async (request, reply) => {
    const user = await requireUser(request, reply);
    if (!user) return;
    const { id } = request.params as { id: string };
    const updated = await setDefaultModelConfig(id, user.id);
    if (!updated) return reply.code(404).send({ error: '模型配置不存在' });
    return updated;
  });

  app.delete('/api/model-configs/:id', async (request, reply) => {
    const user = await requireUser(request, reply);
    if (!user) return;
    const { id } = request.params as { id: string };
    const removed = await deleteModelConfig(id, user.id);
    if (!removed) return reply.code(404).send({ error: '模型配置不存在' });
    return reply.code(204).send();
  });

  app.get('/api/usage', async (request, reply) => {
    const user = await requireUser(request, reply);
    if (!user) return;
    return readUsage(user.id);
  });

  app.get('/api/search', async (request, reply) => {
    const user = await requireUser(request, reply);
    if (!user) return;
    const query = request.query as { q?: string };
    return { hits: await searchNodes(query.q ?? '', user.id) };
  });
}
