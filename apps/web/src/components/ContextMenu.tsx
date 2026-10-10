import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import {
  indentTarget,
  outdentTarget,
  parseOutline,
  PROVIDER_LABELS,
  siblingIndex,
  STICKERS,
} from '@tributary/domain';
import {
  ArrowDown,
  ArrowUp,
  Check,
  ChevronsDownUp,
  CircleHelp,
  ClipboardCopy,
  ClipboardPaste,
  Copy,
  CornerDownRight,
  FileDown,
  Focus,
  GitBranch,
  ImageDown,
  ListIndentDecrease,
  ListIndentIncrease,
  MessageSquarePlus,
  Pencil,
  Play,
  Plus,
  Redo2,
  RefreshCw,
  Search,
  Square,
  StickyNote,
  Trash2,
  Undo2,
  UnfoldVertical,
  Waypoints,
} from 'lucide-react';
import { canvasExportPng } from '../lib/canvasBus.js';
import { LAYOUT_OPTIONS, setCanvasSettings, useCanvasSettings } from '../lib/canvasSettings.js';
import { conversationToMarkdown, downloadMarkdown } from '../lib/exportMarkdown.js';
import { modelValue, splitModelChoice, useWorkspace, type CanvasMenuState } from '../store/workspace.js';

/** 右键菜单：节点、画布空白、关系线。主入口仍是快捷键与节点上的按钮。 */
export function ContextMenu() {
  const menu = useWorkspace((state) => state.menu);
  useDismissMenu(menu !== null);
  if (!menu) return null;
  if (menu.target === 'pane') return <PaneMenu x={menu.x} y={menu.y} />;
  if (menu.target === 'edge' && menu.linkId) return <EdgeMenu x={menu.x} y={menu.y} linkId={menu.linkId} />;
  return <NodeMenu x={menu.x} y={menu.y} />;
}

function useDismissMenu(open: boolean): void {
  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent) => {
      if (event.button !== 0) return;
      const target = event.target;
      if (target instanceof Element && target.closest('.menu')) return;
      useWorkspace.getState().setMenu(null);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') useWorkspace.getState().setMenu(null);
    };
    window.addEventListener('pointerdown', onPointerDown);
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('pointerdown', onPointerDown);
      window.removeEventListener('keydown', onKey);
    };
  }, [open]);
}

function MenuFrame({ x, y, label, children }: { x: number; y: number; label: string; children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const [box, setBox] = useState<{ x: number; y: number } | null>(null);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const pad = 8;
    let left = x;
    let top = y;
    if (left + rect.width > window.innerWidth - pad) left = Math.max(pad, window.innerWidth - pad - rect.width);
    if (top + rect.height > window.innerHeight - pad) top = Math.max(pad, window.innerHeight - pad - rect.height);
    setBox({ x: left, y: top });
  }, [x, y]);

  return (
    <div
      ref={ref}
      className="menu"
      role="menu"
      aria-label={label}
      style={{ left: box?.x ?? x, top: box?.y ?? y, visibility: box ? 'visible' : 'hidden' }}
      onContextMenu={(event) => event.preventDefault()}
    >
      {children}
    </div>
  );
}

function closeMenu(): void {
  useWorkspace.getState().setMenu(null);
}

function shortQuestion(text: string | undefined): string {
  const name = text?.trim() || '节点';
  return name.length > 12 ? `${name.slice(0, 12)}…` : name;
}

