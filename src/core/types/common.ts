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

  // Timeline
  TIMELINE_SCROLL_MODE: 'geminiTimelineScrollMode',
  TIMELINE_HIDE_CONTAINER: 'geminiTimelineHideContainer',
  TIMELINE_DRAGGABLE: 'geminiTimelineDraggable',
  TIMELINE_POSITION: 'geminiTimelinePosition',
  TIMELINE_STARRED_MESSAGES: 'geminiTimelineStarredMessages',
  TIMELINE_SHORTCUTS: 'geminiTimelineShortcuts',

  // UI customization
  CHAT_WIDTH: 'geminiChatWidth',

  // Prompt Manager
  PROMPT_ITEMS: 'gvPromptItems',
  PROMPT_PANEL_LOCKED: 'gvPromptPanelLocked',
  PROMPT_PANEL_POSITION: 'gvPromptPanelPosition',
  PROMPT_TRIGGER_POSITION: 'gvPromptTriggerPosition',
  PROMPT_CUSTOM_WEBSITES: 'gvPromptCustomWebsites',

  // Global settings
  LANGUAGE: 'language',
  FORMULA_COPY_FORMAT: 'gvFormulaCopyFormat',

  // Input behavior
  CTRL_ENTER_SEND: 'gvCtrlEnterSend',

  // Default Model
  DEFAULT_MODEL: 'gvDefaultModel',

  // Folder filtering
  GV_FOLDER_FILTER_USER_ONLY: 'gvFolderFilterUserOnly',

  // Sidebar behavior
  GV_SIDEBAR_AUTO_HIDE: 'gvSidebarAutoHide',

  // Folder spacing
  GV_FOLDER_SPACING: 'gvFolderSpacing',
  GV_AISTUDIO_FOLDER_SPACING: 'gvAIStudioFolderSpacing',
  GV_FOLDER_TREE_INDENT: 'gvFolderTreeIndent',

  // Snow effect
  GV_SNOW_EFFECT: 'gvSnowEffect',
} as const;

export type StorageKey = (typeof StorageKeys)[keyof typeof StorageKeys];
