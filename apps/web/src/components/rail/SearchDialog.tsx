import { useEffect, useRef, useState } from 'react';
import { Search } from 'lucide-react';
import type { SearchHit } from '../../api/client.js';
import { useWorkspace } from '../../store/workspace.js';

function snippet(reply: string | null): string {
  if (!reply) return '';
  const text = reply.replace(/\s+/g, ' ').trim();
  if (!text) return '';
  return text.length > 72 ? `${text.slice(0, 72)}…` : text;
}

/** ⌘K / 顶栏搜索图标打开的搜索弹窗。 */
export function SearchDialog() {
  const open = useWorkspace((state) => state.searchOpen);
  const setSearchOpen = useWorkspace((state) => state.setSearchOpen);
  const hits = useWorkspace((state) => state.hits);
  const runSearch = useWorkspace((state) => state.runSearch);
  const clearHits = useWorkspace((state) => state.clearHits);
  const openConversation = useWorkspace((state) => state.openConversation);
  const [query, setQuery] = useState('');
  const [pending, setPending] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [active, setActive] = useState(-1);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLUListElement>(null);

  useEffect(() => {
    if (!open) return;
    inputRef.current?.focus();
  }, [open]);

  useEffect(() => {
    setActive(-1);
  }, [hits]);

  useEffect(() => {
    listRef.current?.querySelector<HTMLElement>('[data-active="true"]')?.scrollIntoView({ block: 'nearest' });
  }, [active]);

  if (!open) return null;

  const dismiss = () => {
    setSearchOpen(false);
    document.getElementById('rail-search-button')?.focus();
  };

  const pick = (hit: SearchHit) => {
    setSearchOpen(false);
    void openConversation(hit.conversationId, hit.nodeId);
  };

  const submit = () => {
    const q = query.trim();
    if (!q || pending) return;
    setPending(true);
    setSubmitted(true);
    clearHits();
    void runSearch(q).finally(() => setPending(false));
  };

  return (
    <div className="search-overlay" onMouseDown={dismiss}>
      <div
        className="search-modal"
        role="dialog"
        aria-modal="true"
        aria-label="搜索"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <form
          onSubmit={(event) => {
            event.preventDefault();
            if (active >= 0 && hits[active]) {
              pick(hits[active]);
              return;
            }
            submit();
          }}
        >
          <Search size={16} aria-hidden />
          <input
            ref={inputRef}
            id="rail-search-input"
            autoFocus
            aria-label="搜索"
            placeholder="搜索问题与回答…"
            value={query}
            onChange={(event) => {
              setQuery(event.target.value);
              setSubmitted(false);
              setActive(-1);
            }}
            onKeyDown={(event) => {
              if (event.key === 'ArrowDown') {
                event.preventDefault();
                if (hits.length === 0) return;
                setActive((index) => (index + 1) % hits.length);
              } else if (event.key === 'ArrowUp') {
                event.preventDefault();
                if (hits.length === 0) return;
                setActive((index) => (index <= 0 ? hits.length - 1 : index - 1));
              } else if (event.key === 'Escape') {
                event.preventDefault();
                event.stopPropagation();
                dismiss();
              }
            }}
          />
          <kbd>⌘K</kbd>
        </form>
        {pending ? <p className="search-status">搜索中…</p> : null}
        {!pending && hits.length > 0 ? (
          <>
            <div className="search-head">
              <span>{hits.length} 条结果</span>
              <button
                type="button"
                onClick={() => {
                  clearHits();
                  setQuery('');
                  setSubmitted(false);
                  inputRef.current?.focus();
                }}
              >
                清除
              </button>
            </div>
            <ul className="search-hits" ref={listRef} aria-label="搜索结果">
              {hits.map((hit, index) => (
                <li key={hit.nodeId}>
                  <button
                    type="button"
                    data-active={index === active ? 'true' : undefined}
                    className={index === active ? 'is-active' : undefined}
                    onMouseEnter={() => setActive(index)}
                    onClick={() => pick(hit)}
                  >
                    <span className="search-hit-q">{hit.question}</span>
                    {snippet(hit.reply) ? <span className="search-hit-a">{snippet(hit.reply)}</span> : null}
                  </button>
                </li>
              ))}
            </ul>
          </>
        ) : null}
        {!pending && submitted && hits.length === 0 ? <p className="search-status">没有找到相关内容</p> : null}
        {!pending && !submitted && hits.length === 0 ? <p className="search-status">输入关键词，搜索问题与回答</p> : null}
      </div>
    </div>
  );
}
