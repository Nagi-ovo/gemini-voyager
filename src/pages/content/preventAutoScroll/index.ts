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

function notifyScript(enabled: boolean): void {
  const bridge = getBridgeElement();
  bridge.dataset.enabled = String(enabled);
}

function injectScript(): void {
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
    // Initialize bridge element first
    getBridgeElement();

    // Check if feature is enabled, default to true or false?
    // Probably default to true since it's a helpful feature, but typically
    // we let user turn it on/off in popup.
    const result = await chrome.storage?.sync?.get({ gvPreventAutoScrollEnabled: false });
    const isEnabled = result?.gvPreventAutoScrollEnabled !== false; // wait, if default is false, then !== false is true...
    // Let's set default to false for new feature to not surprise users unless they turn it on.

    // Ah, wait. Usually settings default to false or true.
    // Let's make it default to false so they have to opt-in, or true if requested.
    // The user requested: "I hope we can have a feature to prevent jump". Let's make it default false to be safe.

    // Wait, let's fix the logic:
    // const isEnabled = result?.gvPreventAutoScrollEnabled === true;

    notifyScript(result?.gvPreventAutoScrollEnabled === true);
    injectScript();

    // Listen for storage changes to update the bridge dynamically
    chrome.storage.onChanged.addListener((changes, area) => {
      if (area === 'sync' && changes.gvPreventAutoScrollEnabled) {
        notifyScript(changes.gvPreventAutoScrollEnabled.newValue === true);
      }
    });

    console.log('[Gemini Voyager] Prevent auto scroll initialized');
  } catch (error) {
    if (isExtensionContextInvalidatedError(error)) {
      return;
    }
    console.error('[Gemini Voyager] Prevent auto scroll initialization failed:', error);
  }
}
