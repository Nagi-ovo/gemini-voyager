import { MAX_SIDEBAR_WIDTH_PERCENT, normalizeSidebarWidth } from '@/core/utils/sidebarWidthValues';

export function buildSidebarWidthCss(widthValue: number): string {
  const normalized = normalizeSidebarWidth(widthValue);
  const unit = normalized > MAX_SIDEBAR_WIDTH_PERCENT ? 'px' : 'percent';

  const clampedWidth = unit === 'px' ? `${normalized}px` : `clamp(200px, ${normalized}vw, 800px)`; // preserve vw behavior for legacy %

  const closedWidth = 'var(--bard-sidenav-closed-width, 72px)'; // fallback matches collapsed rail width
  const openClosedDiff = `max(0px, calc(${clampedWidth} - ${closedWidth}))`;

  return `
    :root {
      --bard-sidenav-open-width: ${clampedWidth} !important;
      --bard-sidenav-open-closed-width-diff: ${openClosedDiff} !important;
      --gv-sidenav-shift: ${openClosedDiff} !important;
    }

    /* When sidenav is collapsed, zero out the shift */
    #app-root:has(side-navigation-content > div.collapsed) {
      --gv-sidenav-shift: 0px !important;
    }

    bard-sidenav {
      --bard-sidenav-open-width: ${clampedWidth} !important;
      --bard-sidenav-open-closed-width-diff: ${openClosedDiff} !important;
    }

    /* Keep top-level mode switcher (header) aligned when sidebar grows/shrinks */
    #app-root > main > div > bard-mode-switcher {
      transform: translateX(var(--gv-sidenav-shift)) !important;
      pointer-events: none !important;
    }

    /* Re-enable clicks only for actual interactive controls */
    #app-root > main > div > bard-mode-switcher :is(
      button,
      a,
      input,
      select,
      textarea,
      [role='button'],
      [tabindex]:not([tabindex='-1'])
    ) {
      pointer-events: auto;
    }

    /* Gemini can place a broad top-bar-actions hit layer above controls after sidebar shifts.
       Let the container pass through, while keeping actual controls clickable. */
    #app-root > main > div > bard-mode-switcher .top-bar-actions {
      pointer-events: none !important;
    }

    top-bar-actions .top-bar-actions {
      pointer-events: none !important;
    }

    top-bar-actions {
      pointer-events: none !important;
    }

    #app-root > main > div > bard-mode-switcher .top-bar-actions :is(
      button,
      a,
      input,
      select,
      textarea,
      [role='button'],
      [tabindex]:not([tabindex='-1']),
      search-nav-button,
      side-nav-sparkle-button,
      side-nav-menu-button
    ) {
      pointer-events: auto !important;
    }

    top-bar-actions .top-bar-actions :is(
      button,
      a,
      input,
      select,
      textarea,
      [role='button'],
      [tabindex]:not([tabindex='-1']),
      search-nav-button,
      side-nav-sparkle-button,
      side-nav-menu-button
    ) {
      pointer-events: auto !important;
    }

    top-bar-actions :is(
      button,
      a,
      input,
      select,
      textarea,
      [role='button'],
      [tabindex]:not([tabindex='-1']),
      search-nav-button,
      side-nav-sparkle-button,
      side-nav-menu-button
    ) {
      pointer-events: auto !important;
    }

    #app-root > main > div > bard-mode-switcher search-nav-button,
    #app-root > main > div > bard-mode-switcher search-nav-button button {
      position: relative;
      z-index: 1;
      pointer-events: auto !important;
    }

    top-bar-actions search-nav-button,
    top-bar-actions search-nav-button button {
      position: relative;
      z-index: 1;
      pointer-events: auto !important;
    }

    #app-root > main > div > bard-mode-switcher side-nav-sparkle-button,
    #app-root > main > div > bard-mode-switcher side-nav-sparkle-button button,
    #app-root > main > div > bard-mode-switcher side-nav-menu-button,
    #app-root > main > div > bard-mode-switcher side-nav-menu-button button {
      position: relative;
      z-index: 1;
      pointer-events: auto !important;
    }

    top-bar-actions side-nav-sparkle-button,
    top-bar-actions side-nav-sparkle-button button,
    top-bar-actions side-nav-menu-button,
    top-bar-actions side-nav-menu-button button {
      position: relative;
      z-index: 1;
      pointer-events: auto !important;
    }

    /* Gemini can stretch this host across the header while the visible logo pill
       stays narrow. Let the oversized transparent host pass through, but keep
       the actual logo controls clickable. */
    chat-app-side-nav-menu-button {
      pointer-events: none !important;
    }

    chat-app-side-nav-menu-button side-nav-sparkle-button,
    chat-app-side-nav-menu-button side-nav-sparkle-button :is(
      a,
      button,
      [role='button'],
      [tabindex]:not([tabindex='-1'])
    ) {
      pointer-events: auto !important;
    }

    /* Gemini now leaves this top-bar button at the default sidebar edge. With a
       widened sidebar it sits over the real in-sidenav close button, but clicking
       it does not collapse the sidebar (#748). Keep both the host and its inner
       controls transparent after the top-bar allow-list above re-enables buttons. */
    #app-root > main > div > bard-mode-switcher .top-bar-actions chat-app-side-nav-menu-button,
    #app-root > main > div > bard-mode-switcher .top-bar-actions chat-app-side-nav-menu-button *,
    #app-root > main > div > bard-mode-switcher .top-bar-actions chat-app-side-nav-menu-button :is(
      button,
      a,
      input,
      select,
      textarea,
      [role='button'],
      [tabindex]:not([tabindex='-1'])
    ),
    top-bar-actions chat-app-side-nav-menu-button,
    top-bar-actions chat-app-side-nav-menu-button *,
    top-bar-actions chat-app-side-nav-menu-button :is(
      button,
      a,
      input,
      select,
      textarea,
      [role='button'],
      [tabindex]:not([tabindex='-1'])
    ) {
      pointer-events: none !important;
    }

  `;
}
