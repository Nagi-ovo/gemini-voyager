import { getTranslationSyncUnsafe as t } from '@/utils/i18n';

import { markCoachmarkSeen } from '../coachmark';
import { FOLDER_ONLY_SEARCH_HINT_ID } from './sidebarPrefs';

const FOLDER_SEARCH_DEBOUNCE_MS = 200;

export type FolderSearchBoxOptions = {
  query: () => string;
  setQuery: (query: string) => void;
  /** Whether the query is a folder-only (`f:`) search. */
  folderOnly: () => boolean;
  hintSeen: () => boolean;
  markHintSeen: () => void;
  /** Runs once typing pauses; the query itself is applied at once. */
  onSearch: () => void;
};

export type FolderSearchBox = {
  element: HTMLElement;
  refreshLanguage: () => void;
  /** Drops a search waiting for typing to pause. */
  cancel: () => void;
};

/** The folder search field, with its folder-only mode badge and `f:` hint. */
export function createFolderSearch(options: FolderSearchBoxOptions): FolderSearchBox {
  const container = document.createElement('div');
  container.className = 'gv-folder-search';

  const input = document.createElement('input');
  input.className = 'gv-folder-search-input';
  input.type = 'search';
  input.value = options.query();

  const modeBadge = document.createElement('span');
  modeBadge.className = 'gv-folder-search-mode-badge';
  modeBadge.setAttribute('aria-hidden', 'true');

  const updateState = () => {
    const folderOnlyMode = options.folderOnly();
    const baseLabel = t('folder_search_placeholder');
    const modeLabel = t('folder_search_mode_folder');
    container.classList.toggle('gv-folder-search-folder-mode', folderOnlyMode);
    modeBadge.hidden = !folderOnlyMode;
    modeBadge.textContent = modeLabel;
    input.placeholder = options.hintSeen() ? baseLabel : `${baseLabel} · f: ${modeLabel}`;
    input.setAttribute('aria-label', folderOnlyMode ? `${baseLabel}: ${modeLabel}` : baseLabel);
  };

  let timer: number | null = null;
  const cancel = () => {
    if (timer === null) return;
    window.clearTimeout(timer);
    timer = null;
  };

  input.addEventListener('input', () => {
    options.setQuery(input.value);
    updateState();
    if (options.folderOnly() && !options.hintSeen()) {
      options.markHintSeen();
      input.placeholder = t('folder_search_placeholder');
      void markCoachmarkSeen(FOLDER_ONLY_SEARCH_HINT_ID);
    }
    // Debounce the tree rebuild — rebuilding on every keystroke made fast
    // typing feel laggy on large trees. The query itself is applied
    // immediately so a pending refresh from any source uses the latest text.
    cancel();
    timer = window.setTimeout(() => {
      timer = null;
      options.onSearch();
    }, FOLDER_SEARCH_DEBOUNCE_MS);
  });

  container.append(input, modeBadge);
  updateState();
  return { element: container, refreshLanguage: updateState, cancel };
}
