import { useEffect, useRef, useState } from 'react';
import { Panel, useReactFlow, useViewport } from '@xyflow/react';
import { Check, ChevronDown, ChevronsDownUp, Focus, GitBranch, ListTree, Map as MapIcon, Maximize, Minus, Play, Plus } from 'lucide-react';
import { LAYOUT_OPTIONS, setCanvasSettings, useCanvasSettings } from '../../lib/canvasSettings.js';
import { registerCanvasHandlers } from '../../lib/canvasBus.js';
import { useWorkspace } from '../../store/workspace.js';
import { runMapExport } from './MapExport.js';

/**
 * 画布底部停靠工具条（Dock）：缩放 / 适应视图 / 布局方向 / 小地图。
 * 挂载时向 canvasBus 注册视口操作，供全局快捷键调用。
 */
export function CanvasDock() {
  const settings = useCanvasSettings();
  const { zoom } = useViewport();
  const reactFlow = useReactFlow();
  const [menu, setMenu] = useState<'layout' | 'fold' | null>(null);
  const focusId = useWorkspace((state) => state.focusId);
  const outlineOpen = useWorkspace((state) => state.outlineOpen);
  const selectedId = useWorkspace((state) => state.selectedId);
  const collapseScope = useWorkspace((state) => state.collapseScope);
  const toggleFocus = useWorkspace((state) => state.toggleFocus);
  const setOutlineOpen = useWorkspace((state) => state.setOutlineOpen);
  const openPresent = useWorkspace((state) => state.openPresent);
  const presenting = useWorkspace((state) => Boolean(state.presentId));
  const wrapRef = useRef<HTMLDivElement>(null);

  const fit = () => void reactFlow.fitView({ padding: 0.25, duration: 200 });
  const zoomIn = () => void reactFlow.zoomIn({ duration: 150 });
  const zoomOut = () => void reactFlow.zoomOut({ duration: 150 });

  useEffect(() => {
    registerCanvasHandlers({ fit, zoomIn, zoomOut, exportPng: runMapExport });
    return () => registerCanvasHandlers(null);
    // reactFlow 实例稳定，注册一次即可
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reactFlow]);

  useEffect(() => {
    if (!menu) return;
    const onPointerDown = (event: PointerEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(event.target as Node)) setMenu(null);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setMenu(null);
    };
    window.addEventListener('pointerdown', onPointerDown);
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('pointerdown', onPointerDown);
      window.removeEventListener('keydown', onKey);
    };
  }, [menu]);

  const activeLayout = LAYOUT_OPTIONS.find((option) => option.value === settings.layout) ?? LAYOUT_OPTIONS[0]!;

  return (
    <Panel position="bottom-center" className="dock-wrap">
      <div className="dock" ref={wrapRef}>
        <button type="button" title="缩小 ⌘-" aria-label="缩小" onClick={zoomOut}>
          <Minus size={14} aria-hidden />
        </button>
        <button
          type="button"
          className="zoom-label"
          title="复位到 100%"
          onClick={() => void reactFlow.zoomTo(1, { duration: 200 })}
        >
          {Math.round(zoom * 100)}%
        </button>
        <button type="button" title="放大 ⌘+" aria-label="放大" onClick={zoomIn}>
          <Plus size={14} aria-hidden />
        </button>
        <div className="div" />
        <button type="button" title="适应视图 ⇧F" onClick={fit}>
          <Maximize size={14} aria-hidden />
          <span>适应</span>
        </button>
        <div className="div" />
        <button
          type="button"
          className={menu === 'layout' ? 'is-active' : undefined}
          title="布局方向"
          aria-expanded={menu === 'layout'}
          onClick={() => setMenu((value) => (value === 'layout' ? null : 'layout'))}
        >
          <GitBranch size={14} aria-hidden />
          <span>{activeLayout.label}</span>
          <ChevronDown size={10} aria-hidden />
        </button>
        <button
          type="button"
          className={menu === 'fold' ? 'is-active' : undefined}
          title="折叠层级"
          aria-label="折叠层级"
          aria-expanded={menu === 'fold'}
          onClick={() => setMenu((value) => (value === 'fold' ? null : 'fold'))}
        >
          <ChevronsDownUp size={14} aria-hidden />
        </button>
        <button
          type="button"
          className={focusId ? 'is-active' : undefined}
          title={focusId ? '返回全图 ⌘\\' : '只看这一枝 ⌘\\'}
          aria-label={focusId ? '返回全图' : '只看这一枝'}
          aria-pressed={Boolean(focusId)}
          disabled={!selectedId && !focusId}
          onClick={() => toggleFocus()}
        >
          <Focus size={14} aria-hidden />
        </button>
        <button
          type="button"
          className={presenting ? 'is-active' : undefined}
          title="演示"
          aria-label="演示"
          onClick={() => openPresent(focusId ?? selectedId)}
        >
          <Play size={14} aria-hidden />
        </button>
        <button
          type="button"
          className={outlineOpen ? 'is-active' : undefined}
          title="大纲"
          aria-label="大纲"
          aria-pressed={outlineOpen}
          onClick={() => setOutlineOpen(!outlineOpen)}
        >
          <ListTree size={14} aria-hidden />
        </button>
        <button
          type="button"
          className={settings.minimap ? 'is-active' : undefined}
          title="小地图"
          aria-label="小地图"
          aria-pressed={settings.minimap}
          onClick={() => setCanvasSettings({ minimap: !settings.minimap })}
        >
          <MapIcon size={14} aria-hidden />
        </button>
        {menu === 'layout' ? (
          <div className="pop dock-pop" role="menu" aria-label="布局方向">
            <p className="pop-label">布局方向</p>
            {LAYOUT_OPTIONS.map((option) => (
              <button
                key={option.value}
                type="button"
                role="menuitem"
                className="menu-item"
                onClick={() => {
                  setCanvasSettings({ layout: option.value });
                  setMenu(null);
                  // 布局切换后重新取景
                  requestAnimationFrame(fit);
                }}
              >
                <GitBranch size={14} aria-hidden style={option.value === 'tb' ? { transform: 'rotate(90deg)' } : undefined} />
                <span className="menu-main">
                  {option.label}
                  <span className="menu-hint">{option.hint}</span>
                </span>
                {settings.layout === option.value ? <Check size={14} className="check" aria-hidden /> : null}
              </button>
            ))}
          </div>
        ) : null}
        {menu === 'fold' ? (
          <div className="pop dock-pop" role="menu" aria-label="折叠层级">
            <p className="pop-label">折叠</p>
            {(
              [
                ['全部展开', 'none'],
                ['只看前 2 层', 2],
                ['只看前 3 层', 3],
                ['全部折叠', 'all'],
              ] as const
            ).map(([label, mode]) => (
              <button
                key={label}
                type="button"
                role="menuitem"
                className="menu-item"
                onClick={() => {
                  setMenu(null);
                  void collapseScope(mode);
                }}
              >
                <span className="menu-main">{label}</span>
              </button>
            ))}
          </div>
        ) : null}
      </div>
    </Panel>
  );
}
