const STYLE_ID = 'gemini-voyager-quote-reply-style';
const HIGHLIGHT_PREVIEW_CLASS = 'gv-highlight-selection-preview-active';
const HIGHLIGHT_PREVIEW_COLOR_PROPERTY = '--gv-highlight-selection-preview-color';

/** A style node owned by one toolbar host; its stop removes this node, never a lookup by id. */
export function createSelectionToolbarStyle(): HTMLStyleElement {
  const style = document.createElement('style');
  style.id = STYLE_ID;
  style.textContent = `
    .gv-selection-toolbar {
      position: fixed;
      z-index: 9999;
      display: flex;
      align-items: center;
      gap: 2px;
      padding: 3px;
      background-color: #1e1e1e;
      color: #fff;
      border-radius: 8px;
      box-shadow: 0 4px 12px rgba(0,0,0,0.15);
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
      font-size: 13px;
      font-weight: 500;
      border: 1px solid rgba(255,255,255,0.1);
      opacity: 1;
      pointer-events: auto;
    }
    .gv-selection-action {
      display: flex;
      align-items: center;
      gap: 6px;
      min-height: 30px;
      padding: 5px 8px;
      border: 0;
      border-radius: 6px;
      background: transparent;
      color: inherit;
      cursor: pointer;
      font: inherit;
    }
    .gv-selection-action:hover,
    .gv-selection-action:focus-visible {
      background-color: #2d2d2d;
      outline: none;
    }
    .gv-selection-action svg {
      width: 14px;
      height: 14px;
      opacity: 0.9;
    }
    .gv-highlight-color-trigger {
      box-sizing: border-box;
      width: 22px;
      height: 22px;
      margin: 0 4px 0 1px;
      padding: 0;
      border: 2px solid rgba(255,255,255,0.72);
      border-radius: 50%;
      box-shadow: 0 0 0 1px rgba(0,0,0,0.34);
      cursor: pointer;
    }
    .gv-highlight-color-trigger:hover,
    .gv-highlight-color-trigger:focus-visible {
      outline: 2px solid #8ab4f8;
      outline-offset: 2px;
    }
    .gv-highlight-color-palette {
      position: fixed;
      display: flex;
      gap: 6px;
      padding: 7px;
      border: 1px solid rgba(255,255,255,0.12);
      border-radius: 10px;
      background: #1e1e1e;
      box-shadow: 0 6px 18px rgba(0,0,0,0.24);
    }
    .gv-highlight-color-option {
      position: relative;
      width: 24px;
      height: 24px;
      padding: 0;
      border: 2px solid transparent;
      border-radius: 50%;
      cursor: pointer;
    }
    .gv-highlight-color-option[aria-pressed="true"] {
      border-color: rgba(255, 255, 255, 0.94);
      outline: 2px solid #8ab4f8;
      outline-offset: 1px;
      box-shadow: 0 2px 8px rgba(138, 180, 248, 0.34);
    }
    .gv-highlight-color-option[aria-pressed="true"]::after {
      position: absolute;
      inset: 0;
      display: grid;
      place-items: center;
      color: #fff;
      content: "✓";
      font-size: 13px;
      font-weight: 800;
      line-height: 1;
      text-shadow: 0 1px 3px rgba(0, 0, 0, 0.78);
    }
    .gv-highlight-color-edit {
      position: relative;
      display: grid;
      width: 26px;
      height: 26px;
      margin-inline-start: 2px;
      padding: 0;
      place-items: center;
      border: 1px solid rgba(255, 255, 255, 0.2);
      border-radius: 8px;
      background: rgba(255, 255, 255, 0.08);
      color: inherit;
      cursor: pointer;
      overflow: hidden;
    }
    .gv-highlight-color-edit:hover,
    .gv-highlight-color-edit:focus-visible {
      border-color: #8ab4f8;
      background: rgba(138, 180, 248, 0.16);
      outline: none;
    }
    .gv-highlight-custom-color {
      position: absolute;
      inset: 0;
      width: 100%;
      height: 100%;
      opacity: 0;
      cursor: pointer;
    }
    html.${HIGHLIGHT_PREVIEW_CLASS}::selection,
    html.${HIGHLIGHT_PREVIEW_CLASS} *::selection {
      background-color: var(${HIGHLIGHT_PREVIEW_COLOR_PROPERTY}) !important;
      color: inherit !important;
    }
    .gv-selection-toolbar.gv-hidden {
      opacity: 0;
      pointer-events: none;
      visibility: hidden;
    }
    .gv-selection-action.gv-hidden { display: none; }
    .gv-highlight-color-trigger.gv-hidden,
    .gv-highlight-color-palette.gv-hidden { display: none; }
    /* Light mode support */
    @media (prefers-color-scheme: light) {
      .gv-selection-toolbar {
        background-color: #fff;
        color: #1f1f1f;
        border: 1px solid rgba(0,0,0,0.08);
      }
      .gv-selection-action:hover,
      .gv-selection-action:focus-visible {
        background-color: #f5f5f5;
      }
      .gv-highlight-color-trigger {
        border-color: rgba(255,255,255,0.92);
        box-shadow: 0 0 0 1px rgba(0,0,0,0.24);
      }
      .gv-highlight-color-palette {
        border-color: rgba(0,0,0,0.10);
        background: #fff;
      }
      .gv-highlight-color-edit {
        border-color: rgba(0, 0, 0, 0.14);
        background: rgba(0, 0, 0, 0.04);
      }
    }
    /* Check for specific theme attributes if Gemini uses them */
    .theme-host.light-theme .gv-selection-toolbar,
    body[data-theme="light"] .gv-selection-toolbar {
      background-color: #fff;
      color: #1f1f1f;
      border: 1px solid rgba(0,0,0,0.08);
    }
    .theme-host.light-theme .gv-selection-action:hover,
    .theme-host.light-theme .gv-selection-action:focus-visible,
    body[data-theme="light"] .gv-selection-action:hover,
    body[data-theme="light"] .gv-selection-action:focus-visible {
       background-color: #f5f5f5;
    }
    .theme-host.light-theme .gv-highlight-color-palette,
    body[data-theme="light"] .gv-highlight-color-palette {
      border-color: rgba(0,0,0,0.10);
      background: #fff;
    }
    .theme-host.light-theme .gv-highlight-color-edit,
    body[data-theme="light"] .gv-highlight-color-edit {
      border-color: rgba(0, 0, 0, 0.14);
      background: rgba(0, 0, 0, 0.04);
    }
    .theme-host.dark-theme .gv-selection-toolbar,
    body[data-theme="dark"] .gv-selection-toolbar {
      background-color: #1e1e1e;
      color: #fff;
      border-color: rgba(255,255,255,0.1);
    }
    .theme-host.dark-theme .gv-selection-action:hover,
    .theme-host.dark-theme .gv-selection-action:focus-visible,
    body[data-theme="dark"] .gv-selection-action:hover,
    body[data-theme="dark"] .gv-selection-action:focus-visible {
      background-color: #2d2d2d;
    }
    body.gv-rtl .gv-selection-toolbar { flex-direction: row-reverse; }
  `;
  return style;
}
