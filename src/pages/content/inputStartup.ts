/**
 * Start points of the Gemini / AI Studio input chain: the page's send-key
 * coordinator, input collapse and prompt history. Collapse and history ask the
 * owner table whether their native module starts here or their packaged
 * official plugin is admitted instead.
 *
 * Input collapse follows its popup switch live while the native module owns
 * it: the controller exists before the startup read, so a flip that lands
 * during the read wins. Once the plugin owns it, PluginHost follows the
 * switch instead. The "collapse with content" sub-switch is page state under
 * either owner: it is read at startup and lands in place whether or not
 * collapse runs, as the native listener always did, because the public
 * `collapseInput()` reads it while the feature is off too. Page teardown
 * destroys the controller, so a startup read that settles after teardown
 * mounts nothing.
 *
 * Prompt history keeps its own switch listener inside the native module.
 */
import { startSendKeyCoordinator } from '@/core/services/composer/sendKeys/sendKeyCoordinator';
import type { SendSiteId } from '@/core/services/composer/sendKeys/sendSitePolicies';
import { CleanupPositions } from '@/core/types/cleanupPositions';
import { StorageKeys } from '@/core/types/common';
import type { CleanupManager } from '@/core/utils/cleanupManager';
import type { OfficialAdmissionController } from '@/features/plugins/runtime/officialAdmission';
import { featureOwner } from '@/features/plugins/sites/featureOwners';

import {
  type NativeFeatureToggleController,
  createNativeFeatureToggle,
  mountNativeFeature,
} from './featureLifecycle';
import { type OwnerOf, admitPluginOwnedFeature, startOwnedFeature } from './featureOwnerStartup';
import { setCollapseWhenNotEmpty } from './inputCollapse/runtime';
import { NATIVE_FEATURES } from './nativeFeatures';

type StorageChanges = Parameters<NativeFeatureToggleController['handleChange']>[0];

/**
 * The send-key site of a host where the native send behavior mounts:
 * gemini.google.com and both AI Studio hosts. Gemini Enterprise on its own
 * host never mounts it, so it gets no coordinator; Enterprise on
 * gemini.google.com gets one with no registrant, which attaches nothing.
 */
export function sendKeySiteForHost(hostname: string): SendSiteId | null {
  if (hostname === 'gemini.google.com') return 'gemini';
  if (hostname === 'aistudio.google.com' || hostname === 'aistudio.google.cn') return 'aistudio';
  return null;
}

/**
 * Create the page's send-key coordinator before anything can register on it
 * (the plugin host, the native send behavior), and stop it on teardown after
 * every registrant. Catalog sites get none: `sendShortcut` listens itself.
 */
export function startPageSendKeys(hostname: string, cleanupManager: CleanupManager): void {
  const site = sendKeySiteForHost(hostname);
  if (!site) return;
  cleanupManager.registerCleanupFunction(
    startSendKeyCoordinator(site).stop,
    CleanupPositions.CleanupSendKeyCoordinator,
  );
}

interface StoredInputCollapse {
  readonly enabled: boolean;
  readonly whenNotEmpty: boolean;
}

/**
 * The startup reading of both collapse keys. A failed read, an invalidated
 * extension context included, reads as missing keys: both off.
 */
async function readInputCollapseSettings(): Promise<StoredInputCollapse> {
  const toggle = NATIVE_FEATURES.inputCollapse.toggle;
  const off: StoredInputCollapse = { enabled: false, whenNotEmpty: false };
  try {
    const sync = (globalThis as { chrome?: typeof chrome }).chrome?.storage?.sync;
    if (!sync) return off;
    const stored = await sync.get<Record<string, unknown>>([
      toggle.key,
      StorageKeys.INPUT_COLLAPSE_WHEN_NOT_EMPTY,
    ]);
    return {
      enabled: toggle.isEnabled(stored?.[toggle.key]),
      whenNotEmpty: stored?.[StorageKeys.INPUT_COLLAPSE_WHEN_NOT_EMPTY] === true,
    };
  } catch {
    return off;
  }
}

