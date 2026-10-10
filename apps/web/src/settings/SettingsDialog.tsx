import { useEffect } from 'react';
import { observer, useService } from '@rabjs/react';
import { Bot, ChartColumn, GitBranch, Lightbulb, SunMoon, User, X } from 'lucide-react';
import { UserAvatar } from '../components/UserAvatar.js';
import { SessionService } from '../services/session.service.js';
import { AccountSection } from './AccountSection.js';
import { AgentSection } from './AgentSection.js';
import { AppearanceSection } from './AppearanceSection.js';
import { CanvasSection } from './CanvasSection.js';
import { ModelsSection } from './ModelsSection.js';
import { type SettingsSection } from './sections.js';
import { UsageSection } from './UsageSection.js';

const NAV_GROUPS: { label: string; items: { id: SettingsSection; label: string; icon: typeof SunMoon }[] }[] = [
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

export const SettingsDialog = observer(function SettingsDialog({
  section,
  onSection,
  onClose,
}: {
  section: SettingsSection;
  onSection: (section: SettingsSection) => void;
  onClose: () => void;
}) {
  const session = useService(SessionService);
  const user = session.user;

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
              <AgentSection />
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
});
