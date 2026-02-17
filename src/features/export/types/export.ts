/**
 * Export feature type definitions
 * Supports multiple export formats with extensible architecture
 */

/**
 * Chat turn representing a user-assistant exchange
 */
export interface ChatTurn {
  user: string;
  assistant: string;
  starred: boolean;
  omitEmptySections?: boolean;
  // Optional DOM elements for rich content extraction
  userElement?: HTMLElement;
  assistantElement?: HTMLElement;
}

/**
 * Conversation metadata
 */
export interface ConversationMetadata {
  url: string;
  exportedAt: string;
  title?: string;
  count: number;
}

/**
 * Supported export formats
 */
export enum ExportFormat {
  JSON = 'json',
  MARKDOWN = 'markdown',
  PDF = 'pdf',
  IMAGE = 'image',
}

export type ExportLayout = 'conversation' | 'document';

/**
 * Export format labels for UI
 */
export interface ExportFormatInfo {
  format: ExportFormat;
  label: string;
  description: string;
  extension: string;
  recommended?: boolean;
}

/**
 * Export options
 */
export interface ExportOptions {
  format: ExportFormat;
  layout?: ExportLayout;
  includeMetadata?: boolean;
  includeStarred?: boolean;
  filename?: string;
  // Image handling for markdown/pdf
  // - 'inline': try to inline images as data URLs when possible
  // - 'none': keep remote URLs as-is
  embedImages?: 'inline' | 'none';
  // Font size for PDF (pt) and Image (px) exports
  fontSize?: number;
  /** Whether to include image source attribution in markdown (default: true) */
  includeImageSource?: boolean;
}

/**
 * Base export payload
 */
export interface BaseExportPayload {
  format: string;
  url: string;
  exportedAt: string;
  count: number;
  /**
   * Optional human-readable conversation title
   * Added in a backward-compatible way for JSON/Markdown exports
   */
  title?: string;
}

/**
 * JSON export payload (existing format)
 */
export interface JSONExportPayload extends BaseExportPayload {
  format: 'gemini-voyager.chat.v1';
  items: ChatTurn[];
}

/**
 * Export result
 */
export interface ExportResult {
  success: boolean;
  format: ExportFormat;
  filename?: string;
  error?: string;
}
