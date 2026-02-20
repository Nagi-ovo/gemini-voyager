/**
 * KeyboardShortcutService - Manages keyboard shortcuts for timeline navigation
 *
 * Design Patterns:
 * - Singleton: Ensures single instance across application
 * - Strategy: Configurable shortcut matching strategies
 * - Observer: Event-based callback system
 *
 * Features:
 * - Configurable shortcuts with modifier keys
 * - Chrome storage integration for persistence
 * - Type-safe action handling
 * - Collision detection with browser shortcuts
 */
import { StorageKeys } from '@/core/types/common';
import type {
  KeyboardShortcut,
  KeyboardShortcutConfig,
  KeyboardShortcutStorage,
  ModifierKey,
  ShortcutAction,
  ShortcutMatch,
} from '@/core/types/keyboardShortcut';

/**
 * Default keyboard shortcuts configuration
 * Using vim-style j/k (convenient, no modifiers needed)
 */
const DEFAULT_SHORTCUTS: KeyboardShortcutConfig = {
  previous: {
    action: 'timeline:previous',
    modifiers: [],
    key: 'k',
  },
  next: {
    action: 'timeline:next',
    modifiers: [],
    key: 'j',
  },
};

/**
 * Callback type for shortcut actions
 */
export type ShortcutCallback = (action: ShortcutAction, event: KeyboardEvent) => void;

/**
 * KeyboardShortcutService class
 * Singleton service for managing keyboard shortcuts
 */
export class KeyboardShortcutService {
  private static instance: KeyboardShortcutService | null = null;

  private config: KeyboardShortcutConfig;
  private enabled: boolean = true;
  private listeners: Set<ShortcutCallback> = new Set();
  private keydownHandler: ((e: KeyboardEvent) => void) | null = null;
  private storageChangeHandler:
    | ((changes: Record<string, chrome.storage.StorageChange>, areaName: string) => void)
    | null = null;

  private constructor() {
    this.config = DEFAULT_SHORTCUTS;
  }

  /**
   * Get singleton instance (Factory Pattern)
   */
  static getInstance(): KeyboardShortcutService {
    if (!KeyboardShortcutService.instance) {
      KeyboardShortcutService.instance = new KeyboardShortcutService();
    }
    return KeyboardShortcutService.instance;
  }

  /**
   * Initialize service: load config and attach listeners
   */
  async init(): Promise<void> {
    await this.loadConfig();
    this.attachKeyboardListener();
    this.attachStorageListener();
  }

  /**
   * Load configuration from chrome storage
   */
  private async loadConfig(): Promise<void> {
    try {
      if (typeof chrome !== 'undefined' && chrome.storage?.sync) {
        const result = await chrome.storage.sync.get(StorageKeys.TIMELINE_SHORTCUTS);
        const stored = result[StorageKeys.TIMELINE_SHORTCUTS] as
          | KeyboardShortcutStorage
          | undefined;

        if (stored?.shortcuts) {
          this.config = this.validateConfig(stored.shortcuts)
            ? stored.shortcuts
            : DEFAULT_SHORTCUTS;
          this.enabled = stored.enabled ?? true;
        }
      } else {
        // Fallback to localStorage
        const stored = localStorage.getItem(StorageKeys.TIMELINE_SHORTCUTS);
        if (stored) {
          const parsed = JSON.parse(stored) as KeyboardShortcutStorage;
          this.config = this.validateConfig(parsed.shortcuts)
            ? parsed.shortcuts
            : DEFAULT_SHORTCUTS;
          this.enabled = parsed.enabled ?? true;
        }
      }
    } catch (error) {
      console.warn('[KeyboardShortcut] Failed to load config, using defaults:', error);
      this.config = DEFAULT_SHORTCUTS;
      this.enabled = true;
    }
  }

  /**
   * Save configuration to chrome storage
   */
  async saveConfig(config: KeyboardShortcutConfig, enabled: boolean = this.enabled): Promise<void> {
    if (!this.validateConfig(config)) {
      throw new Error('Invalid shortcut configuration');
    }

    this.config = config;
    this.enabled = enabled;

    const storage: KeyboardShortcutStorage = {
      shortcuts: config,
      enabled,
    };

    try {
      if (typeof chrome !== 'undefined' && chrome.storage?.sync) {
        await chrome.storage.sync.set({ [StorageKeys.TIMELINE_SHORTCUTS]: storage });
      } else {
        localStorage.setItem(StorageKeys.TIMELINE_SHORTCUTS, JSON.stringify(storage));
      }
    } catch (error) {
      console.error('[KeyboardShortcut] Failed to save config:', error);
      throw error;
    }
  }

  /**
   * Validate shortcut configuration
   */
  private validateConfig(config: KeyboardShortcutConfig): boolean {
    try {
      return !!(
        config.previous &&
        config.next &&
        this.isValidShortcut(config.previous) &&
        this.isValidShortcut(config.next)
      );
    } catch {
      return false;
    }
  }

  /**
   * Validate individual shortcut
   */
  private isValidShortcut(shortcut: KeyboardShortcut): boolean {
    const validModifiers: ModifierKey[] = ['Alt', 'Ctrl', 'Shift', 'Meta'];

    return (
      Array.isArray(shortcut.modifiers) &&
      shortcut.modifiers.every((m) => validModifiers.includes(m)) &&
      typeof shortcut.key === 'string' &&
      shortcut.key.length > 0
    );
  }

