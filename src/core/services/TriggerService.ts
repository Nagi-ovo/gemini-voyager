import { autoCategorizationService } from './AutoCategorizationService';
import { StorageKeys } from '@/core/types/common';
import { storageService } from './StorageService';

/**
 * Service for managing triggers that activate auto-categorization.
 * Monitors input prefixes and keyboard shortcuts.
 */
export class TriggerService {
    private static instance: TriggerService;
    private prefix = '.';
    private shortcut = 'Ctrl+Shift+U';

    private constructor() { }

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

        this.setupSendInterceptors();
        this.setupShortcutListener();
    }

    private setupSendInterceptors() {
        // Intercept Enter key
        document.addEventListener(
            'keydown',
            (e) => {
                if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) {
                    const target = e.target as HTMLElement;
                    if (this.isEditable(target)) {
                        this.checkAndTriggerCategorization(target);
                    }
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
        return el.isContentEditable || el.tagName === 'TEXTAREA' || el.getAttribute('role') === 'textbox';
    }

    private getInputText(el: HTMLElement): string {
        if (el instanceof HTMLTextAreaElement) return el.value;
        return el.textContent || '';
    }

    private checkAndTriggerCategorization(el: HTMLElement) {
        const text = this.getInputText(el).trim();
        // Trigger if text starts with configured prefix or its full-width equivalent (。)
        const isDotPrefix = this.prefix === '.';
        if (text.startsWith(this.prefix) || (isDotPrefix && text.startsWith('。'))) {
            const userPromptContext = text.substring(1).trim(); // Remove the prefix character
            // Do not wait 3 seconds here. AutoCategorizationService will wait for the response to finish.
            autoCategorizationService.categorizeCurrentConversation(userPromptContext).catch(() => {
                // Silently fail
            });
        }
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
        chrome.storage?.sync?.get({ gvAutoCategorizationEnabled: false }, (res) => resolve(res));
    });

    if (!result.gvAutoCategorizationEnabled) {
        return () => { };
    }

    triggerService.init();
    return () => triggerService.destroy();
}
