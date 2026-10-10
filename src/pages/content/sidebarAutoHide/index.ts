/**
 * Sidebar Auto-Hide & Full-Hide Feature for Gemini
 *
 * Auto-hide: sidebar automatically collapses when the mouse leaves,
 * and expands when the mouse enters.
 *
 * Full-hide: when collapsed (by auto-hide or manually), the sidebar
 * is fully hidden (zero width).
 *
 * Uses the `side-nav-menu-button` to toggle sidebar state.
 */

import { createFullHide } from './fullHide';
import { createHoverIntent } from './hoverIntent';
import { findSidebarToggle, isSidebarCollapsed, isSidebarToggleTarget } from './sidebarDom';

const STYLE_ID = 'gv-sidebar-auto-hide-style';
const STORAGE_KEY = 'gvSidebarAutoHide';
const FULL_HIDE_STORAGE_KEY = 'gvSidebarFullHide';
const OBSERVER_DEBOUNCE_MS = 100;
const SIDENAV_CHECK_INTERVAL_MS = 1000;
const RESIZE_DEBOUNCE_MS = 200;
const MENU_CLICK_PAUSE_MS = 1500;

let enabled = false;
let fullHideEnabled = false;
let autoCollapsed = false;
let keepExpandedLocks = 0;
let internalToggleClickDepth = 0;
let observer: MutationObserver | null = null;
let resizeHandler: (() => void) | null = null;
let resizeDebounceTimer: number | null = null;
let observerDebounceTimer: number | null = null;
let sidenavCheckTimer: number | null = null;
let menuClickHandler: ((event: Event) => void) | null = null;

const fullHide = createFullHide({
  onEdgeEnter: () => hover.enter(),
  onEdgeLeave: (event) => {
    if (fullHideEnabled) hover.leaveEdge(event);
  },
  onReconcile: checkAndReattach,
});
const hover = createHoverIntent({
  isEnabled: () => enabled,
  isEdgeHovered: fullHide.isEdgeHovered,
  expand: expandSidebar,
  collapse: collapseSidebar,
});

function getTransitionStyle(): string {
  return `
    /* Smooth transition for sidebar auto-hide / full-hide */
    bard-sidenav,
    bard-sidenav side-navigation-content,
    bard-sidenav side-navigation-content > div {
      transition: width 0.26s cubic-bezier(0.4, 0, 0.2, 1), min-width 0.26s cubic-bezier(0.4, 0, 0.2, 1), transform 0.26s cubic-bezier(0.4, 0, 0.2, 1) !important;
      will-change: width, min-width, transform;
    }
  `;
}

function insertTransitionStyle(): void {
  if (document.getElementById(STYLE_ID)) return;
  const style = document.createElement('style');
  style.id = STYLE_ID;
  style.textContent = getTransitionStyle();
  document.documentElement.appendChild(style);
}

function removeTransitionStyle(): void {
  const style = document.getElementById(STYLE_ID);
  if (style) style.remove();
}

function isKeepExpandedLocked(): boolean {
  return keepExpandedLocks > 0;
}

function handleMenuClick(e: Event): void {
  const target = e.target;
  if (!(target instanceof HTMLElement)) return;

  if (isSidebarToggleTarget(target)) {
    if (internalToggleClickDepth > 0) {
      return;
    }

    if (fullHideEnabled) {
      const wasCollapsed = isSidebarCollapsed();
      fullHide.beforeToggle(wasCollapsed);
      fullHide.afterToggle(wasCollapsed);
    }

    if (enabled) {
      hover.pause(MENU_CLICK_PAUSE_MS);
    }
    return;
  }

  if (!enabled) return;

  const menuItem = target.closest('[role="menuitem"], [role="menuitemradio"], .mat-mdc-menu-item');
  if (menuItem) {
    hover.pause(MENU_CLICK_PAUSE_MS);
    return;
  }

  const sidebarButton = target.closest('bard-sidenav button, bard-sidenav [role="button"]');
  if (sidebarButton) {
    hover.pause(MENU_CLICK_PAUSE_MS);
    return;
  }

  const optionsButton = target.closest(
    '[data-test-id*="options"], [aria-label*="选项"], [aria-label*="Options"], [aria-label*="More"]',
  );
  if (optionsButton) {
    hover.pause(MENU_CLICK_PAUSE_MS);
    return;
  }
}

