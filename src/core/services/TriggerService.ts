import { StorageKeys } from '@/core/types/common';

import { autoCategorizationService } from './AutoCategorizationService';
import { storageService } from './StorageService';

/**
 * Service for managing triggers that activate auto-categorization.
 * Monitors input prefixes and keyboard shortcuts.
 */
export class TriggerService {
  private static instance: TriggerService;
  private prefix = '.';
  private shortcut = 'Ctrl+Shift+U';
  private strictMatch = false;
  private indexRouting = false;
  private routingSeparator = ' ';
  private triggerMode: 'positive' | 'negative' = 'positive';
  private useMainPrefixForRouting = true;
  private customRoutingPrefix = '';
  private isEnabled = false;
  private ctrlEnterSend = false;

  private constructor() {}

  public static getInstance(): TriggerService {
    if (!TriggerService.instance) {
      TriggerService.instance = new TriggerService();
    }
    return TriggerService.instance;
  }

  public async init() {
    const prefixRes = await storageService.get<string>(StorageKeys.AUTO_CATEGORIZATION_PREFIX);
    if (prefixRes.success) {
      this.prefix = prefixRes.data;
    }

    const shortcutRes = await storageService.get<string>(StorageKeys.AUTO_CATEGORIZATION_SHORTCUT);
    if (shortcutRes.success) {
      this.shortcut = shortcutRes.data;
    }

    const strictMatchRes = await storageService.get<boolean>(
      StorageKeys.AUTO_CATEGORIZATION_STRICT_MATCH,
    );
    if (strictMatchRes.success) {
      this.strictMatch = strictMatchRes.data;
    }

    const indexRoutingRes = await storageService.get<boolean>(
      StorageKeys.AUTO_CATEGORIZATION_INDEX_ROUTING,
    );
    if (indexRoutingRes.success) {
      this.indexRouting = indexRoutingRes.data;
    }

    const routingSepRes = await storageService.get<string>(
      StorageKeys.AUTO_CATEGORIZATION_ROUTING_SEPARATOR,
    );
    if (routingSepRes.success) {
      this.routingSeparator = routingSepRes.data;
    }

    const triggerModeRes = await storageService.get<string>(
      StorageKeys.AUTO_CATEGORIZATION_TRIGGER_MODE,
    );
    if (
      triggerModeRes.success &&
      (triggerModeRes.data === 'positive' || triggerModeRes.data === 'negative')
    ) {
      this.triggerMode = triggerModeRes.data;
    }

    const useMainPrefixRes = await storageService.get<boolean>(
      StorageKeys.AUTO_CATEGORIZATION_USE_MAIN_PREFIX_FOR_ROUTING,
    );
    if (useMainPrefixRes.success) {
      this.useMainPrefixForRouting = useMainPrefixRes.data;
    }

    const customRoutingPrefixRes = await storageService.get<string>(
      StorageKeys.AUTO_CATEGORIZATION_CUSTOM_ROUTING_PREFIX,
    );
    if (customRoutingPrefixRes.success) {
      this.customRoutingPrefix = customRoutingPrefixRes.data;
    }

    const enabledRes = await storageService.get<boolean>(StorageKeys.AUTO_CATEGORIZATION_ENABLED);
    if (enabledRes.success) {
      this.isEnabled = enabledRes.data;
    }

    const ctrlEnterRes = await storageService.get<boolean>(StorageKeys.CTRL_ENTER_SEND);
    if (ctrlEnterRes.success) {
      this.ctrlEnterSend = ctrlEnterRes.data;
    }

    if (this.isEnabled) {
      autoCategorizationService.startUrlObserver();
    }

    this.setupSendInterceptors();
    this.setupShortcutListener();
    this.setupStorageListener();
  }

