import { autoCategorizationService } from './AutoCategorizationService';
import { keyboardShortcutService } from './KeyboardShortcutService';

/**
 * Service for managing triggers that activate auto-categorization.
 * Monitors input prefixes and keyboard shortcuts.
 */
export class TriggerService {
    private static instance: TriggerService;
    private inputObserver: MutationObserver | null = null;
    private attachedElements = new WeakSet<HTMLElement>();

    private constructor() { }

    public static getInstance(): TriggerService {
        if (!TriggerService.instance) {
            TriggerService.instance = new TriggerService();
        }
        return TriggerService.instance;
    }

    public init() {
        this.setupInputObserver();
        this.setupShortcutListener();
        this.attachToExistingInputs();
    }

    private setupInputObserver() {
        this.inputObserver = new MutationObserver((mutations) => {
            for (const mutation of mutations) {
                for (const node of mutation.addedNodes) {
                    if (!(node instanceof HTMLElement)) continue;

                    if (this.isEditable(node)) {
                        this.attachToInput(node);
                    }

                    const editables = node.querySelectorAll<HTMLElement>('[contenteditable="true"], textarea');
                    editables.forEach(el => this.attachToInput(el));
                }
            }
        });

        this.inputObserver.observe(document.body, { childList: true, subtree: true });
    }

    private attachToExistingInputs() {
        const editables = document.querySelectorAll<HTMLElement>('[contenteditable="true"], textarea');
        editables.forEach(el => this.attachToInput(el));
    }

    private isEditable(el: HTMLElement): boolean {
        return el.isContentEditable || el.tagName === 'TEXTAREA' || el.getAttribute('role') === 'textbox';
    }

    private attachToInput(el: HTMLElement) {
        if (this.attachedElements.has(el)) return;
        this.attachedElements.add(el);

        el.addEventListener('input', (event) => {
            const target = event.target as HTMLElement;
            const text = this.getInputText(target);

            // Trigger if text starts with . or 。
            if (text.startsWith('.') || text.startsWith('。')) {
                console.log('[TriggerService] Prefix trigger detected');
                // We might want to throttle this or wait for a specific length
                // For now, let's just log it. In a real scenario, we'd trigger a suggestion.
                // autoCategorizationService.categorizeCurrentConversation();
            }
        });
    }

    private getInputText(el: HTMLElement): string {
        if (el instanceof HTMLTextAreaElement) return el.value;
        return el.textContent || '';
    }

    private setupShortcutListener() {
        keyboardShortcutService.on((action) => {
            if (action === 'folder:auto_categorize' as any) {
                console.log('[TriggerService] Shortcut trigger detected');
                autoCategorizationService.categorizeCurrentConversation();
            }
        });
    }

    public destroy() {
        if (this.inputObserver) {
            this.inputObserver.disconnect();
            this.inputObserver = null;
        }
    }
}

export const triggerService = TriggerService.getInstance();

/**
 * Initialize auto-categorization feature
 */
export async function startAutoCategorization() {
    triggerService.init();
    return () => triggerService.destroy();
}
