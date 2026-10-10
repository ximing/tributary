import { subscribeNodeStream } from '../api/stream.js';
import { useWorkspace } from '../store/workspace.js';

const active = new Map<string, EventSource>();

/**
 * 监听 store：凡是 status === 'pending' 的节点都保证有一条活跃 SSE。
 * 提问成功、刷新后加载出 pending 节点、error 节点重试，都会自动开流。
 */
export function initStreamManager(): () => void {
  sync();
  const unsubscribe = useWorkspace.subscribe(sync);
  return () => {
    unsubscribe();
    for (const source of active.values()) source.close();
    active.clear();
  };
}

function sync(): void {
  const state = useWorkspace.getState();
  for (const id of state.nodeOrder) {
    const node = state.nodes[id];
    if (node && node.status === 'pending' && !active.has(id)) start(id);
  }
}

function start(nodeId: string): void {
  const source = subscribeNodeStream(nodeId, {
    onSnapshot: (text, phase) => {
      if (phase === 'running' && text) useWorkspace.getState().applyDelta(nodeId, text);
    },
    onDelta: (text) => useWorkspace.getState().applyDelta(nodeId, text),
    onDone: (node) => {
      stop(nodeId);
      useWorkspace.getState().applyDone(nodeId, node);
    },
    onError: (message) => {
      stop(nodeId);
      useWorkspace.getState().applyStreamError(nodeId, message);
    },
  });
  active.set(nodeId, source);
}

function stop(nodeId: string): void {
  const source = active.get(nodeId);
  if (!source) return;
  source.close();
  active.delete(nodeId);
}
