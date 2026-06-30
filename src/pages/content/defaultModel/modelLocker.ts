import { storageService } from '../../../core/services/StorageService';
import { StorageKeys } from '../../../core/types/common';
import './styles.css';

type DefaultModelSetting =
  | { kind: 'id'; id: string; name: string }
  | { kind: 'name'; name: string };

type StoredDefaultModelSetting = { id: string; name: string };

// 2026 redesign: the trigger pill optionally shows a "Thinking level" line below the model.
// We let users star Standard / Extended and lock that too.
type DefaultThinkingLevel = { index: number; label: string };

// Known Flash/Fast model IDs that should skip auto-selection (page defaults to these)
const FAST_MODEL_IDS = new Set([
  '56fdd199312815e2', // Gemini 2.0 Flash
]);

// Generic Flash/Fast labels that Gemini already opens with. Specific variants
// like "3.5 Flash" or "3.1 Flash-Lite" must still open the picker and confirm.
const FAST_MODEL_NAMES = new Set(['flash', 'fast', '高速', '高速モード']);

// Gemini may use either role="menuitemradio" or role="menuitem" depending on the UI variant.
// The 2026 redesign uses <gem-menu-item data-mode-id="..." role="menuitem">.
const MODE_ITEM_SELECTOR = '[role="menuitemradio"], [role="menuitem"]';

// Fallback selector that excludes known non-model menus (e.g. the settings/profile dropdown).
const NON_MODEL_MENU_EXCLUSION_FALLBACK =
  '.mat-mdc-menu-panel[role="menu"]:not(.desktop-settings-menu)';

// 2026 redesign: model picker is now rendered inside a plain cdk-overlay-pane (no Material menu wrapper).
// The pane is identified by containing one or more items carrying data-mode-id.
const NEW_LAYOUT_ITEM_SELECTOR = '[data-mode-id]';
const MODE_SWITCH_CONTAINER_SELECTOR =
  '.cdk-overlay-pane, .mat-mdc-menu-panel[role="menu"], mat-action-list.gds-mode-switch-menu-list';
const MODE_SWITCH_OBSERVER_ROOT_SELECTOR = [
  '.cdk-overlay-container',
  '.cdk-global-overlay-wrapper',
  '.cdk-overlay-connected-position-bounding-box',
  '.cdk-overlay-pane',
  '.mat-mdc-menu-panel[role="menu"]',
  'mat-action-list.gds-mode-switch-menu-list',
  NEW_LAYOUT_ITEM_SELECTOR,
  MODE_ITEM_SELECTOR,
].join(', ');
const DEFAULT_MODEL_UI_SELECTOR = '.gv-default-star-btn, .gv-default-model-fail-toast';

const CHAT_INPUT_SELECTORS = [
  'main rich-textarea [contenteditable="true"]',
  'rich-textarea [contenteditable="true"]',
  'main div[contenteditable="true"][role="textbox"]',
  'div[contenteditable="true"][role="textbox"]',
  'main .input-area textarea',
  '.input-area textarea',
  'main [contenteditable="true"]',
  'main textarea',
] as const;

class DefaultModelManager {
  private static instance: DefaultModelManager;
  private observer: MutationObserver | null = null;
  private checkTimer: number | null = null;
  private isLocked = false;
  private currentDefaultModel: DefaultModelSetting | null = null;
  private currentDefaultThinkingLevel: DefaultThinkingLevel | null = null;
  private initialized = false;
  private pendingMenuPanelInjections = new WeakSet<HTMLElement>();
  private menuPanelInjectAttempts = new WeakMap<HTMLElement, number>();
  private started = false;
  private popStateHandler: (() => void) | null = null;
  private originalPushState: History['pushState'] | null = null;
  private originalReplaceState: History['replaceState'] | null = null;
  private lastCheckedPath: string | null = null;
  private sidebarClickHandler: ((e: Event) => void) | null = null;
  private urlCheckTimer: number | null = null;
  // Track if we've already auto-selected for this navigation to prevent duplicates
  private autoSelectSessionId: string | null = null;
  // Track consecutive failures to stop retrying when model is unavailable
  private consecutiveFailures = 0;
  private readonly maxConsecutiveFailures = 3;
  // Once we hit `maxConsecutiveFailures`, show a one-time toast suggesting
  // the user pause the feature (until we ship a fix for the broken selector).
  // The flag only resets when the user flips the kill switch off-then-on,
  // so revisiting /app many times in a broken session does not spam toasts.
  private failureToastShown = false;
  // Tracks a model item we clicked on the previous tick. If the trigger pill is
  // still not on that model on the next tick, Gemini likely rejected the switch
  // (for example because that model's quota is exhausted), so we back off after
  // a few confirmations instead of reopening the menu forever (#761).
  private pendingModelSwitchKey: string | null = null;
  private consecutiveRejectedModelSwitches = 0;
  private pendingThinkingSwitchKey: string | null = null;
  private consecutiveRejectedThinkingSwitches = 0;
  // Master kill switch — when false, all auto-apply paths short-circuit but
  // the in-page star UI still works so users can set/clear defaults. Loaded
  // at init and kept in sync via chrome.storage.onChanged so a popup flip
  // takes effect without a page reload.
  private autoApplyEnabled = true;
  private storageChangeListener:
    | ((changes: Record<string, chrome.storage.StorageChange>, area: string) => void)
    | null = null;

  private constructor() {}

  public static getInstance(): DefaultModelManager {
    if (!DefaultModelManager.instance) {
      DefaultModelManager.instance = new DefaultModelManager();
    }
    return DefaultModelManager.instance;
  }

  public async init() {
    if (this.started) return;
    this.started = true;

    // Initialize cache
    const result = await storageService.get<unknown>(StorageKeys.DEFAULT_MODEL);
    this.currentDefaultModel = result.success ? this.parseStoredDefaultModel(result.data) : null;
    const thinkingResult = await storageService.get<unknown>(StorageKeys.DEFAULT_THINKING_LEVEL);
    this.currentDefaultThinkingLevel = thinkingResult.success
      ? this.parseStoredThinkingLevel(thinkingResult.data)
      : null;
    const autoApplyResult = await storageService.get<unknown>(StorageKeys.DEFAULT_MODEL_AUTO_APPLY);
    // Missing key → enabled (backward compat for users upgrading from a
    // build that did not have this toggle).
    this.autoApplyEnabled = !autoApplyResult.success || autoApplyResult.data !== false;
    this.initialized = true;

    if (!this.autoApplyEnabled) {
      // Cross-session cleanup: a previous session may have left star
      // buttons in the DOM (or the storage onChanged sweep ran in a build
      // that didn't have this listener). Without this, those stale stars
      // stay clickable and reproduce the multi-is-default state observed
      // in MCP browser inspection.
      this.sweepDefaultModelUi();
    }

    this.subscribeToAutoApplyChanges();

    this.initObserver();
    void this.checkAndLockModel();
    // Listen for URL changes (SPA navigation)
    this.popStateHandler = () => {
      void this.checkAndLockModelWithDelay();
    };
    window.addEventListener('popstate', this.popStateHandler);

    // Hack for SPA: hook into history methods
    if (!this.originalPushState) {
      this.originalPushState = history.pushState;
    }
    if (!this.originalReplaceState) {
      this.originalReplaceState = history.replaceState;
    }

    history.pushState = (...args: Parameters<History['pushState']>) => {
      this.originalPushState?.apply(history, args);
      void this.checkAndLockModelWithDelay();
    };
    history.replaceState = (...args: Parameters<History['replaceState']>) => {
      this.originalReplaceState?.apply(history, args);
      void this.checkAndLockModelWithDelay();
    };

    // Listen for sidebar "New Chat" link clicks (SPA internal navigation)
    this.sidebarClickHandler = (e: Event) => {
      const target = e.target as HTMLElement;
      // Check if clicked on a link that leads to /app (new conversation) or /gem/ (new gem conversation)
      const link = target.closest('a[href*="/app"]') || target.closest('a[href*="/gem/"]');
      if (link) {
        // Delay to allow SPA navigation to complete
        void this.checkAndLockModelWithDelay();
      }
    };
    document.addEventListener('click', this.sidebarClickHandler, true);

    // Periodic URL check as a fallback for edge cases
    this.urlCheckTimer = window.setInterval(() => {
      const currentPath = window.location.pathname;
      if (currentPath !== this.lastCheckedPath && this.isNewConversation()) {
        this.lastCheckedPath = currentPath;
        void this.checkAndLockModel();
      }
    }, 500);
  }

