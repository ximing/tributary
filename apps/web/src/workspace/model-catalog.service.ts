import { Service } from '@rabjs/react';
import { listModelConfigs, type ModelConfig } from '../api/client.js';
import { preferredChoice } from './map-model.js';

/** 工作区可用的模型配置，以及画布上当前选中的模型。 */
export class ModelCatalogService extends Service {
  configs: ModelConfig[] = [];
  modelChoice = '';

  async refresh(): Promise<void> {
    const body = await listModelConfigs();
    this.configs = body.configs;
    this.modelChoice = preferredChoice(body.configs, this.modelChoice);
  }

  setChoice(choice: string): void {
    this.modelChoice = choice;
  }
}
