import { config as loadEnv } from 'dotenv';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, '../../..');

/**
 * 测试只读 `.env.test`，避免落到开发库。
 * 其他环境先读 `.env.${NODE_ENV}`，再读 `.env`；先出现的变量生效。
 * 数据库和索引只认 `DATABASE_URL`、`MEILI_INDEX_UID`，不按变量名切换。
 */
export function envFilePaths(nodeEnv: string | undefined = process.env.NODE_ENV, root = repoRoot): string[] {
  if (nodeEnv === 'test') return [resolve(root, '.env.test')];
  const name = nodeEnv && nodeEnv.length > 0 ? nodeEnv : 'development';
  return [resolve(root, `.env.${name}`), resolve(root, '.env')];
}

for (const path of envFilePaths()) loadEnv({ path });

if (!process.env.PGGSSENCMODE) process.env.PGGSSENCMODE = 'disable';

export type NodeEnv = 'production' | 'development' | 'test';

export interface RuntimeConfig {
  nodeEnv: NodeEnv;
  /** 生产监听所有网卡，容器端口才能映射出去。开发仍只听本机。 */
  host: string;
  port: number;
  databaseUrl: string;
  meiliHost: string;
  meiliApiKey: string;
  meiliIndexUid: string;
  webDist: string;
  workerPollMs: number;
  workerClaimLimit: number;
  workerStuckMs: number;
  jobMaxAttempts: number;
  s3: S3Config;
}

/** 对象存储（S3 兼容）。生产桶 tributary，开发/测试桶 tributary-test，可用 S3_BUCKET 显式覆盖。 */
export interface S3Config {
  endpoint: string;
  region: string;
  bucket: string;
  accessKeyId: string;
  secretAccessKey: string;
  forcePathStyle: boolean;
}

function resolveS3(env: NodeJS.ProcessEnv, nodeEnv: NodeEnv): S3Config {
  return {
    endpoint: env.S3_ENDPOINT ?? '',
    region: env.S3_REGION ?? 'cn-beijing',
    bucket: env.S3_BUCKET ?? (nodeEnv === 'production' ? 'tributary' : 'tributary-test'),
    accessKeyId: env.S3_ACCESS_KEY_ID ?? '',
    secretAccessKey: env.S3_SECRET_ACCESS_KEY ?? '',
    forcePathStyle: (env.S3_FORCE_PATH_STYLE ?? 'true') !== 'false',
  };
}

function nodeEnvOf(value: string | undefined): NodeEnv {
  if (value === 'production' || value === 'test') return value;
  return 'development';
}

function positiveInt(value: string | undefined, fallback: number): number {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

export function resolveRuntimeConfig(env: NodeJS.ProcessEnv = process.env): RuntimeConfig {
  const nodeEnv = nodeEnvOf(env.NODE_ENV);
  const host = env.HOST && env.HOST.length > 0 ? env.HOST : nodeEnv === 'production' ? '0.0.0.0' : '127.0.0.1';
  return {
    nodeEnv,
    host,
    port: Number(env.PORT ?? 8787),
    databaseUrl: env.DATABASE_URL ?? '',
    meiliHost: (env.MEILI_HOST ?? 'http://222.128.65.91:7700').replace(/\/$/, ''),
    meiliApiKey: env.MEILI_API_KEY ?? '',
    meiliIndexUid: env.MEILI_INDEX_UID ?? 'tributary_nodes_test',
    webDist: resolve(here, '../../web/dist'),
    workerPollMs: positiveInt(env.WORKER_POLL_MS, 1000),
    workerClaimLimit: positiveInt(env.WORKER_CLAIM_LIMIT, 5),
    workerStuckMs: positiveInt(env.WORKER_STUCK_MS, 15 * 60 * 1000),
    jobMaxAttempts: positiveInt(env.JOB_MAX_ATTEMPTS, 3),
    s3: resolveS3(env, nodeEnv),
  };
}

export function databaseName(url: string): string {
  const path = new URL(url).pathname.replace(/^\//, '');
  return decodeURIComponent(path);
}

export const config = resolveRuntimeConfig();