  public destroy(): void {
    if (!this.started) return;
    this.started = false;

    if (this.observer) {
      this.observer.disconnect();
      this.observer = null;
    }

    if (this.checkTimer) {
      clearInterval(this.checkTimer);
      this.checkTimer = null;
    }

    if (this.urlCheckTimer) {
      clearInterval(this.urlCheckTimer);
      this.urlCheckTimer = null;
    }

    if (this.popStateHandler) {
      window.removeEventListener('popstate', this.popStateHandler);
      this.popStateHandler = null;
    }

    if (this.sidebarClickHandler) {
      document.removeEventListener('click', this.sidebarClickHandler, true);
      this.sidebarClickHandler = null;
    }

    if (this.originalPushState) {
      history.pushState = this.originalPushState;
      this.originalPushState = null;
    }

    if (this.originalReplaceState) {
      history.replaceState = this.originalReplaceState;
      this.originalReplaceState = null;
    }

    if (this.storageChangeListener) {
      try {
        chrome.storage.onChanged.removeListener(this.storageChangeListener);
      } catch {
        // ignore — listener may already be gone if context invalidated
      }
      this.storageChangeListener = null;
    }

    this.pendingMenuPanelInjections = new WeakSet<HTMLElement>();
    this.menuPanelInjectAttempts = new WeakMap<HTMLElement, number>();
  }

  private initObserver() {
    // Observe only for the mode switch panel/bottom-sheet being added; Gemini UI triggers many mutations and
    // querying the entire document on every mutation can cause severe jank/crashes.
    this.observer = new MutationObserver((mutations) => {
      // When the kill switch is off, still walk added subtrees so we can
      // sweep stale star buttons that were sitting inside a detached CDK
      // overlay pane at toggle-off time and get reattached now. Without
      // this, the storage-onChanged sweep misses them and the user sees
      // stars come back the moment they reopen the menu.
      if (!this.autoApplyEnabled) {
        for (const mutation of mutations) {
          for (const node of Array.from(mutation.addedNodes)) {
            if (!(node instanceof HTMLElement)) continue;
            if (!this.mayContainDefaultModelUi(node)) continue;
            this.sweepDefaultModelUi(node);
          }
        }
        return;
      }

      for (const mutation of mutations) {
        for (const node of Array.from(mutation.addedNodes)) {
          if (!(node instanceof HTMLElement)) continue;
          if (!this.mayContainModeSwitchContainer(node)) continue;

          const menuPanel = this.resolveModeSwitchContainer(node);

          if (menuPanel) {
            this.scheduleMenuPanelInjection(menuPanel);
          }
        }
      }
    });

    this.observer.observe(document.body, { childList: true, subtree: true });
  }

  // Single chokepoint for "remove all extension-injected UI inside this
  // subtree". Used at init time, on flip-off via storage onChanged, and on
  // the observer's off-state path so that detached → reattached CDK panes
  // get cleaned up too.
  private sweepDefaultModelUi(root: ParentNode = document) {
    root.querySelectorAll('.gv-default-star-btn').forEach((el) => el.remove());
    root.querySelectorAll('.gv-default-model-fail-toast').forEach((el) => el.remove());
  }

  private mayContainDefaultModelUi(root: HTMLElement): boolean {
    return (
      root.matches(DEFAULT_MODEL_UI_SELECTOR) || !!root.querySelector(DEFAULT_MODEL_UI_SELECTOR)
    );
  }

  private mayContainModeSwitchContainer(root: HTMLElement): boolean {
    return (
      root.matches(MODE_SWITCH_OBSERVER_ROOT_SELECTOR) ||
      root.closest(MODE_SWITCH_CONTAINER_SELECTOR) !== null
    );
  }

  private resolveModeSwitchContainer(root: HTMLElement): HTMLElement | null {
    if (
      root.matches('.mat-mdc-menu-panel.gds-mode-switch-menu[role="menu"]') ||
      root.matches('mat-action-list.gds-mode-switch-menu-list') ||
      root.matches(NON_MODEL_MENU_EXCLUSION_FALLBACK)
    ) {
      return root;
    }

    // 2026 redesign: the added node may be a cdk-overlay-pane containing gem-menu-item entries
    // (model menu) or the thinking-level submenu (no data-mode-id, but aria-controls'd by a
    // value="thinking_level" row that lives in a sibling overlay).
    if (root.matches?.('.cdk-overlay-pane')) {
      if (root.querySelector(NEW_LAYOUT_ITEM_SELECTOR) !== null) return root;
      if (this.isThinkingLevelSubmenuPane(root)) return root;
    }

    if (root.matches(NEW_LAYOUT_ITEM_SELECTOR) || root.matches(MODE_ITEM_SELECTOR)) {
      const pane = root.closest<HTMLElement>(MODE_SWITCH_CONTAINER_SELECTOR);
      if (pane) return pane;
    }

    const legacy =
      root.querySelector<HTMLElement>('.mat-mdc-menu-panel.gds-mode-switch-menu[role="menu"]') ??
      root.querySelector<HTMLElement>('mat-action-list.gds-mode-switch-menu-list');
    if (legacy) return legacy;

    const newItem = root.querySelector<HTMLElement>(NEW_LAYOUT_ITEM_SELECTOR);
    if (newItem) {
      const pane = newItem.closest<HTMLElement>(MODE_SWITCH_CONTAINER_SELECTOR);
      if (pane) return pane;
    }

    const modeItem = root.querySelector<HTMLElement>(MODE_ITEM_SELECTOR);
    if (modeItem) {
      const pane = modeItem.closest<HTMLElement>(MODE_SWITCH_CONTAINER_SELECTOR);
      if (pane) return pane;
    }

    // Thinking submenu may appear nested inside a different root (rare; observer normally sees the pane directly).
    const thinkingPane = this.findThinkingLevelSubmenuPane();
    if (thinkingPane && root.contains(thinkingPane)) return thinkingPane;

    return root.querySelector<HTMLElement>(NON_MODEL_MENU_EXCLUSION_FALLBACK);
  }

  private getModeSwitchMenuPanel(): HTMLElement | null {
    const legacy =
      document.querySelector<HTMLElement>(
        '.mat-mdc-menu-panel.gds-mode-switch-menu[role="menu"]',
      ) ?? document.querySelector<HTMLElement>('mat-action-list.gds-mode-switch-menu-list');
    if (legacy) return legacy;

    // 2026 redesign: any cdk-overlay-pane that contains a [data-mode-id] item is the model picker.
    const newItem = document.querySelector<HTMLElement>(
      `.cdk-overlay-pane ${NEW_LAYOUT_ITEM_SELECTOR}`,
    );
    if (newItem) {
      const pane = newItem.closest<HTMLElement>('.cdk-overlay-pane');
      if (pane) return pane;
    }

    return document.querySelector<HTMLElement>(NON_MODEL_MENU_EXCLUSION_FALLBACK);
  }

  private async waitForModeSwitchMenuPanel(timeoutMs: number): Promise<HTMLElement | null> {
    const startedAt = Date.now();
    const pollIntervalMs = 50;
    while (Date.now() - startedAt < timeoutMs) {
      const panel = this.getModeSwitchMenuPanel();
      if (panel?.isConnected) return panel;
      await new Promise<void>((resolve) => window.setTimeout(resolve, pollIntervalMs));
    }
    return null;
  }

