import { Service } from '@rabjs/react';
import { getAgentSettings, saveAgentSettings, type AgentSettings } from '../api/client.js';

/** 账号级系统提示词。输入框里的草稿留在组件里。 */
export class AgentSettingsService extends Service {
  settings: AgentSettings | null = null;
  loading = true;
  error = '';
  message = '';

  async load(): Promise<void> {
    this.loading = true;
    this.error = '';
    try {
      this.settings = await getAgentSettings();
    } catch (error) {
      this.settings = null;
      this.error = error instanceof Error ? error.message : '读取提示词失败';
    } finally {
      this.loading = false;
    }
  }

  async save(value: string | null): Promise<void> {
    this.error = '';
    this.message = '';
    try {
      this.settings = await saveAgentSettings(value);
      this.message = this.settings.systemPrompt ? '已保存，将用于后续回答。' : '已恢复默认提示词，将用于后续回答。';
    } catch (error) {
      this.error = error instanceof Error ? error.message : '保存失败';
    }
  }

  clearMessage(): void {
    this.message = '';
  }
}
