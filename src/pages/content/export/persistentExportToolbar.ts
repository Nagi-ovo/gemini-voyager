// Persistent top-right export toolbar.
// Mounted as a fallback when Gemini's logo (the usual injection point for the
// inline export dropdown) is absent — e.g. after the lr26 UI refresh removed
// [data-test-id="logo"]. Calls back into showExportDialog when clicked.

export type PersistentExportToolbarOptions = {
  label: string;
  tooltip: string;
  onClick: () => void;
};

const TOOLBAR_CLASS = 'gv-persistent-export-toolbar';
const BUTTON_CLASS = 'gv-persistent-export-btn';
const ICON_CLASS = 'gv-persistent-export-icon';
const LABEL_CLASS = 'gv-persistent-export-label';

function buildToolbarDom(options: PersistentExportToolbarOptions): {
  root: HTMLDivElement;
  button: HTMLButtonElement;
  labelEl: HTMLSpanElement;
} {
  const root = document.createElement('div');
  root.className = TOOLBAR_CLASS;
  root.setAttribute('data-gv-component', 'persistent-export-toolbar');

  const button = document.createElement('button');
  button.type = 'button';
  button.className = BUTTON_CLASS;
  button.title = options.tooltip;
  button.setAttribute('aria-label', options.tooltip);

  const icon = document.createElement('span');
  icon.className = ICON_CLASS;
  icon.setAttribute('aria-hidden', 'true');

  const labelEl = document.createElement('span');
  labelEl.className = LABEL_CLASS;
  labelEl.textContent = options.label;

  button.appendChild(icon);
  button.appendChild(labelEl);
  root.appendChild(button);

  return { root, button, labelEl };
}

export type PersistentExportToolbarHandle = {
  root: HTMLDivElement;
  button: HTMLButtonElement;
  setText(label: string, tooltip: string): void;
  remove(): void;
};

export function mountPersistentExportToolbar(
  options: PersistentExportToolbarOptions,
): PersistentExportToolbarHandle {
  const existing = document.querySelector(`.${TOOLBAR_CLASS}`) as HTMLDivElement | null;
  if (existing) {
    const button = existing.querySelector(`.${BUTTON_CLASS}`) as HTMLButtonElement;
    const labelEl = existing.querySelector(`.${LABEL_CLASS}`) as HTMLSpanElement;
    button.title = options.tooltip;
    button.setAttribute('aria-label', options.tooltip);
    if (labelEl) labelEl.textContent = options.label;
    return {
      root: existing,
      button,
      setText(label, tooltip) {
        button.title = tooltip;
        button.setAttribute('aria-label', tooltip);
        if (labelEl) labelEl.textContent = label;
      },
      remove() {
        try {
          existing.remove();
        } catch {}
      },
    };
  }

  const { root, button, labelEl } = buildToolbarDom(options);

  const swallow = (e: Event) => {
    try {
      e.stopPropagation();
    } catch {}
  };
  ['pointerdown', 'mousedown', 'pointerup', 'mouseup'].forEach((type) => {
    button.addEventListener(type, swallow, true);
  });
  button.addEventListener('click', (ev) => {
    swallow(ev);
    try {
      options.onClick();
    } catch (err) {
      try {
        console.error('[Gemini Voyager] Persistent export toolbar click failed:', err);
      } catch {}
    }
  });

  document.body.appendChild(root);

  return {
    root,
    button,
    setText(label, tooltip) {
      button.title = tooltip;
      button.setAttribute('aria-label', tooltip);
      labelEl.textContent = label;
    },
    remove() {
      try {
        root.remove();
      } catch {}
    },
  };
}

export function isPersistentExportToolbarMounted(): boolean {
  return !!document.querySelector(`.${TOOLBAR_CLASS}`);
}
