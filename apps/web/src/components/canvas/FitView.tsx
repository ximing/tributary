import { useEffect, useRef } from 'react';
import { useReactFlow } from '@xyflow/react';
import type { LayoutDirection } from '@tributary/domain';
import { DEFAULT_NODE_HEIGHT, NODE_WIDTH, useWorkspace } from '../../store/workspace.js';

/**
 * 仅在切换对话或切换布局方向时重新 fitView。
 * 同一会话内新增/展开/流式节点都保持当前缩放，由 FocusHandler 平移对准，
 * 避免「每加一个节点就缩小一次」。
 */
export function FitView({
  conversationId,
  count,
  layout,
}: {
  conversationId: string | null;
  count: number;
  layout: LayoutDirection;
}) {
  const { fitView } = useReactFlow();
  const fittedRef = useRef<string | null>(null);
  const layoutRef = useRef<LayoutDirection>(layout);

  useEffect(() => {
    const layoutChanged = layoutRef.current !== layout;
    layoutRef.current = layout;
    if (!conversationId || count === 0) {
      fittedRef.current = conversationId;
      return;
    }
    if (!layoutChanged && fittedRef.current === conversationId) return;
    fittedRef.current = conversationId;
    const frame = requestAnimationFrame(() => {
      void fitView({ padding: 0.25, duration: 150 });
    });
    return () => cancelAnimationFrame(frame);
  }, [conversationId, count, layout, fitView]);
  return null;
}

/** 新建节点 / 键盘导航后，把目标节点平移到视野中央（保持当前缩放比例） */
export function FocusHandler() {
  const focusRequest = useWorkspace((state) => state.focusRequest);
  const reactFlow = useReactFlow();
  useEffect(() => {
    if (!focusRequest) return;
    // 新节点可能刚挂载，等一帧让 React Flow 同步内部 store
    const frame = requestAnimationFrame(() => {
      const node = reactFlow.getNode(focusRequest.id);
      if (!node) return;
      const height = node.measured?.height ?? DEFAULT_NODE_HEIGHT;
      void reactFlow.setCenter(node.position.x + NODE_WIDTH / 2, node.position.y + height / 2, {
        duration: 200,
        zoom: reactFlow.getZoom(),
      });
    });
    return () => cancelAnimationFrame(frame);
  }, [focusRequest, reactFlow]);
  return null;
}