// ─── Sidebar Toggle ────────────────────────────────────────────────────

function clickToggleButton(): boolean {
  const btn = findSidebarToggle();
  if (!btn) return false;

  internalToggleClickDepth += 1;
  try {
    const wasCollapsed = isSidebarCollapsed();
    if (fullHideEnabled) fullHide.beforeToggle(wasCollapsed);
    btn.click();

    if (fullHideEnabled) {
      fullHide.afterToggle(wasCollapsed);
    }
  } finally {
    internalToggleClickDepth -= 1;
  }

  return true;
}

function collapseSidebar(): void {
  if (isKeepExpandedLocked()) return;
  if (!hover.canCollapse()) return;

  if (!isSidebarCollapsed()) {
    if (clickToggleButton()) {
      autoCollapsed = true;
      hover.resetPrediction();
    }
  }
}

function expandSidebar(): void {
  if (isSidebarCollapsed()) {
    clickToggleButton();
    autoCollapsed = false;
    // Schedule a reattach so auto-hide listeners are re-added after expansion.
    // Must fire after the 220ms CSS transition completes to avoid mid-animation DOM updates.
    setTimeout(() => checkAndReattach(), 450);
  }
}

function checkAndReattach(): void {
  if (!enabled && !fullHideEnabled) return;
  if (enabled && hover.reattach()) autoCollapsed = false;
  if (fullHideEnabled) fullHide.sync(enabled, isKeepExpandedLocked());
}

function handleResize(): void {
  if (!enabled && !fullHideEnabled) return;

  if (resizeDebounceTimer !== null) {
    window.clearTimeout(resizeDebounceTimer);
  }

  resizeDebounceTimer = window.setTimeout(() => {
    resizeDebounceTimer = null;
    checkAndReattach();

    setTimeout(() => {
      if (enabled || fullHideEnabled) checkAndReattach();
    }, 600);
  }, RESIZE_DEBOUNCE_MS);
}

function startSidenavCheck(): void {
  if (sidenavCheckTimer !== null) return;
  sidenavCheckTimer = window.setInterval(() => {
    checkAndReattach();
  }, SIDENAV_CHECK_INTERVAL_MS);
}

function stopSidenavCheck(): void {
  if (sidenavCheckTimer !== null) {
    window.clearInterval(sidenavCheckTimer);
    sidenavCheckTimer = null;
  }
}

// ─── Shared Infrastructure ─────────────────────────────────────────────

function setupInfrastructure(): void {
  if (!observer) {
    observer = new MutationObserver(() => {
      if (!enabled && !fullHideEnabled) return;
      // Debounce: during sidebar expansion Gemini renders hundreds of
      // conversation rows in rapid succession. Without debouncing every
      // mutation triggers a synchronous DOM-query sweep (#753).
      if (observerDebounceTimer !== null) window.clearTimeout(observerDebounceTimer);
      observerDebounceTimer = window.setTimeout(() => {
        observerDebounceTimer = null;
        checkAndReattach();
      }, OBSERVER_DEBOUNCE_MS);
    });
    observer.observe(document.body, { childList: true, subtree: true });
  }

  if (!resizeHandler) {
    resizeHandler = handleResize;
    window.addEventListener('resize', resizeHandler);
  }

  startSidenavCheck();
}

function teardownInfrastructure(): void {
  if (enabled || fullHideEnabled) return;

  stopSidenavCheck();
  fullHide.clearScheduledSync();

  if (resizeDebounceTimer !== null) {
    window.clearTimeout(resizeDebounceTimer);
    resizeDebounceTimer = null;
  }

  if (observerDebounceTimer !== null) {
    window.clearTimeout(observerDebounceTimer);
    observerDebounceTimer = null;
  }

  if (observer) {
    observer.disconnect();
    observer = null;
  }

  if (resizeHandler) {
    window.removeEventListener('resize', resizeHandler);
    resizeHandler = null;
  }
}

