import { describe, expect, it } from 'vitest';
import { absorbPiDelta, peelThinkTags, visibleDraft } from './draft-text.js';

describe('peelThinkTags', () => {
  it('leaves ordinary text alone', () => {
    expect(peelThinkTags('直接回答')).toEqual({ reply: '直接回答', thinking: '' });
  });

  it('keeps an open think tag out of the reply', () => {
    expect(peelThinkTags('<think>先想一下')).toEqual({ reply: '', thinking: '先想一下' });
  });

  it('splits a finished think tag from the answer', () => {
    expect(peelThinkTags('<think>先想一下</think>\n\n答案在这')).toEqual({
      reply: '答案在这',
      thinking: '先想一下',
    });
  });

  it('joins more than one thinking block', () => {
    expect(peelThinkTags('<thinking>甲</thinking>中段<think>乙</think>尾')).toEqual({
      reply: '中段尾',
      thinking: '甲\n\n乙',
    });
  });
});

describe('visibleDraft', () => {
  it('prefers the reasoning channel and still hides tags in the reply', () => {
    expect(visibleDraft({ reply: '<think>标签</think>答案', thinking: '通道里的思考' })).toEqual({
      reply: '答案',
      thinking: '通道里的思考\n\n标签',
    });
  });

  it('does not duplicate thinking that already arrived on the reasoning channel', () => {
    expect(visibleDraft({ reply: '答案', thinking: '只在通道里' })).toEqual({
      reply: '答案',
      thinking: '只在通道里',
    });
  });
});

describe('absorbPiDelta', () => {
  it('appends text and thinking separately', () => {
    const thought = absorbPiDelta({ reply: '', thinking: '' }, { type: 'thinking_delta', delta: '想' });
    const both = absorbPiDelta(thought, { type: 'text_delta', delta: '答' });
    expect(both).toEqual({ reply: '答', thinking: '想' });
  });

  it('ignores block end events', () => {
    const state = { reply: '答', thinking: '想' };
    expect(absorbPiDelta(state, { type: 'thinking_end', delta: '想完了' })).toBe(state);
  });
});
