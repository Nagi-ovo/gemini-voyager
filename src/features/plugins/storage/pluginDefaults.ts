/**
 * Whether a plugin is on, given the stored state map.
 *
 * `PLUGINS_STATE` records only explicit choices: an entry appears when the user
 * flips a plugin (or one of its settings). Every other plugin is off, except the
 * builtins listed here, which are on until the user turns them off. An explicit
 * `enabled: false` always wins, so a default never overrides a choice.
 *
 * A default enables nothing by itself on a plugin site: the background still
 * registers the content script only for origins the user has granted, and the
 * popup offers the grant for an enabled plugin that lacks it.
 */
export const DEFAULT_ENABLED_PLUGIN_IDS: ReadonlySet<string> = new Set(['voyager.chatgpt-folders']);

type EnabledStateMap = Readonly<Record<string, { readonly enabled?: unknown } | undefined>>;

export function isPluginEnabled(state: EnabledStateMap, id: string): boolean {
  const entry = Object.prototype.hasOwnProperty.call(state, id) ? state[id] : undefined;
  const enabled = entry?.enabled;
  if (typeof enabled === 'boolean') return enabled;
  return DEFAULT_ENABLED_PLUGIN_IDS.has(id);
}
