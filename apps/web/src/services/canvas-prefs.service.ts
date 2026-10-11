import { Service } from '@rabjs/react';
import type { LayoutDirection } from '@tributary/domain';

/**
 * 画布级设置：连线样式 / 分支着色 / 布局方向 / 小地图。
 * 持久化到 localStorage，不随对话切换重置。
 */
export type EdgeStyle = 'bezier' | 'smoothstep' | 'step';

export interface CanvasSettings {
  edgeStyle: EdgeStyle;
  branchColors: boolean;
  layout: LayoutDirection;
  minimap: boolean;
}

export const EDGE_STYLE_OPTIONS: { value: EdgeStyle; label: string; hint: string }[] = [
  { value: 'bezier', label: '曲线', hint: '平滑贝塞尔，柔和自然' },
  { value: 'smoothstep', label: '圆角折线', hint: 'XMind 风格，大圆角拐点' },
  { value: 'step', label: '直角折线', hint: '工程图风格，90° 拐点' },
];

export const LAYOUT_OPTIONS: { value: LayoutDirection; label: string; hint: string }[] = [
  { value: 'lr', label: '左右布局', hint: '逻辑图，从左向右生长' },
  { value: 'tb', label: '上下布局', hint: '树形图，从上向下生长' },
];

/** 分支着色色板：每个一级分支一色，子分支继承（XMind 彩虹分支）。首色对齐主题 accent */
export const BRANCH_PALETTES: Record<'light' | 'dark', string[]> = {
  light: ['#6d5ae0', '#0e8f8a', '#3b74d6', '#c24d7c', '#b07a2a', '#4c8a3f'],
  dark: ['#9b8afb', '#3fc6bd', '#6f9bf0', '#e07ba4', '#d9a45b', '#8ab86b'],
};

const STORAGE_KEY = 'tributary-canvas';
const DEFAULTS: CanvasSettings = { edgeStyle: 'bezier', branchColors: false, layout: 'lr', minimap: true };

function loadSettings(): CanvasSettings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULTS;
    const parsed = JSON.parse(raw) as Partial<CanvasSettings>;
    return {
      edgeStyle: EDGE_STYLE_OPTIONS.some((option) => option.value === parsed.edgeStyle) ? parsed.edgeStyle! : DEFAULTS.edgeStyle,
      branchColors: typeof parsed.branchColors === 'boolean' ? parsed.branchColors : DEFAULTS.branchColors,
      layout: LAYOUT_OPTIONS.some((option) => option.value === parsed.layout) ? parsed.layout! : DEFAULTS.layout,
      minimap: typeof parsed.minimap === 'boolean' ? parsed.minimap : DEFAULTS.minimap,
    };
  } catch {
    return DEFAULTS;
  }
}

export class CanvasPrefsService extends Service {
  settings: CanvasSettings = loadSettings();

  patch(next: Partial<CanvasSettings>): void {
    this.settings = { ...this.settings, ...next };
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(this.settings));
    } catch {
      /* 忽略持久化失败 */
    }
  }
}
