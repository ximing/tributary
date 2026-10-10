export function selectionAfterLoad(epochAtStart: number, epochNow: number, requestedId: string | null, currentId: string | null): string | null {
  if (epochNow !== epochAtStart) return currentId;
  return requestedId;
}
