import { has, register, resolve, type Service } from '@rabjs/react';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { SessionService } from './session.service.js';
import { ConversationService } from '../workspace/conversation.service.js';
import { MapService } from '../workspace/map.service.js';
import { ModelCatalogService } from '../workspace/model-catalog.service.js';
import { SearchService } from '../workspace/search.service.js';
import { StreamService } from '../workspace/stream.service.js';

vi.mock('../api/client.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../api/client.js')>();
  const root = {
    id: 'n1',
    parentId: null,
    question: '原来的问题',
    reply: null,
    status: 'done',
    providerId: null,
    model: null,
    collapsed: false,
    position: 0,
    note: null,
    sticker: null,
  };
  return {
    ...actual,
    me: vi.fn(() => Promise.reject(new Error('unauthorized'))),
    listConversations: vi.fn(() => Promise.resolve({ conversations: [] })),
    loadConversation: vi.fn(() =>
      Promise.resolve({
        conversation: { id: 'c1', title: '一场', createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z' },
        nodes: [root],
        links: [],
      }),
    ),
    renameNode: vi.fn((_id: string, question: string) => Promise.resolve({ ...root, question })),
    setCollapsedMany: vi.fn(() => Promise.resolve()),
  };
});

function ensure<T extends Service>(service: new () => T): void {
  if (!has(service)) register(service);
}

describe('shipped web services', () => {
  beforeAll(() => {
    ensure(SessionService);
    ensure(ConversationService);
    ensure(ModelCatalogService);
    ensure(MapService);
    ensure(SearchService);
    ensure(StreamService);
  });

  it('leaves the gate ready and logged out when the current user fetch is rejected', async () => {
    const session = resolve(SessionService);
    session.user = { id: 'stale', email: 'stale@example.com', displayName: null, avatar: null };
    session.ready = false;
    await session.load();
    expect(session.ready).toBe(true);
    expect(session.user).toBeNull();
  });

  it('writes the selected node the canvas reads', () => {
    const map = resolve(MapService);
    map.select('node-a');
    expect(map.selectedId).toBe('node-a');
  });

  it('opens shortcut help and search on the flags those dialogs read', () => {
    const map = resolve(MapService);
    const search = resolve(SearchService);
    map.setHelpOpen(true);
    expect(map.helpOpen).toBe(true);
    expect(search.searchOpen).toBe(false);
    search.setOpen(true);
    expect(search.searchOpen).toBe(true);
    expect(map.helpOpen).toBe(false);
  });

  it('pushes one undo entry for a local rename and pops it on undo', async () => {
    const conversations = resolve(ConversationService);
    const map = resolve(MapService);
    await conversations.open('c1');
    await map.renameQuestion('n1', '改过的问题');
    expect(map.undoStack).toHaveLength(1);
    await map.undo();
    expect(map.undoStack).toHaveLength(0);
  });
});
