/** Returns the normalized name used by Prompt Manager and slash completion. */
export function normalizePromptName(value: string): string | null {
  const name = value.trim();
  return name ? name : null;
}
