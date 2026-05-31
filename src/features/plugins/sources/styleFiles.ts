import { validateStyleCss } from '../manifest/validate';

type CssLoader = (file: string) => Promise<string>;

export async function resolveStyleFileContributions(
  raw: unknown,
  context: string,
  loadCss: CssLoader,
): Promise<unknown> {
  if (!isRecord(raw) || !isRecord(raw.contributes) || !Array.isArray(raw.contributes.styles)) {
    return raw;
  }

  let changed = false;
  const styles = await Promise.all(
    raw.contributes.styles.map(async (entry, index): Promise<unknown> => {
      if (!isRecord(entry) || typeof entry.file !== 'string' || entry.css !== undefined) {
        return entry;
      }

      const file = normalizeStyleFilePath(entry.file);
      if (!file) {
        throw new Error(`${context}: invalid CSS file path at contributes.styles[${index}].file`);
      }

      const css = await loadCss(file);
      const issues = validateStyleCss(css, `contributes.styles[${index}].file`);
      if (issues.length > 0) {
        throw new Error(
          `${context}: invalid CSS file ${file}: ${issues
            .map((issue) => issue.message)
            .join('; ')}`,
        );
      }

      changed = true;
      return { css, source: file };
    }),
  );

  if (!changed) return raw;
  return {
    ...raw,
    contributes: {
      ...raw.contributes,
      styles,
    },
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function normalizeStyleFilePath(file: string): string | null {
  const trimmed = file.trim().replace(/^\.\//, '');
  if (!trimmed || trimmed.startsWith('/') || trimmed.includes('\\')) return null;
  if (/^[a-z][a-z0-9+.-]*:/i.test(trimmed)) return null;
  if (trimmed.includes('?') || trimmed.includes('#')) return null;
  if (trimmed.split('/').some((segment) => segment === '..' || segment === '')) return null;
  if (!trimmed.toLowerCase().endsWith('.css')) return null;
  return trimmed;
}
