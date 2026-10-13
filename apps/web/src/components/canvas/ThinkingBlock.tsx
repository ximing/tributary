import { useEffect, useRef } from 'react';
import { LoaderCircle } from 'lucide-react';

/** 思考过程。生成中摊开并跟着滚；结束后收成一行，点开再看。 */
export function ThinkingBlock({
  text,
  live,
  roomy = false,
  startOpen = false,
}: {
  text: string;
  live: boolean;
  roomy?: boolean;
  /** 结束后先摊开。详情不传，保持收起。 */
  startOpen?: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const host = ref.current;
    if (!host || !live) return;
    host.scrollTop = host.scrollHeight;
  }, [text, live]);

  if (!text) return null;
  if (live) {
    return (
      <div className={`node-think is-live${roomy ? ' is-roomy' : ''}`}>
        <p className="stream-tag">
          <LoaderCircle className="spin" size={11} aria-hidden />
          思考中
        </p>
        <div ref={ref} className="node-think-body">
          {text}
          <span className="node-cursor" />
        </div>
      </div>
    );
  }
  return (
    <details
      className={`node-think${roomy ? ' is-roomy' : ''}`}
      ref={
        startOpen
          ? (node) => {
              if (node && node.dataset.opened !== '1') {
                node.open = true;
                node.dataset.opened = '1';
              }
            }
          : undefined
      }
    >
      <summary>思考</summary>
      <div className="node-think-body">{text}</div>
    </details>
  );
}
