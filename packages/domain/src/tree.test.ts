import { describe, expect, it } from 'vitest';
import { addNode, resolveParentId, setReply, toggleCollapsed, visibleNodes } from './tree.js';

describe('conversation tree', () => {
  it('a question node keeps its reply', () => {
    const created = addNode([], { id: 'q1', parentId: null, question: '什么是支流' });
    expect(created[0]?.reply).toBeNull();
    const withReply = setReply(created, 'q1', '一条可以分叉的对话');
    expect(withReply[0]).toMatchObject({
      id: 'q1',
      question: '什么是支流',
      reply: '一条可以分叉的对话',
    });
  });

  it('a follow-up parent is the selected node', () => {
    const root = addNode([], { id: 'root', parentId: null, question: '根问题' });
    const parentId = resolveParentId(root, 'child', 'root');
    const nodes = addNode(root, { id: 'child', parentId, question: '继续问' });
    expect(nodes.find((node) => node.id === 'child')?.parentId).toBe('root');
  });

  it('a same-level question shares the parent and is not a child', () => {
    let nodes = addNode([], { id: 'root', parentId: null, question: '根问题' });
    nodes = addNode(nodes, {
      id: 'child',
      parentId: resolveParentId(nodes, 'child', 'root'),
      question: '子问题',
    });
    const siblingParent = resolveParentId(nodes, 'sibling', 'child');
    nodes = addNode(nodes, { id: 'sibling', parentId: siblingParent, question: '同级问题' });
    const child = nodes.find((node) => node.id === 'child');
    const sibling = nodes.find((node) => node.id === 'sibling');
    expect(sibling?.parentId).toBe(child?.parentId);
    expect(sibling?.parentId).not.toBe('child');
    expect(nodes.some((node) => node.parentId === 'child')).toBe(false);
  });

  it('collapse hides descendants and expand restores them', () => {
    let nodes = addNode([], { id: 'root', parentId: null, question: '根' });
    nodes = addNode(nodes, { id: 'child', parentId: 'root', question: '子' });
    nodes = addNode(nodes, { id: 'grand', parentId: 'child', question: '孙' });
    const collapsed = toggleCollapsed(nodes, 'root');
    expect(collapsed.find((node) => node.id === 'root')?.collapsed).toBe(true);
    expect(visibleNodes(collapsed).map((node) => node.id)).toEqual(['root']);
    const expanded = toggleCollapsed(collapsed, 'root');
    expect(visibleNodes(expanded).map((node) => node.id)).toEqual(['root', 'child', 'grand']);
  });
});
