import { StorageKeys } from '@/core/types/common';
import { getVoyagerBuildTarget } from '@/core/utils/browser';
import { isExtensionContextInvalidatedError } from '@/core/utils/extensionContext';

const GV_BRIDGE_ID = 'gv-prevent-auto-scroll-bridge';

function getBridgeElement(): HTMLElement {
  let bridge = document.getElementById(GV_BRIDGE_ID);
  if (!bridge) {
    bridge = document.createElement('div');
    bridge.id = GV_BRIDGE_ID;
    bridge.style.display = 'none';
    document.documentElement.appendChild(bridge);
  }
  return bridge;
}

function notifyScript(settings: { ctrlEnterSend?: boolean; enabled?: boolean }): void {
  const bridge = getBridgeElement();
  if (typeof settings.enabled === 'boolean') {
    bridge.dataset.enabled = String(settings.enabled);
  }
  if (typeof settings.ctrlEnterSend === 'boolean') {
    bridge.dataset.ctrlEnterSend = String(settings.ctrlEnterSend);
  }
}

function injectScript(): void {
  // Safari loads the page-world bridge through a native MAIN-world manifest
  // entry because Gemini's CSP blocks extension <script> elements.
  if (getVoyagerBuildTarget() === 'safari') return;

  const scriptId = 'gv-prevent-auto-scroll-script';
  if (document.getElementById(scriptId)) return;

  const script = document.createElement('script');
  script.id = scriptId;
  script.src = chrome.runtime.getURL('prevent-auto-scroll.js');
  script.onload = () => {
    script.remove(); // Clean up after injection
  };
  (document.head || document.documentElement).appendChild(script);
}

export async function startPreventAutoScroll(): Promise<void> {
  try {
    getBridgeElement();

    const result = await chrome.storage?.sync?.get({
      [StorageKeys.PREVENT_AUTO_SCROLL_ENABLED]: false,
      [StorageKeys.CTRL_ENTER_SEND]: false,
    });
    notifyScript({
      enabled: result?.[StorageKeys.PREVENT_AUTO_SCROLL_ENABLED] === true,
      ctrlEnterSend: result?.[StorageKeys.CTRL_ENTER_SEND] === true,
    });
    injectScript();

    chrome.storage.onChanged.addListener((changes, area) => {
      if (area !== 'sync') return;
      if (changes[StorageKeys.PREVENT_AUTO_SCROLL_ENABLED]) {
        notifyScript({
          enabled: changes[StorageKeys.PREVENT_AUTO_SCROLL_ENABLED].newValue === true,
        });
      }
      if (changes[StorageKeys.CTRL_ENTER_SEND]) {
        notifyScript({
          ctrlEnterSend: changes[StorageKeys.CTRL_ENTER_SEND].newValue === true,
        });
      }
    });
  } catch (error) {
    if (isExtensionContextInvalidatedError(error)) {
      return;
    }
    console.error('[Gemini Voyager] Prevent auto scroll initialization failed:', error);
  }
}