  /**
   * Attach keyboard event listener
   */
  private attachKeyboardListener(): void {
    if (this.keydownHandler) return;

    this.keydownHandler = (event: KeyboardEvent) => {
      if (!this.enabled) return;

      // Ignore shortcuts when user is typing in input fields
      if (this.isTypingInInputField(event)) return;

      const match = this.matchShortcut(event);
      if (match) {
        event.preventDefault();
        event.stopPropagation();
        this.notifyListeners(match.action, event);
      }
    };

    window.addEventListener('keydown', this.keydownHandler, { capture: true });
  }

  /**
   * Check if user is typing in an input field
   * Prevents shortcuts from interfering with text input
   */
  private isTypingInInputField(event: KeyboardEvent): boolean {
    const target = event.target as HTMLElement;
    if (!target) return false;

    const tagName = target.tagName.toLowerCase();
    const isEditable = target.isContentEditable;
    const isInput = tagName === 'input' || tagName === 'textarea' || tagName === 'select';

    return isEditable || isInput;
  }

  /**
   * Attach storage change listener for cross-tab sync
   */
  private attachStorageListener(): void {
    if (typeof chrome !== 'undefined' && chrome.storage?.onChanged) {
      this.storageChangeHandler = (changes, areaName) => {
        if (areaName !== 'sync') return;
        if (changes[StorageKeys.TIMELINE_SHORTCUTS]) {
          const newValue = changes[StorageKeys.TIMELINE_SHORTCUTS].newValue as
            | KeyboardShortcutStorage
            | undefined;
          if (newValue?.shortcuts) {
            this.config = this.validateConfig(newValue.shortcuts)
              ? newValue.shortcuts
              : DEFAULT_SHORTCUTS;
            this.enabled = newValue.enabled ?? true;
          }
        }
      };

      chrome.storage.onChanged.addListener(this.storageChangeHandler);
    }
  }

  /**
   * Match keyboard event to shortcut (Strategy Pattern)
   */
  private matchShortcut(event: KeyboardEvent): ShortcutMatch | null {
    const shortcuts = [
      { action: 'timeline:previous' as const, config: this.config.previous },
      { action: 'timeline:next' as const, config: this.config.next },
    ];

    // Check if any shortcut matches
    for (const { action, config } of shortcuts) {
      if (this.isShortcutPressed(event, config)) {
        return { action, event };
      }
    }

    return null;
  }

  /**
   * Check if specific shortcut is pressed
   */
  private isShortcutPressed(event: KeyboardEvent, shortcut: KeyboardShortcut): boolean {
    // Check key match
    if (event.key !== shortcut.key) return false;

    // Check modifier matches
    const hasAlt = shortcut.modifiers.includes('Alt');
    const hasCtrl = shortcut.modifiers.includes('Ctrl');
    const hasShift = shortcut.modifiers.includes('Shift');
    const hasMeta = shortcut.modifiers.includes('Meta');

    return (
      event.altKey === hasAlt &&
      event.ctrlKey === hasCtrl &&
      event.shiftKey === hasShift &&
      event.metaKey === hasMeta
    );
  }

  /**
   * Notify all registered listeners (Observer Pattern)
   */
  private notifyListeners(action: ShortcutAction, event: KeyboardEvent): void {
    this.listeners.forEach((callback) => {
      try {
        callback(action, event);
      } catch (error) {
        console.error('[KeyboardShortcut] Error in listener callback:', error);
      }
    });
  }

  /**
   * Register a shortcut callback
   */
  on(callback: ShortcutCallback): () => void {
    this.listeners.add(callback);
    // Return unsubscribe function
    return () => this.off(callback);
  }

  /**
   * Unregister a shortcut callback
   */
  off(callback: ShortcutCallback): void {
    this.listeners.delete(callback);
  }

  /**
   * Get current configuration
   */
  getConfig(): { config: KeyboardShortcutConfig; enabled: boolean } {
    return {
      config: { ...this.config },
      enabled: this.enabled,
    };
  }

  /**
   * Reset to default shortcuts
   */
  async resetToDefaults(): Promise<void> {
    await this.saveConfig(DEFAULT_SHORTCUTS, true);
  }

  /**
   * Enable/disable shortcuts
   */
  async setEnabled(enabled: boolean): Promise<void> {
    this.enabled = enabled;
    await this.saveConfig(this.config, enabled);
  }

  /**
   * Format shortcut for display (e.g., "Alt + ↑" or "j")
   */
  formatShortcut(shortcut: KeyboardShortcut): string {
    // Map common keys to symbols for better display
    const keySymbols: Record<string, string> = {
      ArrowUp: '↑',
      ArrowDown: '↓',
      ArrowLeft: '←',
      ArrowRight: '→',
      ' ': 'Space',
      Enter: '⏎',
      Tab: '⇥',
      Backspace: '⌫',
      Delete: '⌦',
      Escape: 'Esc',
    };

    const key = keySymbols[shortcut.key] || shortcut.key;

    if (shortcut.modifiers.length === 0) {
      return key;
    }

    const parts = [...shortcut.modifiers, key];
    return parts.join(' + ');
  }

  /**
   * Cleanup service
   */
  destroy(): void {
    if (this.keydownHandler) {
      window.removeEventListener('keydown', this.keydownHandler, { capture: true });
      this.keydownHandler = null;
    }

    if (this.storageChangeHandler && typeof chrome !== 'undefined' && chrome.storage?.onChanged) {
      chrome.storage.onChanged.removeListener(this.storageChangeHandler);
      this.storageChangeHandler = null;
    }

    this.listeners.clear();
  }
}

/**
 * Export singleton instance for convenience
 */
export const keyboardShortcutService = KeyboardShortcutService.getInstance();
