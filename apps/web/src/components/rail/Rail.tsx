import { useEffect, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router';
import { CircleHelp, LogOut, Moon, PanelLeftClose, PanelLeftOpen, Plus, Search, Settings, Sun } from 'lucide-react';
import { toggleTheme, useTheme } from '../../lib/theme.js';
import { toggleRail, useRailCollapsed } from '../../lib/rail.js';
import { useSession } from '../../store/session.js';
import { useWorkspace } from '../../store/workspace.js';
import { UserAvatar } from '../UserAvatar.js';
import { ConversationList } from './ConversationList.js';
import { SearchDialog } from './SearchDialog.js';

export function Rail() {
  const newConversation = useWorkspace((state) => state.newConversation);
  const searchOpen = useWorkspace((state) => state.searchOpen);
  const setSearchOpen = useWorkspace((state) => state.setSearchOpen);
  const collapsed = useRailCollapsed();
  const [creating, setCreating] = useState(false);

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
        <div className="rail-tools">
          <button
            type="button"
            id="rail-search-button"
            className={`rail-icon${searchOpen ? ' is-on' : ''}`}
            title="搜索 ⌘K"
            aria-label="搜索"
            aria-haspopup="dialog"
            aria-expanded={searchOpen}
            onClick={() => setSearchOpen(!searchOpen)}
          >
            <Search size={15} aria-hidden />
          </button>
          <button
            type="button"
            className="rail-icon"
            title={collapsed ? '展开侧栏 ]' : '收起侧栏 ['}
            aria-label={collapsed ? '展开侧栏' : '收起侧栏'}
            aria-expanded={!collapsed}
            onClick={toggleRail}
          >
            {collapsed ? <PanelLeftOpen size={15} aria-hidden /> : <PanelLeftClose size={15} aria-hidden />}
          </button>
        </div>
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
      <ConversationList />
      <UserMenu />
      <SearchDialog />
    </aside>
  );
}

function UserMenu() {
  const user = useSession((state) => state.user);
  const logout = useSession((state) => state.logout);
  const theme = useTheme();
  const setHelpOpen = useWorkspace((state) => state.setHelpOpen);
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const settingsOpen = params.get('settings') !== null;
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent) => {
      if (ref.current && !ref.current.contains(event.target as Node)) setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      event.stopPropagation();
      setOpen(false);
    };
    window.addEventListener('pointerdown', onPointerDown);
    window.addEventListener('keydown', onKey, true);
    return () => {
      window.removeEventListener('pointerdown', onPointerDown);
      window.removeEventListener('keydown', onKey, true);
    };
  }, [open]);

  const openSettings = () => {
    setOpen(false);
    setParams((current) => {
      const next = new URLSearchParams(current);
      next.set('settings', 'account');
      return next;
    });
  };

  return (
    <div className="rail-foot" ref={ref}>
      <div className="rail-user">
        <button
          type="button"
          className={`rail-user-btn${open ? ' is-on' : ''}`}
          aria-haspopup="menu"
          aria-expanded={open}
          title="账号菜单"
          onClick={() => setOpen((current) => !current)}
        >
          <UserAvatar user={user} size={26} />
          <span className="name">{user?.displayName || user?.email}</span>
        </button>
        <button
          type="button"
          className={`rail-user-settings${settingsOpen ? ' is-on' : ''}`}
          aria-haspopup="dialog"
          aria-expanded={settingsOpen}
          title="设置 ⌘,"
          onClick={openSettings}
        >
          <Settings size={14} aria-hidden />
          <span>设置</span>
        </button>
        {open ? (
          <div className="pop user-menu" role="menu" aria-label="账号菜单">
            <button type="button" className="menu-item" role="menuitem" onClick={openSettings}>
              <Settings size={14} aria-hidden />
              设置
              <kbd>⌘,</kbd>
            </button>
            <button
              type="button"
              className="menu-item"
              role="menuitem"
              onClick={() => {
                setOpen(false);
                toggleTheme();
              }}
            >
              {theme === 'dark' ? <Sun size={14} aria-hidden /> : <Moon size={14} aria-hidden />}
              {theme === 'dark' ? '切换亮色' : '切换暗色'}
              <kbd>⇧D</kbd>
            </button>
            <button
              type="button"
              className="menu-item"
              role="menuitem"
              onClick={() => {
                setOpen(false);
                setHelpOpen(true);
              }}
            >
              <CircleHelp size={14} aria-hidden />
              快捷键
              <kbd>?</kbd>
            </button>
            <div className="sep" />
            <button
              type="button"
              className="menu-item is-danger"
              role="menuitem"
              onClick={() => {
                setOpen(false);
                void logout().then(() => navigate('/'));
              }}
            >
              <LogOut size={14} aria-hidden />
              退出登录
            </button>
          </div>
        ) : null}
      </div>
    </div>
  );
}
