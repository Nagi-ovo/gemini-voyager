import { autoCategorizationService } from './AutoCategorizationService';
import { keyboardShortcutService } from './KeyboardShortcutService';

/**
 * Service for managing triggers that activate auto-categorization.
 * Monitors input prefixes and keyboard shortcuts.
 */
export class TriggerService {
  private static instance: TriggerService;

  private constructor() {}

  public static getInstance(): TriggerService {
    if (!TriggerService.instance) {
      TriggerService.instance = new TriggerService();
    }
    return TriggerService.instance;
  }

  public init() {
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
          // Find the main chat input
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
    const text = this.getInputText(el).trim();
    // Trigger if text starts with . or 。
    if (text.startsWith('.') || text.startsWith('。')) {
      console.log('[TriggerService] Prefix trigger detected');
      // Wait for the conversation to be created/navigation to complete
      setTimeout(() => {
        autoCategorizationService.categorizeCurrentConversation();
      }, 3000);
    }
  }

  private setupShortcutListener() {
    keyboardShortcutService.on((action) => {
      if (action === ('folder:auto_categorize' as any)) {
        console.log('[TriggerService] Shortcut trigger detected');
        autoCategorizationService.categorizeCurrentConversation();
      }
    });
  }

  public destroy() {
    // Event listeners attached to document with capture: true are harder to remove cleanly
    // without keeping references, but keeping references complicates the singleton.
    // For extension content scripts, page unload cleans them up.
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
