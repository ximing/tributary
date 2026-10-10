import { describe, expect, it } from 'vitest';
import { messagesForNode, type LineageNode } from './context.js';

function node(partial: Pick<LineageNode, 'id' | 'parentId' | 'question'> & Partial<LineageNode>): LineageNode {
  return {
    reply: null,
    status: 'done',
    ...partial,
  };
}

describe('messagesForNode', () => {
  it('sends only the current question for a root node', () => {
    const root = node({ id: 'root', parentId: null, question: '根问题', reply: null, status: 'pending' });
    expect(messagesForNode([root], 'root')).toEqual([{ role: 'user', content: '根问题' }]);
  });

  it('turns each finished ancestor into a user and assistant pair, root first', () => {
    const root = node({ id: 'root', parentId: null, question: '根问题', reply: '根回复' });
    const child = node({ id: 'child', parentId: 'root', question: '追问', reply: '追问回复' });
    const current = node({ id: 'leaf', parentId: 'child', question: '现在', reply: '不该带上', status: 'pending' });
    expect(messagesForNode([current, root, child], 'leaf')).toEqual([
      { role: 'user', content: '根问题' },
      { role: 'assistant', content: '根回复' },
      { role: 'user', content: '追问' },
      { role: 'assistant', content: '追问回复' },
      { role: 'user', content: '现在' },
    ]);
  });

  it('keeps the question and drops the reply when an ancestor failed, is pending, or has an empty reply', () => {
    const root = node({ id: 'root', parentId: null, question: '根问题', reply: '根回复' });
    const failed = node({ id: 'failed', parentId: 'root', question: '失败的问题', reply: '模型调用失败', status: 'error' });
    const pending = node({ id: 'pending', parentId: 'failed', question: '还在生成', reply: '半截', status: 'pending' });
    const empty = node({ id: 'empty', parentId: 'pending', question: '空回复', reply: '  ' });
    const current = node({ id: 'leaf', parentId: 'empty', question: '现在', status: 'pending' });
    expect(messagesForNode([root, failed, pending, empty, current], 'leaf')).toEqual([
      { role: 'user', content: '根问题' },
      { role: 'assistant', content: '根回复' },
      { role: 'user', content: '失败的问题\n\n还在生成\n\n空回复\n\n现在' },
    ]);
  });

  it('leaves sibling branches out of the list', () => {
    const root = node({ id: 'root', parentId: null, question: '根问题', reply: '根回复' });
    const sibling = node({ id: 'sibling', parentId: 'root', question: '另一支', reply: '另一支回复' });
    const current = node({ id: 'leaf', parentId: 'root', question: '这一支', status: 'pending' });
    expect(messagesForNode([root, sibling, current], 'leaf')).toEqual([
      { role: 'user', content: '根问题' },
      { role: 'assistant', content: '根回复' },
      { role: 'user', content: '这一支' },
    ]);
  });

  it('stops at a missing parent and does not loop on a cycle', () => {
    const current = node({ id: 'leaf', parentId: 'gone', question: '现在', status: 'pending' });
    expect(messagesForNode([current], 'leaf')).toEqual([{ role: 'user', content: '现在' }]);

    const a = node({ id: 'a', parentId: 'b', question: '甲', reply: '甲回复' });
    const b = node({ id: 'b', parentId: 'a', question: '乙', reply: '乙回复' });
    expect(messagesForNode([a, b], 'a')).toEqual([
      { role: 'user', content: '乙' },
      { role: 'assistant', content: '乙回复' },
      { role: 'user', content: '甲' },
    ]);
  });
});
