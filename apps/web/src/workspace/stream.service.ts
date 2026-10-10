import { observe, Service, unobserve } from '@rabjs/react';
import type { Reaction } from '@rabjs/react';
import type { ConversationNode } from '../api/client.js';
import { subscribeNodeStream } from '../api/stream.js';
import { MapService } from './map.service.js';

/**
 * 当前图上 status === 'pending' 的节点各有一条活跃 SSE。
 * 提问成功、刷新后加载出 pending 节点、error 节点重试，都会自动开流。
 * 节点离开这张图，或不再 pending，对应的流会关掉。
 */
export class StreamService extends Service {
  streaming: Record<string, string> = {};
  streamErrors: Record<string, string> = {};
  private readonly sources = new Map<string, EventSource>();
  private reaction: Reaction | null = null;

  get map(): MapService {
    return this.resolve(MapService);
  }

  /** 跟随地图上的 pending 节点开关流。返回停止函数。 */
  watch(): () => void {
    this.unwatch();
    this.reaction = observe(() => {
      const pending = new Set<string>();
      for (const id of this.map.nodeOrder) {
        const node = this.map.nodes[id];
        if (node && node.status === 'pending') pending.add(id);
      }
      for (const id of [...this.sources.keys()]) {
        if (!pending.has(id)) this.stop(id);
      }
      for (const id of pending) {
        if (!this.sources.has(id)) this.start(id);
      }
    });
    return () => this.unwatch();
  }

  override destroy(): void {
    this.unwatch();
    super.destroy();
  }

  applyDelta(id: string, text: string): void {
    if (!this.map.nodes[id] || !this.map.nodeOrder.includes(id)) return;
    this.streaming = { ...this.streaming, [id]: text };
    if (!this.map.expandedReplies[id]) {
      this.map.expandedReplies = { ...this.map.expandedReplies, [id]: true };
    }
  }

  applyDone(id: string, node: ConversationNode): void {
    this.map.finishStream(id, node);
    this.clearStreaming(id);
    this.stop(id);
  }

  applyError(id: string, message: string): void {
    this.map.failStream(id, message);
    this.clearStreaming(id);
    this.streamErrors = { ...this.streamErrors, [id]: message };
    this.stop(id);
  }

  forget(ids: ReadonlySet<string>): void {
    if (ids.size === 0) return;
    const streaming = { ...this.streaming };
    const streamErrors = { ...this.streamErrors };
    for (const id of ids) {
      delete streaming[id];
      delete streamErrors[id];
      this.stop(id);
    }
    this.streaming = streaming;
    this.streamErrors = streamErrors;
  }

  clearNode(id: string): void {
    this.forget(new Set([id]));
  }

  dropError(id: string): void {
    if (!(id in this.streamErrors)) return;
    const streamErrors = { ...this.streamErrors };
    delete streamErrors[id];
    this.streamErrors = streamErrors;
  }

  private clearStreaming(id: string): void {
    if (!(id in this.streaming)) return;
    const streaming = { ...this.streaming };
    delete streaming[id];
    this.streaming = streaming;
  }

  private start(nodeId: string): void {
    const source = subscribeNodeStream(nodeId, {
      onSnapshot: (text, phase) => {
        if (phase === 'running' && text) this.applyDelta(nodeId, text);
      },
      onDelta: (text) => this.applyDelta(nodeId, text),
      onDone: (node) => this.applyDone(nodeId, node),
      onError: (message) => this.applyError(nodeId, message),
    });
    this.sources.set(nodeId, source);
  }

  private stop(nodeId: string): void {
    const source = this.sources.get(nodeId);
    if (!source) return;
    source.close();
    this.sources.delete(nodeId);
  }

  private unwatch(): void {
    if (this.reaction) unobserve(this.reaction);
    this.reaction = null;
    for (const source of this.sources.values()) source.close();
    this.sources.clear();
  }
}
