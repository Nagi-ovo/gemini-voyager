/**
 * Styles for the site check's three layers. Each renders in its own shadow
 * root with the shared tokens (`core/ui/tokens.css`), which follow the page's
 * `data-gv-scheme`; host rules are `!important` because a page rule matching
 * the host would otherwise win. Only the picker touches the page, with one
 * `gv-` class on `<html>` for the crosshair cursor.
 */

export const PICKING_CLASS = 'gv-site-check-picking';

export const PICKING_PAGE_CSS = `html.${PICKING_CLASS}, html.${PICKING_CLASS} * { cursor: crosshair !important; }`;

const HOST_RESET = `
  margin: 0 !important; padding: 0 !important; border: 0 !important;
  background: transparent !important; transform: none !important;
  z-index: var(--gv-z-top, 2147483647) !important;
`;

const BUTTON = `
button {
  box-sizing: border-box; min-height: 28px; margin: 0; padding: 4px 10px;
  border: 1px solid var(--gv-ui-border); border-radius: 8px;
  background: var(--gv-ui-surface); color: var(--gv-ui-text); cursor: pointer;
  font: 500 12px/1.3 var(--gv-ui-font); letter-spacing: normal;
}
button:focus-visible { outline: 2px solid var(--gv-ui-focus-ring); outline-offset: 2px; }
@media (hover: hover) { button:hover { background: var(--gv-ui-surface-hover); } }
button.gv-sc-primary { background: var(--gv-ui-primary); color: var(--gv-ui-primary-fg); border-color: transparent; }
@media (pointer: coarse) { button { min-height: 40px; } }
`;

/** Clear of the timeline rail (15-39px from the inline end) and below the toast stack (140px). */
export const LAUNCHER_CSS = `
:host {
  position: fixed !important; inset-block-end: 96px !important; inset-inline-end: 48px !important;
  display: block !important; ${HOST_RESET}
}
:host([data-gv-rtl]) { direction: rtl !important; }
${BUTTON}
.gv-sc-launcher {
  display: inline-flex; align-items: center; gap: 6px; min-height: 30px; padding: 4px 10px;
  border-radius: 999px; box-shadow: var(--gv-ui-shadow); opacity: 0.88;
}
.gv-sc-launcher:hover, .gv-sc-launcher:focus-visible { opacity: 1; }
.gv-sc-dot { inline-size: 8px; block-size: 8px; border-radius: 50%; background: var(--gv-ui-primary); }
`;

export const PANEL_CSS = `
:host {
  position: fixed !important; inset-block-start: 72px !important; inset-inline-end: 16px !important;
  display: block !important; ${HOST_RESET}
}
:host([data-gv-rtl]) { direction: rtl !important; }
[hidden] { display: none !important; }
${BUTTON}
.gv-sc-panel {
  box-sizing: border-box; display: flex; flex-direction: column;
  inline-size: min(460px, calc(100vw - 32px)); max-block-size: calc(100vh - 96px);
  border: 1px solid var(--gv-ui-border); border-radius: 14px;
  background: var(--gv-ui-surface); color: var(--gv-ui-text); box-shadow: var(--gv-ui-shadow);
  font: 400 12px/1.45 var(--gv-ui-font); letter-spacing: normal; text-align: start;
}
.gv-sc-head { display: flex; align-items: center; gap: 8px; padding: 12px 14px 8px; }
.gv-sc-head h2 { flex: 1; margin: 0; font-size: 14px; font-weight: 600; }
.gv-sc-close { min-width: 28px; padding: 4px 8px; }
.gv-sc-body { overflow: auto; padding: 0 14px 12px; }
.gv-sc-note { margin: 0 0 8px; color: var(--gv-ui-text-muted); }
.gv-sc-summary { margin: 0 0 8px; font-weight: 600; }
.gv-sc-summary[data-state='broken'] { color: var(--gv-ui-danger); }
.gv-sc-row { display: flex; flex-wrap: wrap; gap: 6px; margin: 0 0 10px; }
.gv-sc-body h3 { margin: 12px 0 6px; font-size: 12px; font-weight: 600; }
table { inline-size: 100%; border-collapse: collapse; font-variant-numeric: tabular-nums; }
th, td { padding: 3px 6px; border-block-end: 1px solid var(--gv-ui-border); text-align: start; vertical-align: top; }
th { color: var(--gv-ui-text-muted); font-weight: 500; }
td.gv-sc-count { text-align: end; }
td code, li code, pre { font: 11px/1.4 ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; }
td code { overflow-wrap: anywhere; }
tr[data-verdict='missing'] td, tr[data-verdict='invalid'] td, tr[data-verdict='unresolved'] td { color: var(--gv-ui-danger); }
tr[data-verdict='ok'] .gv-sc-verdict { color: var(--gv-ui-text-muted); }
ul { margin: 0; padding-inline-start: 18px; }
pre {
  margin: 6px 0 0; padding: 8px; max-block-size: 220px; overflow: auto;
  border: 1px solid var(--gv-ui-border); border-radius: 8px; white-space: pre;
}
details summary { cursor: pointer; margin-block-start: 12px; font-weight: 600; }
.gv-sc-foot {
  display: flex; flex-wrap: wrap; gap: 6px; justify-content: flex-end;
  padding: 10px 14px 12px; border-block-start: 1px solid var(--gv-ui-border);
}
`;

export const PICKER_CSS = `
:host {
  position: fixed !important; inset: 0 !important; display: block !important;
  pointer-events: none !important; ${HOST_RESET}
}
:host([data-gv-rtl]) { direction: rtl !important; }
[hidden] { display: none !important; }
${BUTTON}
.gv-sc-outline {
  position: fixed; box-sizing: border-box; pointer-events: none;
  border: 2px solid var(--gv-ui-primary); border-radius: 3px;
  background: color-mix(in oklch, var(--gv-ui-primary) 12%, transparent);
}
.gv-sc-tag {
  position: absolute; inset-block-start: -22px; inset-inline-start: -2px; padding: 1px 6px;
  border-radius: 4px; background: var(--gv-ui-primary); color: var(--gv-ui-primary-fg);
  font: 600 11px/18px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
}
.gv-sc-bar {
  position: fixed; inset-block-start: 12px; inset-inline-start: 50%; translate: -50% 0;
  display: flex; align-items: center; gap: 10px; padding: 6px 8px 6px 12px; pointer-events: auto;
  border: 1px solid var(--gv-ui-border); border-radius: 10px;
  background: var(--gv-ui-surface); color: var(--gv-ui-text); box-shadow: var(--gv-ui-shadow);
  font: 500 12px/1.4 var(--gv-ui-font);
}
:host([data-gv-rtl]) .gv-sc-bar { translate: 50% 0; }
`;
