import { useMemo } from 'react';

import type { PluginStatus } from '@/features/plugins/runtime/pluginStatus';
import type { BlockedPluginUpdate } from '@/features/plugins/sources/defaultSources';
import type { PluginManifest } from '@/features/plugins/types';

import { Card, CardContent, CardTitle } from '../../../components/ui/card';
import { Switch } from '../../../components/ui/switch';
import { useLanguage } from '../../../contexts/LanguageContext';
import { PluginCatalogControls, usePluginCatalog } from './PluginCatalogControls';
import {
  PluginIdentity,
  pickLocalized,
  siteHostsFromMatches,
  usePluginSite,
} from './PluginIdentity';
import { PluginSettings } from './PluginSettings';
import { usePluginAccess } from './usePluginAccess';
import { usePluginPreferences } from './usePluginPreferences';
import { usePluginUpdates } from './usePluginUpdates';

export interface PluginManagerProps {
  /** Plugin manifests from bundled and remote sources (loaded by the parent). */
  readonly manifests: readonly PluginManifest[];
  /** True while the manifest list is still loading. */
  readonly loading?: boolean;
  /** Force-refresh the remote marketplace and re-read bundled manifests. */
  readonly onRefresh?: () => void;
  /** True while a manual refresh is in flight. */
  readonly refreshing?: boolean;
  /** URL of the active tab — selects which platform logo each plugin shows. */
  readonly activeUrl?: string;
  /**
   * Source id per plugin id: `builtin` (first-party JS), `bundled-catalog`
   * (snapshot shipped with this build) or `host-catalog` (fetched from the
   * remote catalog for the active host). Drives the per-plugin source label.
   */
  readonly sourceIds?: Readonly<Record<string, string>>;
  /** Remote updates held back because they need a newer engine than this build (plan D6). */
  readonly blockedUpdates?: Readonly<Record<string, BlockedPluginUpdate>>;
  /** Host whose remote catalog this popup reads; undefined on hosts that can never have one. */
  readonly catalogHost?: string;
  /**
   * Per-plugin status reported by the active tab's PluginHost (plan §4.2):
   * needs-engine / needs-handler / needs-semantic disable the toggle with a
   * reason, no-effect shows the health warning, pendingVersion says the update
   * applies after a page reload. Empty when the tab reported nothing.
   */
  readonly statuses?: readonly PluginStatus[];
}

/**
 * Render the popup's plugin catalog and manage each plugin's enabled state,
 * optional host access, platform-specific settings, and refresh lifecycle.
 */
