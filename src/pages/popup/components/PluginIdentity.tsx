import { type ReactNode, useMemo } from 'react';

import { matchesAnyPattern } from '@/features/plugins/sites/matchPattern';
import { SiteRegistry } from '@/features/plugins/sites/registry';
import type { BlockedPluginUpdate } from '@/features/plugins/sources/defaultSources';
import type { PluginManifest, SettingField } from '@/features/plugins/types';
import type { TranslationKey } from '@/utils/translations';

import { useLanguage } from '../../../contexts/LanguageContext';
import { IconChatGPT, IconClaude, IconDeepSeek } from './WebsiteLogos';

/**
 * Where a listed plugin came from. Anything else (an unknown source id, or a
 * manifest the parent could not attribute) shows the version alone rather than
 * a made-up provenance label.
 */
const SOURCE_LABEL_KEYS: Readonly<Record<string, TranslationKey>> = {
  builtin: 'pluginSourceBuiltin',
  'bundled-catalog': 'pluginSourceBundled',
  'host-catalog': 'pluginSourceOnline',
  local: 'pluginSourceLocal',
};

/** Logo + default accent per known site id. */
const SITE_BADGES: Record<string, { Icon: typeof IconClaude; color: string }> = {
  claude: { Icon: IconClaude, color: '#d97757' },
  chatgpt: { Icon: IconChatGPT, color: '#0ea5e9' },
  deepseek: { Icon: IconDeepSeek, color: '#4d6bfe' },
};

/**
 * Platform logo + brand color for a plugin. Prefers the site the popup is
 * actually open on (`currentSiteId`) so a multi-site plugin (e.g. formula-copy
 * matching both Claude and ChatGPT) shows the CURRENT site's logo — not whichever
 * match string happens to be first. Falls back to inferring from the plugin's
 * match hosts. Colour prefers the plugin's declared `theme.brand`.
 */
export function platformBadge(
  plugin: PluginManifest,
  currentSiteId?: string,
  activeUrl?: string,
): { icon: ReactNode; color: string } | null {
  const brand = plugin.theme?.brand;
  if (activeUrl && !matchesAnyPattern(activeUrl, plugin.matches)) return null;
  const current = currentSiteId ? SITE_BADGES[currentSiteId] : undefined;
  if (current) return { icon: <current.Icon />, color: brand ?? current.color };
  const hosts = plugin.matches.flatMap((pattern) => {
    const match = /^(?:https?|\*):\/\/([^/]+)\//i.exec(pattern);
    return match ? [match[1]] : [];
  });
  if (hosts.includes('claude.ai'))
    return { icon: <IconClaude />, color: brand ?? SITE_BADGES.claude.color };
  if (hosts.includes('chatgpt.com') || hosts.includes('chat.openai.com'))
    return { icon: <IconChatGPT />, color: brand ?? SITE_BADGES.chatgpt.color };
  if (hosts.includes('chat.deepseek.com'))
    return { icon: <IconDeepSeek />, color: brand ?? SITE_BADGES.deepseek.color };
  return null;
}

/** Strip a redundant "Claude · " / "ChatGPT · " platform prefix (the logo shows it). */
function displayName(name: string): string {
  return name.replace(/^(Claude|ChatGPT|Gemini|AI Studio|DeepSeek)\s*[·:|]\s*/i, '');
}

/**
 * Localized field for the current UI language, falling back to the manifest's
 * top-level English. Plugins should use Voyager language keys (`zh`, `zh_TW`,
 * `ja`, …), but we accept common locale variants so cached or third-party
 * manifests do not leak English when the app is already localized.
 */
function localeCandidates(lang: string): string[] {
  const normalized = lang.replace('-', '_');
  const lower = normalized.toLowerCase();
  const candidates = [lang, normalized];

  if (lower === 'zh_tw' || lower === 'zh_hk' || lower.includes('hant')) {
    candidates.push('zh_TW');
  }
  if (lower.startsWith('zh')) candidates.push('zh');

  const base = normalized.split('_')[0];
  if (base) candidates.push(base);
  candidates.push('en');

  return Array.from(new Set(candidates));
}

export function pickLocalized(
  plugin: PluginManifest,
  field: 'name' | 'description',
  lang: string,
): string;
export function pickLocalized(
  plugin: PluginManifest,
  field: 'changelog',
  lang: string,
): string | undefined;
export function pickLocalized(
  plugin: PluginManifest,
  field: 'name' | 'description' | 'changelog',
  lang: string,
): string | undefined {
  for (const locale of localeCandidates(lang)) {
    const value = plugin.i18n?.[locale]?.[field];
    // A blank localized string must not shadow the base value.
    if (value?.trim()) return value;
  }
  return plugin[field];
}

export function pickLocalizedSetting(
  plugin: PluginManifest,
  key: string,
  field: SettingField,
  lang: string,
): { label: string; minLabel?: string; maxLabel?: string; options?: SettingField['options'] } {
  const pick = (name: 'label' | 'minLabel' | 'maxLabel'): string | undefined => {
    for (const locale of localeCandidates(lang)) {
      const value = plugin.i18n?.[locale]?.settings?.[key]?.[name];
      if (value) return value;
    }
    return undefined;
  };
  return {
    label: pick('label') ?? field.label,
    minLabel: pick('minLabel') ?? field.minLabel,
    maxLabel: pick('maxLabel') ?? field.maxLabel,
    options: field.options?.map((option) => {
      for (const locale of localeCandidates(lang)) {
        const label = plugin.i18n?.[locale]?.settings?.[key]?.options?.[option.value];
        if (typeof label === 'string' && label.trim()) return { ...option, label };
      }
      return option;
    }),
  };
}

