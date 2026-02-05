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
const LEAVE_DELAY_MS = 300;
// Interval to check for sidenav element reappearing
const SIDENAV_CHECK_INTERVAL_MS = 1000;

let enabled = false;
let leaveTimeoutId: number | null = null;
let sidenavElement: HTMLElement | null = null;
let observer: MutationObserver | null = null;
let resizeHandler: (() => void) | null = null;
let sidenavCheckTimer: number | null = null;
// Track whether sidebar was collapsed by our feature (to avoid fighting with user)
let autoCollapsed = false;

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
 * Click the toggle button to switch sidebar state
 */
function clickToggleButton(): boolean {
  const btn = findToggleButton();
  if (!btn) return false;

  btn.click();
  return true;
}

/**
 * Collapse the sidebar (if currently expanded)
 */
function collapseSidebar(): void {
  if (!isSidebarCollapsed()) {
    if (clickToggleButton()) {
      autoCollapsed = true;
    }
  }
}

/**
 * Expand the sidebar (if currently collapsed, and was auto-collapsed by us)
 */
function expandSidebar(): void {
  // Only expand if we auto-collapsed it
  if (isSidebarCollapsed() && autoCollapsed) {
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

  // Expand sidebar
  expandSidebar();
}

/**
 * Handle mouse leave from sidebar
 */
function handleMouseLeave(): void {
  if (!enabled) return;

  // Debounce the collapse to avoid accidental triggers
  if (leaveTimeoutId !== null) {
    window.clearTimeout(leaveTimeoutId);
  }

  leaveTimeoutId = window.setTimeout(() => {
    leaveTimeoutId = null;
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
    sidenavElement = null;
    autoCollapsed = false; // Reset auto-collapse state when element is removed
  }

  // If sidenav exists and is visible, try to attach
  if (currentSidenav && isSidebarVisible()) {
    if (currentSidenav !== sidenavElement) {
      attachEventListeners();
    }
  }
}

/**
 * Handle window resize - reattach listeners if sidebar reappears
 */
function handleResize(): void {
  if (!enabled) return;

  // Debounce resize handling
  checkAndReattach();
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

  // Start periodic check for sidenav element reappearing
  startSidenavCheck();

  // Initial collapse if mouse is not on sidebar
  setTimeout(() => {
    if (enabled && sidenavElement && !sidenavElement.matches(':hover')) {
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

  // Cancel any pending collapse
  if (leaveTimeoutId !== null) {
    window.clearTimeout(leaveTimeoutId);
    leaveTimeoutId = null;
  }

  // Stop periodic check
  stopSidenavCheck();

  // If we auto-collapsed the sidebar, expand it back when disabled
  if (autoCollapsed && isSidebarCollapsed()) {
    clickToggleButton();
  }
  autoCollapsed = false;

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
