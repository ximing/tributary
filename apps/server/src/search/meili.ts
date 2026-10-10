export interface MeiliDocument {
  id: string;
  conversationId: string;
  question: string;
  reply: string | null;
  text: string;
}

export interface MeiliHit {
  nodeId: string;
  conversationId: string;
  question: string;
  reply: string | null;
}

export interface MeiliClientOptions {
  host: string;
  apiKey: string;
  indexUid: string;
  fetchImpl?: typeof fetch;
}

const INDEX_SETTINGS = {
  searchableAttributes: ['question', 'reply', 'text'],
  filterableAttributes: ['conversationId', 'id'],
  localizedAttributes: [{ attributePatterns: ['*'], locales: ['cmn'] }],
};

function taskUidOf(json: unknown): number | null {
  if (typeof json !== 'object' || json === null) return null;
  const uid = (json as { taskUid?: unknown }).taskUid;
  return typeof uid === 'number' ? uid : null;
}

export function createMeiliClient(options: MeiliClientOptions) {
  const host = options.host.replace(/\/$/, '');
  const fetchImpl =
    options.fetchImpl ??
    ((input: Parameters<typeof fetch>[0], init?: Parameters<typeof fetch>[1]) => fetch(input, init));
  const indexUid = options.indexUid;

  async function call(method: string, path: string, body?: unknown): Promise<{ status: number; json: unknown }> {
    const response = await fetchImpl(`${host}${path}`, {
      method,
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${options.apiKey}`,
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const text = await response.text();
    let json: unknown = null;
    if (text) {
      try {
        json = JSON.parse(text) as unknown;
      } catch {
        json = { message: text };
      }
    }
    return { status: response.status, json };
  }

  async function waitForTask(taskUid: number): Promise<void> {
    const deadline = Date.now() + 30_000;
    for (;;) {
      const res = await call('GET', `/tasks/${String(taskUid)}`);
      const body = res.json as { status?: unknown; error?: { message?: unknown } };
      if (body.status === 'succeeded') return;
      if (body.status === 'failed') {
        const message = typeof body.error?.message === 'string' ? body.error.message : 'meili task failed';
        throw new Error(message);
      }
      if (Date.now() >= deadline) throw new Error(`meili task ${String(taskUid)} timed out`);
      await new Promise((resolve) => setTimeout(resolve, 150));
    }
  }

  async function submit(method: string, path: string, body?: unknown): Promise<void> {
    const res = await call(method, path, body);
    if (res.status >= 400) {
      const message =
        typeof res.json === 'object' && res.json && 'message' in res.json
          ? String((res.json as { message: unknown }).message)
          : `meili ${method} ${path} failed`;
      throw new Error(message);
    }
    const uid = taskUidOf(res.json);
    if (uid !== null) await waitForTask(uid);
  }

  return {
    indexUid,
    async ensureIndex(): Promise<void> {
      const existing = await call('GET', `/indexes/${indexUid}`);
      const primaryKey =
        typeof existing.json === 'object' && existing.json && 'primaryKey' in existing.json
          ? (existing.json as { primaryKey?: unknown }).primaryKey
          : null;
      if (existing.status === 404 || (existing.status < 400 && typeof primaryKey !== 'string')) {
        if (existing.status !== 404) await submit('DELETE', `/indexes/${indexUid}`);
        await submit('POST', '/indexes', { uid: indexUid, primaryKey: 'id' });
      } else if (existing.status >= 400) {
        throw new Error(`meili index lookup failed: ${String(existing.status)}`);
      }
      await submit('PATCH', `/indexes/${indexUid}/settings`, INDEX_SETTINGS);
    },
    async upsert(doc: MeiliDocument): Promise<void> {
      await submit('POST', `/indexes/${indexUid}/documents?primaryKey=id`, [doc]);
    },
    async remove(id: string): Promise<void> {
      await submit('DELETE', `/indexes/${indexUid}/documents/${encodeURIComponent(id)}`);
    },
    async search(q: string): Promise<MeiliHit[]> {
      const res = await call('POST', `/indexes/${indexUid}/search`, { q, limit: 20 });
      if (res.status >= 400) throw new Error(`meili search failed: ${String(res.status)}`);
      const hits = (res.json as { hits?: unknown }).hits;
      if (!Array.isArray(hits)) return [];
      return hits.flatMap((hit) => {
        if (typeof hit !== 'object' || hit === null) return [];
        const row = hit as Record<string, unknown>;
        if (typeof row.id !== 'string' || typeof row.conversationId !== 'string') return [];
        return [
          {
            nodeId: row.id,
            conversationId: row.conversationId,
            question: typeof row.question === 'string' ? row.question : '',
            reply: typeof row.reply === 'string' ? row.reply : null,
          },
        ];
      });
    },
  };
}

export type MeiliClient = ReturnType<typeof createMeiliClient>;
