import { AgentSettingsSection } from './components/AgentSettingsSection.js';
import { useEffect, useRef, useState } from 'react';
import {
  Bot,
  ChartColumn,
  CircleCheck,
  GitBranch,
  ImagePlus,
  KeyRound,
  Lightbulb,
  Monitor,
  Moon,
  Plus,
  Sun,
  SunMoon,
  Trash2,
  User,
  X,
} from 'lucide-react';
import {
  MODEL_PROVIDERS,
  PROVIDER_LABELS,
  PROVIDER_MODELS,
  type ModelProvider,
} from '@tributary/domain';
import {
  changePassword,
  deleteModelConfig,
  listModelConfigs,
  removeAvatar,
  saveModelConfig,
  setDefaultModelConfig,
  updateProfile,
  uploadAvatar,
  usage,
  type ModelConfig,
  type UsageView,
} from './api/client.js';
import { UserAvatar } from './components/UserAvatar.js';
import { EDGE_STYLE_OPTIONS, LAYOUT_OPTIONS, setCanvasSettings, useCanvasSettings } from './lib/canvasSettings.js';
import { relativeTime } from './lib/format.js';
import { setThemeMode, useTheme, useThemeMode, type ThemeMode } from './lib/theme.js';
import { useSession } from './store/session.js';

type Section = 'appearance' | 'canvas' | 'account' | 'models' | 'agent' | 'usage';

export const SETTINGS_SECTIONS: readonly Section[] = ['appearance', 'canvas', 'account', 'models', 'agent', 'usage'];

const NAV_GROUPS: { label: string; items: { id: Section; label: string; icon: typeof Sun }[] }[] = [
  {
    label: '通用',
    items: [
      { id: 'appearance', label: '外观', icon: SunMoon },
      { id: 'canvas', label: '画布', icon: GitBranch },
    ],
  },
  {
    label: '账户',
    items: [
      { id: 'account', label: '账号', icon: User },
      { id: 'models', label: '模型配置', icon: Bot },
      { id: 'agent', label: 'Agent', icon: Lightbulb },
    ],
  },
  {
    label: '数据',
    items: [{ id: 'usage', label: '用量', icon: ChartColumn }],
  },
];

