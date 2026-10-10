import { useEffect, useRef } from 'react';
import { useService } from '@rabjs/react';
import { MapService } from '../workspace/map.service.js';

/** 用 ResizeObserver 把元素实际高度上报到地图，驱动布局重排 */
export function useNodeSize<T extends HTMLElement>(id: string) {
  const map = useService(MapService);
  const ref = useRef<T | null>(null);
  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    const report = (nodeId: string, height: number) => map.reportHeight(nodeId, height);
    report(id, element.offsetHeight);
    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) report(id, entry.contentRect.height);
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, [id, map]);
  return ref;
}