function ensureMenuClickHandler(): void {
  if (menuClickHandler) return;
  menuClickHandler = handleMenuClick;
  document.addEventListener('click', menuClickHandler, true);
}

function maybeRemoveMenuClickHandler(): void {
  if (enabled || fullHideEnabled || !menuClickHandler) return;
  document.removeEventListener('click', menuClickHandler, true);
  menuClickHandler = null;
}

function enable(): void {
  if (enabled) return;
  enabled = true;
  autoCollapsed = false;

  insertTransitionStyle();
  hover.start();
  ensureMenuClickHandler();
  if (fullHideEnabled) fullHide.sync(enabled, isKeepExpandedLocked());

  setupInfrastructure();

  hover.scheduleInitialCollapse();
}

function disable(): void {
  if (!enabled) return;
  enabled = false;

  hover.clearPending();

  if (autoCollapsed && isSidebarCollapsed()) {
    clickToggleButton();
  }
  autoCollapsed = false;

  hover.stop();

  if (fullHideEnabled) {
    fullHide.sync(enabled, isKeepExpandedLocked());
  } else {
    removeTransitionStyle();
  }

  maybeRemoveMenuClickHandler();

  teardownInfrastructure();
}

function enableFullHide(): void {
  if (fullHideEnabled) return;
  fullHideEnabled = true;

  insertTransitionStyle();
  fullHide.mount();
  ensureMenuClickHandler();

  setupInfrastructure();
  fullHide.sync(enabled, isKeepExpandedLocked());

  // Show edge trigger if sidebar is already collapsed
  setTimeout(() => {
    if (!fullHideEnabled) return;
    fullHide.sync(enabled, isKeepExpandedLocked());
  }, 300);
}

function disableFullHide(): void {
  if (!fullHideEnabled) return;
  fullHideEnabled = false;

  fullHide.unmount();

  if (!enabled) {
    removeTransitionStyle();
    hover.stop();
  }

  maybeRemoveMenuClickHandler();

  teardownInfrastructure();
}

export function keepSidebarExpanded(): () => void {
  keepExpandedLocks += 1;
  hover.clearPending();
  if (isSidebarCollapsed()) expandSidebar();
  if (fullHideEnabled) fullHide.sync(enabled, isKeepExpandedLocked());

  let released = false;
  return () => {
    if (released) return;
    released = true;
    keepExpandedLocks = Math.max(0, keepExpandedLocks - 1);
    if (!isKeepExpandedLocked()) checkAndReattach();
  };
}

// ─── Entry Point ───────────────────────────────────────────────────────

export function startSidebarAutoHide(): void {
  // 1) Read initial settings
  try {
    chrome.storage?.sync?.get({ [STORAGE_KEY]: false, [FULL_HIDE_STORAGE_KEY]: false }, (res) => {
      if (res?.[STORAGE_KEY] === true) enable();
      if (res?.[FULL_HIDE_STORAGE_KEY] === true) enableFullHide();
    });
  } catch (e) {
    console.error('[Gemini Voyager] Failed to get sidebar settings:', e);
  }

  // 2) Respond to storage changes
  try {
    chrome.storage?.onChanged?.addListener((changes, area) => {
      if (area !== 'sync') return;

      if (changes[STORAGE_KEY]) {
        if (changes[STORAGE_KEY].newValue === true) {
          enable();
        } else {
          disable();
        }
      }

      if (changes[FULL_HIDE_STORAGE_KEY]) {
        if (changes[FULL_HIDE_STORAGE_KEY].newValue === true) {
          enableFullHide();
        } else {
          disableFullHide();
        }
      }
    });
  } catch (e) {
    console.error('[Gemini Voyager] Failed to add storage listeners for sidebar features:', e);
  }

  // 3) Cleanup on page unload
  window.addEventListener('beforeunload', () => {
    disable();
    disableFullHide();
  });
}
