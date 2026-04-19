import { afterEach, describe, expect, it } from 'vitest';

import {
  CANVAS_MARKDOWN_BUTTON_CLASS,
  findCanvasProseMirrorRoot,
  injectCanvasCopyMarkdownButton,
  isCanvasShareMenuPanel,
} from '../menuInjection';

function createNativeMenuItem(label: string): HTMLButtonElement {
  const btn = document.createElement('button');
  btn.className = 'mat-mdc-menu-item';
  btn.setAttribute('role', 'menuitem');
  const icon = document.createElement('mat-icon');
  icon.setAttribute('fonticon', 'share');
  icon.setAttribute('aria-hidden', 'true');
  const text = document.createElement('span');
  text.className = 'mat-mdc-menu-item-text';
  text.textContent = label;
  btn.appendChild(icon);
  btn.appendChild(text);
  return btn;
}

function createCanvasSharePanel(panelId: string): HTMLElement {
  const panel = document.createElement('div');
  panel.className = 'mat-mdc-menu-panel';
  panel.setAttribute('role', 'menu');
  panel.id = panelId;
  const content = document.createElement('div');
  content.className = 'mat-mdc-menu-content';
  content.appendChild(createNativeMenuItem('Share'));
  content.appendChild(createNativeMenuItem('Export to Docs'));
  content.appendChild(createNativeMenuItem('Copy contents'));
  panel.appendChild(content);
  return panel;
}

function createCanvasTrigger(panelId: string): HTMLElement {
  // Angular structure: <share-button data-test-id="consolidated-share-button"><button ...>
  const wrapper = document.createElement('share-button');
  wrapper.setAttribute('data-test-id', 'consolidated-share-button');
  const button = document.createElement('button');
  button.setAttribute('aria-haspopup', 'menu');
  button.setAttribute('aria-expanded', 'true');
  button.setAttribute('aria-controls', panelId);
  button.setAttribute('data-test-id', 'share-button');
  wrapper.appendChild(button);
  return wrapper;
}

function setupCanvasContext(): { panel: HTMLElement; trigger: HTMLElement } {
  const immersive = document.createElement('immersive-editor');
  const proseMirror = document.createElement('div');
  proseMirror.className = 'ProseMirror';
  proseMirror.innerHTML = '<h1>Doc</h1><p>Hello <strong>world</strong></p>';
  immersive.appendChild(proseMirror);
  document.body.appendChild(immersive);

  const trigger = createCanvasTrigger('menu-canvas-1');
  document.body.appendChild(trigger);

  const panel = createCanvasSharePanel('menu-canvas-1');
  document.body.appendChild(panel);
  return { panel, trigger };
}

afterEach(() => {
  document.body.innerHTML = '';
});

describe('isCanvasShareMenuPanel', () => {
  it('returns true for canvas share menu panel with immersive-editor present', () => {
    const { panel } = setupCanvasContext();
    expect(isCanvasShareMenuPanel(panel)).toBe(true);
  });

  it('returns false when deep-research-immersive-panel is present', () => {
    const { panel } = setupCanvasContext();
    const dr = document.createElement('deep-research-immersive-panel');
    document.body.appendChild(dr);
    expect(isCanvasShareMenuPanel(panel)).toBe(false);
  });

  it('returns false when no immersive-editor is on the page', () => {
    const trigger = createCanvasTrigger('menu-canvas-2');
    document.body.appendChild(trigger);
    const panel = createCanvasSharePanel('menu-canvas-2');
    document.body.appendChild(panel);
    expect(isCanvasShareMenuPanel(panel)).toBe(false);
  });

  it('returns false when trigger is not a consolidated-share-button', () => {
    const immersive = document.createElement('immersive-editor');
    document.body.appendChild(immersive);
    const wrapper = document.createElement('div');
    const button = document.createElement('button');
    button.setAttribute('aria-haspopup', 'menu');
    button.setAttribute('aria-expanded', 'true');
    button.setAttribute('aria-controls', 'menu-canvas-3');
    wrapper.appendChild(button);
    document.body.appendChild(wrapper);
    const panel = createCanvasSharePanel('menu-canvas-3');
    document.body.appendChild(panel);
    expect(isCanvasShareMenuPanel(panel)).toBe(false);
  });
});

describe('injectCanvasCopyMarkdownButton', () => {
  it('injects a new menu item with the requested label and wires onClick', () => {
    const { panel } = setupCanvasContext();
    let clicked = 0;
    const btn = injectCanvasCopyMarkdownButton(panel, {
      label: 'Copy as Markdown',
      tooltip: 'Copy Canvas content as Markdown',
      onClick: () => {
        clicked += 1;
      },
    });
    expect(btn).not.toBeNull();
    expect(btn?.classList.contains(CANVAS_MARKDOWN_BUTTON_CLASS)).toBe(true);
    expect(btn?.textContent).toContain('Copy as Markdown');
    btn?.click();
    expect(clicked).toBe(1);
  });

  it('returns the same button on repeated injection and refreshes the label', () => {
    const { panel } = setupCanvasContext();
    const first = injectCanvasCopyMarkdownButton(panel, {
      label: 'Copy as Markdown',
      tooltip: 'tooltip-1',
      onClick: () => {},
    });
    const second = injectCanvasCopyMarkdownButton(panel, {
      label: 'Neue Beschriftung',
      tooltip: 'tooltip-2',
      onClick: () => {},
    });
    expect(second).toBe(first);
    expect(second?.getAttribute('aria-label')).toBe('tooltip-2');
    expect(second?.textContent).toContain('Neue Beschriftung');
  });

  it('returns null when the panel is not a canvas share menu', () => {
    const panel = document.createElement('div');
    document.body.appendChild(panel);
    const result = injectCanvasCopyMarkdownButton(panel, {
      label: 'X',
      tooltip: 'X',
      onClick: () => {},
    });
    expect(result).toBeNull();
  });
});

describe('findCanvasProseMirrorRoot', () => {
  it('returns the ProseMirror root inside immersive-editor', () => {
    setupCanvasContext();
    const root = findCanvasProseMirrorRoot();
    expect(root).not.toBeNull();
    expect(root?.className).toBe('ProseMirror');
  });
});
