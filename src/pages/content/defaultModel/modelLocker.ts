import { storageService } from '../../../core/services/StorageService';
import { StorageKeys } from '../../../core/types/common';
import './styles.css';

class DefaultModelManager {
  private static instance: DefaultModelManager;
  private observer: MutationObserver | null = null;
  private checkTimer: number | null = null;
  private isLocked = false;
  private currentDefaultModel: string | null = null;
  private initialized = false;
  private pendingMenuPanelInjections = new WeakSet<HTMLElement>();
  private menuPanelInjectAttempts = new WeakMap<HTMLElement, number>();
  private started = false;
  private popStateHandler: (() => void) | null = null;
  private originalPushState: History['pushState'] | null = null;
  private originalReplaceState: History['replaceState'] | null = null;

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
    const result = await storageService.get<string>(StorageKeys.DEFAULT_MODEL);
    this.currentDefaultModel = result.success ? result.data : null;
    this.initialized = true;

    this.initObserver();
    void this.checkAndLockModel();
    // Listen for URL changes (SPA navigation)
    this.popStateHandler = () => {
      void this.checkAndLockModel();
    };
    window.addEventListener('popstate', this.popStateHandler);
    // Hack for SPA: poll URL or hook into history
    if (!this.originalPushState) {
      this.originalPushState = history.pushState;
    }
    if (!this.originalReplaceState) {
      this.originalReplaceState = history.replaceState;
    }

    history.pushState = (...args: Parameters<History['pushState']>) => {
      this.originalPushState?.apply(history, args);
      void this.checkAndLockModel();
    };
    history.replaceState = (...args: Parameters<History['replaceState']>) => {
      this.originalReplaceState?.apply(history, args);
      void this.checkAndLockModel();
    };
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

    if (this.popStateHandler) {
      window.removeEventListener('popstate', this.popStateHandler);
      this.popStateHandler = null;
    }

    if (this.originalPushState) {
      history.pushState = this.originalPushState;
      this.originalPushState = null;
    }

    if (this.originalReplaceState) {
      history.replaceState = this.originalReplaceState;
      this.originalReplaceState = null;
    }

