import type { PluginManifest } from '@/features/plugins/types';

import type { PopupSettingsSearchItem } from '../utils/popupSettingsSearchIndex';
import type { OfficialPluginEntry } from './officialPluginRegistry';

export interface ListedOfficialPlugin {
  readonly entry: OfficialPluginEntry;
  readonly manifest: PluginManifest;
}

/** The manifest's name and description in every language it ships. */
function manifestSearchText(manifest: PluginManifest): string[] {
  const localized = Object.values(manifest.i18n ?? {}).flatMap((strings) => [
    strings.name,
    strings.description,
  ]);
  return [manifest.name, manifest.description, ...localized].filter(
    (text): text is string => typeof text === 'string' && text.length > 0,
  );
}

/**
 * One settings-search target per listed row. Built from the rows the list
 * actually shows, so search never finds a plugin this tab doesn't list. The
 * retired settings row's words come along, so an old query finds the row.
 */
export function officialPluginSearchItems(
  listed: readonly ListedOfficialPlugin[],
): PopupSettingsSearchItem[] {
  return listed.map(({ entry, manifest }) => ({
    id: `officialPlugins:${manifest.id}`,
    sectionId: 'officialPlugins',
    settingId: manifest.id,
    keys: entry.searchKeys,
    aliases: [...(entry.searchAliases ?? []), ...manifestSearchText(manifest)],
  }));
}
