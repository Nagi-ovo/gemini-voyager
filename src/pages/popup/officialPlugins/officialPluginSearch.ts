import type { PluginManifest } from '@/features/plugins/types';

import { POPUP_SECTION_SEARCH_SETTING_ID } from '../utils/nativeSiteCapabilities';
import type { PopupSettingsSearchItem } from '../utils/popupSettingsSearchIndex';
import { type OfficialPluginEntry, OFFICIAL_PLUGIN_TOPICS } from './officialPluginRegistry';

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
 * One settings-search target per listed row, and one per topic card that has
 * a row. Built from the rows the list actually shows, so search never finds a
 * plugin this tab doesn't list. The retired settings row's words come along,
 * so an old query finds the row; the single Plugins card's title still lists
 * every card, and a topic's own title lists its card.
 */
export function officialPluginSearchItems(
  listed: readonly ListedOfficialPlugin[],
): PopupSettingsSearchItem[] {
  const topics = OFFICIAL_PLUGIN_TOPICS.filter((topic) =>
    listed.some(({ entry }) => entry.topic === topic.id),
  ).map((topic): PopupSettingsSearchItem => ({
    id: `${topic.id}:${POPUP_SECTION_SEARCH_SETTING_ID}`,
    sectionId: topic.id,
    settingId: POPUP_SECTION_SEARCH_SETTING_ID,
    // Not the short link names: a word like "Chats" would pull a whole card into common queries.
    keys: ['pluginsTitle', 'pluginsNativeDescription', topic.title],
    aliases: ['plugin plugins add-on features 插件 功能'],
  }));
  const rows = listed.map(({ entry, manifest }) => ({
    id: `${entry.topic}:${manifest.id}` as const,
    sectionId: entry.topic,
    settingId: manifest.id,
    keys: entry.formerSectionTitle
      ? [...entry.searchKeys, entry.formerSectionTitle]
      : entry.searchKeys,
    aliases: [...(entry.searchAliases ?? []), ...manifestSearchText(manifest)],
  }));
  return [...topics, ...rows];
}
