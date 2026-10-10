import { ChevronsDownUp, CornerDownRight, Plus, RefreshCw, Trash2 } from 'lucide-react';
import { useWorkspace } from '../store/workspace.js';

/** 右键菜单：脑图操作的辅助入口（主入口是快捷键与节点上的按钮） */
export function ContextMenu() {
  const menu = useWorkspace((state) => state.menu);
  const selectedId = useWorkspace((state) => state.selectedId);
  const openDraft = useWorkspace((state) => state.openDraft);
  const toggleCollapse = useWorkspace((state) => state.toggleCollapse);
  const regenerateNode = useWorkspace((state) => state.regenerateNode);
  const removeNode = useWorkspace((state) => state.removeNode);

  if (!menu || !selectedId) return null;

  return (
    <div className="menu" style={{ left: menu.x, top: menu.y }} role="menu">
      <button type="button" className="menu-item" role="menuitem" onClick={() => openDraft('child')}>
        <CornerDownRight size={14} aria-hidden />
        添加子问题 <kbd>Tab</kbd>
      </button>
      <button type="button" className="menu-item" role="menuitem" onClick={() => openDraft('sibling')}>
        <Plus size={14} aria-hidden />
        添加同级问题 <kbd>Enter</kbd>
      </button>
      <button type="button" className="menu-item" role="menuitem" onClick={() => void toggleCollapse(selectedId)}>
        <ChevronsDownUp size={14} aria-hidden />
        折叠/展开子树
      </button>
      <button type="button" className="menu-item" role="menuitem" onClick={() => void regenerateNode(selectedId)}>
        <RefreshCw size={14} aria-hidden />
        重新生成回答
      </button>
      <div className="sep" />
      <button type="button" className="menu-item is-danger" role="menuitem" onClick={() => void removeNode(selectedId)}>
        <Trash2 size={14} aria-hidden />
        删除节点及子分支 <kbd>Del</kbd>
      </button>
    </div>
  );
}
