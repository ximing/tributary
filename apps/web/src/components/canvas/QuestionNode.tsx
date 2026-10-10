import { useEffect, useRef, useState } from 'react';
import { observer, useService } from '@rabjs/react';
import { createPortal } from 'react-dom';
import { stickerOf } from '@tributary/domain';
import { Handle, Position, type Node, type NodeProps } from '@xyflow/react';
import { ChevronDown, CircleAlert, LoaderCircle, Plus, RefreshCw, Square } from 'lucide-react';
import { useNodeSize } from '../../hooks/useNodeSize.js';
import { markElement, splitHighlight } from '../../lib/findMark.js';
import { CanvasPrefsService } from '../../services/canvas-prefs.service.js';
import { MapService } from '../../workspace/map.service.js';
import { StreamService } from '../../workspace/stream.service.js';
import { useBranchDrag } from './branchDrag.js';
import { AnswerBadge } from '../AnswerBadge.js';
import { NodeActionBar } from './NodeActionBar.js';
import { NodeMarkdown } from './NodeMarkdown.js';

type QuestionFlowNode = Node<Record<string, never>, 'question'>;

/**
 * 节点卡片：紧凑态只显示问题与回复摘要；展开/流式时显示完整 markdown。
 * 流式文本走 store 精确订阅，只有这张卡片随 token 重渲染。
 */
