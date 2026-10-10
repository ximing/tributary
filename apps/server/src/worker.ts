import { config } from './config.js';
import { pool } from './db/client.js';
import { ensureSchema } from './db/ensure.js';
import { drainJobs, processDueJobs, recoverStuckJobs } from './jobs/queue.js';

let stopping = false;
let ticking = false;

async function tick(): Promise<void> {
  if (stopping || ticking) return;
  ticking = true;
  try {
    const recovered = await recoverStuckJobs();
    if (recovered > 0) console.info('worker.recover', recovered);
    const claimed = await processDueJobs();
    if (claimed > 0) console.info('worker.tick', claimed);
  } catch (error) {
    console.error('worker.tick_failed', error instanceof Error ? error.message : error);
  } finally {
    ticking = false;
  }
}

await ensureSchema();
const poll = setInterval(() => {
  void tick();
}, config.workerPollMs);
void tick();
console.info(`tributary worker polling every ${String(config.workerPollMs)}ms`);

function shutdown(signal: string): void {
  if (stopping) return;
  stopping = true;
  console.info(`worker received ${signal}`);
  clearInterval(poll);
  void (async () => {
    await drainJobs();
    await pool.end();
  })().then(
    () => process.exit(0),
    (error: unknown) => {
      console.error('worker.shutdown_failed', error instanceof Error ? error.message : error);
      process.exit(1);
    },
  );
}

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, () => {
    shutdown(signal);
  });
}
