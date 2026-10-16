export type NativePopupPlatform = 'gemini' | 'aistudio';

export const POPUP_SECTION_SEARCH_SETTING_ID = '__section';

export const NATIVE_POPUP_SECTION_IDS = [
  'cloudSync',
  'officialPlugins',
  'localPlugins',
  'folder',
  'folderSpacing',
  'folderTreeIndent',
  'keyboardShortcuts',
  'promptManager',
  'general',
] as const;

export type NativePopupSectionId = (typeof NATIVE_POPUP_SECTION_IDS)[number];

type SectionCapability = true | readonly string[];

/**
 * AI Studio intentionally exposes a smaller feature surface than Gemini.
 * Keep this as an allowlist so a newly added Gemini setting never appears on
 * AI Studio until its runtime support has been added and verified.
 */
const AI_STUDIO_CAPABILITIES = {
  cloudSync: true,
  officialPlugins: true,
  localPlugins: true,
  folder: ['enableFolderFeature', 'hideArchivedConversations', 'enableAccountIsolation'],
  folderSpacing: true,
  promptManager: [
    'hidePromptManager',
    'promptTriggerMascotLogo',
    'slashPromptEnabled',
    'promptInsertOnClick',
    'promptDataMigration',
    'customWebsites',
  ],
  general: ['remoteAnnouncementNotification', 'changelogBadgeMode'],
} as const satisfies Partial<Record<NativePopupSectionId, SectionCapability>>;

export function isNativePopupSectionAvailable(
  platform: NativePopupPlatform,
  sectionId: NativePopupSectionId,
): boolean {
  if (platform === 'gemini') return true;
  return Object.prototype.hasOwnProperty.call(AI_STUDIO_CAPABILITIES, sectionId);
}

export function isNativePopupSettingAvailable(
  platform: NativePopupPlatform,
  sectionId: NativePopupSectionId,
  settingId: string,
): boolean {
  if (platform === 'gemini') return true;

  const capability: SectionCapability | undefined =
    AI_STUDIO_CAPABILITIES[sectionId as keyof typeof AI_STUDIO_CAPABILITIES];
  if (!capability) return false;
  if (settingId === POPUP_SECTION_SEARCH_SETTING_ID || capability === true) return true;
  return capability.includes(settingId);
}
