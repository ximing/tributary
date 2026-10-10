import { has, register, resolve, type Service } from '@rabjs/react';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { deleteConversation, listConversations, loadConversation, type ConversationNode } from '../api/client.js';
import type { StreamHandlers } from '../api/stream.js';
import { ConversationService } from '../workspace/conversation.service.js';
import { MapService } from '../workspace/map.service.js';
import { ModelCatalogService } from '../workspace/model-catalog.service.js';
import { SearchService } from '../workspace/search.service.js';
import { StreamService } from '../workspace/stream.service.js';

interface Captured {
  nodeId: string;
  handlers: StreamHandlers;
  close: ReturnType<typeof vi.fn>;
}

const h = vi.hoisted(() => ({
  captured: [] as Captured[],
  orderAtClose: [] as string[][],
  readOrder: (): string[] => [],
}));

vi.mock('../api/stream.js', () => ({
  subscribeNodeStream: (nodeId: string, handlers: StreamHandlers) => {
    const close = vi.fn(() => {
      h.orderAtClose.push(h.readOrder());
    });
    h.captured.push({ nodeId, handlers, close });
    return { close };
  },
}));

vi.mock('../api/client.js', () => ({
  listConversations: vi.fn(() => Promise.resolve({ conversations: [] })),
  loadConversation: vi.fn(),
  deleteConversation: vi.fn(() => Promise.resolve()),
  setCollapsedMany: vi.fn(() => Promise.resolve({ nodes: [] })),
  createConversation: vi.fn(),
}));

function ensure<T extends Service>(service: new () => T): void {
  if (!has(service)) register(service);
}

function node(id: string, question: string, status: string): ConversationNode {
  return {
    id,
    parentId: null,
    question,
    reply: null,
    status,
    providerId: null,
    model: null,
    collapsed: false,
    position: 0,
    note: null,
    sticker: null,
  };
}

describe('stream lifetime on the shipped map', () => {
  beforeAll(() => {
    ensure(ConversationService);
    ensure(ModelCatalogService);
    ensure(MapService);
    ensure(SearchService);
    ensure(StreamService);
    h.readOrder = () => [...resolve(MapService).nodeOrder];
  });

  beforeEach(() => {
    resolve(ConversationService).activeId = null;
    resolve(MapService).clearCanvas();
    h.captured.length = 0;
    h.orderAtClose.length = 0;
    resolve(StreamService).watch();
  });

  it('keeps a done event that still belongs to the open map', async () => {
    vi.mocked(loadConversation).mockResolvedValue({
      conversation: { id: 'c-a', title: '甲', createdAt: '', updatedAt: '' },
      nodes: [node('p1', '还在问', 'pending')],
      links: [],
    });
    const map = resolve(MapService);
    await resolve(ConversationService).open('c-a');
    const source = h.captured[0];
    expect(source?.nodeId).toBe('p1');

    source?.handlers.onDone?.({ ...node('p1', '还在问', 'done'), reply: '答完了' });

    expect(map.nodes['p1']?.status).toBe('done');
    expect(map.nodes['p1']?.reply).toBe('答完了');
    expect(map.nodeOrder).toEqual(['p1']);
  });

  it('closes the previous stream before switching conversations and drops a late done', async () => {
    vi.mocked(loadConversation).mockImplementation((id: string) =>
      Promise.resolve({
        conversation: { id, title: id, createdAt: '', updatedAt: '' },
        nodes: [id === 'c-a' ? node('p1', '还在问', 'pending') : node('n2', '另一场', 'done')],
        links: [],
      }),
    );
    const map = resolve(MapService);
    const conversations = resolve(ConversationService);
    await conversations.open('c-a');
    const source = h.captured[0];
    expect(source?.nodeId).toBe('p1');
    expect(source?.close).not.toHaveBeenCalled();

    await conversations.open('c-b');

    expect(source?.close).toHaveBeenCalledTimes(1);
    expect(h.orderAtClose[0]).toContain('p1');
    expect(map.nodeOrder).toEqual(['n2']);
    expect(map.nodes['p1']).toBeUndefined();

    vi.mocked(listConversations).mockClear();
    source?.handlers.onDelta?.('迟到的片段');
    source?.handlers.onDone?.({ ...node('p1', '还在问', 'done'), reply: '迟到的回答' });

    expect(map.nodes['p1']).toBeUndefined();
    expect(map.nodeOrder).toEqual(['n2']);
    expect(map.expandedReplies['p1']).toBeUndefined();
    expect(listConversations).not.toHaveBeenCalled();
  });

  it('closes a stream that is no longer pending without leaving the map', async () => {
    let status = 'pending';
    vi.mocked(loadConversation).mockImplementation(() =>
      Promise.resolve({
        conversation: { id: 'c-a', title: '甲', createdAt: '', updatedAt: '' },
        nodes: [node('p1', '还在问', status)],
        links: [],
      }),
    );
    await resolve(ConversationService).open('c-a');
    const source = h.captured[0];
    expect(source?.close).not.toHaveBeenCalled();

    status = 'done';
    await resolve(ConversationService).open('c-a');

    expect(source?.close).toHaveBeenCalledTimes(1);
    expect(resolve(MapService).nodeOrder).toEqual(['p1']);
    expect(resolve(MapService).nodes['p1']?.status).toBe('done');
  });

  it('closes the stream before clearing the canvas and drops a late done', async () => {
    vi.mocked(loadConversation).mockResolvedValue({
      conversation: { id: 'c-a', title: '甲', createdAt: '', updatedAt: '' },
      nodes: [node('p1', '还在问', 'pending')],
      links: [],
    });
    const map = resolve(MapService);
    const conversations = resolve(ConversationService);
    await conversations.open('c-a');
    const source = h.captured[0];

    await conversations.remove('c-a');

    expect(deleteConversation).toHaveBeenCalledWith('c-a');
    expect(source?.close).toHaveBeenCalledTimes(1);
    expect(h.orderAtClose[0]).toContain('p1');
    expect(map.nodeOrder).toEqual([]);
    expect(conversations.activeId).toBeNull();

    source?.handlers.onDone?.({ ...node('p1', '还在问', 'done'), reply: '迟到的回答' });

    expect(map.nodes['p1']).toBeUndefined();
    expect(map.nodeOrder).toEqual([]);
  });
});
