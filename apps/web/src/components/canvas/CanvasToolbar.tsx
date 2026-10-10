import { useEffect, useRef, useState } from 'react';
import { CircleHelp, FileDown, ImageDown, Settings2 } from 'lucide-react';
import { canvasExportPng } from '../../lib/canvasBus.js';
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

function BranchExport({ onExport }: { onExport: (rootId: string) => void }) {
  const rootId = useWorkspace((state) => state.focusId ?? state.selectedId);
  return (
    <button
      type="button"
      className="menu-item"
      role="menuitem"
      disabled={!rootId}
      onClick={() => {
        if (rootId) onExport(rootId);
      }}
    >
      导出这一枝
    </button>
  );
}

/** 画布右上角工具条：提示 + 导出 Markdown + 画布设置 */
export function CanvasToolbar() {
  const settings = useCanvasSettings();
  const setHelpOpen = useWorkspace((state) => state.setHelpOpen);
  const hasNodes = useWorkspace((state) => state.nodeOrder.length > 0);
  const [panel, setPanel] = useState<'settings' | 'export' | null>(null);
  const [exporting, setExporting] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!panel) return;
    const onPointerDown = (event: PointerEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(event.target as Node)) setPanel(null);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setPanel(null);
    };
    window.addEventListener('pointerdown', onPointerDown);
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('pointerdown', onPointerDown);
      window.removeEventListener('keydown', onKey);
    };
  }, [panel]);

  const exportMarkdown = (rootId?: string | null) => {
    const state = useWorkspace.getState();
    if (!state.activeId || state.nodeOrder.length === 0) return;
    const branch = rootId ? state.nodes[rootId] : undefined;
    const title = branch
      ? branch.question.trim().slice(0, 40) || '这一枝'
      : (state.conversations.find((item) => item.id === state.activeId)?.title ?? '支流对话');
    downloadMarkdown(title, conversationToMarkdown(title, state.nodes, state.nodeOrder, rootId));
    setPanel(null);
  };

  const exportPng = () => {
    if (exporting || !hasNodes) return;
    setExporting(true);
    void canvasExportPng().finally(() => setExporting(false));
  };

  return (
    <div className="canvas-toolbar" ref={wrapRef}>
      <button type="button" className="canvas-hint" onClick={() => setHelpOpen(true)} title="快捷键帮助">
        <CircleHelp size={12} aria-hidden />
        <kbd>?</kbd> 快捷键 · 双击空白处提问
      </button>
      <button
        type="button"
        className={`tool-btn${panel === 'export' ? ' is-active' : ''}`}
        title="导出 Markdown"
        aria-label="导出 Markdown"
        aria-expanded={panel === 'export'}
        disabled={!hasNodes}
        onClick={() => setPanel((value) => (value === 'export' ? null : 'export'))}
      >
        <FileDown size={14} aria-hidden />
      </button>
      <button
        type="button"
        className="tool-btn"
        title="导出图片"
        aria-label="导出图片"
        disabled={!hasNodes || exporting}
        onClick={exportPng}
      >
        <ImageDown size={14} aria-hidden />
      </button>
      <button
        type="button"
        className={`tool-btn${panel === 'settings' ? ' is-active' : ''}`}
        title="画布设置"
        aria-label="画布设置"
        aria-expanded={panel === 'settings'}
        onClick={() => setPanel((value) => (value === 'settings' ? null : 'settings'))}
      >
        <Settings2 size={14} aria-hidden />
      </button>
      {panel === 'export' ? (
        <div className="settings-pop export-pop" role="menu" aria-label="导出 Markdown">
          <button type="button" className="menu-item" role="menuitem" onClick={() => exportMarkdown(null)}>
            导出整棵对话
          </button>
          <BranchExport onExport={exportMarkdown} />
        </div>
      ) : null}
      {panel === 'settings' ? (
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