  private scheduleMenuPanelInjection(menuPanel: HTMLElement) {
    // Second-line defence: even if a caller bypassed the observer-level
    // gate, never queue retry attempts when the kill switch is off.
    if (!this.autoApplyEnabled) return;
    if (this.pendingMenuPanelInjections.has(menuPanel)) return;
    this.pendingMenuPanelInjections.add(menuPanel);

    const delayMs = 50; // allow menu content to render
    window.setTimeout(() => {
      if (!this.started) return;

      this.pendingMenuPanelInjections.delete(menuPanel);

      void this.injectStarButtons(menuPanel).then((didInject) => {
        if (didInject) {
          this.menuPanelInjectAttempts.delete(menuPanel);
          return;
        }

        if (!menuPanel.isConnected) return;

        const attempts = (this.menuPanelInjectAttempts.get(menuPanel) ?? 0) + 1;
        this.menuPanelInjectAttempts.set(menuPanel, attempts);

        const maxAttempts = 10;
        if (attempts < maxAttempts) {
          this.scheduleMenuPanelInjection(menuPanel);
        }
      });
    }, delayMs);
  }

  private async injectStarButtons(menuPanel: HTMLElement): Promise<boolean> {
    // When the master kill switch is off, do not just bail — actively sweep
    // any star buttons that survived from a previous on-state. Bailing left
    // residual stars clickable, which then re-entered handleStarClick and
    // produced an inconsistent multi-is-default state because the cleanup
    // re-injection short-circuited too. See issue follow-up to the
    // default-model toggle.
    if (!this.autoApplyEnabled) {
      this.sweepDefaultModelUi(menuPanel);
      return false;
    }

    const items = menuPanel.querySelectorAll(MODE_ITEM_SELECTOR);
    if (!items.length) return false;

    // If this is the thinking-level submenu pane, run the dedicated injector.
    if (menuPanel.matches?.('.cdk-overlay-pane') && this.isThinkingLevelSubmenuPane(menuPanel)) {
      return this.injectThinkingLevelStars(menuPanel);
    }

    // Guard: only inject into menus that look like a model selector.
    // `.label-container` alone is too broad: Gemini's table/options menus use it too.
    // Non-model menus (theme picker, help, etc.) lack these even if they use menuitemradio.
    const isModelMenu =
      menuPanel.querySelector('[data-mode-id]') !== null ||
      menuPanel.querySelector('.mode-title') !== null ||
      menuPanel.querySelector('.title-and-description') !== null;
    if (!isModelMenu) return false;

    // Sweep stars whose owning item is no longer in the current `items`
    // set. Gemini's Angular view recycling can leave old item elements
    // attached to the panel after a re-render; without this sweep, the
    // per-item dedup below would happily inject a fresh star into each new
    // item, leaving the orphaned old item with its own star — visually
    // duplicating the star icon.
    const currentItems = new Set<Element>(Array.from(items));
    menuPanel.querySelectorAll('.gv-default-star-btn').forEach((star) => {
      const owner = star.closest(MODE_ITEM_SELECTOR);
      if (!owner || !currentItems.has(owner)) {
        star.remove();
      }
    });

    // Use cached value efficiently
    if (!this.initialized) {
      const result = await storageService.get<unknown>(StorageKeys.DEFAULT_MODEL);
      this.currentDefaultModel = result.success ? this.parseStoredDefaultModel(result.data) : null;
      this.initialized = true;
    }

    const currentDefault = this.currentDefaultModel;

    items.forEach((item) => {
      const itemEl = item as HTMLElement;

      if (this.isNestedThinkingLevelItem(itemEl)) {
        // Gemini now renders Standard/Extended inline under the Thinking level row.
        // Those child rows may still carry model-like metadata, so keep them out
        // of the model default path and let the thinking-level injector own them.
        itemEl.querySelectorAll('.gv-default-star-btn').forEach((star) => star.remove());
        return;
      }

      // Skip submenu triggers (e.g. "Thinking level" → Standard/Extended in the 2026 redesign).
      // Real model rows always resolve to a stable model id; submenu rows do not.
      if (itemEl.getAttribute('aria-haspopup') === 'true') return;
      if (itemEl.getAttribute('role') === 'menuitem' && !this.getModelIdFromItem(itemEl)) {
        // role=menuitem without any resolvable id is either a submenu opener or a non-model entry.
        // role=menuitemradio (legacy variant) may legitimately lack data-mode-id, so we keep it.
        return;
      }

      const modelName = this.getModelNameFromItem(itemEl);
      if (!modelName) return;

      // Avoid duplicates
      if (item.querySelector('.gv-default-star-btn')) {
        // Update state
        this.updateStarState(item as HTMLElement, modelName, currentDefault);
        return;
      }

      const btn = document.createElement('button');
      btn.className = 'gv-default-star-btn';
      btn.innerHTML = this.getStarIcon(false); // Default empty
      btn.title = chrome.i18n.getMessage('setAsDefaultModel');

      btn.addEventListener('click', async (e) => {
        e.stopPropagation(); // Prevent menu item selection
        e.preventDefault();
        await this.handleStarClick(modelName, btn);
      });

      // Finding the correct container. The 2026 redesign uses .label-container; older
      // variants use .title-and-description.
      const titleContainer = item.querySelector('.title-and-description, .label-container');

      if (titleContainer) {
        const titleEl = titleContainer.querySelector(
          '.mode-title, .gds-title-m, .gds-label-l, .label',
        );
        if (titleEl) {
          const titleParent = titleEl.parentElement;
          let wrapper = titleContainer.querySelector('.gv-title-wrapper') as HTMLElement | null;
          if (!wrapper && titleParent?.classList.contains('gv-title-wrapper')) {
            wrapper = titleParent;
          }

          if (!wrapper) {
            // Create wrapper
            wrapper = document.createElement('div');
            wrapper.className = 'gv-title-wrapper';
            wrapper.style.cssText = 'display: flex; align-items: center; width: 100%;';

            // Insert wrapper where the title currently lives.
            if (titleParent) {
              titleParent.insertBefore(wrapper, titleEl);
            } else {
              titleContainer.appendChild(wrapper);
            }

            // Move title into wrapper
            wrapper.appendChild(titleEl);
          }

          // Append star to wrapper
          wrapper.appendChild(btn);
        } else {
          // Fallback if structure changes
          titleContainer.appendChild(btn);
        }
      } else {
        // Fallback
        item.appendChild(btn);
      }
      this.updateStarState(item as HTMLElement, modelName, currentDefault);
    });

    await this.injectNestedThinkingLevelStars(menuPanel);

    return true;
  }

  private async injectNestedThinkingLevelStars(menuPanel: HTMLElement): Promise<void> {
    const thinkingRow = this.findThinkingLevelTriggerRow();
    if (!thinkingRow || !menuPanel.contains(thinkingRow)) return;
    if (!thinkingRow.querySelector('gem-menu-item, [role="menuitem"]')) return;
    await this.injectThinkingLevelStars(thinkingRow);
  }

  private isNestedThinkingLevelItem(item: HTMLElement): boolean {
    const row = item.closest<HTMLElement>('[value="thinking_level"]');
    return !!row && row !== item;
  }

