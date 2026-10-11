import { Service } from '@rabjs/react';
import { selectionAfterLoad } from '@tributary/domain';
import { createConversation, deleteConversation, listConversations, loadConversation, type Conversation } from '../api/client.js';
import { clearMapId, readMapId, writeMapId } from '../lib/mapMemory.js';
import { errorMessage } from './map-model.js';
import { MapService } from './map.service.js';
import { ModelCatalogService } from './model-catalog.service.js';

/** 对话列表，以及当前打开的是哪一场。节点内容在 MapService。 */
export class ConversationService extends Service {
  conversations: Conversation[] = [];
  activeId: string | null = null;
  /** 初次恢复结束后才把选中写回地址栏，避免刷新时把 ?map= 清掉。 */
  restored = false;
  /** 后发起的打开作废先发起的，避免恢复和点击互相覆盖。 */
  openEpoch = 0;

  get map(): MapService {
    return this.resolve(MapService);
  }

  get catalog(): ModelCatalogService {
    return this.resolve(ModelCatalogService);
  }

  async init(preferredId?: string | null): Promise<void> {
    try {
      await Promise.all([this.refresh(), this.catalog.refresh()]);
    } catch (error) {
      this.map.notice = errorMessage(error, '加载失败');
    }
    try {
      await this.restore(preferredId);
    } finally {
      this.restored = true;
    }
  }

  /** 地址栏里的脑图优先，否则用上次打开的。已经选中则不动。 */
  async restore(preferredId?: string | null): Promise<void> {
    if (this.activeId) return;
    const mark = this.openEpoch;
    const preferred = this.listed(preferredId);
    const stored = this.listed(readMapId());
    const first = preferred ?? stored;
    if (!first || this.openEpoch !== mark) return;
    await this.open(first);
    if (this.activeId || !stored || stored === first || this.openEpoch !== mark + 1) return;
    await this.open(stored);
    if (this.activeId) this.map.notice = '';
  }

  listed(id: string | null | undefined): string | null {
    if (!id) return null;
    return this.conversations.some((conversation) => conversation.id === id) ? id : null;
  }

  async refresh(): Promise<void> {
    const body = await listConversations();
    this.conversations = body.conversations;
  }

  async open(id: string, selectId: string | null = null, keepHistory = false): Promise<void> {
    const epoch = ++this.openEpoch;
    const epochAtStart = this.map.selectionEpoch;
    try {
      const body = await loadConversation(id);
      if (epoch !== this.openEpoch) return;
      const picked = selectionAfterLoad(epochAtStart, this.map.selectionEpoch, selectId, this.map.selectedId);
      this.activeId = id;
      writeMapId(id);
      this.map.showConversation(body.nodes, body.links ?? [], picked, keepHistory);
    } catch (error) {
      if (epoch !== this.openEpoch) return;
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
        clearMapId();
        this.map.clearCanvas();
      }
    } catch (error) {
      this.map.notice = errorMessage(error, '删除失败');
    }
  }
}
