export function splitHighlight(text: string, query: string): { text: string; hit: boolean }[] {
  const needle = query.trim();
  if (!needle) return [{ text, hit: false }];
  const lower = text.toLowerCase();
  const target = needle.toLowerCase();
  const parts: { text: string; hit: boolean }[] = [];
  let cursor = 0;
  while (cursor < text.length) {
    const at = lower.indexOf(target, cursor);
    if (at < 0) {
      parts.push({ text: text.slice(cursor), hit: false });
      break;
    }
    if (at > cursor) parts.push({ text: text.slice(cursor, at), hit: false });
    parts.push({ text: text.slice(at, at + target.length), hit: true });
    cursor = at + target.length;
  }
  return parts.filter((part) => part.text.length > 0);
}

function clearMarks(root: HTMLElement): void {
  for (const mark of [...root.querySelectorAll('mark.find-hit')]) {
    const parent = mark.parentNode;
    if (!parent) continue;
    parent.replaceChild(document.createTextNode(mark.textContent ?? ''), mark);
    parent.normalize();
  }
}

/** 在已经渲染出来的回答里标出命中。下一次 React 绘制会盖掉，所以要在绘制之后再调。 */
export function markElement(root: HTMLElement, query: string): void {
  clearMarks(root);
  const needle = query.trim().toLowerCase();
  if (!needle) return;
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  const textNodes: Text[] = [];
  while (walker.nextNode()) {
    const current = walker.currentNode;
    if (current instanceof Text) textNodes.push(current);
  }
  for (const textNode of textNodes) {
    const value = textNode.nodeValue ?? '';
    const lower = value.toLowerCase();
    if (!lower.includes(needle)) continue;
    const fragment = document.createDocumentFragment();
    let cursor = 0;
    while (cursor < value.length) {
      const at = lower.indexOf(needle, cursor);
      if (at < 0) {
        fragment.append(value.slice(cursor));
        break;
      }
      if (at > cursor) fragment.append(value.slice(cursor, at));
      const mark = document.createElement('mark');
      mark.className = 'find-hit';
      mark.textContent = value.slice(at, at + needle.length);
      fragment.append(mark);
      cursor = at + needle.length;
    }
    textNode.replaceWith(fragment);
  }
  root.querySelector('mark.find-hit')?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
}
