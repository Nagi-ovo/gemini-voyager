import type { PromptScheme } from '@/features/prompt/PromptSiteAdapter';

/**
 * The page's light/dark, read from the theme markers Gemini and AI Studio set
 * (and a few generic ones), else the OS. Prompt surfaces opened on any site
 * other than DeepSeek start from this.
 */
export function detectPageScheme(): PromptScheme {
  if (
    document.querySelector('.theme-host.dark-theme') ||
    document.body.classList.contains('dark-theme') ||
    document.documentElement.classList.contains('dark') ||
    document.body.getAttribute('data-theme') === 'dark'
  ) {
    return 'dark';
  }
  if (
    document.querySelector('.theme-host.light-theme') ||
    document.body.classList.contains('light-theme') ||
    document.documentElement.classList.contains('light') ||
    document.body.getAttribute('data-theme') === 'light'
  ) {
    return 'light';
  }
  return typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-color-scheme: dark)').matches
    ? 'dark'
    : 'light';
}