export function SettingsDialog({
  section,
  onSection,
  onClose,
}: {
  section: Section;
  onSection: (section: Section) => void;
  onClose: () => void;
}) {
  const user = useSession((state) => state.user);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      event.stopPropagation();
      onClose();
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [onClose]);

  return (
    <div className="settings-overlay" onMouseDown={onClose}>
      <div
        className="settings-page"
        role="dialog"
        aria-modal="true"
        aria-label="设置"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <button type="button" className="settings-close" aria-label="关闭设置" onClick={onClose}>
          <X size={16} aria-hidden />
        </button>
        <nav className="settings-nav" aria-label="设置分区">
          <p className="settings-nav-title">设置</p>
          {NAV_GROUPS.map((group) => (
            <div className="settings-nav-group" key={group.label}>
              <p className="settings-nav-label">{group.label}</p>
              {group.items.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  className={section === item.id ? 'is-on' : undefined}
                  aria-current={section === item.id ? 'true' : undefined}
                  onClick={() => onSection(item.id)}
                >
                  <item.icon size={15} aria-hidden />
                  {item.label}
                </button>
              ))}
            </div>
          ))}
          <div className="settings-nav-user">
            <UserAvatar user={user} size={24} />
            <span>{user?.displayName || user?.email}</span>
          </div>
        </nav>
        <div className="settings-body">
          <div className="settings-col">
            {section === 'appearance' ? (
              <AppearanceSection />
            ) : section === 'canvas' ? (
              <CanvasSection />
            ) : section === 'agent' ? (
              <AgentSettingsSection />
            ) : section === 'account' ? (
              <AccountSection />
            ) : section === 'models' ? (
              <ModelsSection />
            ) : (
              <UsageSection />
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

/** 外观：纸 / 墨 / 跟随系统 */
function AppearanceSection() {
  const mode = useThemeMode();
  const resolved = useTheme();
  const cards: { value: ThemeMode; label: string; hint: string; icon: typeof Sun }[] = [
    { value: 'light', label: '纸 · 亮色', hint: '米白纸面，适合白天', icon: Sun },
    { value: 'dark', label: '墨 · 暗色', hint: '深夜墨底，适合弱光', icon: Moon },
    { value: 'system', label: '跟随系统', hint: `当前为${resolved === 'dark' ? '暗色' : '亮色'}`, icon: Monitor },
  ];
  return (
    <section className="account-section">
      <div className="sec-head">
        <h2>外观</h2>
        <p className="section-lede">主题随系统或手动固定，画布与所有页面即时生效。</p>
      </div>
      <p className="sec-sub">主题</p>
      <div className="theme-cards" role="radiogroup" aria-label="主题">
        {cards.map((card) => (
          <button
            key={card.value}
            type="button"
            role="radio"
            aria-checked={mode === card.value}
            className={`theme-card${mode === card.value ? ' is-on' : ''}`}
            onClick={() => setThemeMode(card.value)}
          >
            <span className={`thumb thumb-${card.value}`} aria-hidden />
            <span className="theme-card-name">
              <card.icon size={13} aria-hidden />
              {card.label}
            </span>
            <span className="theme-card-hint">{card.hint}</span>
          </button>
        ))}
      </div>
    </section>
  );
}

/** 画布：布局 / 连线 / 分支着色 / 小地图（与画布右下角 Dock、右上设置同源） */
function CanvasSection() {
  const settings = useCanvasSettings();
  return (
    <section className="account-section">
      <div className="sec-head">
        <h2>画布</h2>
        <p className="section-lede">布局与连线的全局默认，立即作用于当前画布。</p>
      </div>
      <p className="sec-sub">布局与连线</p>
      <div className="card">
        <div className="form-row">
          <div className="fr-main">
            <div className="fr-label">布局方向</div>
            <div className="fr-hint">节点生长的方向，鱼骨图、放射布局等后续可扩展</div>
          </div>
          <div className="fr-ctl">
            <div className="seg-control" role="radiogroup" aria-label="布局方向">
              {LAYOUT_OPTIONS.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  role="radio"
                  aria-checked={settings.layout === option.value}
                  className={settings.layout === option.value ? 'is-on' : undefined}
                  onClick={() => setCanvasSettings({ layout: option.value })}
                >
                  {option.label}
                </button>
              ))}
            </div>
          </div>
        </div>
        <div className="form-row">
          <div className="fr-main">
            <div className="fr-label">连线样式</div>
            <div className="fr-hint">曲线 / 圆角折线 / 直角折线</div>
          </div>
          <div className="fr-ctl">
            <div className="seg-control" role="radiogroup" aria-label="连线样式">
              {EDGE_STYLE_OPTIONS.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  role="radio"
                  aria-checked={settings.edgeStyle === option.value}
                  className={settings.edgeStyle === option.value ? 'is-on' : undefined}
                  onClick={() => setCanvasSettings({ edgeStyle: option.value })}
                >
                  {option.label}
                </button>
              ))}
            </div>
          </div>
        </div>
        <button
          type="button"
          className="form-row is-button"
          role="switch"
          aria-checked={settings.branchColors}
          onClick={() => setCanvasSettings({ branchColors: !settings.branchColors })}
        >
          <div className="fr-main">
            <div className="fr-label">分支着色</div>
            <div className="fr-hint">每个一级分支一种颜色，子分支继承</div>
          </div>
          <div className="fr-ctl">
            <span className={`switch${settings.branchColors ? ' is-on' : ''}`} />
          </div>
        </button>
        <button
          type="button"
          className="form-row is-button"
          role="switch"
          aria-checked={settings.minimap}
          onClick={() => setCanvasSettings({ minimap: !settings.minimap })}
        >
          <div className="fr-main">
            <div className="fr-label">显示小地图</div>
            <div className="fr-hint">画布右下角的全局缩略图</div>
          </div>
          <div className="fr-ctl">
            <span className={`switch${settings.minimap ? ' is-on' : ''}`} />
          </div>
        </button>
      </div>
    </section>
  );
}

