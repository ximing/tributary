export interface DraftText {
  reply: string;
  thinking: string;
}

const OPEN_TAGS = ['<think>', '<thinking>'] as const;

function closeTag(open: (typeof OPEN_TAGS)[number]): string {
  return open === '<think>' ? '</think>' : '</thinking>';
}

/**
 * 有些兼容接口把思考写进正文的 think 标签，而不是单独的 reasoning 字段。
 * 未闭合的标签算正在思考，正文先不要带上这段。
 */
export function peelThinkTags(text: string): DraftText {
  const thoughts: string[] = [];
  let reply = '';
  let cursor = 0;
  let found = false;
  while (cursor < text.length) {
    let openAt = -1;
    let openTag: (typeof OPEN_TAGS)[number] | null = null;
    for (const tag of OPEN_TAGS) {
      const at = text.indexOf(tag, cursor);
      if (at !== -1 && (openAt === -1 || at < openAt)) {
        openAt = at;
        openTag = tag;
      }
    }
    if (openAt === -1 || !openTag) {
      reply += text.slice(cursor);
      break;
    }
    found = true;
    reply += text.slice(cursor, openAt);
    const end = openAt + openTag.length;
    const close = closeTag(openTag);
    const closeAt = text.indexOf(close, end);
    if (closeAt === -1) {
      thoughts.push(text.slice(end));
      break;
    }
    thoughts.push(text.slice(end, closeAt));
    cursor = closeAt + close.length;
  }
  if (!found) return { reply: text, thinking: '' };
  return {
    reply: reply.trim(),
    thinking: thoughts
      .map((item) => item.trim())
      .filter((item) => item.length > 0)
      .join('\n\n'),
  };
}

/** 事件里的思考和正文标签里的思考合成一份。正文不再露出标签。 */
export function visibleDraft(state: DraftText): DraftText {
  const peeled = peelThinkTags(state.reply);
  const fromEvents = state.thinking.trim();
  const fromTags = peeled.thinking.trim();
  let thinking = fromEvents;
  if (fromTags && fromTags !== fromEvents && !fromEvents.includes(fromTags)) {
    thinking = fromEvents ? `${fromEvents}\n\n${fromTags}` : fromTags;
  }
  const reply = fromTags || fromEvents ? peeled.reply : state.reply;
  return { reply, thinking };
}

/** pi-ai 的增量。text_end / thinking_end 是单块全文，不能拿来覆盖已经拼好的多块内容。 */
export function absorbPiDelta(state: DraftText, event: { type: string; delta?: string }): DraftText {
  if (event.type === 'text_delta' && event.delta) return { reply: state.reply + event.delta, thinking: state.thinking };
  if (event.type === 'thinking_delta' && event.delta) return { reply: state.reply, thinking: state.thinking + event.delta };
  return state;
}
