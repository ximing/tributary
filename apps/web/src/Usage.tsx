import { useEffect, useState } from 'react';
import { Link } from 'react-router';
import { usage, type UsageView } from './api.js';

export function UsagePage() {
  const [view, setView] = useState<UsageView | null>(null);
  const [notice, setNotice] = useState('');

  useEffect(() => {
    void usage()
      .then(setView)
      .catch((error: unknown) => setNotice(error instanceof Error ? error.message : '读取用量失败'));
  }, []);

  return (
    <main className="usage-page">
      <header>
        <p className="mark">支</p>
        <h1>用量</h1>
        <Link to="/">返回画板</Link>
      </header>
      {notice ? <p className="notice">{notice}</p> : null}
      {view ? (
        <dl className="totals">
          <div>
            <dt>提示词 tokens</dt>
            <dd>{view.promptTokens}</dd>
          </div>
          <div>
            <dt>补全 tokens</dt>
            <dd>{view.completionTokens}</dd>
          </div>
          <div>
            <dt>合计 tokens</dt>
            <dd>{view.totalTokens}</dd>
          </div>
        </dl>
      ) : null}
    </main>
  );
}
