import { config as loadEnv } from 'dotenv';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
loadEnv({ path: resolve(here, '../../../.env') });

if (!process.env.PGGSSENCMODE) process.env.PGGSSENCMODE = 'disable';

export interface RuntimeConfig {
  appEnv: 'production' | 'development';
  port: number;
  databaseUrl: string;
  meiliHost: string;
  meiliApiKey: string;
  meiliIndexUid: string;
  prodIndexUid: string;
  webDist: string;
}

export function resolveRuntimeConfig(env: NodeJS.ProcessEnv = process.env): RuntimeConfig {
  const appEnv = env.APP_ENV === 'production' ? 'production' : 'development';
  const databaseUrl = appEnv === 'production' ? (env.DATABASE_URL_PROD ?? '') : (env.DATABASE_URL ?? '');
  const prodIndexUid = env.MEILI_INDEX_UID_PROD ?? 'tributary_nodes_prod';
  const meiliIndexUid = appEnv === 'production' ? prodIndexUid : (env.MEILI_INDEX_UID ?? 'tributary_nodes_test');
  return {
    appEnv,
    port: Number(env.PORT ?? 8787),
    databaseUrl,
    meiliHost: (env.MEILI_HOST ?? 'http://222.128.65.91:7700').replace(/\/$/, ''),
    meiliApiKey: env.MEILI_API_KEY ?? '',
    meiliIndexUid,
    prodIndexUid,
    webDist: resolve(here, '../../web/dist'),
  };
}

export function databaseName(url: string): string {
  const path = new URL(url).pathname.replace(/^\//, '');
  return decodeURIComponent(path);
}

export const config = resolveRuntimeConfig();
