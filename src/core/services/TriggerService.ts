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
        console.log('[TriggerService-DEBUG] init() started.');
        const prefixRes = await storageService.get<string>(StorageKeys.AUTO_CATEGORIZATION_PREFIX);
        if (prefixRes.success) {
            this.prefix = prefixRes.data;
            console.log('[TriggerService-DEBUG] Loaded custom prefix from storage:', this.prefix);
        } else {
            console.log('[TriggerService-DEBUG] Using default prefix:', this.prefix);
        }

        const shortcutRes = await storageService.get<string>(StorageKeys.AUTO_CATEGORIZATION_SHORTCUT);
        if (shortcutRes.success) {
            this.shortcut = shortcutRes.data;
            console.log('[TriggerService-DEBUG] Loaded custom shortcut from storage:', this.shortcut);
        } else {
            console.log('[TriggerService-DEBUG] Using default shortcut:', this.shortcut);
        }

        this.setupSendInterceptors();
        this.setupShortcutListener();
        console.log('[TriggerService-DEBUG] init() finished.');
    }

    private setupSendInterceptors() {
        // Intercept Enter key
        document.addEventListener(
            'keydown',
            (e) => {
                if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) {
                    const target = e.target as HTMLElement;
                    console.log('[TriggerService-DEBUG] Enter key pressed on:', target);
                    if (this.isEditable(target)) {
                        console.log('[TriggerService-DEBUG] Editable element confirmed, checking text...');
                        this.checkAndTriggerCategorization(target);
                    } else {
                        console.log('[TriggerService-DEBUG] Element is NOT editable.');
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
                    console.log('[TriggerService-DEBUG] Send button clicked');
                    const editables = document.querySelectorAll<HTMLElement>(
                        'rich-textarea [contenteditable="true"], textarea',
                    );
                    console.log('[TriggerService-DEBUG] Found editable elements:', editables.length);
                    editables.forEach((el) => this.checkAndTriggerCategorization(el));
                }
            },
            { capture: true },
        );
    }

    private isEditable(el: HTMLElement): boolean {
        const isEdit = el.isContentEditable || el.tagName === 'TEXTAREA' || el.getAttribute('role') === 'textbox';
        console.log('[TriggerService-DEBUG] isEditable evaluation for', el.tagName, 'is', isEdit);
        return isEdit;
    }

    private getInputText(el: HTMLElement): string {
        if (el instanceof HTMLTextAreaElement) return el.value;
        return el.textContent || '';
    }

    private checkAndTriggerCategorization(el: HTMLElement) {
        const text = this.getInputText(el).trim();
        console.log('[TriggerService-DEBUG] Parsed text:', text, '| Target prefix:', this.prefix);
        // Trigger if text starts with configured prefix or its full-width equivalent (。)
        const isDotPrefix = this.prefix === '.';
        if (text.startsWith(this.prefix) || (isDotPrefix && text.startsWith('。'))) {
            const userPromptContext = text.substring(1).trim(); // Remove the prefix character
            console.log(`[TriggerService-DEBUG] PREFIX TRIGGER MATCHED: ${this.prefix}`);
            // Do not wait 3 seconds here. AutoCategorizationService will wait for the response to finish.
            autoCategorizationService.categorizeCurrentConversation(userPromptContext).catch(err => {
                console.error('[TriggerService-DEBUG] Error during categorization:', err);
            });
        } else {
            console.log('[TriggerService-DEBUG] No prefix match.');
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
            if (e.ctrlKey || e.altKey || e.metaKey) {
                // Minimal logging for shortcut checks to avoid noise
            }

            if (pressed === this.shortcut) {
                e.preventDefault();
                console.log(`[TriggerService-DEBUG] SHORTCUT TRIGGER MATCHED: ${this.shortcut}`);

                // Find if there's any typed text in the input box
                let userPromptContext = '';
                const editables = document.querySelectorAll<HTMLElement>(
                    'rich-textarea [contenteditable="true"], textarea',
                );
                if (editables.length > 0) {
                    userPromptContext = this.getInputText(editables[0]).trim();
                }

                autoCategorizationService.categorizeCurrentConversation(userPromptContext).catch(err => {
                    console.error('[TriggerService-DEBUG] Error during categorization from shortcut:', err);
                });
            }
        });
    }

    public destroy() {
        console.log('[TriggerService-DEBUG] Destroy called.');
        // Page unload cleans up content script listeners
    }
}

export const triggerService = TriggerService.getInstance();

export async function startAutoCategorization() {
    console.log('[TriggerService-DEBUG] startAutoCategorization called.');
    const result = await new Promise<Record<string, unknown>>((resolve) => {
        chrome.storage?.sync?.get({ gvAutoCategorizationEnabled: false }, (res) => resolve(res));
    });

    console.log('[TriggerService-DEBUG] gvAutoCategorizationEnabled is:', result.gvAutoCategorizationEnabled);
    if (!result.gvAutoCategorizationEnabled) {
        console.log('[TriggerService-DEBUG] AutoCategorization is disabled. Exiting setup.');
        return () => { };
    }

    console.log('[TriggerService-DEBUG] Calling triggerService.init()');
    triggerService.init();
    return () => triggerService.destroy();
}
