import { getTranslationSyncUnsafe as t } from '@/utils/i18n';

const ICON_CLASS = 'mat-icon notranslate google-symbols mat-ligature-font mat-icon-no-color';

/** The multi-select toolbar and the listeners its drag handle holds. */
export type SelectionToolbar = { indicator: HTMLElement; cleanup: () => void };

export type SelectionToolbarIconName = 'check_circle' | 'delete' | 'close';

/** Draws one toolbar icon; each site draws them in its own icon style. */
export type SelectionToolbarIcon = (name: SelectionToolbarIconName) => Element;

/** Gemini's Google Symbols ligature. */
export function ligatureIcon(name: SelectionToolbarIconName): Element {
  const icon = document.createElement('mat-icon');
  icon.className = ICON_CLASS;
  icon.setAttribute('role', 'img');
  icon.setAttribute('aria-hidden', 'true');
  icon.textContent = name;
  return icon;
}

export type SelectionToolbarOptions = {
  /** The element that holds the toolbar and carries the mode class while selecting. */
  host: () => HTMLElement | null | undefined;
  /**
   * `floating`: a draggable pill fixed over the page, shown in a body-level
   * host while `host` is out of the page (Gemini). `inline`: in `host`'s own
   * flow, and nowhere while `host` is out of the page.
   */
  placement: 'floating' | 'inline';
  icon: SelectionToolbarIcon;
};

export type SelectionToolbarState = {
  active: boolean;
  count: number;
  /** Where multi-select began: folder rows remove from the folder, native rows delete chats. */
  source: 'folder' | 'native' | null;
  /** `anchor` is where the delete button sits, for a confirm beside it. */
  onDelete: (anchor: HTMLElement) => void;
  onExit: () => void;
};

/** Lets the toolbar be dragged anywhere on the page by its body (not its buttons). */
function makeToolbarDraggable(indicator: HTMLElement): () => void {
  let isDragging = false;
  let initialX = 0;
  let initialY = 0;
  let xOffset = 0;
  let yOffset = 0;

  // Document-level mousemove/mouseup are attached only while a drag is in
  // progress (mousedown → mouseup). Attaching them permanently leaked one
  // listener pair per floating-mode/sidebar-mode switch, because that switch
  // path rebuilds the indicator without running the cleanup task list.
  const drag = (e: MouseEvent) => {
    if (!isDragging) return;
    e.preventDefault();
    xOffset = e.clientX - initialX;
    yOffset = e.clientY - initialY;
    indicator.style.transform = `translate3d(calc(-50% + ${xOffset}px), ${yOffset}px, 0)`;
  };

  const dragEnd = () => {
    isDragging = false;
    indicator.style.cursor = 'move';
    document.removeEventListener('mousemove', drag);
    document.removeEventListener('mouseup', dragEnd);
  };

  const dragStart = (e: MouseEvent) => {
    // Ignore if clicking buttons inside the indicator
    if ((e.target as HTMLElement).closest('button')) return;
    initialX = e.clientX - xOffset;
    initialY = e.clientY - yOffset;
    if (e.target === indicator || indicator.contains(e.target as Node)) {
      isDragging = true;
      indicator.style.cursor = 'grabbing';
      document.addEventListener('mousemove', drag);
      document.addEventListener('mouseup', dragEnd);
    }
  };

  indicator.addEventListener('mousedown', dragStart);
  // If the indicator is torn down mid-drag, the document-level listeners must
  // not outlive it. removeEventListener is idempotent, so this is safe even
  // when no drag is active.
  return () => {
    indicator.removeEventListener('mousedown', dragStart);
    document.removeEventListener('mousemove', drag);
    document.removeEventListener('mouseup', dragEnd);
  };
}

function createToolbarContent(icon: Element): HTMLElement {
  const content = document.createElement('div');
  content.className = 'gv-multi-select-indicator-content';
  // Ensure content (text/icon) doesn't capture drag events aggressively
  content.style.pointerEvents = 'none';

  const text = document.createElement('span');
  text.className = 'gv-multi-select-indicator-text';
  text.textContent = '0 selected';
  text.dataset.selectionCount = 'true';

  content.append(icon, text);
  return content;
}

function createSelectionToolbar({
  placement,
  icon,
}: Pick<SelectionToolbarOptions, 'placement' | 'icon'>): SelectionToolbar {
  const indicator = document.createElement('div');
  indicator.className = 'gv-multi-select-indicator';
  indicator.dataset.multiSelectIndicator = 'true';
  indicator.setAttribute('role', 'toolbar');

  const actionsContainer = document.createElement('div');
  actionsContainer.className = 'gv-multi-select-actions';
  actionsContainer.dataset.multiSelectActions = 'true';
  if (placement === 'inline') {
    indicator.append(createToolbarContent(icon('check_circle')), actionsContainer);
    return { indicator, cleanup: () => {} };
  }

  Object.assign(indicator.style, {
    position: 'fixed',
    bottom: '24px',
    left: '50%',
    transform: 'translateX(-50%)',
    zIndex: '9999', // Ensure it's above everything
    boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06)',
    cursor: 'move', // Indicate it's draggable
    transition: 'opacity 0.2s ease, transform 0.1s ease', // Only animate non-position props for performance
    // Prevent text selection while dragging
    userSelect: 'none',
    // Ensure it has a background so IT covers content behind it
    backgroundColor: 'var(--gem-sys-color-surface-container, #f0f4f9)', // Fallback color
    borderRadius: '24px',
    padding: '8px 16px',
    alignItems: 'center',
    gap: '12px',
    border: '1px solid var(--gem-sys-color-outline-variant, rgba(0,0,0,0.1))',
  });

  const cleanup = makeToolbarDraggable(indicator);
  indicator.appendChild(createToolbarContent(icon('check_circle')));
  // Re-enable pointer events for buttons
  actionsContainer.style.pointerEvents = 'auto';
  indicator.appendChild(actionsContainer);

  return { indicator, cleanup };
}

