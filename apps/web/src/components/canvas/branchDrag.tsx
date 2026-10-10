import type { PointerEvent as ReactPointerEvent } from 'react';
import { observer, useService } from '@rabjs/react';
import { resolveDrop, type DropTarget } from '@tributary/domain';
import { CanvasPrefsService } from '../../services/canvas-prefs.service.js';
import type { DragState } from '../../workspace/map-model.js';
import { MapService } from '../../workspace/map.service.js';

let suppressClick = false;

export function consumeDragClick(): boolean {
  const used = suppressClick;
  suppressClick = false;
  return used;
}

function hoverAt(clientX: number, clientY: number, layout: 'lr' | 'tb'): { id: string; ratio: number } | 'pane' | null {
  const element = document.elementFromPoint(clientX, clientY);
  if (!element) return null;
  const nodeEl = element.closest('.react-flow__node');
  if (nodeEl instanceof HTMLElement) {
    const id = nodeEl.getAttribute('data-id');
    if (!id || id.startsWith('draft-')) return null;
    const rect = nodeEl.getBoundingClientRect();
    const ratio =
      layout === 'tb' ? (clientX - rect.left) / Math.max(rect.width, 1) : (clientY - rect.top) / Math.max(rect.height, 1);
    return { id, ratio };
  }
  if (element.closest('.react-flow__pane, .react-flow__background')) return 'pane';
  return null;
}

function short(text: string): string {
  const trimmed = text.trim();
  return trimmed.length > 14 ? `${trimmed.slice(0, 14)}…` : trimmed;
}

export function dropLabel(drop: DropTarget | null, questionOf: (id: string) => string): string {
  if (!drop) return '松开取消';
  if (drop.place === 'root') return '成为根问题';
  const name = short(questionOf(drop.overId ?? ''));
  if (drop.place === 'child') return `放到「${name}」下`;
  if (drop.place === 'before') return `排在「${name}」前`;
  return `排在「${name}」后`;
}

/** 按下后移动超过阈值才拖。松手时按落点换父节点或调整兄弟顺序。 */
export function useBranchDrag(id: string, enabled: boolean) {
  const map = useService(MapService);
  const prefs = useService(CanvasPrefsService);
  return (event: ReactPointerEvent<HTMLElement>) => {
    if (!enabled || event.button !== 0) return;
    if (!(event.target instanceof Element)) return;
    if (event.target.closest('button, a, textarea, input, .node-reply, .node-excerpt, .node-note, .node-bar')) return;
    const startX = event.clientX;
    const startY = event.clientY;
    let active = false;

    const move = (ev: PointerEvent) => {
      if (!active && Math.hypot(ev.clientX - startX, ev.clientY - startY) < 5) return;
      if (!active) window.getSelection()?.removeAllRanges();
      active = true;
      const list = map.nodeOrder.map((nodeId) => map.nodes[nodeId]).filter((node) => Boolean(node));
      const drop = resolveDrop(list, id, hoverAt(ev.clientX, ev.clientY, prefs.settings.layout));
      map.setDrag({ id, x: ev.clientX, y: ev.clientY, drop });
    };

    const up = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      const drag = map.drag;
      map.setDrag(null);
      if (!active) return;
      suppressClick = true;
      if (drag?.id === id && drag.drop) void map.moveNodeTo(id, drag.drop.parentId, drag.drop.index);
    };

    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  };
}

export const DragGhost = observer(function DragGhost() {
  const map = useService(MapService);
  const drag = map.drag;
  const question = drag ? (map.nodes[drag.id]?.question ?? '') : '';
  const label = drag ? dropLabel(drag.drop, (nodeId) => map.nodes[nodeId]?.question ?? '') : '';
  if (!drag) return null;
  return <DragChip drag={drag} question={question} label={label} />;
});

function DragChip({ drag, question, label }: { drag: DragState; question: string; label: string }) {
  return (
    <div className="drag-ghost" style={{ left: drag.x + 12, top: drag.y + 16 }}>
      <strong>{short(question) || '节点'}</strong>
      <span>{label}</span>
    </div>
  );
}
