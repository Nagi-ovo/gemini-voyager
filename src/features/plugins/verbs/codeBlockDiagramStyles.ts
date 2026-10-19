/**
 * Styles of the code-block diagram panel (`codeBlockDiagram.ts`): the page
 * rules that hide a block and theme the panel host, and the panel's shadow
 * stylesheet (toolbar and drawn diagram).
 */
import { DIAGRAM_TOOLBAR_BUTTON_CSS } from '@/core/ui/diagramToolbar';

export const HIDDEN_ATTR = 'data-gv-diagram-hidden';
export const PANEL_CLASS = 'gv-diagram-panel';

export const PAGE_CSS = `
[${HIDDEN_ATTR}] { display: none !important; }
.${PANEL_CLASS} {
  display: block;
  margin: 8px 0;
  --gv-diagram-surface: #f8f9fa;
  --gv-diagram-border: rgba(0, 0, 0, 0.12);
  --gv-diagram-fg: #444746;
  --gv-diagram-hover: rgba(0, 0, 0, 0.06);
}
html[data-gv-scheme='dark'] .${PANEL_CLASS} {
  --gv-diagram-surface: #1e1f20;
  --gv-diagram-border: rgba(255, 255, 255, 0.14);
  --gv-diagram-fg: #c4c7c5;
  --gv-diagram-hover: rgba(255, 255, 255, 0.08);
}`;

export const SHADOW_CSS = `
:host { display: block; }
.toolbar { display: flex; justify-content: flex-end; gap: 4px; margin-bottom: 4px; }
button {
  ${DIAGRAM_TOOLBAR_BUTTON_CSS}
  padding: 5px 7px;
  border: 1px solid var(--gv-diagram-border);
  border-radius: 6px;
  background: transparent;
  color: var(--gv-diagram-fg);
  font: 12px/1.4 system-ui, sans-serif;
  cursor: pointer;
}
button:hover { background: var(--gv-diagram-hover); }
button:disabled { cursor: not-allowed; opacity: 0.45; }
button:focus-visible { outline: 2px solid var(--gv-pm-brand, #1a73e8); outline-offset: 2px; }
button[aria-pressed='true'] {
  border-color: transparent;
  background: var(--gv-pm-brand, #1a73e8);
  color: var(--gv-pm-brand-fg, #fff);
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
