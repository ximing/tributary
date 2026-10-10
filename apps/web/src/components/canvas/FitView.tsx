import { useEffect, useRef } from 'react';
import { useReactFlow } from '@xyflow/react';
import type { LayoutDirection } from '@tributary/domain';
import { readViewport } from '../../lib/viewportMemory.js';
import { DEFAULT_NODE_HEIGHT, NODE_WIDTH, useWorkspace } from '../../store/workspace.js';

/**
 * 切换对话时恢复上次的平移和缩放；第一次打开、或切换布局方向时适应全图。
 * 节点还没挂上时不记「已取景」，等数量变为正数再取一次。
 * 同一会话内新增/展开/流式节点都保持当前缩放。
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
  const { fitView, setViewport, viewportInitialized } = useReactFlow();
  const fittedRef = useRef<string | null>(null);
  const layoutRef = useRef<LayoutDirection>(layout);

  useEffect(() => {
    const layoutChanged = layoutRef.current !== layout;
    layoutRef.current = layout;
    if (!conversationId) {
      fittedRef.current = null;
      return;
    }
    // 视口还没初始化时 setViewport 不会生效。放进 rAF 又会被随后的 effect 清理取消掉。
    if (count === 0 || !viewportInitialized) return;
    if (!layoutChanged && fittedRef.current === conversationId) return;
    const saved = layoutChanged ? null : readViewport(conversationId);
    fittedRef.current = conversationId;
    if (saved) void setViewport(saved, { duration: 0 });
    else void fitView({ padding: 0.25, duration: 150 });
  }, [conversationId, count, layout, fitView, setViewport, viewportInitialized]);
  return null;
}

/** 新建节点 / 搜索定位后，把目标节点平移到视野中央（保持当前缩放比例） */
export function FocusHandler() {
  const focusRequest = useWorkspace((state) => state.focusRequest);
  const reactFlow = useReactFlow();
  useEffect(() => {
    if (!focusRequest) return;
    let frame = 0;
    let tries = 0;
    const attempt = () => {
      const node = reactFlow.getNode(focusRequest.id);
      // 刚展开的祖先要等节点挂上，多等几帧
      if (!node) {
        if (tries < 5) {
          tries += 1;
          frame = requestAnimationFrame(attempt);
        }
        return;
      }
      const height = node.measured?.height ?? DEFAULT_NODE_HEIGHT;
      void reactFlow.setCenter(node.position.x + NODE_WIDTH / 2, node.position.y + height / 2, {
        duration: 200,
        zoom: reactFlow.getZoom(),
      });
    };
    frame = requestAnimationFrame(attempt);
    return () => cancelAnimationFrame(frame);
  }, [focusRequest, reactFlow]);
  return null;
}
