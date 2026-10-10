import { stickerOf } from './stickers.js';

export interface MarkdownNode {
  id: string;
  parentId: string | null;
  question: string;
  reply: string | null;
  note?: string | null;
  sticker?: string | null;
}

/**
 * 整棵树：一级标题是对话名，根问题从二级标题开始。
 * 传入 rootId 时只导出那一枝：一级标题就是这个节点，子节点从二级标题开始。
 */
export function toOutlineMarkdown(title: string, nodes: readonly MarkdownNode[], rootId?: string | null): string {
  const children = new Map<string | null, MarkdownNode[]>();
  const ids = new Set(nodes.map((node) => node.id));
  for (const node of nodes) {
    const parentId = node.parentId !== null && ids.has(node.parentId) ? node.parentId : null;
    const list = children.get(parentId) ?? [];
    list.push(node);
    children.set(parentId, list);
  }
  const lines: string[] = [];
  const pushBody = (node: MarkdownNode) => {
    const note = node.note?.trim();
    if (note) {
      for (const line of note.split('\n')) lines.push(`> ${line}`);
      lines.push('');
    }
    if (node.reply) lines.push(node.reply, '');
  };
  const headingOf = (node: MarkdownNode, depth: number) => {
    const heading = '#'.repeat(Math.min(depth + 1, 6));
    const mark = stickerOf(node.sticker);
    return `${heading} ${mark ? `${mark.mark} ` : ''}${node.question}`;
  };
  const walk = (parentId: string | null, depth: number) => {
    for (const node of children.get(parentId) ?? []) {
      lines.push(headingOf(node, depth), '');
      pushBody(node);
      walk(node.id, depth + 1);
    }
  };

  const root = rootId ? nodes.find((node) => node.id === rootId) : undefined;
  if (rootId && !root) return [`# ${title}`, ''].join('\n');
  if (root) {
    const mark = stickerOf(root.sticker);
    lines.push(`# ${mark ? `${mark.mark} ` : ''}${root.question}`, '');
    pushBody(root);
    walk(root.id, 1);
    return lines.join('\n');
  }
  lines.push(`# ${title}`, '');
  walk(null, 1);
  return lines.join('\n');
}
