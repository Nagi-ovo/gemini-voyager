import browser from 'webextension-polyfill';

/**
 * Write to sync storage and report whether the write landed. Keeps the popup's
 * polyfill-first path and its callback API fallback, which checks
 * `runtime.lastError` instead of assuming success.
 */
export async function writePopupSyncStorageChecked(
  payload: Record<string, unknown>,
): Promise<boolean> {
  try {
    await browser.storage.sync.set(payload);
    return true;
  } catch {
    // The polyfill may be unavailable in this extension-page context.
  }
  return new Promise<boolean>((resolve) => {
    try {
      const sync = chrome.storage?.sync;
      if (!sync) {
        resolve(false);
        return;
      }
      sync.set(payload, () => resolve(!chrome.runtime?.lastError));
    } catch {
      resolve(false);
    }
  });
}

/** Preserve the popup's polyfill-first storage path and callback API fallback. */
export async function writePopupSyncStorage(payload: Record<string, unknown>): Promise<void> {
  await writePopupSyncStorageChecked(payload);
}
