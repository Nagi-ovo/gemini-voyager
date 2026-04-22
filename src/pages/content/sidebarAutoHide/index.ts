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

const STYLE_ID = 'gv-sidebar-auto-hide-style';
const FULL_HIDE_STYLE_ID = 'gv-sidebar-full-hide-style';
const STORAGE_KEY = 'gvSidebarAutoHide';
const FULL_HIDE_STORAGE_KEY = 'gvSidebarFullHide';
const EDGE_TRIGGER_ID = 'gv-sidebar-edge-trigger';
const FULL_HIDE_COLLAPSED_CLASS = 'gv-sidebar-full-hide-collapsed';
const SIDEBAR_TOGGLE_BUTTON_SELECTOR =
  'button[data-test-id="side-nav-menu-button"], side-nav-menu-button button';
const SIDEBAR_TOGGLE_BUTTON_MATCH_SELECTOR = `${SIDEBAR_TOGGLE_BUTTON_SELECTOR}, side-nav-menu-button`;
const SIDEBAR_STATE_SYNC_DELAYS_MS = [0, 300, 500] as const;

// Debounce delay to avoid rapid toggling
const LEAVE_DELAY_MS = 400;
const ENTER_DELAY_MS = 150;
// Interval to check for sidenav element reappearing
const SIDENAV_CHECK_INTERVAL_MS = 1000;
// Debounce delay for resize events
const RESIZE_DEBOUNCE_MS = 200;
// Pause duration after menu item click (wait for dialog to appear)
const MENU_CLICK_PAUSE_MS = 1500;
// Width of the invisible edge trigger zone (px)
const EDGE_TRIGGER_WIDTH = 6;
// ── Predictive aiming ──
// When the mouse is within this distance (px) from the left edge AND moving
// leftward faster than the velocity threshold, we pre-trigger expansion before
// mouseenter fires, eliminating the perceived "wait" completely.
const PREDICTIVE_ZONE_WIDTH = 100;
const PREDICTIVE_VELOCITY_THRESHOLD = -0.5; // px/ms (negative = leftward)
const PREDICTIVE_THROTTLE_MS = 50;
// If mouse triggers predictive expand but never enters the sidebar, auto-collapse
// after this safety window.
const PREDICTIVE_SAFETY_COLLAPSE_MS = 1200;
const CUSTOM_POPUP_SELECTORS = [
  '.gv-folder-dialog',
  '.gv-folder-dialog-overlay',
  '.gv-folder-confirm-dialog',
  '.gv-folder-import-dialog',
  '.gv-folder-menu',
  '.gv-color-picker-dialog',
];

// Auto-hide state
let enabled = false;
let leaveTimeoutId: number | null = null;
let enterTimeoutId: number | null = null;
let sidenavElement: HTMLElement | null = null;
let autoCollapsed = false;
let pausedUntil = 0;

// Full-hide state
let fullHideEnabled = false;
let edgeTriggerElement: HTMLElement | null = null;

// Predictive aiming state
let predictiveTriggered = false;
let lastMouseX: number | null = null;
let lastMouseTime: number | null = null;
let lastMoveProcessedTime = 0;
let predictiveMouseMoveHandler: ((e: MouseEvent) => void) | null = null;

// Shared infrastructure
let observer: MutationObserver | null = null;
let resizeHandler: (() => void) | null = null;
let resizeDebounceTimer: number | null = null;
let sidenavCheckTimer: number | null = null;
let menuClickHandler: ((e: Event) => void) | null = null;
let sidebarStateSyncTimeoutIds: number[] = [];
let internalToggleClickDepth = 0;

function isElementVisible(element: HTMLElement): boolean {
  const style = window.getComputedStyle(element);
  if (style.display === 'none' || style.visibility === 'hidden') {
    return false;
  }
  const rect = element.getBoundingClientRect();
  return rect.width > 0 || rect.height > 0;
}

// ─── Transition CSS (shared) ───────────────────────────────────────────

