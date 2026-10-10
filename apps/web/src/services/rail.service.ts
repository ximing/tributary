import { Service } from '@rabjs/react';

/** 侧栏折叠状态，持久化到 localStorage。快捷键 [ / ] 切换。 */
const STORAGE_KEY = 'tributary-rail';

function loadCollapsed(): boolean {
  try {
    return localStorage.getItem(STORAGE_KEY) === 'collapsed';
  } catch {
    return false;
  }
}

export class RailService extends Service {
  collapsed = loadCollapsed();

  setCollapsed(next: boolean): void {
    this.collapsed = next;
    try {
      localStorage.setItem(STORAGE_KEY, next ? 'collapsed' : 'expanded');
    } catch {
      /* 忽略持久化失败 */
    }
  }

  toggle(): void {
    this.setCollapsed(!this.collapsed);
  }
}
