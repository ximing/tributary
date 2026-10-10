import { Service } from '@rabjs/react';

/**
 * 主题：light「纸」/ dark「墨」，mode 增加 system「跟随系统」。
 * 持久化到 localStorage，缺省跟随系统。
 */
export type Theme = 'light' | 'dark';
export type ThemeMode = Theme | 'system';

const STORAGE_KEY = 'tributary-theme';

function initialMode(): ThemeMode {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved === 'light' || saved === 'dark' || saved === 'system') return saved;
  } catch {
    /* localStorage 不可用时退回系统偏好 */
  }
  return 'system';
}

function resolveTheme(mode: ThemeMode, prefersDark: boolean): Theme {
  return mode === 'system' ? (prefersDark ? 'dark' : 'light') : mode;
}

/** 读取当前主题下的 CSS 变量值（用于 SVG 属性等吃不到 var() 的场景） */
export function cssVar(name: string): string {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

export class ThemeService extends Service {
  mode: ThemeMode = initialMode();
  theme: Theme = 'light';
  private media: MediaQueryList | null = null;
  private readonly onSystemChange = (): void => {
    if (this.mode !== 'system' || !this.media) return;
    this.apply(resolveTheme(this.mode, this.media.matches));
  };

  constructor() {
    super();
    this.media = window.matchMedia('(prefers-color-scheme: dark)');
    this.theme = resolveTheme(this.mode, this.media.matches);
    document.documentElement.dataset.theme = this.theme;
    this.media.addEventListener('change', this.onSystemChange);
  }

  override destroy(): void {
    this.media?.removeEventListener('change', this.onSystemChange);
    super.destroy();
  }

  setMode(next: ThemeMode): void {
    this.mode = next;
    try {
      localStorage.setItem(STORAGE_KEY, next);
    } catch {
      /* 忽略持久化失败 */
    }
    this.apply(resolveTheme(next, this.media?.matches ?? false));
  }

  toggle(): void {
    this.setMode(this.theme === 'dark' ? 'light' : 'dark');
  }

  private apply(theme: Theme): void {
    if (theme === this.theme && document.documentElement.dataset.theme === theme) return;
    this.theme = theme;
    document.documentElement.dataset.theme = theme;
  }
}
