import { useState } from 'react';
import { Search } from 'lucide-react';
import { useWorkspace } from '../../store/workspace.js';

export function SearchBox() {
  const hits = useWorkspace((state) => state.hits);
  const runSearch = useWorkspace((state) => state.runSearch);
  const clearHits = useWorkspace((state) => state.clearHits);
  const openConversation = useWorkspace((state) => state.openConversation);
  const [query, setQuery] = useState('');

  return (
    <div className="search">
      <form
        className="search-box"
        onSubmit={(event) => {
          event.preventDefault();
          if (query.trim()) void runSearch(query.trim());
        }}
      >
        <Search size={14} aria-hidden />
        <input
          id="rail-search-input"
          aria-label="搜索"
          placeholder="搜索问题与回答…"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
        <kbd>⌘K</kbd>
      </form>
      {hits.length > 0 ? (
        <div className="hits-wrap">
          <div className="hits-head">
            <span>{hits.length} 条结果</span>
            <button type="button" onClick={clearHits}>
              清除
            </button>
          </div>
          <ul className="hits" aria-label="搜索结果">
            {hits.map((hit) => (
              <li key={hit.nodeId}>
                <button type="button" onClick={() => void openConversation(hit.conversationId, hit.nodeId)}>
                  {hit.question}
                </button>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
