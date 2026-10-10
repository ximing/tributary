import { useEffect } from 'react';
import { getNodesBounds, getViewportForBounds, useReactFlow } from '@xyflow/react';
import { cssVar } from '../../lib/theme.js';
import { useWorkspace } from '../../store/workspace.js';

let exportImpl: (() => Promise<void>) | null = null;

function rasterizeSvg(svg: string, width: number, height: number, pixelRatio: number, background: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    const timer = window.setTimeout(() => reject(new Error('导出图片超时')), 8000);
    image.onload = () => {
      window.clearTimeout(timer);
      const canvas = document.createElement('canvas');
      canvas.width = Math.round(width * pixelRatio);
      canvas.height = Math.round(height * pixelRatio);
      const context = canvas.getContext('2d');
      if (!context) {
        reject(new Error('导出图片失败'));
        return;
      }
      context.fillStyle = background;
      context.fillRect(0, 0, canvas.width, canvas.height);
      context.drawImage(image, 0, 0, canvas.width, canvas.height);
      resolve(canvas.toDataURL('image/png'));
    };
    image.onerror = () => {
      window.clearTimeout(timer);
      reject(new Error('导出图片失败'));
    };
    image.src = svg;
  });
}

export function runMapExport(): Promise<void> {
  return exportImpl?.() ?? Promise.resolve();
}

/**
 * 把当前脑图（不只是窗口里看得见的那一块）导出成 PNG。
 * 挂在 React Flow 里面，才能读到节点边界。
 */
export function MapExport() {
  const reactFlow = useReactFlow();
  const setNotice = useWorkspace((state) => state.setNotice);

  useEffect(() => {
    const exportPng = async () => {
      const flowNodes = reactFlow.getNodes().filter((node) => !node.id.startsWith('draft-'));
      if (flowNodes.length === 0) {
        setNotice('没有可导出的节点');
        return;
      }
      const bounds = getNodesBounds(flowNodes);
      // getViewportForBounds 的 padding 是比例，不是像素。传 64 会把图缩成一个点。
      const padding = 0.15;
      const maxEdge = 4096;
      const rawWidth = Math.max(bounds.width, 1);
      const rawHeight = Math.max(bounds.height, 1);
      const fit = Math.min(1, maxEdge / rawWidth, maxEdge / rawHeight);
      const width = Math.max(1, Math.round(rawWidth * fit));
      const height = Math.max(1, Math.round(rawHeight * fit));
      const viewport = getViewportForBounds(bounds, width, height, 0.05, 2, padding);
      const element = document.querySelector('.react-flow__viewport');
      if (!(element instanceof HTMLElement)) return;
      try {
        const { toSvg } = await import('html-to-image');
        const backgroundColor = cssVar('--bg') || '#f6f1e7';
        const pixelRatio = width * 2 <= 8192 && height * 2 <= 8192 ? 2 : 1;
        // toPng 会等 img.decode()。这张 SVG 的 decode 在 Chrome 里不返回，按钮会一直转。
        // 自己用 onload 画到画布上。skipFonts 避免把整套 Noto Serif SC 子集拉进来。
        const svg = await toSvg(element, {
          backgroundColor,
          width,
          height,
          skipFonts: true,
          style: {
            width: `${String(width)}px`,
            height: `${String(height)}px`,
            transform: `translate(${String(viewport.x)}px, ${String(viewport.y)}px) scale(${String(viewport.zoom)})`,
          },
        });
        const dataUrl = await rasterizeSvg(svg, width, height, pixelRatio, backgroundColor);
        const state = useWorkspace.getState();
        const title = state.conversations.find((item) => item.id === state.activeId)?.title ?? '支流对话';
        const anchor = document.createElement('a');
        anchor.href = dataUrl;
        anchor.download = `${title.replace(/[\\/:*?"<>|]/g, '_') || '支流对话'}.png`;
        anchor.click();
      } catch (error) {
        setNotice(error instanceof Error ? error.message : '导出图片失败');
      }
    };

    exportImpl = exportPng;
    return () => {
      if (exportImpl === exportPng) exportImpl = null;
    };
  }, [reactFlow, setNotice]);

  return null;
}
