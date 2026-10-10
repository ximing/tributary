import { useEffect } from 'react';
import { useService } from '@rabjs/react';
import { parseOutline, shortcutForKey } from '@tributary/domain';
import { canvasFit, canvasZoomIn, canvasZoomOut } from '../lib/canvasBus.js';
import { RailService } from '../services/rail.service.js';
import { ThemeService } from '../services/theme.service.js';
import { MapService } from '../workspace/map.service.js';
import { SearchService } from '../workspace/search.service.js';

export interface HotkeyActions {
  openSettings: () => void;
}

/**
 * 全局快捷键。输入控件聚焦时其余按键放行（Esc 失焦）；⌘K 始终打开搜索。
 * 节点单键对齐常见脑图：Tab 子问题，Enter 同级，Space / F2 编辑。
 * draft 输入框自带 Enter/Esc 处理并 stopPropagation，不会走到这里。
 */
export function useHotkeys(actions: HotkeyActions): void {
  const map = useService(MapService);
  const search = useService(SearchService);
  const rail = useService(RailService);
  const theme = useService(ThemeService);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (new URLSearchParams(window.location.search).has('settings')) return;
      if (map.confirm) return;
      if (map.presentId) return;

      const mod = event.metaKey || event.ctrlKey;
      if (mod && !event.altKey && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        search.setOpen(!search.searchOpen);
        return;
      }
      if (search.searchOpen) {
        if (event.key === 'Escape') {
          event.preventDefault();
          search.setOpen(false);
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
      if (map.helpOpen) {
        if (event.key === 'Escape' || event.key === '?') map.setHelpOpen(false);
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
        rail.toggle();
        return;
      }
      if (event.key === 'D' && event.shiftKey && !mod) {
        event.preventDefault();
        theme.toggle();
        return;
      }
      // Shift+Tab 在大纲软件里是升级。这里 Tab 已经是「子问题」，不再挪层级。
      if (event.key === 'Tab' && event.shiftKey) {
        event.preventDefault();
        return;
      }
      if (mod && (event.key === 'f' || event.key === 'F')) {
        event.preventDefault();
        map.openFind();
        return;
      }
      if (mod && (event.key === 'g' || event.key === 'G')) {
        event.preventDefault();
        if (map.findOpen || map.findQuery) map.stepFind(event.shiftKey ? -1 : 1);
        else map.openFind();
        return;
      }
      if (mod && (event.key === 'c' || event.key === 'C') && map.selectedId) {
        const selectedText = window.getSelection()?.toString().trim();
        if (!selectedText) {
          event.preventDefault();
          const node = map.nodes[map.selectedId];
          if (node) void map.copyPlainText(event.shiftKey ? (node.reply ?? '') : node.question);
        }
        return;
      }
      // ⌥↑↓ 是 XMind / GitMind 的同级排序。⌘↑↓ 保留，避免旧习惯直接失效。
      if (!event.shiftKey && (event.key === 'ArrowUp' || event.key === 'ArrowDown') && (event.altKey || mod)) {
        event.preventDefault();
        if (map.selectedId) void map.reorderSelected(event.key === 'ArrowUp' ? -1 : 1);
        return;
      }
      // 深度用左右，不占用 Tab。⌥→ 收到上一同级下，⌥← 升一级。
      if (!mod && event.altKey && (event.key === 'ArrowLeft' || event.key === 'ArrowRight')) {
        event.preventDefault();
        if (map.selectedId) void map.relevelSelected(event.key === 'ArrowRight' ? 'indent' : 'outdent');
        return;
      }
      if (mod && (event.key === 'z' || event.key === 'Z')) {
        event.preventDefault();
        if (event.shiftKey) void map.redo();
        else void map.undo();
        return;
      }
      if (mod && (event.key === 'd' || event.key === 'D') && !event.shiftKey) {
        event.preventDefault();
        if (map.selectedId) void map.copyBranch(map.selectedId);
        return;
      }
      if (mod && event.key === '\\') {
        event.preventDefault();
        map.toggleFocus();
        return;
      }
      if (event.key === 'Escape' && map.linkFrom) {
        event.preventDefault();
        map.cancelLink();
        return;
      }
      if (event.key === 'Escape' && map.findOpen) {
        event.preventDefault();
        map.closeFind();
        return;
      }
      if ((event.key === 'Delete' || event.key === 'Backspace') && map.selectedId) {
        event.preventDefault();
        map.removeNode(map.selectedId);
        return;
      }
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      const shortcut = shortcutForKey(event.key);
      if (!shortcut) return;
      event.preventDefault();
      switch (shortcut.id) {
        case 'child': {
          const picked = replySelection();
          if (picked) {
            map.openDraft('child', picked.id, picked.text);
            window.getSelection()?.removeAllRanges();
            break;
          }
          map.openDraft(map.selectedId ? 'child' : 'root');
          break;
        }
        case 'sibling':
          map.openDraft(map.selectedId ? 'sibling' : 'root');
          break;
        case 'edit':
          if (!map.selectedId) break;
          // Space 编辑；⇧Space 留给「展开/收起回复」，这是对话节点特有的动作。
          if (event.shiftKey && event.key === ' ') map.toggleReply(map.selectedId);
          else map.setEditing(map.selectedId);
          break;
        case 'collapse':
          if (map.selectedId) void map.toggleCollapse(map.selectedId);
          break;
        case 'up':
        case 'down':
        case 'left':
        case 'right':
          map.navigateSelection(shortcut.id);
          break;
        case 'deselect':
          map.select(null);
          break;
        case 'help':
          map.setHelpOpen(true);
          break;
      }
    };
    const onPaste = (event: ClipboardEvent) => {
      if (new URLSearchParams(window.location.search).has('settings')) return;
      if (map.confirm || map.helpOpen) return;
      const target = event.target;
      if (target instanceof HTMLElement) {
        const tag = target.tagName;
        if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || target.isContentEditable) return;
      }
      const text = event.clipboardData?.getData('text/plain') ?? '';
      const items = parseOutline(text);
      if (items.length === 0) return;
      event.preventDefault();
      void map.pasteOutline(items);
    };
    window.addEventListener('keydown', onKey);
    window.addEventListener('paste', onPaste);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('paste', onPaste);
    };
  }, [actions, map, search, rail, theme]);
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
