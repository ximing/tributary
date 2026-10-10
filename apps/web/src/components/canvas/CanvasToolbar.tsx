import { useEffect, useRef, useState } from 'react';
import { CircleHelp, FileDown, Settings2 } from 'lucide-react';
import { EDGE_STYLE_OPTIONS, setCanvasSettings, useCanvasSettings, type EdgeStyle } from '../../lib/canvasSettings.js';
import { conversationToMarkdown, downloadMarkdown } from '../../lib/exportMarkdown.js';
import { useWorkspace } from '../../store/workspace.js';

/** 连线样式的小图示 */
function EdgeGlyph({ style }: { style: EdgeStyle }) {
  const d =
    style === 'bezier'
      ? 'M2 14 C 10 14, 10 4, 20 4'
      : style === 'smoothstep'
        ? 'M2 14 H9 Q11 14 11 12 V6 Q11 4 13 4 H20'
        : 'M2 14 H11 V4 H20';
  return (
    <svg width="22" height="16" viewBox="0 0 22 16" fill="none" aria-hidden>
      <path d={d} stroke="currentColor" strokeWidth="1.5" />
    </svg>
  );
}

/** 画布右上角工具条：提示 + 导出 Markdown + 画布设置 */
export function CanvasToolbar() {
  const settings = useCanvasSettings();
  const setHelpOpen = useWorkspace((state) => state.setHelpOpen);
  const hasNodes = useWorkspace((state) => state.nodeOrder.length > 0);
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(event.target as Node)) setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    window.addEventListener('pointerdown', onPointerDown);
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('pointerdown', onPointerDown);
      window.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const exportMarkdown = () => {
    const state = useWorkspace.getState();
    if (!state.activeId || state.nodeOrder.length === 0) return;
    const title = state.conversations.find((item) => item.id === state.activeId)?.title ?? '支流对话';
    downloadMarkdown(title, conversationToMarkdown(title, state.nodes, state.nodeOrder));
  };

  return (
    <div className="canvas-toolbar" ref={wrapRef}>
      <button type="button" className="canvas-hint" onClick={() => setHelpOpen(true)} title="快捷键帮助">
        <CircleHelp size={12} aria-hidden />
        <kbd>?</kbd> 快捷键 · 双击空白处提问
      </button>
      <button
        type="button"
        className="tool-btn"
        title="导出 Markdown"
        aria-label="导出 Markdown"
        disabled={!hasNodes}
        onClick={exportMarkdown}
      >
        <FileDown size={14} aria-hidden />
      </button>
      <button
        type="button"
        className={`tool-btn${open ? ' is-active' : ''}`}
        title="画布设置"
        aria-label="画布设置"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
      >
        <Settings2 size={14} aria-hidden />
      </button>
      {open ? (
        <div className="settings-pop" role="dialog" aria-label="画布设置">
          <p className="settings-label">连线样式</p>
          <div className="settings-options">
            {EDGE_STYLE_OPTIONS.map((option) => (
              <button
                key={option.value}
                type="button"
                className={`settings-option${settings.edgeStyle === option.value ? ' is-active' : ''}`}
                onClick={() => setCanvasSettings({ edgeStyle: option.value })}
              >
                <EdgeGlyph style={option.value} />
                <span className="t">{option.label}</span>
                <span className="h">{option.hint}</span>
              </button>
            ))}
          </div>
          <p className="settings-label">分支</p>
          <button
            type="button"
            className="settings-toggle"
            role="switch"
            aria-checked={settings.branchColors}
            onClick={() => setCanvasSettings({ branchColors: !settings.branchColors })}
          >
            <span>
              分支着色
              <span className="h">每个一级分支一种颜色</span>
            </span>
            <span className={`switch${settings.branchColors ? ' is-on' : ''}`} />
          </button>
        </div>
      ) : null}
    </div>
  );
}
