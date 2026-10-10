import { and, eq } from 'drizzle-orm';
import { db } from '../db/client.js';
import { jobs } from '../db/schema.js';

export async function heartbeatJob(jobId: string, now = new Date()): Promise<void> {
  try {
    await db.update(jobs).set({ updatedAt: now }).where(and(eq(jobs.id, jobId), eq(jobs.status, 'running')));
  } catch (error) {
    console.warn('job.heartbeat_failed', jobId, error instanceof Error ? error.message : error);
  }
}

/** 行还在 running 才返回 true。读失败时返回 true，避免一次抖动掐掉正在跑的回答。 */
export async function isJobRunning(jobId: string): Promise<boolean> {
  try {
    const [row] = await db.select({ status: jobs.status }).from(jobs).where(eq(jobs.id, jobId)).limit(1);
    return row?.status === 'running';
  } catch (error) {
    console.warn('job.status_probe_failed', jobId, error instanceof Error ? error.message : error);
    return true;
  }
}
