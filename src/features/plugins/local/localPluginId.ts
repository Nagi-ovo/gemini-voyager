/**
 * The `local.*` id namespace of user-imported plugins.
 *
 * Every local plugin id starts with `local.`, and no builtin, bundled or remote
 * plugin may use that prefix (`mergePluginRecords` drops one, `plugin:check`
 * rejects one). Enable state and settings in `storage/pluginState.ts` are keyed
 * by id, so the two sets can never collide. Data only: the catalog scripts
 * import this under Bun.
 */
export const LOCAL_PLUGIN_ID_PREFIX = 'local.';

/** Source id of `LocalPluginSource`; also the diagnostics source label. */
export const LOCAL_PLUGIN_SOURCE_ID = 'local';

const MAX_LOCAL_ID_LENGTH = 100;
/** Reverse-dotted slug: letters, digits, `.`, `_`, `-`; starts and ends alphanumeric. */
const ID_SLUG = /^[a-z0-9](?:[a-z0-9._-]*[a-z0-9])?$/;

export function isLocalPluginId(id: string): boolean {
  return id.startsWith(LOCAL_PLUGIN_ID_PREFIX);
}

/**
 * Map an authored id into the local namespace: `vendor.tweak` becomes
 * `local.vendor.tweak`, an id already under `local.` is kept. Returns null for
 * an id that is not a lowercase reverse-dotted slug.
 */
export function toLocalPluginId(id: string): string | null {
  const trimmed = id.trim();
  const namespaced = isLocalPluginId(trimmed) ? trimmed : `${LOCAL_PLUGIN_ID_PREFIX}${trimmed}`;
  const slug = namespaced.slice(LOCAL_PLUGIN_ID_PREFIX.length);
  if (namespaced.length > MAX_LOCAL_ID_LENGTH || !ID_SLUG.test(slug)) return null;
  return namespaced;
}