  private setupStorageListener() {
    chrome.storage.onChanged.addListener((changes, area) => {
      if (area === 'sync') {
        if (changes[StorageKeys.AUTO_CATEGORIZATION_PREFIX]) {
          this.prefix = changes[StorageKeys.AUTO_CATEGORIZATION_PREFIX].newValue;
        }
        if (changes[StorageKeys.AUTO_CATEGORIZATION_SHORTCUT]) {
          this.shortcut = changes[StorageKeys.AUTO_CATEGORIZATION_SHORTCUT].newValue;
        }
        if (changes[StorageKeys.AUTO_CATEGORIZATION_STRICT_MATCH]) {
          this.strictMatch = changes[StorageKeys.AUTO_CATEGORIZATION_STRICT_MATCH].newValue;
        }
        if (changes[StorageKeys.AUTO_CATEGORIZATION_INDEX_ROUTING]) {
          this.indexRouting = changes[StorageKeys.AUTO_CATEGORIZATION_INDEX_ROUTING].newValue;
        }
        if (changes[StorageKeys.AUTO_CATEGORIZATION_ROUTING_SEPARATOR]) {
          this.routingSeparator =
            changes[StorageKeys.AUTO_CATEGORIZATION_ROUTING_SEPARATOR].newValue;
        }
        if (changes[StorageKeys.AUTO_CATEGORIZATION_TRIGGER_MODE]) {
          const val = changes[StorageKeys.AUTO_CATEGORIZATION_TRIGGER_MODE].newValue;
          if (val === 'positive' || val === 'negative') this.triggerMode = val;
        }
        if (changes[StorageKeys.AUTO_CATEGORIZATION_USE_MAIN_PREFIX_FOR_ROUTING]) {
          this.useMainPrefixForRouting =
            changes[StorageKeys.AUTO_CATEGORIZATION_USE_MAIN_PREFIX_FOR_ROUTING].newValue;
        }
        if (changes[StorageKeys.AUTO_CATEGORIZATION_CUSTOM_ROUTING_PREFIX]) {
          this.customRoutingPrefix =
            changes[StorageKeys.AUTO_CATEGORIZATION_CUSTOM_ROUTING_PREFIX].newValue;
        }
        if (changes[StorageKeys.AUTO_CATEGORIZATION_ENABLED]) {
          this.isEnabled = changes[StorageKeys.AUTO_CATEGORIZATION_ENABLED].newValue;
          if (this.isEnabled) {
            autoCategorizationService.startUrlObserver();
          } else {
            autoCategorizationService.stopUrlObserver();
          }
        }
        if (changes[StorageKeys.CTRL_ENTER_SEND]) {
          this.ctrlEnterSend = changes[StorageKeys.CTRL_ENTER_SEND].newValue === true;
        }
      }
    });
  }

  private setupSendInterceptors() {
    // Intercept Enter key
    document.addEventListener(
      'keydown',
      (e) => {
        if (e.key !== 'Enter' || e.shiftKey || e.isComposing) return;
        // When Ctrl+Enter send mode is on, plain Enter = newline (not a send action).
        // Only fire categorization on the actual send combination.
        const isSendKey = this.ctrlEnterSend ? e.ctrlKey || e.metaKey : !e.ctrlKey && !e.altKey;
        if (!isSendKey) return;
        const target = e.target as HTMLElement;
        if (this.isEditable(target)) {
          this.checkAndTriggerCategorization(target);
        }
      },
      { capture: true },
    );

    // Intercept Send button clicks
    document.addEventListener(
      'click',
      (e) => {
        const target = e.target as HTMLElement;
        const sendButton = target.closest(
          'button[aria-label*="Send"], button[aria-label*="send"], button[data-tooltip*="Send"], button mat-icon[fonticon="send"], .send-button',
        );
        if (sendButton) {
          const editables = document.querySelectorAll<HTMLElement>(
            'rich-textarea [contenteditable="true"], textarea',
          );
          editables.forEach((el) => this.checkAndTriggerCategorization(el));
        }
      },
      { capture: true },
    );
  }

  private isEditable(el: HTMLElement): boolean {
    return (
      el.isContentEditable || el.tagName === 'TEXTAREA' || el.getAttribute('role') === 'textbox'
    );
  }

  private getInputText(el: HTMLElement): string {
    if (el instanceof HTMLTextAreaElement) return el.value;
    return el.textContent || '';
  }

  private checkAndTriggerCategorization(el: HTMLElement) {
    if (this.isTemporaryChat()) {
      return;
    }

    const rawText = this.getInputText(el);
    const trimmed = rawText.trimStart();

    // Crucial fix: The Send button click listener often fires AFTER Gemini has natively
    // cleared the input box upon Enter keydown. This causes empty strings to be read.
    // We must abort immediately to avoid negative mode falling through to AI categorization.
    if (!trimmed) {
      return;
    }

    if (!this.isEnabled) {
      return;
    }

    const mainPrefixes = this.getEquivalentPrefixes(this.prefix);
    const matchedMainPrefix = mainPrefixes.find((p) => trimmed.startsWith(p));

    // ── Step 1: Index Routing (independent prefix check) ──
    // Index routing has its own prefix logic, checked BEFORE main trigger mode.
    if (this.indexRouting) {
      const routingResult = this.tryIndexRouting(trimmed, matchedMainPrefix);
      if (routingResult) return; // Handled by index routing
    }

    // ── Step 2: Main trigger mode logic ──
    if (this.triggerMode === 'negative') {
      // Negative mode: prefix BLOCKS categorization, no prefix triggers it
      if (matchedMainPrefix) {
        // User explicitly typed the prefix → skip auto-categorization entirely
        return;
      }
      // No prefix found → auto-categorize with AI
      autoCategorizationService.categorizeCurrentConversation(trimmed).catch(() => {});
    } else {
      // Positive mode (default): prefix TRIGGERS categorization
      if (!matchedMainPrefix) return;

      const startIdx = rawText.indexOf(matchedMainPrefix);
      const userPromptContext = rawText.substring(startIdx + matchedMainPrefix.length);

      autoCategorizationService
        .categorizeCurrentConversation(userPromptContext.trim())
        .catch(() => {});
    }
  }

