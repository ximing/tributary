import { useState } from 'react';
import { observer, useService } from '@rabjs/react';
import { SendHorizontal } from 'lucide-react';
import { useImeGuard } from '../../hooks/useImeGuard.js';
import { MapService } from '../../workspace/map.service.js';
import { ModelChip } from '../ModelChip.js';

/** 空对话时画布中央的第一问。输入框里的字在提交前留在组件里。 */
export const EmptyHero = observer(function EmptyHero() {
  const map = useService(MapService);
  const ime = useImeGuard();
  const [text, setText] = useState('');

  const ask = () => {
    const value = text.trim();
    if (!value) return;
    void map.submit(value).then(() => setText(''));
  };

  return (
    <div className="hero">
      <p className="mark">支</p>
      <h2>从一个问题开始</h2>
      <p className="sub">每个回答都能继续分叉，长成一棵树</p>
      <div className="hero-input">
        <textarea
          rows={2}
          aria-label="第一个问题"
          placeholder="输入你的问题…"
          value={text}
          onChange={(event) => setText(event.target.value)}
          onCompositionStart={ime.onCompositionStart}
          onCompositionEnd={ime.onCompositionEnd}
          onKeyDown={(event) => {
            if (ime.owns(event)) return;
            if (event.key === 'Enter' && !event.shiftKey) {
              event.preventDefault();
              ask();
            }
          }}
        />
        <button type="button" className="send-btn" aria-label="提问" disabled={!text.trim()} onClick={ask}>
          <SendHorizontal size={13} aria-hidden />
        </button>
      </div>
      <div className="hero-foot">
        <ModelChip />
        <span className="tip">
          <kbd>⏎</kbd> 提问 · 双击画板也可以
        </span>
      </div>
    </div>
  );
});
