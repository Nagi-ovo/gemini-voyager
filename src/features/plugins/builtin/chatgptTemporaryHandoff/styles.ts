/**
 * The "Save & continue" button and its dialogs. Colours are the page's shared
 * tokens (005-ui-tokens.css), which already follow `html[data-gv-scheme]`, so
 * no rule here reads ChatGPT's own theme markers; each token names a literal
 * fallback for a page without them. Shapes follow the confirm card: a 12px
 * card, 28px buttons with 8px corners, the accent only on the one action.
 */
const FONT = `var(--gv-ui-font, ui-sans-serif, system-ui, -apple-system, 'Segoe UI', sans-serif)`;

export const CHATGPT_TEMPORARY_HANDOFF_CSS = `
  .gv-chatgpt-handoff-button {
    box-sizing: border-box;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    min-height: 36px;
    gap: 6px;
    margin: 0;
    padding: 0 12px;
    border: 1px solid color-mix(in srgb, currentColor 14%, transparent);
    border-radius: 8px;
    color: inherit;
    background: transparent;
    font: 500 14px/1 ${FONT};
    letter-spacing: normal;
    white-space: nowrap;
    cursor: pointer;
    transition: background-color 160ms ease;
  }
  .gv-chatgpt-handoff-button:hover {
    background: color-mix(in srgb, currentColor 8%, transparent);
  }
  .gv-chatgpt-handoff-button:focus-visible {
    outline: 2px solid var(--gv-ui-focus-ring, var(--gv-pm-brand, var(--gv-pm-brand-default)));
    outline-offset: 2px;
  }
  .gv-chatgpt-handoff-button:disabled { opacity: 0.58; cursor: wait; }
  .gv-chatgpt-handoff-button--floating {
    position: fixed;
    top: 60px;
    right: 16px;
    z-index: 2147483000;
    border-color: var(--gv-ui-border, oklch(0.92 0.004 250 / 0.7));
    color: var(--gv-ui-text, oklch(0.14 0.004 285));
    background: var(--gv-ui-surface, oklch(0.995 0.002 250));
    box-shadow: var(--gv-ui-shadow, 0 6px 20px oklch(0 0 0 / 0.16));
  }
  .gv-chatgpt-handoff-button--floating:hover {
    background: var(--gv-ui-surface-hover, oklch(0.97 0.003 250));
  }
  .gv-chatgpt-handoff-button-icon { width: 16px; height: 16px; flex: none; }

  .gv-chatgpt-handoff-overlay {
    position: fixed;
    inset: 0;
    z-index: 2147483003;
    display: grid;
    place-items: center;
    padding: 16px;
    background: oklch(0 0 0 / 0.32);
    font: 13px/1.5 ${FONT};
    letter-spacing: normal;
  }
  .gv-chatgpt-handoff-dialog {
    box-sizing: border-box;
    width: min(440px, 100%);
    overflow: hidden;
    border: 1px solid var(--gv-ui-border, oklch(0.92 0.004 250 / 0.7));
    border-radius: 12px;
    color: var(--gv-ui-text, oklch(0.14 0.004 285));
    background: var(--gv-ui-surface, oklch(0.995 0.002 250));
    box-shadow: var(--gv-ui-shadow, 0 6px 20px oklch(0 0 0 / 0.16));
    font: inherit;
    outline: none;
  }
  .gv-chatgpt-handoff-dialog-title {
    margin: 0;
    padding: 16px 16px 6px;
    font: inherit;
    font-size: 15px;
    font-weight: 600;
    line-height: 1.35;
  }
  .gv-chatgpt-handoff-dialog-body {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 0 16px 16px;
    color: var(--gv-ui-text-muted, oklch(0.45 0.01 270));
  }
  .gv-chatgpt-handoff-dialog-footer {
    display: flex;
    align-items: center;
    justify-content: flex-end;
    gap: 8px;
    padding: 12px 16px;
    border-top: 1px solid var(--gv-ui-border, oklch(0.92 0.004 250 / 0.7));
  }
  .gv-chatgpt-handoff-dialog-attribution {
    min-width: 0;
    margin-inline-end: auto;
    overflow: hidden;
    color: var(--gv-ui-text-muted, oklch(0.45 0.01 270));
    font-size: 11px;
    line-height: 1.4;
    text-decoration: none;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .gv-chatgpt-handoff-dialog-attribution:hover { color: var(--gv-ui-text, oklch(0.14 0.004 285)); }
  .gv-chatgpt-handoff-dialog-attribution:focus-visible {
    border-radius: 4px;
    outline: 2px solid var(--gv-ui-focus-ring, var(--gv-pm-brand, var(--gv-pm-brand-default)));
    outline-offset: 2px;
  }
  .gv-chatgpt-handoff-dialog-button {
    box-sizing: border-box;
    flex: none;
    min-height: 28px;
    margin: 0;
    padding: 4px 12px;
    border: 1px solid var(--gv-ui-border, oklch(0.92 0.004 250 / 0.7));
    border-radius: 8px;
    color: inherit;
    background: transparent;
    font: inherit;
    font-weight: 500;
    white-space: nowrap;
    cursor: pointer;
  }
  .gv-chatgpt-handoff-dialog-button:hover {
    background: var(--gv-ui-surface-hover, oklch(0.97 0.003 250));
  }
  .gv-chatgpt-handoff-dialog-button:focus-visible {
    outline: 2px solid var(--gv-ui-focus-ring, var(--gv-pm-brand, var(--gv-pm-brand-default)));
    outline-offset: 2px;
  }
  .gv-chatgpt-handoff-dialog-button--primary {
    border-color: transparent;
    color: var(--gv-ui-primary-fg, var(--gv-pm-brand-fg, #fff));
    background: var(--gv-ui-primary, var(--gv-pm-brand, var(--gv-pm-brand-default)));
  }
  .gv-chatgpt-handoff-dialog-button--primary:hover {
    background: var(--gv-ui-primary, var(--gv-pm-brand, var(--gv-pm-brand-default)));
    filter: brightness(1.06);
  }
  .gv-chatgpt-handoff-spinner {
    box-sizing: border-box;
    width: 18px;
    height: 18px;
    flex: none;
    border: 2px solid color-mix(in srgb, currentColor 22%, transparent);
    border-top-color: currentColor;
    border-radius: 50%;
  }
  /* The one moving part, and only while the conversation is being collected. */
  @media (prefers-reduced-motion: no-preference) {
    .gv-chatgpt-handoff-spinner { animation: gv-chatgpt-handoff-spin 0.9s linear infinite; }
  }
  @keyframes gv-chatgpt-handoff-spin { to { transform: rotate(360deg); } }
  @media (prefers-reduced-motion: reduce) {
    .gv-chatgpt-handoff-button { transition: none; }
  }

  body.gv-rtl .gv-chatgpt-handoff-button--floating { right: auto; left: 16px; }

  @media (max-width: 520px) {
    .gv-chatgpt-handoff-button { width: 36px; padding: 0; }
    .gv-chatgpt-handoff-button-label { display: none; }
    .gv-chatgpt-handoff-dialog-title { padding: 14px 14px 6px; }
    .gv-chatgpt-handoff-dialog-body { padding: 0 14px 14px; }
    .gv-chatgpt-handoff-dialog-footer { flex-wrap: wrap; padding: 12px 14px; }
    .gv-chatgpt-handoff-dialog-attribution { font-size: 10px; }
    .gv-chatgpt-handoff-dialog-attribution-prefix { display: none; }
  }
  @media (max-width: 400px) {
    .gv-chatgpt-handoff-dialog-attribution {
      flex-basis: 100%;
      margin-inline-end: 0;
    }
  }
`;
