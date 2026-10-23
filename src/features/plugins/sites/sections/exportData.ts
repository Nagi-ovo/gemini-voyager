/** Page facts consumed by conversationExport; no export behavior lives in site data. */
import type { ManifestIssue } from '../../manifest/validate';

export interface SiteExportConfig {
  readonly version: 1;
  readonly read: 'mounted' | 'virtual';
  /** Document selector for the conversation title. */
  readonly title?: string;
  /** Document selector present while a response is being generated. */
  readonly generating?: string;
  /** Export-only message identity on the turn itself or its nearest ancestor; required for virtual reads. */
  readonly messageKey?: string;
}

export function readExportConfig(
  raw: unknown,
  issues: ManifestIssue[],
  validSelector: (selector: string) => boolean,
  validAttributeName: (name: string) => boolean,
): SiteExportConfig | undefined {
  if (raw === undefined) return undefined;
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
    issues.push({ path: 'export', message: 'must be an object' });
    return undefined;
  }
  const data = raw as Record<string, unknown>;
  const start = issues.length;
  if (data.version !== 1) {
    issues.push({ path: 'export.version', message: 'must be 1' });
  }
  if (data.read !== 'mounted' && data.read !== 'virtual') {
    issues.push({ path: 'export.read', message: 'must be mounted or virtual' });
  }
  for (const key of ['title', 'generating'] as const) {
    const value = data[key];
    if (value === undefined) continue;
    if (typeof value !== 'string' || !value.trim() || value.length > 2_000) {
      issues.push({
        path: `export.${key}`,
        message: 'must be a non-empty selector up to 2000 chars',
      });
    } else if (!validSelector(value)) {
      issues.push({ path: `export.${key}`, message: 'selector does not parse' });
    }
  }
  if (data.read === 'virtual' && data.messageKey === undefined) {
    // Text alone cannot distinguish a remounted window from genuinely repeated messages.
    issues.push({ path: 'export.messageKey', message: 'required for virtual reads' });
  }
  if (
    data.messageKey !== undefined &&
    (typeof data.messageKey !== 'string' || !validAttributeName(data.messageKey))
  ) {
    issues.push({ path: 'export.messageKey', message: 'must be a lower-case attribute name' });
  }
  if (issues.length !== start) return undefined;
  return {
    version: 1,
    read: data.read as SiteExportConfig['read'],
    ...(typeof data.title === 'string' ? { title: data.title } : {}),
    ...(typeof data.generating === 'string' ? { generating: data.generating } : {}),
    ...(typeof data.messageKey === 'string' ? { messageKey: data.messageKey } : {}),
  };
}
