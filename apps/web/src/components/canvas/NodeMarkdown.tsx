import { memo } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

/** 回复的 markdown 渲染（仅在展开/流式时挂载，组件化输出天然免 XSS） */
export const NodeMarkdown = memo(function NodeMarkdown({ text }: { text: string }) {
  return (
    <div className="markdown">
      <ReactMarkdown remarkPlugins={[remarkGfm]}>{text}</ReactMarkdown>
    </div>
  );
});
