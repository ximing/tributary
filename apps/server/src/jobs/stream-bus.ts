import type { PoolClient } from 'pg';
import { pool } from '../db/client.js';

export const STREAM_CHANNEL = 'tributary_node';

type Listener = (nodeId: string) => void;

/**
 * 回答在 worker 进程里生成，页面在 API 进程里订阅。
 * 同一进程用内存分发；跨进程用 Postgres NOTIFY，API 上的 LISTEN 再分发给 SSE。
 */
export function createStreamHub(): {
  publish(nodeId: string): void;
  subscribe(listener: Listener): () => void;
} {
  const listeners = new Set<Listener>();
  return {
    publish(nodeId) {
      for (const listener of listeners) listener(nodeId);
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}

const hub = createStreamHub();
let client: PoolClient | null = null;
let starting: Promise<void> | null = null;

export function subscribeStream(listener: Listener): () => void {
  const unsubscribe = hub.subscribe(listener);
  void ensureBus();
  return unsubscribe;
}

export async function notifyNodeStream(nodeId: string): Promise<void> {
  hub.publish(nodeId);
  try {
    await pool.query('SELECT pg_notify($1, $2)', [STREAM_CHANNEL, nodeId]);
  } catch (error) {
    console.warn('stream.notify_failed', error instanceof Error ? error.message : error);
  }
}

async function resetBus(broken: PoolClient): Promise<void> {
  if (client !== broken) return;
  client = null;
  starting = null;
  try {
    broken.release(true);
  } catch {
    /* 连接已经断了 */
  }
  await ensureBus();
}

async function ensureBus(): Promise<void> {
  if (client || starting) return starting ?? Promise.resolve();
  starting = (async () => {
    const next = await pool.connect();
    next.on('error', (error: Error) => {
      console.error('stream.listen_error', error.message);
      void resetBus(next);
    });
    next.on('notification', (message) => {
      if (message.channel !== STREAM_CHANNEL || !message.payload) return;
      hub.publish(message.payload);
    });
    await next.query(`LISTEN ${STREAM_CHANNEL}`);
    client = next;
  })().catch((error: unknown) => {
    starting = null;
    console.error('stream.listen_failed', error instanceof Error ? error.message : error);
  });
  return starting;
}
