export interface LineageNode {
  id: string;
  parentId: string | null;
  question: string;
  reply: string | null;
  status: string;
}

export interface ModelMessage {
  role: 'user' | 'assistant';
  content: string;
}

/**
 * 从根排到当前节点。已完成且回复非空的祖先是 user + assistant；
 * 失败、生成中或回复为空时只留问题。相邻的 user 并成一条，保证角色交替。
 * 只走父链，兄弟分支不进入。当前节点的回复不进入，它就是待回答的问题。
 */
export function messagesForNode(nodes: readonly LineageNode[], currentId: string): ModelMessage[] {
  const byId = new Map(nodes.map((node) => [node.id, node]));
  const chain: LineageNode[] = [];
  const seen = new Set<string>();
  let cursor = byId.get(currentId);
  while (cursor && !seen.has(cursor.id)) {
    seen.add(cursor.id);
    chain.push(cursor);
    cursor = cursor.parentId ? byId.get(cursor.parentId) : undefined;
  }
  chain.reverse();

  const messages: ModelMessage[] = [];
  for (const node of chain) {
    const question = node.question.trim();
    if (!question) continue;
    const last = messages.at(-1);
    if (last?.role === 'user') last.content = `${last.content}\n\n${question}`;
    else messages.push({ role: 'user', content: question });
    if (node.id === currentId) continue;
    const reply = node.status === 'done' ? (node.reply?.trim() ?? '') : '';
    if (reply) messages.push({ role: 'assistant', content: reply });
  }
  return messages;
}
