import type { ConversationNode } from '../api/client.js';

/** 整棵树导出为 Markdown 大纲：标题层级 = 树深度（最深 H6），回答原文跟在其后 */
export function conversationToMarkdown(
  title: string,
  nodes: Record<string, ConversationNode>,
  nodeOrder: string[],
): string {
  const childrenOf = new Map<string | null, ConversationNode[]>();
  for (const id of nodeOrder) {
    const node = nodes[id];
    if (!node) continue;
    const list = childrenOf.get(node.parentId) ?? [];
    list.push(node);
    childrenOf.set(node.parentId, list);
  }
  const lines: string[] = [`# ${title}`, ''];
  const walk = (parentId: string | null, depth: number) => {
    for (const node of childrenOf.get(parentId) ?? []) {
      const heading = '#'.repeat(Math.min(depth + 1, 6));
      lines.push(`${heading} ${node.question}`, '');
      if (node.reply) lines.push(node.reply, '');
      walk(node.id, depth + 1);
    }
  };
  walk(null, 1);
  return lines.join('\n');
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
