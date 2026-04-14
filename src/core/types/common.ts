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

  // Global settings
  LANGUAGE: 'language',
  FORMULA_COPY_FORMAT: 'gvFormulaCopyFormat',
  WATERMARK_REMOVER_ENABLED: 'geminiWatermarkRemoverEnabled',
  HIDE_PROMPT_MANAGER: 'gvHidePromptManager',
  TAB_TITLE_UPDATE_ENABLED: 'gvTabTitleUpdateEnabled',
  MERMAID_ENABLED: 'gvMermaidEnabled',
  QUOTE_REPLY_ENABLED: 'gvQuoteReplyEnabled',

  // Input behavior
  CTRL_ENTER_SEND: 'gvCtrlEnterSend',
  INPUT_COLLAPSE_ENABLED: 'gvInputCollapseEnabled',
  INPUT_COLLAPSE_WHEN_NOT_EMPTY: 'gvInputCollapseWhenNotEmpty',
  DRAFT_AUTO_SAVE: 'gvDraftAutoSave',
  PREVENT_AUTO_SCROLL_ENABLED: 'gvPreventAutoScrollEnabled',

  // Default Model
  DEFAULT_MODEL: 'gvDefaultModel',

  // Folder filtering
  GV_FOLDER_FILTER_USER_ONLY: 'gvFolderFilterUserOnly',
  GV_ACCOUNT_ISOLATION_ENABLED: 'gvAccountIsolationEnabled',
  GV_ACCOUNT_ISOLATION_ENABLED_GEMINI: 'gvAccountIsolationEnabledGemini',
  GV_ACCOUNT_ISOLATION_ENABLED_AISTUDIO: 'gvAccountIsolationEnabledAIStudio',
  GV_ACCOUNT_PROFILE_MAP: 'gvAccountProfileMap',

  // Sidebar behavior
  GV_SIDEBAR_AUTO_HIDE: 'gvSidebarAutoHide',
  GV_SIDEBAR_FULL_HIDE: 'gvSidebarFullHide',
  GEMS_HIDDEN: 'gvGemsHidden',
  NOTEBOOKS_HIDDEN: 'gvNotebooksHidden',

  // Folder spacing
  GV_FOLDER_SPACING: 'gvFolderSpacing',
  GV_AISTUDIO_FOLDER_SPACING: 'gvAIStudioFolderSpacing',
  GV_FOLDER_TREE_INDENT: 'gvFolderTreeIndent',

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
} as const;

export type StorageKey = (typeof StorageKeys)[keyof typeof StorageKeys];
