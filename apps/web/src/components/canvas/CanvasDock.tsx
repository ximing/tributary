import { useEffect, useRef, useState } from 'react';
import { Panel, useReactFlow, useViewport } from '@xyflow/react';
import { Check, ChevronDown, GitBranch, Map as MapIcon, Maximize, Minus, Plus } from 'lucide-react';
import { LAYOUT_OPTIONS, setCanvasSettings, useCanvasSettings } from '../../lib/canvasSettings.js';
import { registerCanvasHandlers } from '../../lib/canvasBus.js';

/**
 * 画布底部停靠工具条（Dock）：缩放 / 适应视图 / 布局方向 / 小地图。
 * 挂载时向 canvasBus 注册视口操作，供全局快捷键调用。
 */
export function CanvasDock() {
  const settings = useCanvasSettings();
  const { zoom } = useViewport();
  const reactFlow = useReactFlow();
  const [layoutOpen, setLayoutOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  const fit = () => void reactFlow.fitView({ padding: 0.25, duration: 200 });
  const zoomIn = () => void reactFlow.zoomIn({ duration: 150 });
  const zoomOut = () => void reactFlow.zoomOut({ duration: 150 });

  useEffect(() => {
    registerCanvasHandlers({ fit, zoomIn, zoomOut });
    return () => registerCanvasHandlers(null);
    // reactFlow 实例稳定，注册一次即可
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reactFlow]);

  useEffect(() => {
    if (!layoutOpen) return;
    const onPointerDown = (event: PointerEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(event.target as Node)) setLayoutOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setLayoutOpen(false);
    };
    window.addEventListener('pointerdown', onPointerDown);
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('pointerdown', onPointerDown);
      window.removeEventListener('keydown', onKey);
    };
  }, [layoutOpen]);

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
          className={layoutOpen ? 'is-active' : undefined}
          title="布局方向"
          aria-expanded={layoutOpen}
          onClick={() => setLayoutOpen((value) => !value)}
        >
          <GitBranch size={14} aria-hidden />
          <span>{activeLayout.label}</span>
          <ChevronDown size={10} aria-hidden />
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
        {layoutOpen ? (
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
                  setLayoutOpen(false);
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
      </div>
    </Panel>
  );
}
