import { BUILTIN_PLUGINS } from '@/features/plugins/builtin';
import { bundledNativePluginIds } from '@/features/plugins/sources/bundledNativePluginIds';

/** Only shipped consumers own dedicated controls; a remote manifest cannot claim them. */
export const DEDICATED_TIMELINE_SOURCES: ReadonlyMap<string, readonly string[]> = new Map([
  ...[...bundledNativePluginIds('turnNavigator')].map((id): [string, readonly string[]] => [
    id,
    ['bundled-catalog', 'host-catalog'],
  ]),
  ...BUILTIN_PLUGINS.filter((plugin) =>
    plugin.contributes.domOps?.some((op) => op.op === 'native' && op.handler === 'turnNavigator'),
  ).map((plugin): [string, readonly string[]] => [plugin.id, ['builtin']]),
]);