function NodeMenu({ x, y }: Pick<CanvasMenuState, 'x' | 'y'>) {
  const selectedId = useWorkspace((state) => state.selectedId);
  const focusId = useWorkspace((state) => state.focusId);
  const openDraft = useWorkspace((state) => state.openDraft);
  const toggleCollapse = useWorkspace((state) => state.toggleCollapse);
  const regenerateNode = useWorkspace((state) => state.regenerateNode);
  const removeNode = useWorkspace((state) => state.removeNode);
  const setEditing = useWorkspace((state) => state.setEditing);
  const toggleFocus = useWorkspace((state) => state.toggleFocus);
  const copyBranch = useWorkspace((state) => state.copyBranch);
  const copyPlainText = useWorkspace((state) => state.copyPlainText);
  const answerWithAnotherModel = useWorkspace((state) => state.answerWithAnotherModel);
  const answerAgain = useWorkspace((state) => state.answerAgain);
  const setEditingNote = useWorkspace((state) => state.setEditingNote);
  const chooseSticker = useWorkspace((state) => state.chooseSticker);
  const startLink = useWorkspace((state) => state.startLink);
  const removeLink = useWorkspace((state) => state.removeLink);
  const openPresent = useWorkspace((state) => state.openPresent);
  const relevelSelected = useWorkspace((state) => state.relevelSelected);
  const reorderSelected = useWorkspace((state) => state.reorderSelected);
  const toggleReply = useWorkspace((state) => state.toggleReply);
  const stopNode = useWorkspace((state) => state.stopNode);
  const node = useWorkspace((state) => (selectedId ? state.nodes[selectedId] : undefined));
  const configs = useWorkspace((state) => state.configs);
  const links = useWorkspace((state) => state.links);
  const nodes = useWorkspace((state) => state.nodes);
  const nodeOrder = useWorkspace((state) => state.nodeOrder);
  const modelChoice = useWorkspace((state) => state.modelChoice);
  const replyOpen = useWorkspace((state) => (selectedId ? Boolean(state.expandedReplies[selectedId]) : false));

  if (!selectedId || !node) return null;
  const linked = nodeOrder.flatMap((id) => {
    const item = nodes[id];
    return item ? [{ id: item.id, parentId: item.parentId }] : [];
  });
  const canIndent = indentTarget(linked, selectedId) !== null;
  const canOutdent = outdentTarget(linked, selectedId) !== null;
  const index = siblingIndex(linked, selectedId);
  const siblingCount = linked.filter((item) => item.parentId === node.parentId).length;
  const childCount = linked.filter((item) => item.parentId === selectedId).length;
  const canMoveUp = index > 0;
  const canMoveDown = index >= 0 && index < siblingCount - 1;
  const showStructure = canIndent || canOutdent || canMoveUp || canMoveDown;
  const currentModel = node.providerId && node.model ? modelValue(node.providerId, node.model) : '';
  const otherModels = configs.filter((config) => modelValue(config.id, config.model) !== currentModel);
  const choice = splitModelChoice(modelChoice);
  const canAnswerAgain = Boolean((node.providerId && node.model) || (choice.providerId && choice.model));
  const againLabel = node.model ? `再用 ${node.model} 答一版` : '用当前模型再答一版';
  const nodeLinks = links.filter((link) => link.sourceId === selectedId || link.targetId === selectedId);
  const exportBranch = () => {
    const state = useWorkspace.getState();
    const title = node.question.trim().slice(0, 40) || '这一枝';
    downloadMarkdown(title, conversationToMarkdown(title, state.nodes, state.nodeOrder, selectedId));
    state.setMenu(null);
  };

  return (
    <MenuFrame x={x} y={y} label="节点操作">
      <button type="button" className="menu-item" role="menuitem" onClick={() => setEditing(selectedId)}>
        <Pencil size={14} aria-hidden />
        编辑问题
      </button>
      <button type="button" className="menu-item" role="menuitem" onClick={() => openDraft('child')}>
        <CornerDownRight size={14} aria-hidden />
        添加子问题 <kbd>⌘Enter</kbd>
      </button>
      <button type="button" className="menu-item" role="menuitem" onClick={() => openDraft('sibling')}>
        <Plus size={14} aria-hidden />
        添加同级问题 <kbd>Enter</kbd>
      </button>
      {showStructure ? (
        <>
          <div className="sep" />
          <button
            type="button"
            className="menu-item"
            role="menuitem"
            disabled={!canIndent}
            title={canIndent ? '收到上一个同级下面' : '没有上一个同级，没法再缩进'}
            onClick={() => void relevelSelected('indent')}
          >
            <ListIndentIncrease size={14} aria-hidden />
            收到上一同级下 <kbd>Tab</kbd>
          </button>
          <button
            type="button"
            className="menu-item"
            role="menuitem"
            disabled={!canOutdent}
            title={canOutdent ? '升成父节点的下一个兄弟' : '已经是最上层'}
            onClick={() => void relevelSelected('outdent')}
          >
            <ListIndentDecrease size={14} aria-hidden />
            升一级 <kbd>⇧Tab</kbd>
          </button>
          <button
            type="button"
            className="menu-item"
            role="menuitem"
            disabled={!canMoveUp}
            title={canMoveUp ? '在同级里上移' : '已经是第一个'}
            onClick={() => void reorderSelected(-1)}
          >
            <ArrowUp size={14} aria-hidden />
            上移 <kbd>⌘↑</kbd>
          </button>
          <button
            type="button"
            className="menu-item"
            role="menuitem"
            disabled={!canMoveDown}
            title={canMoveDown ? '在同级里下移' : '已经是最后一个'}
            onClick={() => void reorderSelected(1)}
          >
            <ArrowDown size={14} aria-hidden />
            下移 <kbd>⌘↓</kbd>
          </button>
        </>
      ) : null}
      <div className="sep" />
      <button
        type="button"
        className="menu-item"
        role="menuitem"
        disabled={childCount === 0}
        title={childCount === 0 ? '没有子节点' : undefined}
        onClick={() => void toggleCollapse(selectedId)}
      >
        <ChevronsDownUp size={14} aria-hidden />
        {node.collapsed ? '展开子树' : '折叠子树'} <kbd>.</kbd>
      </button>
      {node.status === 'done' && node.reply ? (
        <button
          type="button"
          className="menu-item"
          role="menuitem"
          onClick={() => {
            toggleReply(selectedId);
            closeMenu();
          }}
        >
          <UnfoldVertical size={14} aria-hidden />
          {replyOpen ? '收起回答' : '展开回答'} <kbd>Space</kbd>
        </button>
      ) : null}
      <button type="button" className="menu-item" role="menuitem" onClick={() => toggleFocus()}>
        <Focus size={14} aria-hidden />
        {focusId ? '返回全图' : '只看这一枝'} <kbd>⌘\</kbd>
      </button>
      <button type="button" className="menu-item" role="menuitem" onClick={() => void copyBranch(selectedId)}>
        <Copy size={14} aria-hidden />
        复制此枝 <kbd>⌘D</kbd>
      </button>
      <button type="button" className="menu-item" role="menuitem" onClick={() => void copyPlainText(node.question)}>
        <ClipboardCopy size={14} aria-hidden />
        复制问题 <kbd>⌘C</kbd>
      </button>
      <button
        type="button"
        className="menu-item"
        role="menuitem"
        disabled={!node.reply}
        onClick={() => {
          if (node.reply) void copyPlainText(node.reply);
        }}
      >
        <ClipboardCopy size={14} aria-hidden />
        复制回答 <kbd>⌘⇧C</kbd>
      </button>
      <button type="button" className="menu-item" role="menuitem" onClick={() => setEditingNote(selectedId)}>
        <StickyNote size={14} aria-hidden />
        {node.note ? '编辑笔记' : '写笔记'}
      </button>
      <div className="sticker-row" role="group" aria-label="贴纸">
        {STICKERS.map((sticker) => (
          <button
            key={sticker.id}
            type="button"
            className={node.sticker === sticker.id ? 'is-on' : undefined}
            title={node.sticker === sticker.id ? `去掉${sticker.label}` : sticker.label}
            aria-label={sticker.label}
            aria-pressed={node.sticker === sticker.id}
            onClick={() => void chooseSticker(selectedId, sticker.id)}
          >
            {sticker.mark}
          </button>
        ))}
      </div>
      <button type="button" className="menu-item" role="menuitem" onClick={() => startLink(selectedId)}>
        <Waypoints size={14} aria-hidden />
        连一条关系线
      </button>
      <button type="button" className="menu-item" role="menuitem" onClick={() => openPresent(selectedId)}>
        <Play size={14} aria-hidden />
        从这里演示
      </button>
      <button type="button" className="menu-item" role="menuitem" onClick={exportBranch}>
        <FileDown size={14} aria-hidden />
        导出这一枝
      </button>
      {node.status === 'pending' ? (
        <button
          type="button"
          className="menu-item"
          role="menuitem"
          onClick={() => {
            closeMenu();
            void stopNode(selectedId);
          }}
        >
          <Square size={14} aria-hidden />
          停止生成
        </button>
      ) : null}
      <button type="button" className="menu-item" role="menuitem" onClick={() => void regenerateNode(selectedId)}>
        <RefreshCw size={14} aria-hidden />
        重新生成回答
      </button>
      {canAnswerAgain ? (
        <button type="button" className="menu-item" role="menuitem" onClick={() => void answerAgain(selectedId)}>
          <RefreshCw size={14} aria-hidden />
          {againLabel}
        </button>
      ) : null}
      {otherModels.length > 0 ? (
        <>
          <p className="menu-label">用另一个模型再答一版</p>
          {otherModels.map((config) => (
            <button
              key={config.id}
              type="button"
              className="menu-item"
              role="menuitem"
              onClick={() => void answerWithAnotherModel(selectedId, config.id, config.model)}
            >
              <RefreshCw size={14} aria-hidden />
              {PROVIDER_LABELS[config.provider]} / {config.model}
            </button>
          ))}
        </>
      ) : null}
      {nodeLinks.length > 0 ? (
        <>
          <p className="menu-label">关系线</p>
          {nodeLinks.map((link) => {
            const otherId = link.sourceId === selectedId ? link.targetId : link.sourceId;
            return (
              <button key={link.id} type="button" className="menu-item" role="menuitem" onClick={() => void removeLink(link.id)}>
                <Waypoints size={14} aria-hidden />
                断开和「{shortQuestion(nodes[otherId]?.question)}」
              </button>
            );
          })}
        </>
      ) : null}
      <div className="sep" />
      <button type="button" className="menu-item is-danger" role="menuitem" onClick={() => void removeNode(selectedId)}>
        <Trash2 size={14} aria-hidden />
        删除节点及子分支 <kbd>Del</kbd>
      </button>
    </MenuFrame>
  );
}

