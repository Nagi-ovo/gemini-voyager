/**
 * Development-only self-reload for the unpacked `dist_chrome_dev` extension.
 *
 * Chrome keeps running the previous build until the extension is reloaded, and
 * only the extension itself can call `chrome.runtime.reload()`. The Chrome dev
 * build writes `DEV_BUILD_ID_FILE` as its final step (see
 * `devBuildReadyPlugin` in vite.config.chrome.ts), so a changed id means a
 * complete bundle is on disk. Unpacked extension files are served from disk,
 * so fetching the file sees each new build.
 *
 * A periodic alarm wakes the service worker: alarms have no minimum period for
 * unpacked extensions. The last seen id lives in `chrome.storage.session`,
 * which survives idle service-worker restarts but is cleared by a reload, so
 * the first observation after a reload is recorded instead of reloading again.
 *
 * Chrome only re-enables a self-reloaded unpacked extension while Developer
 * mode is on; otherwise it is disabled as an unsupported developer extension.
 *
 * Callers must guard `startDevAutoReload()` with
 * `import.meta.env.VOYAGER_DEV_AUTO_RELOAD` so production bundles drop it.
 * Open tabs are never reloaded: that could discard a half-typed message.
 */

export const DEV_BUILD_ID_FILE = '.voyager-build-ready';

const DEV_AUTO_RELOAD_ALARM = 'gv-dev-auto-reload';
const DEV_BUILD_ID_SESSION_KEY = 'gvDevAutoReloadBuildId';
const DEV_AUTO_RELOAD_PERIOD_MINUTES = 1 / 60;
const DEV_BUILD_ID_PATTERN = /^[\w.-]{1,128}$/;

export type DevBuildIdAction = 'ignore' | 'record' | 'reload';

/**
 * Decide what to do with a freshly read build id. An unreadable id never
 * reloads, and the first id seen in a session is only recorded.
 */
export function resolveDevBuildIdAction(
  previousId: string | undefined,
  currentId: string | null,
): DevBuildIdAction {
  if (currentId === null) return 'ignore';
  if (previousId === undefined) return 'record';
  return previousId === currentId ? 'ignore' : 'reload';
}

export function parseDevBuildId(raw: string): string | null {
  const id = raw.trim();
  return DEV_BUILD_ID_PATTERN.test(id) ? id : null;
}

async function readCurrentBuildId(): Promise<string | null> {
  try {
    const response = await fetch(chrome.runtime.getURL(DEV_BUILD_ID_FILE), { cache: 'no-store' });
    if (!response.ok) return null;
    return parseDevBuildId(await response.text());
  } catch {
    return null;
  }
}

let checkInFlight = false;

async function checkForNewBuild(): Promise<void> {
  if (checkInFlight) return;
  checkInFlight = true;
  try {
    const currentId = await readCurrentBuildId();
    const stored = await chrome.storage.session.get(DEV_BUILD_ID_SESSION_KEY);
    const storedId = stored[DEV_BUILD_ID_SESSION_KEY];
    const previousId = typeof storedId === 'string' ? storedId : undefined;
    const action = resolveDevBuildIdAction(previousId, currentId);
    if (action === 'ignore' || currentId === null) return;

    // Record before reloading so a reload can never be triggered twice by the
    // same id, even if session storage outlived the reload.
    await chrome.storage.session.set({ [DEV_BUILD_ID_SESSION_KEY]: currentId });
    if (action === 'record') {
      console.warn(
        `[Voyager dev] Auto-reload is watching build ${currentId}. ` +
          'Tabs opened before the latest reload still run old content scripts; refresh them manually.',
      );
      return;
    }
    chrome.runtime.reload();
  } catch {
    // A transient storage or fetch failure is retried on the next alarm.
  } finally {
    checkInFlight = false;
  }
}

export function startDevAutoReload(): void {
  chrome.alarms.onAlarm.addListener((alarm) => {
    if (alarm.name === DEV_AUTO_RELOAD_ALARM) void checkForNewBuild();
  });
  void chrome.alarms
    .create(DEV_AUTO_RELOAD_ALARM, { periodInMinutes: DEV_AUTO_RELOAD_PERIOD_MINUTES })
    .catch(() => undefined);
  void checkForNewBuild();
}
