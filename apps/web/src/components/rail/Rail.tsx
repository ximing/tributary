import { useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router';
import { CircleHelp, LogOut, Moon, PanelLeftClose, PanelLeftOpen, Plus, Settings, Sun } from 'lucide-react';
import { useTheme, toggleTheme } from '../../lib/theme.js';
import { toggleRail, useRailCollapsed } from '../../lib/rail.js';
import { useSession } from '../../store/session.js';
import { useWorkspace } from '../../store/workspace.js';
import { UserAvatar } from '../UserAvatar.js';
import { ConversationList } from './ConversationList.js';
import { SearchBox } from './SearchBox.js';

export function Rail() {
  const newConversation = useWorkspace((state) => state.newConversation);
  const setHelpOpen = useWorkspace((state) => state.setHelpOpen);
  const user = useSession((state) => state.user);
  const logout = useSession((state) => state.logout);
  const theme = useTheme();
  const collapsed = useRailCollapsed();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const settingsParam = params.get('settings');
  const settingsOpen = settingsParam !== null;
  const [creating, setCreating] = useState(false);

  const openSettings = (section: string) => {
    setParams((current) => {
      const next = new URLSearchParams(current);
      next.set('settings', section);
      return next;
    });
  };

  return (
    <aside className={`rail${collapsed ? ' is-collapsed' : ''}`} aria-label="对话列表">
      <div className="rail-head">
        <header className="brand">
          <p className="mark">支</p>
          <div className="brand-text">
            <h1>支流</h1>
            <p>问题长成一棵树</p>
          </div>
        </header>
        <button
          type="button"
          className="rail-collapse"
          title={collapsed ? '展开侧栏 ]' : '收起侧栏 ['}
          aria-label={collapsed ? '展开侧栏' : '收起侧栏'}
          aria-expanded={!collapsed}
          onClick={toggleRail}
        >
          {collapsed ? <PanelLeftOpen size={15} aria-hidden /> : <PanelLeftClose size={15} aria-hidden />}
        </button>
      </div>
      <button
        type="button"
        className="btn btn-primary"
        title="新对话"
        disabled={creating}
        onClick={() => {
          setCreating(true);
          void newConversation().finally(() => setCreating(false));
        }}
      >
        <Plus size={15} aria-hidden />
        <span className="btn-text">新对话</span>
      </button>
      <SearchBox />
      <ConversationList />
      <div className="rail-foot">
        <button
          type="button"
          className={`rail-row${settingsOpen ? ' is-on' : ''}`}
          aria-expanded={settingsOpen}
          aria-haspopup="dialog"
          title="设置 ⌘,"
          onClick={() => openSettings('account')}
        >
          <Settings size={15} aria-hidden />
          <span className="row-text">设置</span>
          <span className="grow">⌘,</span>
        </button>
        <button type="button" className="rail-row" title="切换主题 ⇧D" onClick={toggleTheme}>
          {theme === 'dark' ? <Sun size={15} aria-hidden /> : <Moon size={15} aria-hidden />}
          <span className="row-text">{theme === 'dark' ? '切换亮色' : '切换暗色'}</span>
          <span className="grow">⇧D</span>
        </button>
        <button type="button" className="rail-row" title="快捷键 ?" onClick={() => setHelpOpen(true)}>
          <CircleHelp size={15} aria-hidden />
          <span className="row-text">快捷键</span>
          <span className="grow">?</span>
        </button>
        <div className="rail-user">
          <button
            type="button"
            className="rail-user-btn"
            title="账号设置"
            onClick={() => openSettings('account')}
          >
            <UserAvatar user={user} size={26} />
            <span className="name">{user?.displayName || user?.email}</span>
          </button>
          <button
            type="button"
            className="rail-user-logout"
            aria-label="退出登录"
            title="退出登录"
            onClick={() => {
              void logout().then(() => navigate('/'));
            }}
          >
            <LogOut size={14} aria-hidden />
          </button>
        </div>
      </div>
    </aside>
  );
}
