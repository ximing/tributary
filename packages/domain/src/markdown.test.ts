import { describe, expect, it } from 'vitest';
import { toOutlineMarkdown, type MarkdownNode } from './markdown.js';

const nodes: MarkdownNode[] = [
  { id: 'a', parentId: null, question: '甲', reply: '答', note: null, sticker: 'star' },
  { id: 'b', parentId: 'a', question: '乙', reply: null, note: '记一下\n第二行' },
];

describe('toOutlineMarkdown', () => {
  it('keeps the whole conversation as a heading outline', () => {
    expect(toOutlineMarkdown('对话', nodes)).toBe(['# 对话', '', '## ★ 甲', '', '答', '', '### 乙', '', '> 记一下', '> 第二行', ''].join('\n'));
  });

  it('exports one branch with that node as the title', () => {
    expect(toOutlineMarkdown('对话', nodes, 'a')).toBe(['# ★ 甲', '', '答', '', '## 乙', '', '> 记一下', '> 第二行', ''].join('\n'));
    expect(toOutlineMarkdown('对话', nodes, 'b')).toBe(['# 乙', '', '> 记一下', '> 第二行', ''].join('\n'));
  });
});
