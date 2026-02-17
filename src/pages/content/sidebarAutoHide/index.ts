/**
 * Sidebar Auto-Hide Feature for Gemini
 *
 * When enabled, the sidebar automatically collapses when the mouse leaves,
 * and expands when the mouse enters.
 *
 * Uses the `side-nav-menu-button` to toggle sidebar state.
 */

const STYLE_ID = 'gv-sidebar-auto-hide-style';
const STORAGE_KEY = 'gvSidebarAutoHide';

// Debounce delay to avoid rapid toggling
const LEAVE_DELAY_MS = 500;
const ENTER_DELAY_MS = 300;
// Interval to check for sidenav element reappearing
const SIDENAV_CHECK_INTERVAL_MS = 1000;
// Debounce delay for resize events
const RESIZE_DEBOUNCE_MS = 200;
// Pause duration after menu item click (wait for dialog to appear)
const MENU_CLICK_PAUSE_MS = 1500;
const CUSTOM_POPUP_SELECTORS = [
  '.gv-folder-dialog',
  '.gv-folder-dialog-overlay',
  '.gv-folder-confirm-dialog',
  '.gv-folder-import-dialog',
  '.gv-folder-menu',
  '.gv-color-picker-dialog',
];

let enabled = false;
let leaveTimeoutId: number | null = null;
let enterTimeoutId: number | null = null;
let sidenavElement: HTMLElement | null = null;
let observer: MutationObserver | null = null;
let resizeHandler: (() => void) | null = null;
let resizeDebounceTimer: number | null = null;
let sidenavCheckTimer: number | null = null;
let menuClickHandler: ((e: Event) => void) | null = null;
// Track whether sidebar was collapsed by our feature (to avoid fighting with user)
let autoCollapsed = false;
// Temporarily pause auto-collapse after menu actions
let pausedUntil = 0;

function isElementVisible(element: HTMLElement): boolean {
  const style = window.getComputedStyle(element);
  if (style.display === 'none' || style.visibility === 'hidden') {
    return false;
  }

  const rect = element.getBoundingClientRect();
  return rect.width > 0 || rect.height > 0;
}

/**
 * CSS to enable smooth transitions for the sidebar collapse/expand
 */
function getTransitionStyle(): string {
  return `
    /* Smooth transition for sidebar auto-hide */
    bard-sidenav,
    bard-sidenav side-navigation-content,
    bard-sidenav side-navigation-content > div {
      transition: width 0.25s ease, transform 0.25s ease !important;
    }
  `;
}

/**
 * Insert transition CSS
 */
function insertTransitionStyle(): void {
  if (document.getElementById(STYLE_ID)) return;

  const style = document.createElement('style');
  style.id = STYLE_ID;
  style.textContent = getTransitionStyle();
  document.documentElement.appendChild(style);
}

/**
 * Remove transition CSS
 */
function removeTransitionStyle(): void {
  const style = document.getElementById(STYLE_ID);
  if (style) style.remove();
}

/**
 * Find the sidebar toggle button
 * Uses the selector provided by user: side-nav-menu-button button
 */
function findToggleButton(): HTMLButtonElement | null {
  // Primary: Use data-test-id attribute
  const btn = document.querySelector<HTMLButtonElement>(
    'button[data-test-id="side-nav-menu-button"]',
  );
  if (btn) return btn;

  // Fallback: Find button inside side-nav-menu-button component
  const sideNavMenuButton = document.querySelector('side-nav-menu-button');
  if (sideNavMenuButton) {
    return sideNavMenuButton.querySelector<HTMLButtonElement>('button');
  }

  return null;
}

/**
 * Check if sidebar is currently collapsed
 */
function isSidebarCollapsed(): boolean {
  // Method 1: Check mat-sidenav-opened class on body
  if (document.body.classList.contains('mat-sidenav-opened')) {
    return false; // opened = not collapsed
  }

  // Method 2: Check side-navigation-content collapsed class
  const sideContent = document.querySelector('bard-sidenav side-navigation-content > div');
  if (sideContent?.classList.contains('collapsed')) {
    return true;
  }

  // Method 3: Check the actual width of sidenav
  const sidenav = document.querySelector<HTMLElement>('bard-sidenav');
  if (sidenav) {
    const width = sidenav.getBoundingClientRect().width;
    // Collapsed sidebar is typically < 80px
    if (width < 80) return true;
  }

  return false;
}

