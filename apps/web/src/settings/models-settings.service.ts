import type { ModelProvider } from '@tributary/domain';
import { Service } from '@rabjs/react';
import { deleteModelConfig, saveModelConfig, setDefaultModelConfig } from '../api/client.js';
import type { ModelConfig } from '../api/client.js';
import { ModelCatalogService } from '../workspace/model-catalog.service.js';

/** 设置里的模型列表。保存后刷新画布正在用的目录。 */
export class ModelsSettingsService extends Service {
  configs: ModelConfig[] = [];
  error = '';
  saved = false;

  get catalog(): ModelCatalogService {
    return this.resolve(ModelCatalogService);
  }

  async load(): Promise<void> {
    this.error = '';
    try {
      await this.reload();
    } catch (error) {
      this.error = error instanceof Error ? error.message : '读取模型失败';
    }
  }

  async save(input: {
    provider: ModelProvider;
    apiKey: string;
    model: string;
    isDefault?: boolean;
    baseUrl?: string;
  }): Promise<boolean> {
    this.error = '';
    this.saved = false;
    try {
      await saveModelConfig(input);
      await this.reload();
      this.saved = true;
      return true;
    } catch (error) {
      this.error = error instanceof Error ? error.message : '保存失败';
      return false;
    }
  }

  async makeDefault(id: string): Promise<void> {
    try {
      await setDefaultModelConfig(id);
      await this.reload();
    } catch (error) {
      this.error = error instanceof Error ? error.message : '设置失败';
    }
  }

  async remove(id: string): Promise<void> {
    try {
      await deleteModelConfig(id);
      await this.reload();
    } catch (error) {
      this.error = error instanceof Error ? error.message : '删除失败';
    }
  }

  private async reload(): Promise<void> {
    await this.catalog.refresh();
    this.configs = this.catalog.configs;
  }
}