  /**
   * Attempts to match and dispatch index routing (e.g. "1 2 prompt").
   * Returns true if index routing was triggered, false otherwise.
   */
  private tryIndexRouting(trimmedText: string, matchedMainPrefix: string | undefined): boolean {
    const escapeRegExp = (str: string) => str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const sepReg = escapeRegExp(this.routingSeparator || ' ');
    const numberPattern = `((?:\\d+(?:${sepReg}\\d+)*))`;

    // Determine which routing prefix to use
    let textAfterPrefix: string;

    if (this.useMainPrefixForRouting) {
      // Must start with the main prefix (e.g. ".1 2")
      if (!matchedMainPrefix) return false;
      const startIdx = trimmedText.indexOf(matchedMainPrefix);
      textAfterPrefix = trimmedText.substring(startIdx + matchedMainPrefix.length);
    } else if (this.customRoutingPrefix) {
      // Must start with the custom routing prefix (e.g. "/1 2")
      const routingPrefixes = this.getEquivalentPrefixes(this.customRoutingPrefix);
      const matchedRoutingPrefix = routingPrefixes.find((p) => trimmedText.startsWith(p));
      if (!matchedRoutingPrefix) return false;
      textAfterPrefix = trimmedText.substring(matchedRoutingPrefix.length);
    } else {
      // No prefix needed — bare numbers like "1 2 prompt" trigger routing.
      // Guard: only intercept if the text actually starts with a digit,
      // otherwise skip so normal messages (e.g. "one more thing") are not matched.
      if (!/^\d/.test(trimmedText)) return false;
      textAfterPrefix = trimmedText;
    }

    if (textAfterPrefix.length === 0) return false;

    // Match: digits (sep digits)* then optional remaining text
    // Fixed: The trailing separator is optional so ".1.1原神启动" matches digits "1.1" and rest "原神启动"
    const pattern = new RegExp(`^${numberPattern}(?:${sepReg})?(.*)$`, 's');
    const match = textAfterPrefix.match(pattern);
    if (!match) return false;

    const pathString = match[1];
    const pathParts = pathString.split(this.routingSeparator || ' ').map(Number);
    if (pathParts.some((n) => isNaN(n) || n <= 0)) return false;

    const remainingPrompt = (match[2] || '').trimStart();

    autoCategorizationService
      .categorizeToSpecificFolder(pathParts, remainingPrompt)
      .catch(() => {});
    return true;
  }

  private isTemporaryChat(): boolean {
    // 1. URL check: Temporary chat stays at /app even after sending messages
    // (Note: Regular new chat also starts at /app, but categorization requires existing history)
    const isAppPath = window.location.pathname.endsWith('/app');
    // 2. DOM marker: Gemini adds a specific class or attributes for temp mode
    const hasTempMarker = !!document.querySelector(
      '.temp-chat-on, [aria-label*="Temporary"], [aria-label*="临时"]',
    );

    return isAppPath && hasTempMarker;
  }

  private getEquivalentPrefixes(prefix: string): string[] {
    if (this.strictMatch) {
      return [prefix];
    }
    const groups = [
      ['.', '。'],
      ['/', '\\', '、'],
      [',', '，'],
      [':', '：'],
      [';', '；'],
      ['!', '！'],
      ['?', '？'],
    ];

    const group = groups.find((g) => g.includes(prefix));
    return group || [prefix];
  }

  private setupShortcutListener() {
    document.addEventListener('keydown', (e) => {
      const keys = [];
      if (e.ctrlKey || e.metaKey) keys.push('Ctrl');
      if (e.shiftKey) keys.push('Shift');
      if (e.altKey) keys.push('Alt');
      if (e.key !== 'Control' && e.key !== 'Shift' && e.key !== 'Alt' && e.key !== 'Meta') {
        let key = e.key;
        if (key && key.length === 1) key = key.toUpperCase();
        keys.push(key);
      }

      if (!this.isEnabled) return;

      const pressed = keys.join('+');

      if (pressed === this.shortcut) {
        e.preventDefault();

        // Find if there's any typed text in the input box
        let userPromptContext = '';
        const editables = document.querySelectorAll<HTMLElement>(
          'rich-textarea [contenteditable="true"], textarea',
        );
        if (editables.length > 0) {
          userPromptContext = this.getInputText(editables[0]).trim();
        }

        autoCategorizationService.categorizeCurrentConversation(userPromptContext).catch(() => {
          // Silently fail
        });
      }
    });
  }

  public destroy() {
    // Page unload cleans up content script listeners
  }
}

export const triggerService = TriggerService.getInstance();

export async function startAutoCategorization() {
  const result = await new Promise<Record<string, unknown>>((resolve) => {
    try {
      chrome.storage?.sync?.get(
        {
          gvAutoCategorizationEnabled: false,
          gvAutoCategorizationPrefix: '.',
          gvAutoCategorizationShortcut: 'Ctrl+Shift+U',
        },
        (res) => resolve(res),
      );
    } catch {
      resolve({ gvAutoCategorizationEnabled: false });
    }
  });

  await triggerService.init();
  return () => triggerService.destroy();
}
