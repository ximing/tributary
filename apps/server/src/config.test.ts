import { describe, expect, it } from 'vitest';
import { databaseName, envFilePaths, resolveRuntimeConfig } from './config.js';

describe('runtime config', () => {
  it('reads the database and the search index from the current environment only', () => {
    const resolved = resolveRuntimeConfig({
      NODE_ENV: 'production',
      DATABASE_URL: 'postgresql://tributary_app:secret@127.0.0.1:5432/tributary_prod',
      DATABASE_URL_PROD: 'postgresql://tributary_app:secret@127.0.0.1:5432/other',
      MEILI_INDEX_UID: 'tributary_nodes_prod',
      MEILI_INDEX_UID_PROD: 'other_index',
    });
    expect(resolved.nodeEnv).toBe('production');
    expect(resolved.host).toBe('0.0.0.0');
    expect(databaseName(resolved.databaseUrl)).toBe('tributary_prod');
    expect(resolved.meiliIndexUid).toBe('tributary_nodes_prod');
  });

  it('picks an env file per environment', () => {
    expect(envFilePaths('test', '/app')).toEqual(['/app/.env.test']);
    expect(envFilePaths('production', '/app')).toEqual(['/app/.env.production', '/app/.env']);
    expect(envFilePaths('development', '/app')).toEqual(['/app/.env.development', '/app/.env']);
  });
});
