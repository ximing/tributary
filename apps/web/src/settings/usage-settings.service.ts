import { Service } from '@rabjs/react';
import { usage, type UsageView } from '../api/client.js';

/** 用量页只在打开时拉取，跟着这一页的容器销毁。 */
export class UsageSettingsService extends Service {
  view: UsageView | null = null;
  error = '';

  async load(): Promise<void> {
    try {
      this.view = await usage();
    } catch (error) {
      this.error = error instanceof Error ? error.message : '读取用量失败';
    }
  }
}
