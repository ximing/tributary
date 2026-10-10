import { useEffect, useRef } from 'react';
import { useWorkspace } from '../store/workspace.js';

/** 用 ResizeObserver 把元素实际高度上报到 store，驱动布局重排 */
export function useNodeSize<T extends HTMLElement>(id: string) {
  const ref = useRef<T | null>(null);
  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    const report = useWorkspace.getState().reportHeight;
    report(id, element.offsetHeight);
    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) report(id, entry.contentRect.height);
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, [id]);
  return ref;
}