function getTransitionStyle(): string {
  return `
    /* Smooth transition for sidebar auto-hide / full-hide */
    bard-sidenav,
    bard-sidenav side-navigation-content,
    bard-sidenav side-navigation-content > div {
      transition: width 0.22s cubic-bezier(0.4, 0, 0.2, 1), transform 0.22s cubic-bezier(0.4, 0, 0.2, 1) !important;
      will-change: width, transform;
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

// ─── Full-Hide CSS ─────────────────────────────────────────────────────

function getFullHideStyle(): string {
  return `
    /* Fully hide collapsed sidebar */
    html.${FULL_HIDE_COLLAPSED_CLASS} bard-sidenav,
    html.${FULL_HIDE_COLLAPSED_CLASS} bard-sidenav side-navigation-content,
    html.${FULL_HIDE_COLLAPSED_CLASS} bard-sidenav side-navigation-content > div {
      width: 0 !important;
      min-width: 0 !important;
      overflow: hidden !important;
      padding: 0 !important;
    }
  `;
}

function insertFullHideStyle(): void {
  if (document.getElementById(FULL_HIDE_STYLE_ID)) return;
  const style = document.createElement('style');
  style.id = FULL_HIDE_STYLE_ID;
  style.textContent = getFullHideStyle();
  document.documentElement.appendChild(style);
}

function removeFullHideStyle(): void {
  const style = document.getElementById(FULL_HIDE_STYLE_ID);
  if (style) style.remove();
}

// ─── Edge Trigger (full-hide) ──────────────────────────────────────────

function handleEdgeTriggerLeave(e: MouseEvent): void {
  if (!enabled || !fullHideEnabled) return;

  const related = e.relatedTarget as HTMLElement | null;
  if (related) {
    const sidenav = getSidenavElement();
    if (sidenav && (sidenav === related || sidenav.contains(related))) {
      return;
    }
  }

  if (enterTimeoutId !== null) {
    window.clearTimeout(enterTimeoutId);
    enterTimeoutId = null;
  }
}

function createEdgeTrigger(): void {
  if (edgeTriggerElement) return;
  const el = document.createElement('div');
  el.id = EDGE_TRIGGER_ID;
  el.style.cssText = `
    position: fixed;
    left: 0;
    top: 0;
    width: ${EDGE_TRIGGER_WIDTH}px;
    height: 100vh;
    z-index: 99999;
    background: transparent;
    display: none;
  `;
  el.addEventListener('mouseenter', handleMouseEnter);
  el.addEventListener('mouseleave', handleEdgeTriggerLeave);
  document.documentElement.appendChild(el);
  edgeTriggerElement = el;
}

function removeEdgeTrigger(): void {
  if (edgeTriggerElement) {
    edgeTriggerElement.removeEventListener('mouseenter', handleMouseEnter);
    edgeTriggerElement.removeEventListener('mouseleave', handleEdgeTriggerLeave);
    edgeTriggerElement.remove();
    edgeTriggerElement = null;
  }
}

function showEdgeTrigger(): void {
  if (edgeTriggerElement) {
    edgeTriggerElement.style.display = 'block';
  }
}

function hideEdgeTrigger(): void {
  if (edgeTriggerElement) {
    edgeTriggerElement.style.display = 'none';
  }
}

// ─── Sidebar State Detection ───────────────────────────────────────────

function findToggleButton(): HTMLButtonElement | null {
  const btn = document.querySelector<HTMLButtonElement>(SIDEBAR_TOGGLE_BUTTON_SELECTOR);
  if (btn) return btn;

  const sideNavMenuButton = document.querySelector('side-nav-menu-button');
  if (sideNavMenuButton) {
    return sideNavMenuButton.querySelector<HTMLButtonElement>('button');
  }

  return null;
}

function getSidebarContentContainer(): HTMLElement | null {
  return document.querySelector<HTMLElement>('bard-sidenav side-navigation-content > div');
}

function getStructuredSidebarCollapsedState(): boolean | null {
  if (document.body.classList.contains('mat-sidenav-opened')) {
    return false;
  }

  const sideContent = getSidebarContentContainer();
  if (sideContent) {
    return sideContent.classList.contains('collapsed');
  }

  return null;
}

function isSidebarCollapsed(): boolean {
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

function isSidebarVisible(): boolean {
  const sidenav = document.querySelector<HTMLElement>('bard-sidenav');
  if (!sidenav) return false;
  const rect = sidenav.getBoundingClientRect();
  return rect.width > 0 && rect.height > 0;
}

function isPaused(): boolean {
  return Date.now() < pausedUntil;
}

function clearScheduledSidebarStateSync(): void {
  for (const timeoutId of sidebarStateSyncTimeoutIds) {
    window.clearTimeout(timeoutId);
  }
  sidebarStateSyncTimeoutIds = [];
}

function scheduleSidebarStateSync(): void {
  if (!fullHideEnabled) return;

  clearScheduledSidebarStateSync();
  for (const delay of SIDEBAR_STATE_SYNC_DELAYS_MS) {
    const timeoutId = window.setTimeout(() => {
      checkAndReattach();
      sidebarStateSyncTimeoutIds = sidebarStateSyncTimeoutIds.filter((id) => id !== timeoutId);
    }, delay);
    sidebarStateSyncTimeoutIds.push(timeoutId);
  }
}

function pauseAutoCollapse(durationMs: number): void {
  pausedUntil = Date.now() + durationMs;
}

function isPopupOrDialogOpen(): boolean {
  const matDialogs = document.querySelectorAll<HTMLElement>('.mat-mdc-dialog-container');
  for (const dialog of matDialogs) {
    if (isElementVisible(dialog)) return true;
  }

  const matMenus = document.querySelectorAll<HTMLElement>('.mat-mdc-menu-panel');
  for (const menu of matMenus) {
    if (isElementVisible(menu)) return true;
  }

  for (const selector of CUSTOM_POPUP_SELECTORS) {
    const customPopups = document.querySelectorAll<HTMLElement>(selector);
    for (const popup of customPopups) {
      if (isElementVisible(popup)) return true;
    }
  }

  return false;
}

function isMouseOverSidebarArea(): boolean {
  if (edgeTriggerElement?.matches(':hover')) return true;
  if (sidenavElement?.matches(':hover')) return true;

  const matDialogs = document.querySelectorAll<HTMLElement>('.mat-mdc-dialog-container');
  for (const dialog of matDialogs) {
    if (dialog.matches(':hover')) return true;
  }

  const matMenus = document.querySelectorAll<HTMLElement>('.mat-mdc-menu-panel');
  for (const menu of matMenus) {
    if (menu.matches(':hover')) return true;
  }

  for (const selector of CUSTOM_POPUP_SELECTORS) {
    const customPopups = document.querySelectorAll<HTMLElement>(selector);
    for (const popup of customPopups) {
      if (popup.matches(':hover')) return true;
    }
  }

  return false;
}

// ─── Menu Click Handling ───────────────────────────────────────────────

function handleMenuClick(e: Event): void {
  const target = e.target;
  if (!(target instanceof HTMLElement)) return;

  if (target.closest(SIDEBAR_TOGGLE_BUTTON_MATCH_SELECTOR)) {
    if (internalToggleClickDepth > 0) {
      return;
    }

    if (fullHideEnabled) {
      scheduleSidebarStateSync();
    }

    if (enabled) {
      pauseAutoCollapse(MENU_CLICK_PAUSE_MS);
    }
    return;
  }

  if (!enabled) return;

  const menuItem = target.closest('[role="menuitem"], [role="menuitemradio"], .mat-mdc-menu-item');
  if (menuItem) {
    pauseAutoCollapse(MENU_CLICK_PAUSE_MS);
    return;
  }

  const sidebarButton = target.closest('bard-sidenav button, bard-sidenav [role="button"]');
  if (sidebarButton) {
    pauseAutoCollapse(MENU_CLICK_PAUSE_MS);
    return;
  }

  const optionsButton = target.closest(
    '[data-test-id*="options"], [aria-label*="选项"], [aria-label*="Options"], [aria-label*="More"]',
  );
  if (optionsButton) {
    pauseAutoCollapse(MENU_CLICK_PAUSE_MS);
    return;
  }
}

// ─── Sidebar Toggle ────────────────────────────────────────────────────

function clickToggleButton(): boolean {
  const btn = findToggleButton();
  if (!btn) return false;

  internalToggleClickDepth += 1;
  try {
    btn.click();
  } finally {
    internalToggleClickDepth -= 1;
  }

  if (fullHideEnabled) {
    scheduleSidebarStateSync();
  }

  return true;
}

function collapseSidebar(): void {
  if (isPaused()) return;
  if (isPopupOrDialogOpen()) return;
  if (isMouseOverSidebarArea()) return;

  if (!isSidebarCollapsed()) {
    if (clickToggleButton()) {
      autoCollapsed = true;
      resetPredictiveState();
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

// ─── Predictive Aiming ────────────────────────────────────────────────
// Inspired by the "Amazon mega-menu" trick: track mouse velocity on
// document-level mousemove. When the cursor is near the left edge AND
// heading leftward fast, pre-trigger expand *before* mouseenter fires,
// removing the perceptual gap entirely.

function resetPredictiveState(): void {
  predictiveTriggered = false;
  lastMouseX = null;
  lastMouseTime = null;
}

function handlePredictiveMouseMove(e: MouseEvent): void {
  if (!enabled) return;
  if (!isSidebarCollapsed()) return;
  // If the sidebar is collapsed while the flag is still set, it was collapsed
  // by an external path (manual toggle, full-hide sync, etc.) that did not
  // call resetPredictiveState(). Clear the stale latch so the next swipe works.
  if (predictiveTriggered) {
    resetPredictiveState();
    return;
  }
  if (isPaused()) return;

  const now = performance.now();
  if (now - lastMoveProcessedTime < PREDICTIVE_THROTTLE_MS) return;
  lastMoveProcessedTime = now;

  const x = e.clientX;

  if (lastMouseX !== null && lastMouseTime !== null) {
    const dt = now - lastMouseTime;
    // Only use recent samples; ignore stale data (e.g. after tab switch)
    if (dt > 0 && dt < 200) {
      const vx = (x - lastMouseX) / dt; // px/ms, negative = leftward

      if (x <= PREDICTIVE_ZONE_WIDTH && vx <= PREDICTIVE_VELOCITY_THRESHOLD) {
        predictiveTriggered = true;

        // Cancel any pending enter/leave timers to avoid double-action
        if (enterTimeoutId !== null) {
          window.clearTimeout(enterTimeoutId);
          enterTimeoutId = null;
        }
        if (leaveTimeoutId !== null) {
          window.clearTimeout(leaveTimeoutId);
          leaveTimeoutId = null;
        }

        expandSidebar();

        // Safety net: if the mouse never actually enters the sidebar
        // (user changed direction mid-flight), auto-collapse after a
        // generous window. handleMouseEnter will clear this if triggered.
        leaveTimeoutId = window.setTimeout(() => {
          leaveTimeoutId = null;
          if (!enabled) return;
          collapseSidebar();
        }, PREDICTIVE_SAFETY_COLLAPSE_MS);

        lastMouseX = x;
        lastMouseTime = now;
        return;
      }
    }
  }

  lastMouseX = x;
  lastMouseTime = now;
}

function attachPredictiveListener(): void {
  if (predictiveMouseMoveHandler) return;
  predictiveMouseMoveHandler = handlePredictiveMouseMove;
  document.addEventListener('mousemove', predictiveMouseMoveHandler, { passive: true });
}

function detachPredictiveListener(): void {
  if (!predictiveMouseMoveHandler) return;
  document.removeEventListener('mousemove', predictiveMouseMoveHandler);
  predictiveMouseMoveHandler = null;
  resetPredictiveState();
}

// ─── Mouse Event Handlers ──────────────────────────────────────────────

function handleMouseEnter(): void {
  if (!enabled) return;

  if (leaveTimeoutId !== null) {
    window.clearTimeout(leaveTimeoutId);
    leaveTimeoutId = null;
  }

  if (enterTimeoutId !== null) {
    window.clearTimeout(enterTimeoutId);
  }

  enterTimeoutId = window.setTimeout(() => {
    enterTimeoutId = null;
    if (!enabled) return;
    expandSidebar();
  }, ENTER_DELAY_MS);
}

function handleMouseLeave(): void {
  if (!enabled) return;

  if (enterTimeoutId !== null) {
    window.clearTimeout(enterTimeoutId);
    enterTimeoutId = null;
  }

  if (leaveTimeoutId !== null) {
    window.clearTimeout(leaveTimeoutId);
  }

  leaveTimeoutId = window.setTimeout(() => {
    leaveTimeoutId = null;
    if (!enabled) return;
    collapseSidebar();
  }, LEAVE_DELAY_MS);
}

// ─── DOM Management ────────────────────────────────────────────────────

function getSidenavElement(): HTMLElement | null {
  return document.querySelector<HTMLElement>('bard-sidenav');
}

function attachEventListeners(): boolean {
  const sidenav = getSidenavElement();
  if (!sidenav) return false;
  if (!isSidebarVisible()) return false;
  if (sidenav === sidenavElement) return true;

  if (sidenavElement) {
    sidenavElement.removeEventListener('mouseenter', handleMouseEnter);
    sidenavElement.removeEventListener('mouseleave', handleMouseLeave);
  }

  sidenavElement = sidenav;
  sidenav.addEventListener('mouseenter', handleMouseEnter);
  sidenav.addEventListener('mouseleave', handleMouseLeave);
  return true;
}

function detachEventListeners(): void {
  if (sidenavElement) {
    sidenavElement.removeEventListener('mouseenter', handleMouseEnter);
    sidenavElement.removeEventListener('mouseleave', handleMouseLeave);
    sidenavElement = null;
  }
}

function checkAndReattach(): void {
  if (!enabled && !fullHideEnabled) return;

  const currentSidenav = getSidenavElement();

  // Auto-hide: manage event listeners on sidenav
  if (enabled) {
    if (sidenavElement && !sidenavElement.isConnected) {
      detachEventListeners();
      autoCollapsed = false;
    }

    if (sidenavElement && !isSidebarVisible()) {
      detachEventListeners();
    } else if (currentSidenav && isSidebarVisible() && currentSidenav !== sidenavElement) {
      attachEventListeners();
    }
  }

  // Full-hide: sync edge trigger visibility with sidebar state
  // Check height > 0 to exclude responsive layouts where Gemini hides the sidebar entirely
  // (our full-hide CSS only zeroes width, not height)
  if (fullHideEnabled) {
    syncFullHideState();
  }
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
      if (enabled || fullHideEnabled) checkAndReattach();
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
  clearScheduledSidebarStateSync();

  if (resizeDebounceTimer !== null) {
    window.clearTimeout(resizeDebounceTimer);
    resizeDebounceTimer = null;
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

// ─── Auto-Hide Feature ────────────────────────────────────────────────

function enable(): void {
  if (enabled) return;
  enabled = true;
  autoCollapsed = false;
  pausedUntil = 0;

  insertTransitionStyle();
  attachEventListeners();
  ensureMenuClickHandler();
  attachPredictiveListener();
  if (fullHideEnabled) syncFullHideState();

  setupInfrastructure();

  // Initial collapse if mouse is not on sidebar and no popup is open
  setTimeout(() => {
    if (!enabled) return;
    if (sidenavElement && !sidenavElement.matches(':hover') && !isPopupOrDialogOpen()) {
      collapseSidebar();
    }
  }, 500);
}

function disable(): void {
  if (!enabled) return;
  enabled = false;

  if (enterTimeoutId !== null) {
    window.clearTimeout(enterTimeoutId);
    enterTimeoutId = null;
  }

  if (leaveTimeoutId !== null) {
    window.clearTimeout(leaveTimeoutId);
    leaveTimeoutId = null;
  }

  if (autoCollapsed && isSidebarCollapsed()) {
    clickToggleButton();
  }
  autoCollapsed = false;
  pausedUntil = 0;

  detachEventListeners();

  if (fullHideEnabled) {
    syncFullHideState();
  } else {
    removeTransitionStyle();
  }
  detachPredictiveListener();

  maybeRemoveMenuClickHandler();

  teardownInfrastructure();
}

// ─── Full-Hide Feature ─────────────────────────────────────────────────

function setFullHideCollapsedState(collapsed: boolean): void {
  document.documentElement.classList.toggle(FULL_HIDE_COLLAPSED_CLASS, collapsed);
}

function syncFullHideState(): void {
  const sidenav = getSidenavElement();
  const sidenavExists = Boolean(sidenav && sidenav.getBoundingClientRect().height > 0);
  const collapsed = sidenavExists && isSidebarCollapsed();

  setFullHideCollapsedState(collapsed);

  if (collapsed) {
    if (enabled) {
      showEdgeTrigger();
    } else {
      hideEdgeTrigger();
    }
  } else {
    hideEdgeTrigger();
  }
}

function enableFullHide(): void {
  if (fullHideEnabled) return;
  fullHideEnabled = true;

  insertTransitionStyle();
  insertFullHideStyle();
  createEdgeTrigger();
  ensureMenuClickHandler();

  setupInfrastructure();
  syncFullHideState();

  // Show edge trigger if sidebar is already collapsed
  setTimeout(() => {
    if (!fullHideEnabled) return;
    syncFullHideState();
  }, 300);
}

function disableFullHide(): void {
  if (!fullHideEnabled) return;
  fullHideEnabled = false;

  clearScheduledSidebarStateSync();
  setFullHideCollapsedState(false);
  removeEdgeTrigger();
  removeFullHideStyle();

  if (!enabled) {
    removeTransitionStyle();
    detachPredictiveListener();
  }

  maybeRemoveMenuClickHandler();

  teardownInfrastructure();
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
