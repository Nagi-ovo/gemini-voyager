/**
 * Common types used throughout the application
 * Following strict type safety principles
 */

export type Result<T, E = Error> =
  | { success: true; data: T }
  | { success: false; error: E };

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
  FOLDER_DATA: 'gvFolderData',
  TIMELINE_SCROLL_MODE: 'geminiTimelineScrollMode',
  TIMELINE_HIDE_CONTAINER: 'geminiTimelineHideContainer',
  TIMELINE_DRAGGABLE: 'geminiTimelineDraggable',
  TIMELINE_POSITION: 'geminiTimelinePosition',
  CHAT_WIDTH: 'geminiChatWidth',
  LANGUAGE: 'language',
} as const;

export type StorageKey = typeof StorageKeys[keyof typeof StorageKeys];