  private async injectThinkingLevelStars(submenuPane: HTMLElement): Promise<boolean> {
    // Master kill switch — see comment on `injectStarButtons`.
    if (!this.autoApplyEnabled) {
      this.sweepDefaultModelUi(submenuPane);
      return false;
    }

    const items = Array.from(
      submenuPane.querySelectorAll<HTMLElement>('gem-menu-item, [role="menuitem"]'),
    );
    if (!items.length) return false;

    // Orphan-star sweep — same rationale as `injectStarButtons`.
    const currentItems = new Set<Element>(items);
    submenuPane.querySelectorAll('.gv-default-star-btn').forEach((star) => {
      const owner = star.closest('gem-menu-item, [role="menuitem"]');
      if (!owner || !currentItems.has(owner)) {
        star.remove();
      }
    });

    if (!this.initialized) {
      const result = await storageService.get<unknown>(StorageKeys.DEFAULT_THINKING_LEVEL);
      this.currentDefaultThinkingLevel = result.success
        ? this.parseStoredThinkingLevel(result.data)
        : null;
      this.initialized = true;
    }

    const currentDefault = this.currentDefaultThinkingLevel;

    items.forEach((item, index) => {
      const label = this.getThinkingLevelLabel(item);
      if (!label) return;

      if (item.querySelector('.gv-default-star-btn')) {
        this.updateThinkingStarState(item, index, label, currentDefault);
        return;
      }

      const btn = document.createElement('button');
      btn.className = 'gv-default-star-btn';
      btn.innerHTML = this.getStarIcon(false);
      btn.title = chrome.i18n.getMessage('setAsDefaultThinkingLevel');

      btn.addEventListener('click', async (e) => {
        e.stopPropagation();
        e.preventDefault();
        await this.handleThinkingLevelStarClick(index, label, btn);
      });

      const labelContainer = item.querySelector('.label-container');
      if (labelContainer) {
        const titleEl = labelContainer.querySelector('.label, .gds-title-m, .gds-label-l');
        if (titleEl) {
          const titleParent = titleEl.parentElement;
          let wrapper = labelContainer.querySelector('.gv-title-wrapper') as HTMLElement | null;
          if (!wrapper && titleParent?.classList.contains('gv-title-wrapper')) {
            wrapper = titleParent;
          }
          if (!wrapper) {
            wrapper = document.createElement('div');
            wrapper.className = 'gv-title-wrapper';
            wrapper.style.cssText = 'display: flex; align-items: center; width: 100%;';
            if (titleParent) {
              titleParent.insertBefore(wrapper, titleEl);
            } else {
              labelContainer.appendChild(wrapper);
            }
            wrapper.appendChild(titleEl);
          }
          wrapper.appendChild(btn);
        } else {
          labelContainer.appendChild(btn);
        }
      } else {
        item.appendChild(btn);
      }

      this.updateThinkingStarState(item, index, label, currentDefault);
    });

    return true;
  }

  private getThinkingLevelLabel(item: HTMLElement): string {
    const titleEl = item.querySelector('.label, .gds-title-m, .gds-label-l');
    return titleEl?.textContent?.trim() || '';
  }

  private isThinkingDefaultForItem(
    currentDefault: DefaultThinkingLevel | null,
    index: number,
    label: string,
  ): boolean {
    if (!currentDefault) return false;
    if (currentDefault.label && currentDefault.label === label) return true;
    return currentDefault.index === index;
  }

  private updateThinkingStarState(
    item: HTMLElement,
    index: number,
    label: string,
    currentDefault: DefaultThinkingLevel | null,
  ) {
    const btn = item.querySelector('.gv-default-star-btn') as HTMLElement | null;
    if (!btn) return;
    this.bindStarOwnerHover(item, btn);
    if (!btn.hasAttribute('data-event-bound')) {
      btn.setAttribute('data-event-bound', 'true');
      btn.addEventListener('mousedown', (e) => e.stopPropagation());
      btn.addEventListener('click', (e) => e.stopPropagation());
    }
    const isDefault = this.isThinkingDefaultForItem(currentDefault, index, label);
    if (isDefault) {
      btn.classList.add('is-default');
      btn.innerHTML = this.getStarIcon(true);
      btn.title = chrome.i18n.getMessage('cancelDefaultThinkingLevel');
    } else {
      btn.classList.remove('is-default');
      btn.innerHTML = this.getStarIcon(false);
      btn.title = chrome.i18n.getMessage('setAsDefaultThinkingLevel');
    }
  }

  private async handleThinkingLevelStarClick(index: number, label: string, btn: HTMLElement) {
    // Stale-click guard. Stars are normally swept the instant the user
    // toggles the kill switch off, but a star inside a detached overlay
    // pane (or attached to a closure from a previous on-session) can
    // outlive the sweep. Without this guard such a click would silently
    // mutate storage even though the user has paused the feature.
    if (!this.autoApplyEnabled) {
      btn
        .closest('[role="menuitemradio"], [role="menuitem"], gem-menu-item')
        ?.querySelectorAll('.gv-default-star-btn')
        .forEach((el) => el.remove());
      return;
    }
    const isCurrentlyDefault = this.isThinkingDefaultForItem(
      this.currentDefaultThinkingLevel,
      index,
      label,
    );
    const nextDefault: DefaultThinkingLevel | null = isCurrentlyDefault ? null : { index, label };

    this.currentDefaultThinkingLevel = nextDefault;

    const itemEl = btn.closest('gem-menu-item, [role="menuitem"]');
    if (itemEl instanceof HTMLElement) {
      this.updateThinkingStarState(itemEl, index, label, nextDefault);
    }

    if (nextDefault) {
      this.showToast(chrome.i18n.getMessage('defaultThinkingLevelSet', [label]));
    } else {
      this.showToast(chrome.i18n.getMessage('defaultThinkingLevelCleared'));
    }

    const submenu = this.findThinkingLevelSubmenuPane();
    if (submenu) {
      void this.injectThinkingLevelStars(submenu);
    }

    if (isCurrentlyDefault) {
      await storageService.remove(StorageKeys.DEFAULT_THINKING_LEVEL);
    } else {
      await storageService.set(StorageKeys.DEFAULT_THINKING_LEVEL, nextDefault);
    }
  }

  private getModelNameFromItem(item: HTMLElement): string {
    const titleEl = item.querySelector('.mode-title, .gds-title-m, .gds-label-l, .label');
    return titleEl?.textContent?.trim() || '';
  }

  private getModelIdFromItem(item: HTMLElement): string | null {
    const raw = item.getAttribute('data-mode-id') || item.dataset.modeId;
    if (typeof raw === 'string') {
      const id = raw.trim();
      if (id.length) return id;
    }

    // Compact layout may omit data-mode-id but keeps the internal model id in jslog metadata.
    const jslog = item.getAttribute('jslog');
    if (typeof jslog === 'string') {
      const matchedIds = jslog.match(/[a-f0-9]{16}/gi);
      const id = matchedIds?.[matchedIds.length - 1]?.trim();
      if (id) return id;
    }

    return null;
  }

  private isDefaultForItem(
    currentDefault: DefaultModelSetting | null,
    item: HTMLElement,
    modelName: string,
  ): boolean {
    if (!currentDefault) return false;
    if (currentDefault.kind === 'id') {
      const id = this.getModelIdFromItem(item);
      return id === currentDefault.id;
    }
    return currentDefault.name === modelName;
  }

  private updateStarState(
    item: HTMLElement,
    modelName: string,
    currentDefault: DefaultModelSetting | null,
  ) {
    const btn = item.querySelector('.gv-default-star-btn') as HTMLElement;
    if (!btn) return;
    this.bindStarOwnerHover(item, btn);

    // Ensure mousedown/click stops propagation (idempotent)
    if (!btn.hasAttribute('data-event-bound')) {
      btn.setAttribute('data-event-bound', 'true');
      btn.addEventListener('mousedown', (e) => e.stopPropagation());
      btn.addEventListener('click', (e) => e.stopPropagation());
    }

    const isDefault = this.isDefaultForItem(currentDefault, item, modelName);
    if (isDefault) {
      btn.classList.add('is-default');
      btn.innerHTML = this.getStarIcon(true);
      btn.title = chrome.i18n.getMessage('cancelDefaultModel');
    } else {
      btn.classList.remove('is-default');
      btn.innerHTML = this.getStarIcon(false);
      btn.title = chrome.i18n.getMessage('setAsDefaultModel');
    }
  }

