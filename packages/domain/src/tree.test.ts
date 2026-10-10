import { describe, expect, it } from 'vitest';
import {
  addNode,
  collapseToLevel,
  expandAncestors,
  findInTree,
  indentTarget,
  isSamePlace,
  linkOutline,
  moveNode,
  nodesInFocus,
  outdentTarget,
  outlineRows,
  parseOutline,
  planCopy,
  renameQuestion,
  resolveDrop,
  resolveParentId,
  restoreOrder,
  setAllCollapsed,
  setReply,
  siblingIndex,
  toggleCollapsed,
  visibleNodes,
} from './tree.js';

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

  it('renames a question and rejects an empty one', () => {
    const nodes = addNode([], { id: 'root', parentId: null, question: '旧问题' });
    expect(renameQuestion(nodes, 'root', '  新问题  ')[0]?.question).toBe('新问题');
    expect(() => renameQuestion(nodes, 'root', '   ')).toThrow('问题不能为空');
  });

  it('reorders siblings and reparents without entering its own subtree', () => {
    let nodes = addNode([], { id: 'root', parentId: null, question: '根' });
    nodes = addNode(nodes, { id: 'a', parentId: 'root', question: '甲' });
    nodes = addNode(nodes, { id: 'b', parentId: 'root', question: '乙' });
    nodes = addNode(nodes, { id: 'c', parentId: 'a', question: '丙' });
    expect(moveNode(nodes, 'b', 'root', 0).filter((node) => node.parentId === 'root').map((node) => node.id)).toEqual(['b', 'a']);
    const reparented = moveNode(nodes, 'b', 'a', 1);
    expect(reparented.find((node) => node.id === 'b')).toMatchObject({ parentId: 'a' });
    expect(reparented.filter((node) => node.parentId === 'a').map((node) => node.id)).toEqual(['c', 'b']);
    expect(() => moveNode(nodes, 'a', 'c', 0)).toThrow('不能移到自己的子分支里');
    expect(isSamePlace(nodes, 'b', 'root', 1)).toBe(true);
    expect(isSamePlace(nodes, 'b', 'root', 2)).toBe(true);
    expect(siblingIndex(nodes, 'a')).toBe(0);
  });

  it('copies a branch as siblings of the source root', () => {
    let nodes = addNode([], { id: 'root', parentId: null, question: '根' });
    nodes = addNode(nodes, { id: 'child', parentId: 'root', question: '子' });
    const plan = planCopy(nodes, 'root', ['root-2', 'child-2']);
    expect(plan).toEqual([
      { id: 'root-2', sourceId: 'root', parentId: null },
      { id: 'child-2', sourceId: 'child', parentId: 'root-2' },
    ]);
  });

  it('collapses to a level, expands ancestors, and can focus one branch', () => {
    let nodes = addNode([], { id: 'root', parentId: null, question: '根' });
    nodes = addNode(nodes, { id: 'child', parentId: 'root', question: '子' });
    nodes = addNode(nodes, { id: 'grand', parentId: 'child', question: '孙' });
    nodes = addNode(nodes, { id: 'other', parentId: null, question: '另一根' });
    const two = collapseToLevel(nodes, 2);
    expect(two.find((node) => node.id === 'root')?.collapsed).toBe(false);
    expect(two.find((node) => node.id === 'child')?.collapsed).toBe(true);
    expect(visibleNodes(two).map((node) => node.id)).toEqual(['root', 'child', 'other']);
    const opened = expandAncestors(collapseToLevel(nodes, 1), 'grand');
    expect(visibleNodes(opened).map((node) => node.id)).toEqual(['root', 'child', 'grand', 'other']);
    expect(nodesInFocus(nodes, 'child').map((node) => node.id)).toEqual(['child', 'grand']);
    expect(setAllCollapsed(nodes, true).every((node) => node.collapsed)).toBe(true);
    expect(outlineRows(two).map((row) => row.id)).toEqual(['root', 'child', 'other']);
  });

  it('resolves a drop into a sibling slot, a child, or a new root', () => {
    let nodes = addNode([], { id: 'root', parentId: null, question: '根' });
    nodes = addNode(nodes, { id: 'a', parentId: 'root', question: '甲' });
    nodes = addNode(nodes, { id: 'b', parentId: 'root', question: '乙' });
    expect(resolveDrop(nodes, 'b', { id: 'a', ratio: 0.1 })).toMatchObject({ parentId: 'root', index: 0, place: 'before' });
    expect(resolveDrop(nodes, 'b', { id: 'a', ratio: 0.5 })).toMatchObject({ parentId: 'a', index: 0, place: 'child' });
    expect(resolveDrop(nodes, 'a', 'pane')).toMatchObject({ parentId: null, index: 1, place: 'root' });
    expect(resolveDrop(nodes, 'root', { id: 'a', ratio: 0.5 })).toBeNull();
    expect(resolveDrop(nodes, 'b', null)).toBeNull();
  });

  it('restores one branch in sibling order and rejects a cycle', () => {
    const existing = [{ id: 'root', parentId: null }];
    const ordered = restoreOrder(existing, [
      { id: 'child', parentId: 'root', position: 0 },
      { id: 'late', parentId: 'child', position: 1 },
      { id: 'early', parentId: 'child', position: 0 },
    ]);
    expect(ordered.map((node) => node.id)).toEqual(['child', 'early', 'late']);
    expect(() =>
      restoreOrder(existing, [
        { id: 'a', parentId: 'b', position: 0 },
        { id: 'b', parentId: 'a', position: 0 },
      ]),
    ).toThrow('结构成环');
  });

  it('indents under the previous sibling and outdents beside the parent', () => {
    let nodes = addNode([], { id: 'root', parentId: null, question: '根' });
    nodes = addNode(nodes, { id: 'a', parentId: 'root', question: '甲' });
    nodes = addNode(nodes, { id: 'b', parentId: 'root', question: '乙' });
    nodes = addNode(nodes, { id: 'c', parentId: 'a', question: '丙' });
    expect(indentTarget(nodes, 'a')).toBeNull();
    expect(indentTarget(nodes, 'b')).toEqual({ parentId: 'a', index: 1 });
    expect(outdentTarget(nodes, 'c')).toEqual({ parentId: 'root', index: 1 });
    expect(outdentTarget(nodes, 'root')).toBeNull();
    const indented = moveNode(nodes, 'b', 'a', 1);
    expect(indented.filter((node) => node.parentId === 'a').map((node) => node.id)).toEqual(['c', 'b']);
    const outdented = moveNode(nodes, 'c', 'root', 1);
    expect(outdented.filter((node) => node.parentId === 'root').map((node) => node.id)).toEqual(['a', 'c', 'b']);
  });

  it('parses an indented list, markdown headings, and clamps a skipped level', () => {
    expect(parseOutline('- 甲\n  - 乙\n  - 丙\n- 丁')).toEqual([
      { question: '甲', depth: 0 },
      { question: '乙', depth: 1 },
      { question: '丙', depth: 1 },
      { question: '丁', depth: 0 },
    ]);
    expect(parseOutline('# 标题\n\n回答不该变成节点\n\n## 子问题')).toEqual([
      { question: '标题', depth: 0 },
      { question: '子问题', depth: 1 },
    ]);
    expect(parseOutline('- 甲\n    - 跳了两级')).toEqual([
      { question: '甲', depth: 0 },
      { question: '跳了两级', depth: 1 },
    ]);
    expect(parseOutline('   \n')).toEqual([]);
    expect(linkOutline(parseOutline('1. 甲\n2. 乙'))).toEqual([
      { question: '甲', parentIndex: null },
      { question: '乙', parentIndex: null },
    ]);
  });

  it('finds a buried reply in tree order', () => {
    let nodes = addNode([], { id: 'root', parentId: null, question: '根' });
    nodes = addNode(nodes, { id: 'a', parentId: 'root', question: '甲' });
    nodes = addNode(nodes, { id: 'b', parentId: 'a', question: '乙' });
    nodes = setReply(nodes, 'b', '这里有一个关键词');
    nodes = nodes.map((node) => (node.id === 'a' ? { ...node, collapsed: true } : node));
    expect(findInTree(nodes, '关键词')).toEqual(['b']);
    expect(findInTree(nodes, '   ')).toEqual([]);
    nodes = nodes.map((node) => (node.id === 'a' ? { ...node, note: '页边记着一句' } : node));
    expect(findInTree(nodes, '页边')).toEqual(['a']);
  });
});