    this.pendingMenuPanelInjections = new WeakSet<HTMLElement>();
    this.menuPanelInjectAttempts = new WeakMap<HTMLElement, number>();
  }

  private initObserver() {
    // Observe only for the menu panel being added; Gemini UI triggers many mutations and
    // querying the entire document on every mutation can cause severe jank/crashes.
    this.observer = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        for (const node of Array.from(mutation.addedNodes)) {
          if (!(node instanceof HTMLElement)) continue;

          const menuPanel = node.matches('.mat-mdc-menu-panel[role="menu"]')
            ? node
            : node.querySelector<HTMLElement>('.mat-mdc-menu-panel[role="menu"]');

          if (menuPanel) {
            this.scheduleMenuPanelInjection(menuPanel);
          }
        }
      }
    });

    this.observer.observe(document.body, { childList: true, subtree: true });
  }

  private scheduleMenuPanelInjection(menuPanel: HTMLElement) {
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
    const items = menuPanel.querySelectorAll('[role="menuitemradio"]');
    if (!items.length) return false;

    // Use cached value efficiently
    if (!this.initialized) {
      const result = await storageService.get<string>(StorageKeys.DEFAULT_MODEL);
      this.currentDefaultModel = result.success ? result.data : null;
      this.initialized = true;
    }

    const currentDefault = this.currentDefaultModel;

    items.forEach((item) => {
      const modelName = this.getModelNameFromItem(item as HTMLElement);
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

      // Finding the correct container (title-and-description)
      const titleContainer = item.querySelector('.title-and-description');

      if (titleContainer) {
        const titleEl = titleContainer.querySelector('.mode-title');
        if (titleEl) {
          // Check if we already wrapped it
          let wrapper = titleContainer.querySelector('.gv-title-wrapper') as HTMLElement;

          if (!wrapper) {
            // Create wrapper
            wrapper = document.createElement('div');
            wrapper.className = 'gv-title-wrapper';
            wrapper.style.cssText = 'display: flex; align-items: center; width: 100%;';

            // Insert wrapper before title
            titleContainer.insertBefore(wrapper, titleEl);

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

    return true;
  }

  private getModelNameFromItem(item: HTMLElement): string {
    const titleEl = item.querySelector('.mode-title');
    return titleEl?.textContent?.trim() || '';
  }

  private updateStarState(item: HTMLElement, modelName: string, currentDefault: string | null) {
    const btn = item.querySelector('.gv-default-star-btn') as HTMLElement;
    if (!btn) return;

    // Ensure mousedown/click stops propagation (idempotent)
    if (!btn.hasAttribute('data-event-bound')) {
      btn.setAttribute('data-event-bound', 'true');
      btn.addEventListener('mousedown', (e) => e.stopPropagation());
      btn.addEventListener('click', (e) => e.stopPropagation());
    }

    const isDefault = currentDefault === modelName;
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

  private getStarIcon(filled: boolean): string {
    if (filled) {
      return `<svg viewBox="0 0 24 24"><path d="M12 17.27L18.18 21l-1.64-7.03L22 9.24l-7.19-.61L12 2 9.19 8.63 2 9.24l5.46 4.73L5.82 21z" fill="currentColor"></path></svg>`;
    } else {
      return `<svg viewBox="0 0 24 24"><path d="M12 17.27L18.18 21l-1.64-7.03L22 9.24l-7.19-.61L12 2 9.19 8.63 2 9.24l5.46 4.73L5.82 21z" fill="none" stroke="currentColor" stroke-width="1.5"></path></svg>`;
    }
  }

  private async handleStarClick(modelName: string, btn: HTMLElement) {
    // 1. Optimistic UI Update (Instant feedback)
    const isCurrentlyDefault = this.currentDefaultModel === modelName;
    const newDefault = isCurrentlyDefault ? null : modelName;

    // Update cache immediately
    this.currentDefaultModel = newDefault;

    // Update current button immediately
    const item = btn.closest('[role="menuitemradio"]');
    if (item instanceof HTMLElement) {
      this.updateStarState(item, modelName, newDefault);
    }

    // Show Toast immediately
    if (newDefault) {
      this.showToast(chrome.i18n.getMessage('defaultModelSet', [modelName]));
    } else {
      this.showToast(chrome.i18n.getMessage('defaultModelCleared'));
    }

    // Update other buttons (e.g. if switching from A to B)
    const menuPanel = document.querySelector('.mat-mdc-menu-panel');
    if (menuPanel) {
      // Re-run injection to update all other buttons based on new cache
      void this.injectStarButtons(menuPanel as HTMLElement);
    }

    // 2. Perform async storage operation in background
    if (isCurrentlyDefault) {
      await storageService.remove(StorageKeys.DEFAULT_MODEL);
    } else {
      await storageService.set(StorageKeys.DEFAULT_MODEL, modelName);
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

  // ==================== Auto Lock Logic ====================

  private async checkAndLockModel() {
    // Only lock on new conversation pages
    if (!this.isNewConversation()) return;

    const result = await storageService.get<string>(StorageKeys.DEFAULT_MODEL);
    const targetModel = result.success ? result.data : null;

    if (!targetModel) return;

    // Start checking loop
    let attempts = 0;
    const maxAttempts = 20;

    if (this.checkTimer) clearInterval(this.checkTimer);

    this.checkTimer = window.setInterval(async () => {
      attempts++;
      if (attempts > maxAttempts) {
        if (this.checkTimer) clearInterval(this.checkTimer);
        return;
      }

      await this.tryLockToModel(targetModel);
    }, 1000);
  }

  private isNewConversation() {
    const path = window.location.pathname;
    return path === '/app' || path === '/app/';
  }

  private async tryLockToModel(targetModel: string) {
    // Ported from https://github.com/urzeye/tampermonkey-scripts (Gemini Helper)
    const normalize = (s: string) => s.toLowerCase().trim();
    const target = normalize(targetModel);

    // 1. Find selector button
    const selectorBtn =
      document.querySelector('.input-area-switch-label') ||
      document.querySelector('[data-test-id="model-selector"]') ||
      document.querySelector('button[aria-haspopup="menu"].mat-mdc-menu-trigger'); // General fallback

    if (!selectorBtn) return;

    // 2. Check current model text
    const currentText = selectorBtn.textContent || '';
    if (normalize(currentText).includes(target)) {
      // Already correct
      if (this.checkTimer) clearInterval(this.checkTimer);
      return;
    }

    // 3. Switch model
    // This part is tricky because we need to open the menu and click safely
    if (this.isLocked) return; // Prevent concurrent locks
    this.isLocked = true;

    try {
      (selectorBtn as HTMLElement).click();

      // Wait for menu
      setTimeout(() => {
        const menuPanel = document.querySelector('.mat-mdc-menu-panel');
        if (menuPanel) {
          const items = menuPanel.querySelectorAll('[role="menuitemradio"]');
          let found = false;
          for (const item of Array.from(items)) {
            const text = (item as HTMLElement).textContent || '';
            if (normalize(text).includes(target)) {
              (item as HTMLElement).click();
              found = true;
              if (this.checkTimer) clearInterval(this.checkTimer);
              break;
            }
          }

          if (!found) {
            // Close menu if not found to avoid stuck menu
            document.body.click();
          }
        }
        this.isLocked = false;
      }, 500);
    } catch (e) {
      console.error('Auto lock failed', e);
      this.isLocked = false;
    }
  }
}

export default DefaultModelManager;
