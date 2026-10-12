import { useCallback, useState } from 'react';
import { observer, useService } from '@rabjs/react';
import { Handle, Position, type Node, type NodeProps } from '@xyflow/react';
import { CornerDownRight, SendHorizontal, X } from 'lucide-react';
import { truncate } from '../../lib/format.js';
import { useImeGuard } from '../../hooks/useImeGuard.js';
import { useNodeSize } from '../../hooks/useNodeSize.js';
import { CanvasPrefsService } from '../../services/canvas-prefs.service.js';
import { MapService } from '../../workspace/map.service.js';
import { ModelChip } from '../ModelChip.js';

type DraftFlowNode = Node<Record<string, never>, 'draft'>;

/**
 * 画布内提问：草稿即节点。
 * 子/同级草稿顶部带上下文 chip（× 掉转为根问题）；Enter 提交（Shift+Enter 换行），Esc 取消。
 * 输入法还在组字或选词时，Enter 留给输入法，不提交、不发起模型请求。
 */
export const DraftNodeView = observer(function DraftNodeView({ id }: NodeProps<DraftFlowNode>) {
  const map = useService(MapService);
  const prefs = useService(CanvasPrefsService);
  const ime = useImeGuard();
  const draft = map.drafts.find((item) => item.tempId === id);
  const anchorQuestion = draft?.anchorId ? (map.nodes[draft.anchorId]?.question ?? null) : null;
  const [text, setText] = useState(draft?.seed ?? '');
  const layout = prefs.settings.layout;
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
    void map.commitDraft(id, text);
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
          <button type="button" aria-label="取消选中，改为新问题" onClick={() => map.detachDraft(id)}>
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
        onCompositionStart={ime.onCompositionStart}
        onCompositionEnd={ime.onCompositionEnd}
        onKeyDown={(event) => {
          event.stopPropagation();
          if (ime.owns(event)) return;
          if (event.key === 'Enter' && !event.shiftKey) {
            event.preventDefault();
            submit();
          }
          if (event.key === 'Escape') {
            event.preventDefault();
            map.cancelDraft(id);
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
