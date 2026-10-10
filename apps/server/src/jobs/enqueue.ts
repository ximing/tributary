import { randomUUID } from 'node:crypto';
import { db } from '../db/client.js';
import { jobs, type JobRow } from '../db/schema.js';

export type JobWriter = Pick<typeof db, 'insert'>;

export interface EnqueueJobInput {
  userId: string;
  type: 'answer';
  payload: { nodeId: string };
  runAt?: Date;
}

function isUniqueViolation(error: unknown): boolean {
  let current: unknown = error;
  for (let depth = 0; depth < 4 && typeof current === 'object' && current !== null; depth += 1) {
    if ('code' in current && (current as { code?: unknown }).code === '23505') return true;
    current = 'cause' in current ? (current as { cause?: unknown }).cause : undefined;
  }
  return false;
}

export async function enqueueJob(writer: JobWriter, input: EnqueueJobInput): Promise<JobRow> {
  const [row] = await writer
    .insert(jobs)
    .values({
      id: randomUUID(),
      userId: input.userId,
      type: input.type,
      status: 'pending',
      payload: input.payload,
      ...(input.runAt ? { runAt: input.runAt } : {}),
    })
    .returning();
  if (!row) throw new Error('创建任务失败');
  return row;
}

/** 同一个节点只保留一条 pending/running 的回答任务。重复入队时沿用已有的那条。 */
export async function enqueueAnswer(userId: string, nodeId: string, writer: JobWriter = db): Promise<void> {
  try {
    await enqueueJob(writer, { userId, type: 'answer', payload: { nodeId } });
  } catch (error) {
    if (!isUniqueViolation(error)) throw error;
  }
}
