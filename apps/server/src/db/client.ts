import { drizzle } from 'drizzle-orm/node-postgres';
import pg from 'pg';
import { config } from '../config.js';

const { Pool } = pg;

export const pool = new Pool({ connectionString: config.databaseUrl });
// 空闲连接被远端断开时，pg 会在 Pool 上抛 error。没人听的话整个进程退出。
pool.on('error', (error) => {
  console.error('db.pool.error', error.message);
});
export const db = drizzle(pool);

export async function closeDb(): Promise<void> {
  await pool.end();
}
