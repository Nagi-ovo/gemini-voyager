/** Returns the normalized name used by Prompt Manager and slash completion. */
export function normalizePromptName(value: string): string | null {
  const name = value.trim();
  return name ? name : null;
}

function getPromptNameComparisonKey(value: string): string {
  return value.trim().normalize('NFKC').toLowerCase();
}

/** Checks whether a prompt name is already used, excluding the prompt being edited. */
export function isPromptNameTaken(
  items: readonly { id: string; name?: string }[],
  candidate: string,
  excludedId?: string | null,
): boolean {
  const candidateKey = getPromptNameComparisonKey(candidate);
  return items.some(
    (item) =>
      item.id !== excludedId &&
      typeof item.name === 'string' &&
      getPromptNameComparisonKey(item.name) === candidateKey,
  );
}
