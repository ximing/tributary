import { drizzle } from 'drizzle-orm/node-postgres';
import pg from 'pg';
import { config } from '../config.js';

const { Pool } = pg;

export const pool = new Pool({ connectionString: config.databaseUrl });
export const db = drizzle(pool);

export async function closeDb(): Promise<void> {
  await pool.end();
}
