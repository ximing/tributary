import { useEffect, useRef } from 'react';
import { findInTree } from '@tributary/domain';
import { useWorkspace } from '../../store/workspace.js';

/** 在当前这张图里查找。⌘F 打开，Enter 下一个，Shift+Enter 上一个。 */
export function MapFind() {
  const findOpen = useWorkspace((state) => state.findOpen);
  const findQuery = useWorkspace((state) => state.findQuery);
  const findCursor = useWorkspace((state) => state.findCursor);
  const activeId = useWorkspace((state) => state.activeId);
  const nodeOrder = useWorkspace((state) => state.nodeOrder);
  const nodes = useWorkspace((state) => state.nodes);
  const setFindQuery = useWorkspace((state) => state.setFindQuery);
  const stepFind = useWorkspace((state) => state.stepFind);
  const closeFind = useWorkspace((state) => state.closeFind);
  const revealNode = useWorkspace((state) => state.revealNode);
  const inputRef = useRef<HTMLInputElement>(null);

  const tree = nodeOrder.flatMap((id) => {
    const node = nodes[id];
    return node
      ? [{ id: node.id, parentId: node.parentId, question: node.question, reply: node.reply, note: node.note, collapsed: node.collapsed }]
      : [];
  });
  const hits = findInTree(tree, findQuery);
  const current = hits.length === 0 ? null : (hits[((findCursor % hits.length) + hits.length) % hits.length] ?? null);

  useEffect(() => {
    if (!findOpen) {
      if (useWorkspace.getState().findCurrentId) useWorkspace.setState({ findCurrentId: null });
      return;
    }
    inputRef.current?.focus();
    inputRef.current?.select();
  }, [findOpen]);

  useEffect(() => {
    if (!findOpen) return;
    const needle = findQuery.trim().toLowerCase();
    const hit = current ? useWorkspace.getState().nodes[current] : undefined;
    const inReply = Boolean(hit && needle && (hit.reply ?? '').toLowerCase().includes(needle));
    useWorkspace.setState((state) => ({
      findCurrentId: current,
      expandedReplies: current && inReply ? { ...state.expandedReplies, [current]: true } : state.expandedReplies,
    }));
    if (current && needle) void revealNode(current);
  }, [findOpen, findQuery, findCursor, activeId, current, revealNode]);

  if (!findOpen) return null;

  return (
    <form
      className="find-bar"
      role="search"
      onSubmit={(event) => {
        event.preventDefault();
        stepFind(1);
      }}
    >
      <input
        ref={inputRef}
        id="map-find-input"
        aria-label="在这张图里查找"
        placeholder="在这张图里查找"
        value={findQuery}
        onChange={(event) => setFindQuery(event.target.value)}
        onKeyDown={(event) => {
          if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'f') {
            event.preventDefault();
            event.currentTarget.select();
            return;
          }
          if (event.key === 'Enter') {
            event.preventDefault();
            stepFind(event.shiftKey ? -1 : 1);
          }
          if (event.key === 'Escape') {
            event.preventDefault();
            closeFind();
          }
        }}
      />
      <span className="find-count">{hits.length === 0 ? '0' : `${String((findCursor % hits.length) + 1)}/${String(hits.length)}`}</span>
      <button type="button" aria-label="上一个" onClick={() => stepFind(-1)}>
        上一个
      </button>
      <button type="button" aria-label="下一个" onClick={() => stepFind(1)}>
        下一个
      </button>
      <button type="button" aria-label="关闭查找" onClick={() => closeFind()}>
        关闭
      </button>
    </form>
  );
}
