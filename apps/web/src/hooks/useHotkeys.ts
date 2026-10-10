import { useEffect } from 'react';
import { shortcutForKey } from '@tributary/domain';
import { canvasFit, canvasZoomIn, canvasZoomOut } from '../lib/canvasBus.js';
import { setRailCollapsed, toggleRail } from '../lib/rail.js';
import { toggleTheme } from '../lib/theme.js';
import { useWorkspace } from '../store/workspace.js';

export interface HotkeyActions {
  openSettings: () => void;
}

/**
 * 全局快捷键。输入控件聚焦时全部放行（仅 Esc 失焦）；
 * draft 输入框自带 Enter/Esc 处理并 stopPropagation，不会走到这里。
 */
export function useHotkeys(actions: HotkeyActions): void {
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const state = useWorkspace.getState();
      if (new URLSearchParams(window.location.search).has('settings')) return;
      if (state.confirm) return; // 确认框打开时按键由 ConfirmDialog 自己处理
      const target = event.target;
      if (target instanceof HTMLElement) {
        const tag = target.tagName;
        if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || target.isContentEditable) {
          if (event.key === 'Escape') target.blur();
          return;
        }
      }
      if (state.helpOpen) {
        if (event.key === 'Escape' || event.key === '?') state.setHelpOpen(false);
        return;
      }

      const mod = event.metaKey || event.ctrlKey;
      if (mod && event.key === 'k') {
        event.preventDefault();
        setRailCollapsed(false);
        document.getElementById('rail-search-input')?.focus();
        return;
      }
      if (mod && event.key === ',') {
        event.preventDefault();
        actions.openSettings();
        return;
      }
      if (mod && (event.key === '=' || event.key === '+')) {
        event.preventDefault();
        canvasZoomIn();
        return;
      }
      if (mod && event.key === '-') {
        event.preventDefault();
        canvasZoomOut();
        return;
      }
      if (event.shiftKey && (event.key === 'F' || event.key === 'f')) {
        event.preventDefault();
        canvasFit();
        return;
      }
      if (event.key === '[' || event.key === ']') {
        event.preventDefault();
        toggleRail();
        return;
      }
      if (event.key === 'D' && event.shiftKey) {
        event.preventDefault();
        toggleTheme();
        return;
      }
      if ((event.key === 'Delete' || event.key === 'Backspace') && state.selectedId) {
        event.preventDefault();
        void state.removeNode(state.selectedId);
        return;
      }
      const shortcut = shortcutForKey(event.key);
      if (!shortcut) return;
      event.preventDefault();
      switch (shortcut.id) {
        case 'child':
          state.openDraft(state.selectedId ? 'child' : 'root');
          break;
        case 'sibling':
          state.openDraft(state.selectedId ? 'sibling' : 'root');
          break;
        case 'toggle':
          if (state.selectedId) state.toggleReply(state.selectedId);
          break;
        case 'up':
        case 'down':
        case 'left':
        case 'right':
          state.navigateSelection(shortcut.id);
          break;
        case 'deselect':
          state.select(null);
          break;
        case 'help':
          state.setHelpOpen(true);
          break;
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [actions]);
}
