export const STICKERS = [
  { id: 'star', label: '星标', mark: '★' },
  { id: 'flag', label: '标记', mark: '⚑' },
  { id: 'question', label: '疑问', mark: '?' },
  { id: 'idea', label: '想法', mark: '✦' },
  { id: 'check', label: '完成', mark: '✓' },
  { id: 'warn', label: '注意', mark: '!' },
] as const;

export type StickerId = (typeof STICKERS)[number]['id'];

const IDS = new Set<string>(STICKERS.map((item) => item.id));

export function isStickerId(value: string): value is StickerId {
  return IDS.has(value);
}

export function stickerOf(id: string | null | undefined): (typeof STICKERS)[number] | null {
  return STICKERS.find((item) => item.id === id) ?? null;
}
