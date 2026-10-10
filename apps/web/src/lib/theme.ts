import { useSyncExternalStore } from 'react';

/**
 * 主题：light「纸」/ dark「墨」，mode 增加 system「跟随系统」。
 * 持久化到 localStorage，缺省跟随系统；模块加载即应用到 <html data-theme>。
 */
export type Theme = 'light' | 'dark';
export type ThemeMode = Theme | 'system';

const STORAGE_KEY = 'tributary-theme';
const listeners = new Set<() => void>();
const media = window.matchMedia('(prefers-color-scheme: dark)');

function initialMode(): ThemeMode {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved === 'light' || saved === 'dark' || saved === 'system') return saved;
  } catch {
    /* localStorage 不可用时退回系统偏好 */
  }
  return 'system';
}

let mode: ThemeMode = initialMode();

function resolve(): Theme {
  return mode === 'system' ? (media.matches ? 'dark' : 'light') : mode;
}

let current: Theme = resolve();

function apply(theme: Theme): void {
  document.documentElement.dataset.theme = theme;
}

function emit(): void {
  for (const listener of listeners) listener();
}

export function setThemeMode(next: ThemeMode): void {
  mode = next;
  try {
    localStorage.setItem(STORAGE_KEY, next);
  } catch {
    /* 忽略持久化失败 */
  }
  const resolved = resolve();
  if (resolved !== current) {
    current = resolved;
    apply(current);
  }
  emit();
}

export function setTheme(theme: Theme): void {
  setThemeMode(theme);
}

export function toggleTheme(): void {
  setThemeMode(current === 'dark' ? 'light' : 'dark');
}

export function useTheme(): Theme {
  return useSyncExternalStore(
    (onChange) => {
      listeners.add(onChange);
      return () => listeners.delete(onChange);
    },
    () => current,
  );
}

export function useThemeMode(): ThemeMode {
  return useSyncExternalStore(
    (onChange) => {
      listeners.add(onChange);
      return () => listeners.delete(onChange);
    },
    () => mode,
  );
}

/** 读取当前主题下的 CSS 变量值（用于 SVG 属性等吃不到 var() 的场景） */
export function cssVar(name: string): string {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

// system 模式下跟随系统切换
media.addEventListener('change', () => {
  if (mode !== 'system') return;
  const resolved = resolve();
  if (resolved === current) return;
  current = resolved;
  apply(current);
  emit();
});

apply(current);