/** Human-readable host list from a plugin's match patterns (e.g. "claude.ai"). */
export function siteHostsFromMatches(matches: readonly string[]): string {
  const hosts = matches
    .map((pattern) =>
      pattern
        .replace(/^[a-z*]+:\/\//i, '')
        .replace(/\/.*$/, '')
        .replace(/^\*\./, ''),
    )
    .filter(Boolean);
  return Array.from(new Set(hosts)).join(', ');
}

/** GitHub mark — links to the plugin's repo path. */
function GitHubIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
      <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z" />
    </svg>
  );
}

export function usePluginSite(activeUrl: string | undefined) {
  // The site the popup is currently open on — the "active site" the badge needs
  // to pick the right logo for a multi-site plugin. Resolved via the shared
  // SiteRegistry (single source of truth for "which site is this URL").
  const currentSite = useMemo(
    () => (activeUrl ? SiteRegistry.createDefault().resolveByUrl(activeUrl) : null),
    [activeUrl],
  );

  // Human name for the active site, used by the needs-semantic reason. The
  // adapter's own label is the friendly one; without an adapter the bare host
  // is still more informative than a blank.
  const currentSiteLabel = useMemo(() => {
    if (currentSite) return currentSite.label;
    if (!activeUrl) return undefined;
    try {
      return new URL(activeUrl).hostname;
    } catch {
      return undefined;
    }
  }, [activeUrl, currentSite]);
  return { currentSiteId: currentSite?.id, currentSiteLabel };
}

interface PluginIdentityProps {
  readonly plugin: PluginManifest;
  readonly isOpen: boolean;
  readonly onCollapse: () => void;
  readonly isUpdated: boolean;
  readonly sourceId?: string;
  readonly blockedUpdate?: BlockedPluginUpdate;
  readonly activeUrl?: string;
  readonly currentSiteId?: string;
}

export function PluginIdentity({
  plugin,
  isOpen,
  onCollapse,
  isUpdated,
  sourceId,
  blockedUpdate,
  activeUrl,
  currentSiteId,
}: PluginIdentityProps) {
  const { t, language } = useLanguage();
  const badge = platformBadge(plugin, currentSiteId, activeUrl);
  const localizedName = pickLocalized(plugin, 'name', language);
  const hosts = siteHostsFromMatches(plugin.matches);
  const sourceLabelKey = SOURCE_LABEL_KEYS[sourceId ?? ''];
  const provenance = sourceLabelKey
    ? `v${plugin.version} · ${t(sourceLabelKey)}`
    : `v${plugin.version}`;
  const changelog = pickLocalized(plugin, 'changelog', language);
  return (
    <>
      {/* Header: click to expand/collapse */}
      <button
        type="button"
        onClick={onCollapse}
        className="group flex w-full items-start gap-1.5 text-left"
        aria-expanded={isOpen}
        aria-label={localizedName}
        // The site badge already says where it runs; the full host list stays a hover away.
        title={hosts || undefined}
      >
        <svg
          width="11"
          height="11"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="3"
          strokeLinecap="round"
          strokeLinejoin="round"
          className={`text-muted-foreground mt-0.5 shrink-0 transition-transform ${isOpen ? '' : '-rotate-90'}`}
          aria-hidden="true"
        >
          <polyline points="6 9 12 15 18 9" />
        </svg>
        {badge && (
          <span
            className="mt-0.5 inline-flex h-3.5 w-3.5 shrink-0 items-center justify-center"
            style={{ color: badge.color }}
            aria-hidden="true"
          >
            {badge.icon}
          </span>
        )}
        <span className="text-sm leading-snug font-medium break-words">
          {displayName(localizedName)}
        </span>
        {isUpdated && (
          <span className="bg-primary/10 text-primary mt-0.5 shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-semibold tracking-wide uppercase">
            {t('pluginUpdatedBadge')}
          </span>
        )}
      </button>

      {isOpen && (
        <>
          <p className="text-muted-foreground mt-1 text-xs leading-snug">
            {pickLocalized(plugin, 'description', language)}
          </p>
          {changelog && (
            <p
              className="text-muted-foreground mt-1 truncate text-[11px] leading-snug"
              title={changelog}
            >
              <span className="font-medium">{t('pluginChangelogLabel')}</span> {changelog}
            </p>
          )}
          <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px]">
            <span className="text-muted-foreground tabular-nums">{provenance}</span>
            {plugin.homepage && (
              <a
                href={plugin.homepage}
                target="_blank"
                rel="noreferrer"
                className="text-muted-foreground hover:text-foreground inline-flex items-center transition-colors"
                title={t('pluginViewSource')}
                aria-label={t('pluginViewSource')}
              >
                <GitHubIcon />
              </a>
            )}
          </div>
          {blockedUpdate && (
            <p className="text-muted-foreground mt-1 text-[11px] leading-snug">
              {t('pluginUpdateNeedsNewerVoyager').replace('{version}', blockedUpdate.version)}
            </p>
          )}
        </>
      )}
    </>
  );
}
