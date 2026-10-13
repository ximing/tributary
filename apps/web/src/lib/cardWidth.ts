import { NODE_WIDTH } from '../workspace/map-model.js';

/** 拖动卡片右缘时的宽度范围。默认宽度不写入本地记录。 */
export const MIN_CARD_WIDTH = 200;
export const MAX_CARD_WIDTH = 560;
/** 画布上的问题默认只露这么多行，更长的可以展开。 */
export const QUESTION_LINE_CLAMP = 3;

const KEY = 'tributary-card-widths';

export function clampCardWidth(width: number): number {
  if (!Number.isFinite(width)) return NODE_WIDTH;
  return Math.round(Math.min(MAX_CARD_WIDTH, Math.max(MIN_CARD_WIDTH, width)));
}

export function readCardWidths(): Record<string, number> {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    if (!parsed || typeof parsed !== 'object') return {};
    const widths: Record<string, number> = {};
    for (const [id, value] of Object.entries(parsed)) {
      if (typeof value !== 'number') continue;
      const width = clampCardWidth(value);
      if (width !== NODE_WIDTH) widths[id] = width;
    }
    return widths;
  } catch {
    return {};
  }
}

export function writeCardWidths(widths: Record<string, number>): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(widths));
  } catch {
    /* 忽略持久化失败 */
  }
}
