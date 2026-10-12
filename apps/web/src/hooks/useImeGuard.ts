import { useRef } from 'react';
import { imeOwnsKey, initialImeState } from '../lib/ime.js';

/** 把输入法组字状态接到 textarea 的 composition / keydown 上。 */
export function useImeGuard() {
  const state = useRef(initialImeState());

  return {
    onCompositionStart() {
      state.current = { ...state.current, composing: true };
    },
    onCompositionEnd(event: { timeStamp: number }) {
      state.current = { composing: false, compositionEndedAt: event.timeStamp };
    },
    /** 输入法还占用这个键时返回 true。调用方不要 preventDefault，也不要提交。 */
    owns(event: { key: string; timeStamp: number; nativeEvent: { isComposing: boolean; keyCode: number } }) {
      const decision = imeOwnsKey(
        {
          key: event.key,
          timeStamp: event.timeStamp,
          isComposing: event.nativeEvent.isComposing,
          keyCode: event.nativeEvent.keyCode,
        },
        state.current,
      );
      state.current = decision.state;
      return decision.owns;
    },
  };
}