export const QuestionNodeView = observer(function QuestionNodeView({ id, selected }: NodeProps<QuestionFlowNode>) {
  const map = useService(MapService);
  const streams = useService(StreamService);
  const prefs = useService(CanvasPrefsService);
  const node = map.nodes[id];
  const streamingText = streams.streaming[id];
  const streamError = streams.streamErrors[id];
  const expanded = Boolean(map.expandedReplies[id]);
  const childCount = map.nodeOrder.reduce((count, nid) => (map.nodes[nid]?.parentId === id ? count + 1 : count), 0);
  const findQuery = map.findCurrentId === id ? map.findQuery : '';
  const editingNote = map.editingNoteId === id;
  const linkSource = map.linkFrom === id;
  const found = findQuery.trim().length > 0;
  const replyRef = useRef<HTMLDivElement>(null);
  const [ask, setAsk] = useState<{ text: string; x: number; y: number } | null>(null);
  const editing = map.editingId === id;
  const drag = map.drag;
  const onPointerDown = useBranchDrag(id, !editing);
  const layout = prefs.settings.layout;
  const ref = useNodeSize<HTMLDivElement>(id);

  useEffect(() => {
    if (!ask) return;
    const onChange = () => {
      const text = window.getSelection()?.toString().trim() ?? '';
      if (!text) setAsk(null);
    };
    document.addEventListener('selectionchange', onChange);
    return () => document.removeEventListener('selectionchange', onChange);
  }, [ask]);

  useEffect(() => {
    const host = replyRef.current;
    if (!host) return;
    markElement(host, findQuery);
  }, [findQuery, streamingText, node?.reply, expanded]);

  if (!node) return null;
  const askPop = ask
    ? createPortal(
        <button
          type="button"
          className="ask-pop"
          style={{ left: ask.x, top: ask.y }}
          onMouseDown={(event) => event.preventDefault()}
          onClick={(event) => {
            event.stopPropagation();
            map.openDraft('child', id, ask.text);
            window.getSelection()?.removeAllRanges();
            setAsk(null);
          }}
        >
          就此追问
        </button>,
        document.body,
      )
    : null;
  const isStreaming = streamingText !== undefined;
  const isError = node.status === 'error';
  const showFullReply = !isError && (isStreaming || (expanded && node.reply));
  const showExcerpt = !isError && !isStreaming && !expanded && node.reply;
  const tb = layout === 'tb';
  const dropPlace = drag && drag.id !== id && drag.drop?.overId === id ? drag.drop.place : null;

  return (
    <div
      ref={ref}
      className={`node-card${selected ? ' is-selected' : ''}${found ? ' is-find' : ''}${isError ? ' is-error' : ''}${isStreaming ? ' is-streaming' : ''}${tb ? ' is-tb' : ''}${drag?.id === id ? ' is-dragging' : ''}${linkSource ? ' is-link-source' : ''}${dropPlace === 'before' ? ' is-drop-before' : ''}${dropPlace === 'after' ? ' is-drop-after' : ''}${dropPlace === 'child' ? ' is-drop-child' : ''}`}
      data-status={node.status}
      onPointerDown={onPointerDown}
    >
      <Handle type="target" position={tb ? Position.Top : Position.Left} />
      {selected ? <NodeActionBar id={id} /> : null}
      {editing ? (
        <QuestionEditor id={id} question={node.question} />
      ) : (
        <p
          className="node-question"
          title="空格或双击编辑"
          onDoubleClick={(event) => {
            event.stopPropagation();
            map.setEditing(id);
          }}
        >
          <MarkedText text={node.question} query={findQuery} sticker={node.sticker} />
        </p>
      )}

      {node.model ? <AnswerBadge providerId={node.providerId} model={node.model} /> : null}

      {editingNote ? (
        <NoteEditor id={id} note={node.note ?? ''} />
      ) : node.note ? (
        <p
          className="node-note nodrag"
          title="双击编辑笔记"
          onClick={(event) => event.stopPropagation()}
          onDoubleClick={(event) => {
            event.stopPropagation();
            map.setEditingNote(id);
          }}
        >
          <span className="node-note-label">笔记</span>
          <MarkedText text={node.note} query={findQuery} />
        </p>
      ) : null}

      {node.status === 'pending' || isStreaming ? (
        <div className="node-pending">
          {node.status === 'pending' && !isStreaming ? (
            <p className="node-thinking stream-tag">
              <LoaderCircle className="spin" size={11} aria-hidden />
              思考中…
            </p>
          ) : null}
          <button
            type="button"
            className="node-stop"
            onClick={(event) => {
              event.stopPropagation();
              void map.stopNode(id);
            }}
          >
            <Square size={10} aria-hidden />
            停止
          </button>
        </div>
      ) : null}

      {showFullReply ? (
        <div
          ref={replyRef}
          className={`node-reply nodrag nowheel${isStreaming ? ' is-streaming' : ''}`}
          onMouseUp={(event) => {
            captureAsk(event.currentTarget, setAsk);
          }}
        >
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

      {showExcerpt ? (
        <p
          className="node-excerpt"
          onMouseUp={(event) => {
            captureAsk(event.currentTarget, setAsk);
          }}
        >
          <MarkedText text={node.reply ?? ''} query={findQuery} />
        </p>
      ) : null}

      {node.status === 'done' && !node.reply && !isStreaming ? (
        <button
          type="button"
          className="node-retry"
          onClick={(event) => {
            event.stopPropagation();
            void map.askNode(id);
          }}
        >
          <RefreshCw size={13} aria-hidden />
          生成回答
        </button>
      ) : null}

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
              map.retryNode(id);
            }}
          >
            <RefreshCw size={13} aria-hidden />
            重试
          </button>
        </>
      ) : null}

      {childCount > 0 ? (
        <button
          type="button"
          className={`node-btn node-chevron${node.collapsed ? ' is-collapsed' : ''}`}
          aria-label={node.collapsed ? `展开 ${childCount} 个子节点` : '折叠子树'}
          onClick={(event) => {
            event.stopPropagation();
            void map.toggleCollapse(id);
          }}
        >
          {node.collapsed ? <span className="node-badge">{childCount}</span> : <ChevronDown size={13} aria-hidden />}
        </button>
      ) : null}

      <button
        type="button"
        className="node-btn node-add"
        aria-label="添加子问题"
        title="添加子问题 (Tab)"
        onClick={(event) => {
          event.stopPropagation();
          map.openDraft('child', id);
        }}
      >
        <Plus size={13} strokeWidth={2.5} aria-hidden />
      </button>
      <Handle type="source" position={tb ? Position.Bottom : Position.Right} />
      {askPop}
    </div>
  );
});

