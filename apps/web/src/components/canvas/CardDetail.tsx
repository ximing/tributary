import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { observer, useService } from '@rabjs/react';
import { stickerOf } from '@tributary/domain';
import { CircleAlert, LoaderCircle, Square, X } from 'lucide-react';
import { MapService } from '../../workspace/map.service.js';
import { StreamService } from '../../workspace/stream.service.js';
import { AnswerBadge } from '../AnswerBadge.js';
import { NodeMarkdown } from './NodeMarkdown.js';
import { ThinkingBlock } from './ThinkingBlock.js';

/** 一张卡片的大窗：问题、思考和回答。生成过程中跟着往下滚。 */
export const CardDetail = observer(function CardDetail() {
  const map = useService(MapService);
  const streams = useService(StreamService);
  const id = map.detailId;
  const node = id ? map.nodes[id] : undefined;
  const bodyRef = useRef<HTMLDivElement>(null);
  const stick = useRef(true);
  const noteEditing = useRef(false);
  const markNoteEditing = useCallback((editing: boolean) => {
    noteEditing.current = editing;
  }, []);

  useEffect(() => {
    if (!id) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      const target = event.target;
      if (target instanceof HTMLElement) {
        const tag = target.tagName;
        if (tag === 'TEXTAREA' || tag === 'INPUT' || target.isContentEditable) return;
      }
      event.preventDefault();
      event.stopPropagation();
      map.closeDetail();
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [id, map]);

  const live = id ? streams.streaming[id] : undefined;
  const reply = live ? live.reply : (node?.reply ?? '');
  const thinking = live ? live.thinking : (node?.thinking ?? '');
  const streaming = live !== undefined;

  useEffect(() => {
    const host = bodyRef.current;
    if (host) host.scrollTop = 0;
    // 设 scrollTop 会同步触发 onScroll，可能把跟随关掉。打开新卡片时重新跟上。
    stick.current = true;
  }, [id]);

  useEffect(() => {
    const host = bodyRef.current;
    if (!host || !streaming || !stick.current || noteEditing.current) return;
    host.scrollTop = host.scrollHeight;
  }, [reply, thinking, streaming]);

  if (!id || !node) return null;
  const sticker = stickerOf(node.sticker);
  const waiting = (node.status === 'pending' || streaming) && !reply && !thinking;
  const isError = node.status === 'error';

  return createPortal(
    <div className="detail-overlay" onClick={() => map.closeDetail()}>
      <article
        className="detail-panel"
        role="dialog"
        aria-modal="true"
        aria-label="卡片详情"
        onClick={(event) => event.stopPropagation()}
      >
        <header className="detail-head">
          <div className="detail-actions">
            {node.status === 'pending' || streaming ? (
              <button
                type="button"
                className="node-stop"
                onClick={() => {
                  void map.stopNode(id);
                }}
              >
                <Square size={10} aria-hidden />
                停止
              </button>
            ) : null}
            <button type="button" className="detail-close" onClick={() => map.closeDetail()}>
              <X size={16} aria-hidden />
              关闭
            </button>
          </div>
        </header>
        <div
          ref={bodyRef}
          className="detail-body"
          onScroll={(event) => {
            const host = event.currentTarget;
            stick.current = host.scrollHeight - host.scrollTop - host.clientHeight < 64;
          }}
        >
          <div className="detail-question">
            <h2>
              {sticker ? <span className="node-sticker">{sticker.mark}</span> : null}
              {node.question}
            </h2>
            {node.model ? <AnswerBadge providerId={node.providerId} model={node.model} /> : null}
          </div>
          <DetailNote key={id} id={id} note={node.note} onEditing={markNoteEditing} />
          {waiting ? (
            <p className="detail-wait">
              <LoaderCircle className="spin" size={14} aria-hidden />
              思考中…
            </p>
          ) : null}
          <ThinkingBlock text={thinking} live={streaming && Boolean(thinking)} roomy />
          {reply && !isError ? (
            <div className="detail-reply">
              {streaming ? (
                <p className="stream-tag">
                  <LoaderCircle className="spin" size={11} aria-hidden />
                  回答中
                </p>
              ) : null}
              <NodeMarkdown text={reply} />
              {streaming ? <span className="node-cursor" /> : null}
            </div>
          ) : null}
          {isError ? (
            <div className="node-error">
              <CircleAlert size={14} aria-hidden />
              <p>{streams.streamErrors[id] ?? node.reply ?? '模型调用失败'}</p>
            </div>
          ) : null}
          {!waiting && !reply && !isError && !streaming ? <p className="detail-wait">还没有回答</p> : null}
        </div>
      </article>
    </div>,
    document.body,
  );
});

/** 详情里的笔记：点开编辑，失焦或 ⌘ Enter 保存。Escape 只退出编辑，不关弹窗。 */
const DetailNote = observer(function DetailNote({
  id,
  note,
  onEditing,
}: {
  id: string;
  note: string | null;
  onEditing: (editing: boolean) => void;
}) {
  const map = useService(MapService);
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(note ?? '');
  const skipBlur = useRef(false);

  useEffect(() => {
    onEditing(editing);
    return () => onEditing(false);
  }, [editing, onEditing]);

  useEffect(() => {
    if (!editing) setText(note ?? '');
  }, [note, editing]);

  const stop = () => {
    onEditing(false);
    setEditing(false);
  };

  if (!editing) {
    if (!note) {
      return (
        <button
          type="button"
          className="detail-note-start"
          onClick={() => {
            onEditing(true);
            setEditing(true);
          }}
        >
          写笔记
        </button>
      );
    }
    return (
      <button
        type="button"
        className="detail-note"
        title="点击编辑笔记"
        onClick={() => {
          onEditing(true);
          setEditing(true);
        }}
      >
        <span>笔记</span>
        {note}
      </button>
    );
  }

  return (
    <div className="detail-note-edit">
      <span>笔记</span>
      <textarea
        className="detail-note-input"
        aria-label="笔记"
        autoFocus
        rows={Math.min(10, Math.max(4, text.split('\n').length))}
        value={text}
        placeholder="写给自己的笔记，不会发给模型"
        onChange={(event) => setText(event.target.value)}
        onKeyDown={(event) => {
          event.stopPropagation();
          if (event.key === 'Escape') {
            event.preventDefault();
            skipBlur.current = true;
            setText(note ?? '');
            stop();
            return;
          }
          if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
            event.preventDefault();
            skipBlur.current = true;
            void map.saveNote(id, text);
            stop();
          }
        }}
        onBlur={() => {
          if (skipBlur.current) {
            skipBlur.current = false;
            return;
          }
          void map.saveNote(id, text);
          stop();
        }}
      />
    </div>
  );
});
