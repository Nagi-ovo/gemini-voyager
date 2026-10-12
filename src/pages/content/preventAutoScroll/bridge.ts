import { StorageKeys } from '@/core/types/common';
import { getVoyagerBuildTarget } from '@/core/utils/browser';
import { isExtensionContextInvalidatedError } from '@/core/utils/extensionContext';

import type { StopNativeFeature } from '../featureLifecycle';
import { followGeminiSendKey } from '../sendBehavior/followSendKey';

/** Must match `public/prevent-auto-scroll.js`, which reads it on every check. */
const GV_BRIDGE_ID = 'gv-prevent-auto-scroll-bridge';
const GV_SCRIPT_ID = 'gv-prevent-auto-scroll-script';
const LOG_PREFIX = '[Gemini Voyager] Prevent auto scroll';

type StorageListener = (
  changes: Record<string, chrome.storage.StorageChange>,
  areaName: string,
) => void;

function getBridgeElement(): HTMLElement {
  let bridge = document.getElementById(GV_BRIDGE_ID);
  if (!bridge) {
    bridge = document.createElement('div');
    bridge.id = GV_BRIDGE_ID;
    bridge.style.display = 'none';
    bridge.dataset.enabled = 'false';
    document.documentElement.appendChild(bridge);
  }
  return bridge;
}

function injectScript(): HTMLScriptElement | null {
  // Safari loads the page-world bridge through a native MAIN-world manifest
  // entry because Gemini's CSP blocks extension <script> elements.
  if (getVoyagerBuildTarget() === 'safari') return null;
  if (document.getElementById(GV_SCRIPT_ID)) return null;

  const script = document.createElement('script');
  script.id = GV_SCRIPT_ID;
  script.src = chrome.runtime.getURL('prevent-auto-scroll.js');
  script.onload = () => {
    script.remove(); // Clean up after injection
  };
  (document.head || document.documentElement).appendChild(script);
  return script;
}

function writeCtrlEnterSend(enabled: boolean): void {
  getBridgeElement().dataset.ctrlEnterSend = String(enabled);
}

/**
 * The page-level half of prevent-auto-scroll: the bridge element, the MAIN
 * script (injected on every non-Safari page whatever the switch says) and the
 * `data-ctrl-enter-send` field it also reads. `data-enabled` belongs to
 * `claimPreventAutoScroll`.
 *
 * The MAIN script cannot be uninstalled once it wrapped the history API, so
 * stop only stops following storage. It leaves the element in place: the next
 * content-script copy reuses the same id, and removing it would switch that
 * copy off.
 */
export function startPreventAutoScrollBridge(): StopNativeFeature {
  let stopped = false;
  let liveRevision = 0;
  let script: HTMLScriptElement | null = null;
  const effectiveSendKey = followGeminiSendKey((key) => {
    writeCtrlEnterSend(key === 'ctrlEnter');
  });

  try {
    getBridgeElement();
    script = injectScript();
  } catch (error) {
    if (!isExtensionContextInvalidatedError(error)) {
      console.error(`${LOG_PREFIX} bridge setup failed:`, error);
    }
  }

  const listener: StorageListener = (changes, areaName) => {
    if (stopped || areaName !== 'sync') return;
    const change = changes[StorageKeys.CTRL_ENTER_SEND];
    if (!change) return;
    liveRevision += 1;
    if (!effectiveSendKey.isFollowing()) writeCtrlEnterSend(change.newValue === true);
  };

  try {
    chrome.storage?.onChanged?.addListener(listener);
  } catch (error) {
    if (!isExtensionContextInvalidatedError(error)) {
      console.error(`${LOG_PREFIX} storage listener failed:`, error);
    }
  }

  const readRevision = liveRevision;
  void (async () => {
    try {
      const result = await chrome.storage?.sync?.get({ [StorageKeys.CTRL_ENTER_SEND]: false });
      // A change that landed during the read is newer than the read.
      if (stopped || liveRevision !== readRevision || effectiveSendKey.isFollowing()) return;
      writeCtrlEnterSend(result?.[StorageKeys.CTRL_ENTER_SEND] === true);
    } catch (error) {
      if (isExtensionContextInvalidatedError(error)) return;
      console.error(`${LOG_PREFIX} initial read failed:`, error);
    }
  })();

  return () => {
    if (stopped) return;
    stopped = true;
    effectiveSendKey.stop();
    try {
      chrome.storage?.onChanged?.removeListener(listener);
    } catch {
      // The extension may have been reloaded while the page stayed open.
    }
    // A tag that has not loaded yet still runs once inserted; only the node goes.
    script?.remove();
  };
}

let currentClaim: symbol | null = null;

/**
 * Switch the MAIN script's prevention on and hand back its release. Only the
 * newest claim's release switches it off: a stale owner stopping late must
 * not undo a newer one.
 */
export function claimPreventAutoScroll(): () => void {
  const claim = Symbol('prevent-auto-scroll');
  currentClaim = claim;
  getBridgeElement().dataset.enabled = 'true';

  return () => {
    if (currentClaim !== claim) return;
    currentClaim = null;
    // Do not create a bridge just to switch it off.
    const bridge = document.getElementById(GV_BRIDGE_ID);
    if (bridge) bridge.dataset.enabled = 'false';
  };
}
