/**
 * In-app navigation for AI Studio. A full page load would drop the SPA's
 * state, so these never assign `location`.
 */
import { logger } from '@/core/services/LoggerService';

const NATIVE_LIBRARY_LINK =
  '.nav-content a[href="/library"], .nav-content a[href$="aistudio.google.com/library"]';

/** Opens /library: the nav's own Library link, else the History API. */
export function openLibraryInApp(): void {
  const link = document.querySelector<HTMLAnchorElement>(NATIVE_LIBRARY_LINK);
  if (link) {
    link.click();
    return;
  }
  try {
    window.history.pushState({}, '', '/library');
    window.dispatchEvent(new PopStateEvent('popstate'));
  } catch {}
}

/**
 * Opens a prompt: the history list's own link, else the History API. When the
 * History API refuses, the page stays where it is. Returns whether it navigated.
 */
export function openPromptInApp(promptId: string, url: string): boolean {
  const link = document.querySelector<HTMLAnchorElement>(
    `ms-prompt-history-v3 a.prompt-link[href*="/prompts/${promptId}"]`,
  );
  if (link) {
    link.click();
    return true;
  }
  try {
    window.history.pushState({}, '', url);
    window.dispatchEvent(new PopStateEvent('popstate'));
    return true;
  } catch (error) {
    logger.warn('[AIStudioFolder] Could not open the prompt in the app', { url, error });
    return false;
  }
}
