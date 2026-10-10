import { memo, useCallback, useState } from 'react';
import { Handle, Position, type Node, type NodeProps } from '@xyflow/react';
import { CornerDownRight, SendHorizontal, X } from 'lucide-react';
import { truncate } from '../../lib/format.js';
import { useNodeSize } from '../../hooks/useNodeSize.js';
import { useCanvasSettings } from '../../lib/canvasSettings.js';
import { useWorkspace } from '../../store/workspace.js';
import { ModelChip } from '../ModelChip.js';

type DraftFlowNode = Node<Record<string, never>, 'draft'>;

/**
 * 画布内提问：草稿即节点。
 * 子/同级草稿顶部带上下文 chip（× 掉转为根问题）；Enter 提交（Shift+Enter 换行），Esc 取消。
 */
export const DraftNodeView = memo(function DraftNodeView({ id }: NodeProps<DraftFlowNode>) {
  const draft = useWorkspace((state) => state.drafts.find((item) => item.tempId === id));
  const anchorQuestion = useWorkspace((state) =>
    draft?.anchorId ? (state.nodes[draft.anchorId]?.question ?? null) : null,
  );
  const commitDraft = useWorkspace((state) => state.commitDraft);
  const cancelDraft = useWorkspace((state) => state.cancelDraft);
  const detachDraft = useWorkspace((state) => state.detachDraft);
  const [text, setText] = useState(draft?.seed ?? '');
  const { layout } = useCanvasSettings();
  const ref = useNodeSize<HTMLDivElement>(id);
  // autoFocus 在 React Flow 节点里不可靠（节点挂载时机/页面焦点），用 ref 回调兜底
  const focusRef = useCallback((element: HTMLTextAreaElement | null) => {
    if (element && document.activeElement !== element) {
      requestAnimationFrame(() => {
        element.focus();
        const end = element.value.length;
        element.setSelectionRange(end, end);
      });
    }
  }, []);

  if (!draft) return null;

  const submit = () => {
    void commitDraft(id, text);
  };

  return (
    <div ref={ref} className="node-card is-draft">
      <Handle type="target" position={layout === 'tb' ? Position.Top : Position.Left} />
      {draft.anchorId && anchorQuestion ? (
        <p className="draft-context">
          <CornerDownRight size={11} aria-hidden />
          <span>
            {draft.relation === 'sibling' ? '与' : '顺着'}「{truncate(anchorQuestion, 14)}」
            {draft.relation === 'sibling' ? '同级' : '继续问'}
          </span>
          <button type="button" aria-label="取消选中，改为新问题" onClick={() => detachDraft(id)}>
            <X size={10} aria-hidden />
          </button>
        </p>
      ) : null}
      <textarea
        ref={focusRef}
        className="draft-input nodrag"
        rows={Math.min(8, Math.max(2, text.split('\n').length))}
        placeholder={draft.anchorId ? '继续追问…' : '输入你的问题…'}
        aria-label="新问题"
        value={text}
        onChange={(event) => setText(event.target.value)}
        onKeyDown={(event) => {
          event.stopPropagation();
          if (event.key === 'Enter' && !event.shiftKey) {
            event.preventDefault();
            submit();
          }
          if (event.key === 'Escape') {
            event.preventDefault();
            cancelDraft(id);
          }
        }}
      />
      <div className="draft-foot">
        <ModelChip />
        <span className="kbd-hint">
          <kbd>⏎</kbd> 提交 <kbd>esc</kbd>
        </span>
        <button type="button" className="send-btn" aria-label="提交" disabled={!text.trim()} onClick={submit}>
          <SendHorizontal size={13} aria-hidden />
        </button>
      </div>
    </div>
  );
});
