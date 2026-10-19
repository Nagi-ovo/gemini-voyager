import { FLOATING_PANEL_CLASS } from './floatingTree/shared';

/**
 * Gemini's sidebar keeps the floating panel's tree, laid into the nav. Host
 * rules are `!important` to beat page rules that match the host, and
 * `:host([data-gv-scheme])` matches the panel's scheme blocks. Text size and
 * row padding follow the folder font-size and spacing settings, which set
 * custom properties on the light-DOM container; those inherit into the tree.
 *
 * Rows look as the sidebar's own folder list did before it moved onto the
 * shared tree: its `--folder-*` colours (set per scheme on the page root, and
 * inherited here), 8px-rounded rows, the gold edge of a starred chat, the green
 * one of the open chat, and nesting as the old list's body: each level
 * one `--gv-sidebar-tree-nest` in, its guide under the folder's chevron. Rows
 * carry their folders' offset (`--gv-tree-guides`) as a margin.
 */
export const SIDEBAR_TREE_CSS = `
:host,
:host([data-gv-scheme]) {
  position: relative !important;
  z-index: auto !important;
  display: block !important;
  min-width: 0 !important;
  min-height: 0 !important;
  max-width: none !important;
  max-height: none !important;
  resize: none !important;
  background: transparent !important;
  color: var(--gv-sidebar-tree-text) !important;
  border: 0 !important;
  border-radius: 0 !important;
  box-shadow: none !important;
  overflow: visible !important;
  font-size: 14px !important;
}

:host {
  --gv-sidebar-tree-text: var(--folder-text, #1f2937);
  --gv-sidebar-tree-icon: var(--folder-icon-color, #6b7280);
  --gv-sidebar-tree-hover: var(--folder-hover-bg, #f3f4f6);
  --gv-sidebar-tree-border: var(--folder-border, #e5e7eb);
  --gv-sidebar-tree-field: var(--folder-bg, #ffffff);
  --gv-sidebar-tree-selected-glow: var(--folder-selected-glow, rgba(16, 185, 129, 0.12));
  --gv-sidebar-tree-selected-accent: var(--folder-selected-accent, #34d399);
  /* 21px at the default indent, 53px at max. */
  --gv-sidebar-tree-nest: calc(21px + (var(--gv-folder-indent, -8px) + 8px) * 0.8);
}

:host([data-gv-scheme='dark']) {
  --gv-sidebar-tree-text: var(--folder-text, #e5e7eb);
  --gv-sidebar-tree-icon: var(--folder-icon-color, #9ca3af);
  --gv-sidebar-tree-hover: var(--folder-hover-bg, #374151);
  --gv-sidebar-tree-border: var(--folder-border, #374151);
  --gv-sidebar-tree-field: var(--folder-bg, #1f2937);
  --gv-sidebar-tree-selected-glow: var(--folder-selected-glow, rgba(16, 185, 129, 0.1));
  --gv-sidebar-tree-selected-accent: var(--folder-selected-accent, #6ee7b7);
}

.${FLOATING_PANEL_CLASS}__body {
  overflow: visible;
  padding: 0 0 4px;
}

/* The spacing setting's gap, inside the row shell so the virtualizer measures it. */
.${FLOATING_PANEL_CLASS}__tree-row {
  padding-block-end: var(--gv-folder-row-gap, 2px);
}

/* The old list's nesting guide: a border-coloured line under each enclosing chevron.
   Specific enough to beat the tree sheet's guides, which the tree adds after this one.
   It ends 1px past the last line, or at a 1.25 pixel ratio the next one shows through the icons. */
:host([data-gv-scheme]) .${FLOATING_PANEL_CLASS}__tree .${FLOATING_PANEL_CLASS}__tree-row[data-guides]::before {
  left: 17.5px;
  width: calc((var(--gv-tree-guides, 1) - 1) * var(--gv-sidebar-tree-nest) + 1px);
  background-image: repeating-linear-gradient(
    to right,
    var(--gv-sidebar-tree-border) 0 1px,
    transparent 1px var(--gv-sidebar-tree-nest)
  );
}

:host([data-gv-scheme][data-gv-rtl]) .${FLOATING_PANEL_CLASS}__tree .${FLOATING_PANEL_CLASS}__tree-row[data-guides]::before {
  left: auto;
  right: 17.5px;
  background-image: repeating-linear-gradient(
    to left,
    var(--gv-sidebar-tree-border) 0 1px,
    transparent 1px var(--gv-sidebar-tree-nest)
  );
}

/* Rows: the inline indent of the shared tree gives way to the old list's offsets. */
:host([data-gv-scheme]) .${FLOATING_PANEL_CLASS}__folder-header,
:host([data-gv-scheme]) .${FLOATING_PANEL_CLASS}__conv {
  width: auto;
  min-height: 0;
  margin-inline-start: calc(var(--gv-tree-guides, 0) * var(--gv-sidebar-tree-nest));
  padding-block: var(--gv-folder-row-padding, 5px);
  border-radius: 8px;
  color: var(--gv-sidebar-tree-text);
  transition: background-color 0.2s;
}

:host([data-gv-scheme]) .${FLOATING_PANEL_CLASS}__folder-header {
  gap: 8px;
  padding-inline-start: 8px !important;
  padding-inline-end: 12px;
}

:host([data-gv-scheme]) .${FLOATING_PANEL_CLASS}__conv {
  position: relative;
  gap: 4px;
  /* Under the folder icon at the default indent. */
  padding-inline-start: 19px !important;
  padding-inline-end: 6px;
}

:host([data-gv-scheme]) .${FLOATING_PANEL_CLASS}__tree-row:not([data-guides]) .${FLOATING_PANEL_CLASS}__conv {
  padding-inline-start: 24px !important;
}

:host([data-gv-scheme]) .${FLOATING_PANEL_CLASS}__folder-header:hover,
:host([data-gv-scheme]) .${FLOATING_PANEL_CLASS}__conv:hover {
  background: var(--gv-sidebar-tree-hover);
}

/* A starred chat: a faint gold wash and a gold edge. */
:host([data-gv-scheme]) .${FLOATING_PANEL_CLASS}__conv--starred {
  background: linear-gradient(to right, rgba(251, 191, 36, 0.08) 0%, transparent 100%);
}

:host([data-gv-scheme]) .${FLOATING_PANEL_CLASS}__conv--starred::before,
:host([data-gv-scheme]) .${FLOATING_PANEL_CLASS}__conv--active::before {
  content: '';
  position: absolute;
  inset-inline-start: 0;
  top: 50%;
  transform: translateY(-50%);
  width: 3px;
  height: 20px;
  border-radius: 0 2px 2px 0;
  background: linear-gradient(to bottom, #fbbf24, #f59e0b);
  opacity: 0.9;
  pointer-events: none;
}

/* The open chat: a green wash and edge, over a star's gold. */
:host([data-gv-scheme]) .${FLOATING_PANEL_CLASS}__conv--active,
:host([data-gv-scheme]) .${FLOATING_PANEL_CLASS}__conv--active:hover {
  background: linear-gradient(
    to right,
    var(--gv-sidebar-tree-selected-glow) 0%,
    transparent 100%
  );
  color: var(--gv-sidebar-tree-text);
  border-radius: 10px;
}

:host([data-gv-scheme]) .${FLOATING_PANEL_CLASS}__conv--active::before {
  height: 60%;
  background: var(--gv-sidebar-tree-selected-accent);
}

:host([data-gv-rtl]) .${FLOATING_PANEL_CLASS}__conv--starred::before,
:host([data-gv-rtl]) .${FLOATING_PANEL_CLASS}__conv--active::before {
  border-radius: 2px 0 0 2px;
}

.${FLOATING_PANEL_CLASS}__folder-name,
.${FLOATING_PANEL_CLASS}__conv-title {
  font-size: var(--gv-folder-item-font-size, 14px);
  line-height: var(--gv-folder-item-line-height, 20px);
  font-weight: 500;
  color: var(--gv-sidebar-tree-text);
}

.${FLOATING_PANEL_CLASS}__conv-title {
  padding: 0;
}

.${FLOATING_PANEL_CLASS}__folder-name {
  user-select: none;
}

.${FLOATING_PANEL_CLASS}__conv-icon {
  width: 16px;
  height: 16px;
  /* No block margin: in this align-items: center row a top margin shifts the glyph onto the text baseline. */
  margin: 0 -2px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
  color: var(--gv-sidebar-tree-icon);
  font-size: 12px;
  opacity: 1;
}

/* Controls: the old list's 20px chevron and folder icon, 24px buttons with 18px icons. */
:host([data-gv-scheme]) .${FLOATING_PANEL_CLASS}__caret {
  width: 20px;
  height: 20px;
  min-width: 20px;
  padding: 0;
  border-radius: 4px;
  color: var(--gv-sidebar-tree-icon);
  opacity: 1;
}

:host([data-gv-scheme]) .${FLOATING_PANEL_CLASS}__caret:hover {
  background: transparent;
  color: var(--gv-sidebar-tree-icon);
}

:host([data-gv-scheme]) .${FLOATING_PANEL_CLASS}__caret svg {
  width: 18px;
  height: 18px;
}

:host([data-gv-scheme]) .${FLOATING_PANEL_CLASS}__folder-icon {
  width: 20px;
  height: 20px;
  color: var(--gv-sidebar-tree-icon);
  transition: color 0.2s ease;
}

:host([data-gv-scheme]) .${FLOATING_PANEL_CLASS}__folder-header .${FLOATING_PANEL_CLASS}__icon-button,
:host([data-gv-scheme]) .${FLOATING_PANEL_CLASS}__conv .${FLOATING_PANEL_CLASS}__icon-button,
:host([data-gv-scheme]) .${FLOATING_PANEL_CLASS}__inline-form .${FLOATING_PANEL_CLASS}__icon-button {
  width: 24px;
  height: 24px;
  min-width: 24px;
  padding: 0;
  border-radius: 4px;
  color: var(--gv-sidebar-tree-icon);
  transition:
    opacity 0.2s,
    background-color 0.2s,
    color 0.2s;
}

:host([data-gv-scheme]) .${FLOATING_PANEL_CLASS}__tree .${FLOATING_PANEL_CLASS}__icon-button svg {
  width: 18px;
  height: 18px;
}

:host([data-gv-scheme]) .${FLOATING_PANEL_CLASS}__folder-header .${FLOATING_PANEL_CLASS}__icon-button {
  opacity: 0;
}

:host([data-gv-scheme]) .${FLOATING_PANEL_CLASS}__icon-button--pin {
  margin-inline-start: auto;
  margin-inline-end: 4px;
}

:host([data-gv-scheme]) .${FLOATING_PANEL_CLASS}__folder-header:hover .${FLOATING_PANEL_CLASS}__icon-button,
:host([data-gv-scheme]) .${FLOATING_PANEL_CLASS}__folder-header:focus-within .${FLOATING_PANEL_CLASS}__icon-button,
:host([data-gv-scheme]) .${FLOATING_PANEL_CLASS}__folder-header[data-gv-confirm-anchor] .${FLOATING_PANEL_CLASS}__icon-button {
  opacity: 1;
}

:host([data-gv-scheme]) .${FLOATING_PANEL_CLASS}__folder-header .${FLOATING_PANEL_CLASS}__icon-button:hover,
:host([data-gv-scheme]) .${FLOATING_PANEL_CLASS}__folder-header .${FLOATING_PANEL_CLASS}__icon-button:focus-visible {
  background: var(--gv-sidebar-tree-hover);
  color: var(--gv-sidebar-tree-icon);
}

/* A chat's star and remove buttons: grey until hovered; a set star stays gold. */
:host([data-gv-scheme]) .${FLOATING_PANEL_CLASS}__conv .${FLOATING_PANEL_CLASS}__icon-button {
  border-radius: 6px;
  color: #9ca3af;
  transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
}

:host([data-gv-scheme]) .${FLOATING_PANEL_CLASS}__conv .${FLOATING_PANEL_CLASS}__icon-button--star.${FLOATING_PANEL_CLASS}__icon-button--active {
  opacity: 1;
  color: #fbbf24;
}

:host([data-gv-scheme]) .${FLOATING_PANEL_CLASS}__conv .${FLOATING_PANEL_CLASS}__icon-button--star:hover,
:host([data-gv-scheme]) .${FLOATING_PANEL_CLASS}__conv .${FLOATING_PANEL_CLASS}__icon-button--star:focus-visible {
  background: rgba(251, 191, 36, 0.12);
  color: #fbbf24;
  transform: scale(1.05);
}

:host([data-gv-scheme]) .${FLOATING_PANEL_CLASS}__conv .${FLOATING_PANEL_CLASS}__icon-button--star.${FLOATING_PANEL_CLASS}__icon-button--active:hover {
  background: rgba(251, 191, 36, 0.15);
}

:host([data-gv-scheme]) .${FLOATING_PANEL_CLASS}__conv .${FLOATING_PANEL_CLASS}__icon-button--remove:hover,
:host([data-gv-scheme]) .${FLOATING_PANEL_CLASS}__conv .${FLOATING_PANEL_CLASS}__icon-button--remove:focus-visible {
  background: rgba(239, 68, 68, 0.12);
  color: #ef4444;
  transform: scale(1.05);
}

:host([data-gv-scheme]) .${FLOATING_PANEL_CLASS}__conv .${FLOATING_PANEL_CLASS}__icon-button svg {
  transition: transform 0.2s;
}

:host([data-gv-scheme]) .${FLOATING_PANEL_CLASS}__conv .${FLOATING_PANEL_CLASS}__icon-button:active svg {
  transform: scale(0.9);
}

/* A new subfolder's name field, where the subfolder's row will be. */
:host([data-gv-scheme]) .${FLOATING_PANEL_CLASS}__tree-row > .${FLOATING_PANEL_CLASS}__inline-form:not(.${FLOATING_PANEL_CLASS}__inline-form--root) {
  width: auto;
  margin-inline-start: calc(var(--gv-tree-guides, 0) * var(--gv-sidebar-tree-nest));
  padding-inline-start: 8px !important;
}

/* Name fields: the old inline rename, a bordered field with 24px save and cancel. */
:host([data-gv-scheme]) .${FLOATING_PANEL_CLASS}__folder-header .${FLOATING_PANEL_CLASS}__inline-form {
  min-height: 0;
  gap: 4px;
  padding: 0;
}

:host([data-gv-scheme]) .${FLOATING_PANEL_CLASS}__inline-input {
  height: auto;
  padding: 6px 8px;
  border: 1px solid var(--gv-sidebar-tree-border);
  border-radius: 4px;
  background: var(--gv-sidebar-tree-field);
  color: var(--gv-sidebar-tree-text);
  font-size: 14px;
  line-height: normal;
}

:host([data-gv-scheme]) .${FLOATING_PANEL_CLASS}__inline-input:focus {
  background: var(--gv-sidebar-tree-field);
  border-color: #3b82f6;
  box-shadow: 0 0 0 2px rgba(59, 130, 246, 0.1);
}

:host([data-gv-scheme]) .${FLOATING_PANEL_CLASS}__inline-form .${FLOATING_PANEL_CLASS}__icon-button {
  opacity: 1;
}

:host([data-gv-scheme]) .${FLOATING_PANEL_CLASS}__inline-form .${FLOATING_PANEL_CLASS}__icon-button--save:hover {
  color: #10b981;
  background: rgba(16, 185, 129, 0.1);
}

:host([data-gv-scheme]) .${FLOATING_PANEL_CLASS}__inline-form .${FLOATING_PANEL_CLASS}__icon-button--cancel:hover {
  color: #ef4444;
  background: rgba(239, 68, 68, 0.1);
}

.${FLOATING_PANEL_CLASS}__empty {
  padding: 8px 12px;
}

.${FLOATING_PANEL_CLASS}__empty-icon {
  display: none;
}
`;
