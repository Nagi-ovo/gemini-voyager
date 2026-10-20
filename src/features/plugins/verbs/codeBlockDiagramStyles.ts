/**
 * Styles of the code-block diagram panel (`codeBlockDiagram.ts`): the page
 * rules that hide a block and theme the panel host, and the panel's shadow
 * stylesheet (toolbar and drawn diagram).
 */
import { iconButtonCss } from './iconButton';

export const HIDDEN_ATTR = 'data-gv-diagram-hidden';
export const PANEL_CLASS = 'gv-diagram-panel';

/**
 * The panel speaks the shared vocabulary: neutral page tokens (005-ui-tokens.css)
 * for ink and lines, a wash of the host's text colour for the drawing's ground so
 * it sits on any code-block background, the plugin icon-button look, and the
 * folder settings' segmented control for Diagram / Code, whose selected face is
 * neutral. The accent is only the focus ring.
 */
export const PAGE_CSS = `
[${HIDDEN_ATTR}] { display: none !important; }
.${PANEL_CLASS} {
  display: block;
  margin: 8px 0;
  --gv-diagram-surface: color-mix(in srgb, currentColor 3%, transparent);
  --gv-diagram-border: var(--gv-ui-border, oklch(0.92 0.004 250 / 0.7));
  --gv-diagram-fg: var(--gv-ui-text, oklch(0.14 0.004 285));
  --gv-diagram-segments: color-mix(in srgb, currentColor 6%, transparent);
  --gv-diagram-selected: var(--gv-ui-surface, oklch(0.995 0.002 250));
}
html[data-gv-scheme='dark'] .${PANEL_CLASS} {
  --gv-diagram-surface: color-mix(in srgb, currentColor 4%, transparent);
  --gv-diagram-selected: oklch(0.38 0.01 285);
}`;

export const SHADOW_CSS = `
:host { display: block; }
.toolbar {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 4px;
  margin-bottom: 4px;
  color: var(--gv-diagram-fg);
}
${iconButtonCss('button')}
.segments {
  display: inline-flex;
  gap: 2px;
  padding: 2px;
  border-radius: 9px;
  background: var(--gv-diagram-segments);
}
.segments button { width: 28px; height: 24px; border-radius: 7px; }
.segments button[aria-pressed='true'] {
  opacity: 1;
  background: var(--gv-diagram-selected);
  box-shadow: 0 1px 3px oklch(0 0 0 / 0.12);
}
.diagram {
  min-height: 100px;
  padding: 16px;
  overflow: auto;
  border: 1px solid var(--gv-diagram-border);
  border-radius: 12px;
  background: var(--gv-diagram-surface);
  color: var(--gv-diagram-fg);
  text-align: center;
  cursor: zoom-in;
}
.diagram svg { max-width: 100%; height: auto; }
:host([data-view='code']) .diagram { display: none; }`;
