/**
 * The AI Studio nav's width while expanded: stored in sync storage (with a
 * localStorage copy), applied to the nav, and changed by a drag handle.
 */
import browser from 'webextension-polyfill';

export const SIDEBAR_WIDTH_KEY = 'gvAIStudioSidebarWidth';
const MIN_WIDTH = 240;
const MAX_WIDTH = 600;
const NAV_SELECTOR = '.nav-content.v3-left-nav';

function isExtensionContextValid(): boolean {
  try {
    return !!(browser?.runtime?.id || chrome?.runtime?.id);
  } catch {
    return false;
  }
}

function inRange(width: unknown): width is number {
  return typeof width === 'number' && width >= MIN_WIDTH && width <= MAX_WIDTH;
}

function clamp(width: number): number {
  return Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, width));
}

function navContent(): HTMLElement | null {
  return document.querySelector<HTMLElement>(NAV_SELECTOR);
}

function setNavWidth(nav: HTMLElement, width: string): void {
  nav.style.width = width;
  nav.style.minWidth = width;
  nav.style.maxWidth = width;
  nav.style.flex = width ? `0 0 ${width}` : '';
}

export class SidebarWidth {
  // Wider than AI Studio's own default, so folder names truncate less.
  private width = 360;

  async load(): Promise<void> {
    try {
      if (isExtensionContextValid()) {
        const result = await browser.storage.sync.get({ [SIDEBAR_WIDTH_KEY]: 280 });
        if (inRange(result[SIDEBAR_WIDTH_KEY])) {
          this.width = result[SIDEBAR_WIDTH_KEY];
          return;
        }
      }
    } catch (error) {
      console.warn('[AIStudioFolderManager] Failed to load sidebar width from sync:', error);
    }
    try {
      const stored = localStorage.getItem(SIDEBAR_WIDTH_KEY);
      const width = stored ? parseInt(stored, 10) : NaN;
      if (inRange(width)) this.width = width;
    } catch (error) {
      console.error('[AIStudioFolderManager] Failed to load sidebar width:', error);
    }
  }

  /** A width another tab stored. */
  applyStoredWidth(value: unknown): void {
    if (typeof value !== 'number') return;
    this.width = clamp(Math.round(value));
    this.apply();
  }

  /** Sizes the nav while it is expanded (or when forced); a collapsed nav keeps its own width. */
  apply(force = false): void {
    const nav = navContent();
    if (!nav) return;
    setNavWidth(nav, nav.classList.contains('expanded') || force ? `${this.width}px` : '');
  }

  /** Adds the drag handle on the nav's right edge; returns the stop that removes it. */
  mountResizeHandle(): () => void {
    const nav = navContent();
    if (!nav) {
      console.warn('[AIStudioFolderManager] nav-content not found, resize handle not added');
      return () => {};
    }
    const handle = createHandle();
    const stopDrag = this.bindDrag(handle);
    nav.style.position = 'relative';
    nav.appendChild(handle);

    const updateVisibility = () => {
      handle.style.display = nav.classList.contains('expanded') ? 'block' : 'none';
    };
    const observer = new MutationObserver((mutations) => {
      if (!mutations.some((m) => m.type === 'attributes' && m.attributeName === 'class')) return;
      updateVisibility();
      this.apply();
    });
    try {
      observer.observe(nav, { attributes: true, attributeFilter: ['class'] });
    } catch (error) {
      console.error('[AIStudioFolderManager] Failed to observe nav-content:', error);
    }
    updateVisibility();

    return () => {
      observer.disconnect();
      stopDrag();
      handle.remove();
    };
  }

  private bindDrag(handle: HTMLElement): () => void {
    let dragging = false;
    let startX = 0;
    let startWidth = 0;
    const onMouseDown = (event: MouseEvent) => {
      dragging = true;
      startX = event.clientX;
      startWidth = this.width;
      event.preventDefault();
      event.stopPropagation();
      document.body.style.cursor = 'ew-resize';
      document.body.style.userSelect = 'none';
    };
    const onMouseMove = (event: MouseEvent) => {
      if (!dragging) return;
      this.width = clamp(startWidth + event.clientX - startX);
      this.apply(true);
    };
    const onMouseUp = () => {
      if (!dragging) return;
      dragging = false;
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
      void this.save();
    };
    handle.addEventListener('mousedown', onMouseDown);
    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);
    return () => {
      handle.removeEventListener('mousedown', onMouseDown);
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);
    };
  }

  private async save(): Promise<void> {
    try {
      localStorage.setItem(SIDEBAR_WIDTH_KEY, String(this.width));
    } catch (error) {
      console.error('[AIStudioFolderManager] Failed to save to localStorage:', error);
    }
    if (!isExtensionContextValid()) return;
    try {
      await browser.storage.sync.set({ [SIDEBAR_WIDTH_KEY]: this.width });
    } catch (error) {
      // An invalidated context (a dev reload) fails every write; stay quiet about it.
      if (error instanceof Error && !error.message.includes('Extension context invalidated')) {
        console.error('[AIStudioFolderManager] Failed to save sidebar width:', error);
      }
    }
  }
}

function createHandle(): HTMLElement {
  const handle = document.createElement('div');
  handle.className = 'gv-sidebar-resize-handle';
  handle.title = 'Drag to resize sidebar';
  Object.assign(handle.style, {
    position: 'absolute',
    top: '0',
    right: '-4px',
    width: '8px',
    height: '100%',
    cursor: 'ew-resize',
    zIndex: '10000',
    backgroundColor: 'transparent',
    transition: 'background-color 0.2s',
    pointerEvents: 'auto',
  });
  handle.addEventListener('mouseenter', () => {
    handle.style.backgroundColor = 'rgba(66, 133, 244, 0.5)';
  });
  handle.addEventListener('mouseleave', () => {
    handle.style.backgroundColor = 'transparent';
  });
  return handle;
}
