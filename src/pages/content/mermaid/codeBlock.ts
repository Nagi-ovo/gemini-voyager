import type { IconNode } from 'lucide-react';

import { createLucideIcon } from '@/core/icons/lucideIcon';
import { DIAGRAM_TOOLBAR_BUTTON_CSS } from '@/core/ui/diagramToolbar';

/**
 * Create styles for mermaid components and fullscreen viewer
 */
export const createStyles = () => {
  if (document.getElementById('gv-mermaid-styles')) return;

  const style = document.createElement('style');
  style.id = 'gv-mermaid-styles';
  style.textContent = `
    .gv-mermaid-wrapper {
      position: relative;
    }

    /* Sits above the diagram, not over it, like the ECharts and WaveDrom toolbars. */
    .gv-mermaid-toggle {
      display: flex;
      width: fit-content;
      margin: 8px 8px 4px auto;
      align-items: center; /* Center items vertically */
      gap: 4px;
      background: var(--gemini-surface-container, rgba(0,0,0,0.05));
      border-radius: 8px;
      padding: 2px;
      border: 1px solid var(--gemini-outline-variant, rgba(0,0,0,0.1));
    }

    .gv-mermaid-toggle button {
      ${DIAGRAM_TOOLBAR_BUTTON_CSS}
      padding: 5px 7px;
      border: none;
      border-radius: 6px;
      cursor: pointer;
      font-size: 12px;
      font-family: 'Google Sans', sans-serif;
      transition: all 0.2s ease;
      background: transparent;
      color: var(--gemini-on-surface-variant, #666);
    }

    .gv-mermaid-toggle button:hover {
      background: var(--gemini-surface-container-high, rgba(0,0,0,0.08));
    }

    .gv-mermaid-toggle button.active {
      background: var(--gemini-primary, #1a73e8);
      color: white;
    }

    .gv-mermaid-diagram {
      position: relative;
      padding: 16px;
      text-align: center;
      overflow: auto;
      min-height: 100px;
      cursor: zoom-in;
      contain: paint;
      isolation: isolate;
    }

    .gv-mermaid-diagram svg {
      max-width: 100%;
      height: auto;
    }

    /* Fullscreen Modal */
    .gv-mermaid-modal {
      position: fixed;
      top: 0;
      left: 0;
      width: 100vw;
      height: 100vh;
      background: rgba(0, 0, 0, 0.9);
      z-index: 999999;
      display: flex;
      align-items: center;
      justify-content: center;
      opacity: 0;
      transition: opacity 0.3s ease;
    }

    .gv-mermaid-modal.visible {
      opacity: 1;
    }

    .gv-mermaid-modal-toolbar {
      position: fixed;
      top: 16px;
      right: 16px;
      display: flex;
      gap: 8px;
      z-index: 1000000;
    }

    .gv-mermaid-modal-toolbar button {
      width: 40px;
      height: 40px;
      border-radius: 50%;
      border: none;
      background: rgba(255, 255, 255, 0.2);
      color: white;
      font-size: 18px;
      cursor: pointer;
      transition: all 0.2s ease;
      display: flex;
      align-items: center;
      justify-content: center;
    }

    .gv-mermaid-modal-toolbar button:hover {
      background: rgba(255, 255, 255, 0.3);
      transform: scale(1.1);
    }

    .gv-mermaid-modal-content {
      position: relative;
      cursor: grab;
      user-select: none;
    }

    .gv-mermaid-modal-content.dragging {
      cursor: grabbing;
    }

    .gv-mermaid-modal-content svg {
      max-width: none;
      max-height: none;
    }

    .gv-mermaid-modal-hint {
      position: fixed;
      bottom: 20px;
      left: 50%;
      transform: translateX(-50%);
      color: rgba(255, 255, 255, 0.6);
      font-size: 14px;
      font-family: 'Google Sans', sans-serif;
      pointer-events: none;
    }
  `;
  document.head.appendChild(style);
};

/** The card shown in place of a diagram whose source does not parse. */
export function createMermaidErrorCard(errorMessage: string): HTMLElement {
  const card = document.createElement('div');
  card.style.cssText =
    'padding: 24px; text-align: center; color: var(--gv-ui-text-muted, var(--gemini-on-surface-variant, #666)); font-family: var(--gv-ui-font, system-ui, sans-serif); font-size: 14px; line-height: 1.45;';

  const title = document.createElement('div');
  title.style.cssText = 'font-weight: 600; margin-bottom: 6px; color: var(--gv-ui-text, inherit);';
  title.textContent = 'Mermaid Syntax Error';

  const details = document.createElement('div');
  details.style.cssText =
    'font-size: 12px; opacity: 0.8; font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; max-width: 400px; margin: 0 auto; word-break: break-word;';
  details.textContent = errorMessage;

  const hint = document.createElement('div');
  hint.style.cssText = 'margin-top: 12px; font-size: 13px;';
  hint.append('Click ');
  const codeLabel = document.createElement('b');
  codeLabel.textContent = '"Code"';
  hint.append(codeLabel, ' to view source');

  card.append(createErrorIcon(), title, details, hint);
  return card;
}

/** Lucide `triangle-alert` from lucide-react, in place of the old emoji. */
const TRIANGLE_ALERT_ICON_NODE = [
  [
    'path',
    {
      d: 'm21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3',
      key: 'wmoenq',
    },
  ],
  ['path', { d: 'M12 9v4', key: 'juzpu7' }],
  ['path', { d: 'M12 17h.01', key: 'p32p05' }],
] satisfies IconNode;

function createErrorIcon(): SVGSVGElement {
  const svg = createLucideIcon('triangle-alert', TRIANGLE_ALERT_ICON_NODE, 22);
  svg.setAttribute('stroke-width', '1.75');
  svg.style.cssText =
    'display: block; margin: 0 auto 10px; color: var(--gv-ui-warning, oklch(0.7 0.14 70));';
  return svg;
}
