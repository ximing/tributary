import { useEffect } from 'react';
import { observer, useService } from '@rabjs/react';
import { stickerOf } from '@tributary/domain';
import { slideIds } from '../../workspace/map-model.js';
import { MapService } from '../../workspace/map.service.js';
import { StreamService } from '../../workspace/stream.service.js';
import { AnswerBadge } from '../AnswerBadge.js';
import { NodeMarkdown } from './NodeMarkdown.js';
import { ThinkingBlock } from './ThinkingBlock.js';

/** 按树的前序，一张卡片一页。只看这一枝时，只演示这一枝。 */
export const PresentMode = observer(function PresentMode() {
  const map = useService(MapService);
  const streams = useService(StreamService);
  const presentId = map.presentId;
  const node = presentId ? map.nodes[presentId] : undefined;
  const order = slideIds(map);
  const at = presentId ? order.indexOf(presentId) : 0;
  const index = at < 0 ? 0 : at;
  const total = order.length;

  useEffect(() => {
    if (!presentId) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        map.closePresent();
        return;
      }
      if (event.key === 'ArrowRight' || event.key === 'ArrowDown' || event.key === 'PageDown' || event.key === ' ') {
        event.preventDefault();
        map.stepPresent(1);
        return;
      }
      if (event.key === 'ArrowLeft' || event.key === 'ArrowUp' || event.key === 'PageUp') {
        event.preventDefault();
        map.stepPresent(-1);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [presentId, map]);

  if (!presentId || !node) return null;
  const sticker = stickerOf(node.sticker);
  const live = streams.streaming[presentId];
  const reply = live ? live.reply : (node.reply ?? '');
  const thinking = live ? live.thinking : (node.thinking ?? '');
  const streaming = live !== undefined;

  return (
    <div className="present" role="dialog" aria-label="演示">
      <header>
        <span>
          {index + 1} / {total}
          {map.focusId ? ' · 这一枝' : ''}
        </span>
        <button type="button" onClick={() => map.closePresent()}>
          退出
        </button>
      </header>
      <article>
        <h1>
          {sticker ? <span className="node-sticker">{sticker.mark}</span> : null}
          {node.question}
        </h1>
        {node.model ? <AnswerBadge providerId={node.providerId} model={node.model} className="present-model" /> : null}
        {node.note ? (
          <blockquote className="present-note">
            <span>笔记</span>
            {node.note}
          </blockquote>
        ) : null}
        <ThinkingBlock text={node.status === 'error' ? (node.thinking ?? '') : thinking} live={streaming && Boolean(thinking)} roomy />
        {node.status === 'error' ? (
          <p className="present-empty">{node.reply ?? '没有回答'}</p>
        ) : reply ? (
          <NodeMarkdown text={reply} />
        ) : thinking ? null : (
          <p className="present-empty">{node.status === 'pending' || streaming ? '还在生成' : '还没有回答'}</p>
        )}
      </article>
      <footer>
        <button type="button" disabled={index <= 0} onClick={() => map.stepPresent(-1)}>
          上一张
        </button>
        <button type="button" disabled={index >= total - 1} onClick={() => map.stepPresent(1)}>
          下一张
        </button>
      </footer>
    </div>
  );
});
