export interface NamedPrompt {
  id: string;
  name?: string;
}

/** Returns the normalized name stored by Prompt Manager. */
export function normalizePromptName(value: string): string | null {
  const name = value.trim();
  return name ? name : null;
}

export function getPromptNameComparisonKey(value: string): string {
  return value.trim().normalize('NFKC').toLowerCase();
}

/**
 * Checks whether a prompt name is already used.
 *
 * When editing a legacy member of an existing duplicate-name group, keeping
 * that same semantic name is allowed. A real rename must still be unique.
 */
export function isPromptNameTaken(
  items: readonly NamedPrompt[],
  candidate: string,
  editingId?: string | null,
): boolean {
  const candidateKey = getPromptNameComparisonKey(candidate);
  const editingItem = editingId ? items.find((item) => item.id === editingId) : undefined;
  if (
    editingItem &&
    typeof editingItem.name === 'string' &&
    getPromptNameComparisonKey(editingItem.name) === candidateKey
  ) {
    return false;
  }

  return items.some(
    (item) =>
      item.id !== editingId &&
      typeof item.name === 'string' &&
      getPromptNameComparisonKey(item.name) === candidateKey,
  );
}
