/**
 * Reads one language out of a release note. Free of extension APIs: the docs
 * site builds its changelog pages from the same notes with this.
 */

/**
 * Strip optional front matter (--- ... ---) from markdown.
 */
function stripFrontMatter(raw: string): string {
  const match = raw.match(/^---\r?\n[\s\S]*?\r?\n---\r?\n([\s\S]*)$/);
  return match ? match[1] : raw;
}

/**
 * Extract the section matching the user's language from a multi-language
 * markdown file. Falls back to 'en' if the requested language is missing.
 */
export function extractLocalizedContent(raw: string, lang: string): string {
  const body = stripFrontMatter(raw);

  // Split by <!-- lang:xx --> markers
  const sections = new Map<string, string>();
  const parts = body.split(/<!--\s*lang:(\w+)\s*-->/);

  // parts[0] is text before the first marker (usually empty)
  // parts[1] = lang code, parts[2] = content, parts[3] = lang code, etc.
  for (let i = 1; i < parts.length; i += 2) {
    const langCode = parts[i];
    const content = parts[i + 1]?.trim() ?? '';
    if (langCode && content) {
      sections.set(langCode, content);
    }
  }

  return sections.get(lang) ?? sections.get('en') ?? '';
}
