import { getTranslationSync } from '@/utils/i18n';

import { GEMS_NAV_ENTRY_SELECTOR } from './anchorGuard';

/** Gemini's sidebar "More" entry; its popover now holds the native Gems link. */
export const MORE_NAV_ENTRY_SELECTOR = '[data-test-id="overflow-side-nav-entry-button"]';
/** The scrolling top nav (Library, Images, …, More) inside the overflow container. */
const TOP_NAV_SELECTOR = 'mat-nav-list.top-action-list-scrollable';

const SECTION_CLASS = 'gv-gems-section';
const HEADER_CLASS = 'gv-gems-section-header';

/** Material Symbols `keyboard_arrow_right`; CSS rotates it down when expanded. */
export const CHEVRON_SVG =
  '<svg viewBox="0 -960 960 960" fill="currentColor" aria-hidden="true">' +
  '<path d="M504-480 320-664l56-56 240 240-240 240-56-56 184-184Z"/></svg>';

export interface GemsSectionAnchor {
  /** The top nav list the section was last placed after. */
  nav: HTMLElement | null;
  /** Voyager's section: header plus the gems list. */
  section: HTMLElement | null;
}

/**
 * The nav list the Gems section follows when Gemini has no Gems entry of its
 * own. Gemini's redesign moved that entry into the More popover, which only
 * renders while open, so the list hangs below the top nav instead. Pure.
 */
export function findGemsSectionNav(overflow: ParentNode): HTMLElement | null {
  const nav =
    overflow.querySelector(MORE_NAV_ENTRY_SELECTOR)?.closest('mat-nav-list') ??
    overflow.querySelector(TOP_NAV_SELECTOR);
  return nav instanceof HTMLElement && nav.parentElement ? nav : null;
}

function addsNavEntry(node: Node): boolean {
  if (!(node instanceof Element)) return false;
  const selector = `${GEMS_NAV_ENTRY_SELECTOR}, ${MORE_NAV_ENTRY_SELECTOR}`;
  return node.matches(selector) || node.querySelector(selector) !== null;
}

/**
 * Whether a sidebar mutation batch may have displaced the section, re-rendered
 * the top nav, or brought back a native Gems entry (which the list prefers).
 * Conversation rows streaming in leave it alone. Identity checks only. Pure.
 */
export function gemsSectionMayBeDisturbed(
  mutations: readonly MutationRecord[],
  { nav, section }: GemsSectionAnchor,
): boolean {
  if (!nav || !section || !nav.isConnected || nav.nextElementSibling !== section) return true;
  return mutations.some((mutation) => Array.from(mutation.addedNodes).some(addsNavEntry));
}

/** The section shell; the caller appends the gems list after its header. */
export function createGemsSection(onToggle: () => void): HTMLElement {
  const section = document.createElement('div');
  section.className = SECTION_CLASS;
  const header = document.createElement('button');
  header.type = 'button';
  header.className = HEADER_CLASS;
  const title = document.createElement('span');
  title.className = 'gv-gems-section-title';
  title.textContent = getTranslationSync('gemsSidebarSectionTitle') || 'Gems';
  header.appendChild(title);
  header.insertAdjacentHTML('beforeend', CHEVRON_SVG);
  header.addEventListener('click', (event) => {
    event.preventDefault();
    onToggle();
  });
  section.appendChild(header);
  return section;
}

export function setGemsSectionExpanded(section: HTMLElement, expanded: boolean): void {
  const header = section.querySelector(`.${HEADER_CLASS}`);
  header?.classList.toggle('gv-expanded', expanded);
  header?.setAttribute('aria-expanded', expanded ? 'true' : 'false');
}