/**
 * Check if sidebar is visible (exists and has dimensions)
 */
function isSidebarVisible(): boolean {
  const sidenav = document.querySelector<HTMLElement>('bard-sidenav');
  if (!sidenav) return false;

  const rect = sidenav.getBoundingClientRect();
  // Sidebar is visible if it has width and height
  return rect.width > 0 && rect.height > 0;
}

/**
 * Check if auto-collapse is currently paused
 */
function isPaused(): boolean {
  return Date.now() < pausedUntil;
}

/**
 * Pause auto-collapse for a duration
 */
function pauseAutoCollapse(durationMs: number): void {
  pausedUntil = Date.now() + durationMs;
}

/**
 * Check if there's a visible popup/dialog/menu open that should prevent sidebar collapse
 * This includes delete confirmation dialogs, context menus, etc.
 */
function isPopupOrDialogOpen(): boolean {
  // Check for Angular Material dialogs - must be visible
  const matDialogs = document.querySelectorAll<HTMLElement>('.mat-mdc-dialog-container');
  for (const dialog of matDialogs) {
    if (isElementVisible(dialog)) return true;
  }

  // Check for Angular Material menus - must be visible
  const matMenus = document.querySelectorAll<HTMLElement>('.mat-mdc-menu-panel');
  for (const menu of matMenus) {
    if (isElementVisible(menu)) return true;
  }

  // Check for Gemini Voyager popup elements
  for (const selector of CUSTOM_POPUP_SELECTORS) {
    const customPopups = document.querySelectorAll<HTMLElement>(selector);
    for (const popup of customPopups) {
      if (isElementVisible(popup)) return true;
    }
  }

  return false;
}

/**
 * Check if mouse is currently over the sidebar or any related popup element
 */
