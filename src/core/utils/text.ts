/**
 * Text manipulation utilities
 */

/**
 * Normalize whitespace in text
 */
export function normalizeText(text: string | null | undefined): string {
  if (!text) return '';

  try {
    return String(text).replace(/\s+/g, ' ').trim();
  } catch {
    return '';
  }
}

/**
 * Truncate text to max length with ellipsis
 */
export function truncateText(text: string, maxLength: number): string {
  if (text.length <= maxLength) {
    return text;
  }

  return text.slice(0, maxLength - 1).trim() + '…';
}

/**
 * Extract first N lines from text
 */
export function getFirstLines(text: string, count: number): string {
  const lines = text
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);

  return lines.slice(0, count).join('\n');
}

/**
 * Check if text is likely truncated
 */
export function isTruncated(element: HTMLElement): boolean {
  return element.scrollWidth > element.clientWidth || element.scrollHeight > element.clientHeight;
}
