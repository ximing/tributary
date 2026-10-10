import { buildApp } from './app.js';
import { config } from './config.js';
import { ensureSchema } from './db/ensure.js';
import { ensureSearchIndex } from './search/index-nodes.js';

const app = await buildApp();
await ensureSchema();
try {
  await ensureSearchIndex();
} catch (error) {
  console.error('search.ensure_failed', error instanceof Error ? error.message : error);
}
await app.listen({ port: config.port, host: config.host });
console.log(`tributary listening on ${config.host}:${String(config.port)}`);
