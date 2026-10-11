import type { ConversationNode } from './client.js';

export interface StreamDraft {
  reply: string;
  thinking: string;
}

export interface StreamHandlers {
  onSnapshot?: (draft: StreamDraft, phase: string) => void;
  onDelta?: (draft: StreamDraft) => void;
  onDone?: (node: ConversationNode) => void;
  onError?: (message: string) => void;
}

function asDraft(data: { text?: string; reply?: string; thinking?: string }): StreamDraft {
  return { reply: data.reply ?? data.text ?? '', thinking: data.thinking ?? '' };
}

function parse<T>(event: MessageEvent<string>): T {
  return JSON.parse(event.data) as T;
}

/**
 * 订阅节点回答的 SSE 流。网络断开时 EventSource 自动重连，
 * 服务端会重发累计快照，因此无需去重。done/error 后连接自动关闭。
 */
export function subscribeNodeStream(nodeId: string, handlers: StreamHandlers): EventSource {
  const source = new EventSource(`/api/nodes/${encodeURIComponent(nodeId)}/stream`);
  source.addEventListener('snapshot', (event) => {
    const data = parse<{ text?: string; reply?: string; thinking?: string; phase: string }>(event as MessageEvent<string>);
    handlers.onSnapshot?.(asDraft(data), data.phase);
  });
  source.addEventListener('delta', (event) => {
    const data = parse<{ text?: string; reply?: string; thinking?: string }>(event as MessageEvent<string>);
    handlers.onDelta?.(asDraft(data));
  });
  source.addEventListener('done', (event) => {
    const data = parse<{ node: ConversationNode }>(event as MessageEvent<string>);
    handlers.onDone?.(data.node);
    source.close();
  });
  source.addEventListener('error', (event) => {
    // 服务端发来的具名 error 事件是 MessageEvent；网络错误是 Event，交给自动重连
    if (event instanceof MessageEvent) {
      const data = parse<{ message: string }>(event as MessageEvent<string>);
      handlers.onError?.(data.message);
      source.close();
    }
  });
  return source;
}
