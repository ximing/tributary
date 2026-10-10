import { useEffect, useState } from 'react';
import { bindServices, useService } from '@rabjs/react';
import { MODEL_PROVIDERS, PROVIDER_BASE_URLS, PROVIDER_LABELS, PROVIDER_MODEL_OPTIONS, PROVIDER_MODELS, type ModelProvider } from '@tributary/domain';
import { CircleCheck, Plus, Trash2 } from 'lucide-react';
import { ProviderMark } from '../components/ProviderMark.js';
import { ModelsSettingsService } from './models-settings.service.js';

function ModelsSectionView() {
  const models = useService(ModelsSettingsService);
  const [provider, setProvider] = useState<ModelProvider>('dashscope');
  const [model, setModel] = useState(PROVIDER_MODELS.dashscope);
  const [apiKey, setApiKey] = useState('');
  const [baseUrl, setBaseUrl] = useState('');
  const [isDefault, setIsDefault] = useState(true);
  const [pending, setPending] = useState(false);
  const suggestions = PROVIDER_MODEL_OPTIONS[provider];
  const listId = suggestions.length > 1 ? `${provider}-models` : undefined;

  useEffect(() => {
    void models.load();
  }, [models]);

  return (
    <section className="account-section">
      <div className="sec-head">
        <h2>模型配置</h2>
        <p className="section-lede">自带密钥。选好供应商会自动填上推荐模型，Base URL 留空就走官方地址。</p>
      </div>
      <form
        className="settings-form model-form"
        onSubmit={(event) => {
          event.preventDefault();
          setPending(true);
          const url = baseUrl.trim();
          void models
            .save({
              provider,
              model: model.trim(),
              apiKey: apiKey.trim(),
              isDefault,
              ...(url ? { baseUrl: url } : {}),
            })
            .then((ok) => {
              if (!ok) return;
              setApiKey('');
              setBaseUrl('');
              setIsDefault(false);
            })
            .finally(() => setPending(false));
        }}
      >
        <div className="field">
          <span>供应商</span>
          <div className="provider-grid" role="radiogroup" aria-label="供应商">
            {MODEL_PROVIDERS.map((item) => (
              <button
                key={item}
                type="button"
                role="radio"
                aria-checked={provider === item}
                className={`provider-card${provider === item ? ' is-on' : ''}`}
                onClick={() => {
                  setProvider(item);
                  setModel((current) => (current === PROVIDER_MODELS[provider] || current.trim() === '' ? PROVIDER_MODELS[item] : current));
                }}
              >
                <ProviderMark provider={item} />
                {PROVIDER_LABELS[item]}
              </button>
            ))}
          </div>
        </div>
        <div className="field-row">
          <label className="field">
            <span>模型</span>
            <input value={model} required list={listId} onChange={(event) => setModel(event.target.value)} />
            {listId ? (
              <datalist id={listId}>
                {suggestions.map((item) => (
                  <option key={item} value={item} />
                ))}
              </datalist>
            ) : null}
          </label>
          <label className="field">
            <span>API Key</span>
            <input type="password" autoComplete="off" required placeholder="sk-…" value={apiKey} onChange={(event) => setApiKey(event.target.value)} />
          </label>
        </div>
        <label className="field">
          <span>Base URL（可选）</span>
          <input inputMode="url" placeholder={PROVIDER_BASE_URLS[provider]} value={baseUrl} onChange={(event) => setBaseUrl(event.target.value)} />
        </label>
        <label className="check">
          <input type="checkbox" checked={isDefault} onChange={(event) => setIsDefault(event.target.checked)} />
          设为默认模型
        </label>
        {models.error ? (
          <p className="form-error" role="alert">
            {models.error}
          </p>
        ) : null}
        {models.saved ? (
          <p className="form-ok" role="status">
            <CircleCheck size={13} aria-hidden /> 已保存
          </p>
        ) : null}
        <button type="submit" className="btn btn-primary form-submit" disabled={pending}>
          <Plus size={14} aria-hidden />
          {pending ? '保存中…' : '新增配置'}
        </button>
      </form>
      {models.configs.length === 0 ? <p className="section-lede">还没有模型。加上一条之后，画板上就可以选它。</p> : null}
      <ul className="config-list">
        {models.configs.map((config) => (
          <li key={config.id}>
            <div className="config-icon">
              <ProviderMark provider={config.provider} size={16} />
            </div>
            <div className="config-main">
              <p className="config-title">
                {PROVIDER_LABELS[config.provider]}
                {config.isDefault ? <em>默认</em> : null}
              </p>
              <p className="config-meta">
                {config.model} · 密钥 {config.apiKeyMask}
                {config.baseUrl ? ` · ${config.baseUrl}` : ''}
              </p>
            </div>
            <div className="config-actions">
              {config.isDefault ? null : (
                <button type="button" className="btn btn-ghost" onClick={() => void models.makeDefault(config.id)}>
                  设为默认
                </button>
              )}
              <button
                type="button"
                className="icon-button"
                aria-label={`删除 ${PROVIDER_LABELS[config.provider]} ${config.model}`}
                onClick={() => void models.remove(config.id)}
              >
                <Trash2 size={14} aria-hidden />
              </button>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}

export const ModelsSection = bindServices(ModelsSectionView, [ModelsSettingsService]);
