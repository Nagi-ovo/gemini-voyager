import type { HideFiledDom } from '../siteFolders/types';

export const FILED_ROW_ATTRIBUTE = 'data-gv-chatgpt-filed';

/** Recents only: a filed chat stays visible inside its Project. */
const HISTORY_ROW = '[data-sidebar-project-container-id="chats"] [role="listitem"]';

/**
 * ChatGPT's Recents rows. The current-page exception responds to navigation
 * without waiting for a row pass. A row holding focus (ChatGPT's own rename
 * field) stays shown until it lets go.
 */
export const CHATGPT_HIDE_FILED: HideFiledDom = {
  rowSelector: HISTORY_ROW,
  filedAttribute: FILED_ROW_ATTRIBUTE,
  styleAttribute: 'data-gv-chatgpt-hide-filed',
  css: `${HISTORY_ROW}[${FILED_ROW_ATTRIBUTE}]:not([aria-current="page"]):not(:has([aria-current="page"])):not(:focus-within) { display: none !important; }`,
  idPattern: /^[A-Za-z0-9_-]+$/,
};
