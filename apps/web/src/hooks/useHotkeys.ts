import { useEffect } from 'react';
import { parseOutline, shortcutForKey } from '@tributary/domain';
import { canvasFit, canvasZoomIn, canvasZoomOut } from '../lib/canvasBus.js';
import { toggleRail } from '../lib/rail.js';
import { toggleTheme } from '../lib/theme.js';
import { useWorkspace } from '../store/workspace.js';

export interface HotkeyActions {
  openSettings: () => void;
}

/**
 * 全局快捷键。输入控件聚焦时其余按键放行（Esc 失焦）；⌘K 始终打开搜索。
 * draft 输入框自带 Enter/Esc 处理并 stopPropagation，不会走到这里。
 */
export function useHotkeys(actions: HotkeyActions): void {
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const state = useWorkspace.getState();
      if (new URLSearchParams(window.location.search).has('settings')) return;
      if (state.confirm) return; // 确认框打开时按键由 ConfirmDialog 自己处理
      if (state.presentId) return;

      const mod = event.metaKey || event.ctrlKey;
      if (mod && !event.altKey && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        state.setSearchOpen(!state.searchOpen);
        return;
      }
      if (state.searchOpen) {
        if (event.key === 'Escape') {
          event.preventDefault();
          state.setSearchOpen(false);
        }
        return;
      }

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
      if (event.key === 'D' && event.shiftKey && !mod) {
        event.preventDefault();
        toggleTheme();
        return;
      }
      if (event.key === 'Tab') {
        event.preventDefault();
        const picked = replySelection();
        if (picked && !event.shiftKey) {
          state.openDraft('child', picked.id, picked.text);
          window.getSelection()?.removeAllRanges();
          return;
        }
        if (state.selectedId) void state.relevelSelected(event.shiftKey ? 'outdent' : 'indent');
        return;
      }
      if (mod && event.key === 'Enter') {
        event.preventDefault();
        state.openDraft(state.selectedId ? 'child' : 'root');
        return;
      }
      if (mod && (event.key === 'f' || event.key === 'F')) {
        event.preventDefault();
        state.openFind();
        return;
      }
      if (mod && (event.key === 'g' || event.key === 'G')) {
        event.preventDefault();
        if (state.findOpen || state.findQuery) state.stepFind(event.shiftKey ? -1 : 1);
        else state.openFind();
        return;
      }
      if (mod && (event.key === 'c' || event.key === 'C') && state.selectedId) {
        const selectedText = window.getSelection()?.toString().trim();
        if (!selectedText) {
          event.preventDefault();
          const node = state.nodes[state.selectedId];
          if (node) void state.copyPlainText(event.shiftKey ? (node.reply ?? '') : node.question);
        }
        return;
      }
      if (mod && (event.key === 'ArrowUp' || event.key === 'ArrowDown')) {
        event.preventDefault();
        if (state.selectedId) void state.reorderSelected(event.key === 'ArrowUp' ? -1 : 1);
        return;
      }
      if (mod && (event.key === 'z' || event.key === 'Z')) {
        event.preventDefault();
        if (event.shiftKey) void state.redo();
        else void state.undo();
        return;
      }
      if (mod && (event.key === 'd' || event.key === 'D') && !event.shiftKey) {
        event.preventDefault();
        if (state.selectedId) void state.copyBranch(state.selectedId);
        return;
      }
      if (mod && event.key === '\\') {
        event.preventDefault();
        state.toggleFocus();
        return;
      }
      if (event.key === 'Escape' && state.linkFrom) {
        event.preventDefault();
        state.cancelLink();
        return;
      }
      if (event.key === 'Escape' && state.findOpen) {
        event.preventDefault();
        state.closeFind();
        return;
      }
      if ((event.key === 'Delete' || event.key === 'Backspace') && state.selectedId) {
        event.preventDefault();
        void state.removeNode(state.selectedId);
        return;
      }
      // ⌘ . 不应再落到「折叠」。Shift 仍留给 ?
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      const shortcut = shortcutForKey(event.key);
      if (!shortcut) return;
      event.preventDefault();
      switch (shortcut.id) {
        case 'indent':
          if (state.selectedId) void state.relevelSelected('indent');
          break;
        case 'sibling':
          state.openDraft(state.selectedId ? 'sibling' : 'root');
          break;
        case 'toggle':
          if (state.selectedId) state.toggleReply(state.selectedId);
          break;
        case 'collapse':
          if (state.selectedId) void state.toggleCollapse(state.selectedId);
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
    const onPaste = (event: ClipboardEvent) => {
      const state = useWorkspace.getState();
      if (new URLSearchParams(window.location.search).has('settings')) return;
      if (state.confirm || state.helpOpen) return;
      const target = event.target;
      if (target instanceof HTMLElement) {
        const tag = target.tagName;
        if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || target.isContentEditable) return;
      }
      const text = event.clipboardData?.getData('text/plain') ?? '';
      const items = parseOutline(text);
      if (items.length === 0) return;
      event.preventDefault();
      void state.pasteOutline(items);
    };
    window.addEventListener('keydown', onKey);
    window.addEventListener('paste', onPaste);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('paste', onPaste);
    };
  }, [actions]);
}

/** 回答里划中的文字。用来「就此追问」，不拿去缩进。 */
function replySelection(): { id: string; text: string } | null {
  const selection = window.getSelection();
  const text = selection?.toString().replace(/\s+/g, ' ').trim() ?? '';
  if (!text || !selection || selection.rangeCount === 0) return null;
  const anchor = selection.anchorNode;
  const element = anchor instanceof Element ? anchor : anchor?.parentElement;
  const reply = element?.closest('.node-reply, .node-excerpt');
  if (!reply) return null;
  const host = reply.closest('.react-flow__node');
  const id = host?.getAttribute('data-id');
  if (!id || id.startsWith('draft-')) return null;
  return { id, text: text.slice(0, 2000) };
}
