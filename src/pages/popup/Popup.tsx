import { type ReactNode, useMemo, useState } from 'react';

import { Card, CardContent } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { useLanguage } from '@/contexts/LanguageContext';
import { StorageKeys } from '@/core/types/common';
import {
  getVoyagerBuildTarget,
  isSafari,
  supportsExtensionNotifications,
} from '@/core/utils/browser';
import { getFolderPlatformForHost } from '@/features/folder/platforms';
import { CHATGPT_EXPORT_PLUGIN_ID } from '@/features/plugins/builtin/chatgptExport/openMessage';
import { OFFICIAL_PLUGIN_IDS } from '@/features/plugins/sites/featureOwners';
import { isPluginEnabled } from '@/features/plugins/storage/pluginDefaults';

import { CloudSyncSettings } from './components/CloudSyncSettings';
import { DiagnosticsExportCard } from './components/DiagnosticsExportCard';
import { FolderSettingsCard } from './components/FolderSettingsCard';
import { GeneralSettingsCard } from './components/GeneralSettingsCard';
import { KeyboardShortcutSettings } from './components/KeyboardShortcutSettings';
import { NativeHealthNotice } from './components/NativeHealthNotice';
import { NativeLocalPluginsSection } from './components/NativeLocalPluginsSection';
import { PluginSiteSettings } from './components/PluginSiteSettings';
import { PopupFooter } from './components/PopupFooter';
import { PopupHeader } from './components/PopupHeader';
import { PopupLayoutSettings } from './components/PopupLayoutSettings';
import { PopupSearchBox } from './components/PopupSearchBox';
import { PopupSection } from './components/PopupSection';
import { PopupUpdateBanner } from './components/PopupUpdateBanner';
import { PromptManagerSettingsCard } from './components/PromptManagerSettingsCard';
import { StarredHistory } from './components/StarredHistory';
import { StorageManager } from './components/StorageManager';
import { StorageQuotaCard } from './components/StorageQuotaCard';
import { TimelineSettingsCard } from './components/TimelineSettingsCard';
import { ToolbarPinHint } from './components/ToolbarPinHint';
import { VisualEffectPicker } from './components/VisualEffectPicker';
import { useActivePopupTab } from './hooks/useActivePopupTab';
import { useCatalogTimelineSettings } from './hooks/useCatalogTimelineSettings';
import { useFolderPopupSettings } from './hooks/useFolderPopupSettings';
import { useFolderStructureCopy } from './hooks/useFolderStructureCopy';
import { useGeneralPopupSettings } from './hooks/useGeneralPopupSettings';
import { useNativeHealth } from './hooks/useNativeHealth';
import { usePopupBrandTheme } from './hooks/usePopupBrandTheme';
import { usePopupLayoutSettings } from './hooks/usePopupLayoutSettings';
import { usePopupPlugins } from './hooks/usePopupPlugins';
import { usePopupReleaseInfo } from './hooks/usePopupReleaseInfo';
import { usePopupScrollRestoration } from './hooks/usePopupScrollRestoration';
import {
  type PopupSectionId,
  type PopupSectionOptions,
  usePopupSections,
} from './hooks/usePopupSections';
import { usePopupSettingsHydration } from './hooks/usePopupSettingsHydration';
import { usePromptDataTransfer } from './hooks/usePromptDataTransfer';
import { usePromptManagerSettings } from './hooks/usePromptManagerSettings';
import { useVisualEffectPopupSettings } from './hooks/useVisualEffectPopupSettings';
import { OfficialPluginList } from './officialPlugins/OfficialPluginList';
import { useContextSyncRequest } from './officialPlugins/useContextSyncRequest';
import { useOfficialPluginList } from './officialPlugins/useOfficialPluginList';
import { writePopupSyncStorage } from './utils/popupStorage';
import { isPluginPopupSite } from './utils/siteMode';
import { canUseVisualEffects } from './utils/visualEffectsAvailability';

interface PopupProps {
  sourceTabId?: number;
}

