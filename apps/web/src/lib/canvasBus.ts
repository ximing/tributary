/**
 * 画布操作总线：CanvasDock 挂载时注册 React Flow 的视口操作，
 * 全局快捷键（⇧F / ⌘+ / ⌘-）通过这里调用，避免把 React Flow 实例塞进全局 store。
 */
export interface CanvasHandlers {
  fit: () => void;
  zoomIn: () => void;
  zoomOut: () => void;
  exportPng: () => Promise<void>;
}

let handlers: CanvasHandlers | null = null;

export function registerCanvasHandlers(next: CanvasHandlers | null): void {
  handlers = next;
}

export function canvasFit(): void {
  handlers?.fit();
}

export function canvasZoomIn(): void {
  handlers?.zoomIn();
}

export function canvasZoomOut(): void {
  handlers?.zoomOut();
}

export function canvasExportPng(): Promise<void> {
  return handlers?.exportPng() ?? Promise.resolve();
}
