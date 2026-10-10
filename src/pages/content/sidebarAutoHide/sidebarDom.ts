// Union of every shape we've seen the sidebar toggle take. Order matters only
// for `querySelectorAll` ordering tie-breaks; visibility filtering happens in
// `findSidebarToggle` because the 2026 layout keeps an invisible 0×0 sibling
// around at all times.
//
//   - 2026 redesign: a real <button> with `aria-label="Open sidebar"` /
//     `aria-label="Close sidebar"`, wrapping `<mat-icon fonticon="side_nav">`
//     or `side_nav_expand`. The aria-label is localized, so we anchor on the
//     icon's fonticon attribute (i18n-stable) plus the English aria-label as
//     a redundant safety net.
//   - Legacy: `side-nav-menu-button` custom element (and inner <button>) — kept
//     so older Gemini layouts and AI-Studio-shaped tabs still work.
const SIDEBAR_TOGGLE_BUTTON_SELECTOR = [
  'button[aria-label="Open sidebar"]',
  'button[aria-label="Close sidebar"]',
  'side-nav-sparkle-button button',
  'button[data-test-id="side-nav-menu-button"]',
  'side-nav-menu-button button',
].join(', ');
const SIDEBAR_TOGGLE_BUTTON_MATCH_SELECTOR = `${SIDEBAR_TOGGLE_BUTTON_SELECTOR}, side-nav-menu-button, side-nav-sparkle-button`;
// Stable icon ligature names Gemini uses for the toggle (independent of locale).
const TOGGLE_ICON_FONTICONS = ['side_nav', 'side_nav_expand'] as const;
export function findSidebarToggle(): HTMLButtonElement | null {
  // The 2026 layout renders TWO buttons matching our selectors at any given
  // moment: one is the actually-visible toggle and the other is a 0×0
  // placeholder waiting for the opposite state. We need the visible one,
  // so `querySelector` (always picks the first DOM match) won't do — we
  // walk `querySelectorAll` and skip anything with zero geometry.
  const candidates = Array.from(
    document.querySelectorAll<HTMLButtonElement>(SIDEBAR_TOGGLE_BUTTON_SELECTOR),
  );

  // Also pick up the new layout via icon-ligature so localized aria-labels
  // can't shut us out. Walk up to the nearest <button> ancestor.
  for (const icon of document.querySelectorAll('mat-icon[fonticon]')) {
    const f = icon.getAttribute('fonticon');
    if (!f || !TOGGLE_ICON_FONTICONS.includes(f as (typeof TOGGLE_ICON_FONTICONS)[number])) {
      continue;
    }
    const btn = icon.closest('button');
    if (btn instanceof HTMLButtonElement && !candidates.includes(btn)) {
      candidates.push(btn);
    }
  }

  const visible = candidates.find((b) => {
    const rect = b.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0;
  });
  if (visible) return visible;

  // Legacy fallback — return any match even if 0×0, since older Gemini
  // layouts render the button in odd lifecycles where geometry isn't ready.
  if (candidates[0]) return candidates[0];

  const sideNavMenuButton = document.querySelector('side-nav-menu-button');
  if (sideNavMenuButton) {
    return sideNavMenuButton.querySelector<HTMLButtonElement>('button');
  }

  return null;
}

function getToggleCollapsedState(): boolean | null {
  const btn = findSidebarToggle();
  if (!btn) return null;

  const icon = btn.querySelector('mat-icon[fonticon]');
  const fonticon = icon?.getAttribute('fonticon');
  if (fonticon === 'side_nav_expand') return true;
  if (fonticon === 'side_nav') return false;

  const label = (btn.getAttribute('aria-label') ?? '').toLowerCase();
  if (label.includes('open sidebar')) return true;
  if (label.includes('close sidebar')) return false;

  return null;
}

function getSidebarContentContainer(): HTMLElement | null {
  return document.querySelector<HTMLElement>('bard-sidenav side-navigation-content > div');
}

function getStructuredSidebarCollapsedState(): boolean | null {
  const sidenav = getSidenavElement();
  if (sidenav?.classList.contains('collapsed')) return true;

  const sideContent = getSidebarContentContainer();
  if (sideContent) {
    if (sideContent.classList.contains('collapsed')) return true;
  }

  const toggleState = getToggleCollapsedState();
  if (toggleState !== null) return toggleState;

  if (document.body.classList.contains('mat-sidenav-opened')) return false;

  return null;
}

export function isSidebarCollapsed(): boolean {
  const structuredState = getStructuredSidebarCollapsedState();
  if (structuredState !== null) {
    return structuredState;
  }

  const sidenav = document.querySelector<HTMLElement>('bard-sidenav');
  if (sidenav) {
    const width = sidenav.getBoundingClientRect().width;
    if (width < 80) return true;
  }

  return false;
}

export function isSidebarVisible(): boolean {
  const sidenav = document.querySelector<HTMLElement>('bard-sidenav');
  if (!sidenav) return false;
  const rect = sidenav.getBoundingClientRect();
  return rect.width > 0 && rect.height > 0;
}

export function getSidenavElement(): HTMLElement | null {
  return document.querySelector<HTMLElement>('bard-sidenav');
}

export function isSidebarToggleTarget(target: HTMLElement): boolean {
  return target.closest(SIDEBAR_TOGGLE_BUTTON_MATCH_SELECTOR) !== null;
}
