/**
 * The light/dark/auto switch in the Prompt Manager header.
 *
 * The panel starts in auto mode (following the host page/system theme), then
 * takes the user's saved choice once it is read. The theme lives on the panel
 * as `data-gv-theme`, which every surface opened from the panel copies.
 */
import browser from 'webextension-polyfill';

import { createMonitorIcon, createMoonIcon, createSunIcon } from '@/core/icons/promptManagerIcons';
import { StorageKeys } from '@/core/types/common';
import type { PromptScheme } from '@/features/prompt/PromptSiteAdapter';
import type { TranslationKey } from '@/utils/translations';

import { subscribeScheme } from '../platformTheme/scheme';
import { writeSyncedChoice } from './promptPrefs';

export type PromptThemeMode = 'auto' | 'light' | 'dark';

export function getNextPromptTheme(currentMode: PromptThemeMode): PromptThemeMode {
  if (currentMode === 'light') return 'auto';
  if (currentMode === 'auto') return 'dark';
  return 'light';
}

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

  let currentMode: PromptThemeMode = 'auto';
  let currentScheme: PromptScheme = pageScheme;

  function resolveSystemScheme(): PromptScheme {
    const stamped = document.documentElement?.getAttribute('data-gv-scheme');
    if (stamped === 'dark' || stamped === 'light') return stamped;
    return pageScheme;
  }

  function applyTheme(mode: PromptThemeMode, scheme: PromptScheme) {
    currentMode = mode;
    currentScheme = scheme;
    panel.setAttribute('data-gv-theme', scheme);
    panel.setAttribute('data-gv-theme-mode', mode);

    themeToggle.classList.toggle('gv-pm-theme-dark', mode === 'dark');
    themeToggle.classList.toggle('gv-pm-theme-auto', mode === 'auto');

    if (mode === 'auto') {
      themeToggle.replaceChildren(createMonitorIcon(11));
    } else if (mode === 'dark') {
      themeToggle.replaceChildren(createMoonIcon(11));
    } else {
      themeToggle.replaceChildren(createSunIcon(11));
    }

    const nextMode = getNextPromptTheme(mode);
    if (nextMode === 'auto') {
      themeToggle.title = t('pm_theme_auto');
    } else if (nextMode === 'dark') {
      themeToggle.title = t('pm_theme_dark');
    } else {
      themeToggle.title = t('pm_theme_light');
    }
    themeToggle.setAttribute('aria-label', themeToggle.title);
  }

  applyTheme('auto', currentScheme);

  // Keep auto theme in sync with page/system theme changes
  const unsubscribeScheme = subscribeScheme((newScheme) => {
    if (!panel.isConnected && !themeToggle.isConnected) {
      unsubscribeScheme();
      return;
    }
    if (currentMode === 'auto') {
      applyTheme('auto', newScheme);
    }
  });

  // Load saved theme preference
  (async () => {
    try {
      const result = await browser.storage.sync.get(StorageKeys.PROMPT_THEME);
      const saved = result[StorageKeys.PROMPT_THEME] as PromptThemeMode | undefined;
      if (saved === 'light' || saved === 'dark') {
        applyTheme(saved, saved);
      } else if (saved === 'auto') {
        applyTheme('auto', resolveSystemScheme());
      }
    } catch {
      // Ignore — keep detected theme
    }
  })();

  themeToggle.addEventListener('click', async () => {
    const system = resolveSystemScheme();
    const nextMode = getNextPromptTheme(currentMode);
    const nextScheme: PromptScheme = nextMode === 'auto' ? system : nextMode;

    // Enable smooth color transition on all panel children
    panel.classList.add('gv-pm-transitioning');
    applyTheme(nextMode, nextScheme);
    setTimeout(() => panel.classList.remove('gv-pm-transitioning'), 450);
    await writeSyncedChoice(StorageKeys.PROMPT_THEME, nextMode);
  });

  return themeToggle;
}