  private bindStarOwnerHover(item: HTMLElement, btn: HTMLElement) {
    if (btn.hasAttribute('data-hover-bound')) return;
    btn.setAttribute('data-hover-bound', 'true');

    item.addEventListener('mouseenter', () => {
      btn.classList.add('is-owner-hovered');
    });
    item.addEventListener('mouseleave', () => {
      btn.classList.remove('is-owner-hovered');
    });
    item.addEventListener('focusin', () => {
      btn.classList.add('is-owner-hovered');
    });
    item.addEventListener('focusout', (event) => {
      const nextTarget = event.relatedTarget;
      if (!(nextTarget instanceof Node) || !item.contains(nextTarget)) {
        btn.classList.remove('is-owner-hovered');
      }
    });
  }

  private getStarIcon(filled: boolean): string {
    if (filled) {
      return `<svg viewBox="0 0 24 24"><path d="M12 17.27L18.18 21l-1.64-7.03L22 9.24l-7.19-.61L12 2 9.19 8.63 2 9.24l5.46 4.73L5.82 21z" fill="currentColor"></path></svg>`;
    } else {
      return `<svg viewBox="0 0 24 24"><path d="M12 17.27L18.18 21l-1.64-7.03L22 9.24l-7.19-.61L12 2 9.19 8.63 2 9.24l5.46 4.73L5.82 21z" fill="none" stroke="currentColor" stroke-width="1.5"></path></svg>`;
    }
  }

  private async handleStarClick(modelName: string, btn: HTMLElement) {
    const closestItem = btn.closest(MODE_ITEM_SELECTOR);
    const modelItem = closestItem instanceof HTMLElement ? closestItem : null;
    const modelId = modelItem ? this.getModelIdFromItem(modelItem) : null;

    // Stale-click guard — see comment on `handleThinkingLevelStarClick`.
    if (!this.autoApplyEnabled) {
      if (modelItem) {
        modelItem.querySelectorAll('.gv-default-star-btn').forEach((el) => el.remove());
      } else {
        btn.remove();
      }
      return;
    }

    // 1. Optimistic UI Update (Instant feedback)
    const isCurrentlyDefault = modelItem
      ? this.isDefaultForItem(this.currentDefaultModel, modelItem, modelName)
      : this.currentDefaultModel?.kind === 'name'
        ? this.currentDefaultModel.name === modelName
        : false;

    const nextDefault: DefaultModelSetting | null = isCurrentlyDefault
      ? null
      : modelId
        ? { kind: 'id', id: modelId, name: modelName }
        : { kind: 'name', name: modelName };

    // Update cache immediately
    this.currentDefaultModel = nextDefault;

    // Update current button immediately
    if (modelItem) {
      this.updateStarState(modelItem, modelName, nextDefault);
    }

    // Show Toast immediately
    if (nextDefault) {
      this.showToast(chrome.i18n.getMessage('defaultModelSet', [modelName]));
    } else {
      this.showToast(chrome.i18n.getMessage('defaultModelCleared'));
    }

    // Update other buttons (e.g. if switching from A to B)
    const menuPanel = this.getModeSwitchMenuPanel();
    if (menuPanel) {
      // Re-run injection to update all other buttons based on new cache
      void this.injectStarButtons(menuPanel as HTMLElement);
    }

    // 2. Perform async storage operation in background
    if (isCurrentlyDefault) {
      await storageService.remove(StorageKeys.DEFAULT_MODEL);
    } else {
      if (nextDefault?.kind === 'id') {
        const toStore: StoredDefaultModelSetting = {
          id: nextDefault.id,
          name: nextDefault.name,
        };
        await storageService.set(StorageKeys.DEFAULT_MODEL, toStore);
      } else {
        await storageService.set(StorageKeys.DEFAULT_MODEL, modelName);
      }
    }
  }

  private showToast(message: string) {
    const toast = document.createElement('div');
    toast.style.cssText = `
      position: fixed;
      bottom: 24px;
      left: 50%;
      transform: translateX(-50%);
      background: #323232;
      color: white;
      padding: 12px 24px;
      border-radius: 4px;
      font-size: 14px;
      z-index: 10000;
      box-shadow: 0 2px 10px rgba(0,0,0,0.2);
      transition: opacity 0.3s;
    `;
    toast.textContent = message;
    document.body.appendChild(toast);
    setTimeout(() => {
      toast.style.opacity = '0';
      setTimeout(() => toast.remove(), 300);
    }, 3000);
  }

  private maybeNotifyAutoApplyFailure() {
    if (this.consecutiveFailures < this.maxConsecutiveFailures) return;
    if (this.failureToastShown) return;
    this.failureToastShown = true;
    this.showAutoApplyFailureToast();
  }

  private showAutoApplyFailureToast() {
    // Drop any earlier instance so consecutive triggers (shouldn't happen
    // thanks to `failureToastShown`, but defensive) don't stack.
    document.querySelectorAll('.gv-default-model-fail-toast').forEach((n) => n.remove());

    const toast = document.createElement('div');
    toast.className = 'gv-default-model-fail-toast';
    toast.style.cssText = `
      position: fixed;
      bottom: 24px;
      left: 50%;
      transform: translateX(-50%);
      background: #323232;
      color: white;
      padding: 14px 18px;
      border-radius: 6px;
      font-size: 14px;
      line-height: 1.45;
      z-index: 10000;
      box-shadow: 0 4px 16px rgba(0,0,0,0.3);
      display: flex;
      gap: 14px;
      align-items: center;
      max-width: min(520px, calc(100vw - 48px));
      transition: opacity 0.3s;
    `;

    const text = document.createElement('span');
    text.style.cssText = 'flex: 1; min-width: 0;';
    text.textContent =
      chrome.i18n.getMessage('defaultModelAutoApplyFailed') ||
      'Default model auto-apply failed 3 times in a row. Gemini may have changed its menu layout.';

    const action = document.createElement('button');
    action.type = 'button';
    action.style.cssText = `
      flex: 0 0 auto;
      background: #1a73e8;
      color: white;
      border: none;
      padding: 8px 14px;
      border-radius: 4px;
      font-size: 13px;
      font-weight: 500;
      cursor: pointer;
      white-space: nowrap;
    `;
    action.textContent =
      chrome.i18n.getMessage('defaultModelAutoApplyFailedAction') || 'Pause in settings';

    const dismiss = () => {
      toast.style.opacity = '0';
      setTimeout(() => toast.remove(), 300);
    };

    action.addEventListener('click', () => {
      void this.requestOpenPopup().then((opened) => {
        if (opened) {
          dismiss();
          return;
        }
        // Firefox/Safari (or any host that refuses programmatic popup):
        // swap the text to the manual-fallback instruction and hide the
        // button — there's nothing useful left for it to do.
        text.textContent =
          chrome.i18n.getMessage('defaultModelAutoApplyFailedFallback') ||
          'Open the extension popup from your toolbar to pause this feature.';
        action.remove();
      });
    });

    toast.appendChild(text);
    toast.appendChild(action);
    document.body.appendChild(toast);

    // Stay visible long enough to read + act, but auto-dismiss eventually
    // so it isn't a permanent splash on the page.
    setTimeout(dismiss, 12000);
  }

  private async requestOpenPopup(): Promise<boolean> {
    try {
      const response = (await chrome.runtime.sendMessage({ type: 'gv.openPopup' })) as
        | { ok?: boolean }
        | undefined;
      return response?.ok === true;
    } catch {
      return false;
    }
  }

  // ==================== Auto Lock Logic ====================

