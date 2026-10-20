/**
 * The Settings button in the Prompt Manager footer. It asks the background to
 * open the extension popup and, when that cannot happen, tells the user where
 * to find the settings instead.
 */
import browser from 'webextension-polyfill';

import { isExtensionContextInvalidatedError } from '@/core/utils/extensionContext';
import type { TranslationKey } from '@/utils/translations';

export function createSettingsButton({
  t,
  setNotice,
}: {
  t: (key: TranslationKey) => string;
  setNotice: (text: string, kind: 'ok' | 'err') => void;
}): { element: HTMLButtonElement; applyTexts: () => void } {
  const button = document.createElement('button');
  button.className = 'gv-pm-settings';

  function applyTexts(): void {
    button.textContent = t('pm_settings');
    button.title = t('pm_settings_tooltip');
  }

  const showFallback = () =>
    setNotice(t('pm_settings_fallback') || '请点击浏览器工具栏中的扩展图标打开设置', 'err');

  button.addEventListener('click', async (ev) => {
    ev.preventDefault();
    ev.stopPropagation();
    try {
      // Check if extension context is still valid
      if (!browser.runtime?.id) {
        // Extension context invalidated, show fallback message
        showFallback();
        return;
      }

      // Send message to background to open popup
      const response = (await browser.runtime.sendMessage({ type: 'gv.openPopup' })) as {
        ok?: boolean;
      };
      // If programmatic opening failed, show a helpful message
      if (!response?.ok) showFallback();
    } catch (err) {
      // Silently handle extension context errors
      if (!isExtensionContextInvalidatedError(err)) {
        console.warn('[PromptManager] Failed to open settings:', err);
      }
      showFallback();
    }
  });

  applyTexts();
  return { element: button, applyTexts };
}
