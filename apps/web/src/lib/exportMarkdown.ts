import { toOutlineMarkdown } from '@tributary/domain';
import type { ConversationNode } from '../api/client.js';

/** 整棵树，或 rootId 那一枝，导出为 Markdown 大纲。 */
export function conversationToMarkdown(
  title: string,
  nodes: Record<string, ConversationNode>,
  nodeOrder: string[],
  rootId?: string | null,
): string {
  const list = nodeOrder.flatMap((id) => {
    const node = nodes[id];
    return node ? [node] : [];
  });
  return toOutlineMarkdown(title, list, rootId);
}

export function downloadMarkdown(title: string, content: string): void {
  const blob = new Blob([content], { type: 'text/markdown;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = `${title.replace(/[\\/:*?"<>|]/g, '_') || '支流对话'}.md`;
  anchor.click();
  URL.revokeObjectURL(url);
}