  private subscribeToAutoApplyChanges() {
    if (this.storageChangeListener) return;
    this.storageChangeListener = (changes, area) => {
      if (area !== 'sync' && area !== 'local') return;
      const change = changes[StorageKeys.DEFAULT_MODEL_AUTO_APPLY];
      if (!change) return;
      const next = change.newValue !== false; // missing/true → enabled
      if (next === this.autoApplyEnabled) return;
      this.autoApplyEnabled = next;
      if (!next) {
        // Flipping off: abort any running lock loop so it doesn't keep
        // clicking after the user disabled the feature.
        if (this.checkTimer) {
          clearInterval(this.checkTimer);
          this.checkTimer = null;
        }
        this.autoSelectSessionId = null;
        // Sweep any star buttons already injected into open menus so the UI
        // matches the off-state immediately (next menu open will skip
        // injection too via the guards in `injectStarButtons`).
        this.sweepDefaultModelUi();
      } else {
        // Flipping on: clear the once-per-session toast guard so a future
        // breakage during the re-enabled run can surface a fresh warning,
        // and reset the rejected-switch tracker so a prior quota-exhausted
        // session doesn't keep the loop suppressed on the next chat.
        this.failureToastShown = false;
        this.pendingModelSwitchKey = null;
        this.consecutiveRejectedModelSwitches = 0;
        this.pendingThinkingSwitchKey = null;
        this.consecutiveRejectedThinkingSwitches = 0;
      }
    };
    try {
      chrome.storage.onChanged.addListener(this.storageChangeListener);
    } catch {
      // chrome.storage may be unavailable in certain test contexts; safe to ignore.
    }
  }

  /**
   * Delayed version of checkAndLockModel for SPA navigation.
   * Adds a small delay to ensure the URL has actually changed.
   */
  private async checkAndLockModelWithDelay() {
    // Wait for SPA navigation to complete
    await new Promise<void>((resolve) => window.setTimeout(resolve, 150));
    void this.checkAndLockModel();
  }

  private async checkAndLockModel() {
    // Master kill switch — see `autoApplyEnabled`.
    if (!this.autoApplyEnabled) return;
    // Only lock on new conversation pages
    if (!this.isNewConversation()) return;

    // Update last checked path
    this.lastCheckedPath = window.location.pathname;

    const result = await storageService.get<unknown>(StorageKeys.DEFAULT_MODEL);
    const targetModel = result.success ? this.parseStoredDefaultModel(result.data) : null;
    this.currentDefaultModel = targetModel;

    const thinkingResult = await storageService.get<unknown>(StorageKeys.DEFAULT_THINKING_LEVEL);
    const targetThinking = thinkingResult.success
      ? this.parseStoredThinkingLevel(thinkingResult.data)
      : null;
    this.currentDefaultThinkingLevel = targetThinking;

    this.initialized = true;

    if (!targetModel && !targetThinking) return;

    // Skip when the only target is the Flash/Fast model and no thinking preference exists —
    // Gemini already defaults to Flash, so a no-op lock loop just wastes ticks.
    if (targetModel && this.isFastModel(targetModel) && !targetThinking) {
      return;
    }

    // Generate a unique session ID to prevent duplicate selections in the same navigation
    const sessionId = `${window.location.pathname}-${Date.now()}`;
    this.autoSelectSessionId = sessionId;
    // Reset failure counter for new session
    this.consecutiveFailures = 0;
    this.pendingModelSwitchKey = null;
    this.consecutiveRejectedModelSwitches = 0;
    this.pendingThinkingSwitchKey = null;
    this.consecutiveRejectedThinkingSwitches = 0;

    // Start checking loop
    let attempts = 0;
    const maxAttempts = 5;

    if (this.checkTimer) clearInterval(this.checkTimer);

    this.checkTimer = window.setInterval(async () => {
      // Abort if session changed (e.g., user navigated away and came back)
      if (this.autoSelectSessionId !== sessionId) {
        this.stopLockTimer();
        return;
      }

      attempts++;
      if (attempts > maxAttempts) {
        this.stopLockTimer();
        return;
      }

      await this.tickLock(targetModel, targetThinking);
    }, 1000);
  }

  /**
   * Single tick: cheap fast-path via trigger pill text, then targeted lock if needed.
   * Handles both model and thinking-level prefs.
   */
  private async tickLock(
    targetModel: DefaultModelSetting | null,
    targetThinking: DefaultThinkingLevel | null,
  ) {
    const lines = this.readTriggerPillLines();
    const modelOk = !targetModel || this.modelMatchesLines(targetModel, lines);
    const thinkingOk = !targetThinking || this.thinkingMatchesLines(targetThinking, lines);

    if (modelOk && thinkingOk) {
      this.stopLockTimer();
      this.consecutiveFailures = 0;
      this.pendingModelSwitchKey = null;
      this.consecutiveRejectedModelSwitches = 0;
      this.pendingThinkingSwitchKey = null;
      this.consecutiveRejectedThinkingSwitches = 0;
      return;
    }

    if (modelOk) {
      this.pendingModelSwitchKey = null;
      this.consecutiveRejectedModelSwitches = 0;
    }

    if (!modelOk && targetModel) {
      const switchKey = this.getModelSwitchKey(targetModel);
      if (this.pendingModelSwitchKey === switchKey) {
        this.consecutiveRejectedModelSwitches++;
        if (this.consecutiveRejectedModelSwitches >= this.maxConsecutiveFailures) {
          this.consecutiveFailures = this.maxConsecutiveFailures;
          this.maybeNotifyAutoApplyFailure();
          this.stopLockTimer();
          return;
        }
      }

      const result = await this.tryLockToModel(targetModel);
      if (result === 'switched') {
        this.pendingModelSwitchKey = switchKey;
      } else if (result === 'already-selected') {
        this.pendingModelSwitchKey = null;
        this.consecutiveRejectedModelSwitches = 0;
        if (!thinkingOk && targetThinking) {
          await this.tryLockToThinkingLevel(targetThinking);
        } else {
          this.stopLockTimer();
        }
      } else {
        this.pendingModelSwitchKey = null;
        this.consecutiveRejectedModelSwitches = 0;
      }
      return;
    }

    if (!thinkingOk && targetThinking) {
      const switchKey = this.getThinkingSwitchKey(targetThinking);
      if (this.pendingThinkingSwitchKey === switchKey) {
        this.consecutiveRejectedThinkingSwitches++;
        if (this.consecutiveRejectedThinkingSwitches >= this.maxConsecutiveFailures) {
          this.consecutiveFailures = this.maxConsecutiveFailures;
          this.maybeNotifyAutoApplyFailure();
          this.stopLockTimer();
          return;
        }
      }

      const clicked = await this.tryLockToThinkingLevel(targetThinking);
      if (clicked) {
        this.pendingThinkingSwitchKey = switchKey;
      } else {
        this.pendingThinkingSwitchKey = null;
        this.consecutiveRejectedThinkingSwitches = 0;
      }
    }
  }

  private modelMatchesLines(target: DefaultModelSetting, lines: string[]): boolean {
    if (!lines.length) return false;
    const modelLine = lines[0].toLowerCase().trim();
    const targetName = target.name.toLowerCase().trim();
    if (!targetName || !modelLine) return false;
    const escape = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const wholeWordIn = (needle: string, haystack: string) =>
      new RegExp(`(^|\\b)${escape(needle)}(\\b|$)`, 'i').test(haystack);
    if (modelLine === targetName) return true;
    if (wholeWordIn(targetName, modelLine)) return true;
    // Gemini's trigger pill shows the short variant ("Pro", "Flash") while menu items
    // expose the full variant ("3.1 Pro", "3 Flash") that we persisted. Accept the
    // reverse direction (line is a word-bounded substring of the stored name) so the
    // fast-path correctly recognises "Pro" === stored "3.1 Pro" and stops re-clicking.
    if (['flash', 'fast'].includes(modelLine) && modelLine !== targetName) return false;
    if (modelLine.length >= 2 && wholeWordIn(modelLine, targetName)) return true;
    return false;
  }

  private thinkingMatchesLines(target: DefaultThinkingLevel, lines: string[]): boolean {
    // Gemini omits the thinking-level line in the trigger pill when at Standard (index 0, the default).
    if (lines.length < 2) {
      return target.index === 0 || target.label.toLowerCase().trim() === 'standard';
    }
    const thinkingLine = lines.slice(1).join(' ').toLowerCase().trim();
    return thinkingLine === target.label.toLowerCase().trim();
  }

