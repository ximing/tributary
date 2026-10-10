import { Service } from '@rabjs/react';
import { search, type SearchHit } from '../api/client.js';
import { errorMessage } from './map-model.js';
import { MapService } from './map.service.js';

/** 全局搜索对话框。和快捷键帮助互斥。 */
export class SearchService extends Service {
  searchOpen = false;
  hits: SearchHit[] = [];

  get map(): MapService {
    return this.resolve(MapService);
  }

  setOpen(open: boolean): void {
    this.searchOpen = open;
    if (open) this.map.helpOpen = false;
  }

  async run(query: string): Promise<void> {
    try {
      const body = await search(query);
      this.hits = body.hits;
    } catch (error) {
      this.map.notice = errorMessage(error, '搜索失败');
    }
  }

  clearHits(): void {
    this.hits = [];
  }
}
