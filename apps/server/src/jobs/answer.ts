import { readAgentSettings } from '../agent/settings.js';
import { z } from 'zod';
import { AskError, streamModel } from '../agent/ask.js';
import { messagesForNode } from '../agent/context.js';
import { visibleDraft, type DraftText } from '../agent/draft-text.js';
import { AgentTerminalError } from '../agent/terminal-error.js';
import type { JobRow } from '../db/schema.js';
import { completeQuestionNode, getNode, listConversationNodes, writePendingDraft } from '../conversations/service.js';
import { getModelSecret } from '../providers/service.js';
import { createDraftSink } from './draft-sink.js';
import { heartbeatJob, isJobRunning } from './heartbeat.js';

const HEARTBEAT_MS = 15_000;
const RUN_TIMEOUT_MS = 600_000;

const payloadSchema = z.object({ nodeId: z.string().uuid() });

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
  await writePendingDraft(nodeId, { reply: null, thinking: null });
  if (!node.providerId || !node.model) throw new AgentTerminalError('未选择模型');
  const provider = await getModelSecret(node.providerId);
  if (!provider) throw new AgentTerminalError('模型配置不存在');

  const settings = await readAgentSettings(job.userId);
  let raw: DraftText = { reply: '', thinking: '' };
  const draft = createDraftSink((text) => writePendingDraft(nodeId, { reply: text.reply, thinking: text.thinking || null }));
  const pushDraft = (next: DraftText) => {
    raw = next;
    draft.push(visibleDraft(next));
  };
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), RUN_TIMEOUT_MS);
  timeout.unref?.();
  const heartbeat = setInterval(() => {
    void heartbeatJob(job.id);
  }, HEARTBEAT_MS);
  heartbeat.unref?.();
  // 停止按钮把任务标成 failed。这里尽快看到，不等 15 秒的心跳。
  const watch = setInterval(() => {
    void isJobRunning(job.id).then((running) => {
      if (!running) controller.abort();
    });
  }, 400);
  watch.unref?.();

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
        onDelta: (text) => pushDraft({ reply: text, thinking: raw.thinking }),
        onThinking: (thinking) => pushDraft({ reply: raw.reply, thinking }),
      },
    );
    await draft.finish();
    if (!(await isJobRunning(job.id))) return;
    const visible = visibleDraft({ reply: answer.text, thinking: answer.thinking || raw.thinking });
    await completeQuestionNode(nodeId, {
      reply: visible.reply,
      thinking: visible.thinking || null,
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
    clearInterval(watch);
  }
}
