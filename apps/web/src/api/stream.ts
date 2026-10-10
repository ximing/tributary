import type { ConversationNode } from './client.js';

export interface StreamHandlers {
  onSnapshot?: (text: string, phase: string) => void;
  onDelta?: (text: string) => void;
  onDone?: (node: ConversationNode) => void;
  onError?: (message: string) => void;
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
    const data = parse<{ text: string; phase: string }>(event as MessageEvent<string>);
    handlers.onSnapshot?.(data.text, data.phase);
  });
  source.addEventListener('delta', (event) => {
    const data = parse<{ text: string }>(event as MessageEvent<string>);
    handlers.onDelta?.(data.text);
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
