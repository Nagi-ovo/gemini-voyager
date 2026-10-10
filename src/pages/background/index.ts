/* Background service worker: register listeners synchronously, then let each owner handle its work. */
import { getVoyagerBuildTarget } from '@/core/utils/browser';
import { startRemoteAnnouncementBackgroundService } from '@/features/announcements/background';
import { registerWelcomePageOnInstall } from '@/features/onboarding/welcomePage';
import { startChatGptTemporaryHandoffBackgroundService } from '@/features/plugins/builtin/chatgptTemporaryHandoff/background';
import { HostCatalogRefresher } from '@/features/plugins/remote/hostCatalogRefresh';
import { createStarStore } from '@/features/savedLibrary/starStore';
import { startStorageQuotaWarningBackgroundService } from '@/features/storageQuotaWarning/background';

import {
  disableRetiredTabTitleUpdateSetting,
  migrateOptionalHighlightSetting,
} from './backgroundSettings';
import { createCloudSyncMessageHandler } from './cloudSyncMessages';
import { startDevAutoReload } from './devAutoReload';
import { createForkMessagesOwner } from './forkMessages';
import { createGeneratedUiCapture } from './generatedUiCapture';
import { createMainWorldRegistration } from './mainWorldRegistration';
import { handlePluginRuntimeMessage } from './pluginRuntimeMessages';
import { startQueueOwners } from './queueOwners';
import { registerBackgroundSettingListeners } from './registrationSettings';
import { startResearchPackOwner } from './researchPackOwner';
import { createResponseNotifications } from './responseNotifications';
import { registerBackgroundRuntimeMessages } from './runtimeMessages';
import { createSiteAccessRegistration } from './siteAccessRegistration';
import { createStarredMessagesHandler } from './starredMessages';
import { registerWatermarkDefaultMigrationOnInstall } from './watermarkDefaultMigration';

const responseNotifications = createResponseNotifications();
const remoteAnnouncementService = startRemoteAnnouncementBackgroundService();
registerWelcomePageOnInstall();
registerWatermarkDefaultMigrationOnInstall();
if (import.meta.env.VOYAGER_DEV_AUTO_RELOAD) startDevAutoReload();
// Remote plugin catalog: the only network writer. Content scripts and the popup
// only ever ask; this decides (interval, switch, backoff, single flight).
const hostCatalogRefresher = new HostCatalogRefresher();
startChatGptTemporaryHandoffBackgroundService();
startStorageQuotaWarningBackgroundService();
startResearchPackOwner();
startQueueOwners();

if (getVoyagerBuildTarget() === 'safari') {
  responseNotifications.connectNativeOpenConversationPort();
}
responseNotifications.registerClickListener();

const siteAccess = createSiteAccessRegistration();
const mainWorld = createMainWorldRegistration();
const generatedUiCapture = createGeneratedUiCapture(siteAccess);

// Initial sync for persisted permissions
void disableRetiredTabTitleUpdateSetting();
void migrateOptionalHighlightSetting();
void generatedUiCapture.cleanupLegacyGeneratedUiCapturePermission();
void siteAccess.syncCustom();
void siteAccess.syncPlugins();
void siteAccess.refreshPluginSiteDomains().then(() => {
  void siteAccess.syncPromptNudgeIcon();
});

// Initial fetch interceptor registration
void mainWorld.registerFetchInterceptor();

// Initial response completion observer registration
void mainWorld.syncResponseCompleteObserverRegistration();

registerBackgroundSettingListeners({ siteAccess, mainWorld });

const starStore = createStarStore(chrome.storage.local);
const handleStarredMessage = createStarredMessagesHandler(starStore);
const forkMessages = createForkMessagesOwner(chrome.storage.local);
const handleCloudSyncMessage = createCloudSyncMessageHandler({
  starStore,
  getAllStarredMessages: starStore.getAll,
  getAllForkNodes: forkMessages.getAllForkNodes,
});

registerBackgroundRuntimeMessages({
  handlePluginMessage: (message, sender) =>
    handlePluginRuntimeMessage(message, sender, {
      syncContentScripts: siteAccess.syncPlugins,
      refreshCatalog: (host, force) => hostCatalogRefresher.refresh(host, { force }),
    }),
  handleGeneratedUiMessage: generatedUiCapture.handle,
  handleNotificationMessage: responseNotifications.handle,
  handleStarredMessage,
  handleForkMessage: forkMessages.handle,
  handleCloudSyncMessage,
  announcements: remoteAnnouncementService,
});
