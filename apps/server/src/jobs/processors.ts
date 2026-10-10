import { AgentTerminalError } from '../agent/terminal-error.js';
import type { JobRow } from '../db/schema.js';
import { processAnswer } from './answer.js';

export async function processJob(job: JobRow): Promise<void> {
  if (job.type !== 'answer') throw new AgentTerminalError(`未知任务类型 ${job.type}`);
  await processAnswer(job);
}
