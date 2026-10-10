import { has, register, resolve, type Service } from '@rabjs/react';
import { CanvasPrefsService } from './canvas-prefs.service.js';
import { RailService } from './rail.service.js';
import { SessionService } from './session.service.js';
import { ThemeService } from './theme.service.js';

function ensure<T extends Service>(service: new () => T): void {
  if (!has(service)) register(service);
}

/** 应用启动时注册一次。这些服务不进入 bindServices。 */
export function registerAppServices(): void {
  ensure(SessionService);
  ensure(ThemeService);
  ensure(RailService);
  ensure(CanvasPrefsService);
  resolve(ThemeService);
  resolve(RailService);
  resolve(CanvasPrefsService);
  resolve(SessionService);
}