/** 压缩到 128px 方图，避免把几 MB 的原图塞进数据库 */
function readAvatarFile(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    if (!/^image\/(png|jpeg|webp|gif)$/.test(file.type)) {
      reject(new Error('只支持 PNG / JPEG / WebP / GIF 图片'));
      return;
    }
    const url = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => {
      const size = 128;
      const canvas = document.createElement('canvas');
      canvas.width = size;
      canvas.height = size;
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        URL.revokeObjectURL(url);
        reject(new Error('浏览器不支持图片处理'));
        return;
      }
      const side = Math.min(image.width, image.height);
      ctx.drawImage(image, (image.width - side) / 2, (image.height - side) / 2, side, side, 0, 0, size, size);
      URL.revokeObjectURL(url);
      resolve(canvas.toDataURL('image/jpeg', 0.85));
    };
    image.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('图片读取失败'));
    };
    image.src = url;
  });
}

function AccountSection() {
  const user = useSession((state) => state.user);
  const applyUser = useSession((state) => state.applyUser);
  const fileRef = useRef<HTMLInputElement>(null);
  const [name, setName] = useState(user?.displayName ?? '');
  const [nameMsg, setNameMsg] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);
  const [avatarMsg, setAvatarMsg] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);
  const [pwd, setPwd] = useState({ current: '', next: '', confirm: '' });
  const [pwdMsg, setPwdMsg] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);
  const [pending, setPending] = useState(false);

  const saveAvatar = async (file: File) => {
    setAvatarMsg(null);
    setPending(true);
    try {
      const dataUrl = await readAvatarFile(file);
      const body = await uploadAvatar(dataUrl);
      applyUser(body.user);
      setAvatarMsg({ kind: 'ok', text: '头像已更新' });
    } catch (error) {
      setAvatarMsg({ kind: 'err', text: error instanceof Error ? error.message : '上传失败' });
    } finally {
      setPending(false);
    }
  };

  return (
    <section className="account-section">
      <div className="sec-head">
        <h2>账号</h2>
        <p className="section-lede">头像、昵称会显示在侧边栏和设置里；邮箱暂不支持修改。</p>
      </div>

      <div className="profile-card">
        <UserAvatar user={user} size={64} />
        <div className="profile-info">
          <p className="profile-name">{user?.displayName || '未设置昵称'}</p>
          <p className="profile-email">{user?.email}</p>
        </div>
        <div className="profile-actions">
          <input
            ref={fileRef}
            type="file"
            accept="image/png,image/jpeg,image/webp,image/gif"
            hidden
            onChange={(event) => {
              const file = event.target.files?.[0];
              event.target.value = '';
              if (file) void saveAvatar(file);
            }}
          />
          <button type="button" className="btn btn-ghost" disabled={pending} onClick={() => fileRef.current?.click()}>
            <ImagePlus size={14} aria-hidden />
            上传头像
          </button>
          {user?.avatar ? (
            <button
              type="button"
              className="btn btn-ghost"
              disabled={pending}
              onClick={() => {
                setPending(true);
                setAvatarMsg(null);
                void removeAvatar()
                  .then(() => useSession.getState().load())
                  .then(() => {
                    setAvatarMsg({ kind: 'ok', text: '已移除头像' });
                  })
                  .catch((error: unknown) => setAvatarMsg({ kind: 'err', text: error instanceof Error ? error.message : '移除失败' }))
                  .finally(() => setPending(false));
              }}
            >
              移除
            </button>
          ) : null}
        </div>
        {avatarMsg ? <p className={avatarMsg.kind === 'ok' ? 'form-ok' : 'form-error'} role="status">{avatarMsg.text}</p> : null}
      </div>

      <form
        className="settings-form"
        onSubmit={(event) => {
          event.preventDefault();
          setPending(true);
          setNameMsg(null);
          void updateProfile({ displayName: name.trim() })
            .then((body) => {
              applyUser(body.user);
              setNameMsg({ kind: 'ok', text: '昵称已保存' });
            })
            .catch((error: unknown) => setNameMsg({ kind: 'err', text: error instanceof Error ? error.message : '保存失败' }))
            .finally(() => setPending(false));
        }}
      >
        <h3 className="form-title">昵称</h3>
        <label className="field">
          <span>显示名称</span>
          <input value={name} maxLength={40} placeholder="未设置昵称" onChange={(event) => setName(event.target.value)} />
        </label>
        {nameMsg ? <p className={nameMsg.kind === 'ok' ? 'form-ok' : 'form-error'} role="status">{nameMsg.text}</p> : null}
        <button type="submit" className="btn btn-primary form-submit" disabled={pending}>
          保存昵称
        </button>
      </form>

      <form
        className="settings-form"
        onSubmit={(event) => {
          event.preventDefault();
          if (pwd.next !== pwd.confirm) {
            setPwdMsg({ kind: 'err', text: '两次输入的新密码不一致' });
            return;
          }
          setPending(true);
          setPwdMsg(null);
          void changePassword({ currentPassword: pwd.current, newPassword: pwd.next })
            .then(() => {
              setPwd({ current: '', next: '', confirm: '' });
              setPwdMsg({ kind: 'ok', text: '密码已更新' });
            })
            .catch((error: unknown) => setPwdMsg({ kind: 'err', text: error instanceof Error ? error.message : '修改失败' }))
            .finally(() => setPending(false));
        }}
      >
        <h3 className="form-title">
          <KeyRound size={15} aria-hidden />
          修改密码
        </h3>
        <label className="field">
          <span>当前密码</span>
          <input type="password" autoComplete="current-password" required value={pwd.current} onChange={(event) => setPwd({ ...pwd, current: event.target.value })} />
        </label>
        <div className="field-row">
          <label className="field">
            <span>新密码</span>
            <input type="password" autoComplete="new-password" required minLength={8} placeholder="至少 8 位" value={pwd.next} onChange={(event) => setPwd({ ...pwd, next: event.target.value })} />
          </label>
          <label className="field">
            <span>确认新密码</span>
            <input type="password" autoComplete="new-password" required value={pwd.confirm} onChange={(event) => setPwd({ ...pwd, confirm: event.target.value })} />
          </label>
        </div>
        {pwdMsg ? <p className={pwdMsg.kind === 'ok' ? 'form-ok' : 'form-error'} role="status">{pwdMsg.text}</p> : null}
        <button type="submit" className="btn btn-primary form-submit" disabled={pending}>
          更新密码
        </button>
      </form>
    </section>
  );
}

