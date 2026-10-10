/**
 * One owner for every write to plugin storage: `PLUGINS_STATE` (enable state,
 * settings) and `PLUGIN_LOCAL_MANIFESTS`. Both are whole-map read-modify-writes,
 * so an unserialized writer that read the map before a local-plugin re-import
 * would write back the old `enabled: true` over the new, unreviewed version.
 *
 * The `gv-local-plugins` Web Lock is shared by every extension-origin context
 * (popups, options, the background worker). A content script's `navigator.locks`
 * belongs to the page's origin, so content scripts never write plugin state
 * themselves: they ask the background (`requestPluginSetting`).
 *
 * Web Locks are not reentrant: never call a locked writer from inside the lock.
 */
const LOCK_NAME = 'gv-local-plugins';

interface LockManagerLike {
  request<T>(name: string, callback: () => Promise<T>): Promise<T>;
}

/** Same-context fallback where Web Locks are missing (tests, old engines). */
let fallbackChain: Promise<unknown> = Promise.resolve();

/** Run one plugin-storage mutation at a time across every context sharing the lock. */
export function withPluginStorageLock<T>(work: () => Promise<T>): Promise<T> {
  const locks = (globalThis.navigator as { locks?: LockManagerLike } | undefined)?.locks;
  if (locks && typeof locks.request === 'function') return locks.request(LOCK_NAME, work);
  const run = fallbackChain.then(work, work);
  fallbackChain = run.catch(() => undefined);
  return run;
}
