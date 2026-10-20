/**
 * The Prompt Manager panel's fixed structure: header, search bar, tag strip and
 * footer rows. These builders only create elements; the panel wires behaviour
 * and swaps texts when the view or language changes.
 */
import { createLockOpenIcon } from '@/core/icons/promptManagerIcons';
import type { TranslationKey } from '@/utils/translations';

type Translate = (key: TranslationKey) => string;

function createEl<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className?: string,
): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  if (className) el.className = className;
  return el;
}

/** Drag handle, title row (title plus `titleControls`), and the controls row. */
export function createPanelHeader({
  t,
  titleControls,
  langSelect,
}: {
  t: Translate;
  titleControls: HTMLElement[];
  langSelect: HTMLSelectElement;
}) {
  const header = createEl('div', 'gv-pm-header');
  const dragHandle = createEl('div', 'gv-pm-drag');

  const titleRow = createEl('div', 'gv-pm-title-row');
  const title = createEl('div', 'gv-pm-title');
  const titleText = document.createElement('span');
  titleText.textContent = 'Voyager';
  title.appendChild(titleText);
  titleRow.append(title, ...titleControls);

  const controls = createEl('div', 'gv-pm-controls');

  const lockBtn = createEl('button', 'gv-pm-lock');
  lockBtn.setAttribute('type', 'button');
  lockBtn.setAttribute('aria-pressed', 'false');
  lockBtn.appendChild(createLockOpenIcon(15));
  lockBtn.title = t('pm_lock');

  const addBtn = createEl('button', 'gv-pm-add');
  addBtn.textContent = t('pm_add');

  controls.append(langSelect, addBtn, lockBtn);
  header.append(dragHandle, titleRow, controls);
  return { element: header, titleText, lockBtn, addBtn };
}

/**
 * Search wrap hosts the search input and, on its right edge, the
 * compact/comfortable view-mode toggle. Keeping the toggle here instead of
 * the header controls row prevents the "Voyager" title from being squeezed
 * into ellipsis, and keeps it adjacent to the list it governs.
 */
export function createSearchBar({ t }: { t: Translate }) {
  const searchWrap = createEl('div', 'gv-pm-search');
  const input = createEl('input');
  input.type = 'search';
  input.placeholder = t('pm_search_placeholder');

  const viewModeBtn = createEl('button', 'gv-pm-view-mode');
  viewModeBtn.setAttribute('type', 'button');
  // Icon, title, and aria-label come from its view-mode toggle.

  searchWrap.append(input, viewModeBtn);
  return { element: searchWrap, input, viewModeBtn };
}

/** The tag chip strip and the hint shown while more tags sit below. */
export function createTagsBar() {
  const outer = createEl('div', 'gv-pm-tags-wrap');
  const tags = createEl('div', 'gv-pm-tags');
  const scrollHint = createEl('div', 'gv-pm-tags-scroll-hint');
  scrollHint.setAttribute('aria-hidden', 'true');
  scrollHint.textContent = '▼';
  outer.append(tags, scrollHint);
  return { outer, tags };
}

/**
 * The prompt view's footer rows around the Saved Library's own footer actions.
 * The primary row holds the switch to the Saved Library; the secondary row
 * holds `secondary` (settings and sponsor).
 */
export function createPanelFooter({
  savedFooterActions,
  secondary,
}: {
  savedFooterActions: HTMLElement;
  secondary: HTMLElement[];
}) {
  const footer = createEl('div', 'gv-pm-footer');
  // Primary view switch: the previous local backup slot now opens the
  // Saved Library. Its return action lives in the dedicated saved footer.
  const backupBtn = createEl('button', 'gv-pm-backup-btn');
  backupBtn.setAttribute('type', 'button');

  const primaryActions = createEl('div', 'gv-pm-footer-actions');
  primaryActions.appendChild(backupBtn);

  const secondaryActions = createEl('div', 'gv-pm-footer-secondary');
  secondaryActions.append(...secondary);

  footer.append(primaryActions, savedFooterActions, secondaryActions);
  return { element: footer, backupBtn, primaryActions, secondaryActions };
}
