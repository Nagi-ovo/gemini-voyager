export function filterItemsBySelectedIds<T>(
  items: readonly T[],
  getId: (item: T) => string | null | undefined,
  selectedIds: ReadonlySet<string>,
): T[] {
  return items.filter((item) => {
    const id = getId(item);
    return typeof id === 'string' && id.length > 0 && selectedIds.has(id);
  });
}

export function selectBelowIds(allIds: readonly string[], startId: string): Set<string> {
  const startIndex = allIds.indexOf(startId);
  if (startIndex < 0) return new Set();

  const out = new Set<string>();
  for (let i = startIndex; i < allIds.length; i++) {
    out.add(allIds[i]);
  }
  return out;
}

export function findSelectionStartIdAtLine(
  items: readonly { id: string; top: number; bottom: number }[],
  lineY: number,
): string | null {
  for (const item of items) {
    if (item.top <= lineY && item.bottom > lineY) {
      return item.id;
    }
  }

  for (const item of items) {
    if (item.top > lineY) {
      return item.id;
    }
  }

  return null;
}

