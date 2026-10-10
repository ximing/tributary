import { readAgentSettings } from '../agent/settings.js';
import { z } from 'zod';
import { AskError, streamModel } from '../agent/ask.js';
import { messagesForNode } from '../agent/context.js';
import { AgentTerminalError } from '../agent/terminal-error.js';
import type { JobRow } from '../db/schema.js';
import { completeQuestionNode, getNode, listConversationNodes, writePendingReply } from '../conversations/service.js';
import { getModelSecret } from '../providers/service.js';
import { heartbeatJob, isJobRunning } from './heartbeat.js';

const DRAFT_FLUSH_MS = 150;
const HEARTBEAT_MS = 15_000;
const RUN_TIMEOUT_MS = 600_000;

const payloadSchema = z.object({ nodeId: z.string().uuid() });

function createDraftSink(write: (text: string) => Promise<void>): {
  push(text: string): void;
  finish(): Promise<void>;
} {
  let text = '';
  let timer: ReturnType<typeof setTimeout> | null = null;
  let chain = Promise.resolve();
  let dirty = false;

  const flush = () => {
    dirty = false;
    const snapshot = text;
    chain = chain.then(() => write(snapshot)).catch((error: unknown) => {
      console.warn('answer.draft_failed', error instanceof Error ? error.message : error);
    });
  };

  return {
    push(next) {
      text = next;
      dirty = true;
      if (timer) return;
      timer = setTimeout(() => {
        timer = null;
        flush();
      }, DRAFT_FLUSH_MS);
      timer.unref?.();
    },
    async finish() {
      if (timer) {
        clearTimeout(timer);
        timer = null;
      }
      if (dirty) flush();
      await chain;
    },
  };
}

export function answerNodeId(job: JobRow): string | null {
  const parsed = payloadSchema.safeParse(job.payload);
  return parsed.success ? parsed.data.nodeId : null;
}

export async function failAnswerJob(job: JobRow, message: string): Promise<void> {
  const nodeId = answerNodeId(job);
  if (!nodeId) return;
  const node = await getNode(nodeId);
  if (!node || node.status !== 'pending') return;
  try {
    await completeQuestionNode(nodeId, { reply: message, status: 'error' });
  } catch (error) {
    console.error('job.answer_settle_failed', error instanceof Error ? error.message : error);
  }
}

export async function processAnswer(job: JobRow): Promise<void> {
  const nodeId = answerNodeId(job);
  if (!nodeId) throw new AgentTerminalError('任务参数无效');
  const node = await getNode(nodeId);
  if (!node || node.status !== 'pending') return;
  await writePendingReply(nodeId, null);
  if (!node.providerId || !node.model) throw new AgentTerminalError('未选择模型');
  const provider = await getModelSecret(node.providerId);
  if (!provider) throw new AgentTerminalError('模型配置不存在');

  const settings = await readAgentSettings(job.userId);
  const draft = createDraftSink((text) => writePendingReply(nodeId, text));
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), RUN_TIMEOUT_MS);
  timeout.unref?.();
  const heartbeat = setInterval(() => {
    void heartbeatJob(job.id);
    void isJobRunning(job.id).then((running) => {
      if (!running) controller.abort();
    });
  }, HEARTBEAT_MS);
  heartbeat.unref?.();

  try {
    const lineage = await listConversationNodes(nodeId);
    if (!lineage) return;
    const messages = messagesForNode(lineage, nodeId);
    if (messages.at(-1)?.role !== 'user') throw new AgentTerminalError('没有可发送的问题');
    const answer = await streamModel(
      {
        provider: provider.provider,
        apiKey: provider.apiKey,
        baseUrl: provider.baseUrl,
        modelId: node.model,
        systemPrompt: settings.systemPrompt ?? settings.defaultSystemPrompt,
        messages,
      },
      {
        signal: controller.signal,
        onDelta: (text) => draft.push(text),
      },
    );
    await draft.finish();
    if (!(await isJobRunning(job.id))) return;
    await completeQuestionNode(nodeId, {
      reply: answer.text,
      status: 'done',
      providerName: provider.label,
      model: node.model,
      promptTokens: answer.promptTokens,
      completionTokens: answer.completionTokens,
      totalTokens: answer.totalTokens,
    });
  } catch (error) {
    await draft.finish();
    if (!(await isJobRunning(job.id))) return;
    if (error instanceof AskError && (error.message === '模型返回了空回复' || error.message === '模型没有返回')) {
      throw new AgentTerminalError(error.message);
    }
    throw error;
  } finally {
    clearTimeout(timeout);
    clearInterval(heartbeat);
  }
}
