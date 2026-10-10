import { pool } from './db/client.js';
import { ensureSchema } from './db/ensure.js';
import { ensureSearchIndex } from './search/index-nodes.js';

/** 容器启动前跑一次。表结构和搜索索引都是幂等的。 */
await ensureSchema();
try {
  await ensureSearchIndex();
} catch (error) {
  console.error('search.ensure_failed', error instanceof Error ? error.message : error);
}
await pool.end();
