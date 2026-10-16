/**
 * Development-only settings bridge for the unpacked `dist_chrome_dev` build.
 *
 * An agent driving the browser can run scripts in the page but cannot open the
 * popup (extension pages are out of its reach), so it could not turn a setting
 * on to verify it. Page scripts post a request here and the content script,
 * which can reach extension storage, applies it:
 *
 *   window.postMessage({ source: 'gv-dev-settings', id: 1, action: 'set',
 *     values: { gvResponseCompleteNotificationEnabled: true } }, location.origin);
 *
 * `get` reads the listed keys (every known key when `keys` is omitted), and
 * `remove` deletes them, which is how a never-set setting is reproduced. `area`
 * is `'sync'` (default) or `'local'`. The reply is posted back with source
 * `'gv-dev-settings-result'` and the same `id`. Writes reach storage only:
 * popup-side steps such as permission prompts do not run.
 *
 * Any script on the page can post here, so only `StorageKeys` values are
 * accepted, and callers must guard `startDevSettingsBridge()` with
 * `import.meta.env.VOYAGER_DEV_SETTINGS_BRIDGE` so production bundles drop it.
 */
import { StorageKeys } from '@/core/types/common';
import { hasValidExtensionContext } from '@/core/utils/extensionContext';

export const DEV_SETTINGS_REQUEST_SOURCE = 'gv-dev-settings';
export const DEV_SETTINGS_RESULT_SOURCE = 'gv-dev-settings-result';

const KNOWN_KEYS: readonly string[] = Object.values(StorageKeys);

type Area = 'sync' | 'local';

export type DevSettingsResult =
  | { ok: true; values?: Record<string, unknown> }
  | { ok: false; error: string };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function unknownKeys(keys: string[]): string[] {
  return keys.filter((key) => !KNOWN_KEYS.includes(key));
}

export async function handleDevSettingsRequest(
  request: Record<string, unknown>,
): Promise<DevSettingsResult> {
  const area: Area | null =
    request.area === undefined || request.area === 'sync'
      ? 'sync'
      : request.area === 'local'
        ? 'local'
        : null;
  if (!area) return { ok: false, error: 'area must be "sync" or "local"' };
  const storage: chrome.storage.StorageArea = chrome.storage[area];

  if (request.action === 'get' || request.action === 'remove') {
    const removing = request.action === 'remove';
    const keys =
      request.keys === undefined && !removing
        ? [...KNOWN_KEYS]
        : Array.isArray(request.keys) && request.keys.every((key) => typeof key === 'string')
          ? request.keys
          : null;
    if (!keys) return { ok: false, error: 'keys must be a list of setting names' };
    const rejected = unknownKeys(keys);
    if (rejected.length) return { ok: false, error: `unknown keys: ${rejected.join(', ')}` };
    if (!removing) return { ok: true, values: await storage.get<Record<string, unknown>>(keys) };
    await storage.remove(keys);
    return { ok: true };
  }

  if (request.action === 'set') {
    if (!isRecord(request.values)) return { ok: false, error: 'values must be an object' };
    const rejected = unknownKeys(Object.keys(request.values));
    if (rejected.length) return { ok: false, error: `unknown keys: ${rejected.join(', ')}` };
    await storage.set(request.values);
    return { ok: true };
  }

  return { ok: false, error: 'action must be "get", "set" or "remove"' };
}

export function startDevSettingsBridge(): () => void {
  const onMessage = (event: MessageEvent): void => {
    if (event.source !== window) return;
    const request: unknown = event.data;
    if (!isRecord(request) || request.source !== DEV_SETTINGS_REQUEST_SOURCE) return;
    // A content script orphaned by an extension reload stays silent and leaves the reply to the live one.
    if (!hasValidExtensionContext()) return;
    void handleDevSettingsRequest(request)
      .catch((error: unknown): DevSettingsResult => ({ ok: false, error: String(error) }))
      .then((result) =>
        window.postMessage(
          { source: DEV_SETTINGS_RESULT_SOURCE, id: request.id, ...result },
          location.origin,
        ),
      );
  };
  window.addEventListener('message', onMessage);
  return () => window.removeEventListener('message', onMessage);
}