export function PluginManager({
  manifests,
  loading = false,
  onRefresh,
  refreshing = false,
  activeUrl,
  sourceIds,
  blockedUpdates,
  catalogHost,
  statuses,
}: PluginManagerProps) {
  const { t, language } = useLanguage();
  const { currentSiteId, currentSiteLabel } = usePluginSite(activeUrl);
  // Status per plugin id. A plugin the tab said nothing about keeps today's
  // behaviour (enabled toggle, no note).
  const statusById = useMemo(() => {
    const map = new Map<string, PluginStatus>();
    for (const status of statuses ?? []) map.set(status.id, status);
    return map;
  }, [statuses]);
  const preferences = usePluginPreferences();
  const {
    enabledMap,
    settingsMap,
    collapsed,
    handleSetting,
    handleImmediateSettings,
    toggleCollapsed,
  } = preferences;
  const updatedIds = usePluginUpdates(manifests);
  const {
    deniedId,
    unsupportedId,
    enableRefusal,
    missingPermissionIds,
    handleToggle,
    handleGrantRequiredAccess,
  } = usePluginAccess(manifests, activeUrl, enabledMap, preferences.mirrorEnabled);
  const catalog = usePluginCatalog(catalogHost, refreshing);

  const hasUpdatedPlugins = manifests.some((plugin) => updatedIds.has(plugin.id));

  return (
    <Card className="p-4 transition-all hover:shadow-md">
      <div className="mb-4 flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <CardTitle>{t('pluginsTitle')}</CardTitle>
          {hasUpdatedPlugins && (
            <span
              data-testid="plugin-updates-dot"
              className="bg-primary inline-block h-1.5 w-1.5 rounded-full"
              aria-hidden="true"
            />
          )}
        </div>
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
          const localizedName = pickLocalized(plugin, 'name', language);
          const needsSiteAccess = enabled && missingPermissionIds.has(plugin.id);
          const isUpdated = updatedIds.has(plugin.id);
          const status = statusById.get(plugin.id);
          // Only the three incompatibility kinds block the toggle; `no-effect`
          // stays enabled because the plugin did run, it just found no targets.
          const blockedReason = ((): string | null => {
            switch (status?.kind) {
              case 'needs-engine':
                return t('pluginNeedsNewerVoyager').replace(
                  '{engine}',
                  status.requiredEngine ?? plugin.engine,
                );
              case 'needs-handler':
                return t('pluginNeedsVoyagerUpdate');
              case 'needs-semantic':
                return t('pluginNeedsSiteAdapterUpdate').replace(
                  '{site}',
                  currentSiteLabel ?? hosts,
                );
              default:
                return null;
            }
          })();
          return (
            <div key={plugin.id} className="border-border/60 rounded-lg border p-3">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <PluginIdentity
                    plugin={plugin}
                    isOpen={isOpen}
                    onCollapse={() => toggleCollapsed(plugin.id)}
                    isUpdated={isUpdated}
                    sourceId={sourceIds?.[plugin.id]}
                    blockedUpdate={blockedUpdates?.[plugin.id]}
                    activeUrl={activeUrl}
                    currentSiteId={currentSiteId}
                  />

                  {/* Status notes stay visible while the card is collapsed —
                      they explain a toggle the user cannot move. */}
                  {blockedReason && (
                    <p className="mt-1 text-[11px] leading-snug text-red-500/80">{blockedReason}</p>
                  )}

                  {status?.kind === 'no-effect' && (
                    <p className="mt-1 text-[11px] leading-snug text-amber-600 dark:text-amber-400">
                      {t('pluginNoEffectOnPage')}
                    </p>
                  )}

                  {status?.pendingVersion && (
                    <p className="text-muted-foreground mt-1 text-[11px] leading-snug">
                      {t('pluginUpdateAfterReload').replace('{version}', status.pendingVersion)}
                    </p>
                  )}

                  {needsSiteAccess && (
                    <button
                      type="button"
                      onClick={() => void handleGrantRequiredAccess(plugin)}
                      className="border-primary/25 bg-primary/5 text-primary hover:bg-primary/10 mt-2 flex w-full items-center justify-center rounded-md border px-2.5 py-2 text-xs font-medium transition-colors"
                    >
                      {t('pluginGrantRequiredAccess')}
                    </button>
                  )}

                  {/* Settings stay visible even when the description is collapsed, so a
                      slider-based plugin (e.g. reading width) is always adjustable. A missing
                      companion-frame grant must not disable settings that still affect the
                      already-authorized parent page. */}
                  {enabled && (
                    <PluginSettings
                      plugin={plugin}
                      values={settingsMap[plugin.id]}
                      handleSetting={handleSetting}
                      handleImmediateSettings={handleImmediateSettings}
                    />
                  )}

                  {deniedId === plugin.id && (
                    <p className="mt-1 text-[11px] text-red-500">{t('pluginPermissionDenied')}</p>
                  )}

                  {unsupportedId === plugin.id && (
                    <p className="mt-1 text-[11px] text-red-500">
                      {t('pluginUnsupportedPlatform')}
                    </p>
                  )}

                  {enableRefusal?.id === plugin.id && (
                    <p className="mt-1 text-[11px] text-red-500">{t(enableRefusal.key)}</p>
                  )}
                </div>
                <Switch
                  checked={enabled}
                  disabled={!enabled && blockedReason !== null}
                  onChange={(e) => {
                    void handleToggle(plugin, e.target.checked);
                  }}
                  aria-label={localizedName}
                />
              </div>
            </div>
          );
        })}

        {/* Online-catalog controls. Hidden on hosts that can never have a
            catalog (Gemini, AI Studio, anything with a port or wildcard), where
            the switch would promise a check that never runs. */}
        <PluginCatalogControls catalogHost={catalogHost} {...catalog} />
      </CardContent>
    </Card>
  );
}
