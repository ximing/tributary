import { Service } from '@rabjs/react';
import { selectionAfterLoad } from '@tributary/domain';
import { createConversation, deleteConversation, listConversations, loadConversation, type Conversation } from '../api/client.js';
import { errorMessage } from './map-model.js';
import { MapService } from './map.service.js';
import { ModelCatalogService } from './model-catalog.service.js';

/** 对话列表，以及当前打开的是哪一场。节点内容在 MapService。 */
export class ConversationService extends Service {
  conversations: Conversation[] = [];
  activeId: string | null = null;

  get map(): MapService {
    return this.resolve(MapService);
  }

  get catalog(): ModelCatalogService {
    return this.resolve(ModelCatalogService);
  }

  async init(): Promise<void> {
    try {
      await Promise.all([this.refresh(), this.catalog.refresh()]);
    } catch (error) {
      this.map.notice = errorMessage(error, '加载失败');
    }
  }

  async refresh(): Promise<void> {
    const body = await listConversations();
    this.conversations = body.conversations;
  }

  async open(id: string, selectId: string | null = null, keepHistory = false): Promise<void> {
    const epochAtStart = this.map.selectionEpoch;
    try {
      const body = await loadConversation(id);
      const picked = selectionAfterLoad(epochAtStart, this.map.selectionEpoch, selectId, this.map.selectedId);
      this.activeId = id;
      this.map.showConversation(body.nodes, body.links ?? [], picked, keepHistory);
    } catch (error) {
      this.map.notice = errorMessage(error, '打开失败');
    }
  }

  async newConversation(): Promise<void> {
    try {
      const conversation = await createConversation();
      await this.refresh();
      await this.open(conversation.id);
    } catch (error) {
      this.map.notice = errorMessage(error, '创建失败');
    }
  }

  async remove(id: string): Promise<void> {
    try {
      await deleteConversation(id);
      const wasActive = this.activeId === id;
      this.conversations = this.conversations.filter((conversation) => conversation.id !== id);
      if (wasActive) {
        this.activeId = null;
        this.map.clearCanvas();
      }
    } catch (error) {
      this.map.notice = errorMessage(error, '删除失败');
    }
  }
}
