import { useState } from 'react';
import { observer, useService } from '@rabjs/react';
import { PanelLeftClose, PanelLeftOpen, Plus, Search } from 'lucide-react';
import { RailService } from '../../services/rail.service.js';
import { ConversationService } from '../../workspace/conversation.service.js';
import { SearchService } from '../../workspace/search.service.js';
import { AccountMenu } from './AccountMenu.js';
import { ConversationList } from './ConversationList.js';
import { SearchDialog } from './SearchDialog.js';

/** 侧栏：对话列表、搜索、新对话。账号菜单单独一块。 */
export const Rail = observer(function Rail() {
  const conversations = useService(ConversationService);
  const search = useService(SearchService);
  const rail = useService(RailService);
  const collapsed = rail.collapsed;
  const searchOpen = search.searchOpen;
  const [creating, setCreating] = useState(false);

  return (
    <aside className={`rail${collapsed ? ' is-collapsed' : ''}`} aria-label="对话列表">
      <div className="rail-head">
        <header className="brand">
          <img className="mark" src="/icon-192.png" alt="" width={36} height={36} />
          <div className="brand-text">
            <h1>支流</h1>
            <p>问题长成一棵树</p>
          </div>
        </header>
        <div className="rail-tools">
          <button
            type="button"
            id="rail-search-button"
            className={`rail-icon${searchOpen ? ' is-on' : ''}`}
            title="搜索 ⌘K"
            aria-label="搜索"
            aria-haspopup="dialog"
            aria-expanded={searchOpen}
            onClick={() => search.setOpen(!searchOpen)}
          >
            <Search size={15} aria-hidden />
          </button>
          <button
            type="button"
            className="rail-icon"
            title={collapsed ? '展开侧栏 ]' : '收起侧栏 ['}
            aria-label={collapsed ? '展开侧栏' : '收起侧栏'}
            aria-expanded={!collapsed}
            onClick={() => rail.toggle()}
          >
            {collapsed ? <PanelLeftOpen size={15} aria-hidden /> : <PanelLeftClose size={15} aria-hidden />}
          </button>
        </div>
      </div>
      <button
        type="button"
        className="btn btn-primary"
        title="新对话"
        disabled={creating}
        onClick={() => {
          setCreating(true);
          void conversations.newConversation().finally(() => setCreating(false));
        }}
      >
        <Plus size={15} aria-hidden />
        <span className="btn-text">新对话</span>
      </button>
      <ConversationList />
      <AccountMenu />
      <SearchDialog />
    </aside>
  );
});
