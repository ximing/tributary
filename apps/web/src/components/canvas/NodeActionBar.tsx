import { observer, useService } from '@rabjs/react';
import { CornerDownRight, MoreHorizontal, Plus, RefreshCw } from 'lucide-react';
import { MapService } from '../../workspace/map.service.js';

/**
 * 选中节点时浮在节点上方的语境操作条（现代脑图交互）。
 * ⋯ 打开与右键相同的菜单，避免两套操作清单。
 */
export const NodeActionBar = observer(function NodeActionBar({ id }: { id: string }) {
  const map = useService(MapService);

  return (
    <div className="node-bar nodrag" role="toolbar" aria-label="节点操作">
      <button
        type="button"
        title="添加子问题 (Tab)"
        onClick={(event) => {
          event.stopPropagation();
          map.openDraft('child', id);
        }}
      >
        <CornerDownRight size={13} aria-hidden />
        子问题
      </button>
      <button
        type="button"
        title="添加同级问题 (Enter)"
        onClick={(event) => {
          event.stopPropagation();
          map.openDraft('sibling', id);
        }}
      >
        <Plus size={13} aria-hidden />
        同级
      </button>
      <button
        type="button"
        title="重新生成回答"
        aria-label="重新生成回答"
        onClick={(event) => {
          event.stopPropagation();
          void map.regenerateNode(id);
        }}
      >
        <RefreshCw size={13} aria-hidden />
      </button>
      <div className="div" />
      <button
        type="button"
        title="更多操作"
        aria-label="更多操作"
        onClick={(event) => {
          event.stopPropagation();
          map.setMenu({ x: event.clientX, y: event.clientY, target: 'node' });
        }}
      >
        <MoreHorizontal size={13} aria-hidden />
      </button>
    </div>
  );
});
