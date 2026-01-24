/**
 * Menu button injection module for Deep Research export
 */

import { downloadMarkdown } from './download';
import { extractThinkingPanels } from './extractor';
import { formatToMarkdown } from './formatter';

import { StorageKeys } from '@/core/types/common';
import { normalizeLanguage, type AppLanguage } from '@/utils/language';
import { extractMessageDictionary } from '@/utils/localeMessages';
import type { TranslationKey } from '@/utils/translations';

type Dictionaries = Record<AppLanguage, Record<string, string>>;

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
async function loadDictionaries(): Promise<Dictionaries> {
  try {
    const [enRaw, zhRaw, jaRaw, frRaw, esRaw] = await Promise.all([
      import(/* @vite-ignore */ '../../../locales/en/messages.json'),
      import(/* @vite-ignore */ '../../../locales/zh/messages.json'),
      import(/* @vite-ignore */ '../../../locales/ja/messages.json'),
      import(/* @vite-ignore */ '../../../locales/fr/messages.json'),
      import(/* @vite-ignore */ '../../../locales/es/messages.json'),
    ]);

    return {
      en: extractMessageDictionary(enRaw),
      zh: extractMessageDictionary(zhRaw),
      ja: extractMessageDictionary(jaRaw),
      fr: extractMessageDictionary(frRaw),
      es: extractMessageDictionary(esRaw),
    };
  } catch (error) {
    console.error('[Gemini Voyager] Error loading dictionaries:', error);
    return { en: {}, zh: {}, ja: {}, fr: {}, es: {} };
  }
}

export function applyDeepResearchDownloadButtonI18n(
  button: HTMLButtonElement,
  dict: Dictionaries,
  lang: AppLanguage
): void {
  const t = (key: TranslationKey) => dict[lang]?.[key] ?? dict.en?.[key] ?? key;
  const text = t('deepResearchDownload');
  const tooltip = t('deepResearchDownloadTooltip');

  button.title = tooltip;
  button.setAttribute('aria-label', tooltip);

  const span = button.querySelector('.mat-mdc-menu-item-text');
  if (span) {
    span.textContent = ` ${text}`;
  }
}

/**
 * Get user language preference
 */
async function getLanguage(): Promise<AppLanguage> {
  try {
    const stored = await new Promise<unknown>((resolve) => {
      try {
        const w = window as any;
        const storage = w.chrome?.storage?.sync ?? w.browser?.storage?.sync;
        if (storage?.get) {
          storage.get(StorageKeys.LANGUAGE, resolve);
        } else {
          resolve({});
        }
      } catch {
        resolve({});
      }
    });

    const rec = stored && typeof stored === 'object' ? (stored as Record<string, unknown>) : {};
    const lang =
      typeof rec[StorageKeys.LANGUAGE] === 'string'
        ? (rec[StorageKeys.LANGUAGE] as string)
        : undefined;
    return normalizeLanguage(lang || navigator.language || 'en');
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
  button.className =
    'mat-mdc-menu-item mat-focus-indicator menu-item-button gv-deep-research-download';
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

type StorageChange = { newValue?: unknown };
type StorageChanges = Record<string, StorageChange>;

type StorageOnChanged = {
  addListener: (fn: (changes: StorageChanges, area: string) => void) => void;
  removeListener: (fn: (changes: StorageChanges, area: string) => void) => void;
};

type ExtensionStorage = {
  onChanged?: StorageOnChanged;
};

function getExtensionStorage(): ExtensionStorage | null {
  const w = window as unknown as {
    chrome?: { storage?: ExtensionStorage };
    browser?: { storage?: ExtensionStorage };
  };
  return w.chrome?.storage ?? w.browser?.storage ?? null;
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

    // Keep button text/tooltip in sync with runtime language changes
    const storage = getExtensionStorage();
    const onChanged = storage?.onChanged;
    if (onChanged?.addListener && onChanged?.removeListener) {
      let currentLang: AppLanguage = lang;
      const handler = (changes: StorageChanges, area: string) => {
        if (area !== 'sync') return;
        const nextRaw = changes?.[StorageKeys.LANGUAGE]?.newValue;
        if (typeof nextRaw !== 'string') return;
        currentLang = normalizeLanguage(nextRaw);
        applyDeepResearchDownloadButtonI18n(button, dict, currentLang);
      };

      onChanged.addListener(handler);

      const cleanup = () => {
        try {
          onChanged.removeListener(handler);
        } catch {}
      };

      const observer = new MutationObserver(() => {
        if (!document.contains(button)) {
          cleanup();
          observer.disconnect();
        }
      });

      observer.observe(document.body, { childList: true, subtree: true });

      window.addEventListener(
        'beforeunload',
        () => {
          cleanup();
          try {
            observer.disconnect();
          } catch {}
        },
        { once: true }
      );
    }

    console.log('[Gemini Voyager] Deep Research download button injected successfully');
  } catch (error) {
    console.error('[Gemini Voyager] Error injecting download button:', error);
  }
}
