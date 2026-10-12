import { getVoyagerBuildTarget } from '@/core/utils/browser';
import { isExtensionContextInvalidatedError } from '@/core/utils/extensionContext';

const LOG_PREFIX = '[ResponseNotification]';
const PAGE_OBSERVER_SCRIPT_ID = 'gv-response-complete-observer-script';

// The MAIN-world observer guards its own install, so one injection serves
// every run of this script instance.
let pageObserverInjected = false;

export function injectPageObserver(): void {
  if (pageObserverInjected) return;
  if (getVoyagerBuildTarget() === 'safari') {
    pageObserverInjected = true;
    return;
  }
  if (document.getElementById(PAGE_OBSERVER_SCRIPT_ID)) {
    pageObserverInjected = true;
    return;
  }

  try {
    const script = document.createElement('script');
    script.id = PAGE_OBSERVER_SCRIPT_ID;
    script.src = chrome.runtime.getURL('response-complete-observer.js');
    script.async = false;
    (document.documentElement || document.head || document.body).appendChild(script);
    script.remove();
    pageObserverInjected = true;
  } catch (error) {
    if (isExtensionContextInvalidatedError(error)) {
      return;
    }
    console.warn(LOG_PREFIX, 'Failed to inject page observer:', error);
  }
}
