/**
 * Usage/history observer loader — an isolated-world content script that runs
 * at document_start, before Gemini captures its own fetch/XHR references.
 *
 * The usage observer is always active. The history observer performs a small
 * ready/configure handshake so message timestamps that are disabled (the
 * default) do not keep cloning and parsing full conversation responses.
 */
export {};

const HISTORY_OBSERVER_SOURCE = 'gv-history-observer';
const HISTORY_OBSERVER_COMMAND_SOURCE = 'gv-history-observer-cmd';
// Keep this document_start entry dependency-free; must match StorageKeys.GV_SHOW_MESSAGE_TIMESTAMPS.
const HISTORY_TIMESTAMP_SETTING_KEY = 'gvShowMessageTimestamps';
const SETTING_RESOLUTION_TIMEOUT_MS = 1_000;

let historyTimestampsEnabled = false;
let settingResolved = false;
let settingChanged = false;
let settingResolutionTimeoutId: number | null = null;

function postHistoryConfiguration(): void {
  // Preserve the observer's bounded `unknown` state until storage resolves;
  // sending a premature false here would lose the eager RPC for enabled users.
  if (!settingResolved) return;
  try {
    window.postMessage(
      {
        source: HISTORY_OBSERVER_COMMAND_SOURCE,
        type: 'configure',
        payload: { enabled: historyTimestampsEnabled },
      },
      window.location.origin,
    );
  } catch {
    // Observer absent or the extension context was invalidated.
  }
}

function clearSettingResolutionTimeout(): void {
  if (settingResolutionTimeoutId === null) return;
  window.clearTimeout(settingResolutionTimeoutId);
  settingResolutionTimeoutId = null;
}

function resolveHistorySetting(enabled: boolean, fromStorageChange: boolean): void {
  if (fromStorageChange) settingChanged = true;
  historyTimestampsEnabled = enabled;
  settingResolved = true;
  clearSettingResolutionTimeout();
  postHistoryConfiguration();
}

const onHistoryObserverMessage = (event: MessageEvent): void => {
  if (event.source !== window || event.origin !== window.location.origin) return;
  const data = event.data as { source?: unknown; type?: unknown } | null;
  if (!data || data.source !== HISTORY_OBSERVER_SOURCE || data.type !== 'ready') return;
  postHistoryConfiguration();
};

const onStorageChanged = (
  changes: Record<string, chrome.storage.StorageChange>,
  areaName: string,
): void => {
  if (areaName !== 'sync') return;
  const change = changes[HISTORY_TIMESTAMP_SETTING_KEY];
  if (!change) return;
  resolveHistorySetting(change.newValue === true, true);
};

window.addEventListener('message', onHistoryObserverMessage);
try {
  chrome.storage?.onChanged?.addListener(onStorageChanged);
} catch {
  // Initial storage read and the fail-closed timeout still configure this page.
}

// Fail closed if a browser storage callback never arrives. A late successful
// callback can still enable captures; this timer only bounds the unknown race.
settingResolutionTimeoutId = window.setTimeout(() => {
  if (!settingResolved) resolveHistorySetting(false, false);
}, SETTING_RESOLUTION_TIMEOUT_MS);

try {
  chrome.storage?.sync?.get(
    { [HISTORY_TIMESTAMP_SETTING_KEY]: false },
    (result: Record<string, unknown>) => {
      // A live setting change is newer than this asynchronous initial read.
      if (settingChanged) return;
      resolveHistorySetting(result[HISTORY_TIMESTAMP_SETTING_KEY] === true, false);
    },
  );
} catch {
  resolveHistorySetting(false, false);
}

for (const src of ['usage-observer.js', 'conversation-history-observer.js']) {
  try {
    const script = document.createElement('script');
    script.src = chrome.runtime.getURL(src);
    script.async = false;
    (document.documentElement || document.head || document.body).appendChild(script);
    script.remove();
  } catch {
    // Usage falls back to DOM scraping; timestamps fall back to first-seen time.
  }
}

window.addEventListener(
  'beforeunload',
  () => {
    clearSettingResolutionTimeout();
    window.removeEventListener('message', onHistoryObserverMessage);
    try {
      chrome.storage?.onChanged?.removeListener(onStorageChanged);
    } catch {
      // Extension context already invalidated.
    }
  },
  { once: true },
);