export interface GeminiInputStartup {
  /** Input collapse, where the native module used to start on every Gemini page. */
  startInputCollapse(): Promise<void>;
  /** Prompt history, in the parallel storage-hydration group. */
  startPromptHistory(): Promise<void>;
  /** Drafts hydrate in the same parallel slice as the native module did. */
  startDraftSave(): Promise<void>;
  /** Route `chrome.storage.onChanged` to input collapse: its sub-switch always, its switch while native. */
  handleStorageChange(changes: StorageChanges, areaName: string): void;
}

export function createGeminiInputStartup(
  admission: OfficialAdmissionController,
  cleanupManager: CleanupManager,
  ownerOf: OwnerOf = featureOwner,
): GeminiInputStartup {
  let collapseToggle: NativeFeatureToggleController | null = null;
  let collapseStarted = false;
  let stopped = false;
  let whenNotEmptyChangedLive = false;
  const applyStoredWhenNotEmpty = (stored: StoredInputCollapse): void => {
    if (!stopped && !whenNotEmptyChangedLive) setCollapseWhenNotEmpty(stored.whenNotEmpty);
  };
  // A mounted collapse's own stop sits at its cleanup position; this only keeps
  // a late startup read from mounting after teardown ran.
  cleanupManager.registerCleanupFunction(() => {
    stopped = true;
    collapseToggle?.destroy();
    collapseToggle = null;
  }, CleanupPositions.CleanupInputStartup);

  return {
    async startInputCollapse() {
      if (stopped) return;
      collapseStarted = true;
      await startOwnedFeature(
        admission,
        'gemini',
        'inputCollapse',
        async () => {
          const toggle = createNativeFeatureToggle(cleanupManager, NATIVE_FEATURES.inputCollapse);
          collapseToggle = toggle;
          const stored = await readInputCollapseSettings();
          applyStoredWhenNotEmpty(stored);
          await toggle.applyInitial(stored.enabled);
        },
        ownerOf,
      );
      // The plugin gets the sub-switch only while mounted; the page keeps it for `collapseInput()`.
      if (ownerOf('gemini', 'inputCollapse') === 'plugin') {
        applyStoredWhenNotEmpty(await readInputCollapseSettings());
      }
    },
    startDraftSave: () =>
      startOwnedFeature(
        admission,
        'gemini',
        'draftSave',
        async () => {
          await mountNativeFeature(cleanupManager, NATIVE_FEATURES.draftSave);
        },
        ownerOf,
      ),
    startPromptHistory: () =>
      startOwnedFeature(
        admission,
        'gemini',
        'promptHistory',
        async () => {
          await mountNativeFeature(cleanupManager, NATIVE_FEATURES.promptHistory);
        },
        ownerOf,
      ),
    handleStorageChange(changes, areaName) {
      if (!collapseStarted || stopped) return;
      if (areaName === 'sync' && StorageKeys.INPUT_COLLAPSE_WHEN_NOT_EMPTY in changes) {
        whenNotEmptyChangedLive = true;
        setCollapseWhenNotEmpty(
          changes[StorageKeys.INPUT_COLLAPSE_WHEN_NOT_EMPTY]?.newValue === true,
        );
      }
      collapseToggle?.handleChange(changes, areaName);
    },
  };
}

/** Both Gemini send features share one legacy registration and must flip together. */
export async function startGeminiSendKeys(
  admission: OfficialAdmissionController,
  startLegacy: () => Promise<unknown>,
  ownerOf: OwnerOf = featureOwner,
): Promise<void> {
  const owner = ownerOf('gemini', 'ctrlEnterSend');
  if (owner !== ownerOf('gemini', 'safariEnterFix')) {
    throw new Error('Gemini send features must share one owner');
  }
  if (owner === 'legacy') await startLegacy();
  else {
    admission.admit('gemini', 'ctrlEnterSend');
    admission.admit('gemini', 'safariEnterFix');
  }
}

/** Admit while the master is off so switching it back on can mount without a reload. */
export async function startAIStudioSendKeys(
  admission: OfficialAdmissionController,
  startLegacy: () => Promise<unknown>,
  masterEnabled: boolean,
  ownerOf: OwnerOf = featureOwner,
): Promise<void> {
  if (!masterEnabled) {
    admitPluginOwnedFeature(admission, 'aistudio', 'enterSend', ownerOf);
    return;
  }
  await startOwnedFeature(
    admission,
    'aistudio',
    'enterSend',
    async () => {
      await startLegacy();
    },
    ownerOf,
  );
}