function isMouseOverSidebarArea(): boolean {
  // Check if mouse is over the sidenav
  if (sidenavElement?.matches(':hover')) return true;

  // Check if mouse is over visible dialogs/menus
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

/**
 * Handle click on menu items - pause auto-collapse to wait for potential dialogs
 */
function handleMenuClick(e: Event): void {
  if (!enabled) return;

  const target = e.target as HTMLElement;

  // Check if clicked on a menu item (especially delete actions)
  const menuItem = target.closest('[role="menuitem"], [role="menuitemradio"], .mat-mdc-menu-item');
  if (menuItem) {
    // Pause auto-collapse to allow dialog to appear
    pauseAutoCollapse(MENU_CLICK_PAUSE_MS);
    return;
  }

  // Check if clicked on any button inside the sidebar that might trigger a dialog
  const sidebarButton = target.closest('bard-sidenav button, bard-sidenav [role="button"]');
  if (sidebarButton) {
    // Pause auto-collapse briefly
    pauseAutoCollapse(MENU_CLICK_PAUSE_MS);
    return;
  }

  // Check for three-dot menu buttons (options buttons)
  const optionsButton = target.closest(
    '[data-test-id*="options"], [aria-label*="选项"], [aria-label*="Options"], [aria-label*="More"]',
  );
  if (optionsButton) {
    pauseAutoCollapse(MENU_CLICK_PAUSE_MS);
    return;
  }
}

/**
 * Click the toggle button to switch sidebar state
 */
function clickToggleButton(): boolean {
  const btn = findToggleButton();
  if (!btn) return false;

  btn.click();
  return true;
}

/**
 * Collapse the sidebar (if currently expanded and no popup is open)
 */
function collapseSidebar(): void {
  // Don't collapse if paused
  if (isPaused()) return;

  // Don't collapse if a popup/dialog is open
  if (isPopupOrDialogOpen()) return;

  // Don't collapse if mouse is still over sidebar area
  if (isMouseOverSidebarArea()) return;

  if (!isSidebarCollapsed()) {
    if (clickToggleButton()) {
      autoCollapsed = true;
    }
  }
}

/**
 * Expand the sidebar (if currently collapsed)
 */
function expandSidebar(): void {
  if (isSidebarCollapsed()) {
    clickToggleButton();
    autoCollapsed = false;
  }
}

/**
 * Handle mouse enter on sidebar
 */
function handleMouseEnter(): void {
  if (!enabled) return;

  // Cancel any pending collapse
  if (leaveTimeoutId !== null) {
    window.clearTimeout(leaveTimeoutId);
    leaveTimeoutId = null;
  }

  // Debounce the expand to avoid accidental triggers while crossing screens
  if (enterTimeoutId !== null) {
    window.clearTimeout(enterTimeoutId);
  }

  enterTimeoutId = window.setTimeout(() => {
    enterTimeoutId = null;
    if (!enabled) return;
    expandSidebar();
  }, ENTER_DELAY_MS);
}

/**
 * Handle mouse leave from sidebar
 */
function handleMouseLeave(): void {
  if (!enabled) return;

  // Cancel any pending expand
  if (enterTimeoutId !== null) {
    window.clearTimeout(enterTimeoutId);
    enterTimeoutId = null;
  }

  // Debounce the collapse to avoid accidental triggers
  if (leaveTimeoutId !== null) {
    window.clearTimeout(leaveTimeoutId);
  }

  leaveTimeoutId = window.setTimeout(() => {
    leaveTimeoutId = null;

    // Double-check conditions before collapsing
    if (!enabled) return;

    collapseSidebar();
  }, LEAVE_DELAY_MS);
}

/**
 * Get the sidenav container element
 */
function getSidenavElement(): HTMLElement | null {
  return document.querySelector<HTMLElement>('bard-sidenav');
}

/**
 * Attach event listeners to the sidenav element
 */
function attachEventListeners(): boolean {
  const sidenav = getSidenavElement();
  if (!sidenav) return false;

  // Check if sidebar is actually visible (not hidden due to responsive design)
  if (!isSidebarVisible()) return false;

  // Already attached to this element
  if (sidenav === sidenavElement) return true;

  // Remove old listeners if element changed
  if (sidenavElement) {
    sidenavElement.removeEventListener('mouseenter', handleMouseEnter);
    sidenavElement.removeEventListener('mouseleave', handleMouseLeave);
  }

  sidenavElement = sidenav;
  sidenav.addEventListener('mouseenter', handleMouseEnter);
  sidenav.addEventListener('mouseleave', handleMouseLeave);
  return true;
}

/**
 * Remove event listeners from the sidenav element
 */
function detachEventListeners(): void {
  if (sidenavElement) {
    sidenavElement.removeEventListener('mouseenter', handleMouseEnter);
    sidenavElement.removeEventListener('mouseleave', handleMouseLeave);
    sidenavElement = null;
  }
}

/**
 * Check and reattach event listeners if sidenav element changed or reappeared
 */
function checkAndReattach(): void {
  if (!enabled) return;

  const currentSidenav = getSidenavElement();

  // If we have a reference but it's no longer in DOM, clear it
  if (sidenavElement && !sidenavElement.isConnected) {
    detachEventListeners(); // properly remove listeners and null the reference
    autoCollapsed = false;
  }

  // If sidenav exists but is NOT visible (narrow window), clear the reference
  // so that when it becomes visible again we treat it as a fresh element.
  if (sidenavElement && !isSidebarVisible()) {
    detachEventListeners();
    return;
  }

  // If sidenav exists and is visible, try to attach
  if (currentSidenav && isSidebarVisible()) {
    // Reattach if element changed OR if we lost our reference (e.g. after resize)
    if (currentSidenav !== sidenavElement) {
      attachEventListeners();
    }
  }
}

/**
 * Handle window resize - reattach listeners if sidebar reappears (with debounce)
 */
function handleResize(): void {
  if (!enabled) return;

  // Debounce resize handling
  if (resizeDebounceTimer !== null) {
    window.clearTimeout(resizeDebounceTimer);
  }

  resizeDebounceTimer = window.setTimeout(() => {
    resizeDebounceTimer = null;
    checkAndReattach();

    // Gemini's layout transitions may take longer than our debounce.
    // Schedule a secondary check to catch late DOM changes.
    setTimeout(() => {
      if (enabled) checkAndReattach();
    }, 600);
  }, RESIZE_DEBOUNCE_MS);
}

/**
 * Start periodic check for sidenav element
 */
function startSidenavCheck(): void {
  if (sidenavCheckTimer !== null) return;

  sidenavCheckTimer = window.setInterval(() => {
    checkAndReattach();
  }, SIDENAV_CHECK_INTERVAL_MS);
}

/**
 * Stop periodic check for sidenav element
 */
function stopSidenavCheck(): void {
  if (sidenavCheckTimer !== null) {
    window.clearInterval(sidenavCheckTimer);
    sidenavCheckTimer = null;
  }
}

/**
 * Enable the auto-hide feature
 */
function enable(): void {
  if (enabled) return;
  enabled = true;
  autoCollapsed = false;
  pausedUntil = 0;

  insertTransitionStyle();
  attachEventListeners();

  // Start observing for DOM changes (in case sidenav is lazily loaded)
  if (!observer) {
    observer = new MutationObserver(() => {
      if (enabled) {
        checkAndReattach();
      }
    });

    observer.observe(document.body, { childList: true, subtree: true });
  }

  // Listen for resize events to handle responsive changes
  if (!resizeHandler) {
    resizeHandler = handleResize;
    window.addEventListener('resize', resizeHandler);
  }

  // Listen for clicks on menu items to pause auto-collapse
  if (!menuClickHandler) {
    menuClickHandler = handleMenuClick;
    document.addEventListener('click', menuClickHandler, true);
  }

  // Start periodic check for sidenav element reappearing
  startSidenavCheck();

  // Initial collapse if mouse is not on sidebar and no popup is open
  setTimeout(() => {
    if (enabled && sidenavElement && !sidenavElement.matches(':hover') && !isPopupOrDialogOpen()) {
      collapseSidebar();
    }
  }, 500);
}

/**
 * Disable the auto-hide feature
 */
function disable(): void {
  if (!enabled) return;
  enabled = false;

  // Cancel any pending expand
  if (enterTimeoutId !== null) {
    window.clearTimeout(enterTimeoutId);
    enterTimeoutId = null;
  }

  // Cancel any pending collapse
  if (leaveTimeoutId !== null) {
    window.clearTimeout(leaveTimeoutId);
    leaveTimeoutId = null;
  }

  // Cancel any pending resize debounce
  if (resizeDebounceTimer !== null) {
    window.clearTimeout(resizeDebounceTimer);
    resizeDebounceTimer = null;
  }

  // Stop periodic check
  stopSidenavCheck();

  // If we auto-collapsed the sidebar, expand it back when disabled
  if (autoCollapsed && isSidebarCollapsed()) {
    clickToggleButton();
  }
  autoCollapsed = false;
  pausedUntil = 0;

  detachEventListeners();
  removeTransitionStyle();

  if (observer) {
    observer.disconnect();
    observer = null;
  }

  if (resizeHandler) {
    window.removeEventListener('resize', resizeHandler);
    resizeHandler = null;
  }

  if (menuClickHandler) {
    document.removeEventListener('click', menuClickHandler, true);
    menuClickHandler = null;
  }
}

/**
 * Initialize and start the sidebar auto-hide feature
 */
export function startSidebarAutoHide(): void {
  // 1) Read initial setting
  try {
    chrome.storage?.sync?.get({ [STORAGE_KEY]: false }, (res) => {
      const isEnabled = res?.[STORAGE_KEY] === true;
      if (isEnabled) {
        enable();
      }
    });
  } catch (e) {
    console.error('[Gemini Voyager] Failed to get sidebar auto-hide setting:', e);
  }

  // 2) Respond to storage changes
  try {
    chrome.storage?.onChanged?.addListener((changes, area) => {
      if (area === 'sync' && changes[STORAGE_KEY]) {
        const isEnabled = changes[STORAGE_KEY].newValue === true;
        if (isEnabled) {
          enable();
        } else {
          disable();
        }
      }
    });
  } catch (e) {
    console.error('[Gemini Voyager] Failed to add storage listener for sidebar auto-hide:', e);
  }

  // 3) Cleanup on page unload
  window.addEventListener('beforeunload', () => {
    disable();
  });
}