/**
 * Places the toolbar: in its host while that is mounted, otherwise (floating
 * placement only) in a floating host on the page. Owns the drag listeners of
 * every toolbar it made.
 */
export class SelectionToolbarHost {
  private floatingHost: HTMLElement | null = null;
  private readonly cleanups = new Map<HTMLElement, () => void>();

  constructor(private readonly options: SelectionToolbarOptions) {}

  /** A toolbar for the host to hold, drawn in this site's placement and icons. */
  createIndicator(): HTMLElement {
    const { indicator, cleanup } = createSelectionToolbar(this.options);
    this.cleanups.set(indicator, cleanup);
    return indicator;
  }

  /** Remove listeners attached to the old toolbars during a sidebar remount. */
  unmount(): void {
    for (const cleanup of this.cleanups.values()) cleanup();
    this.cleanups.clear();
  }

  removeFloating(): void {
    for (const [indicator, cleanup] of this.cleanups) {
      if (this.floatingHost?.contains(indicator)) {
        cleanup();
        this.cleanups.delete(indicator);
      }
    }
    this.floatingHost?.remove();
    this.floatingHost = null;
  }

  containsFloating(target: Node): boolean {
    return !!this.floatingHost?.contains(target);
  }

  /** Shows the mode, the selected count and the actions for `state`. */
  render(state: SelectionToolbarState): void {
    renderSelectionToolbar(this.find(state.active), state, this.options.icon);
  }

  /** The host showing the toolbar; with `create`, a floating one is made when none is shown. */
  private find(create: boolean): HTMLElement | null {
    const host = this.options.host();
    if (host?.isConnected) return host;
    if (this.options.placement === 'inline') return null;
    if (create && !this.floatingHost?.isConnected) {
      const host = document.createElement('div');
      host.className = 'gv-folder-container gv-multi-select-floating-host';
      host.dataset.multiSelectFloatingHost = 'true';
      host.appendChild(this.createIndicator());
      document.body.appendChild(host);
      this.floatingHost = host;
    }
    return this.floatingHost?.isConnected ? this.floatingHost : null;
  }
}

function actionButton(modifier: string, icon: Element, titleKey: string, onClick: () => void) {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = `gv-multi-select-action-btn ${modifier}`;
  button.append(icon);
  button.title = t(titleKey);
  button.setAttribute('aria-label', t(titleKey));
  button.addEventListener('click', onClick);
  return button;
}

function renderSelectionToolbar(
  host: HTMLElement | null,
  state: SelectionToolbarState,
  icon: SelectionToolbarIcon,
) {
  host?.classList.toggle('gv-multi-select-mode', state.active);

  const countElement = host?.querySelector('[data-selection-count="true"]');
  if (countElement) {
    countElement.textContent = t('folder_multi_select_count').replace(
      '{count}',
      String(state.count),
    );
  }

  const actionsContainer = host?.querySelector<HTMLElement>('[data-multi-select-actions="true"]');
  if (!actionsContainer) return;
  actionsContainer.innerHTML = '';
  if (!state.active) return;
  // Folder multi-select removes from the folder; native multi-select deletes from Gemini.
  if (state.source) {
    actionsContainer.appendChild(
      actionButton(
        'gv-multi-select-delete-btn',
        icon('delete'),
        'batch_delete_button',
        // The row outlives its buttons, which every count change redraws.
        () => state.onDelete(actionsContainer),
      ),
    );
  }
  actionsContainer.appendChild(
    actionButton(
      'gv-multi-select-exit-btn',
      icon('close'),
      'folder_multi_select_exit',
      state.onExit,
    ),
  );
}

/** Shakes a row that cannot join the selection (a chat from another folder). */
export function flashInvalidSelection(element: HTMLElement): void {
  // Remove existing class (if any) to allow animation restart on rapid clicks
  element.classList.remove('gv-invalid-selection');
  // Force reflow to ensure animation restarts (see: CSS Triggers)
  void element.offsetWidth;
  element.classList.add('gv-invalid-selection');
  element.addEventListener(
    'animationend',
    () => {
      element.classList.remove('gv-invalid-selection');
    },
    { once: true },
  );
  // Haptic feedback on mobile devices: two short vibrations
  if ('vibrate' in navigator) {
    navigator.vibrate([30, 20, 30]);
  }
}
