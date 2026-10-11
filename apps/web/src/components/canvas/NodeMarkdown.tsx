import { memo } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

/** 回复的 markdown。卡片摘要和全文都用它，避免摘要里露出标记。 */
export const NodeMarkdown = memo(function NodeMarkdown({ text }: { text: string }) {
  return (
    <div className="markdown">
      <ReactMarkdown remarkPlugins={[remarkGfm]}>{text}</ReactMarkdown>
    </div>
  );
});
