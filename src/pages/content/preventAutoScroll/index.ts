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

    const result = await chrome.storage?.sync?.get({ gvPreventAutoScrollEnabled: false });

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
