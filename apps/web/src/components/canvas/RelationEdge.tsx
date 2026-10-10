import { BaseEdge, useInternalNode, type EdgeProps, type InternalNode, type Node } from '@xyflow/react';
import { NODE_WIDTH } from '../../workspace/map-model.js';

interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

interface Anchor {
  x: number;
  y: number;
  nx: number;
  ny: number;
}

function boxOf(node: InternalNode<Node>): Box | null {
  const abs = node.internals.positionAbsolute;
  const w = node.measured?.width ?? node.width ?? NODE_WIDTH;
  const h = node.measured?.height ?? node.height;
  if (!abs || !w || !h) return null;
  return { x: abs.x, y: abs.y, w, h };
}

/** 从矩形朝向对方中心的那一条边出去。 */
function anchor(rect: Box, towardX: number, towardY: number): Anchor {
  const cx = rect.x + rect.w / 2;
  const cy = rect.y + rect.h / 2;
  const dx = towardX - cx;
  const dy = towardY - cy;
  if (Math.abs(dx) >= Math.abs(dy)) {
    const right = dx >= 0;
    return { x: right ? rect.x + rect.w : rect.x, y: cy, nx: right ? 1 : -1, ny: 0 };
  }
  const down = dy >= 0;
  return { x: cx, y: down ? rect.y + rect.h : rect.y, nx: 0, ny: down ? 1 : -1 };
}

/**
 * 关系线不走树的上下把手，改从两张卡片相对的边连出去。
 * 否则左右并排的兄弟会从底边绕到顶边，线看起来接不上。
 */
export function RelationEdge({
  source,
  target,
  sourceX,
  sourceY,
  targetX,
  targetY,
  markerEnd,
  style,
  interactionWidth,
}: EdgeProps) {
  const sourceNode = useInternalNode(source);
  const targetNode = useInternalNode(target);
  const sourceBox = sourceNode ? boxOf(sourceNode) : null;
  const targetBox = targetNode ? boxOf(targetNode) : null;
  let path: string;
  if (sourceBox && targetBox) {
    const sourceCenterX = sourceBox.x + sourceBox.w / 2;
    const sourceCenterY = sourceBox.y + sourceBox.h / 2;
    const targetCenterX = targetBox.x + targetBox.w / 2;
    const targetCenterY = targetBox.y + targetBox.h / 2;
    const from = anchor(sourceBox, targetCenterX, targetCenterY);
    const to = anchor(targetBox, sourceCenterX, sourceCenterY);
    const dist = Math.hypot(to.x - from.x, to.y - from.y);
    const pull = Math.max(36, Math.min(80, dist * 0.35));
    path = `M ${from.x} ${from.y} C ${from.x + from.nx * pull} ${from.y + from.ny * pull}, ${to.x + to.nx * pull} ${to.y + to.ny * pull}, ${to.x} ${to.y}`;
  } else {
    const midY = (sourceY + targetY) / 2;
    path = `M ${sourceX} ${sourceY} C ${sourceX} ${midY}, ${targetX} ${midY}, ${targetX} ${targetY}`;
  }
  return <BaseEdge path={path} markerEnd={markerEnd} style={style} interactionWidth={interactionWidth ?? 14} />;
}