  private isNewConversation() {
    const path = window.location.pathname;
    // Supports multi-profile paths like /u/0/app as well as /app.
    // Also supports Gem paths like /gem/xyz or /u/0/gem/xyz
    return /^\/(u\/\d+\/)?(app\/?|gem\/.*)$/.test(path);
  }

  /**
   * Check if the given model is a Flash/Fast model (Gemini's default model).
   * If yes, we don't need to auto-switch since the page already defaults to it.
   */
  private isFastModel(model: DefaultModelSetting): boolean {
    if (model.kind === 'id') {
      return FAST_MODEL_IDS.has(model.id);
    }
    const normalizedName = model.name.toLowerCase().trim();
    return FAST_MODEL_NAMES.has(normalizedName);
  }

  private getModelSwitchKey(model: DefaultModelSetting): string {
    return model.kind === 'id' ? `id:${model.id}` : `name:${model.name.toLowerCase().trim()}`;
  }

  private getThinkingSwitchKey(thinking: DefaultThinkingLevel): string {
    return `thinking:${thinking.index}:${thinking.label.toLowerCase().trim()}`;
  }

  private stopLockTimer() {
    if (!this.checkTimer) return;
    clearInterval(this.checkTimer);
    this.checkTimer = null;
  }

  private async tryLockToModel(
    targetModel: DefaultModelSetting,
  ): Promise<'switched' | 'already-selected' | 'failed'> {
    // Ported from https://github.com/urzeye/tampermonkey-scripts (Gemini Helper)
    const normalize = (s: string) => s.toLowerCase().trim();
    const escapeRegExp = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const targetName = normalize(targetModel.name);
    const targetAsWholeWord = new RegExp(`(^|\\b)${escapeRegExp(targetName)}(\\b|$)`, 'i');

    // 1. Find selector button (shared helper keeps selectors in sync with the
    //    fast-path check in readTriggerPillLines — #756).
    const selectorBtn = this.findSelectorButton();
    if (!selectorBtn) return 'failed';

    // 2. Check current model text - early return if already correct
    const currentText = selectorBtn.textContent || '';
    const normalizedCurrent = normalize(currentText);

    // For both 'id' and 'name' kinds, we can check if the button text matches the target name
    // This helps avoid unnecessary menu clicks when the model is already selected
    if (targetAsWholeWord.test(normalizedCurrent) || normalizedCurrent === targetName) {
      // Already correct
      this.stopLockTimer();
      return 'already-selected';
    }

    // 3. Switch model
    // This part is tricky because we need to open the menu and click safely
    if (this.isLocked) return 'failed'; // Prevent concurrent locks
    this.isLocked = true;

    try {
      (selectorBtn as HTMLElement).click();

      const menuPanel = await this.waitForModeSwitchMenuPanel(1500);
      if (!menuPanel) {
        // Menu UI may have been restructured (e.g. Gemini redesign). Close any opened
        // menu and count this as a failure so we don't loop forever toggling the trigger.
        document.body.click();
        this.consecutiveFailures++;
        this.maybeNotifyAutoApplyFailure();
        if (this.consecutiveFailures >= this.maxConsecutiveFailures && this.checkTimer) {
          this.stopLockTimer();
        }
        return 'failed';
      }

      const items = menuPanel.querySelectorAll(MODE_ITEM_SELECTOR);
      let found = false;
      let switchedModel = false;

      if (targetModel.kind === 'id') {
        const targetItem = Array.from(items).find((item) => {
          if (!(item instanceof HTMLElement)) return false;
          return this.getModelIdFromItem(item) === targetModel.id;
        });

        if (targetItem instanceof HTMLElement) {
          const alreadySelected =
            targetItem.getAttribute('aria-checked') === 'true' ||
            targetItem.classList.contains('is-selected') ||
            targetItem.classList.contains('selected');

          if (!alreadySelected) {
            targetItem.click();
            switchedModel = true;
          } else {
            // Already selected, close menu to avoid stuck UI
            document.body.click();
            this.stopLockTimer();
          }

          found = true;
        }
      } else {
        for (const item of Array.from(items)) {
          const modelName = this.getModelNameFromItem(item as HTMLElement);
          if (normalize(modelName) === targetName) {
            const alreadySelected =
              (item as HTMLElement).getAttribute('aria-checked') === 'true' ||
              (item as HTMLElement).classList.contains('is-selected') ||
              (item as HTMLElement).classList.contains('selected');

            if (!alreadySelected) {
              (item as HTMLElement).click();
              switchedModel = true;
            } else {
              // Already selected, close menu to avoid stuck UI
              document.body.click();
              this.stopLockTimer();
            }
            found = true;
            break;
          }
        }
      }

      if (!found) {
        // Fallback: whole-word match on the full text content (includes description).
        for (const item of Array.from(items)) {
          const text = (item as HTMLElement).textContent || '';
          if (targetAsWholeWord.test(normalize(text))) {
            const alreadySelected =
              (item as HTMLElement).getAttribute('aria-checked') === 'true' ||
              (item as HTMLElement).classList.contains('is-selected') ||
              (item as HTMLElement).classList.contains('selected');

            if (!alreadySelected) {
              (item as HTMLElement).click();
              switchedModel = true;
            } else {
              // Already selected, close menu to avoid stuck UI
              document.body.click();
              this.stopLockTimer();
            }
            found = true;
            break;
          }
        }
      }

      if (switchedModel) {
        this.focusChatInputAfterAutoSwitch();
      }

      if (!found) {
        // Close menu if not found to avoid stuck menu
        document.body.click();

        // Track consecutive failures - if model is consistently not found,
        // stop trying to avoid endless flashing (e.g., model not available for this account)
        this.consecutiveFailures++;
        this.maybeNotifyAutoApplyFailure();
        if (this.consecutiveFailures >= this.maxConsecutiveFailures) {
          if (this.checkTimer) {
            this.stopLockTimer();
          }
        }
        return 'failed';
      }

      return switchedModel ? 'switched' : 'already-selected';
    } catch (e) {
      console.error('Auto lock failed', e);
      return 'failed';
    } finally {
      this.isLocked = false;
    }
  }

  private async tryLockToThinkingLevel(target: DefaultThinkingLevel): Promise<boolean> {
    if (this.isLocked) return false;
    this.isLocked = true;

    try {
      const trigger = this.findSelectorButton();
      if (!trigger) return false;

      // Open the model menu first.
      trigger.click();

      const modelPane = await this.waitForModeSwitchMenuPanel(1500);
      if (!modelPane) {
        document.body.click();
        this.consecutiveFailures++;
        this.maybeNotifyAutoApplyFailure();
        if (this.consecutiveFailures >= this.maxConsecutiveFailures && this.checkTimer) {
          this.stopLockTimer();
        }
        return false;
      }

      const thinkingRow = this.findThinkingLevelTriggerRow();
      if (!thinkingRow) {
        // This model doesn't expose a Thinking level. Nothing to lock — stop trying.
        document.body.click();
        this.stopLockTimer();
        return false;
      }

      this.openThinkingLevelSubmenu(thinkingRow);

      // Wait briefly for the submenu to mount.
      const submenu = await this.waitForThinkingLevelSubmenu(1500);
      if (!submenu) {
        document.body.click();
        this.consecutiveFailures++;
        this.maybeNotifyAutoApplyFailure();
        if (this.consecutiveFailures >= this.maxConsecutiveFailures && this.checkTimer) {
          this.stopLockTimer();
        }
        return false;
      }

      const items = this.getThinkingLevelItems();
      if (!items.length) {
        document.body.click();
        return false;
      }

      const targetLabel = target.label.toLowerCase().trim();
      const byLabel = items.find(
        (it) => this.getThinkingLevelLabel(it).toLowerCase().trim() === targetLabel,
      );
      const byIndex = items[target.index] ?? null;
      const targetItem = byLabel ?? byIndex;

      if (!targetItem) {
        document.body.click();
        this.consecutiveFailures++;
        this.maybeNotifyAutoApplyFailure();
        if (this.consecutiveFailures >= this.maxConsecutiveFailures && this.checkTimer) {
          this.stopLockTimer();
        }
        return false;
      }

      const alreadySelected = targetItem.classList.contains('selected');
      if (!alreadySelected) {
        targetItem.click();
        this.focusChatInputAfterAutoSwitch();
        this.consecutiveFailures = 0;
        return true;
      } else {
        document.body.click();
        this.consecutiveFailures = 0;
        this.stopLockTimer();
      }

      this.consecutiveFailures = 0;
      return false;
    } catch (e) {
      console.error('Auto thinking-level lock failed', e);
      return false;
    } finally {
      this.isLocked = false;
    }
  }

