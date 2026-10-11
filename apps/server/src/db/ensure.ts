import { pool } from './client.js';

const SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS users (
  id uuid PRIMARY KEY,
  email text NOT NULL UNIQUE,
  password_hash text NOT NULL,
  display_name text,
  avatar text,
  system_prompt text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS sessions (
  id uuid PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash text NOT NULL UNIQUE,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS model_configs (
  id uuid PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  provider text NOT NULL,
  model text NOT NULL,
  base_url text,
  api_key text NOT NULL,
  is_default boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS conversations (
  id uuid PRIMARY KEY,
  user_id uuid REFERENCES users(id) ON DELETE CASCADE,
  title text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS nodes (
  id uuid PRIMARY KEY,
  conversation_id uuid NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  parent_id uuid REFERENCES nodes(id) ON DELETE CASCADE,
  question text NOT NULL,
  reply text,
  thinking text,
  status text NOT NULL CHECK (status IN ('pending', 'done', 'error')),
  provider_id uuid REFERENCES model_configs(id) ON DELETE SET NULL,
  model text,
  collapsed boolean NOT NULL DEFAULT false,
  position integer NOT NULL DEFAULT 0,
  note text,
  sticker text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS links (
  id uuid PRIMARY KEY,
  conversation_id uuid NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  source_id uuid NOT NULL REFERENCES nodes(id) ON DELETE CASCADE,
  target_id uuid NOT NULL REFERENCES nodes(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (source_id <> target_id),
  UNIQUE (source_id, target_id)
);
CREATE TABLE IF NOT EXISTS jobs (
  id uuid PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type text NOT NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'running', 'done', 'failed')),
  payload jsonb NOT NULL,
  run_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz,
  attempts integer NOT NULL DEFAULT 0,
  last_error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS jobs_status_run_at_idx ON jobs (status, run_at);
CREATE INDEX IF NOT EXISTS jobs_user_created_idx ON jobs (user_id, created_at);
CREATE UNIQUE INDEX IF NOT EXISTS jobs_one_active_answer_uidx
  ON jobs ((payload->>'nodeId'))
  WHERE type = 'answer' AND status IN ('pending', 'running');
CREATE TABLE IF NOT EXISTS usage_calls (
  id uuid PRIMARY KEY,
  node_id uuid NOT NULL REFERENCES nodes(id) ON DELETE CASCADE,
  provider_name text NOT NULL,
  model text NOT NULL,
  prompt_tokens integer NOT NULL,
  completion_tokens integer NOT NULL,
  total_tokens integer NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
`;

/** 已有库只补列和约束。旧的全局 providers 不再被引用。 */
const MIGRATE_SQL = `
ALTER TABLE users ADD COLUMN IF NOT EXISTS avatar text;
ALTER TABLE users ADD COLUMN IF NOT EXISTS system_prompt text;
ALTER TABLE conversations ADD COLUMN IF NOT EXISTS user_id uuid;
DO $$ BEGIN
  ALTER TABLE conversations
    ADD CONSTRAINT conversations_user_id_fkey
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
CREATE INDEX IF NOT EXISTS conversations_user_idx ON conversations (user_id);
CREATE INDEX IF NOT EXISTS model_configs_user_idx ON model_configs (user_id);
DO $$
DECLARE constraint_name text;
BEGIN
  FOR constraint_name IN
    SELECT con.conname
    FROM pg_constraint con
    JOIN pg_class rel ON rel.oid = con.conrelid
    JOIN pg_attribute att ON att.attrelid = rel.oid AND att.attnum = ANY (con.conkey)
    WHERE rel.relname = 'nodes' AND att.attname = 'provider_id' AND con.contype = 'f'
  LOOP
    EXECUTE format('ALTER TABLE nodes DROP CONSTRAINT %I', constraint_name);
  END LOOP;
END $$;
UPDATE nodes
SET provider_id = NULL
WHERE provider_id IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM model_configs WHERE model_configs.id = nodes.provider_id);
DO $$ BEGIN
  ALTER TABLE nodes
    ADD CONSTRAINT nodes_provider_id_fkey
    FOREIGN KEY (provider_id) REFERENCES model_configs(id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
ALTER TABLE nodes ADD COLUMN IF NOT EXISTS note text;
ALTER TABLE nodes ADD COLUMN IF NOT EXISTS sticker text;
ALTER TABLE nodes ADD COLUMN IF NOT EXISTS thinking text;
CREATE TABLE IF NOT EXISTS links (
  id uuid PRIMARY KEY,
  conversation_id uuid NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  source_id uuid NOT NULL REFERENCES nodes(id) ON DELETE CASCADE,
  target_id uuid NOT NULL REFERENCES nodes(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (source_id <> target_id),
  UNIQUE (source_id, target_id)
);
`;

export async function ensureSchema(): Promise<void> {
  await pool.query(SCHEMA_SQL);
  await pool.query(MIGRATE_SQL);
}
