import { memo } from 'react';
import { Handle, Position, type Node, type NodeProps } from '@xyflow/react';
import { ChevronDown, CircleAlert, LoaderCircle, Plus, RefreshCw } from 'lucide-react';
import { useNodeSize } from '../../hooks/useNodeSize.js';
import { useCanvasSettings } from '../../lib/canvasSettings.js';
import { useWorkspace } from '../../store/workspace.js';
import { NodeActionBar } from './NodeActionBar.js';
import { NodeMarkdown } from './NodeMarkdown.js';

type QuestionFlowNode = Node<Record<string, never>, 'question'>;

/**
 * 节点卡片：紧凑态只显示问题与回复摘要；展开/流式时显示完整 markdown。
 * 流式文本走 store 精确订阅，只有这张卡片随 token 重渲染。
 */
export const QuestionNodeView = memo(function QuestionNodeView({ id, selected }: NodeProps<QuestionFlowNode>) {
  const node = useWorkspace((state) => state.nodes[id]);
  const streamingText = useWorkspace((state) => state.streaming[id]);
  const streamError = useWorkspace((state) => state.streamErrors[id]);
  const expanded = useWorkspace((state) => Boolean(state.expandedReplies[id]));
  const childCount = useWorkspace(
    (state) => state.nodeOrder.reduce((count, nid) => (state.nodes[nid]?.parentId === id ? count + 1 : count), 0),
  );
  const openDraft = useWorkspace((state) => state.openDraft);
  const toggleCollapse = useWorkspace((state) => state.toggleCollapse);
  const retryNode = useWorkspace((state) => state.retryNode);
  const { layout } = useCanvasSettings();
  const ref = useNodeSize<HTMLDivElement>(id);

  if (!node) return null;
  const isStreaming = streamingText !== undefined;
  const isError = node.status === 'error';
  const showFullReply = !isError && (isStreaming || (expanded && node.reply));
  const showExcerpt = !isError && !isStreaming && !expanded && node.reply;
  const tb = layout === 'tb';

  return (
    <div
      ref={ref}
      className={`node-card${selected ? ' is-selected' : ''}${isError ? ' is-error' : ''}${isStreaming ? ' is-streaming' : ''}${tb ? ' is-tb' : ''}`}
      data-status={node.status}
    >
      <Handle type="target" position={tb ? Position.Top : Position.Left} />
      {selected ? <NodeActionBar id={id} /> : null}
      <p className="node-question">{node.question}</p>

      {node.status === 'pending' && !isStreaming ? (
        <p className="node-thinking stream-tag">
          <LoaderCircle className="spin" size={11} aria-hidden />
          思考中…
        </p>
      ) : null}

      {showFullReply ? (
        <div className={`node-reply nodrag nowheel${isStreaming ? ' is-streaming' : ''}`}>
          {isStreaming ? (
            <span className="stream-tag">
              <LoaderCircle className="spin" size={11} aria-hidden />
              回答中
            </span>
          ) : null}
          <NodeMarkdown text={isStreaming ? streamingText : (node.reply ?? '')} />
          {isStreaming ? <span className="node-cursor" /> : null}
        </div>
      ) : null}

      {showExcerpt ? <p className="node-excerpt">{node.reply}</p> : null}

      {isError ? (
        <>
          <div className="node-error">
            <CircleAlert size={14} aria-hidden />
            <p>{streamError ?? node.reply ?? '模型调用失败'}</p>
          </div>
          <button
            type="button"
            className="node-retry"
            onClick={(event) => {
              event.stopPropagation();
              retryNode(id);
            }}
          >
            <RefreshCw size={13} aria-hidden />
            重试
          </button>
        </>
      ) : null}

      {node.model ? (
        <p className="node-meta">
          <span>{node.model}</span>
        </p>
      ) : null}

      {childCount > 0 ? (
        <button
          type="button"
          className={`node-btn node-chevron${node.collapsed ? ' is-collapsed' : ''}`}
          aria-label={node.collapsed ? `展开 ${childCount} 个子节点` : '折叠子树'}
          onClick={(event) => {
            event.stopPropagation();
            void toggleCollapse(id);
          }}
        >
          {node.collapsed ? <span className="node-badge">{childCount}</span> : <ChevronDown size={13} aria-hidden />}
        </button>
      ) : null}

      <button
        type="button"
        className="node-btn node-add"
        aria-label="添加子问题"
        onClick={(event) => {
          event.stopPropagation();
          openDraft('child', id);
        }}
      >
        <Plus size={13} strokeWidth={2.5} aria-hidden />
      </button>
      <Handle type="source" position={tb ? Position.Bottom : Position.Right} />
    </div>
  );
});
