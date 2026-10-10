import { describe, expect, it } from 'vitest';
import { databaseName, resolveRuntimeConfig } from './config.js';

describe('runtime config', () => {
  it('keeps the test database and test index away from production', () => {
    const dev = resolveRuntimeConfig({
      APP_ENV: 'development',
      DATABASE_URL: 'postgresql://tributary_app:secret@127.0.0.1:5432/tributary_test',
      DATABASE_URL_PROD: 'postgresql://tributary_app:secret@127.0.0.1:5432/tributary_prod',
      MEILI_INDEX_UID: 'tributary_nodes_test',
      MEILI_INDEX_UID_PROD: 'tributary_nodes_prod',
    });
    const prod = resolveRuntimeConfig({
      APP_ENV: 'production',
      DATABASE_URL: 'postgresql://tributary_app:secret@127.0.0.1:5432/tributary_test',
      DATABASE_URL_PROD: 'postgresql://tributary_app:secret@127.0.0.1:5432/tributary_prod',
      MEILI_INDEX_UID: 'tributary_nodes_test',
      MEILI_INDEX_UID_PROD: 'tributary_nodes_prod',
    });
    expect(databaseName(dev.databaseUrl)).toBe('tributary_test');
    expect(databaseName(prod.databaseUrl)).toBe('tributary_prod');
    expect(databaseName(dev.databaseUrl)).not.toBe(databaseName(prod.databaseUrl));
    expect(dev.meiliIndexUid).toBe('tributary_nodes_test');
    expect(prod.meiliIndexUid).toBe('tributary_nodes_prod');
    expect(dev.meiliIndexUid).not.toBe(prod.meiliIndexUid);
  });
});
