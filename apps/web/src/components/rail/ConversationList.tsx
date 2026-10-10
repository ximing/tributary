import { useEffect, useRef, useState } from 'react';
import { observer, useService } from '@rabjs/react';
import { GitBranch, MessageSquare, MoreHorizontal, Trash2 } from 'lucide-react';
import { relativeTime } from '../../lib/format.js';
import type { Conversation } from '../../api/client.js';
import { ConversationService } from '../../workspace/conversation.service.js';

interface ConvGroup {
  label: string;
  items: Conversation[];
}

/** 按更新时间分桶：今天 / 昨天 / 过去 7 天 / 过去 30 天 / 更早 */
function groupConversations(conversations: Conversation[]): ConvGroup[] {
  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const DAY = 24 * 60 * 60 * 1000;
  const buckets: ConvGroup[] = [
    { label: '今天', items: [] },
    { label: '昨天', items: [] },
    { label: '过去 7 天', items: [] },
    { label: '过去 30 天', items: [] },
    { label: '更早', items: [] },
  ];
  for (const conversation of conversations) {
    const at = new Date(conversation.updatedAt).getTime();
    const age = startOfToday - at;
    const bucket =
      at >= startOfToday ? buckets[0]! : age < DAY ? buckets[1]! : age < 7 * DAY ? buckets[2]! : age < 30 * DAY ? buckets[3]! : buckets[4]!;
    bucket.items.push(conversation);
  }
  return buckets.filter((bucket) => bucket.items.length > 0);
}

export const ConversationList = observer(function ConversationList() {
  const conversations = useService(ConversationService);
  const [menuFor, setMenuFor] = useState<string | null>(null);
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!menuFor) return;
    const onPointerDown = (event: PointerEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(event.target as Node)) setMenuFor(null);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setMenuFor(null);
    };
    window.addEventListener('pointerdown', onPointerDown);
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('pointerdown', onPointerDown);
      window.removeEventListener('keydown', onKey);
    };
  }, [menuFor]);

  const groups = groupConversations(conversations.conversations);

  return (
    <div className="conv-scroll" ref={wrapRef}>
      {groups.map((group) => (
        <div className="conv-group" key={group.label}>
          <p className="conv-group-label">{group.label}</p>
          <ul className="conversations">
            {group.items.map((conversation) => {
              const isActive = conversation.id === conversations.activeId;
              return (
                <li
                  key={conversation.id}
                  className={isActive ? 'is-active' : undefined}
                  onClick={() => void conversations.open(conversation.id)}
                >
                  {isActive ? (
                    <GitBranch size={15} aria-hidden />
                  ) : (
                    <MessageSquare size={15} aria-hidden />
                  )}
                  <button type="button" className="conversation-body" tabIndex={-1}>
                    <span className="conversation-title">{conversation.title}</span>
                    <span className="conversation-meta">{relativeTime(conversation.updatedAt)}</span>
                  </button>
                  <button
                    type="button"
                    className="conversation-more"
                    aria-label={`「${conversation.title}」更多操作`}
                    aria-expanded={menuFor === conversation.id}
                    onClick={(event) => {
                      event.stopPropagation();
                      setMenuFor((current) => (current === conversation.id ? null : conversation.id));
                    }}
                  >
                    <MoreHorizontal size={14} aria-hidden />
                  </button>
                  {menuFor === conversation.id ? (
                    <div className="pop conv-menu" role="menu">
                      <button
                        type="button"
                        className="menu-item is-danger"
                        role="menuitem"
                        onClick={(event) => {
                          event.stopPropagation();
                          setMenuFor(null);
                          void conversations.remove(conversation.id);
                        }}
                      >
                        <Trash2 size={14} aria-hidden />
                        删除对话
                      </button>
                    </div>
                  ) : null}
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </div>
  );
});
