import { useEffect } from 'react';
import { stickerOf } from '@tributary/domain';
import { slideIds, useWorkspace } from '../../store/workspace.js';
import { NodeMarkdown } from './NodeMarkdown.js';

/** 按树的前序，一张卡片一页。只看这一枝时，只演示这一枝。 */
export function PresentMode() {
  const presentId = useWorkspace((state) => state.presentId);
  const node = useWorkspace((state) => (presentId ? state.nodes[presentId] : undefined));
  const focusId = useWorkspace((state) => state.focusId);
  const closePresent = useWorkspace((state) => state.closePresent);
  const stepPresent = useWorkspace((state) => state.stepPresent);
  const index = useWorkspace((state) => {
    if (!state.presentId) return 0;
    const at = slideIds(state).indexOf(state.presentId);
    return at < 0 ? 0 : at;
  });
  const total = useWorkspace((state) => slideIds(state).length);

  useEffect(() => {
    if (!presentId) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        closePresent();
        return;
      }
      if (event.key === 'ArrowRight' || event.key === 'ArrowDown' || event.key === 'PageDown' || event.key === ' ') {
        event.preventDefault();
        stepPresent(1);
        return;
      }
      if (event.key === 'ArrowLeft' || event.key === 'ArrowUp' || event.key === 'PageUp') {
        event.preventDefault();
        stepPresent(-1);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [presentId, closePresent, stepPresent]);

  if (!presentId || !node) return null;
  const sticker = stickerOf(node.sticker);

  return (
    <div className="present" role="dialog" aria-label="演示">
      <header>
        <span>
          {index + 1} / {total}
          {focusId ? ' · 这一枝' : ''}
        </span>
        <button type="button" onClick={() => closePresent()}>
          退出
        </button>
      </header>
      <article>
        <h1>
          {sticker ? <span className="node-sticker">{sticker.mark}</span> : null}
          {node.question}
        </h1>
        {node.note ? (
          <blockquote className="present-note">
            <span>笔记</span>
            {node.note}
          </blockquote>
        ) : null}
        {node.reply && node.status !== 'error' ? (
          <NodeMarkdown text={node.reply} />
        ) : (
          <p className="present-empty">{node.status === 'error' ? (node.reply ?? '没有回答') : node.status === 'pending' ? '还在生成' : '还没有回答'}</p>
        )}
      </article>
      <footer>
        <button type="button" disabled={index <= 0} onClick={() => stepPresent(-1)}>
          上一张
        </button>
        <button type="button" disabled={index >= total - 1} onClick={() => stepPresent(1)}>
          下一张
        </button>
      </footer>
    </div>
  );
}
