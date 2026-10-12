/**
 * 中文输入法组字、选词时的按键判断。
 * Enter 在这段时间里只确认候选，不能拿去提交问题。
 */

/** compositionend 之后，紧跟着的那一次 Enter 仍属于刚才的选词。 */
export const IME_GHOST_ENTER_MS = 80;

export interface ImeKey {
  key: string;
  isComposing: boolean;
  keyCode: number;
  timeStamp: number;
}

export interface ImeState {
  composing: boolean;
  /** compositionend 的 timeStamp。-1 表示没有待消化的选词回车。 */
  compositionEndedAt: number;
}

export function initialImeState(): ImeState {
  return { composing: false, compositionEndedAt: -1 };
}

/**
 * 这次按键是否还属于输入法。
 * 组字中的任意键都算，包括 Esc。选词结束后只拦紧随的那一次 Enter。
 * 消化掉这次判断后，状态里的 compositionEndedAt 会被清掉。
 */
export function imeOwnsKey(event: ImeKey, state: ImeState): { owns: boolean; state: ImeState } {
  if (state.composing || event.isComposing || event.keyCode === 229 || event.key === 'Process') {
    return { owns: true, state };
  }
  const sinceEnd = event.timeStamp - state.compositionEndedAt;
  const ghost =
    state.compositionEndedAt >= 0 && sinceEnd >= 0 && sinceEnd < IME_GHOST_ENTER_MS;
  if (!ghost) return { owns: false, state };
  return { owns: event.key === 'Enter', state: { ...state, compositionEndedAt: -1 } };
}
