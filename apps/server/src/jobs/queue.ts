import { and, asc, eq, lte, sql } from 'drizzle-orm';
import { config } from '../config.js';
import { db } from '../db/client.js';
import { jobs, type JobRow } from '../db/schema.js';
import { failAnswerJob } from './answer.js';
import { heartbeatJob } from './heartbeat.js';
import { processJob } from './processors.js';
import { backoffMs, failureDisposition, RescheduleJobError } from './queue-logic.js';

export { heartbeatJob };
export { enqueueAnswer, enqueueJob } from './enqueue.js';
export { RescheduleJobError };

export const BACKOFF_MS = [2_000, 8_000, 32_000] as const;

export async function claimDueJobs(now = new Date(), limit = config.workerClaimLimit, userId?: string): Promise<JobRow[]> {
  if (limit <= 0) return [];
  // runAt 用数据库时钟写入，领取也用数据库时钟，避免应用时钟偏慢时刚入队的任务领不到。
  const due = userId
    ? and(eq(jobs.status, 'pending'), lte(jobs.runAt, sql`now()`), eq(jobs.userId, userId))
    : and(eq(jobs.status, 'pending'), lte(jobs.runAt, sql`now()`));
  return db.transaction(async (tx) => {
    const candidates = await tx
      .select()
      .from(jobs)
      .where(due)
      .orderBy(asc(jobs.runAt), asc(jobs.id))
      .limit(limit)
      .for('update', { skipLocked: true });

    const claimed: JobRow[] = [];
    for (const candidate of candidates) {
      const [row] = await tx
        .update(jobs)
        .set({ status: 'running', attempts: candidate.attempts + 1, updatedAt: now })
        .where(and(eq(jobs.id, candidate.id), eq(jobs.status, 'pending')))
        .returning();
      if (row) claimed.push(row);
    }
    return claimed;
  });
}

/** 心跳停了的 running 任务回到 pending，由下一次领取重新回答。 */
export async function recoverStuckJobs(now = new Date()): Promise<number> {
  const cutoff = new Date(now.getTime() - config.workerStuckMs);
  const recovered = await db
    .update(jobs)
    .set({ status: 'pending', runAt: now, updatedAt: now })
    .where(and(eq(jobs.status, 'running'), lte(jobs.updatedAt, cutoff)))
    .returning({ id: jobs.id });
  return recovered.length;
}

function errorMessage(err: unknown): string {
  const raw = err instanceof Error ? err.message : String(err);
  const trimmed = raw.trim() || '模型调用失败';
  return trimmed.length > 2000 ? trimmed.slice(0, 2000) : trimmed;
}

async function markDone(job: JobRow, now: Date): Promise<void> {
  await db
    .update(jobs)
    .set({ status: 'done', finishedAt: now, lastError: null, updatedAt: now })
    .where(and(eq(jobs.id, job.id), eq(jobs.status, 'running')));
}

async function markFailed(job: JobRow, message: string, now: Date): Promise<void> {
  await db
    .update(jobs)
    .set({ status: 'failed', lastError: message, finishedAt: now, updatedAt: now })
    .where(and(eq(jobs.id, job.id), eq(jobs.status, 'running')));
}

async function settleJobFailure(job: JobRow, err: unknown, now: Date): Promise<void> {
  const message = errorMessage(err);
  const disposition = failureDisposition(err, job.attempts, config.jobMaxAttempts);
  if (disposition === 'terminal' || disposition === 'exhausted') {
    await markFailed(job, message, now);
    console.warn('job.failed', job.id, job.type, job.attempts, disposition, message);
    await failAnswerJob(job, message);
    return;
  }
  const wait = backoffMs(job.attempts, BACKOFF_MS);
  await db
    .update(jobs)
    .set({ status: 'pending', runAt: new Date(now.getTime() + wait), lastError: message, updatedAt: now })
    .where(and(eq(jobs.id, job.id), eq(jobs.status, 'running')));
  console.warn('job.retry', job.id, job.attempts, wait, message);
}

async function rescheduleJob(job: JobRow, runAt: Date, now: Date): Promise<void> {
  await db
    .update(jobs)
    .set({ status: 'pending', runAt, attempts: Math.max(0, job.attempts - 1), updatedAt: now })
    .where(and(eq(jobs.id, job.id), eq(jobs.status, 'running')));
}

async function processOne(job: JobRow): Promise<void> {
  try {
    await processJob(job);
    await markDone(job, new Date());
  } catch (error) {
    if (error instanceof RescheduleJobError) {
      try {
        await rescheduleJob(job, error.runAt, new Date());
      } catch (writeError) {
        console.error('job.finalize_failed', writeError instanceof Error ? writeError.message : writeError);
      }
      return;
    }
    console.error('job.process_failed', error instanceof Error ? error.message : error);
    try {
      await settleJobFailure(job, error, new Date());
    } catch (writeError) {
      console.error('job.finalize_failed', writeError instanceof Error ? writeError.message : writeError);
    }
  }
}

let stopping = false;
const active = new Set<Promise<void>>();

export async function drainJobs(): Promise<void> {
  stopping = true;
  if (active.size > 0) await Promise.allSettled([...active]);
}

export async function processDueJobs(now = new Date()): Promise<number> {
  if (stopping) return 0;
  const capacity = Math.max(0, config.workerClaimLimit - active.size);
  if (capacity <= 0) return 0;
  const claimed = await claimDueJobs(now, capacity);
  for (const job of claimed) {
    const task = processOne(job);
    active.add(task);
    void task.finally(() => {
      active.delete(task);
    });
  }
  return claimed.length;
}

/** 同步跑完这一批到期任务。传入 userId 时只领这个用户的，测试用它避免领走别人的任务。 */
export async function runDueJobs(now = new Date(), userId?: string): Promise<number> {
  const claimed = await claimDueJobs(now, config.workerClaimLimit, userId);
  await Promise.all(claimed.map((job) => processOne(job)));
  return claimed.length;
}
