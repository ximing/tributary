import { useEffect, useRef, useState } from 'react';
import { observer, useService } from '@rabjs/react';
import { useNavigate, useSearchParams } from 'react-router';
import { CircleHelp, LogOut, Moon, Settings, Sun } from 'lucide-react';
import { SessionService } from '../../services/session.service.js';
import { ThemeService } from '../../services/theme.service.js';
import { MapService } from '../../workspace/map.service.js';
import { UserAvatar } from '../UserAvatar.js';

/** 侧栏底部账号菜单：设置、主题、快捷键、退出。 */
export const AccountMenu = observer(function AccountMenu() {
  const session = useService(SessionService);
  const theme = useService(ThemeService);
  const map = useService(MapService);
  const user = session.user;
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
                theme.toggle();
              }}
            >
              {theme.theme === 'dark' ? <Sun size={14} aria-hidden /> : <Moon size={14} aria-hidden />}
              {theme.theme === 'dark' ? '切换亮色' : '切换暗色'}
              <kbd>⇧D</kbd>
            </button>
            <button
              type="button"
              className="menu-item"
              role="menuitem"
              onClick={() => {
                setOpen(false);
                map.setHelpOpen(true);
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
                void session.logout().then(() => navigate('/'));
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
});
