/**
 * Send Behavior Module
 *
 * Turns the three legacy send switches into registrations on the page's send
 * key coordinator (`core/services/composer/sendKeys`), which owns the key
 * handling, listeners and observer:
 *
 * 1. Gemini Ctrl+Enter Send (`gvCtrlEnterSend`): Enter inserts a newline,
 *    Ctrl/Cmd+Enter sends.
 * 2. AI Studio Enter Send (`gvAIStudioEnterSend`): Enter sends, Ctrl/Cmd+Enter
 *    inserts a newline.
 * 3. Safari Enter Fix (`gvSafariEnterFix`, Gemini on Safari only): a single
 *    Enter clicks send, bypassing Safari's double-Enter bug.
 *
 * If both Gemini modes are on, Ctrl+Enter Send wins; the coordinator enforces
 * that. With every mode off nothing listens to the page; only the storage
 * listener stays to follow the switches.
 */
import {
  type SendKeyCoordinator,
  createSendKeyCoordinator,
  getSendKeyCoordinator,
} from '@/core/services/composer/sendKeys/sendKeyCoordinator';
import { StorageKeys } from '@/core/types/common';
import { isExtensionContextInvalidatedError } from '@/core/utils/extensionContext';

const LOG_PREFIX = '[SendBehavior]';
const SOURCE = 'legacy-send-behavior';

type SendBehaviorPlatform = 'gemini' | 'aistudio';

const SETTING_KEYS = [
  StorageKeys.CTRL_ENTER_SEND,
  StorageKeys.AISTUDIO_ENTER_SEND,
  StorageKeys.SAFARI_ENTER_FIX,
] as const;
type SettingKey = (typeof SETTING_KEYS)[number];

/**
 * Initialize the send behavior module
 * @returns A cleanup function to be called on unmount
 */
export async function startSendBehavior(
  platform: SendBehaviorPlatform = 'gemini',
): Promise<() => void> {
  // The content script creates the page coordinator; without one (tests,
  // a start before that wiring) this module runs a private one and stops it.
  const shared = getSendKeyCoordinator(platform);
  const coordinator: SendKeyCoordinator = shared ?? createSendKeyCoordinator(platform);

  const enabled: Record<SettingKey, boolean> = {
    [StorageKeys.CTRL_ENTER_SEND]: false,
    [StorageKeys.AISTUDIO_ENTER_SEND]: false,
    [StorageKeys.SAFARI_ENTER_FIX]: false,
  };
  const revisions: Record<SettingKey, number> = {
    [StorageKeys.CTRL_ENTER_SEND]: 0,
    [StorageKeys.AISTUDIO_ENTER_SEND]: 0,
    [StorageKeys.SAFARI_ENTER_FIX]: 0,
  };
  let stopped = false;
  let releaseMainMode: (() => void) | null = null;
  let releaseSafariFallback: (() => void) | null = null;

  const syncRegistrations = (): void => {
    if (stopped) return;
    const wantsMainMode =
      platform === 'aistudio'
        ? enabled[StorageKeys.AISTUDIO_ENTER_SEND]
        : enabled[StorageKeys.CTRL_ENTER_SEND];
    if (wantsMainMode && !releaseMainMode) {
      releaseMainMode = coordinator.registerMainMode({
        source: SOURCE,
        mode: platform === 'aistudio' ? 'enterSends' : 'ctrlEnterSends',
      });
    } else if (!wantsMainMode && releaseMainMode) {
      releaseMainMode();
      releaseMainMode = null;
    }

    const wantsSafariFallback = platform === 'gemini' && enabled[StorageKeys.SAFARI_ENTER_FIX];
    if (wantsSafariFallback && !releaseSafariFallback) {
      releaseSafariFallback = coordinator.registerSafariFallback({ source: SOURCE });
    } else if (!wantsSafariFallback && releaseSafariFallback) {
      releaseSafariFallback();
      releaseSafariFallback = null;
    }
  };

  const stop = (): void => {
    if (stopped) return;
    stopped = true;
    releaseMainMode?.();
    releaseSafariFallback?.();
    releaseMainMode = null;
    releaseSafariFallback = null;
    try {
      chrome.storage?.onChanged?.removeListener(storageListener);
    } catch {
      // Ignore cleanup errors
    }
    if (!shared) coordinator.stop();
  };

  const storageListener = (
    changes: Record<string, chrome.storage.StorageChange>,
    areaName: string,
  ): void => {
    if (areaName !== 'sync') return;
    let changed = false;
    for (const key of SETTING_KEYS) {
      if (!(key in changes)) continue;
      enabled[key] = changes[key].newValue === true;
      revisions[key] += 1;
      changed = true;
    }
    if (changed) syncRegistrations();
  };

  // Follow changes first so none is missed while the startup read is in flight.
  try {
    chrome.storage?.onChanged?.addListener(storageListener);
  } catch (error) {
    if (!isExtensionContextInvalidatedError(error)) {
      console.warn(LOG_PREFIX, 'Failed to setup storage listener:', error);
    }
  }

  await new Promise<void>((resolve) => {
    const revisionsAtRead = { ...revisions };
    try {
      if (!chrome.storage?.sync?.get) {
        resolve();
        return;
      }
      chrome.storage.sync.get(
        {
          [StorageKeys.CTRL_ENTER_SEND]: false,
          [StorageKeys.AISTUDIO_ENTER_SEND]: false,
          [StorageKeys.SAFARI_ENTER_FIX]: false,
        },
        (result) => {
          for (const key of SETTING_KEYS) {
            // A switch flipped while the read was in flight is newer than the read.
            if (revisions[key] === revisionsAtRead[key]) enabled[key] = result?.[key] === true;
          }
          resolve();
        },
      );
    } catch (error) {
      if (!isExtensionContextInvalidatedError(error)) {
        console.warn(LOG_PREFIX, 'Failed to load settings:', error);
      }
      resolve();
    }
  });
  // A start still running in a retired content script finds the page's
  // coordinator stopped, before or during its read. Its stop goes to a cleanup
  // manager that already ran, so it unsubscribes itself here.
  if (shared?.isStopped()) {
    stop();
    return stop;
  }
  syncRegistrations();

  return stop;
}
