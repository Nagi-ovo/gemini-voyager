const ENTERPRISE_HINTS = ['enterprise', 'workspace', 'workspaces', 'business'] as const;

const ENTERPRISE_HOSTS = new Set(['business.gemini.google']);

type UrlParts = {
  hostname: string;
  pathname?: string;
  search?: string;
  hash?: string;
};

function includesEnterpriseHint(value: string): boolean {
  const haystack = value.toLowerCase();
  return ENTERPRISE_HINTS.some((hint) => haystack.includes(hint));
}

export function isGeminiEnterpriseUrl({
  hostname,
  pathname = '',
  search = '',
  hash = '',
}: UrlParts): boolean {
  const normalizedHost = hostname.toLowerCase();
  if (ENTERPRISE_HOSTS.has(normalizedHost)) return true;
  if (normalizedHost !== 'gemini.google.com') return false;
  return includesEnterpriseHint(`${pathname}${search}${hash}`);
}

export function hasGeminiEnterpriseDomHints(doc: Document): boolean {
  const root = doc.documentElement;
  const body = doc.body;

  const classNames = `${root?.className ?? ''} ${body?.className ?? ''}`.trim();
  if (classNames && includesEnterpriseHint(classNames)) return true;

  const datasetValues = [
    ...Object.values(root?.dataset ?? {}),
    ...Object.values(body?.dataset ?? {}),
  ].filter((value): value is string => typeof value === 'string' && value.length > 0);

  if (datasetValues.length && includesEnterpriseHint(datasetValues.join(' '))) return true;

  return false;
}

export function isGeminiEnterpriseEnvironment(parts: UrlParts, doc?: Document): boolean {
  if (isGeminiEnterpriseUrl(parts)) return true;
  const normalizedHost = parts.hostname.toLowerCase();
  if (normalizedHost !== 'gemini.google.com') return false;
  return doc ? hasGeminiEnterpriseDomHints(doc) : false;
}
