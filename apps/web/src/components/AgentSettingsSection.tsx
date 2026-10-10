import { useEffect, useState } from 'react';
import { getAgentSettings, saveAgentSettings, type AgentSettings } from '../api/client.js';

export function AgentSettingsSection() {
  const [settings, setSettings] = useState<AgentSettings | null>(null);
  const [prompt, setPrompt] = useState('');
  const [loading, setLoading] = useState(true);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [reload, setReload] = useState(0);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError('');
    void getAgentSettings().then((body) => {
      if (!active) return;
      setSettings(body);
      setPrompt(body.systemPrompt ?? '');
    }).catch((reason: unknown) => {
      if (active) setError(reason instanceof Error ? reason.message : '读取提示词失败');
    }).finally(() => {
      if (active) setLoading(false);
    });
    return () => { active = false; };
  }, [reload]);

  const save = async (value: string | null) => {
    setPending(true);
    setError('');
    setMessage('');
    try {
      const body = await saveAgentSettings(value);
      setSettings(body);
      setPrompt(body.systemPrompt ?? '');
      setMessage(body.systemPrompt ? '已保存，将用于后续回答。' : '已恢复默认提示词，将用于后续回答。');
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : '保存失败');
    } finally {
      setPending(false);
    }
  };

  return (
    <section className="account-section">
      <div className="sec-head">
        <h2>Agent</h2>
        <p className="section-lede">设置助手的角色、回答风格和偏好。仅对你的账号生效，所有模型共用。</p>
      </div>
      {loading ? <p role="status">正在读取提示词…</p> : null}
      {error ? <p className="form-error" role="alert">{error}</p> : null}
      {!loading && !settings ? <button className="btn btn-ghost" type="button" onClick={() => setReload((value) => value + 1)}>重新加载</button> : null}
      {settings ? (
        <form className="settings-form agent-prompt-form" onSubmit={(event) => {
          event.preventDefault();
          void save(prompt);
        }}>
          <label className="field">
            <span>自定义系统提示词</span>
            <textarea
              rows={12}
              maxLength={20000}
              value={prompt}
              disabled={pending || loading}
              aria-describedby="agent-prompt-help"
              placeholder="留空使用下方默认提示词"
              onChange={(event) => { setPrompt(event.target.value); setMessage(''); }}
            />
          </label>
          <p id="agent-prompt-help" className="section-lede">自定义内容会替换默认提示词。留空保存可恢复默认；保存后从下一次开始生成的回答生效。</p>
          <p className="section-lede">{prompt.length.toLocaleString()} / 20,000 字符</p>
          <div className="agent-prompt-actions">
            <button type="submit" className="btn btn-primary" disabled={pending || loading}>{pending ? '保存中…' : '保存提示词'}</button>
            <button type="button" className="btn btn-ghost" disabled={pending || loading || (!settings.systemPrompt && !prompt)} onClick={() => void save(null)}>恢复默认</button>
          </div>
          {message ? <p className="form-ok" role="status">{message}</p> : null}
          <details>
            <summary>查看默认提示词{settings.systemPrompt ? '' : '（当前已保存的配置）'}</summary>
            <p className="agent-default-prompt">{settings.defaultSystemPrompt}</p>
          </details>
        </form>
      ) : null}
    </section>
  );
}