/** 空白画布。缩放、适应、按层折叠、小地图、大纲、演示留在底部工具条。 */
function PaneMenu({ x, y }: Pick<CanvasMenuState, 'x' | 'y'>) {
  const settings = useCanvasSettings();
  const openDraft = useWorkspace((state) => state.openDraft);
  const pasteOutline = useWorkspace((state) => state.pasteOutline);
  const setNotice = useWorkspace((state) => state.setNotice);
  const collapseScope = useWorkspace((state) => state.collapseScope);
  const openFind = useWorkspace((state) => state.openFind);
  const undo = useWorkspace((state) => state.undo);
  const redo = useWorkspace((state) => state.redo);
  const setHelpOpen = useWorkspace((state) => state.setHelpOpen);
  const hasNodes = useWorkspace((state) => state.nodeOrder.length > 0);
  const canUndo = useWorkspace((state) => state.undoStack.length > 0);
  const canRedo = useWorkspace((state) => state.redoStack.length > 0);
  const selectedId = useWorkspace((state) => state.selectedId);
  const focusId = useWorkspace((state) => state.focusId);
  const parentQuestion = useWorkspace((state) => {
    const parentId = state.selectedId ?? state.focusId;
    return parentId ? state.nodes[parentId]?.question : undefined;
  });

  const paste = async () => {
    closeMenu();
    try {
      const text = await navigator.clipboard.readText();
      const items = parseOutline(text);
      if (items.length === 0) {
        setNotice('剪贴板里不是大纲。一行一个问题，缩进表示层级');
        return;
      }
      await pasteOutline(items);
    } catch {
      setNotice('读不到剪贴板，可以在画布上直接粘贴');
    }
  };

  const exportAll = () => {
    const state = useWorkspace.getState();
    if (!state.activeId || state.nodeOrder.length === 0) return;
    const title = state.conversations.find((item) => item.id === state.activeId)?.title ?? '支流对话';
    downloadMarkdown(title, conversationToMarkdown(title, state.nodes, state.nodeOrder, null));
    closeMenu();
  };

  const exportPng = () => {
    closeMenu();
    void canvasExportPng();
  };

  const pasteHint = parentQuestion
    ? `放到「${shortQuestion(parentQuestion)}」下面`
    : selectedId || focusId
      ? '放到当前节点下面'
      : '作为新的根问题';

  return (
    <MenuFrame x={x} y={y} label="画布操作">
      <button type="button" className="menu-item" role="menuitem" onClick={() => openDraft('root')}>
        <MessageSquarePlus size={14} aria-hidden />
        新建根问题 <kbd>双击</kbd>
      </button>
      <button type="button" className="menu-item" role="menuitem" onClick={() => void paste()}>
        <ClipboardPaste size={14} aria-hidden />
        <span className="menu-main">
          粘贴大纲
          <span className="menu-hint">{pasteHint}</span>
        </span>
      </button>
      <p className="menu-label">整理</p>
      {(
        [
          ['全部展开', 'none', UnfoldVertical],
          ['全部折叠', 'all', ChevronsDownUp],
        ] as const
      ).map(([label, mode, Icon]) => (
        <button
          key={label}
          type="button"
          className="menu-item"
          role="menuitem"
          disabled={!hasNodes}
          onClick={() => {
            closeMenu();
            void collapseScope(mode);
          }}
        >
          <Icon size={14} aria-hidden />
          {label}
        </button>
      ))}
      {LAYOUT_OPTIONS.map((option) => (
        <button
          key={option.value}
          type="button"
          className="menu-item"
          role="menuitem"
          aria-checked={settings.layout === option.value}
          onClick={() => {
            setCanvasSettings({ layout: option.value });
            closeMenu();
          }}
        >
          <GitBranch size={14} aria-hidden style={option.value === 'tb' ? { transform: 'rotate(90deg)' } : undefined} />
          {option.label}
          {settings.layout === option.value ? <Check size={14} className="check" aria-hidden /> : null}
        </button>
      ))}
      <p className="menu-label">视图</p>
      <button
        type="button"
        className="menu-item"
        role="menuitem"
        disabled={!hasNodes}
        onClick={() => openFind()}
      >
        <Search size={14} aria-hidden />
        在这张图里查找 <kbd>⌘F</kbd>
      </button>
      <button
        type="button"
        className="menu-item"
        role="menuitem"
        disabled={!canUndo}
        onClick={() => {
          closeMenu();
          void undo();
        }}
      >
        <Undo2 size={14} aria-hidden />
        撤回 <kbd>⌘Z</kbd>
      </button>
      <button
        type="button"
        className="menu-item"
        role="menuitem"
        disabled={!canRedo}
        onClick={() => {
          closeMenu();
          void redo();
        }}
      >
        <Redo2 size={14} aria-hidden />
        重做 <kbd>⌘⇧Z</kbd>
      </button>
      <button type="button" className="menu-item" role="menuitem" disabled={!hasNodes} onClick={exportAll}>
        <FileDown size={14} aria-hidden />
        导出整棵对话
      </button>
      <button type="button" className="menu-item" role="menuitem" disabled={!hasNodes} onClick={exportPng}>
        <ImageDown size={14} aria-hidden />
        导出图片
      </button>
      <div className="sep" />
      <button
        type="button"
        className="menu-item"
        role="menuitem"
        onClick={() => {
          closeMenu();
          setHelpOpen(true);
        }}
      >
        <CircleHelp size={14} aria-hidden />
        快捷键帮助 <kbd>?</kbd>
      </button>
    </MenuFrame>
  );
}

