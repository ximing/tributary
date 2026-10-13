import { useEffect, useRef } from 'react';
import { observer, useService } from '@rabjs/react';
import { findInTree } from '@tributary/domain';
import { ConversationService } from '../../workspace/conversation.service.js';
import { MapService } from '../../workspace/map.service.js';

/** 在当前这张图里查找。⌘F 打开，Enter 下一个，Shift+Enter 上一个。 */
export const MapFind = observer(function MapFind() {
  const map = useService(MapService);
  const conversations = useService(ConversationService);
  const inputRef = useRef<HTMLInputElement>(null);
  const findOpen = map.findOpen;
  const findQuery = map.findQuery;
  const findCursor = map.findCursor;

  const tree = map.nodeOrder.flatMap((id) => {
    const node = map.nodes[id];
    return node
      ? [{ id: node.id, parentId: node.parentId, question: node.question, reply: node.reply, note: node.note, collapsed: node.collapsed }]
      : [];
  });
  const hits = findInTree(tree, findQuery);
  const current = hits.length === 0 ? null : (hits[((findCursor % hits.length) + hits.length) % hits.length] ?? null);

  useEffect(() => {
    if (!findOpen) {
      if (map.findCurrentId) map.syncFindHit(null, false);
      return;
    }
    inputRef.current?.focus();
    inputRef.current?.select();
  }, [findOpen, map]);

  useEffect(() => {
    if (!findOpen) return;
    const needle = findQuery.trim().toLowerCase();
    const hit = current ? map.nodes[current] : undefined;
    const inReply = Boolean(hit && needle && (hit.reply ?? '').toLowerCase().includes(needle));
    const inQuestion = Boolean(hit && needle && hit.question.toLowerCase().includes(needle));
    map.syncFindHit(current, Boolean(current && inReply), Boolean(current && inQuestion));
    if (current && needle) void map.revealNode(current);
  }, [findOpen, findQuery, findCursor, conversations.activeId, current, map]);

  if (!findOpen) return null;

  return (
    <form
      className="find-bar"
      role="search"
      onSubmit={(event) => {
        event.preventDefault();
        map.stepFind(1);
      }}
    >
      <input
        ref={inputRef}
        id="map-find-input"
        aria-label="在这张图里查找"
        placeholder="在这张图里查找"
        value={findQuery}
        onChange={(event) => map.setFindQuery(event.target.value)}
        onKeyDown={(event) => {
          if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'f') {
            event.preventDefault();
            event.currentTarget.select();
            return;
          }
          if (event.key === 'Enter') {
            event.preventDefault();
            map.stepFind(event.shiftKey ? -1 : 1);
          }
          if (event.key === 'Escape') {
            event.preventDefault();
            map.closeFind();
          }
        }}
      />
      <span className="find-count">{hits.length === 0 ? '0' : `${String((findCursor % hits.length) + 1)}/${String(hits.length)}`}</span>
      <button type="button" aria-label="上一个" onClick={() => map.stepFind(-1)}>
        上一个
      </button>
      <button type="button" aria-label="下一个" onClick={() => map.stepFind(1)}>
        下一个
      </button>
      <button type="button" aria-label="关闭查找" onClick={() => map.closeFind()}>
        关闭
      </button>
    </form>
  );
});
