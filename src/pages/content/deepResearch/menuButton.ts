/**
 * Menu button injection module for Deep Research export
 */

import { downloadMarkdown } from './download';
import { extractThinkingPanels } from './extractor';
import { formatToMarkdown } from './formatter';

/**
 * Wait for an element to appear in the DOM
 */
function waitForElement(selector: string, timeout: number = 5000): Promise<Element | null> {
    return new Promise((resolve) => {
        const element = document.querySelector(selector);
        if (element) {
            return resolve(element);
        }

        const observer = new MutationObserver(() => {
            const found = document.querySelector(selector);
            if (found) {
                observer.disconnect();
                resolve(found);
            }
        });

        observer.observe(document.body, {
            childList: true,
            subtree: true,
        });

        setTimeout(() => {
            observer.disconnect();
            resolve(null);
        }, timeout);
    });
}

/**
 * Load i18n dictionaries
 */
async function loadDictionaries(): Promise<Record<'en' | 'zh', Record<string, string>>> {
    try {
        const enRaw: any = await import(/* @vite-ignore */ '../../../locales/en/messages.json');
        const zhRaw: any = await import(/* @vite-ignore */ '../../../locales/zh/messages.json');

        const extract = (raw: any): Record<string, string> => {
            const out: Record<string, string> = {};
            if (raw && typeof raw === 'object') {
                Object.keys(raw).forEach((k) => {
                    const v = (raw as any)[k];
                    if (v && typeof v.message === 'string') out[k] = v.message;
                });
            }
            return out;
        };

        return { en: extract(enRaw), zh: extract(zhRaw) } as any;
    } catch (error) {
        console.error('[Gemini Voyager] Error loading dictionaries:', error);
        return { en: {}, zh: {} } as any;
    }
}

/**
 * Get user language preference
 */
async function getLanguage(): Promise<'en' | 'zh'> {
    try {
        const stored = await new Promise<any>((resolve) => {
            try {
                (window as any).chrome?.storage?.sync?.get?.('language', resolve);
            } catch {
                resolve({});
            }
        });

        const lang = typeof stored?.language === 'string' ? stored.language : undefined;
        const normalized = lang && lang.toLowerCase().startsWith('zh') ? 'zh' : 'en';
        return normalized;
    } catch {
        return 'en';
    }
}

/**
 * Handle download button click
 */
function handleDownload(): void {
    try {
        console.log('[Gemini Voyager] Extracting Deep Research thinking content...');

        const content = extractThinkingPanels();
        if (!content) {
            console.warn('[Gemini Voyager] No thinking content found');
            return;
        }

        const markdown = formatToMarkdown(content);
        downloadMarkdown(markdown);
    } catch (error) {
        console.error('[Gemini Voyager] Error handling download:', error);
    }
}

/**
 * Create download button matching Material Design style
 */
function createDownloadButton(text: string, tooltip: string): HTMLButtonElement {
    const button = document.createElement('button');
    button.className = 'mat-mdc-menu-item mat-focus-indicator menu-item-button gv-deep-research-download';
    button.setAttribute('mat-menu-item', '');
    button.setAttribute('role', 'menuitem');
    button.setAttribute('tabindex', '0');
    button.setAttribute('aria-disabled', 'false');
    button.setAttribute('aria-label', tooltip);
    button.title = tooltip;

    // Create icon
    const icon = document.createElement('mat-icon');
    icon.className = 'mat-icon notranslate google-symbols mat-ligature-font mat-icon-no-color';
    icon.setAttribute('role', 'img');
    icon.setAttribute('fonticon', 'download');
    icon.setAttribute('aria-hidden', 'true');
    icon.textContent = 'download';

    // Create text span
    const span = document.createElement('span');
    span.className = 'mat-mdc-menu-item-text';
    span.textContent = ` ${text}`;

    // Create ripple effect
    const ripple = document.createElement('div');
    ripple.className = 'mat-ripple mat-mdc-menu-ripple';
    ripple.setAttribute('matripple', '');

    button.appendChild(icon);
    button.appendChild(span);
    button.appendChild(ripple);

    // Add click handler
    button.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        handleDownload();
    });

    return button;
}

/**
 * Inject download button into menu
 */
export async function injectDownloadButton(): Promise<void> {
    try {
        // Load i18n
        const dict = await loadDictionaries();
        const lang = await getLanguage();
        const t = (key: string) => dict[lang]?.[key] ?? dict.en?.[key] ?? key;

        // Wait for menu to appear
        const menuPanel = await waitForElement('.mat-mdc-menu-panel[role="menu"]');
        if (!menuPanel) {
            console.log('[Gemini Voyager] Menu panel not found');
            return;
        }

        // Check if button already exists
        if (menuPanel.querySelector('.gv-deep-research-download')) {
            return;
        }

        // Find the menu content container
        const menuContent = menuPanel.querySelector('.mat-mdc-menu-content');
        if (!menuContent) {
            console.log('[Gemini Voyager] Menu content not found');
            return;
        }

        // Create and insert button
        const buttonText = t('deepResearchDownload');
        const buttonTooltip = t('deepResearchDownloadTooltip');
        const button = createDownloadButton(buttonText, buttonTooltip);

        // Insert button after the copy button (last item)
        menuContent.appendChild(button);

        console.log('[Gemini Voyager] Deep Research download button injected successfully');
    } catch (error) {
        console.error('[Gemini Voyager] Error injecting download button:', error);
    }
}
