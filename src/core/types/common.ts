/**
 * Common types used throughout the application
 * Following strict type safety principles
 */

export type Result<T, E = Error> = { success: true; data: T } | { success: false; error: E };

export interface IDisposable {
  dispose(): void;
}

export interface ILogger {
  debug(message: string, context?: Record<string, unknown>): void;
  info(message: string, context?: Record<string, unknown>): void;
  warn(message: string, context?: Record<string, unknown>): void;
  error(message: string, context?: Record<string, unknown>): void;
}

export type Nullable<T> = T | null;
export type Optional<T> = T | undefined;
export type Maybe<T> = T | null | undefined;

/**
 * Brand type for type-safe IDs
 */
export type Brand<K, T> = K & { __brand: T };

export type ConversationId = Brand<string, 'ConversationId'>;
export type FolderId = Brand<string, 'FolderId'>;
export type TurnId = Brand<string, 'TurnId'>;

/**
 * Storage keys - centralized for type safety
 */
export const StorageKeys = {
  // Folder system
  FOLDER_DATA: 'gvFolderData',
  FOLDER_DATA_AISTUDIO: 'gvFolderDataAIStudio',
  FOLDER_ENABLED: 'geminiFolderEnabled',
  FOLDER_HIDE_ARCHIVED_CONVERSATIONS: 'geminiFolderHideArchivedConversations',
  FOLDER_HIDE_ARCHIVED_NUDGE_SHOWN: 'geminiFolderHideArchivedNudgeShown',
  FOLDER_FLOATING_MODE_ENABLED: 'geminiFolderFloatingModeEnabled',
  FOLDER_FLOATING_NUDGE_SHOWN: 'geminiFolderFloatingNudgeShown',
  FOLDER_FLOATING_POS: 'geminiFolderFloatingPos',
  FOLDER_FLOATING_FAB_POS: 'geminiFolderFloatingFabPos',
  FOLDER_FLOATING_SIZE: 'geminiFolderFloatingSize',
  // AI Studio variants — intentionally separate from the Gemini keys so toggling the
  // behaviour on one platform does not surprise users on the other.
  FOLDER_HIDE_ARCHIVED_CONVERSATIONS_AISTUDIO: 'aistudioFolderHideArchivedConversations',
  FOLDER_HIDE_ARCHIVED_NUDGE_SHOWN_AISTUDIO: 'aistudioFolderHideArchivedNudgeShown',

  // Timeline
  TIMELINE_SCROLL_MODE: 'geminiTimelineScrollMode',
  TIMELINE_HIDE_CONTAINER: 'geminiTimelineHideContainer',
  TIMELINE_BAR_WIDTH: 'geminiTimelineBarWidth',
  TIMELINE_DRAGGABLE: 'geminiTimelineDraggable',
  TIMELINE_POSITION: 'geminiTimelinePosition',
  TIMELINE_PREVIEW_PINNED: 'geminiTimelinePreviewPinned',
  TIMELINE_MARKER_LEVEL: 'geminiTimelineMarkerLevel',
  TIMELINE_STARRED_MESSAGES: 'geminiTimelineStarredMessages',
  TIMELINE_HIERARCHY: 'geminiTimelineHierarchy',
  TIMELINE_SHORTCUTS: 'geminiTimelineShortcuts',

  // UI customization
  CHAT_WIDTH: 'geminiChatWidth',
  CHAT_WIDTH_ENABLED: 'gvChatWidthEnabled',
  CHAT_FONT_SIZE: 'gvChatFontSize',
  CHAT_FONT_SIZE_ENABLED: 'gvChatFontSizeEnabled',
  CHAT_LINE_HEIGHT: 'gvChatLineHeight',
  CHAT_LINE_HEIGHT_ENABLED: 'gvChatLineHeightEnabled',
  EDIT_INPUT_WIDTH: 'geminiEditInputWidth',
  EDIT_INPUT_WIDTH_ENABLED: 'gvEditInputWidthEnabled',
  SIDEBAR_WIDTH: 'geminiSidebarWidth',
  SIDEBAR_WIDTH_ENABLED: 'gvSidebarWidthEnabled',
  AISTUDIO_SIDEBAR_WIDTH: 'gvAIStudioSidebarWidth',

  // Prompt Manager
  PROMPT_ITEMS: 'gvPromptItems',
  PROMPT_PANEL_LOCKED: 'gvPromptPanelLocked',
  PROMPT_PANEL_POSITION: 'gvPromptPanelPosition',
  PROMPT_TRIGGER_POSITION: 'gvPromptTriggerPosition',
  PROMPT_CUSTOM_WEBSITES: 'gvPromptCustomWebsites',
  PROMPT_THEME: 'gvPromptTheme',
  PROMPT_INSERT_ON_CLICK: 'gvPromptInsertOnClick',
  PROMPT_VIEW_MODE: 'gvPromptViewMode',

  // Global settings
  LANGUAGE: 'language',
  FORMULA_COPY_FORMAT: 'gvFormulaCopyFormat',
  // Legacy single-toggle key. Kept for migration: when neither
  // WATERMARK_DOWNLOAD_ENABLED nor WATERMARK_PREVIEW_ENABLED is present, this
  // value (defaulting to true) is used to derive both flags so existing users
  // keep their behavior. New writes go to the two split keys below.
  WATERMARK_REMOVER_ENABLED: 'geminiWatermarkRemoverEnabled',
  WATERMARK_DOWNLOAD_ENABLED: 'gvWatermarkDownloadEnabled',
  WATERMARK_PREVIEW_ENABLED: 'gvWatermarkPreviewEnabled',
  HIDE_PROMPT_MANAGER: 'gvHidePromptManager',
  TAB_TITLE_UPDATE_ENABLED: 'gvTabTitleUpdateEnabled',
  MERMAID_ENABLED: 'gvMermaidEnabled',
  QUOTE_REPLY_ENABLED: 'gvQuoteReplyEnabled',

  // Input behavior
  CTRL_ENTER_SEND: 'gvCtrlEnterSend',
  AISTUDIO_ENTER_SEND: 'gvAIStudioEnterSend',
  SAFARI_ENTER_FIX: 'gvSafariEnterFix',
  INPUT_COLLAPSE_ENABLED: 'gvInputCollapseEnabled',
  INPUT_COLLAPSE_WHEN_NOT_EMPTY: 'gvInputCollapseWhenNotEmpty',
  INPUT_VIM_MODE: 'gvInputVimMode',
  DRAFT_AUTO_SAVE: 'gvDraftAutoSave',
  PREVENT_AUTO_SCROLL_ENABLED: 'gvPreventAutoScrollEnabled',

  // Default Model
  DEFAULT_MODEL: 'gvDefaultModel',
  DEFAULT_THINKING_LEVEL: 'gvDefaultThinkingLevel',

  // Folder filtering
  GV_FOLDER_FILTER_USER_ONLY: 'gvFolderFilterUserOnly',
  GV_ACCOUNT_ISOLATION_ENABLED: 'gvAccountIsolationEnabled',
  GV_ACCOUNT_ISOLATION_ENABLED_GEMINI: 'gvAccountIsolationEnabledGemini',
  GV_ACCOUNT_ISOLATION_ENABLED_AISTUDIO: 'gvAccountIsolationEnabledAIStudio',
  GV_ACCOUNT_PROFILE_MAP: 'gvAccountProfileMap',

  // Sidebar behavior
  GV_SIDEBAR_AUTO_HIDE: 'gvSidebarAutoHide',
  GV_SIDEBAR_FULL_HIDE: 'gvSidebarFullHide',
  RECENTS_HIDDEN: 'gvRecentsHidden',
  GEMS_HIDDEN: 'gvGemsHidden',
  NOTEBOOKS_HIDDEN: 'gvNotebooksHidden',
  FOLDERS_HIDDEN: 'gvFoldersHidden',
  // How many recent gems to show as an expandable section in the sidebar.
  // 0 disables the feature entirely (no section injected); 1-10 shows that
  // many items. Cached gem list lives in `GV_GEMS_LIST_CACHE`.
  GV_GEMS_SIDEBAR_COUNT: 'gvGemsSidebarCount',
  // Local cache of the Gems list scraped from /gems/view. Stored as
  // { items: GemMetadata[]; cachedAt: number }. Falls into local (not sync)
  // because gem rosters can be sizeable + sync quota is precious.
  GV_GEMS_LIST_CACHE: 'gvGemsListCache',
  // 'above-recents' (default) anchors the folder panel just above the Recents
  // expandable-section; 'above-notebooks' anchors it above the Notebooks
  // section instead. Persisted in chrome.storage.local since it's a UI-only
  // preference and changes feel best when they take effect immediately.
  FOLDERS_ANCHOR: 'gvFoldersAnchor',
  SIDEBAR_COLLAPSE_NUDGE_SHOWN: 'gvSidebarCollapseNudgeShown',

  // Folder spacing
  GV_FOLDER_SPACING: 'gvFolderSpacing',
  GV_AISTUDIO_FOLDER_SPACING: 'gvAIStudioFolderSpacing',
  GV_FOLDER_TREE_INDENT: 'gvFolderTreeIndent',

  // Folder item font size (px). Range 12-18, default 13 to match Gemini's
  // native sidebar item text size after the May 2026 redesign.
  GV_FOLDER_ITEM_FONT_SIZE: 'gvFolderItemFontSize',

  // Snow effect (legacy, kept for backward compat migration)
  GV_SNOW_EFFECT: 'gvSnowEffect',

  // Visual effect (replaces GV_SNOW_EFFECT): 'off' | 'snow' | 'sakura'
  GV_VISUAL_EFFECT: 'gvVisualEffect',

  // Changelog
  CHANGELOG_DISMISSED_VERSION: 'gvChangelogDismissedVersion',
  CHANGELOG_NOTIFY_MODE: 'gvChangelogNotifyMode',

  // Fork nodes
  FORK_NODES: 'gvForkNodes',
  FORK_ENABLED: 'gvForkEnabled',

  // Export
  EXPORT_IMAGE_WIDTH: 'gvExportImageWidth',

  // AI Studio master toggle
  GV_AISTUDIO_ENABLED: 'gvAIStudioEnabled',

  // Message timestamps
  GV_SHOW_MESSAGE_TIMESTAMPS: 'gvShowMessageTimestamps',
  GV_MESSAGE_TIMESTAMPS: 'gvMessageTimestamps',

  // Popup section order
  GV_POPUP_SECTION_ORDER: 'gvPopupSectionOrder',

  // Context sync
  CONTEXT_SYNC_ENABLED: 'contextSyncEnabled',
  CONTEXT_SYNC_PORT: 'contextSyncPort',

  // Folder as Project
  FOLDER_PROJECT_ENABLED: 'gvFolderProjectEnabled',
  FOLDER_PROJECT_PENDING_FOLDER_ID: 'gvFolderProjectPendingFolderId',
} as const;

export type StorageKey = (typeof StorageKeys)[keyof typeof StorageKeys];
