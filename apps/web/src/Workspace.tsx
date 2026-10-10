import { useCallback, useEffect, useState } from 'react';
import { ReactFlowProvider } from '@xyflow/react';
import { Link } from 'react-router';
import { shortcutForKey, shortcutHints } from '@tributary/domain';
import {
  createConversation,
  createNode,
  listConversations,
  listProviders,
  loadConversation,
  saveProvider,
  search,
  setCollapsed,
  type Conversation,
  type ConversationNode,
  type Provider,
  type SearchHit,
} from './api.js';
import { Canvas } from './Canvas.js';

function modelValue(providerId: string, model: string): string {
  return `${providerId}::${model}`;
}

export function Workspace() {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [providers, setProviders] = useState<Provider[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [nodes, setNodes] = useState<ConversationNode[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [question, setQuestion] = useState('');
  const [modelChoice, setModelChoice] = useState('');
  const [hits, setHits] = useState<SearchHit[]>([]);
  const [query, setQuery] = useState('');
  const [menu, setMenu] = useState<{ x: number; y: number } | null>(null);
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  const [providerForm, setProviderForm] = useState({ name: '', baseUrl: '', apiKey: '', models: '' });

  const refreshList = useCallback(async () => {
    const body = await listConversations();
    setConversations(body.conversations);
  }, []);

  const refreshProviders = useCallback(async () => {
    const body = await listProviders();
    setProviders(body.providers);
  }, []);

  const openConversation = useCallback(async (id: string, selectId?: string | null) => {
    const body = await loadConversation(id);
    setActiveId(id);
    setNodes(body.nodes);
    setSelectedId(selectId ?? null);
    setMenu(null);
  }, []);

  useEffect(() => {
    void refreshList().catch((error: unknown) => setNotice(error instanceof Error ? error.message : '加载失败'));
    void refreshProviders().catch((error: unknown) => setNotice(error instanceof Error ? error.message : '加载失败'));
  }, [refreshList, refreshProviders]);

  const chosen = (() => {
    const split = modelChoice.split('::');
    if (split.length < 2 || !split[0] || !split[1]) return { providerId: null, model: null };
    return { providerId: split[0], model: split.slice(1).join('::') };
  })();

  async function submit(relation: 'root' | 'child' | 'sibling', text: string, selected: string | null) {
    if (!activeId) {
      setNotice('先新建一个对话');
      return;
    }
    setBusy(true);
    setNotice('');
    try {
      const node = await createNode({
        conversationId: activeId,
        question: text,
        relation,
        selectedNodeId: selected,
        providerId: chosen.providerId,
        model: chosen.model,
      });
      await refreshList();
      await openConversation(activeId, node.id);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : '提问失败');
    } finally {
      setBusy(false);
    }
  }

  async function addRelated(relation: 'child' | 'sibling') {
    if (!selectedId) {
      setNotice('先选择一个节点');
      return;
    }
    setMenu(null);
    await submit(relation, relation === 'child' ? '子问题' : '同级问题', selectedId);
  }

  async function toggleSelected() {
    if (!selectedId) return;
    const current = nodes.find((node) => node.id === selectedId);
    if (!current) return;
    const next = !current.collapsed;
    setNodes((existing) => existing.map((node) => (node.id === selectedId ? { ...node, collapsed: next } : node)));
    setMenu(null);
    try {
      await setCollapsed(selectedId, next);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : '展开失败');
    }
  }

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target;
      if (target instanceof HTMLElement) {
        const tag = target.tagName;
        if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || target.isContentEditable) return;
      }
      const shortcut = shortcutForKey(event.key);
      if (!shortcut) return;
      event.preventDefault();
      if (shortcut.id === 'child') void addRelated('child');
      if (shortcut.id === 'sibling') void addRelated('sibling');
      if (shortcut.id === 'toggle') void toggleSelected();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  return (
    <div className="app">
      <aside className="rail" aria-label="对话列表">
        <header className="brand">
          <p className="mark">支</p>
          <div>
            <h1>支流</h1>
            <p>问题长成一棵树</p>
          </div>
        </header>
        <button
          type="button"
          className="primary"
          onClick={() => {
            void createConversation()
              .then(async (conversation) => {
                await refreshList();
                await openConversation(conversation.id);
              })
              .catch((error: unknown) => setNotice(error instanceof Error ? error.message : '创建失败'));
          }}
        >
          新对话
        </button>
        <form
          className="search"
          onSubmit={(event) => {
            event.preventDefault();
            void search(query)
              .then((body) => setHits(body.hits))
              .catch((error: unknown) => setNotice(error instanceof Error ? error.message : '搜索失败'));
          }}
        >
          <input aria-label="搜索" placeholder="搜索对话" value={query} onChange={(event) => setQuery(event.target.value)} />
        </form>
        {hits.length > 0 ? (
          <ul className="hits" aria-label="搜索结果">
            {hits.map((hit) => (
              <li key={hit.nodeId}>
                <button
                  type="button"
                  onClick={() => {
                    void openConversation(hit.conversationId, hit.nodeId).catch((error: unknown) =>
                      setNotice(error instanceof Error ? error.message : '打开失败'),
                    );
                  }}
                >
                  {hit.question}
                </button>
              </li>
            ))}
          </ul>
        ) : null}
        <ul className="conversations">
          {conversations.map((conversation) => (
            <li key={conversation.id}>
              <button
                type="button"
                className={conversation.id === activeId ? 'is-active' : undefined}
                onClick={() => {
                  void openConversation(conversation.id).catch((error: unknown) =>
                    setNotice(error instanceof Error ? error.message : '打开失败'),
                  );
                }}
              >
                {conversation.title}
              </button>
            </li>
          ))}
        </ul>
        <details className="providers">
          <summary>模型配置</summary>
          <form
            onSubmit={(event) => {
              event.preventDefault();
              const models = providerForm.models
                .split(/[,，]/)
                .map((item) => item.trim())
                .filter(Boolean);
              void saveProvider({ ...providerForm, models })
                .then(async () => {
                  setProviderForm({ name: '', baseUrl: '', apiKey: '', models: '' });
                  await refreshProviders();
                })
                .catch((error: unknown) => setNotice(error instanceof Error ? error.message : '保存失败'));
            }}
          >
            <input aria-label="名称" placeholder="名称" value={providerForm.name} onChange={(event) => setProviderForm({ ...providerForm, name: event.target.value })} />
            <input aria-label="Base URL" placeholder="Base URL" value={providerForm.baseUrl} onChange={(event) => setProviderForm({ ...providerForm, baseUrl: event.target.value })} />
            <input aria-label="API Key" placeholder="API Key" type="password" value={providerForm.apiKey} onChange={(event) => setProviderForm({ ...providerForm, apiKey: event.target.value })} />
            <input aria-label="模型列表" placeholder="模型甲, 模型乙" value={providerForm.models} onChange={(event) => setProviderForm({ ...providerForm, models: event.target.value })} />
            <button type="submit">保存模型</button>
          </form>
        </details>
        <Link className="usage-link" to="/usage">
          用量
        </Link>
      </aside>
      <main className="stage">
        <form
          className="composer"
          onSubmit={(event) => {
            event.preventDefault();
            const text = question.trim();
            if (!text) return;
            const relation = selectedId ? 'child' : 'root';
            void submit(relation, text, selectedId).then(() => setQuestion(''));
          }}
        >
          <input
            aria-label="问题"
            placeholder={selectedId ? '顺着这个节点继续问' : '提出一个新问题'}
            value={question}
            onChange={(event) => setQuestion(event.target.value)}
          />
          <select aria-label="模型" value={modelChoice} onChange={(event) => setModelChoice(event.target.value)}>
            <option value="">选择模型</option>
            {providers.flatMap((provider) =>
              provider.models.map((model) => (
                <option key={modelValue(provider.id, model)} value={modelValue(provider.id, model)}>
                  {provider.name} / {model}
                </option>
              )),
            )}
          </select>
          <button type="submit" className="primary" disabled={busy}>
            提问
          </button>
        </form>
        <p className="hints" aria-label="快捷键">
          {shortcutHints().map((hint) => (
            <span key={hint}>{hint}</span>
          ))}
        </p>
        {notice ? <p className="notice">{notice}</p> : null}
        <ReactFlowProvider>
          <Canvas
            nodes={nodes}
            selectedId={selectedId}
            menu={menu}
            onSelect={setSelectedId}
            onContextMenu={(id, x, y) => {
              setSelectedId(id);
              setMenu({ x, y });
            }}
            onDismissMenu={() => setMenu(null)}
            onAdd={(relation) => {
              void addRelated(relation);
            }}
            onToggle={() => {
              void toggleSelected();
            }}
          />
        </ReactFlowProvider>
      </main>
    </div>
  );
}
