/**
 * Extract a compact single-line plaintext title from a prompt body.
 *
 * In compact list view we collapse each prompt to a single row, so we need a
 * short headline that ignores Markdown markup. A prompt starting with `# 译境`
 * should render as `译境` — not `# 译境` and not the rendered `<h1>`.
 *
 * Returns the first non-empty line stripped of common leading tokens. Falls
 * back to the full trimmed text when every line turned out empty.
 */
export function extractPlainTitle(text: string): string {
  if (!text) return '';
  const lines = text.split(/\r?\n/);
  for (const raw of lines) {
    const line = raw.trim();
    if (!line) continue;
    const stripped = line
      .replace(/^#{1,6}\s+/, '')
      .replace(/^>+\s*/, '')
      .replace(/^[-*+]\s+/, '')
      .replace(/^\d+\.\s+/, '')
      .replace(/^\*+|\*+$/g, '')
      .replace(/^_+|_+$/g, '')
      .trim();
    if (stripped) return stripped;
  }
  return text.trim();
}