function ModelsSection() {
  const [configs, setConfigs] = useState<ModelConfig[]>([]);
  const [provider, setProvider] = useState<ModelProvider>('dashscope');
  const [model, setModel] = useState(PROVIDER_MODELS.dashscope);
  const [apiKey, setApiKey] = useState('');
  const [baseUrl, setBaseUrl] = useState('');
  const [isDefault, setIsDefault] = useState(true);
  const [error, setError] = useState('');
  const [saved, setSaved] = useState(false);
  const [pending, setPending] = useState(false);

  useEffect(() => {
    void listModelConfigs()
      .then((body) => setConfigs(body.configs))
      .catch((reason: unknown) => setError(reason instanceof Error ? reason.message : '读取模型失败'));
  }, []);

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
          setError('');
          setSaved(false);
          const url = baseUrl.trim();
          void saveModelConfig({
            provider,
            model: model.trim(),
            apiKey: apiKey.trim(),
            isDefault,
            ...(url ? { baseUrl: url } : {}),
          })
            .then(async () => {
              const body = await listModelConfigs();
              setConfigs(body.configs);
              setApiKey('');
              setBaseUrl('');
              setIsDefault(false);
              setSaved(true);
            })
            .catch((reason: unknown) => setError(reason instanceof Error ? reason.message : '保存失败'))
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
                <Bot size={14} aria-hidden />
                {PROVIDER_LABELS[item]}
              </button>
            ))}
          </div>
        </div>
        <div className="field-row">
          <label className="field">
            <span>模型</span>
            <input value={model} required onChange={(event) => setModel(event.target.value)} />
          </label>
          <label className="field">
            <span>API Key</span>
            <input type="password" autoComplete="off" required placeholder="sk-…" value={apiKey} onChange={(event) => setApiKey(event.target.value)} />
          </label>
        </div>
        <label className="field">
          <span>Base URL（可选）</span>
          <input inputMode="url" placeholder="不填则使用官方地址" value={baseUrl} onChange={(event) => setBaseUrl(event.target.value)} />
        </label>
        <label className="check">
          <input type="checkbox" checked={isDefault} onChange={(event) => setIsDefault(event.target.checked)} />
          设为默认模型
        </label>
        {error ? (
          <p className="form-error" role="alert">
            {error}
          </p>
        ) : null}
        {saved ? (
          <p className="form-ok" role="status">
            <CircleCheck size={13} aria-hidden /> 已保存
          </p>
        ) : null}
        <button type="submit" className="btn btn-primary form-submit" disabled={pending}>
          <Plus size={14} aria-hidden />
          {pending ? '保存中…' : '新增配置'}
        </button>
      </form>
      {configs.length === 0 ? <p className="section-lede">还没有模型。加上一条之后，画板上就可以选它。</p> : null}
      <ul className="config-list">
        {configs.map((config) => (
          <li key={config.id}>
            <div className="config-icon">
              <Bot size={15} aria-hidden />
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
                <button
                  type="button"
                  className="btn btn-ghost"
                  onClick={() => {
                    void setDefaultModelConfig(config.id)
                      .then(() => listModelConfigs())
                      .then((body) => setConfigs(body.configs))
                      .catch((reason: unknown) => setError(reason instanceof Error ? reason.message : '设置失败'));
                  }}
                >
                  设为默认
                </button>
              )}
              <button
                type="button"
                className="icon-button"
                aria-label={`删除 ${PROVIDER_LABELS[config.provider]} ${config.model}`}
                onClick={() => {
                  void deleteModelConfig(config.id)
                    .then(() => listModelConfigs())
                    .then((body) => setConfigs(body.configs))
                    .catch((reason: unknown) => setError(reason instanceof Error ? reason.message : '删除失败'));
                }}
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

function UsageSection() {
  const [view, setView] = useState<UsageView | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    void usage()
      .then(setView)
      .catch((reason: unknown) => setError(reason instanceof Error ? reason.message : '读取用量失败'));
  }, []);

  return (
    <section className="account-section">
      <div className="sec-head">
        <h2>用量</h2>
        <p className="section-lede">只统计你自己的调用。总览是累计，明细是每一次。</p>
      </div>
      {error ? (
        <p className="form-error" role="alert">
          {error}
        </p>
      ) : null}
      {view ? (
        <>
          <h3>总览</h3>
          <div className="usage-cards">
            <div className="usage-card">
              <div className="label">
                <Lightbulb size={14} aria-hidden />
                提示词 tokens
              </div>
              <div className="num">{view.promptTokens.toLocaleString()}</div>
            </div>
            <div className="usage-card">
              <div className="label">
                <Bot size={14} aria-hidden />
                补全 tokens
              </div>
              <div className="num">{view.completionTokens.toLocaleString()}</div>
            </div>
            <div className="usage-card is-total">
              <div className="label">
                <ChartColumn size={14} aria-hidden />
                合计 tokens
              </div>
              <div className="num">{view.totalTokens.toLocaleString()}</div>
            </div>
          </div>
          {view.byModel.length > 0 ? (
            <ul className="usage-groups">
              {view.byModel.map((group) => (
                <li key={`${group.providerName}:${group.model}`}>
                  <strong>{group.providerName}</strong>
                  <span>{group.model}</span>
                  <span>
                    {group.calls} 次 · {group.totalTokens.toLocaleString()} tokens
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="section-lede">还没有调用。</p>
          )}
          <h3>明细</h3>
          {view.calls.length === 0 ? (
            <p className="section-lede">调用完成后会出现在这里。</p>
          ) : (
            <div className="usage-table-wrap">
              <table className="usage-table">
                <thead>
                  <tr>
                    <th>时间</th>
                    <th>供应商</th>
                    <th>模型</th>
                    <th>提示</th>
                    <th>补全</th>
                    <th>合计</th>
                  </tr>
                </thead>
                <tbody>
                  {view.calls.map((call) => (
                    <tr key={call.id}>
                      <td>{relativeTime(call.createdAt)}</td>
                      <td>{call.providerName}</td>
                      <td>{call.model}</td>
                      <td>{call.promptTokens.toLocaleString()}</td>
                      <td>{call.completionTokens.toLocaleString()}</td>
                      <td>{call.totalTokens.toLocaleString()}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      ) : null}
    </section>
  );
}
