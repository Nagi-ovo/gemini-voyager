// Pure, framework-free helpers for the docs plugin marketplace page.
// Kept in a separate .ts module so they can be unit-tested with Vitest
// (the .vue component itself is not part of the typecheck/test surface).

/** Bundled official catalog, mirrored from the extension's main repository. */
export const MARKETPLACE_URL =
  'https://raw.githubusercontent.com/Nagi-ovo/gemini-voyager/main/src/features/plugins/catalog/marketplace.json';

export interface MarketplaceEntry {
  name: string;
  source: string;
  official?: boolean;
}

export interface PluginManifest {
  id: string;
  name: string;
  version: string;
  description: string;
  author: string;
  category: string;
  license: string;
  homepage?: string;
  engine: string;
  tier: string;
  matches: string[];
  theme?: { brand?: string };
  i18n?: Record<string, { name?: string; description?: string }>;
}

export interface Platform {
  key: string;
  label: string;
  color: string;
}

// Brand colors mirror the extension's own definitions
// (src/features/plugins/sites/adapters/* and popup SITE_BADGES).
const PLATFORMS: { key: string; label: string; color: string; hosts: string[] }[] = [
  { key: 'claude', label: 'Claude', color: '#d97757', hosts: ['claude.ai'] },
  { key: 'chatgpt', label: 'ChatGPT', color: '#0ea5e9', hosts: ['chatgpt.com', 'chat.openai.com'] },
  { key: 'gemini', label: 'Gemini', color: '#4285f4', hosts: ['gemini.google.com'] },
  { key: 'aistudio', label: 'AI Studio', color: '#1a73e8', hosts: ['aistudio.google.com'] },
  { key: 'grok', label: 'Grok', color: '#111827', hosts: ['grok.com', 'x.com'] },
];

/**
 * Resolve a marketplace entry's `source` against the catalog URL.
 * Absolute URLs pass through; relative paths resolve against the catalog base.
 */
export function resolveSourceUrl(marketplaceUrl: string, source: string): string {
  if (/^https?:\/\//i.test(source)) return source;
  return new URL(source, marketplaceUrl).toString();
}

function hostFromMatch(pattern: string): string {
  try {
    return new URL(pattern.replace(/\*/g, 'x')).hostname.toLowerCase();
  } catch {
    return pattern.toLowerCase();
  }
}

function hostMatchesSuffix(host: string, suffix: string): boolean {
  return host === suffix || host.endsWith(`.${suffix}`);
}

/** Map a manifest's `matches` patterns to a deduped list of known platforms. */
export function platformsFromMatches(matches: readonly string[] | undefined): Platform[] {
  if (!matches) return [];
  const found = new Map<string, Platform>();
  for (const pattern of matches) {
    const host = hostFromMatch(pattern);
    for (const p of PLATFORMS) {
      if (!found.has(p.key) && p.hosts.some((h) => hostMatchesSuffix(host, h))) {
        found.set(p.key, { key: p.key, label: p.label, color: p.color });
      }
    }
  }
  return [...found.values()];
}

/** Strip a redundant "Claude · " / "ChatGPT · " platform prefix (the logo shows it). */
export function displayName(name: string): string {
  return name.replace(/^(Claude|ChatGPT|Grok|Gemini|AI Studio)\s*[·:|]\s*/i, '');
}

/** Path prefix for a locale, used to build locale-aware doc links. */
export function localePrefix(lang: string): string {
  const map: Record<string, string> = {
    'zh-CN': '',
    'zh-TW': '/zh_TW',
    'en-US': '/en',
    'ja-JP': '/ja',
    'ko-KR': '/ko',
    'fr-FR': '/fr',
    'es-ES': '/es',
    'pt-PT': '/pt',
    'ar-SA': '/ar',
    'ru-RU': '/ru',
  };
  return map[lang] ?? '';
}

/** Catalog i18n locale code for a VitePress lang (matches the extension's 10 codes). */
export function localeKey(lang: string): string {
  const map: Record<string, string> = {
    'zh-CN': 'zh',
    'zh-TW': 'zh_TW',
    'en-US': 'en',
    'ja-JP': 'ja',
    'ko-KR': 'ko',
    'fr-FR': 'fr',
    'es-ES': 'es',
    'pt-PT': 'pt',
    'ar-SA': 'ar',
    'ru-RU': 'ru',
  };
  return map[lang] ?? 'en';
}