function captureAsk(host: HTMLElement, setAsk: (ask: { text: string; x: number; y: number } | null) => void) {
  const selection = window.getSelection();
  const text = selection?.toString().replace(/\s+/g, ' ').trim() ?? '';
  if (!text || !selection || selection.rangeCount === 0) {
    setAsk(null);
    return;
  }
  const range = selection.getRangeAt(0);
  if (!host.contains(range.commonAncestorContainer)) {
    setAsk(null);
    return;
  }
  const rect = range.getBoundingClientRect();
  if (rect.width === 0 && rect.height === 0) {
    setAsk(null);
    return;
  }
  setAsk({ text: text.slice(0, 2000), x: rect.left + rect.width / 2, y: rect.bottom });
}

function MarkedText({ text, query, sticker }: { text: string; query: string; sticker?: string | null }) {
  const mark = stickerOf(sticker);
  const parts = splitHighlight(text, query);
  return (
    <>
      {mark ? (
        <span className="node-sticker" title={mark.label}>
          {mark.mark}
        </span>
      ) : null}
      {parts.map((part, index) =>
        part.hit ? (
          <mark key={index} className="find-hit">
            {part.text}
          </mark>
        ) : (
          <span key={index}>{part.text}</span>
        ),
      )}
    </>
  );
}

const NoteEditor = observer(function NoteEditor({ id, note }: { id: string; note: string }) {
  const map = useService(MapService);
  const [text, setText] = useState(note);
  const skipBlur = useRef(false);

  return (
    <textarea
      className="node-note node-note-input nodrag nowheel"
      aria-label="笔记"
      rows={Math.min(8, Math.max(3, text.split('\n').length))}
      value={text}
      autoFocus
      placeholder="写给自己的笔记，不会发给模型"
      onPointerDown={(event) => event.stopPropagation()}
      onClick={(event) => event.stopPropagation()}
      onDoubleClick={(event) => event.stopPropagation()}
      onChange={(event) => setText(event.target.value)}
      onKeyDown={(event) => {
        event.stopPropagation();
        if (event.key === 'Escape') {
          event.preventDefault();
          skipBlur.current = true;
          map.setEditingNote(null);
          return;
        }
        if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
          event.preventDefault();
          skipBlur.current = true;
          void map.saveNote(id, text);
        }
      }}
      onBlur={() => {
        if (skipBlur.current) return;
        void map.saveNote(id, text);
      }}
    />
  );
});

const QuestionEditor = observer(function QuestionEditor({ id, question }: { id: string; question: string }) {
  const map = useService(MapService);
  const [text, setText] = useState(question);
  const skipBlur = useRef(false);

  useEffect(() => {
    setText(question);
  }, [question]);

  return (
    <textarea
      className="node-question node-question-input nodrag nowheel"
      aria-label="编辑问题"
      rows={Math.max(2, text.split('\n').length)}
      value={text}
      autoFocus
      onPointerDown={(event) => event.stopPropagation()}
      onClick={(event) => event.stopPropagation()}
      onDoubleClick={(event) => event.stopPropagation()}
      onChange={(event) => setText(event.target.value)}
      onKeyDown={(event) => {
        event.stopPropagation();
        if (event.key === 'Escape') {
          event.preventDefault();
          skipBlur.current = true;
          map.setEditing(null);
          return;
        }
        if (event.key === 'Enter' && !event.shiftKey) {
          event.preventDefault();
          skipBlur.current = true;
          void map.renameQuestion(id, text);
        }
      }}
      onBlur={() => {
        if (skipBlur.current) return;
        void map.renameQuestion(id, text);
      }}
    />
  );
});
