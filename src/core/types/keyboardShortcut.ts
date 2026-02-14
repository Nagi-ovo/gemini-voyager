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
 * Extended to include more useful actions
 */
export type ShortcutAction =
  | 'timeline:previous'
  | 'timeline:next'
  | 'timeline:scrollToTop'
  | 'timeline:scrollToBottom'
  | 'chat:export'
  | 'folder:toggle'
  | 'prompt:open'
  | 'input:focus';

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
 * Extended with new shortcut categories
 */
export interface KeyboardShortcutConfig {
  // Timeline navigation
  previous: KeyboardShortcut;
  next: KeyboardShortcut;
  scrollToTop: KeyboardShortcut;
  scrollToBottom: KeyboardShortcut;

  // Feature shortcuts
  exportChat: KeyboardShortcut;
  toggleFolder: KeyboardShortcut;
  openPrompt: KeyboardShortcut;
  focusInput: KeyboardShortcut;
}

/**
 * Storage format for shortcuts
 */
export interface KeyboardShortcutStorage {
  shortcuts: KeyboardShortcutConfig;
  enabled: boolean;
}

/**
 * Display labels for shortcut actions (for UI)
 */
export const SHORTCUT_ACTION_LABELS: Record<ShortcutAction, string> = {
  'timeline:previous': 'Previous Message',
  'timeline:next': 'Next Message',
  'timeline:scrollToTop': 'Scroll to Top',
  'timeline:scrollToBottom': 'Scroll to Bottom',
  'chat:export': 'Export Chat',
  'folder:toggle': 'Toggle Folder Panel',
  'prompt:open': 'Open Prompt Library',
  'input:focus': 'Focus Input',
};