export default function Popup({ sourceTabId }: PopupProps = {}) {
  const { t, language } = useLanguage();
  const [showStarredHistory, setShowStarredHistory] = useState(false);
  const [showStorageManager, setShowStorageManager] = useState(false);
  const [aiStudioEnabled, setAiStudioEnabled] = useState(true);
  const tab = useActivePopupTab(sourceTabId);
  const plugins = usePopupPlugins(tab);
  const nativeHealth = useNativeHealth(tab.activeTabId, tab.activeUrl);
  const isAIStudio = tab.activeAccountPlatform === 'aistudio';
  const isSafariBrowser = getVoyagerBuildTarget() === 'safari' || isSafari();
  const officialPlugins = useOfficialPluginList({
    manifests: plugins.siteScopedManifests,
    pluginState: plugins.pluginState,
    legacy: plugins.legacySettings,
    legacyLoaded: plugins.legacySettingsLoaded,
    context: { isSafariBrowser },
  });
  const canUseSystemNotifications = supportsExtensionNotifications();
  const currentPlatformLabel = isAIStudio ? t('platformAIStudio') : t('platformGemini');
  const isPluginSite = isPluginPopupSite(tab.activeUrl, plugins.siteScopedManifests);
  const activeSiteDomain = useMemo(() => {
    try {
      return new URL(tab.activeUrl).host.replace(/^www\./, '').toLowerCase();
    } catch {
      return '';
    }
  }, [tab.activeUrl]);
  const theme = usePopupBrandTheme({
    activeUrl: tab.activeUrl,
    pluginManifests: plugins.pluginManifests,
    pluginSiteOverride: plugins.pluginSiteOverride,
  });
  const release = usePopupReleaseInfo(isSafariBrowser);

  // These owners remain mounted while search hides cards or an auxiliary view opens.
  // A catalog rail runs on its timeline plugin's settings and its own placement keys, so the
  // timeline card edits those on such a site instead of Gemini's.
  const catalogTimeline = useCatalogTimelineSettings({
    activeUrl: tab.activeUrl,
    siteOverride: plugins.pluginSiteOverride,
    manifests: plugins.siteScopedManifests,
    pluginState: plugins.pluginState,
    writeSyncStorage: writePopupSyncStorage,
    // Every timeline shares Gemini's message-times switch, which is its own Plugins row there.
    messageTimestamps: {
      enabled: officialPlugins.panelValues[StorageKeys.GV_SHOW_MESSAGE_TIMESTAMPS] === true,
      set: (enabled) =>
        officialPlugins.setEnabled(OFFICIAL_PLUGIN_IDS.geminiMessageTimestamps, enabled),
    },
  });
  const folder = useFolderPopupSettings({
    activeAccountPlatform: tab.activeAccountPlatform,
    writeSyncStorage: writePopupSyncStorage,
  });
  const general = useGeneralPopupSettings({
    writeSyncStorage: writePopupSyncStorage,
    isSafariBrowser,
    canUseSystemNotifications,
    storedResponseNotification: plugins.legacySettingsLoaded
      ? plugins.legacySettings[StorageKeys.RESPONSE_COMPLETE_NOTIFICATION_ENABLED] === true
      : undefined,
  });
  const layout = usePopupLayoutSettings({ isAIStudio });
  const promptManager = usePromptManagerSettings({
    t,
    pluginManifests: plugins.pluginManifests,
    refreshActiveTabContext: tab.refreshActiveTabContext,
    writeSyncStorage: writePopupSyncStorage,
  });
  const promptTransfer = usePromptDataTransfer(t);
  const visualEffect = useVisualEffectPopupSettings(writePopupSyncStorage);
  const folderStructureCopy = useFolderStructureCopy(language, sourceTabId);
  // Above every early return and section: a sync in flight outlives the Plugins card.
  const contextSync = useContextSyncRequest(sourceTabId);
  // Where the Plugins card lists the effect (Gemini / AI Studio), its row replaces this card.
  const visualEffectRowShown =
    !isPluginSite &&
    officialPlugins.rows.some((row) => row.manifest.id === OFFICIAL_PLUGIN_IDS.visualEffects);
  const visualEffectsAvailable =
    !visualEffectRowShown &&
    canUseVisualEffects({
      isPluginSite,
      activeSiteDomain,
      customWebsites: promptManager.customWebsites,
      sitePluginIds: plugins.siteScopedManifests.map((plugin) => plugin.id),
      pluginState: plugins.pluginState,
    });
  const sections = usePopupSections({
    // Plugin sites hide native sections through `isPluginSite`; keep the full allowlist for the
    // sections they still show (visual effects) instead of treating them as AI Studio.
    nativePopupPlatform: tab.activeAccountPlatform ?? 'gemini',
    isPluginSite,
    visualEffectsAvailable,
    officialPluginsAvailable: officialPlugins.available,
    officialPluginSearchItems: officialPlugins.searchItems,
    t,
    writeSyncStorage: writePopupSyncStorage,
  });
  usePopupSettingsHydration({
    folder: folder.hydrateFromStorage,
    general: general.hydrateFromStorage,
    promptManager: promptManager.hydrateFromStorage,
    visualEffect: visualEffect.hydrateFromStorage,
    sections: sections.hydrateFromStorage,
    aiStudio: setAiStudioEnabled,
  });
  usePopupScrollRestoration({
    activeTabContextLoaded: tab.activeTabContextLoaded,
    hasSettingsSearch: sections.hasSettingsSearch,
    isPluginSite,
    showStarredHistory,
    showStorageManager,
  });
  const wrapSection = (id: PopupSectionId, content: ReactNode, options?: PopupSectionOptions) => (
    <PopupSection key={id} {...sections.getSectionProps(id, options)}>
      {content}
    </PopupSection>
  );
  const dedicatedTimelineSettings =
    isPluginSite &&
    catalogTimeline &&
    sections.getSectionProps('timeline', { allowPluginSite: true }).visible
      ? {
          pluginId: catalogTimeline.pluginId,
          settingKeys: [
            ...(catalogTimeline.offers('timelineStyle') ? ['timelineStyle'] : []),
            ...(catalogTimeline.offers('enableMarkerLevel') ? ['markerLevel'] : []),
          ],
        }
      : undefined;
  if (showStarredHistory)
    return (
      <StarredHistory sourceTabId={sourceTabId} onClose={() => setShowStarredHistory(false)} />
    );
  if (showStorageManager)
    return (
      <div style={theme.style}>
        <StorageManager
          onClose={() => setShowStorageManager(false)}
          onManageHighlights={() => {
            setShowStorageManager(false);
            setShowStarredHistory(true);
          }}
        />
      </div>
    );
  return (
    <div className="bg-background text-foreground w-[360px]" style={theme.style}>
      <PopupHeader themePicker={theme.picker} t={t} />
      <div className="flex flex-col gap-4 p-5">
        {/* Below the search box, above the update banner (order -2, earlier in DOM). */}
        <ToolbarPinHint style={{ order: -2 }} />
        {!isPluginSite && (
          <PopupSearchBox
            query={sections.settingsSearchQuery}
            onChange={sections.updateSettingsSearchQuery}
            t={t}
          />
        )}
        {!isPluginSite && sections.hasSettingsSearch && !sections.hasVisibleSearchResults && (
          <Card style={{ order: -2.5 }} className="p-4 text-center" role="status">
            <p className="text-muted-foreground text-sm">{t('popupSettingsSearchNoResults')}</p>
          </Card>
        )}
        <NativeHealthNotice
          style={{ order: -2 }}
          entries={nativeHealth.visibleEntries}
          language={language}
          onDismiss={nativeHealth.dismiss}
          t={t}
        />
        <PopupUpdateBanner release={release} isSafariBrowser={isSafariBrowser} t={t} />
        {!isPluginSite && (
          <div style={{ order: sections.getSectionProps('cloudSync').order + 1 }}>
            <StorageQuotaCard onManage={() => setShowStorageManager(true)} />
          </div>
        )}
        {/* AI Studio master toggle - only shown when on AI Studio */}
        {isAIStudio && (
          <Card
            style={{ order: -1 }}
            className="border-primary/20 p-4 transition-all hover:shadow-md"
          >
            <CardContent className="p-0">
              <div className="group flex items-center justify-between">
                <div className="flex-1">
                  <Label
                    htmlFor="aistudio-enabled"
                    className="group-hover:text-primary cursor-pointer text-sm font-medium transition-colors"
                  >
                    {t('enableOnAIStudio')}
                  </Label>
                  <p className="text-muted-foreground mt-1 text-xs">{t('enableOnAIStudioHint')}</p>
                </div>
                <Switch
                  id="aistudio-enabled"
                  checked={aiStudioEnabled}
                  onChange={(e) => {
                    setAiStudioEnabled(e.target.checked);
                    void writePopupSyncStorage({
                      [StorageKeys.GV_AISTUDIO_ENABLED]: e.target.checked,
                    });
                  }}
                />
              </div>
            </CardContent>
          </Card>
        )}
        {/* Cloud Sync */}
        {wrapSection('cloudSync', <CloudSyncSettings sourceTabId={sourceTabId} />, {
          allowPluginSite: getFolderPlatformForHost(activeSiteDomain) !== null,
          // Same top-level slot as on Gemini, ahead of the site's prompt and plugin cards.
          pluginSiteOrder: -2,
        })}
        {isPluginSite && (
          <PluginSiteSettings
            siteDomain={activeSiteDomain}
            siteLabel={theme.picker.siteLabel}
            promptEnabled={promptManager.customWebsites.includes(activeSiteDomain)}
            onTogglePrompt={() => {
              void promptManager.toggleQuickWebsite(
                activeSiteDomain,
                promptManager.customWebsites.includes(activeSiteDomain),
              );
            }}
            promptDataTransfer={promptTransfer}
            plugins={{
              manifests: plugins.siteScopedManifests,
              loading: plugins.pluginsLoading,
              onRefresh: plugins.refresh,
              refreshing: plugins.pluginsRefreshing,
              activeUrl: tab.activeUrl,
              sourceIds: plugins.pluginSourceIds,
              blockedUpdates: plugins.pluginBlockedUpdates,
              catalogHost: plugins.pluginCatalogHost,
              statuses: plugins.pluginStatuses,
              dedicatedTimelineSettings,
            }}
            exportEntry={{
              enabled: isPluginEnabled(plugins.pluginState, CHATGPT_EXPORT_PLUGIN_ID),
              activeTabId: tab.activeTabId,
              // The options page embeds this view in a tab of its own; only the
              // toolbar popup should get out of the way of the opened dialog.
              onOpened: sourceTabId === undefined ? () => window.close() : undefined,
            }}
            t={t}
          />
        )}
        {/* A plugin site's timeline rail; Gemini's timeline is a Plugins row. */}
        {wrapSection(
          'timeline',
          catalogTimeline && (
            <TimelineSettingsCard
              values={catalogTimeline.values}
              onChange={catalogTimeline.onChange}
              onResetPosition={catalogTimeline.resetPosition}
              isVisible={catalogTimeline.offers}
              onViewStarredHistory={() => setShowStarredHistory(true)}
              t={t}
            />
          ),
          { allowPluginSite: catalogTimeline !== null },
        )}
        {/* Folder Options */}
        {wrapSection(
          'folder',
          <FolderSettingsCard
            values={folder.values}
            onChange={folder.onChange}
            accountIsolation={{
              enabled: folder.accountIsolationEnabled,
              platformLabel: currentPlatformLabel,
              onChange: folder.onAccountIsolationChange,
            }}
            aiStructureCopy={folderStructureCopy}
            isVisible={(settingId) => sections.shouldShowSetting('folder', settingId)}
            t={t}
          />,
        )}
        <PopupLayoutSettings settings={layout} t={t} wrapSection={wrapSection} />
        {/* Visual effects off Gemini / AI Studio. Third-party sites expose this only
            after Prompt Manager or a matching plugin has activated the site. */}
        {visualEffectsAvailable &&
          wrapSection(
            'visualEffect',
            <VisualEffectPicker
              value={visualEffect.value}
              onChange={visualEffect.onChange}
              t={t}
            />,
            { allowPluginSite: true },
          )}

        {/* Keyboard Shortcuts: global, so catalog timeline rails listen to them too. */}
        {wrapSection('keyboardShortcuts', <KeyboardShortcutSettings />, {
          allowPluginSite: catalogTimeline !== null,
        })}

        {wrapSection(
          'promptManager',
          <PromptManagerSettingsCard
            settings={promptManager}
            transfer={promptTransfer}
            isPluginSite={isPluginSite}
            isVisible={(id) => sections.shouldShowSetting('promptManager', id)}
            t={t}
          />,
        )}
        {/* General Options */}
        {wrapSection(
          'general',
          <GeneralSettingsCard
            values={general.values}
            onChange={general.onChange}
            remoteAnnouncementPermissionCta={{
              visible:
                general.values.remoteAnnouncementEnabled &&
                canUseSystemNotifications &&
                !general.remoteAnnouncementPermissionGranted,
              onRequest: general.requestRemoteAnnouncementSystemPermission,
            }}
            isVisible={(settingId) => sections.shouldShowSetting('general', settingId)}
            t={t}
          />,
        )}

        {/* Official plugins on Gemini / AI Studio: one switch per feature. */}
        {wrapSection(
          'officialPlugins',
          <OfficialPluginList
            rows={officialPlugins.rows}
            statuses={plugins.pluginStatuses}
            nameSources={plugins.siteScopedManifests}
            isVisible={(pluginId) => sections.shouldShowSetting('officialPlugins', pluginId)}
            onToggle={officialPlugins.setEnabled}
            onSettingsChange={officialPlugins.setSettings}
            controls={{ responseNotification: general.responseNotification }}
            panelIo={{
              values: officialPlugins.panelValues,
              write: officialPlugins.writePanel,
              contextSync,
              openStarredHistory: () => setShowStarredHistory(true),
            }}
            searching={sections.hasSettingsSearch}
            language={language}
            t={t}
          />,
        )}
        {/* Gemini / AI Studio have no plugin page; local plugins get one section here. */}
        {wrapSection(
          'localPlugins',
          <NativeLocalPluginsSection
            plugins={{
              manifests: plugins.siteScopedManifests,
              loading: plugins.pluginsLoading,
              activeUrl: tab.activeUrl,
              sourceIds: plugins.pluginSourceIds,
              blockedUpdates: plugins.pluginBlockedUpdates,
              statuses: plugins.pluginStatuses,
            }}
            t={t}
          />,
        )}
      </div>

      <PopupFooter
        extVersion={release.extVersion}
        releaseUrl={release.releaseUrl}
        language={language}
        t={t}
      >
        <DiagnosticsExportCard
          activeUrl={tab.activeUrl}
          loading={plugins.pluginsLoading || !plugins.pluginStateLoaded}
          nativeHealth={nativeHealth.entries}
          plugins={plugins.diagnosticPlugins}
        />
      </PopupFooter>
    </div>
  );
}
