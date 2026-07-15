import { getTranslationSync, initI18n } from '@/utils/i18n';
import type { TranslationKey } from '@/utils/translations';

import {
  type CoachmarkProgress,
  type CoachmarkResult,
  type CoachmarkSequenceStep,
  showCoachmark,
} from '../coachmark';
import { keepSidebarExpanded } from '../sidebarAutoHide';

export const CONVERSATION_SORT_COACHMARK_ID = 'folder-conversation-sort-intro-v1';
const SIDEBAR_EXPAND_WAIT_MS = 320;
export const CONVERSATION_SORT_COACHMARK_DEBUG_EVENT = 'gv:debug:conversationSortCoachmark';

const SORT_ICON =
  '<svg viewBox="0 -960 960 960" fill="currentColor" aria-hidden="true"><path d="M280-240 120-400l56-56 64 63v-407h80v407l64-63 56 56-160 160Zm360 80v-407l-64 63-56-56 160-160 160 160-56 56-64-63v407h-80Z"/></svg>';

const t = (key: TranslationKey, fallback: string): string => {
  try {
    const value = getTranslationSync(key);
    return value && value !== key ? value : fallback;
  } catch {
    return fallback;
  }
};

const wait = (ms: number) => new Promise<void>((resolve) => window.setTimeout(resolve, ms));

function getVisibleSettingsButton(): HTMLButtonElement | null {
  const button = document.querySelector<HTMLButtonElement>('.gv-folder-settings-btn');
  if (!button) return null;
  const rect = button.getBoundingClientRect();
  return rect.width > 0 && rect.height > 0 ? button : null;
}

function dispatchSettingsClick(button: HTMLButtonElement): void {
  const rect = button.getBoundingClientRect();
  button.dispatchEvent(
    new MouseEvent('click', {
      bubbles: true,
      cancelable: true,
      clientX: Math.round(rect.left + rect.width / 2),
      clientY: Math.round(rect.bottom),
    }),
  );
}

let settingsPreviewMenu: HTMLElement | null = null;

function mountSortSettingsPreview(): HTMLElement {
  const button = getVisibleSettingsButton();
  if (!button) throw new Error('Folder settings button is unavailable');

  dispatchSettingsClick(button);
  const menu = document.querySelector<HTMLElement>('.gv-folder-settings-menu');
  settingsPreviewMenu = menu;
  const row = menu?.querySelector<HTMLElement>('.gv-folder-sort-settings-row');
  if (!menu || !row) throw new Error('Conversation sort settings are unavailable');

  menu.classList.add('gv-coach-folder-settings-preview');
  // The whole settings panel is the interactive reveal boundary. Users can
  // try sorting, font size, spacing, and indentation without dismissing the
  // guide; only interactions outside this panel should end the tour.
  return menu;
}

function unmountSortSettingsPreview(element: HTMLElement | null, result: CoachmarkResult): void {
  const menu = element?.closest<HTMLElement>('.gv-folder-settings-menu') ?? settingsPreviewMenu;
  menu?.classList.remove('gv-coach-folder-settings-preview');

  // "Next" / "Done" hands the open, now-interactive settings menu to the user.
  // Explicitly abandoning the guide still rolls the temporary preview back.
  if (result === 'confirmed' || result === 'enabled') {
    settingsPreviewMenu = null;
    return;
  }

  const button = getVisibleSettingsButton();
  if (menu?.isConnected) {
    if (button) dispatchSettingsClick(button);
    else menu.remove();
  }
  settingsPreviewMenu = null;
}

export async function maybeShowConversationSortCoachmark(
  opts: { force?: boolean; progress?: CoachmarkProgress } = {},
): Promise<CoachmarkResult> {
  if (location.hostname !== 'gemini.google.com') return 'skipped';

  try {
    await initI18n();
  } catch {
    /* fall back to literals */
  }

  const releaseSidebar = keepSidebarExpanded();
  try {
    await wait(SIDEBAR_EXPAND_WAIT_MS);
    return await showCoachmark({
      id: CONVERSATION_SORT_COACHMARK_ID,
      once: !opts.force,
      scrim: true,
      icon: SORT_ICON,
      title: t('conversationSortCoachmarkTitle', 'New: conversation sorting'),
      body: t(
        'conversationSortCoachmarkBody',
        'Manual order keeps your drag-and-drop arrangement. Recently opened brings chats you visit back to the top. Switch anytime in Folder settings.',
      ),
      placement: 'bottom',
      reveal: {
        mount: mountSortSettingsPreview,
        unmount: unmountSortSettingsPreview,
        interactive: true,
      },
      anchor: () => document.querySelector<HTMLElement>('.gv-folder-settings-menu'),
      dismissLabel: t('coachmarkDismiss', 'Done'),
      nextLabel: t('coachmarkNext', 'Next'),
      closeLabel: t('coachmarkClose', 'Close'),
      progress: opts.progress,
    });
  } finally {
    releaseSidebar();
  }
}

export const conversationSortCoachmarkStep: CoachmarkSequenceStep = {
  id: CONVERSATION_SORT_COACHMARK_ID,
  isEligible: () => location.hostname === 'gemini.google.com',
  show: (progress) => maybeShowConversationSortCoachmark({ progress }),
};

const showDebugConversationSortCoachmark = () =>
  void maybeShowConversationSortCoachmark({ force: true });

try {
  (window as unknown as Record<string, unknown>).__gvConversationSortCoachmark =
    showDebugConversationSortCoachmark;
  document.addEventListener(
    CONVERSATION_SORT_COACHMARK_DEBUG_EVENT,
    showDebugConversationSortCoachmark,
  );
} catch {
  /* ignore */
}
