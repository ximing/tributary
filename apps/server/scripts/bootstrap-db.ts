import { config as loadEnv } from 'dotenv';
import pg from 'pg';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
loadEnv({ path: resolve(here, '../../../.env') });
if (!process.env.PGGSSENCMODE) process.env.PGGSSENCMODE = 'disable';

const bootstrapUrl = process.env.BOOTSTRAP_DATABASE_URL;
const password = process.env.APP_DB_PASSWORD;
if (!bootstrapUrl || !password) {
  console.error('需要 BOOTSTRAP_DATABASE_URL 和 APP_DB_PASSWORD。这个脚本只用超级用户建角色，应用本身不会使用超级用户。');
  process.exit(1);
}

const client = new pg.Client({ connectionString: bootstrapUrl });
await client.connect();
try {
  await client.query(
    `DO $$
     BEGIN
       IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'tributary_app') THEN
         CREATE ROLE tributary_app LOGIN PASSWORD '${password.replaceAll("'", "''")}' NOSUPERUSER NOCREATEDB NOCREATEROLE;
       ELSE
         ALTER ROLE tributary_app WITH LOGIN PASSWORD '${password.replaceAll("'", "''")}' NOSUPERUSER NOCREATEDB NOCREATEROLE;
       END IF;
     END $$;`,
  );
  for (const name of ['tributary_test', 'tributary_prod']) {
    const existing = await client.query('SELECT 1 FROM pg_database WHERE datname = $1', [name]);
    if (existing.rowCount === 0) {
      await client.query(`CREATE DATABASE ${name} OWNER tributary_app`);
    }
  }
  const check = await client.query(
    `SELECT rolname, rolsuper FROM pg_roles WHERE rolname = 'tributary_app'`,
  );
  console.log(JSON.stringify(check.rows));
} finally {
  await client.end();
}
