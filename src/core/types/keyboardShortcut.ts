/**
 * Keyboard Shortcut Types
 * Defines types for configurable keyboard shortcuts
 *
 * Supports:
 * - Single key mode (e.g., j/k for vim-style navigation)
 * - Combination key mode (e.g., Alt + Arrow keys)
 * - Fully customizable by user
 */

/**
 * Modifier keys for shortcuts
 */
export type ModifierKey = 'Alt' | 'Ctrl' | 'Shift' | 'Meta';

/**
 * Any key can be used for shortcuts
 * We use string to support any keyboard key
 */
export type ShortcutKey = string;

/**
 * Shortcut action types
 */
export type ShortcutAction = 'timeline:previous' | 'timeline:next';

/**
 * Individual keyboard shortcut configuration
 */
export interface KeyboardShortcut {
  action: ShortcutAction;
  modifiers: ModifierKey[];
  key: ShortcutKey;
}

/**
 * Keyboard event matcher result
 */
export interface ShortcutMatch {
  action: ShortcutAction;
  event: KeyboardEvent;
}

/**
 * Complete shortcuts configuration (single set, user-customizable)
 */
export interface KeyboardShortcutConfig {
  previous: KeyboardShortcut;
  next: KeyboardShortcut;
}

/**
 * Storage format for shortcuts
 */
export interface KeyboardShortcutStorage {
  shortcuts: KeyboardShortcutConfig;
  enabled: boolean;
}
