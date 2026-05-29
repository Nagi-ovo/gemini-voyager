import { type ReactNode, useCallback, useEffect, useState } from 'react';

import browser from 'webextension-polyfill';

import { isFirefox, isSafari } from '@/core/utils/browser';
import { pluginsToOriginPatterns } from '@/features/plugins/runtime/siteRegistration';
import {
  loadCollapsedPlugins,
  loadPluginState,
  setPluginCollapsed,
  setPluginEnabled,
  setPluginSetting,
  subscribePluginState,
} from '@/features/plugins/storage/pluginState';
import type { PluginManifest, PluginSettingValue } from '@/features/plugins/types';

import { Card, CardContent, CardTitle } from '../../../components/ui/card';
import { Switch } from '../../../components/ui/switch';
import { useLanguage } from '../../../contexts/LanguageContext';
import { IconChatGPT, IconClaude } from './WebsiteLogos';

type EnabledMap = Record<string, boolean>;
type SettingsMap = Record<string, Record<string, PluginSettingValue>>;

/** Platform logo + brand color for a plugin, derived from its match hosts. */
function platformBadge(matches: readonly string[]): { icon: ReactNode; color: string } | null {
  const host = matches.map((m) => m.replace(/^[a-z*]+:\/\//i, '').replace(/\/.*$/, '')).join(' ');
  if (host.includes('claude.ai')) return { icon: <IconClaude />, color: '#d97757' };
  if (host.includes('chatgpt.com') || host.includes('openai.com'))
    return { icon: <IconChatGPT />, color: '#0ea5e9' };
  return null;
}

/** Strip a redundant "Claude · " / "ChatGPT · " platform prefix (the logo shows it). */
function displayName(name: string): string {
  return name.replace(/^(Claude|ChatGPT|Grok|Gemini|AI Studio)\s*[·:|]\s*/i, '');
}

/** Human-readable host list from a plugin's match patterns (e.g. "claude.ai"). */
function siteHostsFromMatches(matches: readonly string[]): string {
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

function readState(
  state: Record<string, { enabled: boolean; settings?: Record<string, PluginSettingValue> }>,
): {
  enabled: EnabledMap;
  settings: SettingsMap;
} {
  const enabled: EnabledMap = {};
  const settings: SettingsMap = {};
  for (const [id, entry] of Object.entries(state)) {
    enabled[id] = entry.enabled === true;
    if (entry.settings) settings[id] = { ...entry.settings };
  }
  return { enabled, settings };
}

/** GitHub mark — links to the plugin's repo path. */
function GitHubIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
      <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z" />
    </svg>
  );
}

export interface PluginManagerProps {
  /** Plugin manifests from the marketplace (loaded by the parent). */
  readonly manifests: readonly PluginManifest[];
  /** True while the catalog is still loading and none are cached yet. */
  readonly loading?: boolean;
  /** Force-refresh the marketplace catalog. */
  readonly onRefresh?: () => void;
  /** True while a manual refresh is in flight. */
  readonly refreshing?: boolean;
}

export function PluginManager({
  manifests,
  loading = false,
  onRefresh,
  refreshing = false,
}: PluginManagerProps) {
  const { t } = useLanguage();
  const [enabledMap, setEnabledMap] = useState<EnabledMap>({});
  const [settingsMap, setSettingsMap] = useState<SettingsMap>({});
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [deniedId, setDeniedId] = useState<string | null>(null);
  const [unsupportedId, setUnsupportedId] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    void loadPluginState().then((state) => {
      if (!active) return;
      const { enabled, settings } = readState(state);
      setEnabledMap(enabled);
      setSettingsMap(settings);
    });
    void loadCollapsedPlugins().then((ids) => {
      if (active) setCollapsed(new Set(ids));
    });
    const unsubscribe = subscribePluginState((state) => {
      const { enabled, settings } = readState(state);
      setEnabledMap(enabled);
      setSettingsMap(settings);
    });
    return () => {
      active = false;
      unsubscribe();
    };
  }, []);

  const handleToggle = useCallback(async (plugin: PluginManifest, next: boolean) => {
    setDeniedId(null);
    setUnsupportedId(null);
    if (next) {
      const origins = pluginsToOriginPatterns([plugin]);
      if (origins.length > 0) {
        // This plugin needs host access on a site Voyager reaches only via dynamic
        // content-script registration. If the platform can't grant or inject that
        // (Safari, or a build without permissions.request), enabling would be a
        // silent no-op — so refuse and explain, instead of a misleading toggle.
        if (isSafari() || !browser.permissions?.request) {
          setUnsupportedId(plugin.id);
          return;
        }
        try {
          // Firefox requires permissions.request to be the first await in the
          // user gesture, so skip the contains() pre-check there.
          if (!isFirefox() && browser.permissions.contains) {
            const alreadyGranted = await browser.permissions.contains({ origins });
            if (!alreadyGranted && !(await browser.permissions.request({ origins }))) {
              setDeniedId(plugin.id);
              return;
            }
          } else if (!(await browser.permissions.request({ origins }))) {
            setDeniedId(plugin.id);
            return;
          }
        } catch {
          setDeniedId(plugin.id);
          return;
        }
      }
    }
    setEnabledMap((prev) => ({ ...prev, [plugin.id]: next }));
    await setPluginEnabled(plugin.id, next);
  }, []);

  const handleSetting = useCallback((id: string, key: string, value: PluginSettingValue) => {
    setSettingsMap((prev) => ({ ...prev, [id]: { ...prev[id], [key]: value } }));
    void setPluginSetting(id, key, value);
  }, []);

  const toggleCollapsed = useCallback((id: string) => {
    setCollapsed((prev) => {
      const next = new Set(prev);
      const willCollapse = !prev.has(id);
      if (willCollapse) next.add(id);
      else next.delete(id);
      // Persist so the expanded/collapsed choice survives reopening the popup.
      void setPluginCollapsed(id, willCollapse);
      return next;
    });
  }, []);

  return (
    <Card className="p-4 transition-all hover:shadow-md">
      <div className="mb-4 flex items-center justify-between">
        <CardTitle>{t('pluginsTitle')}</CardTitle>
        {onRefresh && (
          <button
            type="button"
            onClick={onRefresh}
            disabled={refreshing}
            className="text-muted-foreground hover:text-foreground transition-colors disabled:opacity-50"
            title={t('pluginsRefresh')}
            aria-label={t('pluginsRefresh')}
          >
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.2"
              strokeLinecap="round"
              strokeLinejoin="round"
              className={refreshing ? 'animate-spin' : ''}
              aria-hidden="true"
            >
              <path d="M21 12a9 9 0 1 1-2.64-6.36M21 3v6h-6" />
            </svg>
          </button>
        )}
      </div>
      <CardContent className="space-y-3 p-0">
        <p className="text-muted-foreground text-xs">{t('pluginsDescription')}</p>

        {manifests.length === 0 && (
          <p className="text-muted-foreground text-xs">
            {loading ? t('pluginsLoading') : t('pluginsEmpty')}
          </p>
        )}

        {manifests.map((plugin) => {
          const enabled = enabledMap[plugin.id] === true;
          const isOpen = !collapsed.has(plugin.id);
          const hosts = siteHostsFromMatches(plugin.matches);
          const settingsSchema = plugin.contributes.settings;
          const badge = platformBadge(plugin.matches);
          return (
            <div key={plugin.id} className="border-border/60 rounded-lg border p-3">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  {/* Header: click to expand/collapse */}
                  <button
                    type="button"
                    onClick={() => toggleCollapsed(plugin.id)}
                    className="group flex w-full items-start gap-1.5 text-left"
                    aria-expanded={isOpen}
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
                      {displayName(plugin.name)}
                    </span>
                  </button>

                  {isOpen && (
                    <>
                      <p className="text-muted-foreground mt-1 text-xs leading-snug">
                        {plugin.description}
                      </p>
                      <div className="mt-1.5 flex items-center gap-2 text-[11px]">
                        {hosts && <span className="text-muted-foreground">{hosts}</span>}
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

                      {/* Settings (only meaningful when enabled) */}
                      {enabled && settingsSchema && (
                        <div className="mt-2 space-y-2">
                          {Object.entries(settingsSchema).map(([key, field]) => {
                            if (field.type !== 'number') return null;
                            const value = Number(settingsMap[plugin.id]?.[key] ?? field.default);
                            return (
                              <label key={key} className="block">
                                <div className="text-muted-foreground mb-1 flex justify-between text-[11px]">
                                  <span>{field.label}</span>
                                  <span className="tabular-nums">{value}</span>
                                </div>
                                <input
                                  type="range"
                                  min={field.min ?? 0}
                                  max={field.max ?? 100}
                                  value={value}
                                  onChange={(e) =>
                                    handleSetting(plugin.id, key, Number(e.target.value))
                                  }
                                  className="accent-primary h-1.5 w-full cursor-pointer"
                                />
                              </label>
                            );
                          })}
                        </div>
                      )}

                      {deniedId === plugin.id && (
                        <p className="mt-1 text-[11px] text-red-500">
                          {t('pluginPermissionDenied')}
                        </p>
                      )}

                      {unsupportedId === plugin.id && (
                        <p className="mt-1 text-[11px] text-red-500">
                          {t('pluginUnsupportedPlatform')}
                        </p>
                      )}
                    </>
                  )}
                </div>
                <Switch
                  checked={enabled}
                  onChange={(e) => {
                    void handleToggle(plugin, e.target.checked);
                  }}
                  aria-label={plugin.name}
                />
              </div>
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}
