import { useEffect, useState } from 'react';
import { bindServices, useService } from '@rabjs/react';
import { AgentSettingsService } from './agent-settings.service.js';

function AgentSectionView() {
  const agent = useService(AgentSettingsService);
  const settings = agent.settings;
  const [prompt, setPrompt] = useState('');
  const [pending, setPending] = useState(false);

  useEffect(() => {
    void agent.load();
  }, [agent]);

  useEffect(() => {
    if (!settings) return;
    setPrompt(settings.systemPrompt ?? '');
  }, [settings]);

  const save = (value: string | null) => {
    setPending(true);
    void agent.save(value).finally(() => setPending(false));
  };

  return (
    <section className="account-section">
      <div className="sec-head">
        <h2>Agent</h2>
        <p className="section-lede">设置助手的角色、回答风格和偏好。仅对你的账号生效，所有模型共用。</p>
      </div>
      {agent.loading ? <p role="status">正在读取提示词…</p> : null}
      {agent.error ? (
        <p className="form-error" role="alert">
          {agent.error}
        </p>
      ) : null}
      {!agent.loading && !settings ? (
        <button className="btn btn-ghost" type="button" onClick={() => void agent.load()}>
          重新加载
        </button>
      ) : null}
      {settings ? (
        <form
          className="settings-form agent-prompt-form"
          onSubmit={(event) => {
            event.preventDefault();
            save(prompt);
          }}
        >
          <label className="field">
            <span>自定义系统提示词</span>
            <textarea
              rows={12}
              maxLength={20000}
              value={prompt}
              disabled={pending || agent.loading}
              aria-describedby="agent-prompt-help"
              placeholder="留空使用下方默认提示词"
              onChange={(event) => {
                setPrompt(event.target.value);
                agent.clearMessage();
              }}
            />
          </label>
          <p id="agent-prompt-help" className="section-lede">
            自定义内容会替换默认提示词。留空保存可恢复默认；保存后从下一次开始生成的回答生效。
          </p>
          <p className="section-lede">{prompt.length.toLocaleString()} / 20,000 字符</p>
          <div className="agent-prompt-actions">
            <button type="submit" className="btn btn-primary" disabled={pending || agent.loading}>
              {pending ? '保存中…' : '保存提示词'}
            </button>
            <button
              type="button"
              className="btn btn-ghost"
              disabled={pending || agent.loading || (!settings.systemPrompt && !prompt)}
              onClick={() => save(null)}
            >
              恢复默认
            </button>
          </div>
          {agent.message ? (
            <p className="form-ok" role="status">
              {agent.message}
            </p>
          ) : null}
          <details>
            <summary>查看默认提示词{settings.systemPrompt ? '' : '（当前已保存的配置）'}</summary>
            <p className="agent-default-prompt">{settings.defaultSystemPrompt}</p>
          </details>
        </form>
      ) : null}
    </section>
  );
}

export const AgentSection = bindServices(AgentSectionView, [AgentSettingsService]);