  private openThinkingLevelSubmenu(thinkingRow: HTMLElement): void {
    const content = thinkingRow.querySelector<HTMLElement>(
      'gem-menu-item-content, .label-container',
    );
    const targets = content && content !== thinkingRow ? [thinkingRow, content] : [thinkingRow];
    const mouseInit: MouseEventInit = { bubbles: true, cancelable: true };
    const enterInit: MouseEventInit = { bubbles: false, cancelable: true };

    for (const target of targets) {
      if ('PointerEvent' in window) {
        const pointerInit: PointerEventInit = {
          bubbles: true,
          cancelable: true,
          pointerType: 'mouse',
        };
        const pointerEnterInit: PointerEventInit = { ...pointerInit, bubbles: false };
        target.dispatchEvent(new PointerEvent('pointerover', pointerInit));
        target.dispatchEvent(new PointerEvent('pointerenter', pointerEnterInit));
        target.dispatchEvent(new PointerEvent('pointermove', pointerInit));
      }

      target.dispatchEvent(new MouseEvent('mouseover', mouseInit));
      target.dispatchEvent(new MouseEvent('mouseenter', enterInit));
      target.dispatchEvent(new MouseEvent('mousemove', mouseInit));
    }

    thinkingRow.focus({ preventScroll: true });
    thinkingRow.click();
  }

  private async waitForThinkingLevelSubmenu(timeoutMs: number): Promise<HTMLElement | null> {
    const startedAt = Date.now();
    while (Date.now() - startedAt < timeoutMs) {
      const pane = this.findThinkingLevelSubmenuPane();
      if (pane?.isConnected && this.getThinkingLevelItems().length > 0) return pane;
      await new Promise<void>((resolve) => window.setTimeout(resolve, 50));
    }
    return null;
  }

  private focusChatInputAfterAutoSwitch(): void {
    const focusDelayMs = 120;
    window.setTimeout(() => {
      const input = this.findChatInputElement();
      if (!input) return;

      try {
        input.focus({ preventScroll: true });
      } catch {
        input.focus();
      }
    }, focusDelayMs);
  }

  private findChatInputElement(): HTMLElement | null {
    for (const selector of CHAT_INPUT_SELECTORS) {
      const candidates = document.querySelectorAll<HTMLElement>(selector);
      for (const candidate of Array.from(candidates)) {
        if (!candidate.isConnected) continue;
        if (candidate instanceof HTMLTextAreaElement && candidate.disabled) continue;
        return candidate;
      }
    }
    return null;
  }

  // ==================== Thinking level helpers (2026 redesign) ====================

  /**
   * Find the "Thinking level" submenu row in any open model picker.
   * Detected by the stable attribute value="thinking_level" rendered by Gemini.
   */
  private findThinkingLevelTriggerRow(): HTMLElement | null {
    return document.querySelector<HTMLElement>(
      '.cdk-overlay-pane [value="thinking_level"], .cdk-overlay-pane gem-menu-item[value="thinking_level"]',
    );
  }

  /**
   * Resolve the submenu pane (the one containing Standard/Extended) by walking
   * from the Thinking level row's aria-controls to the matching menu id.
   */
  private findThinkingLevelSubmenuPane(): HTMLElement | null {
    const row = this.findThinkingLevelTriggerRow();
    const controlsId = row?.getAttribute('aria-controls');
    if (controlsId) {
      const submenu = document.getElementById(controlsId);
      if (submenu) {
        return submenu.closest<HTMLElement>('.cdk-overlay-pane') ?? submenu;
      }
    }
    return row?.querySelector('gem-menu-item, [role="menuitem"]') ? row : null;
  }

  private getThinkingLevelItems(): HTMLElement[] {
    const submenu = this.findThinkingLevelSubmenuPane();
    if (!submenu) return [];
    return Array.from(submenu.querySelectorAll<HTMLElement>('gem-menu-item, [role="menuitem"]'));
  }

  private isThinkingLevelSubmenuPane(pane: HTMLElement): boolean {
    // The submenu pane never carries the trigger row itself — that lives only in the parent overlay.
    if (pane.querySelector('[value="thinking_level"]')) return false;
    const row = this.findThinkingLevelTriggerRow();
    const controlsId = row?.getAttribute('aria-controls');
    if (!controlsId) return false;
    const submenuEl = document.getElementById(controlsId);
    if (!submenuEl) return false;
    return pane.id === controlsId || pane.contains(submenuEl);
  }

  /**
   * Find the model selector trigger button using all known selectors.
   * Shared by `readTriggerPillLines`, `tryLockToModel`, and `tryLockToThinkingLevel`
   * so the fast-path check and the actual menu-opening code always agree on
   * whether the button exists (prevents unnecessary menu clicks when the button
   * is only discoverable via a selector that the fast-path didn't check — #756).
   */
  private findSelectorButton(): HTMLElement | null {
    return (
      document.querySelector<HTMLElement>('[data-test-id="bard-mode-menu-button"]') ??
      document.querySelector<HTMLElement>('button.input-area-switch') ??
      document.querySelector<HTMLElement>('.input-area-switch-label') ??
      document.querySelector<HTMLElement>('[data-test-id="model-selector"]') ??
      document.querySelector<HTMLElement>('button[aria-haspopup="menu"].mat-mdc-menu-trigger')
    );
  }

  /**
   * Read the trigger pill's visible text. The 2026 redesign renders the model name and
   * the optional thinking level on two separate lines (innerText newline-separated).
   * Returns the raw lines so callers can match against stored labels.
   */
  private readTriggerPillLines(): string[] {
    const btn = this.findSelectorButton();
    const text = btn?.innerText ?? btn?.textContent ?? '';
    return text
      .split(/\n+/)
      .map((s) => s.trim())
      .filter(Boolean);
  }

  private parseStoredThinkingLevel(value: unknown): DefaultThinkingLevel | null {
    if (typeof value !== 'object' || value === null) return null;
    const record = value as Record<string, unknown>;
    const index = typeof record.index === 'number' ? record.index : NaN;
    const label = typeof record.label === 'string' ? record.label.trim() : '';
    if (!Number.isFinite(index) || index < 0 || !label) return null;
    return { index, label };
  }

  private parseStoredDefaultModel(value: unknown): DefaultModelSetting | null {
    if (typeof value === 'string') {
      const name = value.trim();
      return name.length ? { kind: 'name', name } : null;
    }

    if (this.isStoredDefaultModelSetting(value)) {
      const id = value.id.trim();
      const name = value.name.trim();
      if (!id.length || !name.length) return null;
      return { kind: 'id', id, name };
    }

    return null;
  }

  private isStoredDefaultModelSetting(value: unknown): value is StoredDefaultModelSetting {
    if (typeof value !== 'object' || value === null) return false;
    const record = value as Record<string, unknown>;
    return typeof record.id === 'string' && typeof record.name === 'string';
  }
}

export default DefaultModelManager;