function EdgeMenu({ x, y, linkId }: { x: number; y: number; linkId: string }) {
  const link = useWorkspace((state) => state.links.find((item) => item.id === linkId));
  const sourceQuestion = useWorkspace((state) => (link ? state.nodes[link.sourceId]?.question : undefined));
  const targetQuestion = useWorkspace((state) => (link ? state.nodes[link.targetId]?.question : undefined));
  const revealNode = useWorkspace((state) => state.revealNode);
  const removeLink = useWorkspace((state) => state.removeLink);

  if (!link) return null;
  return (
    <MenuFrame x={x} y={y} label="关系线">
      <button type="button" className="menu-item" role="menuitem" onClick={() => void revealNode(link.sourceId)}>
        <Focus size={14} aria-hidden />
        选中起点「{shortQuestion(sourceQuestion)}」
      </button>
      <button type="button" className="menu-item" role="menuitem" onClick={() => void revealNode(link.targetId)}>
        <Focus size={14} aria-hidden />
        选中终点「{shortQuestion(targetQuestion)}」
      </button>
      <div className="sep" />
      <button type="button" className="menu-item is-danger" role="menuitem" onClick={() => void removeLink(link.id)}>
        <Waypoints size={14} aria-hidden />
        断开这条关系线
      </button>
    </MenuFrame>
  );
}
