import type { ConversationNode } from '../api/client.js';

export interface HistoryLink {
  sourceId: string;
  targetId: string;
}

export interface CollapseChange {
  id: string;
  collapsed: boolean;
}

export type MapOp =
  | { type: 'rename'; id: string; question: string }
  | { type: 'move'; id: string; parentId: string | null; index: number }
  | { type: 'remove'; id: string }
  | { type: 'removeMany'; ids: string[] }
  | { type: 'restore'; nodes: ConversationNode[]; links?: HistoryLink[] }
  | { type: 'restoreMany'; groups: ConversationNode[][] }
  | { type: 'collapse'; changes: CollapseChange[] }
  | { type: 'note'; id: string; note: string | null }
  | { type: 'sticker'; id: string; sticker: string | null }
  | { type: 'link'; sourceId: string; targetId: string; present: boolean };

export interface HistoryEntry {
  undo: MapOp;
  redo: MapOp;
}

const LIMIT = 50;

export function pushHistory(stack: readonly HistoryEntry[], entry: HistoryEntry): HistoryEntry[] {
  const next = [...stack, entry];
  return next.length > LIMIT ? next.slice(next.length - LIMIT) : next;
}
