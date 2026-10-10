/**
 * The light/dark switch in the Prompt Manager header.
 *
 * The panel starts in the host page's theme, then takes the user's saved
 * choice once it is read. The theme lives on the panel as `data-gv-theme`,
 * which every surface opened from the panel copies.
 */
import browser from 'webextension-polyfill';

import { createMoonIcon, createSunIcon } from '@/core/icons/promptManagerIcons';
import { StorageKeys } from '@/core/types/common';
import type { PromptScheme } from '@/features/prompt/PromptSiteAdapter';
import type { TranslationKey } from '@/utils/translations';

import { writeSyncedChoice } from './promptPrefs';

/** Returns the toggle button; it applies the theme to `panel` from the start. */
export function createThemeToggle({
  panel,
  t,
  pageScheme,
}: {
  panel: HTMLElement;
  t: (key: TranslationKey) => string;
  /** The host page's scheme, used until the saved choice is read, and when there is none. */
  pageScheme: PromptScheme;
}): HTMLButtonElement {
  const themeToggle = document.createElement('button');
  themeToggle.className = 'gv-pm-theme-toggle';
  themeToggle.setAttribute('type', 'button');
  let currentTheme = pageScheme;

  function applyTheme(theme: PromptScheme) {
    currentTheme = theme;
    panel.setAttribute('data-gv-theme', theme);
    themeToggle.classList.toggle('gv-pm-theme-dark', theme === 'dark');
    themeToggle.replaceChildren(theme === 'dark' ? createMoonIcon(11) : createSunIcon(11));
    themeToggle.title = theme === 'dark' ? t('pm_theme_light') : t('pm_theme_dark');
    themeToggle.setAttribute('aria-label', themeToggle.title);
  }

  applyTheme(currentTheme);

  // Load saved theme preference
  (async () => {
    try {
      const result = await browser.storage.sync.get(StorageKeys.PROMPT_THEME);
      const saved = result[StorageKeys.PROMPT_THEME];
      if (saved === 'light' || saved === 'dark') {
        applyTheme(saved);
      }
    } catch {
      // Ignore — keep detected theme
    }
  })();

  themeToggle.addEventListener('click', async () => {
    const newTheme: PromptScheme = currentTheme === 'dark' ? 'light' : 'dark';
    // Enable smooth color transition on all panel children
    panel.classList.add('gv-pm-transitioning');
    applyTheme(newTheme);
    setTimeout(() => panel.classList.remove('gv-pm-transitioning'), 450);
    await writeSyncedChoice(StorageKeys.PROMPT_THEME, newTheme);
  });

  return themeToggle;
}
